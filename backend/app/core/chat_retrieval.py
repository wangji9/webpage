from __future__ import annotations

import re
from typing import Any

from backend.app.core.data import KNOWLEDGE_ITEMS, MAP_FLOWS
from backend.app.core.story_visuals import story_data


CHINESE_RE = re.compile(r"[\u4e00-\u9fff]+")
TOKEN_RE = re.compile(r"[a-z0-9][a-z0-9_\-\.]*|[\u4e00-\u9fff]+", re.I)
YEAR_RE = re.compile(r"(?:16|17|18|19|20)\d{2}")


def clean_text(value: Any) -> str:
    text = str(value or "")
    text = re.sub(r"\s+", " ", text.replace("\u3000", " ")).strip()
    return text


def clip(value: Any, limit: int = 520) -> str:
    text = clean_text(value)
    if len(text) <= limit:
        return text
    return f"{text[: limit - 1]}…"


def tokenise(text: Any) -> set[str]:
    tokens: set[str] = set()
    for raw in TOKEN_RE.findall(clean_text(text).lower()):
        token = raw.strip()
        if not token:
            continue
        tokens.add(token)
        if CHINESE_RE.fullmatch(token):
            if len(token) > 2:
                tokens.update(token[index : index + 2] for index in range(len(token) - 1))
            if len(token) > 3:
                tokens.update(token[index : index + 3] for index in range(len(token) - 2))
    return {token for token in tokens if len(token) >= 2}


def year_value(value: Any) -> int:
    if isinstance(value, int):
        return value
    matched = YEAR_RE.search(str(value or ""))
    return int(matched.group(0)) if matched else 0


def join_values(*values: Any) -> str:
    return " ".join(clean_text(value) for value in values if clean_text(value))


def compact_list(values: list[Any], limit: int = 6) -> str:
    unique: list[str] = []
    for value in values:
        text = clean_text(value)
        if text and text not in unique:
            unique.append(text)
    return "、".join(unique[:limit])


