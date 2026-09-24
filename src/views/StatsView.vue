<template>
  <div class="page stats-page">
    <header class="page-header">
      <div><span class="eyebrow">数据洞察</span><h1>学习统计</h1><p>从学习量、正确率和词库进度观察长期变化。</p></div>
      <div class="segmented compact-segments"><button v-for="value in [7, 30, 90]" :key="value" :class="{ active: period === value }" @click="changePeriod(value)">{{ value }} 天</button></div>
    </header>
    <section class="metric-strip stats-metrics">
      <div><BookOpenCheck :size="20" /><span><b>{{ data.totals.learned || 0 }}</b>累计新学</span></div>
      <div><Target :size="20" /><span><b>{{ accuracy }}%</b>累计正确率</span></div>
      <div><Flame :size="20" /><span><b>{{ data.totals.streak || 0 }} 天</b>当前连续</span></div>
      <div><Clock3 :size="20" /><span><b>{{ formatTime(data.totals.time) }}</b>累计时长</span></div>
    </section>

    <section class="chart-band">
      <div class="section-heading"><div><h2>学习趋势</h2><p>每日学习时长与答题正确率</p></div></div>
      <div ref="trendEl" class="chart large-chart"></div>
    </section>
    <section class="chart-split">
      <div class="chart-panel"><div class="section-heading"><div><h2>词库完成度</h2><p>已学与掌握词汇分布</p></div></div><div ref="vocabEl" class="chart"></div></div>
      <div class="chart-panel"><div class="section-heading"><div><h2>学习模式表现</h2><p>各题型正确率与答题量</p></div></div><div ref="modeEl" class="chart"></div></div>
    </section>
    <section class="heatmap-section">
      <div class="section-heading"><div><h2>学习热力图</h2><p>最近 18 周每日完成题量</p></div><div class="heat-legend"><span>少</span><i v-for="level in 5" :key="level" :class="`level-${level - 1}`"></i><span>多</span></div></div>
      <div class="heatmap"><i v-for="day in heatDays" :key="day.date" :class="`level-${day.level}`" :title="`${day.date}：${day.count} 题`"></i></div>
    </section>
    <section>
      <div class="section-heading"><div><h2>薄弱词汇 TOP 20</h2><p>按错误次数和复习表现综合排序</p></div></div>
      <div v-if="data.weakWords.length" class="weak-table">
        <button v-for="(item, index) in data.weakWords" :key="item.id" @click="openWord(item.id)"><span>{{ index + 1 }}</span><b>{{ item.word }}</b><em>{{ item.definition[0] }}</em><small>{{ item.vocabulary_name }}</small><strong>{{ item.mistake_count }} 次错误</strong><ChevronRight :size="17" /></button>
      </div>
      <EmptyState v-else :icon="ChartNoAxesCombined" title="暂无薄弱词数据" description="完成一些学习后，这里会根据错误记录给出排序。" />
    </section>
    <WordDrawer :open="drawerOpen" :word-id="selectedWord" @close="drawerOpen = false" />
  </div>
</template>

<script setup>
import * as echarts from 'echarts'
import { computed, nextTick, onBeforeUnmount, onMounted, reactive, ref } from 'vue'
import { BookOpenCheck, ChartNoAxesCombined, ChevronRight, Clock3, Flame, Target } from 'lucide-vue-next'
import EmptyState from '@/components/EmptyState.vue'
import WordDrawer from '@/components/WordDrawer.vue'
import { addLocalDays } from '../../electron/date-utils.cjs'
import { api } from '@/services/api.js'
import { useSettingsStore } from '@/stores/settings.js'
import { useToast } from '@/composables/useToast.js'

const settings = useSettingsStore(); const toast = useToast(); const period = ref(30)
const data = reactive({ daily: [], modes: [], vocabularies: [], weakWords: [], totals: {} })
const trendEl = ref(null); const vocabEl = ref(null); const modeEl = ref(null); const charts = []
const drawerOpen = ref(false); const selectedWord = ref(null)
const accuracy = computed(() => data.totals.total ? Math.round(data.totals.correct / data.totals.total * 100) : 0)
const heatDays = computed(() => {
  const map = new Map(data.daily.map((day) => [day.date, day.total_count]))
  const values = []
  for (let offset = 125; offset >= 0; offset -= 1) {
    const key = addLocalDays(new Date(), -offset); const count = map.get(key) || 0
    values.push({ date: key, count, level: count === 0 ? 0 : Math.min(4, Math.ceil(count / 10)) })
  }
  return values
})

