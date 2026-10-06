const { localDateKey, addLocalDays } = require('./date-utils.cjs')
const { planDailyNewQuota } = require('./study-goal.cjs')
const { createFeatures } = require('./features.cjs')
const { scheduleFsrs } = require('./fsrs-scheduler.cjs')

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
  word_family: jsonArray(row.word_family),
  collocations: jsonArray(row.collocations),
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
  const features = createFeatures(adapter, todayKey)
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
    const vocabularySummary = await adapter.get(`SELECT COUNT(*) total,
      COUNT(CASE WHEN is_active = 1 THEN 1 END) active FROM vocabularies`)
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
      vocabularyCount: vocabularySummary.total || 0, activeVocabularyCount: vocabularySummary.active || 0,
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
        lr.repetitions, lr.interval, lr.last_review_date, lr.next_review_date, lr.algorithm,
        COUNT(h.id) study_count,
        ROUND(100.0 * SUM(CASE WHEN h.is_correct = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(h.id), 0), 1) accuracy
      FROM words w JOIN vocabularies v ON v.id = w.vocabulary_id
      LEFT JOIN learning_records lr ON lr.word_id = w.id LEFT JOIN study_history h ON h.word_id = w.id
      WHERE w.id = ? GROUP BY w.id
    `, [Number(id)])
    const word = hydrateWord(row)
    if (word) {
      word.tags = await adapter.all('SELECT t.* FROM tags t JOIN word_tags wt ON wt.tag_id = t.id WHERE wt.word_id = ? ORDER BY t.name', [Number(id)])
      word.mistakeHistory = await adapter.all('SELECT id, studied_at, study_mode, mistake_reason FROM study_history WHERE word_id = ? AND is_correct = 0 ORDER BY id DESC LIMIT 20', [Number(id)])
    }
    return word
  }

  async function listFavorites(tagId = null) {
    const rows = await adapter.all(`
    SELECT w.*, v.name vocabulary_name, COALESCE(lr.status, 'new') status
    FROM words w JOIN vocabularies v ON v.id = w.vocabulary_id
    LEFT JOIN learning_records lr ON lr.word_id = w.id
    WHERE ${tagId == null ? 'w.is_favorited = 1' : 'EXISTS (SELECT 1 FROM word_tags wt WHERE wt.word_id = w.id AND wt.tag_id = ?)'} ORDER BY w.id DESC
  `, tagId == null ? [] : [Number(tagId)])
    return rows.map(hydrateWord)
  }

  async function listMistakes(frequentOnly = false) {
    const rows = await adapter.all(`
    SELECT w.*, v.name vocabulary_name, m.mistake_count, m.last_mistake_at, m.last_mode, m.is_frequent,
      (SELECT h.mistake_reason FROM study_history h WHERE h.word_id = w.id AND h.is_correct = 0 ORDER BY h.id DESC LIMIT 1) last_reason,
      COALESCE(lr.status, 'new') status
    FROM mistake_book m JOIN words w ON w.id = m.word_id JOIN vocabularies v ON v.id = w.vocabulary_id
    LEFT JOIN learning_records lr ON lr.word_id = w.id
    WHERE (? = 0 OR m.is_frequent = 1) ORDER BY m.is_frequent DESC, m.mistake_count DESC, m.last_mistake_at DESC
  `, [frequentOnly ? 1 : 0])
    return rows.map(hydrateWord)
  }

  async function getStatistics(days = 30) {
    const allTime = days === 'all'
    const range = allTime ? null : boundedInt(days, 7, 365, 30)
    const rangeParams = allTime ? [] : [`-${range - 1} days`]
    const daily = await adapter.all(allTime
      ? 'SELECT * FROM daily_statistics ORDER BY date'
      : "SELECT * FROM daily_statistics WHERE date >= date('now','localtime', ?) ORDER BY date", rangeParams)
    const heatmap = await adapter.all("SELECT * FROM daily_statistics WHERE date >= date('now','localtime', '-125 days') ORDER BY date")
    const historyFilter = allTime ? '' : "WHERE date(studied_at, 'localtime') >= date('now','localtime', ?)"
    const modes = await adapter.all(`
      SELECT COALESCE(NULLIF(session_mode, ''), study_mode) mode, COUNT(*) total,
        SUM(is_correct) correct, SUM(time_spent) time
      FROM study_history ${historyFilter}
      GROUP BY COALESCE(NULLIF(session_mode, ''), study_mode)
      ORDER BY mode
    `, rangeParams)
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
      COALESCE(SUM(study_time),0) time, COALESCE(SUM(new_words_count),0) learned FROM daily_statistics
      ${allTime ? '' : "WHERE date >= date('now','localtime', ?)"}`, rangeParams)
    const reasons = await adapter.all(`SELECT mistake_reason reason, COUNT(*) total FROM study_history
      ${historyFilter || 'WHERE 1=1'} AND is_correct = 0 AND mistake_reason <> '' GROUP BY mistake_reason`, rangeParams)
    const reasonTrend = await adapter.all(`SELECT date(studied_at,'localtime') date, mistake_reason reason, COUNT(*) total FROM study_history
      ${historyFilter || 'WHERE 1=1'} AND is_correct = 0 AND mistake_reason <> '' GROUP BY date(studied_at,'localtime'), mistake_reason ORDER BY date`, rangeParams)
    return { daily, heatmap, modes, reasons, reasonTrend, vocabularies, weakWords, totals: { ...totals, streak: await computeStreak() }, range: allTime ? 'all' : range }
  }

  async function updateWord(id, updates = {}) {
    if (Object.hasOwn(updates, 'is_favorited')) await adapter.run('UPDATE words SET is_favorited = ? WHERE id = ?', [updates.is_favorited ? 1 : 0, Number(id)])
    if (Object.hasOwn(updates, 'notes')) await adapter.run('UPDATE words SET notes = ? WHERE id = ?', [String(updates.notes || '').slice(0, 4000), Number(id)])
    return hydrateWord(await adapter.get('SELECT * FROM words WHERE id = ?', [Number(id)]))
  }

  async function importVocabulary({ name, filename, headers = [], rows = [], mapping = {} } = {}) {
    const vocabName = String(name || '自定义词库').trim().slice(0, 80)
    if (!vocabName) throw new Error('请输入词库名称')
    if (!mapping.word || !mapping.definition) throw new Error('必须映射单词和释义字段')
    if (rows.length > 50000) throw new Error('单个词库最多支持 50,000 行')
    const indexes = Object.fromEntries(Object.entries(mapping).map(([field, header]) => [field, headers.indexOf(header)]))
    const valueFor = (row, field) => indexes[field] >= 0 ? row[indexes[field]] : ''
    const listValue = (value) => {
      if (Array.isArray(value)) return value.map(String).map((item) => item.trim()).filter(Boolean)
      const text = String(value || '').trim()
      if (!text) return []
      try { const parsed = JSON.parse(text); if (Array.isArray(parsed)) return parsed.map(String).map((item) => item.trim()).filter(Boolean) } catch {}
      return text.split(/[|;；]/).map((item) => item.trim()).filter(Boolean)
    }
    return adapter.withTransaction(async () => {
      const inserted = await adapter.run("INSERT INTO vocabularies (name, type, description, is_default, is_active) VALUES (?, 'CUSTOM', ?, 0, 1)",
        [vocabName, `从 ${String(filename || '文件').slice(0, 160)} 导入`])
      const vocabularyId = inserted.lastInsertRowid
      let imported = 0; let skipped = 0
      for (const row of rows) {
        const word = String(valueFor(row, 'word') || '').trim().slice(0, 160)
        const definition = listValue(valueFor(row, 'definition'))
        if (!word || !definition.length) { skipped += 1; continue }
        const frequencyValue = Number(valueFor(row, 'frequency'))
        const result = await adapter.run(`INSERT OR IGNORE INTO words
          (vocabulary_id, word, phonetic, definition, examples, etymology, synonyms, antonyms, frequency, roots, word_family, collocations, content_source, content_license)
          VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
          vocabularyId, word, String(valueFor(row, 'phonetic') || '').trim() || null,
          JSON.stringify(definition), JSON.stringify(listValue(valueFor(row, 'examples'))),
          String(valueFor(row, 'etymology') || '').trim() || null,
          JSON.stringify(listValue(valueFor(row, 'synonyms'))), JSON.stringify(listValue(valueFor(row, 'antonyms'))),
          Number.isFinite(frequencyValue) && frequencyValue >= 0 ? Math.round(frequencyValue) : null,
          String(valueFor(row, 'roots') || ''), JSON.stringify(listValue(valueFor(row, 'word_family'))),
          JSON.stringify(listValue(valueFor(row, 'collocations'))), String(valueFor(row, 'content_source') || ''), String(valueFor(row, 'content_license') || '')
        ])
        if (result.changes) imported += 1
        else skipped += 1
      }
      if (!imported) throw new Error('没有可导入的有效单词，已取消本次导入')
      return { vocabId: vocabularyId, imported, skipped }
    })
  }

  async function getVocabularyExport(id) {
    const vocabulary = await adapter.get('SELECT * FROM vocabularies WHERE id = ?', [Number(id)])
    if (!vocabulary) throw new Error('词库不存在')
    const words = (await adapter.all('SELECT * FROM words WHERE vocabulary_id = ? ORDER BY id', [Number(id)])).map(hydrateWord)
    return { version: '1.0', vocabulary, words }
  }

  async function exportBackupData() {
    const data = { version: '1.2', exported_at: new Date().toISOString() }
    for (const table of ['vocabularies', 'words', 'learning_records', 'study_history', 'mistake_book', 'daily_statistics', 'user_settings', 'tags', 'word_tags', 'daily_plans']) {
      data[table] = await adapter.all(`SELECT * FROM ${table}`)
    }
    return data
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
      const reset = payload.reset === true
      const options = payload.options || {}
      const algorithm = options.algorithm === 'fsrs' ? 'fsrs' : 'sm2'
      const history = algorithm === 'fsrs' ? await adapter.all('SELECT quality, studied_at FROM study_history WHERE word_id = ? ORDER BY studied_at, id', [wordId]) : []
      const sm2Base = record.algorithm === 'fsrs' && record.sm2_snapshot ? { ...record, ...JSON.parse(record.sm2_snapshot) } : record
      const next = reset
        ? { easiness_factor: Number(record.easiness_factor) || 2.5, interval: 1, repetitions: 0, status: 'learning', next_review_date: addDaysFrom(1) }
        : algorithm === 'fsrs' ? scheduleFsrs(record, quality, options, todayKey() === localDateKey() ? new Date() : new Date(`${todayKey()}T12:00:00`), history) : calculateReview(sm2Base, quality, options)
      const sm2Snapshot = algorithm === 'fsrs' && !reset ? (record.sm2_snapshot || JSON.stringify({ easiness_factor: record.easiness_factor, interval: record.interval, repetitions: record.repetitions })) : null
      await adapter.run(`
        UPDATE learning_records SET easiness_factor = ?, interval = ?, repetitions = ?, status = ?,
          next_review_date = ?, last_review_date = ?, is_learned = 1,
          first_learned_at = COALESCE(first_learned_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP,
          algorithm = ?, fsrs_card = ?, sm2_snapshot = ?
        WHERE word_id = ?
      `, [next.easiness_factor, next.interval, next.repetitions, next.status, next.next_review_date, todayKey(), algorithm, next.fsrs_card || null, sm2Snapshot, wordId])
      const updated = await adapter.get('SELECT * FROM learning_records WHERE word_id = ?', [wordId])
      const sessionMode = ['flashcard', 'spelling', 'choice', 'mixed', 'test'].includes(payload.sessionMode) ? payload.sessionMode : mode
      const answer = await adapter.run(`INSERT INTO study_history (word_id, learning_record_id, study_mode, session_mode, quality, time_spent, is_correct, algorithm, algorithm_version, algorithm_params)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`, [wordId, updated.id, mode, sessionMode, quality, timeSpent, quality >= 3 ? 1 : 0, algorithm,
        next.algorithm_version || (reset ? 'reset-1' : 'SM-2-1'), JSON.stringify(next.parameters || options)])
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
      return { ...updated, historyId: answer.lastInsertRowid }
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
      await adapter.run('DELETE FROM daily_plans')
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

  async function buildPlan(settings = {}, source = 'daily') {
    const reviewLimit = boundedInt(settings.dailyReviewLimit, 0, 500, 100)
    let reviews = []
    let newWords = []
    let goal = null
    if (source === 'mistakes') {
      reviews = await adapter.all(`
        SELECT w.*, v.name vocabulary_name, lr.easiness_factor, lr.interval, lr.repetitions,
          lr.status, 'review' queue_type, m.mistake_count
        FROM mistake_book m JOIN words w ON w.id = m.word_id JOIN vocabularies v ON v.id = w.vocabulary_id
        LEFT JOIN learning_records lr ON lr.word_id = w.id
        ${settings.mistakeReason ? `WHERE COALESCE((SELECT h.mistake_reason FROM study_history h WHERE h.word_id = w.id AND h.is_correct = 0 ORDER BY h.id DESC LIMIT 1), '') = ?` : ''}
        ORDER BY m.is_frequent DESC, m.mistake_count DESC LIMIT ?
      `, settings.mistakeReason ? [settings.mistakeReason === 'unmarked' ? '' : settings.mistakeReason, Math.max(reviewLimit, 20)] : [Math.max(reviewLimit, 20)])
    } else if (source === 'favorites' || source === 'tag') {
      reviews = await adapter.all(`
        SELECT w.*, v.name vocabulary_name, lr.easiness_factor, lr.interval, lr.repetitions,
          COALESCE(lr.status, 'new') status, CASE WHEN lr.is_learned = 1 THEN 'review' ELSE 'new' END queue_type
        FROM words w JOIN vocabularies v ON v.id = w.vocabulary_id LEFT JOIN learning_records lr ON lr.word_id = w.id
        WHERE ${source === 'tag' ? 'EXISTS (SELECT 1 FROM word_tags wt WHERE wt.word_id = w.id AND wt.tag_id = ?)' : 'w.is_favorited = 1'} ORDER BY w.id DESC LIMIT ?
      `, source === 'tag' ? [Number(settings.tagId), Math.max(reviewLimit, 20)] : [Math.max(reviewLimit, 20)])
    } else if (source === 'consolidate') {
      reviews = await adapter.all(`
        SELECT w.*, v.name vocabulary_name, lr.easiness_factor, lr.interval, lr.repetitions,
          lr.status, 'review' queue_type, COALESCE(m.mistake_count, 0) mistake_count
        FROM learning_records lr JOIN words w ON w.id = lr.word_id
        JOIN vocabularies v ON v.id = w.vocabulary_id LEFT JOIN mistake_book m ON m.word_id = w.id
        WHERE v.is_active = 1 AND lr.is_learned = 1
        ORDER BY CASE WHEN lr.next_review_date <= ? THEN 0 ELSE 1 END,
          COALESCE(m.mistake_count, 0) DESC, lr.easiness_factor ASC,
          COALESCE(lr.last_review_date, '') ASC
        LIMIT 30
      `, [todayKey()])
    } else if (source === 'test') {
      newWords = await adapter.all(`
        SELECT w.*, v.name vocabulary_name, COALESCE(lr.easiness_factor, 2.5) easiness_factor,
          COALESCE(lr.interval, 0) interval, COALESCE(lr.repetitions, 0) repetitions,
          COALESCE(lr.status, 'new') status, 'test' queue_type, COALESCE(m.mistake_count, 0) mistake_count
        FROM words w JOIN vocabularies v ON v.id = w.vocabulary_id
        LEFT JOIN learning_records lr ON lr.word_id = w.id LEFT JOIN mistake_book m ON m.word_id = w.id
        WHERE v.is_active = 1
        GROUP BY lower(w.word) ORDER BY RANDOM() LIMIT ?
      `, [20])
    } else {
      const preview = await features.getPlanPreview(settings)
      reviews = await adapter.all(`
        SELECT w.*, v.name vocabulary_name, lr.easiness_factor, lr.interval, lr.repetitions,
          lr.status, 'review' queue_type, COALESCE(m.mistake_count, 0) mistake_count
        FROM learning_records lr JOIN words w ON w.id = lr.word_id
        JOIN vocabularies v ON v.id = w.vocabulary_id LEFT JOIN mistake_book m ON m.word_id = w.id
        WHERE v.is_active = 1 AND lr.is_learned = 1 AND lr.next_review_date <= ?
        ORDER BY COALESCE(m.is_frequent, 0) DESC, COALESCE(m.mistake_count, 0) DESC, lr.next_review_date ASC LIMIT ?
      `, [todayKey(), preview.reviewCount])
      const dedupClause = settings.enableCrossVocabDedup === false ? '' : `
        AND NOT EXISTS (
          SELECT 1 FROM words same JOIN learning_records known ON known.word_id = same.id
          WHERE lower(same.word) = lower(w.word) AND known.is_learned = 1
        )`
      goal = preview.goal
      newWords = await adapter.all(`
        SELECT w.*, v.name vocabulary_name, 2.5 easiness_factor, 0 interval, 0 repetitions,
          'new' status, 'new' queue_type
        FROM words w JOIN vocabularies v ON v.id = w.vocabulary_id
        LEFT JOIN learning_records lr ON lr.word_id = w.id
        WHERE v.is_active = 1 AND COALESCE(lr.is_learned, 0) = 0 ${dedupClause}
        GROUP BY lower(w.word) ORDER BY COALESCE(w.frequency, 0) DESC, w.id ASC LIMIT ?
      `, [preview.newCount])
      await adapter.run(`INSERT INTO daily_plans (date, planned_new, planned_review) VALUES (?, ?, ?)
        ON CONFLICT(date) DO UPDATE SET planned_new = MAX(planned_new, excluded.planned_new), planned_review = MAX(planned_review, excluded.planned_review)`,
      [todayKey(), preview.dailyQuota, reviews.length])
    }
    const choicePool = (await adapter.all(`
      SELECT definition FROM words w JOIN vocabularies v ON v.id = w.vocabulary_id
      WHERE v.is_active = 1 AND definition <> '[]' ORDER BY RANDOM() LIMIT 80
    `)).flatMap((row) => jsonArray(row.definition).slice(0, 1))
    return { words: [...reviews, ...newWords].map(hydrateWord), reviewCount: reviews.length, newCount: newWords.length, choicePool, goal }
  }

  async function previewAlgorithm(options = {}) {
    const rows = await adapter.all(`SELECT lr.*, w.word FROM learning_records lr JOIN words w ON w.id = lr.word_id WHERE lr.is_learned = 1 ORDER BY lr.id LIMIT 5`)
    const result = []
    for (const row of rows) {
      const history = await adapter.all('SELECT quality, studied_at FROM study_history WHERE word_id = ? ORDER BY studied_at, id', [row.word_id])
      const next = scheduleFsrs(row, 4, options, todayKey() === localDateKey() ? new Date() : new Date(`${todayKey()}T12:00:00`), history)
      result.push({ word: row.word, current: row.next_review_date, fsrs: next.next_review_date, interval: next.interval })
    }
    return result
  }
  return { ...features, previewAlgorithm, getDashboard, listVocabularies, searchWords, getWord, listFavorites, listMistakes, getStatistics, updateWord, importVocabulary, getVocabularyExport, exportBackupData, submitAnswer, removeMistake, setVocabularyActive, deleteVocabulary, resetProgress, getSettings, setSettings, buildPlan }
}

module.exports = { createBackend, hydrateWord, jsonArray }
