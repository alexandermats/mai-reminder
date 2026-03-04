import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { Pinia, createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import ReminderList from '../src/components/ReminderList.vue'
import { useReminderStore } from '../src/stores/reminder'
import {
  ReminderLanguage,
  ReminderSource,
  ReminderParserMode,
  ReminderStatus,
} from '../src/types/reminder'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      reminder: {
        noReminders: 'No reminders yet',
        recurring: 'Recurring',
        repeatsEvery: {
          mo: 'Repeats every Monday',
          tu: 'Repeats every Tuesday',
          we: 'Repeats every Wednesday',
          th: 'Repeats every Thursday',
          fr: 'Repeats every Friday',
          sa: 'Repeats every Saturday',
          su: 'Repeats every Sunday',
        },
        repeatsWeeklyOnDays: 'Repeats weekly on {days}',
        repeatsEveryNHours: 'Repeats every {count} hours',
        weekdays: {
          mo: 'Monday',
        },
      },
    },
  },
})

describe('ReminderList.vue (E3-01)', () => {
  let pinia: Pinia

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
  })

  const commonStubs = {
    'ion-list': { template: '<div><slot /></div>' },
    'ion-item': { template: '<div><slot /><slot name="end" /></div>' },
    'ion-label': { template: '<div><slot /></div>' },
    'ion-note': { template: '<div><slot /></div>' },
    'ion-item-sliding': { template: '<div><slot /></div>' },
    'ion-item-options': { template: '<div><slot /></div>' },
    'ion-item-option': { template: '<div><slot /></div>' },
    'ion-icon': true,
    'ion-button': { template: '<button><slot /></button>' },
  }

  it('renders "No reminders yet" message when list is empty', () => {
    const store = useReminderStore()
    store.reminders = []

    const wrapper = mount(ReminderList, {
      global: {
        plugins: [pinia, i18n],
        stubs: commonStubs,
      },
    })

    expect(wrapper.text()).toContain('No reminders yet')
  })

  it('renders a list of reminders when data is present', () => {
    const store = useReminderStore()
    store.reminders = [
      {
        id: '1',
        title: 'Meeting with team',
        originalText: 'meeting tomorrow',
        language: ReminderLanguage.EN,
        scheduledAt: new Date(Date.now() + 3600000),
        source: ReminderSource.TEXT,
        parserMode: ReminderParserMode.LOCAL,
        status: ReminderStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
      {
        id: '2',
        title: 'Call doctor',
        originalText: 'call doctor at 5pm',
        language: ReminderLanguage.EN,
        scheduledAt: new Date(Date.now() + 7200000),
        source: ReminderSource.TEXT,
        parserMode: ReminderParserMode.LLM,
        status: ReminderStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]

    const wrapper = mount(ReminderList, {
      global: {
        plugins: [pinia, i18n],
        stubs: commonStubs,
      },
    })

    expect(wrapper.text()).toContain('Meeting with team')
    expect(wrapper.text()).toContain('Call doctor')
  })

  it('shows a recurring indicator for recurring reminders', () => {
    const store = useReminderStore()
    store.reminders = [
      {
        id: '1',
        title: 'Weekly team sync',
        originalText: 'team sync every monday',
        language: ReminderLanguage.EN,
        scheduledAt: new Date(Date.now() + 3600000),
        source: ReminderSource.TEXT,
        parserMode: ReminderParserMode.LLM,
        status: ReminderStatus.PENDING,
        recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO',
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]

    const wrapper = mount(ReminderList, {
      global: {
        plugins: [pinia, i18n],
        stubs: commonStubs,
      },
    })

    expect(wrapper.find('[data-test="recurring-indicator"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="recurring-indicator"]').text()).toContain(
      'Repeats every Monday'
    )
  })

  it('emits edit event when static edit button is clicked', async () => {
    const store = useReminderStore()
    store.reminders = [
      {
        id: '1',
        title: 'Meeting with team',
        originalText: 'meeting tomorrow',
        language: ReminderLanguage.EN,
        scheduledAt: new Date(),
        source: ReminderSource.TEXT,
        parserMode: ReminderParserMode.LOCAL,
        status: ReminderStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]

    const wrapper = mount(ReminderList, {
      global: {
        plugins: [pinia, i18n],
        stubs: commonStubs,
      },
    })

    const editBtn = wrapper.find('[data-test="static-edit-btn"]')
    await editBtn.trigger('click')

    expect(wrapper.emitted('edit')).toBeTruthy()
    expect(wrapper.emitted('edit')![0][0]).toEqual(store.reminders[0])
  })

  it('emits cancel event when static delete button is clicked', async () => {
    const store = useReminderStore()
    store.reminders = [
      {
        id: '1',
        title: 'Meeting with team',
        originalText: 'meeting tomorrow',
        language: ReminderLanguage.EN,
        scheduledAt: new Date(),
        source: ReminderSource.TEXT,
        parserMode: ReminderParserMode.LOCAL,
        status: ReminderStatus.PENDING,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]

    const wrapper = mount(ReminderList, {
      global: {
        plugins: [pinia, i18n],
        stubs: commonStubs,
      },
    })

    const deleteBtn = wrapper.find('[data-test="static-delete-btn"]')
    await deleteBtn.trigger('click')

    expect(wrapper.emitted('cancel')).toBeTruthy()
    expect(wrapper.emitted('cancel')![0][0]).toEqual(store.reminders[0])
  })

  it('hides cancel button when filter status is SENT', async () => {
    const store = useReminderStore()
    store.filterStatus = ReminderStatus.SENT
    store.reminders = [
      {
        id: '1',
        title: 'Meeting with team',
        originalText: 'meeting tomorrow',
        language: ReminderLanguage.EN,
        scheduledAt: new Date(),
        source: ReminderSource.TEXT,
        parserMode: ReminderParserMode.LOCAL,
        status: ReminderStatus.SENT,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]

    const wrapper = mount(ReminderList, {
      global: {
        plugins: [pinia, i18n],
        stubs: commonStubs,
      },
    })

    const deleteBtn = wrapper.find('[data-test="static-delete-btn"]')
    expect(deleteBtn.exists()).toBe(false)
  })

  it('hides cancel button when filter status is CANCELLED', async () => {
    const store = useReminderStore()
    store.filterStatus = ReminderStatus.CANCELLED
    store.reminders = [
      {
        id: '1',
        title: 'Meeting with team',
        originalText: 'meeting tomorrow',
        language: ReminderLanguage.EN,
        scheduledAt: new Date(),
        source: ReminderSource.TEXT,
        parserMode: ReminderParserMode.LOCAL,
        status: ReminderStatus.CANCELLED,
        createdAt: new Date(),
        updatedAt: new Date(),
      },
    ]

    const wrapper = mount(ReminderList, {
      global: {
        plugins: [pinia, i18n],
        stubs: commonStubs,
      },
    })

    const deleteBtn = wrapper.find('[data-test="static-delete-btn"]')
    expect(deleteBtn.exists()).toBe(false)
  })
})
