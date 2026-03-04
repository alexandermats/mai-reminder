import { mount } from '@vue/test-utils'
import { describe, it, expect, vi } from 'vitest'
import { createI18n } from 'vue-i18n'
import CalendarGrid from '../../src/components/CalendarGrid.vue'
import {
  ReminderLanguage,
  ReminderParserMode,
  ReminderSource,
  ReminderStatus,
  type Reminder,
} from '../../src/types/reminder'

// v-calendar depends on popper.js which throws errors in JSDOM sometimes
window.matchMedia = vi.fn().mockImplementation((query) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener: vi.fn(),
  removeListener: vi.fn(),
  addEventListener: vi.fn(),
  removeEventListener: vi.fn(),
  dispatchEvent: vi.fn(),
}))

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      reminder: {
        hasReminders: 'Has reminders',
      },
    },
  },
})

describe('CalendarGrid.vue', () => {
  const dummyReminder: Reminder = {
    id: '1',
    title: 'Test',
    originalText: 'Test',
    createdAt: new Date(),
    updatedAt: new Date(),
    scheduledAt: new Date('2030-01-01T12:00:00Z'),
    language: ReminderLanguage.EN,
    source: ReminderSource.TEXT,
    parserMode: ReminderParserMode.LOCAL,
    status: ReminderStatus.PENDING,
  }

  it('renders without errors', () => {
    const wrapper = mount(CalendarGrid, {
      global: {
        plugins: [i18n],
      },
      props: {
        reminders: [],
        modelValue: null,
      },
    })
    expect(wrapper.exists()).toBe(true)
  })

  it('computes attributes based on reminders', () => {
    const wrapper = mount(CalendarGrid, {
      global: {
        plugins: [i18n],
      },
      props: {
        reminders: [dummyReminder],
        modelValue: null,
      },
    })

    const vm = wrapper.vm as unknown as { attributes: { dot: string; dates: Date[] }[] }
    const attrs = vm.attributes
    expect(attrs.length).toBe(1)
    expect(attrs[0].dot).toBe('blue')
    // Component converts dates to local time via toDateString(), so we expect local date
    const expectedDate = new Date(dummyReminder.scheduledAt.toDateString())
    expect(attrs[0].dates[0]).toEqual(expectedDate)
  })

  it('emits update:modelValue when a day is clicked', async () => {
    const wrapper = mount(CalendarGrid, {
      global: {
        plugins: [i18n],
      },
      props: {
        reminders: [],
        modelValue: null,
      },
    })

    const today = new Date()
    // Instead of relying on internal v-calendar structure which is hard to mock,
    // we can find the DatePicker component or just simulate the method call
    // since we are mainly testing the wrapper's translation of events.
    const vm = wrapper.vm as unknown as { onDayClick: (day: { date: Date }) => void }
    vm.onDayClick({ date: today })

    expect(wrapper.emitted('update:modelValue')).toBeTruthy()
    expect(wrapper.emitted('update:modelValue')![0]).toEqual([today])
  })
})
