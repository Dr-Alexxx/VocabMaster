<template>
  <div class="empty-state">
    <component :is="icon" :size="34" />
    <h3>{{ title }}</h3>
    <p>{{ description }}</p>
    <slot />
  </div>
</template>

<script setup>
import { Inbox } from 'lucide-vue-next'
defineProps({ icon: { type: Object, default: Inbox }, title: String, description: String })
</script>
