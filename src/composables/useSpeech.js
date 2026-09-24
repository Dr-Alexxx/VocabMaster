import { pickVoice } from '@/algorithms/speech.js'
import { useSettingsStore } from '@/stores/settings.js'

export function useSpeech() {
  const settings = useSettingsStore()

  function speak(text) {
    const synth = window.speechSynthesis
    if (!synth || !text) return
    synth.cancel()
    const utterance = new SpeechSynthesisUtterance(String(text))
    utterance.rate = Math.min(2, Math.max(0.5, Number(settings.values.speechRate) || 1))
    const accent = settings.values.voiceAccent
    if (accent !== 'system') {
      utterance.lang = accent === 'uk' ? 'en-GB' : 'en-US'
      const voice = pickVoice(synth.getVoices(), accent)
      if (voice) utterance.voice = voice
    }
    synth.speak(utterance)
  }

  function stop() { window.speechSynthesis?.cancel() }

  return { speak, stop }
}
