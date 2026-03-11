import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount, flushPromises } from '@vue/test-utils'
import { Pinia, createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import HomePage from '../src/views/HomePage.vue'
import { reminderAdapter } from '../src/services/reminderAdapter'
import { useNotifications } from '../src/composables/useNotifications'
import { ReminderStatus } from '../src/types/reminder'
import type { Reminder } from '../src/types/reminder'

// Mock repository
vi.mock('../src/services/reminderAdapter', () => ({
  reminderAdapter: {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn(),
    update: vi.fn().mockResolvedValue({ id: 'sent-1' }),
    delete: vi.fn(),
  },
}))

vi.mock('../src/services/settingsAdapter', () => ({
  settingsAdapter: {
    getSetting: vi.fn().mockResolvedValue(null),
    setSetting: vi.fn().mockResolvedValue(undefined),
  },
}))

const { mockAlertCreate, mockToastCreate } = vi.hoisted(() => ({
  mockAlertCreate: vi.fn().mockResolvedValue({
    present: vi.fn().mockResolvedValue(undefined),
  }),
  mockToastCreate: vi.fn().mockResolvedValue({
    present: vi.fn().mockResolvedValue(undefined),
  }),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@ionic/vue', async () => {
  const actual = await vi.importActual('@ionic/vue')
  return {
    ...(actual as Record<string, unknown>),
    alertController: { create: mockAlertCreate },
    toastController: { create: mockToastCreate },
  }
})

const i18n = createI18n({ legacy: false, locale: 'en', messages: { en: {} } })

describe('HomePage edit sent reminder (E6-07)', () => {
  let pinia: Pinia

  const stubsTemplate = {
    'ion-page': { template: '<div><slot /></div>' },
    'ion-header': { template: '<div><slot /></div>' },
    'ion-toolbar': { template: '<div><slot /></div>' },
    'ion-title': { template: '<h1><slot /></h1>' },
    'ion-content': { template: '<div><slot /></div>' },
    'ion-footer': { template: '<div><slot /></div>' },
    'ion-segment': { template: '<div><slot /></div>' },
    'ion-segment-button': { template: '<button><slot /></button>' },
    'ion-label': { template: '<span><slot /></span>' },
    'ion-icon': true,
    'ion-buttons': true,
    'ion-button': true,
    'view-toggle': true,
    'calendar-grid': true,
    'quick-add-input': true,
    'error-notification': true,
  }

  const sentReminder = {
    id: 'sent-1',
    title: 'Did something',
    originalText: 'did something',
    language: 'en',
    scheduledAt: new Date(Date.now() - 100000), // past
    source: 'text',
    parserMode: 'local',
    status: ReminderStatus.SENT,
    createdAt: new Date(),
    updatedAt: new Date(),
  }
  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.mocked(reminderAdapter.list).mockClear()
    vi.mocked(reminderAdapter.list).mockResolvedValue([sentReminder as unknown as Reminder])
    vi.mocked(reminderAdapter.update).mockClear()
    const { notifications } = useNotifications()
    notifications.value = []
  })

  it('throws a validation error if the newly edited time is in the past for a sent reminder', async () => {
    const { notifications } = useNotifications()

    const wrapper = mount(HomePage, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          ...stubsTemplate,
          'reminder-list': {
            template:
              '<div><button data-test="emit-edit" @click="$emit(\'edit\', reminder)"></button></div>',
            data() {
              return { reminder: sentReminder }
            },
          },
          'confirmation-modal': {
            template:
              '<div><button data-test="emit-save" @click="$emit(\'save\', saveResult)"></button></div>',
            data() {
              return {
                saveResult: {
                  title: 'Did something',
                  scheduledAt: new Date(Date.now() - 50000), // STILL PAST
                  confidence: 1,
                  usedMode: 'local',
                  language: 'en',
                },
              }
            },
          },
        },
      },
    })

    const { useReminderStore } = await import('../src/stores/reminder')
    useReminderStore()
    await flushPromises()

    await wrapper.get('[data-test="emit-edit"]').trigger('click')
    await wrapper.get('[data-test="emit-save"]').trigger('click')

    expect(reminderAdapter.update).not.toHaveBeenCalled()
    expect(notifications.value.length).toBeGreaterThan(0)
    expect(notifications.value[0].messageKey).toBe('errors.timeMustBeInFuture')
  })

  it('updates target to PENDING and succeeds if the edited time is in the future for a sent reminder', async () => {
    const wrapper = mount(HomePage, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          ...stubsTemplate,
          'reminder-list': {
            template:
              '<div><button data-test="emit-edit" @click="$emit(\'edit\', reminder)"></button></div>',
            data() {
              return { reminder: sentReminder }
            },
          },
          'confirmation-modal': {
            template:
              '<div><button data-test="emit-save" @click="$emit(\'save\', saveResult)"></button></div>',
            data() {
              return {
                saveResult: {
                  title: 'Do something later',
                  scheduledAt: new Date(Date.now() + 100000), // FUTURE
                  confidence: 1,
                  usedMode: 'local',
                  language: 'en',
                },
              }
            },
          },
        },
      },
    })

    const { useReminderStore } = await import('../src/stores/reminder')
    useReminderStore()
    await flushPromises()

    await wrapper.get('[data-test="emit-edit"]').trigger('click')
    await wrapper.get('[data-test="emit-save"]').trigger('click')

    expect(reminderAdapter.update).toHaveBeenCalled()
    const args = vi.mocked(reminderAdapter.update).mock.calls[0]
    expect(args[0]).toBe('sent-1')
    expect(args[1]).toMatchObject({
      status: ReminderStatus.PENDING,
      title: 'Do something later',
    })
  })

  it('updates target to PENDING and succeeds if the edited time is in the future for a dismissed reminder', async () => {
    const dismissedReminder = {
      ...sentReminder,
      id: 'dismissed-1',
      status: ReminderStatus.DISMISSED,
    }

    const wrapper = mount(HomePage, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          ...stubsTemplate,
          'reminder-list': {
            template:
              '<div class="stub"><button data-test="emit-edit" @click="$emit(&quot;edit&quot;, reminder)"></button></div>',
            data() {
              return { reminder: dismissedReminder }
            },
          },
          'confirmation-modal': {
            template:
              '<div class="stub"><button data-test="emit-save" @click="$emit(&quot;save&quot;, saveResult)"></button></div>',
            data() {
              return {
                saveResult: {
                  title: 'Do something later',
                  scheduledAt: new Date(Date.now() + 100000), // FUTURE
                  confidence: 1,
                  usedMode: 'local',
                  language: 'en',
                },
              }
            },
          },
        },
      },
    })

    vi.mocked(reminderAdapter.list).mockResolvedValue([dismissedReminder as unknown as Reminder])

    const { useReminderStore } = await import('../src/stores/reminder')
    useReminderStore()

    await flushPromises()

    await wrapper.get('[data-test="emit-edit"]').trigger('click')
    await wrapper.get('[data-test="emit-save"]').trigger('click')

    expect(reminderAdapter.update).toHaveBeenCalled()
    const args = vi.mocked(reminderAdapter.update).mock.calls[0]
    expect(args[0]).toBe('dismissed-1')
    expect(args[1]).toMatchObject({
      status: ReminderStatus.PENDING,
    })
  })
})
