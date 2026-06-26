from __future__ import annotations

import hashlib
import json
import math
import os
import re
import time
from collections import Counter
from pathlib import Path
from typing import Any

from backend.app.core.chat_retrieval import (
    as_item,
    clean_text,
    context_line,
    graph_expand,
    legacy_documents,
    matching_flows,
    rank_documents,
    story_documents,
)
from backend.app.core.data import KNOWLEDGE_SECTIONS


ROOT = Path(__file__).resolve().parents[3]
INDEX_PATH = ROOT / "backend" / "app" / "knowledge_indexes.json"
VECTOR_DIM = 128

SCOPE_LABELS = {
    "global": "总知识图谱",
    "classics": "中国典籍海外译介知识图谱",
    "shanghai": "上海文学海外传播知识图谱",
    "stories": "多语种中国故事集总知识图谱",
    "stories:wilhelm": "卫礼贤专题知识图谱",
    "world": "世界文学的中国叙事知识图谱",
}

TEXT_TYPE_LABELS = {
    "translation": "译文信息",
    "preface": "序跋信息",
    "pdf": "PDF解析文本",
    "upload": "上传文档文本",
    "ocr": "OCR识别文本",
    "record": "知识库条目文本",
}


def _now() -> int:
    return int(time.time())


def _section_title(section_id: str) -> str:
    section = next((item for item in KNOWLEDGE_SECTIONS if item.get("id") == section_id), None)
    return section.get("title") if section else section_id


def scope_name(scope_id: str) -> str:
    if scope_id in SCOPE_LABELS:
        return SCOPE_LABELS[scope_id]
    if scope_id.startswith("stories:collection:"):
        return f"故事集子图谱：{scope_id.rsplit(':', 1)[-1]}"
    return f"{_section_title(scope_id)}知识图谱"


def document_scope(doc: dict[str, Any]) -> str:
    section_id = clean_text(doc.get("sectionId")) or "global"
    if section_id == "stories":
        text = " ".join(
            clean_text(doc.get(key))
            for key in ["canonicalTitle", "translatedTitle", "bookName", "summary", "source"]
        )
        if any(token.lower() in text.lower() for token in ["卫礼贤", "wilhelm", "chinesische volksmärchen"]):
            return "stories:wilhelm"
        collection_id = clean_text(doc.get("collectionId"))
        if collection_id:
            return f"stories:collection:{collection_id}"
    return section_id


def text_kind(doc: dict[str, Any]) -> str:
    resource_type = clean_text(doc.get("resourceType"))
    source = clean_text(doc.get("source")).lower()
    if "序言" in resource_type or "前言" in resource_type or "序跋" in resource_type:
        return "preface"
    if "译文" in resource_type:
        return "translation"
    if source.endswith(".pdf") or "pdf" in source:
        return "pdf"
    if "ocr" in source:
        return "ocr"
    if clean_text(doc.get("sourceKind")) == "local":
        return "upload"
    return "record"


def stable_id(prefix: str, value: Any) -> str:
    digest = hashlib.sha1(json.dumps(value, ensure_ascii=False, sort_keys=True, default=str).encode("utf-8")).hexdigest()[:16]
    return f"{prefix}:{digest}"


def embedding(text: str, dim: int = VECTOR_DIM) -> list[float]:
    vector = [0.0] * dim
    tokens = re.findall(r"[a-z0-9][a-z0-9_\-\.]*|[\u4e00-\u9fff]{1,4}", clean_text(text).lower(), re.I)
    for token in tokens:
        digest = hashlib.sha256(token.encode("utf-8")).digest()
        slot = int.from_bytes(digest[:4], "big") % dim
        sign = -1.0 if digest[4] % 2 else 1.0
        vector[slot] += sign * (1.0 + min(len(token), 8) / 8)
    norm = math.sqrt(sum(value * value for value in vector)) or 1.0
    return [round(value / norm, 6) for value in vector]


def cosine(left: list[float], right: list[float]) -> float:
    if not left or not right:
        return 0.0
    return sum(a * b for a, b in zip(left, right))


