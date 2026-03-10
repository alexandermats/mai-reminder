<template>
  <ion-modal :is-open="isOpen" @did-dismiss="onCancel">
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-button @click="onCancel">{{ t('reminder.cancel') }}</ion-button>
        </ion-buttons>

        <ion-title>{{
          isEditing ? t('reminder.editReminder') : t('reminder.createReminder')
        }}</ion-title>

        <ion-buttons slot="end">
          <ion-button
            id="save-reminder-btn"
            data-test="save-reminder-btn"
            :strong="true"
            color="primary"
            @click="onSave"
          >
            {{ isEditing ? t('reminder.saveChanges') : t('reminder.save') }}
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content class="ion-padding">
      <ion-item lines="full" class="ion-margin-bottom">
        <ion-label position="stacked">{{ t('reminder.title') }}</ion-label>
        <ion-input
          v-model="editTitle"
          type="text"
          :placeholder="t('reminder.placeholder')"
          class="title-input"
        ></ion-input>
      </ion-item>

      <div class="datetime-wrapper">
        <ion-label class="datetime-label">{{ t('reminder.time') }}</ion-label>
        <div class="datetime-row">
          <ion-datetime
            v-model="editDate"
            presentation="date-time"
            :prefer-wheel="true"
            class="custom-datetime"
            :cancel-text="t('reminder.cancel')"
            :done-text="t('reminder.save')"
            :hour-cycle="settingsStore.timeFormat === '12h' ? 'h12' : 'h23'"
            :locale="locale"
          ></ion-datetime>

          <div v-if="recurrenceType === 'hours'" class="hourly-days-section">
            <ion-label id="hourly-days-label" class="days-label">{{
              t('reminder.recurrenceDay', 'Days:')
            }}</ion-label>
            <div class="days-grid" role="group" aria-labelledby="hourly-days-label">
              <ion-button
                v-for="day in dayMap"
                :key="day"
                :color="hourlyRecurrenceDays.includes(day) ? 'primary' : 'medium'"
                :fill="hourlyRecurrenceDays.includes(day) ? 'solid' : 'outline'"
                class="day-btn"
                data-test="hourly-day-btn"
                :aria-pressed="hourlyRecurrenceDays.includes(day)"
                @click="toggleHourlyDay(day)"
              >
                {{ t(`reminder.weekdaysShort.${day.toLowerCase()}`) }}
              </ion-button>
            </div>
          </div>
        </div>

        <ion-note
          v-if="recurrenceDescription"
          class="recurrence-description"
          data-test="recurrence-description"
        >
          {{ recurrenceDescription }}
        </ion-note>
      </div>

      <div class="recurrence-container ion-margin-top">
        <ion-item lines="full" class="recurrence-item">
          <ion-label position="stacked">{{ t('reminder.recurrence') }}</ion-label>
          <div class="recurrence-horizontal-group">
            <span v-if="recurrenceType !== 'none'" class="every-label" aria-hidden="true">{{
              everyLabelText
            }}</span>

            <ion-input
              v-if="['hours', 'days', 'weeks'].includes(recurrenceType)"
              type="number"
              :value="recurrenceInterval"
              data-test="recurrence-interval-input"
              min="1"
              class="narrow-interval-input"
              :aria-label="t('reminder.intervalN')"
              @ion-input="recurrenceInterval = parseInt($event.detail.value || '1', 10) || 1"
            ></ion-input>

            <ion-select
              v-if="recurrenceType === 'dayOfWeek'"
              v-model="recurrenceDay"
              data-test="recurrence-day-select"
              interface="popover"
              :cancel-text="t('reminder.cancel')"
              :ok-text="t('reminder.save')"
              aria-label="Day of week"
              class="narrow-day-select day-of-week-override-select"
            >
              <ion-select-option value="MO">{{
                t('reminder.weekdaysAccusative.mo')
              }}</ion-select-option>
              <ion-select-option value="TU">{{
                t('reminder.weekdaysAccusative.tu')
              }}</ion-select-option>
              <ion-select-option value="WE">{{
                t('reminder.weekdaysAccusative.we')
              }}</ion-select-option>
              <ion-select-option value="TH">{{
                t('reminder.weekdaysAccusative.th')
              }}</ion-select-option>
              <ion-select-option value="FR">{{
                t('reminder.weekdaysAccusative.fr')
              }}</ion-select-option>
              <ion-select-option value="SA">{{
                t('reminder.weekdaysAccusative.sa')
              }}</ion-select-option>
              <ion-select-option value="SU">{{
                t('reminder.weekdaysAccusative.su')
              }}</ion-select-option>
            </ion-select>

            <ion-select
              v-model="recurrenceType"
              data-test="recurrence-type-select"
              class="recurrence-select"
              interface="action-sheet"
              :selected-text="recurrenceSelectText"
              :cancel-text="t('reminder.cancel')"
              :ok-text="t('reminder.save')"
              :aria-label="t('reminder.recurrence')"
            >
              <ion-select-option value="none">{{
                t('reminder.recurrencePickerNone')
              }}</ion-select-option>
              <ion-select-option value="hours">{{ hoursOptionText }}</ion-select-option>
              <ion-select-option value="days">{{ daysOptionText }}</ion-select-option>
              <ion-select-option value="weeks">{{ weeksOptionText }}</ion-select-option>
              <ion-select-option value="dayOfWeek">{{
                t('reminder.unitDayOfWeek')
              }}</ion-select-option>
            </ion-select>
          </div>
        </ion-item>
      </div>

      <div v-if="result.confidence < 0.7" class="confidence-warning ion-margin-top">
        <ion-icon :icon="warningOutline" color="warning"></ion-icon>
        <p>Low confidence parse. Please verify details.</p>
      </div>
    </ion-content>
  </ion-modal>
