const STRATEGIES = ['replace', 'skip', 'merge']

function boolInt(value, fallback = 0) {
  if (value == null) return fallback
  return value ? 1 : 0
}

const stamp = (field) => (field === 'created_at' || field === 'updated_at' ? 'COALESCE(?, CURRENT_TIMESTAMP)' : '?')

function replaceAll(db, data) {
  const tables = ['study_history', 'mistake_book', 'learning_records', 'daily_statistics', 'user_settings', 'words', 'vocabularies']
  const columns = {
    vocabularies: ['id', 'name', 'type', 'description', 'is_default', 'is_active', 'created_at', 'updated_at'],
    words: ['id', 'vocabulary_id', 'word', 'phonetic', 'definition', 'examples', 'etymology', 'synonyms', 'antonyms', 'frequency', 'notes', 'is_favorited', 'created_at'],
    learning_records: ['id', 'word_id', 'easiness_factor', 'interval', 'repetitions', 'status', 'next_review_date', 'last_review_date', 'is_learned', 'first_learned_at', 'created_at', 'updated_at'],
    study_history: ['id', 'word_id', 'learning_record_id', 'study_mode', 'quality', 'time_spent', 'is_correct', 'studied_at'],
    mistake_book: ['id', 'word_id', 'mistake_count', 'last_mistake_at', 'last_mode', 'is_frequent', 'created_at'],
    daily_statistics: ['id', 'date', 'new_words_count', 'review_count', 'correct_count', 'total_count', 'study_time', 'created_at'],
    user_settings: ['id', 'key', 'value', 'updated_at']
  }
  let added = 0
  tables.forEach((table) => db.prepare(`DELETE FROM ${table}`).run())
  Object.entries(columns).forEach(([table, fields]) => {
    const insert = db.prepare(`INSERT INTO ${table} (${fields.join(',')}) VALUES (${fields.map(stamp).join(',')})`)
    for (const row of data[table] || []) {
      insert.run(...fields.map((field) => row[field] ?? null))
      added += 1
    }
  })
  return { added, updated: 0 }
}

