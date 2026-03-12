<template>
  <ion-page>
    <ion-header>
      <ion-toolbar>
        <ion-buttons slot="start">
          <ion-back-button default-href="/" />
        </ion-buttons>
        <ion-title>{{ t('settings.title') }}</ion-title>
      </ion-toolbar>
    </ion-header>

    <ion-content>
      <!-- Live region for announcing setting changes to screen readers -->
      <div aria-live="polite" aria-atomic="true" class="sr-only">
        {{ announcement }}
      </div>
      <ion-list :inset="true">
        <!-- Language Section -->
        <ion-item>
          <ion-label>{{ t('settings.language') }}</ion-label>
          <ion-select
            :key="locale"
            :value="settingsStore.language"
            :placeholder="t('language.select')"
            :ok-text="t('reminder.ok')"
            :cancel-text="t('reminder.cancel')"
            @ion-change="onLanguageChange"
          >
            <ion-select-option value="en">{{ t('language.en') }}</ion-select-option>
            <ion-select-option value="ru">{{ t('language.ru') }}</ion-select-option>
          </ion-select>
        </ion-item>

        <ion-item>
          <ion-label>{{ t('settings.timeFormat') }}</ion-label>
          <ion-select
            :key="locale"
            :value="settingsStore.timeFormat"
            :ok-text="t('reminder.ok')"
            :cancel-text="t('reminder.cancel')"
            @ion-change="onTimeFormatChange"
          >
            <ion-select-option value="12h">{{ t('settings.format12h') }}</ion-select-option>
            <ion-select-option value="24h">{{ t('settings.format24h') }}</ion-select-option>
          </ion-select>
        </ion-item>

        <ion-item>
          <ion-label id="parser-mode-label">{{ t('settings.parserMode') }}</ion-label>
          <ion-toggle
            slot="end"
            :checked="settingsStore.isAIParsingEnabled"
            data-test="ai-toggle"
            aria-labelledby="parser-mode-label"
            @ion-change="onParserModeChange"
          />
        </ion-item>
        <ion-item
          v-show="settingsStore.isAIParsingEnabled"
          key="api-key-item"
          data-test="api-key-item"
        >
          <ion-label position="stacked">{{ t('settings.cerebrasApiKey') }}</ion-label>
          <ion-input
            type="password"
            :placeholder="t('settings.apiKeyPlaceholder')"
            :value="settingsStore.cerebrasApiKey"
            data-test="api-key-input"
            @ion-input="onApiKeyInput"
          />
        </ion-item>
        <ion-item
          v-if="settingsStore.isAIParsingEnabled && !settingsStore.cerebrasApiKey"
          lines="none"
        >
          <ion-note>
            {{ t('settings.apiKeyMissing') }}
          </ion-note>
        </ion-item>

        <ion-item>
          <ion-label id="fast-save-label">{{ t('settings.fastSave') }}</ion-label>
          <ion-toggle
            slot="end"
            :checked="settingsStore.fastSave"
            data-test="fast-save-toggle"
            aria-labelledby="fast-save-label"
            @ion-change="onFastSaveChange"
          />
        </ion-item>

        <ion-item v-if="isElectron()">
          <ion-label id="open-at-login-label">{{ t('settings.openAtLogin') }}</ion-label>
          <ion-toggle
            slot="end"
            :checked="settingsStore.openAtLogin"
            data-test="open-at-login-toggle"
            aria-labelledby="open-at-login-label"
            @ion-change="onOpenAtLoginChange"
          />
        </ion-item>

        <ion-item v-if="isElectron()">
          <ion-label>{{ t('settings.hotkey') }}</ion-label>
          <ion-select
            slot="end"
            :key="locale"
            :value="settingsStore.quickAddHotkey"
            :ok-text="t('reminder.ok')"
            :cancel-text="t('reminder.cancel')"
            @ion-change="onHotkeyChange"
          >
            <ion-select-option value="CommandOrControl+Shift+Space">
              {{ isMac ? t('settings.shortcutOption1Mac') : t('settings.shortcutOption1Win') }}
            </ion-select-option>
            <ion-select-option value="Alt+Space">
              {{ isMac ? t('settings.shortcutOption2Mac') : t('settings.shortcutOption2Win') }}
            </ion-select-option>
          </ion-select>
        </ion-item>

        <ion-item lines="none">
          <ion-label>{{ t('settings.hourlyWindowSection') }}</ion-label>
        </ion-item>
        <ion-item class="sub-setting">
          <ion-label>{{ t('settings.hourlyStartTime') }}</ion-label>
          <ion-input
            type="time"
            class="ion-text-right"
            :value="settingsStore.hourlyReminderStartTime"
            data-test="hourly-start-input"
            @ion-change="onHourlyStartChange"
          />
        </ion-item>
        <ion-item class="sub-setting">
          <ion-label>{{ t('settings.hourlyEndTime') }}</ion-label>
          <ion-input
            type="time"
            class="ion-text-right"
            :value="settingsStore.hourlyReminderEndTime"
            data-test="hourly-end-input"
            @ion-change="onHourlyEndChange"
          />
        </ion-item>

        <ion-item>
          <ion-label id="cloud-sync-label">{{ t('settings.cloudSyncDescription') }}</ion-label>
          <ion-toggle
            slot="end"
            :checked="settingsStore.cloudSyncEnabled"
            data-test="cloud-sync-toggle"
            aria-labelledby="cloud-sync-label"
            @ion-change="onCloudSyncChange"
          />
        </ion-item>

        <ion-item v-if="settingsStore.cloudSyncEnabled && settingsStore.cloudSyncUserId">
          <ion-button
            fill="solid"
            color="primary"
            data-test="generate-pin-btn"
            @click="generatePairingPin"
          >
            {{ t('settings.generatePin') }}
          </ion-button>
        </ion-item>

        <ion-item lines="none" class="clear-data-item">
          <ion-button
            fill="outline"
            color="danger"
            data-test="clear-old-reminders-btn"
            style="margin-right: 16px"
            @click="confirmClearOld"
          >
            {{ t('settings.clearOldReminders') }}
          </ion-button>

          <ion-label class="sent-toggle-label" style="text-align: right">
            {{ t('settings.includeSent') }}
          </ion-label>
          <ion-toggle slot="end" v-model="includeSent" />
        </ion-item>

        <ion-item>
          <ion-label>{{ t('settings.silenceTimeout') }}</ion-label>
          <ion-input
            type="number"
            class="ion-text-right"
            :value="settingsStore.silenceTimeoutMs"
            min="500"
            max="10000"
            step="100"
            data-test="silence-timeout-input"
            @ion-blur="onSilenceTimeoutBlur"
          />
        </ion-item>

        <ion-item v-if="isElectron()">
          <ion-label>{{ t('settings.notificationDisplayTime') }}</ion-label>
          <ion-input
            type="number"
            class="ion-text-right"
            :value="settingsStore.notificationDisplayTimeSeconds"
            min="5"
            max="3600"
            step="5"
            data-test="notification-display-time-input"
            @ion-blur="onNotificationDisplayTimeBlur"
          />
        </ion-item>

        <ion-item lines="none" class="clear-data-item">
          <ion-button
            fill="outline"
            color="danger"
            data-test="reset-defaults-btn"
            @click="confirmResetToDefaults"
          >
            {{ t('settings.resetToDefaults') }}
          </ion-button>
        </ion-item>

        <!-- About Section -->

        <ion-item lines="none">
          <ion-label>{{ t('settings.version') }}</ion-label>
          <ion-note slot="end">0.4.0</ion-note>
        </ion-item>
        <ion-item lines="none">
          <ion-note class="ion-text-center">
            {{ t('settings.attribution') }}
          </ion-note>
        </ion-item>
      </ion-list>
    </ion-content>
  </ion-page>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useI18n } from 'vue-i18n'
