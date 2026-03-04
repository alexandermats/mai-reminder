import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { CapacitorVoiceRecorder } from '../src/services/capacitorVoiceRecorder'
import type {
  AndroidVoiceEngine,
  AndroidVoiceEnginePermissionState,
  AndroidVoiceEngineStartOptions,
  VoiceEngineListenerHandle,
} from '../src/services/androidVoiceEngine'

class MockVoiceEngine implements AndroidVoiceEngine {
  public available = true
  public permissionState: AndroidVoiceEnginePermissionState = 'granted'
  public requestPermissionResult: AndroidVoiceEnginePermissionState = 'granted'

  public stopCallCount = 0
  public startOptionsHistory: AndroidVoiceEngineStartOptions[] = []

  private partialListener: ((matches: string[]) => void) | null = null
  private listeningStateListener: ((status: string) => void) | null = null
  private finalResultListener: ((text: string) => void) | null = null

  async isAvailable(): Promise<boolean> {
    return this.available
  }

  async getPermissionState(): Promise<AndroidVoiceEnginePermissionState> {
    return this.permissionState
  }

  async requestPermission(): Promise<AndroidVoiceEnginePermissionState> {
    return this.requestPermissionResult
  }

  async start(options: AndroidVoiceEngineStartOptions): Promise<void> {
    this.startOptionsHistory.push(options)
  }

  async stop(): Promise<void> {
    this.stopCallCount += 1
  }

  async addPartialResultsListener(
    listener: (matches: string[]) => void
  ): Promise<VoiceEngineListenerHandle> {
    this.partialListener = listener
    return {
      remove: () => {
        this.partialListener = null
      },
    }
  }

  async addListeningStateListener(
    listener: (status: string) => void
  ): Promise<VoiceEngineListenerHandle> {
    this.listeningStateListener = listener
    return {
      remove: () => {
        this.listeningStateListener = null
      },
    }
  }

  async clearListeners(): Promise<void> {
    this.partialListener = null
    this.listeningStateListener = null
    this.finalResultListener = null
  }

  async addFinalResultsListener(
    listener: (text: string) => void
  ): Promise<VoiceEngineListenerHandle> {
    this.finalResultListener = listener
    return {
      remove: () => {
        this.finalResultListener = null
      },
    }
  }

  emitPartial(text: string): void {
    this.partialListener?.([text])
  }

  emitListeningState(status: string): void {
    this.listeningStateListener?.(status)
  }

  emitFinal(text: string): void {
    this.finalResultListener?.(text)
  }
}

describe('CapacitorVoiceRecorder - silence timeout', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('finalizes after the default silence timeout (2000ms) when no timeout option given', async () => {
    vi.useFakeTimers()
    const results: Array<{ text: string; isFinal?: boolean }> = []
    const engine = new MockVoiceEngine()
    const recorder = new CapacitorVoiceRecorder(
      {
        onResult: (text: string, _conf?: number, isFinal?: boolean) => {
          results.push({ text, isFinal })
        },
      },
      engine
    )

    // start() calls pause(120) internally so we need to flush microtasks via Promise race
    const startPromise = recorder.start()
    await vi.runAllTimersAsync()
    await startPromise

    engine.emitPartial('hello world')

    // At 1999ms silence timer should NOT have fired
    vi.advanceTimersByTime(1999)
    expect(results.filter((r) => r.isFinal).length).toBe(0)

    // At 2001ms the silence timer should fire
    vi.advanceTimersByTime(2)
    await vi.runAllTimersAsync()
    expect(results.filter((r) => r.isFinal).length).toBe(1)
    expect(results.find((r) => r.isFinal)?.text).toBe('hello world')
    recorder.abort()
  })

  it('uses a custom silenceTimeoutMs when provided in options', async () => {
    vi.useFakeTimers()
    const results: Array<{ text: string; isFinal?: boolean }> = []
    const engine = new MockVoiceEngine()
    const recorder = new CapacitorVoiceRecorder(
      {
        silenceTimeoutMs: 5000,
        onResult: (text: string, _conf?: number, isFinal?: boolean) => {
          results.push({ text, isFinal })
        },
      },
      engine
    )

    const startPromise = recorder.start()
    await vi.runAllTimersAsync()
    await startPromise

    engine.emitPartial('silence test')

    // Should NOT finalize at 2001ms (below the custom 5000ms threshold)
    vi.advanceTimersByTime(2001)
    // Flush microtasks only — do NOT run all timers, that would prematurely fire the 5000ms timer
    await Promise.resolve()
    expect(results.filter((r) => r.isFinal).length).toBe(0)

    // Should finalize after the full 5000ms has elapsed
    vi.advanceTimersByTime(3000)
    await vi.runAllTimersAsync()
    expect(results.filter((r) => r.isFinal).length).toBe(1)
    recorder.abort()
  })
})

