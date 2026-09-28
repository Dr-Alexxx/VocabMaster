const schema = `
  CREATE TABLE IF NOT EXISTS vocabularies (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    type TEXT NOT NULL,
    description TEXT,
    is_default INTEGER NOT NULL DEFAULT 0,
    is_active INTEGER NOT NULL DEFAULT 1,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE TABLE IF NOT EXISTS words (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    vocabulary_id INTEGER NOT NULL REFERENCES vocabularies(id) ON DELETE CASCADE,
    word TEXT NOT NULL,
    phonetic TEXT,
    definition TEXT NOT NULL DEFAULT '[]',
    examples TEXT NOT NULL DEFAULT '[]',
    etymology TEXT,
    synonyms TEXT NOT NULL DEFAULT '[]',
    antonyms TEXT NOT NULL DEFAULT '[]',
    frequency INTEGER,
    notes TEXT,
    is_favorited INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE UNIQUE INDEX IF NOT EXISTS idx_words_vocab_word ON words(vocabulary_id, word COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS idx_words_word ON words(word COLLATE NOCASE);
  CREATE INDEX IF NOT EXISTS idx_words_favorite ON words(is_favorited);
  CREATE TABLE IF NOT EXISTS learning_records (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word_id INTEGER NOT NULL UNIQUE REFERENCES words(id) ON DELETE CASCADE,
    easiness_factor REAL NOT NULL DEFAULT 2.5,
    interval INTEGER NOT NULL DEFAULT 0,
    repetitions INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'new',
    next_review_date TEXT,
    last_review_date TEXT,
    is_learned INTEGER NOT NULL DEFAULT 0,
    first_learned_at TEXT,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_learning_due ON learning_records(next_review_date, is_learned);
  CREATE INDEX IF NOT EXISTS idx_learning_status ON learning_records(status);
  CREATE TABLE IF NOT EXISTS study_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word_id INTEGER NOT NULL REFERENCES words(id) ON DELETE CASCADE,
    learning_record_id INTEGER NOT NULL REFERENCES learning_records(id) ON DELETE CASCADE,
    study_mode TEXT NOT NULL,
    quality INTEGER NOT NULL,
    time_spent INTEGER NOT NULL DEFAULT 0,
    is_correct INTEGER NOT NULL DEFAULT 0,
    studied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_history_date ON study_history(studied_at);
  CREATE TABLE IF NOT EXISTS mistake_book (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    word_id INTEGER NOT NULL UNIQUE REFERENCES words(id) ON DELETE CASCADE,
    mistake_count INTEGER NOT NULL DEFAULT 1,
    last_mistake_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
    last_mode TEXT,
    is_frequent INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_mistake_frequent ON mistake_book(is_frequent);
  CREATE TABLE IF NOT EXISTS daily_statistics (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL UNIQUE,
    new_words_count INTEGER NOT NULL DEFAULT 0,
    review_count INTEGER NOT NULL DEFAULT 0,
    correct_count INTEGER NOT NULL DEFAULT 0,
    total_count INTEGER NOT NULL DEFAULT 0,
    study_time INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
  CREATE INDEX IF NOT EXISTS idx_stats_date ON daily_statistics(date);
  CREATE TABLE IF NOT EXISTS user_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    key TEXT NOT NULL UNIQUE,
    value TEXT,
    updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
  );
`

module.exports = { schema }
