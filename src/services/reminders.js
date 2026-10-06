import { Capacitor, registerPlugin } from '@capacitor/core'
import { LocalNotifications } from '@capacitor/local-notifications'
import { buildReminders } from '@/backend/reminder-plan.cjs'
import { api } from './api.js'

const NativeSettings = registerPlugin('VocabSettings')
let syncPromise = Promise.resolve()
export async function reminderStatus() {
  if (Capacitor.isNativePlatform()) {
    const result = await LocalNotifications.checkPermissions()
    return { supported: true, status: result.display, detail: 'Android 系统提醒，预排未来 14 天；学习后会更新排期。' }
  }
  if (window.vocabApi) return window.vocabApi.notificationStatus()
  return { supported: false, status: 'unavailable', detail: 'Web 预览不发送系统提醒。' }
}
export async function enableReminders() {
  if (Capacitor.isNativePlatform()) return (await LocalNotifications.requestPermissions()).display === 'granted'
  return Boolean((await reminderStatus()).supported)
}
export async function openReminderSettings() {
  if (Capacitor.isNativePlatform()) await NativeSettings.openNotificationSettings()
  else if (window.vocabApi) await window.vocabApi.openNotificationSettings()
}
export function refreshReminders(settings) {
  if (!Capacitor.isNativePlatform()) return Promise.resolve()
  const snapshot = { ...settings }
  syncPromise = syncPromise.catch(() => {}).then(async () => {
    const pending = await LocalNotifications.getPending()
    const own = pending.notifications.filter((item) => item.id >= 120000 && item.id < 120014)
    if (own.length) await LocalNotifications.cancel({ notifications: own.map(({ id }) => ({ id })) })
    if (!snapshot.reminderEnabled || (await LocalNotifications.checkPermissions()).display !== 'granted') return
    const planned = buildReminders(snapshot, await api.getReminderDates())
    if (planned.length) await LocalNotifications.schedule({ notifications: planned.map((item) => ({ id: item.id,
      title: 'VocabMaster · 到期复习', body: '有词汇到期，打开今日计划继续。',
      schedule: { at: new Date(item.at), allowWhileIdle: false }, extra: { route: '/', date: item.date } })) })
  })
  return syncPromise
}
export async function listenForReminders(router) {
  if (Capacitor.isNativePlatform()) {
    const listener = await LocalNotifications.addListener('localNotificationActionPerformed', () => router.push('/'))
    return () => listener.remove()
  }
  return window.vocabApi?.onReminder?.(() => router.push('/')) || (() => {})
}
