# 词汇学习应用设计文档

**项目名称：** VocabMaster（暂定）  
**目标用户：** 大学生（准备 CET-4/6、IELTS、TOEFL 考试）  
**平台：** 桌面应用（Electron）  
**设计日期：** 2026-07-15

---

## 1. 项目概述

### 1.1 项目目标

开发一款基于 HTML + JavaScript 的跨平台桌面应用，帮助大学生高效学习和记忆英语词汇。应用采用科学的记忆曲线算法（Anki 改进算法），支持多种学习模式，提供完善的学习统计和进度追踪功能。

### 1.2 核心特性

- 内置 CET-4/6、IELTS、TOEFL 默认词库
- 支持导入自定义词库（CSV、Excel、JSON、TXT）
- 三种学习模式：卡片翻转、拼写练习、选择题
- 基于 Anki 算法的智能复习调度
- 错题本与常错本管理
- 跨词库学习去重（已学词汇不重复学习）
- 可视化学习统计与进度分析
- 学习进度导出与导入
- 用户自定义算法参数和学习策略

### 1.3 技术选型

**前端框架：** Vue 3 (Composition API) + Vite  
**桌面框架：** Electron  
**本地数据库：** better-sqlite3  
**状态管理：** Pinia  
**图表可视化：** ECharts  
**路由：** Vue Router  
**UI 风格：** 简洁现代、扁平化设计

---

## 2. 系统架构

### 2.1 整体架构

```
VocabMaster/
├── src/                    # 渲染进程（Vue 前端）
│   ├── components/         # 通用组件
│   │   ├── WordCard.vue   # 单词卡片组件
│   │   ├── ProgressBar.vue
│   │   └── StatChart.vue
│   ├── views/             # 页面视图
│   │   ├── HomeView.vue   # 今日学习
│   │   ├── StudyView.vue  # 学习界面
│   │   ├── VocabView.vue  # 词库管理
│   │   ├── MistakeView.vue # 错题本
│   │   ├── StatsView.vue  # 统计分析
│   │   └── SettingsView.vue # 设置
│   ├── stores/            # Pinia stores
│   │   ├── study.js       # 学习状态
│   │   ├── vocab.js       # 词库状态
│   │   └── settings.js    # 用户设置
│   ├── services/          # 业务逻辑层
│   │   ├── database.js    # 数据库 IPC 调用封装
│   │   ├── importer.js    # 词库导入逻辑
│   │   └── exporter.js    # 数据导出逻辑
│   ├── utils/             # 工具函数
│   │   ├── format.js      # 格式化工具
│   │   └── validator.js   # 数据验证
│   ├── algorithms/        # 算法实现
│   │   ├── anki.js        # Anki 算法
│   │   └── scheduler.js   # 学习调度器
│   ├── router/            # 路由配置
│   ├── assets/            # 静态资源
│   └── App.vue            # 根组件
│
├── electron/              # 主进程
│   ├── main.js           # 主进程入口
│   ├── database/         # 数据库模块
│   │   ├── init.js       # 数据库初始化
│   │   ├── migrations.js # 数据库迁移
│   │   ├── words.js      # 单词表操作
│   │   ├── learning.js   # 学习记录操作
│   │   └── stats.js      # 统计数据操作
│   ├── ipc-handlers.js   # IPC 通信处理
│   └── sync/             # 未来的同步模块（预留）
│       └── webdav.js     # WebDAV 同步实现
│
├── resources/            # 资源文件
│   ├── vocabularies/     # 默认词库
│   │   ├── cet4.json
│   │   ├── cet6.json
│   │   ├── ielts.json
│   │   └── toefl.json
│   └── icons/            # 应用图标
│
└── package.json
```

### 2.2 进程通信架构

**渲染进程 ↔ 主进程：**
- 渲染进程通过 `window.api`（preload 暴露）调用主进程方法
- 主进程通过 IPC handlers 处理数据库操作、文件 I/O
- 数据传输使用 JSON 序列化

**职责分离：**
- **渲染进程：** UI 渲染、用户交互、算法计算（Anki 算法在渲染进程执行）
- **主进程：** 数据库操作、文件读写、系统 API 调用

---

## 3. 数据库设计

### 3.1 核心表结构

#### 词库表 (vocabularies)
```sql
CREATE TABLE vocabularies (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,                    -- 词库名称
  type TEXT NOT NULL,                    -- 'CET4'|'CET6'|'IELTS'|'TOEFL'|'CUSTOM'
  description TEXT,                      -- 词库描述
  is_default BOOLEAN DEFAULT 0,          -- 是否系统默认词库
  is_active BOOLEAN DEFAULT 1,           -- 是否激活（用于学习）
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

#### 单词表 (words)
```sql
CREATE TABLE words (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  vocabulary_id INTEGER NOT NULL,        -- 所属词库
  word TEXT NOT NULL,                    -- 单词
  phonetic TEXT,                         -- 音标
  definition TEXT,                       -- 释义（JSON 数组，支持多义项）
  examples TEXT,                         -- 例句（JSON 数组）
  etymology TEXT,                        -- 词根词缉
  synonyms TEXT,                         -- 同义词（JSON 数组）
  antonyms TEXT,                         -- 反义词（JSON 数组）
  frequency INTEGER,                     -- 词频
  notes TEXT,                            -- 用户笔记
  is_favorited BOOLEAN DEFAULT 0,        -- 是否收藏
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (vocabulary_id) REFERENCES vocabularies(id) ON DELETE CASCADE
);

