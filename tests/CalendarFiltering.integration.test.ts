import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import HomePage from '../src/views/HomePage.vue'
import { useReminderStore } from '../src/stores/reminder'
import {
  ReminderStatus,
  ReminderLanguage,
  ReminderSource,
  ReminderParserMode,
} from '../src/types/reminder'

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}))

vi.mock('../src/services/reminderAdapter', () => ({
  reminderAdapter: {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  },
}))

vi.mock('../src/services/settingsAdapter', () => ({
  settingsAdapter: {
    getSetting: vi.fn().mockResolvedValue(null),
    setSetting: vi.fn().mockResolvedValue(undefined),
  },
}))

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      app: { title: 'Mai' },
      reminder: {
        status: {
          filterByStatus: 'Filter by status',
          pending: 'Pending',
          sent: 'Sent',
          cancelled: 'Cancelled',
        },
      },
    },
  },
})

describe('Calendar Filtering Integration', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })

  const stubs = {
    'ion-page': { template: '<div><slot /></div>' },
    'ion-header': { template: '<div><slot /></div>' },
    'ion-toolbar': { template: '<div><slot /></div>' },
    'ion-title': { template: '<h1><slot /></h1>' },
    'ion-content': { template: '<div><slot /></div>' },
    'ion-footer': { template: '<div><slot /></div>' },
    'ion-buttons': { template: '<div><slot /></div>' },
    'ion-button': { template: '<button><slot /></button>' },
    'ion-icon': true,
    'ion-segment': {
      props: ['modelValue'],
      template: '<div class="ion-segment"><slot /></div>',
      emits: ['update:modelValue'],
    },
    'ion-segment-button': {
      props: ['value'],
      template:
        '<button class="ion-segment-button" @click="$parent.$emit(\'update:modelValue\', value)"><slot /></button>',
    },
    'ion-label': { template: '<span><slot /></span>' },
    'view-toggle': {
      props: ['modelValue'],
      template:
        '<div class="view-toggle"><button @click="$emit(\'update:modelValue\', \'calendar\')">Calendar</button></div>',
    },
    'calendar-grid': {
      props: ['reminders'],
      template:
        '<div class="calendar-grid" data-test="calendar-grid">Dots: {{ reminders.length }}</div>',
    },
    'quick-add-input': true,
    'confirmation-modal': true,
    'error-notification': true,
    'reminder-list': true,
  }

  it('filters calendar dots based on selected status', async () => {
    const store = useReminderStore()

    // Add two reminders with different statuses
    const reminder1 = {
      id: '1',
      title: 'Pending Reminder',
      originalText: 'pending',
      language: ReminderLanguage.EN,
      scheduledAt: new Date('2030-01-01T10:00:00.000Z'),
      source: ReminderSource.TEXT,
      parserMode: ReminderParserMode.LOCAL,
      status: ReminderStatus.PENDING,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    const reminder2 = {
      id: '2',
      title: 'Sent Reminder',
      originalText: 'sent',
      language: ReminderLanguage.EN,
      scheduledAt: new Date('2030-01-02T10:00:00.000Z'),
      source: ReminderSource.TEXT,
      parserMode: ReminderParserMode.LOCAL,
      status: ReminderStatus.SENT,
      createdAt: new Date(),
      updatedAt: new Date(),
    }

    store.setReminders([reminder1, reminder2])
    store.filterStatus = ReminderStatus.PENDING

    const wrapper = mount(HomePage, {
      global: {
        plugins: [i18n],
        stubs,
      },
    })

    // Switch to calendar view
    await wrapper.find('.view-toggle button').trigger('click')

    // Check if calendar grid has only 1 reminder (the pending one)
    const calendarGrid = wrapper.find('[data-test="calendar-grid"]')
    expect(calendarGrid.text()).toContain('Dots: 1')

    // Switch to 'Sent' status
    // Note: store.filterStatus is bound to ion-segment v-model
    store.filterStatus = ReminderStatus.SENT
    await wrapper.vm.$nextTick()

    expect(calendarGrid.text()).toContain('Dots: 1')
  })
})
