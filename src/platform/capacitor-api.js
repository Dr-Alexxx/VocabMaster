import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite'
import { Directory, Encoding, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import { validateBackup } from '@/backend/backup-merge.cjs'
import { migrateDatabase } from '@/backend/migrations.cjs'

const sqlite = new SQLiteConnection(CapacitorSQLite)

function createCapacitorAdapter(connection) {
  const adapter = {
    run: async (sql, params = []) => {
      const result = await connection.run(sql, params, false)
      const changes = result?.changes || {}
      return { changes: Number(changes.changes ?? 0), lastInsertRowid: Number(changes.lastId ?? 0) }
    },
    get: async (sql, params = []) => {
      const result = await connection.query(sql, params)
      return result?.values?.[0]
    },
    all: async (sql, params = []) => {
      const result = await connection.query(sql, params)
      return result?.values || []
    },
    exec: async (sql) => { await connection.execute(sql, false) },
    withTransaction: async (fn) => {
      await connection.beginTransaction()
      try {
        const value = await fn(adapter)
        await connection.commitTransaction()
        return value
      } catch (error) {
        await connection.rollbackTransaction()
        throw error
      }
    }
  }
  return adapter
}

let backendPromise = null
const importCache = new Map()
const backupCache = new Map()

function getBackend() {
  if (!backendPromise) {
    backendPromise = (async () => {
      const { createBackend, schema, ensureSeeded, parseVocabularyFile, applyBackup, createVocabularyTemplate } = await import('@/backend/index.cjs')
      const connection = await sqlite.createConnection('vocabmaster', false, 'no-encryption', 1, false)
      await connection.open()
      const adapter = createCapacitorAdapter(connection)
      await migrateDatabase(adapter)
      const loadJson = async (name) => (await fetch(`vocabularies/${name}`)).json()
      await ensureSeeded(adapter, loadJson)
      let queue = Promise.resolve()
      const enqueue = (action) => {
        const result = queue.catch(() => {}).then(action)
        queue = result
        return result
      }
      const rawBackend = createBackend(adapter)
      const backend = new Proxy(rawBackend, { get: (target, method) => (...args) => enqueue(() => target[method](...args)) })
      return { adapter, backend, enqueue, parseVocabularyFile, applyBackup, createVocabularyTemplate }
    })().catch((error) => {
      backendPromise = null
      throw error
    })
  }
  return backendPromise
}

const call = (method) => async (...args) => {
  const runtime = await getBackend()
  return runtime.backend[method](...args)
}

const suggestField = (headers, pattern, fallback = '') => headers.find((header) => pattern.test(header)) || fallback
const maxImportBytes = 25 * 1024 * 1024
const maxImportRows = 50000

function chooseFile(accept) {
  return new Promise((resolve) => {
    const input = document.createElement('input')
    input.type = 'file'; input.accept = accept; input.hidden = true
    let settled = false; let focusTimer
    const finish = (file) => {
      if (settled) return
      settled = true; clearTimeout(focusTimer); window.removeEventListener('focus', onFocus); input.remove(); resolve(file)
    }
    const onFocus = () => { focusTimer = window.setTimeout(() => { if (!input.files?.length) finish(null) }, 350) }
    input.addEventListener('change', () => finish(input.files?.[0] || null), { once: true })
    input.addEventListener('cancel', () => finish(null), { once: true })
    window.addEventListener('focus', onFocus)
    document.body.append(input)
    input.click()
  })
}

async function readFile(file) {
  if (file.size > maxImportBytes) throw new Error('文件最大支持 25 MB')
  return new Uint8Array(await file.arrayBuffer())
}

function token() {
  return globalThis.crypto?.randomUUID?.() || `${Date.now()}-${Math.random().toString(36).slice(2)}`
}

function safeFilename(value) {
  return String(value || 'vocabmaster-export').replace(/[\\/:*?"<>|]/g, '_').slice(0, 120)
}

async function shareFile(filename, data, base64 = false) {
  const path = safeFilename(filename)
  const file = await Filesystem.writeFile({ path, data, directory: Directory.Cache, recursive: true, ...(base64 ? {} : { encoding: Encoding.UTF8 }) })
  const result = await Share.share({ title: path, text: path, url: file.uri, dialogTitle: '分享或保存文件' })
  return result ? file.uri : null
}

function listText(value) { return Array.isArray(value) ? value.join('|') : String(value ?? '') }
function csvCell(value) {
  const text = String(value ?? '')
  return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text
}

export const capacitorApi = {
  listTags: call('listTags'),
  saveTag: call('saveTag'),
  deleteTag: call('deleteTag'),
  setWordTags: call('setWordTags'),
  setMistakeReason: call('setMistakeReason'),
  getPlanPreview: call('getPlanPreview'),
  recordDailyPlan: call('recordDailyPlan'),
  previewAlgorithm: call('previewAlgorithm'),
  getReminderDates: call('getReminderDates'),
  dashboard: call('getDashboard'),
  vocabularies: call('listVocabularies'),
  setVocabularyActive: call('setVocabularyActive'),
  deleteVocabulary: call('deleteVocabulary'),
  previewVocabularyImport: async () => {
    const file = await chooseFile('.csv,.xlsx,.xls,.json,.txt')
    if (!file) return null
    const runtime = await getBackend()
    const parsed = runtime.parseVocabularyFile(await readFile(file), file.name)
    if (parsed.rows.length > maxImportRows) throw new Error('单个词库最多支持 50,000 行')
    const id = token(); importCache.set(id, { ...parsed, filename: file.name })
    setTimeout(() => importCache.delete(id), 15 * 60 * 1000)
    return {
      token: id, filename: file.name, headers: parsed.headers, sample: parsed.rows.slice(0, 6), rowCount: parsed.rows.length,
      suggested: {
        word: suggestField(parsed.headers, /^(word|单词|英文)$/i, parsed.headers[0]),
        definition: suggestField(parsed.headers, /definition|释义|meaning|翻译/i, parsed.headers[1] || ''),
        phonetic: suggestField(parsed.headers, /phonetic|音标/i), examples: suggestField(parsed.headers, /example|例句/i),
        etymology: suggestField(parsed.headers, /etymology|词根|词源/i), synonyms: suggestField(parsed.headers, /synonym|同义/i),
        antonyms: suggestField(parsed.headers, /antonym|反义/i), frequency: suggestField(parsed.headers, /frequency|词频|优先级/i),
        roots: suggestField(parsed.headers, /^roots$|词缀|词根/i), word_family: suggestField(parsed.headers, /word_family|词族/i),
        collocations: suggestField(parsed.headers, /collocations|搭配/i), content_source: suggestField(parsed.headers, /content_source|素材来源/i), content_license: suggestField(parsed.headers, /content_license|素材许可/i)
      }
    }
  },
  commitVocabularyImport: async (payload = {}) => {
    const cached = importCache.get(payload.token)
    if (!cached) throw new Error('导入预览已过期，请重新选择文件')
    const runtime = await getBackend()
    const result = await runtime.backend.importVocabulary({ ...cached, name: payload.name, mapping: payload.mapping })
    importCache.delete(payload.token)
    return result
  },
  saveVocabularyTemplate: async (format = 'csv') => {
    const runtime = await getBackend()
    const template = runtime.createVocabularyTemplate(['csv', 'xlsx', 'json'].includes(format) ? format : 'csv')
    if (format !== 'xlsx') return shareFile(template.filename, template.content)
    const module = await import('xlsx'); const XLSX = module.utils ? module : module.default
    const workbook = XLSX.utils.book_new(); const worksheet = XLSX.utils.aoa_to_sheet([template.headers, ...template.rows])
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Vocabulary')
    const content = XLSX.write(workbook, { bookType: 'xlsx', type: 'base64' })
    return shareFile(template.filename, content, true)
  },
  exportVocabulary: async (id, format = 'json') => {
    const runtime = await getBackend(); const data = await runtime.backend.getVocabularyExport(id)
    const vocab = data.vocabulary
    const filename = safeFilename(vocab.name)
    if (format === 'csv') {
      const headers = ['word', 'phonetic', 'definition', 'examples', 'etymology', 'synonyms', 'antonyms', 'frequency', 'roots', 'word_family', 'collocations', 'content_source', 'content_license']
      const rows = data.words.map((word) => headers.map((header) => listText(word[header])))
      const content = `\uFEFF${[headers, ...rows].map((row) => row.map(csvCell).join(',')).join('\r\n')}\r\n`
      return shareFile(`${filename}.csv`, content)
    }
    return shareFile(`${filename}.json`, JSON.stringify(data, null, 2))
  },
  searchWords: call('searchWords'),
  getWord: call('getWord'),
  updateWord: call('updateWord'),
  favorites: call('listFavorites'),
  dailyPlan: call('buildPlan'),
  submitAnswer: call('submitAnswer'),
  mistakes: call('listMistakes'),
  removeMistake: call('removeMistake'),
  statistics: call('getStatistics'),
  getSettings: call('getSettings'),
  saveSettings: call('setSettings'),
  exportBackup: async () => {
    const runtime = await getBackend(); const data = await runtime.backend.exportBackupData()
    return shareFile(`vocabmaster-backup-${new Date().toISOString().slice(0, 10)}.json`, JSON.stringify(data, null, 2))
  },
  previewBackup: async () => {
    const file = await chooseFile('.json')
    if (!file) return null
    const bytes = await readFile(file)
    const data = JSON.parse(new TextDecoder('utf-8').decode(bytes))
    validateBackup(data)
    const id = token(); backupCache.set(id, data)
    setTimeout(() => backupCache.delete(id), 15 * 60 * 1000)
    return { token: id, filename: file.name, version: data.version, exportedAt: data.exported_at,
      vocabularies: data.vocabularies.length, words: data.words.length, records: data.learning_records?.length || 0 }
  },
  commitBackup: async (id, strategy = 'replace') => {
    const data = backupCache.get(id)
    if (!data) throw new Error('备份预览已过期，请重新选择文件')
    const runtime = await getBackend(); const result = await runtime.enqueue(() => runtime.applyBackup(runtime.adapter, data, strategy))
    backupCache.delete(id)
    return result
  },
  resetProgress: call('resetProgress')
}
