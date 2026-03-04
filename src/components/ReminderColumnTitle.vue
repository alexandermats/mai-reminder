<template>
  <div class="column-title" data-test="reminder-title-col" :title="title">
    <h2 class="title-text">{{ title }}</h2>
  </div>
</template>

<script setup lang="ts">
defineProps<{ title: string }>()
</script>

<style scoped>
.column-title {
  display: flex;
  align-items: center;
  overflow: hidden;
  flex: 1;
  min-width: 0;
}
.title-text {
  font-weight: 500;
  font-size: 1.05rem;
  margin: 0;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
  overflow: hidden;
  white-space: normal;
  width: 100%;
}
</style>
