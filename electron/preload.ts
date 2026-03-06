import type { Reminder, ReminderInput } from '../src/types/reminder'
const { contextBridge, ipcRenderer } = require('electron')

/**
 * Secure preload script for Electron.
 *
 * This script runs in an isolated context before the renderer process loads.
 * It exposes a limited, safe API to the renderer via contextBridge.
 *
 * Security principles followed:
 * - Never expose ipcRenderer directly - always wrap in helper functions
 * - Use contextIsolation: true to prevent prototype pollution attacks
 * - Expose only the minimum required functionality
 * - All IPC channels are explicitly whitelisted
 *
 * @see https://www.electronjs.org/docs/latest/tutorial/context-isolation
 * @see https://www.electronjs.org/docs/latest/tutorial/security
 */

/**
 * Electron API exposed to the renderer process.
 *
 * These methods provide secure IPC communication between
 * renderer and main processes.
 */
const electronAPI = {
  /**
   * Ping method for testing IPC connectivity.
   * Invokes 'ping' channel in main process.
   * @returns Promise resolving to 'pong'
   */
  ping: (): Promise<string> => ipcRenderer.invoke('ping'),

  reminders: {
    list: (options?: unknown) => ipcRenderer.invoke('reminders:list', options),
    create: (input: ReminderInput) => ipcRenderer.invoke('reminders:create', input),
    getById: (id: string) => ipcRenderer.invoke('reminders:get-by-id', id),
    // Dates are serialized as ISO strings over IPC - the repository handles conversion
    listUpcoming: (fromDate?: Date | string) =>
      ipcRenderer.invoke('reminders:list-upcoming', fromDate),
    update: (id: string, changes: Partial<ReminderInput>) =>
      ipcRenderer.invoke('reminders:update', id, changes),
    delete: (id: string, isSync?: boolean) => ipcRenderer.invoke('reminders:delete', id, isSync),
    clearOldReminders: (includeSent?: boolean) =>
      ipcRenderer.invoke('reminders:clear-old', includeSent),
    // Dates are serialized as ISO strings over IPC - the repository handles conversion
    cleanupPastPendingReminders: (now?: Date | string) =>
      ipcRenderer.invoke('reminders:cleanup-past-pending', now),
  },
  settings: {
    getSetting: (key: string) => ipcRenderer.invoke('settings:get', key),
    setSetting: (key: string, value: unknown) => ipcRenderer.invoke('settings:set', key, value),
    clearAllSettings: () => ipcRenderer.invoke('settings:clearAll'),
  },

  // Notification Callback
  onReminderTriggered: (callback: (reminder: Reminder) => void) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ipcRenderer.on('reminder:triggered', (_: any, reminder: Reminder) => callback(reminder))
  },

  // Reminder created callback (for cross-window sync)
  onReminderCreated: (callback: (reminder: Reminder) => void) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ipcRenderer.on('reminder:created', (_: any, reminder: Reminder) => callback(reminder))
  },
  // Reminder updated callback (for cross-window sync)
  onReminderUpdated: (callback: (reminder: Reminder) => void) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ipcRenderer.on('reminder:updated', (_: any, reminder: Reminder) => callback(reminder))
  },
  // Reminder deleted callback (for cross-window sync)
  onReminderDeleted: (callback: (id: string) => void) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ipcRenderer.on('reminder:deleted', (_: any, id: string) => callback(id))
  },

  // Voice Recording API (E4-08)
  startVoice: (lang?: string) => ipcRenderer.send('voice-start', lang),
  stopVoice: () => ipcRenderer.send('voice-stop'),
  sendAudioChunk: (chunk: ArrayBuffer) => ipcRenderer.send('voice-audio-chunk', chunk),
  onVoicePartial: (callback: (text: string) => void) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ipcRenderer.on('voice-partial', (_: any, text: string) => callback(text))
  },
  onVoiceFinal: (callback: (text: string) => void) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ipcRenderer.on('voice-final', (_: any, text: string) => callback(text))
  },
  removeVoiceListeners: () => {
    ipcRenderer.removeAllListeners('voice-partial')
    ipcRenderer.removeAllListeners('voice-final')
  },

  /**
   * Hide the quick-add overlay window.
   */
  hideOverlay: () => ipcRenderer.send('overlay:hide'),

  // Overlay visibility callback
  onOverlayShown: (callback: () => void) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ipcRenderer.on('overlay:shown', (_: any) => callback())
  },

  // Snooze overlay IPC (used on Windows / Linux instead of native notification action buttons)
  snooze: {
    /** Send a snooze/dismiss action for the given reminder to the main process. */
    sendAction: (reminderId: string, action: string) =>
      ipcRenderer.send('snooze:action', { reminderId, action }),
    /** Listen for the reminder data sent when the snooze overlay is shown. */
    onReminderData: (callback: (data: { id: string; title: string }) => void) => {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      ipcRenderer.on('snooze:reminder-data', (_: any, data: { id: string; title: string }) =>
        callback(data)
      )
    },
    /** Ask the main process to re-send the current pending reminder data. */
    requestReminderData: () => ipcRenderer.send('snooze:request-data'),
  },

  // E15-02: Missed Reminders Badge
  /** Notify the main process that the user has viewed the sent tab, clearing the badge. */
  badgeCleared: () => ipcRenderer.send('badge:cleared'),
  /** Subscribe to navigate-to-sent events emitted by the main process (e.g. tray click). */
  onNavigateToSent: (callback: (missedIds?: string[]) => void) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    ipcRenderer.on('badge:navigate-sent', (_: any, missedIds?: string[]) => callback(missedIds))
  },
  /** Trigger a manual badge refresh from the renderer (e.g. after startup reconciliation). */
  badgeRefresh: () => ipcRenderer.send('badge:refresh'),
}

// Expose the API to the renderer process
// This will be available as window.electronAPI in the renderer
contextBridge.exposeInMainWorld('electronAPI', electronAPI)

// No exports - preload script runs in isolated context
// Type definitions are in src/electron/types.ts
