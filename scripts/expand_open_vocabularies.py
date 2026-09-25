"""Expand the open vocabulary collection with additional domain vocabulary.

Words are gathered from two redistributable sources: ECDICT domain markers
(MIT) and Wikipedia glossary pages (CC BY-SA 4.0). Every candidate is compared
against the words already shipped in the target pack: extra words are appended
("多词就加上") and words already present are skipped ("重复就跳过"). Each pack
stays a complete, standalone word list for its domain, so the same word may
appear in several packs (the study layer deduplicates cross-pack learning).

Usage:
    python scripts/expand_open_vocabularies.py \
        --ecdict <stardict.db|ecdict.csv> --output open-vocabularies

Re-running the script is safe: words already in a pack are never duplicated.
"""

from __future__ import annotations

import argparse
import csv
import json
import re
import sqlite3
import sys
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

SCRIPTS_DIR = Path(__file__).resolve().parent
sys.path.insert(0, str(SCRIPTS_DIR))

import build_open_vocabularies as base  # noqa: E402

MARKER_RE = re.compile(r"\[([^\]]{1,12})\]")
CJK_RE = re.compile(r"[\u4e00-\u9fff]")
SKIP_DEFINITION_RE = re.compile(
    r"的复数|的第三人称|的过去|的现在分词|的比较级|的最高级"
    r"|过去式|过去分词|复数形式|缩写|缩略|词组|的宾格|的所有格"
)

LEXICON_URL = "https://raw.githubusercontent.com/dwyl/english-words/master/words_alpha.txt"
COMMON_URL = (
    "https://raw.githubusercontent.com/first20hours/google-10000-english/"
    "master/google-10000-english-usa.txt"
)

CATEGORY_SLUGS = {
    "中国内地考试": "exam-cn",
    "国际考试": "exam-international",
    "医学与健康": "medical-health",
    "生命科学": "life-science",
    "基础科学": "basic-science",
    "地球科学": "earth-science",
    "农林科学": "agriculture",
    "计算机与信息技术": "computer-it",
    "工程技术": "engineering",
    "交通与制造": "transport-manufacturing",
    "财经与管理": "business-finance",
    "法律与公共事务": "law-public",
    "人文与社会科学": "humanities-social",
    "传媒与艺术": "media-arts",
    "安全与公共服务": "safety-public-service",
    "体育与休闲": "sports-leisure",
}

