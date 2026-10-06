const { Notification, ipcMain, shell, powerMonitor } = require('electron')
const { createBackend } = require('../src/backend/service.cjs')
const { createAdapter } = require('../src/backend/db-adapter.cjs')
const { localDateKey } = require('../src/backend/date-utils.cjs')
const { inQuietHours } = require('../src/backend/reminder-plan.cjs')

function registerReminders(getDatabase, showToday) {
  let busy = false
  async function check() {
    if (busy || !Notification.isSupported()) return
    busy = true
    try {
      const adapter = createAdapter(getDatabase()); const backend = createBackend(adapter)
      const settings = await backend.getSettings() || {}; const now = new Date()
      if (!settings.reminderEnabled || (settings.reminderWeekdaysOnly && [0,6].includes(now.getDay()))) return
      const time = /^([01]\d|2[0-3]):[0-5]\d$/.test(settings.reminderTime) ? settings.reminderTime : '19:00'
      if (`${String(now.getHours()).padStart(2,'0')}:${String(now.getMinutes()).padStart(2,'0')}` < time) return
      if (settings.reminderQuietEnabled && inQuietHours(now, settings.reminderQuietStart, settings.reminderQuietEnd)) return
      const today = localDateKey(now)
      const last = await adapter.get("SELECT value FROM user_settings WHERE key = 'last_reminder_date'")
      if (last?.value === today) return
      const dashboard = await backend.getDashboard()
      if (!dashboard.due) return
      const notification = new Notification({ title: 'VocabMaster · 到期复习', body: `${dashboard.due} 个词已到期，打开今日计划继续。` })
      notification.on('click', showToday)
      notification.show()
      await adapter.run("INSERT INTO user_settings (key,value) VALUES ('last_reminder_date',?) ON CONFLICT(key) DO UPDATE SET value=excluded.value", [today])
    } finally { busy = false }
  }
  const run = () => check().catch((error) => console.error('Reminder check failed:', error.message))
  const timer = setInterval(run, 30000); timer.unref(); run()
  powerMonitor.on('resume', run)
  ipcMain.handle('notifications:status', () => ({ supported: Notification.isSupported(), status: 'system', detail: '应用运行时提醒；系统通知设置可能禁止显示。' }))
  ipcMain.handle('notifications:settings', () => shell.openExternal(process.platform === 'darwin'
    ? 'x-apple.systempreferences:com.apple.preference.notifications' : 'ms-settings:notifications'))
  return () => { clearInterval(timer); powerMonitor.removeListener('resume', run) }
}

module.exports = { registerReminders }
