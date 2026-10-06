const STRATEGIES = ['replace', 'skip', 'merge']

function boolInt(value, fallback = 0) {
  if (value == null) return fallback
  return value ? 1 : 0
}

const stamp = (field) => (field === 'created_at' || field === 'updated_at' ? 'COALESCE(?, CURRENT_TIMESTAMP)' : '?')

async function replaceAll(adapter, data) {
  const tables = ['word_tags', 'tags', 'daily_plans', 'study_history', 'mistake_book', 'learning_records', 'daily_statistics', 'user_settings', 'words', 'vocabularies']
  const columns = {
    vocabularies: ['id', 'name', 'type', 'description', 'is_default', 'is_active', 'created_at', 'updated_at'],
    words: ['id', 'vocabulary_id', 'word', 'phonetic', 'definition', 'examples', 'etymology', 'synonyms', 'antonyms', 'frequency', 'notes', 'is_favorited', 'created_at', 'roots', 'word_family', 'collocations', 'content_source', 'content_license'],
    learning_records: ['id', 'word_id', 'easiness_factor', 'interval', 'repetitions', 'status', 'next_review_date', 'last_review_date', 'is_learned', 'first_learned_at', 'created_at', 'updated_at', 'algorithm', 'fsrs_card', 'sm2_snapshot'],
    study_history: ['id', 'word_id', 'learning_record_id', 'study_mode', 'session_mode', 'quality', 'time_spent', 'is_correct', 'studied_at', 'algorithm', 'algorithm_version', 'algorithm_params', 'mistake_reason'],
    mistake_book: ['id', 'word_id', 'mistake_count', 'last_mistake_at', 'last_mode', 'is_frequent', 'created_at'],
    daily_statistics: ['id', 'date', 'new_words_count', 'review_count', 'correct_count', 'total_count', 'study_time', 'created_at'],
    user_settings: ['id', 'key', 'value', 'updated_at'],
    tags: ['id', 'name'], word_tags: ['word_id', 'tag_id'], daily_plans: ['date', 'planned_new', 'planned_review']
  }
  let added = 0
  for (const table of tables) await adapter.run(`DELETE FROM ${table}`)
  for (const [table, fields] of Object.entries(columns)) {
    const insert = `INSERT INTO ${table} (${fields.join(',')}) VALUES (${fields.map(stamp).join(',')})`
    for (let row of data[table] || []) {
      if (table === 'study_history') {
        const record = await adapter.get('SELECT id FROM learning_records WHERE word_id = ?', [row.word_id])
        if (!record) throw new Error('备份缺少学习记录，恢复已撤销')
        row = { ...row, learning_record_id: record.id }
      }
      await adapter.run(insert, fields.map((field) => field === 'session_mode'
        ? (row.session_mode || row.study_mode || 'flashcard')
        : row[field] ?? ({ algorithm: 'sm2', algorithm_version: '1', algorithm_params: '{}', mistake_reason: '', roots: '', word_family: '[]', collocations: '[]', content_source: '', content_license: '' }[field] ?? null)))
      added += 1
    }
  }
  return { added, updated: 0 }
}