CREATE INDEX idx_words_vocabulary ON words(vocabulary_id);
CREATE INDEX idx_words_word ON words(word);
CREATE INDEX idx_words_favorited ON words(is_favorited);
```

#### 学习记录表 (learning_records)
```sql
CREATE TABLE learning_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word_id INTEGER NOT NULL,              -- 关联单词
  user_id INTEGER DEFAULT 1,             -- 用户 ID（多用户支持预留）
  
  -- Anki 算法参数
  easiness_factor REAL DEFAULT 2.5,      -- 难易度因子（1.3-2.5+）
  interval INTEGER DEFAULT 0,            -- 当前复习间隔（天）
  repetitions INTEGER DEFAULT 0,         -- 连续正确次数
  
  -- 学习状态
  status TEXT DEFAULT 'new',             -- 'new'|'learning'|'review'|'mastered'
  next_review_date DATE,                 -- 下次复习日期
  last_review_date DATE,                 -- 最后复习日期
  
  -- 跨词库去重标记
  is_learned BOOLEAN DEFAULT 0,          -- 是否已学过（跨词库标记）
  first_learned_at DATETIME,             -- 首次学习时间
  
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE
);

CREATE INDEX idx_learning_word ON learning_records(word_id);
CREATE INDEX idx_learning_next_review ON learning_records(next_review_date);
CREATE INDEX idx_learning_status ON learning_records(status);
CREATE INDEX idx_learning_learned ON learning_records(is_learned);
```

#### 学习历史表 (study_history)
```sql
CREATE TABLE study_history (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word_id INTEGER NOT NULL,
  learning_record_id INTEGER NOT NULL,
  study_mode TEXT NOT NULL,              -- 'flashcard'|'spelling'|'choice'
  quality INTEGER NOT NULL,              -- 回答质量 0-5（Anki 标准）
  time_spent INTEGER,                    -- 答题用时（秒）
  is_correct BOOLEAN,                    -- 是否答对
  studied_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE,
  FOREIGN KEY (learning_record_id) REFERENCES learning_records(id) ON DELETE CASCADE
);

CREATE INDEX idx_history_word ON study_history(word_id);
CREATE INDEX idx_history_date ON study_history(studied_at);
```

#### 错题本表 (mistake_book)
```sql
CREATE TABLE mistake_book (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  word_id INTEGER NOT NULL UNIQUE,       -- 关联单词
  mistake_count INTEGER DEFAULT 1,       -- 错误次数
  last_mistake_at DATETIME,              -- 最后错误时间
  is_frequent BOOLEAN DEFAULT 0,         -- 是否常错（错误3次以上）
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (word_id) REFERENCES words(id) ON DELETE CASCADE
);

