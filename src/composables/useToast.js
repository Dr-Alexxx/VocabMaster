import { reactive } from 'vue'

export const toastState = reactive({ items: [] })

export function useToast() {
  function show(message, type = 'info') {
    const id = Date.now() + Math.random()
    toastState.items.push({ id, message: String(message), type })
    window.setTimeout(() => dismiss(id), 3200)
  }
  function dismiss(id) {
    const index = toastState.items.findIndex((item) => item.id === id)
    if (index >= 0) toastState.items.splice(index, 1)
  }
  return {
    success: (message) => show(message, 'success'),
    error: (message) => show(message, 'error'),
    info: (message) => show(message, 'info'),
    dismiss
  }
}
