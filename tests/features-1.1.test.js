import { createRequire } from 'node:module'
import { beforeEach, describe, expect, test } from 'vitest'
const require = createRequire(import.meta.url)
const { DatabaseSync } = require('node:sqlite')
const { createAdapter } = require('../src/backend/db-adapter.cjs')
const { schema } = require('../src/backend/schema.cjs')
const { createBackend } = require('../src/backend/service.cjs')
const { applyBackup } = require('../src/backend/backup-merge.cjs')
const { migrateDatabase, migrateDatabaseSync } = require('../src/backend/migrations.cjs')
const { recommendNewWords } = require('../src/backend/adaptive-plan.cjs')
const { buildReminders } = require('../src/backend/reminder-plan.cjs')
const { fsrs, createEmptyCard, Rating } = require('ts-fsrs')
const { scheduleFsrs } = require('../src/backend/fsrs-scheduler.cjs')

let db, adapter, backend
beforeEach(async () => {
  db = new DatabaseSync(':memory:'); adapter = createAdapter(db); await adapter.exec(schema)
  await adapter.run("INSERT INTO vocabularies (id,name,type) VALUES (1,'Test','CUSTOM')")
  for (let id = 1; id <= 30; id++) await adapter.run('INSERT INTO words (id,vocabulary_id,word,definition) VALUES (?,1,?,?)', [id, `word${id}`, '["释义"]'])
  backend = createBackend(adapter, { todayKey: () => '2026-10-06', addDaysFrom: (n) => `2026-10-${String(6+n).padStart(2,'0')}` })
})

describe('1.1 migration and organization', () => {
  test('migrates legacy columns twice without losing records, with both adapters', async () => {
    const legacy = new DatabaseSync(':memory:')
    const oldSchema = schema.replace(/    (roots|word_family|collocations|content_source|content_license|algorithm|algorithm_version|algorithm_params|mistake_reason|fsrs_card|sm2_snapshot) .*\n/g, '')
    legacy.exec(oldSchema)
    legacy.prepare("INSERT INTO vocabularies (id,name,type) VALUES (1,'Legacy','CUSTOM')").run()
    legacy.prepare("INSERT INTO words (id,vocabulary_id,word) VALUES (1,1,'old')").run()
    migrateDatabaseSync(legacy)
    await migrateDatabase(createAdapter(legacy)); await migrateDatabase(createAdapter(legacy))
    expect(legacy.prepare('PRAGMA user_version').get().user_version).toBe(3)
    expect(legacy.prepare('SELECT word,word_family FROM words').get()).toEqual({ word:'old', word_family:'[]' })
  })
  test('tag create, rename, filtering and delete retain vocabulary and learning history', async () => {
    const tag = await backend.saveTag('考试')
    await backend.setWordTags(1, [tag]); await backend.saveTag('重点', tag)
    expect((await backend.listFavorites(tag)).map((w) => w.id)).toEqual([1])
    expect((await backend.buildPlan({ tagId: tag }, 'tag')).words.map((w) => w.id)).toEqual([1])
    await expect(backend.setWordTags(1, [999])).rejects.toThrow('标签不存在')
    expect((await backend.getWord(1)).tags).toHaveLength(1)
    await backend.deleteTag(tag)
    expect(await backend.getWord(1)).toBeDefined()
    expect((await backend.listTags())).toHaveLength(0)
  })
  test('reasons attach only to wrong answers and appear in statistics', async () => {
    const wrong = await backend.submitAnswer({ wordId:1, quality:0, mode:'spelling' })
    const correct = await backend.submitAnswer({ wordId:2, quality:5, mode:'spelling' })
    await backend.setMistakeReason(wrong.historyId, 'spelling'); await backend.setMistakeReason(correct.historyId, 'careless')
    expect((await backend.getStatistics('all')).reasons).toEqual([{ reason:'spelling', total:1 }])
    expect((await backend.getWord(1)).mistakeHistory[0].mistake_reason).toBe('spelling')
    expect((await backend.buildPlan({ mistakeReason:'spelling' },'mistakes')).words.map((word) => word.id)).toEqual([1])
    expect((await backend.buildPlan({ mistakeReason:'meaning' },'mistakes')).words).toEqual([])
    await expect(backend.setMistakeReason(wrong.historyId,'invalid')).rejects.toThrow('未知错题原因')
  })
  test.each(['replace','merge','skip'])('backup %s preserves tags, reasons and FSRS state after id remapping', async (strategy) => {
    const tag = await backend.saveTag('重点'); await backend.setWordTags(1,[tag])
    const answer = await backend.submitAnswer({ wordId:1, quality:0, options:{ algorithm:'fsrs' } })
    await backend.setMistakeReason(answer.historyId,'meaning')
    const backup = await backend.exportBackupData()
    const targetDb = new DatabaseSync(':memory:'); targetDb.exec(schema)
    const target = createAdapter(targetDb)
    if (strategy !== 'replace') {
      await target.run("INSERT INTO vocabularies (id,name,type) VALUES (99,'Test','CUSTOM')")
      await target.run("INSERT INTO words (id,vocabulary_id,word) VALUES (99,99,'word1')")
    }
    await applyBackup(target,backup,strategy)
    const targetBackend = createBackend(target)
    const targetId = strategy === 'replace' ? 1 : 99
    expect((await targetBackend.getWord(targetId)).tags[0].name).toBe('重点')
    expect((await targetBackend.getWord(targetId)).mistakeHistory[0].mistake_reason).toBe('meaning')
    expect((await target.get('SELECT algorithm,fsrs_card FROM learning_records WHERE word_id=?',[targetId])).algorithm).toBe('fsrs')
    expect(await target.all('PRAGMA foreign_key_check')).toEqual([])
  })
  test('bad backup rolls back without deleting local words', async () => {
    const backup = await backend.exportBackupData(); backup.word_tags = [{ word_id:999, tag_id:999 }]
    await expect(applyBackup(adapter,backup,'replace')).rejects.toThrow('关联数据不完整')
    expect((await backend.listVocabularies())[0].total).toBe(30)
  })
})

