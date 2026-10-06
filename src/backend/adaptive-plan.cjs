function recommendNewWords({ limit = 20, due = 0, reviewLimit = 100, history = [] } = {}) {
  const ceiling = Math.max(0, Math.min(200, Math.round(Number(limit) || 0)))
  const samples = history.filter((day) => Number(day.planned_new) + Number(day.planned_review) > 0)
  if (!samples.length) return { quota: ceiling, completionRate: null, reason: '暂无计划历史，使用每日上限' }
  const rate = samples.reduce((sum, day) => sum + Math.min(1, (Number(day.new_words_count || 0) + Number(day.review_count || 0)) / (day.planned_new + day.planned_review)), 0) / samples.length
  const total = samples.reduce((sum, day) => sum + Number(day.total_count || 0), 0)
  const seconds = samples.reduce((sum, day) => sum + Number(day.study_time || 0), 0)
  const avgSeconds = total ? seconds / total : 0
  const capacity = Math.max(1, Number(reviewLimit) || 100)
  const loadFactor = due >= capacity ? 0 : due >= capacity / 2 ? 0.5 : 1
  const completionFactor = rate < 0.4 ? 0.25 : rate < 0.7 ? 0.5 : rate < 0.9 ? 0.75 : 1
  const timeFactor = avgSeconds > 45 ? 0.75 : 1
  const quota = Math.max(0, Math.min(ceiling, Math.floor(ceiling * completionFactor * loadFactor * timeFactor)))
  return { quota, completionRate: Math.round(rate * 100), reason: `近 ${samples.length} 天完成率 ${Math.round(rate * 100)}% · 到期 ${due} 词${avgSeconds > 45 ? ' · 单题耗时较长' : ''}` }
}

module.exports = { recommendNewWords }
