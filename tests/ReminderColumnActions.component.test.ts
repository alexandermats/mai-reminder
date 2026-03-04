import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { mount } from '@vue/test-utils'
import { createI18n } from 'vue-i18n'
import ReminderColumnActions from '../src/components/ReminderColumnActions.vue'
import { nextTick } from 'vue'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      reminder: {
        past: 'Past',
        inMinutes: 'in {n}m',
        inHours: 'in {n}h',
        inDays: 'in {n}d',
      },
    },
  },
})

describe('ReminderColumnActions.vue', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.runOnlyPendingTimers()
    vi.useRealTimers()
  })

  const commonStubs = {
    'ion-note': { template: '<div><slot /></div>' },
    'ion-button': { template: '<button><slot /></button>' },
    'ion-icon': true,
  }

  it('updates countdown dynamically while the component is mounted', async () => {
    // Schedule at 60 minutes from now + 1 second buffer so it rounds to 60 or 61 appropriately
    // Wait, the component says Math.round(diffMs / 60000).
    // If diffMs = 3600000 (1 hour), it's exactly 60m.
    // Let's set it to 65 minutes from now.
    const now = new Date('2024-01-01T12:00:00.000Z')
    vi.setSystemTime(now)

    // scheduledAt: 60 minutes away -> 60m threshold is "in {n}h" or "in {n}m"?
    // "if (diffMins < 60) return inMinutes"
    // So 65 minutes away -> diffMins = 65 -> inHours (diffHours = 1) -> in 1h.
    // Let's set it to exactly 5 minutes (300_000 ms) away.
    const scheduledAt = new Date(now.getTime() + 300_000)

    const wrapper = mount(ReminderColumnActions, {
      props: {
        scheduledAt,
        showDelete: true,
      },
      global: {
        plugins: [i18n],
        stubs: commonStubs,
      },
    })

    const badge = wrapper.find('.countdown-badge')
    expect(badge.text()).toContain('in 5m')

    // Advance time by 60 seconds (1 minute)
    vi.advanceTimersByTime(60_000)

    // We expect the reactive timer inside the component to have triggered an update
    await nextTick()

    expect(badge.text()).toContain('in 4m')

    // Advance another 5 minutes
    vi.advanceTimersByTime(300_000)
    await nextTick()

    expect(badge.text()).toContain('Past')
  })
})