def story_collection_documents() -> list[dict[str, Any]]:
    data = story_data()
    child_by_id = {item.get("id"): item for item in data.get("childStories", [])}
    collection_by_name = {
        clean_text(item.get("name") or item.get("foreignTitle")): item
        for item in data.get("collections", [])
    }
    docs: list[dict[str, Any]] = []

    for item in data.get("collections", []):
        children = [child_by_id.get(child_id) for child_id in item.get("matchedChildIds", [])]
        children = [child for child in children if child]
        child_titles = compact_list([child.get("canonicalName") for child in children], 8)
        languages = compact_list([child.get("language") for child in children], 5)
        summary = item.get("prefaceIntro") or item.get("prefaceText") or child_titles
        relation_lines = [
            f"故事集 -> 子故事：{child_titles}" if child_titles else "",
            f"编译/序言作者 -> {item.get('editor') or item.get('prefaceAuthor')}",
            f"出版节点 -> {item.get('city')} / {item.get('country')} / {item.get('publisher')}",
            f"来源区域 -> {item.get('sourceRegion') or item.get('sourceProvince')}",
        ]
        docs.append({
            "id": item.get("id"),
            "sectionId": "stories",
            "resourceType": "故事集总表",
            "canonicalTitle": item.get("chineseTitle") or item.get("name"),
            "translatedTitle": item.get("foreignTitle") or item.get("name"),
            "year": year_value(item.get("year") or item.get("yearText")),
            "language": languages,
            "country": item.get("country"),
            "city": item.get("city"),
            "publisher": item.get("publisher"),
            "translator": item.get("editor") or item.get("prefaceAuthor"),
            "author": item.get("prefaceAuthor") or item.get("editor"),
            "summary": clip(summary, 900),
            "source": "storyCollections.json: collections",
            "sourceKind": "database",
            "bookName": item.get("name") or item.get("foreignTitle"),
            "collectionId": item.get("id"),
            "relations": [line for line in relation_lines if clean_text(line)],
            "searchText": join_values(
                item.get("name"),
                item.get("chineseTitle"),
                item.get("foreignTitle"),
                item.get("editor"),
                item.get("editorRole"),
                item.get("prefaceAuthor"),
                item.get("prefaceIntro"),
                item.get("prefaceText"),
                item.get("country"),
                item.get("publisher"),
                item.get("city"),
                item.get("sourceRegion"),
                item.get("sourceProvince"),
                child_titles,
                languages,
            ),
            "graphNodeIds": [f"story-collection:{item.get('id')}"],
        })

    for item in data.get("childStories", []):
        collection = collection_by_name.get(clean_text(item.get("bookName")))
        relation_lines = [
            f"子故事 -> 所属故事集：{item.get('bookName')}",
            f"故事名变体 -> {item.get('variantName')}",
            f"译者/编者 -> {item.get('translator') or item.get('editor')}",
            f"出版节点 -> {item.get('place') or collection.get('city') if collection else item.get('place')} / {item.get('country') or item.get('nationality')}",
        ]
        docs.append({
            "id": item.get("id"),
            "sectionId": "stories",
            "resourceType": "子故事条目",
            "canonicalTitle": item.get("canonicalName") or item.get("variantName"),
            "translatedTitle": item.get("variantName") or item.get("canonicalName"),
            "year": year_value(item.get("year") or item.get("yearText")),
            "language": item.get("language"),
            "country": item.get("country") or item.get("nationality"),
            "city": item.get("place") or (collection or {}).get("city", ""),
            "publisher": item.get("publisher") or (collection or {}).get("publisher", ""),
            "translator": item.get("translator") or item.get("editor"),
            "author": item.get("creator"),
            "summary": clip(join_values(item.get("notes"), item.get("versionNote"), item.get("reference"), item.get("subtitle")), 700),
            "source": "storyCollections.json: childStories",
            "sourceKind": "database",
            "bookName": item.get("bookName"),
            "collectionId": (collection or {}).get("id", ""),
            "relations": [line for line in relation_lines if clean_text(line)],
            "searchText": join_values(
                item.get("canonicalName"),
                item.get("variantName"),
                item.get("ethnicity"),
                item.get("storyType"),
                item.get("creator"),
                item.get("translator"),
                item.get("reference"),
                item.get("language"),
                item.get("translationMode"),
                item.get("carrier"),
                item.get("bookName"),
                item.get("subtitle"),
                item.get("journalIssue"),
                item.get("editor"),
                item.get("country"),
                item.get("place"),
                item.get("publisher"),
                item.get("version"),
                item.get("versionNote"),
                item.get("notes"),
            ),
            "graphNodeIds": [f"story-child:{item.get('id')}", f"story-collection:{(collection or {}).get('id', '')}"],
        })

    for item in data.get("prefaces", []):
        docs.append({
            "id": item.get("id"),
            "sectionId": "stories",
            "resourceType": "序言/前言文本",
            "canonicalTitle": f"序言：{item.get('collectionTitle')}",
            "translatedTitle": item.get("collectionTitle"),
            "year": year_value(item.get("year") or item.get("yearText")),
            "language": "中文译文",
            "country": "",
            "city": "",
            "publisher": "",
            "translator": item.get("author"),
            "author": item.get("author"),
            "summary": clip(join_values(item.get("intro"), item.get("text")), 900),
            "source": "storyCollections.json: prefaces",
            "sourceKind": "database",
            "bookName": item.get("collectionTitle"),
            "collectionId": item.get("collectionId"),
            "relations": [
                f"序言作者 -> {item.get('author')}",
                f"序言 -> 故事集：{item.get('collectionTitle')}",
            ],
            "searchText": join_values(item.get("collectionTitle"), item.get("author"), item.get("type"), item.get("intro"), item.get("text")),
            "graphNodeIds": [f"story-preface:{item.get('id')}", f"story-collection:{item.get('collectionId')}"],
        })

    for item in data.get("wilhelmStories", []):
        docs.append(wilhelm_story_doc(item, source="storyCollections.json: wilhelmStories", source_kind="database"))

    for item in data.get("wilhelmEditions", []):
        docs.append(wilhelm_edition_doc(item, source="storyCollections.json: wilhelmEditions", source_kind="database"))

    return docs


