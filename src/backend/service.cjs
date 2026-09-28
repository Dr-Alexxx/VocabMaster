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
  function calculateReview(record, quality, options = {}) {
    const q = boundedInt(quality, 0, 5, 0)
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
    const masteryRepetitions = boundedInt(options.masteryRepetitions, 2, 20, 5)
    const masteryDays = boundedInt(options.masteryDays, 7, 365, 21)
    let status = repetitions >= 2 ? 'review' : 'learning'
    if (repetitions >= masteryRepetitions && interval >= masteryDays) status = 'mastered'
    return { easiness_factor: easiness, interval, repetitions, status, next_review_date: addDaysFrom(interval) }
  }

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

  async function updateWord(id, updates = {}) {
    if (Object.hasOwn(updates, 'is_favorited')) await adapter.run('UPDATE words SET is_favorited = ? WHERE id = ?', [updates.is_favorited ? 1 : 0, Number(id)])
    if (Object.hasOwn(updates, 'notes')) await adapter.run('UPDATE words SET notes = ? WHERE id = ?', [String(updates.notes || '').slice(0, 4000), Number(id)])
    return hydrateWord(await adapter.get('SELECT * FROM words WHERE id = ?', [Number(id)]))
  }

  async function submitAnswer(payload = {}) {
    const wordId = Number(payload.wordId)
    const quality = boundedInt(payload.quality, 0, 5, 0)
    const mode = ['flashcard', 'spelling', 'choice'].includes(payload.mode) ? payload.mode : 'flashcard'
    const timeSpent = boundedInt(payload.timeSpent, 0, 3600, 0)
    return adapter.withTransaction(async () => {
      let record = await adapter.get('SELECT * FROM learning_records WHERE word_id = ?', [wordId])
      if (!record) {
        await adapter.run('INSERT INTO learning_records (word_id) VALUES (?)', [wordId])
        record = await adapter.get('SELECT * FROM learning_records WHERE word_id = ?', [wordId])
      }
      const wasNew = !record.is_learned
      const next = calculateReview(record, quality, payload.options)
      await adapter.run(`
        UPDATE learning_records SET easiness_factor = ?, interval = ?, repetitions = ?, status = ?,
          next_review_date = ?, last_review_date = ?, is_learned = 1,
          first_learned_at = COALESCE(first_learned_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
        WHERE word_id = ?
      `, [next.easiness_factor, next.interval, next.repetitions, next.status, next.next_review_date, todayKey(), wordId])
      const updated = await adapter.get('SELECT * FROM learning_records WHERE word_id = ?', [wordId])
      await adapter.run(`INSERT INTO study_history (word_id, learning_record_id, study_mode, quality, time_spent, is_correct)
        VALUES (?, ?, ?, ?, ?, ?)`, [wordId, updated.id, mode, quality, timeSpent, quality >= 3 ? 1 : 0])
      if (quality < 3) await adapter.run(`
        INSERT INTO mistake_book (word_id, mistake_count, last_mistake_at, last_mode, is_frequent)
        VALUES (?, 1, CURRENT_TIMESTAMP, ?, 0)
        ON CONFLICT(word_id) DO UPDATE SET mistake_count = mistake_count + 1,
          last_mistake_at = CURRENT_TIMESTAMP, last_mode = excluded.last_mode,
          is_frequent = CASE WHEN mistake_count + 1 >= 3 THEN 1 ELSE 0 END
      `, [wordId, mode])
      await adapter.run(`
        INSERT INTO daily_statistics (date, new_words_count, review_count, correct_count, total_count, study_time)
        VALUES (?, ?, ?, ?, 1, ?)
        ON CONFLICT(date) DO UPDATE SET new_words_count = new_words_count + excluded.new_words_count,
          review_count = review_count + excluded.review_count, correct_count = correct_count + excluded.correct_count,
          total_count = total_count + 1, study_time = study_time + excluded.study_time
      `, [todayKey(), wasNew ? 1 : 0, wasNew ? 0 : 1, quality >= 3 ? 1 : 0, timeSpent])
      return updated
    })
  }

  async function removeMistake(wordId) {
    await adapter.run('DELETE FROM mistake_book WHERE word_id = ?', [Number(wordId)])
    return true
  }

  async function setVocabularyActive(id, active) {
    await adapter.run('UPDATE vocabularies SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?', [active ? 1 : 0, Number(id)])
    return true
  }

  async function deleteVocabulary(id) {
    const vocab = await adapter.get('SELECT is_default FROM vocabularies WHERE id = ?', [Number(id)])
    if (!vocab) return false
    if (vocab.is_default) throw new Error('系统默认词库不能删除')
    await adapter.run('DELETE FROM vocabularies WHERE id = ?', [Number(id)])
    return true
  }

  async function resetProgress() {
    await adapter.withTransaction(async () => {
      await adapter.run('DELETE FROM study_history')
      await adapter.run('DELETE FROM mistake_book')
      await adapter.run('DELETE FROM learning_records')
      await adapter.run('DELETE FROM daily_statistics')
    })
    return true
  }

  async function getSettings() {
    const row = await adapter.get("SELECT value FROM user_settings WHERE key = 'app_settings'")
    if (!row) return null
    try { return JSON.parse(row.value) } catch { return null }
  }

  async function setSettings(settings) {
    const value = JSON.stringify(settings || {})
    await adapter.run(`INSERT INTO user_settings (key, value) VALUES ('app_settings', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`, [value])
    return true
  }

  return { getDashboard, listVocabularies, searchWords, getWord, listFavorites, listMistakes, getStatistics, updateWord, submitAnswer, removeMistake, setVocabularyActive, deleteVocabulary, resetProgress, getSettings, setSettings }
}

module.exports = { createBackend }
