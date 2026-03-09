import { describe, it, expect, beforeEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { Pinia, createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import ConfirmationModal from '../src/components/ConfirmationModal.vue'

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      reminder: {
        title: 'Title',
        date: 'Date',
        time: 'Time',
        recurrence: 'Recurrence',
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
        repeatsDaily: 'Repeats daily',
        repeatsHourly: 'Repeats hourly',
        repeatsMonthly: 'Repeats monthly',
        repeatsEveryNDays: 'Repeats every {count} days',
        repeatsEveryNHours: 'Repeats every {count} hours',
        repeatsEveryNMonths: 'Repeats every {count} months',
        repeatsCustom: 'Repeats ({rule})',
        recurrencePickerNone: 'None',
        recurrencePickerEveryNHours: 'Every {n} hour | Every {n} hours',
        recurrencePickerEveryNDays: 'Every {n} day | Every {n} days',
        recurrencePickerEveryNWeeks: 'Every {n} week | Every {n} weeks',
        every: {
          mo: 'Every Monday',
          tu: 'Every Tuesday',
          we: 'Every Wednesday',
          th: 'Every Thursday',
          fr: 'Every Friday',
          sa: 'Every Saturday',
          su: 'Every Sunday',
        },
        weekdays: {
          mo: 'Monday',
          tu: 'Tuesday',
          we: 'Wednesday',
          th: 'Thursday',
          fr: 'Friday',
          sa: 'Saturday',
          su: 'Sunday',
        },
        save: 'Save',
        saveChanges: 'Save Changes',
        cancel: 'Cancel',
        createReminder: 'Create Reminder',
        editReminder: 'Edit Reminder',
      },
    },
  },
})

