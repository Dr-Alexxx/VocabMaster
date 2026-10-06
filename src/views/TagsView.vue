<template>
  <div class="page">
    <header class="page-header"><div><span class="eyebrow">个人词汇</span><h1>收藏与标签</h1><p>标签可组织任意单词，删除标签会保留单词和学习记录。</p></div></header>
    <form class="tag-form" @submit.prevent="create"><input v-model="name" maxlength="40" placeholder="新标签，例如考试重点" aria-label="新标签名称" /><button class="primary-btn" :disabled="!name.trim()">创建标签</button></form>
    <div class="tag-filter"><button :class="{ active: selected === null }" @click="select(null)">全部收藏</button><button v-for="tag in tags" :key="tag.id" :class="{ active: selected === tag.id }" @click="select(tag.id)">{{ tag.name }} · {{ tag.word_count }}</button></div>
    <div v-if="selected !== null" class="tag-tools"><input v-model="rename" maxlength="40" aria-label="标签名称" /><button class="secondary-btn" @click="renameTag">重命名</button><button class="secondary-btn" @click="deleteOpen = true">删除标签</button><button class="primary-btn" :disabled="!words.length" @click="review">专项复习</button></div>
    <input v-model="query" class="word-filter" placeholder="筛选单词或释义" aria-label="筛选当前列表" />
    <div v-if="filtered.length" class="word-table"><button v-for="word in filtered" :key="word.id" class="word-row" @click="open(word.id)"><span class="word-main"><b>{{ word.word }}</b><small>{{ word.phonetic }}</small></span><span class="definition-preview">{{ word.definition[0] }}</span><span class="status-chip">{{ word.vocabulary_name }}</span><ChevronRight :size="18" /></button></div>
    <EmptyState v-else :icon="Tags" title="暂无单词" description="在单词详情中收藏或添加标签，之后会显示在这里。" />
    <WordDrawer :open="drawerOpen" :word-id="wordId" @close="drawerOpen = false" @updated="load" />
    <ConfirmDialog :open="deleteOpen" title="删除此标签？" message="只删除标签和关联，单词、收藏与学习记录会保留。" confirm-text="删除标签" @cancel="deleteOpen = false" @confirm="deleteTag" />
  </div>
</template>
<script setup>
import { computed, onMounted, ref } from 'vue'
import { useRouter } from 'vue-router'
import { ChevronRight, Tags } from 'lucide-vue-next'
import WordDrawer from '@/components/WordDrawer.vue'
import EmptyState from '@/components/EmptyState.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { api } from '@/services/api.js'
import { useToast } from '@/composables/useToast.js'
const router = useRouter(); const toast = useToast(); const tags = ref([]); const words = ref([]); const selected = ref(null)
const name = ref(''); const rename = ref(''); const query = ref(''); const deleteOpen = ref(false); const drawerOpen = ref(false); const wordId = ref(null)
const filtered = computed(() => words.value.filter((word) => `${word.word} ${word.definition.join(' ')}`.toLowerCase().includes(query.value.trim().toLowerCase())))
async function load() { try { tags.value = await api.listTags(); words.value = await api.favorites(selected.value) } catch (error) { toast.error(error.message) } }
async function select(id) { selected.value = id; rename.value = tags.value.find((tag) => tag.id === id)?.name || ''; await load() }
async function create() { try { const id = await api.saveTag(name.value); name.value = ''; await load(); await select(id) } catch (error) { toast.error(error.message) } }
async function renameTag() { try { await api.saveTag(rename.value, selected.value); await load() } catch (error) { toast.error(error.message) } }
async function deleteTag() { try { await api.deleteTag(selected.value); deleteOpen.value = false; await select(null) } catch (error) { toast.error(error.message) } }
function open(id) { wordId.value = id; drawerOpen.value = true }
function review() { router.push({ name: 'study', query: { source: 'tag', tagId: selected.value, mode: 'mixed', start: '1' } }) }
onMounted(load)
</script>
<style scoped>
.tag-form,.tag-tools { display: flex; gap: 8px; flex-wrap: wrap; margin-bottom: 16px; }.tag-form input,.tag-tools input,.word-filter { min-height: 40px; padding: 8px 12px; }.tag-filter { display: flex; flex-wrap: wrap; gap: 6px; margin: 18px 0; }.tag-filter button { min-height: 40px; padding: 6px 12px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface); cursor: pointer; }.tag-filter button.active { background: var(--primary-soft); border-color: var(--primary); color: var(--primary-dark); }.word-filter { width: min(400px,100%); margin-bottom: 15px; }
</style>
