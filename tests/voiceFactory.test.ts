import { describe, it, expect, vi, beforeEach } from 'vitest'
import { createVoiceRecorder, isSpeechSupported } from '../src/services/voiceFactory'
import * as platform from '../src/utils/platform'

// Mock platform module
vi.mock('../src/utils/platform', () => ({
  isElectron: vi.fn(),
  isCapacitorNative: vi.fn(),
}))

describe('Voice Adapter Routing (E4-06)', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  describe('createVoiceRecorder', () => {
    it('throws error when not Capacitor or Electron', () => {
      vi.mocked(platform.isCapacitorNative).mockReturnValue(false)
      vi.mocked(platform.isElectron).mockReturnValue(false)

      expect(() => createVoiceRecorder({})).toThrow(
        'Voice recognition is only supported on Desktop and Android/iOS.'
      )
    })

    it('recognizes Capacitor Native environment', () => {
      vi.mocked(platform.isCapacitorNative).mockReturnValue(true)
      vi.mocked(platform.isElectron).mockReturnValue(false)

      const recorder = createVoiceRecorder({})
      expect(recorder.constructor.name).toBe('CapacitorVoiceRecorder')
    })

    it('recognizes Electron environment', () => {
      vi.mocked(platform.isCapacitorNative).mockReturnValue(false)
      vi.mocked(platform.isElectron).mockReturnValue(true)

      // Need to stub window.electronAPI for the constructor
      vi.stubGlobal('window', { electronAPI: {} })
      const recorder = createVoiceRecorder({})
      expect(recorder.constructor.name).toBe('ElectronVoiceRecorder')
      vi.unstubAllGlobals()
    })
  })

  describe('isSpeechSupported', () => {
    it('returns true if Capacitor Native', () => {
      vi.mocked(platform.isCapacitorNative).mockReturnValue(true)
      vi.mocked(platform.isElectron).mockReturnValue(false)
      expect(isSpeechSupported()).toBe(true)
    })

    it('returns true if Electron', () => {
      vi.mocked(platform.isCapacitorNative).mockReturnValue(false)
      vi.mocked(platform.isElectron).mockReturnValue(true)
      expect(isSpeechSupported()).toBe(true)
    })

    it('returns false on web/unsupported', () => {
      vi.mocked(platform.isCapacitorNative).mockReturnValue(false)
      vi.mocked(platform.isElectron).mockReturnValue(false)
      expect(isSpeechSupported()).toBe(false)
    })
  })
})