CREATE INDEX idx_mistake_word ON mistake_book(word_id);
CREATE INDEX idx_mistake_frequent ON mistake_book(is_frequent);
```

#### 每日统计表 (daily_statistics)
```sql
CREATE TABLE daily_statistics (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  date DATE NOT NULL UNIQUE,             -- 统计日期
  new_words_count INTEGER DEFAULT 0,     -- 新学单词数
  review_count INTEGER DEFAULT 0,        -- 复习单词数
  correct_count INTEGER DEFAULT 0,       -- 答对数量
  total_count INTEGER DEFAULT 0,         -- 总答题数
  study_time INTEGER DEFAULT 0,          -- 学习时长（秒）
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_stats_date ON daily_statistics(date);
```

#### 用户设置表 (user_settings)
```sql
CREATE TABLE user_settings (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  key TEXT NOT NULL UNIQUE,              -- 设置键
  value TEXT,                            -- 设置值（JSON 格式）
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
```

### 3.2 关键设计考虑

**跨词库学习去重：**
- `learning_records.is_learned` 标记单词是否已在任意词库中学过
- 当用户切换到新词库时，系统自动跳过 `is_learned = 1` 的单词
- 用户可在设置中关闭此功能（重新学习已掌握单词）

**数据完整性：**
- 外键约束确保数据一致性
- 级联删除：删除词库时自动删除关联单词和学习记录
- 索引优化：为高频查询字段建立索引

**版本迁移：**
- 使用版本号管理数据库 schema
- 每次启动检查版本，自动执行迁移脚本

---

## 4. Anki 算法实现

### 4.1 核心算法

基于 Anki 的 SM-2 改进算法，核心参数：

- **easiness_factor (EF):** 难易度因子，初始值 2.5，范围 1.3+
- **interval:** 复习间隔（天），动态计算
- **repetitions:** 连续正确次数
- **quality:** 用户回答质量评分 0-5

### 4.2 算法流程

```javascript
function updateCard(record, quality) {
  let { easiness_factor, interval, repetitions } = record;
  
  // 1. 更新难易度因子
  easiness_factor = Math.max(1.3, 
    easiness_factor + (0.1 - (5 - quality) * (0.08 + (5 - quality) * 0.02))
  );
  
  // 2. 根据质量更新复习间隔
  if (quality < 3) {
    // 答错：重置
    repetitions = 0;
    interval = 1;
  } else {
    // 答对：增加间隔
    if (repetitions === 0) {
      interval = 1;
    } else if (repetitions === 1) {
      interval = 6;
    } else {
      interval = Math.round(interval * easiness_factor);
    }
    repetitions += 1;
  }
  
  // 3. 计算下次复习日期
  const next_review_date = new Date();
  next_review_date.setDate(next_review_date.getDate() + interval);
  
  // 4. 更新状态
  let status = 'learning';
  if (repetitions >= 5 && interval >= 21) {
    status = 'mastered';
  } else if (repetitions >= 2) {
    status = 'review';
  }
  
  return { 
    easiness_factor, 
    interval, 
    repetitions, 
    next_review_date, 
    status 
  };
}
```

### 4.3 学习模式与质量评分映射

**卡片模式（用户主观评分）：**
- 0: 完全不记得
- 1: 有点印象但答错
- 2: 想起来但很困难
- 3: 想起来了，有点犹豫
- 4: 想起来了，比较轻松
- 5: 完全记得，非常轻松

**拼写模式（自动评分）：**
- 完全正确 → 5
- 轻微拼写错误（1-2 个字母） → 3
- 严重错误（3+ 个字母或完全不同） → 1
- 完全错误/未输入 → 0

**选择题模式（自动评分）：**
- 答对且用时短（< 3 秒） → 5
- 答对但用时长（> 5 秒） → 4
- 答错 → 0

### 4.4 用户可自定义参数

保存在 `user_settings` 表中：

```json
{
  "anki_settings": {
    "initial_easiness_factor": 2.5,      // 初始难易度
    "daily_new_limit": 20,               // 每日新词上限
    "daily_review_limit": 100,           // 每日复习上限
    "interval_modifier": 1.0,            // 间隔系数（影响复习频率）
    "mastery_threshold": {
      "repetitions": 5,                  // 掌握所需正确次数
      "interval_days": 21                // 掌握所需间隔天数
    },
    "enable_cross_vocab_dedup": true     // 启用跨词库去重
  }
}
```

### 4.5 学习调度器

**每日学习计划生成：**

1. **查询待复习单词：** `next_review_date <= TODAY` 且 `is_learned = 1`
2. **应用复习上限：** 最多返回 `daily_review_limit` 个
3. **查询新词：** 如果复习完成，返回 `status = 'new'` 且 `is_learned = 0` 的单词
4. **应用新词上限：** 最多返回 `daily_new_limit` 个
5. **跨词库去重过滤：** 如果启用，从新词中排除已学单词

**智能推荐（薄弱词汇优先）：**
- 计算每个单词的"薄弱度"：`mistake_count / (repetitions + 1)`
- 优先推荐薄弱度高的单词复习

---

## 5. 核心功能模块

### 5.1 词库管理模块

**默认词库：**
- 内置 CET-4（核心 2000 词）、CET-6（核心 2500 词）
- 内置 IELTS（核心 3000 词）、TOEFL（核心 3500 词）
- 首次启动自动导入到数据库

**导入词库：**
- 支持格式：CSV、Excel (.xlsx/.xls)、JSON、TXT
- 自动检测文件编码（UTF-8、GBK）
- 字段映射界面：用户指定哪列是单词、释义、例句等
- 去重处理：检测数据库中已存在的单词，提供"跳过/覆盖/保留两者"选项
- 进度显示：大文件导入显示进度条和预计时间

**词库激活/停用：**
- 用户可同时激活多个词库学习
- 停用的词库不参与学习计划生成
- 支持查看每个词库的学习进度（已学/总数）

**词库导出：**
- 支持导出为 JSON、CSV 格式
- 可选导出内容：仅单词列表 / 包含学习记录

### 5.2 学习模块

**每日学习流程：**

1. **显示学习概览**
   - 今日待复习单词数
   - 今日新词数（如果复习完成）
   - 连续学习天数
   - 今日学习进度

2. **选择学习模式**
   - 卡片模式
   - 拼写模式
   - 选择题模式
   - 混合模式（随机切换）

3. **开始学习**
   - 优先展示待复习单词
   - 复习完成后展示新词
   - 实时更新进度条

4. **学习完成**
   - 显示本次学习统计
   - 建议下次学习时间
   - 返回首页

**三种学习模式详解：**

**A. 卡片模式**
- 正面显示：英文单词 + 音标
- 点击"显示答案"或空格键翻转
- 背面显示：释义、例句（可选）
- 用户自评质量（0-5），快捷键：数字键 0-5
- 支持 TTS 朗读（点击发音图标或按 P 键）

**B. 拼写模式**
- 显示：中文释义 / 播放发音（可选）
- 用户输入：英文单词
- 实时提示：输入时显示字母数
- 判分逻辑：
  - 完全正确 → 5 分
  - Levenshtein 距离 1-2 → 3 分
  - 距离 3+ → 1 分
  - 完全错误 → 0 分
- 答错后显示正确答案和用户答案对比

**C. 选择题模式**
- 显示：英文单词
- 4 个选项：1 个正确释义 + 3 个干扰项
- 干扰项生成：从同词库中随机选择相似词频的单词释义
- 答对 → 根据用时评分（快速 5 分，慢速 4 分）
- 答错 → 0 分，显示正确答案

**学习中功能：**
- **暂停/继续**：快捷键 ESC
- **跳过当前单词**：标记为"稍后复习"，本次学习结束前重新出现
- **查看详情**：弹出侧边栏，显示词根、同义词、例句、用户笔记
- **标记收藏**：快捷键 F，收藏夹独立管理
- **添加笔记**：快速记录记忆技巧或个人联想

**学习计划功能：**
- 用户设定目标：如"30 天掌握 CET-4 核心词汇"
- 系统自动计算每日学习量（新词 + 复习）
- 进度追踪：显示计划完成百分比
- 灵活调整：允许用户随时修改计划参数

### 5.3 单词搜索与收藏

**全局搜索功能：**
- 搜索范围：所有词库中的单词
- 搜索字段：单词、释义、例句
- 实时搜索：输入时动态显示结果
- 结果显示：
  - 单词基本信息
  - 所属词库
  - 学习状态（新词/学习中/已掌握）
  - 错误次数（如果有）
- 快速操作：点击进入单词详情页，支持直接学习

**收藏夹功能：**
- 收藏来源：学习中标记 / 搜索结果标记 / 单词详情页标记
- 收藏列表：按收藏时间倒序排列
- 支持备注：为收藏的单词添加备注
- 专项复习：一键开始复习收藏夹中的单词
- 取消收藏：在列表或详情页取消

**单词详情页：**
- 完整信息展示：单词、音标、释义、例句、词根词缀、同义反义词
- 学习统计：学习次数、正确率、最后学习时间
- 用户笔记：编辑个人记忆技巧
- 快速操作：收藏、添加到错题本、立即学习

### 5.4 错题本与常错本

**错题本：**
- 自动收集：`quality < 3` 的单词自动进入错题本
- 显示信息：
  - 单词基本信息
  - 错误次数
  - 最后错误时间
  - 错误的学习模式
- 操作：
  - 开始专项复习（仅复习错题）
  - 移除错题（用户认为已掌握）
  - 查看详情

**常错本：**
- 自动标记：错误次数 ≥ 3 次自动进入常错本
- `mistake_book.is_frequent = 1`
- 突出显示：在错题本中用特殊颜色标记
- 智能推荐：在每日学习计划中优先安排常错词复习

**错题统计：**
- 按词库查看：每个词库的错题数量和分布
- 按时间段查看：本周/本月/本季度错题趋势
- 错题类型分析：哪种学习模式错误率更高

### 5.5 统计与可视化

**学习概览（首页卡片）：**
- 今日已学/待复习单词数
- 累计掌握词汇数
- 连续学习天数
- 本周学习时长

**趋势图表（统计页）：**

1. **学习时长趋势**（折线图）
   - X 轴：日期（最近 7/30/90 天可切换）
   - Y 轴：学习时长（分钟）
   - 数据点显示：当天详细数据

2. **正确率趋势**（折线图）
   - X 轴：日期
   - Y 轴：正确率（%）
   - 辅助线：平均正确率

3. **词库完成度**（环形图）
   - 每个词库的完成百分比
   - 显示：已掌握/学习中/未学习数量

4. **学习热力图**（日历热力图）
   - 类似 GitHub contribution graph
   - 颜色深浅代表每日学习量
   - 点击日期显示当天详细数据

**详细分析：**
- **各学习模式表现对比**（柱状图）
  - 卡片/拼写/选择题的正确率
  - 各模式的学习时长占比

- **薄弱词汇 TOP 20**（表格）
  - 按错误次数排序
  - 显示单词、错误次数、最后学习时间
  - 支持一键复习

- **学习效率分析**
  - 平均每分钟学习单词数
  - 最高效时间段分析
  - 学习建议

### 5.6 数据导出与导入

**学习进度导出：**
- 导出格式：JSON
- 导出内容可选：
  - 全部数据（词库 + 学习记录 + 错题本 + 统计）
  - 仅学习记录（用于备份进度）
  - 仅错题本
- 文件命名：`vocab-backup-YYYY-MM-DD.json`
- 保存位置：用户选择

**导出数据结构：**
```json
{
  "version": "1.0",
  "exported_at": "2026-07-15T10:30:00Z",
  "vocabularies": [...],
  "words": [...],
  "learning_records": [...],
  "study_history": [...],
  "mistake_book": [...],
  "daily_statistics": [...],
  "user_settings": {...}
}
```

**学习进度导入：**
- 支持导入之前导出的 JSON 文件
- 导入前预览：
  - 显示文件包含的词库数量
  - 显示学习记录数量
  - 显示导出时间和版本
- 冲突处理策略：
  - 跳过已存在的单词
  - 覆盖已存在的学习记录
  - 合并学习记录（保留最新）
- 数据校验：
  - 检查 JSON 格式有效性
  - 检查版本兼容性
  - 检查数据完整性（外键关系）
- 导入失败回滚：使用数据库事务确保原子性

**同步接口预留：**
- 定义抽象 `SyncProvider` 接口
- 预留 WebDAV 实现类（未来开发）
- 同步数据格式：与导出格式一致
- 冲突解决：timestamp 比较 + 用户选择

### 5.7 个性化设置

**学习设置：**
- 每日新词上限（默认 20，范围 5-100）
- 每日复习上限（默认 100，范围 20-500）
- Anki 算法参数：
  - 初始难易度因子（默认 2.5，范围 1.5-3.5）
  - 间隔系数（默认 1.0，范围 0.5-2.0）
  - 掌握阈值（连续正确次数和间隔天数）
- 跨词库去重：启用/禁用
- 学习模式偏好：默认模式选择

**界面设置：**
- 主题模式：
  - 浅色模式
  - 深色模式
  - 跟随系统
- 字体大小：小/中/大/特大（影响单词和释义显示）
- 字体选择：系统默认/自定义字体
- 动画效果：启用/禁用过渡动画
- 发音设置：
  - TTS 引擎选择（系统 TTS / 在线 API）
  - 发音口音：美音/英音
  - 语速调节
  - 自动发音：卡片翻转时自动播放

**数据管理：**
- 导出学习数据
- 导入学习数据
- 清空学习记录（保留词库）
- 重置应用（清空所有数据）
- 数据库优化（VACUUM）

**关于页面：**
- 应用版本信息
- 开源协议
- 反馈渠道
- 检查更新

---

## 6. 技术实现要点

### 6.1 Electron 配置

**主进程配置：**
```javascript
const mainWindow = new BrowserWindow({
  width: 1280,
  height: 900,
  minWidth: 1024,
  minHeight: 768,
  webPreferences: {
    nodeIntegration: false,
    contextIsolation: true,
    preload: path.join(__dirname, 'preload.js'),
    enableRemoteModule: false,
    webSecurity: true
  },
  // 高 DPI 支持
  enableLargerThanScreen: true
});

// 记住窗口尺寸和位置
app.on('ready', () => {
  const { width, height, x, y } = loadWindowState();
  mainWindow.setBounds({ width, height, x, y });
});
```

**高 DPI 支持：**
- CSS 使用 rem/em 相对单位
- 图标准备 1x、2x、3x 三种尺寸
- Electron 自动检测屏幕缩放比例
- 渲染进程 CSS：`font-size: 16px` 作为基准

**安全配置：**
- `contextIsolation: true` 防止渲染进程访问 Node.js API
- `nodeIntegration: false` 强制使用 preload 脚本
- Preload 脚本通过 `contextBridge` 暴露安全的 API

### 6.2 数据库操作

**主进程数据库封装：**
```javascript
// electron/database/words.js
class WordsDB {
  constructor(db) {
    this.db = db;
  }
  
  getWordsByVocabulary(vocabularyId) {
    return this.db.prepare(
      'SELECT * FROM words WHERE vocabulary_id = ?'
    ).all(vocabularyId);
  }
  
  searchWords(query) {
    return this.db.prepare(`
      SELECT w.*, v.name as vocabulary_name
      FROM words w
      JOIN vocabularies v ON w.vocabulary_id = v.id
      WHERE w.word LIKE ? OR w.definition LIKE ?
      LIMIT 50
    `).all(`%${query}%`, `%${query}%`);
  }
  
  // 更多方法...
}
```

**事务支持：**
```javascript
function updateLearningProgress(wordId, quality, studyMode) {
  const transaction = db.transaction(() => {
    // 1. 更新学习记录
    const record = learningDB.getRecord(wordId);
    const updated = ankiAlgorithm.updateCard(record, quality);
    learningDB.updateRecord(wordId, updated);
    
    // 2. 插入学习历史
    historyDB.insertHistory({
      word_id: wordId,
      learning_record_id: record.id,
      study_mode: studyMode,
      quality: quality,
      is_correct: quality >= 3
    });
    
    // 3. 更新错题本（如果答错）
    if (quality < 3) {
      mistakeDB.incrementMistake(wordId);
    }
    
    // 4. 更新每日统计
    statsDB.updateDailyStats(new Date(), {
      total_count: 1,
      correct_count: quality >= 3 ? 1 : 0
    });
  });
  
  transaction();
}
```

**数据库迁移：**
```javascript
// electron/database/migrations.js
const migrations = [
  {
    version: 1,
    up: (db) => {
      db.exec('CREATE TABLE vocabularies (...)');
      db.exec('CREATE TABLE words (...)');
      // ...
    }
  },
  {
    version: 2,
    up: (db) => {
      db.exec('ALTER TABLE words ADD COLUMN notes TEXT');
      db.exec('ALTER TABLE words ADD COLUMN is_favorited BOOLEAN DEFAULT 0');
    }
  }
];

function migrate(db) {
  const currentVersion = db.pragma('user_version', { simple: true });
  
  migrations
    .filter(m => m.version > currentVersion)
    .forEach(m => {
      m.up(db);
      db.pragma(`user_version = ${m.version}`);
    });
}
```

### 6.3 性能优化

**虚拟滚动：**
- 使用 `vue-virtual-scroller` 或自实现
- 词库列表、错题列表支持万级数据流畅滚动
- 每次渲染 DOM 节点数限制在 50-100 个

**图表懒加载：**
```javascript
// 使用 Intersection Observer
const chartObserver = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      loadChart(entry.target);
      chartObserver.unobserve(entry.target);
    }
  });
});
```

**缓存策略：**
- Pinia store 缓存词库元数据
- 避免频繁 IPC 调用
- 学习模式下预加载下 10 个单词

**Web Worker（导入词库）：**
```javascript
// src/workers/import-worker.js
self.onmessage = async (e) => {
  const { file, format } = e.data;
  const words = await parseFile(file, format);
  
  // 分批发送进度
  for (let i = 0; i < words.length; i += 100) {
    self.postMessage({
      type: 'progress',
      current: i,
      total: words.length
    });
  }
  
  self.postMessage({
    type: 'complete',
    words: words
  });
};
```

### 6.4 导入导出实现

**格式检测：**
```javascript
function detectFormat(file) {
  const ext = path.extname(file.name).toLowerCase();
  
  if (ext === '.json') return 'json';
  if (['.xlsx', '.xls'].includes(ext)) return 'excel';
  if (ext === '.csv') return 'csv';
  if (ext === '.txt') return 'txt';
  
  // 采样前 100 行判断
  const sample = readFirstLines(file, 100);
  if (sample.includes('\t')) return 'tsv';
  if (sample.match(/^[\w]+,[\w]+/m)) return 'csv';
  
  return 'txt';
}
```

**CSV/Excel 导入：**
```javascript
async function importFromExcel(file) {
  const workbook = XLSX.read(await file.arrayBuffer());
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  const rows = XLSX.utils.sheet_to_json(sheet);
  
  // 字段映射界面
  const mapping = await showFieldMappingDialog(rows[0]);
  
  const words = rows.map(row => ({
    word: row[mapping.word],
    phonetic: row[mapping.phonetic],
    definition: row[mapping.definition],
    // ...
  }));
  
  return words;
}
```

**JSON 导出（流式）：**
```javascript
async function exportToJSON(options) {
  const stream = fs.createWriteStream(options.path);
  
  stream.write('{\n');
  stream.write(`  "version": "1.0",\n`);
  stream.write(`  "exported_at": "${new Date().toISOString()}",\n`);
  
  // 分批写入大数据
  stream.write(`  "words": [\n`);
  const words = await db.prepare('SELECT * FROM words').iterate();
  let first = true;
  for (const word of words) {
    if (!first) stream.write(',\n');
    stream.write(`    ${JSON.stringify(word)}`);
    first = false;
  }
  stream.write('\n  ]\n');
  
  stream.write('}\n');
  stream.end();
}
```

### 6.5 算法优化

**调度器实现：**
```javascript
class Scheduler {
  constructor(db, settings) {
    this.db = db;
    this.settings = settings;
  }
  
