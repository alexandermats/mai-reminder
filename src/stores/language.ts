import { ref, computed } from 'vue'
import { defineStore } from 'pinia'
import type { SupportedLocale } from '../plugins/i18n'
import { saveLanguage, detectLanguage, loadSavedLanguage } from '../plugins/i18n'

export const useLanguageStore = defineStore('language', () => {
  // State
  const currentLocale = ref<SupportedLocale>(loadSavedLanguage())

  // Getters
  const isEnglish = computed(() => currentLocale.value === 'en')
  const isRussian = computed(() => currentLocale.value === 'ru')

  // Actions
  function setLocale(locale: SupportedLocale) {
    currentLocale.value = locale
    saveLanguage(locale)
  }

  function toggleLocale() {
    const newLocale = currentLocale.value === 'en' ? 'ru' : 'en'
    setLocale(newLocale)
  }

  function resetToSystemLocale() {
    setLocale(detectLanguage())
  }

  return {
    currentLocale,
    isEnglish,
    isRussian,
    setLocale,
    toggleLocale,
    resetToSystemLocale,
  }
})
