"""Build import-ready open vocabulary packs for VocabMaster.

Sources are deliberately restricted to repositories and APIs with explicit
redistribution licenses. The generated JSON files contain the seven stable
content fields used by this collection; provenance lives in catalog.json.
"""

from __future__ import annotations

import argparse
import csv
import io
import json
import re
import time
import unicodedata
import urllib.parse
import urllib.request
import urllib.error
import zipfile
from collections import defaultdict
from concurrent.futures import ThreadPoolExecutor, as_completed
from datetime import datetime, timezone
from pathlib import Path

from lxml import html


USER_AGENT = "VocabMaster/1.0 (open vocabulary research; local educational app)"

EXAM_SOURCES = {
    "zk": ("cn-middle-school", "中国内地中考英语完整词汇", "中国内地考试"),
    "gk": ("cn-high-school", "中国内地高考英语完整词汇", "中国内地考试"),
    "cet4": ("cn-cet4-full", "大学英语四级完整词汇", "中国内地考试"),
    "cet6": ("cn-cet6-full", "大学英语六级完整词汇", "中国内地考试"),
    "ky": ("cn-postgraduate", "全国硕士研究生招生考试英语词汇", "中国内地考试"),
    "ielts": ("ielts-full", "IELTS 完整词汇", "国际考试"),
    "toefl": ("toefl-full", "TOEFL 完整词汇", "国际考试"),
    "gre": ("gre-full", "GRE 完整词汇", "国际考试"),
}

WIKI_SOURCES = [
    ("medicine", "医学专业英语", "医学与健康", ["Glossary of medicine"]),
    ("psychiatry", "精神医学与心理健康英语", "医学与健康", ["Glossary of psychiatry"]),
    ("biology", "生物学专业英语", "生命科学", ["Glossary of biology"]),
    ("genetics-evolution", "遗传与进化生物学英语", "生命科学", ["Glossary of genetics and evolutionary biology"]),
    ("botany", "植物学专业英语", "生命科学", ["Glossary of botanical terms"]),
    ("entomology", "昆虫学专业英语", "生命科学", ["Glossary of entomology terms"]),
    ("ecology", "生态学专业英语", "生命科学", ["Glossary of ecology"]),
    ("chemistry", "化学专业英语", "基础科学", ["Glossary of chemistry terms"]),
    ("physics", "物理学专业英语", "基础科学", ["Glossary of physics"]),
    ("mathematics", "数学专业英语", "基础科学", ["Glossary of mathematical jargon"]),
    ("astronomy", "天文学专业英语", "基础科学", ["Glossary of astronomy"]),
    ("geology", "地质学专业英语", "地球科学", ["Glossary of geology"]),
    ("geography", "地理学专业英语", "地球科学", ["Glossary of geography terms"]),
    ("meteorology", "气象学专业英语", "地球科学", ["Glossary of meteorology"]),
    ("environmental-science", "环境科学专业英语", "地球科学", ["Glossary of environmental science"]),
    ("agriculture", "农业专业英语", "农林科学", ["Glossary of agriculture"]),
    ("computer-science", "计算机科学专业英语", "计算机与信息技术", ["Glossary of computer science"]),
    ("artificial-intelligence", "人工智能专业英语", "计算机与信息技术", ["Glossary of artificial intelligence"]),
    ("robotics", "机器人专业英语", "计算机与信息技术", ["Glossary of robotics"]),
    ("operating-systems", "操作系统专业英语", "计算机与信息技术", ["Glossary of operating systems terms"]),
    ("internet", "互联网专业英语", "计算机与信息技术", ["Glossary of Internet-related terms"]),
    ("engineering-general", "工程学综合英语", "工程技术", ["Glossary of engineering: A–L", "Glossary of engineering: M–Z"]),
    ("mechanical-engineering", "机械工程专业英语", "工程技术", ["Glossary of mechanical engineering"]),
    ("civil-engineering", "土木工程专业英语", "工程技术", ["Glossary of civil engineering"]),
    ("electrical-electronics", "电气与电子工程英语", "工程技术", ["Glossary of electrical and electronics engineering"]),
    ("architecture", "建筑学专业英语", "工程技术", ["Glossary of architecture"]),
    ("aerospace-engineering", "航空航天工程英语", "交通与制造", ["Glossary of aerospace engineering"]),
    ("automotive-design", "汽车设计专业英语", "交通与制造", ["Glossary of automotive design"]),
    ("rail-transport", "铁路运输专业英语", "交通与制造", ["Glossary of rail transport terms"]),
    ("nautical", "航海专业英语", "交通与制造", ["Glossary of nautical terms (A–L)", "Glossary of nautical terms (M–Z)"]),
    ("trucking-logistics", "公路运输与物流英语", "交通与制造", ["Glossary of the American trucking industry"]),
    ("diving", "潜水专业英语", "交通与制造", ["Glossary of underwater diving terminology"]),
    ("economics", "经济学专业英语", "财经与管理", ["Glossary of economics"]),
    ("stock-market", "证券与股票市场英语", "财经与管理", ["Glossary of stock market terms"]),
    ("business", "商务与管理英语", "财经与管理", ["List of business terms"]),
    ("project-management", "项目管理专业英语", "财经与管理", ["Glossary of project management"]),
    ("law", "法律专业英语", "法律与公共事务", ["Glossary of law"]),
    ("education", "教育学专业英语", "人文与社会科学", [
        "Glossary of education terms (A–C)", "Glossary of education terms (D–F)",
        "Glossary of education terms (G–L)", "Glossary of education terms (M–O)",
        "Glossary of education terms (P–R)", "Glossary of education terms (S)",
        "Glossary of education terms (T–Z)",
    ]),
    ("language-education", "语言教育专业英语", "人文与社会科学", ["Glossary of language education terms"]),
    ("philosophy", "哲学专业英语", "人文与社会科学", ["Glossary of philosophy"]),
    ("broadcasting", "广播电视专业英语", "传媒与艺术", ["Glossary of broadcasting terms"]),
    ("motion-picture", "电影制作专业英语", "传媒与艺术", ["Glossary of motion picture terms"]),
    ("firefighting", "消防专业英语", "安全与公共服务", ["Glossary of firefighting"]),
    ("military-abbreviations", "军事英语缩略语", "安全与公共服务", ["Glossary of military abbreviations"]),
]

