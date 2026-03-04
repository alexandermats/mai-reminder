import { describe, it, expect, vi, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { Pinia, createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import HomePage from '../src/views/HomePage.vue'
import { reminderAdapter } from '../src/services/reminderAdapter'

const { mockAlertCreate } = vi.hoisted(() => ({
  mockAlertCreate: vi.fn(),
}))

vi.mock('vue-router', () => ({
  useRouter: () => ({
    push: vi.fn(),
  }),
}))

vi.mock('@ionic/vue', async () => {
  const actual = await vi.importActual('@ionic/vue')
  return {
    ...(actual as Record<string, unknown>),
    alertController: {
      create: mockAlertCreate,
    },
    toastController: {
      create: vi.fn().mockResolvedValue({
        present: vi.fn().mockResolvedValue(undefined),
      }),
    },
  }
})

vi.mock('../src/services/reminderAdapter', () => ({
  reminderAdapter: {
    list: vi.fn().mockResolvedValue([]),
    create: vi.fn().mockImplementation(async (input: { id?: string; title: string }) => ({
      id: input.id || 'created-1',
      ...input,
      originalText: 'created',
      language: 'en',
      scheduledAt: new Date('2030-01-01T10:00:00.000Z'),
      source: 'text',
      parserMode: 'local',
      status: 'pending',
      createdAt: new Date('2030-01-01T09:00:00.000Z'),
      updatedAt: new Date('2030-01-01T09:00:00.000Z'),
    })),
    update: vi.fn().mockImplementation(async (id: string, changes: Record<string, unknown>) => ({
      id,
      title: 'Weekly standup',
      originalText: 'weekly standup monday',
      language: 'en',
      scheduledAt: new Date('2030-01-01T10:00:00.000Z'),
      source: 'text',
      parserMode: 'local',
      status: 'pending',
      recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO',
      createdAt: new Date('2030-01-01T09:00:00.000Z'),
      updatedAt: new Date('2030-01-01T09:00:00.000Z'),
      ...changes,
    })),
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
        delete: 'Cancel',
        deleteConfirm: 'Cancel this reminder?',
        cancel: 'Cancel',
        yes: 'Yes',
        no: 'No',
        seriesScopePrompt: 'Update just this occurrence, or the entire series?',
      },
    },
  },
})

describe('HomePage recurring prompts (E10-04)', () => {
  let pinia: Pinia

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    mockAlertCreate.mockReset()
    mockAlertCreate.mockResolvedValue({
      present: vi.fn().mockResolvedValue(undefined),
    })
    vi.mocked(reminderAdapter.create).mockClear()
    vi.mocked(reminderAdapter.update).mockClear()
    recurringReminder.title = 'Weekly standup'
    recurringReminder.originalText = 'weekly standup monday'
    recurringReminder.scheduledAt = new Date('2030-01-01T10:00:00.000Z')
    recurringReminder.recurrenceRule = 'FREQ=WEEKLY;BYDAY=MO'
  })

  const recurringReminder = {
    id: 'rec-1',
    title: 'Weekly standup',
    originalText: 'weekly standup monday',
    language: 'en',
    scheduledAt: new Date('2030-01-01T10:00:00.000Z'),
    source: 'text',
    parserMode: 'local',
    status: 'pending',
    recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO',
    createdAt: new Date('2030-01-01T09:00:00.000Z'),
    updatedAt: new Date('2030-01-01T09:00:00.000Z'),
  }

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
    'ion-segment': { template: '<div><slot /></div>' },
    'ion-segment-button': { template: '<button><slot /></button>' },
    'ion-label': { template: '<span><slot /></span>' },
    'view-toggle': true,
    'calendar-grid': true,
    'quick-add-input': true,
    'confirmation-modal': {
      template: `
        <div>
          <button data-test="emit-save" @click="$emit('save', saveResult)"></button>
        </div>
      `,
      data() {
        return {
          saveResult: {
            title: 'Edited once',
            scheduledAt: new Date('2030-01-01T11:00:00.000Z'),
            confidence: 1,
            usedMode: 'local',
            language: 'en',
            recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO',
          },
        }
      },
    },
    'error-notification': true,
    'reminder-list': {
      template: `
        <div>
          <button data-test="emit-edit" @click="$emit('edit', recurringReminder)"></button>
          <button data-test="emit-delete" @click="$emit('cancel', recurringReminder)"></button>
        </div>
      `,
      data() {
        return { recurringReminder }
      },
    },
  }

  it('edits only this occurrence by creating one-time reminder and advancing series', async () => {
    const wrapper = mount(HomePage, {
      global: {
        plugins: [pinia, i18n],
        stubs,
      },
    })

    await wrapper.get('[data-test="emit-edit"]').trigger('click')

    expect(mockAlertCreate).toHaveBeenCalled()
    const alertConfig = mockAlertCreate.mock.calls[0][0] as {
      message?: string
      buttons: Array<{ handler?: () => void | Promise<void> }>
    }
    expect(alertConfig.message).toBe('Update just this occurrence, or the entire series?')

    await alertConfig.buttons[1].handler?.()
    await wrapper.get('[data-test="emit-save"]').trigger('click')

    expect(reminderAdapter.update).toHaveBeenCalled()
    expect(reminderAdapter.create).toHaveBeenCalled()

    const updateArgs = vi.mocked(reminderAdapter.update).mock.calls[0]
    expect(updateArgs[0]).toBe('rec-1')
    expect(updateArgs[1]).toMatchObject({
      status: 'pending',
      scheduledAt: new Date('2030-01-07T10:00:00.000Z'),
    })

    const createArgs = vi.mocked(reminderAdapter.create).mock.calls[0][0] as {
      recurrenceRule?: string
    }
    expect(createArgs.recurrenceRule).toBeUndefined()
  })

  it('deletes only this occurrence by advancing series date', async () => {
    const wrapper = mount(HomePage, {
      global: {
        plugins: [pinia, i18n],
        stubs,
      },
    })

    await wrapper.get('[data-test="emit-delete"]').trigger('click')

    expect(mockAlertCreate).toHaveBeenCalled()
    const alertConfig = mockAlertCreate.mock.calls[0][0] as {
      message?: string
      buttons: Array<{ handler?: () => void | Promise<void> }>
    }
    expect(alertConfig.message).toBe('Update just this occurrence, or the entire series?')

    await alertConfig.buttons[1].handler?.()

    const confirmAlert = mockAlertCreate.mock.calls[1][0] as {
      buttons: Array<{ role?: string; handler?: () => void | Promise<void> }>
    }
    const destructive = confirmAlert.buttons.find((b) => b.role === 'destructive')
    await destructive?.handler?.()

    expect(reminderAdapter.update).toHaveBeenCalledWith(
      'rec-1',
      expect.objectContaining({
        status: 'pending',
        scheduledAt: new Date('2030-01-07T10:00:00.000Z'),
      })
    )
  })

  it('deletes only this hourly occurrence by advancing to next hour', async () => {
    recurringReminder.recurrenceRule = 'FREQ=HOURLY;INTERVAL=1'
    recurringReminder.scheduledAt = new Date('2030-01-01T10:00:00.000Z')

    const wrapper = mount(HomePage, {
      global: {
        plugins: [pinia, i18n],
        stubs,
      },
    })

    await wrapper.get('[data-test="emit-delete"]').trigger('click')
    const scopeAlert = mockAlertCreate.mock.calls[0][0] as {
      buttons: Array<{ handler?: () => void | Promise<void> }>
    }
    await scopeAlert.buttons[1].handler?.()

    const confirmAlert = mockAlertCreate.mock.calls[1][0] as {
      buttons: Array<{ role?: string; handler?: () => void | Promise<void> }>
    }
    const destructive = confirmAlert.buttons.find((b) => b.role === 'destructive')
    await destructive?.handler?.()

    expect(reminderAdapter.update).toHaveBeenCalledWith(
      'rec-1',
      expect.objectContaining({
        status: 'pending',
        scheduledAt: new Date('2030-01-01T11:00:00.000Z'),
      })
    )
  })

  it('edits entire recurring series by updating existing reminder only', async () => {
    recurringReminder.recurrenceRule = 'FREQ=WEEKLY;BYDAY=MO;BYHOUR=9;BYMINUTE=0;BYSECOND=0'
    const editedAt = new Date('2030-01-01T11:00:00.000Z')

    const wrapper = mount(HomePage, {
      global: {
        plugins: [pinia, i18n],
        stubs,
      },
    })

    await wrapper.get('[data-test="emit-edit"]').trigger('click')
    const scopeAlert = mockAlertCreate.mock.calls[0][0] as {
      buttons: Array<{ handler?: () => void | Promise<void> }>
    }
    await scopeAlert.buttons[2].handler?.()
    await wrapper.get('[data-test="emit-save"]').trigger('click')

    expect(reminderAdapter.create).not.toHaveBeenCalled()
    expect(reminderAdapter.update).toHaveBeenCalledWith(
      'rec-1',
      expect.objectContaining({
        title: 'Edited once',
        recurrenceRule: expect.stringContaining(`BYHOUR=${editedAt.getHours()}`),
      })
    )
    expect(reminderAdapter.update).toHaveBeenCalledWith(
      'rec-1',
      expect.objectContaining({
        recurrenceRule: expect.stringContaining(`BYMINUTE=${editedAt.getMinutes()}`),
      })
    )
  })

  it('deletes entire recurring series by cancelling reminder', async () => {
    const wrapper = mount(HomePage, {
      global: {
        plugins: [pinia, i18n],
        stubs,
      },
    })

    await wrapper.get('[data-test="emit-delete"]').trigger('click')
    const scopeAlert = mockAlertCreate.mock.calls[0][0] as {
      buttons: Array<{ handler?: () => void | Promise<void> }>
    }
    await scopeAlert.buttons[2].handler?.()

    const confirmAlert = mockAlertCreate.mock.calls[1][0] as {
      buttons: Array<{ role?: string; handler?: () => void | Promise<void> }>
    }
    const destructive = confirmAlert.buttons.find((b) => b.role === 'destructive')
    await destructive?.handler?.()

    expect(reminderAdapter.update).toHaveBeenCalledWith(
      'rec-1',
      expect.objectContaining({
        status: 'cancelled',
      })
    )
  })
})