def wilhelm_story_doc(item: dict[str, Any], source: str, source_kind: str) -> dict[str, Any]:
    title = item.get("title") or item.get("canonicalTitle")
    relation_lines = [
        f"卫礼贤单篇故事 -> 分类：{item.get('category')}",
        f"故事来源 -> {item.get('source')}",
    ]
    return {
        "id": item.get("id") or f"wilhelm-story-local-{abs(hash(str(item))) % 100000}",
        "sectionId": "stories",
        "resourceType": "卫礼贤单篇译文",
        "canonicalTitle": title,
        "translatedTitle": title,
        "year": year_value(item.get("year") or item.get("yearText") or 1914),
        "language": "中文译文",
        "country": "Germany",
        "city": "Jena",
        "publisher": "",
        "translator": "Richard Wilhelm（卫礼贤）",
        "author": item.get("source"),
        "summary": clip(item.get("text"), 900),
        "source": source,
        "sourceKind": source_kind,
        "bookName": "Chinesische Volksmärchen",
        "collectionId": "wilhelm-total",
        "relations": [line for line in relation_lines if clean_text(line)],
        "searchText": join_values(title, item.get("source"), item.get("category"), item.get("text"), "Richard Wilhelm 卫礼贤 中国民间童话 Chinesische Volksmärchen"),
        "graphNodeIds": [f"wilhelm-story:{item.get('id') or title}"],
    }


def wilhelm_edition_doc(item: dict[str, Any], source: str, source_kind: str) -> dict[str, Any]:
    title = item.get("title") or item.get("foreignTitle") or "卫礼贤《中国民间童话》"
    relation_lines = [
        f"再版/传播 -> {item.get('edition')}",
        f"译者/编者 -> {item.get('translator')}",
        f"出版节点 -> {item.get('city')} / {item.get('country')} / {item.get('publisher')}",
        f"来源地区 -> {item.get('province')}",
    ]
    return {
        "id": item.get("id") or f"wilhelm-upload-{abs(hash(str(item))) % 100000}",
        "sectionId": "stories",
        "resourceType": "卫礼贤再版传播记录",
        "canonicalTitle": title,
        "translatedTitle": item.get("foreignTitle") or title,
        "year": year_value(item.get("year") or item.get("yearText")),
        "language": item.get("language"),
        "country": item.get("country"),
        "city": item.get("city"),
        "publisher": item.get("publisher"),
        "translator": item.get("translator"),
        "author": item.get("translator"),
        "summary": clip(join_values(item.get("edition"), item.get("note"), item.get("source")), 650),
        "source": source,
        "sourceKind": source_kind,
        "bookName": "Chinesische Volksmärchen",
        "collectionId": "wilhelm-total",
        "relations": [line for line in relation_lines if clean_text(line)],
        "searchText": join_values(
            title,
            item.get("foreignTitle"),
            item.get("yearText"),
            item.get("edition"),
            item.get("translator"),
            item.get("publisher"),
            item.get("city"),
            item.get("country"),
            item.get("province"),
            item.get("language"),
            item.get("note"),
            item.get("source"),
            "Richard Wilhelm 卫礼贤 中国民间童话 Chinesische Volksmärchen",
        ),
        "graphNodeIds": [f"wilhelm-edition:{item.get('id') or title}"],
    }


def local_graph_docs(local_graphs: dict[str, Any]) -> list[dict[str, Any]]:
    docs: list[dict[str, Any]] = []
    for scope_id, graph in (local_graphs or {}).items():
        if not isinstance(graph, dict):
            continue
        nodes = graph.get("nodes") or []
        edges = graph.get("edges") or graph.get("triples") or []
        node_labels = compact_list([node.get("label") or node.get("name") for node in nodes if isinstance(node, dict)], 30)
        edge_labels = []
        for edge in edges:
            if not isinstance(edge, dict):
                continue
            source = edge.get("source") or edge.get("subject")
            relation = edge.get("relation") or edge.get("predicate")
            target = edge.get("target") or edge.get("object")
            edge_labels.append(" - ".join(clean_text(part) for part in [source, relation, target] if clean_text(part)))
        docs.append({
            "id": f"local-graph-{scope_id}",
            "sectionId": "stories",
            "resourceType": "本地知识图谱",
            "canonicalTitle": graph.get("title") or scope_id,
            "translatedTitle": graph.get("title") or scope_id,
            "year": 0,
            "language": "图谱",
            "country": "",
            "city": "",
            "publisher": "",
            "translator": "",
            "author": "",
            "summary": clip(join_values(node_labels, compact_list(edge_labels, 40), graph.get("notice")), 900),
            "source": "浏览器本地保存: wilhelm-llm-knowledge-graphs",
            "sourceKind": "local",
            "bookName": "Chinesische Volksmärchen",
            "collectionId": str(scope_id),
            "relations": edge_labels[:18],
            "searchText": join_values(graph.get("title"), node_labels, " ".join(edge_labels), graph.get("notice")),
            "graphNodeIds": [f"local-graph:{scope_id}"],
        })
    return docs


