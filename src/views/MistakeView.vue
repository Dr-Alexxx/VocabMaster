<template>
  <div class="page mistake-page">
    <header class="page-header">
      <div><span class="eyebrow">薄弱项管理</span><h1>错题本</h1><p>质量评分低于 3 的单词会自动收录，错误 3 次后进入常错本。</p></div>
      <button class="primary-btn" :disabled="!items.length" @click="startReview"><Play :size="18" fill="currentColor" />专项复习</button>
    </header>
    <div class="segmented compact-segments"><button :class="{ active: tab === 'all' }" @click="changeTab('all')">全部错题 <span>{{ allCount }}</span></button><button :class="{ active: tab === 'frequent' }" @click="changeTab('frequent')">常错词 <span>{{ frequentCount }}</span></button></div>
    <section v-if="loading" class="loading-block">正在读取错题...</section>
    <section v-else-if="items.length" class="mistake-table">
      <div class="table-header"><span>单词</span><span>释义</span><span>错误记录</span><span>最近错误</span><span></span></div>
      <div v-for="item in items" :key="item.id" class="mistake-row" role="button" tabindex="0" @click="openWord(item.id)" @keydown.enter="openWord(item.id)">
        <span class="word-main"><b>{{ item.word }}</b><small>{{ item.vocabulary_name }}</small></span>
        <span class="definition-preview">{{ item.definition[0] }}</span>
        <span><b class="mistake-count">{{ item.mistake_count }} 次</b><small>{{ modeLabel(item.last_mode) }}</small></span>
        <span class="date-cell">{{ formatDate(item.last_mistake_at) }}</span>
        <span class="row-actions"><span v-if="item.is_frequent" class="frequent-tag">常错</span><button class="icon-btn compact" title="移出错题本" @click.stop="remove(item)"><X :size="16" /></button><ChevronRight :size="18" /></span>
      </div>
    </section>
    <EmptyState v-else :icon="CircleCheckBig" title="当前没有错题" description="继续保持。之后答错的单词会自动出现在这里。" />
    <WordDrawer :open="drawerOpen" :word-id="selectedWord" @close="drawerOpen = false" />
  </div>
</template>

<script setup>
import { onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronRight, CircleCheckBig, Play, X } from 'lucide-vue-next'
import EmptyState from '@/components/EmptyState.vue'
import WordDrawer from '@/components/WordDrawer.vue'
import { api } from '@/services/api.js'
import { useToast } from '@/composables/useToast.js'

const router = useRouter(); const toast = useToast(); const tab = ref('all'); const items = ref([]); const loading = ref(false)
const allCount = ref(0); const frequentCount = ref(0); const drawerOpen = ref(false); const selectedWord = ref(null)
async function load() {
  loading.value = true
  try {
    const all = await api.mistakes(false); allCount.value = all.length; frequentCount.value = all.filter((item) => item.is_frequent).length
    items.value = tab.value === 'frequent' ? all.filter((item) => item.is_frequent) : all
  } catch (error) { toast.error(error.message) } finally { loading.value = false }
}
function changeTab(value) { tab.value = value; load() }
function startReview() { router.push({ name: 'study', query: { source: 'mistakes', mode: 'mixed', start: '1' } }) }
function openWord(id) { selectedWord.value = id; drawerOpen.value = true }
async function remove(item) { await api.removeMistake(item.id); toast.success(`${item.word} 已移出错题本`); load() }
function modeLabel(mode) { return ({ flashcard: '卡片模式', spelling: '拼写模式', choice: '选择题' })[mode] || '学习模式' }
function formatDate(value) { return value ? new Intl.DateTimeFormat('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(new Date(value.replace(' ', 'T') + 'Z')) : '--' }
onMounted(load)
</script>
