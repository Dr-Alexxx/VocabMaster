const accentLangs = { us: 'en-US', uk: 'en-GB' }

export function pickVoice(voices, accent) {
  if (!Array.isArray(voices) || !voices.length) return null
  const lang = accentLangs[accent]
  if (!lang) return null
  const normalize = (value) => String(value || '').replace('_', '-')
  const exact = voices.find((voice) => normalize(voice.lang) === lang)
  if (exact) return exact
  const base = lang.split('-')[0]
  return voices.find((voice) => normalize(voice.lang).startsWith(base)) || null
}
