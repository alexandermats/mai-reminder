<template>
  <ion-app>
    <ion-router-outlet />
  </ion-app>
</template>

<script setup lang="ts">
import { onMounted, onUnmounted } from 'vue'
import { IonApp, IonRouterOutlet } from '@ionic/vue'
import { useNetworkStatus } from './composables/useNetworkStatus'
import { useSettingsStore } from './stores/settings'
import { notificationService } from './services/notificationService'
import { syncEngine } from './services/syncEngine'
import { StatusBar } from '@capacitor/status-bar'
import { isCapacitorNative } from './utils/platform'

// Initialize global network status listeners
useNetworkStatus()

const settingsStore = useSettingsStore()

onMounted(async () => {
  if (isCapacitorNative()) {
    try {
      await StatusBar.setOverlaysWebView({ overlay: false })
      await StatusBar.show()
    } catch (e) {
      console.warn('StatusBar configuration failed', e)
    }
  }

  settingsStore.initialize()
  notificationService.initialize()
  syncEngine.start()
})

onUnmounted(() => {
  syncEngine.stop()
})
</script>

<style>
/* === Global Apple-style Design System === */
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700&display=swap');

:root {
  /* Typography */
  --ion-font-family: 'Inter', -apple-system, BlinkMacSystemFont, 'Helvetica Neue', sans-serif;

  /* iOS system colors */
  --ion-color-primary: #007aff;
  --ion-color-primary-rgb: 0, 122, 255;
  --ion-color-primary-contrast: #ffffff;
  --ion-color-primary-shade: #0062cc;
  --ion-color-primary-tint: #1a88ff;

  /* Backgrounds */
  --ion-background-color: #f2f2f7;
  --ion-background-color-rgb: 242, 242, 247;
  --ion-item-background: #ffffff;

  /* Text */
  --ion-text-color: #1c1c1e;
  --ion-text-color-rgb: 28, 28, 30;
  --ion-color-medium: #8e8e93;
  --ion-color-medium-rgb: 142, 142, 147;

  /* Safe areas */
  --ion-safe-area-bottom: env(safe-area-inset-bottom);
}

/* Glassmorphism headers */
ion-toolbar {
  --background: rgba(242, 242, 247, 0.85);
  -webkit-backdrop-filter: blur(20px);
  backdrop-filter: blur(20px);
}

ion-header {
  box-shadow: none;
}

ion-header::after {
  display: none;
}

ion-header ion-toolbar:last-child {
  --border-width: 0 0 0.5px 0;
  --border-color: rgba(60, 60, 67, 0.12);
}

/* Footer */
ion-footer {
  padding-bottom: env(safe-area-inset-bottom) !important;
  background: transparent;
  box-shadow: none;
}

ion-footer::before {
  display: none;
}

/* Content */
ion-content {
  --padding-bottom: env(safe-area-inset-bottom) !important;
}

ion-app {
  padding-bottom: env(safe-area-inset-bottom);
}

/* iOS-style segment controls */
ion-segment {
  --background: rgba(118, 118, 128, 0.12);
  border-radius: 10px;
  padding: 2px;
}

ion-segment-button {
  --background: transparent;
  --background-checked: #ffffff;
  --color: #3c3c43;
  --color-checked: #1c1c1e;
  --indicator-color: transparent;
  --border-radius: 8px;
  min-height: 32px;
  font-size: 13px;
  font-weight: 500;
  letter-spacing: -0.1px;
  text-transform: none;
  transition: all 0.2s ease;
}

ion-segment-button::part(indicator) {
  display: none;
}

ion-segment-button.segment-button-checked {
  background: #ffffff;
  border-radius: 8px;
  box-shadow:
    0 2px 6px rgba(0, 0, 0, 0.1),
    0 0.5px 1px rgba(0, 0, 0, 0.08);
}

/* iOS-style toggle */
ion-toggle {
  --track-background-checked: #34c759;
}

/* Title styling */
ion-title {
  font-weight: 600;
  letter-spacing: -0.3px;
  font-size: 17px;
}
</style>
