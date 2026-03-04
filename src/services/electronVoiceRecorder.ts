import type { IVoiceRecorder, VoiceState, VoiceRecorderOptions } from './voiceAdapter'

export class ElectronVoiceRecorder implements IVoiceRecorder {
  private _state: VoiceState = 'idle'
  private options: VoiceRecorderOptions
  private audioContext: AudioContext | null = null
  private mediaStream: MediaStream | null = null
  private processor: ScriptProcessorNode | null = null
  private source: MediaStreamAudioSourceNode | null = null

  constructor(options: VoiceRecorderOptions = {}) {
    this.options = options
    if (typeof window === 'undefined' || !window.electronAPI) {
      throw new Error('Electron API not found')
    }
  }

  private setState(state: VoiceState) {
    this._state = state
    if (this.options.onStateChange) {
      this.options.onStateChange(state)
    }
  }

  get state(): VoiceState {
    return this._state
  }

  setLanguage(lang: string): void {
    this.options.lang = lang
  }

  async start(): Promise<void> {
    this.setState('listening')

    try {
      const langPrefix = this.options.lang?.split('-')[0] || 'en'
      window.electronAPI!.startVoice(langPrefix)

      this.mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true })
      this.audioContext = new window.AudioContext({ sampleRate: 16000 })
      this.source = this.audioContext.createMediaStreamSource(this.mediaStream)
      this.processor = this.audioContext.createScriptProcessor(4096, 1, 1)

      this.source.connect(this.processor)
      this.processor.connect(this.audioContext.destination)

      this.processor.onaudioprocess = (e) => {
        const float32Data = e.inputBuffer.getChannelData(0)
        const int16Data = new Int16Array(float32Data.length)
        for (let i = 0; i < float32Data.length; i++) {
          const s = Math.max(-1, Math.min(1, float32Data[i]))
          int16Data[i] = s < 0 ? s * 0x8000 : s * 0x7fff
        }
        window.electronAPI!.sendAudioChunk(int16Data.buffer)
      }

      window.electronAPI!.onVoicePartial((text: string) => {
        if (this.options.onResult) {
          this.options.onResult(text, 1.0, false)
        }
      })

      window.electronAPI!.onVoiceFinal((text: string) => {
        if (this.options.onResult) {
          this.options.onResult(text, 1.0, true)
        }
        this.abort()
      })
    } catch (error) {
      this.setState('error')
      if (this.options.onError) {
        this.options.onError(error instanceof Error ? error : new Error(String(error)))
      }
      this.cleanup()
    }
  }

  stop(): void {
    window.electronAPI!.stopVoice()
    if (this._state === 'listening') {
      this.setState('processing')
    }
  }

  abort(): void {
    window.electronAPI!.stopVoice()
    this.setState('idle')
    this.cleanup()
  }

  private cleanup() {
    if (this.processor) {
      this.processor.disconnect()
      this.processor.onaudioprocess = null
      this.processor = null
    }
    if (this.source) {
      this.source.disconnect()
      this.source = null
    }
    if (this.audioContext) {
      this.audioContext.close()
      this.audioContext = null
    }
    if (this.mediaStream) {
      this.mediaStream.getTracks().forEach((track) => track.stop())
      this.mediaStream = null
    }
    window.electronAPI!.removeVoiceListeners()
  }
}
