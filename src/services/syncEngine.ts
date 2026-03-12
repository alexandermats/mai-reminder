import { syncBackendClient } from './syncBackendClient'
import { encryptionService } from './encryptionService'
import { reminderAdapter } from './reminderAdapter'
import { useSettingsStore } from '../stores/settings'
import { isValidReminder } from '../types/reminder'
import { ReminderAction, ReminderStatus, type Reminder } from '../types/reminder'

interface ReminderPayloadWire extends Omit<
  Reminder,
  'scheduledAt' | 'createdAt' | 'updatedAt' | 'lastActionAt'
> {
  scheduledAt: string
  createdAt: string
  updatedAt: string
  lastActionAt?: string
}

export interface CloudBackfillResult {
  attempted: number
  pushed: number
  failed: number
  skipped: number
}

export class SyncEngine {
  private isSyncing = false
  private intervalId: ReturnType<typeof setInterval> | null = null
  private listeners: Set<() => void> = new Set()

  /**
   * Register a callback to be invoked whenever a background sync
   * creates, updates, or deletes a reminder locally.
   * @returns A function to unsubscribe this listener.
   */
  onDataChanged(cb: () => void): () => void {
    this.listeners.add(cb)
    return () => this.listeners.delete(cb)
  }

  // ---------------------------------------------------------------------------
  // Periodic polling
  // ---------------------------------------------------------------------------

  /**
   * Start a 1-minute background sync loop.
   * Calling start() while already running is a no-op.
   */
  start(): void {
    if (this.intervalId !== null) return

    this.intervalId = setInterval(() => {
      void this.sync()
    }, 60_000) // every 60 seconds
  }

  /**
   * Stop the background sync loop and clear the interval.
   */
  stop(): void {
    if (this.intervalId !== null) {
      clearInterval(this.intervalId)
      this.intervalId = null
    }
  }

  // ---------------------------------------------------------------------------
  // Internal helpers
  // ---------------------------------------------------------------------------

