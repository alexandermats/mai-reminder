import { app } from 'electron'

export function setAutoStart(openAtLogin: boolean): void {
  try {
    if (app && app.setLoginItemSettings) {
      app.setLoginItemSettings({ openAtLogin })
      console.log(`[AutoStart] Set openAtLogin to ${openAtLogin}`)
    }
  } catch (err) {
    console.error('[AutoStart] Failed to update login items:', err)
  }
}
