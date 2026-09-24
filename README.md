# VocabMaster

VocabMaster 是面向 CET-4/6、IELTS 和 TOEFL 备考的 Windows 桌面词汇学习应用。数据保存在本机 SQLite 数据库，不需要账号或网络连接。

## 主要功能

- 内置 CET-4（2,000）、CET-6（2,500）、IELTS（3,000）、TOEFL（3,500）核心词汇，可按需启用或停用
- 基于 SM-2 的智能复习调度，可调整初始难易度、间隔系数和掌握阈值
- 卡片、拼写、选择题和混合四种学习方式，拼写按编辑距离容错评分
- 三种学习来源：今日计划、错题专项、收藏专项复习
- 跨词库学习去重、错题本、常错本（累计错 3 次）、收藏和个人笔记
- 单词详情抽屉：释义、音标、例句、词源、近反义词、学习记录与正确率
- 首页搜索单词、释义或例句
- 学习趋势、词库完成度、模式表现、热力图和薄弱词分析
- CSV、Excel、JSON、TXT 词库字段映射导入，词库可导出为 JSON（底层接口同时支持 CSV）
- 词库页面内置制作规范，并可下载 CSV、Excel、JSON 标准模板
- 系统语音朗读与自动朗读开关，每日新词/复习上限、例句显示和四档字体大小可调
- 完整学习数据备份与恢复、清空学习记录（保留词库、收藏与笔记），支持浅色、深色和跟随系统主题

## 开发

需要 Windows 11 x64 和 Node.js 20 或更高版本。

```powershell
npm install
npm run dev
```

## 测试与构建

```powershell
npm test
npm run build:web
npm run build:win
```

`npm test` 运行 5 个测试套件（SM-2 算法、拼写与选择题交互、词库模板、内置词库与开放词库数据校验）。

Windows 构建产物位于 `release/`：

- `VocabMaster-Setup-1.0.1-win-x64.exe`：可选择安装目录的 NSIS 安装程序
- `VocabMaster-Portable-1.0.1-win-x64.exe`：无需安装的便携启动器
- `VocabMaster-1.0.1-win-x64.zip`：直接包含 AMD64 主程序的压缩包
- `win-unpacked/`：未压缩的 x64 程序目录

NSIS 安装器和便携启动器使用通用 Windows 引导壳，内部应用与 SQLite 原生模块均按 AMD64/x64 构建。

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

数据库保存在 Electron 的用户数据目录中，Windows 默认位置为 `%APPDATA%\VocabMaster\vocabmaster.db`。应用内“设置 → 数据管理”可以导出完整 JSON 备份。

## 词汇数据来源

默认词库由 MIT 许可的 [ECDICT](https://github.com/skywind3000/ECDICT) 数据按考试标签和词频提取。完整声明见 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。

项目根目录的 [open-vocabularies](./open-vocabularies/) 另含 41 个面向中国内地常见考试、专业学习和就业场景的开放词库，共 52,907 条词目，可在词库页面直接导入。收录范围、来源、许可证和复现方式见 [OPEN_VOCABULARY_RESEARCH.md](./OPEN_VOCABULARY_RESEARCH.md)。