# Default distribution: broad enough for mainstream study and employment in
# mainland China, without shipping every narrow glossary discovered in research.
MAINSTREAM_WIKI_IDS = {
    "medicine", "biology", "chemistry", "physics", "mathematics", "geology",
    "environmental-science", "agriculture", "computer-science", "artificial-intelligence",
    "engineering-general", "mechanical-engineering", "civil-engineering",
    "electrical-electronics", "architecture", "aerospace-engineering", "automotive-design",
    "rail-transport", "nautical", "economics", "stock-market", "business",
    "project-management", "law", "education",
}
WIKI_SOURCES = [source for source in WIKI_SOURCES if source[0] in MAINSTREAM_WIKI_IDS]

SOURCE_METADATA = {
    "ecdict": {
        "name": "ECDICT",
        "url": "https://github.com/skywind3000/ECDICT",
        "license": "MIT",
        "license_url": "https://github.com/skywind3000/ECDICT/blob/master/LICENSE",
    },
    "wikipedia": {
        "name": "Wikipedia glossary articles",
        "url": "https://en.wikipedia.org/",
        "license": "CC-BY-SA-4.0",
        "license_url": "https://foundation.wikimedia.org/wiki/Policy:Terms_of_Use",
    },
    "technology-words": {
        "name": "most-frequent-technology-english-words",
        "url": "https://github.com/Wei-Xia/most-frequent-technology-english-words",
        "license": "MIT",
        "license_url": "https://github.com/Wei-Xia/most-frequent-technology-english-words/blob/master/LICENSE",
    },
    "computer-words": {
        "name": "Computer-English-Words",
        "url": "https://github.com/HurleyWong/Computer-English-Words",
        "license": "Apache-2.0",
        "license_url": "https://github.com/HurleyWong/Computer-English-Words/blob/master/LICENSE",
    },
    "medical-abbreviations": {
        "name": "medical_abbreviations",
        "url": "https://github.com/imantsm/medical_abbreviations",
        "license": "MIT",
        "license_url": "https://github.com/imantsm/medical_abbreviations/blob/master/LICENSE",
    },
}


