import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite'

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
    exec: async (sql) => { await connection.execute(sql) },
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

function getBackend() {
  if (!backendPromise) {
    backendPromise = (async () => {
      const { createBackend, schema } = await import('@/backend/index.cjs')
      const connection = await sqlite.createConnection('vocabmaster', false, 'no-encryption', 1, false)
      await connection.open()
      await connection.execute(schema)
      return createBackend(createCapacitorAdapter(connection))
    })()
  }
  return backendPromise
}

const call = (method) => async (...args) => {
  const backend = await getBackend()
  return backend[method](...args)
}

async function unsupported(name) {
  throw new Error(`${name} 将在下一期版本支持`)
}

export const capacitorApi = {
  dashboard: call('getDashboard'),
  vocabularies: call('listVocabularies'),
  setVocabularyActive: call('setVocabularyActive'),
  deleteVocabulary: call('deleteVocabulary'),
  previewVocabularyImport: () => unsupported('词库导入'),
  commitVocabularyImport: () => unsupported('词库导入'),
  saveVocabularyTemplate: () => unsupported('模板下载'),
  exportVocabulary: () => unsupported('词库导出'),
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
  exportBackup: () => unsupported('备份导出'),
  previewBackup: () => unsupported('备份恢复'),
  commitBackup: () => unsupported('备份恢复'),
  resetProgress: call('resetProgress')
}
