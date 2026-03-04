<template>
  <ion-segment :value="modelValue" data-test="view-mode-toggle" @ion-change="handleChange">
    <ion-segment-button value="list" data-test="list-view-btn">
      <ion-icon :icon="listOutline"></ion-icon>
    </ion-segment-button>
    <ion-segment-button value="calendar" data-test="calendar-view-btn">
      <ion-icon :icon="calendarOutline"></ion-icon>
    </ion-segment-button>
  </ion-segment>
</template>

<script setup lang="ts">
import { IonSegment, IonSegmentButton, IonIcon } from '@ionic/vue'
import { listOutline, calendarOutline } from 'ionicons/icons'

defineProps<{
  modelValue: 'list' | 'calendar'
}>()

import type { SegmentCustomEvent } from '@ionic/vue'

const emit = defineEmits<{
  (e: 'update:modelValue', value: 'list' | 'calendar'): void
}>()

const handleChange = (event: SegmentCustomEvent) => {
  emit('update:modelValue', event.detail.value as 'list' | 'calendar')
}
</script>

<style scoped>
ion-segment {
  margin-y: 8px;
  width: 100%;
}
</style>
