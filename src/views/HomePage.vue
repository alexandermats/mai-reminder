<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-title>{{ t('app.title') }}</ion-title>
        <ion-buttons slot="end">
          <ion-button data-test="settings-btn" @click="router.push('/settings')">
            <ion-icon slot="icon-only" :icon="settingsOutline"></ion-icon>
          </ion-button>
        </ion-buttons>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <div class="header-controls">
        <view-toggle v-model="viewMode"></view-toggle>
        <ion-segment
          v-model="store.filterStatus"
          class="status-segment"
          :aria-label="t('reminder.status.filterByStatus')"
        >
          <ion-segment-button :value="ReminderStatus.PENDING" data-test="pending-segment">
            <ion-label>{{ t('reminder.status.pending') }}</ion-label>
          </ion-segment-button>
          <ion-segment-button :value="ReminderStatus.SENT" data-test="sent-segment">
            <ion-label>
              {{ t('reminder.status.sent') }}
              <span v-if="sentMissedCount > 0" data-test="sent-missed-count" class="sent-count"
                >({{ sentMissedCount }})</span
              >
            </ion-label>
          </ion-segment-button>
          <ion-segment-button :value="ReminderStatus.CANCELLED" data-test="cancelled-segment">
            <ion-label>{{ t('reminder.status.cancelled') }}</ion-label>
          </ion-segment-button>
        </ion-segment>
      </div>

      <calendar-grid
        v-if="viewMode === 'calendar'"
        v-model="selectedDate"
        :reminders="store.filteredReminders"
      ></calendar-grid>

      <reminder-list
        :filter-date="selectedDate"
        :compact-empty-state="viewMode === 'calendar'"
        @edit="onEdit"
        @cancel="onDelete"
        @toggle-priority="onTogglePriority"
      ></reminder-list>

      <confirmation-modal
        v-if="currentParseResult"
        :is-open="isModalOpen"
        :is-editing="editingReminderId !== null"
        :result="currentParseResult"
        @save="onSave"
        @cancel="onCancel"
      ></confirmation-modal>
    </ion-content>

    <ion-footer class="ion-no-border">
      <quick-add-input @result="onParseResult" @error="onParseError"></quick-add-input>
    </ion-footer>

    <error-notification
      v-for="notification in notifications"
      :key="notification.id"
      :notification="notification"
      @dismiss="dismiss"
    ></error-notification>
  </ion-page>
</template>

<script setup lang="ts">
import { computed, ref, onMounted, watch } from 'vue'
import { useRouter } from 'vue-router'
import { Capacitor } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonFooter,
  IonButtons,
  IonButton,
  IonIcon,
  IonSegment,
  IonSegmentButton,
  IonLabel,
  alertController,
  toastController,
} from '@ionic/vue'

import { settingsOutline } from 'ionicons/icons'
import { useI18n } from 'vue-i18n'
import ReminderList from '../components/ReminderList.vue'
import QuickAddInput from '../components/QuickAddInput.vue'
import ConfirmationModal from '../components/ConfirmationModal.vue'
import ErrorNotification from '../components/ErrorNotification.vue'
import ViewToggle from '../components/ViewToggle.vue'
import CalendarGrid from '../components/CalendarGrid.vue'
import { useNotifications } from '../composables/useNotifications'
import { useReminderStore } from '../stores/reminder'
import { useSettingsStore } from '../stores/settings'
import { reminderAdapter as reminderRepository } from '../services/reminderAdapter'
import { isCapacitorNative } from '../utils/platform'
import type { ParseResult } from '../parser/orchestrator'
import { applyRecurrenceSnapping } from '../utils/hourlyRecurrence'
import { alignRecurrenceRuleTime, getNextScheduledAt } from '../services/schedulerService'
import type { Reminder } from '../types/reminder'
import {
  createReminder,
  ReminderLanguage,
  ReminderSource,
  ReminderParserMode,
  ReminderStatus,
} from '../types/reminder'

