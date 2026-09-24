const Database = require('better-sqlite3')
const { app } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

let database

const { schema } = require('./db-schema.cjs')

function seedDefaultVocabularies(db) {
  const directory = path.join(app.getAppPath(), 'resources', 'vocabularies')
  const definitions = [
    ['cet4.json', 'CET-4 核心词汇', 'CET4', '大学英语四级核心词汇'],
    ['cet6.json', 'CET-6 核心词汇', 'CET6', '大学英语六级进阶词汇'],
    ['ielts.json', 'IELTS 核心词汇', 'IELTS', '雅思学术与生活场景高频词汇'],
    ['toefl.json', 'TOEFL 核心词汇', 'TOEFL', '托福学术英语高频词汇']
  ]
  const insertVocabulary = db.prepare(`
    INSERT INTO vocabularies (name, type, description, is_default, is_active)
    VALUES (?, ?, ?, 1, ?)
  `)
  const insertWord = db.prepare(`
    INSERT OR IGNORE INTO words
      (vocabulary_id, word, phonetic, definition, examples, etymology, synonyms, antonyms, frequency)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `)
  const seed = db.transaction(() => {
    definitions.forEach(([file, name, type, description], index) => {
      const existing = db.prepare('SELECT id FROM vocabularies WHERE type = ? AND is_default = 1').get(type)
      if (existing) return
      const id = Number(insertVocabulary.run(name, type, description, index === 0 ? 1 : 0).lastInsertRowid)
      const filePath = path.join(directory, file)
      if (!fs.existsSync(filePath)) return
      const words = JSON.parse(fs.readFileSync(filePath, 'utf8'))
      for (const item of words) {
        if (!item.word || !item.definition) continue
        insertWord.run(
          id,
          String(item.word).trim(),
          item.phonetic || null,
          JSON.stringify(Array.isArray(item.definition) ? item.definition : [item.definition]),
          JSON.stringify(item.examples || []),
          item.etymology || null,
          JSON.stringify(item.synonyms || []),
          JSON.stringify(item.antonyms || []),
          item.frequency || null
        )
      }
    })
  })
  seed()
}

function getDatabase() {
  if (database) return database
  const dbPath = path.join(app.getPath('userData'), 'vocabmaster.db')
  database = new Database(dbPath)
  database.pragma('journal_mode = WAL')
  database.pragma('foreign_keys = ON')
  database.exec(schema)
  database.pragma('user_version = 1')
  seedDefaultVocabularies(database)
  return database
}

function closeDatabase() {
  if (!database) return
  database.close()
  database = undefined
}

module.exports = { getDatabase, closeDatabase, schema, seedDefaultVocabularies }