def _node(nodes: dict[str, dict[str, Any]], node_id: str, label: str, node_type: str, **props: Any) -> str:
    label = clean_text(label)
    if not label:
        return ""
    if node_id not in nodes:
        nodes[node_id] = {"id": node_id, "label": label, "type": node_type, **{k: v for k, v in props.items() if v not in ("", None, [])}}
    else:
        nodes[node_id].update({k: v for k, v in props.items() if v not in ("", None, [])})
    return node_id


def _edge(edges: list[dict[str, Any]], source: str, target: str, relation: str, **props: Any) -> None:
    if not source or not target or source == target:
        return
    edges.append({"from": source, "to": target, "relation": relation, **{k: v for k, v in props.items() if v not in ("", None, [])}})


def triples_from_document(doc: dict[str, Any]) -> tuple[list[dict[str, Any]], list[dict[str, Any]]]:
    nodes: dict[str, dict[str, Any]] = {}
    edges: list[dict[str, Any]] = []
    title = clean_text(doc.get("canonicalTitle") or doc.get("translatedTitle") or doc.get("id"))
    if not title:
        return [], []

    doc_id = f"doc:{clean_text(doc.get('sectionId')) or 'global'}:{clean_text(doc.get('id')) or stable_id('row', title)}"
    _node(
        nodes,
        doc_id,
        title,
        clean_text(doc.get("resourceType")) or "资料条目",
        sectionId=doc.get("sectionId"),
        year=doc.get("year"),
        source=doc.get("source"),
        textKind=text_kind(doc),
    )

    section_id = clean_text(doc.get("sectionId")) or "global"
    section_node = _node(nodes, f"section:{section_id}", _section_title(section_id), "知识库分区")
    _edge(edges, doc_id, section_node, "属于分区")

    for field, relation, node_type in [
        ("translator", "译者/编者", "人物"),
        ("author", "作者/序跋作者", "人物"),
        ("publisher", "出版机构", "机构"),
        ("language", "语种", "语种"),
        ("country", "国家", "地点"),
        ("city", "城市", "地点"),
        ("bookName", "所属故事集", "故事集"),
    ]:
        value = clean_text(doc.get(field))
        if not value or value == "未记录":
            continue
        target = _node(nodes, stable_id(node_type, value), value, node_type)
        _edge(edges, doc_id, target, relation)

    collection_id = clean_text(doc.get("collectionId"))
    if collection_id:
        collection = _node(nodes, f"collection:{collection_id}", clean_text(doc.get("bookName")) or collection_id, "故事集")
        _edge(edges, doc_id, collection, "关联子图")

    for relation_line in doc.get("relations") or []:
        parts = [clean_text(part) for part in re.split(r"->|：|:", str(relation_line), maxsplit=1)]
        if len(parts) != 2 or not parts[0] or not parts[1]:
            continue
        relation_node = _node(nodes, stable_id("entity", parts[1]), parts[1], "实体")
        _edge(edges, doc_id, relation_node, parts[0])

    return list(nodes.values()), edges


def build_documents(payload: Any | None = None) -> list[dict[str, Any]]:
    docs: list[dict[str, Any]] = []
    sections = {item.get("id"): item for item in KNOWLEDGE_SECTIONS}
    for section_id in sections:
        if section_id == "stories":
            docs.extend(story_documents(payload or object()))
        else:
            docs.extend(legacy_documents(section_id))
    seen: set[str] = set()
    unique: list[dict[str, Any]] = []
    for doc in docs:
        key = f"{doc.get('sectionId')}::{doc.get('id')}::{doc.get('source')}"
        if key in seen:
            continue
        seen.add(key)
        unique.append(doc)
    return unique


def _read_index() -> dict[str, Any]:
    if not INDEX_PATH.exists():
        return {}
    try:
        return json.loads(INDEX_PATH.read_text(encoding="utf-8"))
    except Exception:
        return {}