  async getDailyPlan() {
    const today = new Date().toISOString().split('T')[0];
    
    // 1. 获取待复习单词
    const reviews = this.db.prepare(`
      SELECT lr.*, w.*
      FROM learning_records lr
      JOIN words w ON lr.word_id = w.id
      WHERE lr.next_review_date <= ?
        AND lr.is_learned = 1
      ORDER BY lr.next_review_date ASC
      LIMIT ?
    `).all(today, this.settings.daily_review_limit);
    
    // 2. 如果未达到复习上限，获取新词
    const remainingSlots = this.settings.daily_new_limit;
    const newWords = this.db.prepare(`
      SELECT w.*
      FROM words w
      LEFT JOIN learning_records lr ON w.id = lr.word_id
      WHERE lr.id IS NULL
        OR (lr.status = 'new' AND lr.is_learned = 0)
      ${this.settings.enable_cross_vocab_dedup ? 
        'AND NOT EXISTS (SELECT 1 FROM learning_records WHERE word_id = w.id AND is_learned = 1)' 
        : ''}
      LIMIT ?
    `).all(remainingSlots);
    
    return {
      reviews,
      newWords,
      total: reviews.length + newWords.length
    };
  }
  
  async getWeakWords(limit = 20) {
    return this.db.prepare(`
      SELECT w.*, mb.mistake_count, lr.repetitions,
             (mb.mistake_count * 1.0 / (lr.repetitions + 1)) as weakness_score
      FROM words w
      JOIN mistake_book mb ON w.id = mb.word_id
      JOIN learning_records lr ON w.id = lr.word_id
      ORDER BY weakness_score DESC
      LIMIT ?
    `).all(limit);
  }
}
```

**Anki 算法测试：**
```javascript
// 单元测试确保算法正确性
describe('Anki Algorithm', () => {
  test('quality < 3 resets interval', () => {
    const record = { easiness_factor: 2.5, interval: 10, repetitions: 3 };
    const result = updateCard(record, 2);
    
    expect(result.interval).toBe(1);
    expect(result.repetitions).toBe(0);
  });
  
  test('quality >= 3 increases interval', () => {
    const record = { easiness_factor: 2.5, interval: 6, repetitions: 2 };
    const result = updateCard(record, 4);
    
    expect(result.interval).toBeGreaterThan(6);
    expect(result.repetitions).toBe(3);
  });
});
```

### 6.6 同步接口设计

**抽象接口：**
```javascript
// electron/sync/provider.js
class SyncProvider {
  async upload(data) {
    throw new Error('Not implemented');
  }
  
