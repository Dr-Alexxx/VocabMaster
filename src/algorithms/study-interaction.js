export function spellingEnterAction({ hasAnswer, hasFeedback, feedbackRecorded, submitting }) {
  if (submitting) return 'wait'
  if (hasFeedback) return feedbackRecorded ? 'next' : 'wait'
  return hasAnswer ? 'submit' : 'wait'
}

export function choiceShortcutIndex(key) {
  const normalized = String(key || '').toLowerCase()
  if (/^[a-d]$/.test(normalized)) return normalized.charCodeAt(0) - 97
  if (/^[1-4]$/.test(normalized)) return Number(normalized) - 1
  return -1
}