def _write_index(index: dict[str, Any]) -> None:
    INDEX_PATH.write_text(json.dumps(index, ensure_ascii=False, indent=2), encoding="utf-8")


def _local_index_documents(docs: list[dict[str, Any]]) -> dict[str, Any]:
    scopes: dict[str, dict[str, Any]] = {}
    vector_docs: list[dict[str, Any]] = []
    all_nodes: dict[str, dict[str, Any]] = {}
    all_edges: list[dict[str, Any]] = []

    for doc in docs:
        scope_id = document_scope(doc)
        scope = scopes.setdefault(scope_id, {"id": scope_id, "name": scope_name(scope_id), "nodes": {}, "edges": []})
        nodes, edges = triples_from_document(doc)
        for node in nodes:
            scope["nodes"][node["id"]] = node
            all_nodes[node["id"]] = node
        scope["edges"].extend(edges)
        all_edges.extend(edges)

        text = " ".join(
            clean_text(value)
            for value in [
                doc.get("canonicalTitle"),
                doc.get("translatedTitle"),
                doc.get("summary"),
                "；".join(doc.get("relations") or []),
                doc.get("searchText"),
            ]
            if clean_text(value)
        )
        vector_docs.append(
            {
                "id": stable_id("vec", f"{doc.get('sectionId')}::{doc.get('id')}::{doc.get('source')}"),
                "docId": doc.get("id"),
                "scopeId": scope_id,
                "sectionId": doc.get("sectionId"),
                "textKind": text_kind(doc),
                "title": doc.get("canonicalTitle") or doc.get("translatedTitle"),
                "source": doc.get("source"),
                "text": text[:2400],
                "embedding": embedding(text),
                "item": as_item(doc),
            }
        )

    scopes["global"] = {
        "id": "global",
        "name": scope_name("global"),
        "nodes": all_nodes,
        "edges": all_edges,
    }

    serialised_scopes = []
    for scope in scopes.values():
        edges = []
        seen_edges: set[tuple[str, str, str]] = set()
        for edge in scope["edges"]:
            key = (edge.get("from"), edge.get("to"), edge.get("relation"))
            if key in seen_edges:
                continue
            seen_edges.add(key)
            edges.append(edge)
        serialised_scopes.append({**scope, "nodes": list(scope["nodes"].values()), "edges": edges})

    text_counts = Counter(doc["textKind"] for doc in vector_docs)
    return {
        "version": 1,
        "updatedAt": _now(),
        "backend": {"graph": graph_backend_status(), "vector": vector_backend_status()},
        "scopes": serialised_scopes,
        "vectors": vector_docs,
        "stats": {
            "documents": len(vector_docs),
            "scopes": len(serialised_scopes),
            "textKinds": dict(text_counts),
            "nodes": len(all_nodes),
            "edges": len({(edge.get("from"), edge.get("to"), edge.get("relation")) for edge in all_edges}),
        },
    }


def graph_backend_status() -> dict[str, Any]:
    return {
        "type": "neo4j",
        "configured": bool(os.getenv("NEO4J_URI")),
        "uri": os.getenv("NEO4J_URI", ""),
        "database": os.getenv("NEO4J_DATABASE", "neo4j"),
    }


def vector_backend_status() -> dict[str, Any]:
    return {
        "type": "milvus",
        "configured": bool(os.getenv("MILVUS_URI") or os.getenv("MILVUS_HOST")),
        "uri": os.getenv("MILVUS_URI", ""),
        "host": os.getenv("MILVUS_HOST", ""),
        "collection": os.getenv("MILVUS_COLLECTION", "china_narrative_text_vectors"),
        "dim": VECTOR_DIM,
    }


