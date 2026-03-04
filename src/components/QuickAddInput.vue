<template>
  <div class="quick-add-container">
    <form @submit.prevent="handleSubmit">
      <ion-item lines="none" class="input-item" :class="{ 'is-recording': isRecording }">
        <!-- Recording Indicator -->
        <div v-if="isRecording" slot="start" class="recording-indicator">
          <div class="pulsing-circle"></div>
          <span class="listening-text">{{ t('reminder.listening') || 'Listening...' }}</span>
        </div>

        <ion-input
          v-show="!isRecording"
          ref="inputRef"
          v-model="inputText"
          :placeholder="t('reminder.placeholder')"
          :readonly="isParsing"
          class="custom-input"
          @keyup.enter="handleSubmit"
        ></ion-input>

        <!-- Showing interim voice text -->
        <div v-if="isRecording" class="interim-text">
          {{ interimText || '...' }}
        </div>

        <ion-button
          v-if="isRecording"
          slot="end"
          fill="clear"
          color="success"
          type="button"
          data-test="stop-recording-btn"
          :title="t('reminder.stopRecording') || 'Stop recording'"
          @click="stopRecording"
        >
          <ion-icon :icon="checkmarkOutline"></ion-icon>
        </ion-button>
        <ion-button
          v-if="isRecording"
          slot="end"
          fill="clear"
          color="danger"
          type="button"
          data-test="abort-recording-btn"
          :title="t('reminder.abortRecording') || 'Abort recording'"
          @click="abortRecording"
        >
          <ion-icon :icon="closeOutline"></ion-icon>
        </ion-button>

        <ion-button
          v-else-if="!inputText.trim() && !isParsing"
          slot="end"
          fill="clear"
          class="mic-button"
          type="button"
          data-test="start-recording-btn"
          :disabled="!isSpeechSupported"
          @click="startRecording"
        >
          <ion-icon :icon="micOutline"></ion-icon>
        </ion-button>

        <ion-button
          v-else
          slot="end"
          fill="clear"
          type="submit"
          class="ion-button"
          data-test="quick-add-submit-btn"
          :disabled="!inputText.trim() || isParsing"
        >
          <ion-spinner v-if="isParsing" name="crescent"></ion-spinner>
          <ion-icon v-else :icon="sendOutline"></ion-icon>
        </ion-button>
      </ion-item>
    </form>
    <div class="voice-test-hooks" aria-hidden="true">
      <span data-test="voice-test-session-count">{{ voiceTestSessionCount }}</span>
      <span data-test="voice-test-last-language">{{ voiceTestLastLanguage }}</span>
      <span data-test="voice-test-final-count">{{ voiceTestFinalCount }}</span>
      <span data-test="voice-test-last-error">{{ voiceTestLastError }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { ref, computed, onMounted, onUnmounted, watch } from 'vue'
import { IonItem, IonInput, IonButton, IonIcon, IonSpinner, toastController } from '@ionic/vue'
import { sendOutline, micOutline, closeOutline, checkmarkOutline } from 'ionicons/icons'
import { useI18n } from 'vue-i18n'
import { orchestrator } from '../parser/orchestrator'
import { useSettingsStore } from '../stores/settings'
import type { ParseResult } from '../parser/orchestrator'
import type { IVoiceRecorder } from '../services/voiceAdapter'
import {
  createVoiceRecorder,
  isSpeechSupported as checkSpeechSupported,
} from '../services/voiceFactory'
import { isCapacitorNative } from '../utils/platform'

const { t } = useI18n()
const settingsStore = useSettingsStore()
const inputText = ref('')
const isParsing = ref(false)
const inputRef = ref<InstanceType<typeof IonInput> | null>(null)

const isRecording = ref(false)
const interimText = ref('')
const voiceTestSessionCount = ref(0)
const voiceTestLastLanguage = ref('')
const voiceTestFinalCount = ref(0)
const voiceTestLastError = ref('')

const isSpeechSupported = computed(() => checkSpeechSupported())

let recorder: IVoiceRecorder | null = null

watch(
  () => settingsStore.language,
  (newLocale) => {
    if (recorder) {
      recorder.setLanguage(newLocale === 'ru' ? 'ru-RU' : 'en-US')
    }
  }
)

const emit = defineEmits<{
  (e: 'result', result: ParseResult): void
  (e: 'error', error: unknown): void
}>()

function getVoiceErrorDetails(error: unknown): { code: string; message: string } {
  const rawMessage = error instanceof Error ? error.message : String(error)
  const normalized = rawMessage.toLowerCase()

  if (
    normalized.includes('permission') ||
    normalized.includes('not allowed') ||
    normalized.includes('denied')
  ) {
    return {
      code: 'permission_denied',
      message: t('errors.microphonePermissionDenied') || 'Microphone permission denied.',
    }
  }

  if (normalized.includes('stop timeout')) {
    return {
      code: 'stop_timeout',
      message: t('errors.voiceStopTimeout') || 'Voice stop timed out. Try again.',
    }
  }

  if (normalized.includes('no match') || normalized.includes("didn't understand")) {
    return {
      code: 'no_match',
      message: t('errors.voiceNoMatch') || 'No speech recognized. Please speak more clearly.',
    }
  }

  if (normalized.includes('client side error')) {
    return {
      code: 'client_error',
      message: t('errors.voiceClientError') || 'Speech service unavailable on this device.',
    }
  }

  return {
    code: 'generic',
    message: `${t('errors.voiceGeneric') || 'Voice error'}: ${rawMessage}`,
  }
}

async function showVoiceErrorToast(error: unknown): Promise<void> {
  if (!isCapacitorNative()) return

  const details = getVoiceErrorDetails(error)
  console.warn('[QuickAddInput][VoiceError]', details.code, error)

  const toast = await toastController.create({
    message: details.message,
    duration: 3000,
    color: 'danger',
    position: 'bottom',
  })
  await toast.present()
}

async function handleSubmit() {
  const text = inputText.value.trim()
  if (!text || isParsing.value) return

  isParsing.value = true
  try {
    const result = await orchestrator.parse({
      text,
      language: settingsStore.language as 'en' | 'ru',
    })
    emit('result', result)
    inputText.value = ''
  } catch (err) {
    console.error('[QuickAddInput] handleSubmit error:', err)
    emit('error', err)
    // Ensure recording state is reset on parse failure
    isRecording.value = false
    interimText.value = ''
    if (recorder) {
      recorder.abort()
      recorder = null
    }

    focusInput()
  } finally {
    isParsing.value = false
  }
}

function focusInput() {
  setTimeout(() => {
    inputRef.value?.$el.setFocus?.()
  }, 100)
}

async function startRecording() {
  if (!isSpeechSupported.value) {
    const toast = await toastController.create({
      message: t('reminder.voiceUnsupported', 'Voice input is not supported in this browser.'),
      duration: 3000,
      position: 'bottom',
      color: 'warning',
    })
    await toast.present()
    return
  }

  if (!recorder) {
    recorder = createVoiceRecorder({
      lang: settingsStore.language === 'ru' ? 'ru-RU' : 'en-US',
      onStateChange: (state) => {
        if (state === 'listening') {
          isRecording.value = true
          interimText.value = ''
          voiceTestSessionCount.value += 1
          voiceTestLastError.value = ''
        } else if (state === 'idle' || state === 'done' || state === 'error') {
          isRecording.value = false
          // CRITICAL: Reset recorder so fresh listeners are created on next start
          // This prevents accumulation of stale IPC event listeners
          recorder = null
        }
      },
      onResult: (text, _confidence, isFinal) => {
        if (text.trim()) {
          inputText.value = text
        }
        if (isFinal) {
          voiceTestFinalCount.value += 1
          handleSubmit()
        } else {
          interimText.value = text
        }
      },
      onError: (err) => {
        const details = getVoiceErrorDetails(err)
        voiceTestLastError.value = details.code
        showVoiceErrorToast(err).catch((toastError) => {
          console.error('[QuickAddInput] Failed to show voice error toast:', toastError)
        })
        emit('error', err)
      },
    })
  }

  // ensure language is synced before starting
  if (recorder) {
    const nextLanguage = settingsStore.language === 'ru' ? 'ru-RU' : 'en-US'
    recorder.setLanguage(nextLanguage)
    voiceTestLastLanguage.value = nextLanguage
  }

  try {
    console.log('[QuickAddInput] Calling recorder.start()')
    await recorder.start()
  } catch (e) {
    console.error('[QuickAddInput] startRecording sync error:', e)
    await showVoiceErrorToast(e)
    emit('error', e)
    isRecording.value = false
    recorder = null
  }
}

async function stopRecording() {
  console.log('[QuickAddInput] stopRecording clicked, recorder exists:', !!recorder)
  if (recorder) {
    try {
      await recorder.stop()
      console.log('[QuickAddInput] stop() call finished')
    } catch (e) {
      console.error('[QuickAddInput] stopRecording error:', e)
    }
  }
}

function abortRecording() {
  console.log('[QuickAddInput] abortRecording clicked')
  if (recorder) {
    recorder.abort()
    isRecording.value = false
    interimText.value = ''
    recorder = null
  }
}

onMounted(() => {
  voiceTestLastLanguage.value = settingsStore.language === 'ru' ? 'ru-RU' : 'en-US'
})

onMounted(() => {
  // Auto-start voice recording when overlay is shown (via global hotkey)
  if (window.electronAPI?.onOverlayShown) {
    window.electronAPI.onOverlayShown(() => {
      // Small delay to ensure overlay is fully rendered before starting
      setTimeout(() => {
        if (!isRecording.value && !inputText.value.trim()) {
          startRecording()
        }
      }, 100)
    })
  }
})

onUnmounted(() => {
  if (recorder) {
    recorder.abort()
    recorder = null
  }
})
</script>

<style scoped>
.quick-add-container {
  padding: 8px 16px;
  background: var(--ion-background-color);
  border-top: 1px solid var(--ion-color-light);
}

.voice-test-hooks {
  position: absolute;
  width: 1px;
  height: 1px;
  margin: -1px;
  padding: 0;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  clip-path: inset(50%);
  border: 0;
}

.input-item {
  --background: var(--ion-color-light);
  --border-radius: 24px;
  --padding-start: 16px;
  --inner-padding-end: 8px;
  margin-bottom: 0;
  transition: all 0.3s ease;
}

.input-item.is-recording {
  --background: rgba(var(--ion-color-danger-rgb), 0.1);
}

.custom-input {
  --padding-top: 12px;
  --padding-bottom: 12px;
}

ion-button {
  --padding-start: 8px;
  --padding-end: 8px;
  margin: 0;
}

ion-spinner {
  width: 24px;
  height: 24px;
}

.recording-indicator {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-right: 8px;
}

.pulsing-circle {
  width: 12px;
  height: 12px;
  background-color: var(--ion-color-danger);
  border-radius: 50%;
  animation: pulse 1.5s infinite;
}

.listening-text {
  font-size: 0.9em;
  color: var(--ion-color-danger);
  font-weight: 500;
}

.interim-text {
  flex: 1;
  padding: 12px 0;
  color: var(--ion-color-medium);
  font-style: italic;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

@keyframes pulse {
  0% {
    box-shadow: 0 0 0 0 rgba(var(--ion-color-danger-rgb), 0.7);
  }
  70% {
    box-shadow: 0 0 0 10px rgba(var(--ion-color-danger-rgb), 0);
  }
  100% {
    box-shadow: 0 0 0 0 rgba(var(--ion-color-danger-rgb), 0);
  }
}
</style>
