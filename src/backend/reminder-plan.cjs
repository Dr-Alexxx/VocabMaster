const { localDateKey } = require('./date-utils.cjs')
const timePattern = /^([01]\d|2[0-3]):[0-5]\d$/

function inQuietHours(date, start = '22:00', end = '08:00') {
  if (!timePattern.test(start) || !timePattern.test(end) || start === end) return false
  const value = date.getHours() * 60 + date.getMinutes()
  const minutes = (time) => Number(time.slice(0, 2)) * 60 + Number(time.slice(3))
  const left = minutes(start); const right = minutes(end)
  return left < right ? value >= left && value < right : value >= left || value < right
}

function buildReminders(settings, dueDates = [], now = new Date()) {
  if (!settings.reminderEnabled) return []
  const time = timePattern.test(settings.reminderTime) ? settings.reminderTime : '19:00'
  const result = []
  for (let offset = 0; offset < 14; offset += 1) {
    const date = new Date(now)
    date.setDate(date.getDate() + offset)
    date.setHours(Number(time.slice(0, 2)), Number(time.slice(3)), 0, 0)
    if (date <= now || (settings.reminderWeekdaysOnly && [0, 6].includes(date.getDay()))) continue
    if (settings.reminderQuietEnabled && inQuietHours(date, settings.reminderQuietStart, settings.reminderQuietEnd)) continue
    const key = localDateKey(date)
    const count = dueDates.reduce((sum, row) => sum + (row.date <= key ? Number(row.count) : 0), 0)
    if (count > 0) result.push({ id: 120000 + offset, at: date.toISOString(), date: key, count })
  }
  return result
}

module.exports = { buildReminders, inQuietHours }