# (id, name, category, ecdict markers, wikipedia glossary pages)
# Existing ids are enriched in place; unknown ids create new packs.
PACKS: list[tuple[str, str, str, list[str], list[str]]] = [
    # ---- existing packs: add ECDICT domain vocabulary and refresh glossaries ----
    ("medicine", "医学专业英语", "医学与健康", ["医", "内科", "症", "中医"], ["Glossary of medicine"]),
    ("biology", "生物学专业英语", "生命科学", ["生物", "生化"], ["Glossary of biology"]),
    ("chemistry", "化学专业英语", "基础科学", ["化", "无化", "有机化学", "有化"], ["Glossary of chemistry terms"]),
    ("physics", "物理学专业英语", "基础科学", ["物", "力", "光", "热"], ["Glossary of physics"]),
    ("mathematics", "数学专业英语", "基础科学", ["数"], ["Glossary of mathematical jargon"]),
    ("geology", "地质学专业英语", "地球科学", ["地质", "矿物", "地物"], ["Glossary of geology"]),
    ("environmental-science", "环境科学专业英语", "地球科学", ["环境"], ["Glossary of environmental science"]),
    ("agriculture", "农业专业英语", "农林科学", ["土壤", "植保", "粮食"], ["Glossary of agriculture"]),
    ("computer-science", "计算机科学专业英语", "计算机与信息技术", ["计"], ["Glossary of computer science"]),
    ("artificial-intelligence", "人工智能专业英语", "计算机与信息技术", [], ["Glossary of artificial intelligence"]),
    ("engineering-general", "工程学综合英语", "工程技术", ["材", "仪", "测"], ["Glossary of engineering: A–L", "Glossary of engineering: M–Z"]),
    ("mechanical-engineering", "机械工程专业英语", "工程技术", ["机"], ["Glossary of mechanical engineering"]),
    ("civil-engineering", "土木工程专业英语", "工程技术", [], ["Glossary of civil engineering"]),
    ("electrical-electronics", "电气与电子工程英语", "工程技术", ["电", "电子", "通信"], ["Glossary of electrical and electronics engineering"]),
    ("architecture", "建筑学专业英语", "工程技术", ["建"], ["Glossary of architecture"]),
    ("aerospace-engineering", "航空航天工程英语", "交通与制造", ["航"], ["Glossary of aerospace engineering"]),
    ("automotive-design", "汽车设计专业英语", "交通与制造", ["车辆"], ["Glossary of automotive design"]),
    ("rail-transport", "铁路运输专业英语", "交通与制造", ["铁路"], ["Glossary of rail transport terms"]),
    ("nautical", "航海专业英语", "交通与制造", ["船", "水运"], ["Glossary of nautical terms (A–L)", "Glossary of nautical terms (M–Z)"]),
    ("economics", "经济学专业英语", "财经与管理", ["经", "劳经"], ["Glossary of economics"]),
    ("business", "商务与管理英语", "财经与管理", ["经管"], ["List of business terms"]),
    ("stock-market", "证券与股票市场英语", "财经与管理", [], ["Glossary of stock market terms"]),
    ("project-management", "项目管理专业英语", "财经与管理", [], ["Glossary of project management"]),
    ("law", "法律专业英语", "法律与公共事务", ["法"], ["Glossary of law"]),
    ("education", "教育学专业英语", "人文与社会科学", [], [
        "Glossary of education terms (A–C)", "Glossary of education terms (D–F)",
        "Glossary of education terms (G–L)", "Glossary of education terms (M–O)",
        "Glossary of education terms (P–R)", "Glossary of education terms (S)",
        "Glossary of education terms (T–Z)",
    ]),

    # ---- medical & life sciences ----
    ("anatomy-physiology", "人体解剖与生理英语", "医学与健康", ["解剖", "生理"], []),
    ("pharmacology", "药学英语", "医学与健康", ["药"], []),
    ("psychiatry", "精神医学与心理健康英语", "医学与健康", [], ["Glossary of psychiatry"]),
    ("dentistry", "口腔医学英语", "医学与健康", [], ["Glossary of dentistry"]),
    ("clinical-research", "临床研究英语", "医学与健康", [], ["Glossary of clinical research"]),
    ("diabetes", "糖尿病与内分泌英语", "医学与健康", [], ["Glossary of diabetes"]),
    ("genetics", "遗传学英语", "生命科学", ["遗"], ["Glossary of genetics and evolutionary biology"]),
    ("botany", "植物学专业英语", "生命科学", ["植"], ["Glossary of botanical terms"]),
    ("zoology", "动物学专业英语", "生命科学", ["动"], ["Glossary of bird terms"]),
    ("entomology", "昆虫学专业英语", "生命科学", ["昆"], ["Glossary of entomology terms", "Glossary of ant terms"]),
    ("ecology", "生态学专业英语", "生命科学", [], ["Glossary of ecology"]),
    ("neuroscience", "神经科学英语", "生命科学", [], ["Glossary of neuroscience"]),
    ("mycology", "真菌学专业英语", "生命科学", [], ["Glossary of mycology"]),
    ("ichthyology", "鱼类学专业英语", "生命科学", [], ["Glossary of ichthyology"]),
    ("virology", "病毒学专业英语", "生命科学", [], ["Glossary of virology"]),

    # ---- natural sciences ----
    ("astronomy", "天文学专业英语", "基础科学", ["天"], ["Glossary of astronomy"]),
    ("statistics", "统计学专业英语", "基础科学", ["统计"], ["Glossary of probability and statistics", "Glossary of experimental design"]),
    ("game-theory", "博弈论英语", "基础科学", [], ["Glossary of game theory"]),
    ("string-theory", "弦理论英语", "基础科学", [], ["Glossary of string theory"]),
    ("geography", "地理学专业英语", "地球科学", [], ["Glossary of geography terms (A–M)", "Glossary of geography terms (N–Z)"]),
    ("meteorology", "气象学专业英语", "地球科学", ["气象"], ["Glossary of meteorology"]),

    # ---- agriculture, food and environment ----
    ("forestry", "林业英语", "农林科学", ["林"], []),
    ("fishery", "渔业英语", "农林科学", [], ["Glossary of fishery terms"]),
    ("food-science", "食品科学英语", "农林科学", ["食品"], ["Glossary of historical culinary terms"]),
    ("viticulture", "葡萄栽培与葡萄酒英语", "农林科学", [], ["Glossary of viticulture terms", "Glossary of wine terms"]),

    # ---- computing ----
    ("robotics", "机器人专业英语", "计算机与信息技术", [], ["Glossary of robotics"]),
    ("operating-systems", "操作系统专业英语", "计算机与信息技术", [], ["Glossary of operating systems terms"]),
    ("internet", "互联网专业英语", "计算机与信息技术", [], ["Glossary of Internet-related terms"]),

    # ---- engineering & manufacturing ----
    ("nanotechnology", "纳米技术英语", "工程技术", [], ["Glossary of nanotechnology"]),
    ("structural-engineering", "结构工程英语", "工程技术", [], ["Glossary of structural engineering"]),
    ("refrigeration-hvac", "制冷与空调英语", "工程技术", ["制冷"], ["Glossary of HVAC terms"]),
    ("mining-metallurgy", "矿业与冶金英语", "工程技术", ["矿业", "冶"], []),
    ("petroleum", "石油天然气英语", "工程技术", ["油气"], []),
    ("nuclear", "核能英语", "工程技术", ["核"], []),
    ("chemical-engineering", "化学工程英语", "工程技术", ["化工"], []),
    ("textile", "纺织英语", "交通与制造", ["纺"], ["Glossary of textile manufacturing"]),
    ("trucking-logistics", "公路运输与物流英语", "交通与制造", [], ["Glossary of the American trucking industry"]),
    ("diving", "潜水专业英语", "交通与制造", [], [
        "Glossary of underwater diving terminology: A–C", "Glossary of underwater diving terminology: D–G",
        "Glossary of underwater diving terminology: H–O", "Glossary of underwater diving terminology: P–S",
        "Glossary of underwater diving terminology: T–Z",
    ]),
    ("woodworking", "木材加工英语", "交通与制造", ["木"], []),
    ("printing", "印刷英语", "交通与制造", ["印刷"], []),

    # ---- business & law ----
    ("accounting", "会计与审计英语", "财经与管理", ["会计", "审计", "税收"], []),
    ("finance", "金融与财务英语", "财经与管理", ["财", "金融"], []),
    ("trade", "国际贸易英语", "财经与管理", ["贸易"], []),
    ("patent", "专利与知识产权英语", "法律与公共事务", ["专利"], ["Glossary of patent law terms"]),

    # ---- humanities & social sciences ----
    ("psychology", "心理学英语", "人文与社会科学", ["心理"], []),
    ("philosophy", "哲学专业英语", "人文与社会科学", [], ["Glossary of philosophy"]),
    ("logic", "逻辑学英语", "人文与社会科学", [], ["Glossary of logic"]),
    ("language-education", "语言教育专业英语", "人文与社会科学", [], ["Glossary of language education terms"]),
    ("library-science", "图书馆与信息科学英语", "人文与社会科学", [], ["Glossary of library and information science"]),
    ("literary-terms", "文学术语英语", "人文与社会科学", [], ["Glossary of literary terms"]),
    ("poetry-terms", "诗歌术语英语", "人文与社会科学", [], ["Glossary of poetry terms"]),
    ("rhetorical-terms", "修辞学术语英语", "人文与社会科学", [], ["Glossary of rhetorical terms"]),
    ("history", "史学专业英语", "人文与社会科学", [], ["Glossary of history"]),
    ("archaeology", "考古学专业英语", "人文与社会科学", [], ["Glossary of archaeology"]),

    # ---- media & arts ----
    ("music", "音乐术语英语", "传媒与艺术", [], ["Glossary of music terminology"]),
    ("journalism", "新闻学英语", "传媒与艺术", [], ["Glossary of journalism"]),
    ("broadcasting", "广播电视专业英语", "传媒与艺术", [], ["Glossary of broadcasting terms"]),
    ("motion-picture", "电影制作专业英语", "传媒与艺术", [], ["Glossary of motion picture terms"]),
    ("photography", "摄影英语", "传媒与艺术", ["摄"], []),

    # ---- leisure & public service ----
    ("sports-games", "体育与棋牌英语", "体育与休闲", ["体"], [
        "Glossary of chess", "Glossary of poker terms", "Glossary of card game terms",
        "Glossary of gymnastics terms", "Glossary of cycling", "Glossary of contract bridge terms",
    ]),
    ("military", "军事英语", "安全与公共服务", ["军"], ["Glossary of military abbreviations"]),
    ("firefighting", "消防专业英语", "安全与公共服务", [], ["Glossary of firefighting"]),
]

