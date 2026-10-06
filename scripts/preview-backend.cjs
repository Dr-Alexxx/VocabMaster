const { DatabaseSync } = require('node:sqlite')
const fs = require('node:fs/promises')
const path = require('node:path')
const { createAdapter } = require('../src/backend/db-adapter.cjs')
const { createBackend } = require('../src/backend/service.cjs')
const { migrateDatabase } = require('../src/backend/migrations.cjs')
const { ensureSeeded } = require('../src/backend/seed.cjs')

function previewBackendPlugin() {
  return {
    name: 'isolated-preview-backend', apply: 'serve',
    async configureServer(server) {
      if (server.config.mode !== 'preview') return
      const db = new DatabaseSync(':memory:'); const adapter = createAdapter(db)
      await migrateDatabase(adapter)
      await ensureSeeded(adapter, async (name) => JSON.parse(await fs.readFile(path.join(__dirname,'../resources/vocabularies',name),'utf8')))
      const backend = createBackend(adapter)
      await backend.setSettings({ onboardingComplete:true, dailyNewLimit:5, dailyReviewLimit:100, theme:'light' })
      let queue = Promise.resolve()
      server.middlewares.use('/preview-api', (req,res) => {
        if (req.method !== 'POST') { res.statusCode=405; res.end(); return }
        const method = String(req.url || '').slice(1).split('?')[0]
        if (!Object.hasOwn(backend,method)) { res.statusCode=404; res.end(); return }
        let body = ''
        req.on('data', (chunk) => { body += chunk; if (body.length > 1048576) req.destroy() })
        req.on('end', () => {
          queue = queue.catch(() => {}).then(async () => {
            res.setHeader('Content-Type','application/json')
            try { const args = JSON.parse(body || '[]'); if (!Array.isArray(args)) throw new Error('Invalid arguments'); res.end(JSON.stringify({ value:await backend[method](...args) })) }
            catch (error) { res.statusCode=400; res.end(JSON.stringify({ error:error.message })) }
          })
        })
      })
      server.httpServer?.on('close', () => db.close())
    }
  }
}
module.exports = { previewBackendPlugin }
