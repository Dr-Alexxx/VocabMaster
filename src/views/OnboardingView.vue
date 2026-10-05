<template>
  <div class="onboarding-page">
    <header class="onboarding-header">
      <div class="brand-mark"><img src="/app-icon.png" alt="" /><div><b>VocabMaster</b><span>首次设置</span></div></div>
      <button class="text-btn" @click="finish">稍后设置</button>
    </header>
    <main class="onboarding-content">
      <div class="onboarding-progress" aria-label="设置步骤">
        <span v-for="step in 3" :key="step" :class="{ active: currentStep === step, complete: currentStep > step }">{{ step }}</span>
      </div>

      <section v-if="currentStep === 1" class="onboarding-step">
        <span class="eyebrow">01 / 选择词库</span><h1>你准备学习哪些词汇？</h1><p>选择的词库会加入今日计划，之后可以随时调整。</p>
        <div v-if="loadingVocabularies" class="loading-block">正在读取本机词库...</div>
        <div v-else class="onboarding-vocab-list">
          <label v-for="vocab in vocabularies" :key="vocab.id" class="onboarding-vocab" :class="{ selected: selectedVocabIds.has(vocab.id) }">
            <input v-model="selectedVocabIds" type="checkbox" :value="vocab.id" />
            <span class="onboarding-check"><Check :size="16" /></span>
            <span class="onboarding-vocab-copy"><b>{{ vocab.name }}</b><small>{{ vocab.description || '自定义词库' }} · {{ vocab.total.toLocaleString() }} 个词</small></span>
            <span class="onboarding-vocab-count">{{ vocab.total.toLocaleString() }}</span>
          </label>
          <EmptyState v-if="!vocabularies.length" :icon="LibraryBig" title="暂时没有词库" description="完成设置后可从词库管理导入或启用词库。" />
        </div>
        <p v-if="error" class="onboarding-error">{{ error }}</p>
        <footer class="onboarding-actions"><button class="secondary-btn" @click="finish">跳过</button><button class="primary-btn" :disabled="!selectedVocabIds.size || saving" @click="saveVocabularies">继续 <ArrowRight :size="17" /></button></footer>
      </section>

      <section v-else-if="currentStep === 2" class="onboarding-step">
        <span class="eyebrow">02 / 设置计划</span><h1>每天安排多少学习量？</h1><p>复习会优先安排，新词在复习之后加入。</p>
        <div class="onboarding-fields">
          <label><span>每日新词上限</span><div class="stepper"><button title="减少" @click="adjust('dailyNewLimit', -5, 5, 200)"><Minus :size="16" /></button><input v-model.number="settings.values.dailyNewLimit" type="number" min="5" max="200" /><button title="增加" @click="adjust('dailyNewLimit', 5, 5, 200)"><Plus :size="16" /></button></div><small>建议从 10–20 个开始</small></label>
          <label><span>每日复习上限</span><div class="stepper"><button title="减少" @click="adjust('dailyReviewLimit', -10, 20, 500)"><Minus :size="16" /></button><input v-model.number="settings.values.dailyReviewLimit" type="number" min="20" max="500" /><button title="增加" @click="adjust('dailyReviewLimit', 10, 20, 500)"><Plus :size="16" /></button></div><small>到期词数量较多时可适当提高</small></label>
          <label><span>考试或学习目标截止日 <em>可选</em></span><input v-model="settings.values.goalDeadline" class="onboarding-date" type="date" /><small>设置后会按剩余词量建议每日新词数</small></label>
        </div>
        <footer class="onboarding-actions"><button class="secondary-btn" @click="currentStep = 1"><ArrowLeft :size="17" />返回</button><button class="primary-btn" @click="prepareDiagnostic">继续 <ArrowRight :size="17" /></button></footer>
      </section>

      <section v-else class="onboarding-step">
        <span class="eyebrow">03 / 了解起点</span><h1>{{ diagnosticStarted ? `快速评估 ${diagnosticIndex + 1} / ${diagnosticWords.length}` : diagnosticFinished ? '评估完成' : '做一组快速评估？' }}</h1>
        <p v-if="!diagnosticStarted && !diagnosticFinished">10 道选择题只用于推荐新词量，不会保存为学习记录，也不会改变记忆曲线。</p>
        <template v-if="diagnosticStarted && diagnosticWord">
          <div class="diagnostic-question"><span class="question-label">选择正确释义</span><h2>{{ diagnosticWord.word }}</h2><p v-if="diagnosticWord.phonetic" class="phonetic">{{ diagnosticWord.phonetic }}</p></div>
          <div class="diagnostic-options"><button v-for="(option, index) in diagnosticChoices" :key="`${diagnosticIndex}-${option}`" :disabled="answering" @click="answerDiagnostic(option)"><span>{{ String.fromCharCode(65 + index) }}</span><b>{{ option }}</b></button></div>
        </template>
        <div v-else-if="diagnosticFinished" class="diagnostic-result"><strong>{{ diagnosticScore }} / {{ diagnosticWords.length }}</strong><span>建议每日新词 {{ recommendedNewLimit }} 个</span><small>这是初始建议，你可以在设置中随时调整。</small></div>
        <div v-else class="diagnostic-intro"><ClipboardCheck :size="30" /><b>约 2 分钟 · 10 道选择题</b><small>可跳过，之后也能直接开始学习。</small></div>
        <p v-if="error" class="onboarding-error">{{ error }}</p>
        <footer class="onboarding-actions">
          <button class="secondary-btn" @click="currentStep = 2"><ArrowLeft :size="17" />返回</button>
          <button v-if="!diagnosticStarted && !diagnosticFinished" class="secondary-btn" :disabled="loadingDiagnostic" @click="finish">{{ loadingDiagnostic ? '正在准备...' : '跳过评估' }}</button>
          <button v-if="diagnosticFinished" class="secondary-btn" @click="finish">保留当前计划</button>
          <button v-if="diagnosticFinished" class="primary-btn" @click="finish(true)">使用建议并开始 <ArrowRight :size="17" /></button>
          <button v-else-if="!diagnosticStarted" class="primary-btn" :disabled="loadingDiagnostic" @click="startDiagnostic"><ClipboardCheck :size="17" />{{ loadingDiagnostic ? '正在准备...' : '开始 10 题评估' }}</button>
        </footer>
      </section>
    </main>
    <footer class="onboarding-footnote"><ShieldCheck :size="15" />所有词库和学习数据保存在本机</footer>
  </div>
