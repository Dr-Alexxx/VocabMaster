<template>
  <nav class="mobile-tabs" aria-label="主导航">
    <RouterLink v-for="item in items" :key="item.to" :to="item.to">
      <component :is="item.icon" :size="20" />
      <span>{{ item.label }}</span>
    </RouterLink>
  </nav>
</template>

<script setup>
import { BookOpen, ChartNoAxesCombined, Home, Settings } from 'lucide-vue-next'
const items = [
  { to: '/', label: '今日', icon: Home },
  { to: '/study', label: '学习', icon: BookOpen },
  { to: '/stats', label: '统计', icon: ChartNoAxesCombined },
  { to: '/settings', label: '我的', icon: Settings }
]
</script>