import {
  IonPage,
  IonHeader,
  IonToolbar,
  IonTitle,
  IonContent,
  IonList,
  IonItem,
  IonLabel,
  IonSelect,
  IonSelectOption,
  IonToggle,
  IonInput,
  IonNote,
  IonButtons,
  IonBackButton,
  IonButton,
  alertController,
  toastController,
} from '@ionic/vue'
import { checkmarkCircle, alertCircle, warning, informationCircle } from 'ionicons/icons'
import { useSettingsStore } from '../stores/settings'
import { useReminderStore } from '../stores/reminder'
import { isElectron } from '../utils/platform'
import type { SupportedLocale } from '../plugins/i18n'
import { syncBackendClient } from '../services/syncBackendClient'
import { encryptionService } from '../services/encryptionService'

const { t, locale } = useI18n()
const settingsStore = useSettingsStore()
const reminderStore = useReminderStore()
const includeSent = ref(true)
const isMac = typeof navigator !== 'undefined' && navigator.userAgent.toLowerCase().includes('mac')

// Announcement text for screen reader notifications
const announcement = ref('')

async function showToast(
  message: string,
  color: 'success' | 'danger' | 'warning' | 'medium' = 'success'
) {
  const toast = await toastController.create({
    message,
    duration: color === 'danger' ? 4000 : 3000,
    position: 'top',
    cssClass: `apple-toast toast-${color}`,
    icon:
      color === 'success'
        ? checkmarkCircle
        : color === 'danger'
          ? alertCircle
          : color === 'warning'
            ? warning
            : informationCircle,
  })
  await toast.present()
}

