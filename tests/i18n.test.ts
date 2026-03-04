import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import { createI18nInstance } from '../src/plugins/i18n'
import en from '../src/locales/en.json'
import ru from '../src/locales/ru.json'

// Mock localStorage for tests
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
  key: vi.fn(),
  length: 0,
}

Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
  writable: true,
})

describe('i18n', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    localStorageMock.getItem.mockReturnValue(null)
  })

  it('exports en and ru locale files with required keys', () => {
    expect(en).toHaveProperty('app.title')
    expect(en).toHaveProperty('app.addReminder')
    expect(ru).toHaveProperty('app.title')
    expect(ru).toHaveProperty('app.addReminder')
  })

  it('creates i18n instance with correct locale', () => {
    const i18n = createI18n({
      legacy: false,
      locale: 'en',
      fallbackLocale: 'en',
      messages: { en, ru },
    })

    expect(i18n.global.locale.value).toBe('en')
  })

  it('translates keys correctly for English', () => {
    const i18n = createI18n({
      legacy: false,
      locale: 'en',
      messages: { en, ru },
    })

    expect(i18n.global.t('app.title')).toBe(en.app.title)
  })

  it('translates keys correctly for Russian', () => {
    const i18n = createI18n({
      legacy: false,
      locale: 'ru',
      messages: { en, ru },
    })

    expect(i18n.global.t('app.title')).toBe(ru.app.title)
  })

  it('falls back to English for missing Russian keys', () => {
    const incompleteRu = { app: { title: 'Напоминания' } }
    const i18n = createI18n({
      legacy: false,
      locale: 'ru',
      fallbackLocale: 'en',
      messages: { en, ru: incompleteRu },
    })

    // Should fall back to English for missing key
    expect(i18n.global.t('app.addReminder')).toBe(en.app.addReminder)
  })
})

describe('Language detection', () => {
  it('detects browser language', () => {
    Object.defineProperty(window.navigator, 'language', {
      value: 'ru-RU',
      configurable: true,
    })

    const detectLanguage = (): 'en' | 'ru' => {
      const lang = navigator.language.toLowerCase()
      if (lang.startsWith('ru')) return 'ru'
      return 'en'
    }

    expect(detectLanguage()).toBe('ru')
  })

  it('defaults to English for unsupported languages', () => {
    Object.defineProperty(window.navigator, 'language', {
      value: 'fr-FR',
      configurable: true,
    })

    const detectLanguage = (): 'en' | 'ru' => {
      const lang = navigator.language.toLowerCase()
      if (lang.startsWith('ru')) return 'ru'
      return 'en'
    }

    expect(detectLanguage()).toBe('en')
  })
})

describe('Language persistence', () => {
  it('saves language preference to localStorage', () => {
    const saveLanguage = (lang: 'en' | 'ru') => {
      localStorage.setItem('app-language', lang)
    }

    saveLanguage('ru')
    expect(localStorageMock.setItem).toHaveBeenCalledWith('app-language', 'ru')
  })

  it('loads saved language from localStorage', () => {
    localStorageMock.getItem.mockReturnValue('ru')

    const loadLanguage = (): 'en' | 'ru' => {
      const saved = localStorage.getItem('app-language')
      return saved === 'ru' ? 'ru' : 'en'
    }

    expect(loadLanguage()).toBe('ru')
  })
})

describe('Russian Pluralization rules', () => {
  it('correctly maps 1, 2-4, and 5+ counts', () => {
    const i18n = createI18nInstance()
    i18n.global.locale.value = 'ru'

    // Days
    expect(i18n.global.t('reminder.recurrencePickerEveryNDays', 1)).toBe('Каждый 1 день')
    expect(i18n.global.t('reminder.recurrencePickerEveryNDays', 2)).toBe('Каждые 2 дня')
    expect(i18n.global.t('reminder.recurrencePickerEveryNDays', 5)).toBe('Каждые 5 дней')
    expect(i18n.global.t('reminder.recurrencePickerEveryNDays', 11)).toBe('Каждые 11 дней')
    expect(i18n.global.t('reminder.recurrencePickerEveryNDays', 21)).toBe('Каждый 21 день')

    // Weeks
    expect(i18n.global.t('reminder.recurrencePickerEveryNWeeks', 1)).toBe('Каждую 1 неделю')
    expect(i18n.global.t('reminder.recurrencePickerEveryNWeeks', 3)).toBe('Каждые 3 недели')
    expect(i18n.global.t('reminder.recurrencePickerEveryNWeeks', 5)).toBe('Каждые 5 недель')

    // Months
    expect(i18n.global.t('reminder.repeatsEveryNMonths', 1)).toBe('Каждый 1 месяц')
    expect(i18n.global.t('reminder.repeatsEveryNMonths', 4)).toBe('Каждые 4 месяца')
    expect(i18n.global.t('reminder.repeatsEveryNMonths', 10)).toBe('Каждые 10 месяцев')
  })
})