def _sync_neo4j(index: dict[str, Any]) -> dict[str, Any]:
    status = graph_backend_status()
    if not status["configured"]:
        return {"ok": False, "mode": "local", "message": "NEO4J_URI 未配置，已使用本地 JSON 图谱索引。"}
    try:
        from neo4j import GraphDatabase
    except Exception as error:
        return {"ok": False, "mode": "local", "message": f"neo4j Python driver 不可用：{error}"}

    auth = None
    user = os.getenv("NEO4J_USER")
    password = os.getenv("NEO4J_PASSWORD")
    if user or password:
        auth = (user or "neo4j", password or "")

    driver = GraphDatabase.driver(status["uri"], auth=auth)
    database = status["database"]
    try:
        with driver.session(database=database) as session:
            session.run("CREATE CONSTRAINT kg_scope_id IF NOT EXISTS FOR (n:KnowledgeScope) REQUIRE n.id IS UNIQUE")
            session.run("CREATE CONSTRAINT kg_entity_id IF NOT EXISTS FOR (n:KnowledgeEntity) REQUIRE n.id IS UNIQUE")
            for scope in index.get("scopes", []):
                session.run(
                    "MERGE (s:KnowledgeScope {id: $id}) SET s.name = $name, s.updatedAt = $updatedAt",
                    id=scope.get("id"),
                    name=scope.get("name"),
                    updatedAt=index.get("updatedAt"),
                )
                for node in scope.get("nodes", []):
                    session.run(
                        """
                        MERGE (n:KnowledgeEntity {id: $nodeId})
                        SET n.label = $label, n.type = $type, n.sectionId = $sectionId,
                            n.year = $year, n.source = $source, n.textKind = $textKind
                        WITH n
                        MATCH (s:KnowledgeScope {id: $scopeId})
                        MERGE (s)-[:HAS_ENTITY]->(n)
                        """,
                        scopeId=scope.get("id"),
                        nodeId=node.get("id"),
                        label=node.get("label"),
                        type=node.get("type"),
                        sectionId=node.get("sectionId"),
                        year=node.get("year"),
                        source=node.get("source"),
                        textKind=node.get("textKind"),
                    )
                for edge in scope.get("edges", []):
                    session.run(
                        """
                        MATCH (a:KnowledgeEntity {id: $source})
                        MATCH (b:KnowledgeEntity {id: $target})
                        MERGE (a)-[r:RELATED_TO {scopeId: $scopeId, relation: $relation}]->(b)
                        SET r.updatedAt = $updatedAt
                        """,
                        scopeId=scope.get("id"),
                        source=edge.get("from"),
                        target=edge.get("to"),
                        relation=edge.get("relation"),
                        updatedAt=index.get("updatedAt"),
                    )
    finally:
        driver.close()
    return {"ok": True, "mode": "neo4j", "message": "知识图谱已同步到 Neo4j。"}


def _sync_milvus(index: dict[str, Any]) -> dict[str, Any]:
    status = vector_backend_status()
    if not status["configured"]:
        return {"ok": False, "mode": "local", "message": "MILVUS_URI/MILVUS_HOST 未配置，已使用本地 JSON 向量索引。"}
    try:
        from pymilvus import Collection, CollectionSchema, DataType, FieldSchema, connections, utility
    except Exception as error:
        return {"ok": False, "mode": "local", "message": f"pymilvus 不可用：{error}"}

    alias = "default"
    if status["uri"]:
        connections.connect(alias=alias, uri=status["uri"])
    else:
        connections.connect(alias=alias, host=status["host"] or "127.0.0.1", port=os.getenv("MILVUS_PORT", "19530"))

    collection_name = status["collection"]
    fields = [
        FieldSchema(name="pk", dtype=DataType.VARCHAR, is_primary=True, max_length=80),
        FieldSchema(name="doc_id", dtype=DataType.VARCHAR, max_length=120),
        FieldSchema(name="scope_id", dtype=DataType.VARCHAR, max_length=160),
        FieldSchema(name="section_id", dtype=DataType.VARCHAR, max_length=80),
        FieldSchema(name="text_kind", dtype=DataType.VARCHAR, max_length=40),
        FieldSchema(name="title", dtype=DataType.VARCHAR, max_length=512),
        FieldSchema(name="source", dtype=DataType.VARCHAR, max_length=512),
        FieldSchema(name="text", dtype=DataType.VARCHAR, max_length=4096),
        FieldSchema(name="embedding", dtype=DataType.FLOAT_VECTOR, dim=VECTOR_DIM),
    ]
    if utility.has_collection(collection_name):
        collection = Collection(collection_name)
    else:
        schema = CollectionSchema(fields, description="China narrative platform text vectors")
        collection = Collection(collection_name, schema=schema)
        collection.create_index("embedding", {"index_type": "AUTOINDEX", "metric_type": "COSINE", "params": {}})

    rows = index.get("vectors", [])
    if rows:
        collection.upsert(
            [
                [row.get("id") for row in rows],
                [clean_text(row.get("docId")) for row in rows],
                [clean_text(row.get("scopeId")) for row in rows],
                [clean_text(row.get("sectionId")) for row in rows],
                [clean_text(row.get("textKind")) for row in rows],
                [clean_text(row.get("title"))[:512] for row in rows],
                [clean_text(row.get("source"))[:512] for row in rows],
                [clean_text(row.get("text"))[:4096] for row in rows],
                [row.get("embedding") for row in rows],
            ]
        )
        collection.flush()
    return {"ok": True, "mode": "milvus", "message": "文本向量已同步到 Milvus。"}


