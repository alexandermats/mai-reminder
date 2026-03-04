<template>
  <div class="column-datetime" data-test="reminder-time-col">
    <div class="time">{{ timeStr }}</div>
    <div class="date">{{ dateStr }}</div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { fromUTCString } from '../utils/datetime'

const props = defineProps<{ scheduledAt: Date | string }>()
const { locale } = useI18n()

const parsedDate = computed(() => {
  return typeof props.scheduledAt === 'string'
    ? fromUTCString(props.scheduledAt)
    : props.scheduledAt
})

const timeStr = computed(() => {
  return parsedDate.value.toLocaleString(locale.value === 'ru' ? 'ru-RU' : 'en-US', {
    hour: '2-digit',
    minute: '2-digit',
  })
})

const dateStr = computed(() => {
  return parsedDate.value.toLocaleString(locale.value === 'ru' ? 'ru-RU' : 'en-US', {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
  })
})
</script>

<style scoped>
.column-datetime {
  display: flex;
  flex-direction: column;
  justify-content: center;
  min-width: 80px;
}
.time {
  font-size: 1.5rem;
  font-weight: 600;
  line-height: 1.2;
}
.date {
  font-size: 0.85rem;
  color: var(--ion-color-medium);
  margin-top: 2px;
}
</style>
