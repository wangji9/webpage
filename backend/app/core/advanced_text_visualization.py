from __future__ import annotations

import hashlib
import itertools
import json
import math
import os
import re
import threading
import unicodedata
from collections import Counter, OrderedDict, defaultdict
from functools import lru_cache
from pathlib import Path
from typing import Any

from backend.app.core.local_ai_runtime import (
    ANALYSIS_CACHE_ROOT,
    SENTENCE_MODEL_NAME,
    SPACY_MODEL_NAME,
    assert_local_ai_ready,
    local_ai_status,
)


TOKEN_RE = re.compile(r"[\u4e00-\u9fff]{2,8}|[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'\-]{2,}")
YEAR_RE = re.compile(r"(18|19|20)\d{2}")
TEXT_CLEANING_VERSION = "clean-v2-page-marker"
VISUALIZATION_CACHE_VERSION = "advanced-text-visual-v17-fast-global-cooccurrence"
EMBEDDING_CACHE_VERSION = "sentence-bert-embedding-v2"
SPACY_FEATURE_CACHE_VERSION = "spacy-transformer-features-v1"
SPACY_TERMS_CACHE_VERSION = "spacy-transformer-terms-v2"
INTERMEDIATE_CACHE_VERSION = "advanced-text-intermediate-v5-fast-global-cooccurrence"

TOPIC_METHOD_IDS = {
    "topic-clustering-map",
    "topic-tree",
    "topic-river",
    "topic-concept-matrix",
    "topic-cooccurrence-network",
}

VISUAL_METHODS: list[dict[str, Any]] = [
    {"id": "nlp-overview", "group": "基础自然语言处理统计", "name": "语料规模总览", "scope": "single/global"},
    {"id": "nlp-word-frequency", "group": "基础自然语言处理统计", "name": "高频词与关键词统计", "scope": "single/global"},
    {"id": "word-cloud", "group": "基础自然语言处理统计", "name": "关键词词云图", "scope": "single/global"},
    {"id": "nlp-pos-distribution", "group": "基础自然语言处理统计", "name": "词性结构分布", "scope": "single/global"},
    {"id": "nlp-entity-distribution", "group": "基础自然语言处理统计", "name": "命名实体统计", "scope": "single/global"},
    {"id": "nlp-lexical-metrics", "group": "基础自然语言处理统计", "name": "词汇丰富度与句长", "scope": "single/global"},
    {"id": "nlp-script-profile", "group": "基础自然语言处理统计", "name": "语种与字符系统分布", "scope": "single/global"},
    {"id": "semantic-manifold", "group": "概念语义空间与演变可视化", "name": "三维语义流形图", "scope": "single/global"},
    {"id": "concept-sankey", "group": "概念语义空间与演变可视化", "name": "概念演变桑基图", "scope": "single/global"},
    {"id": "semantic-heatmap", "group": "概念语义空间与演变可视化", "name": "语义热图矩阵", "scope": "single/global"},
    {"id": "cooccurrence-network", "group": "人物与实体关系网络可视化", "name": "加权共现网络图谱", "scope": "single/global"},
    {"id": "multilayer-network", "group": "人物与实体关系网络可视化", "name": "多层级影响力网络", "scope": "single/global"},
    {"id": "centrality-radar", "group": "人物与实体关系网络可视化", "name": "实体中心性雷达图", "scope": "single/global"},
    {"id": "topic-clustering-map", "group": "主题结构与分布可视化", "name": "主题聚类图", "scope": "single/global"},
    {"id": "topic-tree", "group": "主题结构与分布可视化", "name": "层次主题树图", "scope": "single/global"},
    {"id": "topic-river", "group": "主题结构与分布可视化", "name": "主题河流图", "scope": "single/global"},
    {"id": "topic-concept-matrix", "group": "主题结构与分布可视化", "name": "主题-概念关联矩阵", "scope": "single/global"},
    {"id": "topic-cooccurrence-network", "group": "主题结构与分布可视化", "name": "主题共现关系图", "scope": "single/global"},
    {"id": "citation-network", "group": "文化传播与影响可视化", "name": "引文网络图谱", "scope": "single/global"},
    {"id": "idea-diffusion", "group": "文化传播与影响可视化", "name": "思想传播扩散图", "scope": "single/global"},
    {"id": "place-entity-map", "group": "文化传播与影响可视化", "name": "地名解析与空间分布", "scope": "single/global"},
    {"id": "transmission-path-map", "group": "文化传播与影响可视化", "name": "传播路径图", "scope": "single/global"},
    {"id": "concept-migration", "group": "文化传播与影响可视化", "name": "跨文本概念迁移图", "scope": "single/global"},
    {"id": "author-concept", "group": "文化传播与影响可视化", "name": "作者-概念二分网络", "scope": "single/global"},
]

CUSTOM_STOPWORDS = {
    "the", "and", "for", "with", "that", "this", "from", "into", "their", "there", "which", "also", "have",
    "has", "had", "were", "was", "are", "not", "but", "you", "his", "her", "she", "him", "they", "them",
    "und", "der", "die", "das", "den", "dem", "des", "ein", "eine", "einer", "einen", "einem", "ist",
    "sind", "war", "waren", "nicht", "mit", "von", "aus", "auf", "für", "fuer", "sich", "sie", "wie",
    "auch", "oder", "aber", "als", "bei", "nach", "noch", "nur", "über", "ueber", "unter", "durch",
    "man", "wir", "ihr", "ihre", "ihren", "ihm", "ihn", "ich", "du", "er", "es", "dass", "zur", "zum",
    "page", "seite", "kapitel", "chapter", "ocr", "txt", "scan", "buch", "märchen", "maerchen",
    "的", "了", "和", "与", "是", "在", "中", "中国", "故事", "文本", "内容", "一个", "一种", "以及", "但是",
    "因为", "所以", "没有", "这个", "那个", "他们", "我们", "你们", "这里", "那里",
}

TOPIC_FUNCTION_WORDS = CUSTOM_STOPWORDS | {
    "a", "an", "or", "of", "to", "in", "on", "at", "by", "as", "be", "been", "being", "it", "its", "than",
    "then", "so", "if", "when", "where", "what", "who", "whom", "whose", "would", "could", "should", "may",
    "might", "will", "shall", "can", "did", "does", "do", "done", "these", "those", "such", "very", "more",
    "most", "much", "many", "some", "any", "all", "each", "every", "other", "another", "one", "two",
    "zu", "im", "am", "an", "auf", "vor", "hin", "her", "vom", "beim", "beide", "beiden", "dies", "diese",
    "dieser", "dieses", "jenes", "jener", "mehr", "sehr", "schon", "ganz", "wohl", "nun", "da", "dann",
    "wenn", "weil", "doch", "denn", "also", "so", "hat", "haben", "hatte", "hatten", "wird", "wurde",
    "wurden", "sein", "seine", "seinen", "seiner", "mein", "meine", "dein", "kein", "keine", "alle",
    "alles", "etwas", "viel", "viele", "jede", "jeder", "jedes", "sagte", "sprach", "fragte", "antwortete",
    "said", "asked", "answered", "came", "went", "made", "make", "see", "look", "come", "go",
    "页", "第", "一", "二", "三", "四", "五", "六", "七", "八", "九", "十", "之", "其", "此", "而", "于", "以",
    "并", "或", "及", "等", "被", "将", "把", "从", "对", "为", "所", "有", "也", "就", "都", "很", "再",
    "page", "seite", "chapter", "kapitel", "ocr", "scan", "txt", "pdf", "vol", "bd", "nr",
}

TOPIC_GENERIC_TERMS = {
    "text", "texte", "文本", "故事", "story", "stories", "märchen", "maerchen", "buch", "book", "books",
    "sammlung", "collection", "chapter", "kapitel", "seite", "page", "inhalt", "content", "document",
}

ACADEMIC_STYLE = {
    "matplotlibStyle": "seaborn-v0_8-paper",
    "font": "Times New Roman / Computer Modern",
    "palette": "viridis / plasma / coolwarm",
    "export": "交互式图表支持 300DPI PNG/SVG/PDF 导出；后端分析结果可被任意模块复用。",
}

PREPROCESSING_SUMMARY = {
    "encoding": "使用 chardet 检测文件编码，进入分析前统一转换为 UTF-8 内部字符串。",
    "cleaning": "去除页码、页眉页脚样式行、空行、OCR 分隔符与特殊控制字符，保留段落结构。",
    "tokenization": "使用 spaCy en_core_web_trf 进行 Transformer 分词、词性标注和名词短语抽取；NLTK 用于辅助分句。",
    "entities": "使用 spaCy NER 抽取 PERSON、GPE、LOC、ORG、WORK_OF_ART 等实体，并保留出现频次。",
    "embeddings": "使用 Sentence-BERT all-MiniLM-L6-v2 生成 384 维句子、片段、文档与概念向量。",
    "chunking": "每篇文档按 500-1000 词分块，保留书名、作者、年份、章节/片段序号等元数据。",
    "topics": "使用 BERTopic 建模主题层次、主题强度、主题-概念矩阵；UMAP 用于语义空间降维。",
    "network": "使用 NetworkX/igraph/PyVis 兼容的数据结构生成共现、中心性、多层级影响力和二分网络。",
}


def _env_int(name: str, default: int) -> int:
    try:
        return max(1, int(os.environ.get(name, str(default)) or default))
    except Exception:
        return default


def _env_float(name: str, default: float) -> float:
    try:
        return float(os.environ.get(name, str(default)) or default)
    except Exception:
        return default


def _env_bool(name: str, default: bool = False) -> bool:
    value = os.environ.get(name)
    if value is None:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _stable_id(value: str, prefix: str = "advanced-doc") -> str:
    digest = hashlib.sha1(value.encode("utf-8", errors="ignore")).hexdigest()[:14]
    return f"{prefix}-{digest}"


def decode_bytes(content: bytes) -> tuple[str, str]:
    encoding = "utf-8"
    try:
        import chardet  # type: ignore

        guess = chardet.detect(content[:80000])
        if guess.get("encoding") and float(guess.get("confidence") or 0) >= 0.52:
            encoding = str(guess["encoding"])
    except Exception:
        pass
    for candidate in [encoding, "utf-8-sig", "utf-8", "gb18030", "cp1252", "latin-1"]:
        try:
            return content.decode(candidate), candidate
        except Exception:
            continue
    return content.decode("utf-8", errors="replace"), "utf-8-replace"


def clean_text(text: str) -> str:
    value = unicodedata.normalize("NFKC", str(text or "")).replace("\ufeff", "")
    value = value.replace("\r\n", "\n").replace("\r", "\n")
    value = re.sub(r"[\x00-\x08\x0b\x0c\x0e-\x1f]", "", value)
    lines: list[str] = []
    for line in value.split("\n"):
        item = re.sub(r"\s+", " ", line).strip()
        if not item:
            if lines and lines[-1] != "":
                lines.append("")
            continue
        if re.fullmatch(r"[=\-_*#\s]*(?:page|seite|p\.?|第)\s*[\d一二三四五六七八九十百千万]+(?:\s*(?:页|page|seite))?\s*[=\-_*#\s]*", item, re.I):
            continue
        if re.fullmatch(r"[\[\(]?\s*(?:page|seite|第)?\s*\d{1,5}\s*(?:页|page|seite)?\s*[\]\)]?", item, re.I):
            continue
        if re.fullmatch(r"[-–—_*•·\s]{3,}", item):
            continue
        if re.search(r"^(?:project gutenberg|digitized by|google books)", item, re.I):
            continue
        lines.append(item)
    return "\n".join(lines).strip()


def split_paragraphs(text: str) -> list[str]:
    parts = [re.sub(r"\n", " ", item).strip() for item in re.split(r"\n{2,}", text or "")]
    if len(parts) <= 1:
        parts = [item.strip() for item in re.split(r"(?<=[。！？!?\.])\s+", text or "")]
    return [item for item in parts if item]


def split_sentences(text: str) -> list[str]:
    normalized = re.sub(r"\s+", " ", text or "").strip()
    if not normalized:
        return []
    sentences = re.split(r"(?<=[。！？!?;；:：\.])\s+|(?<=[。！？!?])|[\r\n]+", normalized)
    return [item.strip() for item in sentences if item.strip()]


def _normalize_token(value: str) -> str:
    return unicodedata.normalize("NFKC", value or "").strip(" \t\r\n'’‘“”\".,;:!?()[]{}<>").lower()


def regex_tokens(text: str) -> list[str]:
    tokens = []
    for raw in TOKEN_RE.findall(text or ""):
        token = _normalize_token(raw)
        if len(token) < 2 or token in CUSTOM_STOPWORDS or token.isdigit():
            continue
        tokens.append(token)
    return tokens