def rebuild_index(payload: Any | None = None, sync_external: bool = True) -> dict[str, Any]:
    docs = build_documents(payload)
    index = _local_index_documents(docs)
    graph_sync = _sync_neo4j(index) if sync_external else {"ok": False, "mode": "skipped", "message": "未请求外部图数据库同步。"}
    vector_sync = _sync_milvus(index) if sync_external else {"ok": False, "mode": "skipped", "message": "未请求外部向量数据库同步。"}
    index["backend"]["graph"]["sync"] = graph_sync
    index["backend"]["vector"]["sync"] = vector_sync
    _write_index(index)
    return index_summary(index)


def ensure_index(payload: Any | None = None) -> dict[str, Any]:
    index = _read_index()
    if not index.get("vectors") or not index.get("scopes"):
        rebuild_index(payload, sync_external=False)
        index = _read_index()
    return index


def index_summary(index: dict[str, Any] | None = None) -> dict[str, Any]:
    index = index or ensure_index()
    return {
        "updatedAt": index.get("updatedAt"),
        "stats": index.get("stats") or {},
        "graphBackend": index.get("backend", {}).get("graph") or graph_backend_status(),
        "vectorBackend": index.get("backend", {}).get("vector") or vector_backend_status(),
        "scopes": [
            {"id": scope.get("id"), "name": scope.get("name"), "nodes": len(scope.get("nodes") or []), "edges": len(scope.get("edges") or [])}
            for scope in index.get("scopes", [])
        ],
        "textKinds": TEXT_TYPE_LABELS,
    }


def graph_for_scope(scope_id: str = "global", query: str = "", limit: int = 80, payload: Any | None = None) -> dict[str, Any]:
    index = ensure_index(payload)
    scopes = {scope.get("id"): scope for scope in index.get("scopes", [])}
    scope = scopes.get(scope_id) or scopes.get("global") or {"id": scope_id, "name": scope_name(scope_id), "nodes": [], "edges": []}
    nodes = list(scope.get("nodes") or [])
    edges = list(scope.get("edges") or [])
    if query:
        terms = [term for term in re.findall(r"[\u4e00-\u9fff]{2,}|[a-z0-9][a-z0-9_\-\.]*", query.lower(), re.I) if len(term) >= 2]
        matched_ids = {
            node.get("id")
            for node in nodes
            if any(term in clean_text(node.get("label")).lower() or term in clean_text(node.get("source")).lower() for term in terms)
        }
        related_ids = set(matched_ids)
        for edge in edges:
            if edge.get("from") in matched_ids or edge.get("to") in matched_ids:
                related_ids.add(edge.get("from"))
                related_ids.add(edge.get("to"))
        if related_ids:
            nodes = [node for node in nodes if node.get("id") in related_ids]
            edges = [edge for edge in edges if edge.get("from") in related_ids and edge.get("to") in related_ids]
    node_ids = {node.get("id") for node in nodes[:limit]}
    return {
        "scope": {"id": scope.get("id"), "name": scope.get("name")},
        "nodes": nodes[:limit],
        "edges": [edge for edge in edges if edge.get("from") in node_ids and edge.get("to") in node_ids][: limit * 2],
    }