  async download() {
    throw new Error('Not implemented');
  }
  
  async resolveConflict(local, remote) {
    throw new Error('Not implemented');
  }
}
```

**WebDAV 实现（预留）：**
```javascript
// electron/sync/webdav.js
class WebDAVSync extends SyncProvider {
  constructor(url, username, password) {
    super();
    this.client = createClient(url, { username, password });
  }
  
  async upload(data) {
    const json = JSON.stringify(data);
    await this.client.putFileContents(
      '/vocab-backup.json',
      json,
      { overwrite: true }
    );
  }
  
  async download() {
    const content = await this.client.getFileContents('/vocab-backup.json');
    return JSON.parse(content);
  }
  
  async resolveConflict(local, remote) {
    // Timestamp 比较
    if (new Date(local.updated_at) > new Date(remote.updated_at)) {
      return local;
    }
    return remote;
  }
}
```

### 6.7 错误处理

**全局错误捕获：**
```javascript
// 主进程
process.on('uncaughtException', (error) => {
  logger.error('Uncaught exception:', error);
  dialog.showErrorBox('应用错误', '应用遇到了一个错误，请重启应用');
});

// 渲染进程
window.addEventListener('unhandledrejection', (event) => {
  logger.error('Unhandled promise rejection:', event.reason);
  showToast('操作失败，请重试', 'error');
});
```

**用户友好提示：**
```javascript
function handleError(error) {
  const friendlyMessages = {
    'SQLITE_CORRUPT': '数据库文件损坏，请尝试导入备份数据',
    'ENOENT': '文件不存在，请检查路径',
    'EACCES': '没有文件访问权限',
    'IMPORT_FORMAT_ERROR': '文件格式不正确，请检查导入文件'
  };
  
  const message = friendlyMessages[error.code] || '操作失败，请重试';
  showToast(message, 'error');
}
```

**数据库恢复：**
```javascript
async function checkDatabase() {
  try {
    db.prepare('PRAGMA integrity_check').get();
  } catch (error) {
    logger.error('Database integrity check failed:', error);
    
    // 尝试从备份恢复
    const backupPath = path.join(app.getPath('userData'), 'backup.db');
    if (fs.existsSync(backupPath)) {
      fs.copyFileSync(backupPath, dbPath);
      return true;
    }
    
    // 无法恢复，提示用户
    dialog.showErrorBox(
      '数据库损坏',
      '无法恢复数据库，建议导入之前的备份文件'
    );
    return false;
  }
}
```

---

## 7. 用户界面设计

### 7.1 整体布局

**应用结构：**
```
┌─────────────────────────────────────────┐
│  [Logo] VocabMaster           [─][□][×]│ ← 标题栏
├────────┬────────────────────────────────┤
│        │                                │
│  导航   │         主内容区域               │
│  菜单   │                                │
│        │                                │
│  今日   │                                │
│  词库   │                                │
│  错题   │                                │
│  统计   │                                │
│  设置   │                                │
│        │                                │
└────────┴────────────────────────────────┘
```

**侧边栏导航：**
- 宽度：200px
- 菜单项：图标 + 文字
- 活动状态：背景高亮
- 底部：用户头像（预留）/ 设置入口

### 7.2 页面设计

**今日学习页（首页）：**
```
┌──────────────────────────────────────┐
│  今日学习                  2026-07-15  │
├──────────────────────────────────────┤
│                                      │
│  ┌────────┐ ┌────────┐ ┌────────┐   │
│  │待复习  │ │新词    │ │已掌握  │   │
│  │  42    │ │  20    │ │ 1580   │   │
│  └────────┘ └────────┘ └────────┘   │
│                                      │
│  ┌────────────────────────────────┐ │
│  │  连续学习 15 天  🔥             │ │
│  └────────────────────────────────┘ │
│                                      │
│  [ 开始学习 ]                        │
│                                      │
│  快速入口：                          │
│  - 复习错题本 (12)                   │
│  - 复习收藏夹 (8)                    │
│  - 复习常错本 (5)                    │
│                                      │
└──────────────────────────────────────┘
```

**学习界面（全屏沉浸式）：**
```
┌──────────────────────────────────────┐
│  [←] 暂停   进度: 15/42   [☰] 详情   │ ← 顶部操作栏
├──────────────────────────────────────┤
│  ████████████░░░░░░░░░░░░░░░░  35%   │ ← 进度条
├──────────────────────────────────────┤
│                                      │
│                                      │
│              abandon                 │ ← 单词
│           /əˈbændən/                │ ← 音标
│              [🔊]                     │ ← 发音按钮
│                                      │
│         [ 显示答案 ]                  │
│                                      │
│                                      │
│                                      │
├──────────────────────────────────────┤
│  [跳过] [收藏☆] [笔记]               │ ← 底部操作栏
└──────────────────────────────────────┘
```

翻转后（卡片模式）：
```
┌──────────────────────────────────────┐
│  [←] 暂停   进度: 15/42   [☰] 详情   │
├──────────────────────────────────────┤
│  ████████████░░░░░░░░░░░░░░░░  35%   │
├──────────────────────────────────────┤
│              abandon                 │
│           /əˈbændən/  [🔊]          │
│                                      │
│  v. 放弃；遗弃；抛弃                  │
│  n. 放任；放纵                        │
│                                      │
│  例句：                              │
│  They had to abandon the car.        │
│                                      │
│  回答质量：                          │
│  [0完全不会] [1] [2] [3] [4] [5轻松] │
│                                      │
└──────────────────────────────────────┘
```

**词库管理页：**
```
┌──────────────────────────────────────┐
│  词库管理           [ + 导入词库 ]     │
├──────────────────────────────────────┤
│                                      │
│  ┌─────────────────────────────────┐│
│  │ CET-4 核心词汇         [已激活] ││
│  │ 2000 词 | 已学 580 | 进度 29%   ││
│  │ ━━━━━━━░░░░░░░░░░░░░░░░░░       ││
│  └─────────────────────────────────┘│
│                                      │
│  ┌─────────────────────────────────┐│
│  │ CET-6 核心词汇         [已激活] ││
│  │ 2500 词 | 已学 320 | 进度 13%   ││
│  │ ━━━░░░░░░░░░░░░░░░░░░░░░░░░░░   ││
│  └─────────────────────────────────┘│
│                                      │
│  ┌─────────────────────────────────┐│
│  │ IELTS 核心词汇         [未激活] ││
│  │ 3000 词 | 已学 0 | 进度 0%      ││
│  │ ░░░░░░░░░░░░░░░░░░░░░░░░░░░░░░   ││
│  └─────────────────────────────────┘│
│                                      │
└──────────────────────────────────────┘
```

**错题本页：**
```
┌──────────────────────────────────────┐
│  [ 错题本 ] [ 常错本 ]        [开始复习]│
├──────────────────────────────────────┤
│  ┌────────────────────────────────┐ │
│  │ abandon      ❌×3  2026-07-14  │ │
│  │ 放弃；遗弃                      │ │
│  └────────────────────────────────┘ │
│                                      │
│  ┌────────────────────────────────┐ │
│  │ crucial      ❌×2  2026-07-13  │ │
│  │ 关键的；重要的                  │ │
│  └────────────────────────────────┘ │
│                                      │
│  ┌────────────────────────────────┐ │
│  │ adequate     ❌×1  2026-07-12  │ │
│  │ 足够的；充分的                  │ │
│  └────────────────────────────────┘ │
│                                      │
└──────────────────────────────────────┘
```

**统计分析页：**
```
┌──────────────────────────────────────┐
│  学习统计                             │
├──────────────────────────────────────┤
│  ┌────┐ ┌────┐ ┌────┐ ┌────┐        │
│  │已学│ │掌握│ │连续│ │本周│        │
│  │900 │ │580 │ │15天│ │320 │        │
│  │单词│ │单词│ │学习│ │分钟│        │
│  └────┘ └────┘ └────┘ └────┘        │
│                                      │
│  学习时长趋势（最近30天）             │
│  ┌────────────────────────────────┐ │
│  │      ╱╲    ╱╲                  │ │
│  │   ╱╲╱  ╲╱╲╱  ╲╱╲              │ │
│  │────────────────────────────────│ │
│  └────────────────────────────────┘ │
│                                      │
│  正确率趋势                          │
│  ┌────────────────────────────────┐ │
│  │  ────────────────  85%平均      │ │
│  │                                 │ │
│  └────────────────────────────────┘ │
│                                      │
└──────────────────────────────────────┘
```

### 7.3 视觉风格

**配色方案（浅色模式）：**
- 背景色：`#FFFFFF`
- 次级背景：`#F7F9FC`
- 文字主色：`#1A202C`
- 文字次色：`#718096`
- 主题色（强调）：`#3B82F6`（蓝色）
- 成功色：`#10B981`（绿色）
- 错误色：`#EF4444`（红色）
- 边框色：`#E2E8F0`

