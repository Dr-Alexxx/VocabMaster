<template>
  <div class="page vocab-page">
    <header class="page-header">
      <div><span class="eyebrow">内容管理</span><h1>词库管理</h1><p>启用的词库会共同参与每日学习计划。</p></div>
      <div class="vocab-header-actions">
        <button class="secondary-btn" @click="specsOpen = true"><BookText :size="18" />词库制作规范</button>
        <button class="primary-btn" @click="selectImport"><Upload :size="18" />导入词库</button>
      </div>
    </header>

    <section class="vocab-summary">
      <div><b>{{ vocabularies.length }}</b><span>词库</span></div><div><b>{{ totalWords }}</b><span>总词数</span></div><div><b>{{ activeCount }}</b><span>已启用</span></div><div><b>{{ learnedWords }}</b><span>已学</span></div>
    </section>

    <section v-if="loading" class="loading-block">正在读取词库...</section>
    <section v-else class="vocab-list">
      <article v-for="vocab in vocabularies" :key="vocab.id" class="vocab-row">
        <div class="vocab-symbol" :class="vocab.type.toLowerCase()"><BookOpenText :size="23" /></div>
        <div class="vocab-info">
          <div class="vocab-title"><h2>{{ vocab.name }}</h2><span v-if="vocab.is_default" class="system-tag">系统</span></div>
          <p>{{ vocab.description }}</p>
          <div class="vocab-progress"><div class="progress-track"><span :style="{ width: `${percentage(vocab)}%` }"></span></div><span>{{ vocab.learned }} / {{ vocab.total }} 已学</span><b>{{ percentage(vocab) }}%</b></div>
        </div>
        <div class="vocab-actions">
          <label class="switch" :title="vocab.is_active ? '停用词库' : '启用词库'"><input type="checkbox" :checked="vocab.is_active" @change="toggleActive(vocab, $event.target.checked)" /><span></span></label>
          <button class="icon-btn" title="导出 JSON" @click="exportVocab(vocab, 'json')"><FileJson :size="18" /></button>
          <button class="icon-btn" title="导出 CSV" @click="exportVocab(vocab, 'csv')"><FileText :size="18" /></button>
          <button v-if="!vocab.is_default" class="icon-btn danger-icon" title="删除词库" @click="askDelete(vocab)"><Trash2 :size="18" /></button>
        </div>
      </article>
    </section>

    <Teleport to="body">
      <div v-if="importPreview" class="dialog-layer" @click.self="closeImport">
        <section class="dialog import-dialog" role="dialog" aria-modal="true">
          <header><div><span class="eyebrow">导入预览</span><h2>{{ importPreview.filename }}</h2><p>共 {{ importPreview.rowCount }} 行，确认字段映射后写入新词库。</p></div><button class="icon-btn" title="关闭" @click="closeImport"><X :size="20" /></button></header>
          <div class="import-fields">
            <label><span>词库名称</span><input v-model="importName" maxlength="80" /></label>
            <label v-for="field in mappingFields" :key="field.key"><span>{{ field.label }}<b v-if="field.required"> *</b></span><select v-model="mapping[field.key]"><option value="">不导入</option><option v-for="header in importPreview.headers" :key="header" :value="header">{{ header }}</option></select></label>
          </div>
          <div class="import-table-wrap"><table><thead><tr><th v-for="header in importPreview.headers" :key="header">{{ header }}</th></tr></thead><tbody><tr v-for="(row, index) in importPreview.sample" :key="index"><td v-for="(cell, cellIndex) in row" :key="cellIndex">{{ displayCell(cell) }}</td></tr></tbody></table></div>
          <footer><span>{{ importPreview.rowCount }} 行等待导入</span><div><button class="secondary-btn" @click="closeImport">取消</button><button class="primary-btn" :disabled="!mapping.word || importing" @click="commitImport">{{ importing ? '正在导入...' : '确认导入' }}</button></div></footer>
        </section>
      </div>
    </Teleport>
    <Teleport to="body">
      <div v-if="specsOpen" class="dialog-layer" @click.self="specsOpen = false">
        <section class="dialog spec-dialog" role="dialog" aria-modal="true" aria-labelledby="vocab-spec-title">
          <header>
            <div><span class="eyebrow">Creator specification · v1.0</span><h2 id="vocab-spec-title">VocabMaster 词库制作规范</h2><p>按此规范制作的文件可直接预览、映射并导入为自定义词库。</p></div>
            <button class="icon-btn" title="关闭" @click="specsOpen = false"><X :size="20" /></button>
          </header>
          <div class="spec-content">
            <section class="spec-summary">
              <CircleCheck :size="22" />
              <div><b>最小可用词条只需要两个字段</b><p><code>word</code> 与 <code>definition</code> 必须有值；其他字段均可留空。导入时可以手动映射任意列名。</p></div>
            </section>

            <section>
              <h3>支持格式</h3>
              <div class="spec-formats">
                <div><FileSpreadsheet :size="19" /><span><b>Excel</b><small>.xlsx / .xls，只读取第一个工作表</small></span></div>
                <div><FileText :size="19" /><span><b>CSV / TXT</b><small>逗号或制表符分列，支持 UTF-8 与 GB18030</small></span></div>
                <div><FileJson :size="19" /><span><b>JSON</b><small>词条数组，或包含 words 数组的对象</small></span></div>
              </div>
            </section>

            <section>
              <h3>标准字段</h3>
              <div class="spec-table-wrap">
                <table class="spec-table">
                  <thead><tr><th>字段名</th><th>要求</th><th>数据类型</th><th>内容规范</th></tr></thead>
                  <tbody><tr v-for="field in fieldSpecs" :key="field.name"><td><code>{{ field.name }}</code><span>{{ field.label }}</span></td><td><b :class="{ required: field.required }">{{ field.required ? '必填' : '可选' }}</b></td><td>{{ field.type }}</td><td>{{ field.rule }}</td></tr></tbody>
                </table>
              </div>
            </section>

            <section class="spec-rules">
              <h3>数据与导入规则</h3>
              <ol>
                <li><b>首行与键名：</b>表格建议使用上方英文标准字段名；也可使用中文或自定义列名，并在导入预览中手动映射。</li>
                <li><b>多值字段：</b>CSV、Excel、TXT 中推荐用竖线 <code>|</code> 分隔多个释义、例句或近反义词；分号 <code>;</code>、<code>；</code> 也兼容。JSON 应优先使用字符串数组。</li>
                <li><b>空值处理：</b><code>word</code> 或 <code>definition</code> 为空的行会被跳过；其他字段为空不会影响导入。</li>
                <li><b>重复处理：</b>同一文件中拼写相同的单词不区分大小写，仅保留第一条；不同词库允许包含相同单词，学习时可启用跨词库去重。</li>
                <li><b>文件内容：</b>Excel 仅读取第一个工作表和单元格最终值；请勿依赖宏、批注、图片或复杂公式。推荐单个文件不超过 50,000 行。</li>
                <li><b>文本编码：</b>优先使用 UTF-8；CSV 用 UTF-8 BOM 可提高 Excel 中文兼容性。系统也会在检测到乱码时尝试 GB18030。</li>
              </ol>
            </section>

            <section class="spec-examples">
              <div><h3>CSV / Excel 示例</h3><pre><code>{{ csvExample }}</code></pre></div>
              <div><h3>JSON 示例</h3><pre><code>{{ jsonExample }}</code></pre></div>
            </section>
          </div>
          <footer>
            <span>模板包含 8 个标准字段和 2 条示例数据</span>
            <div>
              <button class="secondary-btn" :disabled="savingTemplate" @click="downloadTemplate('csv')"><Download :size="17" />CSV 模板</button>
              <button class="secondary-btn" :disabled="savingTemplate" @click="downloadTemplate('xlsx')"><Download :size="17" />Excel 模板</button>
              <button class="primary-btn" :disabled="savingTemplate" @click="downloadTemplate('json')"><Download :size="17" />JSON 模板</button>
            </div>
          </footer>
        </section>
      </div>
    </Teleport>
    <ConfirmDialog :open="Boolean(pendingDelete)" title="删除自定义词库" :message="`将永久删除“${pendingDelete?.name || ''}”及其学习记录，此操作无法撤销。`" confirm-text="删除词库" tone="danger" @cancel="pendingDelete = null" @confirm="deleteVocab" />
  </div>