def story_documents(payload: Any) -> list[dict[str, Any]]:
    docs = [dict(item) for item in story_collection_documents()]
    for item in getattr(payload, "localRecords", []) or []:
        if isinstance(item, dict):
            docs.append(wilhelm_edition_doc(item, source=f"浏览器本地上传: {item.get('source') or 'wilhelm-folktales'}", source_kind="local"))
    for story_id, draft in (getattr(payload, "localStoryDrafts", {}) or {}).items():
        if isinstance(draft, dict):
            docs.append(wilhelm_story_doc({**draft, "id": story_id}, source="浏览器本地保存: wilhelm-story-drafts", source_kind="local"))
    docs.extend(local_graph_docs(getattr(payload, "localGraphs", {}) or {}))
    return docs


def legacy_documents(section_id: str) -> list[dict[str, Any]]:
    docs: list[dict[str, Any]] = []
    for item in KNOWLEDGE_ITEMS:
        if item.get("sectionId") != section_id:
            continue
        docs.append({
            **item,
            "source": "backend.app.core.data.KNOWLEDGE_ITEMS",
            "sourceKind": "legacy",
            "relations": [
                f"译者/作者 -> {item.get('translator') or item.get('author')}",
                f"出版节点 -> {item.get('city')} / {item.get('country')} / {item.get('publisher')}",
            ],
            "searchText": join_values(
                item.get("canonicalTitle"),
                item.get("translatedTitle"),
                item.get("author"),
                item.get("translator"),
                item.get("language"),
                item.get("country"),
                item.get("city"),
                item.get("publisher"),
                item.get("year"),
                item.get("summary"),
                " ".join(item.get("tags", [])),
                " ".join(item.get("evidence", [])),
            ),
        })
    return docs


def score_document(doc: dict[str, Any], question: str, terms: set[str], mode: str, record_id: str = "") -> float:
    if record_id and doc.get("id") == record_id:
        return 10000
    if not terms:
        return 1

    text = clean_text(doc.get("searchText") or doc.get("summary")).lower()
    title_text = join_values(doc.get("canonicalTitle"), doc.get("translatedTitle")).lower()
    score = 0.0
    for term in terms:
        if term in title_text:
            score += 8.0
        if term in text:
            score += 2.0 + min(4, text.count(term))
    for year in YEAR_RE.findall(question):
        if year and year == str(doc.get("year") or ""):
            score += 9.0
        elif year and year in clean_text(doc.get("searchText")):
            score += 4.0
    if clean_text(doc.get("sourceKind")) == "local":
        score += 1.75
    if mode == "graph-rag" and doc.get("relations"):
        score += 1.25
    return score


def graph_expand(selected: list[dict[str, Any]], all_docs: list[dict[str, Any]], limit: int) -> list[dict[str, Any]]:
    if len(selected) >= limit:
        return selected[:limit]

    keys: set[tuple[str, str]] = set()
    for doc in selected:
        for field in ["bookName", "collectionId", "translator", "city", "country", "language"]:
            value = clean_text(doc.get(field))
            if value:
                keys.add((field, value))

    expanded = list(selected)
    seen = {doc.get("id") for doc in expanded}
    for doc in all_docs:
        if doc.get("id") in seen:
            continue
        for field, value in keys:
            if clean_text(doc.get(field)) == value:
                expanded.append(doc)
                seen.add(doc.get("id"))
                break
        if len(expanded) >= limit:
            break
    return expanded


