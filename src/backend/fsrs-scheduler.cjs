const { fsrs, createEmptyCard, generatorParameters, Rating } = require('ts-fsrs')
const { localDateKey } = require('./date-utils.cjs')

const fsrsVersion = 'FSRS-6 / ts-fsrs-5.4.2'
function ratingForQuality(quality) {
  return quality < 3 ? Rating.Again : quality === 3 ? Rating.Hard : quality === 4 ? Rating.Good : Rating.Easy
}
function fsrsParameters(options = {}) {
  const retention = Number(options.fsrsRetention)
  return generatorParameters({ request_retention: Number.isFinite(retention) ? Math.max(0.8, Math.min(0.97, retention)) : 0.9,
    maximum_interval: 3650, enable_fuzz: false, enable_short_term: false })
}
function scheduleFsrs(record, quality, options = {}, now = new Date(), history = []) {
  const parameters = fsrsParameters(options)
  const scheduler = fsrs(parameters)
  let card = record.fsrs_card && record.algorithm === 'fsrs' ? JSON.parse(record.fsrs_card) : null
  if (!card) {
    card = createEmptyCard(now)
    // Reconstruct the memory state from real answer history, never estimate stability from an SM-2 ease factor.
    for (const item of history) {
      const date = new Date(/[zZ]|[+-]\d\d:\d\d$/.test(item.studied_at) ? item.studied_at : `${item.studied_at.replace(' ', 'T')}Z`)
      if (Number.isFinite(date.getTime()) && date <= now) card = scheduler.next(card, date, ratingForQuality(item.quality)).card
    }
  }
  const result = scheduler.next(card, now, ratingForQuality(quality))
  const interval = Math.max(1, result.card.scheduled_days)
  const repetitions = quality < 3 ? 0 : Number(record.repetitions || 0) + 1
  const mastered = repetitions >= Number(options.masteryRepetitions || 5) && interval >= Number(options.masteryDays || 21)
  return { easiness_factor: record.easiness_factor || 2.5, interval, repetitions,
    status: mastered ? 'mastered' : repetitions >= 2 ? 'review' : 'learning',
    next_review_date: localDateKey(result.card.due), fsrs_card: JSON.stringify(result.card), parameters, algorithm_version: fsrsVersion }
}

module.exports = { scheduleFsrs, fsrsVersion, ratingForQuality }
