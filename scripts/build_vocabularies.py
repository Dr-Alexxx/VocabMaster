"""Extract compact exam vocabularies from the MIT-licensed ECDICT CSV."""

from __future__ import annotations

import csv
import json
import re
import sys
from pathlib import Path


TARGETS = {
    "cet4": ("cet4.json", 2000),
    "cet6": ("cet6.json", 2500),
    "ielts": ("ielts.json", 3000),
    "toefl": ("toefl.json", 3500),
}


def rank(row: dict[str, str]) -> tuple[int, int, str]:
    frequency = int(row.get("frq") or 0)
    bnc = int(row.get("bnc") or 0)
    return (frequency if frequency > 0 else 10_000_000, bnc if bnc > 0 else 10_000_000, row["word"])


def definitions(row: dict[str, str]) -> list[str]:
    translation = (row.get("translation") or "").replace("\\n", "\n")
    values = []
    for item in re.split(r"[\r\n]+", translation):
        value = re.sub(r"\s+", " ", item).strip(" ;；")
        if value and value not in values:
            values.append(value)
    return values[:5]


def main(source: Path, output: Path) -> None:
    buckets: dict[str, list[dict[str, object]]] = {key: [] for key in TARGETS}
    with source.open("r", encoding="utf-8-sig", newline="") as stream:
        for row in csv.DictReader(stream):
            word = (row.get("word") or "").strip()
            if not re.fullmatch(r"[A-Za-z][A-Za-z'-]*", word):
                continue
            meaning = definitions(row)
            if not meaning:
                continue
            tags = set((row.get("tag") or "").lower().split())
            for tag in TARGETS:
                if tag not in tags:
                    continue
                buckets[tag].append(
                    {
                        "word": word,
                        "phonetic": (row.get("phonetic") or "").strip(),
                        "definition": meaning,
                        "examples": [],
                        "etymology": "",
                        "synonyms": [],
                        "antonyms": [],
                        "frequency": int(row.get("frq") or 0),
                        "_rank": rank(row),
                    }
                )

    output.mkdir(parents=True, exist_ok=True)
    for tag, (filename, limit) in TARGETS.items():
        unique: dict[str, dict[str, object]] = {}
        for item in sorted(buckets[tag], key=lambda value: value["_rank"]):
            unique.setdefault(str(item["word"]).lower(), item)
        selected = list(unique.values())[:limit]
        for item in selected:
            item.pop("_rank", None)
        (output / filename).write_text(json.dumps(selected, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
        print(f"{tag}: {len(selected)} words -> {filename}")


if __name__ == "__main__":
    if len(sys.argv) != 3:
        raise SystemExit("Usage: build_vocabularies.py <ecdict.csv> <output-dir>")
    main(Path(sys.argv[1]), Path(sys.argv[2]))