onMounted(async () => {
  await settingsStore.initialize()
})

function onLanguageChange(event: CustomEvent) {
  const newLocale = event.detail.value as SupportedLocale
  settingsStore.setLanguage(newLocale)
  // Update the global i18n locale
  locale.value = newLocale
}

function onTimeFormatChange(event: CustomEvent) {
  const newFormat = event.detail.value as '12h' | '24h'
  settingsStore.setTimeFormat(newFormat)
}

function onParserModeChange(event: CustomEvent) {
  const isEnabled = event.detail.checked as boolean
  const newMode = isEnabled ? 'llm' : 'local'
  settingsStore.setParserMode(newMode)
  // Announce change to screen readers
  announcement.value = isEnabled ? t('settings.aiParsingEnabled') : t('settings.aiParsingDisabled')
}

function onApiKeyInput(event: CustomEvent) {
  const value = event.detail.value as string
  settingsStore.setCerebrasApiKey(value)
}

function onFastSaveChange(event: CustomEvent) {
  const isEnabled = event.detail.checked as boolean
  settingsStore.setFastSave(isEnabled)
  // Announce change to screen readers
  announcement.value = isEnabled ? t('settings.fastSaveEnabled') : t('settings.fastSaveDisabled')
}

function onOpenAtLoginChange(event: CustomEvent) {
  const isEnabled = event.detail.checked as boolean
  settingsStore.setOpenAtLogin(isEnabled)
  // Announce change to screen readers
  announcement.value = isEnabled
    ? t('settings.openAtLoginEnabled')
    : t('settings.openAtLoginDisabled')
}

async function onHotkeyChange(event: CustomEvent) {
  const value = event.detail.value as string
  if (value && value !== settingsStore.quickAddHotkey) {
    await settingsStore.setQuickAddHotkey(value)
    await showToast(t('settings.hotkeyUpdated'))
  }
}

async function onHourlyStartChange(event: CustomEvent) {
  const value = (event.detail.value as string) || ''
  if (/^\d{2}:\d{2}$/.test(value) && value !== settingsStore.hourlyReminderStartTime) {
    await settingsStore.setHourlyReminderStartTime(value)
  }
}

