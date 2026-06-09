from __future__ import annotations

import json
from collections import Counter
from pathlib import Path
from typing import Any


USERS = {
    "user": {"id": "u-1001", "name": "注册用户", "username": "user", "role": "registered"},
    "researcher": {"id": "u-2001", "name": "研究者用户", "username": "researcher", "role": "researcher"},
    "admin": {"id": "u-9001", "name": "管理员", "username": "admin", "role": "admin"},
}

PASSWORDS = {
    "user": "user123",
    "researcher": "research123",
    "admin": "admin123",
}

KNOWLEDGE_SECTIONS = [
    {
        "id": "stories",
        "title": "多语种中国故事集",
        "intro": "依据《中国民间童话.xlsx》等真实表格构建，整理故事集总表、子故事、序跋、卫礼贤版本与传播路径。",
        "color": "#15a884",
        "sublibraries": ["故事集总表", "子故事表", "序跋表", "卫礼贤《中国民间童话》", "传播地图"],
        "keywords": ["真实数据", "故事集", "子故事", "序跋", "传播路径"],
    },
]

REPRESENTATIVE_RESULTS = [
    {
        "id": "real-story-db",
        "title": "多语种中国故事集真实数据库",
        "summary": "由项目表格生成，包含故事集总表、3533 条子故事、序跋、卫礼贤《中国民间童话》与传播路径数据。",
        "section": "多语种中国故事集",
        "date": "2026-06-05",
        "type": "真实数据集",
    },
]

MODEL_PROVIDERS = {
    "gpt": "OpenAI GPT",
    "claude": "Anthropic Claude",
    "deepseek": "DeepSeek",
    "gemini": "Google Gemini",
    "glm": "智谱 GLM",
    "qwen": "通义千问",
}

ROOT = Path(__file__).resolve().parents[3]
STORY_DATA_PATH = ROOT / "frontend" / "src" / "data" / "storyCollections.json"
CHINA_COORDS = [116.4, 39.9]


def clean(value: Any) -> str:
    return str(value or "").strip()


def clip(value: Any, limit: int = 360) -> str:
    text = clean(value).replace("\u3000", " ")
    if len(text) <= limit:
        return text
    return f"{text[: limit - 1]}…"


def load_story_data() -> dict[str, Any]:
    with STORY_DATA_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


STORY_DATA = load_story_data()


def collection_lookup() -> dict[str, dict[str, Any]]:
    return {
        clean(item.get("name") or item.get("foreignTitle")): item
        for item in STORY_DATA.get("collections", [])
    }


COLLECTIONS_BY_NAME = collection_lookup()


def collection_item(item: dict[str, Any]) -> dict[str, Any]:
    flow = next((flow for flow in STORY_DATA.get("flows", []) if flow.get("id") == item.get("id")), {})
    return {
        "id": item.get("id"),
        "status": "真实数据",
        "sectionId": "stories",
        "resourceType": "故事集总表",
        "canonicalTitle": item.get("chineseTitle") or item.get("name") or item.get("foreignTitle"),
        "translatedTitle": item.get("foreignTitle") or item.get("name") or item.get("chineseTitle"),
        "author": item.get("prefaceAuthor") or "",
        "translator": item.get("editor") or "",
        "language": "德语",
        "country": item.get("country") or flow.get("country") or "",
        "city": item.get("city") or "",
        "publisher": item.get("publisher") or "",
        "year": item.get("year") or 0,
        "uploadedAt": "",
        "uploader": "真实表格",
        "summary": clip(item.get("prefaceIntro") or item.get("prefaceText") or ""),
        "tags": [value for value in [item.get("editorRole"), item.get("prefaceType"), item.get("sourceProvince")] if value],
        "evidence": ["storyCollections.json: collections", "中国民间童话.xlsx"],
        "coordinates": {
            "from": flow.get("from") or CHINA_COORDS,
            "to": flow.get("to") or CHINA_COORDS,
        },
        "graphNodeIds": [f"story-collection:{item.get('id')}"],
    }