describe('adaptive workload and FSRS', () => {
  test('fixed daily cap subtracts finished new words and respects deadline upper bound', async () => {
    await backend.submitAnswer({ wordId:1, quality:5 })
    const preview = await backend.getPlanPreview({ dailyNewLimit:3, goalDeadline:'2026-10-06' })
    expect(preview.newCount).toBe(2); expect(preview.deadlineFeasible).toBe(false)
    expect((await backend.buildPlan({ dailyNewLimit:3 },'daily')).newCount).toBe(2)
  })
  test('missed days after the first planned day lower the recommendation', async () => {
    await adapter.run("INSERT INTO daily_plans (date,planned_new,planned_review) VALUES ('2026-10-01',20,0)")
    const preview = await backend.getPlanPreview({ dailyNewLimit:20, adaptivePlan:true })
    expect(preview.newCount).toBe(5); expect(preview.adaptive.completionRate).toBe(0)
    expect((await backend.getPlanPreview({ dailyNewLimit:20, adaptivePlan:false })).newCount).toBe(20)
  })
  test('backlog lowers new words and no history preserves the initial cap', () => {
    expect(recommendNewWords({ limit:10 }).quota).toBe(10)
    const history = [{ planned_new:10, planned_review:0, total_count:10, new_words_count:10 }]
    expect(recommendNewWords({ limit:10, due:100, reviewLimit:100, history }).quota).toBe(0)
  })
  test('FSRS matches the upstream scheduler for a new card', () => {
    const now = new Date('2026-10-06T12:00:00')
    const result = scheduleFsrs({},4,{},now)
    const upstream = fsrs({ request_retention:0.9, maximum_interval:3650, enable_fuzz:false, enable_short_term:false }).next(createEmptyCard(now),now,Rating.Good)
    expect(JSON.parse(result.fsrs_card).stability).toBe(upstream.card.stability)
    expect(result.interval).toBe(upstream.card.scheduled_days)
  })
  test('algorithm preview is read-only and switching back retains SM-2 state and history', async () => {
    await backend.submitAnswer({ wordId:1, quality:5 })
    const before = await adapter.get('SELECT * FROM learning_records WHERE word_id=1')
    await backend.previewAlgorithm({ fsrsRetention:0.9 })
    expect(await adapter.get('SELECT * FROM learning_records WHERE word_id=1')).toEqual(before)
    await backend.submitAnswer({ wordId:1, quality:0, options:{ algorithm:'fsrs' } })
    const restored = await backend.submitAnswer({ wordId:1, quality:5, options:{ algorithm:'sm2' } })
    expect(restored.interval).toBe(6)
    expect(restored.algorithm).toBe('sm2'); expect(restored.fsrs_card).toBe(null)
    expect((await adapter.all('SELECT * FROM study_history WHERE word_id=1'))).toHaveLength(3)
  })
})

describe('local notification scheduling', () => {
  const settings = { reminderEnabled:true, reminderTime:'19:00', reminderQuietEnabled:true, reminderQuietStart:'22:00', reminderQuietEnd:'08:00' }
  test('only schedules due vocabulary, future times and allowed weekdays', () => {
    const now = new Date(2026,9,6,20)
    const reminders = buildReminders({ ...settings, reminderWeekdaysOnly:true },[{ date:'2026-10-08', count:5 }],now)
    expect(reminders.length).toBeGreaterThan(0)
    expect(reminders.every((item) => item.date >= '2026-10-08' && ![0,6].includes(new Date(item.at).getDay()))).toBe(true)
    expect(buildReminders(settings,[],now)).toEqual([])
    expect(buildReminders({ ...settings, reminderEnabled:false },[{ date:'2026-10-01',count:1 }],now)).toEqual([])
  })
  test('quiet hours spanning midnight suppress the chosen reminder time', () => {
    expect(buildReminders({ ...settings, reminderTime:'23:00' },[{ date:'2026-10-01',count:1 }],new Date(2026,9,6))).toEqual([])
  })
})
