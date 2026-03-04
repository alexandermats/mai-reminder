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
      .sort((a, b) => new Date(a.scheduledAt).getTime() - new Date(b.scheduledAt).getTime())
  })

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
        const reminder = reminderPayload as SerializedReminder
        console.log('[ReminderStore] Received reminder:created:', reminder.id)
        // Hydrate dates properly from IPC serialization
        const hydrated: Reminder = {
          ...reminder,
          scheduledAt: new Date(reminder.scheduledAt),
          createdAt: new Date(reminder.createdAt),
          updatedAt: new Date(reminder.updatedAt),
        } as Reminder
        addReminder(hydrated)
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
          void processTriggeredReminder(reminderId)
        }
      })

      App.addListener('appStateChange', async (state: { isActive: boolean }) => {
        if (!state.isActive) return

        console.log('[ReminderStore] App returned to foreground. Checking for missed reminders...')

        try {
          const delivered = await LocalNotifications.getDeliveredNotifications()
          if (delivered.notifications.length === 0) {
            console.log(
              '[ReminderStore] No delivered notifications in system. Skipping missed highlight.'
            )
            return
          }
        } catch (err) {
          console.warn('[ReminderStore] Failed to check delivered notifications:', err)
        }

        const settingsStore = useSettingsStore()
        const displayTimeSecs = isCapacitorNative()
          ? 1
          : settingsStore.notificationDisplayTimeSeconds || 60
        // A reminder is missed if its scheduled time plus the notification display time is in the past
        const thresholdTime = new Date(Date.now() - displayTimeSecs * 1000)

        const missed = reminders.value.filter((r) => {
          return (
            r.status === ReminderStatus.SENT &&
            r.scheduledAt < thresholdTime &&
            !dismissedMissedReminderIds.value.has(r.id)
          )
        })

        if (missed.length > 0) {
          console.log(`[ReminderStore] Found ${missed.length} missed reminders. Highlighting them.`)
          filterStatus.value = ReminderStatus.SENT
          missedReminderIds.value = new Set(missed.map((m) => m.id))
        }
      })
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

    // Trigger an initial background sync only when Cloud Sync is enabled.
    // Periodic polling is already managed by syncEngine.start() in App.vue.
    const settingsStoreRef = useSettingsStore()
    if (settingsStoreRef.cloudSyncEnabled) {
      void syncCloud()
    }

    isInitialized = true
  }

  async function clearOldReminders(includeSent: boolean = true): Promise<number> {
    const { reminderAdapter } = await import('../services/reminderAdapter')
    try {
      const count = await reminderAdapter.clearOldReminders(includeSent)
      if (count > 0) {
        await fetchReminders()
      }
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
    upcomingReminders,
    filteredReminders,
    setReminders,
    addReminder,
    updateReminder,
    deleteReminder,
    fetchReminders,
    syncCloud,
    backfillCloudFromLocal,
    clearOldReminders,
    initialize,
  }
})