def rank_documents(docs: list[dict[str, Any]], question: str, mode: str, record_id: str, limit: int) -> list[dict[str, Any]]:
    terms = tokenise(question)
    scored = [(score_document(doc, question, terms, mode, record_id), doc) for doc in docs]
    scored.sort(key=lambda pair: (pair[0], pair[1].get("year") or 0), reverse=True)
    selected = [doc for score, doc in scored if score > 0][:limit]
    if not selected:
        selected = docs[:limit]
    if mode == "graph-rag":
        selected = graph_expand(selected, docs, limit)
    return selected[:limit]


def as_item(doc: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": doc.get("id"),
        "status": "已检索",
        "sectionId": doc.get("sectionId", "stories"),
        "resourceType": doc.get("resourceType", "资料条目"),
        "canonicalTitle": doc.get("canonicalTitle") or doc.get("translatedTitle") or "未命名条目",
        "translatedTitle": doc.get("translatedTitle") or doc.get("canonicalTitle") or "未命名条目",
        "author": doc.get("author") or "",
        "translator": doc.get("translator") or "",
        "language": doc.get("language") or "",
        "country": doc.get("country") or "",
        "city": doc.get("city") or "",
        "publisher": doc.get("publisher") or "",
        "year": doc.get("year") or 0,
        "summary": doc.get("summary") or "",
        "source": doc.get("source") or "",
        "sourceKind": doc.get("sourceKind") or "",
        "relations": doc.get("relations") or [],
        "graphNodeIds": [node_id for node_id in doc.get("graphNodeIds", []) if node_id],
    }


def context_line(item: dict[str, Any], mode: str, index: int) -> str:
    meta = "，".join(part for part in [
        str(item.get("year") or "") if item.get("year") else "",
        clean_text(item.get("language")),
        clean_text(item.get("city")),
        clean_text(item.get("country")),
        clean_text(item.get("publisher")),
    ] if part)
    creator = item.get("translator") or item.get("author") or "未记录"
    line = (
        f"[{index}] {item.get('resourceType')}｜{item.get('canonicalTitle')} / {item.get('translatedTitle')}"
        f"｜{meta or '元数据未完整记录'}｜译者/作者：{creator}"
        f"｜数据来源：{item.get('source') or '未记录'}｜摘要：{clip(item.get('summary'), 620)}"
    )
    if mode == "graph-rag" and item.get("relations"):
        line += f"\n    图谱关系：{'；'.join(item.get('relations', [])[:6])}"
    return line


def matching_flows(items: list[dict[str, Any]]) -> list[dict[str, Any]]:
    item_ids = {item.get("id") for item in items}
    data = story_data()
    flows = [flow for flow in data.get("flows", []) if flow.get("id") in item_ids]
    flows.extend(flow for flow in MAP_FLOWS if flow.get("id") in item_ids)
    return flows[:24]


def retrieve_chat_context(payload: Any, section: dict[str, Any], limit: int = 8) -> dict[str, Any]:
    section_id = section.get("id", "stories")
    docs = story_documents(payload) if section_id == "stories" else legacy_documents(section_id)
    selected_docs = rank_documents(docs, payload.question or "", payload.retrievalMode, payload.recordId, limit)
    items = [as_item(doc) for doc in selected_docs]
    database_name = (
        "多语种中国故事集真实库（storyCollections.json + 浏览器本地上传/保存数据）"
        if section_id == "stories"
        else f"{section.get('title', section_id)}（平台条目库）"
    )
    return {
        "items": items,
        "context_lines": [context_line(item, payload.retrievalMode, index + 1) for index, item in enumerate(items)],
        "citations": [
            f"{item.get('resourceType')}｜{item.get('canonicalTitle')}｜{item.get('source')}"
            for item in items
        ],
        "database": database_name,
        "flows": matching_flows(items) if section_id == "stories" else [flow for flow in MAP_FLOWS if flow.get("id") in {item.get("id") for item in items}],
        "evidence": [f"{item.get('canonicalTitle')} / {item.get('translatedTitle')}" for item in items],
    }
