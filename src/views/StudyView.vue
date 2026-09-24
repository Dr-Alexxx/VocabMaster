<template>
  <div class="study-page">
    <header class="study-header">
      <button class="icon-btn" title="返回今日学习" @click="leave"><ArrowLeft :size="21" /></button>
      <div class="study-progress-wrap">
        <div class="study-progress-meta"><span>{{ sessionActive ? `${currentIndex + 1} / ${words.length}` : '学习模式' }}</span><span>{{ progress }}%</span></div>
        <div class="progress-track"><span :style="{ width: `${progress}%` }"></span></div>
      </div>
      <div class="study-tools">
        <button class="icon-btn" title="暂停 (Esc)" :disabled="!sessionActive || submitting" @click="pauseStudy"><Pause :size="20" /></button>
        <button class="icon-btn" title="打开单词详情" :disabled="!currentWord" @click="drawerOpen = true"><PanelRightOpen :size="20" /></button>
      </div>
    </header>

    <main v-if="!sessionActive && !completed" class="study-setup">
      <div class="setup-heading"><span class="eyebrow">专注学习</span><h1>选择本次学习方式</h1><p>到期复习会优先出现，新词完成后自动加入记忆曲线。</p></div>
      <div class="segmented mode-segments">
        <button v-for="item in modeOptions" :key="item.id" :class="{ active: selectedMode === item.id }" @click="selectedMode = item.id">
          <component :is="item.icon" :size="20" /><span>{{ item.name }}</span>
        </button>
      </div>
      <div class="setup-summary">
        <div><span>每日新词</span><b>{{ settings.values.dailyNewLimit }}</b></div>
        <div><span>每日复习上限</span><b>{{ settings.values.dailyReviewLimit }}</b></div>
        <div><span>学习来源</span><b>{{ sourceLabel }}</b></div>
      </div>
      <button class="primary-btn large" :disabled="loading" @click="startSession"><Play :size="19" fill="currentColor" />{{ loading ? '正在生成计划...' : '开始本次学习' }}</button>
    </main>

    <main v-else-if="completed" class="study-complete">
      <div class="complete-mark"><Trophy :size="36" /></div>
      <span class="eyebrow">本次完成</span>
      <h1>{{ words.length ? '学习计划已完成' : '当前没有待学单词' }}</h1>
      <p>{{ words.length ? '新的复习时间已经根据本次表现安排。' : '可以激活其他词库，或稍后回来复习。' }}</p>
      <div v-if="words.length" class="completion-stats">
        <div><b>{{ sessionStats.total }}</b><span>完成题目</span></div>
        <div><b>{{ accuracy }}%</b><span>本次正确率</span></div>
        <div><b>{{ formatDuration(sessionStats.duration) }}</b><span>学习时长</span></div>
      </div>
      <div class="completion-actions"><button class="secondary-btn" @click="leave">返回首页</button><button class="primary-btn" @click="restart">再学一组</button></div>
    </main>

    <main v-else class="study-stage">
      <div class="queue-meta"><span class="status-chip" :class="currentWord.queue_type">{{ currentWord.queue_type === 'new' ? '新词' : '复习' }}</span><span>{{ modeName(currentMode) }}</span><span>{{ currentWord.vocabulary_name }}</span></div>

      <section v-if="currentMode === 'flashcard'" class="study-card flashcard" :class="{ revealed }">
        <div class="card-front">
          <button class="speak-btn" title="朗读 (P)" @click="speak"><Volume2 :size="20" /></button>
          <h1>{{ currentWord.word }}</h1><p class="phonetic">{{ currentWord.phonetic || ' ' }}</p>
        </div>
        <div v-if="revealed" class="card-answer">
          <ol class="definition-list"><li v-for="item in currentWord.definition" :key="item">{{ item }}</li></ol>
          <p v-if="settings.values.showExamples && currentWord.examples?.[0]" class="example">{{ currentWord.examples[0] }}</p>
        </div>
        <button v-if="!revealed" class="primary-btn reveal-btn" @click="revealed = true">显示答案 <span>Space</span></button>
      </section>

      <section v-else-if="currentMode === 'spelling'" class="study-card spelling-card">
        <span class="question-label">根据释义拼写单词</span>
        <h2>{{ currentWord.definition[0] }}</h2>
        <p v-if="currentWord.phonetic" class="phonetic">{{ currentWord.phonetic }}</p>
        <form @submit.prevent="submitSpelling">
          <input ref="spellingInput" v-model="answer" autocomplete="off" spellcheck="false" :readonly="Boolean(feedback)" :aria-invalid="feedback ? !feedback.correct : undefined" aria-keyshortcuts="Enter" :maxlength="Math.max(30, currentWord.word.length + 8)" placeholder="输入英文单词" @keydown.enter.prevent="handleSpellingEnter" />
          <span class="letter-count">{{ answer.length }} / {{ currentWord.word.length }} 个字母</span>
          <button v-if="!feedback" class="primary-btn" :disabled="!answer.trim() || submitting">{{ submitting ? '正在保存...' : '检查答案' }}</button>
        </form>
        <div v-if="feedback" class="answer-feedback" :class="feedback.correct ? 'correct' : 'incorrect'" aria-live="polite">
          <component :is="feedback.correct ? CircleCheck : CircleX" :size="22" />
          <div><b>{{ feedback.correct ? '拼写正确' : '正确答案：' + currentWord.word }}</b><span v-if="!feedback.correct">你的答案：{{ answer || '未作答' }}</span></div>
        </div>
      </section>

      <section v-else class="study-card choice-card">
        <span class="question-label">选择正确释义</span>
        <h1>{{ currentWord.word }}</h1><p class="phonetic">{{ currentWord.phonetic || ' ' }}</p>
        <div class="choice-grid">
          <button v-for="(option, index) in choices" :key="option" :disabled="Boolean(feedback) || submitting" :class="choiceClass(option)" :title="`${String.fromCharCode(65 + index)} / ${index + 1}`" :aria-keyshortcuts="`${String.fromCharCode(65 + index)} ${index + 1}`" @click="submitChoice(option)">
            <span>{{ String.fromCharCode(65 + index) }}</span><b>{{ option }}</b>
          </button>
        </div>
      </section>

      <div v-if="revealed && currentMode === 'flashcard'" class="rating-panel">
        <p>你记得多清楚？</p>
        <div class="ratings"><button v-for="rating in ratings" :key="rating.value" :class="rating.class" :disabled="submitting" @click="submit(rating.value)"><b>{{ rating.value }}</b><span>{{ rating.label }}</span></button></div>
      </div>
      <div v-else-if="feedback" class="next-panel"><button class="primary-btn" aria-keyshortcuts="Enter" :disabled="submitting || !feedback.recorded" @click="nextWord">{{ submitting ? '正在保存...' : '下一题' }} <ArrowRight :size="18" /></button></div>
      <div v-else class="study-actions">
        <button class="text-btn" :disabled="submitting" @click="skip"><SkipForward :size="17" />稍后再学</button>
        <button class="text-btn" :disabled="submitting" @click="toggleFavorite"><Star :size="17" :fill="currentWord.is_favorited ? 'currentColor' : 'none'" />{{ currentWord.is_favorited ? '已收藏' : '收藏' }}</button>
      </div>
    </main>

    <div v-if="paused" class="pause-layer">
      <div><Pause :size="32" /><h2>学习已暂停</h2><p>计时已暂停，你可以稍后继续。</p><button class="primary-btn" @click="resume">继续学习</button><button class="text-btn" @click="leave">结束本次学习</button></div>
    </div>
    <WordDrawer :open="drawerOpen" :word-id="currentWord?.id" @close="drawerOpen = false" @updated="updateCurrent" />
  </div>
