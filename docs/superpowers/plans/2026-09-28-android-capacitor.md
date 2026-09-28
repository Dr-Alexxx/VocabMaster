# Android Capacitor Adaptation — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 VocabMaster 适配为安卓应用（Capacitor 包现有 Vue 前端），先交付可安装、可完成核心学习闭环的首版 APK。

**Architecture:** 业务查询从 `electron/ipc.cjs` 抽到 `src/backend/`（纯 JS + 可移植 SQL，驱动无关适配层），Electron 与 Capacitor 共用同一份后端；前端继续只依赖 `vocabApi` 门面。安卓工程 `android/` 由 Capacitor 生成，数据层用 `@capacitor-community/sqlite`。

**Tech Stack:** Vue 3 + Vite 6、Capacitor 7、@capacitor-community/sqlite、better-sqlite3（桌面）、node:sqlite（测试）、vitest。

**Spec:** `docs/superpowers/specs/2026-09-28-android-capacitor-design.md`（计划与规格不一致以规格为准）

## Global Constraints

- 版本：versionName = `package.json` version（当前 1.0.1）；versionCode 在 `android/app/build.gradle` 单点维护
- `minSdk 26`、`targetSdk 35`（规格 §6）
- `vocabApi` 门面 23 个方法签名不变（规格 §2）；文件类方法（`previewVocabularyImport`/`commitVocabularyImport`/`saveVocabularyTemplate`/`exportVocabulary`/`exportBackup`/`previewBackup`/`commitBackup`）首版可抛「下一期支持」错误，其余必须真实现
- 备份 JSON 格式不变，桌面 ↔ 安卓互通；恢复三策略语义不变
- 响应式断点 ≥ 768px 切回桌面侧边栏布局（规格 §5）
- 现有 154 测试用例必须保持全绿；`npm test`、`npm run build:web`、`npm run build:win` 不得回归
- 电子打包配置 `package.json` `build.files` 必须新增 `src/backend/**/*`（否则 asar 内缺后端）
- 提交信息用英文祈使句；每个 Task 结束即 commit

## File Structure

| 文件 | 职责 |
| --- | --- |
| `src/backend/schema.cjs` | 建表 SQL 单一来源（自 `electron/db-schema.cjs` 迁入） |
| `src/backend/db-adapter.cjs` | `createAdapter(db)`：better-sqlite3 / node:sqlite 共同子集的 Promise 化适配（run/get/all/exec/withTransaction） |
| `src/backend/date-utils.cjs` | `localDateKey` / `addLocalDays`（自 `electron/date-utils.cjs` 迁入） |
| `src/backend/study-goal.cjs` | `daysBetween` / `planDailyNewQuota`（自 `electron/study-goal.cjs` 迁入） |
| `src/backend/backup-merge.cjs` | `applyBackup(adapter, data, strategy)`（自 `electron/backup-merge.cjs` 迁入并改适配器 API） |
| `src/backend/file-parse.cjs` | `parseVocabularyFile(bytes, filename)`（自 `electron/ipc.cjs` 迁入，TextDecoder('gb18030') 取代 iconv-lite） |
| `src/backend/service.cjs` | `createBackend(adapter, options)` → 全部非文件业务方法（读/写/计划） |
| `src/backend/index.cjs` | 汇出 `createAdapter`、`createBackend`、`schema`、`applyBackup`、`parseVocabularyFile` |
| `src/backend/seed.cjs` | `ensureSeeded(adapter, loadJson)` 首启导入内置词库 |
| `electron/ipc.cjs` | 薄层：文件对话框 + 转发 `src/backend` |
| `src/platform/capacitor-api.js` | 安卓 `vocabApi` 实现（Capacitor 插件 → backend） |
| `src/components/MobileTabs.vue` | 手机底部四 Tab |
| `scripts/backend-smoke.cjs` | 双驱动冒烟（ELECTRON_RUN_AS_NODE 下跑 better-sqlite3） |
| `scripts/copy-seed.cjs` | 构建前把 `resources/vocabularies/*.json` 拷入 `public/vocabularies/` |
| `tests/backend-read.test.js` 等 | node:sqlite 集成测试 |

---

## Phase 1 — 后端抽取（桌面不回归）

### Task 1: 迁移纯模块 + 驱动适配层