</template>

<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ArrowLeft, ArrowRight, Check, ClipboardCheck, LibraryBig, Minus, Plus, ShieldCheck } from 'lucide-vue-next'
import EmptyState from '@/components/EmptyState.vue'
import { api } from '@/services/api.js'
import { useSettingsStore } from '@/stores/settings.js'
import { useToast } from '@/composables/useToast.js'

const router = useRouter(); const settings = useSettingsStore(); const toast = useToast()
const currentStep = ref(1); const vocabularies = ref([]); const selectedVocabIds = ref(new Set())
const loadingVocabularies = ref(false); const saving = ref(false); const error = ref('')
const loadingDiagnostic = ref(false); const diagnosticWords = ref([]); const diagnosticPool = ref([])
const diagnosticIndex = ref(0); const diagnosticScore = ref(0); const diagnosticChoices = ref([]); const answering = ref(false)
const diagnosticStarted = ref(false); const diagnosticFinished = ref(false)
const diagnosticWord = computed(() => diagnosticWords.value[diagnosticIndex.value] || null)
const recommendedNewLimit = computed(() => diagnosticScore.value >= 8 ? 20 : diagnosticScore.value >= 5 ? 15 : 10)

function adjust(key, delta, min, max) { settings.values[key] = Math.max(min, Math.min(max, Number(settings.values[key]) + delta)) }
function shuffled(values) { return [...values].sort(() => Math.random() - 0.5) }
function buildChoices() {
  const correct = diagnosticWord.value?.definition?.[0]
  const distractors = shuffled(diagnosticPool.value.filter((item) => item && item !== correct)).slice(0, 3)
  diagnosticChoices.value = shuffled([...new Set([correct, ...distractors])].filter(Boolean))
}
async function loadVocabularies() {
  loadingVocabularies.value = true
  try {
    vocabularies.value = await api.vocabularies()
    selectedVocabIds.value = new Set(vocabularies.value.filter((item) => item.is_active).map((item) => item.id))
  } catch (cause) { error.value = cause.message }
  finally { loadingVocabularies.value = false }
}
async function saveVocabularies() {
  saving.value = true; error.value = ''
  try {
    await Promise.all(vocabularies.value.map((item) => api.setVocabularyActive(item.id, selectedVocabIds.value.has(item.id))))
    currentStep.value = 2
  } catch (cause) { error.value = cause.message }
  finally { saving.value = false }
}
async function prepareDiagnostic() {
  error.value = ''; currentStep.value = 3
}
async function startDiagnostic() {
  loadingDiagnostic.value = true; error.value = ''
  try {
    const plan = await api.dailyPlan({ ...settings.values }, 'test')
    diagnosticWords.value = plan.words.slice(0, 10)
    diagnosticPool.value = plan.choicePool || []
    if (!diagnosticWords.value.length) { error.value = '当前词库没有可用于评估的单词，可以跳过评估继续。'; return }
    diagnosticStarted.value = true
    buildChoices()
  } catch (cause) { error.value = cause.message }
  finally { loadingDiagnostic.value = false }
}
function answerDiagnostic(option) {
  if (answering.value || !diagnosticWord.value) return
  answering.value = true
  if (option === diagnosticWord.value.definition[0]) diagnosticScore.value += 1
  window.setTimeout(() => {
    diagnosticIndex.value += 1
    if (diagnosticIndex.value >= diagnosticWords.value.length) {
      diagnosticStarted.value = false; diagnosticFinished.value = true
    } else buildChoices()
    answering.value = false
  }, 240)
}
async function finish(applyRecommendation = false) {
  if (applyRecommendation && diagnosticFinished.value) settings.values.dailyNewLimit = recommendedNewLimit.value
  settings.values.onboardingComplete = true
  try {
    await settings.save()
    await router.replace({ name: 'home' })
  } catch (cause) { toast.error(cause.message) }
}
onMounted(loadVocabularies)
</script>

