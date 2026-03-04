<template>
  <ion-toast
    :is-open="true"
    position="top"
    :message="t(notification.messageKey)"
    :duration="notification.duration"
    :color="color"
    @did-dismiss="$emit('dismiss', notification.id)"
  ></ion-toast>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { IonToast } from '@ionic/vue'
import { useI18n } from 'vue-i18n'
import type { AppNotification } from '../composables/useNotifications'

const props = defineProps<{
  notification: AppNotification
}>()

defineEmits<{
  (e: 'dismiss', id: string): void
}>()

const { t } = useI18n()

const color = computed(() => {
  switch (props.notification.type) {
    case 'offline':
    case 'rate-limit':
      return 'warning'
    case 'parse-failure':
      return 'medium'
    case 'general':
      return 'danger'
    case 'info':
      return 'primary'
    default:
      return 'dark'
  }
})
</script>
