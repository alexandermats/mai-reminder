import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { Pinia, createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import HomePage from '../src/views/HomePage.vue'
import { useSettingsStore } from '../src/stores/settings'
import QuickAddInput from '../src/components/QuickAddInput.vue'
import ConfirmationModal from '../src/components/ConfirmationModal.vue'

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}))

// Mock Ionic components
vi.mock('@ionic/vue', async () => {
  const actual = await vi.importActual('@ionic/vue')
  return {
    ...(actual as Record<string, unknown>),
    toastController: {
      create: vi.fn().mockResolvedValue({
        present: vi.fn().mockResolvedValue(undefined),
      }),
    },
  }
})

// Mock repository
vi.mock('../src/services/reminderAdapter', () => ({
  reminderAdapter: {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockResolvedValue({ id: '1', title: 'Test', scheduledAt: new Date() }),
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
        savedToast: 'Reminder saved!',
      },
    },
  },
})

describe('Fast-Save Integration', () => {
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
    'ion-footer': { template: '<div><slot /></div>' },
    'ion-buttons': { template: '<div><slot /></div>' },
    'ion-button': { template: '<button><slot /></button>' },
    'ion-icon': true,
    'reminder-list': { template: '<div class="reminder-list"></div>' },
    'quick-add-input': { template: '<div class="quick-add"></div>' },
    'confirmation-modal': { template: '<div class="modal"></div>' },
    'error-notification': true,
    'view-toggle': true,
    'calendar-grid': true,
  }

  // Mock router
  const router = {
    push: vi.fn(),
  }

  it('skips modal and saves directly when fastSave is enabled and confidence is high', async () => {
    const settingsStore = useSettingsStore()
    settingsStore.fastSave = true

    const wrapper = mount(HomePage, {
      global: {
        plugins: [pinia, i18n],
        stubs,
        provide: {
          router, // This matches what useRouter() looks for if we mock useRouter
        },
      },
    })

    const quickAdd = wrapper.getComponent(QuickAddInput)

    // Emit a high confidence result
    await (quickAdd.vm as unknown as { $emit: (event: string, ...args: unknown[]) => void }).$emit(
      'result',
      {
        title: 'Buy milk',
        scheduledAt: new Date(),
        confidence: 0.9,
        usedMode: 'llm',
        language: 'en',
      }
    )

    // Modal should NOT be open
    const modal = wrapper.findComponent(ConfirmationModal)
    expect(modal.exists()).toBe(false)

    // Check if create was called
    const { reminderAdapter } = await import('../src/services/reminderAdapter')
    expect(reminderAdapter.create).toHaveBeenCalled()
  })

  it('shows modal when fastSave is enabled but confidence is low', async () => {
    const settingsStore = useSettingsStore()
    settingsStore.fastSave = true

    const wrapper = mount(HomePage, {
      global: {
        plugins: [pinia, i18n],
        stubs,
        provide: {
          router,
        },
      },
    })

    const quickAdd = wrapper.getComponent(QuickAddInput)

    // Emit a low confidence result
    await (quickAdd.vm as unknown as { $emit: (event: string, ...args: unknown[]) => void }).$emit(
      'result',
      {
        title: 'Buy milk',
        scheduledAt: new Date(),
        confidence: 0.5,
        usedMode: 'local',
        language: 'en',
      }
    )

    // Modal SHOULD be open
    const modal = wrapper.findComponent(ConfirmationModal)
    expect(modal.exists()).toBe(true)
  })
})
