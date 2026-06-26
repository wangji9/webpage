from __future__ import annotations

import os
import re
from pathlib import Path
from typing import Any
from collections import Counter
from functools import lru_cache

from backend.app.core.advanced_text_visualization import (
    advanced_text_visualization_payload,
    warm_advanced_text_visualization_cache,
    ACADEMIC_STYLE,
    PREPROCESSING_SUMMARY,
    TEXT_CLEANING_VERSION,
    VISUAL_METHODS,
    clean_text,
    decode_bytes,
    regex_tokens,
    split_paragraphs,
    _chunk_document,
    _summary_document,
    _selected_detail,
    _script_profile,
    _topic_for_term,
)


ROOT = Path(__file__).resolve().parents[3]
CORPUS_DIR = ROOT / "data" / "百部德译故事集"
YEAR_RE = re.compile(r"(18|19|20)\d{2}")


def _extended_path(path: Path) -> str:
    value = str(path.resolve())
    if os.name == "nt" and not value.startswith("\\\\?\\"):
        return "\\\\?\\" + value
    return value


def _iter_text_files() -> list[dict[str, Any]]:
    if not CORPUS_DIR.exists():
        return []
    rows: list[dict[str, Any]] = []
    with os.scandir(_extended_path(CORPUS_DIR)) as entries:
        for entry in entries:
            if not entry.is_file() or not entry.name.lower().endswith(".txt"):
                continue
            if entry.name.lower() in {"ocr_run.log"}:
                continue
            stat = entry.stat()
            rows.append({
                "name": entry.name,
                "path": entry.path,
                "mtime_ns": stat.st_mtime_ns,
                "size": stat.st_size,
            })
    return sorted(rows, key=lambda item: item["name"].lower())


def _read_text_file(path: str) -> tuple[str, str]:
    raw = Path(path).read_bytes()
    text, encoding = decode_bytes(raw)
    return clean_text(text), encoding


def _read_text_preview(path: str, limit: int = 16000) -> tuple[str, str]:
    with open(_extended_path(Path(path)), "rb") as handle:
        raw = handle.read(limit)
    text, encoding = decode_bytes(raw)
    return clean_text(text), encoding


def _stable_doc_id(filename: str) -> str:
    from backend.app.core.advanced_text_visualization import _stable_id

    return _stable_id(filename, "german-story")


def _infer_year(filename: str, text: str) -> int | None:
    match = YEAR_RE.search(filename)
    if match:
        return int(match.group(0))
    head = text[:3000]
    years = [int(item.group(0)) for item in YEAR_RE.finditer(head)]
    return min(years) if years else None


def _infer_author(filename: str, text: str) -> str:
    haystack = f"{filename}\n{text[:3000]}".lower()
    known = [
        "Richard Wilhelm",
        "Josef Guter",
        "Dieter Schuh",
        "Adrian Baar",
        "Herbert Bräutigam",
        "Herbert Braeutigam",
        "Stovickova",
        "Eberhard",
        "Anna",
    ]
    for name in known:
        if name.lower() in haystack:
            return name
    return "未识别编译者"


def german_story_documents() -> list[dict[str, Any]]:
    documents: list[dict[str, Any]] = []
    for file_info in _iter_text_files():
        raw = Path(file_info["path"]).read_bytes()
        text, encoding = decode_bytes(raw)
        clean = clean_text(text)
        filename = file_info["name"]
        title = Path(filename).stem
        documents.append({
            "id": _stable_doc_id(filename),
            "title": title,
            "filename": filename,
            "source": filename,
            "text": clean,
            "encoding": encoding,
            "language": "German / Chinese",
            "year": _infer_year(filename, clean),
            "author": _infer_author(filename, clean),
            "metadata": {
                "sizeBytes": file_info["size"],
                "mtimeNs": file_info["mtime_ns"],
                "corpusDir": str(CORPUS_DIR),
            },
        })
    return documents


def _raw_to_advanced_document(raw: dict[str, Any], text: str, encoding: str | None = None) -> dict[str, Any]:
    filename = str(raw.get("filename") or raw.get("name") or raw.get("source") or "")
    title = str(raw.get("title") or Path(filename).stem or filename)
    clean = clean_text(text)
    return {
        "id": str(raw.get("id") or _stable_doc_id(filename)),
        "title": title,
        "filename": filename,
        "source": raw.get("source") or filename,
        "text": clean,
        "encoding": encoding or raw.get("encoding") or "utf-8",
        "language": raw.get("language") or "German / Chinese",
        "year": raw.get("year") or _infer_year(filename, clean),
        "author": raw.get("author") or _infer_author(filename, clean),
        "metadata": raw.get("metadata") or {},
    }


