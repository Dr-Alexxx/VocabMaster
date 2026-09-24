export function updateCard(record, quality, options = {}) {
  const q = Math.min(5, Math.max(0, Math.round(Number(quality) || 0)))
  let easiness = Number(record.easiness_factor || options.initialEasiness || 2.5)
  let interval = Number(record.interval || 0)
  let repetitions = Number(record.repetitions || 0)
  easiness = Math.max(1.3, easiness + (0.1 - (5 - q) * (0.08 + (5 - q) * 0.02)))
  if (q < 3) {
    repetitions = 0
    interval = 1
  } else {
    if (repetitions === 0) interval = 1
    else if (repetitions === 1) interval = 6
    else interval = Math.max(1, Math.round(interval * easiness * Number(options.intervalModifier || 1)))
    repetitions += 1
  }
  const masteryRepetitions = Number(options.masteryRepetitions || 5)
  const masteryDays = Number(options.masteryDays || 21)
  const status = repetitions >= masteryRepetitions && interval >= masteryDays ? 'mastered' : repetitions >= 2 ? 'review' : 'learning'
  return { easiness_factor: easiness, interval, repetitions, status }
}

export function levenshteinDistance(left = '', right = '') {
  const a = String(left).toLowerCase()
  const b = String(right).toLowerCase()
  const row = Array.from({ length: b.length + 1 }, (_value, index) => index)
  for (let i = 1; i <= a.length; i += 1) {
    let diagonal = row[0]
    row[0] = i
    for (let j = 1; j <= b.length; j += 1) {
      const previous = row[j]
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, diagonal + (a[i - 1] === b[j - 1] ? 0 : 1))
      diagonal = previous
    }
  }
  return row[b.length]
}

export function spellingFeedback(answer, correct) {
  const submitted = String(answer ?? '').trim()
  const target = String(correct ?? '').trim()
  const distance = levenshteinDistance(submitted, target)
  if (!submitted) return { tier: 'empty', quality: 0, distance: target.length }
  if (distance === 0) return { tier: 'exact', quality: 5, distance }
  if (distance <= 2) return { tier: 'close', quality: 3, distance }
  return { tier: 'wrong', quality: distance <= 4 ? 1 : 0, distance }
}

export function calculateQuality(mode, answer, correct, elapsedMs = 0) {
  if (mode === 'flashcard') return Math.min(5, Math.max(0, Number(answer) || 0))
  if (mode === 'choice') return answer === correct ? (elapsedMs < 3000 ? 5 : 4) : 0
  return spellingFeedback(answer, correct).quality
}