function combine(db, data, mergeUpdates) {
  const counts = { added: 0, updated: 0 }

  const vocabMap = new Map()
  const insertVocab = db.prepare(`INSERT INTO vocabularies (name, type, description, is_default, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP))`)
  for (const row of data.vocabularies || []) {
    const local = db.prepare('SELECT id FROM vocabularies WHERE name = ?').get(String(row.name || ''))
    if (local) { vocabMap.set(row.id, local.id); continue }
    vocabMap.set(row.id, Number(insertVocab.run(
      String(row.name || '未命名词库'), row.type || 'CUSTOM', row.description ?? null,
      boolInt(row.is_default), row.is_active == null ? 1 : boolInt(row.is_active), row.created_at ?? null, row.updated_at ?? null
    ).lastInsertRowid))
    counts.added += 1
  }

  const wordMap = new Map()
  const insertWord = db.prepare(`INSERT INTO words
    (vocabulary_id, word, phonetic, definition, examples, etymology, synonyms, antonyms, frequency, notes, is_favorited, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`)
  for (const row of data.words || []) {
    const vocabId = vocabMap.get(row.vocabulary_id)
    if (vocabId == null) continue
    const local = db.prepare('SELECT id FROM words WHERE vocabulary_id = ? AND word = ? COLLATE NOCASE').get(vocabId, String(row.word || ''))
    if (local) { wordMap.set(row.id, local.id); continue }
    wordMap.set(row.id, Number(insertWord.run(
      vocabId, row.word, row.phonetic ?? null, row.definition ?? '[]', row.examples ?? '[]', row.etymology ?? null,
      row.synonyms ?? '[]', row.antonyms ?? '[]', row.frequency ?? null, row.notes ?? null, boolInt(row.is_favorited), row.created_at ?? null
    ).lastInsertRowid))
    counts.added += 1
  }

  const insertRecord = db.prepare(`INSERT INTO learning_records
    (word_id, easiness_factor, interval, repetitions, status, next_review_date, last_review_date, is_learned, first_learned_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP))`)
  const updateRecord = db.prepare(`UPDATE learning_records SET easiness_factor = ?, interval = ?, repetitions = ?, status = ?,
    next_review_date = ?, last_review_date = ?, is_learned = ?, first_learned_at = ?, updated_at = ? WHERE word_id = ?`)
  for (const row of data.learning_records || []) {
    const wordId = wordMap.get(row.word_id)
    if (wordId == null) continue
    const local = db.prepare('SELECT * FROM learning_records WHERE word_id = ?').get(wordId)
    if (!local) {
      insertRecord.run(wordId, row.easiness_factor ?? 2.5, row.interval ?? 0, row.repetitions ?? 0, row.status ?? 'new',
        row.next_review_date ?? null, row.last_review_date ?? null, boolInt(row.is_learned), row.first_learned_at ?? null, row.created_at ?? null, row.updated_at ?? null)
      counts.added += 1
    } else if (mergeUpdates && String(row.updated_at || '') > String(local.updated_at || '')) {
      updateRecord.run(row.easiness_factor ?? local.easiness_factor, row.interval ?? local.interval, row.repetitions ?? local.repetitions,
        row.status ?? local.status, row.next_review_date ?? local.next_review_date, row.last_review_date ?? local.last_review_date,
        boolInt(row.is_learned, local.is_learned), row.first_learned_at ?? local.first_learned_at, row.updated_at ?? local.updated_at, wordId)
      counts.updated += 1
    }
  }

  const insertHistory = db.prepare(`INSERT INTO study_history (word_id, learning_record_id, study_mode, quality, time_spent, is_correct, studied_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)`)
  for (const row of data.study_history || []) {
    const wordId = wordMap.get(row.word_id)
    if (wordId == null) continue
    const exists = db.prepare('SELECT 1 FROM study_history WHERE word_id = ? AND studied_at = ? AND quality = ?')
      .get(wordId, row.studied_at ?? null, row.quality ?? 0)
    if (exists) continue
    let record = db.prepare('SELECT id FROM learning_records WHERE word_id = ?').get(wordId)
    if (!record) {
      record = { id: Number(insertRecord.run(wordId, 2.5, 0, 0, 'new', null, null, 0, null, null, null).lastInsertRowid) }
      counts.added += 1
    }
    insertHistory.run(wordId, record.id, row.study_mode || 'flashcard', row.quality ?? 0, row.time_spent ?? 0, boolInt(row.is_correct), row.studied_at ?? null)
    counts.added += 1
  }

  const insertMistake = db.prepare(`INSERT INTO mistake_book (word_id, mistake_count, last_mistake_at, last_mode, is_frequent, created_at)
    VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`)
  const updateMistake = db.prepare(`UPDATE mistake_book SET mistake_count = ?, last_mistake_at = ?, last_mode = ?, is_frequent = ? WHERE word_id = ?`)
  for (const row of data.mistake_book || []) {
    const wordId = wordMap.get(row.word_id)
    if (wordId == null) continue
    const local = db.prepare('SELECT * FROM mistake_book WHERE word_id = ?').get(wordId)
    if (!local) {
      insertMistake.run(wordId, row.mistake_count ?? 1, row.last_mistake_at ?? null, row.last_mode ?? null, boolInt(row.is_frequent), row.created_at ?? null)
      counts.added += 1
    } else if (mergeUpdates && String(row.last_mistake_at || '') > String(local.last_mistake_at || '')) {
      updateMistake.run(row.mistake_count ?? local.mistake_count, row.last_mistake_at ?? local.last_mistake_at,
        row.last_mode ?? local.last_mode, boolInt(row.is_frequent, local.is_frequent), wordId)
      counts.updated += 1
    }
  }

  const insertDaily = db.prepare(`INSERT INTO daily_statistics (date, new_words_count, review_count, correct_count, total_count, study_time, created_at)
    VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`)
  const updateDaily = db.prepare(`UPDATE daily_statistics SET new_words_count = ?, review_count = ?, correct_count = ?, total_count = ?, study_time = ? WHERE date = ?`)
  for (const row of data.daily_statistics || []) {
    const local = db.prepare('SELECT * FROM daily_statistics WHERE date = ?').get(row.date)
    if (!local) {
      insertDaily.run(row.date, row.new_words_count ?? 0, row.review_count ?? 0, row.correct_count ?? 0, row.total_count ?? 0, row.study_time ?? 0, row.created_at ?? null)
      counts.added += 1
    } else if (mergeUpdates && Number(row.total_count || 0) > Number(local.total_count || 0)) {
      updateDaily.run(row.new_words_count ?? 0, row.review_count ?? 0, row.correct_count ?? 0, row.total_count ?? 0, row.study_time ?? 0, row.date)
      counts.updated += 1
    }
  }

  const insertSetting = db.prepare('INSERT INTO user_settings (key, value, updated_at) VALUES (?, ?, COALESCE(?, CURRENT_TIMESTAMP))')
  const updateSetting = db.prepare('UPDATE user_settings SET value = ?, updated_at = ? WHERE key = ?')
  for (const row of data.user_settings || []) {
    const local = db.prepare('SELECT * FROM user_settings WHERE key = ?').get(row.key)
    if (!local) {
      insertSetting.run(row.key, row.value ?? null, row.updated_at ?? null)
      counts.added += 1
    } else if (mergeUpdates && String(row.updated_at || '') > String(local.updated_at || '')) {
      updateSetting.run(row.value ?? null, row.updated_at ?? null, row.key)
      counts.updated += 1
    }
  }

  return counts
}

function applyBackup(db, data, strategy = 'replace') {
  if (!STRATEGIES.includes(strategy)) throw new Error(`未知恢复策略：${String(strategy)}`)
  db.exec('PRAGMA foreign_keys = OFF')
  db.exec('BEGIN')
  try {
    const counts = strategy === 'replace' ? replaceAll(db, data) : combine(db, data, strategy === 'merge')
    db.exec('COMMIT')
    return counts
  } catch (error) {
    db.exec('ROLLBACK')
    throw error
  } finally {
    db.exec('PRAGMA foreign_keys = ON')
  }
}

module.exports = { applyBackup }
