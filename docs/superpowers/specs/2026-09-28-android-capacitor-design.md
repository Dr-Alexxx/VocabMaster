# VocabMaster 安卓适配设计（Capacitor）

日期：2026-09-28　状态：已批准（§1–§6 逐节确认），待实施计划

## 1. 背景与目标

VocabMaster 现为 Electron + Vue3 桌面应用（Windows）。本设计将应用适配到安卓，目标：

- **全功能对齐**：桌面功能全部可用；"对齐"指功能等价，交互形态按触屏适配（键盘快捷键变按钮、表格变卡片流、下载变分享）
- **设备**：手机竖屏优先 + 平板（横屏自动切回桌面侧边栏布局）
- **分发**：自用/直发 APK，自签，无商店审核约束
- **仓库**：原仓库 monorepo，不开新仓库、不建长期分支

### 路线决策

评估三条路线后选定 **Capacitor 包现有 Vue 前端**：

| 路线 | 结论 |
| --- | --- |
| A. Capacitor（选定） | 一套 Vue 前端跑两端，只换数据层与系统插件；词库数据/纯逻辑/测试全复用 |
| B. Kotlin 原生 | Vue + Kotlin 两套前端共存，每功能写两遍，3–5 倍工作量；弃 |
| C. Flutter | 同为两套前端，且 xlsx/GB18030 生态更弱，iOS 潜力对本项目是 YAGNI；弃 |

### 非目标（YAGNI 记录）

不上架应用商店；不做 iOS；不做云同步/多用户；不做桌面端 Flutter 化。

## 2. 架构与目录

```
VocabMaster/（monorepo）
├── src/                  # Vue 前端 —— 桌面/安卓共用
├── src/backend/          # 【新】业务查询层：从 electron/ipc.cjs 抽出的纯 JS（SQL + SM-2 + 备份合并 + 导入解析）
├── src/platform/         # 【新】平台选择：Electron 走 window.vocabApi，安卓注入 Capacitor 实现
├── electron/             # 桌面主进程（变薄：窗口/文件对话框，业务转发 src/backend）
├── android/              # 【新】Capacitor Android 工程（Gradle）
└── resources/vocabularies/  # 内置词库 JSON（两端共用，安卓侧打进 assets 首启 seed）
```

### vocabApi 门面（不变的接缝）

`src/services/api.js` 保持现有 23 个方法签名（Promise 接口）：`dashboard`、`vocabularies`、`setVocabularyActive`、`deleteVocabulary`、`previewVocabularyImport`、`commitVocabularyImport`、`saveVocabularyTemplate`、`exportVocabulary`、`searchWords`、`getWord`、`updateWord`、`favorites`、`dailyPlan`、`submitAnswer`、`mistakes`、`removeMistake`、`statistics`、`getSettings`、`saveSettings`、`exportBackup`、`previewBackup`、`commitBackup`、`resetProgress`。

平台差异在实现内消化：桌面的"文件路径返回值"在安卓上变为分享完成/SAF 结果，前端只依赖成功/失败与提示文案。

### src/backend/ 抽取

`electron/ipc.cjs` 的业务查询（约 520 行 SQL + SM-2 调度 + 备份合并 + 导入解析）抽为纯 JS 模块，Electron 主进程与 Capacitor 侧**共用同一份**。`db-schema.cjs` 迁至 `src/backend/schema.js` 继续作为单一 schema 来源。

导入解析统一改造：`parseVocabularyFile(bytes, filename)` 接收字节而非文件路径；GB18030 解码改用 `TextDecoder('gb18030')`（Electron/WebView/Node 均原生支持），**移除 iconv-lite 依赖**；xlsx 读取用 `type: 'array'`。

## 3. 数据层

- 驱动：`@capacitor-community/sqlite` 顶替 better-sqlite3；在 `src/backend/` 做薄异步适配层（`run/get/all/transaction`），业务 SQL 不变
- `backup-merge` 已是驱动无关 SQL 子集，仅换事务包装
- 内置词库：JSON 打进 APK assets，首次启动 seed（复用现有 seed 逻辑）
- 数据库位于应用私有目录，免存储权限
- **备份 JSON 格式不变，桌面 ↔ 安卓备份文件直接互通**（覆盖/合并/跳过三策略同语义）

## 4. 系统能力映射