async function onHourlyEndChange(event: CustomEvent) {
  const value = (event.detail.value as string) || ''
  if (/^\d{2}:\d{2}$/.test(value) && value !== settingsStore.hourlyReminderEndTime) {
    await settingsStore.setHourlyReminderEndTime(value)
  }
}

async function onSilenceTimeoutBlur(event: CustomEvent) {
  const raw = (event.target as HTMLInputElement).value
  const parsed = parseInt(String(raw), 10)
  if (!isNaN(parsed) && parsed !== settingsStore.silenceTimeoutMs) {
    await settingsStore.setSilenceTimeoutMs(parsed)
  }
}

async function onNotificationDisplayTimeBlur(event: CustomEvent) {
  const raw = (event.target as HTMLInputElement).value
  const parsed = parseInt(String(raw), 10)
  if (!isNaN(parsed) && parsed !== settingsStore.notificationDisplayTimeSeconds) {
    await settingsStore.setNotificationDisplayTimeSeconds(parsed)
  }
}

async function promptCloudSyncSetup(event: CustomEvent): Promise<void> {
  // Revert toggle visually until setup succeeds
  if (event.target && 'checked' in event.target) {
    ;(event.target as HTMLInputElement).checked = false
  }

  const alert = await alertController.create({
    header: t('settings.cloudSyncSetupTitle'),
    message: t('settings.cloudSyncSetupMessage'),
    buttons: [
      {
        text: t('reminder.cancel'),
        role: 'cancel',
      },
      {
        text: t('settings.pairExisting'),
        handler: () => {
          promptEnterPairingPin()
        },
      },
      {
        text: t('settings.newAccount'),
        handler: async () => {
          await setupNewAccount()
        },
      },
    ],
  })
  await alert.present()
}

async function setupNewAccount() {
  try {
    await encryptionService.init()
    if (!settingsStore.cloudSyncEncryptionKeyBase64) {
      const key = encryptionService.generateKey()
      await settingsStore.setCloudSyncEncryptionKeyBase64(key)
    }

    syncBackendClient.init()
    const userId = await syncBackendClient.ensureAuthenticated()

    // We must link our new anonymous UID to itself to satisfy the new RLS policies
    await syncBackendClient.linkDeviceToGroup(userId)

    await settingsStore.setCloudSyncUserId(userId)

    await completePairing({ backfillLocalReminders: true })
  } catch (err) {
    console.error('Failed to setup cloud sync:', err)
    await showToast(t('settings.cloudSyncConfigError'), 'danger')
  }
}

async function promptEnterPairingPin() {
  const alert = await alertController.create({
    header: t('settings.enterPin'),
    message: t('settings.pinInstructions'),
    cssClass: 'bold-pin-alert',
    inputs: [
      {
        name: 'pin',
        type: 'tel',
        placeholder: '123456',
        attributes: {
          maxlength: 6,
          inputmode: 'numeric',
          pattern: '[0-9]*',
          enterkeyhint: 'go',
        },
      },
    ],
    buttons: [
      {
        text: t('reminder.cancel'),
        role: 'cancel',
      },
      {
        text: t('settings.pairExisting'),
        role: 'submit',
        handler: async (data) => {
          if (data.pin && data.pin.length === 6) {
            await finalizePairingFromPin(data.pin)
          } else {
            await showToast(t('settings.pinLengthError'), 'danger')
          }
        },
      },
    ],
  })

  await alert.present()

  // Catch 'Enter' or 'Go' key to submit
  alert.addEventListener('keydown', (e: KeyboardEvent) => {
    if (e.key === 'Enter') {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT') {
        const submitBtn = alert.querySelector(
          'button:not(.alert-button-role-cancel)'
        ) as HTMLElement
        if (submitBtn) {
          submitBtn.click()
        }
      }
    }
  })
}

