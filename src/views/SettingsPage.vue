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
      <ion-list>
        <!-- Language Section -->
        <ion-item>
          <ion-label>{{ t('settings.language') }}</ion-label>
          <ion-select
            :value="settingsStore.language"
            :placeholder="t('language.select')"
            @ion-change="onLanguageChange"
          >
            <ion-select-option value="en">{{ t('language.en') }}</ion-select-option>
            <ion-select-option value="ru">{{ t('language.ru') }}</ion-select-option>
          </ion-select>
        </ion-item>

        <ion-item>
          <ion-label>{{ t('settings.timeFormat') }}</ion-label>
          <ion-select :value="settingsStore.timeFormat" @ion-change="onTimeFormatChange">
            <ion-select-option value="12h">{{ t('settings.format12h') }}</ion-select-option>
            <ion-select-option value="24h">{{ t('settings.format24h') }}</ion-select-option>
          </ion-select>
        </ion-item>

        <ion-item>
          <ion-label id="parser-mode-label">{{ t('settings.parserMode') }}</ion-label>
          <ion-toggle
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
        <ion-item lines="none">
          <ion-note>
            {{
              settingsStore.isAIParsingEnabled
                ? settingsStore.cerebrasApiKey
                  ? t('settings.aiParsingDescription')
                  : t('settings.apiKeyMissing')
                : t('settings.localParsingDescription')
            }}
          </ion-note>
        </ion-item>

        <ion-item>
          <ion-label id="fast-save-label">
            <h3>{{ t('settings.fastSave') }}</h3>
            <p id="fast-save-description">{{ t('settings.fastSaveDescription') }}</p>
          </ion-label>
          <ion-toggle
            :checked="settingsStore.fastSave"
            data-test="fast-save-toggle"
            aria-labelledby="fast-save-label"
            aria-describedby="fast-save-description"
            @ion-change="onFastSaveChange"
          />
        </ion-item>

        <ion-item v-if="isElectron()">
          <ion-label id="open-at-login-label">
            <h3>{{ t('settings.openAtLogin') }}</h3>
            <p id="open-at-login-description">{{ t('settings.openAtLoginDescription') }}</p>
          </ion-label>
          <ion-toggle
            :checked="settingsStore.openAtLogin"
            data-test="open-at-login-toggle"
            aria-labelledby="open-at-login-label"
            aria-describedby="open-at-login-description"
            @ion-change="onOpenAtLoginChange"
          />
        </ion-item>

        <ion-item v-if="isElectron()">
          <ion-label position="stacked">
            {{ t('settings.hotkey') }}
            <p>{{ t('settings.hotkeyDescription') }}</p>
          </ion-label>
          <ion-input
            :value="settingsStore.quickAddHotkey"
            :placeholder="t('settings.hotkeyPlaceholder')"
            data-test="hotkey-input"
            @ion-blur="onHotkeyBlur"
          />
        </ion-item>

        <ion-item lines="none">
          <ion-note class="section-note">{{ t('settings.hourlyWindowDescription') }}</ion-note>
        </ion-item>
        <ion-item>
          <ion-label position="stacked">
            <h3 style="font-weight: bold; margin-bottom: 4px">
              {{ t('settings.hourlyWindowSection') }}
            </h3>
            {{ t('settings.hourlyStartTime') }}
          </ion-label>
          <ion-input
            type="time"
            :value="settingsStore.hourlyReminderStartTime"
            data-test="hourly-start-input"
            @ion-change="onHourlyStartChange"
          />
        </ion-item>
        <ion-item>
          <ion-label position="stacked">{{ t('settings.hourlyEndTime') }}</ion-label>
          <ion-input
            type="time"
            :value="settingsStore.hourlyReminderEndTime"
            data-test="hourly-end-input"
            @ion-change="onHourlyEndChange"
          />
        </ion-item>

        <ion-item>
          <ion-label id="cloud-sync-label">
            <p id="cloud-sync-description">
              {{ t('settings.cloudSyncDescription') }}
            </p>
          </ion-label>
          <ion-toggle
            :checked="settingsStore.cloudSyncEnabled"
            data-test="cloud-sync-toggle"
            aria-labelledby="cloud-sync-label"
            aria-describedby="cloud-sync-description"
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
            @click="confirmClearOld"
          >
            {{ t('settings.clearOldReminders') }}
          </ion-button>
          <ion-label class="sent-toggle-label">{{ t('settings.includeSent') }}</ion-label>
          <ion-toggle v-model="includeSent" />
        </ion-item>
        <!-- Advanced Section -->
        <ion-list-header>
          <ion-label>{{ t('settings.advancedSection') }}</ion-label>
        </ion-list-header>
        <ion-item>
          <ion-label position="stacked">
            <h3>{{ t('settings.silenceTimeout') }}</h3>
            <p>{{ t('settings.silenceTimeoutDescription') }}</p>
          </ion-label>
          <ion-input
            type="number"
            :value="settingsStore.silenceTimeoutMs"
            min="500"
            max="10000"
            step="100"
            data-test="silence-timeout-input"
            @ion-blur="onSilenceTimeoutBlur"
          />
        </ion-item>

        <ion-item v-if="isElectron()">
          <ion-label position="stacked">
            <h3>{{ t('settings.notificationDisplayTime') }}</h3>
            <p>{{ t('settings.notificationDisplayTimeDescription') }}</p>
          </ion-label>
          <ion-input
            type="number"
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
          <ion-label>
            <h3>{{ t('settings.version') }}</h3>
            <p>0.3.8</p>
          </ion-label>
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
  IonListHeader,
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