const { t } = useI18n()
const router = useRouter()
const store = useReminderStore()
const settingsStore = useSettingsStore()

const isModalOpen = ref(false)
const currentParseResult = ref<ParseResult | null>(null)
const editingReminderId = ref<string | null>(null)
const recurringEditScope = ref<'single' | 'series' | null>(null)
const recurringEditSource = ref<Reminder | null>(null)
const viewMode = ref<'list' | 'calendar'>('list')
const selectedDate = ref<Date | null>(null)
const hasPromptedExactAlarmInSession = ref(false)
const sentMissedCount = computed(() => store.sentMissedCount)

watch(viewMode, (newMode) => {
  if (newMode === 'list') {
    selectedDate.value = null
  }
})
const { notifications, showError, showInfo, dismiss } = useNotifications()

onMounted(async () => {
  await store.reconcileStartupReminders()
  await warnIfExactAlarmDisabledOnAndroid()
})

async function warnIfExactAlarmDisabledOnAndroid() {
  if (!isCapacitorNative() || Capacitor.getPlatform() !== 'android') {
    return
  }

  try {
    const setting = await LocalNotifications.checkExactNotificationSetting()
    if (setting.exact_alarm === 'granted') return

    const warningKey = 'errors.exactAlarmDisabled'
    if (!notifications.value.some((notification) => notification.messageKey === warningKey)) {
      showInfo(warningKey)
    }
    await promptToEnableExactAlarmSetting()
  } catch (error) {
    console.warn('[HomePage] Failed to check exact alarm setting:', error)
  }
}

async function promptToEnableExactAlarmSetting() {
  if (hasPromptedExactAlarmInSession.value) return
  hasPromptedExactAlarmInSession.value = true

  const alert = await alertController.create({
    header: t('settings.exactAlarmPromptTitle') || 'Enable exact reminders',
    message:
      t('settings.exactAlarmPromptMessage') ||
      'Open Android settings and enable "Alarms & reminders" for this app to get on-time notifications.',
    buttons: [
      {
        text: t('reminder.cancel') || 'Cancel',
        role: 'cancel',
      },
      {
        text: t('settings.openSystemSettings') || 'Open settings',
        handler: async () => {
          try {
            await LocalNotifications.changeExactNotificationSetting()
          } catch (error) {
            console.warn('[HomePage] Failed to open exact alarm settings:', error)
          }
        },
      },
    ],
  })
  await alert.present()
}

async function onParseResult(result: ParseResult) {
  // E7-03: Fast-save check
  if (settingsStore.fastSave && result.confidence >= 0.8) {
    await onSave(result)
    await showSavedToast()
    return
  }

  currentParseResult.value = result
  editingReminderId.value = null
  isModalOpen.value = true
}

async function showSavedToast() {
  const toast = await toastController.create({
    message: t('reminder.savedToast') || 'Reminder saved!',
    duration: 2000,
    position: 'top',
    color: 'success',
  })
  await toast.present()
}

function onParseError(err: unknown) {
  showError(err)
}