# Extra ECDICT sense keywords per pack: a word qualifies when one of its Chinese
# sense lines contains the keyword. Used to widen packs whose marker set is thin.
SENSE_KEYWORDS: dict[str, list[str]] = {
    "medicine": ["内科", "外科", "病理", "症状", "诊断", "治疗"],
    "anatomy-physiology": ["解剖", "生理"],
    "pharmacology": ["药理", "药物", "制剂"],
    "psychiatry": ["精神病", "精神分裂", "躁狂", "精神科", "心理障碍"],
    "dentistry": ["牙科", "口腔", "牙体", "牙周", "正畸", "义齿"],
    "diabetes": ["糖尿病", "内分泌", "胰岛素", "血糖"],
    "clinical-research": ["临床试验", "临床研究", "安慰剂", "受试者"],
    "genetics": ["遗传", "基因", "染色体", "等位基因"],
    "botany": ["植物", "花序", "叶片", "种子植物"],
    "zoology": ["动物", "脊椎动物", "无脊椎"],
    "entomology": ["昆虫", "幼虫", "蛹"],
    "ecology": ["生态", "群落", "种群"],
    "neuroscience": ["神经", "突触", "神经元"],
    "mycology": ["真菌", "霉菌", "酵母"],
    "ichthyology": ["鱼类", "鱼苗", "洄游"],
    "virology": ["病毒", "噬菌体"],
    "astronomy": ["天文", "星系", "恒星", "行星"],
    "statistics": ["统计", "方差", "样本", "回归"],
    "game-theory": ["博弈", "纳什均衡"],
    "geography": ["地理", "地貌", "气候带"],
    "meteorology": ["气象", "气压", "锋面", "降水"],
    "forestry": ["林业", "造林", "林分"],
    "fishery": ["渔业", "捕捞", "养殖"],
    "food-science": ["食品", "发酵", "保鲜", "烘焙"],
    "viticulture": ["葡萄", "酿酒", "酒庄"],
    "robotics": ["机器人", "机械手", "伺服"],
    "operating-systems": ["操作系统", "进程", "文件系统", "内核"],
    "internet": ["互联网", "因特网", "万维网", "网络协议"],
    "nanotechnology": ["纳米"],
    "structural-engineering": ["结构设计", "荷载", "桥墩"],
    "refrigeration-hvac": ["制冷", "空调", "压缩机", "冷媒"],
    "mining-metallurgy": ["采矿", "选矿", "冶炼", "合金"],
    "petroleum": ["石油", "钻井", "炼油", "油气"],
    "nuclear": ["核能", "核反应", "放射性", "同位素"],
    "chemical-engineering": ["化工", "反应器", "蒸馏", "传质"],
    "textile": ["纺织", "纱线", "织物", "印染"],
    "trucking-logistics": ["物流", "货运", "仓储", "配送"],
    "diving": ["潜水", "水下", "潜航"],
    "woodworking": ["木工", "木材", "锯切"],
    "printing": ["印刷", "制版", "胶印"],
    "accounting": ["会计", "审计", "记账", "报表", "税收"],
    "finance": ["金融", "融资", "信贷", "外汇"],
    "trade": ["贸易", "关税", "报关", "出口"],
    "patent": ["专利", "知识产权", "商标"],
    "psychology": ["心理学", "心理治疗", "精神分析", "行为治疗"],
    "philosophy": ["哲学", "形而上学", "认识论"],
    "logic": ["逻辑", "命题", "谓词", "推理"],
    "language-education": ["语言教学", "二语习得", "教学法"],
    "library-science": ["图书馆", "编目", "检索"],
    "literary-terms": ["文学", "修辞", "文体"],
    "poetry-terms": ["诗歌", "韵律", "格律"],
    "rhetorical-terms": ["修辞", "辞格"],
    "history": ["历史", "史料", "编年"],
    "archaeology": ["考古", "遗址", "文物"],
    "music": ["音乐", "乐理", "和声", "曲式", "音阶"],
    "journalism": ["新闻", "采访", "通讯社", "稿件"],
    "broadcasting": ["广播", "电视", "播音", "转播"],
    "motion-picture": ["电影", "影片", "导演", "剪辑"],
    "photography": ["摄影", "照相", "胶片", "显影", "光圈"],
    "sports-games": ["体育", "田径", "球类", "竞技", "棋牌", "围棋"],
    "military": ["军事", "武器", "部队", "战术"],
    "firefighting": ["消防", "灭火", "火灾"],
}


