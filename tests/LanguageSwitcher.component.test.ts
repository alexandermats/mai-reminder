import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import { defineComponent, h } from 'vue'
import { useLanguageStore } from '../src/stores/language'
import en from '../src/locales/en.json'
import ru from '../src/locales/ru.json'

// Simple language switcher component for testing
const LanguageSwitcher = defineComponent({
  setup() {
    const store = useLanguageStore()
    const { t, locale } = createI18n({
      legacy: false,
      locale: store.currentLocale,
      messages: { en, ru },
    }).global

    const switchLang = () => {
      store.toggleLocale()
      locale.value = store.currentLocale
    }

    return { t, locale, store, switchLang }
  },
  render() {
    return h('div', [
      h('span', { class: 'title' }, this.t('app.title')),
      h('span', { class: 'current-lang' }, this.locale),
      h('button', { class: 'switch-btn', onClick: this.switchLang }, 'Switch'),
    ])
  },
})

describe('Language Switcher Component', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
  })

  it('renders with default English locale', () => {
    const wrapper = mount(LanguageSwitcher)

    expect(wrapper.find('.current-lang').text()).toBe('en')
    expect(wrapper.find('.title').text()).toBe(en.app.title)
  })

  it('switches language when button clicked', async () => {
    const wrapper = mount(LanguageSwitcher)
    const store = useLanguageStore()

    expect(store.currentLocale).toBe('en')

    await wrapper.find('.switch-btn').trigger('click')

    expect(store.currentLocale).toBe('ru')
    expect(localStorage.getItem('app-language')).toBe('ru')
  })

  it('persists language preference in localStorage', async () => {
    // Set initial language to Russian
    localStorage.setItem('app-language', 'ru')

    // Create new pinia and mount
    const pinia = createPinia()
    setActivePinia(pinia)

    const wrapper = mount(LanguageSwitcher)
    const store = useLanguageStore()

    expect(store.currentLocale).toBe('ru')
    expect(wrapper.find('.current-lang').text()).toBe('ru')
  })
})
