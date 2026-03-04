import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { mount } from '@vue/test-utils'
import { Pinia, createPinia, setActivePinia } from 'pinia'
import { createI18n } from 'vue-i18n'
import QuickAddInput from '../src/components/QuickAddInput.vue'
import { orchestrator } from '../src/parser/orchestrator'
import { useSettingsStore } from '../src/stores/settings'
import type { ParseResult } from '../src/parser/orchestrator'
import { isSpeechSupported } from '../src/services/voiceFactory'

// Mock orchestrator
vi.mock('../src/parser/orchestrator', () => ({
  orchestrator: {
    parse: vi.fn(),
  },
}))

vi.mock('../src/utils/platform', () => ({
  isElectron: vi.fn(() => false),
  isCapacitorNative: vi.fn(() => false),
}))

interface MockRecorderOptions {
  lang?: string
  onStateChange?: (state: string) => void
  onResult?: (text: string, confidence: number, isFinal: boolean) => void
  [key: string]: unknown
}

// Mock VoiceRecorder and Factory
const MockWebVoiceRecorder = class {
  static _isSupported = true
  static isSupported() {
    return this._isSupported
  }
  options: MockRecorderOptions
  constructor(options: MockRecorderOptions) {
    this.options = options
    ;(globalThis as Record<string, unknown>).__mockRecorder = this
  }
  setLanguage(lang: string) {
    this.options.lang = lang
  }
  start() {
    if (typeof this.options.onStateChange === 'function') {
      this.options.onStateChange('listening')
    }
  }
  abort() {
    if (typeof this.options.onStateChange === 'function') {
      this.options.onStateChange('idle')
    }
  }
  simulateResult(text: string, isFinal: boolean) {
    if (typeof this.options.onResult === 'function') {
      this.options.onResult(text, 1.0, isFinal)
    }
  }
}

vi.mock('../src/services/voiceAdapter', () => ({
  WebVoiceRecorder: MockWebVoiceRecorder,
}))

vi.mock('../src/services/voiceFactory', () => ({
  isSpeechSupported: vi.fn(() => true),
  createVoiceRecorder: vi.fn((opts) => new MockWebVoiceRecorder(opts)),
}))

const i18n = createI18n({
  legacy: false,
  locale: 'en',
  messages: {
    en: {
      reminder: {
        placeholder: 'Remind me to...',
        listening: 'Listening...',
      },
    },
  },
})

describe('QuickAddInput.vue (E3-02)', () => {
  let pinia: Pinia

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
  })

  const commonStubs = {
    'ion-item': { template: '<div><slot name="start" /><slot /><slot name="end" /></div>' },
    'ion-input': {
      template:
        '<input :placeholder="$attrs.placeholder" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
      props: ['modelValue'],
    },
    'ion-button': { template: '<button><slot /></button>' },
    'ion-icon': true,
    'ion-spinner': true,
  }

  it('renders input with correct placeholder', () => {
    const wrapper = mount(QuickAddInput, {
      global: {
        plugins: [pinia, i18n],
        stubs: commonStubs,
      },
    })

    expect(wrapper.find('input').attributes('placeholder')).toBe('Remind me to...')
  })

  it('triggers parse on submit and emits result', async () => {
    const mockResult: ParseResult = {
      title: 'Buy milk',
      scheduledAt: new Date(),
      confidence: 0.9,
      usedMode: 'llm',
    }
    vi.mocked(orchestrator.parse).mockResolvedValue(mockResult)

    const wrapper = mount(QuickAddInput, {
      global: {
        plugins: [pinia, i18n],
        stubs: commonStubs,
      },
    })

    const input = wrapper.find('input')
    await input.setValue('buy milk tomorrow')

    await wrapper.find('form').trigger('submit.prevent')

    expect(orchestrator.parse).toHaveBeenCalledWith({
      text: 'buy milk tomorrow',
      language: 'en',
    })

    await vi.waitFor(() => {
      return wrapper.emitted('result')
    })

    expect(wrapper.emitted('result')?.[0][0]).toEqual(mockResult)
  })

  it('shows loading state during parsing', async () => {
    let resolveParse: (value: ParseResult) => void = () => {}
    const parsePromise = new Promise<ParseResult>((resolve) => {
      resolveParse = resolve
    })
    vi.mocked(orchestrator.parse).mockReturnValue(parsePromise)

    const wrapper = mount(QuickAddInput, {
      global: {
        plugins: [pinia, i18n],
        stubs: {
          ...commonStubs,
          'ion-spinner': { template: '<div class="spinner"></div>' },
        },
      },
    })

    await wrapper.find('input').setValue('test')
    await wrapper.find('form').trigger('submit.prevent')

    expect(wrapper.find('.spinner').exists()).toBe(true)

    resolveParse({ title: 'test', scheduledAt: new Date(), confidence: 1, usedMode: 'local' })
    await vi.waitFor(() => !wrapper.find('.spinner').exists())
  })
})

