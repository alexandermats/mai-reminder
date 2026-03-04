import { describe, it, expect, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia } from 'pinia'
import ReminderList from '../../src/components/ReminderList.vue'
import {
  type Reminder,
  ReminderLanguage,
  ReminderSource,
  ReminderParserMode,
  ReminderStatus,
} from '../../src/types/reminder'

vi.mock('vue-i18n', () => ({
  useI18n: () => ({ t: (key: string) => key }),
  createI18n: vi.fn(),
}))

describe('UI Performance', () => {
  it('renders a list of 50 reminders in < 100ms', () => {
    const reminders: Reminder[] = Array.from({ length: 50 }).map((_, i) => ({
      id: `perf - rem - ${i} `,
      title: `Reminder ${i} `,
      originalText: 'test phrase',
      createdAt: new Date(),
      updatedAt: new Date(),
      scheduledAt: new Date(Date.now() + 86400000 * (i + 1)), // Future
      language: ReminderLanguage.EN,
      source: ReminderSource.TEXT,
      parserMode: ReminderParserMode.LOCAL,
      status: ReminderStatus.PENDING,
    }))

    const start = performance.now()

    // Mount the component with the 50 reminders
    const wrapper = mount(ReminderList, {
      props: { reminders },
      global: {
        plugins: [createPinia()],
        mocks: {
          $t: (msg: string) => msg,
        },
        provide: {
          [Symbol.for('vue-i18n')]: true,
        },
        stubs: {
          'ion-list': true,
          'ion-item': true,
          'ion-label': true,
          'ion-icon': true,
          'ion-item-sliding': true,
          'ion-item-options': true,
          'ion-item-option': true,
        },
      },
    })

    const end = performance.now()
    const duration = end - start

    console.log(`[Perf] UI Render 50 items took: ${duration.toFixed(2)} ms`)

    expect(wrapper.exists()).toBe(true)
    expect(duration).toBeLessThan(100)
  })
})