**配色方案（深色模式）：**
- 背景色：`#1A202C`
- 次级背景：`#2D3748`
- 文字主色：`#F7FAFC`
- 文字次色：`#A0AEC0`
- 主题色：`#60A5FA`
- 成功色：`#34D399`
- 错误色：`#F87171`
- 边框色：`#4A5568`

**字体：**
- 英文单词：Inter、SF Pro、-apple-system（无衬线）
- 中文释义：PingFang SC、Microsoft YaHei
- 音标：Lucida Sans Unicode
- 基准字号：16px
- 单词显示：32px（学习界面）
- 释义显示：18px

**动画：**
- 过渡时间：200-300ms
- 缓动函数：`cubic-bezier(0.4, 0, 0.2, 1)`
- 卡片翻转：`transform: rotateY(180deg)` + `transition`
- 页面切换：淡入淡出
- 按钮悬停：轻微放大 `scale(1.05)`

**间距系统：**
- 基准间距：4px
- 小间距：8px
- 中间距：16px
- 大间距：24px
- 特大间距：32px

### 7.4 交互设计

**键盘快捷键：**
- `Space`：翻转卡片 / 下一题
- `Enter`：确认 / 提交答案
- `Esc`：暂停学习 / 返回
- `0-5`：卡片模式快速评分
- `F`：收藏当前单词
- `N`：添加笔记
- `P`：播放发音
- `S`：跳过当前单词
- `Ctrl/Cmd + F`：全局搜索
- `Ctrl/Cmd + ,`：打开设置

