from __future__ import annotations

import difflib
import html
import math
import re
import unicodedata
from collections import Counter, defaultdict
from functools import lru_cache
from pathlib import Path
from typing import Any

from backend.app.core.german_story_corpus import (
    _corpus_signature as german_corpus_signature,
    _raw_document_index as german_raw_document_index,
    _raw_document_text as german_raw_document_text,
    split_paragraphs,
)
from backend.app.core import platform_store


TOKEN_RE = re.compile(r"[\u4e00-\u9fff]{2,8}|[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'\-]{2,}")
SEARCH_CACHE_VERSION = "academic-search-v1"


def _clean_query(value: str) -> str:
    return unicodedata.normalize("NFKC", str(value or "")).strip()


def _norm(value: Any) -> str:
    return unicodedata.normalize("NFKC", str(value or "")).casefold()


def _tokens(value: str) -> list[str]:
    return [item.casefold() for item in TOKEN_RE.findall(unicodedata.normalize("NFKC", value or "")) if len(item.strip()) >= 2]


def _sentences(text: str) -> list[str]:
    return [item.strip() for item in re.split(r"(?<=[。！？!?\.])\s+|\n+", text or "") if item.strip()]


def _record_field(record: dict[str, Any], field: str) -> Any:
    try:
        return platform_store._record_field(record, field)  # type: ignore[attr-defined]
    except Exception:
        system = record.get("system") or {}
        raw = record.get("raw") or {}
        return record.get(field) or system.get(field) or raw.get(field) or ""


def _platform_record_text(record: dict[str, Any]) -> str:
    fields = ["title", "author", "translator", "publisher", "country", "city", "theme", "content", "preface", "notes", "source"]
    return "\n".join(str(_record_field(record, field) or "") for field in fields if _record_field(record, field))


