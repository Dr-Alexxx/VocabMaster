# VocabMaster

VocabMaster 是面向 CET-4/6、IELTS 和 TOEFL 备考的 Windows / macOS 桌面词汇学习应用。数据保存在本机 SQLite 数据库，不需要账号或网络连接。

## 主要功能

- 内置 CET-4（2,000）、CET-6（2,500）、IELTS（3,000）、TOEFL（3,500）核心词汇，可按需启用或停用
- 基于 SM-2 的智能复习调度，可调整初始难易度、间隔系数和掌握阈值
- 卡片、拼写、选择题、混合四种学习方式，以及 20 题词汇测试（成绩报告与薄弱词清单）
- 拼写按编辑距离容错评分，并显式提示“接近正确”
- 三种学习来源：今日计划、错题专项、收藏专项复习
- 学习目标：设定截止日期后自动摊派每日新词量，并随完成进度动态调整
- 跨词库学习去重、错题本、常错本（累计错 3 次）、收藏和个人笔记
- 单词详情抽屉：释义、音标、例句、词源、近反义词、学习记录与正确率
- 首页搜索单词、释义或例句
- 学习趋势、词库完成度、模式表现、热力图和薄弱词分析
- CSV、Excel、JSON、TXT 词库字段映射导入，词库可导出为 JSON 或 CSV
- 词库页面内置制作规范，并可下载 CSV、Excel、JSON 标准模板
- 系统语音朗读（美音/英音、0.5–2.0x 语速可调）与自动朗读开关，每日新词/复习上限、例句显示和四档字体大小可调
- 完整学习数据备份与恢复（覆盖/合并/跳过三种策略）、清空学习记录（保留词库、收藏与笔记），支持浅色、深色和跟随系统主题

## 开发

Windows 需要 Windows 11 x64，macOS 需要 macOS 13 或更高版本（Apple Silicon）。两端都需要 Node.js 24 或更高版本（单测使用内置 `node:sqlite`）。

```bash
npm install
npm run dev
```

## 测试与构建

```bash
npm test
npm run build:web

# Windows（在 Windows 11 x64 上执行）
npm run build:win
npm run pack:zip

# macOS（在 macOS Apple Silicon 上执行）
npm run build:mac
```

`npm test` 运行 9 个测试套件（SM-2 算法、本地日期与目标摊派、学习交互与测试评级、语音选择、备份合并策略、词库模板、内置词库与开放词库数据校验）。

### Windows 构建

Windows 构建产物位于 `release/`（`npm run build:win` 生成安装包与程序目录，`npm run pack:zip` 将 `win-unpacked/` 打包为发布 zip）：

- `VocabMaster-Setup-1.0.1-win-x64.exe`：可选择安装目录的 NSIS 安装程序
- `VocabMaster-Portable-1.0.1-win-x64.exe`：无需安装的便携启动器
- `VocabMaster-1.0.1-win-x64.zip`：直接包含 AMD64 主程序的压缩包
- `win-unpacked/`：未压缩的 x64 程序目录

NSIS 安装器和便携启动器使用通用 Windows 引导壳，内部应用与 SQLite 原生模块均按 AMD64/x64 构建。

### macOS 构建

macOS 构建流程（Apple Silicon / arm64）：

1. 安装依赖并构建：`npm install && npm run build:mac`（内部先执行 `vite build` 生成 `dist/`，再由 electron-builder 打包；better-sqlite3 会自动为 Electron 重编译 arm64 原生模块）
2. macOS 图标由 `resources/icons/icon.png`（1024x1024）生成：`iconutil -c icns` 转换为 `resources/icons/icon.icns`，构建时按 `resources/icons/icon.icns` 打入 `.app`
3. 需要仅打包不生成安装器时可运行 `npm run pack:mac`（等价 `electron-builder --mac --arm64 --dir`）

macOS 构建产物位于 `release/`：

- `VocabMaster-Setup-1.0.1-mac-arm64.dmg`：磁盘映像安装包
- `VocabMaster-1.0.1-mac-arm64.zip`：直接包含 `VocabMaster.app` 的压缩包
- `mac-arm64/VocabMaster.app`：未打包的 arm64 应用程序包

### macOS 安装

1. 打开 `VocabMaster-Setup-1.0.1-mac-arm64.dmg`，将 VocabMaster 图标拖入“应用程序”文件夹
2. 从“应用程序”启动 VocabMaster

注意：当前构建未配置 Apple 开发者签名与公证（`identity: null`），首次打开会被 Gatekeeper 拦截（提示“无法验证开发者”或“已损坏”）。处理方式：

- 在“应用程序”中右键 VocabMaster →“打开”，在弹窗中再次点击“打开”；或
- 执行 `xattr -dr com.apple.quarantine /Applications/VocabMaster.app` 清除隔离属性后再启动

如有 Apple Developer 证书，可在 `package.json` 的 `build.mac` 中移除 `identity: null` 并配置签名与公证后重新构建，安装后即可直接打开。

## 学习快捷键

| 按键 | 操作 |
| --- | --- |
| `Space` | 翻开卡片；答题后进入下一题 |
| `Enter` | 提交拼写答案；答题后进入下一题 |
| `0`–`5` | 卡片自评 |
| `A`–`D` / `1`–`4` | 选择题选项快捷键 |
| `F` | 收藏/取消收藏 |
| `S` | 稍后再学 |
| `P` | 朗读当前单词 |
| `Esc` | 暂停/继续；关闭单词详情 |

## 本机数据

数据库保存在 Electron 的用户数据目录中，Windows 默认位置为 `%APPDATA%\VocabMaster\vocabmaster.db`，macOS 默认位置为 `~/Library/Application Support/VocabMaster/vocabmaster.db`。应用内“设置 → 数据管理”可以导出完整 JSON 备份。

## 词汇数据来源

默认词库由 MIT 许可的 [ECDICT](https://github.com/skywind3000/ECDICT) 数据按考试标签和词频提取。完整声明见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。

项目根目录的 [open-vocabularies](./open-vocabularies/) 另含 41 个面向中国内地常见考试、专业学习和就业场景的开放词库，共 52,907 条词目，可在词库页面直接导入。收录范围、来源、许可证和复现方式见 [OPEN_VOCABULARY_RESEARCH.md](./OPEN_VOCABULARY_RESEARCH.md)。
