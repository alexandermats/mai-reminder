<template>
  <div class="column-recurrence" data-test="reminder-recurrence-col">
    <div v-if="recurrenceRule" class="recurring-indicator" data-test="recurring-indicator">
      <ion-icon :icon="repeatOutline" aria-hidden="true"></ion-icon>
      <span class="recurrence-text">{{ formatRecurrenceRule(recurrenceRule, t) }}</span>
    </div>
    <div v-else class="once-indicator" data-test="once-indicator">
      <span class="recurrence-text">{{ t('reminder.once', 'Once') }}</span>
    </div>
  </div>
</template>

<script setup lang="ts">
import { IonIcon } from '@ionic/vue'
import { repeatOutline } from 'ionicons/icons'
import { useI18n } from 'vue-i18n'
import { formatRecurrenceRule } from '../utils/recurrence'

defineProps<{ recurrenceRule?: string }>()
const { t } = useI18n()

// Add default translation fallback for 'reminder.once'
if (!t('reminder.once')) {
  // Wait, vue-i18n uses the second argument as a fallback string for missing keys if configured,
  // but it's safe to just rely on the fallback syntax in the template: t('key', 'Default')
}
</script>

<style scoped>
.column-recurrence {
  display: flex;
  align-items: center;
  white-space: nowrap;
  min-width: 0; /* allows element to shrink and trigger ellipsis */
  max-width: 100%;
}
.recurring-indicator,
.once-indicator {
  display: inline-flex;
  align-items: center;
  font-size: 0.75rem;
  color: var(--ion-color-medium);
  background: rgba(var(--ion-color-medium-rgb, 146, 148, 156), 0.1);
  padding: 3px 8px;
  border-radius: 12px;
  font-weight: 500;
  max-width: 100%;
  overflow: hidden;
  box-sizing: border-box;
}
.once-indicator {
  opacity: 0.6;
}
.recurring-indicator ion-icon {
  margin-right: 6px;
  font-size: 1rem;
}
.recurrence-text {
  text-overflow: ellipsis;
  overflow: hidden;
}
</style>
