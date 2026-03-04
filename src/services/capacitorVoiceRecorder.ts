import type { IVoiceRecorder, VoiceState, VoiceRecorderOptions } from './voiceAdapter'
import {
  createDefaultAndroidVoiceEngine,
  type AndroidVoiceEngine,
  type VoiceEngineListenerHandle,
} from './androidVoiceEngine'
import { DEFAULT_SILENCE_TIMEOUT_MS } from '../constants/voice'

export class CapacitorVoiceRecorder implements IVoiceRecorder {
  private _state: VoiceState = 'idle'
  private options: VoiceRecorderOptions
  private engine: AndroidVoiceEngine
  private partialListener: VoiceEngineListenerHandle | null = null
  private finalResultListener: VoiceEngineListenerHandle | null = null
  private listeningStateListener: VoiceEngineListenerHandle | null = null
  private lastPartialResult: string = ''
  private lastFinalResult: string = ''
  private startPromise: Promise<unknown> | null = null
  private sessionToken: number = 0
  private sessionClosed: boolean = true
  private isStopping: boolean = false
  private finalResultEmitted: boolean = false
  private silenceTimer: ReturnType<typeof setTimeout> | null = null

  constructor(
    options: VoiceRecorderOptions = {},
    engine: AndroidVoiceEngine = createDefaultAndroidVoiceEngine()
  ) {
    this.options = options
    this.engine = engine
  }

  private setState(state: VoiceState) {
    console.log('[CapacitorVoiceRecorder] State change:', this._state, '->', state)
    this._state = state
    if (this.options.onStateChange) {
      try {
        this.options.onStateChange(state)
      } catch (e) {
        console.error('[CapacitorVoiceRecorder] Error in onStateChange callback:', e)
      }
    }
  }

  get state(): VoiceState {
    return this._state
  }

  setLanguage(lang: string): void {
    this.options.lang = lang
  }