async function combine(adapter, data, mergeUpdates) {
  const counts = { added: 0, updated: 0 }

  const vocabMap = new Map()
  const insertVocab = `INSERT INTO vocabularies (name, type, description, is_default, is_active, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP))`
  for (const row of data.vocabularies || []) {
    const local = await adapter.get('SELECT id FROM vocabularies WHERE name = ?', [String(row.name || '')])
    if (local) { vocabMap.set(row.id, local.id); continue }
    const inserted = await adapter.run(insertVocab, [
      String(row.name || '未命名词库'), row.type || 'CUSTOM', row.description ?? null,
      boolInt(row.is_default), row.is_active == null ? 1 : boolInt(row.is_active), row.created_at ?? null, row.updated_at ?? null
    ])
    vocabMap.set(row.id, inserted.lastInsertRowid)
    counts.added += 1
  }

  const wordMap = new Map()
  const insertWord = `INSERT INTO words
    (vocabulary_id, word, phonetic, definition, examples, etymology, synonyms, antonyms, frequency, notes, is_favorited, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`
  for (const row of data.words || []) {
    const vocabId = vocabMap.get(row.vocabulary_id)
    if (vocabId == null) continue
    const local = await adapter.get('SELECT id FROM words WHERE vocabulary_id = ? AND word = ? COLLATE NOCASE', [vocabId, String(row.word || '')])
    if (local) {
      wordMap.set(row.id, local.id)
      if (mergeUpdates) await adapter.run(`UPDATE words SET roots = COALESCE(?, roots), word_family = COALESCE(?, word_family), collocations = COALESCE(?, collocations), content_source = COALESCE(?, content_source), content_license = COALESCE(?, content_license) WHERE id = ?`,
        [row.roots ?? null, row.word_family ?? null, row.collocations ?? null, row.content_source ?? null, row.content_license ?? null, local.id])
      continue
    }
    const inserted = await adapter.run(insertWord, [
      vocabId, row.word, row.phonetic ?? null, row.definition ?? '[]', row.examples ?? '[]', row.etymology ?? null,
      row.synonyms ?? '[]', row.antonyms ?? '[]', row.frequency ?? null, row.notes ?? null, boolInt(row.is_favorited), row.created_at ?? null
    ])
    wordMap.set(row.id, inserted.lastInsertRowid)
    await adapter.run('UPDATE words SET roots = ?, word_family = ?, collocations = ?, content_source = ?, content_license = ? WHERE id = ?',
      [row.roots || '', row.word_family || '[]', row.collocations || '[]', row.content_source || '', row.content_license || '', inserted.lastInsertRowid])
    counts.added += 1
  }

  const insertRecord = `INSERT INTO learning_records
    (word_id, easiness_factor, interval, repetitions, status, next_review_date, last_review_date, is_learned, first_learned_at, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP), COALESCE(?, CURRENT_TIMESTAMP))`
  const updateRecord = `UPDATE learning_records SET easiness_factor = ?, interval = ?, repetitions = ?, status = ?,
    next_review_date = ?, last_review_date = ?, is_learned = ?, first_learned_at = ?, updated_at = ? WHERE word_id = ?`
  for (const row of data.learning_records || []) {
    const wordId = wordMap.get(row.word_id)
    if (wordId == null) continue
    const local = await adapter.get('SELECT * FROM learning_records WHERE word_id = ?', [wordId])
    if (!local) {
      await adapter.run(insertRecord, [wordId, row.easiness_factor ?? 2.5, row.interval ?? 0, row.repetitions ?? 0, row.status ?? 'new',
        row.next_review_date ?? null, row.last_review_date ?? null, boolInt(row.is_learned), row.first_learned_at ?? null, row.created_at ?? null, row.updated_at ?? null])
      counts.added += 1
    } else if (mergeUpdates && String(row.updated_at || '') > String(local.updated_at || '')) {
      await adapter.run(updateRecord, [row.easiness_factor ?? local.easiness_factor, row.interval ?? local.interval, row.repetitions ?? local.repetitions,
        row.status ?? local.status, row.next_review_date ?? local.next_review_date, row.last_review_date ?? local.last_review_date,
        boolInt(row.is_learned, local.is_learned), row.first_learned_at ?? local.first_learned_at, row.updated_at ?? local.updated_at, wordId])
      counts.updated += 1
    }
    if (!local || (mergeUpdates && String(row.updated_at || '') > String(local.updated_at || ''))) {
      await adapter.run('UPDATE learning_records SET algorithm = ?, fsrs_card = ?, sm2_snapshot = ? WHERE word_id = ?',
        [row.algorithm || 'sm2', row.fsrs_card ?? null, row.sm2_snapshot ?? null, wordId])
    }
  }

  const insertHistory = `INSERT INTO study_history (word_id, learning_record_id, study_mode, session_mode, quality, time_spent, is_correct, studied_at, algorithm, algorithm_version, algorithm_params, mistake_reason)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  for (const row of data.study_history || []) {
    const wordId = wordMap.get(row.word_id)
    if (wordId == null) continue
    const exists = await adapter.get('SELECT 1 FROM study_history WHERE word_id = ? AND studied_at = ? AND quality = ?',
      [wordId, row.studied_at ?? null, row.quality ?? 0])
    if (exists) {
      if (mergeUpdates && row.mistake_reason) await adapter.run('UPDATE study_history SET mistake_reason = ? WHERE word_id = ? AND studied_at = ? AND quality = ?', [row.mistake_reason, wordId, row.studied_at, row.quality])
      continue
    }
    let record = await adapter.get('SELECT id FROM learning_records WHERE word_id = ?', [wordId])
    if (!record) {
      const inserted = await adapter.run(insertRecord, [wordId, 2.5, 0, 0, 'new', null, null, 0, null, null, null])
      record = { id: inserted.lastInsertRowid }
      counts.added += 1
    }
    await adapter.run(insertHistory, [wordId, record.id, row.study_mode || 'flashcard', row.session_mode || row.study_mode || 'flashcard', row.quality ?? 0, row.time_spent ?? 0, boolInt(row.is_correct), row.studied_at ?? null, row.algorithm || 'sm2', row.algorithm_version || '1', row.algorithm_params || '{}', row.mistake_reason || ''])
    counts.added += 1
  }

  const insertMistake = `INSERT INTO mistake_book (word_id, mistake_count, last_mistake_at, last_mode, is_frequent, created_at)
    VALUES (?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`
  const updateMistake = `UPDATE mistake_book SET mistake_count = ?, last_mistake_at = ?, last_mode = ?, is_frequent = ? WHERE word_id = ?`
  for (const row of data.mistake_book || []) {
    const wordId = wordMap.get(row.word_id)
    if (wordId == null) continue
    const local = await adapter.get('SELECT * FROM mistake_book WHERE word_id = ?', [wordId])
    if (!local) {
      await adapter.run(insertMistake, [wordId, row.mistake_count ?? 1, row.last_mistake_at ?? null, row.last_mode ?? null, boolInt(row.is_frequent), row.created_at ?? null])
      counts.added += 1
    } else if (mergeUpdates && String(row.last_mistake_at || '') > String(local.last_mistake_at || '')) {
      await adapter.run(updateMistake, [row.mistake_count ?? local.mistake_count, row.last_mistake_at ?? local.last_mistake_at,
        row.last_mode ?? local.last_mode, boolInt(row.is_frequent, local.is_frequent), wordId])
      counts.updated += 1
    }
  }

  const insertDaily = `INSERT INTO daily_statistics (date, new_words_count, review_count, correct_count, total_count, study_time, created_at)
    VALUES (?, ?, ?, ?, ?, ?, COALESCE(?, CURRENT_TIMESTAMP))`
  const updateDaily = `UPDATE daily_statistics SET new_words_count = ?, review_count = ?, correct_count = ?, total_count = ?, study_time = ? WHERE date = ?`
  for (const row of data.daily_statistics || []) {
    const local = await adapter.get('SELECT * FROM daily_statistics WHERE date = ?', [row.date])
    if (!local) {
      await adapter.run(insertDaily, [row.date, row.new_words_count ?? 0, row.review_count ?? 0, row.correct_count ?? 0, row.total_count ?? 0, row.study_time ?? 0, row.created_at ?? null])
      counts.added += 1
    } else if (mergeUpdates && Number(row.total_count || 0) > Number(local.total_count || 0)) {
      await adapter.run(updateDaily, [row.new_words_count ?? 0, row.review_count ?? 0, row.correct_count ?? 0, row.total_count ?? 0, row.study_time ?? 0, row.date])
      counts.updated += 1
    }
  }

  const insertSetting = 'INSERT INTO user_settings (key, value, updated_at) VALUES (?, ?, COALESCE(?, CURRENT_TIMESTAMP))'
  const updateSetting = 'UPDATE user_settings SET value = ?, updated_at = ? WHERE key = ?'
  for (const row of data.user_settings || []) {
    const local = await adapter.get('SELECT * FROM user_settings WHERE key = ?', [row.key])
    if (!local) {
      await adapter.run(insertSetting, [row.key, row.value ?? null, row.updated_at ?? null])
      counts.added += 1
    } else if (mergeUpdates && String(row.updated_at || '') > String(local.updated_at || '')) {
      await adapter.run(updateSetting, [row.value ?? null, row.updated_at ?? null, row.key])
      counts.updated += 1
    }
  }

  const tagMap = new Map()
  for (const tag of data.tags || []) {
    const local = await adapter.get('SELECT id FROM tags WHERE name = ? COLLATE NOCASE', [tag.name])
    if (local) tagMap.set(tag.id, local.id)
    else {
      const added = await adapter.run('INSERT INTO tags (name) VALUES (?)', [tag.name])
      tagMap.set(tag.id, added.lastInsertRowid); counts.added += 1
    }
  }
  for (const link of data.word_tags || []) {
    if (wordMap.has(link.word_id) && tagMap.has(link.tag_id)) {
      await adapter.run('INSERT OR IGNORE INTO word_tags (word_id, tag_id) VALUES (?, ?)', [wordMap.get(link.word_id), tagMap.get(link.tag_id)])
    }
  }
  for (const plan of data.daily_plans || []) {
    await adapter.run('INSERT OR IGNORE INTO daily_plans (date, planned_new, planned_review) VALUES (?, ?, ?)', [plan.date, plan.planned_new || 0, plan.planned_review || 0])
  }
  return counts
}

async function applyBackup(adapter, data, strategy = 'replace') {
  validateBackup(data)
  if (!STRATEGIES.includes(strategy)) throw new Error(`未知恢复策略：${String(strategy)}`)
  await adapter.exec('PRAGMA foreign_keys = OFF')
  try {
    return await adapter.withTransaction(async () => {
      const result = strategy === 'replace' ? await replaceAll(adapter, data) : await combine(adapter, data, strategy === 'merge')
      if ((await adapter.all('PRAGMA foreign_key_check')).length) throw new Error('备份关联数据不完整，恢复已撤销')
      return result
    })
  } finally {
    await adapter.exec('PRAGMA foreign_keys = ON')
  }
}

function validateBackup(data) {
  if (!data || !['1.0', '1.2'].includes(data.version) || !Array.isArray(data.vocabularies) || !Array.isArray(data.words)) throw new Error('不是支持的 VocabMaster 备份版本')
  for (const table of ['learning_records', 'study_history', 'mistake_book', 'daily_statistics', 'user_settings', 'tags', 'word_tags', 'daily_plans']) {
    if (data[table] != null && !Array.isArray(data[table])) throw new Error(`备份 ${table} 格式无效`)
  }
}

module.exports = { applyBackup, validateBackup }
