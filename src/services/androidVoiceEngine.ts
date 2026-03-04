import { Capacitor } from '@capacitor/core'
import { CapacitorSpeechRecognitionEngine } from './capacitorSpeechRecognitionEngine'

export type AndroidVoiceEnginePermissionState =
  | 'granted'
  | 'denied'
  | 'prompt'
  | 'prompt-with-rationale'

export interface AndroidVoiceEngineStartOptions {
  language: string
  partialResults: boolean
  maxResults: number
  /** Milliseconds of silence before the utterance is finalised. */
  silenceTimeoutMs?: number
}

export interface VoiceEngineListenerHandle {
  remove: () => void | Promise<void>
}

export interface AndroidVoiceEngine {
  isAvailable(): Promise<boolean>
  getPermissionState(): Promise<AndroidVoiceEnginePermissionState>
  requestPermission(): Promise<AndroidVoiceEnginePermissionState>
  start(options: AndroidVoiceEngineStartOptions): Promise<void>
  startStream?(options: AndroidVoiceEngineStartOptions): Promise<void>
  writeChunk?(base64Data: string): Promise<void>
  stop(): Promise<void>
  abort?(): Promise<void>
  addPartialResultsListener(
    listener: (matches: string[]) => void
  ): Promise<VoiceEngineListenerHandle>
  addFinalResultsListener?(listener: (text: string) => void): Promise<VoiceEngineListenerHandle>
  addListeningStateListener(listener: (status: string) => void): Promise<VoiceEngineListenerHandle>
  clearListeners(): Promise<void>
}

export function createDefaultAndroidVoiceEngine(): AndroidVoiceEngine {
  if (Capacitor.isNativePlatform() && Capacitor.getPlatform() === 'android') {
    return new CapacitorSpeechRecognitionEngine()
  }

  return new CapacitorSpeechRecognitionEngine()
}
