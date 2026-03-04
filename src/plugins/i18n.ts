import { createI18n } from 'vue-i18n'
import en from '../locales/en.json'
import ru from '../locales/ru.json'

export type SupportedLocale = 'en' | 'ru'

export const messages = {
  en,
  ru,
}

/**
 * Type guard to check if a string is a supported locale
 */
export function isSupportedLocale(value: string): value is SupportedLocale {
  return value === 'en' || value === 'ru'
}

/**
 * Detect browser/system language
 * Returns 'ru' for Russian variants, 'en' for everything else
 */
export function detectLanguage(): SupportedLocale {
  if (typeof navigator === 'undefined') return 'en'

  const lang = navigator.language?.toLowerCase() ?? ''
  if (lang.startsWith('ru')) return 'ru'
  return 'en'
}

/**
 * Load saved language preference from localStorage
 * Falls back to browser detection if none saved
 */
export function loadSavedLanguage(): SupportedLocale {
  if (typeof localStorage === 'undefined') return detectLanguage()

  const saved = localStorage.getItem('app-language')
  if (saved && isSupportedLocale(saved)) return saved
  return detectLanguage()
}

/**
 * Save language preference to localStorage
 */
export function saveLanguage(lang: SupportedLocale): void {
  if (typeof localStorage === 'undefined') return
  localStorage.setItem('app-language', lang)
}

/**
 * Clear saved language preference from localStorage
 */
export function clearSavedLanguage(): void {
  if (typeof localStorage === 'undefined') return
  localStorage.removeItem('app-language')
}

/**
 * Create i18n instance with current settings
 */
export function createI18nInstance() {
  const locale = loadSavedLanguage()

  return createI18n({
    legacy: false,
    locale,
    fallbackLocale: 'en',
    messages,
    globalInjection: true,
    pluralRules: {
      ru: function (choice: number, choicesLength: number) {
        if (choice === 0) return 0

        const teen = choice > 10 && choice < 20
        const endsWithOne = choice % 10 === 1

        if (choicesLength < 4) {
          return !teen && endsWithOne
            ? 0
            : !teen && choice % 10 >= 2 && choice % 10 <= 4
              ? 1
              : choicesLength < 4
                ? 2
                : 3
        }

        return !teen && endsWithOne ? 0 : !teen && choice % 10 >= 2 && choice % 10 <= 4 ? 1 : 2
      },
    },
  })
}

export const i18n = createI18nInstance()
