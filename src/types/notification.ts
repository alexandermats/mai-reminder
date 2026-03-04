import type { Reminder } from './reminder'

export interface INotificationAdapter {
  /**
   * Schedule a notification for a reminder.
   * On Electron, this might be handled by the main process scheduler.
   * On Capacitor, this schedules a local notification with the OS.
   */
  schedule(reminder: Reminder): Promise<void>

  /**
   * Cancel a scheduled notification.
   */
  cancel(id: string): Promise<void>

  /**
   * Initialize notification adapter (e.g. register action types)
   */
  initialize(): Promise<void>
}
