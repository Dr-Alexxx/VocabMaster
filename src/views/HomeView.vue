<template>
  <div class="page home-page">
    <header class="page-header">
      <div><span class="eyebrow">{{ dateText }}</span><h1>今日学习</h1></div>
      <div class="search-box">
        <Search :size="18" />
        <input v-model="query" aria-label="搜索单词" placeholder="搜索单词、释义或例句" @input="scheduleSearch" />
        <button v-if="query" class="icon-btn compact" title="清空搜索" @click="clearSearch"><X :size="16" /></button>
      </div>
    </header>

    <section v-if="query" class="search-results">
      <div class="section-heading"><div><h2>搜索结果</h2><p>{{ searching ? '正在搜索...' : `找到 ${results.length} 条记录` }}</p></div></div>
      <div v-if="results.length" class="word-table">
        <button v-for="item in results" :key="item.id" class="word-row" @click="openWord(item.id)">
          <span class="word-main"><b>{{ item.word }}</b><small>{{ item.phonetic || item.vocabulary_name }}</small></span>
          <span class="definition-preview">{{ item.definition[0] }}</span>
          <span class="status-chip" :class="item.status">{{ statusLabel(item.status) }}</span>
          <ChevronRight :size="18" />
        </button>
      </div>
      <EmptyState v-else-if="!searching" :icon="SearchX" title="没有匹配的单词" description="尝试输入词根、中文释义或更短的关键词" />
    </section>

    <template v-else>
      <section class="today-band">
        <div class="today-copy">
          <span class="eyebrow">今日计划</span>
          <h2>{{ dashboard.due ? '先完成到期复习，再学习新词' : '复习已清空，可以开始新词' }}</h2>
          <p>{{ dashboard.due }} 个待复习 · 最多 {{ plannedNew }} 个新词</p>
          <p v-if="goalActive" class="goal-line">
            目标截止 {{ goalDeadlineText }} · 剩余 {{ goalPlan.daysLeft }} 天 · 今日建议 {{ goalPlan.quota }} 个新词
            <b v-if="!goalPlan.feasible">按每日上限无法按期完成，建议延长截止日期</b>
          </p>
          <button class="primary-btn large" @click="start('mixed')"><Play :size="19" fill="currentColor" />开始学习</button>
        </div>
        <div class="today-progress" :style="{ '--progress': `${todayProgress}%` }">
          <div class="progress-ring"><strong>{{ dashboard.todayTotal }}</strong><span>今日已答</span></div>
          <p>正确率 {{ todayAccuracy }}%</p>
        </div>
      </section>

      <section class="metric-strip">
        <div><BookMarked :size="20" /><span><b>{{ dashboard.learned }}</b>累计已学</span></div>
        <div><BadgeCheck :size="20" /><span><b>{{ dashboard.mastered }}</b>已经掌握</span></div>
        <div><Flame :size="20" /><span><b>{{ dashboard.streak }} 天</b>连续学习</span></div>
        <div><Clock3 :size="20" /><span><b>{{ formatMinutes(dashboard.weekTime) }}</b>本周时长</span></div>
      </section>

      <section>
        <div class="section-heading"><div><h2>选择学习模式</h2><p>学习记录统一进入智能复习计划</p></div></div>
        <div class="mode-grid">
          <button v-for="mode in modes" :key="mode.id" class="mode-card" @click="start(mode.id)">
            <span class="mode-icon" :class="mode.id"><component :is="mode.icon" :size="23" /></span>
            <span><b>{{ mode.name }}</b><small>{{ mode.description }}</small></span>
            <ArrowRight :size="18" />
          </button>
        </div>
      </section>

      <section>
        <div class="section-heading">
          <div><h2>收藏词汇</h2><p>快速回到需要重点关注的单词</p></div>
          <button v-if="favorites.length" class="text-btn" @click="reviewFavorites">专项复习 <ArrowRight :size="16" /></button>
        </div>
        <div v-if="favorites.length" class="favorite-list">
          <button v-for="item in favorites.slice(0, 6)" :key="item.id" @click="openWord(item.id)">
            <b>{{ item.word }}</b><span>{{ item.definition[0] }}</span><Star :size="16" fill="currentColor" />
          </button>
        </div>
        <EmptyState v-else :icon="Star" title="还没有收藏单词" description="在学习卡片或搜索结果中点击收藏，之后会显示在这里" />
      </section>
    </template>

    <WordDrawer :open="drawerOpen" :word-id="selectedWord" @close="drawerOpen = false" @updated="loadFavorites" />
  </div>
