function parseKey(key) {
  const [year, month, day] = String(key || '').split('-').map(Number)
  return new Date(year || 1970, (month || 1) - 1, day || 1)
}

function daysBetween(fromKey, toKey) {
  return Math.round((parseKey(toKey) - parseKey(fromKey)) / 86400000)
}

function planDailyNewQuota({ remainingWords = 0, deadlineKey = null, todayKey, baseLimit = 20, maxLimit = 200 }) {
  const base = Math.max(0, Math.round(Number(baseLimit) || 0))
  const max = Math.max(1, Math.round(Number(maxLimit) || 200))
  if (!deadlineKey) return { quota: base, daysLeft: null, feasible: true }
  const remaining = Math.max(0, Math.round(Number(remainingWords) || 0))
  if (remaining === 0) return { quota: base, daysLeft: 0, feasible: true }
  const daysLeft = Math.max(1, daysBetween(todayKey, deadlineKey) + 1)
  const ideal = Math.ceil(remaining / daysLeft)
  return { quota: Math.min(max, Math.max(1, ideal)), daysLeft, feasible: ideal <= max }
}

module.exports = { daysBetween, planDailyNewQuota }