async function onSave(result: ParseResult) {
  try {
    if (editingReminderId.value) {
      if (recurringEditScope.value === 'single' && recurringEditSource.value?.recurrenceRule) {
        await applySingleOccurrenceEdit(recurringEditSource.value, result)
      } else {
        // Update existing (series edit or one-time reminder edit)
        let finalRule = result.recurrenceRule
        let finalScheduledAt = result.scheduledAt
        // If it's a series edit, ensure the anchor time matches the updated scheduledAt time
        if (recurringEditScope.value === 'series' && finalRule) {
          finalRule = alignRecurrenceRuleTime(finalRule, finalScheduledAt)
        }

        // Always normalize hourly recurrences with settings window bounds
        if (finalRule) {
          const normalized = applyRecurrenceSnapping(
            { ...result, scheduledAt: finalScheduledAt, recurrenceRule: finalRule },
            new Date(),
            settingsStore.hourlyReminderStartTime,
            settingsStore.hourlyReminderEndTime
          )
          finalRule = normalized.recurrenceRule ?? finalRule
          finalScheduledAt = normalized.scheduledAt
        }

        const changes: Partial<Reminder> = {
          title: result.title,
          scheduledAt: finalScheduledAt,
          recurrenceRule: finalRule,
          updatedAt: new Date(),
        }

        const targetReminder = store.reminders.find((r) => r.id === editingReminderId.value)
        if (
          targetReminder &&
          [ReminderStatus.SENT, ReminderStatus.CANCELLED, ReminderStatus.DISMISSED].includes(
            targetReminder.status
          )
        ) {
          if (finalScheduledAt.getTime() <= Date.now()) {
            throw new Error('errors.timeMustBeInFuture')
          }
          changes.status = ReminderStatus.PENDING
        }

        const updated = await reminderRepository.update(editingReminderId.value, changes)
        store.updateReminder(updated.id, updated)
      }
    } else {
      // Create new
      const normalizedResult = applyRecurrenceSnapping(
        result,
        new Date(),
        settingsStore.hourlyReminderStartTime,
        settingsStore.hourlyReminderEndTime
      )
      const reminder = createReminder({
        title: normalizedResult.title,
        originalText: normalizedResult.originalText || '',
        language: normalizedResult.language as ReminderLanguage,
        scheduledAt: normalizedResult.scheduledAt,
        source: ReminderSource.TEXT,
        parserMode: normalizedResult.usedMode as ReminderParserMode,
        parseConfidence: normalizedResult.confidence,
        recurrenceRule: normalizedResult.recurrenceRule,
      })
      const saved = await reminderRepository.create(reminder)
      store.addReminder(saved)
    }
    isModalOpen.value = false
    currentParseResult.value = null
    editingReminderId.value = null
    recurringEditScope.value = null
    recurringEditSource.value = null
  } catch (err) {
    showError(err)
  }
}

function onCancel() {
  isModalOpen.value = false
  currentParseResult.value = null
  editingReminderId.value = null
  recurringEditScope.value = null
  recurringEditSource.value = null
}

function onEdit(reminder: Reminder) {
  if (reminder.recurrenceRule) {
    promptRecurringScope({
      onThisOccurrence: () => {
        recurringEditScope.value = 'single'
        recurringEditSource.value = reminder
        openEditModal(reminder, { recurrenceRule: undefined })
      },
      onEntireSeries: () => {
        recurringEditScope.value = 'series'
        recurringEditSource.value = reminder
        openEditModal(reminder)
      },
    })
    return
  }

  recurringEditScope.value = null
  recurringEditSource.value = null
  openEditModal(reminder)
}

function openEditModal(reminder: Reminder, overrides: Partial<ParseResult> = {}) {
  currentParseResult.value = {
    title: reminder.title,
    scheduledAt: reminder.scheduledAt,
    confidence: reminder.parseConfidence || 1,
    usedMode: reminder.parserMode,
    originalText: reminder.originalText,
    language: reminder.language,
    recurrenceRule: reminder.recurrenceRule,
    ...overrides,
  }
  editingReminderId.value = reminder.id
  isModalOpen.value = true
}

async function onDelete(reminder: Reminder) {
  if (reminder.recurrenceRule) {
    promptRecurringScope({
      onThisOccurrence: async () => {
        await showDeleteConfirm(() => skipCurrentOccurrence(reminder))
      },
      onEntireSeries: async () => {
        await showDeleteConfirm(async () => {
          await reminderRepository.update(reminder.id, {
            status: ReminderStatus.CANCELLED,
            updatedAt: new Date(),
          })
          store.updateReminder(reminder.id, { status: ReminderStatus.CANCELLED })
        })
      },
    })
    return
  }

  await showDeleteConfirm(async () => {
    await reminderRepository.update(reminder.id, {
      status: ReminderStatus.CANCELLED,
      updatedAt: new Date(),
    })
    store.updateReminder(reminder.id, { status: ReminderStatus.CANCELLED })
  })
}