def fetch_word_list(url: str, cache_dir: Path) -> set[str]:
    cache_dir.mkdir(parents=True, exist_ok=True)
    name = url.rsplit("/", 1)[-1]
    path = cache_dir / name
    if not path.exists():
        request = urllib.request.Request(url, headers={"User-Agent": base.USER_AGENT})
        with urllib.request.urlopen(request, timeout=120) as response:
            path.write_bytes(response.read())
    return {line.strip().lower() for line in path.read_text(encoding="utf-8").splitlines() if line.strip()}


def iter_ecdict_rows(source: Path):
    with source.open("rb") as stream:
        magic = stream.read(16)
    columns = ("word", "phonetic", "translation", "definition", "exchange")
    if magic.startswith(b"SQLite format 3"):
        connection = sqlite3.connect(source)
        try:
            connection.row_factory = sqlite3.Row
            query = "SELECT word, phonetic, translation, definition, exchange FROM stardict"
            for row in connection.execute(query):
                yield {column: row[column] for column in columns}
        finally:
            connection.close()
    else:
        with source.open("r", encoding="utf-8-sig", newline="") as stream:
            for row in csv.DictReader(stream):
                yield {column: (row.get(column) or "") for column in columns}


def is_good_term(word: str, lexicon: set[str], common: set[str]) -> bool:
    value = base.normalize_space(word)
    if not (3 <= len(value) <= 22) or re.search(r"\d", value):
        return False
    if not re.fullmatch(r"[A-Za-z][A-Za-z' -]*", value):
        return False
    if value.startswith("-") or value.endswith("-") or "--" in value:
        return False
    tokens = value.split()
    if len(tokens) == 2:
        if any(len(token) < 3 for token in tokens):
            return False
        if all(token.lower() in common for token in tokens):
            return False
    elif len(tokens) > 2:
        return False
    if value != value.lower() and value != value.upper():
        return False
    for part in re.split(r"[-' ]+", value):
        if not part:
            continue
        if part.lower() in lexicon:
            continue
        if part.isupper() and 2 <= len(part) <= 6:
            continue
        return False
    return True