</template>

<script setup lang="ts">
import { ref, watch, computed } from 'vue'
import {
  IonModal,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonButtons,
  IonButton,
  IonContent,
  IonItem,
  IonLabel,
  IonInput,
  IonDatetime,
  IonIcon,
  IonNote,
  IonSelect,
  IonSelectOption,
} from '@ionic/vue'
import { warningOutline } from 'ionicons/icons'
import { useI18n } from 'vue-i18n'
import type { ParseResult } from '../parser/orchestrator'
import { formatRecurrenceRule } from '../utils/recurrence'
import { RRule } from 'rrule'
import { useSettingsStore } from '../stores/settings'

const props = defineProps<{
  isOpen: boolean
  isEditing: boolean
  result: ParseResult
}>()

const emit = defineEmits<{
  (e: 'save', result: ParseResult): void
  (e: 'cancel'): void
}>()

const { t, locale } = useI18n()
const settingsStore = useSettingsStore()
const editTitle = ref('')
const editDate = ref('')
const recurrenceDescription = ref('')

const recurrenceType = ref('none')
const recurrenceInterval = ref<number | string>(1)
const recurrenceDay = ref('MO')

const safeInterval = computed(() => Math.max(1, parseInt(String(recurrenceInterval.value)) || 1))

const dayMap = ['MO', 'TU', 'WE', 'TH', 'FR', 'SA', 'SU']
const hourlyRecurrenceDays = ref<string[]>([...dayMap])

function toggleHourlyDay(day: string) {
  const index = hourlyRecurrenceDays.value.indexOf(day)
  if (index === -1) {
    hourlyRecurrenceDays.value.push(day)
  } else {
    // Prevent deselecting all days
    if (hourlyRecurrenceDays.value.length > 1) {
      hourlyRecurrenceDays.value.splice(index, 1)
    }
  }
}

