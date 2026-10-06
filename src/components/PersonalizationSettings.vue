<template>
  <section class="settings-band">
    <div class="settings-heading"><Bell :size="21" /><div><h2>到期提醒</h2><p>{{ notification.detail }}</p></div></div>
    <div class="setting-row"><label><b>启用提醒</b><span>{{ permissionLabel }}</span></label><label class="switch"><input type="checkbox" :checked="settings.values.reminderEnabled" :disabled="busy || !notification.supported" @change="toggleReminder($event.target.checked)" /><span></span></label></div>
    <template v-if="settings.values.reminderEnabled">
      <div class="setting-row"><label for="reminder-time"><b>提醒时间</b></label><input id="reminder-time" v-model="settings.values.reminderTime" type="time" /></div>
      <div class="setting-row"><label><b>仅工作日</b></label><label class="switch"><input v-model="settings.values.reminderWeekdaysOnly" type="checkbox" /><span></span></label></div>
      <div class="setting-row"><label><b>免打扰</b></label><label class="switch"><input v-model="settings.values.reminderQuietEnabled" type="checkbox" /><span></span></label></div>
      <div v-if="settings.values.reminderQuietEnabled" class="setting-row"><label><b>免打扰时间</b></label><div class="inline-inputs"><input v-model="settings.values.reminderQuietStart" type="time" aria-label="免打扰开始" /><span>至</span><input v-model="settings.values.reminderQuietEnd" type="time" aria-label="免打扰结束" /></div></div>
      <p v-if="quietConflict" class="setting-warning">提醒时间在免打扰时段内，该时段不会发送提醒。</p>
    </template>
    <button v-if="notification.supported" class="data-action" @click="openSystemSettings"><Settings :size="19" /><span><b>系统通知设置</b></span><ChevronRight :size="18" /></button>
  </section>
  <section class="settings-band">
    <div class="settings-heading"><CalendarCheck :size="21" /><div><h2>自适应学习计划</h2></div></div>
    <div class="setting-row"><label><b>按近期完成情况推荐新词量</b><span>始终不超过每日新词上限，复习积压时优先减量。</span></label><label class="switch"><input v-model="settings.values.adaptivePlan" type="checkbox" /><span></span></label></div>
    <div class="setting-row"><label><b>今日推荐</b><span>{{ preview?.reason || '正在读取计划...' }}</span></label><b>{{ preview?.newCount ?? '--' }} 个新词</b></div>
    <p v-if="preview && !preview.deadlineFeasible" class="setting-warning">按当前上限与完成情况无法按期完成，建议延长截止日或手动调整计划。</p>
  </section>
  <section class="settings-band">
    <div class="settings-heading"><Brain :size="21" /><div><h2>复习算法</h2><p>SM-2 为默认；算法切换仅影响之后的答题排期。</p></div></div>
    <div class="setting-row"><label><b>调度算法</b></label><div class="segmented"><button :class="{ active: settings.values.algorithm !== 'fsrs' }" @click="chooseAlgorithm('sm2')">SM-2</button><button :class="{ active: settings.values.algorithm === 'fsrs' }" @click="chooseAlgorithm('fsrs')">FSRS-6</button></div></div>
    <div v-if="settings.values.algorithm === 'fsrs'" class="setting-row slider-row"><label for="retention"><b>目标记忆保持率</b><span>更高的目标会增加复习量。</span></label><div><input id="retention" v-model.number="settings.values.fsrsRetention" type="range" min="0.8" max="0.97" step="0.01" /><output>{{ Math.round(settings.values.fsrsRetention * 100) }}%</output></div></div>
  </section>
  <Teleport to="body"><div v-if="pendingAlgorithm" class="dialog-layer"><section class="dialog algorithm-dialog" role="dialog" aria-modal="true" aria-labelledby="algorithm-title">
    <h2 id="algorithm-title">切换到 {{ pendingAlgorithm === 'fsrs' ? 'FSRS-6' : 'SM-2' }}</h2>
    <p>已有复习日期保持到下一次答题。FSRS 会根据历史答题重建记忆状态；切回 SM-2 时使用保留的 SM-2 状态，学习历史始终保留。</p>
    <p v-if="previewing" class="loading-block">正在模拟排期...</p>
    <table v-else-if="algorithmPreview.length" class="algorithm-table"><thead><tr><th>单词</th><th>当前到期</th><th>FSRS 答对后</th></tr></thead><tbody><tr v-for="row in algorithmPreview" :key="row.word"><td>{{ row.word }}</td><td>{{ row.current || '--' }}</td><td>{{ row.fsrs }}</td></tr></tbody></table>
    <p v-else>当前没有已学词，首次答题时建立记忆状态。</p>
    <p v-if="algorithmError" class="setting-warning">{{ algorithmError }}</p>
    <div class="dialog-actions"><button class="secondary-btn" @click="pendingAlgorithm = null">取消</button><button class="primary-btn" :disabled="previewing || Boolean(algorithmError)" @click="confirmAlgorithm">确认切换</button></div>
  </section></div></Teleport>
