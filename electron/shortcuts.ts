import { globalShortcut } from 'electron'

/**
 * Registers global keyboard shortcuts for the application.
 *
 * @param shortcut The shortcut accelerator string (e.g., 'CommandOrControl+Shift+Space').
 * @param onTrigger Callback function to execute when the shortcut is triggered.
 */
export function registerGlobalShortcuts(shortcut: string, onTrigger?: () => void): void {
  const isRegistered = globalShortcut.isRegistered(shortcut)

  if (!isRegistered) {
    const success = globalShortcut.register(shortcut, () => {
      console.log(`[Shortcut] ${shortcut} triggered`)
      if (onTrigger) {
        onTrigger()
      }
    })

    if (success) {
      console.log(`[Shortcut] Successfully registered ${shortcut}`)
    } else {
      console.error(`[Shortcut] Failed to register ${shortcut}`)
    }
  } else {
    console.log(`[Shortcut] ${shortcut} is already registered`)
  }
}

/**
 * Unregisters all global shortcuts for the application.
 */
export function unregisterGlobalShortcuts(): void {
  globalShortcut.unregisterAll()
  console.log('[Shortcut] Unregistered all global shortcuts')
}
