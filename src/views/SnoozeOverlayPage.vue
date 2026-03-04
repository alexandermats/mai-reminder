<template>
  <ion-page class="snooze-overlay-page">
    <div v-if="reminder" class="snooze-card">
      <div class="snooze-header">
        <span class="snooze-icon">⏰</span>
        <span class="snooze-title">{{ reminder.title }}</span>
      </div>
      <div class="snooze-buttons">
        <button class="snooze-btn" @click="snooze('snooze-15m')">{{ t('snooze.15min') }}</button>
        <button class="snooze-btn" @click="snooze('snooze-1h')">{{ t('snooze.1hour') }}</button>
        <button class="snooze-btn" @click="snooze('snooze-1d')">{{ t('snooze.1day') }}</button>
        <button class="snooze-btn dismiss-btn" @click="snooze('dismiss')">
          {{ t('snooze.dismiss') }}
        </button>
      </div>
    </div>
  </ion-page>
</template>

<script setup lang="ts">
import { ref, onMounted } from 'vue'
import { IonPage } from '@ionic/vue'
import { useI18n } from 'vue-i18n'

interface ReminderData {
  id: string
  title: string
}

const reminder = ref<ReminderData | null>(null)
const { t } = useI18n()

function snooze(action: string) {
  if (!reminder.value) return
  if (window.electronAPI?.snooze?.sendAction) {
    window.electronAPI.snooze.sendAction(reminder.value.id, action)
  }
}

onMounted(() => {
  if (window.electronAPI?.snooze?.onReminderData) {
    window.electronAPI.snooze.onReminderData((data: ReminderData) => {
      reminder.value = data
    })
  }
  // Request the current pending reminder data from main process
  if (window.electronAPI?.snooze?.requestReminderData) {
    window.electronAPI.snooze.requestReminderData()
  }
})
</script>

<style scoped>
.snooze-overlay-page {
  --background: transparent;
  background: transparent !important;
  display: flex;
  align-items: center;
  justify-content: center;
}

.snooze-card {
  background: var(--ion-background-color, #1a1a2e);
  border: 1px solid var(--ion-color-primary, #667eea);
  border-radius: 16px;
  box-shadow: 0 8px 32px rgba(0, 0, 0, 0.5);
  padding: 20px 24px;
  width: 100%;
  max-width: 500px;
  display: flex;
  flex-direction: column;
  gap: 16px;
}

.snooze-header {
  display: flex;
  align-items: center;
  gap: 10px;
}

.snooze-icon {
  font-size: 1.4rem;
}

.snooze-title {
  font-size: 1rem;
  font-weight: 600;
  color: var(--ion-color-light, #f0f0f0);
  flex: 1;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.snooze-buttons {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.snooze-btn {
  padding: 10px 12px;
  border-radius: 8px;
  border: 1px solid var(--ion-color-primary, #667eea);
  background: rgba(102, 126, 234, 0.15);
  color: var(--ion-color-primary, #667eea);
  font-size: 0.85rem;
  font-weight: 500;
  cursor: pointer;
  transition: background 0.15s ease;
}

.snooze-btn:hover {
  background: rgba(102, 126, 234, 0.3);
}

.dismiss-btn {
  border-color: var(--ion-color-danger, #eb445a);
  background: rgba(235, 68, 90, 0.15);
  color: var(--ion-color-danger, #eb445a);
}

.dismiss-btn:hover {
  background: rgba(235, 68, 90, 0.3);
}
</style>