async function finalizePairingFromPin(pin: string) {
  try {
    syncBackendClient.init()
    await syncBackendClient.ensureAuthenticated()
    const encryptedPayload = await syncBackendClient.fetchPairingPayload(pin)

    // Fallback simple payload check
    const payload = JSON.parse(encryptedPayload)
    if (payload.userId && payload.key) {
      // Link this newly minted anonymous session UID to the Primary Sync Group
      await syncBackendClient.linkDeviceToGroup(payload.userId)

      await settingsStore.setCloudSyncUserId(payload.userId)
      await settingsStore.setCloudSyncEncryptionKeyBase64(payload.key)
      await encryptionService.init()

      await completePairing({ backfillLocalReminders: false })
      // Force an immediate fetch so UI updates if reminders tab is visited
      await reminderStore.syncCloud()
    } else {
      throw new Error('Invalid payload structure')
    }
  } catch (err) {
    console.error('PIN Pairing failed:', err)
    const alert = await alertController.create({
      header: t('settings.invalidPinDialogTitle'),
      message: t('settings.invalidPinDialogMessage'),
      buttons: [t('reminder.cancel')],
    })
    await alert.present()
  }
}

async function completePairing(options: { backfillLocalReminders: boolean }) {
  await settingsStore.setCloudSyncEnabled(true)
  announcement.value = t('settings.cloudSyncEnabledText')

  if (options.backfillLocalReminders) {
    try {
      const result = await reminderStore.backfillCloudFromLocal()
      if (result.failed > 0) {
        await showToast(
          t('settings.cloudSyncBackfillPartial', { count: result.failed }, result.failed),
          'warning'
        )
      } else if (result.pushed > 0) {
        await showToast(
          t('settings.cloudSyncBackfillSuccess', { count: result.pushed }, result.pushed),
          'success'
        )
      }
    } catch (error) {
      console.error('Initial cloud backfill failed:', error)
      await showToast(t('settings.cloudSyncBackfillError'), 'warning')
    }
  }

  const alert = await alertController.create({
    header: t('settings.pairingSuccessTitle'),
    message: t('settings.pairingSuccessMessage'),
    buttons: [t('reminder.ok')],
  })
  await alert.present()
}

async function generatePairingPin() {
  try {
    if (!settingsStore.cloudSyncUserId || !settingsStore.cloudSyncEncryptionKeyBase64) return

    const payloadBuffer = JSON.stringify({
      userId: settingsStore.cloudSyncUserId,
      key: settingsStore.cloudSyncEncryptionKeyBase64,
    })

    // Ensure we are signed in first
    syncBackendClient.init()
    await syncBackendClient.ensureAuthenticated()

    const pin = await syncBackendClient.uploadPairingPayload(payloadBuffer)

    const alert = await alertController.create({
      header: t('settings.generatePin'),
      message: t('settings.pinGenerated'),
      cssClass: 'generated-pin-container',
      inputs: [
        {
          name: 'generatedPin',
          type: 'text',
          value: pin,
          attributes: {
            readonly: true,
          },
        },
      ],
      buttons: [t('reminder.ok')],
    })
    await alert.present()
  } catch (err) {
    console.error('Failed to generate PIN:', err)
    await showToast(t('settings.pinGenerationError'), 'danger')
  }
}

async function onCloudSyncChange(event: CustomEvent) {
  const isEnabled = event.detail.checked as boolean

  if (isEnabled && !settingsStore.cloudSyncUserId) {
    await promptCloudSyncSetup(event)
    return
  }

  await settingsStore.setCloudSyncEnabled(isEnabled)

  if (isEnabled) {
    try {
      const result = await reminderStore.backfillCloudFromLocal()
      if (result.failed > 0) {
        await showToast(
          t('settings.cloudSyncBackfillFailedCount', { count: result.failed }, result.failed),
          'warning'
        )
      }
    } catch (error) {
      console.error('Cloud backfill failed after enabling sync:', error)
      await showToast(t('settings.cloudSyncBackfillRetryLater'), 'warning')
    }

    await reminderStore.syncCloud()
  }

  announcement.value = isEnabled
    ? t('settings.cloudSyncEnabledText')
    : t('settings.cloudSyncDisabledText')
}