def child_item(item: dict[str, Any]) -> dict[str, Any]:
    collection = COLLECTIONS_BY_NAME.get(clean(item.get("bookName")), {})
    return {
        "id": item.get("id"),
        "status": "真实数据",
        "sectionId": "stories",
        "resourceType": "子故事条目",
        "canonicalTitle": item.get("canonicalName") or item.get("variantName") or "未命名子故事",
        "translatedTitle": item.get("variantName") or item.get("canonicalName") or "未命名子故事",
        "author": item.get("creator") or "",
        "translator": item.get("translator") or item.get("editor") or collection.get("editor") or "",
        "language": item.get("language") or "",
        "country": item.get("country") or item.get("nationality") or collection.get("country") or "",
        "city": item.get("place") or collection.get("city") or "",
        "publisher": item.get("publisher") or collection.get("publisher") or "",
        "year": item.get("year") or collection.get("year") or 0,
        "uploadedAt": "",
        "uploader": "真实表格",
        "summary": clip("；".join(part for part in [item.get("notes"), item.get("reference"), item.get("versionNote")] if part)),
        "tags": [value for value in [item.get("ethnicity"), item.get("storyType"), item.get("carrier")] if value],
        "evidence": ["storyCollections.json: childStories", "中国民间童话.xlsx"],
        "coordinates": {
            "from": CHINA_COORDS,
            "to": next((flow.get("to") for flow in STORY_DATA.get("flows", []) if flow.get("id") == collection.get("id")), CHINA_COORDS),
        },
        "graphNodeIds": [f"story-child:{item.get('id')}", f"story-collection:{collection.get('id', '')}"],
    }


def wilhelm_edition_item(item: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": item.get("id"),
        "status": "真实数据",
        "sectionId": "stories",
        "resourceType": "卫礼贤再版传播记录",
        "canonicalTitle": item.get("title") or item.get("foreignTitle") or "卫礼贤《中国民间童话》",
        "translatedTitle": item.get("foreignTitle") or item.get("title") or "Chinesische Volksmärchen",
        "author": item.get("translator") or "",
        "translator": item.get("translator") or "",
        "language": item.get("language") or "",
        "country": item.get("country") or "",
        "city": item.get("city") or "",
        "publisher": item.get("publisher") or "",
        "year": item.get("year") or 0,
        "uploadedAt": "",
        "uploader": "真实表格",
        "summary": clip("；".join(part for part in [item.get("edition"), item.get("note"), item.get("source")] if part)),
        "tags": [value for value in [item.get("edition"), item.get("province")] if value],
        "evidence": ["storyCollections.json: wilhelmEditions", "中国民间童话.xlsx"],
        "coordinates": {"from": CHINA_COORDS, "to": CHINA_COORDS},
        "graphNodeIds": [f"wilhelm-edition:{item.get('id')}"],
    }


KNOWLEDGE_ITEMS = [
    *(collection_item(item) for item in STORY_DATA.get("collections", [])),
    *(child_item(item) for item in STORY_DATA.get("childStories", [])),
    *(wilhelm_edition_item(item) for item in STORY_DATA.get("wilhelmEditions", [])),
]

MAP_FLOWS = STORY_DATA.get("flows", [])


def build_graph() -> dict[str, list[dict[str, Any]]]:
    collections = STORY_DATA.get("collections", [])[:30]
    nodes = [
        {
            "id": f"story-collection:{item.get('id')}",
            "label": item.get("chineseTitle") or item.get("name"),
            "type": "故事集",
            "section": "stories",
            "year": item.get("year") or 0,
            "lang": "德语",
            "x": 0.08 + (index % 10) * 0.09,
            "y": 0.16 + (index // 10) * 0.22,
            "size": 12 + min(18, int(item.get("declaredChildCount") or 0) // 6),
        }
        for index, item in enumerate(collections)
    ]
    editor_counts = Counter(clean(item.get("editor")) for item in collections if clean(item.get("editor")))
    city_counts = Counter(clean(item.get("city")) for item in collections if clean(item.get("city")))
    for index, (editor, count) in enumerate(editor_counts.most_common(12)):
        nodes.append({
            "id": f"story-editor:{editor}",
            "label": editor,
            "type": "编译者",
            "section": "stories",
            "year": 0,
            "lang": "",
            "x": 0.12 + (index % 6) * 0.14,
            "y": 0.8 + (index // 6) * 0.09,
            "size": 10 + count,
        })
    for index, (city, count) in enumerate(city_counts.most_common(10)):
        nodes.append({
            "id": f"story-city:{city}",
            "label": city,
            "type": "出版地",
            "section": "stories",
            "year": 0,
            "lang": "",
            "x": 0.1 + (index % 5) * 0.18,
            "y": 0.58 + (index // 5) * 0.09,
            "size": 10 + count,
        })
    edges = []
    for item in collections:
        collection_id = f"story-collection:{item.get('id')}"
        if clean(item.get("editor")):
            edges.append({"from": f"story-editor:{item.get('editor')}", "to": collection_id, "relation": "编译", "note": item.get("name")})
        if clean(item.get("city")):
            edges.append({"from": collection_id, "to": f"story-city:{item.get('city')}", "relation": "出版", "note": item.get("publisher")})
    return {"nodes": nodes, "edges": edges}


GRAPH_DATA = build_graph()
