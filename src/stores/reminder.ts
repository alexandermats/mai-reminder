import { defineStore } from 'pinia'
import type { Reminder } from '../types/reminder'
import { ReminderStatus } from '../types/reminder'
import { ref, computed, watch } from 'vue'
import { isCapacitorNative } from '../utils/platform'
import { LocalNotifications } from '@capacitor/local-notifications'
import { applyTriggeredReminderTransition } from '../services/reminderOccurrenceService'
import { calcSnoozedAt, SNOOZE_ACTION_TO_MS } from '../services/snoozeService'
import type { SnoozeAction } from '../services/snoozeService'
import { syncEngine } from '../services/syncEngine'
import type { CloudBackfillResult } from '../services/syncEngine'
import { App } from '@capacitor/app'
import { useSettingsStore } from './settings'
import { notificationService } from '../services/notificationService'
import {
  resolveLatestMissedScheduledAt,
  resolveNotificationWindowedAt,
} from '../services/schedulerService'
import {
  DEFAULT_HOURLY_WINDOW_END,
  DEFAULT_HOURLY_WINDOW_START,
  isHourlyRule,
  isWithinHourlyWindow,
} from '../utils/hourlyRecurrence'
import { getReminderSeriesBaseId } from '../utils/reminderSeries'

/**
 * Interface for reminders coming over IPC, where Date objects
 * are serialized as ISO strings.
 */
interface SerializedReminder extends Omit<Reminder, 'scheduledAt' | 'createdAt' | 'updatedAt'> {
  scheduledAt: string | Date
  createdAt: string | Date
  updatedAt: string | Date
}

