const { schema } = require('./schema.cjs')

const additions = {
  words: { roots: "TEXT NOT NULL DEFAULT ''", word_family: "TEXT NOT NULL DEFAULT '[]'", collocations: "TEXT NOT NULL DEFAULT '[]'", content_source: "TEXT NOT NULL DEFAULT ''", content_license: "TEXT NOT NULL DEFAULT ''" },
  learning_records: { algorithm: "TEXT NOT NULL DEFAULT 'sm2'", fsrs_card: 'TEXT', sm2_snapshot: 'TEXT' },
  study_history: { session_mode: "TEXT NOT NULL DEFAULT ''", algorithm: "TEXT NOT NULL DEFAULT 'sm2'", algorithm_version: "TEXT NOT NULL DEFAULT '1'", algorithm_params: "TEXT NOT NULL DEFAULT '{}'", mistake_reason: "TEXT NOT NULL DEFAULT ''" }
}

async function migrateDatabase(adapter) {
  await adapter.exec(schema)
  await adapter.withTransaction(async () => {
    for (const [table, columns] of Object.entries(additions)) {
      const existing = new Set((await adapter.all(`PRAGMA table_info(${table})`)).map((column) => column.name))
      for (const [column, type] of Object.entries(columns)) {
        if (!existing.has(column)) await adapter.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
      }
    }
    await adapter.exec('PRAGMA user_version = 3')
  })
}

function migrateDatabaseSync(db) {
  db.exec(schema)
  db.exec('BEGIN')
  try {
    for (const [table, columns] of Object.entries(additions)) {
      const existing = new Set(db.prepare(`PRAGMA table_info(${table})`).all().map((column) => column.name))
      for (const [column, type] of Object.entries(columns)) {
        if (!existing.has(column)) db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${type}`)
      }
    }
    db.exec('PRAGMA user_version = 3; COMMIT')
  } catch (error) { db.exec('ROLLBACK'); throw error }
}

module.exports = { migrateDatabase, migrateDatabaseSync }
