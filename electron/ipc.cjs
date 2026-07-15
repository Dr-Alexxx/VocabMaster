const { ipcMain, dialog } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const iconv = require('iconv-lite')
const XLSX = require('xlsx')
const { getDatabase } = require('./database.cjs')
const { createVocabularyTemplate } = require('./vocabulary-template.cjs')

const importCache = new Map()
const backupCache = new Map()

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

const today = () => new Date().toISOString().slice(0, 10)
const addDays = (amount) => {
  const date = new Date()
  date.setDate(date.getDate() + amount)
  return date.toISOString().slice(0, 10)
}

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
  return { easiness_factor: easiness, interval, repetitions, status, next_review_date: addDays(interval) }
}

function computeStreak(db) {
  const dates = new Set(db.prepare('SELECT date FROM daily_statistics WHERE total_count > 0').all().map((row) => row.date))
  let streak = 0
  const cursor = new Date()
  if (!dates.has(today())) cursor.setDate(cursor.getDate() - 1)
  while (dates.has(cursor.toISOString().slice(0, 10))) {
    streak += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return streak
}

function registerIpcHandlers() {
  const db = getDatabase()

  ipcMain.handle('dashboard:get', () => {
    const due = db.prepare(`
      SELECT COUNT(*) count FROM learning_records lr
      JOIN words w ON w.id = lr.word_id JOIN vocabularies v ON v.id = w.vocabulary_id
      WHERE v.is_active = 1 AND lr.is_learned = 1 AND lr.next_review_date <= ?
    `).get(today()).count
    const newCount = db.prepare(`
      SELECT COUNT(DISTINCT lower(w.word)) count FROM words w
      JOIN vocabularies v ON v.id = w.vocabulary_id LEFT JOIN learning_records lr ON lr.word_id = w.id
      WHERE v.is_active = 1 AND COALESCE(lr.is_learned, 0) = 0
    `).get().count
    const daily = db.prepare('SELECT * FROM daily_statistics WHERE date = ?').get(today()) || {}
    const summary = db.prepare(`
      SELECT COUNT(DISTINCT CASE WHEN lr.is_learned = 1 THEN lower(w.word) END) learned,
        COUNT(DISTINCT CASE WHEN lr.status = 'mastered' THEN lower(w.word) END) mastered
      FROM words w LEFT JOIN learning_records lr ON lr.word_id = w.id
    `).get()
    const weekTime = db.prepare("SELECT COALESCE(SUM(study_time), 0) value FROM daily_statistics WHERE date >= date('now','localtime','-6 days')").get().value
    return {
      due, newCount, learned: summary.learned || 0, mastered: summary.mastered || 0,
      streak: computeStreak(db), weekTime, todayTotal: daily.total_count || 0,
      todayCorrect: daily.correct_count || 0, todayTime: daily.study_time || 0
    }
  })

  ipcMain.handle('vocab:list', () => db.prepare(`
    SELECT v.*,
      COUNT(w.id) total,
      COUNT(CASE WHEN lr.is_learned = 1 THEN 1 END) learned,
      COUNT(CASE WHEN lr.status = 'mastered' THEN 1 END) mastered
    FROM vocabularies v LEFT JOIN words w ON w.vocabulary_id = v.id
    LEFT JOIN learning_records lr ON lr.word_id = w.id
    GROUP BY v.id ORDER BY v.is_default DESC, v.created_at ASC
  `).all().map((row) => ({ ...row, is_default: Boolean(row.is_default), is_active: Boolean(row.is_active) })))

  ipcMain.handle('vocab:set-active', (_event, id, active) => {
    db.prepare('UPDATE vocabularies SET is_active = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(active ? 1 : 0, Number(id))
    return true
  })

  ipcMain.handle('vocab:delete', (_event, id) => {
    const vocab = db.prepare('SELECT is_default FROM vocabularies WHERE id = ?').get(Number(id))
    if (!vocab) return false
    if (vocab.is_default) throw new Error('系统默认词库不能删除')
    db.prepare('DELETE FROM vocabularies WHERE id = ?').run(Number(id))
    return true
  })

  ipcMain.handle('words:search', (_event, query, filters = {}) => {
    const term = String(query || '').trim()
    if (!term) return []
    const favoriteClause = filters.favorites ? 'AND w.is_favorited = 1' : ''
    const rows = db.prepare(`
      SELECT w.*, v.name vocabulary_name, COALESCE(lr.status, 'new') status,
        COALESCE(m.mistake_count, 0) mistake_count
      FROM words w JOIN vocabularies v ON v.id = w.vocabulary_id
      LEFT JOIN learning_records lr ON lr.word_id = w.id LEFT JOIN mistake_book m ON m.word_id = w.id
      WHERE (w.word LIKE ? OR w.definition LIKE ? OR w.examples LIKE ?) ${favoriteClause}
      ORDER BY CASE WHEN lower(w.word) = lower(?) THEN 0 ELSE 1 END, w.frequency DESC LIMIT 80
    `).all(`%${term}%`, `%${term}%`, `%${term}%`, term)
    return rows.map(hydrateWord)
  })

  ipcMain.handle('words:get', (_event, id) => {
    const row = db.prepare(`
      SELECT w.*, v.name vocabulary_name, COALESCE(lr.status, 'new') status,
        lr.repetitions, lr.interval, lr.last_review_date,
        COUNT(h.id) study_count,
        ROUND(100.0 * SUM(CASE WHEN h.is_correct = 1 THEN 1 ELSE 0 END) / NULLIF(COUNT(h.id), 0), 1) accuracy
      FROM words w JOIN vocabularies v ON v.id = w.vocabulary_id
      LEFT JOIN learning_records lr ON lr.word_id = w.id LEFT JOIN study_history h ON h.word_id = w.id
      WHERE w.id = ? GROUP BY w.id
    `).get(Number(id))
    return hydrateWord(row)
  })

  ipcMain.handle('words:update', (_event, id, updates = {}) => {
    if (Object.hasOwn(updates, 'is_favorited')) db.prepare('UPDATE words SET is_favorited = ? WHERE id = ?').run(updates.is_favorited ? 1 : 0, Number(id))
    if (Object.hasOwn(updates, 'notes')) db.prepare('UPDATE words SET notes = ? WHERE id = ?').run(String(updates.notes || '').slice(0, 4000), Number(id))
    return hydrateWord(db.prepare('SELECT * FROM words WHERE id = ?').get(Number(id)))
  })

  ipcMain.handle('words:favorites', () => db.prepare(`
    SELECT w.*, v.name vocabulary_name, COALESCE(lr.status, 'new') status
    FROM words w JOIN vocabularies v ON v.id = w.vocabulary_id
    LEFT JOIN learning_records lr ON lr.word_id = w.id
    WHERE w.is_favorited = 1 ORDER BY w.id DESC
  `).all().map(hydrateWord))

  ipcMain.handle('study:plan', (_event, settings = {}, source = 'daily') => {
    const reviewLimit = boundedInt(settings.dailyReviewLimit, 0, 500, 100)
    const newLimit = boundedInt(settings.dailyNewLimit, 0, 200, 20)
    let reviews = []
    let newWords = []
    if (source === 'mistakes') {
      reviews = db.prepare(`
        SELECT w.*, v.name vocabulary_name, lr.easiness_factor, lr.interval, lr.repetitions,
          lr.status, 'review' queue_type, m.mistake_count
        FROM mistake_book m JOIN words w ON w.id = m.word_id JOIN vocabularies v ON v.id = w.vocabulary_id
        LEFT JOIN learning_records lr ON lr.word_id = w.id ORDER BY m.is_frequent DESC, m.mistake_count DESC LIMIT ?
      `).all(Math.max(reviewLimit, 20))
    } else if (source === 'favorites') {
      reviews = db.prepare(`
        SELECT w.*, v.name vocabulary_name, lr.easiness_factor, lr.interval, lr.repetitions,
          COALESCE(lr.status, 'new') status, CASE WHEN lr.is_learned = 1 THEN 'review' ELSE 'new' END queue_type
        FROM words w JOIN vocabularies v ON v.id = w.vocabulary_id LEFT JOIN learning_records lr ON lr.word_id = w.id
        WHERE w.is_favorited = 1 ORDER BY w.id DESC LIMIT ?
      `).all(Math.max(reviewLimit, 20))
    } else {
      reviews = db.prepare(`
        SELECT w.*, v.name vocabulary_name, lr.easiness_factor, lr.interval, lr.repetitions,
          lr.status, 'review' queue_type, COALESCE(m.mistake_count, 0) mistake_count
        FROM learning_records lr JOIN words w ON w.id = lr.word_id
        JOIN vocabularies v ON v.id = w.vocabulary_id LEFT JOIN mistake_book m ON m.word_id = w.id
        WHERE v.is_active = 1 AND lr.is_learned = 1 AND lr.next_review_date <= ?
        ORDER BY COALESCE(m.is_frequent, 0) DESC, COALESCE(m.mistake_count, 0) DESC, lr.next_review_date ASC LIMIT ?
      `).all(today(), reviewLimit)
      const dedupClause = settings.enableCrossVocabDedup === false ? '' : `
        AND NOT EXISTS (
          SELECT 1 FROM words same JOIN learning_records known ON known.word_id = same.id
          WHERE lower(same.word) = lower(w.word) AND known.is_learned = 1
        )`
      newWords = db.prepare(`
        SELECT w.*, v.name vocabulary_name, 2.5 easiness_factor, 0 interval, 0 repetitions,
          'new' status, 'new' queue_type
        FROM words w JOIN vocabularies v ON v.id = w.vocabulary_id
        LEFT JOIN learning_records lr ON lr.word_id = w.id
        WHERE v.is_active = 1 AND COALESCE(lr.is_learned, 0) = 0 ${dedupClause}
        GROUP BY lower(w.word) ORDER BY COALESCE(w.frequency, 0) DESC, w.id ASC LIMIT ?
      `).all(newLimit)
    }
    const choicePool = db.prepare(`
      SELECT definition FROM words w JOIN vocabularies v ON v.id = w.vocabulary_id
      WHERE v.is_active = 1 AND definition <> '[]' ORDER BY RANDOM() LIMIT 80
    `).all().flatMap((row) => jsonArray(row.definition).slice(0, 1))
    return { words: [...reviews, ...newWords].map(hydrateWord), reviewCount: reviews.length, newCount: newWords.length, choicePool }
  })

  ipcMain.handle('study:answer', (_event, payload = {}) => {
    const wordId = Number(payload.wordId)
    const quality = boundedInt(payload.quality, 0, 5, 0)
    const mode = ['flashcard', 'spelling', 'choice'].includes(payload.mode) ? payload.mode : 'flashcard'
    const timeSpent = boundedInt(payload.timeSpent, 0, 3600, 0)
    const transaction = db.transaction(() => {
      let record = db.prepare('SELECT * FROM learning_records WHERE word_id = ?').get(wordId)
      if (!record) {
        db.prepare('INSERT INTO learning_records (word_id) VALUES (?)').run(wordId)
        record = db.prepare('SELECT * FROM learning_records WHERE word_id = ?').get(wordId)
      }
      const wasNew = !record.is_learned
      const next = calculateReview(record, quality, payload.options)
      db.prepare(`
        UPDATE learning_records SET easiness_factor = ?, interval = ?, repetitions = ?, status = ?,
          next_review_date = ?, last_review_date = ?, is_learned = 1,
          first_learned_at = COALESCE(first_learned_at, CURRENT_TIMESTAMP), updated_at = CURRENT_TIMESTAMP
        WHERE word_id = ?
      `).run(next.easiness_factor, next.interval, next.repetitions, next.status, next.next_review_date, today(), wordId)
      const updated = db.prepare('SELECT * FROM learning_records WHERE word_id = ?').get(wordId)
      db.prepare(`INSERT INTO study_history (word_id, learning_record_id, study_mode, quality, time_spent, is_correct)
        VALUES (?, ?, ?, ?, ?, ?)`).run(wordId, updated.id, mode, quality, timeSpent, quality >= 3 ? 1 : 0)
      if (quality < 3) db.prepare(`
        INSERT INTO mistake_book (word_id, mistake_count, last_mistake_at, last_mode, is_frequent)
        VALUES (?, 1, CURRENT_TIMESTAMP, ?, 0)
        ON CONFLICT(word_id) DO UPDATE SET mistake_count = mistake_count + 1,
          last_mistake_at = CURRENT_TIMESTAMP, last_mode = excluded.last_mode,
          is_frequent = CASE WHEN mistake_count + 1 >= 3 THEN 1 ELSE 0 END
      `).run(wordId, mode)
      db.prepare(`
        INSERT INTO daily_statistics (date, new_words_count, review_count, correct_count, total_count, study_time)
        VALUES (?, ?, ?, ?, 1, ?)
        ON CONFLICT(date) DO UPDATE SET new_words_count = new_words_count + excluded.new_words_count,
          review_count = review_count + excluded.review_count, correct_count = correct_count + excluded.correct_count,
          total_count = total_count + 1, study_time = study_time + excluded.study_time
      `).run(today(), wasNew ? 1 : 0, wasNew ? 0 : 1, quality >= 3 ? 1 : 0, timeSpent)
      return updated
    })
    return transaction()
  })

  ipcMain.handle('mistakes:list', (_event, frequentOnly = false) => db.prepare(`
    SELECT w.*, v.name vocabulary_name, m.mistake_count, m.last_mistake_at, m.last_mode, m.is_frequent,
      COALESCE(lr.status, 'new') status
    FROM mistake_book m JOIN words w ON w.id = m.word_id JOIN vocabularies v ON v.id = w.vocabulary_id
    LEFT JOIN learning_records lr ON lr.word_id = w.id
    WHERE (? = 0 OR m.is_frequent = 1) ORDER BY m.is_frequent DESC, m.mistake_count DESC, m.last_mistake_at DESC
  `).all(frequentOnly ? 1 : 0).map(hydrateWord))

  ipcMain.handle('mistakes:remove', (_event, wordId) => {
    db.prepare('DELETE FROM mistake_book WHERE word_id = ?').run(Number(wordId))
    return true
  })

  ipcMain.handle('stats:get', (_event, days = 30) => {
    const range = boundedInt(days, 7, 365, 30)
    const daily = db.prepare("SELECT * FROM daily_statistics WHERE date >= date('now','localtime', ?) ORDER BY date").all(`-${range - 1} days`)
    const modes = db.prepare(`
      SELECT study_mode mode, COUNT(*) total, SUM(is_correct) correct, SUM(time_spent) time
      FROM study_history GROUP BY study_mode
    `).all()
    const vocabularies = db.prepare(`
      SELECT v.id, v.name, COUNT(w.id) total, COUNT(CASE WHEN lr.is_learned = 1 THEN 1 END) learned,
        COUNT(CASE WHEN lr.status = 'mastered' THEN 1 END) mastered
      FROM vocabularies v LEFT JOIN words w ON w.vocabulary_id = v.id
      LEFT JOIN learning_records lr ON lr.word_id = w.id GROUP BY v.id ORDER BY v.is_default DESC, v.id
    `).all()
    const weakWords = db.prepare(`
      SELECT w.id, w.word, w.definition, v.name vocabulary_name, m.mistake_count, m.last_mistake_at,
        COALESCE(lr.repetitions, 0) repetitions
      FROM mistake_book m JOIN words w ON w.id = m.word_id JOIN vocabularies v ON v.id = w.vocabulary_id
      LEFT JOIN learning_records lr ON lr.word_id = w.id
      ORDER BY (1.0 * m.mistake_count / (COALESCE(lr.repetitions, 0) + 1)) DESC LIMIT 20
    `).all().map(hydrateWord)
    const totals = db.prepare(`SELECT COALESCE(SUM(total_count),0) total, COALESCE(SUM(correct_count),0) correct,
      COALESCE(SUM(study_time),0) time, COALESCE(SUM(new_words_count),0) learned FROM daily_statistics`).get()
    return { daily, modes, vocabularies, weakWords, totals: { ...totals, streak: computeStreak(db) } }
  })

  ipcMain.handle('settings:get', () => {
    const row = db.prepare("SELECT value FROM user_settings WHERE key = 'app_settings'").get()
    if (!row) return null
    try { return JSON.parse(row.value) } catch { return null }
  })

  ipcMain.handle('settings:set', (_event, settings) => {
    const value = JSON.stringify(settings || {})
    db.prepare(`INSERT INTO user_settings (key, value) VALUES ('app_settings', ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = CURRENT_TIMESTAMP`).run(value)
    return true
  })

  registerFileHandlers(db)
}

function decodeText(buffer) {
  const utf8 = iconv.decode(buffer, 'utf8')
  return utf8.includes('\uFFFD') ? iconv.decode(buffer, 'gb18030') : utf8
}

function parseVocabularyFile(filePath) {
  const extension = path.extname(filePath).toLowerCase()
  const buffer = fs.readFileSync(filePath)
  if (extension === '.json') {
    const parsed = JSON.parse(decodeText(buffer))
    const source = Array.isArray(parsed) ? parsed : parsed.words
    if (!Array.isArray(source)) throw new Error('JSON 文件必须是数组或包含 words 数组')
    const headers = [...new Set(source.flatMap((row) => Object.keys(row || {})))]
    return { headers, rows: source.map((row) => headers.map((header) => row[header] ?? '')) }
  }
  let workbook
  if (['.xlsx', '.xls'].includes(extension)) workbook = XLSX.read(buffer, { type: 'buffer' })
  else workbook = XLSX.read(decodeText(buffer), { type: 'string', raw: false })
  const sheet = workbook.Sheets[workbook.SheetNames[0]]
  let matrix = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: '', raw: false })
  matrix = matrix.filter((row) => row.some((cell) => String(cell).trim()))
  if (!matrix.length) throw new Error('文件中没有可导入的数据')
  const first = matrix[0].map((cell) => String(cell).trim())
  const headerWords = /word|单词|definition|释义|meaning|音标|phonetic|example|例句/i
  const hasHeader = first.some((cell) => headerWords.test(cell))
  const headers = hasHeader ? first : first.map((_cell, index) => `第 ${index + 1} 列`)
  return { headers, rows: hasHeader ? matrix.slice(1) : matrix }
}

