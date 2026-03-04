import { ref } from 'vue'
import { isNetworkError, isTimeoutError, isParseFailureError } from '../parser/types'

export interface AppNotification {
  id: string
  type: 'offline' | 'rate-limit' | 'parse-failure' | 'general' | 'info'
  messageKey: string
  duration: number
}

const notifications = ref<AppNotification[]>([])

export function useNotifications() {
  function addNotification(type: AppNotification['type'], messageKey: string) {
    const id = crypto.randomUUID()
    const notification: AppNotification = {
      id,
      type,
      messageKey,
      duration: 5000,
    }
    notifications.value.push(notification)
  }

  function showError(error: unknown) {
    console.error('[Notification]', error)

    if (isNetworkError(error)) {
      addNotification('offline', 'errors.offline')
    } else if (isTimeoutError(error)) {
      addNotification('rate-limit', 'errors.rateLimit')
    } else if (isParseFailureError(error)) {
      addNotification('parse-failure', 'errors.parseFailure')
    } else {
      addNotification('general', 'errors.general')
    }
  }

  function showInfo(messageKey: string) {
    addNotification('info', messageKey)
  }

  function dismiss(id: string) {
    const idx = notifications.value.findIndex((n) => n.id === id)
    if (idx !== -1) {
      notifications.value.splice(idx, 1)
    }
  }

  return {
    notifications,
    showError,
    showInfo,
    dismiss,
  }
}
