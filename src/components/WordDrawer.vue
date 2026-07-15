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
              <p v-for="example in word.examples" :key="example" class="example">{{ example }}</p>
            </section>
            <section v-if="word.etymology || word.synonyms?.length || word.antonyms?.length" class="word-relations">
              <div v-if="word.etymology"><span>词源</span><p>{{ word.etymology }}</p></div>
              <div v-if="word.synonyms?.length"><span>同义词</span><p>{{ word.synonyms.join(' · ') }}</p></div>
              <div v-if="word.antonyms?.length"><span>反义词</span><p>{{ word.antonyms.join(' · ') }}</p></div>
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

const props = defineProps({ open: Boolean, wordId: Number })
const emit = defineEmits(['close', 'updated'])
const toast = useToast()
const loading = ref(false)
const word = ref(null)
const notes = ref('')

watch(() => [props.open, props.wordId], async ([open, id]) => {
  if (!open || !id) return
  loading.value = true
  try {
    word.value = await api.getWord(id)
    notes.value = word.value?.notes || ''
  } catch (error) { toast.error(error.message) }
  finally { loading.value = false }
}, { immediate: true })

function statusLabel(status) { return ({ new: '新词', learning: '学习中', review: '复习中', mastered: '已掌握' })[status] || '新词' }
function speak() { if (word.value) window.speechSynthesis?.speak(new SpeechSynthesisUtterance(word.value.word)) }
async function toggleFavorite() {
  word.value = { ...word.value, is_favorited: !word.value.is_favorited }
  await api.updateWord(word.value.id, { is_favorited: word.value.is_favorited })
  emit('updated', word.value)
}
async function save() {
  await api.updateWord(word.value.id, { notes: notes.value })
  word.value.notes = notes.value
  toast.success('笔记已保存')
  emit('updated', word.value)
}
</script>
