import { createRequire } from 'node:module'
import { beforeEach, describe, expect, test } from 'vitest'

const require = createRequire(import.meta.url)
const { DatabaseSync } = require('node:sqlite')
const { schema } = require('../electron/db-schema.cjs')
const { applyBackup } = require('../electron/backup-merge.cjs')

function makeDb() {
  const db = new DatabaseSync(':memory:')
  db.exec(schema)
  db.prepare(`INSERT INTO vocabularies (id, name, type, description, is_default, is_active)
    VALUES (1, 'CET-4 核心词汇', 'CET4', '', 1, 1)`).run()
  db.prepare(`INSERT INTO words (id, vocabulary_id, word, definition)
    VALUES (10, 1, 'abandon', '["v. 放弃"]')`).run()
  db.prepare(`INSERT INTO learning_records (word_id, easiness_factor, interval, repetitions, status, is_learned, updated_at)
    VALUES (10, 2.5, 6, 2, 'review', 1, '2026-09-20 10:00:00')`).run()
  db.prepare(`INSERT INTO daily_statistics (date, total_count, correct_count)
    VALUES ('2026-09-20', 30, 25)`).run()
  return db
}

const word = (id, vocabularyId, name) => ({
  id, vocabulary_id: vocabularyId, word: name, phonetic: null, definition: '["释义"]', examples: '[]',
  etymology: null, synonyms: '[]', antonyms: '[]', frequency: null, notes: null, is_favorited: 0, created_at: null
})

function makeBackup(updatedAt = '2026-09-25 09:00:00', total = 10) {
  return {
    version: '1.0',
    vocabularies: [
      { id: 50, name: 'CET-4 核心词汇', type: 'CET4', description: '', is_default: 1, is_active: 1, created_at: null, updated_at: null },
      { id: 51, name: '自定义词库', type: 'CUSTOM', description: '', is_default: 0, is_active: 1, created_at: null, updated_at: null }
    ],
    words: [word(100, 50, 'abandon'), word(101, 50, 'ability'), word(102, 51, 'cloud')],
    learning_records: [
      { word_id: 100, easiness_factor: 2.6, interval: 12, repetitions: 4, status: 'review', next_review_date: '2026-10-01', last_review_date: '2026-09-24', is_learned: 1, first_learned_at: null, created_at: null, updated_at: updatedAt },
      { word_id: 101, easiness_factor: 2.5, interval: 1, repetitions: 1, status: 'learning', next_review_date: '2026-09-25', last_review_date: '2026-09-24', is_learned: 1, first_learned_at: null, created_at: null, updated_at: '2026-09-24 08:00:00' }
    ],
    study_history: [{ word_id: 100, learning_record_id: 1, study_mode: 'spelling', quality: 5, time_spent: 8, is_correct: 1, studied_at: '2026-09-24 07:00:00' }],
    mistake_book: [{ word_id: 101, mistake_count: 2, last_mistake_at: '2026-09-24 08:00:00', last_mode: 'choice', is_frequent: 0, created_at: null }],
    daily_statistics: [{ date: '2026-09-20', new_words_count: 2, review_count: 8, correct_count: 8, total_count: total, study_time: 120, created_at: null }],
    user_settings: [{ id: 1, key: 'app_settings', value: '{"theme":"dark"}', updated_at: '2026-09-24 08:00:00' }]
  }
}

describe('backup restore strategies', () => {
  let db
  beforeEach(() => { db = makeDb() })

  test('replace wipes local data and restores the backup', () => {
    applyBackup(db, makeBackup(), 'replace')
    expect(db.prepare('SELECT COUNT(*) c FROM words').get().c).toBe(3)
    expect(db.prepare("SELECT interval FROM learning_records lr JOIN words w ON w.id = lr.word_id WHERE w.word = 'abandon'").get().interval).toBe(12)
  })

  test('skip keeps existing rows and only adds missing ones', () => {
    applyBackup(db, makeBackup(), 'skip')
    expect(db.prepare("SELECT interval FROM learning_records lr JOIN words w ON w.id = lr.word_id WHERE w.word = 'abandon'").get().interval).toBe(6)
    expect(db.prepare("SELECT COUNT(*) c FROM words WHERE word = 'ability'").get().c).toBe(1)
    expect(db.prepare("SELECT COUNT(*) c FROM vocabularies WHERE name = '自定义词库'").get().c).toBe(1)
  })

  test('merge updates a record only when the incoming copy is newer', () => {
    applyBackup(db, makeBackup('2026-09-25 09:00:00'), 'merge')
    expect(db.prepare("SELECT interval FROM learning_records lr JOIN words w ON w.id = lr.word_id WHERE w.word = 'abandon'").get().interval).toBe(12)
    applyBackup(db, makeBackup('2026-09-01 09:00:00'), 'merge')
    expect(db.prepare("SELECT interval FROM learning_records lr JOIN words w ON w.id = lr.word_id WHERE w.word = 'abandon'").get().interval).toBe(12)
  })

  test('merge keeps the local record when it is newer', () => {
    applyBackup(db, makeBackup('2026-09-01 09:00:00'), 'merge')
    expect(db.prepare("SELECT interval FROM learning_records lr JOIN words w ON w.id = lr.word_id WHERE w.word = 'abandon'").get().interval).toBe(6)
  })

  test('remaps incoming vocabulary and word ids onto local rows', () => {
    applyBackup(db, makeBackup(), 'merge')
    const ability = db.prepare("SELECT vocabulary_id FROM words WHERE word = 'ability'").get()
    expect(ability.vocabulary_id).toBe(1)
    const cloudVocab = db.prepare("SELECT v.name name FROM words w JOIN vocabularies v ON v.id = w.vocabulary_id WHERE w.word = 'cloud'").get()
    expect(cloudVocab.name).toBe('自定义词库')
    expect(db.prepare("SELECT COUNT(*) c FROM learning_records WHERE word_id = 10").get().c).toBe(1)
  })

  test('history is not duplicated when the same backup is applied twice', () => {
    applyBackup(db, makeBackup(), 'skip')
    applyBackup(db, makeBackup(), 'skip')
    expect(db.prepare('SELECT COUNT(*) c FROM study_history').get().c).toBe(1)
  })

  test('daily statistics keep the row with the larger total on merge', () => {
    applyBackup(db, makeBackup('2026-09-25 09:00:00', 10), 'merge')
    expect(db.prepare("SELECT total_count t FROM daily_statistics WHERE date = '2026-09-20'").get().t).toBe(30)
    applyBackup(db, makeBackup('2026-09-25 09:00:00', 40), 'merge')
    expect(db.prepare("SELECT total_count t FROM daily_statistics WHERE date = '2026-09-20'").get().t).toBe(40)
  })

  test('rejects unknown strategies', () => {
    expect(() => applyBackup(db, makeBackup(), 'upsert')).toThrow(/未知恢复策略/)
  })
})
