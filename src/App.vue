<template>
  <div class="app-shell" :data-theme="settings.effectiveTheme" :data-font="settings.values.fontSize">
    <Sidebar v-if="route.name !== 'study'" :streak="streak" />
    <main :class="{ 'study-main': route.name === 'study' }"><RouterView @dashboard="updateDashboard" /></main>
    <ToastHost />
  </div>
</template>

<script setup>
import { onMounted, ref, watch } from 'vue'
import { useRoute } from 'vue-router'
import Sidebar from '@/components/Sidebar.vue'
import ToastHost from '@/components/ToastHost.vue'
import { useSettingsStore } from '@/stores/settings.js'
import { api } from '@/services/api.js'
import { useToast } from '@/composables/useToast.js'

const route = useRoute()
const settings = useSettingsStore()
const streak = ref(0)
const toast = useToast()

async function updateDashboard(data) {
  if (data) streak.value = data.streak || 0
  else {
    try { streak.value = (await api.dashboard()).streak || 0 } catch {}
  }
}
onMounted(async () => {
  try { await Promise.all([settings.load(), updateDashboard()]) }
  catch (error) { toast.error(error.message) }
})
watch(() => settings.effectiveTheme, (theme) => {
  document.documentElement.style.colorScheme = theme
  document.documentElement.dataset.theme = theme
}, { immediate: true })
watch(() => settings.values.fontSize, (size) => { document.documentElement.dataset.font = size }, { immediate: true })
</script>
