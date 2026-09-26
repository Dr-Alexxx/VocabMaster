import { defineStore } from 'pinia'
import { computed, reactive, ref, watch } from 'vue'
import { api } from '@/services/api.js'

const defaults = {
  theme: 'system', fontSize: 'medium', dailyNewLimit: 20, dailyReviewLimit: 100,
  enableCrossVocabDedup: true, showExamples: true, autoPronounce: false, speakOnReveal: true,
  voiceAccent: 'system', speechRate: 1,
  goalDeadline: '',
  initialEasiness: 2.5, intervalModifier: 1, masteryRepetitions: 5, masteryDays: 21
}

export const useSettingsStore = defineStore('settings', () => {
  const values = reactive({ ...defaults })
  const loaded = ref(false)
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
    Object.assign(values, defaults, saved || {})
    loaded.value = true
  }
  async function save() { await api.saveSettings({ ...values }) }
  function reset() { Object.assign(values, defaults) }

  window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', (event) => { systemDark.value = event.matches })
  watch(values, () => {
    if (!loaded.value) return
    clearTimeout(timer)
    timer = window.setTimeout(() => save(), 350)
  }, { deep: true })

  return { values, loaded, effectiveTheme, reviewOptions, load, save, reset }
})
