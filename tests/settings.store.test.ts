import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { useSettingsStore } from '../src/stores/settings'

// Mock the settings adapter
const mockGetSetting = vi.fn()
const mockSetSetting = vi.fn()

vi.mock('../src/services/settingsAdapter', () => ({
  settingsAdapter: {
    getSetting: vi.fn((key) => mockGetSetting(key)),
    setSetting: vi.fn((key, value) => mockSetSetting(key, value)),
  },
}))

vi.mock('../src/utils/platform', () => ({
  isElectron: vi.fn(() => true),
}))

describe('Settings Store (E3-05)', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    vi.clearAllMocks()
  })

  // ── Initialization ─────────────────────────────────────────────────────────

  describe('initialization', () => {
    it('loads saved language preference on init', async () => {
      localStorage.setItem('app-language', 'ru')

      const store = useSettingsStore()
      await store.initialize()

      expect(store.language).toBe('ru')
    })

    it('loads saved parser mode from repository on init', async () => {
      mockGetSetting.mockResolvedValue('local')

      const store = useSettingsStore()
      await store.initialize()

      expect(store.parserMode).toBe('local')
      expect(mockGetSetting).toHaveBeenCalledWith('parserMode')
    })

    it('uses default values when nothing is saved', async () => {
      mockGetSetting.mockResolvedValue(null)

      const store = useSettingsStore()
      await store.initialize()

      expect(store.language).toBe('en')
      expect(store.parserMode).toBe('local')
      expect(store.cerebrasApiKey).toBe('')
    })

    it('does not load quickAddHotkey on non-electron platforms', async () => {
      const { isElectron } = await import('../src/utils/platform')
      vi.mocked(isElectron).mockReturnValue(false)
      mockGetSetting.mockResolvedValue(null)

      const store = useSettingsStore()
      await store.initialize()

      expect(mockGetSetting).toHaveBeenCalledWith('parserMode')
      expect(mockGetSetting).toHaveBeenCalledWith('fastSave')
      expect(mockGetSetting).not.toHaveBeenCalledWith('quickAddHotkey')
      expect(mockGetSetting).toHaveBeenCalledWith('hourlyReminderStartTime')
      expect(mockGetSetting).toHaveBeenCalledWith('hourlyReminderEndTime')
    })
  })

  // ── Language Settings ──────────────────────────────────────────────────────

  describe('setLanguage', () => {
    it('updates language state', async () => {
      const store = useSettingsStore()
      await store.initialize()

      await store.setLanguage('ru')

      expect(store.language).toBe('ru')
    })

    it('persists language to localStorage', async () => {
      const store = useSettingsStore()
      await store.initialize()

      await store.setLanguage('ru')

      expect(localStorage.getItem('app-language')).toBe('ru')
    })

    it('only accepts valid locales', async () => {
      const store = useSettingsStore()
      await store.initialize()

      // @ts-expect-error Testing invalid locale
      await store.setLanguage('fr')

      // Should still be 'en' (default)
      expect(store.language).toBe('en')
    })
  })

  // ── Parser Mode Settings ─────────────────────────────────────────────────

  describe('setParserMode', () => {
    it('updates parser mode state', async () => {
      mockGetSetting.mockResolvedValue('llm')
      const store = useSettingsStore()
      await store.initialize()

      await store.setParserMode('local')

      expect(store.parserMode).toBe('local')
    })

    it('persists parser mode to repository', async () => {
      mockGetSetting.mockResolvedValue('llm')
      const store = useSettingsStore()
      await store.initialize()

      await store.setParserMode('local')

      expect(mockSetSetting).toHaveBeenCalledWith('parserMode', 'local')
    })

    it('only accepts valid parser modes', async () => {
      mockGetSetting.mockResolvedValue(null)
      const store = useSettingsStore()
      await store.initialize()

      // @ts-expect-error Testing invalid mode
      await store.setParserMode('invalid')

      // Should still be 'local' (new default)
      expect(store.parserMode).toBe('local')
    })
  })

  // ── Cerebras API Key Settings ─────────────────────────────────────────────

  describe('setCerebrasApiKey', () => {
    it('updates cerebrasApiKey state', () => {
      const store = useSettingsStore()
      store.setCerebrasApiKey('test-key')
      expect(store.cerebrasApiKey).toBe('test-key')
    })
  })

  // ── UI Helper Getters ──────────────────────────────────────────────────────

  describe('isAIParsingEnabled', () => {
    it('returns true when parserMode is llm', async () => {
      mockGetSetting.mockResolvedValue('llm')
      const store = useSettingsStore()
      await store.initialize()

      expect(store.isAIParsingEnabled).toBe(true)
    })

    it('returns false when parserMode is local', async () => {
      mockGetSetting.mockResolvedValue('local')
      const store = useSettingsStore()
      await store.initialize()

      expect(store.isAIParsingEnabled).toBe(false)
    })
  })

  describe('languageLabel', () => {
    it('returns "English" for en locale', async () => {
      const store = useSettingsStore()
      await store.initialize()

      expect(store.languageLabel).toBe('English')
    })

    it('returns "Russian" for ru locale', async () => {
      const store = useSettingsStore()
      await store.initialize()
      await store.setLanguage('ru')

      expect(store.languageLabel).toBe('Russian')
    })
  })

  // ── Fast Save Settings ───────────────────────────────────────────────────

  describe('setFastSave', () => {
    it('updates fastSave state', async () => {
      const store = useSettingsStore()
      await store.initialize()

      await store.setFastSave(true)

      expect(store.fastSave).toBe(true)
    })

    it('persists fastSave to repository', async () => {
      const store = useSettingsStore()
      await store.initialize()

      await store.setFastSave(true)

      expect(mockSetSetting).toHaveBeenCalledWith('fastSave', 'true')
    })
  })

  describe('setQuickAddHotkey', () => {
    it('updates quickAddHotkey state', async () => {
      const { isElectron } = await import('../src/utils/platform')
      vi.mocked(isElectron).mockReturnValue(true)
      const store = useSettingsStore()
      await store.initialize()

      await store.setQuickAddHotkey('Command+K')

      expect(store.quickAddHotkey).toBe('Command+K')
    })

    it('persists quickAddHotkey to repository', async () => {
      const { isElectron } = await import('../src/utils/platform')
      vi.mocked(isElectron).mockReturnValue(true)
      const store = useSettingsStore()
      await store.initialize()

      await store.setQuickAddHotkey('Command+K')

      expect(mockSetSetting).toHaveBeenCalledWith('quickAddHotkey', 'Command+K')
    })

    it('does not persist or update if on capacitor native', async () => {
      const { isElectron } = await import('../src/utils/platform')
      vi.mocked(isElectron).mockReturnValue(false)

      const store = useSettingsStore()
      await store.initialize()
      const originalHotkey = store.quickAddHotkey

      await store.setQuickAddHotkey('Command+K')

      expect(store.quickAddHotkey).toBe(originalHotkey)
      expect(mockSetSetting).not.toHaveBeenCalledWith('quickAddHotkey', 'Command+K')
    })
  })

  describe('hourly recurrence window', () => {
    it('loads hourly recurrence window settings on init', async () => {
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === 'hourlyReminderStartTime') return '08:00'
        if (key === 'hourlyReminderEndTime') return '21:00'
        return null
      })

      const store = useSettingsStore()
      await store.initialize()

      expect(store.hourlyReminderStartTime).toBe('08:00')
      expect(store.hourlyReminderEndTime).toBe('21:00')
    })

    it('persists hourlyReminderStartTime', async () => {
      const store = useSettingsStore()
      await store.initialize()

      await store.setHourlyReminderStartTime('08:30')
      expect(mockSetSetting).toHaveBeenCalledWith('hourlyReminderStartTime', '08:30')
    })

    it('persists hourlyReminderEndTime', async () => {
      const store = useSettingsStore()
      await store.initialize()

      await store.setHourlyReminderEndTime('20:45')
      expect(mockSetSetting).toHaveBeenCalledWith('hourlyReminderEndTime', '20:45')
    })
  })

  // ── Time Format Settings ───────────────────────────────────────────────────

  describe('timeFormat initialization', () => {
    it('initializes to 12h for English when no setting is stored', async () => {
      mockGetSetting.mockResolvedValue(null)
      localStorage.setItem('app-language', 'en')

      const store = useSettingsStore()
      await store.initialize()

      expect(store.timeFormat).toBe('12h')
      expect(mockSetSetting).toHaveBeenCalledWith('timeFormat', '12h')
    })

    it('initializes to 24h for Russian when no setting is stored', async () => {
      mockGetSetting.mockResolvedValue(null)
      localStorage.setItem('app-language', 'ru')

      const store = useSettingsStore()
      await store.initialize()

      expect(store.timeFormat).toBe('24h')
      expect(mockSetSetting).toHaveBeenCalledWith('timeFormat', '24h')
    })

    it('loads stored timeFormat regardless of language', async () => {
      mockGetSetting.mockImplementation(async (key: string) => {
        if (key === 'timeFormat') return '24h'
        return null
      })
      localStorage.setItem('app-language', 'en')

      const store = useSettingsStore()
      await store.initialize()

      expect(store.timeFormat).toBe('24h')
    })
  })

  describe('setTimeFormat', () => {
    it('updates timeFormat state', async () => {
      const store = useSettingsStore()
      await store.initialize()

      await store.setTimeFormat('12h')
      expect(store.timeFormat).toBe('12h')
    })

    it('persists timeFormat to repository', async () => {
      const store = useSettingsStore()
      await store.initialize()

      await store.setTimeFormat('12h')
      expect(mockSetSetting).toHaveBeenCalledWith('timeFormat', '12h')
    })
  })
})
