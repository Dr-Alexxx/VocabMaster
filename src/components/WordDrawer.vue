<template>
  <Teleport to="body">
    <Transition name="drawer">
      <div v-if="open" class="drawer-layer" @click.self="$emit('close')">
        <aside class="word-drawer" aria-label="单词详情">
          <header>
            <div>
              <span class="eyebrow">{{ word?.vocabulary_name || '单词详情' }}</span>
              <h2>{{ word?.word || '加载中' }}</h2>
              <p v-if="word?.phonetic" class="phonetic">{{ word.phonetic }}</p>
            </div>
            <div class="icon-actions">
              <button class="icon-btn" title="朗读" :disabled="!word" @click="speak"><Volume2 :size="19" /></button>
              <button class="icon-btn" title="关闭" @click="$emit('close')"><X :size="20" /></button>
            </div>
          </header>
          <div v-if="loading" class="loading-block">正在读取单词详情...</div>
          <div v-else-if="word" class="drawer-content">
            <section>
              <h3>释义</h3>
              <ol class="definition-list"><li v-for="item in word.definition" :key="item">{{ item }}</li></ol>
            </section>
            <section v-if="word.examples?.length">
              <h3>例句</h3>
              <div v-for="example in word.examples" :key="example" class="example"><p>{{ example }}</p><button class="text-btn" @click="speakWord(example)"><Volume2 :size="16" />朗读例句</button></div>
            </section>
            <section v-if="word.etymology || word.synonyms?.length || word.antonyms?.length" class="word-relations">
              <div v-if="word.etymology"><span>词源</span><p>{{ word.etymology }}</p></div>
              <div v-if="word.synonyms?.length"><span>同义词</span><p>{{ word.synonyms.join(' · ') }}</p></div>
              <div v-if="word.antonyms?.length"><span>反义词</span><p>{{ word.antonyms.join(' · ') }}</p></div>
            </section>
            <section v-if="word.roots || word.word_family?.length || word.collocations?.length" class="word-relations">
              <div v-if="word.roots"><span>词根 / 词缀</span><p>{{ word.roots }}</p></div>
              <div v-if="word.word_family?.length"><span>词族</span><p>{{ word.word_family.join(' · ') }}</p></div>
              <div v-if="word.collocations?.length"><span>常见搭配</span><p>{{ word.collocations.join(' · ') }}</p></div>
            </section>
            <section v-if="word.content_source || word.content_license" class="word-relations"><span>素材来源与许可</span><p>{{ word.content_source || '未提供来源' }} · {{ word.content_license || '未声明再分发许可' }}</p></section>
            <section>
              <h3>标签</h3>
              <div class="word-tags"><label v-for="tag in tags" :key="tag.id"><input v-model="tagIds" type="checkbox" :value="tag.id" :disabled="savingTags" @change="saveTags" />{{ tag.name }}</label></div>
              <form class="new-tag" @submit.prevent="addTag"><input v-model="newTag" maxlength="40" placeholder="创建标签" aria-label="新标签" /><button class="secondary-btn" :disabled="!newTag.trim() || savingTags">添加</button></form>
            </section>
            <section v-if="word.mistakeHistory?.length">
              <h3>错题原因</h3><div v-for="record in word.mistakeHistory" :key="record.id" class="mistake-entry"><small>{{ record.studied_at }} · {{ record.study_mode }}</small><MistakeReasonPicker :history-id="record.id" :reason="record.mistake_reason" @updated="record.mistake_reason = $event; emit('updated', word)" /></div>
            </section>
            <section>
              <h3>学习记录</h3>
              <div class="mini-stats">
                <span><b>{{ statusLabel(word.status) }}</b>状态</span>
                <span><b>{{ word.study_count || 0 }}</b>学习次数</span>
                <span><b>{{ word.accuracy == null ? '--' : `${word.accuracy}%` }}</b>正确率</span>
              </div>
            </section>
            <section>
              <label class="field-label" for="word-notes">个人笔记</label>
              <textarea id="word-notes" v-model="notes" rows="5" maxlength="4000" placeholder="记录词根、联想或记忆技巧"></textarea>
            </section>
          </div>
          <footer v-if="word">
            <button class="secondary-btn" @click="toggleFavorite">
              <Star :size="18" :fill="word.is_favorited ? 'currentColor' : 'none'" />
              {{ word.is_favorited ? '取消收藏' : '收藏单词' }}
            </button>
            <button class="primary-btn" @click="save"><Save :size="18" />保存笔记</button>
          </footer>
        </aside>
      </div>
    </Transition>
  </Teleport>
</template>

<script setup>
import { ref, watch } from 'vue'
import { Save, Star, Volume2, X } from 'lucide-vue-next'
import { api } from '@/services/api.js'
import { useToast } from '@/composables/useToast.js'
import { useSpeech } from '@/composables/useSpeech.js'
import MistakeReasonPicker from '@/components/MistakeReasonPicker.vue'

const props = defineProps({ open: Boolean, wordId: Number })
const emit = defineEmits(['close', 'updated'])
const toast = useToast()
const { speak: speakWord } = useSpeech()
const loading = ref(false)
const word = ref(null)
const notes = ref('')
const tags = ref([]); const tagIds = ref([]); const newTag = ref(''); const savingTags = ref(false)

watch(() => [props.open, props.wordId], async ([open, id]) => {
  if (!open || !id) return
  loading.value = true
  try {
    word.value = await api.getWord(id)
    notes.value = word.value?.notes || ''
    tags.value = await api.listTags(); tagIds.value = word.value?.tags?.map((tag) => tag.id) || []; newTag.value = ''
  } catch (error) { toast.error(error.message) }
  finally { loading.value = false }
}, { immediate: true })

function statusLabel(status) { return ({ new: '新词', learning: '学习中', review: '复习中', mastered: '已掌握' })[status] || '新词' }
function speak() { if (word.value) speakWord(word.value.word) }
async function saveTags() {
  savingTags.value = true
  try { await api.setWordTags(word.value.id, [...tagIds.value]); word.value.tags = tags.value.filter((tag) => tagIds.value.includes(tag.id)); emit('updated', word.value) }
  catch (error) { tagIds.value = word.value.tags.map((tag) => tag.id); toast.error(error.message) }
  finally { savingTags.value = false }
}
async function addTag() {
  try { const id = await api.saveTag(newTag.value); tags.value = await api.listTags(); tagIds.value.push(id); newTag.value = ''; await saveTags() }
  catch (error) { toast.error(error.message) }
}
async function toggleFavorite() {
  const previous = word.value.is_favorited
  word.value = { ...word.value, is_favorited: !previous }
  try {
    await api.updateWord(word.value.id, { is_favorited: word.value.is_favorited })
    emit('updated', word.value)
  } catch (error) {
    word.value = { ...word.value, is_favorited: previous }
    toast.error(error.message)
  }
}
async function save() {
  await api.updateWord(word.value.id, { notes: notes.value })
  word.value.notes = notes.value
  toast.success('笔记已保存')
  emit('updated', word.value)
}
</script>

<style scoped>
.word-tags { display: flex; flex-wrap: wrap; gap: 8px; }.word-tags label { display: flex; align-items: center; gap: 5px; padding: 6px 9px; border: 1px solid var(--border); border-radius: 5px; }.word-tags input { accent-color: var(--primary); }.new-tag { display: flex; gap: 8px; margin-top: 12px; }.new-tag input { min-width: 0; width: 100%; padding: 6px 8px; }.mistake-entry { padding-block: 10px; border-bottom: 1px solid var(--border); }.mistake-entry small { color: var(--text-faint); }
</style>
