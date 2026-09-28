const Database = require('better-sqlite3')
const { createAdapter } = require('../src/backend/db-adapter.cjs')
const { schema } = require('../src/backend/schema.cjs')
const { createBackend } = require('../src/backend/service.cjs')

async function main() {
  const adapter = createAdapter(new Database(':memory:'))
  await adapter.exec(schema)
  const backend = createBackend(adapter, {})
  await backend.setSettings({ theme: 'light' })
  const saved = await backend.getSettings()
  if (saved.theme !== 'light') throw new Error('settings round-trip failed')
  const plan = await backend.buildPlan({ dailyNewLimit: 5 }, 'daily')
  if (!Array.isArray(plan.words)) throw new Error('plan failed')
  console.log('backend smoke OK (better-sqlite3 driver)')
}
main().catch((error) => { console.error(error); process.exit(1) })
