<template>
  <div class="app-shell" :data-theme="settings.effectiveTheme" :data-font="settings.values.fontSize">
    <Sidebar v-if="route.name !== 'study'" :streak="streak" />
    <main :class="{ 'study-main': route.name === 'study' && (!isMobile || immersiveStudy), 'study-setup-main': route.name === 'study' && isMobile && !immersiveStudy }">
      <RouterView v-slot="{ Component }">
        <KeepAlive include="StudyView"><component :is="Component" @dashboard="updateDashboard" @immersive-change="immersiveStudy = $event" /></KeepAlive>
      </RouterView>
    </main>
    <MobileTabs v-if="route.name !== 'study' || (isMobile && !immersiveStudy)" />
    <ToastHost />
  </div>
</template>

<script setup>
import { onMounted, onBeforeUnmount, ref, watch } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import Sidebar from '@/components/Sidebar.vue'
import MobileTabs from '@/components/MobileTabs.vue'
import ToastHost from '@/components/ToastHost.vue'
import { useSettingsStore } from '@/stores/settings.js'
import { api } from '@/services/api.js'
import { useToast } from '@/composables/useToast.js'

const route = useRoute()
const router = useRouter()
const settings = useSettingsStore()
const streak = ref(0)
const immersiveStudy = ref(false)
const isMobile = ref(window.matchMedia('(max-width: 767.98px)').matches)
const toast = useToast()
const mobileQuery = window.matchMedia('(max-width: 767.98px)')
const updateMobile = (event) => { isMobile.value = event.matches }

async function updateDashboard(data) {
  if (data) streak.value = data.streak || 0
  else {
    try { streak.value = (await api.dashboard()).streak || 0 } catch {}
  }
}
onMounted(async () => {
  mobileQuery.addEventListener('change', updateMobile)
  try {
    await Promise.all([settings.load(), updateDashboard()])
    if (!settings.values.onboardingComplete && route.name === 'home') await router.replace({ name: 'onboarding' })
  }
  catch (error) { toast.error(error.message) }
})
onBeforeUnmount(() => mobileQuery.removeEventListener('change', updateMobile))
watch(() => settings.effectiveTheme, (theme) => {
  document.documentElement.style.colorScheme = theme
  document.documentElement.dataset.theme = theme
}, { immediate: true })
watch(() => settings.values.fontSize, (size) => { document.documentElement.dataset.font = size }, { immediate: true })
</script>