def fetch_bytes(url: str, attempts: int = 7) -> bytes:
    for attempt in range(attempts):
        try:
            request = urllib.request.Request(url, headers={"User-Agent": USER_AGENT})
            with urllib.request.urlopen(request, timeout=60) as response:
                return response.read()
        except urllib.error.HTTPError as error:
            if attempt == attempts - 1:
                raise
            retry_after = error.headers.get("Retry-After")
            delay = float(retry_after) if retry_after and retry_after.isdigit() else 4.0 * (attempt + 1)
            time.sleep(delay)
        except Exception:
            if attempt == attempts - 1:
                raise
            time.sleep(2.0 * (attempt + 1))
    raise RuntimeError("unreachable")


def normalize_space(value: str) -> str:
    return re.sub(r"\s+", " ", unicodedata.normalize("NFKC", value or "")).strip()


def normalize_key(value: str) -> str:
    value = normalize_space(value).lower().replace("–", "-").replace("—", "-")
    return value.strip(" .,:;()[]{}\"'")


def clean_term(value: str) -> str:
    value = normalize_space(value)
    value = re.sub(r"\[[^\]]{0,30}\]", "", value)
    value = re.sub(r"^(?:also|see(?: also)?|main article)\s*[:：]\s*", "", value, flags=re.I)
    value = value.strip(" \t\r\n-–—:：;；,.。\"'")
    # Wikipedia sometimes puts the closing parenthesis just outside the bold
    # term node, for example "abstract data type (ADT)".
    if value.count("(") == value.count(")") + 1:
        value += ")"
    return value


def clean_definition(value: str, term: str = "") -> str:
    value = normalize_space(value)
    if term and value.lower().startswith(term.lower()):
        value = value[len(term):]
    value = re.sub(r"^\s*[-–—:：·•]+\s*", "", value)
    value = re.sub(r"\[(?:\d+|citation needed|clarification needed)\]", "", value, flags=re.I)
    value = normalize_space(value)
    return value[:700].rstrip()


def valid_term(term: str, definition: str) -> bool:
    if not (2 <= len(term) <= 120 and 4 <= len(definition)):
        return False
    if not re.search(r"[A-Za-z]", term) or len(term.split()) > 14:
        return False
    lowered = term.lower()
    blocked = ("see also", "references", "external links", "further reading", "bibliography")
    if lowered.startswith("glossary of ") or lowered.startswith("list of "):
        return False
    return not any(lowered == value or lowered.startswith(value + " ") for value in blocked)


def add_term(target: dict[str, dict[str, str]], term: str, definition: str) -> None:
    term = clean_term(term)
    definition = clean_definition(definition, term)
    if not valid_term(term, definition):
        return
    key = normalize_key(term)
    existing = target.get(key)
    if not existing or len(definition) > len(existing["definition"]):
        target[key] = {"word": term, "definition": definition}