</template>

<script setup>
import { computed, onActivated, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowRight, BadgeCheck, BookMarked, ChevronRight, ClipboardCheck, Clock3, Flame, Keyboard, Layers3, Play, Search, SearchX, Shuffle, Star, X } from 'lucide-vue-next'
import EmptyState from '@/components/EmptyState.vue'
import WordDrawer from '@/components/WordDrawer.vue'
import { api } from '@/services/api.js'
import { localDateKey } from '../../electron/date-utils.cjs'
import { planDailyNewQuota } from '../../electron/study-goal.cjs'
import { useSettingsStore } from '@/stores/settings.js'
import { useToast } from '@/composables/useToast.js'

const emit = defineEmits(['dashboard'])
const router = useRouter()
const settings = useSettingsStore()
const toast = useToast()
const dashboard = ref({ due: 0, newCount: 0, learned: 0, mastered: 0, streak: 0, weekTime: 0, todayTotal: 0, todayCorrect: 0 })
const favorites = ref([])
const query = ref('')
const results = ref([])
const searching = ref(false)
const selectedWord = ref(null)
const drawerOpen = ref(false)
let searchTimer

const dateText = new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' }).format(new Date())
const todayAccuracy = computed(() => dashboard.value.todayTotal ? Math.round(dashboard.value.todayCorrect / dashboard.value.todayTotal * 100) : 0)
const goalPlan = computed(() => planDailyNewQuota({
  remainingWords: dashboard.value.newCount,
  deadlineKey: settings.values.goalDeadline || null,
  todayKey: localDateKey(),
  baseLimit: Math.min(dashboard.value.newCount, settings.values.dailyNewLimit)
}))
const goalActive = computed(() => Boolean(settings.values.goalDeadline) && dashboard.value.newCount > 0)
const plannedNew = computed(() => goalActive.value ? goalPlan.value.quota : Math.min(dashboard.value.newCount, settings.values.dailyNewLimit))
const goalDeadlineText = computed(() => settings.values.goalDeadline
  ? new Intl.DateTimeFormat('zh-CN', { month: 'long', day: 'numeric' }).format(new Date(`${settings.values.goalDeadline}T00:00:00`))
  : '')
const todayProgress = computed(() => Math.min(100, Math.round(dashboard.value.todayTotal / Math.max(1, settings.values.dailyNewLimit + dashboard.value.due) * 100)))
const modes = [
  { id: 'flashcard', name: '卡片记忆', description: '翻转卡片后进行 0–5 自评', icon: Layers3 },
  { id: 'spelling', name: '拼写练习', description: '根据释义输入英文单词', icon: Keyboard },
  { id: 'choice', name: '选择题', description: '从四个释义中辨认答案', icon: BadgeCheck },
  { id: 'mixed', name: '混合模式', description: '三种题型自动交替出现', icon: Shuffle },
  { id: 'test', name: '词汇测试', description: '20 题拼写与选择测验，生成成绩报告', icon: ClipboardCheck }
]

async function load() {
  try {
    const [summary, saved] = await Promise.all([api.dashboard(), api.favorites()])
    dashboard.value = summary
    favorites.value = saved
    emit('dashboard', summary)
  } catch (error) { toast.error(error.message) }
}
async function loadFavorites() { favorites.value = await api.favorites() }
function start(mode) { router.push({ name: 'study', query: { mode, start: '1' } }) }
function reviewFavorites() { router.push({ name: 'study', query: { mode: 'mixed', source: 'favorites', start: '1' } }) }
function openWord(id) { selectedWord.value = id; drawerOpen.value = true }
function statusLabel(status) { return ({ new: '新词', learning: '学习中', review: '复习中', mastered: '已掌握' })[status] || '新词' }
function formatMinutes(seconds) { const minutes = Math.round((seconds || 0) / 60); return minutes < 60 ? `${minutes} 分钟` : `${Math.floor(minutes / 60)} 小时 ${minutes % 60} 分` }
function scheduleSearch() {
  clearTimeout(searchTimer)
  if (!query.value.trim()) { results.value = []; return }
  searching.value = true
  searchTimer = window.setTimeout(async () => {
    try { results.value = await api.searchWords(query.value) }
    catch (error) { toast.error(error.message) }
    finally { searching.value = false }
  }, 180)
}
function clearSearch() { query.value = ''; results.value = [] }
onMounted(load)
onActivated(load)
</script>
