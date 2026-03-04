import type { VoiceRecorderOptions, IVoiceRecorder } from './voiceAdapter'
import { CapacitorVoiceRecorder } from './capacitorVoiceRecorder'
import { ElectronVoiceRecorder } from './electronVoiceRecorder'
import { isCapacitorNative, isElectron } from '../utils/platform'

export function createVoiceRecorder(options: VoiceRecorderOptions): IVoiceRecorder {
  if (isCapacitorNative()) {
    return new CapacitorVoiceRecorder(options)
  } else if (isElectron()) {
    return new ElectronVoiceRecorder(options)
  }

  throw new Error('Voice recognition is only supported on Desktop and Android/iOS.')
}

export function isSpeechSupported(): boolean {
  return isCapacitorNative() || isElectron()
}
