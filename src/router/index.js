import { createRouter, createWebHashHistory } from 'vue-router'
import HomeView from '@/views/HomeView.vue'

export default createRouter({
  history: createWebHashHistory(),
  routes: [
    { path: '/', name: 'home', component: HomeView },
    { path: '/study', name: 'study', component: () => import('@/views/StudyView.vue') },
    { path: '/vocab', name: 'vocab', component: () => import('@/views/VocabView.vue') },
    { path: '/mistakes', name: 'mistakes', component: () => import('@/views/MistakeView.vue') },
    { path: '/stats', name: 'stats', component: () => import('@/views/StatsView.vue') },
    { path: '/settings', name: 'settings', component: () => import('@/views/SettingsView.vue') }
  ]
})
