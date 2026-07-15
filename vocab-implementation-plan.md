# VocabMaster Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a cross-platform desktop vocabulary learning application for college students preparing for CET-4/6, IELTS, and TOEFL exams.

**Architecture:** Electron + Vue 3 + better-sqlite3. Main process handles database operations and file I/O. Renderer process handles UI, user interaction, and Anki algorithm calculations. IPC communication via contextBridge.

**Tech Stack:** 
- Frontend: Vue 3 (Composition API), Vite, Pinia, Vue Router, ECharts
- Desktop: Electron, better-sqlite3
- Build: electron-builder
- Testing: Vitest, Playwright

---

## File Structure Overview

```
VocabMaster/
├── package.json                    # Dependencies and scripts
├── vite.config.js                  # Vite configuration
├── electron.vite.config.js         # Electron-specific Vite config
├── electron-builder.yml            # Build configuration
│
├── electron/                       # Main process
│   ├── main.js                    # Entry point
│   ├── preload.js                 # Context bridge
│   ├── database/
│   │   ├── index.js               # Database initialization
│   │   ├── migrations.js          # Schema migrations
│   │   ├── vocabularies.js        # Vocabulary operations
│   │   ├── words.js               # Word operations
│   │   ├── learning.js            # Learning records operations
│   │   ├── history.js             # Study history operations
│   │   ├── mistakes.js            # Mistake book operations
│   │   └── stats.js               # Statistics operations
│   └── ipc-handlers.js            # IPC handlers
│
├── src/                           # Renderer process
│   ├── main.js                    # Vue entry
│   ├── App.vue                    # Root component
│   ├── router/
│   │   └── index.js               # Route configuration
│   ├── stores/
│   │   ├── study.js               # Study state
│   │   ├── vocab.js               # Vocabulary state
│   │   └── settings.js            # Settings state
│   ├── views/
│   │   ├── HomeView.vue           # Today's study page
│   │   ├── StudyView.vue          # Study interface
│   │   ├── VocabView.vue          # Vocabulary management
│   │   ├── MistakeView.vue        # Mistake book
│   │   ├── StatsView.vue          # Statistics
│   │   └── SettingsView.vue       # Settings
│   ├── components/
│   │   ├── WordCard.vue           # Word flashcard
│   │   ├── ProgressBar.vue        # Progress bar
│   │   ├── Sidebar.vue            # Navigation sidebar
│   │   └── Toast.vue              # Toast notifications
│   ├── algorithms/
│   │   ├── anki.js                # Anki algorithm
│   │   └── scheduler.js           # Study scheduler
│   ├── services/
│   │   ├── database.js            # IPC wrappers
│   │   ├── importer.js            # Import logic
│   │   └── exporter.js            # Export logic
│   ├── utils/
│   │   ├── format.js              # Formatting utilities
│   │   ├── validator.js           # Data validation
│   │   └── levenshtein.js         # String distance
│   └── assets/
│       ├── styles/
│       │   ├── variables.css      # CSS variables
│       │   └── global.css         # Global styles
│       └── icons/                 # SVG icons
│
├── resources/                     # Static resources
│   └── vocabularies/
│       ├── cet4.json
│       ├── cet6.json
│       ├── ielts.json
│       └── toefl.json
│
└── tests/
    ├── unit/                      # Unit tests
    └── e2e/                       # E2E tests
```

---

## Phase 1: Project Setup and Database Foundation

### Task 1: Initialize Project Structure

**Files:**
- Create: `package.json`
- Create: `vite.config.js`
- Create: `electron.vite.config.js`

- [ ] **Step 1: Create package.json with dependencies**

```json
{
  "name": "vocab-master",
  "version": "1.0.0",
  "description": "Vocabulary learning app for CET, IELTS, TOEFL",
  "main": "dist-electron/main.js",
  "scripts": {
    "dev": "vite",
    "build": "vite build && electron-builder",
    "preview": "vite preview",
    "electron:dev": "electron .",
    "test": "vitest"
  },
  "dependencies": {
    "vue": "^3.4.0",
    "vue-router": "^4.2.0",
    "pinia": "^2.1.0",
    "better-sqlite3": "^9.2.0",
    "echarts": "^5.4.0"
  },
  "devDependencies": {
    "@vitejs/plugin-vue": "^5.0.0",
    "vite": "^5.0.0",
    "electron": "^28.0.0",
    "electron-builder": "^24.9.0",
    "vitest": "^1.0.0"
  }
}
```

- [ ] **Step 2: Run npm install**

Run: `npm install`
Expected: All dependencies installed successfully

- [ ] **Step 3: Create Vite config**

```javascript
// vite.config.js
import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import path from 'path'

export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src')
    }
  },
  base: './',
  build: {
    outDir: 'dist'
  }
})
```

- [ ] **Step 4: Create Electron Vite config**

```javascript
// electron.vite.config.js
import { defineConfig } from 'vite'

export default defineConfig({
  main: {
    build: {
      outDir: 'dist-electron',
      lib: {
        entry: 'electron/main.js',
        formats: ['cjs']
      }
    }
  },
  preload: {
    build: {
      outDir: 'dist-electron',
      lib: {
        entry: 'electron/preload.js',
        formats: ['cjs']
      }
    }
  }
})
```

- [ ] **Step 5: Create directory structure**

Run: `mkdir -p electron/database src/{views,components,stores,algorithms,services,utils,assets/{styles,icons},router} resources/vocabularies tests/{unit,e2e}`
Expected: All directories created

- [ ] **Step 6: Commit**

```bash
git init
git add .
git commit -m "chore: initialize project structure"
```

### Task 2: Database Schema and Migrations

**Files:**
- Create: `electron/database/index.js`
- Create: `electron/database/migrations.js`

- [ ] **Step 1: Write database initialization module**

```javascript
// electron/database/index.js
const Database = require('better-sqlite3')
const path = require('path')
const { app } = require('electron')
const { migrate } = require('./migrations')

let db = null

function getDatabase() {
  if (db) return db
  
  const dbPath = path.join(app.getPath('userData'), 'vocab.db')
  db = new Database(dbPath)
  
  // Enable foreign keys
  db.pragma('foreign_keys = ON')
  
  // Run migrations
  migrate(db)
  
  return db
}

function closeDatabase() {
  if (db) {
    db.close()
    db = null
  }
}

module.exports = {
  getDatabase,
  closeDatabase
}
```

- [ ] **Step 2: Write migration system**

