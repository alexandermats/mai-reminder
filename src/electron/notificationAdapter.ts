import { Notification } from 'electron'
import type { Reminder } from '../types/reminder'
import type { INotificationAdapter } from '../types/notification'
import type { SnoozeAction } from '../services/snoozeService'

export type { SnoozeAction }

export interface NotificationActionHandler {
  (reminderId: string, action: SnoozeAction | 'show-overlay' | 'show-app'): void
}

// Action button labels ordered by index (used on macOS native actions)
const ACTION_LABELS: ReadonlyArray<{ label: string; action: SnoozeAction }> = [
  { label: '+15 min', action: 'snooze-15m' },
  { label: '+1 hour', action: 'snooze-1h' },
  { label: '+1 day', action: 'snooze-1d' },
  { label: 'Dismiss', action: 'dismiss' },
]

export class ElectronNotificationAdapter implements INotificationAdapter {
  // Keep references to prevent garbage collection before they are shown/clicked
  private activeNotifications: Map<Notification, string> = new Map()
  private onAction?: NotificationActionHandler

  constructor(onAction?: NotificationActionHandler) {
    this.onAction = onAction
  }

  public async schedule(reminder: Reminder): Promise<void> {
    this.showNotification(reminder)
  }

  public async cancel(_id: string): Promise<void> {
    // In Electron, cancellation is handled by the ReminderScheduler in the main process.
    // This adapter is used for immediate display when the scheduler triggers.
  }

  public async initialize(): Promise<void> {
    // Actions are handled when the notification is shown on macOS
  }

  public showNotification(reminder: Reminder, displayTimeSeconds: number = 60): void {
    if (!Notification.isSupported()) {
      console.warn('[ElectronNotificationAdapter] Notifications are not supported on this OS.')
      return
    }

    try {
      const notification = new Notification({
        title: 'Mai Reminder',
        body: reminder.title,
        silent: false,
        timeoutType: 'never',
        actions: ACTION_LABELS.map((a) => ({ type: 'button' as const, text: a.label })),
      })

      this.activeNotifications.set(notification, reminder.id)

      const timeoutId = setTimeout(() => {
        notification.close()
      }, displayTimeSeconds * 1000)

      notification.on('close', () => {
        clearTimeout(timeoutId)
        this.activeNotifications.delete(notification)
      })

      notification.on('click', () => {
        // Bring app to foreground when notification body is clicked
        if (this.onAction) {
          const reminderId = this.activeNotifications.get(notification)
          if (reminderId) {
            this.onAction(reminderId, 'show-app')
          }
        }
        this.activeNotifications.delete(notification)
      })

      if (this.onAction) {
        notification.on('action', (_event: Electron.Event, buttonIndex: number) => {
          const entry = ACTION_LABELS[buttonIndex]
          if (entry) {
            const reminderId = this.activeNotifications.get(notification)
            if (reminderId) {
              this.onAction!(reminderId, entry.action)
            }
          }
          this.activeNotifications.delete(notification)
        })
      }

      notification.show()
    } catch (error) {
      console.error('[ElectronNotificationAdapter] Failed to show notification:', error)
    }
  }
}
