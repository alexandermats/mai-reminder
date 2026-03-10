import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { SupportedLocale } from '../plugins/i18n'
import {
  loadSavedLanguage,
  saveLanguage,
  isSupportedLocale,
  clearSavedLanguage,
  detectLanguage,
} from '../plugins/i18n'
import type { ParserMode } from '../db/settingsRepository'
import { settingsAdapter } from '../services/settingsAdapter'
import { isElectron } from '../utils/platform'
import { DEFAULT_HOURLY_WINDOW_END, DEFAULT_HOURLY_WINDOW_START } from '../utils/hourlyRecurrence'
import { DEFAULT_SILENCE_TIMEOUT_MS } from '../constants/voice'

export const useSettingsStore = defineStore('settings', () => {
  // State
  const language = ref<SupportedLocale>(loadSavedLanguage())
  const parserMode = ref<ParserMode>('local')
  const cerebrasApiKey = ref<string>('')
  const fastSave = ref(false)
  const quickAddHotkey = ref('CommandOrControl+Shift+Space')
  const hourlyReminderStartTime = ref(DEFAULT_HOURLY_WINDOW_START)
  const hourlyReminderEndTime = ref(DEFAULT_HOURLY_WINDOW_END)
  const silenceTimeoutMs = ref(DEFAULT_SILENCE_TIMEOUT_MS)
  const openAtLogin = ref(false)
  const notificationDisplayTimeSeconds = ref(60)
  const cloudSyncEnabled = ref(false)
  const cloudSyncUserId = ref('')
  const cloudSyncEncryptionKeyBase64 = ref('')
  const timeFormat = ref<'12h' | '24h'>('24h')
  const priorityDndBypass = ref(false)
  const isLoading = ref(false)
  const error = ref<string | null>(null)

  // Getters
  const isAIParsingEnabled = computed(() => parserMode.value === 'llm')

  const languageLabel = computed(() => {
    const labels: Record<SupportedLocale, string> = {
      en: 'English',
      ru: 'Russian',
    }
    return labels[language.value]
  })

  // Actions
  async function initialize(): Promise<void> {
    isLoading.value = true
    error.value = null

    try {
      // Load settings from adapter
      const [
        savedMode,
        savedFastSave,
        savedHotkey,
        savedHourlyStart,
        savedHourlyEnd,
        savedSilenceTimeout,
        savedOpenAtLogin,
        savedNotificationDisplayTime,
        savedCloudSyncEnabled,
        savedCloudSyncUserId,
        savedCloudSyncEncryptionKey,
        savedTimeFormat,
        savedPriorityDndBypass,
      ] = await Promise.all([
        settingsAdapter.getSetting('parserMode'),
        settingsAdapter.getSetting('fastSave'),
        isElectron() ? settingsAdapter.getSetting('quickAddHotkey') : Promise.resolve(null),
        settingsAdapter.getSetting('hourlyReminderStartTime'),
        settingsAdapter.getSetting('hourlyReminderEndTime'),
        settingsAdapter.getSetting('silenceTimeoutMs'),
        isElectron() ? settingsAdapter.getSetting('openAtLogin') : Promise.resolve(null),
        settingsAdapter.getSetting('notificationDisplayTimeSeconds'),
        settingsAdapter.getSetting('cloudSyncEnabled'),
        settingsAdapter.getSetting('cloudSyncUserId'),
        settingsAdapter.getSetting('cloudSyncEncryptionKeyBase64'),
        settingsAdapter.getSetting('timeFormat'),
        settingsAdapter.getSetting('priorityDndBypass'),
      ])

      if (savedMode) {
        parserMode.value = savedMode
      }
      if (savedFastSave) {
        fastSave.value = savedFastSave === 'true'
      }
      if (savedHotkey) {
        quickAddHotkey.value = savedHotkey
      }
      if (savedHourlyStart) {
        hourlyReminderStartTime.value = savedHourlyStart
      }
      if (savedHourlyEnd) {
        hourlyReminderEndTime.value = savedHourlyEnd
      }
      if (savedSilenceTimeout) {
        const parsed = parseInt(savedSilenceTimeout, 10)
        if (!isNaN(parsed) && parsed > 0) {
          silenceTimeoutMs.value = parsed
        }
      }
      if (savedOpenAtLogin !== null) {
        openAtLogin.value = savedOpenAtLogin === 'true'
      }
      if (savedNotificationDisplayTime) {
        const parsed = parseInt(savedNotificationDisplayTime, 10)
        if (!isNaN(parsed) && parsed > 0) {
          notificationDisplayTimeSeconds.value = parsed
        }
      }
      if (savedCloudSyncEnabled) {
        cloudSyncEnabled.value = savedCloudSyncEnabled === 'true'
      }
      if (savedCloudSyncUserId) {
        cloudSyncUserId.value = savedCloudSyncUserId
      }
      if (savedCloudSyncEncryptionKey) {
        cloudSyncEncryptionKeyBase64.value = savedCloudSyncEncryptionKey
      }

      if (savedTimeFormat) {
        timeFormat.value = savedTimeFormat as '12h' | '24h'
      } else {
        const defaultFormat = language.value === 'en' ? '12h' : '24h'
        timeFormat.value = defaultFormat
        await settingsAdapter.setSetting('timeFormat', defaultFormat)
      }

      if (savedPriorityDndBypass) {
        priorityDndBypass.value = savedPriorityDndBypass === 'true'
      }
    } catch (err) {
      console.error('Failed to initialize settings:', err)
      error.value = 'Failed to load settings'
    } finally {
      isLoading.value = false
    }
  }

  async function setLanguage(locale: SupportedLocale): Promise<void> {
    if (!isSupportedLocale(locale)) {
      console.warn(`Invalid locale: ${locale}`)
      return
    }

    language.value = locale
    saveLanguage(locale)
  }

  async function setParserMode(mode: ParserMode): Promise<void> {
    if (mode !== 'llm' && mode !== 'local') {
      console.warn(`Invalid parser mode: ${mode}`)
      return
    }

    parserMode.value = mode

    try {
      await settingsAdapter.setSetting('parserMode', mode)
    } catch (err) {
      console.error('Failed to save parser mode:', err)
      error.value = 'Failed to save parser mode'
    }
  }

  async function toggleParserMode(): Promise<void> {
    const newMode = parserMode.value === 'llm' ? 'local' : 'llm'
    await setParserMode(newMode)
  }

  async function setFastSave(enabled: boolean): Promise<void> {
    fastSave.value = enabled

    try {
      await settingsAdapter.setSetting('fastSave', enabled ? 'true' : 'false')
    } catch (err) {
      console.error('Failed to save fastSave setting:', err)
      error.value = 'Failed to save fast-save setting'
    }
  }

  function setCerebrasApiKey(key: string): void {
    cerebrasApiKey.value = key
  }

  async function setQuickAddHotkey(hotkey: string): Promise<void> {
    if (!isElectron()) return

    quickAddHotkey.value = hotkey

    try {
      await settingsAdapter.setSetting('quickAddHotkey', hotkey)
    } catch (err) {
      console.error('Failed to save quickAddHotkey setting:', err)
      error.value = 'Failed to save hotkey'
    }
  }

  async function setHourlyReminderStartTime(value: string): Promise<void> {
    hourlyReminderStartTime.value = value
    try {
      await settingsAdapter.setSetting('hourlyReminderStartTime', value)
    } catch (err) {
      console.error('Failed to save hourlyReminderStartTime:', err)
      error.value = 'Failed to save hourly reminder start time'
    }
  }

  async function setHourlyReminderEndTime(value: string): Promise<void> {
    hourlyReminderEndTime.value = value
    try {
      await settingsAdapter.setSetting('hourlyReminderEndTime', value)
    } catch (err) {
      console.error('Failed to save hourlyReminderEndTime:', err)
      error.value = 'Failed to save hourly reminder end time'
    }
  }

  async function setSilenceTimeoutMs(value: number): Promise<void> {
    const clamped = Math.max(500, Math.min(10000, Math.round(value)))
    silenceTimeoutMs.value = clamped
    try {
      await settingsAdapter.setSetting('silenceTimeoutMs', String(clamped))
    } catch (err) {
      console.error('Failed to save silenceTimeoutMs:', err)
      error.value = 'Failed to save silence timeout'
    }
  }

  async function setOpenAtLogin(enabled: boolean): Promise<void> {
    if (!isElectron()) return

    openAtLogin.value = enabled
    try {
      await settingsAdapter.setSetting('openAtLogin', enabled ? 'true' : 'false')
    } catch (err) {
      console.error('Failed to save openAtLogin setting:', err)
      error.value = 'Failed to save open at login'
    }
  }

  async function setNotificationDisplayTimeSeconds(value: number): Promise<void> {
    const clamped = Math.max(5, Math.min(3600, Math.round(value)))
    notificationDisplayTimeSeconds.value = clamped
    try {
      await settingsAdapter.setSetting('notificationDisplayTimeSeconds', String(clamped))
    } catch (err) {
      console.error('Failed to save notificationDisplayTimeSeconds:', err)
      error.value = 'Failed to save notification display time'
    }
  }

  async function setCloudSyncEnabled(enabled: boolean): Promise<void> {
    cloudSyncEnabled.value = enabled
    try {
      await settingsAdapter.setSetting('cloudSyncEnabled', enabled ? 'true' : 'false')
    } catch (err) {
      console.error('Failed to save cloudSyncEnabled:', err)
      error.value = 'Failed to save cloud sync setting'
    }
  }

  async function setCloudSyncUserId(userId: string): Promise<void> {
    cloudSyncUserId.value = userId
    try {
      await settingsAdapter.setSetting('cloudSyncUserId', userId)
    } catch (err) {
      console.error('Failed to save cloudSyncUserId:', err)
      error.value = 'Failed to save cloud user ID'
    }
  }

  async function setCloudSyncEncryptionKeyBase64(key: string): Promise<void> {
    cloudSyncEncryptionKeyBase64.value = key
    try {
      await settingsAdapter.setSetting('cloudSyncEncryptionKeyBase64', key)
    } catch (err) {
      console.error('Failed to save cloudSyncEncryptionKeyBase64:', err)
      error.value = 'Failed to save cloud encryption key'
    }
  }

  async function setTimeFormat(format: '12h' | '24h'): Promise<void> {
    timeFormat.value = format
    try {
      await settingsAdapter.setSetting('timeFormat', format)
    } catch (err) {
      console.error('Failed to save timeFormat:', err)
      error.value = 'Failed to save time format'
    }
  }

  async function setPriorityDndBypass(enabled: boolean): Promise<void> {
    priorityDndBypass.value = enabled
    try {
      await settingsAdapter.setSetting('priorityDndBypass', enabled ? 'true' : 'false')
    } catch (err) {
      console.error('Failed to save priorityDndBypass:', err)
      error.value = 'Failed to save priority DnD bypass setting'
    }
  }

  async function resetToDefaults(): Promise<void> {
    isLoading.value = true
    error.value = null
    try {
      await settingsAdapter.clearAllSettings()
      clearSavedLanguage()

      // Also reset state variables directly to default in case initialize skips missing keys
      language.value = detectLanguage()
      parserMode.value = 'local'
      fastSave.value = false
      quickAddHotkey.value = 'CommandOrControl+Shift+Space'
      hourlyReminderStartTime.value = DEFAULT_HOURLY_WINDOW_START
      hourlyReminderEndTime.value = DEFAULT_HOURLY_WINDOW_END
      silenceTimeoutMs.value = DEFAULT_SILENCE_TIMEOUT_MS
      openAtLogin.value = false
      notificationDisplayTimeSeconds.value = 60
      cloudSyncEnabled.value = false
      cloudSyncUserId.value = ''
      cloudSyncEncryptionKeyBase64.value = ''
      timeFormat.value = language.value === 'en' ? '12h' : '24h'
      priorityDndBypass.value = false

      // Attempt reading to ensure clean state
      await initialize()

      // Unregister hotkey or apply defaults in electron
      if (isElectron()) {
        await setQuickAddHotkey('CommandOrControl+Shift+Space')
        await setOpenAtLogin(false)
      }
    } catch (err) {
      console.error('Failed to reset settings:', err)
      error.value = 'Failed to reset settings'
    } finally {
      isLoading.value = false
    }
  }

  return {
    // State
    language,
    parserMode,
    cerebrasApiKey,
    fastSave,
    quickAddHotkey,
    hourlyReminderStartTime,
    hourlyReminderEndTime,
    silenceTimeoutMs,
    openAtLogin,
    notificationDisplayTimeSeconds,
    cloudSyncEnabled,
    cloudSyncUserId,
    cloudSyncEncryptionKeyBase64,
    timeFormat,
    priorityDndBypass,
    isLoading,
    error,

    // Getters
    isAIParsingEnabled,
    languageLabel,

    // Actions
    initialize,
    setLanguage,
    setParserMode,
    toggleParserMode,
    setFastSave,
    setCerebrasApiKey,
    setQuickAddHotkey,
    setHourlyReminderStartTime,
    setHourlyReminderEndTime,
    setSilenceTimeoutMs,
    setOpenAtLogin,
    setNotificationDisplayTimeSeconds,
    setCloudSyncEnabled,
    setCloudSyncUserId,
    setCloudSyncEncryptionKeyBase64,
    setTimeFormat,
    setPriorityDndBypass,
    resetToDefaults,
  }
})