def clean_definition_lines(row: dict[str, str]) -> list[str]:
    values = []
    for value in base.translation_values(row):
        if SKIP_DEFINITION_RE.search(value):
            continue
        if len(CJK_RE.findall(value)) < 2:
            continue
        values.append(value)
    return values[:3]


def ecdict_entry(row: dict[str, str]) -> dict[str, object]:
    item = base.empty_word(base.normalize_space(row.get("word", "")))
    item["phonetic"] = base.normalize_space(row.get("phonetic", ""))
    definitions = clean_definition_lines(row)
    english = base.normalize_space(row.get("definition", ""))
    if english:
        english = f"EN: {english}"
        if english not in definitions:
            definitions.append(english)
    item["definition"] = definitions
    return item


def inflection_base_key(row: dict[str, str]) -> str | None:
    match = re.search(r"(?:^|/)0:([^/]+)", row.get("exchange") or "")
    return base.normalize_key(match.group(1)) if match else None


def scan_ecdict(
    source: Path,
    needed_keys: set[str],
    marker_packs: dict[str, list[str]],
    sense_keywords: dict[str, list[str]],
    lexicon: set[str],
    common: set[str],
) -> tuple[dict[str, dict[str, str]], dict[str, dict[str, dict[str, str]]]]:
    keyword_packs = [(pack_id, keys) for pack_id, keys in sense_keywords.items() if keys]
    if keyword_packs:
        all_words = sorted({word for _pack_id, keys in keyword_packs for word in keys}, key=len, reverse=True)
        keyword_re = re.compile("|".join(re.escape(word) for word in all_words))
    else:
        keyword_re = None
    lookup: dict[str, dict[str, str]] = {}
    marker_rows: dict[str, dict[str, dict[str, str]]] = {}
    for row in iter_ecdict_rows(source):
        key = base.normalize_key(row.get("word", ""))
        if not key:
            continue
        translation = row.get("translation") or ""
        tags = set(MARKER_RE.findall(translation)) if "[" in translation else set()
        if not tags and key not in needed_keys and not keyword_re:
            continue
        if key in needed_keys:
            lookup.setdefault(key, row)
        packs: set[str] = set()
        for tag in tags:
            packs.update(marker_packs.get(tag, ()))
        if not packs and not keyword_re:
            continue
        if not is_good_term(row.get("word", ""), lexicon, common):
            continue
        definitions = clean_definition_lines(row)
        if not definitions:
            continue
        if not packs and keyword_re is not None:
            senses = " ".join(definitions)
            if keyword_re.search(senses):
                for pack_id, keys in keyword_packs:
                    if any(word in senses for word in keys):
                        packs.add(pack_id)
        for pack_id in packs:
            marker_rows.setdefault(pack_id, {}).setdefault(key, row)
    return lookup, marker_rows