// Announcement text for screen reader notifications
const announcement = ref('')

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

async function onHotkeyBlur(event: CustomEvent) {
  const value = event.detail.value as string
  if (value && value !== settingsStore.quickAddHotkey) {
    await settingsStore.setQuickAddHotkey(value)
    const toast = await toastController.create({
      message: 'Hotkey updated!',
      duration: 2000,
      color: 'success',
      position: 'top',
    })
    await toast.present()
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
    const toast = await toastController.create({
      message: 'Failed to configure Cloud Sync. Check internet or Supabase configuration.',
      duration: 3000,
      color: 'danger',
      position: 'top',
    })
    await toast.present()
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
            const toast = await toastController.create({
              message: 'PIN must be exactly 6 digits.',
              duration: 2000,
              color: 'danger',
              position: 'top',
            })
            await toast.present()
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
        const warningToast = await toastController.create({
          message: `Cloud Sync enabled, but ${result.failed} reminder(s) failed to upload. They will retry on next changes.`,
          duration: 3500,
          color: 'warning',
          position: 'top',
        })
        await warningToast.present()
      } else if (result.pushed > 0) {
        const successToast = await toastController.create({
          message: `Uploaded ${result.pushed} existing reminder(s) to Cloud Sync.`,
          duration: 2200,
          color: 'success',
          position: 'top',
        })
        await successToast.present()
      }
    } catch (error) {
      console.error('Initial cloud backfill failed:', error)
      const errorToast = await toastController.create({
        message:
          'Cloud Sync enabled, but initial upload failed. Existing reminders will sync when updated.',
        duration: 3500,
        color: 'warning',
        position: 'top',
      })
      await errorToast.present()
    }
  }

  const alert = await alertController.create({
    header: t('settings.pairingSuccessTitle'),
    message: t('settings.pairingSuccessMessage'),
    buttons: ['OK'],
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
      buttons: ['OK'],
    })
    await alert.present()
  } catch (err) {
    console.error('Failed to generate PIN:', err)
    const toast = await toastController.create({
      message: 'Failed to generate PIN. Please try again.',
      duration: 3000,
      color: 'danger',
      position: 'top',
    })
    await toast.present()
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
        const toast = await toastController.create({
          message: `Cloud Sync enabled, but ${result.failed} reminder(s) failed to upload.`,
          duration: 3000,
          color: 'warning',
          position: 'top',
        })
        await toast.present()
      }
    } catch (error) {
      console.error('Cloud backfill failed after enabling sync:', error)
      const toast = await toastController.create({
        message: 'Cloud Sync enabled, but initial upload failed. Please try again in a moment.',
        duration: 3000,
        color: 'warning',
        position: 'top',
      })
      await toast.present()
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
      const toast = await toastController.create({
        message: t('settings.clearedToast', { count }),
        duration: 2000,
        color: 'success',
        position: 'top',
      })
      await toast.present()
    } else {
      const toast = await toastController.create({
        message: t('settings.noRemindersToClear'),
        duration: 2000,
        position: 'top',
      })
      await toast.present()
    }
  } catch (err) {
    console.error('Failed to clear old reminders:', err)
    const toast = await toastController.create({
      message: t('errors.general'),
      duration: 3000,
      color: 'danger',
      position: 'top',
    })
    await toast.present()
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

    const toast = await toastController.create({
      message: t('settings.resetSuccessToast'),
      duration: 3000,
      color: 'success',
      position: 'top',
    })
    await toast.present()
  } catch (err) {
    console.error('Failed to reset settings:', err)
    const toast = await toastController.create({
      message: t('errors.general'),
      duration: 3000,
      color: 'danger',
      position: 'top',
    })
    await toast.present()
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
  color: var(--ion-color-medium);
  white-space: normal;
  padding: 2px 0;
}

.clear-data-item {
  --padding-start: 16px;
  --inner-padding-end: 16px;
}

.sent-toggle-label {
  margin-left: 16px;
  font-size: 0.75em;
}

ion-list {
  /* Extra bottom clearance for Android virtual buttons */
  padding-bottom: 40px;
}

/* Screen reader only class - visually hidden but accessible to assistive technologies */
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