**Files:**
- Create: `src/backend/schema.cjs`、`src/backend/db-adapter.cjs`、`src/backend/date-utils.cjs`、`src/backend/study-goal.cjs`
- Delete: `electron/db-schema.cjs`、`electron/date-utils.cjs`、`electron/study-goal.cjs`
- Modify: `electron/database.cjs`（require 路径）、`electron/ipc.cjs`（require 路径）、`src/views/StatsView.vue`、`src/views/HomeView.vue`（import 路径）
- Test: `tests/date-utils.test.js`、`tests/study-goal.test.js`（require 路径）、`tests/db-adapter.test.js`（新）

**Interfaces:**
- Produces: `createAdapter(db) → { run(sql, params): Promise<{changes,lastInsertRowid}>, get(sql, params): Promise<row|undefined>, all(sql, params): Promise<row[]>, exec(sql): Promise<void>, withTransaction(fn): Promise<T> }`

- [ ] **Step 1: 写适配层失败测试**

```js
// tests/db-adapter.test.js
import { createRequire } from 'node:module'
import { describe, expect, test } from 'vitest'
const require = createRequire(import.meta.url)
const { DatabaseSync } = require('node:sqlite')
const { createAdapter } = require('../src/backend/db-adapter.cjs')
const { schema } = require('../src/backend/schema.cjs')

describe('db adapter common subset', () => {
  test('runs, gets and alls with positional params', async () => {
    const adapter = createAdapter(new DatabaseSync(':memory:'))
    await adapter.exec(schema)
    const inserted = await adapter.run("INSERT INTO vocabularies (name, type) VALUES (?, ?)", ['A', 'CET4'])
    expect(inserted.changes).toBe(1)
    expect(Number.isInteger(inserted.lastInsertRowid)).toBe(true)
    expect((await adapter.get('SELECT name FROM vocabularies WHERE id = ?', [inserted.lastInsertRowid])).name).toBe('A')
    expect(await adapter.all('SELECT * FROM vocabularies')).toHaveLength(1)
  })

  test('rolls back a failed transaction', async () => {
    const adapter = createAdapter(new DatabaseSync(':memory:'))
    await adapter.exec(schema)
    await expect(adapter.withTransaction(async () => {
      await adapter.run("INSERT INTO vocabularies (name, type) VALUES ('B', 'CET4')")
      throw new Error('boom')
    })).rejects.toThrow('boom')
    expect(await adapter.all('SELECT * FROM vocabularies')).toHaveLength(0)
  })
})
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npm test tests/db-adapter.test.js` → FAIL（`Cannot find module '../src/backend/db-adapter.cjs'`）

- [ ] **Step 3: 迁移文件并实现适配层**

`src/backend/schema.cjs`、`date-utils.cjs`、`study-goal.cjs` 内容与 `electron/` 现文件逐字节一致（仅路径变化）；`db-adapter.cjs`：

```js
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
```

随后更新引用：`electron/database.cjs` → `require('../src/backend/schema.cjs')`；`electron/ipc.cjs` 顶部三个 require 改指 `../src/backend/...`；`StatsView.vue`/`HomeView.vue` → `import { ... } from '@/backend/date-utils.cjs'`（HomeView 另引 `@/backend/study-goal.cjs`）；两个测试文件的 require 改 `../src/backend/...`；删除 `electron/` 下三个旧文件。

- [ ] **Step 4: 全绿验证**

Run: `npm test` → 全部 PASS（154+2=156 例）；`npm run build:web` → 成功

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "Extract shared backend modules with driver adapter"
```

### Task 2: 只读查询服务

**Files:**
- Create: `src/backend/service.cjs`（本任务先实现只读部分）
- Test: `tests/backend-read.test.js`

**Interfaces:**
- Consumes: `createAdapter`
- Produces: `createBackend(adapter, { todayKey = () => localDateKey(), addDaysFrom = (amount) => addLocalDays(new Date(), amount) })` 返回对象含：`getDashboard(): Promise<{due,newCount,learned,mastered,streak,weekTime,todayTotal,todayCorrect,todayTime}>`、`listVocabularies()`、`searchWords(query, filters)`、`getWord(id)`、`listFavorites()`、`listMistakes(frequentOnly)`、`getStatistics(days)`（`todayKey`/`addDaysFrom` 为注入函数，测试用固定日期）

- [ ] **Step 1: 写失败测试**（种子数据 helper + 逐方法断言）

```js
// tests/backend-read.test.js
import { createRequire } from 'node:module'
import { beforeEach, describe, expect, test } from 'vitest'
const require = createRequire(import.meta.url)
const { DatabaseSync } = require('node:sqlite')
const { createAdapter } = require('../src/backend/db-adapter.cjs')
const { schema } = require('../src/backend/schema.cjs')
const { createBackend } = require('../src/backend/service.cjs')
const { addLocalDays } = require('../src/backend/date-utils.cjs')

