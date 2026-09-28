const { ipcMain, dialog } = require('electron')
const fs = require('node:fs')
const path = require('node:path')
const crypto = require('node:crypto')
const XLSX = require('xlsx')
const { getDatabase } = require('./database.cjs')
const { createVocabularyTemplate } = require('./vocabulary-template.cjs')
const { createBackend, hydrateWord } = require('../src/backend/index.cjs')
const { createAdapter } = require('../src/backend/db-adapter.cjs')
const { applyBackup } = require('../src/backend/backup-merge.cjs')
const { parseVocabularyFile, decodeText } = require('../src/backend/file-parse.cjs')
const { localDateKey } = require('../src/backend/date-utils.cjs')

const importCache = new Map()
const backupCache = new Map()

function registerIpcHandlers() {
  const db = getDatabase()
  const backend = createBackend(createAdapter(db))

  ipcMain.handle('dashboard:get', () => backend.getDashboard())
  ipcMain.handle('vocab:list', () => backend.listVocabularies())
  ipcMain.handle('vocab:set-active', (_event, id, active) => backend.setVocabularyActive(id, active))
  ipcMain.handle('vocab:delete', (_event, id) => backend.deleteVocabulary(id))
  ipcMain.handle('words:search', (_event, query, filters = {}) => backend.searchWords(query, filters))
  ipcMain.handle('words:get', (_event, id) => backend.getWord(id))
  ipcMain.handle('words:update', (_event, id, updates = {}) => backend.updateWord(id, updates))
  ipcMain.handle('words:favorites', () => backend.listFavorites())
  ipcMain.handle('study:plan', (_event, settings = {}, source = 'daily') => backend.buildPlan(settings, source))
  ipcMain.handle('study:answer', (_event, payload = {}) => backend.submitAnswer(payload))
  ipcMain.handle('mistakes:list', (_event, frequentOnly = false) => backend.listMistakes(frequentOnly))
  ipcMain.handle('mistakes:remove', (_event, wordId) => backend.removeMistake(wordId))
  ipcMain.handle('stats:get', (_event, days = 30) => backend.getStatistics(days))
  ipcMain.handle('settings:get', () => backend.getSettings())
  ipcMain.handle('settings:set', (_event, settings) => backend.setSettings(settings))
  ipcMain.handle('data:reset-progress', () => backend.resetProgress())

  registerFileHandlers(db)
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
    const parsed = parseVocabularyFile(fs.readFileSync(selected.filePaths[0]), path.basename(selected.filePaths[0]))
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
      title: '导出学习备份', defaultPath: `vocabmaster-backup-${localDateKey()}.json`,
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

  ipcMain.handle('data:import-commit', async (_event, token, strategy = 'replace') => {
    const data = backupCache.get(token)
    if (!data) throw new Error('备份预览已过期，请重新选择文件')
    const result = await applyBackup(createAdapter(db), data, strategy)
    backupCache.delete(token)
    return result
  })
}

module.exports = { registerIpcHandlers }