export const useReminderStore = defineStore('reminder', () => {
  const reminders = ref<Reminder[]>([])
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  const filterStatus = ref<ReminderStatus>(ReminderStatus.PENDING)
  const processingTriggeredReminders = new Set<string>()
  const missedReminderIds = ref<Set<string>>(new Set())
  const dismissedMissedReminderIds = ref<Set<string>>(new Set())
  let silentHourlyTransitionInterval: ReturnType<typeof setInterval> | null = null

  const upcomingReminders = computed(() => {
    return [...reminders.value].sort((a, b) => {
      return new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime()
    })
  })

  const filteredReminders = computed(() => {
    return reminders.value
      .filter((r) => {
        if (filterStatus.value === ReminderStatus.SENT) {
          return r.status === ReminderStatus.SENT || r.status === ReminderStatus.DISMISSED
        }
        return r.status === filterStatus.value
      })
      .sort((a, b) => {
        const timeA = new Date(a.scheduledAt).getTime()
        const timeB = new Date(b.scheduledAt).getTime()
        if (filterStatus.value === ReminderStatus.SENT) {
          return timeB - timeA
        }
        return timeA - timeB
      })
  })

  const sentMissedCount = computed(() => missedReminderIds.value.size)

  function setReminders(data: Reminder[]) {
    reminders.value = data
  }

  function addReminder(reminder: Reminder) {
    const index = reminders.value.findIndex((r) => r.id === reminder.id)
    if (index !== -1) {
      reminders.value[index] = reminder
      return
    }
    reminders.value.push(reminder)
  }

  function updateReminder(id: string, changes: Partial<Reminder>) {
    const index = reminders.value.findIndex((r) => r.id === id)
    if (index !== -1) {
      reminders.value[index] = { ...reminders.value[index], ...changes }
    }
  }

  function deleteReminder(id: string) {
    reminders.value = reminders.value.filter((r) => r.id !== id)
  }

  async function collapseRecurringPendingDuplicates(
    referenceNow: Date = new Date()
  ): Promise<number> {
    const nowTs = referenceNow.getTime()
    const recurringPendingByBase = new Map<string, Reminder[]>()

    for (const item of reminders.value) {
      if (
        item.status !== ReminderStatus.PENDING ||
        !item.recurrenceRule ||
        item.scheduledAt.getTime() <= nowTs
      ) {
        continue
      }
      const baseId = getReminderSeriesBaseId(item.id)
      const existing = recurringPendingByBase.get(baseId)
      if (existing) {
        existing.push(item)
      } else {
        recurringPendingByBase.set(baseId, [item])
      }
    }

    const { reminderAdapter } = await import('../services/reminderAdapter')
    let changedCount = 0

    for (const group of recurringPendingByBase.values()) {
      if (group.length <= 1) continue

      group.sort((a, b) => {
        const timeDiff = a.scheduledAt.getTime() - b.scheduledAt.getTime()
        if (timeDiff !== 0) return timeDiff
        const aHasMissedSuffix = a.id.includes('-missed-')
        const bHasMissedSuffix = b.id.includes('-missed-')
        if (aHasMissedSuffix !== bHasMissedSuffix) {
          return aHasMissedSuffix ? 1 : -1
        }
        return b.updatedAt.getTime() - a.updatedAt.getTime()
      })

      const duplicates = group.slice(1)
      for (const duplicate of duplicates) {
        try {
          const cancelled = await reminderAdapter.update(duplicate.id, {
            status: ReminderStatus.CANCELLED,
            _isSync: true,
          })
          addReminder(cancelled)
          changedCount += 1
        } catch (err) {
          console.error(
            `[ReminderStore] Failed to collapse duplicate pending recurring reminder ${duplicate.id}:`,
            err
          )
        }
      }
    }

    return changedCount
  }

  let recurringPendingDedupePromise: Promise<number> | null = null
  async function runRecurringPendingDedupe(referenceNow: Date = new Date()): Promise<number> {
    if (recurringPendingDedupePromise) {
      return recurringPendingDedupePromise
    }

    recurringPendingDedupePromise = collapseRecurringPendingDuplicates(referenceNow)
    try {
      return await recurringPendingDedupePromise
    } finally {
      recurringPendingDedupePromise = null
    }
  }

  async function fetchReminders() {
    // Only import inside the action to avoid circular dependency if any
    const { reminderAdapter } = await import('../services/reminderAdapter')
    isLoading.value = true
    error.value = null
    try {
      const data = await reminderAdapter.list()
      reminders.value = data
    } catch (err) {
      error.value = err instanceof Error ? err.message : String(err)
      throw err
    } finally {
      isLoading.value = false
    }
  }

  async function syncCloud() {
    try {
      await syncEngine.sync()
      await fetchReminders()
    } catch (err) {
      console.error('[ReminderStore] Cloud sync loop failed:', err)
    }
  }

  async function backfillCloudFromLocal(): Promise<CloudBackfillResult> {
    try {
      const result = await syncEngine.backfillLocalToCloud()
      await fetchReminders()
      return result
    } catch (err) {
      console.error('[ReminderStore] Cloud backfill failed:', err)
      throw err
    }
  }

  let startupReconcilePromise: Promise<void> | null = null
  async function reconcileStartupReminders(): Promise<void> {
    if (startupReconcilePromise) {
      await startupReconcilePromise
      return
    }

    startupReconcilePromise = (async () => {
      const settingsStoreRef = useSettingsStore()
      const shouldSync = settingsStoreRef.cloudSyncEnabled

      if (shouldSync) {
        try {
          await syncEngine.sync()
        } catch (err) {
          console.error('[ReminderStore] Initial cloud sync failed:', err)
        }
      }

      await fetchReminders()

      const now = new Date()
      const overduePendingIds = reminders.value
        .filter(
          (reminder) =>
            reminder.status === ReminderStatus.PENDING &&
            reminder.scheduledAt.getTime() <= now.getTime()
        )
        .map((reminder) => reminder.id)

      const { reminderAdapter } = await import('../services/reminderAdapter')
      const windowStart = settingsStoreRef.hourlyReminderStartTime || DEFAULT_HOURLY_WINDOW_START
      const windowEnd = settingsStoreRef.hourlyReminderEndTime || DEFAULT_HOURLY_WINDOW_END

      let changedCount = 0
      const startupMissedIds = new Set<string>()
      for (const id of overduePendingIds) {
        const current = reminders.value.find((reminder) => reminder.id === id)
        if (
          !current ||
          current.status !== ReminderStatus.PENDING ||
          current.scheduledAt.getTime() > now.getTime()
        ) {
          continue
        }

        try {
          if (!current.recurrenceRule) {
            const sentOneTime = await reminderAdapter.update(current.id, {
              status: ReminderStatus.SENT,
              scheduledAt: current.scheduledAt,
              _isSync: true,
            })
            addReminder(sentOneTime)
            startupMissedIds.add(sentOneTime.id)
            changedCount += 1
            continue
          }

          const latestMissedAt = resolveLatestMissedScheduledAt(current, now)
          if (!latestMissedAt) {
            continue
          }

          const nextScheduledAt = resolveNotificationWindowedAt(
            current,
            windowStart,
            windowEnd,
            now
          )

          if (nextScheduledAt && nextScheduledAt.getTime() > now.getTime()) {
            const baseId = getReminderSeriesBaseId(current.id)
            const existingAdvanced = reminders.value.find((item) => {
              if (item.id === current.id) return false
              if (item.status !== ReminderStatus.PENDING) return false
              if (item.scheduledAt.getTime() <= now.getTime()) return false
              return getReminderSeriesBaseId(item.id) === baseId
            })

            // Another occurrence at the computed next timestamp already exists.
            // Keep that pending one, and mark the overdue record as the missed sent instance.
            if (existingAdvanced) {
              const sentCurrent = await reminderAdapter.update(current.id, {
                scheduledAt: latestMissedAt,
                status: ReminderStatus.SENT,
                _isSync: true,
              })
              addReminder(sentCurrent)
              startupMissedIds.add(sentCurrent.id)
              changedCount += 1
              continue
            }

            let sentId = `${baseId}-missed-${latestMissedAt.getTime()}`
            while (sentId === current.id) {
              sentId = `${baseId}-missed-${latestMissedAt.getTime() + 1}`
            }

            try {
              const sentRecurring = await reminderAdapter.create({
                id: sentId,
                title: current.title,
                originalText: current.originalText,
                language: current.language,
                scheduledAt: latestMissedAt,
                source: current.source,
                parserMode: current.parserMode,
                status: ReminderStatus.SENT,
                recurrenceRule: current.recurrenceRule,
                ...(typeof current.parseConfidence === 'number'
                  ? { parseConfidence: current.parseConfidence }
                  : {}),
                _isSync: true,
              })
              addReminder(sentRecurring)
              startupMissedIds.add(sentRecurring.id)
            } catch (createErr) {
              const existingSent = await reminderAdapter.getById(sentId)
              if (!existingSent) {
                throw createErr
              }
              addReminder(existingSent)
              startupMissedIds.add(existingSent.id)
            }

            const advancedSeries = await reminderAdapter.update(current.id, {
              scheduledAt: nextScheduledAt,
              status: ReminderStatus.PENDING,
              _isSync: true,
            })
            addReminder(advancedSeries)
          } else {
            const completed = await reminderAdapter.update(current.id, {
              scheduledAt: latestMissedAt,
              status: ReminderStatus.SENT,
              _isSync: true,
            })
            addReminder(completed)
            startupMissedIds.add(completed.id)
          }

          changedCount += 1
        } catch (err) {
          console.error(`[ReminderStore] Failed to reconcile overdue reminder ${current.id}:`, err)
        }
      }

      // Safety net for historical and race-condition data: ensure there is only one
      // future pending reminder per recurring series base id.
      changedCount += await runRecurringPendingDedupe(now)

      if (startupMissedIds.size > 0) {
        missedReminderIds.value = startupMissedIds
      }

      if (changedCount > 0 && shouldSync) {
        try {
          await syncEngine.sync()
        } catch (err) {
          console.error('[ReminderStore] Cloud sync after startup reconciliation failed:', err)
        }
        await fetchReminders()
      }
    })()

    try {
      await startupReconcilePromise
    } finally {
      startupReconcilePromise = null
    }
  }

  let isInitialized = false
  function initialize() {
    if (isInitialized) return

    const idToNumber = (id: string): number => {
      let hash = 0
      for (let i = 0; i < id.length; i++) {
        const char = id.charCodeAt(i)
        hash = (hash << 5) - hash + char
        hash = hash & hash
      }
      return Math.abs(hash)
    }

    const resolveReminderIdFromNotificationId = (notificationId: unknown): string | undefined => {
      if (typeof notificationId !== 'number' || !Number.isFinite(notificationId)) return undefined
      const matched = reminders.value.find((reminder) => idToNumber(reminder.id) === notificationId)
      return matched?.id
    }

    const hydrateReminder = (payload: unknown): Reminder | null => {
      if (!payload || typeof payload !== 'object') return null
      const reminder = payload as SerializedReminder
      return {
        ...reminder,
        scheduledAt: new Date(reminder.scheduledAt),
        createdAt: new Date(reminder.createdAt),
        updatedAt: new Date(reminder.updatedAt),
      } as Reminder
    }

    const processTriggeredReminder = async (reminderId: string) => {
      if (processingTriggeredReminders.has(reminderId)) return
      const reminder = reminders.value.find((item) => item.id === reminderId)
      if (!reminder || reminder.status !== ReminderStatus.PENDING) return

      processingTriggeredReminders.add(reminderId)
      try {
        const { reminderAdapter } = await import('../services/reminderAdapter')
        const { sentReminder, nextReminder } = await applyTriggeredReminderTransition(
          reminder,
          reminderAdapter
        )
        addReminder(sentReminder)
        if (nextReminder) {
          addReminder(nextReminder)
        }
      } catch (error) {
        console.error(`[ReminderStore] Failed to process triggered reminder ${reminderId}:`, error)
        void fetchReminders()
      } finally {
        processingTriggeredReminders.delete(reminderId)
      }
    }

    const processDismissedReminder = async (reminderId: string) => {
      if (processingTriggeredReminders.has(reminderId)) return
      const reminder = reminders.value.find((item) => item.id === reminderId)
      if (!reminder || reminder.status !== ReminderStatus.PENDING) return

      processingTriggeredReminders.add(reminderId)
      try {
        const { reminderAdapter } = await import('../services/reminderAdapter')
        // We use applyTriggeredReminderTransition to handle recurrence, but we need
        // to force the current instance's status to DISMISSED instead of SENT.
        const { sentReminder, nextReminder } = await applyTriggeredReminderTransition(
          reminder,
          reminderAdapter
        )
        // Overwrite the returned instance status
        sentReminder.status = ReminderStatus.DISMISSED
        // Re-save it to db
        await reminderAdapter.update(reminderId, { status: ReminderStatus.DISMISSED })

        addReminder(sentReminder)
        if (nextReminder) {
          addReminder(nextReminder)
        }
      } catch (error) {
        console.error(`[ReminderStore] Failed to process dismissed reminder ${reminderId}:`, error)
        void fetchReminders()
      } finally {
        processingTriggeredReminders.delete(reminderId)
      }
    }

    const processSnoozeAction = async (reminderId: string, actionStr: string) => {
      if (processingTriggeredReminders.has(reminderId)) return
      const reminder = reminders.value.find((item) => item.id === reminderId)
      if (!reminder) return

      const action = actionStr as SnoozeAction
      if (action === 'dismiss') {
        void processDismissedReminder(reminderId)
        return
      }

      const durationMs = SNOOZE_ACTION_TO_MS[action]
      if (typeof durationMs !== 'number') {
        // Unknown action, default to triggered
        void processTriggeredReminder(reminderId)
        return
      }

      processingTriggeredReminders.add(reminderId)
      try {
        const { reminderAdapter } = await import('../services/reminderAdapter')
        const snoozedAt = calcSnoozedAt(new Date(), durationMs)

        if (reminder.recurrenceRule) {
          // Recurring reminder: apply transition to keep series moving forward
          // and reset this instance with no recurrence and a snoozed date
          const { nextReminder } = await applyTriggeredReminderTransition(reminder, reminderAdapter)

          if (nextReminder) {
            addReminder(nextReminder)
          }

          // Then update the **original/current** reminder to explicitly snooze it
          const updated = await reminderAdapter.update(reminderId, {
            scheduledAt: snoozedAt,
            status: ReminderStatus.PENDING,
            recurrenceRule: undefined,
          })
          addReminder(updated)
          console.log(
            `[ReminderStore] Snoozed recurring instance ${reminderId} until ${snoozedAt.toISOString()}`
          )
        } else {
          // Non-recurring: just change scheduledAt
          const updated = await reminderAdapter.update(reminderId, {
            scheduledAt: snoozedAt,
            status: ReminderStatus.PENDING,
          })
          addReminder(updated)
          console.log(
            `[ReminderStore] Snoozed reminder ${reminderId} by ${action} until ${snoozedAt.toISOString()}`
          )
        }
      } catch (error) {
        console.error(`[ReminderStore] Failed to snooze reminder ${reminderId}:`, error)
        void fetchReminders()
      } finally {
        processingTriggeredReminders.delete(reminderId)
      }
    }

    const processDueHourlyOutsideWindow = async () => {
      const settingsStoreRef = useSettingsStore()
      const windowStart = settingsStoreRef.hourlyReminderStartTime || DEFAULT_HOURLY_WINDOW_START
      const windowEnd = settingsStoreRef.hourlyReminderEndTime || DEFAULT_HOURLY_WINDOW_END

      // Inside window, the OS notification path should drive transitions.
      if (isWithinHourlyWindow(new Date(), windowStart, windowEnd)) {
        return
      }

      // Catch up overdue hourly recurrences while outside window.
      // This mirrors desktop behavior where recurrence advancement is decoupled
      // from notification display.
      let safetyCounter = 0
      const maxTransitionsPerPass = 200
      while (safetyCounter < maxTransitionsPerPass) {
        const now = new Date()
        const dueHourly = reminders.value.find(
          (item) =>
            item.status === ReminderStatus.PENDING &&
            isHourlyRule(item.recurrenceRule) &&
            item.scheduledAt.getTime() <= now.getTime()
        )
        if (!dueHourly) {
          break
        }
        // Ensure any pre-scheduled OS notification for this skipped hourly
        // occurrence does not fire later when we are outside window.
        await notificationService.cancel(dueHourly.id)
        await processTriggeredReminder(dueHourly.id)
        safetyCounter += 1
      }
      if (safetyCounter === maxTransitionsPerPass) {
        console.warn(
          '[ReminderStore] Reached max silent hourly transitions in one pass; continuing next tick.'
        )
      }
    }

    const extractReminderId = (payload: unknown): string | undefined => {
      if (!payload || typeof payload !== 'object') return undefined
      const data = payload as Record<string, unknown>

      const fromId = resolveReminderIdFromNotificationId(data.id)
      if (fromId) return fromId

      const fromExtra = data.extra
      if (fromExtra && typeof fromExtra === 'object') {
        const reminderId = (fromExtra as Record<string, unknown>).reminderId
        if (typeof reminderId === 'string' && reminderId.length > 0) return reminderId
      }

      const fromNotification = data.notification
      if (fromNotification && typeof fromNotification === 'object') {
        const notificationId = (fromNotification as Record<string, unknown>).id
        const fromNotificationId = resolveReminderIdFromNotificationId(notificationId)
        if (fromNotificationId) return fromNotificationId

        const notificationExtra = (fromNotification as Record<string, unknown>).extra
        if (notificationExtra && typeof notificationExtra === 'object') {
          const reminderId = (notificationExtra as Record<string, unknown>).reminderId
          if (typeof reminderId === 'string' && reminderId.length > 0) return reminderId
        }
      }

      return undefined
    }

    if (typeof window !== 'undefined' && window.electronAPI?.onReminderTriggered) {
      window.electronAPI.onReminderTriggered((reminder) => {
        console.log('[ReminderStore] Received reminder:triggered:', reminder.id)
        updateReminder(reminder.id, { status: ReminderStatus.SENT })
      })
    }
    if (typeof window !== 'undefined' && window.electronAPI?.onReminderCreated) {
      window.electronAPI.onReminderCreated((reminderPayload: unknown) => {
        const hydrated = hydrateReminder(reminderPayload)
        if (!hydrated) return
        console.log('[ReminderStore] Received reminder:created:', hydrated.id)
        addReminder(hydrated)
        if (hydrated.status === ReminderStatus.PENDING && hydrated.recurrenceRule) {
          void runRecurringPendingDedupe()
        }
      })
    }
    if (typeof window !== 'undefined' && window.electronAPI?.onReminderUpdated) {
      window.electronAPI.onReminderUpdated((reminderPayload: unknown) => {
        const hydrated = hydrateReminder(reminderPayload)
        if (!hydrated) return
        console.log('[ReminderStore] Received reminder:updated:', hydrated.id)
        addReminder(hydrated)
        if (hydrated.status === ReminderStatus.PENDING && hydrated.recurrenceRule) {
          void runRecurringPendingDedupe()
        }
      })
    }
    if (typeof window !== 'undefined' && window.electronAPI?.onReminderDeleted) {
      window.electronAPI.onReminderDeleted((id: string) => {
        if (!id) return
        console.log('[ReminderStore] Received reminder:deleted:', id)
        deleteReminder(id)
      })
    }
    if (isCapacitorNative()) {
      LocalNotifications.addListener('localNotificationReceived', (notification) => {
        const reminderId = extractReminderId(notification)
        if (!reminderId) return
        console.log('[ReminderStore] Received local notification:', reminderId)
        void processTriggeredReminder(reminderId)
      })

      LocalNotifications.addListener('localNotificationActionPerformed', (event) => {
        const reminderId = extractReminderId(event)
        if (!reminderId) return

        const actionId = event.actionId
        console.log(
          `[ReminderStore] Received notification action: ${actionId} for reminder: ${reminderId}`
        )

        if (actionId && actionId !== 'tap') {
          void processSnoozeAction(reminderId, actionId)
        } else {
          // Default tap action (no specific button pressed)
          console.log(
            `[ReminderStore] Notification explicitly tapped, navigating to Sent for ${reminderId}`
          )
          filterStatus.value = ReminderStatus.SENT
          missedReminderIds.value = new Set([reminderId])
          void processTriggeredReminder(reminderId)
        }
      })

      App.addListener('appStateChange', async (state: { isActive: boolean }) => {
        if (!state.isActive) return

        await processDueHourlyOutsideWindow()

        console.log('[ReminderStore] App returned to foreground. Checking for missed reminders...')

        try {
          const delivered = await LocalNotifications.getDeliveredNotifications()
          if (delivered.notifications.length === 0) {
            console.log(
              '[ReminderStore] No delivered notifications in system. Skipping missed highlight.'
            )
            return
          }

          // In Capacitor, if there ARE delivered notifications, we precisely highlight only those.
          const activeMissedIds = new Set<string>()
          for (const notification of delivered.notifications) {
            const rid = extractReminderId(notification)
            if (rid && !dismissedMissedReminderIds.value.has(rid)) {
              activeMissedIds.add(rid)
            }
          }

          if (activeMissedIds.size > 0) {
            console.log(
              `[ReminderStore] Found ${activeMissedIds.size} active missed reminders from OS. Highlighting them.`
            )
            filterStatus.value = ReminderStatus.SENT
            missedReminderIds.value = activeMissedIds
          }
        } catch (err) {
          console.warn('[ReminderStore] Failed to check delivered notifications:', err)
        }
      })

      if (!silentHourlyTransitionInterval) {
        silentHourlyTransitionInterval = setInterval(() => {
          void processDueHourlyOutsideWindow()
        }, 30_000)
      }
      void processDueHourlyOutsideWindow()
    }
    if (typeof window !== 'undefined' && window.electronAPI?.onNavigateToSent) {
      // E15-02: Main process (tray click) requests navigation to the sent/history tab
      window.electronAPI.onNavigateToSent((missedIds) => {
        console.log('[ReminderStore] onNavigateToSent received missedIds:', missedIds)
        filterStatus.value = ReminderStatus.SENT
        if (missedIds && Array.isArray(missedIds)) {
          missedReminderIds.value = new Set(missedIds)
          console.log('[ReminderStore] missedReminderIds set to:', missedReminderIds.value)
        }
        window.electronAPI?.badgeCleared()
      })
    }

    // E15-02: Clear badge any time the user manually switches to the Sent tab
    watch(filterStatus, (status) => {
      if (status === ReminderStatus.SENT) {
        if (typeof window !== 'undefined' && window.electronAPI) {
          window.electronAPI.badgeCleared()
        }
        if (isCapacitorNative()) {
          void LocalNotifications.removeAllDeliveredNotifications()
        }
      } else {
        // Clear highlight state when leaving Sent tab
        if (isCapacitorNative()) {
          missedReminderIds.value.forEach((id) => dismissedMissedReminderIds.value.add(id))
        }
        missedReminderIds.value.clear()
      }
    })

    isInitialized = true
  }

  async function clearOldReminders(includeSent: boolean = true): Promise<number> {
    const { reminderAdapter } = await import('../services/reminderAdapter')
    try {
      const count = await reminderAdapter.clearOldReminders(includeSent)
      // Always refresh local state after clear action so the UI reflects the latest DB state
      // even if a backend implementation returns 0 while still mutating records.
      await fetchReminders()
      return count
    } catch (err) {
      console.error('[ReminderStore] Failed to clear old reminders:', err)
      throw err
    }
  }

  return {
    reminders,
    isLoading,
    error,
    filterStatus,
    missedReminderIds,
    sentMissedCount,
    upcomingReminders,
    filteredReminders,
    setReminders,
    addReminder,
    updateReminder,
    deleteReminder,
    fetchReminders,
    reconcileStartupReminders,
    syncCloud,
    backfillCloudFromLocal,
    clearOldReminders,
    initialize,
  }
})