def parse_wikipedia_page(page: str) -> tuple[dict[str, dict[str, str]], dict[str, object]]:
    query = urllib.parse.urlencode({
        "action": "parse", "format": "json", "formatversion": "2",
        "page": page, "prop": "text|revid",
    })
    payload = json.loads(fetch_bytes(f"https://en.wikipedia.org/w/api.php?{query}"))
    parsed = payload["parse"]
    root = html.fromstring(parsed["text"])
    terms: dict[str, dict[str, str]] = {}

    # Remove non-content nodes before calling text_content(). Without this,
    # navigation groups, image captions, citations and embedded CSS can be
    # mistaken for glossary definitions.
    discard_classes = (
        "navbox", "sidebar", "metadata", "hatnote", "mw-editsection", "thumb",
        "infobox", "toc", "portalbox", "sistersitebox", "shortdescription",
    )
    discard_nodes = root.xpath("//style | //script | //sup | //figure | //*[@aria-hidden='true']")
    for class_name in discard_classes:
        discard_nodes.extend(root.xpath(
            f"//*[contains(concat(' ', normalize-space(@class), ' '), ' {class_name} ')]"
        ))
    seen_nodes = set()
    for node in discard_nodes:
        identity = id(node)
        if identity in seen_nodes or node.getparent() is None:
            continue
        seen_nodes.add(identity)
        node.drop_tree()

    for node in root.xpath("//dt"):
        siblings = node.xpath("following-sibling::*[1][self::dd]")
        if not siblings:
            # Some glossaries wrap the definition in a nested list:
            # <dt><dfn>term</dfn></dt><dl><dd>definition</dd></dl>
            siblings = node.xpath("following-sibling::*[1][self::dl]/dd[1]")
        if siblings:
            add_term(terms, node.text_content(), siblings[0].text_content())

    # Heading-based glossaries: <h3>term</h3><p>definition</p>
    for node in root.xpath("//h3 | //h4"):
        term = node.text_content()
        if re.fullmatch(r"[A-Za-z]{1,3}", term.strip()):
            continue  # letter range headings such as "Aa"
        containers = node.xpath("ancestor::div[contains(@class,'mw-heading')][1]")
        if containers:
            blocks = containers[0].xpath("following-sibling::*[1][self::p]")
        else:
            blocks = node.xpath("following-sibling::*[1][self::p]")
        if blocks:
            add_term(terms, term, blocks[0].text_content())

    def block_definition(node, term):
        text = node.text_content()
        if len(clean_definition(text, term)) >= 10:
            return text
        for sib in node.xpath("following-sibling::*[1][self::dl] | following-sibling::*[1][self::p]"):
            if len(clean_definition(sib.text_content(), term)) >= 10:
                return sib.text_content()
        return text

    for item in root.xpath("//li"):
        headings = item.xpath("./b[1] | ./strong[1] | ./dfn[1]")
        if not headings:
            # "<li><a href="...">term</a>: definition</li>" glossary lists
            anchors = item.xpath("./a[1]")
            if anchors:
                tail = (anchors[0].tail or "").lstrip()
                if tail.startswith((":", "：", " – ", " — ", " - ")):
                    headings = anchors
        if headings:
            add_term(terms, headings[0].text_content(), item.text_content())

    for paragraph in root.xpath("//p"):
        headings = paragraph.xpath("./b[1] | ./strong[1] | ./dfn[1]")
        if headings:
            add_term(terms, headings[0].text_content(), block_definition(paragraph, headings[0].text_content()))

    for row in root.xpath("//table//tr"):
        cells = row.xpath("./th | ./td")
        if len(cells) >= 2:
            add_term(terms, cells[0].text_content(), cells[1].text_content())

    revision = {
        "requested_page": page,
        "resolved_page": parsed.get("title", page),
        "pageid": parsed.get("pageid"),
        "revision": parsed.get("revid"),
        "url": f"https://en.wikipedia.org/wiki/{urllib.parse.quote(parsed.get('title', page).replace(' ', '_'))}",
    }
    return terms, revision


def fetch_wikipedia_libraries() -> dict[str, dict[str, object]]:
    pages = sorted({page for _id, _name, _category, source_pages in WIKI_SOURCES for page in source_pages})
    page_results: dict[str, tuple[dict[str, dict[str, str]], dict[str, object]]] = {}
    failures = []
    with ThreadPoolExecutor(max_workers=1) as executor:
        futures = {executor.submit(parse_wikipedia_page, page): page for page in pages}
        for future in as_completed(futures):
            page = futures[future]
            try:
                page_results[page] = future.result()
                print(f"Wikipedia: {page} -> {len(page_results[page][0])} terms")
            except Exception as error:
                print(f"WARNING: failed to parse {page}: {error}")
                failures.append((page, str(error)))

    if failures:
        details = "; ".join(f"{page}: {error}" for page, error in failures)
        raise RuntimeError(f"Required mainstream Wikipedia sources failed: {details}")

    libraries: dict[str, dict[str, object]] = {}
    for identifier, name, category, source_pages in WIKI_SOURCES:
        combined: dict[str, dict[str, str]] = {}
        revisions = []
        for page in source_pages:
            if page not in page_results:
                continue
            terms, revision = page_results[page]
            for key, item in terms.items():
                if key not in combined or len(item["definition"]) > len(combined[key]["definition"]):
                    combined[key] = item
            revisions.append(revision)
        if combined:
            libraries[identifier] = {
                "name": name, "category": category, "terms": list(combined.values()),
                "source_ids": ["wikipedia", "ecdict"], "source_revisions": revisions,
                "license": "CC-BY-SA-4.0 AND MIT",
            }
    return libraries


def download_github_archive(repo: str, branch: str = "master") -> zipfile.ZipFile:
    url = f"https://codeload.github.com/{repo}/zip/refs/heads/{branch}"
    return zipfile.ZipFile(io.BytesIO(fetch_bytes(url)))


def parse_front_matter(text: str) -> dict[str, str]:
    match = re.match(r"^---\s*\n(.*?)\n---", text, flags=re.S)
    if not match:
        return {}
    result = {}
    for line in match.group(1).splitlines():
        if ":" in line:
            key, value = line.split(":", 1)
            result[key.strip()] = value.strip().strip("\"'")
    return result