def search_index(
    *,
    question: str,
    section: dict[str, Any],
    retrieval_mode: str,
    record_id: str = "",
    payload: Any | None = None,
    limit: int = 8,
) -> dict[str, Any]:
    index = ensure_index(payload)
    section_id = section.get("id", "stories")
    scope_prefix = f"{section_id}:"
    candidates = [
        row for row in index.get("vectors", [])
        if row.get("sectionId") == section_id or row.get("scopeId") == section_id or str(row.get("scopeId") or "").startswith(scope_prefix)
    ]
    if not candidates:
        docs = story_documents(payload or object()) if section_id == "stories" else legacy_documents(section_id)
        selected_docs = rank_documents(docs, question, retrieval_mode, record_id, limit)
        items = [as_item(doc) for doc in selected_docs]
    else:
        q_emb = embedding(question)
        ranked = sorted(candidates, key=lambda row: cosine(q_emb, row.get("embedding") or []), reverse=True)
        rows = ranked[:limit]
        items = [row.get("item") for row in rows if isinstance(row.get("item"), dict)]
        if retrieval_mode == "graph-rag":
            all_items = [row.get("item") for row in candidates if isinstance(row.get("item"), dict)]
            items = graph_expand(items, all_items, limit)

    graph_scope = "global"
    if section_id == "stories":
        first_scope = next((row.get("scopeId") for row in candidates if row.get("item", {}).get("id") in {item.get("id") for item in items}), "")
        graph_scope = first_scope or "stories"
    else:
        graph_scope = section_id
    subgraph = graph_for_scope(graph_scope, question=question, limit=80, payload=payload)
    graph_node_ids = {node.get("id") for node in subgraph.get("nodes", [])}
    for item in items:
        item["graphNodeIds"] = list(dict.fromkeys([*(item.get("graphNodeIds") or []), *list(graph_node_ids)[:8]]))

    first_text_kind = next(
        (row.get("textKind") for row in candidates if row.get("item", {}).get("id") in {item.get("id") for item in items}),
        "",
    )
    return {
        "items": items,
        "context_lines": [context_line(item, retrieval_mode, index + 1) for index, item in enumerate(items)],
        "citations": [f"{item.get('resourceType')}｜{item.get('canonicalTitle')}｜{item.get('source')}" for item in items],
        "database": f"{scope_name(graph_scope)} + {TEXT_TYPE_LABELS.get(first_text_kind, '文本向量索引')}",
        "flows": matching_flows(items) if section_id == "stories" else [],
        "evidence": [f"{item.get('canonicalTitle')} / {item.get('translatedTitle')}" for item in items],
        "subgraph": subgraph,
        "index": index_summary(index),
    }


def extract_text_graph(text: str, *, scope_id: str = "upload", title: str = "上传文本", text_kind: str = "upload") -> dict[str, Any]:
    text = clean_text(text)
    doc = {
        "id": stable_id("extracted", f"{scope_id}:{title}:{text[:300]}"),
        "sectionId": scope_id.split(":", 1)[0] if ":" in scope_id else scope_id,
        "resourceType": TEXT_TYPE_LABELS.get(text_kind, "上传文本"),
        "canonicalTitle": title,
        "translatedTitle": title,
        "summary": text[:1200],
        "source": text_kind,
        "sourceKind": "local",
        "relations": [],
        "searchText": text,
    }
    keywords = Counter(re.findall(r"[\u4e00-\u9fff]{2,4}|[A-Za-z][A-Za-z\-]{2,}", text)).most_common(24)
    doc["relations"] = [f"文本关键词 -> {term}" for term, _ in keywords[:12]]
    nodes, edges = triples_from_document(doc)
    return {
        "scope": {"id": scope_id, "name": scope_name(scope_id)},
        "textKind": text_kind,
        "nodes": nodes,
        "edges": edges,
        "document": as_item(doc),
    }


