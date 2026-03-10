import { LocalNotifications } from '@capacitor/local-notifications'
import type { Reminder } from '../types/reminder'
import type { INotificationAdapter } from '../types/notification'
import { resolveNotificationWindowedAt } from './schedulerService'
import { useSettingsStore } from '../stores/settings'

const SNOOZE_ACTION_TYPE_ID = 'REMINDER_SNOOZE'

export class CapacitorNotificationAdapter implements INotificationAdapter {
  private async ensurePermissions(): Promise<boolean> {
    const perm = await LocalNotifications.checkPermissions()
    if (perm.display === 'granted') return true

    const request = await LocalNotifications.requestPermissions()
    return request.display === 'granted'
  }

  private async createChannel(): Promise<void> {
    try {
      await LocalNotifications.createChannel({
        id: 'reminders',
        name: 'Reminders',
        description: 'Notifications for your reminders',
        importance: 5, // high importance
        visibility: 1, // public
        vibration: true,
      })
    } catch (error) {
      console.error('[CapacitorNotificationAdapter] Failed to create notification channel:', error)
    }
  }

  /**
   * Create a high-priority notification channel used for priority reminders.
   * On Android, users can grant this channel permission to bypass Do Not Disturb
   * in system Settings → Apps → Notifications → [channel].
   * On iOS and other platforms, channel creation is a no-op.
   */
  private async createPriorityChannel(): Promise<void> {
    try {
      await LocalNotifications.createChannel({
        id: 'priority-reminders',
        name: 'Priority Reminders',
        description: 'High-priority notifications that may bypass Do Not Disturb',
        importance: 5, // max importance
        visibility: 1, // public
        vibration: true,
      })
    } catch (error) {
      console.error(
        '[CapacitorNotificationAdapter] Failed to create priority notification channel:',
        error
      )
    }
  }

  private async hasExactAlarmSupport(): Promise<boolean> {
    try {
      const setting = await LocalNotifications.checkExactNotificationSetting()
      if (setting.exact_alarm === 'granted') return true
      console.warn(
        `[CapacitorNotificationAdapter] Exact alarm permission is ${setting.exact_alarm}; notifications may be delayed on Android.`
      )
      return false
    } catch (error) {
      // Not all platforms expose this setting in the same way.
      console.warn(
        '[CapacitorNotificationAdapter] Could not check exact alarm setting; falling back to standard scheduling:',
        error
      )
      return false
    }
  }

  /**
   * Simple hash function to convert UUID string to a positive 32-bit integer.
   * Capacitor LocalNotifications require numeric IDs for some operations or
   * it's safer to use them to avoid platform-specific issues.
   */
  private idToNumber(id: string): number {
    let hash = 0
    for (let i = 0; i < id.length; i++) {
      const char = id.charCodeAt(i)
      hash = (hash << 5) - hash + char
      hash = hash & hash // Convert to 32bit integer
    }
    return Math.abs(hash)
  }

  /**
   * Register action types for snooze/dismiss buttons.
   * Only registers on native mobile platforms.
   */
  private async registerActionTypes(): Promise<void> {
    try {
      import('@capacitor/core').then(async ({ Capacitor }) => {
        if (!Capacitor.isNativePlatform()) return

        await LocalNotifications.registerActionTypes({
          types: [
            {
              id: SNOOZE_ACTION_TYPE_ID,
              actions: [
                { id: 'snooze-15m', title: '+15 min' },
                { id: 'snooze-1h', title: '+1 hour' },
                { id: 'snooze-1d', title: '+1 day' },
                { id: 'dismiss', title: 'Dismiss', destructive: true },
              ],
            },
          ],
        })
        console.log('[CapacitorNotificationAdapter] Registered snooze action types')
      })
    } catch (error) {
      console.error(
        '[CapacitorNotificationAdapter] Failed to register notification action types:',
        error
      )
    }
  }

  async initialize(): Promise<void> {
    await this.registerActionTypes()
  }

  async schedule(reminder: Reminder): Promise<void> {
    if (!(await this.ensurePermissions())) {
      console.warn('[CapacitorNotificationAdapter] Notification permissions not granted')
      return
    }

    // Ensure notification channel exists (Android only but safe to call)
    const settingsStore = useSettingsStore()
    const isPriority = reminder.priority === true
    if (isPriority) {
      await this.createPriorityChannel()
    } else {
      await this.createChannel()
    }
    const channelId = isPriority ? 'priority-reminders' : 'reminders'
    const hasExactAlarm = await this.hasExactAlarmSupport()

    try {
      const scheduledAt = resolveNotificationWindowedAt(
        reminder,
        settingsStore.hourlyReminderStartTime,
        settingsStore.hourlyReminderEndTime,
        new Date()
      )
      if (!scheduledAt) {
        console.log(
          `[CapacitorNotificationAdapter] No future occurrence available for ${reminder.id}; skipping schedule`
        )
        return
      }
      // LocalNotifications.schedule expects 'at' to be a Date object
      await LocalNotifications.schedule({
        notifications: [
          {
            id: this.idToNumber(reminder.id),
            title: 'Mai Reminder',
            body: reminder.title,
            schedule: { at: scheduledAt, allowWhileIdle: hasExactAlarm },
            sound: 'default',
            channelId,
            actionTypeId: SNOOZE_ACTION_TYPE_ID,
            extra: {
              reminderId: reminder.id,
            },
          },
        ],
      })
      console.log(
        `[CapacitorNotificationAdapter] Scheduled notification for ${reminder.id} at ${scheduledAt.toISOString()}`
      )
    } catch (error) {
      console.error('[CapacitorNotificationAdapter] Failed to schedule notification:', error)
    }
  }

  async cancel(id: string): Promise<void> {
    try {
      await LocalNotifications.cancel({
        notifications: [{ id: this.idToNumber(id) }],
      })
      console.log(`[CapacitorNotificationAdapter] Cancelled notification for ${id}`)
    } catch (error) {
      console.error('[CapacitorNotificationAdapter] Failed to cancel notification:', error)
    }
  }
}