  private async pushReminderWithRetry(
    authUserId: string,
    reminder: Reminder,
    keyBase64: string
  ): Promise<void> {
    let lastError: unknown = null
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const payload = JSON.stringify(reminder)
        const encryptedEnvelope = encryptionService.encrypt(payload, keyBase64)
        await syncBackendClient.pushReminder(authUserId, {
          reminderId: reminder.id,
          encryptedParams: JSON.stringify(encryptedEnvelope),
          isDeleted: reminder.status === ReminderStatus.CANCELLED,
        })
        return
      } catch (error) {
        lastError = error
        if (attempt < 2) {
          await new Promise((resolve) => setTimeout(resolve, 250))
        }
      }
    }

    throw lastError instanceof Error ? lastError : new Error(String(lastError))
  }

  private getActionPriority(action?: ReminderAction): number | null {
    if (!action) return null
    switch (action) {
      case ReminderAction.SNOOZE:
        return 3
      case ReminderAction.DISMISS:
        return 2
      case ReminderAction.TRIGGER:
        return 1
      default:
        return null
    }
  }

  private getActionTimestamp(reminder: Reminder): number | null {
    if (!(reminder.lastActionAt instanceof Date)) return null
    const time = reminder.lastActionAt.getTime()
    if (!Number.isFinite(time)) return null
    return time
  }

  private resolveActionConflict(
    localReminder: Reminder,
    remoteReminder: Reminder
  ): 'local' | 'remote' | null {
    const statusConflict = localReminder.status !== remoteReminder.status
    const scheduleConflict =
      localReminder.scheduledAt.getTime() !== remoteReminder.scheduledAt.getTime()
    if (!statusConflict && !scheduleConflict) {
      return null
    }

    const localPriority = this.getActionPriority(localReminder.lastAction)
    const remotePriority = this.getActionPriority(remoteReminder.lastAction)

    if (localPriority === null && remotePriority === null) {
      return null
    }

    if (localPriority !== null && remotePriority !== null && localPriority !== remotePriority) {
      return localPriority > remotePriority ? 'local' : 'remote'
    }

    if (localPriority !== null && remotePriority === null) {
      return 'local'
    }

    if (remotePriority !== null && localPriority === null) {
      return 'remote'
    }

    const localActionAt = this.getActionTimestamp(localReminder)
    const remoteActionAt = this.getActionTimestamp(remoteReminder)

    if (localActionAt !== null && remoteActionAt !== null && localActionAt !== remoteActionAt) {
      return localActionAt > remoteActionAt ? 'local' : 'remote'
    }

    if (localActionAt !== null && remoteActionAt === null) {
      return 'local'
    }

    if (remoteActionAt !== null && localActionAt === null) {
      return 'remote'
    }

    return null
  }

  // ---------------------------------------------------------------------------
  // Backfill (push all local to cloud on first enable)
  // ---------------------------------------------------------------------------

  async backfillLocalToCloud(): Promise<CloudBackfillResult> {
    const settings = useSettingsStore()
    if (
      !settings.cloudSyncEnabled ||
      !settings.cloudSyncUserId ||
      !settings.cloudSyncEncryptionKeyBase64
    ) {
      return { attempted: 0, pushed: 0, failed: 0, skipped: 0 }
    }

    syncBackendClient.init()
    await syncBackendClient.ensureAuthenticated()
    await encryptionService.init()

    const [remoteRows, localReminders] = await Promise.all([
      syncBackendClient.fetchReminders(settings.cloudSyncUserId),
      reminderAdapter.list(),
    ])

    const remoteUpdatedAtMap = new Map<string, number>()
    for (const row of remoteRows) {
      const timestamp = new Date(row.updated_at).getTime()
      if (Number.isFinite(timestamp)) {
        remoteUpdatedAtMap.set(row.reminder_id, timestamp)
      }
    }

    let attempted = 0
    let pushed = 0
    let failed = 0
    let skipped = 0

    for (const reminder of localReminders) {
      attempted++
      const remoteUpdatedAt = remoteUpdatedAtMap.get(reminder.id)
      const localUpdatedAt = reminder.updatedAt.getTime()

      const shouldPush =
        remoteUpdatedAt === undefined ||
        !Number.isFinite(remoteUpdatedAt) ||
        localUpdatedAt >= remoteUpdatedAt

      if (!shouldPush) {
        skipped++
        continue
      }

      try {
        await this.pushReminderWithRetry(
          settings.cloudSyncUserId,
          reminder,
          settings.cloudSyncEncryptionKeyBase64
        )
        pushed++
      } catch (error) {
        failed++
        console.warn(`[SyncEngine] Backfill failed for reminder ${reminder.id}:`, error)
      }
    }

    return {
      attempted,
      pushed,
      failed,
      skipped,
    }
  }

  // ---------------------------------------------------------------------------
  // Bidirectional sync pass
  // ---------------------------------------------------------------------------

  /**
   * Performs a single full bidirectional synchronisation pass:
   * 1. Fetches all remote reminders.
   * 2. Fetches all local reminders.
   * 3. For each remote row:
   *    - If deleted remotely → delete locally.
   *    - If remote is strictly newer → update locally (pull wins).
   *    - If local is newer (or equal) → push local to cloud.
   *    - If only exists locally → push to cloud.
   * Conflict resolution strategy: last-write-wins based on `updatedAt`.
   */
  async sync(): Promise<void> {
    if (this.isSyncing) return

    const settings = useSettingsStore()
    if (!settings.cloudSyncEnabled || !settings.cloudSyncUserId) {
      return
    }

    try {
      this.isSyncing = true

      syncBackendClient.init()
      await syncBackendClient.ensureAuthenticated()
      await encryptionService.init()

      let changedLocally = false

      // 1. Fetch both sides in parallel
      const [remoteRows, localReminders] = await Promise.all([
        syncBackendClient.fetchReminders(settings.cloudSyncUserId),
        reminderAdapter.list(),
      ])

      const localMap = new Map<string, Reminder>()
      for (const r of localReminders) {
        localMap.set(r.id, r)
      }

      // Track which local IDs were seen in the remote set
      const seenRemoteIds = new Set<string>()

      // 2. Process each remote row
      for (const row of remoteRows) {
        seenRemoteIds.add(row.reminder_id)
        try {
          if (row.is_deleted) {
            const localReminder = localMap.get(row.reminder_id)
            if (localReminder) {
              const remoteTime = new Date(row.updated_at).getTime()
              const localTime = localReminder.updatedAt.getTime()

              if (remoteTime >= localTime) {
                // Remote deletion is newer (or same version) → delete locally
                console.log(`[SyncEngine] Deleting remote-deleted reminder ${row.reminder_id}`)
                const success = await reminderAdapter.delete(row.reminder_id, true)
                if (success) changedLocally = true
              } else if (localTime > remoteTime) {
                // Local is newer (e.g. reactivated) → push local to cloud to override tombstone
                console.log(
                  `[SyncEngine] Local reminder ${row.reminder_id} is newer than remote deletion. Pushing reactivation.`
                )
                try {
                  await this.pushReminderWithRetry(
                    settings.cloudSyncUserId,
                    localReminder,
                    settings.cloudSyncEncryptionKeyBase64
                  )
                } catch (pushErr) {
                  console.warn(
                    `[SyncEngine] Failed to push reactivated reminder ${row.reminder_id}:`,
                    pushErr
                  )
                }
              }
            }
            continue
          }

          // Decrypt payload
          let encryptedData: { ciphertextBase64: string; nonceBase64: string }
          try {
            encryptedData = JSON.parse(row.encrypted_payload)
          } catch {
            console.warn(`[SyncEngine] Failed to parse encrypted envelope for ${row.reminder_id}`)
            continue
          }

          const decryptedJson = await encryptionService.decrypt(
            encryptedData,
            settings.cloudSyncEncryptionKeyBase64
          )

          let parsedPayload: ReminderPayloadWire
          try {
            const parsedUnknown = JSON.parse(decryptedJson) as unknown
            if (!parsedUnknown || typeof parsedUnknown !== 'object') {
              console.warn(`[SyncEngine] Decrypted payload for ${row.reminder_id} is not an object`)
              continue
            }
            parsedPayload = parsedUnknown as ReminderPayloadWire
          } catch {
            console.warn(`[SyncEngine] Decrypted payload for ${row.reminder_id} is not valid JSON`)
            continue
          }

          // Hydrate dates
          const remoteReminder: Reminder = {
            ...(parsedPayload as Omit<ReminderPayloadWire, 'lastActionAt'>),
            scheduledAt: new Date(parsedPayload.scheduledAt),
            createdAt: new Date(parsedPayload.createdAt),
            updatedAt: new Date(parsedPayload.updatedAt),
            ...(parsedPayload.lastActionAt
              ? { lastActionAt: new Date(parsedPayload.lastActionAt) }
              : {}),
          }

          if (!isValidReminder(remoteReminder)) {
            console.warn(
              `[SyncEngine] Reminder ${row.reminder_id} failed schema validation after decryption`
            )
            continue
          }

          const localReminder = localMap.get(remoteReminder.id)

          if (!localReminder) {
            // Remote-only: pull it locally
            console.log(`[SyncEngine] Creating missing remote reminder ${remoteReminder.id}`)
            await reminderAdapter.create({
              ...remoteReminder,
              _isSync: true,
            })
            changedLocally = true
          } else {
            // Both sides exist: compare action precedence (if applicable), else timestamps (LWW)
            const actionDecision = this.resolveActionConflict(localReminder, remoteReminder)
            if (actionDecision === 'remote') {
              console.log(
                `[SyncEngine] Applying action-precedence remote reminder ${remoteReminder.id}`
              )
              await reminderAdapter.update(remoteReminder.id, {
                ...remoteReminder,
                _isSync: true,
              })
              changedLocally = true
              continue
            }

            if (actionDecision === 'local') {
              console.log(
                `[SyncEngine] Preserving action-precedence local reminder ${localReminder.id}`
              )
              try {
                await this.pushReminderWithRetry(
                  settings.cloudSyncUserId,
                  localReminder,
                  settings.cloudSyncEncryptionKeyBase64
                )
              } catch (pushErr) {
                console.warn(
                  `[SyncEngine] Failed to push local reminder ${localReminder.id}:`,
                  pushErr
                )
              }
              continue
            }

            // Fallback: compare timestamps (last-write-wins)
            const remoteTime = remoteReminder.updatedAt.getTime()
            const localTime = localReminder.updatedAt.getTime()

            if (remoteTime > localTime) {
              // Remote wins → update locally
              console.log(`[SyncEngine] Updating stale local reminder ${remoteReminder.id}`)
              await reminderAdapter.update(remoteReminder.id, {
                ...remoteReminder,
                _isSync: true,
              })
              changedLocally = true
            } else if (remoteTime < localTime) {
              // Local is strictly newer → push local to cloud
              console.log(`[SyncEngine] Pushing newer local reminder ${localReminder.id}`)
              try {
                await this.pushReminderWithRetry(
                  settings.cloudSyncUserId,
                  localReminder,
                  settings.cloudSyncEncryptionKeyBase64
                )
              } catch (pushErr) {
                console.warn(
                  `[SyncEngine] Failed to push local reminder ${localReminder.id}:`,
                  pushErr
                )
              }
            } else {
              // Same exact timestamp. Already in sync. Do nothing.
            }
          }
        } catch (err) {
          console.error(`[SyncEngine] Failed processing row ${row.reminder_id}:`, err)
        }
      }

      // 3. Push any purely local reminders that the cloud doesn't know about yet
      for (const localReminder of localReminders) {
        if (!seenRemoteIds.has(localReminder.id)) {
          console.log(`[SyncEngine] Pushing local-only reminder ${localReminder.id}`)
          try {
            await this.pushReminderWithRetry(
              settings.cloudSyncUserId,
              localReminder,
              settings.cloudSyncEncryptionKeyBase64
            )
          } catch (pushErr) {
            console.warn(
              `[SyncEngine] Failed to push local-only reminder ${localReminder.id}:`,
              pushErr
            )
          }
        }
      }

      if (changedLocally) {
        this.listeners.forEach((listener) => listener())
      }

      console.log(`[SyncEngine] Bidirectional sync pass completed successfully`)
    } catch (err) {
      console.error('[SyncEngine] Sync pass failed:', err)
    } finally {
      this.isSyncing = false
    }
  }

  // ---------------------------------------------------------------------------
  // Clear old reminders (with cloud tombstone propagation)
  // ---------------------------------------------------------------------------

  /**
   * Deletes old reminders (cancelled / sent / dismissed) both locally and in
   * the cloud so that all paired devices remove them on the next sync cycle.
   *
   * The flow is:
   *  1. Collect all local reminders that qualify for deletion.
   *  2. If cloud sync is active, push an `is_deleted = true` tombstone for
   *     each to Supabase *before* removing them locally.  This ensures any
   *     other paired device will see the deletion on its next sync pass.
   *  3. Hard-delete each reminder locally (bypassing per-delete sync triggers,
   *     since we have already handled the cloud update in step 2).
   *
   * @param includeSent - When true (default) also deletes reminders with
   *                      status "sent" or "dismissed".  "cancelled" reminders
   *                      are always deleted.
   * @returns Number of reminders deleted.
   */
  async clearOldRemindersWithSync(includeSent: boolean = true): Promise<number> {
    const settings = useSettingsStore()

    // 1. Identify which reminders should be removed
    const allReminders = await reminderAdapter.list()
    const statusesToDelete = new Set<string>(['cancelled'])
    if (includeSent) {
      statusesToDelete.add(ReminderStatus.SENT)
      statusesToDelete.add(ReminderStatus.DISMISSED)
    }

    const toDelete = allReminders.filter((r) => statusesToDelete.has(r.status))

    if (toDelete.length === 0) return 0

    // 2. Push tombstones to the cloud (best-effort — don't abort on failure)
    if (
      settings.cloudSyncEnabled &&
      settings.cloudSyncUserId &&
      settings.cloudSyncEncryptionKeyBase64
    ) {
      try {
        syncBackendClient.init()
        await syncBackendClient.ensureAuthenticated()
        await encryptionService.init()

        await Promise.allSettled(
          toDelete.map((reminder) =>
            // pushReminderWithRetry sends is_deleted:true when status is CANCELLED
            this.pushReminderWithRetry(
              settings.cloudSyncUserId,
              { ...reminder, status: ReminderStatus.CANCELLED },
              settings.cloudSyncEncryptionKeyBase64
            )
          )
        )

        console.log(
          `[SyncEngine] Pushed ${toDelete.length} tombstone(s) to cloud before local clear`
        )
      } catch (err) {
        console.warn('[SyncEngine] Failed to push tombstones before clearing reminders:', err)
        // Still proceed with local deletion
      }
    }

    // 3. Hard-delete locally (isSync=true skips per-delete sync triggers)
    let deleted = 0
    for (const reminder of toDelete) {
      try {
        const success = await reminderAdapter.delete(reminder.id, true)
        if (success) deleted++
      } catch (err) {
        console.warn(`[SyncEngine] Failed to delete reminder ${reminder.id} locally:`, err)
      }
    }

    console.log(`[SyncEngine] clearOldRemindersWithSync: removed ${deleted} reminder(s) locally`)
    return deleted
  }
}

export const syncEngine = new SyncEngine()
