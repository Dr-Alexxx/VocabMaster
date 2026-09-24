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

export function testGrade(correct, total) {
  const target = Math.max(0, Math.round(Number(total) || 0))
  const hits = Math.min(target, Math.max(0, Math.round(Number(correct) || 0)))
  const percent = target ? Math.round((hits / target) * 100) : 0
  const grade = percent >= 90 ? 'A' : percent >= 70 ? 'B' : 'C'
  const label = grade === 'A' ? '优秀' : grade === 'B' ? '良好' : '继续加油'
  return { percent, grade, label }
}