async function confirmClearOld() {
  const alert = await alertController.create({
    header: t('settings.clearOldReminders'),
    message: t('settings.clearOldConfirm'),
    buttons: [
      {
        text: t('reminder.cancel'),
        role: 'cancel',
      },
      {
        text: t('settings.clearOldReminders'),
        role: 'destructive',
        handler: async () => {
          await handleClearOld()
        },
      },
    ],
  })

  await alert.present()
}

async function handleClearOld() {
  try {
    const count = await reminderStore.clearOldReminders(includeSent.value)

    if (count > 0) {
      await showToast(t('settings.clearedToast', { count }))
    } else {
      await showToast(t('settings.noRemindersToClear'), 'medium')
    }
  } catch (err) {
    console.error('Failed to clear old reminders:', err)
    await showToast(t('errors.general'), 'danger')
  }
}

async function confirmResetToDefaults() {
  const alert = await alertController.create({
    header: t('settings.resetConfirmTitle'),
    message: t('settings.resetConfirmMessage'),
    buttons: [
      {
        text: t('reminder.cancel'),
        role: 'cancel',
      },
      {
        text: t('settings.resetToDefaults'),
        role: 'destructive',
        handler: async () => {
          await handleResetToDefaults()
        },
      },
    ],
  })

  await alert.present()
}

async function handleResetToDefaults() {
  try {
    await settingsStore.resetToDefaults()

    // Sync vue-i18n locale with the suddenly cleared language
    locale.value = settingsStore.language

    await showToast(t('settings.resetSuccessToast'))
  } catch (err) {
    console.error('Failed to reset settings:', err)
    await showToast(t('errors.general'), 'danger')
  }
}
</script>

<style scoped>
ion-item-divider {
  margin-top: 8px;
  margin-bottom: 4px;
}

.section-note {
  font-size: 0.78rem;
  color: #8e8e93;
  white-space: normal;
  padding: 2px 0;
}

.clear-data-item {
  --padding-start: 16px;
  --inner-padding-end: 16px;
}

.sent-toggle-label {
  margin-left: 16px;
  font-size: 0.8rem !important;
  font-weight: 400 !important;
  line-height: 1.2 !important;
  color: #666;
}

ion-list {
  /* Extra bottom clearance */
  padding-bottom: 40px;
}

ion-item {
  --background: #ffffff;
  font-size: 0.88rem;
}

ion-label,
ion-input,
ion-select,
ion-note {
  font-size: 0.88rem !important;
}

ion-item ion-label[position='stacked'] {
  font-size: 0.82rem !important;
  margin-bottom: 4px;
}

.sub-setting {
  --inner-padding-start: 16px;
}

.sub-setting ion-label {
  font-size: 0.8rem !important;
  font-weight: 400 !important;
  line-height: 1.2 !important;
  color: #666;
}

ion-label {
  white-space: nowrap !important;
}

ion-input {
  margin-left: 16px;
  --padding-end: 0;
}

/* Ensure pickers (time/number) don't take too much horizontal space if possible */
ion-input[type='number'],
ion-input[type='time'] {
  max-width: 120px;
}

/* Screen reader only class */
.sr-only {
  position: absolute;
  width: 1px;
  height: 1px;
  padding: 0;
  margin: -1px;
  overflow: hidden;
  clip: rect(0, 0, 0, 0);
  white-space: nowrap;
  border: 0;
}
</style>

<style>
/* Global styles for the Pairing PIN Alert */
.bold-pin-alert .alert-input {
  font-weight: bold;
  font-size: 1.5rem;
  text-align: center;
  letter-spacing: 0.2rem;
}

.generated-pin-container .alert-input {
  font-size: 2.2rem !important;
  font-weight: bold !important;
  text-align: center !important;
  letter-spacing: 0.4rem !important;
  color: var(--ion-color-primary, #3880ff) !important;
  margin-top: 16px !important;
  padding: 12px 0 !important;
}
</style>
