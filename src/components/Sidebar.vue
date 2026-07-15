<template>
  <aside class="sidebar">
    <div class="brand">
      <img src="/app-icon.png" alt="" />
      <div><strong>VocabMaster</strong><span>词汇学习</span></div>
    </div>
    <nav aria-label="主导航">
      <RouterLink v-for="item in links" :key="item.to" :to="item.to">
        <component :is="item.icon" :size="19" />
        <span>{{ item.label }}</span>
      </RouterLink>
    </nav>
    <div class="sidebar-foot">
      <div class="streak"><Flame :size="18" /><span>连续 {{ streak }} 天</span></div>
      <small>数据仅保存在本机</small>
    </div>
  </aside>
</template>

<script setup>
import { BookOpen, ChartNoAxesCombined, Flame, Home, LibraryBig, Settings, TriangleAlert } from 'lucide-vue-next'
defineProps({ streak: { type: Number, default: 0 } })
const links = [
  { to: '/', label: '今日学习', icon: Home },
  { to: '/study', label: '学习', icon: BookOpen },
  { to: '/vocab', label: '词库管理', icon: LibraryBig },
  { to: '/mistakes', label: '错题本', icon: TriangleAlert },
  { to: '/stats', label: '学习统计', icon: ChartNoAxesCombined },
  { to: '/settings', label: '设置', icon: Settings }
]
</script>