async function onTogglePriority(reminder: Reminder) {
  try {
    const newPriority = !reminder.priority
    const updated = await reminderRepository.update(reminder.id, {
      priority: newPriority,
      updatedAt: new Date(),
    })
    store.updateReminder(reminder.id, updated)
  } catch (err) {
    showError(err)
  }
}

async function promptRecurringScope(handlers: {
  onThisOccurrence: () => void | Promise<void>
  onEntireSeries: () => void | Promise<void>
}) {
  const alert = await alertController.create({
    header: t('reminder.editReminder') || 'Edit Reminder',
    message:
      t('reminder.seriesScopePrompt') || 'Update just this occurrence, or the entire series?',
    buttons: [
      { text: t('reminder.cancel') || 'Cancel', role: 'cancel' },
      {
        text: t('reminder.thisOccurrence') || 'This occurrence',
        handler: handlers.onThisOccurrence,
      },
      {
        text: t('reminder.entireSeries') || 'Entire series',
        handler: handlers.onEntireSeries,
      },
    ],
  })
  await alert.present()
}

async function showDeleteConfirm(onConfirmDelete: () => Promise<void>) {
  const alert = await alertController.create({
    header: t('reminder.delete') || 'Delete',
    message: t('reminder.deleteConfirm') || 'Cancel this reminder?',
    buttons: [
      { text: t('reminder.no') || 'No', role: 'cancel' },
      {
        text: t('reminder.yes') || 'Yes',
        role: 'destructive',
        handler: async () => {
          try {
            await onConfirmDelete()
          } catch (err) {
            showError(err)
          }
        },
      },
    ],
  })
  await alert.present()
}

async function applySingleOccurrenceEdit(reminder: Reminder, result: ParseResult) {
  const nextScheduledAt = getNextScheduledAt(reminder)

  if (nextScheduledAt) {
    const seriesUpdated = await reminderRepository.update(reminder.id, {
      scheduledAt: nextScheduledAt,
      status: ReminderStatus.PENDING,
      updatedAt: new Date(),
    })
    store.updateReminder(seriesUpdated.id, seriesUpdated)
  } else {
    const seriesCompleted = await reminderRepository.update(reminder.id, {
      status: ReminderStatus.SENT,
      updatedAt: new Date(),
    })
    store.updateReminder(seriesCompleted.id, seriesCompleted)
  }

  const singleReminder = createReminder({
    title: result.title,
    originalText: result.originalText || reminder.originalText,
    language: (result.language as ReminderLanguage) || reminder.language,
    scheduledAt: result.scheduledAt,
    source: reminder.source,
    parserMode: (result.usedMode as ReminderParserMode) || reminder.parserMode,
    parseConfidence: result.confidence,
    recurrenceRule: undefined,
  })
  const created = await reminderRepository.create(singleReminder)
  store.addReminder(created)
}

async function skipCurrentOccurrence(reminder: Reminder) {
  const nextScheduledAt = getNextScheduledAt(reminder)
  if (nextScheduledAt) {
    const updated = await reminderRepository.update(reminder.id, {
      scheduledAt: nextScheduledAt,
      status: ReminderStatus.PENDING,
      updatedAt: new Date(),
    })
    store.updateReminder(updated.id, updated)
  } else {
    const updated = await reminderRepository.update(reminder.id, {
      status: ReminderStatus.SENT,
      updatedAt: new Date(),
    })
    store.updateReminder(updated.id, updated)
  }
}
</script>

<style scoped>
ion-footer {
  background: transparent;
}

.header-controls {
  padding: 6px 12px 4px;
  background: transparent;
  z-index: 10;
  display: flex;
  flex-direction: column;
  gap: 6px;
  position: sticky;
  top: 0;
}

.status-segment {
  margin-top: 2px;
}

.status-segment :deep(ion-label) {
  font-size: 0.7rem !important;
  font-weight: 500;
  letter-spacing: 0;
  white-space: nowrap;
}

.sent-count {
  margin-left: 3px;
  font-weight: 700;
  color: #ff3b30;
}
</style>