def _fingerprint_documents(documents: list[dict[str, Any]], source_id: str) -> str:
    rows = [
        [
            item.get("id"),
            item.get("title"),
            item.get("charCount") or len(str(item.get("text") or "")),
            item.get("mtimeNs") or item.get("updatedAt") or "",
        ]
        for item in documents
    ]
    import hashlib
    import json

    return hashlib.sha1(json.dumps([SEARCH_CACHE_VERSION, source_id, rows], ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()[:20]


def _make_doc(
    *,
    source_id: str,
    source_label: str,
    document_id: str,
    title: str,
    text: str,
    filename: str = "",
    submodule_id: str = "",
    dataset_id: str = "",
    record_id: str = "",
    metadata: dict[str, Any] | None = None,
) -> dict[str, Any]:
    clean_text = str(text or "")
    return {
        "sourceId": source_id,
        "sourceLabel": source_label,
        "documentId": str(document_id),
        "title": str(title or filename or document_id or "未命名文档"),
        "filename": filename,
        "submoduleId": str(submodule_id or ""),
        "datasetId": str(dataset_id or ""),
        "recordId": str(record_id or ""),
        "text": clean_text,
        "charCount": len(clean_text),
        "mtimeNs": (metadata or {}).get("mtimeNs") or "",
        "metadata": metadata or {},
    }


def german_search_documents() -> list[dict[str, Any]]:
    signature = german_corpus_signature()
    documents: list[dict[str, Any]] = []
    for row in german_raw_document_index(signature):
        raw = german_raw_document_text(signature, str(row.get("id") or ""))
        if not raw:
            continue
        metadata = raw.get("metadata") or {}
        documents.append(
            _make_doc(
                source_id="stories-german-story-corpus",
                source_label="百部德译故事集",
                document_id=str(raw.get("id") or row.get("id") or ""),
                title=str(raw.get("title") or row.get("title") or Path(str(raw.get("filename") or "")).stem),
                filename=str(raw.get("filename") or ""),
                text=str(raw.get("text") or ""),
                metadata=metadata,
            )
        )
    return documents


def platform_search_documents(submodule_id: str = "", filters: Any = None) -> list[dict[str, Any]]:
    records = platform_store.load_store().get("records", [])
    if submodule_id:
        records = platform_store._records_for_submodule(submodule_id)  # type: ignore[attr-defined]
    records = platform_store.apply_filters(records, filters)
    documents: list[dict[str, Any]] = []
    for record in records:
        text = _platform_record_text(record)
        if not text.strip():
            continue
        dataset = record.get("dataset") or {}
        sub_id = str(record.get("subModuleId") or record.get("sub_module_id") or record.get("submodule_id") or dataset.get("subModuleId") or submodule_id or "")
        title = str(_record_field(record, "title") or dataset.get("name") or dataset.get("file_name") or f"记录 {record.get('id')}")
        documents.append(
            _make_doc(
                source_id="platform-corpus",
                source_label="平台文档解析工作台",
                document_id=f"platform:{record.get('id')}",
                title=title,
                filename=str(dataset.get("file_name") or _record_field(record, "source") or ""),
                text=text,
                submodule_id=sub_id,
                dataset_id=str(record.get("dataset_id") or dataset.get("id") or ""),
                record_id=str(record.get("id") or ""),
                metadata={
                    "module": sub_id,
                    "publishYear": _record_field(record, "publish_year") or "",
                    "author": _record_field(record, "author") or "",
                    "translator": _record_field(record, "translator") or "",
                },
            )
        )
    return documents


def corpus_documents(source: str = "all", submodule_id: str = "", filters: Any = None) -> list[dict[str, Any]]:
    source_key = str(source or "all")
    documents: list[dict[str, Any]] = []
    if source_key in {"all", "german", "stories-german-story-corpus"}:
        documents.extend(german_search_documents())
    if source_key in {"all", "platform", "submodule"}:
        documents.extend(platform_search_documents(submodule_id=submodule_id, filters=filters))
    return documents


def _chunk_document(document: dict[str, Any]) -> list[dict[str, Any]]:
    paragraphs = split_paragraphs(document.get("text") or "")
    chunks: list[dict[str, Any]] = []
    buf: list[str] = []
    length = 0
    for paragraph in paragraphs or [document.get("text") or ""]:
        item = paragraph.strip()
        if not item:
            continue
        if buf and length + len(item) > 1400:
            content = "\n\n".join(buf)
            chunks.append({"content": content, "index": len(chunks) + 1, "tokenCounter": Counter(_tokens(content))})
            buf = []
            length = 0
        buf.append(item)
        length += len(item)
    if buf:
        content = "\n\n".join(buf)
        chunks.append({"content": content, "index": len(chunks) + 1, "tokenCounter": Counter(_tokens(content))})
    return chunks


@lru_cache(maxsize=6)
def _indexed_documents(source: str, submodule_id: str, signature: str) -> tuple[dict[str, Any], ...]:
    del signature
    raw_docs = corpus_documents(source=source, submodule_id=submodule_id)
    document_frequency: Counter[str] = Counter()
    prepared: list[dict[str, Any]] = []
    for document in raw_docs:
        chunks = _chunk_document(document)
        token_counter = Counter()
        for chunk in chunks:
            token_counter.update(chunk["tokenCounter"])
        document_frequency.update(set(token_counter))
        prepared.append({**document, "chunks": chunks, "tokenCounter": token_counter})
    total_docs = max(1, len(prepared))
    for document in prepared:
        weights = {}
        for token, count in (document.get("tokenCounter") or {}).items():
            idf = math.log((total_docs + 1) / (document_frequency[token] + 1)) + 1
            weights[token] = round((1 + math.log(count)) * idf, 4)
        document["weights"] = weights
    return tuple(prepared)


def _source_signature(source: str, submodule_id: str, filters: Any = None) -> str:
    import hashlib
    import json

    if source in {"german", "stories-german-story-corpus"}:
        return german_corpus_signature()
    if source == "all":
        records = platform_store.load_store().get("records", [])
        rows = [
            [record.get("id"), record.get("dataset_id"), record.get("subModuleId") or record.get("sub_module_id"), record.get("updated_at") or ""]
            for record in records
        ]
        payload = ["all", german_corpus_signature(), rows]
        return hashlib.sha1(json.dumps(payload, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()[:20]
    records = platform_store._records_for_submodule(submodule_id) if submodule_id else platform_store.load_store().get("records", [])  # type: ignore[attr-defined]
    if filters:
        records = platform_store.apply_filters(records, filters)
    rows = [
        [record.get("id"), record.get("dataset_id"), record.get("subModuleId") or record.get("sub_module_id"), len(_platform_record_text(record))]
        for record in records
    ]
    return hashlib.sha1(json.dumps([source, submodule_id, rows], ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()[:20]


def _term_positions(text: str, terms: list[str], fuzzy: bool = False) -> list[tuple[int, int, str]]:
    value = text or ""
    lower = _norm(value)
    positions: list[tuple[int, int, str]] = []
    for term in terms:
        needle = _norm(term)
        if not needle:
            continue
        start = 0
        while True:
            index = lower.find(needle, start)
            if index < 0:
                break
            positions.append((index, index + len(term), term))
            start = index + max(1, len(needle))
    if fuzzy and not positions:
        words = _tokens(value)
        for term in terms:
            choices = difflib.get_close_matches(_norm(term), words, n=3, cutoff=0.78)
            for choice in choices:
                index = lower.find(choice)
                if index >= 0:
                    positions.append((index, index + len(choice), choice))
    return sorted(positions, key=lambda item: item[0])


def _snippet_segments(text: str, positions: list[tuple[int, int, str]], radius: int = 110) -> list[dict[str, Any]]:
    if not positions:
        return [{"text": (text or "")[: min(260, len(text or ""))], "hit": False}]
    start = max(0, positions[0][0] - radius)
    end = min(len(text), positions[0][1] + radius)
    local_positions = [(max(start, left), min(end, right), term) for left, right, term in positions if right >= start and left <= end]
    segments: list[dict[str, Any]] = []
    cursor = start
    if start > 0:
        segments.append({"text": "...", "hit": False})
    for left, right, term in local_positions[:8]:
        if left > cursor:
            segments.append({"text": text[cursor:left], "hit": False})
        segments.append({"text": text[left:right], "hit": True, "term": term})
        cursor = max(cursor, right)
    if cursor < end:
        segments.append({"text": text[cursor:end], "hit": False})
    if end < len(text):
        segments.append({"text": "...", "hit": False})
    return segments


def _snippet_html(segments: list[dict[str, Any]]) -> str:
    parts = []
    for segment in segments:
        value = html.escape(str(segment.get("text") or ""))
        parts.append(f"<mark>{value}</mark>" if segment.get("hit") else value)
    return "".join(parts)


def _search_statistics(items: list[dict[str, Any]], query_terms: list[str]) -> dict[str, Any]:
    term_counter: Counter[str] = Counter()
    co_counter: Counter[tuple[str, str]] = Counter()
    doc_counter: Counter[str] = Counter()
    for item in items:
      doc_counter[item.get("title") or item.get("documentId") or "未命名文档"] += 1
      snippet_text = " ".join(str(segment.get("text") or "") for segment in item.get("snippetSegments") or [])
      terms = set(_tokens(snippet_text))
      terms.update(_norm(term) for term in (item.get("matchedTerms") or query_terms) if term)
      clean_terms = sorted(term for term in terms if term and len(term) >= 2)[:18]
      term_counter.update(clean_terms)
      for index, source in enumerate(clean_terms):
          for target in clean_terms[index + 1:]:
              co_counter[(source, target)] += 1
    return {
        "uniqueDocuments": len({item.get("documentId") or item.get("title") for item in items if item.get("documentId") or item.get("title")}),
        "topTerms": [{"term": term, "count": count} for term, count in term_counter.most_common(24)],
        "topDocuments": [{"title": title, "count": count} for title, count in doc_counter.most_common(12)],
        "cooccurrence": [
            {"source": source, "target": target, "count": count}
            for (source, target), count in co_counter.most_common(48)
        ],
    }


def _match_score(chunk: dict[str, Any], query_terms: list[str], mode: str) -> tuple[float, list[tuple[int, int, str]], list[str]]:
    text = str(chunk.get("content") or "")
    positions = _term_positions(text, query_terms, fuzzy=mode in {"fuzzy", "hybrid"})
    counter = chunk.get("tokenCounter") or Counter()
    matched_terms = []
    score = 0.0
    for term in query_terms:
        normalized = _norm(term)
        exact_count = _norm(text).count(normalized) if normalized else 0
        if exact_count:
            matched_terms.append(term)
            score += 8.0 * exact_count
        token_count = int(counter.get(normalized, 0))
        if token_count:
            matched_terms.append(term)
            score += 4.0 * token_count
    if mode in {"fuzzy", "hybrid"} and not score:
        chunk_tokens = list(counter.keys())
        for term in query_terms:
            close = difflib.get_close_matches(_norm(term), chunk_tokens, n=1, cutoff=0.72)
            if close:
                ratio = difflib.SequenceMatcher(None, _norm(term), close[0]).ratio()
                matched_terms.append(close[0])
                score += 3.0 * ratio
    if mode == "keyword" and not positions:
        score = 0.0
    return score, positions, sorted(set(matched_terms))


def academic_search(
    query: str,
    *,
    mode: str = "hybrid",
    source: str = "all",
    submodule_id: str = "",
    limit: int = 30,
    filters: Any = None,
) -> dict[str, Any]:
    clean_query = _clean_query(query)
    query_terms = _tokens(clean_query) or ([clean_query] if clean_query else [])
    source_key = str(source or "all")
    signature = _source_signature(source_key, submodule_id, filters)
    documents = list(_indexed_documents(source_key, submodule_id, signature))
    if filters and source_key in {"platform", "submodule"}:
        documents = corpus_documents(source=source_key, submodule_id=submodule_id, filters=filters)
        documents = [{**document, "chunks": _chunk_document(document), "tokenCounter": Counter(_tokens(document.get("text") or ""))} for document in documents]
    if not query_terms:
        return {
            "query": clean_query,
            "mode": mode,
            "source": source_key,
            "total": 0,
            "items": [],
            "facets": {"documents": len(documents), "sources": []},
            "message": "请输入关键词、概念或短语进行检索。",
        }

    candidates: list[dict[str, Any]] = []
    source_counts: Counter[str] = Counter()
    doc_counts: Counter[str] = Counter()
    for document in documents:
        best_items = []
        doc_score = 0.0
        for chunk in document.get("chunks") or []:
            score, positions, matched_terms = _match_score(chunk, query_terms, mode)
            if score <= 0:
                continue
            score += sum((document.get("weights") or {}).get(_norm(term), 0) for term in matched_terms)
            best_items.append((score, chunk, positions, matched_terms))
            doc_score += score
        if not best_items:
            continue
        best_items.sort(key=lambda item: item[0], reverse=True)
        for score, chunk, positions, matched_terms in best_items[:2]:
            segments = _snippet_segments(str(chunk.get("content") or ""), positions)
            candidates.append(
                {
                    "id": f"{document['documentId']}:{chunk.get('index')}",
                    "sourceId": document["sourceId"],
                    "sourceLabel": document["sourceLabel"],
                    "documentId": document["documentId"],
                    "recordId": document.get("recordId") or "",
                    "datasetId": document.get("datasetId") or "",
                    "submoduleId": document.get("submoduleId") or "",
                    "title": document["title"],
                    "filename": document.get("filename") or "",
                    "chunkIndex": chunk.get("index"),
                    "score": round(float(score), 4),
                    "documentScore": round(float(doc_score), 4),
                    "matchedTerms": matched_terms,
                    "snippetSegments": segments,
                    "snippet": _snippet_html(segments),
                    "contextBefore": "",
                    "contextAfter": "",
                    "metadata": document.get("metadata") or {},
                }
            )
            source_counts[document["sourceLabel"]] += 1
            doc_counts[document["title"]] += 1
        if len(candidates) > max(200, int(limit or 30) * 12):
            candidates.sort(key=lambda item: (item["score"], item["documentScore"]), reverse=True)
            candidates = candidates[: max(100, int(limit or 30) * 8)]
    candidates.sort(key=lambda item: (item["score"], item["documentScore"]), reverse=True)
    limited = candidates[: max(1, min(100, int(limit or 30)))]
    return {
        "query": clean_query,
        "terms": query_terms,
        "mode": mode,
        "source": source_key,
        "signature": signature,
        "total": len(candidates),
        "items": limited,
        "facets": {
            "documents": len(documents),
            "sources": [{"name": name, "count": count} for name, count in source_counts.most_common()],
            "topDocuments": [{"title": title, "count": count} for title, count in doc_counts.most_common(12)],
        },
        "statistics": _search_statistics(limited, query_terms),
        "methods": [
            {"id": "keyword", "name": "关键词检索", "description": "精确匹配关键词、短语与题名字段。"},
            {"id": "fuzzy", "name": "模糊检索", "description": "用近似字符串匹配处理拼写差异、OCR 差异与词形变化。"},
            {"id": "hybrid", "name": "混合检索", "description": "融合精确匹配、TF-IDF 权重、近似匹配与片段级排序。"},
        ],
    }
