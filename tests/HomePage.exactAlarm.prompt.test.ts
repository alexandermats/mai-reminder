import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'

const { mockAlertCreate, mockChangeExactNotificationSetting, mockCheckExactNotificationSetting } =
  vi.hoisted(() => ({
    mockAlertCreate: vi.fn(),
    mockChangeExactNotificationSetting: vi.fn().mockResolvedValue(undefined),
    mockCheckExactNotificationSetting: vi.fn().mockResolvedValue({ exact_alarm: 'denied' }),
  }))

vi.mock('vue-router', () => ({
  useRouter: () => ({ push: vi.fn() }),
}))

vi.mock('@capacitor/core', async () => {
  const actual = await vi.importActual<typeof import('@capacitor/core')>('@capacitor/core')
  return {
    ...actual,
    Capacitor: {
      ...actual.Capacitor,
      getPlatform: vi.fn(() => 'android'),
    },
  }
})

vi.mock('@capacitor/local-notifications', () => ({
  LocalNotifications: {
    addListener: vi.fn(),
    checkExactNotificationSetting: mockCheckExactNotificationSetting,
    changeExactNotificationSetting: mockChangeExactNotificationSetting,
  },
}))

vi.mock('@ionic/vue', async () => {
  const actual = await vi.importActual('@ionic/vue')
  return {
    ...(actual as Record<string, unknown>),
    alertController: {
      create: mockAlertCreate,
    },
    toastController: {
      create: vi.fn().mockResolvedValue({ present: vi.fn().mockResolvedValue(undefined) }),
    },
  }
})

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

vi.mock('../src/utils/platform', () => ({
  isCapacitorNative: vi.fn(() => true),
  isElectron: vi.fn(() => false),
}))

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      app: { title: 'Mai Reminder' },
      reminder: {
        cancel: 'Cancel',
        status: {
          pending: 'Pending',
          sent: 'Sent',
          cancelled: 'Cancelled',
          filterByStatus: 'Filter',
        },
      },
      settings: {
        exactAlarmPromptTitle: 'Enable exact reminders',
        exactAlarmPromptMessage: 'Prompt message',
        openSystemSettings: 'Open settings',
      },
      errors: {
        exactAlarmDisabled: 'warning',
      },
    },
  },
})

describe('HomePage exact alarm prompt', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    mockAlertCreate.mockReset()
    mockChangeExactNotificationSetting.mockClear()
    mockCheckExactNotificationSetting.mockResolvedValue({ exact_alarm: 'denied' })

    mockAlertCreate.mockResolvedValue({ present: vi.fn().mockResolvedValue(undefined) })
  })

  it('prompts user and opens exact alarm settings on confirmation', async () => {
    const { default: HomePage } = await import('../src/views/HomePage.vue')

    mount(HomePage, {
      global: {
        plugins: [createPinia(), i18n],
        stubs: {
          'ion-page': { template: '<div><slot /></div>' },
          'ion-header': { template: '<div><slot /></div>' },
          'ion-toolbar': { template: '<div><slot /></div>' },
          'ion-title': { template: '<div><slot /></div>' },
          'ion-content': { template: '<div><slot /></div>' },
          'ion-footer': { template: '<div><slot /></div>' },
          'ion-buttons': { template: '<div><slot /></div>' },
          'ion-button': { template: '<button><slot /></button>' },
          'ion-icon': true,
          'ion-segment': { template: '<div><slot /></div>' },
          'ion-segment-button': { template: '<div><slot /></div>' },
          'ion-label': { template: '<div><slot /></div>' },
          'view-toggle': true,
          'calendar-grid': true,
          'quick-add-input': true,
          'confirmation-modal': true,
          'error-notification': true,
          'reminder-list': true,
        },
      },
    })

    const start = Date.now()
    while (Date.now() - start < 200) {
      if (mockCheckExactNotificationSetting.mock.calls.length > 0) break
      await new Promise((resolve) => setTimeout(resolve, 10))
    }

    expect(mockCheckExactNotificationSetting).toHaveBeenCalled()
    expect(mockAlertCreate).toHaveBeenCalled()

    const alertConfig = mockAlertCreate.mock.calls[0][0] as {
      buttons: Array<{ handler?: () => void | Promise<void> }>
    }

    await alertConfig.buttons[1].handler?.()
    expect(mockChangeExactNotificationSetting).toHaveBeenCalled()
  })
})