  async start(): Promise<void> {
    if (this._state === 'listening') {
      console.log('[CapacitorVoiceRecorder] Already listening, skipping start')
      return
    }

    await this.resetNativeSession()
    await this.removeListeners()

    this.sessionToken += 1
    const token = this.sessionToken
    this.sessionClosed = false
    this.isStopping = false
    this.finalResultEmitted = false

    console.log('[CapacitorVoiceRecorder] Starting...')
    this.setState('listening')
    this.lastPartialResult = ''
    this.lastFinalResult = ''

    try {
      const available = await this.engine.isAvailable()
      console.log('[CapacitorVoiceRecorder] Available:', available)
      if (!available) {
        throw new Error('Speech recognition is not available on this device')
      }

      const speechRecognition = await this.engine.getPermissionState()
      console.log('[CapacitorVoiceRecorder] Permission status:', speechRecognition)
      if (speechRecognition !== 'granted') {
        const requestedPermission = await this.engine.requestPermission()
        console.log('[CapacitorVoiceRecorder] Permission request result:', requestedPermission)
        if (requestedPermission !== 'granted') {
          throw new Error('Microphone permission not granted')
        }
      }

      this.listeningStateListener = await this.engine.addListeningStateListener(
        (status: string) => {
          if (!this.isCurrentSession(token) || this.sessionClosed) return
          console.log('[CapacitorVoiceRecorder] Listening state:', status)
          if (status === 'stopped' && !this.isStopping) {
            // Let the silence timer own finalization; this event can be noisy/inconsistent.
            this.armSilenceTimer(token)
          }
        }
      )

      this.partialListener = await this.engine.addPartialResultsListener((matches: string[]) => {
        if (!this.isCurrentSession(token) || this.sessionClosed) return
        console.log('[CapacitorVoiceRecorder] Partial results:', matches)
        if (matches.length > 0) {
          this.lastPartialResult = matches[0]
          if (this.options.onResult && !this.finalResultEmitted) {
            this.options.onResult(matches[0], 1.0, false)
          }
          this.armSilenceTimer(token)
        }
      })

      if (this.engine.addFinalResultsListener) {
        this.finalResultListener = await this.engine.addFinalResultsListener((text: string) => {
          if (!this.isCurrentSession(token) || this.sessionClosed) return
          const normalized = text.trim()
          if (!normalized) return

          // On Android, Vosk emits "finalResult" every time acceptWaveform==true (e.g. at the end of every sentence/word gap).
          // We should NOT close the session here. We should just update the final text,
          // emit it to the UI AS A PARTIAL (so the UI doesn't auto-submit), and let the silence timer or stop() button close the session.
          this.lastFinalResult = normalized
          if (this.options.onResult) {
            this.options.onResult(normalized, 1.0, false)
          }
          this.armSilenceTimer(token)
        })
      }

      console.log('[CapacitorVoiceRecorder] Calling SpeechRecognition.start...')

      // Store the promise so we can handle async errors
      if (this.engine.startStream) {
        this.startPromise = this.engine.startStream({
          language: this.options.lang || 'en-US',
          maxResults: 1,
          partialResults: true,
          silenceTimeoutMs: this.options.silenceTimeoutMs,
        })
      } else {
        this.startPromise = this.engine.start({
          language: this.options.lang || 'en-US',
          maxResults: 1,
          partialResults: true,
          silenceTimeoutMs: this.options.silenceTimeoutMs,
        })
      }

      if (this.startPromise) {
        this.startPromise.catch((err: unknown) => {
          if (!this.isCurrentSession(token) || this.sessionClosed) return

          const errorMessage = err instanceof Error ? err.message : String(err)
          console.log('[CapacitorVoiceRecorder] Start async error (may be normal):', errorMessage)

          if (errorMessage.includes('No match') || errorMessage.includes("Didn't understand")) {
            console.log('[CapacitorVoiceRecorder] No speech detected:', errorMessage)
            this.completeSession(token, { state: 'done', emitFinal: false }).catch((error) => {
              console.error('[CapacitorVoiceRecorder] Failed to complete no-speech session:', error)
            })
            return
          }

          this.completeSession(token, { state: 'error', error: new Error(errorMessage) }).catch(
            (error) => {
              console.error('[CapacitorVoiceRecorder] Failed to complete errored session:', error)
            }
          )
        })
      }

      await this.startPromise
      console.log('[CapacitorVoiceRecorder] SpeechRecognition.start resolved successfully')
    } catch (error) {
      console.error('[CapacitorVoiceRecorder] Start sync error:', error)
      const errorMessage = error instanceof Error ? error.message : String(error)

      if (errorMessage.includes('No match') || errorMessage.includes("Didn't understand")) {
        console.log('[CapacitorVoiceRecorder] Ignoring expected error/timeout:', errorMessage)
        await this.completeSession(token, { state: 'done', emitFinal: false })
        return
      }

      console.error('[CapacitorVoiceRecorder] Actual start error:', errorMessage)
      await this.completeSession(token, { state: 'error', error: new Error(errorMessage) })
    }
  }

  async stop(): Promise<void> {
    console.log('[CapacitorVoiceRecorder] Stopping...')
    if (this._state !== 'listening') {
      console.log('[CapacitorVoiceRecorder] Not listening, skipping stop')
      return
    }

    this.isStopping = true
    const token = this.sessionToken

    // On Android, stop() may hang; finalize UI/session immediately and stop native in background.
    // Ensure we emit final result here if we have any text.
    await this.completeSession(token, { state: 'done', emitFinal: true })

    this.stopNativeWithTimeout(400)
      .then(() => {
        console.log('[CapacitorVoiceRecorder] Background stop finished')
      })
      .catch((error) => {
        console.warn('[CapacitorVoiceRecorder] Background stop timeout/error:', error)
        this.engine.stop().catch(() => {})
      })
      .finally(() => {
        this.isStopping = false
      })
  }