</template>

<script setup>
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from 'vue'
import { useRoute, useRouter } from 'vue-router'
import { ArrowLeft, ArrowRight, BadgeCheck, CircleCheck, CircleX, Keyboard, Layers3, PanelRightOpen, Pause, Play, Shuffle, SkipForward, Star, Trophy, Volume2 } from 'lucide-vue-next'
import WordDrawer from '@/components/WordDrawer.vue'
import { api } from '@/services/api.js'
import { calculateQuality } from '@/algorithms/anki.js'
import { choiceShortcutIndex, spellingEnterAction } from '@/algorithms/study-interaction.js'
import { useSettingsStore } from '@/stores/settings.js'
import { useToast } from '@/composables/useToast.js'

const route = useRoute(); const router = useRouter(); const settings = useSettingsStore(); const toast = useToast()
const modeOptions = [
  { id: 'flashcard', name: '卡片', icon: Layers3 }, { id: 'spelling', name: '拼写', icon: Keyboard },
  { id: 'choice', name: '选择', icon: BadgeCheck }, { id: 'mixed', name: '混合', icon: Shuffle }
]
const ratings = [
  { value: 0, label: '忘记', class: 'fail' }, { value: 1, label: '模糊', class: 'fail' },
  { value: 2, label: '困难', class: 'hard' }, { value: 3, label: '犹豫', class: 'okay' },
  { value: 4, label: '轻松', class: 'good' }, { value: 5, label: '熟练', class: 'easy' }
]
const selectedMode = ref(['flashcard','spelling','choice','mixed'].includes(route.query.mode) ? route.query.mode : 'mixed')
const source = ref(['daily','mistakes','favorites'].includes(route.query.source) ? route.query.source : 'daily')
const loading = ref(false); const sessionActive = ref(false); const completed = ref(false); const paused = ref(false)
const submitting = ref(false)
const words = ref([]); const modes = ref([]); const choicePool = ref([]); const currentIndex = ref(0)
const revealed = ref(false); const answer = ref(''); const feedback = ref(null); const choices = ref([])
const selectedChoice = ref(''); const drawerOpen = ref(false); const spellingInput = ref(null)
const startedAt = ref(0); const questionStartedAt = ref(0); const pausedAt = ref(0); const pausedTotal = ref(0)
const sessionStats = ref({ total: 0, correct: 0, duration: 0 })
const currentWord = computed(() => words.value[currentIndex.value] || null)
const currentMode = computed(() => modes.value[currentIndex.value] || selectedMode.value)
const progress = computed(() => words.value.length ? Math.round(currentIndex.value / words.value.length * 100) : 0)
const accuracy = computed(() => sessionStats.value.total ? Math.round(sessionStats.value.correct / sessionStats.value.total * 100) : 0)
const sourceLabel = computed(() => ({ daily: '今日计划', mistakes: '错题本', favorites: '收藏夹' })[source.value])