function seeded() {
  const adapter = createAdapter(new DatabaseSync(':memory:'))
  return adapter
}
let backend
beforeEach(async () => {
  const adapter = createAdapter(new DatabaseSync(':memory:'))
  await adapter.exec(schema)
  await adapter.run("INSERT INTO vocabularies (id, name, type, is_default, is_active) VALUES (1, 'CET-4 核心词汇', 'CET4', 1, 1)")
  await adapter.run("INSERT INTO words (id, vocabulary_id, word, definition) VALUES (10, 1, 'abandon', '[\"v. 放弃\"]')")
  backend = createBackend(adapter, { todayKey: () => '2026-09-28', addDaysFrom: (amount) => addLocalDays(new Date(2026, 8, 28), amount) })
})

describe('read-only backend', () => {
  test('reports dashboard counters', async () => {
    const dash = await backend.getDashboard()
    expect(dash.newCount).toBe(1)
    expect(dash.due).toBe(0)
  })
  test('lists vocabularies with progress', async () => {
    const rows = await backend.listVocabularies()
    expect(rows[0]).toMatchObject({ name: 'CET-4 核心词汇', total: 1, learned: 0 })
  })
  test('searches words by word and definition', async () => {
    expect(await backend.searchWords('abandon')).toHaveLength(1)
    expect(await backend.searchWords('放弃')).toHaveLength(1)
    expect(await backend.searchWords('')).toHaveLength(0)
  })
  test('gets one word with study stats', async () => {
    const word = await backend.getWord(10)
    expect(word.word).toBe('abandon')
    expect(word.study_count).toBe(0)
  })
  test('lists favorites and mistakes', async () => {
    await adapter.run("UPDATE words SET is_favorited = 1 WHERE id = 10")
    expect(await backend.listFavorites()).toHaveLength(1)
    expect(await backend.listMistakes(false)).toHaveLength(0)
  })
  test('aggregates statistics', async () => {
    const stats = await backend.getStatistics(30)
    expect(stats.vocabularies).toHaveLength(1)
    expect(stats.totals.total).toBe(0)
  })
})
```

- [ ] **Step 2: 跑测试确认失败** — `npm test tests/backend-read.test.js` → FAIL（模块不存在）；favorites 用例用 `adapter.run("UPDATE words SET is_favorited=1 WHERE id=10")` 播种（`updateWord` 在 Task 3）

- [ ] **Step 3: 实现只读方法** —— SQL 从 `electron/ipc.cjs` 对应 handler **逐字迁移**（`dashboard:get`、`vocab:list`、`words:search`、`words:get`、`words:favorites`、`mistakes:list`、`stats:get`，含 `hydrateWord`、`jsonArray`、`computeStreak` 私有 helper 一并迁入 `service.cjs`），全部经 `adapter` 异步调用；`computeStreak` 日期键用注入的 `todayKey`。

- [ ] **Step 4: 跑测试确认通过** — `npm test tests/backend-read.test.js` → PASS

- [ ] **Step 5: Commit**

```bash
git add src/backend/service.cjs tests/backend-read.test.js
git commit -m "Add read-only backend query service"
```

### Task 3: 写入服务（含 SM-2 作答事务）

**Files:**
- Modify: `src/backend/service.cjs`
- Test: `tests/backend-write.test.js`

**Interfaces:**
- Produces: `updateWord(id, updates)`、`submitAnswer(payload)`（payload 同现行 `study:answer`：`{wordId, quality, mode, timeSpent, options}`）、`removeMistake(wordId)`、`setVocabularyActive(id, active)`、`deleteVocabulary(id)`、`resetProgress()`、`getSettings()`、`setSettings(settings)`

- [ ] **Step 1: 写失败测试**

```js
// tests/backend-write.test.js（结构同 backend-read，关键用例）
test('submitAnswer schedules review and records history atomically', async () => {
  const record = await backend.submitAnswer({ wordId: 10, quality: 5, mode: 'spelling', timeSpent: 8, options: {} })
  expect(record.repetitions).toBe(1)
  expect(record.status).toBe('learning')
  expect(record.next_review_date).toBe('2026-09-29') // todayKey 2026-09-28 + interval 1
  const stats = await backend.getStatistics(30)
  expect(stats.totals.total).toBe(1)
})
test('low quality adds to mistake book with frequent flag after 3', async () => {
  for (let i = 0; i < 3; i += 1) await backend.submitAnswer({ wordId: 10, quality: 0, mode: 'choice', timeSpent: 3, options: {} })
  const [item] = await backend.listMistakes(true)
  expect(item.mistake_count).toBe(3)
  expect(item.is_frequent).toBe(1)
})
test('deleteVocabulary refuses default packs and cascades', async () => {
  await expect(backend.deleteVocabulary(1)).rejects.toThrow('系统默认词库不能删除')
})
test('resetProgress keeps words and favorites', async () => {
  await backend.submitAnswer({ wordId: 10, quality: 4, mode: 'flashcard', timeSpent: 2, options: {} })
  await backend.updateWord(10, { is_favorited: true, notes: 'n' })
  await backend.resetProgress()
  expect((await backend.getWord(10)).is_favorited).toBe(true)
  expect((await backend.getDashboard()).learned).toBe(0)
})
test('settings round-trip', async () => {
  await backend.setSettings({ theme: 'dark' })
  expect(await backend.getSettings()).toEqual({ theme: 'dark' })
})
```

- [ ] **Step 2: 跑测试确认失败**

- [ ] **Step 3: 实现** —— `study:answer` 的事务体从 `electron/ipc.cjs` 原样迁入 `submitAnswer`，包在 `adapter.withTransaction` 中；`calculateReview` 一并迁入；其余方法对应 handler 逐字迁移。

- [ ] **Step 4: 跑测试确认通过** + `npm test` 全量绿

- [ ] **Step 5: Commit** — `git commit -m "Add backend write service with atomic answer recording"`

### Task 4: 计划服务（四来源 + 目标摊派）

**Files:**
- Modify: `src/backend/service.cjs`
- Test: `tests/backend-plan.test.js`

**Interfaces:**
- Produces: `buildPlan(settings, source)` → `{ words, reviewCount, newCount, choicePool, goal }`（source ∈ `daily|mistakes|favorites|test`，与现行 `study:plan` 一致；`goal` 仅 daily 来源非空）

- [ ] **Step 1: 写失败测试**

```js
// tests/backend-plan.test.js
import { createRequire } from 'node:module'
import { beforeEach, describe, expect, test } from 'vitest'
const require = createRequire(import.meta.url)
const { DatabaseSync } = require('node:sqlite')
const { createAdapter } = require('../src/backend/db-adapter.cjs')
const { schema } = require('../src/backend/schema.cjs')
const { createBackend } = require('../src/backend/service.cjs')
const { addLocalDays } = require('../src/backend/date-utils.cjs')