def wiki_terms(pages: list[str]) -> tuple[dict[str, dict[str, str]], list[dict[str, object]]]:
    terms: dict[str, dict[str, str]] = {}
    revisions: list[dict[str, object]] = []
    for page in pages:
        try:
            found, revision = base.parse_wikipedia_page(page)
        except Exception as error:  # noqa: BLE001 - keep going with other sources
            print(f"WARNING: failed to parse {page}: {error}")
            continue
        for key, item in found.items():
            if key not in terms or len(item["definition"]) > len(terms[key]["definition"]):
                terms[key] = item
        revisions.append(revision)
    return terms, revisions


def license_for(source_ids: list[str]) -> str:
    parts = []
    if "wikipedia" in source_ids:
        parts.append("CC-BY-SA-4.0")
    if "ecdict" in source_ids:
        parts.append("MIT")
    return " AND ".join(parts) if parts else "MIT"


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ecdict", required=True, type=Path, help="stardict.db (sqlite) or ecdict.csv")
    parser.add_argument("--output", required=True, type=Path)
    parser.add_argument("--cache", type=Path, default=SCRIPTS_DIR / ".cache")
    args = parser.parse_args()

    output_root = args.output
    catalog_path = output_root / "catalog.json"
    catalog = json.loads(catalog_path.read_text(encoding="utf-8"))
    existing = {entry["id"]: entry for entry in catalog["vocabularies"]}

    print("Loading word lists ...")
    lexicon = fetch_word_list(LEXICON_URL, args.cache)
    common = fetch_word_list(COMMON_URL, args.cache)
    print(f"  lexicon={len(lexicon)} common={len(common)}")

    marker_packs: dict[str, list[str]] = {}
    all_pages: list[str] = []
    for pack_id, _name, _category, markers, pages in PACKS:
        for marker in markers:
            marker_packs.setdefault(marker, []).append(pack_id)
        all_pages.extend(pages)

    print(f"Collecting Wikipedia glossary terms from {len(set(all_pages))} pages ...")
    page_terms: dict[str, dict[str, dict[str, str]]] = {}
    page_revisions: dict[str, list[dict[str, object]]] = {}
    for pack_id, _name, _category, _markers, pages in PACKS:
        if not pages:
            continue
        terms, revisions = wiki_terms(pages)
        page_terms[pack_id] = terms
        page_revisions[pack_id] = revisions
        print(f"  {pack_id}: {len(terms)} glossary terms")

    needed_keys = {key for terms in page_terms.values() for key in terms}
    print(f"Scanning ECDICT ({args.ecdict}) for {len(needed_keys)} lookup keys, {len(marker_packs)} markers, {len(SENSE_KEYWORDS)} keyword packs ...")
    lookup, marker_rows = scan_ecdict(args.ecdict, needed_keys, marker_packs, SENSE_KEYWORDS, lexicon, common)

    report = []
    for pack_id, name, category, markers, pages in PACKS:
        terms = page_terms.get(pack_id, {})
        revisions = page_revisions.get(pack_id, [])
        entries: dict[str, dict[str, object]] = {}
        if terms:
            for item in base.materialize_library(list(terms.values()), lookup):
                entries[base.normalize_key(str(item["word"]))] = item
        rows = marker_rows.get(pack_id, {})
        for key, row in rows.items():
            base_key = inflection_base_key(row)
            if base_key and base_key in rows:
                continue
            if key in entries:
                continue
            item = ecdict_entry(row)
            if item["definition"]:
                entries[key] = item

        entry = existing.get(pack_id)
        if entry is None:
            entry = {
                "id": pack_id,
                "name": name,
                "category": category,
                "category_slug": CATEGORY_SLUGS[category],
            }
        else:
            entry["name"] = entry.get("name") or name
            entry["category"] = entry.get("category") or category
            entry["category_slug"] = entry.get("category_slug") or CATEGORY_SLUGS[category]
        words_path = base.library_path(output_root, entry)
        current = json.loads(words_path.read_text(encoding="utf-8")) if words_path.exists() else []
        seen = {str(word["word"]).strip().lower() for word in current}
        added = []
        for item in sorted(entries.values(), key=lambda value: str(value["word"]).lower()):
            key = str(item["word"]).strip().lower()
            if key in seen:
                continue
            seen.add(key)
            added.append(item)
        words = current + added

        source_ids = list(entry.get("source_ids", []))
        if revisions:
            source_ids.append("wikipedia")
        if rows:
            source_ids.append("ecdict")
        source_ids = list(dict.fromkeys(source_ids))
        entry["source_ids"] = source_ids
        entry["license"] = license_for(source_ids)
        if revisions:
            entry["source_revisions"] = list(entry.get("source_revisions", [])) + revisions

        base.write_library(output_root, entry, words)
        existing[pack_id] = entry
        report.append((entry["category"], entry["name"], len(current), len(added), len(words)))

    catalog["vocabularies"] = sorted(existing.values(), key=lambda item: (item["category"], item["name"]))
    catalog["summary"] = {
        "vocabularies": len(catalog["vocabularies"]),
        "words": sum(item["words"] for item in catalog["vocabularies"]),
    }
    catalog["generated_at"] = datetime.now(timezone.utc).replace(microsecond=0).isoformat()
    catalog_path.write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")
    (output_root / "README.md").write_text(base.generate_readme(catalog), encoding="utf-8")

    header = f"{'category':<22} {'pack':<32} {'before':>8} {'added':>8} {'after':>8}"
    print(f"\n{header}")
    for category, name, before, added, after in report:
        print(f"{category:<22} {name:<32} {before:>8} {added:>8} {after:>8}")
    print(
        f"\nTotal: {catalog['summary']['vocabularies']} packs, "
        f"{catalog['summary']['words']} words"
    )


if __name__ == "__main__":
    main()