</template>

<script setup>
import { computed, onMounted, reactive, ref } from 'vue'
import { BookOpenText, BookText, CircleCheck, Download, FileJson, FileSpreadsheet, FileText, Trash2, Upload, X } from 'lucide-vue-next'
import ConfirmDialog from '@/components/ConfirmDialog.vue'
import { api } from '@/services/api.js'
import { useToast } from '@/composables/useToast.js'

const toast = useToast(); const vocabularies = ref([]); const loading = ref(false); const importing = ref(false)
const importPreview = ref(null); const importName = ref(''); const mapping = reactive({}); const pendingDelete = ref(null)
const specsOpen = ref(false); const savingTemplate = ref(false)
const mappingFields = [
  { key: 'word', label: '单词', required: true }, { key: 'definition', label: '释义', required: true },
  { key: 'phonetic', label: '音标' }, { key: 'examples', label: '例句' }, { key: 'etymology', label: '词源/词根' },
  { key: 'synonyms', label: '同义词' }, { key: 'antonyms', label: '反义词' }, { key: 'frequency', label: '词频/优先级' }
]
const fieldSpecs = [
  { name: 'word', label: '单词', required: true, type: '字符串', rule: '英文单词或词组；前后空格会自动去除。建议统一使用小写。' },
  { name: 'definition', label: '释义', required: true, type: '字符串 / 数组', rule: '至少一个释义。可包含词性，如“v. 放弃；遗弃”。' },
  { name: 'phonetic', label: '音标', type: '字符串', rule: 'IPA 或其他音标格式；建议包含 / / 或 [ ] 边界。' },
  { name: 'examples', label: '例句', type: '字符串 / 数组', rule: '一个或多个完整英文例句；表格中使用 | 分隔。' },
  { name: 'etymology', label: '词源/词根', type: '字符串', rule: '词源、词根词缀或构词说明。' },
  { name: 'synonyms', label: '同义词', type: '字符串 / 数组', rule: '同义词列表；表格中使用 | 分隔。' },
  { name: 'antonyms', label: '反义词', type: '字符串 / 数组', rule: '反义词列表；表格中使用 | 分隔。' },
  { name: 'frequency', label: '词频/优先级', type: '非负整数', rule: '可选排序权重；数值越大，新词计划中的优先级越高。' }
]
const csvExample = `word,phonetic,definition,examples,etymology,synonyms,antonyms,frequency
abandon,/əˈbændən/,v. 放弃；遗弃|n. 放任；放纵,They had to abandon the car.|Never abandon hope.,来自古法语 abandoner,desert|forsake,keep|retain,9500`
const jsonExample = `[
  {
    "word": "abandon",
    "phonetic": "/əˈbændən/",
    "definition": ["v. 放弃；遗弃", "n. 放任；放纵"],
    "examples": ["They had to abandon the car."],
    "etymology": "来自古法语 abandoner",
    "synonyms": ["desert", "forsake"],
    "antonyms": ["keep", "retain"],
    "frequency": 9500
  }
]`
const totalWords = computed(() => vocabularies.value.reduce((sum, item) => sum + item.total, 0))
const learnedWords = computed(() => vocabularies.value.reduce((sum, item) => sum + item.learned, 0))
const activeCount = computed(() => vocabularies.value.filter((item) => item.is_active).length)
const percentage = (vocab) => vocab.total ? Math.round(vocab.learned / vocab.total * 100) : 0