describe('ConfirmationModal.vue', () => {
  let pinia: Pinia

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
  })

  const commonStubs = {
    'ion-modal': { template: '<div><slot /></div>' },
    'ion-header': { template: '<div><slot /></div>' },
    'ion-toolbar': { template: '<div><slot name="start" /><slot /><slot name="end" /></div>' },
    'ion-title': { template: '<h1><slot /></h1>' },
    'ion-buttons': { template: '<div><slot /></div>' },
    'ion-button': { template: '<button><slot /></button>' },
    'ion-content': { template: '<div><slot /></div>' },
    'ion-item': { template: '<div><slot /></div>' },
    'ion-label': { template: '<label><slot /></label>' },
    'ion-input': {
      template:
        '<input :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
      props: ['modelValue'],
    },
    'ion-select': {
      template:
        '<select :value="modelValue" @change="$emit(\'update:modelValue\', $event.target.value)"><slot /></select>',
      props: ['modelValue'],
    },
    'ion-select-option': {
      template: '<option :value="value"><slot /></option>',
      props: ['value'],
    },
    'ion-datetime': {
      template: '<div class="datetime-stub" :data-locale="locale">{{ modelValue }}</div>',
      props: ['modelValue', 'locale'],
    },
    'ion-note': { template: '<div><slot /></div>' },
    'ion-icon': { template: '<span></span>' },
  }

  const defaultResult = {
    title: 'Test Reminder',
    scheduledAt: new Date('2026-03-01T10:00:00Z'),
    confidence: 1.0,
    usedMode: 'llm' as const,
  }

  it('renders with initial values from result', () => {
    const wrapper = mount(ConfirmationModal, {
      props: {
        isOpen: true,
        isEditing: false,
        result: defaultResult,
      },
      global: {
        plugins: [pinia, i18n],
        stubs: commonStubs,
      },
    })

    expect(wrapper.find('input').element.value).toBe('Test Reminder')
    expect(wrapper.find('.datetime-stub').text()).toContain('2026-03-01')
  })

  it('emits save with updated values', async () => {
    const wrapper = mount(ConfirmationModal, {
      props: {
        isOpen: true,
        isEditing: false,
        result: defaultResult,
      },
      global: {
        plugins: [pinia, i18n],
        stubs: commonStubs,
      },
    })

    await wrapper.find('input').setValue('Updated Title')

    const saveButton = wrapper.findAll('button').find((b) => b.text() === 'Save')
    await saveButton?.trigger('click')

    expect(wrapper.emitted('save')).toBeTruthy()
    const emitted = wrapper.emitted('save')?.[0][0] as { title: string }
    expect(emitted.title).toBe('Updated Title')
  })

  it('emits cancel when cancel button clicked', async () => {
    const wrapper = mount(ConfirmationModal, {
      props: {
        isOpen: true,
        isEditing: false,
        result: defaultResult,
      },
      global: {
        plugins: [pinia, i18n],
        stubs: commonStubs,
      },
    })

    const cancelButton = wrapper.findAll('button').find((b) => b.text() === 'Cancel')
    await cancelButton?.trigger('click')
    expect(wrapper.emitted('cancel')).toBeTruthy()
  })

  it('renders "Edit Reminder" and "Save Changes" when isEditing is true', () => {
    const wrapper = mount(ConfirmationModal, {
      props: {
        isOpen: true,
        isEditing: true,
        result: defaultResult,
      },
      global: {
        plugins: [pinia, i18n],
        stubs: commonStubs,
      },
    })

    expect(wrapper.text()).toContain('Edit Reminder')
    expect(wrapper.text()).toContain('Save Changes')
  })

  it('renders human-readable recurrence text when recurrenceRule is present', () => {
    const wrapper = mount(ConfirmationModal, {
      props: {
        isOpen: true,
        isEditing: false,
        result: {
          ...defaultResult,
          recurrenceRule: 'FREQ=WEEKLY;BYDAY=MO',
        },
      },
      global: {
        plugins: [pinia, i18n],
        stubs: commonStubs,
      },
    })

    expect(wrapper.find('[data-test="recurrence-description"]').exists()).toBe(true)
    expect(wrapper.text()).toContain('Repeats every Monday')
  })

  // E13-03 Recurrence Picker Tests

  it('initializes recurrence picker with None when no recurrenceRule is present', () => {
    const wrapper = mount(ConfirmationModal, {
      props: {
        isOpen: true,
        isEditing: false,
        result: defaultResult,
      },
      global: {
        plugins: [pinia, i18n],
        stubs: commonStubs,
      },
    })

    const select = wrapper.find('[data-test="recurrence-type-select"]')
    expect(select.exists()).toBe(true)
    expect((select.element as HTMLSelectElement).value).toBe('none')
  })

  it('initializes picker correctly when parsed result has DAILY interval', () => {
    const defaultDailyResult = {
      ...defaultResult,
      recurrenceRule: 'FREQ=DAILY;INTERVAL=3',
    }

    const wrapper = mount(ConfirmationModal, {
      props: {
        isOpen: true,
        isEditing: false,
        result: defaultDailyResult,
      },
      global: {
        plugins: [pinia, i18n],
        stubs: commonStubs,
      },
    })

    const select = wrapper.find('[data-test="recurrence-type-select"]')
    expect((select.element as HTMLSelectElement).value).toBe('days')

    const intervalInput = wrapper.find('[data-test="recurrence-interval-input"]')
    expect(intervalInput.exists()).toBe(true)
    expect((intervalInput.element as HTMLInputElement).value).toBe('3')
  })

  it('emits save event with correct RRULE when choosing Every N days', async () => {
    const wrapper = mount(ConfirmationModal, {
      props: {
        isOpen: true,
        isEditing: false,
        result: defaultResult,
      },
      global: {
        plugins: [pinia, i18n],
        stubs: commonStubs,
      },
    })

    await wrapper.find('[data-test="recurrence-type-select"]').setValue('days')
    const vm = wrapper.vm as unknown as { recurrenceInterval: number | undefined }
    vm.recurrenceInterval = 4
    await wrapper.vm.$nextTick()

    const saveButton = wrapper.findAll('button').find((b) => b.text() === 'Save')
    await saveButton?.trigger('click')

    const emitted = wrapper.emitted('save')
    expect(emitted).toBeTruthy()
    const payload = emitted![0][0] as { recurrenceRule?: string }
    expect(payload.recurrenceRule).toBe('FREQ=DAILY;INTERVAL=4')
  })

  it('emits save event with correct RRULE when choosing Every N hours', async () => {
    const wrapper = mount(ConfirmationModal, {
      props: {
        isOpen: true,
        isEditing: false,
        result: defaultResult,
      },
      global: {
        plugins: [pinia, i18n],
        stubs: commonStubs,
      },
    })

    await wrapper.find('[data-test="recurrence-type-select"]').setValue('hours')
    const vm = wrapper.vm as unknown as { recurrenceInterval: number | undefined }
    vm.recurrenceInterval = 2
    await wrapper.vm.$nextTick()

    const saveButton = wrapper.findAll('button').find((b) => b.text() === 'Save')
    await saveButton?.trigger('click')

    const emitted = wrapper.emitted('save')
    expect(emitted).toBeTruthy()
    const payload = emitted![0][0] as { recurrenceRule?: string }
    expect(payload.recurrenceRule).toBe('FREQ=HOURLY;INTERVAL=2')
  })

  it('emits save event with correct RRULE when choosing Every N weeks', async () => {
    const wrapper = mount(ConfirmationModal, {
      props: {
        isOpen: true,
        isEditing: false,
        result: defaultResult,
      },
      global: {
        plugins: [pinia, i18n],
        stubs: commonStubs,
      },
    })

    await wrapper.find('[data-test="recurrence-type-select"]').setValue('weeks')
    const vm = wrapper.vm as unknown as { recurrenceInterval: number | undefined }
    vm.recurrenceInterval = 1
    await wrapper.vm.$nextTick()

    const saveButton = wrapper.findAll('button').find((b) => b.text() === 'Save')
    await saveButton?.trigger('click')

    const emitted = wrapper.emitted('save')
    expect(emitted).toBeTruthy()
    const payload = emitted![0][0] as { recurrenceRule?: string }
    expect(payload.recurrenceRule).toBe('FREQ=WEEKLY;INTERVAL=1')
  })

  it('emits save event with correct RRULE when choosing Every Day of week', async () => {
    const wrapper = mount(ConfirmationModal, {
      props: {
        isOpen: true,
        isEditing: false,
        result: defaultResult,
      },
      global: {
        plugins: [pinia, i18n],
        stubs: commonStubs,
      },
    })

    await wrapper.find('[data-test="recurrence-type-select"]').setValue('dayOfWeek')
    await wrapper.find('[data-test="recurrence-day-select"]').setValue('WE')

    const saveButton = wrapper.findAll('button').find((b) => b.text() === 'Save')
    await saveButton?.trigger('click')

    const emitted = wrapper.emitted('save')
    expect(emitted).toBeTruthy()
    const payload = emitted![0][0] as { recurrenceRule?: string }
    expect(payload.recurrenceRule).toBe('FREQ=WEEKLY;BYDAY=WE')
  })

  it('clears recurrenceRule when choosing None', async () => {
    const defaultRecurringResult = {
      ...defaultResult,
      recurrenceRule: 'FREQ=DAILY;INTERVAL=1',
    }

    const wrapper = mount(ConfirmationModal, {
      props: {
        isOpen: true,
        isEditing: true,
        result: defaultRecurringResult,
      },
      global: {
        plugins: [pinia, i18n],
        stubs: commonStubs,
      },
    })

    await wrapper.find('[data-test="recurrence-type-select"]').setValue('none')

    const saveButton = wrapper.findAll('button').find((b) => b.text() === 'Save Changes')
    await saveButton?.trigger('click')

    const emitted = wrapper.emitted('save')
    expect(emitted).toBeTruthy()
    const payload = emitted![0][0] as { recurrenceRule?: string }
    expect(payload.recurrenceRule).toBeUndefined()
  })

  it('passes the current locale to ion-datetime', async () => {
    const wrapper = mount(ConfirmationModal, {
      props: {
        isOpen: true,
        isEditing: false,
        result: defaultResult,
      },
      global: {
        plugins: [pinia, i18n],
        stubs: commonStubs,
      },
    })

    const datetime = wrapper.find('.datetime-stub')
    expect(datetime.attributes('data-locale')).toBe('en')

    // Change locale
    ;(i18n.global.locale.value as string) = 'ru'
    await wrapper.vm.$nextTick()

    expect(datetime.attributes('data-locale')).toBe('ru')

    // Reset locale for other tests
    ;(i18n.global.locale.value as string) = 'en'
  })
})