def _advanced_documents_for_scope(signature: str, document_id: str = "", scope: str = "single") -> list[dict[str, Any]]:
    rows = list(_raw_document_index(signature))
    if not rows:
        return []
    if scope == "global":
        selected_rows = rows
        limit_value = str(os.environ.get("GERMAN_STORY_GLOBAL_ADVANCED_DOCS", "all") or "all").strip().lower()
        if limit_value not in {"", "all", "full", "全部", "全量"}:
            try:
                limit = max(4, int(limit_value))
            except Exception:
                limit = len(rows)
            if len(rows) > limit:
                step = max(1, len(rows) // limit)
                selected_rows = rows[::step][:limit]
                if rows[-1] not in selected_rows:
                    selected_rows[-1] = rows[-1]
    else:
        selected = next((item for item in rows if item.get("id") == document_id), None) or rows[0]
        selected_rows = [selected]
    documents: list[dict[str, Any]] = []
    for raw in selected_rows:
        text, encoding = _read_text_file(str(raw.get("path") or ""))
        documents.append(_raw_to_advanced_document(raw, text, encoding))
    return documents


def _corpus_signature() -> str:
    rows = _iter_text_files()
    return "|".join([TEXT_CLEANING_VERSION, *[f"{item['name']}:{item['size']}:{item['mtime_ns']}" for item in rows]])


@lru_cache(maxsize=3)
def _raw_document_index(signature: str) -> tuple[dict[str, Any], ...]:
    rows: list[dict[str, Any]] = []
    for file_info in _iter_text_files():
        preview_text, encoding = _read_text_preview(file_info["path"])
        filename = file_info["name"]
        title = Path(filename).stem
        rows.append({
            "id": _stable_doc_id(filename),
            "title": title,
            "filename": filename,
            "source": filename,
            "path": file_info["path"],
            "previewText": preview_text,
            "encoding": encoding,
            "language": "German / Chinese",
            "year": _infer_year(filename, preview_text),
            "author": _infer_author(filename, preview_text),
            "metadata": {
                "sizeBytes": file_info["size"],
                "mtimeNs": file_info["mtime_ns"],
                "corpusDir": str(CORPUS_DIR),
            },
        })
    return tuple(rows)


@lru_cache(maxsize=12)
def _raw_document_text(signature: str, document_id: str) -> dict[str, Any] | None:
    rows = list(_raw_document_index(signature))
    item = next((row for row in rows if row["id"] == document_id), None) or (rows[0] if rows else None)
    if not item:
        return None
    text, encoding = _read_text_file(item["path"])
    ready = dict(item)
    ready["text"] = text
    ready["encoding"] = encoding
    ready["year"] = item.get("year") or _infer_year(item["filename"], text)
    ready["author"] = _infer_author(item["filename"], text)
    return ready


def _regex_sentences(text: str) -> list[str]:
    return [item.strip() for item in re.split(r"(?<=[。！？!?\.])\s+|\n+", text or "") if item.strip()]


def _term_context(sentences: list[str], term: str) -> str:
    lower = term.lower()
    for sentence in sentences:
        if lower in sentence.lower():
            return sentence[:260]
    return ""


def _document_summary(raw: dict[str, Any], index: int) -> dict[str, Any]:
    text = str(raw.get("text") or raw.get("content") or raw.get("previewText") or "")
    preview = text[:420]
    title = str(raw.get("title") or raw.get("name") or f"文档 {index + 1}").strip()
    doc_id = str(raw.get("id") or _stable_doc_id(str(raw.get("filename") or title)))
    paragraph_count = max(1, text.count("\n\n") + 1) if text else 0
    chunk_count = max(1, round(len(text) / 4500)) if text else 0
    return {
        "id": doc_id,
        "filename": raw.get("filename") or raw.get("source") or title,
        "title": title,
        "author": raw.get("author") or "未识别编译者",
        "translator": raw.get("translator") or "",
        "year": raw.get("year") or raw.get("publish_year"),
        "language": raw.get("language") or "German / Chinese",
        "encoding": raw.get("encoding") or "utf-8",
        "charCount": int((raw.get("metadata") or {}).get("sizeBytes") or len(text)),
        "paragraphCount": paragraph_count,
        "sentenceCount": max(1, round(paragraph_count * 1.8)) if text else 0,
        "tokenCount": 0,
        "chunkCount": chunk_count,
        "readingMinutes": max(1, round(int((raw.get("metadata") or {}).get("sizeBytes") or len(text)) / 1300)) if text else 0,
        "preview": preview,
        "topTopic": "",
        "topKeywords": [],
        "entities": [],
    }


def _light_document(raw: dict[str, Any], index: int) -> dict[str, Any]:
    text = clean_text(str(raw.get("text") or raw.get("content") or ""))
    title = str(raw.get("title") or raw.get("name") or f"文档 {index + 1}").strip()
    doc_id = str(raw.get("id") or _stable_doc_id(str(raw.get("filename") or title)))
    paragraphs = split_paragraphs(text)
    sentences = _regex_sentences(text)
    chunks = _chunk_document(doc_id, title, paragraphs)
    tokens = Counter(regex_tokens(text))
    top_keywords = [
        {
            "word": word,
            "count": int(count),
            "score": float(count),
            "topic": _topic_for_term(word),
            "example": _term_context(sentences, word),
        }
        for word, count in tokens.most_common(160)
    ]
    topic_counts: Counter[str] = Counter()
    for item in top_keywords[:100]:
        topic_counts[item["topic"]] += int(item["count"])
    return {
        "id": doc_id,
        "title": title,
        "filename": raw.get("filename") or raw.get("source") or title,
        "author": raw.get("author") or "未识别编译者",
        "translator": raw.get("translator") or "",
        "year": raw.get("year") or raw.get("publish_year"),
        "language": raw.get("language") or "German / Chinese",
        "encoding": raw.get("encoding") or "utf-8",
        "metadata": raw.get("metadata") or {},
        "charCount": len(text),
        "paragraphCount": len(paragraphs),
        "sentenceCount": len(sentences),
        "tokenCount": sum(tokens.values()),
        "chunkCount": len(chunks),
        "readingMinutes": max(1, round(len(text) / 1300)),
        "preview": text[:420],
        "fullText": text,
        "paragraphs": paragraphs,
        "sentences": sentences,
        "chunks": chunks,
        "tokenCounter": tokens,
        "topKeywords": top_keywords,
        "entities": [],
        "topicCounts": dict(topic_counts),
        "topTopic": topic_counts.most_common(1)[0][0] if topic_counts else "",
        "scriptProfile": _script_profile(text),
    }


@lru_cache(maxsize=8)
def _selected_light_document(signature: str, document_id: str) -> dict[str, Any] | None:
    raws = list(_raw_document_index(signature))
    raw = _raw_document_text(signature, document_id)
    if not raw:
        return None
    index = next((idx for idx, item in enumerate(raws) if item.get("id") == raw.get("id")), 0)
    return _light_document(raw, index)


def _global_light_analysis(documents: list[dict[str, Any]], selected: dict[str, Any] | None) -> dict[str, Any]:
    keywords = list((selected or {}).get("topKeywords") or [])[:120]
    return {
        "metrics": {
            "documentCount": len(documents),
            "visibleDocumentCount": len(documents),
            "charCount": sum(item["charCount"] for item in documents),
            "paragraphCount": sum(item["paragraphCount"] for item in documents),
            "sentenceCount": sum(item["sentenceCount"] for item in documents),
            "chunkCount": sum(item["chunkCount"] for item in documents),
            "entityCount": 0,
            "conceptCount": len(keywords),
        },
        "topKeywords": keywords,
        "entities": [],
        "topics": [{"topic": topic, "count": int(count)} for topic, count in Counter((selected or {}).get("topicCounts") or {}).most_common()],
    }


def german_story_reader_payload(document_id: str = "", query: str = "") -> dict[str, Any]:
    signature = _corpus_signature()
    raw_documents = list(_raw_document_index(signature))
    documents = [_document_summary(item, index) for index, item in enumerate(raw_documents)]
    q = query.strip().lower()
    filtered = [
        document for document in documents
        if not q
        or q in document["title"].lower()
        or q in str(document.get("filename") or "").lower()
        or q in document["preview"].lower()
        or q in str(document.get("fullText") or "").lower()[:200000]
    ]
    selected_id = document_id or ((filtered[0] if filtered else (documents[0] if documents else {})).get("id") or "")
    selected = _selected_light_document(signature, selected_id)
    analysis = _global_light_analysis(documents, selected)
    return {
        "sourceId": "stories-german-story-corpus",
        "corpusTitle": "百部德译故事集",
        "mode": "reader",
        "documents": [_summary_document(item) for item in filtered],
        "selectedDocument": _selected_detail(selected),
        "globalAnalysis": {
            **analysis,
            "metrics": {**analysis["metrics"], "visibleDocumentCount": len(filtered)},
        },
        "methods": VISUAL_METHODS,
        "preprocessing": PREPROCESSING_SUMMARY,
        "academicStyle": ACADEMIC_STYLE,
        "scope": "single",
        "query": query,
    }


def german_story_corpus_payload(document_id: str = "", scope: str = "single", query: str = "", method_id: str = "", topic_count: int = 18) -> dict[str, Any]:
    signature = _corpus_signature()
    raw_documents = _advanced_documents_for_scope(signature, document_id=document_id, scope=scope)
    return advanced_text_visualization_payload(
        raw_documents,
        source_id="stories-german-story-corpus",
        corpus_title="百部德译故事集",
        document_id=document_id,
        scope=scope,
        query=query,
        method_id=method_id,
        topic_count=topic_count,
    )


def warm_german_story_corpus_visuals(
    document_id: str = "",
    scope: str = "single",
    topic_count: int = 18,
    method_ids: list[str] | None = None,
    max_methods: int | None = None,
) -> dict[str, Any]:
    signature = _corpus_signature()
    resolved_scope = "global" if scope == "global" else "single"
    raw_documents = _advanced_documents_for_scope(signature, document_id=document_id, scope=resolved_scope)
    return warm_advanced_text_visualization_cache(
        raw_documents,
        source_id="stories-german-story-corpus",
        corpus_title="百部德译故事集",
        document_id=document_id,
        scope=resolved_scope,
        topic_count=topic_count,
        method_ids=method_ids,
        max_methods=max_methods,
    )