**鼠标交互：**
- 卡片点击：翻转
- 单词悬停：显示快速操作按钮
- 列表项悬停：显示详情预览
- 拖拽：未来支持词库排序

**反馈机制：**
- 答对：绿色闪烁 + 轻快音效（可选）
- 答错：红色闪烁 + 低沉音效（可选）
- 操作成功：Toast 提示（2秒自动消失）
- 操作失败：Toast 提示 + 错误说明
- 加载中：Spinner 或骨架屏

**学习中断恢复：**
- 关闭应用前自动保存学习进度
- 下次打开时弹窗询问："继续上次学习？"
- 保存内容：当前单词位置、学习模式、已学单词列表

---

## 8. 开发计划

### 8.1 开发阶段

**Phase 1: 核心基础（2-3 周）**
- Electron + Vue 3 项目搭建
- 数据库设计与初始化
- 基础 UI 布局和导航
- 单词卡片组件

**Phase 2: 学习功能（3-4 周）**
- Anki 算法实现
- 三种学习模式
- 学习调度器
- 错题本功能

**Phase 3: 词库管理（2 周）**
- 默认词库集成
- 词库导入（多格式支持）
- 词库导出
- 搜索和收藏功能

**Phase 4: 统计分析（2 周）**
- 数据统计模块
- ECharts 图表集成
- 学习热力图
- 详细分析页面

