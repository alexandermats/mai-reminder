import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { ElectronVoiceRecorder } from '../src/services/electronVoiceRecorder'

describe('ElectronVoiceRecorder', () => {
  let recorder: ElectronVoiceRecorder
  let stateChanges: string[]
  let results: Array<{ text: string; confidence?: number; isFinal?: boolean }>
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockMediaStream: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockAudioContext: any
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  let mockProcessor: any

  beforeEach(() => {
    stateChanges = []
    results = []

    mockProcessor = {
      connect: vi.fn(),
      disconnect: vi.fn(),
      onaudioprocess: null,
    }
    mockMediaStream = {
      getTracks: () => [{ stop: vi.fn() }],
    }
    mockAudioContext = {
      createMediaStreamSource: vi.fn().mockReturnValue({ connect: vi.fn(), disconnect: vi.fn() }),
      createScriptProcessor: vi.fn().mockReturnValue(mockProcessor),
      destination: {},
      close: vi.fn().mockResolvedValue(undefined),
    }

    vi.stubGlobal('navigator', {
      mediaDevices: {
        getUserMedia: vi.fn().mockResolvedValue(mockMediaStream),
      },
    })
    vi.stubGlobal('window', {
      electronAPI: {
        startVoice: vi.fn(),
        stopVoice: vi.fn(),
        sendAudioChunk: vi.fn(),
        onVoicePartial: vi.fn(),
        onVoiceFinal: vi.fn(),
        removeVoiceListeners: vi.fn(),
      },
      AudioContext: vi.fn().mockImplementation(() => mockAudioContext),
    })
  })

  afterEach(() => {
    if (recorder) {
      try {
        recorder.abort()
      } catch {
        /* ignore */
      }
    }
    vi.unstubAllGlobals()
  })

  it('throws if electronAPI is not present', () => {
    vi.stubGlobal('window', {})
    expect(() => {
      new ElectronVoiceRecorder({})
    }).toThrow('Electron API not found')
  })

  it('sets state to listening and calls startVoice on IPC', async () => {
    recorder = new ElectronVoiceRecorder({
      lang: 'en-US',
      onStateChange: (state: string) => stateChanges.push(state),
    })

    await recorder.start()

    expect(stateChanges).toContain('listening')
    expect(recorder.state).toBe('listening')
    expect(window.electronAPI!.startVoice).toHaveBeenCalled()
    expect(navigator.mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: true })
  })

  it('sends audio chunks successfully', async () => {
    recorder = new ElectronVoiceRecorder({})
    await recorder.start()

    // Simulate audio chunk from script processor
    if (mockProcessor.onaudioprocess) {
      const float32Array = new Float32Array([1.0, -1.0, 0.5])
      mockProcessor.onaudioprocess({
        inputBuffer: {
          getChannelData: () => float32Array,
        },
      })
      expect(window.electronAPI!.sendAudioChunk).toHaveBeenCalled()

      // Verify int16 conversion
      const bufferArg = vi.mocked(window.electronAPI!.sendAudioChunk).mock.calls[0][0]
      const int16Array = new Int16Array(bufferArg)
      expect(int16Array[0]).toBe(32767)
      expect(int16Array[1]).toBe(-32768)
      expect(int16Array[2]).toBe(16383)
    }
  })

  it('handles partial and final results from IPC', async () => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let partialCallback: any
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let finalCallback: any

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(window.electronAPI!.onVoicePartial).mockImplementation((cb: any) => {
      partialCallback = cb
    })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    vi.mocked(window.electronAPI!.onVoiceFinal).mockImplementation((cb: any) => {
      finalCallback = cb
    })

    recorder = new ElectronVoiceRecorder({
      onResult: (text: string, confidence?: number, isFinal?: boolean): void => {
        results.push({ text, confidence, isFinal })
      },
    })

    await recorder.start()

    expect(partialCallback).toBeDefined()
    expect(finalCallback).toBeDefined()

    partialCallback('hello')
    expect(results).toHaveLength(1)
    expect(results[0]).toStrictEqual({ text: 'hello', confidence: 1.0, isFinal: false })

    finalCallback('hello world')
    expect(results).toHaveLength(2)
    expect(results[1]).toStrictEqual({ text: 'hello world', confidence: 1.0, isFinal: true })
    // After final callback, it should abort/clean up and set state to idle
    expect(recorder.state).toBe('idle')
  })
})
