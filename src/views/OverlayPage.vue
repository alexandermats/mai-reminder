<template>
  <ion-page class="overlay-page">
    <div class="overlay-wrapper" @keydown.esc="hideOverlay">
      <QuickAddInput @result="handleResult" @error="handleError" />
      <error-notification
        v-for="notification in notifications"
        :key="notification.id"
        :notification="notification"
        @dismiss="dismiss"
      ></error-notification>
    </div>
  </ion-page>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { IonPage, toastController } from '@ionic/vue'
import { checkmarkCircle, alertCircle, warning } from 'ionicons/icons'
import QuickAddInput from '../components/QuickAddInput.vue'
import ErrorNotification from '../components/ErrorNotification.vue'
import { useI18n } from 'vue-i18n'
import { useNotifications } from '../composables/useNotifications'
import { useReminderStore } from '../stores/reminder'
import { useSettingsStore } from '../stores/settings'
import { reminderAdapter as reminderRepository } from '../services/reminderAdapter'
import {
  createReminder,
  ReminderSource,
  ReminderLanguage,
  ReminderParserMode,
} from '../types/reminder'
import type { ParseResult } from '../parser/orchestrator'
import { isParseFailureError } from '../parser/types'
import { applyRecurrenceSnapping } from '../utils/hourlyRecurrence'

const { t } = useI18n()
const store = useReminderStore()
const settingsStore = useSettingsStore()
const { notifications, showError, dismiss } = useNotifications()

async function handleResult(result: ParseResult) {
  try {
    const normalizedResult = applyRecurrenceSnapping(
      result,
      new Date(),
      settingsStore.hourlyReminderStartTime,
      settingsStore.hourlyReminderEndTime
    )

    // Create and persist the reminder
    const reminder = createReminder({
      title: normalizedResult.title,
      originalText: normalizedResult.originalText || '',
      language: (normalizedResult.language as ReminderLanguage) || ReminderLanguage.EN,
      scheduledAt: normalizedResult.scheduledAt,
      source: ReminderSource.TEXT,
      parserMode: (normalizedResult.usedMode as ReminderParserMode) || ReminderParserMode.LOCAL,
      parseConfidence: normalizedResult.confidence,
      recurrenceRule: normalizedResult.recurrenceRule,
    })
    const saved = await reminderRepository.create(reminder)
    store.addReminder(saved)

    showToast(t('reminder.created'), 'success')
    // Small delay to let the user see the toast before hiding
    setTimeout(() => {
      hideOverlay()
    }, 1000)
  } catch (err) {
    handleError(err)
  }
}

async function handleError(err: unknown) {
  showError(err)

  // Show toast for parse failures so user gets immediate feedback (as backup to toast in useNotifications)
  if (isParseFailureError(err)) {
    await showToast(t('errors.parseFailure'), 'warning')
  } else {
    await showToast(err instanceof Error ? err.message : String(err), 'danger')
  }
}

async function showToast(message: string, color: 'success' | 'danger' | 'warning') {
  const toast = await toastController.create({
    message,
    duration: 3000,
    position: 'top',
    cssClass: `apple-toast toast-${color}`,
    icon: color === 'success' ? checkmarkCircle : color === 'danger' ? alertCircle : warning,
  })
  await toast.present()
}

function hideOverlay() {
  if (window.electronAPI && window.electronAPI.hideOverlay) {
    window.electronAPI.hideOverlay()
  }
}

const handleEsc = (e: KeyboardEvent) => {
  if (e.key === 'Escape') {
    hideOverlay()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleEsc)
  settingsStore.initialize().catch((err) => {
    console.warn('[OverlayPage] Failed to initialize settings:', err)
  })
  // Focus the input inside QuickAddInput if possible
  // We'll rely on autofocus or manual focus in E8-02 polish if needed
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleEsc)
})
</script>

<style scoped>
.overlay-page {
  --background: transparent;
  background: transparent !important;
  display: flex;
  align-items: center;
  justify-content: center;
}

.overlay-wrapper {
  width: 100%;
  max-width: 600px;
  background: var(--ion-background-color);
  border-radius: 12px;
  box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
  overflow: hidden;
  border: 1px solid var(--ion-color-light);
}
</style>