**Phase 5: 优化与完善（2 周）**
- 性能优化（虚拟滚动、缓存）
- 高 DPI 支持
- 深色模式
- TTS 语音支持
- 用户设置完善

**Phase 6: 测试与发布（1-2 周）**
- 单元测试
- 集成测试
- 用户测试
- 打包发布（Windows、macOS、Linux）

### 8.2 技术债务与未来迭代

**预留功能（未来版本）：**
- WebDAV 云同步
- 多用户支持
- 例句发音
- 词汇测试
- 打印功能
- 移动应用版本

**技术优化方向：**
- 数据库性能优化（索引调优）
- 内存占用优化
- 启动速度优化
- 离线词典集成

---

## 9. 补充功能亮点

### 9.1 跨词库学习去重

**实现逻辑：**
1. 用户首次学习单词时，`learning_records.is_learned` 设为 `1`
2. 切换到新词库时，调度器自动过滤 `is_learned = 1` 的单词
3. 用户可在设置中关闭此功能（适合想重新学习已掌握单词的场景）

**用户体验：**
- 避免重复劳动：已学过的单词不会再次出现在新词列表
- 进度显示：词库列表显示"已学（跨词库）"和"新词"数量
- 灵活控制：用户可手动重置某个单词的学习状态

### 9.2 智能推荐

**薄弱词汇优先：**
- 计算薄弱度：`weakness_score = mistake_count / (repetitions + 1)`
- 每日复习计划中，优先安排薄弱度高的单词
- 用户可查看"最需要复习的 20 个单词"列表

**学习计划智能生成：**
- 用户输入：目标（掌握 CET-4）、截止日期（30 天后）
- 系统计算：每日需学新词数 = (总词数 - 已学数) / 剩余天数
- 动态调整：根据每日完成情况自动调整后续计划

### 9.3 数据校验与导入预览

**数据校验：**
- JSON 格式有效性
- 版本兼容性检查（当前 v1.0）
- 外键完整性（word_id 必须存在）
- 数据类型校验（日期格式、数值范围）

**导入前预览：**
```
即将导入的数据：
- 词库：3 个（CET-4, CET-6, IELTS）
- 单词：7500 个
- 学习记录：1200 条
- 导出时间：2026-07-10
- 版本：1.0

冲突处理策略：
☑ 跳过已存在的单词
☑ 合并学习记录（保留最新）
☐ 覆盖已存在的数据

[ 取消 ]  [ 确认导入 ]
```

### 9.4 个性化学习体验

**主题跟随系统：**
- 检测系统主题（macOS、Windows 11）
- 自动切换浅色/深色模式
- 用户可手动覆盖

**字体调节：**
- 四档字体大小（小、中、大、特大）
- 实时预览效果
- 适配不同视力需求和屏幕尺寸

**TTS 发音：**
- 优先使用系统 TTS（离线可用）
- 备选在线 API（需网络，音质更好）
- 支持美音/英音切换
- 语速调节（0.5x - 2.0x）

---

## 10. 总结

本设计文档详细描述了一款面向大学生的词汇学习应用的完整方案，核心特性包括：

1. **科学的学习算法**：基于 Anki 的记忆曲线优化
2. **灵活的学习模式**：卡片、拼写、选择题三种模式
3. **智能的学习管理**：跨词库去重、智能推荐、学习计划
4. **完善的数据管理**：导入导出、数据校验、备份恢复
5. **丰富的统计分析**：可视化图表、学习热力图、薄弱词汇分析
6. **个性化体验**：主题切换、字体调节、自定义算法参数

**技术亮点：**
- Vue 3 + Electron 跨平台桌面应用
- SQLite 本地数据库，支持复杂查询和事务
- 高性能优化（虚拟滚动、懒加载、Web Worker）
- 高 DPI 支持，适配各种屏幕
- 可扩展架构，预留云同步接口

**下一步：**
进入实现阶段，编写详细的实现计划（implementation plan），分解为可执行的任务列表。
