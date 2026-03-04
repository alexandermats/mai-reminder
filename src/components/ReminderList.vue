<template>
  <div class="reminder-list-container">
    <div
      v-if="displayedReminders.length === 0"
      class="empty-state"
      :class="{ 'compact-empty-state': compactEmptyState }"
      role="status"
      aria-live="polite"
    >
      <ion-icon :icon="notificationsOffOutline" class="empty-icon" aria-hidden="true"></ion-icon>
      <p>{{ t('reminder.noReminders') }}</p>
    </div>

    <ion-list v-else class="modern-list">
      <ion-item
        v-for="reminder in displayedReminders"
        :key="reminder.id"
        data-test="reminder-item"
        class="reminder-item-card"
        :class="{ 'highlight-missed': highlightedIds.has(reminder.id) }"
        lines="none"
      >
        <div class="reminder-grid">
          <div class="reminder-row-top">
            <ReminderColumnDateTime
              class="grid-col-datetime"
              :scheduled-at="reminder.scheduledAt"
            />
            <ReminderColumnTitle class="grid-col-title" :title="reminder.title" />
          </div>
          <div class="reminder-row-bottom">
            <ReminderColumnRecurrence
              class="grid-col-recurrence"
              :recurrence-rule="reminder.recurrenceRule"
            />
            <ReminderColumnActions
              class="grid-col-actions"
              :scheduled-at="reminder.scheduledAt"
              :show-delete="store.filterStatus === ReminderStatus.PENDING"
              @edit="emit('edit', reminder)"
              @cancel="emit('cancel', reminder)"
            />
          </div>
        </div>
      </ion-item>
    </ion-list>
  </div>
</template>

<script setup lang="ts">
import { IonList, IonItem, IonIcon } from '@ionic/vue'
import { notificationsOffOutline } from 'ionicons/icons'
import { useReminderStore } from '../stores/reminder'
import { ReminderStatus } from '../types/reminder'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'

import type { Reminder } from '../types/reminder'

// Import subcomponents
import ReminderColumnDateTime from './ReminderColumnDateTime.vue'
import ReminderColumnRecurrence from './ReminderColumnRecurrence.vue'
import ReminderColumnTitle from './ReminderColumnTitle.vue'
import ReminderColumnActions from './ReminderColumnActions.vue'

const { t } = useI18n()
const store = useReminderStore()

const emit = defineEmits<{
  (e: 'edit', reminder: Reminder): void
  (e: 'cancel', reminder: Reminder): void
}>()

const props = defineProps<{
  filterDate?: Date | null
  compactEmptyState?: boolean
}>()

const displayedReminders = computed(() => {
  if (!props.filterDate) return store.filteredReminders

  return store.filteredReminders.filter((r) => {
    const scheduledAt = r.scheduledAt instanceof Date ? r.scheduledAt : new Date(r.scheduledAt)
    return scheduledAt.toDateString() === props.filterDate!.toDateString()
  })
})

const highlightedIds = computed(() => {
  console.log('[ReminderList] Re-evaluating highlightedIds:', Array.from(store.missedReminderIds))
  return store.missedReminderIds
})
</script>

<style scoped>
.modern-list {
  background: transparent;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.reminder-item-card {
  --background: var(--ion-background-color, #fff);
  --border-radius: 16px;
  --padding-start: 16px;
  --padding-end: 16px;
  --padding-top: 16px;
  --padding-bottom: 16px;
  --inner-padding-end: 0;
  margin: 0;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.04);
  border: 1px solid var(--ion-color-step-100, #f0f0f0);
  transition: all 0.3s ease;
}

.highlight-missed {
  border-color: var(--ion-color-primary, #3880ff) !important;
  --background: rgba(var(--ion-color-primary-rgb, 56, 128, 255), 0.08) !important;
  background: rgba(var(--ion-color-primary-rgb, 56, 128, 255), 0.08) !important;
}

/* Base grid layout */
.reminder-grid {
  display: flex;
  flex-direction: column;
  width: 100%;
  gap: 6px;
}

.reminder-row-top {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
}

.reminder-row-bottom {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  min-width: 0;
}

.empty-state {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  min-height: 200px;
  margin-top: 20vh;
  color: var(--ion-color-medium);
  padding: 2rem;
  text-align: center;
}

.empty-icon {
  font-size: 4rem;
  margin-bottom: 1rem;
  opacity: 0.5;
}

.empty-state.compact-empty-state {
  margin-top: 0.5rem;
  padding: 0.5rem;
  min-height: auto;
}

.empty-state.compact-empty-state .empty-icon {
  display: block;
  font-size: 1.3rem;
  margin-bottom: 0.25rem;
}
</style>
