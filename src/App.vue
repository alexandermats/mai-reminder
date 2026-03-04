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
/* Global CSS for safe area handling on mobile */
:root {
  --ion-safe-area-bottom: env(safe-area-inset-bottom);
}

ion-footer {
  /* Force the footer to respect the safe area at the bottom of the screen */
  padding-bottom: env(safe-area-inset-bottom) !important;
  background: var(--ion-background-color);
}

/* Ensure ALL content areas respect the system navigation bar */
ion-content {
  --padding-bottom: env(safe-area-inset-bottom) !important;
}

/* Fallback for the root app container */
ion-app {
  padding-bottom: env(safe-area-inset-bottom);
}
</style>
