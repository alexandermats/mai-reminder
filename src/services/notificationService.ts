import { isElectron, isCapacitorNative } from '../utils/platform'
import type { INotificationAdapter } from '../types/notification'
import { CapacitorNotificationAdapter } from './capacitorNotificationAdapter'
import type { Reminder } from '../types/reminder'

class MockNotificationAdapter implements INotificationAdapter {
  async schedule(reminder: Reminder): Promise<void> {
    console.log('[MockNotificationAdapter] Scheduled notification:', reminder.title)
  }
  async cancel(id: string): Promise<void> {
    console.log('[MockNotificationAdapter] Cancelled notification:', id)
  }
  async initialize(): Promise<void> {
    console.log('[MockNotificationAdapter] Initialized')
  }
}

class ElectronRendererNotificationAdapter implements INotificationAdapter {
  async schedule(_reminder: Reminder): Promise<void> {
    // No-op in renderer for Electron.
    // The main process handles scheduling via IPC create/update handlers.
  }
  async cancel(_id: string): Promise<void> {
    // No-op in renderer for Electron.
    // The main process handles cancellation via IPC delete/update handlers.
  }
  async initialize(): Promise<void> {
    // No-op in renderer for Electron
  }
}

export const notificationService: INotificationAdapter = (() => {
  if (isElectron()) return new ElectronRendererNotificationAdapter()
  if (isCapacitorNative()) return new CapacitorNotificationAdapter()
  return new MockNotificationAdapter()
})()