function themeColors() {
  const dark = settings.effectiveTheme === 'dark'
  return { text: dark ? '#a9b4bd' : '#5d6a72', line: dark ? '#35434a' : '#e2e8eb', teal: '#178779', blue: '#2774c7', amber: '#d99a21', red: '#cf5b51' }
}
function fillDaily() {
  const map = new Map(data.daily.map((item) => [item.date, item])); const result = []
  for (let offset = period.value - 1; offset >= 0; offset -= 1) { const key = addLocalDays(new Date(), -offset); result.push(map.get(key) || { date: key, study_time: 0, total_count: 0, correct_count: 0 }) }
  return result
}
function renderCharts() {
  charts.splice(0).forEach((chart) => chart.dispose())
  const colors = themeColors(); const days = fillDaily(); const base = { textStyle: { fontFamily: 'Segoe UI, Microsoft YaHei', color: colors.text }, animationDuration: 450 }
  const trend = echarts.init(trendEl.value); charts.push(trend)
  trend.setOption({ ...base, tooltip: { trigger: 'axis' }, legend: { top: 4, left: 'center', data: ['学习时长', '正确率'], textStyle: { color: colors.text } }, grid: { left: 46, right: 50, top: 45, bottom: 32 },
    xAxis: { type: 'category', data: days.map((d) => d.date.slice(5)), axisLine: { lineStyle: { color: colors.line } }, axisLabel: { color: colors.text } },
    yAxis: [{ type: 'value', name: '分钟', splitLine: { lineStyle: { color: colors.line } }, axisLabel: { color: colors.text } }, { type: 'value', min: 0, max: 100, name: '%', splitLine: { show: false }, axisLabel: { color: colors.text } }],
    series: [{ name: '学习时长', type: 'bar', barMaxWidth: 18, itemStyle: { color: colors.teal, borderRadius: [3,3,0,0] }, data: days.map((d) => Math.round(d.study_time / 60)) },
      { name: '正确率', type: 'line', yAxisIndex: 1, smooth: true, symbolSize: 6, lineStyle: { width: 2, color: colors.amber }, itemStyle: { color: colors.amber }, data: days.map((d) => d.total_count ? Math.round(d.correct_count / d.total_count * 100) : null) }] })
  const vocab = echarts.init(vocabEl.value); charts.push(vocab)
  vocab.setOption({ ...base, tooltip: { trigger: 'axis', axisPointer: { type: 'shadow' } }, legend: { top: 4, left: 'center', data: ['已掌握','学习中'], textStyle: { color: colors.text } }, grid: { left: 100, right: 24, top: 40, bottom: 24 },
    xAxis: { type: 'value', splitLine: { lineStyle: { color: colors.line } }, axisLabel: { color: colors.text } }, yAxis: { type: 'category', data: data.vocabularies.map((v) => v.name.replace('核心词汇','')), axisLabel: { color: colors.text } },
    series: [{ name: '已掌握', type: 'bar', stack: 'total', itemStyle: { color: colors.teal }, data: data.vocabularies.map((v) => v.mastered) }, { name: '学习中', type: 'bar', stack: 'total', itemStyle: { color: colors.blue }, data: data.vocabularies.map((v) => Math.max(0, v.learned - v.mastered)) }] })
  const modes = echarts.init(modeEl.value); charts.push(modes)
  const labels = { flashcard: '卡片', spelling: '拼写', choice: '选择题' }
  modeEl.value && modes.setOption({ ...base, tooltip: { trigger: 'axis' }, grid: { left: 48, right: 24, top: 30, bottom: 36 }, xAxis: { type: 'category', data: data.modes.map((m) => labels[m.mode]), axisLabel: { color: colors.text }, axisLine: { lineStyle: { color: colors.line } } }, yAxis: { type: 'value', min: 0, max: 100, axisLabel: { formatter: '{value}%', color: colors.text }, splitLine: { lineStyle: { color: colors.line } } }, series: [{ type: 'bar', barWidth: 42, itemStyle: { color: (p) => [colors.teal, colors.amber, colors.blue][p.dataIndex], borderRadius: [4,4,0,0] }, data: data.modes.map((m) => m.total ? Math.round(m.correct / m.total * 100) : 0) }] })
}
async function load() { try { Object.assign(data, await api.statistics(period.value)); await nextTick(); renderCharts() } catch (error) { toast.error(error.message) } }
function changePeriod(value) { period.value = value; load() }
function formatTime(seconds = 0) { const minutes = Math.round(seconds / 60); return minutes < 60 ? `${minutes} 分钟` : `${Math.floor(minutes / 60)} 小时` }
function openWord(id) { selectedWord.value = id; drawerOpen.value = true }
function resize() { charts.forEach((chart) => chart.resize()) }
onMounted(() => { load(); window.addEventListener('resize', resize) })
onBeforeUnmount(() => { window.removeEventListener('resize', resize); charts.forEach((chart) => chart.dispose()) })
</script>
