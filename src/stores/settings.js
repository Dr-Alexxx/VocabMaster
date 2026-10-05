import { defineStore } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'
import { api } from '@/services/api.js'

const defaults = {
  theme: 'system', fontSize: 'medium', dailyNewLimit: 20, dailyReviewLimit: 100,
  enableCrossVocabDedup: true, showExamples: true, autoPronounce: false, speakOnReveal: true,
  voiceAccent: 'system', speechRate: 1,
  goalDeadline: '',
  onboardingComplete: false,
  initialEasiness: 2.5, intervalModifier: 1, masteryRepetitions: 5, masteryDays: 21
}

export const useSettingsStore = defineStore('settings', () => {
  const values = reactive({ ...defaults })
  const loaded = ref(false)
  const hasSavedSettings = ref(false)
  const saveState = ref('idle')
  const systemDark = ref(window.matchMedia?.('(prefers-color-scheme: dark)').matches || false)
  let timer
  const effectiveTheme = computed(() => values.theme === 'system' ? (systemDark.value ? 'dark' : 'light') : values.theme)
  const reviewOptions = computed(() => ({
    initialEasiness: values.initialEasiness,
    intervalModifier: values.intervalModifier,
    masteryRepetitions: values.masteryRepetitions,
    masteryDays: values.masteryDays
  }))

  async function load() {
    const saved = await api.getSettings()
    hasSavedSettings.value = Boolean(saved)
    const isLegacySettings = saved && !Object.hasOwn(saved, 'onboardingComplete')
    Object.assign(values, defaults, saved || {}, isLegacySettings ? { onboardingComplete: true } : {})
    loaded.value = true
  }
  async function save() {
    saveState.value = 'saving'
    try {
      await api.saveSettings({ ...values })
      saveState.value = 'saved'
    } catch (error) {
      saveState.value = 'error'
      throw error
    }
  }
  function reset() { Object.assign(values, defaults) }

  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', (event) => { systemDark.value = event.matches })
  watch(values, () => {
    if (!loaded.value) return
    clearTimeout(timer)
    timer = window.setTimeout(() => save().catch(() => {}), 350)
  }, { deep: true })

  return { values, loaded, hasSavedSettings, saveState, effectiveTheme, reviewOptions, load, save, reset }
})