describe('CapacitorVoiceRecorder', () => {
  let stateChanges: string[]
  let results: Array<{ text: string; confidence?: number; isFinal?: boolean }>
  let recorder: CapacitorVoiceRecorder
  let engine: MockVoiceEngine

  beforeEach(() => {
    stateChanges = []
    results = []
    engine = new MockVoiceEngine()
  })

  afterEach(() => {
    if (recorder) {
      recorder.abort()
    }
  })

  it('requests permissions if not granted', async () => {
    engine.permissionState = 'prompt'
    engine.requestPermissionResult = 'granted'

    recorder = new CapacitorVoiceRecorder({}, engine)
    await recorder.start()

    expect(engine.startOptionsHistory).toHaveLength(1)
  })

  it('starts recognition with correct state and options', async () => {
    recorder = new CapacitorVoiceRecorder(
      {
        lang: 'ru-RU',
        onStateChange: (state: string) => stateChanges.push(state),
      },
      engine
    )
    await recorder.start()

    expect(engine.startOptionsHistory[0]).toStrictEqual({
      language: 'ru-RU',
      maxResults: 1,
      partialResults: true,
      silenceTimeoutMs: undefined,
    })

    expect(stateChanges).toContain('listening')
    expect(recorder.state).toBe('listening')
  })

  it('sets language dynamically', () => {
    recorder = new CapacitorVoiceRecorder({ lang: 'en-US' }, engine)
    recorder.setLanguage('ru-RU')
    // Language gets stored internally
    expect(recorder['options'].lang).toBe('ru-RU')
  })

  it('emits final text and moves to done when stop is pressed', async () => {
    recorder = new CapacitorVoiceRecorder(
      {
        onResult: (text: string, confidence?: number, isFinal?: boolean): void => {
          results.push({ text, confidence, isFinal })
        },
        onStateChange: (state: string) => stateChanges.push(state),
      },
      engine
    )
    await recorder.start()

    // Simulate partial result
    engine.emitPartial('hello')

    expect(results).toHaveLength(1)
    expect(results[0]).toStrictEqual({ text: 'hello', confidence: 1.0, isFinal: false })

    // When we stop, it should change state and emit final result
    await recorder.stop()
    expect(engine.stopCallCount).toBeGreaterThan(0)
    expect(recorder.state).toBe('done')
    // Should emit the last partial result as final (isFinal: true)
    expect(results).toHaveLength(2)
    expect(results[1]).toStrictEqual({ text: 'hello', confidence: 1.0, isFinal: true })
  })

  it('moves to done when native listener reports stopped without partial text', async () => {
    recorder = new CapacitorVoiceRecorder(
      {
        onStateChange: (state: string) => stateChanges.push(state),
      },
      engine
    )
    await recorder.start()

    engine.emitListeningState('stopped')
    await vi.waitFor(
      () => {
        expect(recorder.state).toBe('done')
      },
      { timeout: 2600 }
    )

    expect(stateChanges).toContain('done')
  })

  it('keeps deterministic state transitions across repeated start/stop cycles', async () => {
    recorder = new CapacitorVoiceRecorder(
      {
        onStateChange: (state: string) => stateChanges.push(state),
        onResult: (text: string, confidence?: number, isFinal?: boolean): void => {
          results.push({ text, confidence, isFinal })
        },
      },
      engine
    )

    await recorder.start()
    engine.emitPartial('first')
    await recorder.stop()

    await recorder.start()
    engine.emitPartial('second')
    await recorder.stop()

    expect(recorder.state).toBe('done')
    expect(stateChanges).toStrictEqual(['listening', 'done', 'listening', 'done'])
    expect(results).toStrictEqual([
      { text: 'first', confidence: 1.0, isFinal: false },
      { text: 'first', confidence: 1.0, isFinal: true },
      { text: 'second', confidence: 1.0, isFinal: false },
      { text: 'second', confidence: 1.0, isFinal: true },
    ])
  })

  it('emits exactly one final result when native final event is received before stop', async () => {
    recorder = new CapacitorVoiceRecorder(
      {
        onResult: (text: string, confidence?: number, isFinal?: boolean): void => {
          results.push({ text, confidence, isFinal })
        },
      },
      engine
    )

    await recorder.start()
    engine.emitPartial('hello')
    engine.emitFinal('hello world')
    await recorder.stop()

    const finalEvents = results.filter((item) => item.isFinal)
    expect(finalEvents).toHaveLength(1)
    expect(finalEvents[0]).toStrictEqual({ text: 'hello world', confidence: 1.0, isFinal: true })
  })
})
