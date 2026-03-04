import { SpeechRecognition } from '@capgo/capacitor-speech-recognition'
import type {
  AndroidVoiceEngine,
  AndroidVoiceEnginePermissionState,
  AndroidVoiceEngineStartOptions,
  VoiceEngineListenerHandle,
} from './androidVoiceEngine'

export class CapacitorSpeechRecognitionEngine implements AndroidVoiceEngine {
  constructor(private readonly plugin = SpeechRecognition) {}

  async isAvailable(): Promise<boolean> {
    try {
      const result = await this.plugin.available()
      return result.available
    } catch {
      return false
    }
  }

  async getPermissionState(): Promise<AndroidVoiceEnginePermissionState> {
    try {
      const permissions = await this.plugin.checkPermissions()
      return permissions.speechRecognition
    } catch {
      return 'prompt'
    }
  }

  async requestPermission(): Promise<AndroidVoiceEnginePermissionState> {
    try {
      const permissions = await this.plugin.requestPermissions()
      return permissions.speechRecognition
    } catch {
      return 'denied'
    }
  }

  async start(options: AndroidVoiceEngineStartOptions): Promise<void> {
    await this.plugin.start({
      language: options.language,
      maxResults: options.maxResults,
      partialResults: options.partialResults,
      allowForSilence: options.silenceTimeoutMs,
      popup: false,
    })
  }

  async stop(): Promise<void> {
    await this.plugin.stop()
  }

  async abort(): Promise<void> {
    await this.plugin.stop()
  }

  async addPartialResultsListener(
    listener: (matches: string[]) => void
  ): Promise<VoiceEngineListenerHandle> {
    return this.plugin.addListener('partialResults', (event) => {
      // The plugin emits { matches: string[] }
      if (event.matches && event.matches.length > 0) {
        listener(event.matches)
      }
    })
  }

  async addListeningStateListener(
    listener: (status: string) => void
  ): Promise<VoiceEngineListenerHandle> {
    return this.plugin.addListener('listeningState', (event) => {
      // The plugin emits { status: 'started' | 'stopped' }
      listener(event.status)
    })
  }

  async clearListeners(): Promise<void> {
    await this.plugin.removeAllListeners()
  }
}
