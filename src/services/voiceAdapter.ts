export type VoiceState = 'idle' | 'listening' | 'processing' | 'done' | 'error'

export interface VoiceRecorderOptions {
  lang?: string
  /** Milliseconds of silence after last speech before the utterance is finalised. */
  silenceTimeoutMs?: number
  onStateChange?: (state: VoiceState) => void
  onResult?: (text: string, confidence?: number, isFinal?: boolean) => void
  onError?: (error: Error) => void
}

export interface IVoiceRecorder {
  readonly state: VoiceState
  setLanguage(lang: string): void
  start(): void | Promise<void>
  stop(): void | Promise<void>
  abort(): void
}