function shuffled(items) { return [...items].sort(() => Math.random() - 0.5) }
function modeName(mode) { return ({ flashcard: '卡片', spelling: '拼写', choice: '选择题' })[mode] }
function prepareQuestion() {
  revealed.value = false; answer.value = ''; feedback.value = null; selectedChoice.value = ''; submitting.value = false; questionStartedAt.value = Date.now()
  if (currentMode.value === 'choice') {
    const correct = currentWord.value.definition[0]
    const distractors = shuffled(choicePool.value.filter((item) => item && item !== correct)).slice(0, 3)
    choices.value = shuffled([correct, ...distractors])
  }
  if (settings.values.autoPronounce) speak()
  if (currentMode.value === 'spelling') nextTick(() => spellingInput.value?.focus())
}
async function startSession() {
  loading.value = true
  try {
    const plan = await api.dailyPlan({ ...settings.values }, source.value)
    words.value = plan.words; choicePool.value = plan.choicePool || []
    modes.value = words.value.map(() => selectedMode.value === 'mixed' ? shuffled(['flashcard','spelling','choice'])[0] : selectedMode.value)
    currentIndex.value = 0; sessionStats.value = { total: 0, correct: 0, duration: 0 }; startedAt.value = Date.now(); pausedTotal.value = 0
    if (!words.value.length) { completed.value = true; sessionActive.value = false }
    else { sessionActive.value = true; completed.value = false; prepareQuestion() }
  } catch (error) { toast.error(error.message) }
  finally { loading.value = false }
}
async function submit(quality) {
  if (!currentWord.value || submitting.value || feedback.value?.recorded) return false
  submitting.value = true
  const elapsed = Math.max(0, Math.round((Date.now() - questionStartedAt.value) / 1000))
  let shouldAdvance = false
  try {
    await api.submitAnswer({ wordId: currentWord.value.id, quality, mode: currentMode.value, timeSpent: elapsed, options: { ...settings.reviewOptions } })
    sessionStats.value.total += 1
    if (quality >= 3) sessionStats.value.correct += 1
    if (currentMode.value === 'flashcard') shouldAdvance = true
    else feedback.value.recorded = true
    return true
  } catch (error) {
    feedback.value = null
    selectedChoice.value = ''
    toast.error(error.message)
    if (currentMode.value === 'spelling') nextTick(() => spellingInput.value?.focus())
    return false
  } finally {
    submitting.value = false
    if (shouldAdvance) nextWord()
  }
}
async function submitSpelling() {
  if (feedback.value || submitting.value || !answer.value.trim()) return
  const quality = calculateQuality('spelling', answer.value, currentWord.value.word)
  feedback.value = { correct: quality >= 3, quality, recorded: false }
  await submit(quality)
}
function handleSpellingEnter() {
  const action = spellingEnterAction({
    hasAnswer: Boolean(answer.value.trim()),
    hasFeedback: Boolean(feedback.value),
    feedbackRecorded: Boolean(feedback.value?.recorded),
    submitting: submitting.value,
  })
  if (action === 'submit') submitSpelling()
  else if (action === 'next') nextWord()
}
async function submitChoice(option) {
  if (feedback.value || submitting.value) return
  selectedChoice.value = option
  const quality = calculateQuality('choice', option, currentWord.value.definition[0], Date.now() - questionStartedAt.value)
  feedback.value = { correct: quality >= 3, quality, recorded: false }
  await submit(quality)
}
function choiceClass(option) {
  if (!feedback.value) return ''
  if (option === currentWord.value.definition[0]) return 'correct'
  if (option === selectedChoice.value) return 'incorrect'
  return 'muted'
}
function nextWord() {
  if (submitting.value || (feedback.value && !feedback.value.recorded)) return
  if (currentIndex.value >= words.value.length - 1) {
    sessionStats.value.duration = Math.max(0, Math.round((Date.now() - startedAt.value - pausedTotal.value) / 1000))
    sessionActive.value = false; completed.value = true; return
  }
  currentIndex.value += 1; prepareQuestion()
}
function skip() {
  if (submitting.value || words.value.length <= 1) return
  const word = words.value.splice(currentIndex.value, 1)[0]; const mode = modes.value.splice(currentIndex.value, 1)[0]
  words.value.push(word); modes.value.push(mode); if (currentIndex.value >= words.value.length) currentIndex.value = 0; prepareQuestion()
}
async function toggleFavorite() {
  const previous = currentWord.value.is_favorited
  currentWord.value.is_favorited = !previous
  try {
    await api.updateWord(currentWord.value.id, { is_favorited: currentWord.value.is_favorited })
    toast.success(currentWord.value.is_favorited ? '已加入收藏' : '已取消收藏')
  } catch (error) {
    currentWord.value.is_favorited = previous
    toast.error(error.message)
  }
}
function updateCurrent(updated) { Object.assign(currentWord.value, updated) }
function speak() { if (currentWord.value) { window.speechSynthesis?.cancel(); window.speechSynthesis?.speak(new SpeechSynthesisUtterance(currentWord.value.word)) } }
function pauseStudy() { if (!sessionActive.value || paused.value || submitting.value) return; pausedAt.value = Date.now(); paused.value = true }
function resume() { pausedTotal.value += Date.now() - pausedAt.value; paused.value = false; if (currentMode.value === 'spelling') nextTick(() => spellingInput.value?.focus()) }
function leave() { router.push('/') }
function restart() { completed.value = false; startSession() }
function formatDuration(seconds) { return seconds < 60 ? `${seconds} 秒` : `${Math.floor(seconds / 60)} 分 ${seconds % 60} 秒` }
function handleKey(event) {
  if (event.key === 'Escape' && drawerOpen.value) { drawerOpen.value = false; return }
  if (event.key === 'Escape' && sessionActive.value) { event.preventDefault(); if (paused.value) resume(); else pauseStudy(); return }
  if (paused.value || !sessionActive.value) return
  if (drawerOpen.value) return
  if (event.target instanceof HTMLInputElement || event.target instanceof HTMLTextAreaElement || event.target?.isContentEditable) return
  if (feedback.value && (event.key === 'Enter' || event.key === ' ')) { event.preventDefault(); nextWord(); return }
  if (event.key === ' ' && currentMode.value === 'flashcard') { event.preventDefault(); revealed.value = true; return }
  if (/^[0-5]$/.test(event.key) && currentMode.value === 'flashcard' && revealed.value) { submit(Number(event.key)); return }
  if (event.key.toLowerCase() === 'f') { toggleFavorite(); return }
  if (event.key.toLowerCase() === 's') { skip(); return }
  if (event.key.toLowerCase() === 'p') { speak(); return }
  if (currentMode.value === 'choice' && !feedback.value) {
    const index = choiceShortcutIndex(event.key)
    if (index >= 0 && choices.value[index]) { event.preventDefault(); submitChoice(choices.value[index]) }
  }
}
onMounted(() => { window.addEventListener('keydown', handleKey); if (route.query.start === '1') startSession() })
onBeforeUnmount(() => { window.removeEventListener('keydown', handleKey); window.speechSynthesis?.cancel() })
</script>