def github_technology_words() -> dict[str, dict[str, object]]:
    archive = download_github_archive("Wei-Xia/most-frequent-technology-english-words")
    terms = []
    for name in archive.namelist():
        if "/_posts/" not in name or not name.endswith(".md"):
            continue
        fields = parse_front_matter(archive.read(name).decode("utf-8", errors="replace"))
        if not fields.get("word") or not fields.get("meaning"):
            continue
        definitions = [fields["meaning"]]
        if fields.get("note"):
            definitions.append(f"使用说明：{fields['note']}")
        terms.append({"word": fields["word"], "definition_values": definitions, "phonetic": fields.get("correct", "")})
    return {
        "technology-high-frequency": {
            "name": "程序员技术英语高频词", "category": "计算机与信息技术", "terms": terms,
            "source_ids": ["technology-words"], "license": "MIT",
        }
    }


COMPUTER_CATEGORY_NAMES = {
    "云计算": ("cloud-computing", "云计算专业英语"),
    "分布式系统": ("distributed-systems", "分布式系统专业英语"),
    "区块链": ("blockchain", "区块链专业英语"),
    "大数据": ("big-data", "大数据专业英语"),
    "数据挖掘": ("data-mining", "数据挖掘专业英语"),
    "机器学习": ("machine-learning", "机器学习专业英语"),
}


def github_computer_words() -> dict[str, dict[str, object]]:
    archive = download_github_archive("HurleyWong/Computer-English-Words")
    libraries = {}
    for filename in archive.namelist():
        parts = Path(filename).parts
        if not filename.endswith(".md") or len(parts) < 3:
            continue
        category = parts[-2]
        if category not in COMPUTER_CATEGORY_NAMES:
            continue
        identifier, display_name = COMPUTER_CATEGORY_NAMES[category]
        terms = []
        text = archive.read(filename).decode("utf-8", errors="replace")
        for line in text.splitlines():
            if not re.match(r"^\s*\*\s+", line):
                continue
            value = re.sub(r"^\s*\*\s+", "", line).strip()
            # Some Chinese labels contain an ASCII acronym, e.g.
            # "反向传播算法（BP算法）backpropagation". Match the final Latin
            # segment so BP remains part of the definition.
            match = re.search(r"[A-Za-z][A-Za-z0-9+.#/&'(), -]*$", value)
            if not match:
                continue
            chinese = value[:match.start()].strip(" /：:-")
            english = match.group(0).strip()
            primary = english.split(",", 1)[0].strip()
            if chinese and primary:
                terms.append({"word": primary, "definition_values": [chinese]})
        libraries[identifier] = {
            "name": display_name, "category": "计算机与信息技术", "terms": terms,
            "source_ids": ["computer-words", "ecdict"], "license": "Apache-2.0 AND MIT",
        }
    return libraries


def github_medical_abbreviations() -> dict[str, dict[str, object]]:
    archive = download_github_archive("imantsm/medical_abbreviations")
    meanings: dict[str, dict[str, object]] = {}
    for filename in archive.namelist():
        if "/CSVs/" not in filename or not filename.lower().endswith(".csv"):
            continue
        text = archive.read(filename).decode("utf-8-sig", errors="replace")
        for row in csv.DictReader(io.StringIO(text)):
            word = normalize_space(row.get("Abbreviation/Shorthand", ""))
            meaning = normalize_space(row.get("Meaning", ""))
            if not word or not meaning:
                continue
            key = normalize_key(word)
            item = meanings.setdefault(key, {"word": word, "definition_values": []})
            if meaning not in item["definition_values"] and len(item["definition_values"]) < 6:
                item["definition_values"].append(meaning)
    return {
        "medical-abbreviations": {
            "name": "医学英语缩略语", "category": "医学与健康", "terms": list(meanings.values()),
            "source_ids": ["medical-abbreviations"], "license": "MIT",
        }
    }


def translation_values(row: dict[str, str]) -> list[str]:
    text = (row.get("translation") or "").replace("\\n", "\n")
    values = []
    for line in re.split(r"[\r\n]+", text):
        value = normalize_space(line).strip(" ;；")
        if value and value not in values:
            values.append(value)
    return values[:5]


def priority(row: dict[str, str]) -> int:
    rank = int(row.get("frq") or 0)
    if rank > 0:
        return max(1, 10_000_000 - rank)
    bnc = int(row.get("bnc") or 0)
    if bnc > 0:
        return max(1, 1_000_000 - bnc)
    return 0


