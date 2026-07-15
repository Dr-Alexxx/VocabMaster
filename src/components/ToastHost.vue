<template>
  <Teleport to="body">
    <div class="toast-region" aria-live="polite">
      <TransitionGroup name="toast">
        <button v-for="item in toastState.items" :key="item.id" class="toast" :class="item.type" @click="dismiss(item.id)">
          <CircleCheck v-if="item.type === 'success'" :size="18" />
          <CircleAlert v-else-if="item.type === 'error'" :size="18" />
          <Info v-else :size="18" />
          <span>{{ item.message }}</span>
        </button>
      </TransitionGroup>
    </div>
  </Teleport>
</template>

<script setup>
import { CircleAlert, CircleCheck, Info } from 'lucide-vue-next'
import { toastState, useToast } from '@/composables/useToast.js'
const { dismiss } = useToast()
</script>