</template>

<script setup>
import { computed, onMounted, ref, watch } from 'vue'
import { Bell, Brain, CalendarCheck, ChevronRight, Settings } from 'lucide-vue-next'
import { useSettingsStore } from '@/stores/settings.js'
import { api } from '@/services/api.js'
import { useToast } from '@/composables/useToast.js'
import { enableReminders, reminderStatus, openReminderSettings } from '@/services/reminders.js'
import { inQuietHours } from '@/backend/reminder-plan.cjs'
const settings = useSettingsStore(); const toast = useToast()
const notification = ref({ supported: false, detail: '正在读取系统权限...' }); const busy = ref(false)
const preview = ref(null); const pendingAlgorithm = ref(null); const previewing = ref(false); const algorithmPreview = ref([]); const algorithmError = ref('')
let previewRequest = 0
const permissionLabel = computed(() => ({ granted: '已允许系统通知', denied: '系统通知权限未允许', prompt: '启用时申请通知权限', system: '遵循系统通知设置' })[notification.value.status] || '当前平台不支持通知')
const quietConflict = computed(() => {
  const date = new Date(); const [h,m] = settings.values.reminderTime.split(':').map(Number); date.setHours(h,m)
  return settings.values.reminderQuietEnabled && inQuietHours(date, settings.values.reminderQuietStart, settings.values.reminderQuietEnd)
})
async function toggleReminder(enabled) {
  busy.value = true
  try { settings.values.reminderEnabled = enabled ? await enableReminders() : false; notification.value = await reminderStatus(); await settings.save() }
  catch (error) { toast.error(error.message) }
  finally { busy.value = false }
}
async function openSystemSettings() { try { await openReminderSettings() } catch (error) { toast.error(error.message) } }
async function loadPreview() {
  const request = ++previewRequest
  try { const result = await api.getPlanPreview({ ...settings.values }); if (request === previewRequest) preview.value = result }
  catch (error) { toast.error(error.message) }
}
async function chooseAlgorithm(value) {
  if (value === settings.values.algorithm) return
  pendingAlgorithm.value = value; previewing.value = true; algorithmError.value = ''
  try { algorithmPreview.value = await api.previewAlgorithm({ ...settings.reviewOptions }) }
  catch (error) { algorithmError.value = error.message }
  finally { previewing.value = false }
}
async function confirmAlgorithm() {
  const previous = settings.values.algorithm
  try { settings.values.algorithm = pendingAlgorithm.value; await settings.save(); pendingAlgorithm.value = null }
  catch (error) { settings.values.algorithm = previous; toast.error(error.message) }
}
onMounted(async () => { try { notification.value = await reminderStatus() } catch (error) { toast.error(error.message) }; loadPreview() })
watch(() => [settings.values.adaptivePlan, settings.values.dailyNewLimit, settings.values.dailyReviewLimit, settings.values.goalDeadline], loadPreview)
</script>

<style scoped>
.setting-warning { padding: 12px 20px; color: var(--danger); font-size: 13px; }.algorithm-dialog { width: min(580px,100%); max-height: 90vh; overflow: auto; }.algorithm-table { width: 100%; margin-top: 16px; border-collapse: collapse; font-size: 12px; }.algorithm-table th,.algorithm-table td { padding: 8px; text-align: left; border-bottom: 1px solid var(--border); }.algorithm-table th { color: var(--text-soft); }.inline-inputs input[type=time] { width: 110px; }.setting-row input[type=time] { min-height: 38px; padding: 4px 8px; }
</style>