describe('QuickAddInput.vue Voice (E4-02)', () => {
  let pinia: Pinia

  beforeEach(() => {
    pinia = createPinia()
    setActivePinia(pinia)
    vi.clearAllMocks()
    vi.stubGlobal('SpeechRecognition', vi.fn())

    // Surgical mock for electronAPI to avoid breaking window constructors (Event, etc.)
    if (typeof window !== 'undefined') {
      Object.defineProperty(window, 'electronAPI', {
        value: {
          settings: {
            getSetting: vi.fn(),
            setSetting: vi.fn().mockResolvedValue(undefined),
          },
          onOverlayShown: vi.fn(),
        },
        configurable: true,
      })
    }
  })

  afterEach(() => {
    vi.unstubAllGlobals()
    if (
      typeof window !== 'undefined' &&
      'electronAPI' in (window as unknown as Record<string, unknown>)
    ) {
      delete (window as unknown as Record<string, unknown>).electronAPI
    }
  })

  const commonStubs = {
    'ion-item': { template: '<div><slot name="start" /><slot /><slot name="end" /></div>' },
    'ion-input': {
      template:
        '<input :placeholder="$attrs.placeholder" :value="modelValue" @input="$emit(\'update:modelValue\', $event.target.value)" />',
      props: ['modelValue'],
    },
    'ion-button': { template: '<button class="ion-button"><slot /></button>' },
    'ion-icon': { template: '<i :class="[\'icon\', $attrs.icon]" />' },
    'ion-spinner': true,
  }

  it('renders mic button when input is empty', () => {
    const wrapper = mount(QuickAddInput, {
      global: { plugins: [pinia, i18n], stubs: commonStubs },
    })

    // One of them is the mic button
    expect(wrapper.find('.mic-button').exists()).toBe(true)
  })

  it('shows recording state and interim results when listening', async () => {
    const wrapper = mount(QuickAddInput, {
      global: { plugins: [pinia, i18n], stubs: commonStubs },
    })

    // Start recording
    await wrapper.find('.mic-button').trigger('click')

    // Check if recording state is shown
    expect(wrapper.find('.recording-indicator').exists()).toBe(true)
  })

  it('updates VoiceRecorder target language when store locale changes', async () => {
    const wrapper = mount(QuickAddInput, {
      global: { plugins: [pinia, i18n], stubs: commonStubs },
    })

    const settingsStore = useSettingsStore()

    // It initializes and captures the language based on store
    await wrapper.find('.mic-button').trigger('click')

    let mockRecorder = (globalThis as Record<string, unknown>).__mockRecorder as InstanceType<
      typeof MockWebVoiceRecorder
    >
    expect(mockRecorder.options.lang).toBe('en-US')

    // Change language
    settingsStore.setLanguage('ru')

    // Check if new language set on the recorder dynamically
    await wrapper.vm.$nextTick()
    mockRecorder = (globalThis as Record<string, unknown>).__mockRecorder as InstanceType<
      typeof MockWebVoiceRecorder
    >
    expect(mockRecorder.options.lang).toBe('ru-RU')
  })

  it('disables mic button when SpeechRecognition is not supported (E4-05)', async () => {
    vi.mocked(isSpeechSupported).mockReturnValue(false)

    const wrapper = mount(QuickAddInput, {
      global: { plugins: [pinia, i18n], stubs: commonStubs },
    })

    const micBtn = wrapper.find('.mic-button')
    expect(micBtn.exists()).toBe(true)

    // Check if the element has disabled attribute bound
    expect(micBtn.attributes()).toHaveProperty('disabled')

    // Restore
    vi.mocked(isSpeechSupported).mockReturnValue(true)
  })

  it('exposes deterministic voice test hooks for Android reliability tests', async () => {
    const wrapper = mount(QuickAddInput, {
      global: { plugins: [pinia, i18n], stubs: commonStubs },
    })

    expect(wrapper.find('[data-test="voice-test-session-count"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="voice-test-last-language"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="voice-test-final-count"]').exists()).toBe(true)
    expect(wrapper.find('[data-test="voice-test-last-error"]').exists()).toBe(true)
  })
})
