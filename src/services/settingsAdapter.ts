import { Preferences } from '@capacitor/preferences'
import type { AppSettings } from '../db/settingsRepository'

import { isElectron as checkIsElectron, isCapacitorNative } from '../utils/platform'
import '../electron/types'

export interface ISettingsAdapter {
  getSetting<K extends keyof AppSettings>(key: K): Promise<AppSettings[K] | null>
  setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void>
  clearAllSettings(): Promise<void>
}

// Check if running in electron
const isElectron = checkIsElectron()
const isCapacitor = isCapacitorNative()

class ElectronSettingsAdapter implements ISettingsAdapter {
  async getSetting<K extends keyof AppSettings>(key: K): Promise<AppSettings[K] | null> {
    return window.electronAPI!.settings.getSetting(key)
  }

  async setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
    return window.electronAPI!.settings.setSetting(key, value)
  }

  async clearAllSettings(): Promise<void> {
    return window.electronAPI!.settings.clearAllSettings()
  }
}

class WebSettingsAdapter implements ISettingsAdapter {
  async getSetting<K extends keyof AppSettings>(key: K): Promise<AppSettings[K] | null> {
    if (typeof localStorage === 'undefined') return null

    const value = localStorage.getItem(`settings.${key}`)
    return (value as AppSettings[K]) || null
  }

  async setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
    if (typeof localStorage === 'undefined') return
    localStorage.setItem(`settings.${key}`, value as string)
  }

  async clearAllSettings(): Promise<void> {
    if (typeof localStorage === 'undefined') return
    // Remove all keys starting with "settings."
    const keysToRemove: string[] = []
    for (let i = 0; i < localStorage.length; i++) {
      const key = localStorage.key(i)
      if (key && key.startsWith('settings.')) {
        keysToRemove.push(key)
      }
    }
    keysToRemove.forEach((k) => localStorage.removeItem(k))
  }
}

class CapacitorSettingsAdapter implements ISettingsAdapter {
  async getSetting<K extends keyof AppSettings>(key: K): Promise<AppSettings[K] | null> {
    const { value } = await Preferences.get({ key: `settings.${key}` })
    return (value as AppSettings[K]) || null
  }

  async setSetting<K extends keyof AppSettings>(key: K, value: AppSettings[K]): Promise<void> {
    await Preferences.set({
      key: `settings.${key}`,
      value: value as string,
    })
  }

  async clearAllSettings(): Promise<void> {
    const { keys } = await Preferences.keys()
    const settingsKeys = keys.filter((k) => k.startsWith('settings.'))
    await Promise.all(settingsKeys.map((key) => Preferences.remove({ key })))
  }
}

export const settingsAdapter: ISettingsAdapter = isElectron
  ? new ElectronSettingsAdapter()
  : isCapacitor
    ? new CapacitorSettingsAdapter()
    : new WebSettingsAdapter()