def _is_topic_content_term(value: str) -> bool:
    term = _normalize_token(value)
    if not term:
        return False
    if term in TOPIC_FUNCTION_WORDS or term in TOPIC_GENERIC_TERMS:
        return False
    if term.isdigit() or re.fullmatch(r"\d+[a-z]*", term):
        return False
    if re.fullmatch(r"[ivxlcdm]+", term):
        return False
    if re.fullmatch(r"[a-zäöüß]{1,3}", term):
        return False
    if len(term) < 2:
        return False
    alpha_count = len(re.findall(r"[A-Za-zÀ-ÖØ-öø-ÿ\u4e00-\u9fff]", term))
    if alpha_count < max(2, len(term.replace(" ", "")) // 2):
        return False
    if re.search(r"(.)\1{3,}", term):
        return False
    return True


def _topic_keywords(items: list[dict[str, Any]], limit: int = 120) -> list[dict[str, Any]]:
    filtered = []
    seen: set[str] = set()
    for item in items:
        word = str(item.get("word") or item.get("concept") or "").strip()
        key = _normalize_token(word)
        if key in seen or not _is_topic_content_term(word):
            continue
        seen.add(key)
        filtered.append({**item, "word": key})
        if len(filtered) >= limit:
            break
    return filtered


def _clean_topic_words(words: list[tuple[str, float]] | list[dict[str, Any]], limit: int = 16) -> list[dict[str, Any]]:
    cleaned: list[dict[str, Any]] = []
    seen: set[str] = set()
    for item in words:
        if isinstance(item, dict):
            word = str(item.get("word") or "")
            score = float(item.get("score") or item.get("count") or 0)
        else:
            word = str(item[0] if item else "")
            score = float(item[1] if len(item) > 1 else 0)
        key = _normalize_token(word)
        if key in seen or not _is_topic_content_term(key):
            continue
        seen.add(key)
        cleaned.append({"word": key, "score": score})
        if len(cleaned) >= limit:
            break
    return cleaned


def _topic_label_from_words(words: list[dict[str, Any]], fallback: str = "主题") -> str:
    terms = [item["word"] for item in words if _is_topic_content_term(item.get("word") or "")][:4]
    if terms:
        return " / ".join(terms)
    return fallback


def _topic_for_term(term: str) -> str:
    value = term.lower()
    rules = [
        ("神话传说", ["gott", "geist", "drachen", "drache", "himmel", "mond", "sonne", "myth", "legende", "sagen", "神", "仙", "龙", "天", "月"]),
        ("寓言智慧", ["fabel", "weisheit", "weise", "lehre", "sprichwort", "klug", "wahrheit", "寓言", "智慧", "成语"]),
        ("民间伦理", ["vater", "mutter", "sohn", "tochter", "frau", "mann", "kind", "familie", "bruder", "父", "母", "子", "女"]),
        ("动物母题", ["fuchs", "tiger", "wolf", "pferd", "affe", "vogel", "fisch", "tier", "狐", "虎", "马", "鸟"]),
        ("空间旅行", ["berg", "meer", "fluss", "dorf", "stadt", "palast", "reise", "china", "tibet", "山", "海", "河", "城"]),
        ("权力秩序", ["kaiser", "könig", "koenig", "prinz", "beamter", "herr", "reich", "krieg", "王", "帝", "官"]),
        ("情感婚恋", ["liebe", "herz", "schön", "schoen", "braut", "heirat", "mädchen", "爱", "婚", "美"]),
        ("译介出版", ["china", "chines", "herausgeber", "verlag", "übersetzt", "uebersetzt", "出版", "翻译", "译"]),
    ]
    for label, seeds in rules:
        if any(seed in value for seed in seeds):
            return label
    return "文本概念"


@lru_cache(maxsize=1)
def _spacy_nlp():
    assert_local_ai_ready()
    import spacy  # type: ignore

    nlp = spacy.load(SPACY_MODEL_NAME)
    nlp.max_length = max(nlp.max_length, 2_500_000)
    return nlp


@lru_cache(maxsize=1)
def _sentence_model():
    assert_local_ai_ready()
    from sentence_transformers import SentenceTransformer  # type: ignore

    return SentenceTransformer(SENTENCE_MODEL_NAME)


_MEMORY_VECTOR_CACHE: OrderedDict[str, list[float]] = OrderedDict()
_SPACY_FEATURE_MEMORY_CACHE: OrderedDict[str, dict[str, Any]] = OrderedDict()
_SPACY_TERMS_MEMORY_CACHE: OrderedDict[str, list[dict[str, Any]]] = OrderedDict()
_TOPIC_MODEL_MEMORY_CACHE: OrderedDict[str, dict[str, Any]] = OrderedDict()
_TOPIC_CLUSTER_MEMORY_CACHE: OrderedDict[str, dict[str, Any]] = OrderedDict()
_GRAPH_MEMORY_CACHE: OrderedDict[str, dict[str, Any]] = OrderedDict()
_WARMUP_LOCKS: dict[str, threading.Lock] = {}
_CACHE_LOCK = threading.Lock()


def _bounded_memory_get(cache: OrderedDict[str, Any], key: str) -> Any | None:
    with _CACHE_LOCK:
        if key not in cache:
            return None
        value = cache.pop(key)
        cache[key] = value
        return value


def _bounded_memory_set(cache: OrderedDict[str, Any], key: str, value: Any, maxsize: int) -> None:
    with _CACHE_LOCK:
        if key in cache:
            cache.pop(key, None)
        cache[key] = value
        while len(cache) > maxsize:
            cache.popitem(last=False)


def _json_cache_read(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        return payload if isinstance(payload, dict) else None
    except Exception:
        return None


def _json_cache_write(path: Path, payload: dict[str, Any]) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    except Exception:
        pass


def _text_digest(text: str) -> str:
    normalized = unicodedata.normalize("NFKC", str(text or ""))
    return hashlib.sha1(normalized.encode("utf-8", errors="ignore")).hexdigest()


def _embedding_cache_path(text: str) -> Path:
    digest = hashlib.sha1(json.dumps([EMBEDDING_CACHE_VERSION, SENTENCE_MODEL_NAME, _text_digest(text)], ensure_ascii=False).encode("utf-8")).hexdigest()
    return ANALYSIS_CACHE_ROOT / "embeddings" / SENTENCE_MODEL_NAME.replace("/", "__") / f"{digest[:2]}" / f"{digest}.json"


def _spacy_terms_cache_path(text: str, limit: int) -> Path:
    digest = hashlib.sha1(json.dumps([SPACY_TERMS_CACHE_VERSION, SPACY_MODEL_NAME, limit, _text_digest(text)], ensure_ascii=False).encode("utf-8")).hexdigest()
    return ANALYSIS_CACHE_ROOT / "spacy_terms" / SPACY_MODEL_NAME / f"{digest[:2]}" / f"{digest}.json"


def _spacy_feature_cache_path(text: str) -> Path:
    digest = hashlib.sha1(json.dumps([SPACY_FEATURE_CACHE_VERSION, SPACY_MODEL_NAME, _text_digest(text)], ensure_ascii=False).encode("utf-8")).hexdigest()
    return ANALYSIS_CACHE_ROOT / "spacy_features" / SPACY_MODEL_NAME / f"{digest[:2]}" / f"{digest}.json"


def _json_ready_spacy_features(features: dict[str, Any]) -> dict[str, Any]:
    return {
        "tokens": dict(features.get("tokens") or {}),
        "pos": dict(features.get("pos") or {}),
        "entities": [
            [name, label, int(count)]
            for (name, label), count in (features.get("entities") or Counter()).items()
        ],
        "nounPhrases": dict(features.get("nounPhrases") or {}),
        "examples": dict(features.get("examples") or {}),
    }


def _from_json_spacy_features(payload: dict[str, Any]) -> dict[str, Any] | None:
    try:
        entities: Counter[tuple[str, str]] = Counter()
        for item in payload.get("entities") or []:
            if isinstance(item, list) and len(item) >= 3:
                entities[(str(item[0]), str(item[1] or "ENTITY"))] += int(item[2] or 0)
        return {
            "tokens": Counter(payload.get("tokens") or {}),
            "pos": Counter(payload.get("pos") or {}),
            "entities": entities,
            "nounPhrases": Counter(payload.get("nounPhrases") or {}),
            "examples": dict(payload.get("examples") or {}),
        }
    except Exception:
        return None


def _encode(texts: list[str], batch_size: int = 32) -> list[list[float]]:
    if not texts:
        return []
    keys = [
        hashlib.sha1(json.dumps([EMBEDDING_CACHE_VERSION, SENTENCE_MODEL_NAME, _text_digest(text)], ensure_ascii=False).encode("utf-8")).hexdigest()
        for text in texts
    ]
    vectors: list[list[float] | None] = []
    missing: list[tuple[int, str, str]] = []
    for index, (text, key) in enumerate(zip(texts, keys)):
        cached = _bounded_memory_get(_MEMORY_VECTOR_CACHE, key)
        if cached is None:
            payload = _json_cache_read(_embedding_cache_path(text))
            vector = payload.get("vector") if payload and payload.get("model") == SENTENCE_MODEL_NAME else None
            if isinstance(vector, list) and vector:
                cached = [float(value) for value in vector]
                _bounded_memory_set(_MEMORY_VECTOR_CACHE, key, cached, _env_int("ADVANCED_TEXT_EMBEDDING_MEMORY_CACHE", 12000))
        if cached is None:
            vectors.append(None)
            missing.append((index, text, key))
        else:
            vectors.append(cached)
    if not missing:
        return [vector or [] for vector in vectors]
    model = _sentence_model()
    missing_texts = [text for _index, text, _key in missing]
    vectors = model.encode(
        missing_texts,
        batch_size=batch_size,
        convert_to_numpy=True,
        normalize_embeddings=True,
        show_progress_bar=False,
    )
    encoded = [[float(value) for value in row] for row in vectors.tolist()]
    result: list[list[float] | None] = [
        _bounded_memory_get(_MEMORY_VECTOR_CACHE, key) for key in keys
    ]
    for (index, text, key), vector in zip(missing, encoded):
        result[index] = vector
        _bounded_memory_set(_MEMORY_VECTOR_CACHE, key, vector, _env_int("ADVANCED_TEXT_EMBEDDING_MEMORY_CACHE", 12000))
        _json_cache_write(
            _embedding_cache_path(text),
            {
                "version": EMBEDDING_CACHE_VERSION,
                "model": SENTENCE_MODEL_NAME,
                "textDigest": _text_digest(text),
                "dimension": len(vector),
                "vector": vector,
            },
        )
    return [vector or [] for vector in result]


def _cosine(left: list[float], right: list[float]) -> float:
    if not left or not right:
        return 0.0
    return float(sum(a * b for a, b in zip(left, right)))


def _analysis_slices(text: str) -> list[str]:
    cap = _env_int("ADVANCED_TEXT_SPACY_CHARS_PER_DOC", 180_000)
    if len(text) <= cap:
        source = text
    else:
        third = cap // 3
        mid_start = max(0, len(text) // 2 - third // 2)
        source = "\n\n".join([text[:third], text[mid_start:mid_start + third], text[-third:]])
    paragraphs = split_paragraphs(source)
    slices: list[str] = []
    buf = ""
    max_len = _env_int("ADVANCED_TEXT_SPACY_SLICE_CHARS", 3500)
    for paragraph in paragraphs:
        if len(paragraph) > max_len:
            if buf.strip():
                slices.append(buf.strip())
                buf = ""
            for start in range(0, len(paragraph), max_len):
                slices.append(paragraph[start:start + max_len])
            continue
        candidate = paragraph if not buf else f"{buf}\n\n{paragraph}"
        if len(candidate) <= max_len:
            buf = candidate
        else:
            if buf.strip():
                slices.append(buf.strip())
            buf = paragraph
    if buf.strip():
        slices.append(buf.strip())
    return slices[: _env_int("ADVANCED_TEXT_SPACY_SLICES_PER_DOC", 48)]


def _empty_spacy_features() -> dict[str, Any]:
    return {
        "tokens": Counter(),
        "pos": Counter(),
        "entities": Counter(),
        "nounPhrases": Counter(),
        "examples": {},
    }


def _accumulate_spacy_doc_features(features: dict[str, Any], doc: Any) -> None:
    token_counter: Counter[str] = Counter()
    pos_counter: Counter[str] = Counter()
    entities: Counter[tuple[str, str]] = Counter()
    noun_phrases: Counter[str] = Counter()
    examples: dict[str, str] = {}
    allowed_pos = {"NOUN", "PROPN", "ADJ"}
    for token in doc:
        if token.is_space or token.is_punct or token.is_stop:
            continue
        clean = _normalize_token(token.lemma_ or token.text)
        if len(clean) < 2 or clean in CUSTOM_STOPWORDS:
            continue
        pos_counter[token.pos_] += 1
        if token.pos_ in allowed_pos:
            token_counter[clean] += 1
            examples.setdefault(clean, token.sent.text[:240] if token.sent else "")
    for ent in doc.ents:
        label = ent.label_
        if label not in {"PERSON", "GPE", "LOC", "ORG", "WORK_OF_ART", "NORP", "FAC", "EVENT"}:
            continue
        name = re.sub(r"\s+", " ", ent.text).strip(" ,.;:!?")
        if len(name) >= 2:
            entities[(name, label)] += 1
    try:
        for chunk in doc.noun_chunks:
            phrase = _normalize_token(chunk.text)
            if 3 <= len(phrase) <= 80 and phrase not in CUSTOM_STOPWORDS:
                noun_phrases[phrase] += 1
                examples.setdefault(phrase, chunk.sent.text[:240] if chunk.sent else "")
    except Exception:
        pass
    features["tokens"].update(token_counter)
    features["pos"].update(pos_counter)
    features["entities"].update(entities)
    features["nounPhrases"].update(noun_phrases)
    features["examples"].update({key: value for key, value in examples.items() if key not in features["examples"]})


def _spacy_features_for_texts(texts: list[str]) -> list[dict[str, Any]]:
    if not texts:
        return []
    keys = [
        hashlib.sha1(json.dumps([SPACY_FEATURE_CACHE_VERSION, SPACY_MODEL_NAME, _text_digest(text)], ensure_ascii=False).encode("utf-8")).hexdigest()
        for text in texts
    ]
    rows: list[dict[str, Any] | None] = []
    missing: list[tuple[int, str, str]] = []
    for index, (text, key) in enumerate(zip(texts, keys)):
        cached = _bounded_memory_get(_SPACY_FEATURE_MEMORY_CACHE, key)
        if cached is None:
            payload = _json_cache_read(_spacy_feature_cache_path(text))
            features = _from_json_spacy_features(payload.get("features") or {}) if payload and payload.get("model") == SPACY_MODEL_NAME else None
            if features is not None:
                cached = features
                _bounded_memory_set(_SPACY_FEATURE_MEMORY_CACHE, key, cached, _env_int("ADVANCED_TEXT_SPACY_FEATURE_MEMORY_CACHE", 1000))
        if cached is None:
            rows.append(None)
            missing.append((index, text, key))
        else:
            rows.append(cached)
    if missing:
        nlp = _spacy_nlp()
        pending_features = [_empty_spacy_features() for _item in missing]
        pending_remaining = [0 for _item in missing]
        slice_rows: list[tuple[int, str]] = []
        for missing_index, (_row_index, text, _key) in enumerate(missing):
            parts = _analysis_slices(text)
            pending_remaining[missing_index] = len(parts)
            for part in parts:
                slice_rows.append((missing_index, part))
        batch_size = _env_int("ADVANCED_TEXT_SPACY_BATCH_SIZE", 2)
        n_process = _env_int("ADVANCED_TEXT_SPACY_N_PROCESS", 1)
        pipe_kwargs = {"batch_size": batch_size}
        if n_process > 1:
            pipe_kwargs["n_process"] = n_process
        for (missing_index, _part), doc in zip(slice_rows, nlp.pipe([part for _missing_index, part in slice_rows], **pipe_kwargs)):
            _accumulate_spacy_doc_features(pending_features[missing_index], doc)
            pending_remaining[missing_index] = max(0, pending_remaining[missing_index] - 1)
            if pending_remaining[missing_index] == 0:
                row_index, text, key = missing[missing_index]
                features = pending_features[missing_index]
                rows[row_index] = features
                _bounded_memory_set(_SPACY_FEATURE_MEMORY_CACHE, key, features, _env_int("ADVANCED_TEXT_SPACY_FEATURE_MEMORY_CACHE", 1000))
                _json_cache_write(
                    _spacy_feature_cache_path(text),
                    {
                        "version": SPACY_FEATURE_CACHE_VERSION,
                        "model": SPACY_MODEL_NAME,
                        "textDigest": _text_digest(text),
                        "features": _json_ready_spacy_features(features),
                    },
                )
        for (row_index, text, key), features in zip(missing, pending_features):
            if rows[row_index] is not None:
                continue
            rows[row_index] = features
            _bounded_memory_set(_SPACY_FEATURE_MEMORY_CACHE, key, features, _env_int("ADVANCED_TEXT_SPACY_FEATURE_MEMORY_CACHE", 1000))
            _json_cache_write(
                _spacy_feature_cache_path(text),
                {
                    "version": SPACY_FEATURE_CACHE_VERSION,
                    "model": SPACY_MODEL_NAME,
                    "textDigest": _text_digest(text),
                    "features": _json_ready_spacy_features(features),
                },
            )
    return [row or _empty_spacy_features() for row in rows]


def _spacy_features(text: str) -> dict[str, Any]:
    return _spacy_features_for_texts([text])[0]


def _script_profile(text: str) -> list[dict[str, Any]]:
    specs = [
        ("Han", "汉字", r"[\u4e00-\u9fff]"),
        ("Latin", "拉丁", r"[A-Za-zÀ-ÖØ-öø-ÿ]"),
        ("Cyrillic", "西里尔", r"[\u0400-\u04ff]"),
        ("Greek", "希腊", r"[\u0370-\u03ff]"),
        ("Kana", "假名", r"[\u3040-\u30ff]"),
        ("Hangul", "韩文", r"[\uac00-\ud7af]"),
        ("Arabic", "阿拉伯", r"[\u0600-\u06ff]"),
    ]
    counts = [(key, label, len(re.findall(pattern, text or ""))) for key, label, pattern in specs]
    total = max(1, sum(count for _key, _label, count in counts))
    return [{"key": key, "label": label, "count": count, "ratio": round(count / total, 4)} for key, label, count in counts]


def _chunk_document(doc_id: str, title: str, paragraphs: list[str], max_tokens: int = 850) -> list[dict[str, Any]]:
    chunks: list[dict[str, Any]] = []
    current: list[str] = []
    current_tokens = 0
    for paragraph in paragraphs:
        tokens = regex_tokens(paragraph)
        if current and current_tokens + len(tokens) > max_tokens:
            content = "\n\n".join(current)
            chunks.append({
                "id": f"{doc_id}-chunk-{len(chunks) + 1}",
                "title": f"{title} · 片段 {len(chunks) + 1}",
                "content": content,
                "charCount": len(content),
                "tokenCount": current_tokens,
                "index": len(chunks) + 1,
            })
            current = []
            current_tokens = 0
        current.append(paragraph)
        current_tokens += max(1, len(tokens))
    if current:
        content = "\n\n".join(current)
        chunks.append({
            "id": f"{doc_id}-chunk-{len(chunks) + 1}",
            "title": f"{title} · 片段 {len(chunks) + 1}",
            "content": content,
            "charCount": len(content),
            "tokenCount": current_tokens,
            "index": len(chunks) + 1,
        })
    return chunks


def _infer_year(*values: Any) -> int | None:
    for value in values:
        match = YEAR_RE.search(str(value or ""))
        if match:
            return int(match.group(0))
    return None


def _term_context(sentences: list[str], term: str) -> str:
    lower = term.lower()
    for sentence in sentences:
        if lower in sentence.lower():
            return sentence[:260]
    return ""


def _pack_text_units(parts: list[str], *, max_units: int = 80, target_chars: int = 1800, label_prefix: str = "Unit") -> list[dict[str, Any]]:
    units: list[dict[str, Any]] = []
    buffer: list[str] = []
    buffer_chars = 0
    for part in [str(item or "").strip() for item in parts if str(item or "").strip()]:
        if buffer and buffer_chars + len(part) > target_chars:
            content = "\n\n".join(buffer).strip()
            units.append({
                "id": f"{label_prefix.lower()}-{len(units) + 1}",
                "label": f"{label_prefix} {len(units) + 1}",
                "index": len(units) + 1,
                "content": content,
                "charCount": len(content),
            })
            buffer = []
            buffer_chars = 0
            if len(units) >= max_units:
                break
        buffer.append(part)
        buffer_chars += len(part)
    if buffer and len(units) < max_units:
        content = "\n\n".join(buffer).strip()
        units.append({
            "id": f"{label_prefix.lower()}-{len(units) + 1}",
            "label": f"{label_prefix} {len(units) + 1}",
            "index": len(units) + 1,
            "content": content,
            "charCount": len(content),
        })
    return units


def _analysis_units(
    document: dict[str, Any],
    *,
    max_units: int = 80,
    min_chars: int = 80,
    target_chars: int = 1800,
    label_prefix: str = "Unit",
) -> list[dict[str, Any]]:
    chunk_units = [
        {
            "id": str(chunk.get("id") or f"{document.get('id', 'doc')}-chunk-{chunk.get('index') or index + 1}"),
            "label": f"{label_prefix} {chunk.get('index') or index + 1}",
            "index": int(chunk.get("index") or index + 1),
            "content": str(chunk.get("content") or "").strip(),
            "charCount": len(str(chunk.get("content") or "")),
        }
        for index, chunk in enumerate(document.get("chunks") or [])
        if len(str(chunk.get("content") or "").strip()) >= min_chars
    ][:max_units]
    if len(chunk_units) >= 3:
        return chunk_units

    paragraphs = [item for item in (document.get("paragraphs") or []) if len(str(item or "").strip()) >= max(30, min_chars // 2)]
    paragraph_units = _pack_text_units(paragraphs, max_units=max_units, target_chars=target_chars, label_prefix=label_prefix)
    paragraph_units = [item for item in paragraph_units if int(item.get("charCount") or 0) >= min_chars]
    if len(paragraph_units) >= 3:
        return paragraph_units

    sentences = split_sentences(document.get("fullText") or document.get("preview") or "")
    sentence_units = _pack_text_units(sentences, max_units=max_units, target_chars=max(420, target_chars // 2), label_prefix=label_prefix)
    sentence_units = [item for item in sentence_units if int(item.get("charCount") or 0) >= max(40, min_chars // 2)]
    if len(sentence_units) >= 3:
        return sentence_units
    return paragraph_units or chunk_units or sentence_units


def _spacy_terms_from_doc(doc: Any, limit: int = 48) -> list[dict[str, Any]]:
    counter: Counter[str] = Counter()
    labels: dict[str, str] = {}
    examples: dict[str, str] = {}
    for ent in getattr(doc, "ents", []):
        label = getattr(ent, "label_", "ENTITY")
        if label not in {"PERSON", "GPE", "LOC", "ORG", "WORK_OF_ART", "NORP", "FAC", "EVENT"}:
            continue
        name = _normalize_token(getattr(ent, "text", ""))
        if _is_topic_content_term(name):
            counter[name] += 3
            labels.setdefault(name, label)
            examples.setdefault(name, getattr(getattr(ent, "sent", None), "text", "")[:220])
    try:
        noun_chunks = list(doc.noun_chunks)
    except Exception:
        noun_chunks = []
    for chunk in noun_chunks:
        phrase = _normalize_token(getattr(chunk, "text", ""))
        if _is_topic_content_term(phrase):
            counter[phrase] += 2
            labels.setdefault(phrase, "NOUN_PHRASE")
            examples.setdefault(phrase, getattr(getattr(chunk, "sent", None), "text", "")[:220])
    for token in doc:
        if getattr(token, "is_space", False) or getattr(token, "is_punct", False) or getattr(token, "is_stop", False):
            continue
        if getattr(token, "pos_", "") not in {"NOUN", "PROPN", "ADJ"}:
            continue
        term = _normalize_token(getattr(token, "lemma_", "") or getattr(token, "text", ""))
        if _is_topic_content_term(term):
            counter[term] += 1
            labels.setdefault(term, getattr(token, "pos_", "TERM"))
            examples.setdefault(term, getattr(getattr(token, "sent", None), "text", "")[:220])
    return [
        {
            "word": word,
            "count": int(count),
            "type": labels.get(word, "TERM"),
            "topic": _topic_for_term(word),
            "example": examples.get(word, ""),
        }
        for word, count in counter.most_common(limit)
    ]


def _spacy_terms_for_texts(texts: list[str], limit: int = 48) -> list[list[dict[str, Any]]]:
    if not texts:
        return []
    keys = [
        hashlib.sha1(json.dumps([SPACY_TERMS_CACHE_VERSION, SPACY_MODEL_NAME, limit, _text_digest(text)], ensure_ascii=False).encode("utf-8")).hexdigest()
        for text in texts
    ]
    rows: list[list[dict[str, Any]] | None] = []
    missing: list[tuple[int, str, str]] = []
    for index, (text, key) in enumerate(zip(texts, keys)):
        cached = _bounded_memory_get(_SPACY_TERMS_MEMORY_CACHE, key)
        if cached is None:
            payload = _json_cache_read(_spacy_terms_cache_path(text, limit))
            terms = payload.get("terms") if payload and payload.get("model") == SPACY_MODEL_NAME else None
            if isinstance(terms, list):
                cached = [item for item in terms if isinstance(item, dict)]
                _bounded_memory_set(_SPACY_TERMS_MEMORY_CACHE, key, cached, _env_int("ADVANCED_TEXT_SPACY_TERMS_MEMORY_CACHE", 4000))
        if cached is None:
            rows.append(None)
            missing.append((index, text, key))
        else:
            rows.append(cached)
    if not missing:
        return [row or [] for row in rows]
    nlp = _spacy_nlp()
    batch_size = _env_int("ADVANCED_TEXT_SPACY_BATCH_SIZE", 2)
    n_process = _env_int("ADVANCED_TEXT_SPACY_N_PROCESS", 1)
    pipe_kwargs = {"batch_size": batch_size}
    if n_process > 1:
        pipe_kwargs["n_process"] = n_process
    extracted = [
        _spacy_terms_from_doc(doc, limit=limit)
        for doc in nlp.pipe([text for _index, text, _key in missing], **pipe_kwargs)
    ]
    for (index, text, key), terms in zip(missing, extracted):
        rows[index] = terms
        _bounded_memory_set(_SPACY_TERMS_MEMORY_CACHE, key, terms, _env_int("ADVANCED_TEXT_SPACY_TERMS_MEMORY_CACHE", 4000))
        _json_cache_write(
            _spacy_terms_cache_path(text, limit),
            {
                "version": SPACY_TERMS_CACHE_VERSION,
                "model": SPACY_MODEL_NAME,
                "limit": limit,
                "textDigest": _text_digest(text),
                "terms": terms,
            },
        )
    return [row or [] for row in rows]


def _semantic_coords(vectors: list[list[float]]) -> list[list[float]]:
    if not vectors:
        return []
    if len(vectors) == 1:
        return [[0.0, 0.0, 0.0]]
    if len(vectors) == 2:
        similarity = max(0.0, min(1.0, _cosine(vectors[0], vectors[1])))
        distance = max(0.08, 1.0 - similarity)
        return _normalise_coords([[-distance, 0.0, 0.0], [distance, 0.0, 0.0]])
    return _normalise_coords(_project_vectors(vectors))


def _weighted_average_vector(vectors: list[list[float]], weights: list[float]) -> list[float]:
    if not vectors:
        return []
    dimension = len(vectors[0])
    total = sum(max(0.0001, float(weight or 0)) for weight in weights) or 1.0
    return [
        float(sum((vector[index] if index < len(vector) else 0.0) * max(0.0001, float(weight or 0)) for vector, weight in zip(vectors, weights)) / total)
        for index in range(dimension)
    ]


def preprocess_documents(
    raw_documents: list[dict[str, Any]],
    source_id: str = "advanced",
    *,
    use_spacy: bool = False,
    use_embeddings: bool = False,
) -> list[dict[str, Any]]:
    documents: list[dict[str, Any]] = []
    prepared_rows: list[tuple[int, dict[str, Any], str]] = []
    for index, raw in enumerate(raw_documents):
        text = clean_text(str(raw.get("text") or raw.get("content") or ""))
        if not text:
            continue
        prepared_rows.append((index, raw, text))
    spacy_rows = _spacy_features_for_texts([text for _index, _raw, text in prepared_rows]) if use_spacy else []
    for prepared_index, (index, raw, text) in enumerate(prepared_rows):
        title = str(raw.get("title") or raw.get("name") or f"文档 {index + 1}").strip()
        doc_id = str(raw.get("id") or _stable_id(f"{source_id}:{title}:{index}", "advanced-text"))
        paragraphs = split_paragraphs(text)
        sentences = split_sentences(text)
        chunks = _chunk_document(doc_id, title, paragraphs)
        regex_counter = Counter(regex_tokens(text))
        features = spacy_rows[prepared_index] if use_spacy else _empty_spacy_features()
        token_counter: Counter[str] = Counter()
        token_counter.update(regex_counter)
        token_counter.update(features["tokens"])
        token_counter.update(features["nounPhrases"])
        doc_freq_seed = sorted(set(token_counter))[:1000]
        entity_counter: Counter[tuple[str, str]] = features["entities"]
        year = raw.get("year") or raw.get("publish_year") or _infer_year(title, text[:3000])
        author = str(raw.get("author") or raw.get("translator") or raw.get("editor") or "未识别作者/编译者")
        documents.append({
            "id": doc_id,
            "title": title,
            "filename": raw.get("filename") or raw.get("source") or title,
            "author": author,
            "translator": raw.get("translator") or "",
            "year": int(year) if str(year or "").isdigit() else None,
            "language": raw.get("language") or "Multilingual",
            "encoding": raw.get("encoding") or "utf-8",
            "metadata": raw.get("metadata") or {},
            "charCount": len(text),
            "paragraphCount": len(paragraphs),
            "sentenceCount": len(sentences),
            "tokenCount": sum(token_counter.values()),
            "chunkCount": len(chunks),
            "readingMinutes": max(1, round(len(text) / 1300)),
            "preview": text[:420],
            "fullText": text,
            "paragraphs": paragraphs,
            "sentences": sentences,
            "chunks": chunks,
            "tokenCounter": token_counter,
            "docFreqSeed": doc_freq_seed,
            "spacyPos": features["pos"],
            "termExamples": features["examples"],
            "entities": [
                {"name": name, "type": label, "count": count}
                for (name, label), count in entity_counter.most_common(120)
            ],
            "scriptProfile": _script_profile(text),
            "featureFlags": {
                "spacy": bool(use_spacy),
                "embeddings": False,
            },
        })

    doc_frequency: Counter[str] = Counter()
    for document in documents:
        doc_frequency.update(set(document["tokenCounter"]))
    total_docs = max(1, len(documents))
    if use_embeddings:
        doc_embeddings = _encode([_embedding_text_for_doc(document) for document in documents], batch_size=16)
    else:
        doc_embeddings = [[] for _document in documents]
    for document, embedding in zip(documents, doc_embeddings):
        document["embedding"] = embedding
        document["featureFlags"]["embeddings"] = bool(use_embeddings and embedding)
        keywords = []
        for word, count in document["tokenCounter"].most_common(900):
            idf = math.log((total_docs + 1) / (doc_frequency[word] + 1)) + 1
            score = (math.log1p(count) * idf) + (0.18 if " " in word else 0)
            keywords.append({
                "word": word,
                "count": int(count),
                "score": round(score, 4),
                "topic": _topic_for_term(word),
                "example": document["termExamples"].get(word) or _term_context(document["sentences"], word),
            })
        keywords.sort(key=lambda item: (item["score"], item["count"]), reverse=True)
        document["topKeywords"] = keywords[:160]
        topic_counts: Counter[str] = Counter()
        for item in keywords[:200]:
            topic_counts[item["topic"]] += int(item["count"])
        document["topicCounts"] = dict(topic_counts)
        document["topTopic"] = topic_counts.most_common(1)[0][0] if topic_counts else "文本概念"
    return documents


def _embedding_text_for_doc(document: dict[str, Any]) -> str:
    chunks = document.get("chunks") or []
    if not chunks:
        return document.get("fullText", "")[:8000]
    parts = [chunk.get("content", "")[:1500] for chunk in chunks[:8]]
    if len(chunks) > 16:
        parts.extend(chunk.get("content", "")[:1200] for chunk in chunks[len(chunks) // 2: len(chunks) // 2 + 4])
        parts.extend(chunk.get("content", "")[:1200] for chunk in chunks[-4:])
    return "\n\n".join(parts)[:16000]


def _recompute_document_keywords(documents: list[dict[str, Any]]) -> None:
    doc_frequency: Counter[str] = Counter()
    for document in documents:
        document["tokenCounter"] = Counter(document.get("tokenCounter") or {})
        doc_frequency.update(set(document["tokenCounter"]))
    total_docs = max(1, len(documents))
    for document in documents:
        document["tokenCount"] = sum((document.get("tokenCounter") or Counter()).values())
        keywords = []
        for word, count in (document.get("tokenCounter") or Counter()).most_common(900):
            idf = math.log((total_docs + 1) / (doc_frequency[word] + 1)) + 1
            score = (math.log1p(count) * idf) + (0.18 if " " in word else 0)
            keywords.append({
                "word": word,
                "count": int(count),
                "score": round(score, 4),
                "topic": _topic_for_term(word),
                "example": (document.get("termExamples") or {}).get(word) or _term_context(document.get("sentences") or [], word),
            })
        keywords.sort(key=lambda item: (item["score"], item["count"]), reverse=True)
        document["topKeywords"] = keywords[:160]
        topic_counts: Counter[str] = Counter()
        for item in keywords[:200]:
            topic_counts[item["topic"]] += int(item["count"])
        document["topicCounts"] = dict(topic_counts)
        document["topTopic"] = topic_counts.most_common(1)[0][0] if topic_counts else "文本概念"


def _feature_requirements_for_method(method_id: str) -> tuple[bool, bool]:
    method = method_id or ""
    if not method:
        return False, False
    if method == "all":
        return True, True
    spacy_methods = {
        "nlp-pos-distribution",
        "nlp-entity-distribution",
        "place-entity-map",
    }
    embedding_methods = {
        "semantic-heatmap",
        "citation-network",
        "idea-diffusion",
        "transmission-path-map",
    }
    return method in spacy_methods, method in embedding_methods


def _global_render_doc_limit() -> int:
    return _env_int("ADVANCED_TEXT_GLOBAL_RENDER_DOCS", 10000)


def _documents_feature_signature(documents: list[dict[str, Any]], scope: str = "") -> str:
    rows = []
    for document in documents:
        chunks = document.get("chunks") or []
        chunk_rows = [
            [
                chunk.get("index"),
                len(str(chunk.get("content") or "")),
                _text_digest(str(chunk.get("content") or "")[:1200])[:16],
            ]
            for chunk in chunks[:90]
        ]
        rows.append([
            document.get("id"),
            document.get("title"),
            len(str(document.get("fullText") or "")),
            _text_digest(str(document.get("fullText") or "")[:12000])[:18],
            chunk_rows,
        ])
    return hashlib.sha1(json.dumps([INTERMEDIATE_CACHE_VERSION, scope, rows], ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()[:24]


def _intermediate_cache_path(source_id: str, signature: str, scope: str, document_key: str, kind: str, topic_count: int = 18) -> Path:
    safe = re.sub(r"[^A-Za-z0-9_.-]+", "-", source_id or "advanced")[:80]
    payload = [INTERMEDIATE_CACHE_VERSION, source_id, signature, scope, document_key, kind, _normalize_topic_count(topic_count)]
    digest = hashlib.sha1(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()[:24]
    return ANALYSIS_CACHE_ROOT / "intermediate" / kind / f"{safe}-{digest}.json"


def _ensure_document_features(documents: list[dict[str, Any]], *, use_spacy: bool = False, use_embeddings: bool = False) -> bool:
    changed = False
    if use_spacy:
        pending_spacy = [
            document
            for document in documents
            if not document.setdefault("featureFlags", {}).get("spacy")
        ]
        spacy_rows = _spacy_features_for_texts([document.get("fullText", "") for document in pending_spacy])
        for document, features in zip(pending_spacy, spacy_rows):
            flags = document.setdefault("featureFlags", {})
            token_counter = Counter(document.get("tokenCounter") or {})
            token_counter.update(features["tokens"])
            token_counter.update(features["nounPhrases"])
            document["tokenCounter"] = token_counter
            document["spacyPos"] = features["pos"]
            term_examples = dict(document.get("termExamples") or {})
            term_examples.update(features["examples"])
            document["termExamples"] = term_examples
            document["entities"] = [
                {"name": name, "type": label, "count": count}
                for (name, label), count in features["entities"].most_common(120)
            ]
            flags["spacy"] = True
            changed = True
        if changed:
            _recompute_document_keywords(documents)
    if use_embeddings:
        pending = [document for document in documents if not (document.setdefault("featureFlags", {}).get("embeddings") and document.get("embedding"))]
        if pending:
            vectors = _encode([_embedding_text_for_doc(document) for document in pending], batch_size=16)
            for document, vector in zip(pending, vectors):
                document["embedding"] = vector
                document.setdefault("featureFlags", {})["embeddings"] = bool(vector)
            changed = True
    return changed


def _summary_document(document: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": document["id"],
        "filename": document.get("filename") or document["title"],
        "title": document["title"],
        "author": document.get("author") or "",
        "translator": document.get("translator") or "",
        "year": document.get("year"),
        "language": document.get("language") or "",
        "encoding": document.get("encoding") or "utf-8",
        "charCount": document["charCount"],
        "paragraphCount": document["paragraphCount"],
        "sentenceCount": document["sentenceCount"],
        "tokenCount": document["tokenCount"],
        "chunkCount": document["chunkCount"],
        "readingMinutes": document["readingMinutes"],
        "preview": document["preview"],
        "topTopic": document.get("topTopic") or "",
        "topKeywords": document.get("topKeywords", [])[:14],
        "entities": document.get("entities", [])[:12],
    }


def _selected_detail(document: dict[str, Any] | None) -> dict[str, Any] | None:
    if not document:
        return None
    return {
        **_summary_document(document),
        "fullText": document["fullText"],
        "paragraphs": document["paragraphs"],
        "chunks": document["chunks"],
        "topKeywords": document.get("topKeywords", [])[:110],
        "entities": document.get("entities", [])[:100],
        "topicDistribution": [{"topic": topic, "count": count} for topic, count in (document.get("topicCounts") or {}).items()],
        "scriptProfile": document.get("scriptProfile") or [],
    }


def _keyword_items(documents: list[dict[str, Any]], limit: int = 120) -> list[dict[str, Any]]:
    if len(documents) == 1:
        return documents[0].get("topKeywords", [])[:limit]
    counter: Counter[str] = Counter()
    examples: dict[str, str] = {}
    for document in documents:
        counter.update(document.get("tokenCounter") or {})
        for item in document.get("topKeywords", [])[:80]:
            examples.setdefault(item["word"], item.get("example") or "")
    return [
        {"word": word, "count": int(count), "score": float(count), "topic": _topic_for_term(word), "example": examples.get(word, "")}
        for word, count in counter.most_common(limit)
    ]


def _project_vectors(vectors: list[list[float]]) -> list[list[float]]:
    if not vectors:
        return []
    import numpy as np  # type: ignore

    if len(vectors) < 3:
        raise RuntimeError("UMAP 语义降维需要至少 3 个向量，当前数据不足，不能生成真实语义空间。")
    arr = np.array(vectors, dtype="float32")
    mode = os.environ.get("ADVANCED_TEXT_REDUCTION_MODE", "auto").strip().lower()
    linear_threshold = _env_int("ADVANCED_TEXT_LINEAR_REDUCTION_THRESHOLD", 96)
    if mode in {"linear", "pca", "svd"} or (mode == "auto" and len(vectors) >= linear_threshold):
        try:
            from sklearn.decomposition import IncrementalPCA, TruncatedSVD  # type: ignore

            components = min(3, arr.shape[0], arr.shape[1])
            if components < 3:
                padded = np.zeros((arr.shape[0], 3), dtype="float32")
                padded[:, :components] = arr[:, :components]
                return [[float(value) for value in row] for row in padded.tolist()]
            if arr.shape[0] >= 64:
                model = IncrementalPCA(n_components=3, batch_size=min(512, max(32, arr.shape[0] // 4)))
            else:
                model = TruncatedSVD(n_components=3, random_state=42)
            coords = model.fit_transform(arr)
            return [[float(value) for value in row] for row in coords.tolist()]
        except Exception:
            pass
    from umap import UMAP  # type: ignore

    neighbors = max(2, min(15, len(vectors) - 1))
    coords = UMAP(n_components=3, metric="cosine", n_neighbors=neighbors, min_dist=0.08, random_state=42).fit_transform(arr)
    return [[float(value) for value in row] for row in coords.tolist()]


def _normalise_coords(points: list[list[float]]) -> list[list[float]]:
    if not points:
        return []
    columns = list(zip(*points))
    ranges = []
    for col in columns:
        lo, hi = min(col), max(col)
        ranges.append((lo, hi, hi - lo or 1.0))
    return [
        [round(((value - ranges[index][0]) / ranges[index][2]) * 2 - 1, 4) for index, value in enumerate(row)]
        for row in points
    ]


def _semantic_manifold(keywords: list[dict[str, Any]]) -> list[dict[str, Any]]:
    terms = keywords[:180]
    vectors = _encode([item["word"] for item in terms], batch_size=48)
    coords = _normalise_coords(_project_vectors(vectors))
    return [
        {
            "concept": item["word"],
            "x": coords[index][0],
            "y": coords[index][1],
            "z": coords[index][2],
            "frequency": item["count"],
            "topic": item.get("topic") or _topic_for_term(item["word"]),
            "example": item.get("example") or "",
        }
        for index, item in enumerate(terms)
    ]


def _semantic_heatmap(documents: list[dict[str, Any]]) -> dict[str, Any]:
    selected = documents[:_global_render_doc_limit()]
    labels = [item["title"][:28] for item in selected]
    if len(selected) < 2:
        raise RuntimeError("语义热图需要至少两篇文档进行真实向量比较，当前单文档语料不足。")
    matrix = []
    for left in selected:
        row = []
        for right in selected:
            row.append(round(max(0.0, _cosine(left.get("embedding", []), right.get("embedding", []))), 4))
        matrix.append(row)
    return {"labels": labels, "matrix": matrix}


def _semantic_topic_heatmap(documents: list[dict[str, Any]], keywords: list[dict[str, Any]], scope: str) -> dict[str, Any]:
    if scope == "single" and documents:
        document = documents[0]
        source_keywords = _topic_keywords(document.get("topKeywords") or keywords, 160)
        topic_terms: defaultdict[str, list[dict[str, Any]]] = defaultdict(list)
        for item in source_keywords:
            topic = item.get("topic") or _topic_for_term(item["word"])
            topic_terms[topic].append(item)
        labels = [
            topic
            for topic, items in sorted(
                topic_terms.items(),
                key=lambda pair: sum(int(item.get("count") or 1) for item in pair[1]),
                reverse=True,
            )[:14]
        ]
        top_terms: list[dict[str, Any]] = []
        if len(labels) >= 2:
            words = list(dict.fromkeys(
                str(item.get("word") or "")
                for label in labels
                for item in topic_terms[label][:12]
                if item.get("word")
            ))
            word_vectors = _encode(words, batch_size=48)
            vector_map = {word: word_vectors[index] for index, word in enumerate(words)}
            vectors = []
            for label in labels:
                items = [item for item in topic_terms[label][:12] if item.get("word") in vector_map]
                vectors.append(_weighted_average_vector(
                    [vector_map[item["word"]] for item in items],
                    [float(item.get("count") or 1) for item in items],
                ))
                top_terms.append({"topic": label, "terms": [item["word"] for item in items[:8]]})
        else:
            units = _analysis_units(document, max_units=18, min_chars=60, target_chars=1600, label_prefix="Segment")
            if len(units) < 2:
                raise RuntimeError("单篇语义热图需要至少两个真实文本单元，不能生成兜底热图。")
            labels = [str(unit.get("label") or f"Segment {index + 1}") for index, unit in enumerate(units)]
            vectors = _encode([str(unit.get("content") or "")[:2800] for unit in units], batch_size=16)
        return {
            "labels": labels,
            "matrix": [[round(_cosine(left, right), 4) if left and right else 0 for right in vectors] for left in vectors],
            "mode": "sentence-bert-topic-centroid",
            "topTerms": top_terms,
        }
    return _semantic_heatmap(documents)


def _single_document_stages(document: dict[str, Any], concepts: list[str] | None = None) -> list[dict[str, Any]]:
    stage_names = ["叙事开端", "情节展开", "关键转折", "冲突高潮", "结局余韵"]
    source_units = _analysis_units(document, max_units=60, min_chars=60, target_chars=1800, label_prefix="StageSource")
    units = [str(unit.get("content") or "") for unit in source_units if str(unit.get("content") or "").strip()]
    if not units:
        raise RuntimeError("单篇阶段分析需要真实文本单元，当前文本为空。")
    stage_count = min(len(stage_names), max(1, len(units)))
    groups: list[list[str]] = []
    for index in range(stage_count):
        start = math.floor(index * len(units) / stage_count)
        end = math.floor((index + 1) * len(units) / stage_count)
        groups.append(units[start:max(start + 1, end)])
    stages = []
    selected_concepts = concepts or [item["word"] for item in (document.get("topKeywords") or [])[:8]]
    stage_texts = ["\n\n".join(group).strip() for group in groups]
    stage_vectors = _encode([text[:4200] for text in stage_texts], batch_size=8)
    stage_spacy_terms = _spacy_terms_for_texts([text[:6000] for text in stage_texts], limit=120)
    for index, group in enumerate(groups):
        content = stage_texts[index]
        token_counter = Counter(regex_tokens(content))
        for term in stage_spacy_terms[index]:
            token_counter[term["word"]] += int(term.get("count") or 1)
        top_keywords = [
            {"word": word, "count": int(count), "topic": _topic_for_term(word)}
            for word, count in token_counter.most_common(120)
            if _is_topic_content_term(word)
        ]
        profile = {concept: int(token_counter.get(concept, 0)) for concept in selected_concepts}
        topic_seed = next(
            (item["word"] for item in top_keywords if int(item.get("count") or 0) > 0),
            selected_concepts[0] if selected_concepts else "文本概念",
        )
        stages.append({
            "id": f"{document.get('id', 'document')}-stage-{index + 1}",
            "title": stage_names[index],
            "year": index + 1,
            "topTopic": _topic_for_term(topic_seed),
            "tokenCounter": token_counter,
            "topKeywords": top_keywords,
            "profile": profile,
            "embedding": stage_vectors[index] if index < len(stage_vectors) else [],
            "content": content,
        })
    return stages


def _build_global_cooccurrence(documents: list[dict[str, Any]], keywords: list[dict[str, Any]], limit_nodes: int) -> dict[str, Any]:
    terms = [item["word"] for item in _topic_keywords(keywords, limit_nodes)]
    if len(terms) < 2:
        raise RuntimeError("Global cooccurrence network requires at least two real corpus terms.")
    import numpy as np  # type: ignore

    term_index = {term: index for index, term in enumerate(terms)}
    matrix = np.zeros((len(documents), len(terms)), dtype="float32")
    examples: dict[str, str] = {}
    term_documents: defaultdict[str, list[str]] = defaultdict(list)
    for doc_index, document in enumerate(documents):
        for item in document.get("topKeywords", []):
            term = str(item.get("word") or "")
            if term not in term_index:
                continue
            count = float(item.get("count") or item.get("score") or 1)
            if count <= 0:
                continue
            term_pos = term_index[term]
            matrix[doc_index, term_pos] = max(matrix[doc_index, term_pos], math.log1p(count))
            examples.setdefault(term, item.get("example") or _term_context(document.get("sentences") or [], term))
            if len(term_documents[term]) < 8:
                term_documents[term].append(str(document.get("title") or "")[:28])
    if not float(matrix.sum()):
        raise RuntimeError("Global cooccurrence network has no non-zero term-document matrix.")

    presence = (matrix > 0).astype("float32")
    document_counts = presence.sum(axis=0)
    weights = matrix.sum(axis=0)
    co_docs = presence.T @ presence
    co_weighted = matrix.T @ matrix
    vectors = _encode(terms, batch_size=48)
    vector_arr = np.array(vectors, dtype="float32")
    semantic = vector_arr @ vector_arr.T if len(vector_arr) else np.zeros_like(co_docs)
    min_docs = _env_int("ADVANCED_TEXT_GLOBAL_COOCCURRENCE_MIN_DOCS", 2)
    semantic_threshold = _env_float("ADVANCED_TEXT_GLOBAL_COOCCURRENCE_SEMANTIC_THRESHOLD", 0.54)

    links: list[dict[str, Any]] = []
    for left_index in range(len(terms)):
        for right_index in range(left_index + 1, len(terms)):
            doc_count = int(co_docs[left_index, right_index])
            similarity = float(semantic[left_index, right_index])
            if doc_count < min_docs and similarity < semantic_threshold:
                continue
            weighted = float(co_weighted[left_index, right_index])
            value = round(doc_count + math.sqrt(max(0.0, weighted)) + max(0.0, similarity - semantic_threshold) * 8, 3)
            links.append({
                "source": terms[left_index],
                "target": terms[right_index],
                "value": value,
                "count": doc_count,
                "similarity": round(similarity, 4),
                "relation": "document co-occurrence + Sentence-BERT semantic proximity",
            })
    nodes = [
        {
            "id": term,
            "name": term,
            "label": term,
            "type": _topic_for_term(term),
            "value": round(float(weights[index]), 3),
            "count": round(float(weights[index]), 3),
            "documentCount": int(document_counts[index]),
            "documents": term_documents.get(term, []),
            "example": examples.get(term, ""),
        }
        for term, index in term_index.items()
        if float(weights[index]) > 0
    ]
    return {
        "nodes": nodes,
        "edges": sorted(links, key=lambda item: float(item.get("value") or 0), reverse=True),
        "links": sorted(links, key=lambda item: float(item.get("value") or 0), reverse=True),
        "diagnostics": {
            "mode": "global-vectorized-term-document",
            "termCount": len(nodes),
            "documentCount": len(documents),
            "edgeCount": len(links),
            "embeddingModel": SENTENCE_MODEL_NAME,
            "minDocumentCooccurrence": min_docs,
            "semanticThreshold": semantic_threshold,
        },
    }


def _build_segment_cooccurrence(documents: list[dict[str, Any]], keywords: list[dict[str, Any]], limit_nodes: int) -> dict[str, Any]:
    terms = [item["word"] for item in _topic_keywords(keywords, limit_nodes)]
    weights: Counter[str] = Counter()
    edges: Counter[tuple[str, str]] = Counter()
    evidence: dict[tuple[str, str], str] = {}
    for document in documents:
        units = _analysis_units(document, max_units=96 if len(documents) == 1 else 36, min_chars=70, target_chars=1700, label_prefix="Segment")
        unit_texts = [str(unit.get("content") or "") for unit in units]
        unit_terms = _spacy_terms_for_texts([text[:5000] for text in unit_texts], limit=42)
        for unit, extracted in zip(units, unit_terms):
            token_set = set(regex_tokens(str(unit.get("content") or "")))
            extracted_terms = [item["word"] for item in extracted if _is_topic_content_term(item["word"])]
            lexical_terms = [term for term in terms if term in token_set]
            present = list(dict.fromkeys(extracted_terms + lexical_terms))[:34]
            for term in present:
                weights[term] += 1
            for left, right in itertools.combinations(present[:24], 2):
                if left != right:
                    key = tuple(sorted((left, right)))
                    edges[key] += 1
                    evidence.setdefault(key, str(unit.get("label") or "segment"))
    semantic_candidates = [term for term, _count in weights.most_common(limit_nodes) if _is_topic_content_term(term)]
    if len(semantic_candidates) >= 3:
        vectors = _encode(semantic_candidates, batch_size=48)
        for index, left in enumerate(semantic_candidates):
            scored = []
            for right_index in range(index + 1, len(semantic_candidates)):
                right = semantic_candidates[right_index]
                similarity = max(0.0, _cosine(vectors[index], vectors[right_index]))
                if similarity >= 0.48:
                    scored.append((similarity, right))
            for similarity, right in sorted(scored, key=lambda item: item[0], reverse=True)[:4]:
                key = tuple(sorted((left, right)))
                edges[key] += max(1, round(similarity * 3))
                evidence.setdefault(key, "Sentence-BERT semantic proximity")
    nodes = [
        {"id": term, "name": term, "label": term, "type": _topic_for_term(term), "value": int(weight), "count": int(weight)}
        for term, weight in weights.most_common(limit_nodes)
    ]
    allowed = {node["id"] for node in nodes}
    links = [
        {"source": left, "target": right, "value": int(count), "count": int(count), "evidence": evidence.get((left, right), "")}
        for (left, right), count in edges.most_common(420)
        if left in allowed and right in allowed
    ]
    return {"nodes": nodes, "edges": links, "links": links}


def _cooccurrence(
    documents: list[dict[str, Any]],
    keywords: list[dict[str, Any]],
    limit_nodes: int = 200,
    *,
    scope: str = "",
    source_id: str = "advanced",
    signature: str = "",
    document_key: str = "",
) -> dict[str, Any]:
    resolved_scope = scope or ("single" if len(documents) == 1 else "global")
    resolved_signature = signature or _documents_feature_signature(documents, resolved_scope)
    resolved_doc_key = document_key or ("global" if resolved_scope == "global" else "-".join(str(document.get("id") or "") for document in documents) or "single")
    keyword_digest = hashlib.sha1(
        json.dumps(
            [(item.get("word"), item.get("count"), item.get("score")) for item in _topic_keywords(keywords, limit_nodes)],
            ensure_ascii=False,
            sort_keys=True,
        ).encode("utf-8")
    ).hexdigest()[:20]
    memory_key = hashlib.sha1(
        json.dumps(
            [INTERMEDIATE_CACHE_VERSION, "cooccurrence", source_id, resolved_signature, resolved_scope, resolved_doc_key, limit_nodes, keyword_digest],
            ensure_ascii=False,
            sort_keys=True,
        ).encode("utf-8")
    ).hexdigest()
    cached = _bounded_memory_get(_GRAPH_MEMORY_CACHE, memory_key)
    if isinstance(cached, dict):
        return cached
    cache_path = _intermediate_cache_path(source_id, resolved_signature, resolved_scope, resolved_doc_key, f"cooccurrence-{limit_nodes}", 18)
    payload = _json_cache_read(cache_path)
    if (
        payload
        and payload.get("version") == INTERMEDIATE_CACHE_VERSION
        and payload.get("keywordDigest") == keyword_digest
        and int(payload.get("limitNodes") or 0) == int(limit_nodes)
        and isinstance(payload.get("result"), dict)
    ):
        result = payload["result"]
        _bounded_memory_set(_GRAPH_MEMORY_CACHE, memory_key, result, _env_int("ADVANCED_TEXT_GRAPH_MEMORY_CACHE", 48))
        return result
    result = (
        _build_global_cooccurrence(documents, keywords, limit_nodes)
        if resolved_scope == "global" or len(documents) > 1
        else _build_segment_cooccurrence(documents, keywords, limit_nodes)
    )
    _bounded_memory_set(_GRAPH_MEMORY_CACHE, memory_key, result, _env_int("ADVANCED_TEXT_GRAPH_MEMORY_CACHE", 48))
    _json_cache_write(
        cache_path,
        {
            "version": INTERMEDIATE_CACHE_VERSION,
            "kind": "cooccurrence",
            "sourceId": source_id,
            "signature": resolved_signature,
            "scope": resolved_scope,
            "documentKey": resolved_doc_key,
            "limitNodes": int(limit_nodes),
            "keywordDigest": keyword_digest,
            "result": result,
        },
    )
    return result


def _nlp_statistics(documents: list[dict[str, Any]]) -> dict[str, Any]:
    token_counter: Counter[str] = Counter()
    pos_counter: Counter[str] = Counter()
    entity_counter: Counter[tuple[str, str]] = Counter()
    topic_counter: Counter[str] = Counter()
    script_counter: Counter[str] = Counter()
    doc_rows: list[dict[str, Any]] = []
    sentence_lengths: list[float] = []
    lexical_rows: list[dict[str, Any]] = []
    for document in documents:
        tokens = document.get("tokenCounter") or Counter()
        token_counter.update(tokens)
        pos_counter.update(document.get("spacyPos") or {})
        topic_counter.update(document.get("topicCounts") or {})
        for entity in document.get("entities", []):
            entity_counter[(entity.get("name") or "", entity.get("type") or "ENTITY")] += int(entity.get("count") or 1)
        for item in document.get("scriptProfile") or []:
            script_counter[item.get("label") or item.get("key") or "Unknown"] += int(item.get("count") or 0)
        sentence_count = max(1, int(document.get("sentenceCount") or 0))
        token_total = max(1, int(document.get("tokenCount") or sum(tokens.values()) or 0))
        unique_terms = len(tokens)
        avg_sentence = round(token_total / sentence_count, 2)
        lexical_density = round(unique_terms / token_total, 4)
        sentence_lengths.append(avg_sentence)
        row = {
            "id": document.get("id"),
            "title": document.get("title"),
            "charCount": int(document.get("charCount") or 0),
            "paragraphCount": int(document.get("paragraphCount") or 0),
            "sentenceCount": int(document.get("sentenceCount") or 0),
            "tokenCount": token_total,
            "chunkCount": int(document.get("chunkCount") or 0),
            "uniqueTerms": unique_terms,
            "avgSentenceLength": avg_sentence,
            "lexicalDensity": lexical_density,
            "entityCount": sum(int(entity.get("count") or 1) for entity in document.get("entities", [])),
        }
        doc_rows.append(row)
        lexical_rows.append(row)
        if len(documents) == 1:
            chunk_rows = document.get("chunks") or []
            for chunk in chunk_rows[:96]:
                chunk_tokens = Counter(regex_tokens(chunk.get("content", "")))
                chunk_sentences = split_sentences(chunk.get("content", ""))
                chunk_token_total = max(1, sum(chunk_tokens.values()))
                chunk_unique = len(chunk_tokens)
                chunk_sentence_count = max(1, len(chunk_sentences))
                lexical_rows.append({
                    "id": f"{document.get('id')}-chunk-{chunk.get('index')}",
                    "title": f"Chunk {chunk.get('index')}",
                    "charCount": len(chunk.get("content", "")),
                    "paragraphCount": 1,
                    "sentenceCount": chunk_sentence_count,
                    "tokenCount": chunk_token_total,
                    "chunkCount": 1,
                    "uniqueTerms": chunk_unique,
                    "avgSentenceLength": round(chunk_token_total / chunk_sentence_count, 2),
                    "lexicalDensity": round(chunk_unique / chunk_token_total, 4),
                    "entityCount": sum(
                        int(entity.get("count") or 1)
                        for entity in document.get("entities", [])
                        if str(entity.get("name") or "").lower() in str(chunk.get("content") or "").lower()
                    ),
                    "scope": "chunk",
                })
    total_tokens = max(1, sum(item["tokenCount"] for item in doc_rows))
    return {
        "overview": {
            "documentCount": len(documents),
            "charCount": sum(item["charCount"] for item in doc_rows),
            "paragraphCount": sum(item["paragraphCount"] for item in doc_rows),
            "sentenceCount": sum(item["sentenceCount"] for item in doc_rows),
            "tokenCount": sum(item["tokenCount"] for item in doc_rows),
            "chunkCount": sum(item["chunkCount"] for item in doc_rows),
            "uniqueTerms": len(token_counter),
            "entityCount": sum(count for _key, count in entity_counter.items()),
            "typeTokenRatio": round(len(token_counter) / total_tokens, 4),
            "meanSentenceLength": round(sum(sentence_lengths) / max(1, len(sentence_lengths)), 2),
        },
        "documentMetrics": sorted(doc_rows, key=lambda item: item["tokenCount"], reverse=True),
        "wordFrequency": [{"word": word, "count": int(count), "topic": _topic_for_term(word)} for word, count in token_counter.most_common()],
        "posDistribution": [{"name": name, "count": int(count)} for name, count in pos_counter.most_common()],
        "entityDistribution": [{"name": name, "type": label, "count": int(count)} for (name, label), count in entity_counter.most_common()],
        "topicDistribution": [{"topic": name, "count": int(count)} for name, count in topic_counter.most_common()],
        "scriptProfile": [{"name": name, "count": int(count)} for name, count in script_counter.most_common()],
        "lexicalMetrics": sorted(lexical_rows, key=lambda item: item["lexicalDensity"], reverse=True),
    }


def _nlp_statistics_for_method(documents: list[dict[str, Any]], method_id: str) -> dict[str, Any]:
    if method_id == "all":
        return _nlp_statistics(documents)
    if method_id == "nlp-word-frequency":
        token_counter: Counter[str] = Counter()
        topic_counter: Counter[str] = Counter()
        for document in documents:
            token_counter.update(document.get("tokenCounter") or {})
            topic_counter.update(document.get("topicCounts") or {})
        return {
            "wordFrequency": [{"word": word, "count": int(count), "topic": _topic_for_term(word)} for word, count in token_counter.most_common()],
            "topicDistribution": [{"topic": name, "count": int(count)} for name, count in topic_counter.most_common()],
        }
    if method_id == "nlp-pos-distribution":
        pos_counter: Counter[str] = Counter()
        for document in documents:
            pos_counter.update(document.get("spacyPos") or {})
        return {"posDistribution": [{"name": name, "count": int(count)} for name, count in pos_counter.most_common()]}
    if method_id == "nlp-entity-distribution":
        entity_counter: Counter[tuple[str, str]] = Counter()
        for document in documents:
            for entity in document.get("entities", []):
                entity_counter[(entity.get("name") or "", entity.get("type") or "ENTITY")] += int(entity.get("count") or 1)
        return {
            "entityDistribution": [
                {"name": name, "type": label, "count": int(count)}
                for (name, label), count in entity_counter.most_common()
            ]
        }
    if method_id == "nlp-script-profile":
        script_counter: Counter[str] = Counter()
        for document in documents:
            for item in document.get("scriptProfile") or []:
                script_counter[item.get("label") or item.get("key") or "Unknown"] += int(item.get("count") or 0)
        return {"scriptProfile": [{"name": name, "count": int(count)} for name, count in script_counter.most_common()]}
    if method_id in {"nlp-overview", "nlp-lexical-metrics"}:
        token_counter: Counter[str] = Counter()
        entity_total = 0
        doc_rows: list[dict[str, Any]] = []
        lexical_rows: list[dict[str, Any]] = []
        sentence_lengths: list[float] = []
        for document in documents:
            tokens = document.get("tokenCounter") or Counter()
            token_counter.update(tokens)
            sentence_count = max(1, int(document.get("sentenceCount") or 0))
            token_total = max(1, int(document.get("tokenCount") or sum(tokens.values()) or 0))
            unique_terms = len(tokens)
            avg_sentence = round(token_total / sentence_count, 2)
            lexical_density = round(unique_terms / token_total, 4)
            current_entities = sum(int(entity.get("count") or 1) for entity in document.get("entities", []))
            entity_total += current_entities
            sentence_lengths.append(avg_sentence)
            row = {
                "id": document.get("id"),
                "title": document.get("title"),
                "charCount": int(document.get("charCount") or 0),
                "paragraphCount": int(document.get("paragraphCount") or 0),
                "sentenceCount": int(document.get("sentenceCount") or 0),
                "tokenCount": token_total,
                "chunkCount": int(document.get("chunkCount") or 0),
                "uniqueTerms": unique_terms,
                "avgSentenceLength": avg_sentence,
                "lexicalDensity": lexical_density,
                "entityCount": current_entities,
            }
            doc_rows.append(row)
            lexical_rows.append(row)
        total_tokens = max(1, sum(item["tokenCount"] for item in doc_rows))
        overview = {
            "documentCount": len(documents),
            "charCount": sum(item["charCount"] for item in doc_rows),
            "paragraphCount": sum(item["paragraphCount"] for item in doc_rows),
            "sentenceCount": sum(item["sentenceCount"] for item in doc_rows),
            "tokenCount": sum(item["tokenCount"] for item in doc_rows),
            "chunkCount": sum(item["chunkCount"] for item in doc_rows),
            "uniqueTerms": len(token_counter),
            "entityCount": entity_total,
            "typeTokenRatio": round(len(token_counter) / total_tokens, 4),
            "meanSentenceLength": round(sum(sentence_lengths) / max(1, len(sentence_lengths)), 2),
        }
        if method_id == "nlp-overview":
            return {"overview": overview}
        return {
            "documentMetrics": sorted(doc_rows, key=lambda item: item["tokenCount"], reverse=True),
            "lexicalMetrics": sorted(lexical_rows, key=lambda item: item["lexicalDensity"], reverse=True),
        }
    return _nlp_statistics(documents)


def _centrality(graph: dict[str, Any]) -> list[dict[str, Any]]:
    import networkx as nx  # type: ignore

    g = nx.Graph()
    for node in graph.get("nodes", []):
        g.add_node(node["id"])
    for edge in graph.get("edges", []):
        g.add_edge(edge["source"], edge["target"], weight=float(edge.get("value") or 1))
    if not g.nodes:
        return []
    degree = nx.degree_centrality(g)
    try:
        betweenness = nx.betweenness_centrality(g, weight="weight", k=min(80, max(1, len(g.nodes))), seed=42)
    except TypeError:
        betweenness = nx.betweenness_centrality(g, weight="weight")
    closeness = nx.closeness_centrality(g)
    try:
        eigenvector = nx.eigenvector_centrality_numpy(g, weight="weight")
    except Exception:
        eigenvector = {node: 0.0 for node in g.nodes}
    weighted = {node: sum(data.get("weight", 1) for _n, _m, data in g.edges(node, data=True)) for node in g.nodes}
    max_weight = max(weighted.values() or [1]) or 1
    ranked = sorted(g.nodes, key=lambda node: (weighted.get(node, 0), degree.get(node, 0)), reverse=True)[:10]
    return [
        {
            "name": node,
            "degree": round(float(degree.get(node, 0)), 3),
            "weighted": round(float(weighted.get(node, 0) / max_weight), 3),
            "betweenness": round(float(betweenness.get(node, 0)), 3),
            "closeness": round(float(closeness.get(node, 0)), 3),
            "eigenvector": round(float(eigenvector.get(node, 0)), 3),
        }
        for node in ranked
    ]


def _sankey(documents: list[dict[str, Any]], scope: str) -> dict[str, Any]:
    stages: list[tuple[str, list[dict[str, Any]]]] = []
    if scope == "single" and documents:
        document = documents[0]
        if len(document.get("chunks", [])) < 3:
            raise RuntimeError("传播桑基图需要足够多的真实章节/分块，当前单篇文档分块不足。")
        for chunk in document.get("chunks", [])[:8]:
            counter = Counter(regex_tokens(chunk.get("content", "")))
            items = [{"word": word, "count": int(count), "topic": _topic_for_term(word)} for word, count in counter.most_common(12)]
            stages.append((f"片段 {chunk['index']}", items))
    else:
        for document in sorted(documents, key=lambda item: (item.get("year") or 9999, item["title"])):
            stages.append((document["title"][:18], document.get("topKeywords", [])[:10]))

    all_terms = sorted({item["word"] for _stage, items in stages for item in items})
    vectors = _encode(all_terms, batch_size=48)
    vector_map = {term: vectors[index] for index, term in enumerate(all_terms)}
    nodes = []
    node_index: dict[tuple[int, str], int] = {}
    for stage_index, (stage, terms) in enumerate(stages):
        for item in terms:
            key = (stage_index, item["word"])
            node_index[key] = len(nodes)
            nodes.append({"name": f"{stage}→{item['word']}", "stage": stage, "term": item["word"], "value": item["count"]})
    links = []
    for stage_index in range(len(stages) - 1):
        for left in stages[stage_index][1][:8]:
            candidates = []
            for right in stages[stage_index + 1][1][:8]:
                similarity = max(0.0, _cosine(vector_map.get(left["word"], []), vector_map.get(right["word"], [])))
                if left.get("topic") == right.get("topic"):
                    similarity = min(1.0, similarity + 0.12)
                if similarity >= 0.34:
                    candidates.append((right, similarity))
            for right, similarity in sorted(candidates, key=lambda item: item[1], reverse=True)[:2]:
                links.append({
                    "source": node_index[(stage_index, left["word"])],
                    "target": node_index[(stage_index + 1, right["word"])],
                    "value": round(similarity * max(1, min(left["count"], right["count"])), 2),
                })
    return {"nodes": nodes, "links": links}


def _normalize_topic_count(value: int | None, default: int = 18) -> int:
    try:
        return min(60, max(1, int(value or default)))
    except Exception:
        return default


def _fast_global_topic_model(
    texts: list[str],
    metas: list[dict[str, Any]],
    requested_topics: int,
) -> dict[str, Any]:
    if len(texts) < 3:
        raise RuntimeError("Fast topic model requires at least 3 real text units.")
    import numpy as np  # type: ignore
    from sklearn.cluster import MiniBatchKMeans  # type: ignore
    from sklearn.feature_extraction.text import CountVectorizer, TfidfTransformer  # type: ignore

    embeddings = np.array(_encode(texts, batch_size=_env_int("ADVANCED_TEXT_EMBED_BATCH_SIZE", 32)), dtype="float32")
    cluster_count = min(max(2, requested_topics), max(2, len(texts) - 1))
    model = MiniBatchKMeans(
        n_clusters=cluster_count,
        batch_size=min(1024, max(64, len(texts))),
        n_init=_env_int("ADVANCED_TEXT_MINIBATCH_KMEANS_N_INIT", 3),
        random_state=42,
        max_iter=_env_int("ADVANCED_TEXT_MINIBATCH_KMEANS_MAX_ITER", 80),
    )
    labels = model.fit_predict(embeddings)
    vectorizer = CountVectorizer(
        tokenizer=regex_tokens,
        token_pattern=None,
        lowercase=False,
        min_df=1,
        max_features=_env_int("ADVANCED_TEXT_TOPIC_VECTOR_MAX_FEATURES", 8000),
    )
    counts = vectorizer.fit_transform(texts)
    tfidf = TfidfTransformer(norm=None, use_idf=True, smooth_idf=True).fit_transform(counts)
    feature_names = vectorizer.get_feature_names_out()
    topics = []
    for topic_id in range(cluster_count):
        row_indices = np.where(labels == topic_id)[0]
        if not len(row_indices):
            continue
        centroid = np.asarray(tfidf[row_indices].mean(axis=0)).ravel()
        ranked_indices = centroid.argsort()[::-1]
        words = []
        for word_index in ranked_indices:
            word = str(feature_names[word_index])
            if not _is_topic_content_term(word):
                continue
            score = float(centroid[word_index] or 0)
            if score <= 0:
                continue
            words.append({"word": word, "score": round(score, 6)})
            if len(words) >= 16:
                break
        if not words:
            continue
        topics.append({
            "id": int(topic_id),
            "label": _topic_label_from_words(words, f"Topic {topic_id}"),
            "words": words,
            "count": int(len(row_indices)),
        })
    valid_topic_ids = {int(topic["id"]) for topic in topics}
    assignments = [
        {
            **metas[index],
            "topic": int(label),
            "topicLabel": next((topic["label"] for topic in topics if int(topic["id"]) == int(label)), "Topic"),
        }
        for index, label in enumerate(labels)
        if int(label) in valid_topic_ids
    ]
    return {
        "topics": topics,
        "assignments": assignments,
        "status": "sentence-bert-minibatch-kmeans",
        "diagnostics": {
            "unitCount": len(texts),
            "clusterCount": len(topics),
            "embeddingModel": SENTENCE_MODEL_NAME,
            "clusterer": "MiniBatchKMeans",
            "termModel": "CountVectorizer+TFIDF",
        },
    }


def _topic_model(
    documents: list[dict[str, Any]],
    scope: str,
    topic_count: int = 18,
    *,
    source_id: str = "advanced",
    signature: str = "",
    document_key: str = "",
) -> dict[str, Any]:
    requested_topics = _normalize_topic_count(topic_count)
    resolved_signature = signature or _documents_feature_signature(documents, scope)
    resolved_doc_key = document_key or ("global" if scope == "global" else "-".join(str(document.get("id") or "") for document in documents) or "single")
    memory_key = hashlib.sha1(json.dumps([INTERMEDIATE_CACHE_VERSION, "topic-model", source_id, resolved_signature, scope, resolved_doc_key, requested_topics], ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()
    cached = _bounded_memory_get(_TOPIC_MODEL_MEMORY_CACHE, memory_key)
    if isinstance(cached, dict):
        return cached
    cache_path = _intermediate_cache_path(source_id, resolved_signature, scope, resolved_doc_key, "topic-model", requested_topics)
    payload = _json_cache_read(cache_path)
    if payload and payload.get("version") == INTERMEDIATE_CACHE_VERSION and isinstance(payload.get("result"), dict):
        result = payload["result"]
        _bounded_memory_set(_TOPIC_MODEL_MEMORY_CACHE, memory_key, result, _env_int("ADVANCED_TEXT_TOPIC_MODEL_MEMORY_CACHE", 32))
        return result
    chunk_limit = _env_int("ADVANCED_TEXT_BERTOPIC_CHUNKS", 280)
    texts: list[str] = []
    metas: list[dict[str, Any]] = []
    chunk_rows: list[tuple[dict[str, Any], dict[str, Any]]] = []
    if scope == "single":
        for document in documents:
            chunk_rows.extend((document, chunk) for chunk in document.get("chunks", [])[:80])
    elif os.environ.get("ADVANCED_TEXT_GLOBAL_TOPIC_UNITS", "documents").strip().lower() != "chunks":
        for document in documents:
            content = _embedding_text_for_doc(document).strip()
            if len(content) >= 40:
                texts.append(content[:5000])
                metas.append({"document": document["title"], "stage": "文档", "docId": document["id"]})
    else:
        max_per_doc = max(1, min(8, math.ceil(chunk_limit / max(1, len(documents)))))
        for round_index in range(max_per_doc):
            for document in documents:
                chunks = document.get("chunks", [])
                if round_index < len(chunks):
                    chunk_rows.append((document, chunks[round_index]))
                if len(chunk_rows) >= chunk_limit:
                    break
            if len(chunk_rows) >= chunk_limit:
                break
    if chunk_rows:
        for document, chunk in chunk_rows:
            content = chunk.get("content", "").strip()
            if len(content) >= 40:
                texts.append(content[:5000])
                metas.append({"document": document["title"], "stage": f"片段 {chunk['index']}", "docId": document["id"]})
            if len(texts) >= chunk_limit:
                break
    if len(texts) < 3:
        raise RuntimeError("BERTopic 主题建模需要至少 3 个有效文本分块，当前单篇文档分块不足，不能生成真实主题图。")
    if scope == "global" and not _env_bool("ADVANCED_TEXT_GLOBAL_FORCE_BERTOPIC", False):
        result = _fast_global_topic_model(texts, metas, requested_topics)
        _bounded_memory_set(_TOPIC_MODEL_MEMORY_CACHE, memory_key, result, _env_int("ADVANCED_TEXT_TOPIC_MODEL_MEMORY_CACHE", 32))
        _json_cache_write(
            cache_path,
            {
                "version": INTERMEDIATE_CACHE_VERSION,
                "kind": "topic-model",
                "sourceId": source_id,
                "signature": resolved_signature,
                "scope": scope,
                "documentKey": resolved_doc_key,
                "topicCount": requested_topics,
                "result": result,
            },
        )
        return result
    try:
        from bertopic import BERTopic  # type: ignore
        import numpy as np  # type: ignore
        from umap import UMAP  # type: ignore
        from sklearn.cluster import KMeans  # type: ignore

        min_topic_size = max(2, min(12, len(texts) // max(2, requested_topics) or 2))
        n_neighbors = max(2, min(15, len(texts) - 1))
        n_components = max(2, min(5, len(texts) - 2))
        umap_model = UMAP(n_neighbors=n_neighbors, n_components=n_components, min_dist=0.0, metric="cosine", random_state=42)
        embeddings = np.array(_encode(texts, batch_size=16), dtype="float32")
        cluster_model = None
        nr_topics: int | None = min(requested_topics, max(1, len(texts) - 1))
        if scope == "single":
            target_clusters = min(
                requested_topics,
                max(2, min(len(texts) - 1, math.ceil(math.sqrt(len(texts)) * 2))),
            )
            cluster_model = KMeans(n_clusters=target_clusters, n_init=20, random_state=42)
            nr_topics = None
        model_kwargs: dict[str, Any] = {
            "embedding_model": _sentence_model(),
            "umap_model": umap_model,
            "min_topic_size": min_topic_size,
            "calculate_probabilities": False,
            "verbose": False,
        }
        if cluster_model is not None:
            model_kwargs["hdbscan_model"] = cluster_model
        else:
            model_kwargs["nr_topics"] = nr_topics
        model = BERTopic(**model_kwargs)
        topics, _probs = model.fit_transform(texts, embeddings)
        topic_info = model.get_topic_info().to_dict("records")
        labels = {}
        for row in topic_info:
            topic_id = int(row.get("Topic"))
            if topic_id == -1:
                continue
            words = _clean_topic_words(model.get_topic(topic_id) or [], 16)
            if not words:
                continue
            labels[topic_id] = {
                "id": topic_id,
                "label": _topic_label_from_words(words, str(row.get("Name") or f"主题 {topic_id}")),
                "words": words,
                "count": int(row.get("Count") or 0),
            }
        assignments = [
            {**metas[index], "topic": int(topic), "topicLabel": labels.get(int(topic), {}).get("label", "主题待识别")}
            for index, topic in enumerate(topics)
            if int(topic) in labels
        ]
        result = {"topics": list(labels.values()), "assignments": assignments, "status": "bertopic"}
        _bounded_memory_set(_TOPIC_MODEL_MEMORY_CACHE, memory_key, result, _env_int("ADVANCED_TEXT_TOPIC_MODEL_MEMORY_CACHE", 32))
        _json_cache_write(
            cache_path,
            {
                "version": INTERMEDIATE_CACHE_VERSION,
                "kind": "topic-model",
                "sourceId": source_id,
                "signature": resolved_signature,
                "scope": scope,
                "documentKey": resolved_doc_key,
                "topicCount": requested_topics,
                "result": result,
            },
        )
        return result
    except Exception as error:
        raise RuntimeError(f"BERTopic/UMAP 真实主题建模失败，已停止生成兜底主题图：{type(error).__name__}: {error}") from error


def _keyword_cluster_projection(
    documents: list[dict[str, Any]],
    keywords: list[dict[str, Any]],
    scope: str,
    topic_count: int,
) -> tuple[list[dict[str, Any]], Counter[str], defaultdict[str, Counter[str]], Counter[tuple[str, str]]]:
    raise RuntimeError("主题聚类图只允许 BERTopic + Sentence-BERT + UMAP 的真实结果，关键词桶投影已禁用。")


def _topic_tree(topic_model: dict[str, Any], keywords: list[dict[str, Any]], corpus_title: str) -> dict[str, Any]:
    keywords = _topic_keywords(keywords, 180)
    concept_scores: defaultdict[str, float] = defaultdict(float)
    links: list[dict[str, Any]] = []
    if topic_model.get("topics"):
        children = []
        topic_ranks = []
        for topic in topic_model["topics"][:24]:
            words = _clean_topic_words(topic.get("words", []), 18)
            if not words:
                continue
            value = int(topic.get("count") or max(1, round(sum(float(item.get("score") or 0) for item in words) * 1000)))
            topic_label = _topic_label_from_words(words, topic["label"])
            children.append({
                "name": topic_label,
                "value": value,
                "children": [{"name": item["word"], "value": round(float(item["score"]), 4)} for item in words],
            })
            topic_ranks.append({
                "topic": topic_label,
                "count": value,
                "concepts": ", ".join(item["word"] for item in words[:5]),
            })
            for item in words:
                score = float(item.get("score") or 0)
                concept_scores[item["word"]] += score
                links.append({"source": topic_label, "target": item["word"], "value": round(score, 4)})
        return {
            "name": corpus_title,
            "children": children,
            "topicRanks": topic_ranks,
            "conceptRanks": [{"concept": name, "value": round(value, 4)} for name, value in sorted(concept_scores.items(), key=lambda item: item[1], reverse=True)[:28]],
            "links": links[:420],
            "depthStats": [
                {"name": "主题层", "value": len(children)},
                {"name": "概念层", "value": len(concept_scores)},
                {"name": "主题-概念边", "value": len(links)},
            ],
        }
    raise RuntimeError("主题树图要求 BERTopic 主题模型真实返回主题层次，当前未生成主题结果，已停止兜底。")


def _topic_river(documents: list[dict[str, Any]], topic_model: dict[str, Any], scope: str) -> dict[str, Any]:
    if topic_model.get("topics") and topic_model.get("assignments"):
        topics = [_topic_label_from_words(_clean_topic_words(topic.get("words", []), 8), topic["label"]) for topic in topic_model["topics"][:8]]
        topic_ids = [topic["id"] for topic in topic_model["topics"][:8]]
        label_by_id = {topic["id"]: _topic_label_from_words(_clean_topic_words(topic.get("words", []), 8), topic["label"]) for topic in topic_model["topics"][:8]}
        rows: dict[str, Counter[str]] = defaultdict(Counter)
        for item in topic_model["assignments"]:
            label = item["stage"] if scope == "single" else item["document"][:18]
            if item.get("topic") in topic_ids:
                rows[label][label_by_id.get(item.get("topic"), item.get("topicLabel"))] += 1
        return {"topics": topics, "series": [{"stage": stage, **dict(counter)} for stage, counter in rows.items()]}
    raise RuntimeError("主题河流图要求 BERTopic 的真实主题分配结果，关键词计数河流已禁用。")


def _topic_concept_matrix(topic_model: dict[str, Any], keywords: list[dict[str, Any]]) -> dict[str, Any]:
    keywords = _topic_keywords(keywords, 160)

    def build_stats(topics: list[str], concepts: list[str], matrix: list[list[float]]) -> dict[str, Any]:
        row_totals = [round(sum(float(value or 0) for value in row), 4) for row in matrix]
        col_totals = [
            round(sum(float(matrix[row_index][col_index] or 0) for row_index in range(len(matrix))), 4)
            for col_index in range(len(concepts))
        ] if concepts else []
        cells = []
        for row_index, row in enumerate(matrix):
            for col_index, value in enumerate(row):
                if float(value or 0) > 0:
                    cells.append({
                        "topic": topics[row_index],
                        "concept": concepts[col_index],
                        "value": round(float(value), 4),
                    })
        return {
            "topics": topics,
            "concepts": concepts,
            "matrix": matrix,
            "rowTotals": row_totals,
            "colTotals": col_totals,
            "topCells": sorted(cells, key=lambda item: item["value"], reverse=True)[:36],
        }

    if topic_model.get("topics"):
        model_topics = []
        for topic in topic_model["topics"][:16]:
            words = _clean_topic_words(topic.get("words", []), 16)
            if words:
                model_topics.append({**topic, "label": _topic_label_from_words(words, topic["label"]), "words": words})
            if len(model_topics) >= 12:
                break
        topics = [topic["label"] for topic in model_topics]
        concepts = sorted({word["word"] for topic in model_topics for word in topic.get("words", [])[:12]})[:46]
        matrix = []
        for topic in model_topics:
            weights = {word["word"]: word.get("score", 0) for word in topic.get("words", [])}
            matrix.append([round(float(weights.get(concept, 0)), 4) for concept in concepts])
        return build_stats(topics, concepts, matrix)
    raise RuntimeError("主题-概念矩阵要求 BERTopic 的真实主题词权重，关键词规则矩阵已禁用。")


def _multilayer(documents: list[dict[str, Any]], scope: str) -> dict[str, Any]:
    nodes: list[dict[str, Any]] = []
    edges: list[dict[str, Any]] = []
    seen: set[str] = set()
    doc_limit = 1 if scope == "single" else _global_render_doc_limit()
    for document in documents[:doc_limit]:
        author = document.get("author") or "未识别作者/编译者"
        author_id = f"author:{author}"
        if author_id not in seen:
            seen.add(author_id)
            nodes.append({"id": author_id, "name": author, "type": "作者层", "layer": 0, "value": 4})
        book_id = f"book:{document['id']}"
        nodes.append({"id": book_id, "name": document["title"][:36], "type": "书籍层", "layer": 1, "value": document.get("chunkCount", 1)})
        edges.append({"source": author_id, "target": book_id, "value": 1, "relation": "写作/编译"})
        for item in document.get("topKeywords", [])[:9]:
            concept_id = f"concept:{item['word']}"
            if concept_id not in seen:
                seen.add(concept_id)
                nodes.append({"id": concept_id, "name": item["word"], "type": "概念层", "layer": 2, "value": item["count"]})
            edges.append({"source": book_id, "target": concept_id, "value": item["count"], "relation": "包含概念"})
    return {"nodes": nodes[:1200], "edges": edges[:1800], "links": edges[:1800]}


def _document_topic_profile(document: dict[str, Any], limit: int = 10) -> dict[str, int]:
    profile: Counter[str] = Counter(document.get("topicCounts") or {})
    if not profile:
        for item in document.get("topKeywords", [])[:80]:
            profile[item.get("topic") or _topic_for_term(item["word"])] += int(item.get("count") or 1)
    return {topic: int(count) for topic, count in profile.most_common(limit)}


def _shared_keyword_score(left: dict[str, Any], right: dict[str, Any], limit: int = 42) -> tuple[float, list[str]]:
    left_terms = {item["word"]: int(item.get("count") or 1) for item in left.get("topKeywords", [])[:limit]}
    right_terms = {item["word"]: int(item.get("count") or 1) for item in right.get("topKeywords", [])[:limit]}
    shared = sorted(set(left_terms) & set(right_terms), key=lambda term: left_terms[term] + right_terms[term], reverse=True)
    if not shared:
        return 0.0, []
    score = sum(math.sqrt(left_terms[term] * right_terms[term]) for term in shared[:12])
    norm = math.sqrt(max(1, sum(left_terms.values())) * max(1, sum(right_terms.values())))
    return round(min(1.0, score / norm * 4.2), 4), shared[:8]


def _citation_network(documents: list[dict[str, Any]]) -> dict[str, Any]:
    selected = documents[:_global_render_doc_limit()]
    if len(selected) == 1:
        document = selected[0]
        units = _analysis_units(document, max_units=42, min_chars=70, target_chars=1900, label_prefix="片段")
        if len(units) < 3:
            raise RuntimeError("单篇引文网络需要至少 3 个真实片段来计算 Sentence-BERT 语义互证路径。")
        texts = [str(unit.get("content") or "")[:3600] for unit in units]
        vectors = _encode(texts, batch_size=16)
        coords = _semantic_coords(vectors)
        term_rows = _spacy_terms_for_texts([text[:5000] for text in texts], limit=28)
        nodes = []
        term_sets: list[set[str]] = []
        for index, unit in enumerate(units):
            terms = [item["word"] for item in term_rows[index] if _is_topic_content_term(item["word"])][:18]
            term_sets.append(set(terms))
            topic = _topic_for_term(terms[0]) if terms else document.get("topTopic") or "文本"
            nodes.append({
                "id": str(unit.get("id") or f"{document['id']}-unit-{index + 1}"),
                "name": str(unit.get("label") or f"片段 {index + 1}"),
                "value": max(2, len(terms) + int(unit.get("charCount") or 0) // 900),
                "type": topic,
                "year": index + 1,
                "topicProfile": {topic: max(1, len(terms))},
                "x": round(coords[index][0] * 86, 4),
                "y": round(coords[index][1] * 58, 4),
                "z": coords[index][2],
                "evidenceTerms": terms[:8],
            })
        edges: Counter[tuple[str, str]] = Counter()
        relations: dict[tuple[str, str], str] = {}
        evidence: dict[tuple[str, str], str] = {}
        for index in range(len(nodes) - 1):
            key = (nodes[index]["id"], nodes[index + 1]["id"])
            semantic = max(0.0, _cosine(vectors[index], vectors[index + 1]))
            shared = sorted(term_sets[index] & term_sets[index + 1])[:8]
            edges[key] += max(1, round((semantic + len(shared) * 0.04) * 5, 2))
            relations[key] = "叙事相邻/语义延续"
            evidence[key] = "、".join(shared) or "Sentence-BERT 相邻片段相似"
        candidates: list[tuple[float, int, int, list[str]]] = []
        for left_index, right_index in itertools.combinations(range(len(nodes)), 2):
            if right_index == left_index + 1:
                continue
            semantic = max(0.0, _cosine(vectors[left_index], vectors[right_index]))
            shared = sorted(term_sets[left_index] & term_sets[right_index])[:8]
            score = semantic + min(0.24, len(shared) * 0.04)
            if score >= 0.43:
                candidates.append((score, left_index, right_index, shared))
        for score, left_index, right_index, shared in sorted(candidates, key=lambda item: item[0], reverse=True)[:160]:
            key = (nodes[left_index]["id"], nodes[right_index]["id"])
            edges[key] += max(1, round(score * 6, 2))
            relations[key] = "跨片段语义互证"
            evidence[key] = "、".join(shared) or "Sentence-BERT 高相似片段"
        links = [
            {
                "source": source,
                "target": target,
                "value": float(value),
                "relation": relations.get((source, target), "语义互证"),
                "evidence": evidence.get((source, target), ""),
            }
            for (source, target), value in edges.most_common(220)
        ]
        indegree: Counter[str] = Counter()
        outdegree: Counter[str] = Counter()
        for edge in links:
            indegree[edge["target"]] += float(edge.get("value") or 1)
            outdegree[edge["source"]] += float(edge.get("value") or 1)
        for node in nodes:
            node["influence"] = round(indegree[node["id"]] + outdegree[node["id"]] * 0.45, 3)
            node["value"] = max(float(node.get("value") or 1), node["influence"] + 1)
        ranks = [
            {
                "id": node["id"],
                "title": node["name"],
                "topic": node.get("type") or "文本",
                "influence": node.get("influence", 0),
                "year": node.get("year"),
            }
            for node in sorted(nodes, key=lambda item: item.get("influence", 0), reverse=True)[:24]
        ]
        return {"nodes": nodes, "edges": links, "links": links, "ranks": ranks, "mode": "single-document-semantic-evidence"}
    nodes = [
        {
            "id": document["id"],
            "name": document["title"][:42],
            "value": max(1, int(document.get("tokenCount") or 1) // 1800 + len(document.get("entities", [])[:16])),
            "type": document.get("topTopic") or "文本",
            "year": document.get("year"),
            "topicProfile": _document_topic_profile(document, 6),
        }
        for document in selected
    ]
    title_lookup = [(document["id"], document["title"].lower()) for document in selected]
    edges: Counter[tuple[str, str]] = Counter()
    relations: dict[tuple[str, str], str] = {}
    evidence: dict[tuple[str, str], str] = {}
    for document in selected:
        lower = document.get("fullText", "")[:180000].lower()
        for target_id, title in title_lookup:
            if target_id == document["id"] or len(title) < 8:
                continue
            if title[:32] in lower:
                edges[(document["id"], target_id)] += 1
                relations[(document["id"], target_id)] = "书名互见/疑似引用"
                evidence[(document["id"], target_id)] = title[:48]

    similarity_candidates: list[tuple[float, str, str, str]] = []
    for left, right in itertools.combinations(selected, 2):
        semantic = max(0.0, _cosine(left.get("embedding", []), right.get("embedding", [])))
        shared_score, shared_terms = _shared_keyword_score(left, right)
        topic_bonus = 0.08 if (left.get("topTopic") and left.get("topTopic") == right.get("topTopic")) else 0.0
        score = min(1.0, semantic * 0.58 + shared_score * 0.34 + topic_bonus)
        if score >= 0.26 or shared_score >= 0.18:
            source, target = (left, right) if (left.get("year") or 9999, left["title"]) <= (right.get("year") or 9999, right["title"]) else (right, left)
            similarity_candidates.append((score, source["id"], target["id"], "、".join(shared_terms[:5]) or "语义相似"))

    target_edge_count = min(360, max(80, len(selected) * 4))
    for score, source, target, terms in sorted(similarity_candidates, key=lambda item: item[0], reverse=True):
        key = (source, target)
        if len(edges) >= target_edge_count and key not in edges:
            break
        weighted = max(1, round(score * 8, 2))
        if key not in edges:
            edges[key] += weighted
            relations[key] = "语义相似/主题互证"
            evidence[key] = terms

    links = [
        {
            "source": source,
            "target": target,
            "value": float(value),
            "relation": relations.get((source, target), "书名互见/疑似引用"),
            "evidence": evidence.get((source, target), ""),
        }
        for (source, target), value in edges.most_common(target_edge_count)
    ]
    indegree: Counter[str] = Counter()
    outdegree: Counter[str] = Counter()
    for edge in links:
        indegree[edge["target"]] += float(edge.get("value") or 1)
        outdegree[edge["source"]] += float(edge.get("value") or 1)
    for node in nodes:
        node["influence"] = round(indegree[node["id"]] + outdegree[node["id"]] * 0.45, 3)
        node["value"] = max(float(node.get("value") or 1), node["influence"] + 1)
    ranks = [
        {
            "id": node["id"],
            "title": node["name"],
            "topic": node.get("type") or "文本",
            "influence": node.get("influence", 0),
            "year": node.get("year"),
        }
        for node in sorted(nodes, key=lambda item: item.get("influence", 0), reverse=True)[:24]
    ]
    return {"nodes": nodes, "edges": links, "links": links, "ranks": ranks}


def _idea_diffusion(documents: list[dict[str, Any]], keywords: list[dict[str, Any]]) -> dict[str, Any]:
    concept = keywords[0]["word"] if keywords else "文化"
    rows = []
    nodes = []
    links = []
    if len(documents) == 1 and documents:
        document = documents[0]
        stages = _single_document_stages(document, [concept])
        concept_vector = _encode([concept], batch_size=1)[0]
        running = 0
        for index, stage in enumerate(stages):
            count = int((stage.get("tokenCounter") or Counter()).get(concept, 0))
            running += count
            similarity = round(max(0.0, _cosine(concept_vector, stage.get("embedding", []))), 3)
            item = {
                "id": stage["id"],
                "title": stage["title"],
                "year": index + 1,
                "concept": concept,
                "count": count,
                "cumulative": running,
                "similarity": similarity,
                "topic": _topic_for_term(concept),
                "stage": "叙事阶段",
            }
            rows.append(item)
        for index, item in enumerate(rows):
            nodes.append({"id": item["id"], "name": item["title"], "value": max(1, item["count"]) + item["similarity"] * 5, "type": item["topic"], "x": index, "y": item["cumulative"]})
            if index:
                stage_similarity = round(max(0.0, _cosine(stages[index - 1].get("embedding", []), stages[index].get("embedding", []))), 3)
                links.append({"source": rows[index - 1]["id"], "target": item["id"], "value": max(0.1, round(stage_similarity * 6 + item["similarity"] * 2, 3)), "similarity": stage_similarity})
    else:
        sorted_docs = sorted(documents, key=lambda item: (item.get("year") or 9999, item["title"]))[:_global_render_doc_limit()]
        source = next((item for item in sorted_docs if int((item.get("tokenCounter") or {}).get(concept, 0)) > 0), None) or (sorted_docs[0] if sorted_docs else {})
        running = 0
        for index, document in enumerate(sorted_docs):
            count = int((document.get("tokenCounter") or {}).get(concept, 0))
            running += count
            item = {
                "id": document["id"],
                "title": document["title"][:42],
                "year": document.get("year") or index + 1,
                "concept": concept,
                "count": count,
                "cumulative": running,
                "similarity": round(max(0.0, _cosine(source.get("embedding", []), document.get("embedding", []))), 3),
                "topic": document.get("topTopic") or _topic_for_term(concept),
                "stage": "文档",
            }
            rows.append(item)
        for index, item in enumerate(rows):
            nodes.append({"id": item["id"], "name": item["title"], "value": item["count"] + 1, "type": item["topic"], "x": index, "y": item["cumulative"]})
            if index:
                strength = round((item["similarity"] + rows[index - 1]["similarity"]) * 3 + math.log1p(item["count"] + rows[index - 1]["count"]), 3)
                links.append({"source": rows[index - 1]["id"], "target": item["id"], "value": max(0.1, strength)})
    return {"concept": concept, "items": rows, "nodes": nodes, "links": links, "edges": links}


def _hash_unit(value: str, salt: str = "") -> float:
    digest = hashlib.sha1(f"{salt}:{value}".encode("utf-8", errors="ignore")).hexdigest()[:8]
    return int(digest, 16) / 0xFFFFFFFF


def _word_cloud(keywords: list[dict[str, Any]]) -> dict[str, Any]:
    terms = keywords[:120]
    max_count = max([int(item.get("count") or 1) for item in terms] or [1])
    vectors = _encode([item["word"] for item in terms], batch_size=48)
    coords = _normalise_coords(_project_vectors(vectors))
    words = []
    topic_totals: Counter[str] = Counter()
    for index, item in enumerate(terms):
        topic = item.get("topic") or _topic_for_term(item["word"])
        count = int(item.get("count") or 1)
        topic_totals[topic] += count
        words.append({
            "word": item["word"],
            "count": count,
            "score": round(float(item.get("score") or count), 4),
            "topic": topic,
            "x": round(coords[index][0] * 86, 4),
            "y": round(coords[index][1] * 62, 4),
            "z": coords[index][2],
            "fontSize": round(15 + 38 * math.sqrt(count / max_count), 2),
            "rotate": 0 if index < 70 else [-18, 0, 18][index % 3],
            "example": item.get("example") or "",
        })
    return {
        "words": words,
        "topics": [{"topic": topic, "count": int(count)} for topic, count in topic_totals.most_common()],
        "maxCount": max_count,
    }


def _topic_clustering_map(
    documents: list[dict[str, Any]],
    topic_model: dict[str, Any],
    keywords: list[dict[str, Any]],
    scope: str,
    topic_count: int = 18,
    *,
    source_id: str = "advanced",
    signature: str = "",
    document_key: str = "",
) -> dict[str, Any]:
    requested_topics = _normalize_topic_count(topic_count)
    keywords = _topic_keywords(keywords, 180)
    resolved_signature = signature or _documents_feature_signature(documents, scope)
    resolved_doc_key = document_key or ("global" if scope == "global" else "-".join(str(document.get("id") or "") for document in documents) or "single")
    keyword_digest = hashlib.sha1(json.dumps([(item.get("word"), item.get("count"), item.get("score")) for item in keywords[:180]], ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()[:20]
    topic_digest = hashlib.sha1(json.dumps(topic_model, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()[:20]
    memory_key = hashlib.sha1(json.dumps([INTERMEDIATE_CACHE_VERSION, "topic-clustering", source_id, resolved_signature, scope, resolved_doc_key, requested_topics, keyword_digest, topic_digest], ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()
    cached = _bounded_memory_get(_TOPIC_CLUSTER_MEMORY_CACHE, memory_key)
    if isinstance(cached, dict):
        return cached
    cache_path = _intermediate_cache_path(source_id, resolved_signature, scope, resolved_doc_key, "topic-clustering", requested_topics)
    payload = _json_cache_read(cache_path)
    if (
        payload
        and payload.get("version") == INTERMEDIATE_CACHE_VERSION
        and payload.get("keywordDigest") == keyword_digest
        and payload.get("topicDigest") == topic_digest
        and isinstance(payload.get("result"), dict)
    ):
        result = payload["result"]
        _bounded_memory_set(_TOPIC_CLUSTER_MEMORY_CACHE, memory_key, result, _env_int("ADVANCED_TEXT_TOPIC_CLUSTER_MEMORY_CACHE", 48))
        return result
    points: list[dict[str, Any]] = []
    cluster_terms: defaultdict[str, Counter[str]] = defaultdict(Counter)
    cluster_counts: Counter[str] = Counter()
    links: Counter[tuple[str, str]] = Counter()

    if not (topic_model.get("topics") and topic_model.get("assignments")):
        raise RuntimeError("主题聚类图要求 BERTopic 返回真实主题与分块分配，当前无有效主题结果，已停止关键词桶兜底。")

    topic_labels = {
        int(topic["id"]): _topic_label_from_words(_clean_topic_words(topic.get("words", []), 10), topic["label"])
        for topic in topic_model.get("topics", [])
    }
    topic_terms_by_label = {
        topic_labels[int(topic["id"])]: _clean_topic_words(topic.get("words", []), 10)
        for topic in topic_model.get("topics", [])
        if int(topic["id"]) in topic_labels
    }
    labels = [topic_labels[int(topic["id"])] for topic in topic_model.get("topics", [])[:requested_topics] if int(topic["id"]) in topic_labels]
    assignments = topic_model.get("assignments", []) or []
    assignment_texts = [
        f"{item.get('document', '')} {item.get('stage', '')} {item.get('topicLabel', '')}"
        for item in assignments
    ]
    assignment_vectors = _encode(assignment_texts, batch_size=32)
    coords = _normalise_coords(_project_vectors(assignment_vectors))
    for index, item in enumerate(assignments):
        label = topic_labels.get(int(item.get("topic") or -1), item.get("topicLabel") or "主题待识别")
        if label not in labels:
            labels.append(label)
        cluster_counts[label] += 1
        for term in topic_terms_by_label.get(label, []):
            cluster_terms[label][term["word"]] += max(1, round(float(term.get("score") or 1) * 100))
        points.append({
            "id": f"topic-point-{index}",
            "label": item.get("stage") or f"片段 {index + 1}",
            "document": item.get("document") or "",
            "topic": label,
            "x": round(coords[index][0] * 86, 4),
            "y": round(coords[index][1] * 62, 4),
            "z": coords[index][2],
            "value": 1,
            "stage": item.get("stage") or "",
        })

    if not links:
        for document in documents:
            profile = _document_topic_profile(document, 7)
            for left, right in itertools.combinations(profile, 2):
                if left in cluster_counts and right in cluster_counts:
                    links[tuple(sorted((left, right)))] += min(profile[left], profile[right])

    clusters = []
    labels = list(cluster_counts.keys())[:requested_topics]
    for index, label in enumerate(labels):
        label_points = [point for point in points if point.get("topic") == label]
        center_x = sum(float(point.get("x") or 0) for point in label_points) / max(1, len(label_points))
        center_y = sum(float(point.get("y") or 0) for point in label_points) / max(1, len(label_points))
        clusters.append({
            "id": label,
            "label": label,
            "count": int(cluster_counts[label]),
            "topTerms": [{"word": word, "count": int(count)} for word, count in cluster_terms[label].most_common(8)],
            "x": round(center_x, 4),
            "y": round(center_y, 4),
        })
    if len(clusters) >= 2:
        cluster_texts = [
            f"{cluster['label']} " + " ".join(str(term.get("word") or "") for term in cluster.get("topTerms") or [])
            for cluster in clusters
        ]
        cluster_vectors = _encode(cluster_texts, batch_size=24)
        for left_index, right_index in itertools.combinations(range(len(clusters)), 2):
            similarity = max(0.0, _cosine(cluster_vectors[left_index], cluster_vectors[right_index]))
            if similarity >= 0.28:
                left = str(clusters[left_index]["label"])
                right = str(clusters[right_index]["label"])
                links[tuple(sorted((left, right)))] += max(1, round(similarity * 8))
    result = {
        "points": points,
        "clusters": sorted(clusters, key=lambda item: item["count"], reverse=True),
        "links": [{"source": left, "target": right, "value": int(value)} for (left, right), value in links.most_common(80)],
    }
    _bounded_memory_set(_TOPIC_CLUSTER_MEMORY_CACHE, memory_key, result, _env_int("ADVANCED_TEXT_TOPIC_CLUSTER_MEMORY_CACHE", 48))
    _json_cache_write(
        cache_path,
        {
            "version": INTERMEDIATE_CACHE_VERSION,
            "kind": "topic-clustering",
            "sourceId": source_id,
            "signature": resolved_signature,
            "scope": scope,
            "documentKey": resolved_doc_key,
            "topicCount": requested_topics,
            "keywordDigest": keyword_digest,
            "topicDigest": topic_digest,
            "result": result,
        },
    )
    return result


def _topic_tree_from_clustering(clustering: dict[str, Any], corpus_title: str) -> dict[str, Any]:
    clusters = clustering.get("clusters") or []
    children = []
    topic_ranks = []
    concept_scores: Counter[str] = Counter()
    links: list[dict[str, Any]] = []
    for cluster in clusters:
        label = str(cluster.get("label") or cluster.get("id") or "")
        terms = cluster.get("topTerms") or []
        value = int(cluster.get("count") or 0)
        children.append({
            "name": label,
            "value": value,
            "children": [{"name": item.get("word"), "value": int(item.get("count") or 1)} for item in terms],
        })
        topic_ranks.append({
            "topic": label,
            "count": value,
            "concepts": ", ".join(str(item.get("word") or "") for item in terms[:5]),
        })
        for item in terms:
            word = str(item.get("word") or "")
            count = int(item.get("count") or 1)
            concept_scores[word] += count
            links.append({"source": label, "target": word, "value": count})
    return {
        "name": corpus_title,
        "children": children,
        "topicRanks": topic_ranks,
        "conceptRanks": [{"concept": name, "value": int(value)} for name, value in concept_scores.most_common(28)],
        "links": links[:420],
        "depthStats": [
            {"name": "主题层", "value": len(children)},
            {"name": "概念层", "value": len(concept_scores)},
            {"name": "主题-概念边", "value": len(links)},
        ],
    }


def _topic_river_from_clustering(clustering: dict[str, Any], scope: str) -> dict[str, Any]:
    topics = [str(cluster.get("label") or cluster.get("id") or "") for cluster in clustering.get("clusters", [])]
    rows: dict[str, Counter[str]] = defaultdict(Counter)
    points = clustering.get("points", []) or []
    if scope == "single" and points:
        stage_names = ["叙事开端", "情节展开", "关键转折", "冲突高潮", "结局余韵"]
        for index, point in enumerate(points):
            stage_index = min(len(stage_names) - 1, math.floor(index * len(stage_names) / max(1, len(points))))
            topic = str(point.get("topic") or "")
            if topic in topics:
                rows[stage_names[stage_index]][topic] += 1
        return {"topics": topics, "series": [{"stage": stage, **dict(rows.get(stage, {}))} for stage in stage_names if rows.get(stage)]}
    for point in clustering.get("points", []):
        label = str(point.get("stage") or "") if scope == "single" else str(point.get("document") or point.get("stage") or "")
        if not label:
            label = "文本片段"
        topic = str(point.get("topic") or "")
        if topic in topics:
            rows[label[:24]][topic] += 1
    return {"topics": topics, "series": [{"stage": stage, **dict(counter)} for stage, counter in list(rows.items())[:120]]}


def _topic_concept_matrix_from_clustering(clustering: dict[str, Any]) -> dict[str, Any]:
    clusters = clustering.get("clusters") or []
    topics = [str(cluster.get("label") or cluster.get("id") or "") for cluster in clusters]
    concepts = []
    seen: set[str] = set()
    for cluster in clusters:
        for item in cluster.get("topTerms") or []:
            word = str(item.get("word") or "")
            if word and word not in seen:
                seen.add(word)
                concepts.append(word)
            if len(concepts) >= 60:
                break
        if len(concepts) >= 60:
            break
    matrix = []
    cells = []
    for row_index, cluster in enumerate(clusters):
        weights = {str(item.get("word") or ""): int(item.get("count") or 1) for item in cluster.get("topTerms") or []}
        row = [weights.get(concept, 0) for concept in concepts]
        matrix.append(row)
        for col_index, value in enumerate(row):
            if value > 0:
                cells.append({"topic": topics[row_index], "concept": concepts[col_index], "value": int(value)})
    row_totals = [int(sum(row)) for row in matrix]
    col_totals = [int(sum(row[col_index] for row in matrix)) for col_index in range(len(concepts))] if concepts else []
    return {
        "topics": topics,
        "concepts": concepts,
        "matrix": matrix,
        "rowTotals": row_totals,
        "colTotals": col_totals,
        "topCells": sorted(cells, key=lambda item: item["value"], reverse=True)[:36],
    }


def _topic_cooccurrence_network_from_clustering(clustering: dict[str, Any]) -> dict[str, Any]:
    clusters = clustering.get("clusters") or []
    allowed = {str(cluster.get("label") or cluster.get("id") or "") for cluster in clusters}
    cluster_by_label = {str(cluster.get("label") or cluster.get("id") or ""): cluster for cluster in clusters}
    nodes = [
        {
            "id": str(cluster.get("label") or cluster.get("id") or ""),
            "name": str(cluster.get("label") or cluster.get("id") or ""),
            "type": "主题",
            "value": int(cluster.get("count") or 1),
            "concepts": cluster.get("topTerms") or [],
            "x": float(cluster.get("x") or 0),
            "y": float(cluster.get("y") or 0),
        }
        for cluster in clusters
    ]
    link_map: dict[tuple[str, str], dict[str, Any]] = {}

    def add_link(source: str, target: str, value: float, relation: str, similarity: float | None = None) -> None:
        if source not in allowed or target not in allowed or source == target:
            return
        left, right = tuple(sorted((source, target)))
        existing = link_map.get((left, right))
        if existing:
            existing["value"] = round(float(existing.get("value") or 0) + float(value), 3)
            if relation and relation not in str(existing.get("relation") or ""):
                existing["relation"] = f"{existing.get('relation')}; {relation}"
            if similarity is not None:
                existing["similarity"] = max(float(existing.get("similarity") or 0), float(similarity))
            return
        link_map[(left, right)] = {
            "source": source,
            "target": target,
            "value": round(float(value), 3),
            "relation": relation,
            **({"similarity": round(float(similarity), 4)} if similarity is not None else {}),
        }

    for item in clustering.get("links", []):
        add_link(str(item.get("source") or ""), str(item.get("target") or ""), float(item.get("value") or 1), "同文档/同片段共现")

    if len(clusters) >= 2:
        cluster_texts = [
            f"{cluster.get('label') or cluster.get('id')} "
            + " ".join(str(term.get("word") or "") for term in (cluster.get("topTerms") or [])[:8])
            for cluster in clusters
        ]
        cluster_vectors = _encode(cluster_texts, batch_size=24)
        semantic_pairs: list[tuple[float, str, str]] = []
        for left_index, right_index in itertools.combinations(range(len(clusters)), 2):
            left = str(clusters[left_index].get("label") or clusters[left_index].get("id") or "")
            right = str(clusters[right_index].get("label") or clusters[right_index].get("id") or "")
            similarity = max(0.0, _cosine(cluster_vectors[left_index], cluster_vectors[right_index]))
            semantic_pairs.append((similarity, left, right))
        target_edges = min(len(semantic_pairs), max(len(clusters) + 2, len(clusters) * 2))
        for similarity, left, right in sorted(semantic_pairs, key=lambda item: item[0], reverse=True)[:target_edges]:
            left_terms = {str(term.get("word") or "") for term in (cluster_by_label.get(left, {}).get("topTerms") or [])[:8]}
            right_terms = {str(term.get("word") or "") for term in (cluster_by_label.get(right, {}).get("topTerms") or [])[:8]}
            relation = "Sentence-BERT主题语义邻近"
            shared_terms = sorted(term for term in (left_terms & right_terms) if term)
            if shared_terms:
                relation = f"{relation}: {' / '.join(shared_terms[:4])}"
            add_link(left, right, max(0.25, similarity * 9), relation, similarity)

    links = sorted(link_map.values(), key=lambda item: float(item.get("value") or 0), reverse=True)
    return {
        "nodes": nodes,
        "edges": links,
        "links": links,
        "diagnostics": {
            "topicCount": len(nodes),
            "semanticEdgeCount": sum(1 for item in links if "Sentence-BERT" in str(item.get("relation") or "")),
        },
        "conceptRanks": [
            {"topic": str(cluster.get("label") or cluster.get("id") or ""), "concept": item.get("word"), "count": int(item.get("count") or 1)}
            for cluster in clusters
            for item in (cluster.get("topTerms") or [])[:5]
        ],
    }


def _topic_cooccurrence_network(documents: list[dict[str, Any]], keywords: list[dict[str, Any]], scope: str) -> dict[str, Any]:
    raise RuntimeError("主题共现网络只允许 BERTopic 分块主题分配生成，规则主题共现已禁用。")


def _place_family(name: str, label: str = "") -> str:
    lower = name.lower()
    if any(seed in lower for seed in ["china", "peking", "beijing", "nanking", "shanghai", "kanton", "tibet", "szechuan", "sichuan", "中国", "北京", "上海", "南京", "广东", "西藏"]):
        return "中国地名"
    if any(seed in lower for seed in ["berg", "meer", "fluss", "river", "mount", "lake", "山", "海", "河", "湖"]):
        return "山水空间"
    if label in {"GPE", "LOC", "FAC"}:
        return "地理实体"
    return "其他空间"


def _place_entity_map(documents: list[dict[str, Any]], scope: str) -> dict[str, Any]:
    place_counter: Counter[tuple[str, str]] = Counter()
    document_counter: Counter[str] = Counter()
    place_docs: defaultdict[str, list[str]] = defaultdict(list)
    place_contexts: defaultdict[str, list[str]] = defaultdict(list)
    co_edges: Counter[tuple[str, str]] = Counter()
    aliases = {
        "china": "China",
        "chinese": "China",
        "peking": "Peking",
        "beijing": "Peking",
        "shanghai": "Shanghai",
        "nanking": "Nanking",
        "nanjing": "Nanking",
        "tibet": "Tibet",
        "kanton": "Kanton",
        "guangzhou": "Kanton",
        "yangtze": "Yangtze",
        "gelbe": "Yellow River",
        "huangho": "Yellow River",
    }
    for document in documents:
        current: Counter[tuple[str, str]] = Counter()
        for entity in document.get("entities", []):
            label = entity.get("type") or "LOC"
            if label not in {"GPE", "LOC", "FAC", "ORG"}:
                continue
            name = re.sub(r"\s+", " ", str(entity.get("name") or "")).strip(" ,.;:")
            if len(name) < 2:
                continue
            current[(name, label)] += int(entity.get("count") or 1)
        token_counter = document.get("tokenCounter") or {}
        for raw, canonical in aliases.items():
            count = int(token_counter.get(raw, 0))
            if count:
                current[(canonical, "GPE" if canonical not in {"Yangtze", "Yellow River"} else "LOC")] += count
        for (name, label), count in current.items():
            place_counter[(name, label)] += count
            document_counter[name] += 1
            if len(place_docs[name]) < 8:
                place_docs[name].append(document["title"][:28])
            if len(place_contexts[name]) < 6:
                context = _term_context(document.get("sentences") or [], name) or document.get("preview") or document.get("title") or name
                place_contexts[name].append(context)
        top_names = [name for (name, _label), _count in current.most_common(10)]
        for left, right in itertools.combinations(sorted(set(top_names)), 2):
            co_edges[(left, right)] += 1
    items = place_counter.most_common(120)
    if len(items) < 2:
        raise RuntimeError("地名解析图需要 spaCy 识别出至少两个真实地名/空间实体。")
    place_texts = [
        f"{name}. {label}. " + " ".join(place_contexts.get(name) or [name])
        for (name, label), _count in items
    ]
    coords = _semantic_coords(_encode(place_texts, batch_size=32))
    family_counts: Counter[str] = Counter()
    nodes = []
    for index, ((name, label), count) in enumerate(items):
        family = _place_family(name, label)
        family_counts[family] += int(count)
        nodes.append({
            "id": name,
            "name": name,
            "type": family,
            "entityType": label,
            "value": int(count),
            "documentCount": int(document_counter.get(name, 0)),
            "documents": place_docs.get(name, []),
            "x": round(coords[index][0] * 88, 4),
            "y": round(coords[index][1] * 58, 4),
            "z": coords[index][2],
            "context": (place_contexts.get(name) or [""])[0],
        })
    allowed = {node["id"] for node in nodes}
    links = [
        {"source": left, "target": right, "value": int(value), "relation": "同文档地名共现"}
        for (left, right), value in co_edges.most_common(160)
        if left in allowed and right in allowed
    ]
    paths = []
    for index, document in enumerate(sorted(documents, key=lambda item: (item.get("year") or 9999, item["title"]))[:_global_render_doc_limit()]):
        places = []
        for node in nodes:
            if document["title"][:28] in node.get("documents", []):
                places.append(node["name"])
        if places:
            paths.append({"stage": document["title"][:36], "year": document.get("year") or index + 1, "places": places[:6]})
    return {
        "nodes": nodes,
        "edges": links,
        "links": links,
        "families": [{"family": family, "count": int(count)} for family, count in family_counts.most_common()],
        "paths": paths,
    }


def _transmission_path_map(documents: list[dict[str, Any]], keywords: list[dict[str, Any]]) -> dict[str, Any]:
    concepts = [item["word"] for item in keywords[:6]] or ["文化"]
    source_mode = "documents"
    if len(documents) == 1:
        source_mode = "narrative-stages"
        sorted_docs = _single_document_stages(documents[0], concepts)
    else:
        sorted_docs = sorted(documents, key=lambda item: (item.get("year") or 9999, item["title"]))[:_global_render_doc_limit()]
    if not sorted_docs:
        raise RuntimeError("传播路径图需要真实文档或叙事阶段。")
    topic_order = {topic: index for index, topic in enumerate(sorted({document.get("topTopic") or "文本概念" for document in sorted_docs}))}
    source = sorted_docs[0] if sorted_docs else {}
    nodes = []
    links = []
    matrix = []
    if not source.get("embedding"):
        raise RuntimeError("传播路径图要求 Sentence-BERT 文档/阶段向量，当前缺少真实 embedding。")

    for index, document in enumerate(sorted_docs):
        profile = {concept: int((document.get("tokenCounter") or {}).get(concept, 0)) for concept in concepts}
        intensity = sum(profile.values())
        topic = document.get("topTopic") or "文本概念"
        if not document.get("embedding"):
            raise RuntimeError("传播路径图要求每个文档/阶段都有真实 Sentence-BERT embedding。")
        embedding_similarity = round(max(0.0, _cosine(source.get("embedding", []), document.get("embedding", []))), 3)
        similarity = embedding_similarity
        node = {
            "id": document["id"],
            "name": document["title"][:42],
            "year": document.get("year") or index + 1,
            "topic": topic,
            "value": max(1, intensity),
            "similarity": similarity,
            "profile": profile,
            "x": index,
            "y": topic_order.get(topic, 0),
        }
        nodes.append(node)
        matrix.append([profile[concept] for concept in concepts])
        if index:
            previous = nodes[index - 1]
            adjacent_similarity = round(max(0.0, _cosine(sorted_docs[index - 1].get("embedding", []), document.get("embedding", []))), 3)
            shared_score, shared_terms = _shared_keyword_score(sorted_docs[index - 1], document, 50)
            links.append({
                "source": previous["id"],
                "target": node["id"],
                "value": round(max(0.1, adjacent_similarity * 6 + similarity * 2 + math.log1p(intensity)), 3),
                "relation": "时间相邻传播",
                "evidence": "、".join(shared_terms[:5]),
                "similarity": adjacent_similarity,
            })
        if index > 1 and similarity >= 0.34:
            links.append({
                "source": source.get("id"),
                "target": node["id"],
                "value": round(similarity * 5, 3),
                "relation": "源头相似路径",
                "evidence": concepts[0],
            })
    milestones = sorted(nodes, key=lambda item: (item["value"], item["similarity"]), reverse=True)[:18]
    return {
        "concepts": concepts,
        "topics": sorted(topic_order, key=topic_order.get),
        "documents": [node["name"] for node in nodes],
        "nodes": nodes,
        "edges": links,
        "links": links,
        "matrix": matrix,
        "milestones": milestones,
        "mode": source_mode,
    }


def _concept_migration(documents: list[dict[str, Any]], keywords: list[dict[str, Any]]) -> dict[str, Any]:
    concepts = [item["word"] for item in _topic_keywords(keywords, 24)[:12]]
    if len(documents) == 1 and documents:
        stages = _single_document_stages(documents[0], concepts)
        return {
            "concepts": concepts,
            "documents": [stage["title"] for stage in stages],
            "matrix": [[int((stage.get("tokenCounter") or {}).get(concept, 0)) for stage in stages] for concept in concepts],
            "mode": "single-document-stages",
            "stageSimilarities": [
                {
                    "stage": stage["title"],
                    "similarityToStart": round(max(0.0, _cosine(stages[0].get("embedding", []), stage.get("embedding", []))), 3),
                }
                for stage in stages
            ] if stages else [],
        }
    limited = documents[:_global_render_doc_limit()]
    return {
        "concepts": concepts,
        "documents": [item["title"][:18] for item in limited],
        "matrix": [[int((document.get("tokenCounter") or {}).get(concept, 0)) for document in limited] for concept in concepts],
    }


def _author_concept(documents: list[dict[str, Any]]) -> dict[str, Any]:
    if len(documents) == 1 and documents:
        document = documents[0]
        author = document.get("author") or "未识别作者/编译者"
        concepts = [item["word"] for item in _topic_keywords(document.get("topKeywords") or [], 40)[:18]]
        stages = _single_document_stages(document, concepts[:10])
        nodes = [
            {"id": f"author:{author}", "name": author, "type": "作者", "value": max(3, len(stages))},
            {"id": f"book:{document['id']}", "name": document["title"][:42], "type": "作品", "value": int(document.get("chunkCount") or 1)},
        ]
        edges = [{"source": f"author:{author}", "target": f"book:{document['id']}", "value": 1, "relation": "编译/署名"}]
        concept_seen: set[str] = set()
        for index, stage in enumerate(stages):
            stage_id = stage["id"]
            nodes.append({"id": stage_id, "name": stage["title"], "type": "叙事阶段", "value": max(1, int(stage.get("tokenCount") or 1)), "year": index + 1})
            edges.append({"source": f"book:{document['id']}", "target": stage_id, "value": 1, "relation": "阶段展开"})
            for item in (stage.get("topKeywords") or [])[:10]:
                term = item["word"]
                if concepts and term not in concepts:
                    continue
                concept_id = f"concept:{term}"
                if concept_id not in concept_seen:
                    concept_seen.add(concept_id)
                    nodes.append({"id": concept_id, "name": term, "type": "概念", "value": int(item.get("count") or 1), "topic": _topic_for_term(term)})
                edges.append({"source": stage_id, "target": concept_id, "value": int(item.get("count") or 1), "relation": "阶段概念负载"})
        return {"nodes": nodes[:1200], "edges": edges[:1800], "links": edges[:1800], "mode": "single-document-author-stage-concept"}
    author_terms: dict[str, Counter[str]] = defaultdict(Counter)
    for document in documents:
        author_terms[document.get("author") or "未识别作者/编译者"].update({item["word"]: item["count"] for item in document.get("topKeywords", [])[:18]})
    nodes = []
    edges = []
    seen: set[str] = set()
    for author, terms in list(author_terms.items())[:_global_render_doc_limit()]:
        author_id = f"author:{author}"
        nodes.append({"id": author_id, "name": author, "type": "作者", "value": int(sum(terms.values()))})
        seen.add(author_id)
        for term, count in terms.most_common(10):
            concept_id = f"concept:{term}"
            if concept_id not in seen:
                seen.add(concept_id)
                nodes.append({"id": concept_id, "name": term, "type": "概念", "value": int(count)})
            edges.append({"source": author_id, "target": concept_id, "value": int(count)})
    return {"nodes": nodes[:1200], "edges": edges[:1800], "links": edges[:1800]}


def _visualizations(
    documents: list[dict[str, Any]],
    all_documents: list[dict[str, Any]],
    scope: str,
    corpus_title: str,
    method_id: str = "",
    topic_count: int = 18,
    *,
    source_id: str = "advanced",
    signature: str = "",
    document_key: str = "",
) -> dict[str, Any]:
    requested_topics = _normalize_topic_count(topic_count)
    keywords = _keyword_items(documents)
    selected = method_id or "semantic-manifold"
    result: dict[str, Any] = {}
    needs_all = selected == "all"
    needs_nlp = selected in {
        "all",
        "nlp-overview",
        "nlp-word-frequency",
        "nlp-pos-distribution",
        "nlp-entity-distribution",
        "nlp-lexical-metrics",
        "nlp-script-profile",
    }
    needs_topic = selected in {"all", "topic-clustering-map", "topic-tree", "topic-river", "topic-concept-matrix", "topic-cooccurrence-network"}
    needs_graph = selected in {"all", "cooccurrence-network", "centrality-radar"}

    if needs_nlp:
        result["nlpStatistics"] = _nlp_statistics_for_method(documents, selected)
    graph: dict[str, Any] | None = None
    if needs_graph:
        graph = _cooccurrence(
            documents,
            keywords,
            limit_nodes=140 if scope == "global" else 130,
            scope=scope,
            source_id=source_id,
            signature=signature,
            document_key=document_key,
        )

    topic_model: dict[str, Any] = {"topics": [], "assignments": [], "status": "not-requested"}
    if needs_topic:
        topic_model = _topic_model(documents, scope, requested_topics, source_id=source_id, signature=signature, document_key=document_key)
    topic_clustering: dict[str, Any] | None = None
    if needs_topic:
        topic_clustering = _topic_clustering_map(
            documents,
            topic_model,
            keywords,
            scope,
            requested_topics,
            source_id=source_id,
            signature=signature,
            document_key=document_key,
        )

    if needs_all or selected == "semantic-manifold":
        result["semanticManifold"] = _semantic_manifold(keywords[:90 if scope == "global" else 120])
    if needs_all or selected == "concept-sankey":
        result["conceptSankey"] = _sankey(documents, scope)
    if needs_all or selected == "semantic-heatmap":
        result["semanticHeatmap"] = _semantic_topic_heatmap(documents[:_global_render_doc_limit()], keywords, scope)
    if needs_all or selected == "word-cloud":
        result["wordCloud"] = _word_cloud(keywords)
    if needs_all or selected == "cooccurrence-network":
        result["cooccurrenceNetwork"] = graph or _cooccurrence(
            documents,
            keywords,
            limit_nodes=140 if scope == "global" else 130,
            scope=scope,
            source_id=source_id,
            signature=signature,
            document_key=document_key,
        )
    if needs_all or selected == "multilayer-network":
        result["multilayerNetwork"] = _multilayer(documents, scope)
    if needs_all or selected == "centrality-radar":
        result["centralityRadar"] = _centrality(graph or _cooccurrence(
            documents,
            keywords,
            limit_nodes=140 if scope == "global" else 130,
            scope=scope,
            source_id=source_id,
            signature=signature,
            document_key=document_key,
        ))
    if needs_all or selected == "topic-clustering-map":
        result["topicClusteringMap"] = topic_clustering or _topic_clustering_map(
            documents,
            topic_model,
            keywords,
            scope,
            requested_topics,
            source_id=source_id,
            signature=signature,
            document_key=document_key,
        )
    if needs_all or selected == "topic-tree":
        result["topicTree"] = _topic_tree_from_clustering(topic_clustering or {}, corpus_title)
    if needs_all or selected == "topic-river":
        result["topicRiver"] = _topic_river_from_clustering(topic_clustering or {}, scope)
    if needs_all or selected == "topic-concept-matrix":
        result["topicConceptMatrix"] = _topic_concept_matrix_from_clustering(topic_clustering or {})
    if needs_all or selected == "topic-cooccurrence-network":
        result["topicCooccurrenceNetwork"] = _topic_cooccurrence_network_from_clustering(topic_clustering or {})
    if needs_all or selected == "citation-network":
        result["citationNetwork"] = _citation_network(documents if scope == "single" else all_documents)
    if needs_all or selected == "idea-diffusion":
        result["ideaDiffusion"] = _idea_diffusion(documents, keywords)
    if needs_all or selected == "place-entity-map":
        result["placeEntityMap"] = _place_entity_map(documents, scope)
    if needs_all or selected == "transmission-path-map":
        result["transmissionPathMap"] = _transmission_path_map(documents, keywords)
    if needs_all or selected == "concept-migration":
        result["conceptMigration"] = _concept_migration(documents, keywords)
    if needs_all or selected == "author-concept":
        result["authorConcept"] = _author_concept(documents if scope == "single" else all_documents)
    result["topicModel"] = {"status": topic_model.get("status"), "topicCount": len(topic_model.get("topics") or []), "requestedTopicCount": requested_topics}
    return result


def _metrics(documents: list[dict[str, Any]], global_keywords: list[dict[str, Any]], global_entities: list[dict[str, Any]]) -> dict[str, Any]:
    return {
        "documentCount": len(documents),
        "visibleDocumentCount": len(documents),
        "charCount": sum(item["charCount"] for item in documents),
        "paragraphCount": sum(item["paragraphCount"] for item in documents),
        "sentenceCount": sum(item["sentenceCount"] for item in documents),
        "chunkCount": sum(item["chunkCount"] for item in documents),
        "entityCount": len(global_entities),
        "conceptCount": len(global_keywords),
    }


def _global_analysis(documents: list[dict[str, Any]]) -> dict[str, Any]:
    counter: Counter[str] = Counter()
    entities: Counter[tuple[str, str]] = Counter()
    topics: Counter[str] = Counter()
    for document in documents:
        counter.update(document.get("tokenCounter") or {})
        for entity in document.get("entities", []):
            entities[(entity["name"], entity.get("type") or "ENTITY")] += int(entity.get("count") or 1)
        topics.update(document.get("topicCounts") or {})
    keywords = [{"word": word, "count": int(count), "score": int(count), "topic": _topic_for_term(word)} for word, count in counter.most_common(220)]
    entity_items = [{"name": name, "type": label, "count": int(count)} for (name, label), count in entities.most_common(160)]
    return {
        "metrics": _metrics(documents, keywords, entity_items),
        "topKeywords": keywords[:100],
        "entities": entity_items[:100],
        "topics": [{"topic": topic, "count": int(count)} for topic, count in topics.most_common()],
    }


def _scope_documents(documents: list[dict[str, Any]], selected: dict[str, Any] | None, scope: str) -> list[dict[str, Any]]:
    if scope == "single" and selected:
        return [selected]
    return documents


def _documents_signature(raw_documents: list[dict[str, Any]], source_id: str) -> str:
    rows = []
    for item in raw_documents:
        text = str(item.get("text") or item.get("content") or "")
        rows.append([item.get("id"), item.get("title"), len(text), hashlib.sha1(text[:5000].encode("utf-8", errors="ignore")).hexdigest()[:12]])
    digest = hashlib.sha1(json.dumps([TEXT_CLEANING_VERSION, VISUALIZATION_CACHE_VERSION, source_id, rows], ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()[:20]
    return digest


def _analysis_cache_path(source_id: str, signature: str) -> Path:
    safe = re.sub(r"[^A-Za-z0-9_.-]+", "-", source_id or "advanced")[:80]
    return ANALYSIS_CACHE_ROOT / f"{safe}-{signature}.json"


def _write_analysis_cache(source_id: str, signature: str, documents: list[dict[str, Any]]) -> None:
    cache_path = _analysis_cache_path(source_id, signature)
    cache_path.parent.mkdir(parents=True, exist_ok=True)
    cache_path.write_text(json.dumps({"signature": signature, "documents": [_json_ready_document(item) for item in documents]}, ensure_ascii=False), encoding="utf-8")


def _visualization_cache_path(source_id: str, signature: str, scope: str, document_id: str, method_id: str, topic_count: int = 18) -> Path:
    safe = re.sub(r"[^A-Za-z0-9_.-]+", "-", source_id or "advanced")[:80]
    payload = [VISUALIZATION_CACHE_VERSION, source_id, signature, scope, document_id, method_id, _normalize_topic_count(topic_count)]
    digest = hashlib.sha1(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()[:24]
    return ANALYSIS_CACHE_ROOT / "visualizations" / f"{safe}-{digest}.json"


def _warmup_checkpoint_path(source_id: str, signature: str, scope: str, document_key: str, topic_count: int = 18) -> Path:
    safe = re.sub(r"[^A-Za-z0-9_.-]+", "-", source_id or "advanced")[:80]
    payload = [VISUALIZATION_CACHE_VERSION, "warmup", source_id, signature, scope, document_key, _normalize_topic_count(topic_count)]
    digest = hashlib.sha1(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()[:24]
    return ANALYSIS_CACHE_ROOT / "checkpoints" / f"{safe}-{digest}.json"


def _read_visualization_cache(path: Path) -> dict[str, Any] | None:
    if not path.exists():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
        visualizations = payload.get("visualizations")
        return visualizations if isinstance(visualizations, dict) else None
    except Exception:
        return None


def _write_visualization_cache(path: Path, visualizations: dict[str, Any], metadata: dict[str, Any]) -> None:
    try:
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(
            json.dumps(
                {
                    "version": VISUALIZATION_CACHE_VERSION,
                    "metadata": metadata,
                    "visualizations": visualizations,
                },
                ensure_ascii=False,
            ),
            encoding="utf-8",
        )
    except Exception:
        pass


def _all_method_ids() -> list[str]:
    return [str(method.get("id") or "") for method in VISUAL_METHODS if method.get("id")]


def _visualization_cache_metadata(
    source_id: str,
    signature: str,
    scope: str,
    document_key: str,
    method_id: str,
    topic_count: int,
) -> dict[str, Any]:
    return {
        "sourceId": source_id,
        "signature": signature,
        "scope": scope,
        "documentId": document_key,
        "methodId": method_id,
        "topicCount": _normalize_topic_count(topic_count),
    }


def _json_ready_document(document: dict[str, Any]) -> dict[str, Any]:
    ready = dict(document)
    ready["tokenCounter"] = dict(document.get("tokenCounter") or {})
    ready["spacyPos"] = dict(document.get("spacyPos") or {})
    ready["featureFlags"] = dict(document.get("featureFlags") or {})
    ready["termExamples"] = dict(document.get("termExamples") or {})
    return ready


def _from_json_document(document: dict[str, Any]) -> dict[str, Any]:
    document["tokenCounter"] = Counter(document.get("tokenCounter") or {})
    document["spacyPos"] = Counter(document.get("spacyPos") or {})
    document["termExamples"] = dict(document.get("termExamples") or {})
    document["featureFlags"] = dict(document.get("featureFlags") or {})
    document.setdefault("embedding", [])
    document.setdefault("entities", [])
    return document


def analyzed_documents(raw_documents: list[dict[str, Any]], source_id: str = "advanced", method_id: str = "") -> tuple[list[dict[str, Any]], str, bool]:
    signature = _documents_signature(raw_documents, source_id)
    cache_path = _analysis_cache_path(source_id, signature)
    cache_hit = False
    documents: list[dict[str, Any]] = []
    if cache_path.exists():
        try:
            payload = json.loads(cache_path.read_text(encoding="utf-8"))
            docs = [_from_json_document(item) for item in payload.get("documents", [])]
            if docs:
                documents = docs
                cache_hit = True
        except Exception:
            pass
    if not documents:
        use_spacy, use_embeddings = _feature_requirements_for_method(method_id)
        documents = preprocess_documents(raw_documents, source_id=source_id, use_spacy=use_spacy, use_embeddings=use_embeddings)
        _write_analysis_cache(source_id, signature, documents)
    use_spacy, use_embeddings = _feature_requirements_for_method(method_id)
    if _ensure_document_features(documents, use_spacy=use_spacy, use_embeddings=use_embeddings):
        _write_analysis_cache(source_id, signature, documents)
    return documents, signature, cache_hit


def advanced_text_visualization_payload(
    raw_documents: list[dict[str, Any]],
    *,
    source_id: str = "advanced",
    corpus_title: str = "高级文本图谱",
    document_id: str = "",
    scope: str = "single",
    query: str = "",
    filter_fulltext: bool = True,
    method_id: str = "",
    topic_count: int = 18,
) -> dict[str, Any]:
    resolved_method = method_id or "semantic-manifold"
    requested_topics = _normalize_topic_count(topic_count)
    documents, signature, cache_hit = analyzed_documents(raw_documents, source_id=source_id, method_id="")
    q = query.strip().lower()
    filtered = [
        document for document in documents
        if not q
        or q in document["title"].lower()
        or q in str(document.get("filename") or "").lower()
        or (filter_fulltext and q in document["fullText"][:400000].lower())
    ]
    selected = next((item for item in documents if item["id"] == document_id), None) or (filtered[0] if filtered else (documents[0] if documents else None))
    resolved_scope = "global" if scope == "global" else "single"
    scope_docs = _scope_documents(documents, selected, resolved_scope)
    selected_id = str((selected or {}).get("id") or "")
    visual_doc_key = selected_id if resolved_scope == "single" else "global"
    visual_cache_path = _visualization_cache_path(source_id, signature, resolved_scope, visual_doc_key, resolved_method, requested_topics)
    visualizations = _read_visualization_cache(visual_cache_path)
    visual_cache_hit = visualizations is not None
    if visualizations is None:
        use_spacy, use_embeddings = _feature_requirements_for_method(resolved_method)
        if _ensure_document_features(documents, use_spacy=use_spacy, use_embeddings=use_embeddings):
            _write_analysis_cache(source_id, signature, documents)
        scope_docs = _scope_documents(documents, selected, resolved_scope)
        visualizations = _visualizations(
            scope_docs,
            documents,
            resolved_scope,
            corpus_title,
            method_id=resolved_method,
            topic_count=requested_topics,
            source_id=source_id,
            signature=signature,
            document_key=visual_doc_key,
        )
        _write_visualization_cache(
            visual_cache_path,
            visualizations,
            _visualization_cache_metadata(source_id, signature, resolved_scope, visual_doc_key, resolved_method, requested_topics),
        )
    global_analysis = _global_analysis(documents)
    return {
        "sourceId": source_id,
        "corpusTitle": corpus_title,
        "signature": signature,
        "cacheHit": cache_hit,
        "visualCacheHit": visual_cache_hit,
        "documents": [_summary_document(item) for item in filtered],
        "selectedDocument": _selected_detail(selected),
        "globalAnalysis": {
            **global_analysis,
            "metrics": {**global_analysis["metrics"], "visibleDocumentCount": len(filtered)},
        },
        "visualizations": visualizations,
        "methods": VISUAL_METHODS,
        "preprocessing": PREPROCESSING_SUMMARY,
        "academicStyle": ACADEMIC_STYLE,
        "localAi": local_ai_status(),
        "scope": resolved_scope,
        "query": query,
        "activeMethod": resolved_method,
        "topicCount": requested_topics,
    }


def warm_advanced_text_visualization_cache(
    raw_documents: list[dict[str, Any]],
    *,
    source_id: str = "advanced",
    corpus_title: str = "Advanced Text Atlas",
    document_id: str = "",
    scope: str = "single",
    topic_count: int = 18,
    method_ids: list[str] | None = None,
    max_methods: int | None = None,
) -> dict[str, Any]:
    resolved_scope = "global" if scope == "global" else "single"
    requested_topics = _normalize_topic_count(topic_count)
    documents, signature, analysis_cache_hit = analyzed_documents(raw_documents, source_id=source_id, method_id="")
    selected = next((item for item in documents if item["id"] == document_id), None) or (documents[0] if documents else None)
    if resolved_scope == "single" and not selected:
        raise RuntimeError("Warmup requires one valid document.")
    visual_doc_key = "global" if resolved_scope == "global" else str(selected.get("id") or document_id or "single")
    lock_key = hashlib.sha1(json.dumps([source_id, signature, resolved_scope, visual_doc_key, requested_topics], ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()
    with _CACHE_LOCK:
        lock = _WARMUP_LOCKS.setdefault(lock_key, threading.Lock())
    if not lock.acquire(blocking=False):
        return {
            "status": "already-running",
            "sourceId": source_id,
            "signature": signature,
            "documentId": visual_doc_key,
            "scope": resolved_scope,
            "topicCount": requested_topics,
            "analysisCacheHit": analysis_cache_hit,
        }
    try:
        allowed_methods = set(_all_method_ids())
        requested_methods = [method for method in (method_ids or _all_method_ids()) if method in allowed_methods]
        if max_methods is not None:
            requested_methods = requested_methods[: max(1, int(max_methods))]
        checkpoint_path = _warmup_checkpoint_path(source_id, signature, resolved_scope, visual_doc_key, requested_topics)
        checkpoint = _json_cache_read(checkpoint_path) or {}
        generated: list[str] = []
        cached: list[str] = []
        errors: list[dict[str, str]] = []
        completed_methods = set()
        for key in ["generated", "cached"]:
            value = checkpoint.get(key)
            if isinstance(value, list):
                completed_methods.update(str(item) for item in value)
        scope_docs = documents if resolved_scope == "global" else [selected]
        for method in requested_methods:
            visual_cache_path = _visualization_cache_path(source_id, signature, resolved_scope, visual_doc_key, method, requested_topics)
            if method in completed_methods and _read_visualization_cache(visual_cache_path) is not None:
                cached.append(method)
                continue
            checkpoint.update({
                "status": "running",
                "sourceId": source_id,
                "signature": signature,
                "documentId": visual_doc_key,
                "scope": resolved_scope,
                "topicCount": requested_topics,
                "requested": requested_methods,
                "generated": generated,
                "cached": cached,
                "errors": errors,
                "currentMethod": method,
            })
            _json_cache_write(checkpoint_path, checkpoint)
            if _read_visualization_cache(visual_cache_path) is not None:
                cached.append(method)
                completed_methods.add(method)
                checkpoint["cached"] = cached
                checkpoint["currentMethod"] = ""
                _json_cache_write(checkpoint_path, checkpoint)
                continue
            try:
                use_spacy, use_embeddings = _feature_requirements_for_method(method)
                if _ensure_document_features(documents, use_spacy=use_spacy, use_embeddings=use_embeddings):
                    _write_analysis_cache(source_id, signature, documents)
                visualizations = _visualizations(
                    scope_docs,
                    documents,
                    resolved_scope,
                    corpus_title,
                    method_id=method,
                    topic_count=requested_topics,
                    source_id=source_id,
                    signature=signature,
                    document_key=visual_doc_key,
                )
                _write_visualization_cache(
                    visual_cache_path,
                    visualizations,
                    _visualization_cache_metadata(source_id, signature, resolved_scope, visual_doc_key, method, requested_topics),
                )
                generated.append(method)
                completed_methods.add(method)
                checkpoint["generated"] = generated
                checkpoint["currentMethod"] = ""
                _json_cache_write(checkpoint_path, checkpoint)
            except Exception as error:
                errors.append({"methodId": method, "error": f"{type(error).__name__}: {error}"})
                checkpoint["errors"] = errors
                checkpoint["currentMethod"] = ""
                _json_cache_write(checkpoint_path, checkpoint)
        status = "ready" if not errors else "partial"
        checkpoint["status"] = status
        checkpoint["currentMethod"] = ""
        _json_cache_write(checkpoint_path, checkpoint)
        return {
            "status": status,
            "sourceId": source_id,
            "signature": signature,
            "documentId": visual_doc_key,
            "scope": resolved_scope,
            "topicCount": requested_topics,
            "analysisCacheHit": analysis_cache_hit,
            "generated": generated,
            "cached": cached,
            "errors": errors,
            "totalMethods": len(requested_methods),
            "checkpoint": str(checkpoint_path),
        }
    finally:
        lock.release()