const suggestField = (headers, pattern, fallback = '') => headers.find((header) => pattern.test(header)) || fallback
const cellValue = (row, headers, field) => field ? row[headers.indexOf(field)] : ''
const listValue = (value) => {
  if (Array.isArray(value)) return value.map(String).filter(Boolean)
  const text = String(value || '').trim()
  if (!text) return []
  try { const parsed = JSON.parse(text); if (Array.isArray(parsed)) return parsed.map(String) } catch {}
  const separator = text.includes('|') ? /\s*\|\s*/ : /\s*[；;]\s*/
  return text.split(separator).filter(Boolean)
}

function registerFileHandlers(db) {
  ipcMain.handle('vocab:import-preview', async () => {
    const selected = await dialog.showOpenDialog({
      title: '选择词库文件', properties: ['openFile'],
      filters: [{ name: '支持的词库', extensions: ['csv', 'xlsx', 'xls', 'json', 'txt'] }]
    })
    if (selected.canceled) return null
    const parsed = parseVocabularyFile(selected.filePaths[0])
    const token = crypto.randomUUID()
    importCache.set(token, parsed)
    setTimeout(() => importCache.delete(token), 15 * 60 * 1000).unref()
    return {
      token, filename: path.basename(selected.filePaths[0]), headers: parsed.headers,
      sample: parsed.rows.slice(0, 6), rowCount: parsed.rows.length,
      suggested: {
        word: suggestField(parsed.headers, /^(word|单词|英文)$/i, parsed.headers[0]),
        definition: suggestField(parsed.headers, /definition|释义|meaning|翻译/i, parsed.headers[1] || ''),
        phonetic: suggestField(parsed.headers, /phonetic|音标/i),
        examples: suggestField(parsed.headers, /example|例句/i),
        etymology: suggestField(parsed.headers, /etymology|词根|词源/i),
        synonyms: suggestField(parsed.headers, /synonym|同义/i),
        antonyms: suggestField(parsed.headers, /antonym|反义/i),
        frequency: suggestField(parsed.headers, /frequency|词频|优先级/i)
      }
    }
  })

  ipcMain.handle('vocab:import-commit', (_event, payload = {}) => {
    const cached = importCache.get(payload.token)
    if (!cached) throw new Error('导入预览已过期，请重新选择文件')
    const name = String(payload.name || '自定义词库').trim().slice(0, 80)
    if (!payload.mapping?.word) throw new Error('必须映射单词字段')
    const commit = db.transaction(() => {
      const vocabId = Number(db.prepare(`INSERT INTO vocabularies (name, type, description, is_default, is_active)
        VALUES (?, 'CUSTOM', ?, 0, 1)`).run(name, `从 ${payload.filename || '文件'} 导入`).lastInsertRowid)
      const insert = db.prepare(`INSERT OR IGNORE INTO words
        (vocabulary_id, word, phonetic, definition, examples, etymology, synonyms, antonyms, frequency)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`)
      let imported = 0
      let skipped = 0
      for (const row of cached.rows) {
        const word = String(cellValue(row, cached.headers, payload.mapping.word) || '').trim()
        const definitions = listValue(cellValue(row, cached.headers, payload.mapping.definition))
        if (!word || !definitions.length) { skipped += 1; continue }
        const frequencyValue = Number(cellValue(row, cached.headers, payload.mapping.frequency))
        const result = insert.run(
          vocabId, word, String(cellValue(row, cached.headers, payload.mapping.phonetic) || '') || null,
          JSON.stringify(definitions), JSON.stringify(listValue(cellValue(row, cached.headers, payload.mapping.examples))),
          String(cellValue(row, cached.headers, payload.mapping.etymology) || '') || null,
          JSON.stringify(listValue(cellValue(row, cached.headers, payload.mapping.synonyms))),
          JSON.stringify(listValue(cellValue(row, cached.headers, payload.mapping.antonyms))),
          Number.isFinite(frequencyValue) && frequencyValue >= 0 ? Math.round(frequencyValue) : null
        )
        if (result.changes) imported += 1
        else skipped += 1
      }
      return { vocabId, imported, skipped }
    })
    const result = commit()
    importCache.delete(payload.token)
    return result
  })

  ipcMain.handle('vocab:template', async (_event, format = 'csv') => {
    const safeFormat = ['csv', 'xlsx', 'json'].includes(format) ? format : 'csv'
    const template = createVocabularyTemplate(safeFormat)
    const selected = await dialog.showSaveDialog({
      title: '保存词库制作模板',
      defaultPath: template.filename,
      filters: [{ name: `${template.extension.toUpperCase()} 词库模板`, extensions: [template.extension] }]
    })
    if (selected.canceled) return null
    if (safeFormat === 'xlsx') {
      const workbook = XLSX.utils.book_new()
      const worksheet = XLSX.utils.aoa_to_sheet([template.headers, ...template.rows])
      worksheet['!cols'] = template.headers.map((header) => ({ wch: header === 'word' ? 18 : header === 'frequency' ? 12 : 32 }))
      XLSX.utils.book_append_sheet(workbook, worksheet, 'Vocabulary')
      XLSX.writeFile(workbook, selected.filePath)
    } else {
      fs.writeFileSync(selected.filePath, template.content, 'utf8')
    }
    return selected.filePath
  })

  ipcMain.handle('vocab:export', async (_event, id, format = 'json') => {
    const vocab = db.prepare('SELECT * FROM vocabularies WHERE id = ?').get(Number(id))
    if (!vocab) throw new Error('词库不存在')
    const words = db.prepare('SELECT * FROM words WHERE vocabulary_id = ? ORDER BY id').all(Number(id)).map(hydrateWord)
    const selected = await dialog.showSaveDialog({
      title: '导出词库', defaultPath: `${vocab.name}.${format === 'csv' ? 'csv' : 'json'}`,
      filters: [{ name: format === 'csv' ? 'CSV' : 'JSON', extensions: [format === 'csv' ? 'csv' : 'json'] }]
    })
    if (selected.canceled) return null
    if (format === 'csv') {
      const rows = words.map((word) => ({ word: word.word, phonetic: word.phonetic || '', definition: word.definition.join('; '), examples: word.examples.join('; ') }))
      fs.writeFileSync(selected.filePath, '\uFEFF' + XLSX.utils.sheet_to_csv(XLSX.utils.json_to_sheet(rows)), 'utf8')
    } else fs.writeFileSync(selected.filePath, JSON.stringify({ version: '1.0', vocabulary: vocab, words }, null, 2), 'utf8')
    return selected.filePath
  })

  ipcMain.handle('data:export', async () => {
    const selected = await dialog.showSaveDialog({
      title: '导出学习备份', defaultPath: `vocabmaster-backup-${today()}.json`,
      filters: [{ name: 'VocabMaster 备份', extensions: ['json'] }]
    })
    if (selected.canceled) return null
    const tableNames = ['vocabularies', 'words', 'learning_records', 'study_history', 'mistake_book', 'daily_statistics', 'user_settings']
    const data = { version: '1.0', exported_at: new Date().toISOString() }
    tableNames.forEach((table) => { data[table] = db.prepare(`SELECT * FROM ${table}`).all() })
    fs.writeFileSync(selected.filePath, JSON.stringify(data, null, 2), 'utf8')
    return selected.filePath
  })

  ipcMain.handle('data:import-preview', async () => {
    const selected = await dialog.showOpenDialog({ title: '选择学习备份', properties: ['openFile'], filters: [{ name: 'JSON', extensions: ['json'] }] })
    if (selected.canceled) return null
    const data = JSON.parse(decodeText(fs.readFileSync(selected.filePaths[0])))
    if (data.version !== '1.0' || !Array.isArray(data.vocabularies) || !Array.isArray(data.words)) throw new Error('不是有效的 VocabMaster 1.0 备份')
    const token = crypto.randomUUID()
    backupCache.set(token, data)
    setTimeout(() => backupCache.delete(token), 15 * 60 * 1000).unref()
    return { token, filename: path.basename(selected.filePaths[0]), version: data.version, exportedAt: data.exported_at,
      vocabularies: data.vocabularies.length, words: data.words.length, records: data.learning_records?.length || 0 }
  })

  ipcMain.handle('data:import-commit', (_event, token) => {
    const data = backupCache.get(token)
    if (!data) throw new Error('备份预览已过期，请重新选择文件')
    const tables = ['study_history', 'mistake_book', 'learning_records', 'daily_statistics', 'user_settings', 'words', 'vocabularies']
    const columns = {
      vocabularies: ['id','name','type','description','is_default','is_active','created_at','updated_at'],
      words: ['id','vocabulary_id','word','phonetic','definition','examples','etymology','synonyms','antonyms','frequency','notes','is_favorited','created_at'],
      learning_records: ['id','word_id','easiness_factor','interval','repetitions','status','next_review_date','last_review_date','is_learned','first_learned_at','created_at','updated_at'],
      study_history: ['id','word_id','learning_record_id','study_mode','quality','time_spent','is_correct','studied_at'],
      mistake_book: ['id','word_id','mistake_count','last_mistake_at','last_mode','is_frequent','created_at'],
      daily_statistics: ['id','date','new_words_count','review_count','correct_count','total_count','study_time','created_at'],
      user_settings: ['id','key','value','updated_at']
    }
    db.pragma('foreign_keys = OFF')
    try {
      db.transaction(() => {
        tables.forEach((table) => db.prepare(`DELETE FROM ${table}`).run())
        Object.entries(columns).forEach(([table, fields]) => {
          const insert = db.prepare(`INSERT INTO ${table} (${fields.join(',')}) VALUES (${fields.map(() => '?').join(',')})`)
          for (const row of data[table] || []) insert.run(...fields.map((field) => row[field] ?? null))
        })
      })()
    } finally { db.pragma('foreign_keys = ON') }
    backupCache.delete(token)
    return true
  })

  ipcMain.handle('data:reset-progress', () => {
    db.transaction(() => {
      db.prepare('DELETE FROM study_history').run()
      db.prepare('DELETE FROM mistake_book').run()
      db.prepare('DELETE FROM learning_records').run()
      db.prepare('DELETE FROM daily_statistics').run()
    })()
    return true
  })
}

module.exports = { registerIpcHandlers, calculateReview, parseVocabularyFile }
