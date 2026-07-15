const { contextBridge, ipcRenderer } = require('electron')

const invoke = (channel) => (...args) => ipcRenderer.invoke(channel, ...args)

contextBridge.exposeInMainWorld('vocabApi', {
  dashboard: invoke('dashboard:get'),
  vocabularies: invoke('vocab:list'),
  setVocabularyActive: invoke('vocab:set-active'),
  deleteVocabulary: invoke('vocab:delete'),
  previewVocabularyImport: invoke('vocab:import-preview'),
  commitVocabularyImport: invoke('vocab:import-commit'),
  saveVocabularyTemplate: invoke('vocab:template'),
  exportVocabulary: invoke('vocab:export'),
  searchWords: invoke('words:search'),
  getWord: invoke('words:get'),
  updateWord: invoke('words:update'),
  favorites: invoke('words:favorites'),
  dailyPlan: invoke('study:plan'),
  submitAnswer: invoke('study:answer'),
  mistakes: invoke('mistakes:list'),
  removeMistake: invoke('mistakes:remove'),
  statistics: invoke('stats:get'),
  getSettings: invoke('settings:get'),
  saveSettings: invoke('settings:set'),
  exportBackup: invoke('data:export'),
  previewBackup: invoke('data:import-preview'),
  commitBackup: invoke('data:import-commit'),
  resetProgress: invoke('data:reset-progress')
})
