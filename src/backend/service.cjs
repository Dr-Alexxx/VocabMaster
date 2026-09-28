const { localDateKey, addLocalDays } = require('./date-utils.cjs')

const jsonArray = (value) => {
  if (Array.isArray(value)) return value
  if (value == null || value === '') return []
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : [String(parsed)]
  } catch {
    return [String(value)]
  }
}

const hydrateWord = (row) => row && ({
  ...row,
  definition: jsonArray(row.definition),
  examples: jsonArray(row.examples),
  synonyms: jsonArray(row.synonyms),
  antonyms: jsonArray(row.antonyms),
  is_favorited: Boolean(row.is_favorited),
  is_frequent: Boolean(row.is_frequent),
  is_active: row.is_active == null ? undefined : Boolean(row.is_active)
})

const boundedInt = (value, min, max, fallback) => {
  const number = Number(value)
  return Number.isFinite(number) ? Math.min(max, Math.max(min, Math.round(number))) : fallback
}

function createBackend(adapter, {
  todayKey = () => localDateKey(),
  addDaysFrom = (amount) => addLocalDays(new Date(), amount)
} = {}) {
  async function computeStreak() {
    const dates = new Set((await adapter.all('SELECT date FROM daily_statistics WHERE total_count > 0')).map((row) => row.date))
    let streak = 0
    let offset = dates.has(todayKey()) ? 0 : -1
    while (dates.has(offset === 0 ? todayKey() : addDaysFrom(offset))) {
      streak += 1
      offset -= 1
    }
    return streak
  }

  async function getDashboard() {
    const due = (await adapter.get(`
      SELECT COUNT(*) count FROM learning_records lr
      JOIN words w ON w.id = lr.word_id JOIN vocabularies v ON v.id = w.vocabulary_id
      WHERE v.is_active = 1 AND lr.is_learned = 1 AND lr.next_review_date <= ?
    `, [todayKey()])).count
    const newCount = (await adapter.get(`
      SELECT COUNT(DISTINCT lower(w.word)) count FROM words w
      JOIN vocabularies v ON v.id = w.vocabulary_id LEFT JOIN learning_records lr ON lr.word_id = w.id
      WHERE v.is_active = 1 AND COALESCE(lr.is_learned, 0) = 0
    `)).count
    const daily = await adapter.get('SELECT * FROM daily_statistics WHERE date = ?', [todayKey()]) || {}
    const summary = await adapter.get(`
      SELECT COUNT(DISTINCT CASE WHEN lr.is_learned = 1 THEN lower(w.word) END) learned,
        COUNT(DISTINCT CASE WHEN lr.status = 'mastered' THEN lower(w.word) END) mastered
      FROM words w LEFT JOIN learning_records lr ON lr.word_id = w.id
    `)
    const weekTime = (await adapter.get("SELECT COALESCE(SUM(study_time), 0) value FROM daily_statistics WHERE date >= date('now','localtime','-6 days')")).value
    return {
      due, newCount, learned: summary.learned || 0, mastered: summary.mastered || 0,
      streak: await computeStreak(), weekTime, todayTotal: daily.total_count || 0,
      todayCorrect: daily.correct_count || 0, todayTime: daily.study_time || 0
    }
  }

  async function listVocabularies() {
    const rows = await adapter.all(`
    SELECT v.*,
      COUNT(w.id) total,
      COUNT(CASE WHEN lr.is_learned = 1 THEN 1 END) learned,
      COUNT(CASE WHEN lr.status = 'mastered' THEN 1 END) mastered
    FROM vocabularies v LEFT JOIN words w ON w.vocabulary_id = v.id
    LEFT JOIN learning_records lr ON lr.word_id = w.id
    GROUP BY v.id ORDER BY v.is_default DESC, v.created_at ASC
  `)
    return rows.map((row) => ({ ...row, is_default: Boolean(row.is_default), is_active: Boolean(row.is_active) }))
  }

  async function searchWords(query, filters = {}) {
    const term = String(query || '').trim()
    if (!term) return []
    const favoriteClause = filters.favorites ? 'AND w.is_favorited = 1' : ''
    const rows = await adapter.all(`
      SELECT w.*, v.name vocabulary_name, COALESCE(lr.status, 'new') status,
        COALESCE(m.mistake_count, 0) mistake_count
      FROM words w JOIN vocabularies v ON v.id = w.vocabulary_id
      LEFT JOIN learning_records lr ON lr.word_id = w.id LEFT JOIN mistake_book m ON m.word_id = w.id
      WHERE (w.word LIKE ? OR w.definition LIKE ? OR w.examples LIKE ?) ${favoriteClause}
      ORDER BY CASE WHEN lower(w.word) = lower(?) THEN 0 ELSE 1 END, w.frequency DESC LIMIT 80
    `, [`%${term}%`, `%${term}%`, `%${term}%`, term])
    return rows.map(hydrateWord)
  }

  async function getWord(id) {
    const row = await adapter.get(`
      SELECT w.*, v.name vocabulary_name, COALESCE(lr.status, 'new') status,
        lr.repetitions, lr.interval, lr.last_review_date,
        COUNT(h.id) study_count,
        ROUND(100.0 * SUM(CASE WHEN h.is_correct = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(h.id), 0), 1) accuracy
      FROM words w JOIN vocabularies v ON v.id = w.vocabulary_id
      LEFT JOIN learning_records lr ON lr.word_id = w.id LEFT JOIN study_history h ON h.word_id = w.id
      WHERE w.id = ? GROUP BY w.id
    `, [Number(id)])
    return hydrateWord(row)
  }

  async function listFavorites() {
    const rows = await adapter.all(`
    SELECT w.*, v.name vocabulary_name, COALESCE(lr.status, 'new') status
    FROM words w JOIN vocabularies v ON v.id = w.vocabulary_id
    LEFT JOIN learning_records lr ON lr.word_id = w.id
    WHERE w.is_favorited = 1 ORDER BY w.id DESC
  `)
    return rows.map(hydrateWord)
  }

  async function listMistakes(frequentOnly = false) {
    const rows = await adapter.all(`
    SELECT w.*, v.name vocabulary_name, m.mistake_count, m.last_mistake_at, m.last_mode, m.is_frequent,
      COALESCE(lr.status, 'new') status
    FROM mistake_book m JOIN words w ON w.id = m.word_id JOIN vocabularies v ON v.id = w.vocabulary_id
    LEFT JOIN learning_records lr ON lr.word_id = w.id
    WHERE (? = 0 OR m.is_frequent = 1) ORDER BY m.is_frequent DESC, m.mistake_count DESC, m.last_mistake_at DESC
  `, [frequentOnly ? 1 : 0])
    return rows.map(hydrateWord)
  }

  async function getStatistics(days = 30) {
    const range = boundedInt(days, 7, 365, 30)
    const daily = await adapter.all("SELECT * FROM daily_statistics WHERE date >= date('now','localtime', ?) ORDER BY date", [`-${range - 1} days`])
    const modes = await adapter.all(`
      SELECT study_mode mode, COUNT(*) total, SUM(is_correct) correct, SUM(time_spent) time
      FROM study_history GROUP BY study_mode
    `)
    const vocabularies = await adapter.all(`
      SELECT v.id, v.name, COUNT(w.id) total, COUNT(CASE WHEN lr.is_learned = 1 THEN 1 END) learned,
        COUNT(CASE WHEN lr.status = 'mastered' THEN 1 END) mastered
      FROM vocabularies v LEFT JOIN words w ON w.vocabulary_id = v.id
      LEFT JOIN learning_records lr ON lr.word_id = w.id GROUP BY v.id ORDER BY v.is_default DESC, v.id
    `)
    const weakWords = (await adapter.all(`
      SELECT w.id, w.word, w.definition, v.name vocabulary_name, m.mistake_count, m.last_mistake_at,
        COALESCE(lr.repetitions, 0) repetitions
      FROM mistake_book m JOIN words w ON w.id = m.word_id JOIN vocabularies v ON v.id = w.vocabulary_id
      LEFT JOIN learning_records lr ON lr.word_id = w.id
      ORDER BY (1.0 * m.mistake_count / (COALESCE(lr.repetitions, 0) + 1)) DESC LIMIT 20
    `)).map(hydrateWord)
    const totals = await adapter.get(`SELECT COALESCE(SUM(total_count),0) total, COALESCE(SUM(correct_count),0) correct,
      COALESCE(SUM(study_time),0) time, COALESCE(SUM(new_words_count),0) learned FROM daily_statistics`)
    return { daily, modes, vocabularies, weakWords, totals: { ...totals, streak: await computeStreak() } }
  }

  return { getDashboard, listVocabularies, searchWords, getWord, listFavorites, listMistakes, getStatistics }
}

module.exports = { createBackend }
