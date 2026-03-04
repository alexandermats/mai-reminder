import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { Pinia, createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import HomePage from '../src/views/HomePage.vue'
import ReminderList from '../src/components/ReminderList.vue'
import QuickAddInput from '../src/components/QuickAddInput.vue'

// Mock repository
vi.mock('../src/db/reminderRepository', () => ({
  reminderRepository: {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      app: { title: 'Mai' },
      reminder: {
        noReminders: 'No reminders yet',
        deleteConfirm: 'Cancel this reminder?',
      },
    },
  },
})

describe('HomePage.vue Integration (E3-04)', () => {
  let pinia: Pinia

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
  })

  const stubs = {
    'ion-page': { template: '<div><slot /></div>' },
    'ion-header': { template: '<div><slot /></div>' },
    'ion-toolbar': { template: '<div><slot /></div>' },
    'ion-title': { template: '<h1><slot /></h1>' },
    'ion-content': { template: '<div><slot /></div>' },
    'ion-fab': { template: '<div><slot /></div>' },
    'ion-fab-button': { template: '<button><slot /></button>' },
    'ion-icon': true,
    'reminder-list': { template: '<div class="reminder-list"></div>' },
    'quick-add-input': { template: '<div class="quick-add"></div>' },
    'confirmation-modal': { template: '<div class="modal"></div>' },
  }

  it('renders correctly with subcomponents', () => {
    const wrapper = mount(HomePage, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          ...stubs,
          ReminderList: true,
          QuickAddInput: true,
        },
      },
    })

    expect(wrapper.findComponent(ReminderList).exists()).toBe(true)
    expect(wrapper.findComponent(QuickAddInput).exists()).toBe(true)
  })
})