// Synchronize state with props when modal opens or result changes
watch(
  () => props.result,
  (newResult) => {
    if (newResult) {
      editTitle.value = newResult.title

      // ion-datetime expects a local ISO string without timezone markers to display local time correctly
      const date = newResult.scheduledAt
      const offset = date.getTimezoneOffset() * 60000
      const localIso = new Date(date.getTime() - offset).toISOString().slice(0, 19)
      editDate.value = localIso
      recurrenceDescription.value = formatRecurrenceRule(newResult.recurrenceRule, t)

      if (newResult.recurrenceRule) {
        try {
          const rule = RRule.fromString(newResult.recurrenceRule)
          if (rule.options.freq === RRule.HOURLY) {
            recurrenceType.value = 'hours'
            recurrenceInterval.value = rule.options.interval || 1
            if (rule.options.byweekday && rule.options.byweekday.length > 0) {
              hourlyRecurrenceDays.value = rule.options.byweekday.map((d: unknown) => {
                const weekdayObj = d as { weekday: number } | number
                const numVal = typeof weekdayObj === 'number' ? weekdayObj : weekdayObj.weekday
                return dayMap[numVal] || 'MO'
              })
            } else {
              hourlyRecurrenceDays.value = [...dayMap]
            }
          } else if (rule.options.freq === RRule.DAILY) {
            recurrenceType.value = 'days'
            recurrenceInterval.value = rule.options.interval || 1
          } else if (rule.options.freq === RRule.WEEKLY) {
            if (rule.options.byweekday && rule.options.byweekday.length > 0) {
              recurrenceType.value = 'dayOfWeek'
              const weekdayObj = rule.options.byweekday[0] as unknown as
                | { weekday: number }
                | number
              const numVal = typeof weekdayObj === 'number' ? weekdayObj : weekdayObj.weekday
              recurrenceDay.value = dayMap[numVal] || 'MO'
            } else {
              recurrenceType.value = 'weeks'
              recurrenceInterval.value = rule.options.interval || 1
            }
          } else {
            recurrenceType.value = 'none'
          }
        } catch {
          recurrenceType.value = 'none'
        }
      } else {
        recurrenceType.value = 'none'
        recurrenceInterval.value = 1
        recurrenceDay.value = 'MO'
        hourlyRecurrenceDays.value = [...dayMap]
      }
    }
  },
  { immediate: true }
)

const recurrenceSelectText = computed(() => {
  switch (recurrenceType.value) {
    case 'none':
      return t('reminder.recurrencePickerNone')
    case 'hours':
      return hoursOptionText.value
    case 'days':
      return daysOptionText.value
    case 'weeks':
      return weeksOptionText.value
    case 'dayOfWeek':
      return t('reminder.unitDayOfWeek')
    default:
      return t('reminder.recurrencePickerNone')
  }
})

const everyLabelText = computed(() => {
  switch (recurrenceType.value) {
    case 'hours':
    case 'days':
      return t('reminder.everyLabelHourDay', safeInterval.value, {
        n: safeInterval.value,
      } as Record<string, unknown>)
    case 'weeks':
      return t('reminder.everyLabelWeek', safeInterval.value, { n: safeInterval.value } as Record<
        string,
        unknown
      >)
    case 'dayOfWeek':
      return t(`reminder.everyPrefix.${recurrenceDay.value.toLowerCase()}`)
    default:
      return ''
  }
})

const hoursOptionText = computed(() =>
  t('reminder.unitHours', safeInterval.value, { n: safeInterval.value } as Record<string, unknown>)
)
const daysOptionText = computed(() =>
  t('reminder.unitDays', safeInterval.value, { n: safeInterval.value } as Record<string, unknown>)
)
const weeksOptionText = computed(() =>
  t('reminder.unitWeeks', safeInterval.value, { n: safeInterval.value } as Record<string, unknown>)
)