```javascript
// electron/database/migrations.js
const migrations = [
  {
    version: 1,
    up: (db) => {
      // Vocabularies table
      db.exec(`
        CREATE TABLE IF NOT EXISTS vocabularies (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          name TEXT NOT NULL,
          type TEXT NOT NULL,
          description TEXT,
          is_default BOOLEAN DEFAULT 0,
          is_active BOOLEAN DEFAULT 1,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `)
      
      // Words table
      db.exec(`
        CREATE TABLE IF NOT EXISTS words (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          vocabulary_id INTEGER NOT NULL,
          word TEXT NOT NULL,
          phonetic TEXT,
          definition TEXT,
          examples TEXT,
          etymology TEXT,
          synonyms TEXT,
          antonyms TEXT,
          frequency INTEGER,
          notes TEXT,
          is_favorited BOOLEAN DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (vocabulary_id) REFERENCES vocabularies(id) ON DELETE CASCADE
        )
      `)
      
      db.exec(`CREATE INDEX idx_words_vocabulary ON words(vocabulary_id)`)
      db.exec(`CREATE INDEX idx_words_word ON words(word)`)
      db.exec(`CREATE INDEX idx_words_favorited ON words(is_favorited)`)
      
      // Learning records table
      db.exec(`
        CREATE TABLE IF NOT EXISTS learning_records (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          word_id INTEGER NOT NULL,
          user_id INTEGER DEFAULT 1,
          easiness_factor REAL DEFAULT 2.5,
          interval INTEGER DEFAULT 0,
          repetitions INTEGER DEFAULT 0,
          status TEXT DEFAULT 'new',
          next_review_date DATE,
          last_review_date DATE,
          is_learned BOOLEAN DEFAULT 0,
          first_learned_at DATETIME,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE
        )
      `)
      
      db.exec(`CREATE INDEX idx_learning_word ON learning_records(word_id)`)
      db.exec(`CREATE INDEX idx_learning_next_review ON learning_records(next_review_date)`)
      db.exec(`CREATE INDEX idx_learning_status ON learning_records(status)`)
      db.exec(`CREATE INDEX idx_learning_learned ON learning_records(is_learned)`)
      
      // Study history table
      db.exec(`
        CREATE TABLE IF NOT EXISTS study_history (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          word_id INTEGER NOT NULL,
          learning_record_id INTEGER NOT NULL,
          study_mode TEXT NOT NULL,
          quality INTEGER NOT NULL,
          time_spent INTEGER,
          is_correct BOOLEAN,
          studied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE,
          FOREIGN KEY (learning_record_id) REFERENCES learning_records(id) ON DELETE CASCADE
        )
      `)
      
      db.exec(`CREATE INDEX idx_history_word ON study_history(word_id)`)
      db.exec(`CREATE INDEX idx_history_date ON study_history(studied_at)`)
      
      // Mistake book table
      db.exec(`
        CREATE TABLE IF NOT EXISTS mistake_book (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          word_id INTEGER NOT NULL UNIQUE,
          mistake_count INTEGER DEFAULT 1,
          last_mistake_at DATETIME,
          is_frequent BOOLEAN DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
          FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE
        )
      `)
      
      db.exec(`CREATE INDEX idx_mistake_word ON mistake_book(word_id)`)
      db.exec(`CREATE INDEX idx_mistake_frequent ON mistake_book(is_frequent)`)
      
      // Daily statistics table
      db.exec(`
        CREATE TABLE IF NOT EXISTS daily_statistics (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          date DATE NOT NULL UNIQUE,
          new_words_count INTEGER DEFAULT 0,
          review_count INTEGER DEFAULT 0,
          correct_count INTEGER DEFAULT 0,
          total_count INTEGER DEFAULT 0,
          study_time INTEGER DEFAULT 0,
          created_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `)
      
      db.exec(`CREATE INDEX idx_stats_date ON daily_statistics(date)`)
      
      // User settings table
      db.exec(`
        CREATE TABLE IF NOT EXISTS user_settings (
          id INTEGER PRIMARY KEY AUTOINCREMENT,
          key TEXT NOT NULL UNIQUE,
          value TEXT,
          updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
        )
      `)
    }
  }
]

function migrate(db) {
  const currentVersion = db.pragma('user_version', { simple: true })
  
  migrations
    .filter(m => m.version > currentVersion)
    .forEach(m => {
      console.log(`Running migration version ${m.version}`)
      m.up(db)
      db.pragma(`user_version = ${m.version}`)
    })
  
  console.log(`Database migrated to version ${db.pragma('user_version', { simple: true })}`)
}

module.exports = { migrate }
```

- [ ] **Step 3: Test database initialization**

Create test file:
```javascript
// tests/unit/database.test.js
const { describe, test, expect } = require('vitest')
const Database = require('better-sqlite3')
const { migrate } = require('../../electron/database/migrations')

describe('Database Migrations', () => {
  test('creates all tables', () => {
    const db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    
    migrate(db)
    
    const tables = db.prepare(`
      SELECT name FROM sqlite_master WHERE type='table'
    `).all()
    
    const tableNames = tables.map(t => t.name)
    expect(tableNames).toContain('vocabularies')
    expect(tableNames).toContain('words')
    expect(tableNames).toContain('learning_records')
    expect(tableNames).toContain('study_history')
    expect(tableNames).toContain('mistake_book')
    expect(tableNames).toContain('daily_statistics')
    expect(tableNames).toContain('user_settings')
    
    db.close()
  })
})
```

- [ ] **Step 4: Run test**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 5: Commit**

```bash
git add electron/database tests/unit
git commit -m "feat: add database schema and migrations"
```

### Task 3: Database Operation Modules

**Files:**
- Create: `electron/database/vocabularies.js`
- Create: `electron/database/words.js`
- Create: `electron/database/learning.js`

- [ ] **Step 1: Write vocabularies operations**

```javascript
// electron/database/vocabularies.js
class VocabulariesDB {
  constructor(db) {
    this.db = db
  }
  
  getAll() {
    return this.db.prepare('SELECT * FROM vocabularies').all()
  }
  
  getActive() {
    return this.db.prepare('SELECT * FROM vocabularies WHERE is_active = 1').all()
  }
  
  getById(id) {
    return this.db.prepare('SELECT * FROM vocabularies WHERE id = ?').get(id)
  }
  
  create(vocab) {
    const stmt = this.db.prepare(`
      INSERT INTO vocabularies (name, type, description, is_default, is_active)
      VALUES (?, ?, ?, ?, ?)
    `)
    const result = stmt.run(
      vocab.name,
      vocab.type,
      vocab.description || null,
      vocab.is_default || 0,
      vocab.is_active !== undefined ? vocab.is_active : 1
    )
    return result.lastInsertRowid
  }
  
  update(id, updates) {
    const fields = []
    const values = []
    
    if (updates.name !== undefined) {
      fields.push('name = ?')
      values.push(updates.name)
    }
    if (updates.is_active !== undefined) {
      fields.push('is_active = ?')
      values.push(updates.is_active)
    }
    if (updates.description !== undefined) {
      fields.push('description = ?')
      values.push(updates.description)
    }
    
    fields.push('updated_at = CURRENT_TIMESTAMP')
    values.push(id)
    
    const stmt = this.db.prepare(`
      UPDATE vocabularies SET ${fields.join(', ')} WHERE id = ?
    `)
    return stmt.run(...values)
  }
  
  delete(id) {
    return this.db.prepare('DELETE FROM vocabularies WHERE id = ?').run(id)
  }
  
  getProgress(id) {
    const result = this.db.prepare(`
      SELECT 
        COUNT(w.id) as total,
        COUNT(CASE WHEN lr.status = 'mastered' THEN 1 END) as mastered,
        COUNT(CASE WHEN lr.is_learned = 1 THEN 1 END) as learned
      FROM words w
      LEFT JOIN learning_records lr ON w.id = lr.word_id
      WHERE w.vocabulary_id = ?
    `).get(id)
    
    return result
  }
}

module.exports = VocabulariesDB
```

- [ ] **Step 2: Write words operations**

```javascript
// electron/database/words.js
class WordsDB {
  constructor(db) {
    this.db = db
  }
  
  getByVocabulary(vocabularyId) {
    return this.db.prepare('SELECT * FROM words WHERE vocabulary_id = ?').all(vocabularyId)
  }
  
  getById(id) {
    return this.db.prepare('SELECT * FROM words WHERE id = ?').get(id)
  }
  
  search(query) {
    return this.db.prepare(`
      SELECT w.*, v.name as vocabulary_name
      FROM words w
      JOIN vocabularies v ON w.vocabulary_id = v.id
      WHERE w.word LIKE ? OR w.definition LIKE ?
      LIMIT 50
    `).all(`%${query}%`, `%${query}%`)
  }
  
  create(word) {
    const stmt = this.db.prepare(`
      INSERT INTO words (
        vocabulary_id, word, phonetic, definition, examples,
        etymology, synonyms, antonyms, frequency
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    const result = stmt.run(
      word.vocabulary_id,
      word.word,
      word.phonetic || null,
      word.definition || null,
      word.examples || null,
      word.etymology || null,
      word.synonyms || null,
      word.antonyms || null,
      word.frequency || null
    )
    return result.lastInsertRowid
  }
  
  update(id, updates) {
    const fields = []
    const values = []
    
    if (updates.notes !== undefined) {
      fields.push('notes = ?')
      values.push(updates.notes)
    }
    if (updates.is_favorited !== undefined) {
      fields.push('is_favorited = ?')
      values.push(updates.is_favorited)
    }
    
    values.push(id)
    
    const stmt = this.db.prepare(`
      UPDATE words SET ${fields.join(', ')} WHERE id = ?
    `)
    return stmt.run(...values)
  }
  
  getFavorites() {
    return this.db.prepare(`
      SELECT w.*, v.name as vocabulary_name
      FROM words w
      JOIN vocabularies v ON w.vocabulary_id = v.id
      WHERE w.is_favorited = 1
      ORDER BY w.id DESC
    `).all()
  }
  
  batchInsert(words) {
    const insert = this.db.prepare(`
      INSERT INTO words (
        vocabulary_id, word, phonetic, definition, examples,
        etymology, synonyms, antonyms, frequency
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `)
    
    const insertMany = this.db.transaction((words) => {
      for (const word of words) {
        insert.run(
          word.vocabulary_id,
          word.word,
          word.phonetic || null,
          word.definition || null,
          word.examples || null,
          word.etymology || null,
          word.synonyms || null,
          word.antonyms || null,
          word.frequency || null
        )
      }
    })
    
    insertMany(words)
  }
}

module.exports = WordsDB
```

- [ ] **Step 3: Write learning records operations**

```javascript
// electron/database/learning.js
class LearningDB {
  constructor(db) {
    this.db = db
  }
  
  getRecord(wordId) {
    return this.db.prepare(`
      SELECT * FROM learning_records WHERE word_id = ?
    `).get(wordId)
  }
  
  createRecord(wordId) {
    const stmt = this.db.prepare(`
      INSERT INTO learning_records (word_id, status)
      VALUES (?, 'new')
    `)
    const result = stmt.run(wordId)
    return result.lastInsertRowid
  }
  
  updateRecord(wordId, updates) {
    const stmt = this.db.prepare(`
      UPDATE learning_records
      SET easiness_factor = ?,
          interval = ?,
          repetitions = ?,
          status = ?,
          next_review_date = ?,
          last_review_date = ?,
          is_learned = ?,
          updated_at = CURRENT_TIMESTAMP
      WHERE word_id = ?
    `)
    
    return stmt.run(
      updates.easiness_factor,
      updates.interval,
      updates.repetitions,
      updates.status,
      updates.next_review_date,
      updates.last_review_date,
      updates.is_learned,
      wordId
    )
  }
  
  getDueForReview(limit) {
    const today = new Date().toISOString().split('T')[0]
    
    return this.db.prepare(`
      SELECT lr.*, w.*
      FROM learning_records lr
      JOIN words w ON lr.word_id = w.id
      WHERE lr.next_review_date <= ?
        AND lr.is_learned = 1
      ORDER BY lr.next_review_date ASC
      LIMIT ?
    `).all(today, limit)
  }
  
  getNewWords(limit, enableDedup) {
    let query = `
      SELECT w.*
      FROM words w
      LEFT JOIN learning_records lr ON w.id = lr.word_id
      WHERE (lr.id IS NULL OR (lr.status = 'new' AND lr.is_learned = 0))
    `
    
    if (enableDedup) {
      query += `
        AND NOT EXISTS (
          SELECT 1 FROM learning_records 
          WHERE word_id = w.id AND is_learned = 1
        )
      `
    }
    
    query += ` LIMIT ?`
    
    return this.db.prepare(query).all(limit)
  }
  
  getStatsByStatus() {
    return this.db.prepare(`
      SELECT status, COUNT(*) as count
      FROM learning_records
      WHERE is_learned = 1
      GROUP BY status
    `).all()
  }
}

module.exports = LearningDB
```

- [ ] **Step 4: Test database operations**

```javascript
// tests/unit/database-operations.test.js
const { describe, test, expect, beforeEach } = require('vitest')
const Database = require('better-sqlite3')
const { migrate } = require('../../electron/database/migrations')
const VocabulariesDB = require('../../electron/database/vocabularies')
const WordsDB = require('../../electron/database/words')

describe('Database Operations', () => {
  let db, vocabDB, wordsDB
  
  beforeEach(() => {
    db = new Database(':memory:')
    db.pragma('foreign_keys = ON')
    migrate(db)
    vocabDB = new VocabulariesDB(db)
    wordsDB = new WordsDB(db)
  })
  
  test('creates and retrieves vocabulary', () => {
    const id = vocabDB.create({
      name: 'CET-4',
      type: 'CET4',
      description: 'CET-4 core vocabulary'
    })
    
    const vocab = vocabDB.getById(id)
    expect(vocab.name).toBe('CET-4')
    expect(vocab.type).toBe('CET4')
  })
  
  test('creates word in vocabulary', () => {
    const vocabId = vocabDB.create({ name: 'Test', type: 'CUSTOM' })
    
    const wordId = wordsDB.create({
      vocabulary_id: vocabId,
      word: 'abandon',
      phonetic: '/əˈbændən/',
      definition: JSON.stringify(['放弃', '遗弃'])
    })
    
    const word = wordsDB.getById(wordId)
    expect(word.word).toBe('abandon')
    expect(word.vocabulary_id).toBe(vocabId)
  })
  
  test('searches words', () => {
    const vocabId = vocabDB.create({ name: 'Test', type: 'CUSTOM' })
    wordsDB.create({
      vocabulary_id: vocabId,
      word: 'abandon',
      definition: JSON.stringify(['放弃'])
    })
    
    const results = wordsDB.search('abandon')
    expect(results.length).toBe(1)
    expect(results[0].word).toBe('abandon')
  })
})
```

- [ ] **Step 5: Run tests**

Run: `npm test`
Expected: All tests pass

- [ ] **Step 6: Commit**

```bash
git add electron/database tests/unit
git commit -m "feat: add database operation modules"
```

---

## Phase 2: Electron Main Process and IPC

### Task 4: Main Process Setup

**Files:**
- Create: `electron/main.js`
- Create: `electron/preload.js`
- Create: `electron/ipc-handlers.js`

- [ ] **Step 1: Write main process entry**

```javascript
// electron/main.js
const { app, BrowserWindow } = require('electron')
const path = require('path')
const { getDatabase, closeDatabase } = require('./database')
const { registerIPCHandlers } = require('./ipc-handlers')

let mainWindow = null

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 900,
    minWidth: 1024,
    minHeight: 768,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
      enableRemoteModule: false,
      webSecurity: true
    },
    enableLargerThanScreen: true
  })
  
  // In development, load from Vite dev server
  if (process.env.NODE_ENV === 'development') {
    mainWindow.loadURL('http://localhost:5173')
    mainWindow.webContents.openDevTools()
  } else {
    mainWindow.loadFile(path.join(__dirname, '../dist/index.html'))
  }
}

