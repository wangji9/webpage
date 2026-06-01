from __future__ import annotations

import math
import re
from collections import Counter
from typing import Any

try:
    import jieba
    import jieba.posseg as pseg
except Exception:  # pragma: no cover - optional local dependency fallback
    jieba = None
    pseg = None


STOPWORDS = {
    "中国",
    "相关",
    "资料",
    "进入",
    "用于",
    "观察",
    "译介",
    "出版",
    "接受",
    "网络",
    "条目",
    "材料",
    "the",
    "and",
    "of",
    "in",
    "to",
    "a",
}

POS_LABELS = {
    "n": "名词",
    "nr": "人名",
    "ns": "地名",
    "nt": "机构",
    "v": "动词",
    "vn": "动名词",
    "a": "形容词",
    "eng": "英文词",
}


def _text_from_item(item: dict[str, Any]) -> str:
    parts = [
        item.get("canonicalTitle", ""),
        item.get("translatedTitle", ""),
        item.get("author", ""),
        item.get("translator", ""),
        item.get("summary", ""),
        item.get("resourceType", ""),
        item.get("language", ""),
        item.get("country", ""),
        item.get("city", ""),
        " ".join(item.get("tags") or []),
        " ".join(item.get("evidence") or []),
    ]
    return " ".join(str(part) for part in parts if part)


def _tokens(text: str) -> list[str]:
    if jieba:
        raw = jieba.lcut(text)
    else:
        raw = re.findall(r"[\u4e00-\u9fff]{2,}|[A-Za-z][A-Za-z\-]{2,}", text)
    tokens = []
    for token in raw:
        word = token.strip().lower()
        if len(word) < 2 or word in STOPWORDS:
            continue
        if re.fullmatch(r"\d+", word):
            continue
        if not re.search(r"[\u4e00-\u9fffA-Za-z]", word):
            continue
        tokens.append(word)
    return tokens


def _pos_counts(text: str) -> list[dict[str, Any]]:
    if not pseg:
        return []
    counts: Counter[str] = Counter()
    for word, flag in pseg.cut(text):
        clean = word.strip().lower()
        if len(clean) < 2 or clean in STOPWORDS:
            continue
        key = next((prefix for prefix in POS_LABELS if flag.startswith(prefix)), flag[:1])
        counts[POS_LABELS.get(key, key)] += 1
    return [{"name": name, "value": value} for name, value in counts.most_common(8)]


def analyze_items(items: list[dict[str, Any]]) -> dict[str, Any]:
    text = "\n".join(_text_from_item(item) for item in items)
    tokens = _tokens(text)
    counts = Counter(tokens)
    top_words = [{"word": word, "value": value} for word, value in counts.most_common(32)]
    max_count = max(counts.values(), default=1)
    cloud = []
    for index, (word, value) in enumerate(counts.most_common(42)):
        angle = index * 2.399963
        radius = 12 + 5.8 * math.sqrt(index)
        cloud.append({
            "word": word,
            "value": value,
            "x": round(50 + math.cos(angle) * radius, 2),
            "y": round(50 + math.sin(angle) * radius * 0.58, 2),
            "size": round(14 + value / max_count * 24, 2),
            "rotate": -18 if index % 5 == 0 else 12 if index % 4 == 0 else 0,
        })

    bigrams = Counter(zip(tokens, tokens[1:]))
    cooccurrence = [
        {"source": left, "target": right, "value": value}
        for (left, right), value in bigrams.most_common(12)
        if left != right
    ]
    sentences = [part for part in re.split(r"[。！？.!?；;]\s*", text) if part.strip()]
    sentence_lengths = [len(_tokens(sentence)) for sentence in sentences if sentence.strip()]
    avg_sentence_length = round(sum(sentence_lengths) / max(1, len(sentence_lengths)), 2)
    punctuation_density = round(len(re.findall(r"[，,。.!！？?；;：:]", text)) / max(1, len(text)) * 100, 2)
    latin_terms = len(re.findall(r"[A-Za-z][A-Za-z\-]{2,}", text))
    chinese_chars = len(re.findall(r"[\u4e00-\u9fff]", text))
    lexical_density = round(len(counts) / max(1, len(tokens)) * 100, 2)

    return {
        "totalTokens": len(tokens),
        "uniqueTerms": len(counts),
        "topWords": top_words,
        "wordCloud": cloud,
        "cooccurrence": cooccurrence,
        "pos": _pos_counts(text),
        "syntax": {
            "sentences": len(sentences),
            "avgSentenceLength": avg_sentence_length,
            "punctuationDensity": punctuation_density,
            "latinTerms": latin_terms,
            "chineseChars": chinese_chars,
            "lexicalDensity": lexical_density,
        },
    }
