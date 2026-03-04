<template>
  <div
    class="calendar-container"
    role="application"
    aria-label="Calendar for selecting reminder dates"
  >
    <VDatePicker
      :model-value="selectedDate"
      :attributes="attributes"
      transparent
      borderless
      expanded
      :is-dark="isDark"
      :first-day-of-week="2"
      :locale="{ id: locale, masks: { weekdays: locale === 'en' ? 'WWW' : 'WW' } }"
      @dayclick="onDayClick"
    />
  </div>
</template>

<script setup lang="ts">
import { computed, ref, watch, onMounted, onUnmounted } from 'vue'
import { useI18n } from 'vue-i18n'
import type { Reminder } from '../types/reminder'
import { DatePicker as VDatePicker } from 'v-calendar'
import 'v-calendar/style.css'

const { t, locale } = useI18n()

const props = defineProps<{
  reminders: Reminder[]
  modelValue: Date | null
}>()

const emit = defineEmits<{
  (e: 'update:modelValue', value: Date | null): void
}>()

const selectedDate = ref<Date | null>(props.modelValue)

watch(
  () => props.modelValue,
  (newVal) => {
    selectedDate.value = newVal
  }
)

const onDayClick = (day: { date: Date }) => {
  // If clicking the already selected date, deselect it
  if (selectedDate.value && day.date.toDateString() === selectedDate.value.toDateString()) {
    selectedDate.value = null
    emit('update:modelValue', null)
  } else {
    selectedDate.value = day.date
    emit('update:modelValue', day.date)
  }
}

const isDark = ref(false)

const updateDarkMode = () => {
  isDark.value = document.body.classList.contains('dark')
}

// Store references for cleanup
let mediaQuery: MediaQueryList | null = null
let observer: MutationObserver | null = null

onMounted(() => {
  updateDarkMode()

  // Listen for system theme changes
  mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
  if (mediaQuery.addEventListener) {
    mediaQuery.addEventListener('change', updateDarkMode)
  }

  // Listen for potential manual theme toggles from Ionic (which adds/removes .dark)
  observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      if (mutation.attributeName === 'class') {
        updateDarkMode()
      }
    })
  })
  observer.observe(document.body, { attributes: true })
})

onUnmounted(() => {
  // Cleanup to prevent memory leaks
  if (mediaQuery) {
    mediaQuery.removeEventListener('change', updateDarkMode)
  }
  if (observer) {
    observer.disconnect()
  }
})

const attributes = computed(() => {
  const attrs = []

  // Add a dot for days that have reminders
  // Deduplicate by date string to avoid duplicate key issues in v-calendar internals
  const uniqueDates = [
    ...new Set(
      props.reminders
        .map((r) => {
          const d = r.scheduledAt instanceof Date ? r.scheduledAt : new Date(r.scheduledAt)
          if (isNaN(d.getTime())) return null
          return d.toDateString()
        })
        .filter((d): d is string => d !== null)
    ),
  ]

  if (uniqueDates.length > 0) {
    attrs.push({
      key: 'reminder-dots',
      dot: 'blue',
      dates: uniqueDates.map((d) => new Date(d)),
      popover: {
        label: t('reminder.hasReminders'),
      },
    })
  }

  return attrs
})
</script>

<style scoped>
.calendar-container {
  padding: 8px 16px;
  margin-bottom: 16px;
  --vc-font-family: inherit;
}

/* Ensure the calendar integrates nicely with Ionic's theme */
:deep(.vc-container) {
  --vc-bg: transparent;
  --vc-border: none;
}

/* Force visibility of day numbers if they are being washed out */
:deep(.vc-day-content) {
  color: var(--ion-text-color, inherit);
}

:deep(.vc-header .vc-title),
:deep(.vc-weekday) {
  color: var(--ion-text-color, inherit);
  text-transform: capitalize;
}

/* Ensure dots are visible */
:deep(.vc-dot) {
  background-color: var(--ion-color-primary, #3880ff);
}
</style>
