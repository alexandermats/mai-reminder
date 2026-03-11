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

    <ion-content>
      <!-- Title section -->
      <div class="modal-section">
        <div class="section-label">{{ t('reminder.title') }}</div>
        <div class="section-card">
          <ion-item lines="none" class="title-field">
            <ion-input
              v-model="editTitle"
              type="text"
              :placeholder="t('reminder.placeholder')"
              class="title-input"
            ></ion-input>
          </ion-item>
        </div>
      </div>

      <!-- DateTime + days-of-week section -->
      <div class="modal-section">
        <div class="section-label">{{ t('reminder.time') }}</div>
        <div class="section-card">
          <div class="datetime-wrapper">
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
        </div>
      </div>

      <!-- Recurrence section -->
      <div class="modal-section recurrence-container">
        <div class="section-label">{{ t('reminder.recurrence') }}</div>
        <div class="section-card">
          <ion-item lines="none" class="recurrence-item">
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
                :key="locale"
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
                :key="locale"
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
      </div>

      <div v-if="result.confidence < 0.7" class="confidence-warning">
        <ion-icon :icon="warningOutline" color="warning"></ion-icon>
        <p>Low confidence parse. Please verify details.</p>
      </div>

      <div class="bottom-pad"></div>
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
/* === Modal background matches iOS system background === */
ion-content {
  --background: #f2f2f7;
  --padding-top: 0;
  --padding-start: 0;
  --padding-end: 0;
}

/* === Section spacing === */
.modal-section {
  margin: 16px 16px 0;
}

/* === Section label (iOS-style muted header) === */
.section-label {
  font-size: 12px;
  font-weight: 500;
  color: #8e8e93;
  text-transform: uppercase;
  letter-spacing: 0.4px;
  margin-bottom: 6px;
  padding-left: 4px;
}

/* === White card blocks === */
.section-card {
  background: #ffffff;
  border-radius: 14px;
  overflow: hidden;
  border: 0.5px solid rgba(60, 60, 67, 0.08);
  box-shadow: 0 1px 4px rgba(0, 0, 0, 0.04);
}

/* === Title field === */
.title-input {
  --padding-top: 14px;
  --padding-bottom: 14px;
  --padding-start: 14px;
  font-size: 16px;
  font-weight: 400;
  color: #1c1c1e;
  --placeholder-color: #c7c7cc;
  --background: transparent;
}

ion-item.title-field {
  --background: transparent;
  --border-width: 0;
  --inner-border-width: 0;
  --padding-start: 0;
  --inner-padding-end: 0;
}

/* === Datetime wrapper === */
.datetime-wrapper {
  display: flex;
  flex-direction: column;
  gap: 0;
  padding: 0;
  background: #f8f8f8;
}

.datetime-row {
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 100%;
}

.custom-datetime {
  border-radius: 0;
  background: transparent;
  --background: transparent;
  width: auto;
  max-width: 100%;
  margin: 0;
  padding: 0;
}

/* === Days section (hourly days of week) === */
.hourly-days-section {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 8px 14px 14px;
  width: 100%;
  border-top: 0.5px solid rgba(60, 60, 67, 0.08);
}

.days-label {
  font-size: 12px;
  font-weight: 500;
  color: #8e8e93;
  text-transform: uppercase;
  letter-spacing: 0.4px;
}

.days-grid {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.day-btn {
  margin: 0;
  --padding-start: 10px;
  --padding-end: 10px;
  --border-radius: 20px;
  min-width: 42px;
  height: 34px;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: -0.1px;
  /* override generic Ionic blue with iOS blue */
  --color: #007aff;
  --border-color: #007aff;
}

/* === Recurrence description note === */
.recurrence-description {
  color: #8e8e93;
  font-size: 13px;
  padding: 6px 14px 12px;
  display: block;
  text-align: center;
}

/* === Recurrence section === */
.recurrence-container {
  display: flex;
  flex-direction: column;
  gap: 0;
}

.recurrence-item {
  width: 100%;
  --background: transparent;
  --border-width: 0;
  --inner-border-width: 0;
  --padding-start: 14px;
  --inner-padding-end: 14px;
}

.recurrence-horizontal-group {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 100%;
  padding-top: 8px;
  padding-bottom: 8px;
}

.every-label {
  font-size: 14px;
  color: #1c1c1e;
  white-space: nowrap;
}

.narrow-interval-input {
  max-width: 65px;
  min-width: 48px;
  border-bottom: 1.5px solid #007aff;
  --padding-top: 4px;
  --padding-bottom: 4px;
}
.narrow-interval-input::part(native) {
  text-align: center;
  padding-right: 0 !important;
  font-size: 14px;
  font-weight: 500;
  color: #007aff;
}
.narrow-interval-input::part(native)::-webkit-inner-spin-button,
.narrow-interval-input::part(native)::-webkit-outer-spin-button {
  -webkit-appearance: inner-spin-button !important;
  display: block !important;
  opacity: 1 !important;
}

.narrow-day-select {
  --padding-start: 0;
  --padding-end: 4px;
  max-width: fit-content;
  border-bottom: 1.5px solid #007aff;
  font-size: 14px;
  font-weight: 500;
  color: #007aff;
}

.day-of-week-override-select {
  color: #007aff;
  font-size: 14px;
}

.recurrence-select {
  --padding-start: 0;
  width: 100%;
  max-width: 100%;
  font-size: 14px;
  color: #1c1c1e;
}

/* === Confidence warning === */
.confidence-warning {
  display: flex;
  align-items: center;
  gap: 10px;
  background: rgba(255, 159, 10, 0.12);
  padding: 12px 14px;
  border-radius: 12px;
  color: #b25000;
  margin: 12px 16px 0;
}

.confidence-warning p {
  margin: 0;
  font-size: 14px;
  font-weight: 400;
}

/* === Bottom padding === */
.bottom-pad {
  height: 40px;
}
</style>
