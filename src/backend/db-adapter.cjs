function createAdapter(db) {
  const adapter = {
    run: async (sql, params = []) => {
      const result = db.prepare(sql).run(...params)
      return { changes: Number(result.changes), lastInsertRowid: Number(result.lastInsertRowid) }
    },
    get: async (sql, params = []) => db.prepare(sql).get(...params),
    all: async (sql, params = []) => db.prepare(sql).all(...params),
    exec: async (sql) => { db.exec(sql) },
    withTransaction: async (fn) => {
      db.exec('BEGIN')
      try {
        const value = await fn(adapter)
        db.exec('COMMIT')
        return value
      } catch (error) {
        db.exec('ROLLBACK')
        throw error
      }
    }
  }
  return adapter
}
module.exports = { createAdapter }