def _merge_scope(index: dict[str, Any], scope_id: str, nodes: list[dict[str, Any]], edges: list[dict[str, Any]]) -> None:
    scopes = index.setdefault("scopes", [])
    scope = next((item for item in scopes if item.get("id") == scope_id), None)
    if not scope:
        scope = {"id": scope_id, "name": scope_name(scope_id), "nodes": [], "edges": []}
        scopes.append(scope)
    node_map = {node.get("id"): node for node in scope.get("nodes", [])}
    for node in nodes:
        node_map[node.get("id")] = {**node_map.get(node.get("id"), {}), **node}
    scope["nodes"] = list(node_map.values())
    seen_edges = {(edge.get("from"), edge.get("to"), edge.get("relation")) for edge in scope.get("edges", [])}
    merged_edges = list(scope.get("edges", []))
    for edge in edges:
        key = (edge.get("from"), edge.get("to"), edge.get("relation"))
        if key in seen_edges:
            continue
        seen_edges.add(key)
        merged_edges.append(edge)
    scope["edges"] = merged_edges


def ingest_text_graph(
    text: str,
    *,
    scope_id: str = "upload",
    title: str = "上传文本",
    text_kind: str = "upload",
    sync_external: bool = True,
) -> dict[str, Any]:
    extracted = extract_text_graph(text, scope_id=scope_id, title=title, text_kind=text_kind)
    index = ensure_index()
    document = extracted["document"]
    document["sourceKind"] = "local"
    document["source"] = TEXT_TYPE_LABELS.get(text_kind, text_kind)
    vector_text = " ".join(
        clean_text(value)
        for value in [title, text, "；".join(document.get("relations") or [])]
        if clean_text(value)
    )
    vector_row = {
        "id": stable_id("vec", f"{scope_id}:{title}:{vector_text[:300]}"),
        "docId": document.get("id"),
        "scopeId": scope_id,
        "sectionId": document.get("sectionId") or scope_id.split(":", 1)[0],
        "textKind": text_kind,
        "title": title,
        "source": document["source"],
        "text": vector_text[:2400],
        "embedding": embedding(vector_text),
        "item": document,
    }

    vectors = [row for row in index.get("vectors", []) if row.get("id") != vector_row["id"]]
    vectors.append(vector_row)
    index["vectors"] = vectors
    _merge_scope(index, scope_id, extracted["nodes"], extracted["edges"])
    _merge_scope(index, "global", extracted["nodes"], extracted["edges"])

    text_counts = Counter(row.get("textKind") or "record" for row in vectors)
    all_nodes = {node.get("id") for scope in index.get("scopes", []) for node in scope.get("nodes", [])}
    all_edges = {
        (edge.get("from"), edge.get("to"), edge.get("relation"))
        for scope in index.get("scopes", [])
        for edge in scope.get("edges", [])
    }
    index["updatedAt"] = _now()
    index["stats"] = {
        "documents": len(vectors),
        "scopes": len(index.get("scopes", [])),
        "textKinds": dict(text_counts),
        "nodes": len(all_nodes),
        "edges": len(all_edges),
    }
    graph_sync = _sync_neo4j(index) if sync_external else {"ok": False, "mode": "skipped", "message": "未请求外部图数据库同步。"}
    vector_sync = _sync_milvus(index) if sync_external else {"ok": False, "mode": "skipped", "message": "未请求外部向量数据库同步。"}
    index.setdefault("backend", {})["graph"] = {**graph_backend_status(), "sync": graph_sync}
    index.setdefault("backend", {})["vector"] = {**vector_backend_status(), "sync": vector_sync}
    _write_index(index)
    return {**extracted, "index": index_summary(index)}
