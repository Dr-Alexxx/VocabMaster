<template>
  <div class="page settings-page">
    <header class="page-header"><div><span class="eyebrow">个性化</span><h1>设置</h1><p>更改会自动保存到本机数据库。</p></div><span class="save-state"><CircleCheck :size="16" />自动保存</span></header>
    <section class="settings-band">
      <div class="settings-heading"><BookOpen :size="21" /><div><h2>学习计划</h2><p>控制每日计划规模与内容选择。</p></div></div>
      <div class="setting-row"><label for="new-limit"><b>每日新词上限</b><span>完成到期复习后安排的新单词数量</span></label><div class="stepper"><button title="减少" @click="adjust('dailyNewLimit', -5, 5, 200)"><Minus :size="16" /></button><input id="new-limit" v-model.number="values.dailyNewLimit" type="number" min="5" max="200" /><button title="增加" @click="adjust('dailyNewLimit', 5, 5, 200)"><Plus :size="16" /></button></div></div>
      <div class="setting-row"><label for="review-limit"><b>每日复习上限</b><span>单日最多处理的到期复习数量</span></label><div class="stepper"><button title="减少" @click="adjust('dailyReviewLimit', -10, 20, 500)"><Minus :size="16" /></button><input id="review-limit" v-model.number="values.dailyReviewLimit" type="number" min="20" max="500" /><button title="增加" @click="adjust('dailyReviewLimit', 10, 20, 500)"><Plus :size="16" /></button></div></div>
      <div class="setting-row"><label for="goal-deadline"><b>目标截止日</b><span>按剩余新词自动摊派每日学习量并动态调整，留空则使用每日新词上限</span></label><div class="inline-inputs"><input id="goal-deadline" v-model="values.goalDeadline" type="date" /><button v-if="values.goalDeadline" class="text-btn" @click="values.goalDeadline = ''">清除</button></div></div>
      <div class="setting-row"><label><b>跨词库去重</b><span>已学过的相同拼写不会作为新词再次出现</span></label><label class="switch"><input v-model="values.enableCrossVocabDedup" type="checkbox" /><span></span></label></div>
      <div class="setting-row"><label><b>显示例句</b><span>翻开卡片后展示首条例句</span></label><label class="switch"><input v-model="values.showExamples" type="checkbox" /><span></span></label></div>
      <div class="setting-row"><label><b>自动朗读</b><span>每道题出现时使用 Windows 系统语音朗读</span></label><label class="switch"><input v-model="values.autoPronounce" type="checkbox" /><span></span></label></div>
    </section>

    <section class="settings-band">
      <div class="settings-heading"><Volume2 :size="21" /><div><h2>发音</h2><p>朗读使用 Windows 系统语音，找不到对应口音时回退默认语音。</p></div></div>
      <div class="setting-row"><label><b>口音</b><span>美式或英式英语发音</span></label><div class="segmented"><button v-for="accent in accents" :key="accent.value" :class="{ active: values.voiceAccent === accent.value }" @click="values.voiceAccent = accent.value">{{ accent.label }}</button></div></div>
      <div class="setting-row slider-row"><label for="rate"><b>语速</b><span>0.5x – 2.0x</span></label><div><input id="rate" v-model.number="values.speechRate" type="range" min="0.5" max="2" step="0.1" /><output>{{ Number(values.speechRate).toFixed(1) }}x</output></div></div>
    </section>

    <section class="settings-band">
      <div class="settings-heading"><SlidersHorizontal :size="21" /><div><h2>记忆算法</h2><p>调整 SM-2 间隔和掌握判定。</p></div></div>
      <div class="setting-row slider-row"><label for="ease"><b>初始难易度</b><span>新卡片的初始扩展系数</span></label><div><input id="ease" v-model.number="values.initialEasiness" type="range" min="1.3" max="3" step="0.1" /><output>{{ values.initialEasiness.toFixed(1) }}</output></div></div>
      <div class="setting-row slider-row"><label for="modifier"><b>间隔系数</b><span>低于 1 会更频繁，高于 1 会延长间隔</span></label><div><input id="modifier" v-model.number="values.intervalModifier" type="range" min="0.5" max="1.5" step="0.05" /><output>{{ values.intervalModifier.toFixed(2) }}</output></div></div>
      <div class="setting-row"><label><b>掌握阈值</b><span>同时达到连续正确次数和复习间隔</span></label><div class="inline-inputs"><label><input v-model.number="values.masteryRepetitions" type="number" min="2" max="20" /> 次</label><label><input v-model.number="values.masteryDays" type="number" min="7" max="365" /> 天</label></div></div>
    </section>

    <section class="settings-band">
      <div class="settings-heading"><Palette :size="21" /><div><h2>界面显示</h2><p>选择主题和界面字号。</p></div></div>
      <div class="setting-row"><label><b>主题</b><span>可跟随 Windows 颜色模式</span></label><div class="segmented"><button v-for="theme in themes" :key="theme.value" :class="{ active: values.theme === theme.value }" @click="values.theme = theme.value"><component :is="theme.icon" :size="17" />{{ theme.label }}</button></div></div>
      <div class="setting-row"><label><b>字体大小</b><span>适用于全部页面和学习卡片</span></label><div class="segmented"><button v-for="font in fonts" :key="font.value" :class="{ active: values.fontSize === font.value }" @click="values.fontSize = font.value">{{ font.label }}</button></div></div>
    </section>

    <section class="settings-band data-band">
      <div class="settings-heading"><Database :size="21" /><div><h2>数据管理</h2><p>备份文件包含词库、学习记录、错题和设置。</p></div></div>
      <button class="data-action" @click="exportData"><Download :size="19" /><span><b>导出完整备份</b><small>保存为 VocabMaster JSON 文件</small></span><ChevronRight :size="18" /></button>
      <button class="data-action" @click="previewImport"><Upload :size="19" /><span><b>从备份恢复</b><small>先预览内容，再替换当前数据</small></span><ChevronRight :size="18" /></button>
      <button class="data-action danger-action" @click="resetDialog = true"><Trash2 :size="19" /><span><b>清空学习记录</b><small>保留词库、收藏和个人笔记</small></span><ChevronRight :size="18" /></button>
    </section>
    <footer class="app-about"><img src="/app-icon.png" alt="" /><div><b>VocabMaster {{ appVersion }}</b><span>Windows x64 · 本地数据存储</span></div></footer>

    <Teleport to="body"><div v-if="backupPreview" class="dialog-layer" @click.self="backupPreview = null"><section class="dialog backup-dialog"><div class="dialog-icon"><Database :size="22" /></div><h2>确认恢复备份</h2><p>{{ backupPreview.filename }}</p><dl><div><dt>导出时间</dt><dd>{{ formatDate(backupPreview.exportedAt) }}</dd></div><div><dt>词库</dt><dd>{{ backupPreview.vocabularies }} 个</dd></div><div><dt>单词</dt><dd>{{ backupPreview.words }} 个</dd></div><div><dt>学习记录</dt><dd>{{ backupPreview.records }} 条</dd></div></dl>
      <div class="strategy-pick" role="radiogroup" aria-label="恢复策略">
        <label v-for="item in restoreStrategies" :key="item.value" :class="{ active: restoreStrategy === item.value }">
          <input v-model="restoreStrategy" type="radio" name="restore-strategy" :value="item.value" />
          <span><b>{{ item.label }}</b><small>{{ item.hint }}</small></span>
        </label>
      </div>
      <p class="warning-copy">{{ restoreStrategy === 'replace' ? '覆盖会替换当前全部数据，建议先导出当前备份。' : '该策略不会删除现有数据，仍建议先导出当前备份。' }}</p><div class="dialog-actions"><button class="secondary-btn" @click="backupPreview = null">取消</button><button class="danger-btn" @click="restoreBackup">替换并恢复</button></div></section></div></Teleport>
    <ConfirmDialog :open="resetDialog" title="清空全部学习记录" message="学习进度、答题历史、错题和统计将永久删除；词库、收藏与笔记会保留。" confirm-text="确认清空" tone="danger" @cancel="resetDialog = false" @confirm="resetProgress" />
  </div>
