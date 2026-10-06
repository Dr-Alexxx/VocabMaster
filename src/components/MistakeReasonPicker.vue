<template>
  <label class="reason-picker"><span>错误原因（可选）</span><select :value="value" :disabled="saving" @change="save($event.target.value)"><option value="">未标注</option><option v-for="item in reasons" :key="item.value" :value="item.value">{{ item.label }}</option></select></label>
</template>
<script setup>
import { ref, watch } from 'vue'
import { api } from '@/services/api.js'
import { useToast } from '@/composables/useToast.js'
const props = defineProps({ historyId: Number, reason: { type: String, default: '' } })
const emit = defineEmits(['updated']); const value = ref(props.reason); const saving = ref(false); const toast = useToast()
const reasons = [{ value: 'spelling', label: '拼写错误' }, { value: 'meaning', label: '释义混淆' }, { value: 'listening', label: '听音不识' }, { value: 'careless', label: '粗心' }, { value: 'other', label: '其他' }]
watch(() => [props.historyId, props.reason], () => { value.value = props.reason })
async function save(reason) {
  if (!props.historyId) return
  saving.value = true
  try { await api.setMistakeReason(props.historyId, reason); value.value = reason; emit('updated', reason) }
  catch (error) { toast.error(error.message) }
  finally { saving.value = false }
}
</script>
<style scoped>
.reason-picker { display: flex; align-items: center; gap: 10px; margin-top: 12px; font-size: 12px; color: var(--text-soft); }.reason-picker select { min-height: 38px; max-width: 160px; padding: 4px 8px; }
</style>
