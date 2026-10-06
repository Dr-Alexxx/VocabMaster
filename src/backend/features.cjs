const { recommendNewWords } = require('./adaptive-plan.cjs')
const { planDailyNewQuota } = require('./study-goal.cjs')
const { addLocalDays } = require('./date-utils.cjs')
const mistakeReasons = ['spelling', 'meaning', 'listening', 'careless', 'other']

function createFeatures(adapter, todayKey) {
  async function listTags() {
    return adapter.all(`SELECT t.*, COUNT(wt.word_id) word_count FROM tags t
      LEFT JOIN word_tags wt ON wt.tag_id = t.id GROUP BY t.id ORDER BY t.name`)
  }
  async function saveTag(name, id = null) {
    const value = String(name || '').trim()
    if (!value || value.length > 40) throw new Error('标签名称需要 1–40 个字符')
    const duplicate = await adapter.get('SELECT id FROM tags WHERE name = ? COLLATE NOCASE', [value])
    if (duplicate && duplicate.id !== Number(id)) throw new Error('标签名称已存在')
    if (id != null) { await adapter.run('UPDATE tags SET name = ? WHERE id = ?', [value, Number(id)]); return Number(id) }
    const result = await adapter.run('INSERT INTO tags (name) VALUES (?)', [value])
    return result.lastInsertRowid
  }
  async function deleteTag(id) {
    await adapter.withTransaction(async () => {
      await adapter.run('DELETE FROM word_tags WHERE tag_id = ?', [Number(id)])
      await adapter.run('DELETE FROM tags WHERE id = ?', [Number(id)])
    })
    return true
  }
  async function setWordTags(wordId, tagIds = []) {
    if (!Array.isArray(tagIds) || tagIds.length > 100) throw new Error('标签列表无效')
    await adapter.withTransaction(async () => {
      if (!await adapter.get('SELECT id FROM words WHERE id = ?', [Number(wordId)])) throw new Error('单词不存在')
      await adapter.run('DELETE FROM word_tags WHERE word_id = ?', [Number(wordId)])
      for (const tagId of new Set(tagIds.map(Number))) {
        if (!await adapter.get('SELECT id FROM tags WHERE id = ?', [tagId])) throw new Error('标签不存在')
        await adapter.run('INSERT INTO word_tags (word_id, tag_id) VALUES (?, ?)', [Number(wordId), tagId])
      }
    })
    return true
  }
  async function setMistakeReason(historyId, reason = '') {
    if (reason && !mistakeReasons.includes(reason)) throw new Error('未知错题原因')
    await adapter.run('UPDATE study_history SET mistake_reason = ? WHERE id = ? AND is_correct = 0', [reason, Number(historyId)])
    return true
  }
  async function getReminderDates() {
    return adapter.all(`SELECT lr.next_review_date date, COUNT(*) count FROM learning_records lr
      JOIN words w ON w.id = lr.word_id JOIN vocabularies v ON v.id = w.vocabulary_id
      WHERE v.is_active = 1 AND lr.is_learned = 1 AND lr.next_review_date IS NOT NULL
      GROUP BY lr.next_review_date ORDER BY lr.next_review_date`)
  }
  async function getPlanPreview(settings = {}) {
    const today = todayKey()
    const due = (await adapter.get(`SELECT COUNT(*) count FROM learning_records lr
      JOIN words w ON w.id = lr.word_id JOIN vocabularies v ON v.id = w.vocabulary_id
      WHERE v.is_active = 1 AND lr.is_learned = 1 AND lr.next_review_date <= ?`, [today])).count
    const remaining = (await adapter.get(`SELECT COUNT(DISTINCT lower(w.word)) count FROM words w
      JOIN vocabularies v ON v.id = w.vocabulary_id LEFT JOIN learning_records lr ON lr.word_id = w.id
      WHERE v.is_active = 1 AND COALESCE(lr.is_learned,0) = 0 ${settings.enableCrossVocabDedup === false ? '' : `AND NOT EXISTS (
        SELECT 1 FROM words same JOIN learning_records known ON known.word_id = same.id WHERE lower(same.word) = lower(w.word) AND known.is_learned = 1)`}`)).count
    const limit = Math.max(0, Math.min(200, Math.round(Number(settings.dailyNewLimit ?? 20))))
    const reviewLimit = Math.max(0, Math.min(500, Math.round(Number(settings.dailyReviewLimit ?? 100))))
    const recordedHistory = await adapter.all(`SELECT p.*, COALESCE(s.new_words_count,0) new_words_count,
      COALESCE(s.review_count,0) review_count, COALESCE(s.total_count,0) total_count, COALESCE(s.study_time,0) study_time
      FROM daily_plans p LEFT JOIN daily_statistics s ON s.date = p.date WHERE p.date >= ? AND p.date < ? ORDER BY p.date`,
    [addLocalDays(new Date(`${today}T12:00:00`), -7), today])
    const lastEarlierPlan = await adapter.get('SELECT * FROM daily_plans WHERE date < ? ORDER BY date DESC LIMIT 1', [addLocalDays(new Date(`${today}T12:00:00`), -7)])
    const history = []; let previous = lastEarlierPlan
    for (let offset = 7; offset >= 1; offset -= 1) {
      const date = addLocalDays(new Date(`${today}T12:00:00`), -offset)
      const recorded = recordedHistory.find((row) => row.date === date)
      if (recorded) previous = recorded
      if (recorded) history.push(recorded)
      else if (previous) history.push({ date, planned_new: previous.planned_new, planned_review: previous.planned_review, new_words_count: 0, review_count: 0, total_count: 0, study_time: 0 })
    }
    const adaptive = settings.adaptivePlan ? recommendNewWords({ limit, due, reviewLimit, history }) : { quota: limit, reason: '使用固定每日上限', completionRate: null }
    const todayStats = await adapter.get('SELECT * FROM daily_statistics WHERE date = ?', [today]) || {}
    const learnedToday = Number(todayStats.new_words_count || 0)
    const goal = planDailyNewQuota({ remainingWords: remaining + learnedToday, deadlineKey: settings.goalDeadline || null, todayKey: today, baseLimit: limit, maxLimit: Math.max(1, limit) })
    const idealQuota = settings.goalDeadline ? goal.quota : limit
    const quota = Math.min(limit, adaptive.quota, idealQuota)
    const requested = settings.newWordOverride == null ? quota : Math.max(0, Math.min(limit, Math.round(Number(settings.newWordOverride) || 0)))
    const newCount = Math.min(remaining, Math.max(0, requested - learnedToday))
    const reviewCount = Math.min(due, Math.max(0, reviewLimit - Number(todayStats.review_count || 0)))
    return { due, remaining, newCount, reviewCount, dailyQuota: requested, learnedToday, goal, adaptive,
      reason: adaptive.reason, deadlineFeasible: !settings.goalDeadline || (goal.feasible && quota >= goal.quota) }
  }
  async function recordDailyPlan(settings = {}) {
    const preview = await getPlanPreview(settings)
    await adapter.run(`INSERT INTO daily_plans (date, planned_new, planned_review) VALUES (?, ?, ?)
      ON CONFLICT(date) DO NOTHING`, [todayKey(), preview.dailyQuota, preview.reviewCount])
    return preview
  }
  return { listTags, saveTag, deleteTag, setWordTags, setMistakeReason, getReminderDates, getPlanPreview, recordDailyPlan }
}

module.exports = { createFeatures, mistakeReasons }
