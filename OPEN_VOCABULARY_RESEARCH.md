# 主流开放词库整理说明

## 整理结果

`open-vocabularies/` 收录 41 个可由 VocabMaster 直接导入的 JSON 词库，覆盖
中国内地中考、高考、CET-4、CET-6、考研，以及 IELTS、TOEFL、GRE；专业方向
保留医学、生命科学、基础科学、地学、农业、计算机、主流工程、交通制造、
财经管理、法律和教育等常见学习与就业领域。总计 52,907 条词目，跨词库重复
保留，以保证每个词库可独立使用。

完整清单、词数、文件路径和逐库来源见
[`open-vocabularies/catalog.json`](./open-vocabularies/catalog.json)，便于浏览的目录见
[`open-vocabularies/README.md`](./open-vocabularies/README.md)。

## 收录来源

| 来源 | 用途 | 许可证 |
| --- | --- | --- |
| [ECDICT](https://github.com/skywind3000/ECDICT) | 考试标签、中文释义、音标 | MIT |
| [English Wikipedia glossaries](https://en.wikipedia.org/) | 主流专业术语与英文解释 | CC BY-SA 4.0 |
| [most-frequent-technology-english-words](https://github.com/Wei-Xia/most-frequent-technology-english-words) | 程序员高频技术英语 | MIT |
| [Computer-English-Words](https://github.com/HurleyWong/Computer-English-Words) | 云计算、分布式、区块链、机器学习等 | Apache-2.0 |
| [medical_abbreviations](https://github.com/imantsm/medical_abbreviations) | 医学缩略语 | MIT |

仅采用具备明确再分发许可证的来源。Wikipedia 派生内容保留页面、页面 ID和修订号，
并明确说明经过抽取、清洗、合并与格式转换；其他来源的版权和许可声明见
[`THIRD_PARTY_NOTICES.md`](./THIRD_PARTY_NOTICES.md)。

## 未收录来源

| 候选来源 | 未收录原因 |
| --- | --- |
| `qwerty-learner` | GPL-3.0，与当前项目的 MIT 分发方式不匹配 |
| `mahavivo/english-wordlists` | 仓库未提供明确许可证 |
| `jiqizhixin/Artificial-Intelligence-Terminology-Database` | 仓库未提供明确许可证 |
| 商业单词书、培训机构词表 | 未获得再分发授权，不进行抓取或复制 |

## 数据规范与质量控制

每个词条严格包含 `word`、`phonetic`、`definition`、`examples`、`etymology`、
`synonyms`、`antonyms` 七个字段。`word` 和 `definition` 必填；同一文件内按不区分大小写的单词去重。`npm test` 会逐一读取总目录中的
全部词库，验证 JSON、字段、必填项、去重和统计值。

Wikipedia 内容通过 MediaWiki API 获取，并移除导航、目录、脚注、图片说明、隐藏
样式等非词条内容。ECDICT 仅用于已有中文释义的精确词形匹配，不自动机器翻译，
因此部分专业词库会保留英文解释。

## 复现方式

安装生成器依赖后，传入 ECDICT 的 `stardict.csv`：

```powershell
python -m pip install -r scripts/requirements-open-vocabularies.txt
python scripts/build_open_vocabularies.py --ecdict <ECDICT目录\stardict.csv> --output open-vocabularies
npm test
```

生成器只构建 `MAINSTREAM_WIKI_IDS` 中的主流专业方向；扩充范围时应先核查来源
许可证、目标用户需求和导入质量，不应直接收集无授权词表。
