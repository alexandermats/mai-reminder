import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { Pinia, createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import HomePage from '../src/views/HomePage.vue'
import ReminderList from '../src/components/ReminderList.vue'
import QuickAddInput from '../src/components/QuickAddInput.vue'
import { reminderAdapter } from '../src/services/reminderAdapter'
import type { Reminder } from '../src/types/reminder'

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
    vi.clearAllMocks()
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

  it('correctly shifts an edited hourly reminder scheduled in the past to a future valid window time', async () => {
    const wrapper = mount(HomePage, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          ...stubs,
          ReminderList: true,
          QuickAddInput: true,
          ConfirmationModal: true,
        },
      },
    })

    // Explicitly setup some mock data
    const store = wrapper.vm.store
    const pastTime = new Date(Date.now() - 3600 * 1000) // 1 hour ago

    // Seed store with an existing reminder so update succeeds
    const seedReminder = {
      id: 'fake-id',
      title: 'Test',
      originalText: 'Test',
      language: 'en',
      scheduledAt: pastTime,
      source: 'text',
      parserMode: 'nlp',
      status: 'pending',
      recurrenceRule: 'FREQ=HOURLY;INTERVAL=1',
      createdAt: new Date(),
      updatedAt: new Date(),
    } as unknown as Reminder
    store.addReminder(seedReminder)
    await reminderAdapter.create(seedReminder)

    wrapper.vm.editingReminderId = 'fake-id'
    wrapper.vm.recurringEditScope = 'series'
    wrapper.vm.settingsStore = {
      hourlyReminderStartTime: '09:00',
      hourlyReminderEndTime: '22:00',
      fastSave: false,
    }

    // Mock the repo update method locally for this test or intercept it
    const repoUpdateSpy = vi.spyOn(reminderAdapter, 'update')

    // Trigger onSave manually
    await wrapper.vm.onSave({
      title: 'Test',
      originalText: 'Test',
      language: 'en',
      scheduledAt: pastTime,
      usedMode: 'nlp',
      confidence: 1,
      recurrenceRule: 'FREQ=HOURLY;INTERVAL=1',
    })

    // Assert update was called with a future time instead of past time
    expect(repoUpdateSpy).toHaveBeenCalledTimes(1)
    const updateCall = repoUpdateSpy.mock.calls[0]
    expect(updateCall[0]).toBe('fake-id')
    expect(updateCall[1].scheduledAt!.getTime()).toBeGreaterThan(Date.now())
  })
})