let adapter, backend
beforeEach(async () => {
  adapter = createAdapter(new DatabaseSync(':memory:'))
  await adapter.exec(schema)
  await adapter.run("INSERT INTO vocabularies (id, name, type, is_default, is_active) VALUES (1, 'CET-4 核心词汇', 'CET4', 1, 1)")
  for (const [id, word] of [[10, 'abandon'], [11, 'ability'], [12, 'cloud']]) {
    await adapter.run('INSERT INTO words (id, vocabulary_id, word, definition) VALUES (?, 1, ?, ?)', [id, word, '["释义"]'])
  }
  await adapter.run("INSERT INTO learning_records (word_id, is_learned, next_review_date, status) VALUES (10, 1, '2026-09-28', 'review')")
  backend = createBackend(adapter, { todayKey: () => '2026-09-28', addDaysFrom: (amount) => addLocalDays(new Date(2026, 8, 28), amount) })
})

describe('study plan service', () => {
  test('daily plan mixes due reviews and new words', async () => {
    const plan = await backend.buildPlan({ dailyNewLimit: 2, dailyReviewLimit: 10 }, 'daily')
    expect(plan.reviewCount).toBe(1)
    expect(plan.newCount).toBe(2)
    expect(plan.words).toHaveLength(3)
  })
  test('goal deadline drives the daily quota', async () => {
    const plan = await backend.buildPlan({ dailyNewLimit: 2, dailyReviewLimit: 10, goalDeadline: '2026-10-07' }, 'daily')
    expect(plan.goal).toEqual({ quota: 1, daysLeft: 10, feasible: true })
  })
  test('mistakes and favorites sources pull from their books', async () => {
    await adapter.run("INSERT INTO mistake_book (word_id, mistake_count, last_mistake_at) VALUES (11, 2, '2026-09-27')")
    const fromMistakes = await backend.buildPlan({ dailyReviewLimit: 10 }, 'mistakes')
    expect(fromMistakes.words.map((w) => w.word)).toEqual(['ability'])
    const fromFavorites = await backend.buildPlan({ dailyReviewLimit: 10 }, 'favorites')
    expect(fromFavorites.words).toHaveLength(0)
  })
  test('test source returns up to 20 random words flagged as test', async () => {
    const plan = await backend.buildPlan({}, 'test')
    expect(plan.words).toHaveLength(3)
    expect(plan.words.every((w) => w.queue_type === 'test')).toBe(true)
  })
})
```
- [ ] **Step 2: 跑测试确认失败**
- [ ] **Step 3: 实现** —— `study:plan` handler 整体迁入，`todayKey()`/`planDailyNewQuota`/`localDateKey` 从注入与 `src/backend` 引用
- [ ] **Step 4: 跑测试确认通过** + 全量绿
- [ ] **Step 5: Commit** — `git commit -m "Add backend study plan service"`

### Task 5: 备份合并与文件解析迁入

**Files:**
- Modify: `src/backend/backup-merge.cjs`（自 electron/ 迁入，改 adapter API）、`src/backend/file-parse.cjs`（新，自 ipc.cjs 迁入）
- Modify: `tests/backup-merge.test.js`（传 adapter）
- Test: `tests/file-parse.test.js`（新）

**Interfaces:**
- Produces: `applyBackup(adapter, data, strategy) → Promise<{added, updated}>`；`parseVocabularyFile(bytes, filename) → { headers, rows }`（支持 csv/xlsx/xls/json/txt，GB18030 用 `new TextDecoder('gb18030')`，UTF-8 BOM 剥离）

- [ ] **Step 1: 调整 `tests/backup-merge.test.js` 传 `createAdapter(...)` 并新增解析测试**

```js
// tests/file-parse.test.js 关键用例
test('parses json arrays and {words} objects', () => {
  const bytes = new TextEncoder().encode(JSON.stringify([{ word: 'a', definition: 'x' }]))
  const parsed = parseVocabularyFile(bytes, 'a.json')
  expect(parsed.headers).toContain('word')
  expect(parsed.rows).toHaveLength(1)
})
test('falls back to gb18030 when utf-8 is garbled', () => {
  const bytes = Uint8Array.from(Buffer.from('word,definition\nabandon,放弃', 'gb18030'))
  const parsed = parseVocabularyFile(bytes, 'a.csv')
  expect(parsed.rows[0][1]).toBe('放弃')
})
test('reads csv headers and skips blank rows', () => {
  const bytes = new TextEncoder().encode('word,definition\nabandon,v. 放弃\n,\n')
  const parsed = parseVocabularyFile(bytes, 'a.csv')
  expect(parsed.rows).toHaveLength(1)
})
```

- [ ] **Step 2: 跑测试确认失败** → 实现（xlsx 用 `XLSX.read(bytes, { type: 'array' })`；表头探测、`listValue` 语义保持不变）→ 跑绿
- [ ] **Step 3: Commit** — `git commit -m "Move backup merge and file parsing into shared backend"`

### Task 6: 后端门面 + electron 薄层 + 双驱动冒烟 + 打包修正

**Files:**
- Create: `src/backend/index.cjs`、`scripts/backend-smoke.cjs`
- Modify: `electron/ipc.cjs`（重写为薄层）、`package.json`（`build.files` 增 `src/backend/**/*`）

**Interfaces:**
- Produces: `createBackend(adapter, options)` 完整门面；`scripts/backend-smoke.cjs` 进程退出码 0 = 双驱动通过

- [ ] **Step 1: 写 `scripts/backend-smoke.cjs`**

```js
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
```

- [ ] **Step 2: 双驱动验证**

```powershell
npm test                          # node:sqlite 驱动全绿
$env:ELECTRON_RUN_AS_NODE='1'; npx electron scripts/backend-smoke.cjs   # better-sqlite3 驱动（Electron ABI 自带 Node）
```
两行均成功 = 双驱动跑通。若 `npx electron` 报 ABI 错，改跑 `node scripts/backend-smoke.cjs` 并在验收清单记「需重建 better-sqlite3」。

- [ ] **Step 3: `electron/ipc.cjs` 重写为薄层** —— 仅保留：`dialog` 文件选择/保存、`importCache/backupCache`、把 `parseVocabularyFile` 结果交给 backend、所有业务 handler 变 `const backend = createBackend(createAdapter(getDatabase()))` 转发；`data:import-commit` 调 `applyBackup(adapter, ...)`。删除 `calculateReview` 等已迁代码。

- [ ] **Step 4: 回归** — `npm test` 全绿；`npm run build:web` 成功；`npm run build:win` 成功（asar 含 `src/backend`：解压 `release/win-unpacked/resources/app.asar` 抽查 `src/backend/service.cjs` 存在）；桌面 `npm run dev` 手工学一个词不报错。

- [ ] **Step 5: Commit** — `git commit -m "Route electron ipc through shared backend facade"`

---

## Phase 2 — 安卓首版

### Task 7: Capacitor 工程脚手架

**Files:**
- Create: `capacitor.config.json`、`android/`（生成）、`src/platform/capacitor-api.js`
- Modify: `src/services/api.js`（平台选择）、`package.json`（scripts + 依赖）

**Interfaces:**
- Produces: `capacitor.config.json` `{ appId: 'com.vocabmaster.app', appName: 'VocabMaster', webDir: 'dist' }`；`getPlatformApi() → vocabApi 实现`；npm scripts `cap:sync`、`build:android`、`build:android:release`

- [ ] **Step 1: 安装与生成**

```powershell
npm i @capacitor/core @capacitor/cli @capacitor/android
npm i @capacitor-community/sqlite @capacitor/app @capacitor/filesystem @capacitor/share @capacitor/file-picker
npx cap add android
```
`android/variables.gradle`：`minSdkVersion = 26`（Capacitor 7 默认可能为 23/24，改为 26）。

- [ ] **Step 2: `src/services/api.js` 平台选择**

```js
import { getPlatformApi } from '@/platform/platform-api.js'
const missingApi = new Proxy({}, {
  get: (_target, name) => async () => {
    throw new Error(`桌面接口 ${String(name)} 不可用，请从 Electron 启动应用`)
  }
})
export const api = window.vocabApi || getPlatformApi() || missingApi
```

`src/platform/platform-api.js`：`export function getPlatformApi() { return window.Capacitor?.isNativePlatform?.() ? capacitorApi : null }`；`capacitor-api.js` 里非文件方法全部委托 `createBackend(adapter)`，文件方法：

```js
async function unsupported(name) {
  throw new Error(`${name} 将在下一期版本支持`)
}
previewVocabularyImport: () => unsupported('词库导入'),
commitVocabularyImport: () => unsupported('词库导入'),
saveVocabularyTemplate: () => unsupported('模板下载'),
exportVocabulary: () => unsupported('词库导出'),
exportBackup: () => unsupported('备份导出'),
previewBackup: () => unsupported('备份恢复'),
commitBackup: () => unsupported('备份恢复'),
```
其余16个方法签名与返回结构与桌面一致。SQLite 初始化：

```js
import { CapacitorSQLite, SQLiteConnection } from '@capacitor-community/sqlite'
const sqlite = new SQLiteConnection(CapacitorSQLite)
// createConnection('vocabmaster', false, 'no-encryption', 1, false) → open → ensure schema → createAdapter(connection)
```
（插件 API 细节按实现时所装版本的类型定义核对：`run(sql, values)`→`{changes,lastId}`、`query(sql, values)`→`{values}`、`execute(sql)`；`createAdapter` 的 Capacitor 分支就按此映射。）

- [ ] **Step 3: scripts**：`"cap:sync": "vite build && cap sync android"`、`"build:android": "cap:sync && cd android && gradlew assembleDebug"`、`"build:android:release": "cap:sync && cd android && gradlew assembleRelease"`（Windows 用 `.\gradlew.bat`，写成 `cd android && .\\gradlew.bat ...`）。

- [ ] **Step 4: 验证** — `npm run build:web` 不破；`npx cap sync android` 成功；`npm run build:android` 产出 `android/app/build/outputs/apk/debug/app-debug.apk`（首版可先无 seed 空库跑通安装）。

- [ ] **Step 5: Commit** — `git commit -m "Scaffold Capacitor android app with shared backend"`

### Task 8: 首启内置词库 seed

**Files:**
- Create: `src/backend/seed.cjs`、`scripts/copy-seed.cjs`、`tests/seed.test.js`
- Modify: `src/platform/capacitor-api.js`（启动时 ensureSeeded）、`package.json`（`cap:sync` 前跑 copy-seed）、`.gitignore`（`public/vocabularies/`）

**Interfaces:**
- Produces: `ensureSeeded(adapter, loadJson) → Promise<{ seeded: boolean, words: number }>`；`loadJson(name)` 返回 `resources/vocabularies/<name>` 的 JSON 数组

- [ ] **Step 1: 写失败测试**（注入假 `loadJson` 返回 `[{ word: 'a', definition: ['x'] }]`，断言首跑写入 `vocabularies`+`words`，二跑 `seeded:false` 不重复）

```js
test('seeds default packs once', async () => {
  const loadJson = async () => [{ word: 'a', definition: ['x'] }]
  const first = await ensureSeeded(adapter, loadJson)
  expect(first).toMatchObject({ seeded: true, words: 1 })
  const second = await ensureSeeded(adapter, loadJson)
  expect(second.seeded).toBe(false)
  expect(await adapter.all('SELECT * FROM words')).toHaveLength(1)
})
```

- [ ] **Step 2: 跑失败 → 实现**（`seed.cjs` 检查 `SELECT COUNT(*) FROM vocabularies` 为 0 才导入四个包 `cet4.json/cet6.json/ielts.json/toefl.json`，`is_default=1`、`is_active` 仅 cet4=1，与 `electron/database.cjs` seed 语义一致）→ 跑绿
- [ ] **Step 3: `scripts/copy-seed.cjs`**：把 `resources/vocabularies/*.json` 复制到 `public/vocabularies/`；`cap:sync` 链改为 `node scripts/copy-seed.cjs && vite build && cap sync android`；`capacitor-api.js` 启动时 `loadJson = async (name) => (await fetch(`vocabularies/${name}`)).json()`。
- [ ] **Step 4: 验证** — 装 APK 首启后词库页显示四个内置词库、词数 2000/2500/3000/3500；`npm test` 全绿。
- [ ] **Step 5: Commit** — `git commit -m "Seed bundled vocabularies on first launch"`

### Task 9: 移动壳（四 Tab + 断点回退侧边栏）

**Files:**
- Create: `src/components/MobileTabs.vue`
- Modify: `src/App.vue`、`src/assets/styles/global.css`

**Interfaces:**
- Produces: `<MobileTabs>`（路由 `/`、`/study`、`/stats`、`/settings` 对应 今日/学习/统计/我的，激活态 `router-link-active`）；CSS 断点规则

- [ ] **Step 1: `MobileTabs.vue`**

```vue
<template>
  <nav class="mobile-tabs" aria-label="主导航">
    <RouterLink v-for="item in items" :key="item.to" :to="item.to">
      <component :is="item.icon" :size="20" />
      <span>{{ item.label }}</span>
    </RouterLink>
  </nav>
</template>

<script setup>
import { BookOpen, ChartNoAxesCombined, Home, Settings } from 'lucide-vue-next'
const items = [
  { to: '/', label: '今日', icon: Home },
  { to: '/study', label: '学习', icon: BookOpen },
  { to: '/stats', label: '统计', icon: ChartNoAxesCombined },
  { to: '/settings', label: '我的', icon: Settings }
]
</script>
```
- [ ] **Step 2: `App.vue`** — 挂载 `<MobileTabs />`；`global.css` 追加：

```css
.mobile-tabs { display: none; }
@media (max-width: 767.98px) {
  .sidebar { display: none; }
  .mobile-tabs { display: flex; position: fixed; left: 0; right: 0; bottom: 0; z-index: 30;
    padding-bottom: env(safe-area-inset-bottom); background: var(--surface); border-top: 1px solid var(--border); }
  .mobile-tabs a { flex: 1; display: grid; justify-items: center; gap: 2px; padding: 8px 0 6px; font-size: 11px; color: var(--text-soft); text-decoration: none; }
  .mobile-tabs a.router-link-active { color: var(--primary); font-weight: 650; }
  .app-main, .page { padding-bottom: calc(64px + env(safe-area-inset-bottom)); }
}
@media (min-width: 768px) { .mobile-tabs { display: none; } }
```

- [ ] **Step 3: 验证** — 浏览器 DevTools 375px 宽出现底部 Tab、无侧边栏；≥768px 恢复侧边栏；`npm run build:web` 成功。
- [ ] **Step 4: Commit** — `git commit -m "Add mobile tab shell with 768px sidebar fallback"`

### Task 10: 学习页触屏适配（卡片内嵌操作）

**Files:**
- Modify: `src/views/StudyView.vue`、`src/assets/styles/global.css`

- [ ] **Step 1: 卡片内嵌操作** — 发音按钮随词（沿用 `speak-btn`/`speak-word`）；收藏/跳过移入各模式卡片底部一行，`<768px` 生效：

```html
<!-- StudyView.vue：把现有 .study-actions 移进每个 study-card 末尾，样式补一条断点规则 -->
```
```css
@media (max-width: 767.98px) {
  .study-card .study-actions { display: flex; gap: 8px; margin-top: 14px; }
  .study-card .study-actions .text-btn { flex: 1; min-height: 44px; border: 1px solid var(--border); border-radius: 8px; }
  .next-panel .primary-btn, .reveal-btn { width: 100%; min-height: 48px; }
}
```

- [ ] **Step 2: 自评两行大按钮**

```css
@media (max-width: 767.98px) {
  .ratings { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .ratings button { min-height: 52px; }
}
```

- [ ] **Step 3: 拼写输入不被键盘遮挡** — `StudyView.vue` 增加：

```js
import { onMounted, onBeforeUnmount } from 'vue'
function syncViewport() {
  const offset = window.visualViewport
    ? Math.max(0, window.innerHeight - window.visualViewport.height - window.visualViewport.offsetTop)
    : 0
  document.documentElement.style.setProperty('--keyboard-offset', `${offset}px`)
}
onMounted(() => window.visualViewport?.addEventListener('resize', syncViewport))
onBeforeUnmount(() => window.visualViewport?.removeEventListener('resize', syncViewport))
```
```css
@media (max-width: 767.98px) {
  .study-stage { padding-bottom: calc(var(--keyboard-offset, 0px) + 16px); }
}
```
- [ ] **Step 4: 验证** — 375px 模拟视口全流程（卡片翻页 0–5、拼写 Enter 两段、选择 A–D、点词朗读、揭晓朗读）可用；`npm run build:web` 成功。
- [ ] **Step 5: Commit** — `git commit -m "Adapt study screen for touch layouts"`

### Task 11: 签名、发布打包与文档

**Files:**
- Modify: `android/app/build.gradle`（signingConfigs）、`package.json`（`pack:apk`）、`README.md`、`.gitignore`
- Create: `android/keystore/`（本地，不入库）、`keystore.properties`（本地，不入库）

- [ ] **Step 1: 生成自签 keystore**（一次性，密码记录到 `android/keystore.properties`，两路径进 `.gitignore`）：

```powershell
keytool -genkeypair -v -keystore android/keystore/vocabmaster.keystore -alias vocabmaster -keyalg RSA -keysize 2048 -validity 10000
```

- [ ] **Step 2: `android/app/build.gradle` 版本与签名**（versionName 读根 `package.json`；keystore 缺失时回退 debug 签名并打印提示，保证他人克隆不炸）：

```groovy
def rootPkg = new groovy.json.JsonSlurper().parse(file("${rootDir}/../package.json"))
android {
  defaultConfig {
    versionName rootPkg.version
    versionCode 10100   // 单点维护：1*10000 + minor*100 + patch
    minSdkVersion 26
    targetSdkVersion 35
  }
  signingConfigs {
    release {
      def props = new Properties()
      def propsFile = file("${projectDir}/../keystore.properties")
      if (propsFile.exists()) {
        props.load(new FileInputStream(propsFile))
        storeFile file("${projectDir}/../android/keystore/vocabmaster.keystore")
        storePassword props['storePassword']
        keyAlias props['keyAlias']
        keyPassword props['keyPassword']
      }
    }
  }
  buildTypes {
    release {
      signingConfig signingConfigs.release.storeFile != null ? signingConfigs.release : signingConfigs.debug
    }
  }
}
```
- [ ] **Step 3: `pack:apk`**：`node scripts/pack-apk.cjs`——把 `android/app/build/outputs/apk/release/app-release.apk` 拷为 `release/VocabMaster-<version>-android.apk`（同 `pack-zip.cjs` 模式）。
- [ ] **Step 4: README 更新**：新增「安卓构建」小节（`npm run build:android`、`build:android:release`、`pack:apk`、产物名）；主要功能注明安卓支持与下一期范围（导入导出/备份恢复）。
- [ ] **Step 5: 验证** — `npm run build:android:release && npm run pack:apk` 出 `release/VocabMaster-1.0.1-android.apk`；真机安装成功。
- [ ] **Step 6: Commit** — `git commit -m "Add android signing, release packaging and docs"`

### Task 12: 封版回归

- [ ] **Step 1: 自动化** — `npm test` 全绿；`npm run build:web`、`npm run build:win` 成功；`npm run build:android:release` 成功。
- [ ] **Step 2: 手工清单**（模拟器 + 真机）：首启 seed → 卡片/拼写/选择/混合/测试全流程 → 学习目标摊派 → 揭晓自动朗读/点词反复跟读 → 错题本卡片流 → 统计页 → 平板横竖屏（≥768px 回侧边栏）→ 桌面端回归学一个词。**文件导入导出/备份互通属下一期，此版标注「即将支持」即为通过。**
- [ ] **Step 3: Commit** — `git commit -m "Record android first-pass acceptance results"`（更新 README 验收状态或清单文件）
