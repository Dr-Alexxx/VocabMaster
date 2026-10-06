const methods = { dashboard:'getDashboard', vocabularies:'listVocabularies', favorites:'listFavorites', mistakes:'listMistakes', statistics:'getStatistics', dailyPlan:'buildPlan', saveSettings:'setSettings' }
export const previewApi = new Proxy({}, {
  get: (_target, name) => async (...args) => {
    const response = await fetch(`/preview-api/${methods[name] || name}`, { method:'POST', headers:{ 'Content-Type':'application/json' }, body:JSON.stringify(args) })
    if (!response.ok && response.status === 404) throw new Error('此功能需要在桌面或 Android 应用中使用')
    const data = await response.json()
    if (data.error) throw new Error(data.error)
    return data.value
  }
})