async function load() { loading.value = true; try { vocabularies.value = await api.vocabularies() } catch (error) { toast.error(error.message) } finally { loading.value = false } }
async function toggleActive(vocab, active) { try { await api.setVocabularyActive(vocab.id, active); vocab.is_active = active; toast.success(active ? `已启用 ${vocab.name}` : `已停用 ${vocab.name}`) } catch (error) { toast.error(error.message); load() } }
async function exportVocab(vocab, format) { try { const file = await api.exportVocabulary(vocab.id, format); if (file) toast.success('词库已导出') } catch (error) { toast.error(error.message) } }
async function downloadTemplate(format) {
  savingTemplate.value = true
  try { const file = await api.saveVocabularyTemplate(format); if (file) toast.success(`${format.toUpperCase()} 词库模板已保存`) }
  catch (error) { toast.error(error.message) }
  finally { savingTemplate.value = false }
}
async function selectImport() {
  try {
    const preview = await api.previewVocabularyImport()
    if (!preview) return
    importPreview.value = preview; importName.value = preview.filename.replace(/\.[^.]+$/, '')
    Object.assign(mapping, preview.suggested)
  } catch (error) { toast.error(error.message) }
}
function closeImport() { if (!importing.value) importPreview.value = null }
async function commitImport() {
  importing.value = true
  try {
    const result = await api.commitVocabularyImport({ token: importPreview.value.token, filename: importPreview.value.filename, name: importName.value, mapping: { ...mapping } })
    toast.success(`导入完成：${result.imported} 个单词，跳过 ${result.skipped} 行`); importPreview.value = null; await load()
  } catch (error) { toast.error(error.message) }
  finally { importing.value = false }
}
function displayCell(cell) { const text = Array.isArray(cell) ? cell.join('; ') : String(cell ?? ''); return text.length > 60 ? text.slice(0, 60) + '...' : text }
function askDelete(vocab) { pendingDelete.value = vocab }
async function deleteVocab() { try { await api.deleteVocabulary(pendingDelete.value.id); toast.success('词库已删除'); pendingDelete.value = null; load() } catch (error) { toast.error(error.message) } }
onMounted(load)
</script>