function buildRRule(): string | undefined {
  if (recurrenceType.value === 'none') return undefined
  try {
    const options: Partial<import('rrule').Options> = {}
    const intervalNum = Math.max(1, parseInt(String(recurrenceInterval.value)) || 1)

    if (recurrenceType.value === 'hours') {
      options.freq = RRule.HOURLY
      options.interval = intervalNum
      if (hourlyRecurrenceDays.value.length > 0 && hourlyRecurrenceDays.value.length < 7) {
        options.byweekday = hourlyRecurrenceDays.value
          .map((day) => dayMap.indexOf(day))
          .filter((idx) => idx !== -1) as number[]
      }
    } else if (recurrenceType.value === 'days') {
      options.freq = RRule.DAILY
      options.interval = intervalNum
    } else if (recurrenceType.value === 'weeks') {
      options.freq = RRule.WEEKLY
      options.interval = intervalNum
    } else if (recurrenceType.value === 'dayOfWeek') {
      options.freq = RRule.WEEKLY
      const dayIdx = dayMap.indexOf(recurrenceDay.value)
      if (dayIdx !== -1) {
        options.byweekday = [dayIdx]
      }
    }
    const rule = new RRule(options)
    return rule.toString().replace(/^RRULE:/, '')
  } catch {
    return undefined
  }
}

function onSave() {
  emit('save', {
    ...props.result,
    title: editTitle.value,
    scheduledAt: new Date(editDate.value),
    recurrenceRule: buildRRule(),
  })
}

function onCancel() {
  emit('cancel')
}
</script>

<style scoped>
.datetime-wrapper {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 16px;
}

.datetime-row {
  display: flex;
  flex-wrap: wrap;
  gap: 16px;
  align-items: flex-start;
}

.hourly-days-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  flex: 1 1 200px;
}

.days-label {
  font-size: 0.8rem;
  color: var(--ion-color-medium);
}

.days-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
}

.day-btn {
  margin: 0;
  --padding-start: 8px;
  --padding-end: 8px;
  min-width: 40px;
}

.datetime-label {
  font-size: 0.8rem;
  color: var(--ion-color-medium);
}

.custom-datetime {
  border-radius: 6px;
  background: var(--ion-color-light-tint);
  --background: var(--ion-color-light-tint);
}

.recurrence-description {
  color: var(--ion-color-medium-shade);
  font-size: 0.85rem;
}

.title-input {
  --padding-top: 12px;
  --padding-bottom: 12px;
  font-size: 1.1rem;
}

.confidence-warning {
  display: flex;
  align-items: center;
  gap: 8px;
  background: var(--ion-color-warning-tint);
  padding: 12px;
  border-radius: 8px;
  color: var(--ion-color-warning-shade);
}

.confidence-warning p {
  margin: 0;
  font-size: 0.9rem;
}

.recurrence-select {
  --padding-start: 0;
  width: 100%;
  max-width: 100%;
}

.recurrence-container {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.recurrence-item {
  width: 100%;
}

.recurrence-horizontal-group {
  display: flex;
  align-items: center;
  gap: 12px;
  width: 100%;
  padding-top: 8px;
  padding-bottom: 8px;
}

.every-label {
  font-size: 1rem;
  color: var(--ion-text-color);
  white-space: nowrap;
}

.narrow-interval-input {
  max-width: 70px;
  min-width: 50px;
  border-bottom: 1px solid var(--ion-color-medium);
}
.narrow-interval-input::part(native) {
  text-align: center;
  padding-right: 0 !important;
}
.narrow-interval-input::part(native)::-webkit-inner-spin-button,
.narrow-interval-input::part(native)::-webkit-outer-spin-button {
  -webkit-appearance: inner-spin-button !important;
  display: block !important;
  opacity: 1 !important;
}

.narrow-day-select {
  --padding-start: 8px;
  --padding-end: 8px;
  max-width: fit-content;
  border-bottom: 1px solid var(--ion-color-medium);
}

.day-of-week-override-select {
  color: var(--ion-text-color);
  font-size: 1rem;
}
</style>