  abort(): void {
    console.log('[CapacitorVoiceRecorder] Aborting...')
    this.sessionToken += 1
    this.sessionClosed = true
    this.isStopping = false
    this.finalResultEmitted = false
    this.startPromise = null
    this.lastFinalResult = ''
    if (this.engine.abort) {
      this.engine.abort().catch(() => {}) // Ignore errors on abort
    } else {
      this.engine.stop().catch(() => {}) // Ignore errors on abort
    }
    this.removeListeners().catch(() => {}) // Ignore errors on abort
    this.clearSilenceTimer()
    this.setState('idle')
    this.lastPartialResult = ''
  }

  private async removeListeners(): Promise<void> {
    if (this.partialListener) {
      await this.partialListener.remove()
      this.partialListener = null
    }
    if (this.finalResultListener) {
      await this.finalResultListener.remove()
      this.finalResultListener = null
    }
    if (this.listeningStateListener) {
      await this.listeningStateListener.remove()
      this.listeningStateListener = null
    }
  }

  private cleanupWebAudio(): void {
    // No-op now since we use native speech recognition instead of WebAudio pipeline
  }

  private async completeSession(
    token: number,
    options: {
      state: Exclude<VoiceState, 'listening' | 'processing'>
      emitFinal?: boolean
      error?: Error
    }
  ): Promise<void> {
    if (!this.isCurrentSession(token) || this.sessionClosed) return

    this.sessionClosed = true
    this.clearSilenceTimer()
    this.cleanupWebAudio()

    if (
      options.emitFinal &&
      (this.lastFinalResult || this.lastPartialResult) &&
      this.options.onResult &&
      !this.finalResultEmitted
    ) {
      const finalText = this.lastFinalResult || this.lastPartialResult
      console.log('[CapacitorVoiceRecorder] Emitting final result from partial:', finalText)
      this.options.onResult(finalText, 1.0, true)
      this.finalResultEmitted = true
    }

    await this.removeListeners()
    // Abort/start could have created a new session while listeners were being removed.
    if (!this.isCurrentSession(token)) return

    if (options.error && this.options.onError) {
      this.options.onError(options.error)
    }

    if (!this.isStopping) {
      // Ensure native engine is stopped if we complete due to silence or error
      if (this.engine.abort) {
        this.engine.abort().catch(() => {})
      } else {
        this.engine.stop().catch(() => {})
      }
    }

    this.setState(options.state)
    this.startPromise = null
  }

  private async stopNativeWithTimeout(timeoutMs: number = 2000): Promise<void> {
    const stopPromise = this.engine.stop()
    const timeoutPromise = new Promise((_, reject) =>
      setTimeout(() => reject(new Error('Stop timeout')), timeoutMs)
    )
    await Promise.race([stopPromise, timeoutPromise])
  }

  private async resetNativeSession(): Promise<void> {
    // Use only timeout-bounded stop calls; some Android builds can hang on stop().
    try {
      await this.stopNativeWithTimeout(350)
    } catch {
      // Ignore: there may be no active native session.
    }

    try {
      await this.engine.clearListeners()
    } catch {
      // Ignore: plugin implementations may not expose listener cleanup reliably.
    }

    this.cleanupWebAudio()

    // Give Android recognizer a small cooldown between sessions.
    await this.pause(120)
  }

  private armSilenceTimer(token: number): void {
    this.clearSilenceTimer()
    const timeoutMs = this.options.silenceTimeoutMs ?? DEFAULT_SILENCE_TIMEOUT_MS
    this.silenceTimer = setTimeout(() => {
      if (!this.isCurrentSession(token) || this.sessionClosed || this.isStopping) return
      this.completeSession(token, { state: 'done', emitFinal: true }).catch((error) => {
        console.error('[CapacitorVoiceRecorder] Failed silence finalization:', error)
      })
    }, timeoutMs)
  }

  private clearSilenceTimer(): void {
    if (!this.silenceTimer) return
    clearTimeout(this.silenceTimer)
    this.silenceTimer = null
  }

  private isCurrentSession(token: number): boolean {
    return token === this.sessionToken
  }

  private async pause(ms: number): Promise<void> {
    await new Promise((resolve) => setTimeout(resolve, ms))
  }
}