<style scoped>
.onboarding-page { display: grid; grid-template-rows: auto minmax(0,1fr) auto; min-height: 100%; padding: 22px max(24px, env(safe-area-inset-left)) calc(18px + env(safe-area-inset-bottom)); color: var(--text); }
.onboarding-header { display: flex; align-items: center; justify-content: space-between; width: min(100%, 920px); margin: 0 auto; }
.brand-mark { display: flex; align-items: center; gap: 10px; }.brand-mark img { width: 38px; height: 38px; border-radius: 7px; }.brand-mark div { display: grid; }.brand-mark span { color: var(--text-soft); font-size: 11px; }
.onboarding-content { align-self: center; width: min(620px, 100%); margin: 30px auto; }.onboarding-progress { display: flex; justify-content: center; gap: 10px; margin-bottom: 30px; }.onboarding-progress span { display: grid; place-items: center; width: 30px; height: 30px; color: var(--text-faint); background: var(--surface); border: 1px solid var(--border); border-radius: 50%; font-size: 12px; }.onboarding-progress .active { color: white; background: var(--primary); border-color: var(--primary); }.onboarding-progress .complete { color: var(--success); border-color: var(--success); }
.onboarding-step h1 { margin-bottom: 7px; font-size: 28px; }.onboarding-step > p { color: var(--text-soft); }.onboarding-vocab-list { display: grid; gap: 8px; max-height: min(46vh, 430px); margin-top: 24px; overflow: auto; }.onboarding-vocab { display: grid; grid-template-columns: 18px 22px minmax(0,1fr) auto; align-items: center; gap: 10px; min-height: 68px; padding: 11px 13px; background: var(--surface); border: 1px solid var(--border); border-radius: 7px; cursor: pointer; }.onboarding-vocab.selected { border-color: var(--primary); background: var(--primary-soft); }.onboarding-vocab input { width: 16px; height: 16px; accent-color: var(--primary); }.onboarding-check { display: grid; place-items: center; width: 22px; height: 22px; color: var(--text-faint); border: 1px solid var(--border-strong); border-radius: 5px; }.onboarding-vocab:not(.selected) .onboarding-check svg { opacity: 0; }.onboarding-vocab-copy { display: grid; min-width: 0; }.onboarding-vocab-copy small { color: var(--text-soft); overflow-wrap: anywhere; }.onboarding-vocab-count { color: var(--text-soft); font-size: 12px; }
.onboarding-actions { display: flex; justify-content: flex-end; flex-wrap: wrap; gap: 8px; margin-top: 26px; }.onboarding-actions button { min-height: 44px; }.onboarding-error { margin-top: 12px; color: var(--danger) !important; }.onboarding-fields { display: grid; gap: 19px; margin-top: 28px; padding: 22px; background: var(--surface); border: 1px solid var(--border); border-radius: 7px; }.onboarding-fields > label { display: grid; grid-template-columns: minmax(0,1fr) auto; align-items: center; gap: 5px 18px; }.onboarding-fields > label > span { font-weight: 650; }.onboarding-fields em { color: var(--text-faint); font-size: 11px; font-style: normal; font-weight: 400; }.onboarding-fields small { grid-column: 1 / -1; color: var(--text-soft); font-size: 12px; }.onboarding-date { grid-column: 1 / -1; width: 100%; height: 40px; padding: 0 10px; }
.diagnostic-intro,.diagnostic-result { display: grid; justify-items: center; gap: 8px; min-height: 220px; align-content: center; margin-top: 20px; color: var(--primary); }.diagnostic-intro b,.diagnostic-result span { color: var(--text); }.diagnostic-intro small,.diagnostic-result small { color: var(--text-soft); }.diagnostic-result strong { font-size: 42px; }.diagnostic-question { display: grid; justify-items: center; gap: 4px; min-height: 148px; align-content: center; margin-top: 18px; background: var(--surface); border: 1px solid var(--border); border-radius: 7px; }.diagnostic-question h2 { font-size: 28px; }.diagnostic-question .phonetic { font-size: 14px; }.diagnostic-options { display: grid; grid-template-columns: repeat(2,minmax(0,1fr)); gap: 8px; margin-top: 10px; }.diagnostic-options button { display: grid; grid-template-columns: 26px 1fr; align-items: center; gap: 8px; min-height: 58px; padding: 9px; text-align: left; background: var(--surface); border: 1px solid var(--border); border-radius: 6px; }.diagnostic-options button:disabled { opacity: .6; }.diagnostic-options button span { display: grid; place-items: center; width: 26px; height: 26px; border: 1px solid var(--border); border-radius: 50%; }.diagnostic-options button b { overflow-wrap: anywhere; font-weight: 550; }
.onboarding-footnote { display: flex; align-items: center; justify-content: center; gap: 6px; color: var(--text-faint); font-size: 11px; }.onboarding-footnote svg { color: var(--success); }
@media (max-width: 767.98px) { .onboarding-page { min-height: 100%; padding: 14px 16px calc(20px + env(safe-area-inset-bottom)); }.onboarding-content { margin: 20px auto; }.onboarding-step h1 { font-size: 24px; }.onboarding-vocab { grid-template-columns: 18px 20px minmax(0,1fr); }.onboarding-vocab-count { display: none; }.onboarding-fields { padding: 16px; }.diagnostic-options { grid-template-columns: 1fr; }.onboarding-actions { justify-content: stretch; }.onboarding-actions button { flex: 1; } }
</style>
