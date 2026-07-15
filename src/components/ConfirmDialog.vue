<template>
  <Teleport to="body">
    <div v-if="open" class="dialog-layer" @click.self="$emit('cancel')">
      <section class="dialog" role="dialog" aria-modal="true" :aria-labelledby="id">
        <div class="dialog-icon" :class="tone"><component :is="tone === 'danger' ? TriangleAlert : CircleHelp" :size="22" /></div>
        <h2 :id="id">{{ title }}</h2>
        <p>{{ message }}</p>
        <div class="dialog-actions">
          <button class="secondary-btn" @click="$emit('cancel')">取消</button>
          <button :class="tone === 'danger' ? 'danger-btn' : 'primary-btn'" @click="$emit('confirm')">{{ confirmText }}</button>
        </div>
      </section>
    </div>
  </Teleport>
</template>

<script setup>
import { CircleHelp, TriangleAlert } from 'lucide-vue-next'
defineProps({ open: Boolean, title: String, message: String, confirmText: { type: String, default: '确认' }, tone: { type: String, default: 'normal' } })
defineEmits(['confirm', 'cancel'])
const id = `dialog-${Math.random().toString(36).slice(2)}`
</script>