def scan_ecdict(source: Path, candidate_keys: set[str]) -> tuple[dict[str, dict[str, str]], dict[str, list[dict[str, str]]]]:
    lookup = {}
    exams: dict[str, list[dict[str, str]]] = {tag: [] for tag in EXAM_SOURCES}
    with source.open("r", encoding="utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream):
            key = normalize_key(row.get("word", ""))
            tags = set((row.get("tag") or "").lower().split())
            if key in candidate_keys and translation_values(row):
                lookup.setdefault(key, row)
            for tag in tags & EXAM_SOURCES.keys():
                if translation_values(row):
                    exams[tag].append(row)
    return lookup, exams


def empty_word(word: str) -> dict[str, object]:
    return {
        "word": normalize_space(word), "phonetic": "", "definition": [], "examples": [],
        "etymology": "", "synonyms": [], "antonyms": [],
    }


def from_ecdict(row: dict[str, str], word: str | None = None) -> dict[str, object]:
    item = empty_word(word or row.get("word", ""))
    item.update({
        "phonetic": normalize_space(row.get("phonetic", "")),
        "definition": translation_values(row),
    })
    return item


def materialize_library(terms: list[dict[str, object]], lookup: dict[str, dict[str, str]]) -> list[dict[str, object]]:
    output: dict[str, dict[str, object]] = {}
    for source in terms:
        word = normalize_space(str(source.get("word", "")))
        key = normalize_key(word)
        if not key or key in output:
            continue
        row = lookup.get(key)
        item = from_ecdict(row, word) if row else empty_word(word)
        provided = [normalize_space(str(value)) for value in source.get("definition_values", []) if normalize_space(str(value))]
        wikipedia_definition = normalize_space(str(source.get("definition", "")))
        definitions = list(item["definition"])
        for value in provided:
            if value not in definitions:
                definitions.append(value)
        if wikipedia_definition:
            english = f"EN: {wikipedia_definition}"
            if english not in definitions:
                definitions.append(english)
        if not definitions:
            continue
        item["definition"] = definitions[:7]
        if source.get("phonetic"):
            item["phonetic"] = normalize_space(str(source["phonetic"]))
        output[key] = item
    return list(output.values())


def materialize_exam(rows: list[dict[str, str]]) -> list[dict[str, object]]:
    unique = {}
    for row in sorted(rows, key=lambda value: (-priority(value), normalize_key(value.get("word", "")))):
        key = normalize_key(row.get("word", ""))
        if key and key not in unique:
            unique[key] = from_ecdict(row)
    return list(unique.values())


def contains_chinese(value: str) -> bool:
    return bool(re.search(r"[\u3400-\u9fff]", value))


def pack_file_stem(identifier: str, name: str) -> str:
    """File name keeps both the stable English id and the Chinese name."""
    clean = re.sub(r'[\\/:*?"<>|]', "", str(name)).strip()
    clean = re.sub(r"\s+", " ", clean)
    return f"{identifier}-{clean}"


def library_path(output_root: Path, entry: dict[str, object]) -> Path:
    directory = f"{entry['category_slug']}-{entry['category']}"
    return output_root / directory / f"{pack_file_stem(str(entry['id']), str(entry['name']))}.json"


def write_library(output_root: Path, entry: dict[str, object], words: list[dict[str, object]]) -> None:
    path = library_path(output_root, entry)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(words, ensure_ascii=False, indent=2), encoding="utf-8")
    chinese = sum(1 for word in words if any(contains_chinese(item) for item in word["definition"]))
    entry.update({
        "file": path.relative_to(output_root).as_posix(),
        "words": len(words),
        "chinese_definitions": chinese,
        "language": "en-zh" if chinese >= len(words) * 0.8 else "mixed" if chinese else "en",
    })


