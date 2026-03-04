import { describe, it, expect } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import { IonToast } from '@ionic/vue'
import ErrorNotification from '../src/components/ErrorNotification.vue'
import type { AppNotification } from '../src/composables/useNotifications'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      errors: {
        offline: "You're offline. Using local parser.",
        rateLimit: 'AI parsing temporarily unavailable. Using local parser.',
        parseFailure: "Couldn't understand that. Try rephrasing with a specific time.",
        general: 'Something went wrong. Retry or contact support.',
      },
    },
  },
})

describe('ErrorNotification.vue (E3-06)', () => {
  const commonStubs = {
    'ion-toast': true,
  }

  function createNotification(type: AppNotification['type'], messageKey: string): AppNotification {
    return {
      id: Math.random().toString(),
      type,
      messageKey,
      duration: 5000,
    }
  }

  it('renders correctly for offline error', () => {
    const notification = createNotification('offline', 'errors.offline')
    const wrapper = mount(ErrorNotification, {
      props: { notification },
      global: { plugins: [i18n], stubs: commonStubs },
    })

    const toast = wrapper.findComponent(IonToast)
    expect(toast.exists()).toBe(true)
    expect(toast.attributes('message')).toBe("You're offline. Using local parser.")
    expect(toast.attributes('color')).toBe('warning') // Offline uses warning color
  })

  it('renders correctly for rate-limit error', () => {
    const notification = createNotification('rate-limit', 'errors.rateLimit')
    const wrapper = mount(ErrorNotification, {
      props: { notification },
      global: { plugins: [i18n], stubs: commonStubs },
    })

    const toast = wrapper.findComponent(IonToast)
    expect(toast.attributes('message')).toBe(
      'AI parsing temporarily unavailable. Using local parser.'
    )
    expect(toast.attributes('color')).toBe('warning')
  })

  it('renders correctly for parse-failure error', () => {
    const notification = createNotification('parse-failure', 'errors.parseFailure')
    const wrapper = mount(ErrorNotification, {
      props: { notification },
      global: { plugins: [i18n], stubs: commonStubs },
    })

    const toast = wrapper.findComponent(IonToast)
    expect(toast.attributes('message')).toBe(
      "Couldn't understand that. Try rephrasing with a specific time."
    )
    expect(toast.attributes('color')).toBe('medium')
  })

  it('renders correctly for general error', () => {
    const notification = createNotification('general', 'errors.general')
    const wrapper = mount(ErrorNotification, {
      props: { notification },
      global: { plugins: [i18n], stubs: commonStubs },
    })

    const toast = wrapper.findComponent(IonToast)
    expect(toast.attributes('message')).toBe('Something went wrong. Retry or contact support.')
    expect(toast.attributes('color')).toBe('danger')
  })

  it('emits dismiss when ion-toast did-dismiss is triggered', async () => {
    const notification = createNotification('general', 'errors.general')
    const wrapper = mount(ErrorNotification, {
      props: { notification },
      global: { plugins: [i18n], stubs: commonStubs },
    })

    await wrapper.findComponent(IonToast).trigger('did-dismiss')

    expect(wrapper.emitted('dismiss')).toBeTruthy()
    expect(wrapper.emitted('dismiss')![0]).toEqual([notification.id])
  })
})