</template>

<script setup>
import { computed, ref } from 'vue'
import { BookOpen, ChevronRight, CircleCheck, Database, Download, Laptop, Minus, Moon, Palette, Plus, SlidersHorizontal, Sun, Trash2, Upload, Volume2 } from 'lucide-vue-next'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { api } from '@/services/api.js'
import { useSettingsStore } from '@/stores/settings.js'
import { useToast } from '@/composables/useToast.js'

const settings = useSettingsStore(); const values = computed(() => settings.values); const toast = useToast()
const appVersion = __APP_VERSION__
const resetDialog = ref(false); const backupPreview = ref(null); const restoreStrategy = ref('replace')
const restoreStrategies = [
  { value: 'replace', label: '覆盖全部', hint: '清空当前数据后完整恢复备份' },
  { value: 'merge', label: '合并', hint: '缺失内容补入，学习记录保留较新的一份' },
  { value: 'skip', label: '跳过已存在', hint: '只补充本机没有的词库与单词' }
]
const themes = [{ value: 'light', label: '浅色', icon: Sun }, { value: 'dark', label: '深色', icon: Moon }, { value: 'system', label: '系统', icon: Laptop }]
const accents = [{ value: 'system', label: '系统默认' }, { value: 'us', label: '美音' }, { value: 'uk', label: '英音' }]
const fonts = [{ value: 'small', label: '小' }, { value: 'medium', label: '中' }, { value: 'large', label: '大' }, { value: 'xlarge', label: '特大' }]
function adjust(key, amount, min, max) { values.value[key] = Math.min(max, Math.max(min, Number(values.value[key]) + amount)) }
async function exportData() { try { const file = await api.exportBackup(); if (file) toast.success('完整备份已导出') } catch (error) { toast.error(error.message) } }
async function previewImport() { try { backupPreview.value = await api.previewBackup(); restoreStrategy.value = 'replace' } catch (error) { toast.error(error.message) } }
async function restoreBackup() { try { await api.commitBackup(backupPreview.value.token, restoreStrategy.value); backupPreview.value = null; await settings.load(); toast.success('备份恢复完成') } catch (error) { toast.error(error.message) } }
async function resetProgress() { try { await api.resetProgress(); resetDialog.value = false; toast.success('学习记录已清空') } catch (error) { toast.error(error.message) } }
function formatDate(value) { return value ? new Intl.DateTimeFormat('zh-CN', { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(value)) : '--' }
</script>