def generate_readme(catalog: dict[str, object]) -> str:
    lines = [
        "# VocabMaster 开放词库合集", "",
        f"> 生成时间：{catalog['generated_at']}  ",
        f"> 词库数量：{catalog['summary']['vocabularies']}，词条总量（含跨库重复）：{catalog['summary']['words']}", "",
        "本目录中的每个 JSON 文件都是 VocabMaster 可直接导入的词条数组。进入“词库管理 → 导入词库”，选择文件后确认字段映射即可。", "",
        "## 目录", "",
        "| 分类 | 词库 | 词条 | 中文释义 | 许可证 | 文件 |", "| --- | --- | ---: | ---: | --- | --- |",
    ]
    for entry in catalog["vocabularies"]:
        lines.append(f"| {entry['category']} | {entry['name']} | {entry['words']} | {entry['chinese_definitions']} | {entry['license']} | `{entry['file']}` |")
    lines.extend([
        "", "## 字段", "",
        "所有文件统一使用 `word`、`phonetic`、`definition`、`examples`、`etymology`、`synonyms`、`antonyms` 七个字段。`definition` 等多值字段使用 JSON 数组。", "",
        "## 许可与来源", "",
        "每个词库的来源 ID、页面修订号和许可证记录在 `catalog.json`。Wikipedia 派生词库包含 CC BY-SA 内容，应按 CC BY-SA 4.0 规则再分发；其他词库分别遵循 MIT 或 Apache-2.0。", "",
        "## 生成", "",
        "```powershell",
        "python scripts/build_open_vocabularies.py --ecdict <ecdict.csv> --output open-vocabularies",
        "python scripts/expand_open_vocabularies.py --ecdict <stardict.db> --output open-vocabularies",
        "```", "",
        "第一条命令生成考试词库与主流专业词库；第二条命令在此基础上按 ECDICT 领域义项和其余 Wikipedia 术语表补充专业词汇（比对现有词库、多词入库、库内去重）。", "",
    ])
    return "\n".join(lines)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--ecdict", required=True, type=Path)
    parser.add_argument("--output", required=True, type=Path)
    args = parser.parse_args()

    wiki_libraries = fetch_wikipedia_libraries()
    source_libraries = {}
    source_libraries.update(wiki_libraries)
    source_libraries.update(github_technology_words())
    source_libraries.update(github_computer_words())
    source_libraries.update(github_medical_abbreviations())

    candidate_keys = {
        normalize_key(str(term.get("word", "")))
        for library in source_libraries.values() for term in library["terms"]
    }
    lookup, exams = scan_ecdict(args.ecdict, candidate_keys)

    category_slugs = {
        "中国内地考试": "exam-cn", "国际考试": "exam-international", "医学与健康": "medical-health",
        "生命科学": "life-science", "基础科学": "basic-science", "地球科学": "earth-science",
        "农林科学": "agriculture", "计算机与信息技术": "computer-it", "工程技术": "engineering",
        "交通与制造": "transport-manufacturing", "财经与管理": "business-finance",
        "法律与公共事务": "law-public", "人文与社会科学": "humanities-social",
        "传媒与艺术": "media-arts", "安全与公共服务": "safety-public-service",
    }
    entries = []
    output_root = args.output
    output_root.mkdir(parents=True, exist_ok=True)

    for tag, (identifier, name, category) in EXAM_SOURCES.items():
        words = materialize_exam(exams[tag])
        entry = {
            "id": identifier, "name": name, "category": category, "category_slug": category_slugs[category],
            "source_ids": ["ecdict"], "license": "MIT",
        }
        write_library(output_root, entry, words)
        entries.append(entry)

    for identifier, library in source_libraries.items():
        words = materialize_library(library["terms"], lookup)
        if not words:
            continue
        entry = {
            "id": identifier, "name": library["name"], "category": library["category"],
            "category_slug": category_slugs[library["category"]], "source_ids": library["source_ids"],
            "license": library["license"],
        }
        if library.get("source_revisions"):
            entry["source_revisions"] = library["source_revisions"]
        write_library(output_root, entry, words)
        entries.append(entry)

    entries.sort(key=lambda item: (item["category"], item["name"]))
    catalog = {
        "version": "1.0",
        "generated_at": datetime.now(timezone.utc).replace(microsecond=0).isoformat(),
        "schema": ["word", "phonetic", "definition", "examples", "etymology", "synonyms", "antonyms"],
        "summary": {"vocabularies": len(entries), "words": sum(entry["words"] for entry in entries)},
        "sources": SOURCE_METADATA,
        "vocabularies": entries,
    }
    (output_root / "catalog.json").write_text(json.dumps(catalog, ensure_ascii=False, indent=2), encoding="utf-8")
    (output_root / "README.md").write_text(generate_readme(catalog), encoding="utf-8")
    print(f"Generated {len(entries)} vocabularies with {catalog['summary']['words']} total entries")


if __name__ == "__main__":
    main()
