import { ref } from 'vue'
import { useNotifications } from './useNotifications'

// Keep track of whether we've initialized listeners
let initialized = false

export function useNetworkStatus() {
  const isOnline = ref(typeof navigator !== 'undefined' ? navigator.onLine : true)
  const notifications = useNotifications()

  function handleOnline() {
    isOnline.value = true
    notifications.showInfo('errors.online')
  }

  function handleOffline() {
    isOnline.value = false
    notifications.showError({ kind: 'NetworkError', message: 'Device went offline' })
  }

  if (!initialized && typeof window !== 'undefined') {
    window.addEventListener('online', handleOnline)
    window.addEventListener('offline', handleOffline)
    initialized = true
  }

  return {
    isOnline,
    // Expose cleanup for tests
    cleanup: () => {
      if (typeof window !== 'undefined') {
        window.removeEventListener('online', handleOnline)
        window.removeEventListener('offline', handleOffline)
      }
      initialized = false
    },
  }
}
