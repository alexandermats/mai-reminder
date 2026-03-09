/**
 * Type definitions for Electron IPC API exposed via preload script.
 *
 * These types define the secure bridge between main and renderer processes.
 * The actual implementation is in electron/preload.ts
 */
import type { Reminder, ReminderInput } from '../types/reminder'
import type { AppSettings } from '../db/settingsRepository'

export interface ElectronAPI {
  /**
   * Ping method for testing IPC connectivity.
   * Returns 'pong' to confirm the channel is working.
   */
  ping(): Promise<string>
  reminders: {
    list(options?: unknown): Promise<Reminder[]>
    create(input: ReminderInput): Promise<Reminder>
    getById(id: string): Promise<Reminder | null>
    listUpcoming(fromDate?: Date | string): Promise<Reminder[]>
    update(id: string, changes: Partial<ReminderInput>): Promise<Reminder>
    delete(id: string, isSync?: boolean): Promise<boolean>
    clearOldReminders(includeSent?: boolean): Promise<number>
    cleanupPastPendingReminders(now?: Date | string): Promise<number>
  }
  settings: {
    getSetting<K extends keyof AppSettings>(key: K): Promise<AppSettings[K] | null>
    setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void>
    clearAllSettings(): Promise<void>
  }

  // Notification Callback
  onReminderTriggered: (callback: (reminder: Reminder) => void) => void

  // Cross-window sync callback
  onReminderCreated: (callback: (reminder: Reminder) => void) => void
  onReminderUpdated: (callback: (reminder: Reminder) => void) => void
  onReminderDeleted: (callback: (id: string) => void) => void

  // Overlay visibility callback
  onOverlayShown: (callback: () => void) => void

  /**
   * Hide the quick-add overlay window.
   */
  hideOverlay: () => void

  // Voice Recording API (E4-08)
  startVoice: (lang?: string) => void
  stopVoice: () => void
  sendAudioChunk: (chunk: ArrayBuffer) => void
  onVoicePartial: (callback: (text: string) => void) => void
  onVoiceFinal: (callback: (text: string) => void) => void
  removeVoiceListeners: () => void

  // E15-02 Missed Reminders Badge
  /** Notify the main process that the user has viewed the sent/history tab, clearing the badge. */
  badgeCleared: () => void
  /** Subscribe to navigation requests from the main process (tray click) to open the sent tab. */
  onNavigateToSent: (callback: (missedIds?: string[]) => void) => void
  /** Subscribe to live badge count updates from the main process. */
  onBadgeUpdate: (callback: (count: number, missedIds: string[]) => void) => void

  /** Trigger a manual badge refresh from the renderer (e.g. after startup reconciliation). */
  badgeRefresh: () => void
}

declare global {
  // eslint-disable-next-line no-unused-vars
  interface Window {
    electronAPI?: ElectronAPI
  }
}

export {}