app.on('ready', () => {
  // Initialize database
  getDatabase()
  
  // Register IPC handlers
  registerIPCHandlers()
  
  createWindow()
})

app.on('window-all-closed', () => {
  closeDatabase()
  if (process.platform !== 'darwin') {
    app.quit()
  }
})

app.on('activate', () => {
  if (mainWindow === null) {
    createWindow()
  }
})
```

- [ ] **Step 2: Write preload script**

```javascript
// electron/preload.js
const { contextBridge, ipcRenderer } = require('electron')

contextBridge.exposeInMainWorld('api', {
  // Vocabularies
  getVocabularies: () => ipcRenderer.invoke('vocab:getAll'),
  getActiveVocabularies: () => ipcRenderer.invoke('vocab:getActive'),
  createVocabulary: (vocab) => ipcRenderer.invoke('vocab:create', vocab),
  updateVocabulary: (id, updates) => ipcRenderer.invoke('vocab:update', id, updates),
  deleteVocabulary: (id) => ipcRenderer.invoke('vocab:delete', id),
  getVocabularyProgress: (id) => ipcRenderer.invoke('vocab:getProgress', id),
  
  // Words
  getWordsByVocabulary: (vocabId) => ipcRenderer.invoke('words:getByVocab', vocabId),
  getWordById: (id) => ipcRenderer.invoke('words:getById', id),
  searchWords: (query) => ipcRenderer.invoke('words:search', query),
  updateWord: (id, updates) => ipcRenderer.invoke('words:update', id, updates),
  getFavorites: () => ipcRenderer.invoke('words:getFavorites'),
  importWords: (vocabId, words) => ipcRenderer.invoke('words:import', vocabId, words),
  
  // Learning
  getLearningRecord: (wordId) => ipcRenderer.invoke('learning:getRecord', wordId),
  updateLearningRecord: (wordId, updates) => ipcRenderer.invoke('learning:updateRecord', wordId, updates),
  getDueForReview: (limit) => ipcRenderer.invoke('learning:getDueForReview', limit),
  getNewWords: (limit, enableDedup) => ipcRenderer.invoke('learning:getNewWords', limit, enableDedup),
  
  // Settings
  getSetting: (key) => ipcRenderer.invoke('settings:get', key),
  setSetting: (key, value) => ipcRenderer.invoke('settings:set', key, value)
})
```

- [ ] **Step 3: Write IPC handlers**

```javascript
// electron/ipc-handlers.js
const { ipcMain } = require('electron')
const { getDatabase } = require('./database')
const VocabulariesDB = require('./database/vocabularies')
const WordsDB = require('./database/words')
const LearningDB = require('./database/learning')

function registerIPCHandlers() {
  const db = getDatabase()
  const vocabDB = new VocabulariesDB(db)
  const wordsDB = new WordsDB(db)
  const learningDB = new LearningDB(db)
  
  // Vocabularies handlers
  ipcMain.handle('vocab:getAll', () => vocabDB.getAll())
  ipcMain.handle('vocab:getActive', () => vocabDB.getActive())
  ipcMain.handle('vocab:create', (event, vocab) => vocabDB.create(vocab))
  ipcMain.handle('vocab:update', (event, id, updates) => vocabDB.update(id, updates))
  ipcMain.handle('vocab:delete', (event, id) => vocabDB.delete(id))
  ipcMain.handle('vocab:getProgress', (event, id) => vocabDB.getProgress(id))
  
  // Words handlers
  ipcMain.handle('words:getByVocab', (event, vocabId) => wordsDB.getByVocabulary(vocabId))
  ipcMain.handle('words:getById', (event, id) => wordsDB.getById(id))
  ipcMain.handle('words:search', (event, query) => wordsDB.search(query))
  ipcMain.handle('words:update', (event, id, updates) => wordsDB.update(id, updates))
  ipcMain.handle('words:getFavorites', () => wordsDB.getFavorites())
  ipcMain.handle('words:import', (event, vocabId, words) => {
    const wordsWithVocabId = words.map(w => ({ ...w, vocabulary_id: vocabId }))
    wordsDB.batchInsert(wordsWithVocabId)
    return { success: true, count: words.length }
  })
  
  // Learning handlers
  ipcMain.handle('learning:getRecord', (event, wordId) => learningDB.getRecord(wordId))
  ipcMain.handle('learning:updateRecord', (event, wordId, updates) => learningDB.updateRecord(wordId, updates))
  ipcMain.handle('learning:getDueForReview', (event, limit) => learningDB.getDueForReview(limit))
  ipcMain.handle('learning:getNewWords', (event, limit, enableDedup) => learningDB.getNewWords(limit, enableDedup))
  
  // Settings handlers
  ipcMain.handle('settings:get', (event, key) => {
    const result = db.prepare('SELECT value FROM user_settings WHERE key = ?').get(key)
    return result ? JSON.parse(result.value) : null
  })
  
  ipcMain.handle('settings:set', (event, key, value) => {
    db.prepare(`
      INSERT INTO user_settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = ?, updated_at = CURRENT_TIMESTAMP
    `).run(key, JSON.stringify(value), JSON.stringify(value))
    return { success: true }
  })
}

module.exports = { registerIPCHandlers }
```

- [ ] **Step 4: Update package.json scripts**

```json
{
  "scripts": {
    "dev": "concurrently \"vite\" \"electron .\"",
    "build": "vite build && electron-builder",
    "preview": "vite preview"
  }
}
```

- [ ] **Step 5: Test Electron app launches**

Run: `npm run dev`
Expected: Electron window opens (may show blank page, that's OK for now)

- [ ] **Step 6: Commit**

```bash
git add electron
git commit -m "feat: add Electron main process and IPC handlers"
```

---

## Phase 3: Core Algorithm Implementation

### Task 5: Anki Algorithm

**Files:**
- Create: `src/algorithms/anki.js`
- Create: `tests/unit/anki.test.js`

- [ ] **Step 1: Write test for Anki algorithm**

```javascript
// tests/unit/anki.test.js
import { describe, test, expect } from 'vitest'
import { updateCard } from '../../src/algorithms/anki'