| 桌面 | 安卓 |
| --- | --- |
| 文件选择导入词库 | file-picker（SAF）→ bytes → 同一解析函数 |
| 导出词库/模板 | 写应用缓存 + share 系统分享 |
| 备份导出/恢复 | 同上 + SAF 导入 |
| TTS 美音/英音/语速 | Web Speech API（系统 TTS），lang 标签匹配音色 |
| 主题浅/深/系统 | 照用（WebView 支持 prefers-color-scheme） |
| 键盘快捷键 | 触屏按钮（见 §5） |
| 版本注入 | 同一份 package.json version |
| 窗口/托盘 | 无对应，忽略 |

## 5. UI 与触屏适配

### 已定布局决策（可视化评审逐项确认）

- **主导航：四 Tab + 页内分段**（今日 / 学习 / 统计 / 我的）。学习页顶部分段条切换 卡片 | 拼写 | 测试 | 错题。词库、设置、备份收进「我的」
- **学习页：卡片内嵌操作**。发音跟词走（点词朗读），收藏/跳过收在卡片底部，卡片外只留主按钮；0–5 卡片自评做成两行大按钮
- **今日 Tab**：今日计划卡 + 学习目标进度条（截止日/剩余天数/今日建议量）+ 待复习/新词指标 + 收藏快捷 + 吸底「开始学习」
- **错题分段**：表格 → 卡片流（单词/释义/错误次数/最近错误），全部/常错小分段，专项复习吸底；单词详情抽屉 → 全屏页
- **统计 Tab**：指标条 + 趋势图 + 热力图横滚 + 薄弱词；周期切换吸顶；图表懒加载进 Tab
- **我的 Tab**：词库管理（导入/导出/规范模板）· 收藏词汇 · 学习目标 · 发音与显示 · 备份恢复 · 清空学习记录 · 关于

### 统一规则

快捷键 → 可见按钮（`P` 点词/发音按钮反复跟读、`F` 星标、`S` 跳过、`Esc` 返回 = 顶部 ←）；拼写输入框随系统键盘顶起自动聚焦；「揭晓答案自动朗读」照搬；平板横屏自动切回现有侧边栏布局（断点 ≥ 768px，桌面代码不动）。

## 6. 构建与分发

- 工程：`android/`（Capacitor 7 + Gradle 8），`minSdk 26`、`targetSdk 35`
- 插件：`@capacitor-community/sqlite`、`@capacitor/filesystem`、`@capacitor/share`、`@capacitor/file-picker`、`@capacitor/app`
- npm scripts：`cap:sync`（`vite build && cap sync`）、`build:android`（debug）、`build:android:release`（签名）、`pack:apk`（按发布命名拷贝 `release/VocabMaster-<version>-android.apk`）
- 签名：自签 keystore 于 `android/keystore/`，密码存 `keystore.properties`；两者进 `.gitignore`
- 版本：versionName = package.json version；versionCode 在 gradle 单点维护
- 桌面 `build:win` 不受影响，两端构建链独立

## 7. 测试与验收

- **自动化**：现有 154 用例保持全绿（纯逻辑两端共用）；`src/backend/` 抽出后新增 SQL 集成测试——同一套 backend 代码在 node:sqlite（测试）与 better-sqlite3（桌面）双驱动跑通，证明驱动无关（backup-merge 先例）
- **手工验收**（模拟器 + 真机）：首启 seed 词库 → 导入 CSV/Excel → 备份三策略桌面↔安卓互通 → TTS 美英音/语速/揭晓朗读 → 学习目标摊派 → 测试模式成绩单 → 平板横竖屏切换 → 分享导出
- **验收标准**：README「主要功能」逐条在手机上通过 = 全功能对齐达成；无 CI（自用），`npm test` + 手工清单封版

## 8. 风险与缓解

| 风险 | 缓解 |
| --- | --- |
| WebView 大词库列表性能 | 列表虚拟化/content-visibility 已有；必要时分页查询 |
| SQLite 插件事务/初始化兼容坑 | 集成测试先行；适配层隔离，换驱动不动业务 SQL |
| Excel 解析在 WebView 的内存占用 | 限制单文件行数（沿用 50,000 行建议），大文件提示 |
| TTS 音色随厂商 ROM 差异 | lang 标签匹配 + 回退系统默认音色（现有 pickVoice 语义） |
| SAF/分享在各 ROM 的行为差异 | 用官方插件的标准流，手工清单覆盖主流机型 |