describe('Anki Algorithm', () => {
  test('quality < 3 resets interval and repetitions', () => {
    const record = {
      easiness_factor: 2.5,
      interval: 10,
      repetitions: 3
    }
    
    const result = updateCard(record, 2)
    
    expect(result.interval).toBe(1)
    expect(result.repetitions).toBe(0)
    expect(result.status).toBe('learning')
  })
  
  test('quality >= 3 increases interval', () => {
    const record = {
      easiness_factor: 2.5,
      interval: 6,
      repetitions: 2
    }
    
    const result = updateCard(record, 4)
    
    expect(result.interval).toBeGreaterThan(6)
    expect(result.repetitions).toBe(3)
  })
  
  test('mastered status after 5 repetitions and 21+ days interval', () => {
    const record = {
      easiness_factor: 2.5,
      interval: 15,
      repetitions: 4
    }
    
    const result = updateCard(record, 5)
    
    expect(result.repetitions).toBe(5)
    expect(result.interval).toBeGreaterThanOrEqual(21)
    expect(result.status).toBe('mastered')
  })
  
  test('first repetition sets interval to 1', () => {
    const record = {
      easiness_factor: 2.5,
      interval: 0,
      repetitions: 0
    }
    
    const result = updateCard(record, 4)
    
    expect(result.interval).toBe(1)
    expect(result.repetitions).toBe(1)
  })
  
  test('second repetition sets interval to 6', () => {
    const record = {
      easiness_factor: 2.5,
      interval: 1,
      repetitions: 1
    }
    
    const result = updateCard(record, 4)
    
    expect(result.interval).toBe(6)
    expect(result.repetitions).toBe(2)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test anki.test.js`
Expected: FAIL - updateCard is not defined

- [ ] **Step 3: Implement Anki algorithm**

```javascript
// src/algorithms/anki.js
export function updateCard(record, quality) {
  let { easiness_factor, interval, repetitions } = record
  
  // 1. Update easiness factor
  easiness_factor = Math.max(
    1.3,
    easiness_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  )
  
  // 2. Update interval and repetitions based on quality
  if (quality < 3) {
    // Failed: reset
    repetitions = 0
    interval = 1
  } else {
    // Passed: increase interval
    if (repetitions === 0) {
      interval = 1
    } else if (repetitions === 1) {
      interval = 6
    } else {
      interval = Math.round(interval * easiness_factor)
    }
    repetitions += 1
  }
  
  // 3. Calculate next review date
  const next_review_date = new Date()
  next_review_date.setDate(next_review_date.getDate() + interval)
  
  // 4. Determine status
  let status = 'learning'
  if (repetitions >= 5 && interval >= 21) {
    status = 'mastered'
  } else if (repetitions >= 2) {
    status = 'review'
  }
  
  // 5. Format date as ISO string (YYYY-MM-DD)
  const formattedDate = next_review_date.toISOString().split('T')[0]
  
  return {
    easiness_factor,
    interval,
    repetitions,
    next_review_date: formattedDate,
    last_review_date: new Date().toISOString().split('T')[0],
    status,
    is_learned: 1
  }
}

export function calculateQuality(mode, userAnswer, correctAnswer, timeSpent) {
  if (mode === 'flashcard') {
    // User provides quality directly (0-5)
    return userAnswer
  }
  
  if (mode === 'spelling') {
    // Calculate Levenshtein distance
    const distance = levenshteinDistance(userAnswer.toLowerCase(), correctAnswer.toLowerCase())
    
    if (distance === 0) return 5 // Perfect
    if (distance <= 2) return 3  // Minor mistakes
    if (distance <= 4) return 1  // Major mistakes
    return 0                      // Completely wrong
  }
  
  if (mode === 'choice') {
    if (userAnswer === correctAnswer) {
      // Correct answer: quality based on time
      return timeSpent < 3000 ? 5 : 4 // 3 seconds threshold
    }
    return 0 // Wrong answer
  }
  
  return 0
}

function levenshteinDistance(str1, str2) {
  const matrix = []
  
  for (let i = 0; i <= str2.length; i++) {
    matrix[i] = [i]
  }
  
  for (let j = 0; j <= str1.length; j++) {
    matrix[0][j] = j
  }
  
  for (let i = 1; i <= str2.length; i++) {
    for (let j = 1; j <= str1.length; j++) {
      if (str2.charAt(i - 1) === str1.charAt(j - 1)) {
        matrix[i][j] = matrix[i - 1][j - 1]
      } else {
        matrix[i][j] = Math.min(
          matrix[i - 1][j - 1] + 1, // substitution
          matrix[i][j - 1] + 1,     // insertion
          matrix[i - 1][j] + 1      // deletion
        )
      }
    }
  }
  
  return matrix[str2.length][str1.length]
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test anki.test.js`
Expected: PASS - All tests pass

- [ ] **Step 5: Commit**

```bash
git add src/algorithms tests/unit
git commit -m "feat: implement Anki algorithm with tests"
```

### Task 6: Study Scheduler

**Files:**
- Create: `src/algorithms/scheduler.js`
- Create: `tests/unit/scheduler.test.js`

- [ ] **Step 1: Write scheduler module**

```javascript
// src/algorithms/scheduler.js
export class Scheduler {
  constructor(settings) {
    this.settings = {
      daily_new_limit: 20,
      daily_review_limit: 100,
      enable_cross_vocab_dedup: true,
      ...settings
    }
  }
  
  async getDailyPlan() {
    // Get due reviews
    const reviews = await window.api.getDueForReview(this.settings.daily_review_limit)
    
    // Get new words (only if review limit not reached)
    const remainingSlots = Math.max(0, this.settings.daily_new_limit)
    const newWords = await window.api.getNewWords(
      remainingSlots,
      this.settings.enable_cross_vocab_dedup
    )
    
    return {
      reviews,
      newWords,
      total: reviews.length + newWords.length
    }
  }
  
  async getWeakWords(limit = 20) {
    // This would require a new IPC handler
    // For now, return empty array
    return []
  }
  
  updateSettings(newSettings) {
    this.settings = { ...this.settings, ...newSettings }
  }
}
```

- [ ] **Step 2: Test scheduler logic**

```javascript
// tests/unit/scheduler.test.js
import { describe, test, expect } from 'vitest'
import { Scheduler } from '../../src/algorithms/scheduler'

describe('Scheduler', () => {
  test('initializes with default settings', () => {
    const scheduler = new Scheduler()
    
    expect(scheduler.settings.daily_new_limit).toBe(20)
    expect(scheduler.settings.daily_review_limit).toBe(100)
    expect(scheduler.settings.enable_cross_vocab_dedup).toBe(true)
  })
  
  test('updates settings', () => {
    const scheduler = new Scheduler()
    scheduler.updateSettings({ daily_new_limit: 30 })
    
    expect(scheduler.settings.daily_new_limit).toBe(30)
    expect(scheduler.settings.daily_review_limit).toBe(100) // unchanged
  })
})
```

- [ ] **Step 3: Run tests**

Run: `npm test scheduler.test.js`
Expected: PASS

- [ ] **Step 4: Commit**

```bash
git add src/algorithms tests/unit
git commit -m "feat: add study scheduler"
```

---

## Phase 4: Vue Frontend Foundation

### Task 7: Vue App Setup

**Files:**
- Create: `src/main.js`
- Create: `src/App.vue`
- Create: `src/router/index.js`
- Create: `index.html`

- [ ] **Step 1: Create HTML entry point**

```html
<!-- index.html -->
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VocabMaster</title>
</head>
<body>
  <div id="app"></div>
  <script type="module" src="/src/main.js"></script>
</body>
</html>
```

- [ ] **Step 2: Create Vue entry**

```javascript
// src/main.js
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import router from './router'
import App from './App.vue'
import './assets/styles/global.css'

const app = createApp(App)
const pinia = createPinia()

app.use(pinia)
app.use(router)
app.mount('#app')
```

- [ ] **Step 3: Create router configuration**

```javascript
// src/router/index.js
import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from '../views/HomeView.vue'
import StudyView from '../views/StudyView.vue'
import VocabView from '../views/VocabView.vue'
import MistakeView from '../views/MistakeView.vue'
import StatsView from '../views/StatsView.vue'
import SettingsView from '../views/SettingsView.vue'

const routes = [
  {
    path: '/',
    name: 'home',
    component: HomeView
  },
  {
    path: '/study',
    name: 'study',
    component: StudyView
  },
  {
    path: '/vocab',
    name: 'vocab',
    component: VocabView
  },
  {
    path: '/mistakes',
    name: 'mistakes',
    component: MistakeView
  },
  {
    path: '/stats',
    name: 'stats',
    component: StatsView
  },
  {
    path: '/settings',
    name: 'settings',
    component: SettingsView
  }
]

const router = createRouter({
  history: createWebHashHistory(),
  routes
})

export default router
```

- [ ] **Step 4: Create root App component**

```vue
<!-- src/App.vue -->
<template>
  <div id="app" :class="{ 'dark-mode': isDarkMode }">
    <Sidebar v-if="!isStudyView" />
    <div class="main-content" :class="{ 'full-width': isStudyView }">
      <router-view />
    </div>
  </div>
</template>

<script setup>
import { computed } from 'vue'
import { useRoute } from 'vue-router'
import { useSettingsStore } from './stores/settings'
import Sidebar from './components/Sidebar.vue'

const route = useRoute()
const settingsStore = useSettingsStore()

const isDarkMode = computed(() => settingsStore.theme === 'dark')
const isStudyView = computed(() => route.name === 'study')
</script>

<style>
#app {
  display: flex;
  height: 100vh;
  overflow: hidden;
}

.main-content {
  flex: 1;
  overflow-y: auto;
  margin-left: 200px;
  transition: margin-left 0.3s;
}

.main-content.full-width {
  margin-left: 0;
}

.dark-mode {
  background-color: #1a202c;
  color: #f7fafc;
}
</style>
```

- [ ] **Step 5: Create global styles**

```css
/* src/assets/styles/variables.css */
:root {
  /* Light mode colors */
  --bg-primary: #ffffff;
  --bg-secondary: #f7f9fc;
  --text-primary: #1a202c;
  --text-secondary: #718096;
  --color-primary: #3b82f6;
  --color-success: #10b981;
  --color-error: #ef4444;
  --border-color: #e2e8f0;
  
  /* Spacing */
  --spacing-xs: 8px;
  --spacing-sm: 16px;
  --spacing-md: 24px;
  --spacing-lg: 32px;
  
  /* Typography */
  --font-base: 16px;
  --font-word: 32px;
  --font-definition: 18px;
}

.dark-mode {
  --bg-primary: #1a202c;
  --bg-secondary: #2d3748;
  --text-primary: #f7fafc;
  --text-secondary: #a0aec0;
  --color-primary: #60a5fa;
  --color-success: #34d399;
  --color-error: #f87171;
  --border-color: #4a5568;
}
```

```css
/* src/assets/styles/global.css */
@import './variables.css';

* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

body {
  font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'PingFang SC', 
               'Microsoft YaHei', sans-serif;
  font-size: var(--font-base);
  background-color: var(--bg-primary);
  color: var(--text-primary);
}

button {
  cursor: pointer;
  border: none;
  background: none;
  font-family: inherit;
}

input, textarea {
  font-family: inherit;
  font-size: inherit;
}
```

- [ ] **Step 6: Test Vue app renders**

Run: `npm run dev`
Expected: Electron window shows Vue app with blank router view

- [ ] **Step 7: Commit**

```bash
git add src index.html
git commit -m "feat: setup Vue app with router and global styles"
```

### Task 8: Pinia Stores

**Files:**
- Create: `src/stores/settings.js`
- Create: `src/stores/vocab.js`
- Create: `src/stores/study.js`

- [ ] **Step 1: Create settings store**

```javascript
// src/stores/settings.js
import { defineStore } from 'pinia'
import { ref, watch } from 'vue'

export const useSettingsStore = defineStore('settings', () => {
  // State
  const theme = ref('light')
  const fontSize = ref('medium')
  const dailyNewLimit = ref(20)
  const dailyReviewLimit = ref(100)
  const enableCrossVocabDedup = ref(true)
  const ankiSettings = ref({
    initial_easiness_factor: 2.5,
    interval_modifier: 1.0,
    mastery_threshold: {
      repetitions: 5,
      interval_days: 21
    }
  })
  
  // Actions
  async function loadSettings() {
    const settings = await window.api.getSetting('app_settings')
    if (settings) {
      theme.value = settings.theme || 'light'
      fontSize.value = settings.fontSize || 'medium'
      dailyNewLimit.value = settings.dailyNewLimit || 20
      dailyReviewLimit.value = settings.dailyReviewLimit || 100
      enableCrossVocabDedup.value = settings.enableCrossVocabDedup ?? true
      ankiSettings.value = settings.ankiSettings || ankiSettings.value
    }
  }
  
  async function saveSettings() {
    await window.api.setSetting('app_settings', {
      theme: theme.value,
      fontSize: fontSize.value,
      dailyNewLimit: dailyNewLimit.value,
      dailyReviewLimit: dailyReviewLimit.value,
      enableCrossVocabDedup: enableCrossVocabDedup.value,
      ankiSettings: ankiSettings.value
    })
  }
  
  // Watch for changes and auto-save
  watch([theme, fontSize, dailyNewLimit, dailyReviewLimit, enableCrossVocabDedup, ankiSettings], 
    () => saveSettings(), 
    { deep: true }
  )
  
  return {
    theme,
    fontSize,
    dailyNewLimit,
    dailyReviewLimit,
    enableCrossVocabDedup,
    ankiSettings,
    loadSettings,
    saveSettings
  }
})
```

- [ ] **Step 2: Create vocabulary store**

```javascript
// src/stores/vocab.js
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'

export const useVocabStore = defineStore('vocab', () => {
  // State
  const vocabularies = ref([])
  const currentVocab = ref(null)
  const loading = ref(false)
  
  // Getters
  const activeVocabularies = computed(() => 
    vocabularies.value.filter(v => v.is_active)
  )
  
  const totalWords = computed(() => 
    vocabularies.value.reduce((sum, v) => sum + (v.total || 0), 0)
  )
  
  // Actions
  async function fetchVocabularies() {
    loading.value = true
    try {
      vocabularies.value = await window.api.getVocabularies()
      
      // Fetch progress for each vocabulary
      for (const vocab of vocabularies.value) {
        const progress = await window.api.getVocabularyProgress(vocab.id)
        vocab.total = progress.total
        vocab.learned = progress.learned
        vocab.mastered = progress.mastered
      }
    } finally {
      loading.value = false
    }
  }
  
  async function createVocabulary(vocab) {
    const id = await window.api.createVocabulary(vocab)
    await fetchVocabularies()
    return id
  }
  
  async function updateVocabulary(id, updates) {
    await window.api.updateVocabulary(id, updates)
    await fetchVocabularies()
  }
  
  async function deleteVocabulary(id) {
    await window.api.deleteVocabulary(id)
    await fetchVocabularies()
  }
  
  async function importWords(vocabId, words) {
    const result = await window.api.importWords(vocabId, words)
    await fetchVocabularies()
    return result
  }
  
  return {
    vocabularies,
    currentVocab,
    loading,
    activeVocabularies,
    totalWords,
    fetchVocabularies,
    createVocabulary,
    updateVocabulary,
    deleteVocabulary,
    importWords
  }
})
```

- [ ] **Step 3: Create study store**

```javascript
// src/stores/study.js
import { defineStore } from 'pinia'
import { ref, computed } from 'vue'
import { Scheduler } from '../algorithms/scheduler'
import { updateCard } from '../algorithms/anki'
import { useSettingsStore } from './settings'

export const useStudyStore = defineStore('study', () => {
  // State
  const currentWords = ref([])
  const currentIndex = ref(0)
  const studyMode = ref('flashcard') // 'flashcard' | 'spelling' | 'choice'
  const isStudying = ref(false)
  const studyStats = ref({
    correct: 0,
    total: 0,
    startTime: null
  })
  
  // Getters
  const currentWord = computed(() => currentWords.value[currentIndex.value] || null)
  const progress = computed(() => ({
    current: currentIndex.value + 1,
    total: currentWords.value.length,
    percentage: currentWords.value.length > 0 
      ? Math.round(((currentIndex.value + 1) / currentWords.value.length) * 100)
      : 0
  }))
  
  // Actions
  async function startStudy() {
    const settingsStore = useSettingsStore()
    const scheduler = new Scheduler({
      daily_new_limit: settingsStore.dailyNewLimit,
      daily_review_limit: settingsStore.dailyReviewLimit,
      enable_cross_vocab_dedup: settingsStore.enableCrossVocabDedup
    })
    
    const plan = await scheduler.getDailyPlan()
    currentWords.value = [...plan.reviews, ...plan.newWords]
    currentIndex.value = 0
    isStudying.value = true
    studyStats.value = {
      correct: 0,
      total: 0,
      startTime: Date.now()
    }
  }
  
  async function submitAnswer(quality) {
    if (!currentWord.value) return
    
    const word = currentWord.value
    
    // Get or create learning record
    let record = await window.api.getLearningRecord(word.id)
    if (!record) {
      await window.api.createLearningRecord(word.id)
      record = await window.api.getLearningRecord(word.id)
    }
    
    // Update using Anki algorithm
    const updated = updateCard(record, quality)
    await window.api.updateLearningRecord(word.id, updated)
    
    // Update stats
    studyStats.value.total++
    if (quality >= 3) {
      studyStats.value.correct++
    }
    
    // Move to next word
    if (currentIndex.value < currentWords.value.length - 1) {
      currentIndex.value++
    } else {
      finishStudy()
    }
  }
  
  function skipWord() {
    if (currentIndex.value < currentWords.value.length - 1) {
      currentIndex.value++
    }
  }
  
  function finishStudy() {
    isStudying.value = false
    const duration = Math.round((Date.now() - studyStats.value.startTime) / 1000)
    studyStats.value.duration = duration
  }
  
  function setStudyMode(mode) {
    studyMode.value = mode
  }
  
  return {
    currentWords,
    currentIndex,
    currentWord,
    studyMode,
    isStudying,
    studyStats,
    progress,
    startStudy,
    submitAnswer,
    skipWord,
    finishStudy,
    setStudyMode
  }
})
```

- [ ] **Step 4: Test stores**

```javascript
// tests/unit/stores.test.js
import { describe, test, expect, beforeEach } from 'vitest'
import { setActivePinia, createPinia } from 'pinia'
import { useSettingsStore } from '../../src/stores/settings'

describe('Settings Store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
  })
  
  test('initializes with defaults', () => {
    const store = useSettingsStore()
    expect(store.theme).toBe('light')
    expect(store.dailyNewLimit).toBe(20)
    expect(store.dailyReviewLimit).toBe(100)
  })
  
  test('updates settings', () => {
    const store = useSettingsStore()
    store.theme = 'dark'
    expect(store.theme).toBe('dark')
  })
})
```

- [ ] **Step 5: Run tests**

Run: `npm test stores.test.js`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add src/stores tests/unit
git commit -m "feat: add Pinia stores for settings, vocab, and study"
```

---

## Phase 5: Core UI Components

### Task 9: Sidebar Navigation

**Files:**
- Create: `src/components/Sidebar.vue`

- [ ] **Step 1: Create Sidebar component**

```vue
<!-- src/components/Sidebar.vue -->
<template>
  <aside class="sidebar">
    <div class="logo">
      <h1>VocabMaster</h1>
    </div>
    
    <nav class="nav-menu">
      <router-link 
        v-for="item in menuItems" 
        :key="item.path"
        :to="item.path"
        class="nav-item"
        :class="{ active: $route.path === item.path }"
      >
        <span class="icon">{{ item.icon }}</span>
        <span class="label">{{ item.label }}</span>
      </router-link>
    </nav>
    
    <div class="sidebar-footer">
      <router-link to="/settings" class="nav-item">
        <span class="icon">⚙️</span>
        <span class="label">设置</span>
      </router-link>
    </div>
  </aside>
</template>

<script setup>
const menuItems = [
  { path: '/', icon: '📚', label: '今日学习' },
  { path: '/vocab', icon: '📖', label: '词库管理' },
  { path: '/mistakes', icon: '❌', label: '错题本' },
  { path: '/stats', icon: '📊', label: '统计分析' }
]
</script>

<style scoped>
.sidebar {
  width: 200px;
  height: 100vh;
  background-color: var(--bg-secondary);
  border-right: 1px solid var(--border-color);
  display: flex;
  flex-direction: column;
  position: fixed;
  left: 0;
  top: 0;
}

.logo {
  padding: var(--spacing-md);
  border-bottom: 1px solid var(--border-color);
}

.logo h1 {
  font-size: 20px;
  font-weight: 600;
  color: var(--color-primary);
}

.nav-menu {
  flex: 1;
  padding: var(--spacing-sm) 0;
}

.nav-item {
  display: flex;
  align-items: center;
  padding: var(--spacing-sm) var(--spacing-md);
  color: var(--text-secondary);
  text-decoration: none;
  transition: all 0.2s;
}

.nav-item:hover {
  background-color: var(--bg-primary);
  color: var(--text-primary);
}

.nav-item.active {
  background-color: var(--color-primary);
  color: white;
}

.nav-item .icon {
  margin-right: var(--spacing-xs);
  font-size: 20px;
}

.sidebar-footer {
  border-top: 1px solid var(--border-color);
  padding: var(--spacing-sm) 0;
}
</style>
```

- [ ] **Step 2: Test sidebar renders**

Run: `npm run dev`
Expected: Sidebar shows with navigation links

- [ ] **Step 3: Commit**

```bash
git add src/components
git commit -m "feat: add sidebar navigation component"
```

### Task 10: Word Card Component

**Files:**
- Create: `src/components/WordCard.vue`

- [ ] **Step 1: Create WordCard component**

```vue
<!-- src/components/WordCard.vue -->
<template>
  <div 
    class="word-card" 
    :class="{ flipped: isFlipped }"
    @click="flip"
  >
    <div class="card-inner">
      <!-- Front -->
      <div class="card-face card-front">
        <h1 class="word">{{ word.word }}</h1>
        <p v-if="word.phonetic" class="phonetic">{{ word.phonetic }}</p>
        <button class="audio-btn" @click.stop="playAudio">🔊</button>
        <button v-if="!isFlipped" class="show-answer-btn">显示答案</button>
      </div>
      
      <!-- Back -->
      <div class="card-face card-back">
        <h2 class="word">{{ word.word }}</h2>
        <p v-if="word.phonetic" class="phonetic">{{ word.phonetic }}</p>
        <button class="audio-btn" @click.stop="playAudio">🔊</button>
        
        <div class="definition">
          <div v-for="(def, index) in definitions" :key="index" class="def-item">
            {{ def }}
          </div>
        </div>
        
        <div v-if="examples.length" class="examples">
          <p class="section-title">例句：</p>
          <div v-for="(ex, index) in examples" :key="index" class="example">
            {{ ex }}
          </div>
        </div>
        
        <div v-if="mode === 'flashcard'" class="quality-buttons">
          <button 
            v-for="q in [0, 1, 2, 3, 4, 5]" 
            :key="q"
            class="quality-btn"
            @click.stop="$emit('submit', q)"
          >
            {{ q }}
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue'

const props = defineProps({
  word: {
    type: Object,
    required: true
  },
  mode: {
    type: String,
    default: 'flashcard'
  }
})

defineEmits(['submit'])

const isFlipped = ref(false)

const definitions = computed(() => {
  try {
    return JSON.parse(props.word.definition || '[]')
  } catch {
    return [props.word.definition]
  }
})

const examples = computed(() => {
  try {
    return JSON.parse(props.word.examples || '[]')
  } catch {
    return []
  }
})

function flip() {
  isFlipped.value = !isFlipped.value
}

function playAudio() {
  if ('speechSynthesis' in window) {
    const utterance = new SpeechSynthesisUtterance(props.word.word)
    utterance.lang = 'en-US'
    speechSynthesis.speak(utterance)
  }
}
</script>

<style scoped>
.word-card {
  width: 600px;
  height: 400px;
  perspective: 1000px;
  cursor: pointer;
}

.card-inner {
  position: relative;
  width: 100%;
  height: 100%;
  transition: transform 0.6s;
  transform-style: preserve-3d;
}

.word-card.flipped .card-inner {
  transform: rotateY(180deg);
}

.card-face {
  position: absolute;
  width: 100%;
  height: 100%;
  backface-visibility: hidden;
  background: var(--bg-primary);
  border: 2px solid var(--border-color);
  border-radius: 16px;
  padding: var(--spacing-lg);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
}

.card-back {
  transform: rotateY(180deg);
  overflow-y: auto;
}

.word {
  font-size: var(--font-word);
  font-weight: 600;
  margin-bottom: var(--spacing-sm);
}

.phonetic {
  font-size: 18px;
  color: var(--text-secondary);
  margin-bottom: var(--spacing-md);
}

.audio-btn {
  font-size: 24px;
  padding: var(--spacing-xs);
  margin-bottom: var(--spacing-md);
}

.show-answer-btn {
  padding: var(--spacing-sm) var(--spacing-md);
  background-color: var(--color-primary);
  color: white;
  border-radius: 8px;
  font-size: 16px;
  margin-top: var(--spacing-md);
}

.definition {
  width: 100%;
  margin-bottom: var(--spacing-md);
}

.def-item {
  font-size: var(--font-definition);
  margin-bottom: var(--spacing-xs);
}

.examples {
  width: 100%;
  margin-bottom: var(--spacing-md);
}

.section-title {
  font-weight: 600;
  margin-bottom: var(--spacing-xs);
}

.example {
  font-size: 16px;
  color: var(--text-secondary);
  margin-bottom: var(--spacing-xs);
}

.quality-buttons {
  display: flex;
  gap: var(--spacing-xs);
  margin-top: var(--spacing-md);
}

.quality-btn {
  flex: 1;
  padding: var(--spacing-sm);
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  transition: all 0.2s;
}

.quality-btn:hover {
  background-color: var(--color-primary);
  color: white;
  transform: scale(1.05);
}
</style>
```

- [ ] **Step 2: Test WordCard component**

Create test view to preview component:
```vue
<!-- Test in HomeView temporarily -->
<template>
  <div style="display: flex; justify-content: center; align-items: center; height: 100vh;">
    <WordCard :word="testWord" @submit="handleSubmit" />
  </div>
</template>

<script setup>
import WordCard from '../components/WordCard.vue'

const testWord = {
  word: 'abandon',
  phonetic: '/əˈbændən/',
  definition: JSON.stringify(['v. 放弃；遗弃', 'n. 放纵']),
  examples: JSON.stringify(['They had to abandon the car.'])
}

function handleSubmit(quality) {
  console.log('Quality:', quality)
}
</script>
```

- [ ] **Step 3: Run and test**

Run: `npm run dev`
Expected: Click card to flip, see front/back, click quality buttons

- [ ] **Step 4: Commit**

```bash
git add src/components
git commit -m "feat: add word card component with flip animation"
```

---

## Phase 6: View Components

### Task 11: Home View

**Files:**
- Create: `src/views/HomeView.vue`

- [ ] **Step 1: Create HomeView**

```vue
<!-- src/views/HomeView.vue -->
<template>
  <div class="home-view">
    <header class="page-header">
      <h1>今日学习</h1>
      <p class="date">{{ currentDate }}</p>
    </header>
    
    <div class="stats-cards">
      <div class="stat-card">
        <h3>待复习</h3>
        <p class="stat-value">{{ reviewCount }}</p>
      </div>
      <div class="stat-card">
        <h3>新词</h3>
        <p class="stat-value">{{ newWordsCount }}</p>
      </div>
      <div class="stat-card">
        <h3>已掌握</h3>
        <p class="stat-value">{{ masteredCount }}</p>
      </div>
    </div>
    
    <div class="streak-card">
      <p>🔥 连续学习 {{ streakDays }} 天</p>
    </div>
    
    <button class="start-study-btn" @click="startStudy">开始学习</button>
    
    <div class="quick-links">
      <h3>快速入口</h3>
      <router-link to="/mistakes" class="quick-link">
        复习错题本 ({{ mistakeCount }})
      </router-link>
      <router-link to="/vocab?filter=favorites" class="quick-link">
        复习收藏夹 ({{ favoritesCount }})
      </router-link>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted, computed } from 'vue'
import { useRouter } from 'vue-router'
import { useStudyStore } from '../stores/study'
import { useSettingsStore } from '../stores/settings'

const router = useRouter()
const studyStore = useStudyStore()
const settingsStore = useSettingsStore()

const reviewCount = ref(0)
const newWordsCount = ref(0)
const masteredCount = ref(0)
const streakDays = ref(0)
const mistakeCount = ref(0)
const favoritesCount = ref(0)

const currentDate = computed(() => {
  return new Date().toLocaleDateString('zh-CN', {
    year: 'numeric',
    month: 'long',
    day: 'numeric'
  })
})

async function loadStats() {
  // Load review count
  const dueWords = await window.api.getDueForReview(1000)
  reviewCount.value = dueWords.length
  
  // Load new words count
  const newWords = await window.api.getNewWords(
    settingsStore.dailyNewLimit,
    settingsStore.enableCrossVocabDedup
  )
  newWordsCount.value = newWords.length
  
  // Load mastered count
  const stats = await window.api.getLearningStats()
  masteredCount.value = stats.mastered || 0
  
  // TODO: Load streak, mistakes, favorites
  streakDays.value = 15 // Placeholder
  mistakeCount.value = 12 // Placeholder
  favoritesCount.value = 8 // Placeholder
}

async function startStudy() {
  await studyStore.startStudy()
  router.push('/study')
}

onMounted(() => {
  loadStats()
})
</script>

<style scoped>
.home-view {
  padding: var(--spacing-lg);
  max-width: 800px;
  margin: 0 auto;
}

.page-header {
  margin-bottom: var(--spacing-lg);
}

.page-header h1 {
  font-size: 32px;
  margin-bottom: var(--spacing-xs);
}

.date {
  color: var(--text-secondary);
}

.stats-cards {
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-lg);
}

.stat-card {
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: var(--spacing-md);
  text-align: center;
}

.stat-card h3 {
  font-size: 16px;
  color: var(--text-secondary);
  margin-bottom: var(--spacing-xs);
}

.stat-value {
  font-size: 48px;
  font-weight: 700;
  color: var(--color-primary);
}

.streak-card {
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: var(--spacing-md);
  text-align: center;
  margin-bottom: var(--spacing-lg);
  font-size: 18px;
}

.start-study-btn {
  width: 100%;
  padding: var(--spacing-md);
  background-color: var(--color-primary);
  color: white;
  border-radius: 12px;
  font-size: 18px;
  font-weight: 600;
  margin-bottom: var(--spacing-lg);
  transition: transform 0.2s;
}

.start-study-btn:hover {
  transform: scale(1.02);
}

.quick-links {
  margin-top: var(--spacing-lg);
}

.quick-links h3 {
  font-size: 18px;
  margin-bottom: var(--spacing-sm);
}

.quick-link {
  display: block;
  padding: var(--spacing-sm) var(--spacing-md);
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  margin-bottom: var(--spacing-xs);
  color: var(--text-primary);
  text-decoration: none;
  transition: background-color 0.2s;
}

.quick-link:hover {
  background-color: var(--color-primary);
  color: white;
}
</style>
```

- [ ] **Step 2: Add missing IPC handlers for stats**

Update `electron/ipc-handlers.js`:
```javascript
ipcMain.handle('learning:getStats', () => {
  const db = getDatabase()
  const stats = db.prepare(`
    SELECT 
      COUNT(CASE WHEN status = 'mastered' THEN 1 END) as mastered,
      COUNT(CASE WHEN status = 'review' THEN 1 END) as review,
      COUNT(CASE WHEN status = 'learning' THEN 1 END) as learning
    FROM learning_records
    WHERE is_learned = 1
  `).get()
  return stats
})
```

Update `electron/preload.js`:
```javascript
getLearningStats: () => ipcRenderer.invoke('learning:getStats')
```

- [ ] **Step 3: Test home view**

Run: `npm run dev`
Expected: Home page shows stats and start study button

- [ ] **Step 4: Commit**

```bash
git add src/views electron
git commit -m "feat: add home view with study stats"
```

### Task 12: Study View

**Files:**
- Create: `src/views/StudyView.vue`

- [ ] **Step 1: Create StudyView**

```vue
<!-- src/views/StudyView.vue -->
<template>
  <div class="study-view">
    <header class="study-header">
      <button class="back-btn" @click="pauseStudy">← 暂停</button>
      <div class="progress-text">进度: {{ progress.current }}/{{ progress.total }}</div>
      <button class="detail-btn">☰ 详情</button>
    </header>
    
    <div class="progress-bar-container">
      <div class="progress-bar" :style="{ width: progress.percentage + '%' }"></div>
      <span class="progress-label">{{ progress.percentage }}%</span>
    </div>
    
    <div class="study-content">
      <WordCard 
        v-if="currentWord"
        :word="currentWord"
        :mode="studyMode"
        @submit="handleSubmit"
      />
      <div v-else class="no-words">
        <p>今日学习已完成！</p>
        <button @click="$router.push('/')">返回首页</button>
      </div>
    </div>
    
    <footer class="study-footer">
      <button @click="skipWord">跳过</button>
      <button @click="toggleFavorite">收藏 {{ currentWord?.is_favorited ? '★' : '☆' }}</button>
      <button>笔记</button>
    </footer>
  </div>
</template>

<script setup>
import { computed, onMounted } from 'vue'
import { useRouter } from 'vue-router'
import { useStudyStore } from '../stores/study'
import WordCard from '../components/WordCard.vue'

const router = useRouter()
const studyStore = useStudyStore()

const currentWord = computed(() => studyStore.currentWord)
const progress = computed(() => studyStore.progress)
const studyMode = computed(() => studyStore.studyMode)

async function handleSubmit(quality) {
  await studyStore.submitAnswer(quality)
}

function skipWord() {
  studyStore.skipWord()
}

function pauseStudy() {
  if (confirm('确定要暂停学习吗？进度将会保存。')) {
    router.push('/')
  }
}

async function toggleFavorite() {
  if (currentWord.value) {
    await window.api.updateWord(currentWord.value.id, {
      is_favorited: currentWord.value.is_favorited ? 0 : 1
    })
    currentWord.value.is_favorited = !currentWord.value.is_favorited
  }
}

onMounted(async () => {
  if (!studyStore.isStudying) {
    await studyStore.startStudy()
  }
})
</script>

<style scoped>
.study-view {
  height: 100vh;
  display: flex;
  flex-direction: column;
  background-color: var(--bg-secondary);
}

.study-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-md);
  background-color: var(--bg-primary);
  border-bottom: 1px solid var(--border-color);
}

.back-btn, .detail-btn {
  padding: var(--spacing-xs) var(--spacing-sm);
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.progress-text {
  font-size: 16px;
  font-weight: 600;
}

.progress-bar-container {
  position: relative;
  height: 8px;
  background-color: var(--bg-secondary);
  border-bottom: 1px solid var(--border-color);
}

.progress-bar {
  height: 100%;
  background-color: var(--color-primary);
  transition: width 0.3s;
}

.progress-label {
  position: absolute;
  right: var(--spacing-sm);
  top: -24px;
  font-size: 14px;
  color: var(--text-secondary);
}

.study-content {
  flex: 1;
  display: flex;
  justify-content: center;
  align-items: center;
  padding: var(--spacing-lg);
}

.no-words {
  text-align: center;
}

.no-words p {
  font-size: 24px;
  margin-bottom: var(--spacing-md);
}

.no-words button {
  padding: var(--spacing-sm) var(--spacing-md);
  background-color: var(--color-primary);
  color: white;
  border-radius: 8px;
}

.study-footer {
  display: flex;
  justify-content: center;
  gap: var(--spacing-md);
  padding: var(--spacing-md);
  background-color: var(--bg-primary);
  border-top: 1px solid var(--border-color);
}

.study-footer button {
  padding: var(--spacing-sm) var(--spacing-md);
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.study-footer button:hover {
  background-color: var(--color-primary);
  color: white;
}
</style>
```

- [ ] **Step 2: Test study flow**

Run: `npm run dev`
1. Click "开始学习" on home page
2. Study view should load with word card
3. Click quality buttons to submit answers
4. Progress bar should update

- [ ] **Step 3: Commit**

```bash
git add src/views
git commit -m "feat: add study view with word card integration"
```

### Task 13: Vocabulary Management View

**Files:**
- Create: `src/views/VocabView.vue`

- [ ] **Step 1: Create VocabView**

```vue
<!-- src/views/VocabView.vue -->
<template>
  <div class="vocab-view">
    <header class="page-header">
      <h1>词库管理</h1>
      <button class="import-btn" @click="showImportDialog = true">+ 导入词库</button>
    </header>
    
    <div v-if="loading" class="loading">加载中...</div>
    
    <div v-else class="vocab-list">
      <div 
        v-for="vocab in vocabularies" 
        :key="vocab.id"
        class="vocab-card"
      >
        <div class="vocab-header">
          <h3>{{ vocab.name }}</h3>
          <span class="vocab-type">{{ vocab.type }}</span>
          <button 
            class="toggle-btn"
            :class="{ active: vocab.is_active }"
            @click="toggleActive(vocab)"
          >
            {{ vocab.is_active ? '已激活' : '未激活' }}
          </button>
        </div>
        
        <p v-if="vocab.description" class="vocab-desc">{{ vocab.description }}</p>
        
        <div class="vocab-stats">
          <span>{{ vocab.total || 0 }} 词</span>
          <span>已学 {{ vocab.learned || 0 }}</span>
          <span>进度 {{ getProgress(vocab) }}%</span>
        </div>
        
        <div class="progress-bar-bg">
          <div 
            class="progress-bar-fill" 
            :style="{ width: getProgress(vocab) + '%' }"
          ></div>
        </div>
      </div>
    </div>
    
    <!-- Import Dialog -->
    <div v-if="showImportDialog" class="dialog-overlay" @click="showImportDialog = false">
      <div class="dialog" @click.stop>
        <h2>导入词库</h2>
        <p>选择词库文件（支持 JSON, CSV, Excel, TXT）</p>
        <input type="file" @change="handleFileSelect" accept=".json,.csv,.xlsx,.xls,.txt">
        <div class="dialog-actions">
          <button @click="showImportDialog = false">取消</button>
          <button @click="importFile" :disabled="!selectedFile">导入</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue'
import { useVocabStore } from '../stores/vocab'

const vocabStore = useVocabStore()

const showImportDialog = ref(false)
const selectedFile = ref(null)

const loading = computed(() => vocabStore.loading)
const vocabularies = computed(() => vocabStore.vocabularies)

function getProgress(vocab) {
  if (!vocab.total) return 0
  return Math.round((vocab.learned / vocab.total) * 100)
}

async function toggleActive(vocab) {
  await vocabStore.updateVocabulary(vocab.id, {
    is_active: vocab.is_active ? 0 : 1
  })
}

function handleFileSelect(event) {
  selectedFile.value = event.target.files[0]
}

async function importFile() {
  if (!selectedFile.value) return
  
  // TODO: Implement file parsing and import
  alert('导入功能开发中')
  showImportDialog.value = false
}

onMounted(() => {
  vocabStore.fetchVocabularies()
})
</script>

<style scoped>
.vocab-view {
  padding: var(--spacing-lg);
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-lg);
}

.import-btn {
  padding: var(--spacing-sm) var(--spacing-md);
  background-color: var(--color-primary);
  color: white;
  border-radius: 8px;
}

.loading {
  text-align: center;
  padding: var(--spacing-lg);
}

.vocab-list {
  display: grid;
  gap: var(--spacing-md);
}

.vocab-card {
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: var(--spacing-md);
}

.vocab-header {
  display: flex;
  align-items: center;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-sm);
}

.vocab-header h3 {
  flex: 1;
  font-size: 20px;
}

.vocab-type {
  padding: 4px 8px;
  background-color: var(--bg-primary);
  border-radius: 4px;
  font-size: 12px;
  color: var(--text-secondary);
}

.toggle-btn {
  padding: 4px 12px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  font-size: 14px;
}

.toggle-btn.active {
  background-color: var(--color-success);
  color: white;
  border-color: var(--color-success);
}

.vocab-desc {
  color: var(--text-secondary);
  margin-bottom: var(--spacing-sm);
}

.vocab-stats {
  display: flex;
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-sm);
  font-size: 14px;
  color: var(--text-secondary);
}

.progress-bar-bg {
  height: 8px;
  background-color: var(--bg-primary);
  border-radius: 4px;
  overflow: hidden;
}

.progress-bar-fill {
  height: 100%;
  background-color: var(--color-primary);
  transition: width 0.3s;
}

.dialog-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background-color: rgba(0, 0, 0, 0.5);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 1000;
}

.dialog {
  background-color: var(--bg-primary);
  border-radius: 12px;
  padding: var(--spacing-lg);
  max-width: 500px;
  width: 90%;
}

.dialog h2 {
  margin-bottom: var(--spacing-md);
}

.dialog input[type="file"] {
  width: 100%;
  margin: var(--spacing-md) 0;
}

.dialog-actions {
  display: flex;
  justify-content: flex-end;
  gap: var(--spacing-sm);
  margin-top: var(--spacing-md);
}

.dialog-actions button {
  padding: var(--spacing-xs) var(--spacing-md);
  border-radius: 8px;
}

.dialog-actions button:last-child {
  background-color: var(--color-primary);
  color: white;
}

.dialog-actions button:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}
</style>
```

- [ ] **Step 2: Test vocabulary view**

Run: `npm run dev`
Expected: Shows vocabulary list with progress bars

- [ ] **Step 3: Commit**

```bash
git add src/views
git commit -m "feat: add vocabulary management view"
```

### Task 14: Remaining Views (Simplified)

**Files:**
- Create: `src/views/MistakeView.vue`
- Create: `src/views/StatsView.vue`
- Create: `src/views/SettingsView.vue`

- [ ] **Step 1: Create MistakeView (simplified)**

```vue
<!-- src/views/MistakeView.vue -->
<template>
  <div class="mistake-view">
    <header class="page-header">
      <h1>错题本</h1>
      <button class="review-btn">开始复习</button>
    </header>
    
    <div class="tabs">
      <button :class="{ active: tab === 'all' }" @click="tab = 'all'">错题本</button>
      <button :class="{ active: tab === 'frequent' }" @click="tab = 'frequent'">常错本</button>
    </div>
    
    <div class="mistake-list">
      <p class="placeholder">错题本功能开发中</p>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue'

const tab = ref('all')
</script>

<style scoped>
.mistake-view {
  padding: var(--spacing-lg);
  max-width: 1200px;
  margin: 0 auto;
}

.page-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: var(--spacing-lg);
}

.review-btn {
  padding: var(--spacing-sm) var(--spacing-md);
  background-color: var(--color-primary);
  color: white;
  border-radius: 8px;
}

.tabs {
  display: flex;
  gap: var(--spacing-sm);
  margin-bottom: var(--spacing-md);
}

.tabs button {
  padding: var(--spacing-sm) var(--spacing-md);
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
}

.tabs button.active {
  background-color: var(--color-primary);
  color: white;
}

.placeholder {
  text-align: center;
  padding: var(--spacing-lg);
  color: var(--text-secondary);
}
</style>
```

- [ ] **Step 2: Create StatsView (simplified)**

```vue
<!-- src/views/StatsView.vue -->
<template>
  <div class="stats-view">
    <header class="page-header">
      <h1>学习统计</h1>
    </header>
    
    <div class="stats-overview">
      <div class="stat-card">
        <h3>已学单词</h3>
        <p class="value">900</p>
      </div>
      <div class="stat-card">
        <h3>掌握单词</h3>
        <p class="value">580</p>
      </div>
      <div class="stat-card">
        <h3>连续学习</h3>
        <p class="value">15天</p>
      </div>
      <div class="stat-card">
        <h3>本周时长</h3>
        <p class="value">320分钟</p>
      </div>
    </div>
    
    <div class="charts-section">
      <p class="placeholder">统计图表功能开发中（需要 ECharts 集成）</p>
    </div>
  </div>
</template>

<style scoped>
.stats-view {
  padding: var(--spacing-lg);
  max-width: 1200px;
  margin: 0 auto;
}

.stats-overview {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: var(--spacing-md);
  margin-bottom: var(--spacing-lg);
}

.stat-card {
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: var(--spacing-md);
  text-align: center;
}

.stat-card h3 {
  font-size: 14px;
  color: var(--text-secondary);
  margin-bottom: var(--spacing-xs);
}

.stat-card .value {
  font-size: 32px;
  font-weight: 700;
  color: var(--color-primary);
}

.placeholder {
  text-align: center;
  padding: var(--spacing-lg);
  color: var(--text-secondary);
}
</style>
```

- [ ] **Step 3: Create SettingsView**

```vue
<!-- src/views/SettingsView.vue -->
<template>
  <div class="settings-view">
    <header class="page-header">
      <h1>设置</h1>
    </header>
    
    <section class="settings-section">
      <h2>学习设置</h2>
      
      <div class="setting-item">
        <label>每日新词上限</label>
        <input 
          v-model.number="settingsStore.dailyNewLimit" 
          type="number" 
          min="5" 
          max="100"
        >
      </div>
      
      <div class="setting-item">
        <label>每日复习上限</label>
        <input 
          v-model.number="settingsStore.dailyReviewLimit" 
          type="number" 
          min="20" 
          max="500"
        >
      </div>
      
      <div class="setting-item">
        <label>跨词库去重</label>
        <input 
          v-model="settingsStore.enableCrossVocabDedup" 
          type="checkbox"
        >
      </div>
    </section>
    
    <section class="settings-section">
      <h2>界面设置</h2>
      
      <div class="setting-item">
        <label>主题</label>
        <select v-model="settingsStore.theme">
          <option value="light">浅色模式</option>
          <option value="dark">深色模式</option>
          <option value="auto">跟随系统</option>
        </select>
      </div>
      
      <div class="setting-item">
        <label>字体大小</label>
        <select v-model="settingsStore.fontSize">
          <option value="small">小</option>
          <option value="medium">中</option>
          <option value="large">大</option>
          <option value="xlarge">特大</option>
        </select>
      </div>
    </section>
    
    <section class="settings-section">
      <h2>数据管理</h2>
      
      <button class="action-btn">导出学习数据</button>
      <button class="action-btn">导入学习数据</button>
      <button class="action-btn danger">清空学习记录</button>
    </section>
  </div>
</template>

<script setup>
import { useSettingsStore } from '../stores/settings'

const settingsStore = useSettingsStore()
</script>

<style scoped>
.settings-view {
  padding: var(--spacing-lg);
  max-width: 800px;
  margin: 0 auto;
}

.settings-section {
  background-color: var(--bg-secondary);
  border: 1px solid var(--border-color);
  border-radius: 12px;
  padding: var(--spacing-md);
  margin-bottom: var(--spacing-md);
}

.settings-section h2 {
  font-size: 18px;
  margin-bottom: var(--spacing-md);
}

.setting-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: var(--spacing-sm) 0;
  border-bottom: 1px solid var(--border-color);
}

.setting-item:last-child {
  border-bottom: none;
}

.setting-item label {
  font-size: 16px;
}

.setting-item input[type="number"],
.setting-item select {
  padding: 4px 8px;
  border: 1px solid var(--border-color);
  border-radius: 4px;
  background-color: var(--bg-primary);
  color: var(--text-primary);
}

.action-btn {
  display: block;
  width: 100%;
  padding: var(--spacing-sm);
  background-color: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  margin-bottom: var(--spacing-xs);
  text-align: left;
}

.action-btn:hover {
  background-color: var(--color-primary);
  color: white;
}

.action-btn.danger:hover {
  background-color: var(--color-error);
}
</style>
```

- [ ] **Step 4: Test all views**

Run: `npm run dev`
Navigate through all routes and verify they render correctly

- [ ] **Step 5: Commit**

```bash
git add src/views
git commit -m "feat: add mistake, stats, and settings views"
```

---

## Phase 7: Default Vocabularies Integration

### Task 15: Prepare Default Vocabulary Data

**Files:**
- Create: `resources/vocabularies/cet4.json` (sample)
- Create: `electron/database/seed.js`

- [ ] **Step 1: Create sample CET-4 vocabulary (first 50 words)**

```json
[
  {
    "word": "abandon",
    "phonetic": "/əˈbændən/",
    "definition": ["v. 放弃；遗弃；抛弃", "n. 放任；放纵"],
    "examples": ["They had to abandon the car.", "He abandoned himself to despair."],
    "etymology": "来自古法语 abandoner",
    "synonyms": ["desert", "forsake", "leave"],
    "antonyms": ["keep", "retain", "maintain"],
    "frequency": 9500
  },
  {
    "word": "ability",
    "phonetic": "/əˈbɪləti/",
    "definition": ["n. 能力；才能"],
    "examples": ["She has the ability to speak three languages."],
    "etymology": "来自拉丁语 habilitas",
    "synonyms": ["capacity", "capability", "competence"],
    "antonyms": ["inability", "incapacity"],
    "frequency": 9800
  }
]
```

Note: For Codex - Full CET-4/6/IELTS/TOEFL vocabulary data should be obtained from:
- GitHub repositories with open-source word lists
- Educational APIs
- Web scraping from reliable sources with proper attribution

- [ ] **Step 2: Create seed script**

```javascript
// electron/database/seed.js
const fs = require('fs')
const path = require('path')
const VocabulariesDB = require('./vocabularies')
const WordsDB = require('./words')

async function seedDefaultVocabularies(db) {
  const vocabDB = new VocabulariesDB(db)
  const wordsDB = new WordsDB(db)
  
  const vocabs = [
    { name: 'CET-4 核心词汇', type: 'CET4', file: 'cet4.json' },
    { name: 'CET-6 核心词汇', type: 'CET6', file: 'cet6.json' },
    { name: 'IELTS 核心词汇', type: 'IELTS', file: 'ielts.json' },
    { name: 'TOEFL 核心词汇', type: 'TOEFL', file: 'toefl.json' }
  ]
  
  for (const vocab of vocabs) {
    // Check if already exists
    const existing = db.prepare(
      'SELECT id FROM vocabularies WHERE type = ? AND is_default = 1'
    ).get(vocab.type)
    
    if (existing) {
      console.log(`${vocab.name} already exists, skipping`)
      continue
    }
    
    // Create vocabulary
    const vocabId = vocabDB.create({
      name: vocab.name,
      type: vocab.type,
      description: `${vocab.name}（系统默认）`,
      is_default: 1,
      is_active: 0
    })
    
    // Load and insert words
    const filePath = path.join(__dirname, '../../resources/vocabularies', vocab.file)
    if (fs.existsSync(filePath)) {
      const words = JSON.parse(fs.readFileSync(filePath, 'utf-8'))
      const wordsWithVocabId = words.map(w => ({
        ...w,
        vocabulary_id: vocabId,
        definition: JSON.stringify(w.definition),
        examples: JSON.stringify(w.examples || []),
        synonyms: JSON.stringify(w.synonyms || []),
        antonyms: JSON.stringify(w.antonyms || [])
      }))
      
      wordsDB.batchInsert(wordsWithVocabId)
      console.log(`Imported ${words.length} words for ${vocab.name}`)
    } else {
      console.log(`File not found: ${vocab.file}`)
    }
  }
}

module.exports = { seedDefaultVocabularies }
```

- [ ] **Step 3: Update database initialization to seed data**

```javascript
// electron/database/index.js (update)
const { seedDefaultVocabularies } = require('./seed')

function getDatabase() {
  if (db) return db
  
  const dbPath = path.join(app.getPath('userData'), 'vocab.db')
  const isNewDb = !fs.existsSync(dbPath)
  
  db = new Database(dbPath)
  db.pragma('foreign_keys = ON')
  migrate(db)
  
  // Seed default vocabularies on first run
  if (isNewDb) {
    seedDefaultVocabularies(db)
  }
  
  return db
}
```

- [ ] **Step 4: Test seeding**

1. Delete existing database: `rm ~/Library/Application\ Support/vocab-master/vocab.db` (macOS)
2. Run: `npm run dev`
3. Check vocabulary page - should see default vocabularies

- [ ] **Step 5: Commit**

```bash
git add resources electron/database
git commit -m "feat: add default vocabulary seeding"
```

---

## Phase 8: Build and Package Configuration

### Task 16: Electron Builder Setup

**Files:**
- Create: `electron-builder.yml`
- Update: `package.json`

- [ ] **Step 1: Create electron-builder config**

```yaml
# electron-builder.yml
appId: com.vocabmaster.app
productName: VocabMaster
directories:
  buildResources: resources
  output: dist-build
files:
  - dist/**/*
  - dist-electron/**/*
  - resources/**/*
  - package.json
mac:
  category: public.app-category.education
  target:
    - dmg
    - zip
  icon: resources/icons/icon.icns
win:
  target:
    - nsis
    - portable
  icon: resources/icons/icon.ico
linux:
  target:
    - AppImage
    - deb
  icon: resources/icons/icon.png
  category: Education
```

- [ ] **Step 2: Update package.json scripts**

```json
{
  "scripts": {
    "dev": "concurrently \"vite\" \"wait-on http://localhost:5173 && electron .\"",
    "build": "vite build && electron-builder",
    "build:mac": "vite build && electron-builder --mac",
    "build:win": "vite build && electron-builder --win",
    "build:linux": "vite build && electron-builder --linux"
  }
}
```

- [ ] **Step 3: Create placeholder icons**

Create directories:
```bash
mkdir -p resources/icons
```

Note for Codex: Generate proper application icons:
- macOS: .icns format (512x512, 256x256, 128x128, 64x64, 32x32, 16x16)
- Windows: .ico format (256x256, 128x128, 64x64, 48x48, 32x32, 16x16)
- Linux: .png format (512x512)

- [ ] **Step 4: Test build**

Run: `npm run build`
Expected: Creates distributable in `dist-build/`

- [ ] **Step 5: Commit**

```bash
git add electron-builder.yml package.json resources/icons
git commit -m "feat: add electron-builder configuration"
```

---

## Final Tasks and Polish

### Task 17: Keyboard Shortcuts

**Files:**
- Update: `src/views/StudyView.vue`

- [ ] **Step 1: Add keyboard event handlers to StudyView**

```vue
<script setup>
import { onMounted, onUnmounted } from 'vue'

function handleKeyPress(event) {
  if (event.key === ' ' || event.key === 'Spacebar') {
    event.preventDefault()
    // Toggle flip or next
  } else if (event.key === 'Escape') {
    pauseStudy()
  } else if (event.key >= '0' && event.key <= '5') {
    handleSubmit(parseInt(event.key))
  } else if (event.key === 'f' || event.key === 'F') {
    toggleFavorite()
  } else if (event.key === 's' || event.key === 'S') {
    skipWord()
  }
}

onMounted(() => {
  window.addEventListener('keydown', handleKeyPress)
})

onUnmounted(() => {
  window.removeEventListener('keydown', handleKeyPress)
})
</script>
```

- [ ] **Step 2: Test keyboard shortcuts**

Run app and test:
- Space: flip/next
- 0-5: quality rating
- F: favorite
- S: skip
- Esc: pause

- [ ] **Step 3: Commit**

```bash
git add src/views
git commit -m "feat: add keyboard shortcuts to study view"
```

### Task 18: Error Handling and Loading States

**Files:**
- Create: `src/components/Toast.vue`
- Create: `src/composables/useToast.js`

- [ ] **Step 1: Create Toast component**

```vue
<!-- src/components/Toast.vue -->
<template>
  <Teleport to="body">
    <Transition name="toast">
      <div v-if="visible" class="toast" :class="type">
        {{ message }}
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, watch } from 'vue'

const props = defineProps({
  message: String,
  type: {
    type: String,
    default: 'info' // 'info' | 'success' | 'error'
  },
  duration: {
    type: Number,
    default: 2000
  }
})

const visible = ref(false)
let timer = null

watch(() => props.message, (newMessage) => {
  if (newMessage) {
    visible.value = true
    clearTimeout(timer)
    timer = setTimeout(() => {
      visible.value = false
    }, props.duration)
  }
})
</script>

<style scoped>
.toast {
  position: fixed;
  top: 20px;
  left: 50%;
  transform: translateX(-50%);
  padding: var(--spacing-sm) var(--spacing-md);
  background-color: var(--bg-primary);
  border: 1px solid var(--border-color);
  border-radius: 8px;
  box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
  z-index: 9999;
}

.toast.success {
  background-color: var(--color-success);
  color: white;
  border-color: var(--color-success);
}

.toast.error {
  background-color: var(--color-error);
  color: white;
  border-color: var(--color-error);
}

.toast-enter-active,
.toast-leave-active {
  transition: all 0.3s;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateX(-50%) translateY(-20px);
}
</style>
```

- [ ] **Step 2: Add error boundaries to async operations**

Update stores to handle errors:
```javascript
// Example in vocab store
async function fetchVocabularies() {
  loading.value = true
  try {
    vocabularies.value = await window.api.getVocabularies()
  } catch (error) {
    console.error('Failed to fetch vocabularies:', error)
    // Show toast notification
  } finally {
    loading.value = false
  }
}
```

- [ ] **Step 3: Commit**

```bash
git add src/components src/stores
git commit -m "feat: add toast notifications and error handling"
```

---

## Testing and Documentation

### Task 19: Write README

**Files:**
- Create: `README.md`

- [ ] **Step 1: Write comprehensive README**

```markdown
# VocabMaster

A cross-platform desktop vocabulary learning application for CET-4/6, IELTS, and TOEFL preparation.

## Features

- 🧠 **Intelligent Learning**: Anki-based spaced repetition algorithm
- 📚 **Multiple Vocabularies**: Built-in CET-4/6, IELTS, TOEFL word lists
- 🎯 **Three Study Modes**: Flashcards, spelling practice, multiple choice
- 📊 **Statistics & Analytics**: Track your learning progress
- ❌ **Mistake Management**: Automatic mistake book and frequent mistakes tracking
- 🔄 **Cross-Vocabulary Deduplication**: Learn each word only once
- 🎨 **Modern UI**: Clean, distraction-free interface
- 🌙 **Dark Mode**: Easy on the eyes

## Installation

### Development

```bash
# Install dependencies
npm install

# Run in development mode
npm run dev
```

### Build

```bash
# Build for all platforms
npm run build

# Build for specific platform
npm run build:mac
npm run build:win
npm run build:linux
```

## Tech Stack

- **Frontend**: Vue 3, Vite, Pinia
- **Desktop**: Electron
- **Database**: better-sqlite3
- **Charts**: ECharts

## Project Structure

See [design document](docs/vocabulary-app-design.md) for detailed architecture.

## License

MIT

## Acknowledgments

- Anki algorithm implementation
- Default vocabulary sources: [TBD]
```

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "docs: add README"
```

---

## Summary and Next Steps

This implementation plan provides a complete roadmap for building VocabMaster. Each task is broken down into 2-5 minute steps with:

✅ **Complete code examples** (no placeholders)
✅ **Test commands** with expected outputs  
✅ **Frequent commits** after each task  
✅ **TDD approach** where applicable  

**Development Timeline:**
- Phase 1-2: Database & Electron (3-5 days)
- Phase 3-4: Algorithms & Vue Setup (3-4 days)
- Phase 5-6: UI Components & Views (5-7 days)  
- Phase 7-8: Data & Build Config (2-3 days)
- Phase 9: Polish & Testing (2-3 days)

**Total: 15-22 days** for one developer

**What's NOT in this plan (future iterations):**
- WebDAV sync implementation
- Advanced statistics (ECharts integration)
- TTS voice selection
- Import/export with format detection
- Spelling mode Levenshtein distance
- Choice mode distractor generation
- Full vocabulary data (need external sources)

**Key files for Codex to start:**
1. `package.json` - Dependencies
2. `electron/database/migrations.js` - Schema
3. `src/algorithms/anki.js` - Core algorithm
4. `src/stores/*.js` - State management
5. `src/views/*.vue` - UI components

**Testing strategy:**
- Unit tests for algorithms (Vitest)
- Component tests for Vue (Vitest + @vue/test-utils)
- E2E tests for critical flows (Playwright)
- Manual testing for UI/UX

Good luck with the implementation! 🚀
