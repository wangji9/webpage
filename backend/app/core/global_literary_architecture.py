from __future__ import annotations

import json
import re
import time
from collections import Counter
from pathlib import Path
from typing import Any

from backend.app.core.dataset_store import module_dataset_packages


ROOT = Path(__file__).resolve().parents[3]
REGISTRY_PATH = ROOT / "backend" / "app" / "literary_submodules.json"


DEMO_DOCUMENTS = [
    {
        "id": "demo-classics-analects-legge",
        "moduleId": "classics",
        "submoduleId": "classics-overview",
        "title": "《论语》英译与欧洲汉学接受",
        "translatedTitle": "The Analects in European Sinology",
        "language": "English",
        "originalLanguage": "Chinese",
        "publicationYear": 1861,
        "country": "United Kingdom",
        "city": "London",
        "publisher": "Trübner",
        "author": "Confucius",
        "translator": "James Legge",
        "corpus": "Chinese Classics Translation",
        "summary": "以《论语》英译为中心，呈现中国典籍在英国汉学、出版机构和跨文化注释系统中的传播路径。",
        "segments": [
            "Confucius was introduced through missionary scholarship, classical commentary, and comparative philosophy.",
            "The translation linked Chinese classics with European philology and institutional publishing networks.",
        ],
    },
    {
        "id": "demo-classics-zhuangzi-german",
        "moduleId": "classics",
        "submoduleId": "classics-german",
        "title": "《庄子》德语译介谱系",
        "translatedTitle": "Zhuangzi in German Translation",
        "language": "German",
        "originalLanguage": "Chinese",
        "publicationYear": 1912,
        "country": "Germany",
        "city": "Jena",
        "publisher": "Diederichs",
        "author": "Zhuangzi",
        "translator": "Martin Buber",
        "corpus": "German Translation Corpus",
        "summary": "记录《庄子》在德语区的译本、思想接受、出版社与汉学网络之间的关系。",
        "segments": [
            "Zhuangzi entered the German intellectual field through philosophy, religion, and literary translation.",
            "German reception emphasized freedom, transformation, and dialogue with European modern thought.",
        ],
    },
    {
        "id": "demo-shanghai-eileen-chang",
        "moduleId": "shanghai",
        "submoduleId": "shanghai-eileen-chang",
        "title": "张爱玲小说的英语传播路径",
        "translatedTitle": "Eileen Chang's Global Path",
        "language": "English",
        "originalLanguage": "Chinese",
        "publicationYear": 2007,
        "country": "United States",
        "city": "New York",
        "publisher": "NYRB Classics",
        "author": "Eileen Chang",
        "translator": "Karen S. Kingsbury",
        "corpus": "Shanghai Literature Global System",
        "summary": "以上海都市经验、女性叙事和英语出版网络为线索，分析张爱玲作品在海外的再经典化。",
        "segments": [
            "Shanghai urban memory and wartime intimacy shaped the reception of Eileen Chang in English.",
            "Translation, publishing, and academic criticism formed a durable global circulation route.",
        ],
    },
    {
        "id": "demo-shanghai-luxun",
        "moduleId": "shanghai",
        "submoduleId": "shanghai-luxun",
        "title": "鲁迅海外接受与现代中国形象",
        "translatedTitle": "Lu Xun Reception Graph",
        "language": "English",
        "originalLanguage": "Chinese",
        "publicationYear": 1960,
        "country": "United States",
        "city": "Honolulu",
        "publisher": "University of Hawaii Press",
        "author": "Lu Xun",
        "translator": "Yang Xianyi",
        "corpus": "Shanghai Literature Global System",
        "summary": "通过译者、研究机构和文学史叙述，展示鲁迅作为现代中国文学符号的海外接受。",
        "segments": [
            "Lu Xun was framed as a key figure of modern Chinese literary consciousness.",
            "Reception connected translation, university teaching, and comparative modernism.",
        ],
    },
    {
        "id": "demo-stories-german-collection",
        "moduleId": "stories",
        "submoduleId": "stories-german-collections",
        "title": "德译中国故事集总表样例",
        "translatedTitle": "German Chinese Story Collection",
        "language": "German",
        "originalLanguage": "Chinese",
        "publicationYear": 1914,
        "country": "Germany",
        "city": "Frankfurt",
        "publisher": "Rütten & Loening",
        "author": "Chinese storytellers",
        "translator": "Richard Wilhelm",
        "corpus": "Multilingual Chinese Story Corpus",
        "summary": "中国民间故事通过德语译本、序跋、出版社和再版网络进入德国读者视野。",
        "segments": [
            "Chinese folk stories circulated through translation, prefaces, and publisher catalogues.",
            "Motifs such as filial piety, fate, and transformation recur across multiple story versions.",
        ],
    },
    {
        "id": "demo-stories-preface",
        "moduleId": "stories",
        "submoduleId": "stories-prefaces",
        "title": "故事集序跋的文化说明功能",
        "translatedTitle": "Preface as Cultural Mediation",
        "language": "Chinese",
        "originalLanguage": "German",
        "publicationYear": 1921,
        "country": "Germany",
        "city": "Berlin",
        "publisher": "Fischer",
        "author": "Richard Wilhelm",
        "translator": "Editorial team",
        "corpus": "Preface Corpus",
        "summary": "序跋文本解释中国故事的文化背景、伦理结构和译者立场，是互见段落与引用关系的重要入口。",
        "segments": [
            "序跋承担文化阐释、读者引导和译者自我定位功能。",
            "多个版本反复出现中国、故事、民间、伦理、命运等关键词。",
        ],
    },
    {
        "id": "demo-world-western-china",
        "moduleId": "world",
        "submoduleId": "world-western",
        "title": "欧美文学中的中国城市想象",
        "translatedTitle": "China Urban Imagery in Western Narrative",
        "language": "English",
        "originalLanguage": "English",
        "publicationYear": 1933,
        "country": "United Kingdom",
        "city": "London",
        "publisher": "Heinemann",
        "author": "W. Somerset Maugham",
        "translator": "",
        "corpus": "Western Narrative Corpus",
        "summary": "以城市意象、旅行叙事和历史想象为核心，组织世界文学中的中国形象演化。",
        "segments": [
            "China appeared as a narrative space shaped by travel, empire, trade, and urban imagination.",
            "Country and city references reveal how global literature arranged Chinese themes over time.",
        ],
    },
    {
        "id": "demo-world-asian-history",
        "moduleId": "world",
        "submoduleId": "world-history",
        "title": "亚洲文学中的中国历史叙事",
        "translatedTitle": "Historical China in Asian Narrative",
        "language": "Japanese",
        "originalLanguage": "Japanese",
        "publicationYear": 1988,
        "country": "Japan",
        "city": "Tokyo",
        "publisher": "Iwanami",
        "author": "Asian authors",
        "translator": "",
        "corpus": "Asian Narrative Corpus",
        "summary": "围绕历史人物、古代中国、城市意象和现代记忆构建区域叙事知识网络。",
        "segments": [
            "Asian narratives often connect Chinese history with shared textual memory and regional identity.",
            "Historical narrative links works, places, institutions, and themes across languages.",
        ],
    },
    {
        "id": "demo-repository-cross-domain",
        "moduleId": "repository",
        "submoduleId": "repository-cross-domain-graph",
        "title": "跨模块人物-作品-机构索引样例",
        "translatedTitle": "Cross-domain Tripartite Index",
        "language": "global",
        "originalLanguage": "multilingual",
        "publicationYear": 2026,
        "country": "Global",
        "city": "Shanghai",
        "publisher": "Unified Repository",
        "author": "System",
        "translator": "",
        "corpus": "Unified Global Knowledge Repository",
        "summary": "总库将典籍、上海文学、故事集和世界文学数据统一为人物、作品、机构三元关系。",
        "segments": [
            "The repository supports unified search, cross-domain graph traversal, and multilingual alignment.",
            "Documents, entities, relations, corpora, languages, and visualization configs share one data model.",
        ],
    },
]


VISUAL_COMPONENTS = [
    {"id": "KnowledgeGraph", "name": "知识图谱", "category": "graph", "capability": "人物、作品、机构、地点多元关系浏览"},
    {"id": "NetworkGraph", "name": "关系网络图", "category": "graph", "capability": "译者、作者、出版社、文本共现网络"},
    {"id": "CoOccurrenceGraph", "name": "角色共现网络", "category": "graph", "capability": "角色、母题、主题共现分析"},
    {"id": "CitationGraph", "name": "引用关系图", "category": "graph", "capability": "序跋、研究文献、互见段落引用链"},
    {"id": "Timeline", "name": "时间轴", "category": "time", "capability": "出版、翻译、接受史时间分布"},
    {"id": "EvolutionGraph", "name": "动态演化图", "category": "time", "capability": "主题、词频、叙事结构阶段演化"},
    {"id": "TemporalHeatmap", "name": "历史分布热图", "category": "time", "capability": "年代密度与阶段热点"},
    {"id": "WorldMap", "name": "全球地图", "category": "space", "capability": "国家、区域、城市聚合"},
    {"id": "DiffusionMap", "name": "地理传播路径图", "category": "space", "capability": "中国来源地到海外出版地传播路径"},
    {"id": "CityMap", "name": "城市分布图", "category": "space", "capability": "出版城市、接受城市、研究机构分布"},
    {"id": "FrequencyChart", "name": "词频统计图", "category": "stats", "capability": "高频词、主题词、实体频率统计"},
    {"id": "ProbabilityChart", "name": "概率分布图", "category": "stats", "capability": "主题概率、文本类别概率、母题概率"},
    {"id": "ComparativeChart", "name": "对比分析图", "category": "stats", "capability": "语种、版本、年代、国家对比"},
    {"id": "FullTextViewer", "name": "全文查看器", "category": "text", "capability": "全文缩放、段落定位、证据回看"},
    {"id": "AlignmentViewer", "name": "多版本对齐", "category": "text", "capability": "跨语种、跨版本文本对齐矩阵"},
    {"id": "DistanceQueryEngine", "name": "字距检索", "category": "text", "capability": "A[0-10]B 近邻检索与上下文列表"},
]


DOMAIN_MODULES = [
    {
        "id": "classics",
        "name": "中国典籍海外译介",
        "englishName": "Chinese Classics Translation & Reception",
        "type": "domain",
        "color": "#1e3a8a",
        "description": "围绕中国典籍、译本、译者、汉学家、出版机构与接受史建立译介知识图谱。",
        "submodules": [
            {"id": "classics-overview", "name": "总集", "englishName": "Global Overview of Chinese Classics Abroad", "kind": "corpus", "language": "global", "components": ["Timeline", "NetworkGraph", "WorldMap", "FrequencyChart"]},
            {"id": "classics-german", "name": "德语区译介", "englishName": "German Translation Corpus", "kind": "language", "language": "German", "components": ["Timeline", "NetworkGraph", "AlignmentViewer"]},
            {"id": "classics-french", "name": "法语区译介", "englishName": "French Translation Corpus", "kind": "language", "language": "French", "components": ["WorldMap", "EvolutionGraph", "FrequencyChart"]},
            {"id": "classics-japanese", "name": "日语区译介", "englishName": "Japanese Translation Corpus", "kind": "language", "language": "Japanese", "components": ["EvolutionGraph", "NetworkGraph"]},
            {"id": "classics-zhuangzi", "name": "《庄子》海外传播图谱", "englishName": "Zhuangzi Global Graph", "kind": "theme", "language": "multilingual", "components": ["KnowledgeGraph", "DiffusionMap"]},
            {"id": "classics-shijing", "name": "《诗经》跨文化传播路径", "englishName": "Book of Songs Transmission Pathway", "kind": "theme", "language": "multilingual", "components": ["DiffusionMap", "Timeline"]},
        ],
    },
    {
        "id": "shanghai",
        "name": "上海文学海外传播",
        "englishName": "Shanghai Literary Global Dissemination",
        "type": "domain",
        "color": "#0f766e",
        "description": "分析上海作家、作品、译本、海外出版、城市网络与跨文化接受路径。",
        "submodules": [
            {"id": "shanghai-overview", "name": "总集", "englishName": "Shanghai Literature Global System", "kind": "corpus", "language": "global", "components": ["WorldMap", "Timeline", "NetworkGraph"]},
            {"id": "shanghai-english", "name": "英语传播语料库", "englishName": "English Corpus of Shanghai Literature", "kind": "language", "language": "English", "components": ["FrequencyChart", "FullTextViewer"]},
            {"id": "shanghai-french", "name": "法语传播语料库", "englishName": "French Corpus", "kind": "language", "language": "French", "components": ["FrequencyChart", "Timeline"]},
            {"id": "shanghai-spanish", "name": "西班牙语传播语料库", "englishName": "Spanish Corpus", "kind": "language", "language": "Spanish", "components": ["WorldMap", "ComparativeChart"]},
            {"id": "shanghai-luxun", "name": "鲁迅海外接受图谱", "englishName": "Lu Xun Reception Graph", "kind": "author", "language": "multilingual", "components": ["CitationGraph", "KnowledgeGraph"]},
            {"id": "shanghai-eileen-chang", "name": "张爱玲跨文化传播路径", "englishName": "Eileen Chang Global Path Graph", "kind": "author", "language": "multilingual", "components": ["DiffusionMap", "Timeline"]},
        ],
    },
    {
        "id": "stories",
        "name": "多语种中国故事集",
        "englishName": "Multilingual Chinese Story Corpus",
        "type": "domain",
        "color": "#7c3aed",
        "description": "整合故事集总表、百部德译故事集、序跋、子故事与卫礼贤专题数据。",
        "submodules": [
            {"id": "stories-overview", "name": "总集", "englishName": "Global Story Knowledge Base", "kind": "corpus", "language": "global", "components": ["FrequencyChart", "WorldMap", "KnowledgeGraph"]},
            {"id": "stories-german-collections", "name": "百部德译故事集图谱", "englishName": "German Story Network Graph", "kind": "corpus", "language": "German", "components": ["NetworkGraph", "FrequencyChart", "AlignmentViewer"]},
            {"id": "stories-prefaces", "name": "序跋中文版本图谱", "englishName": "Preface Evolution and Citation Graph", "kind": "theme", "language": "Chinese", "components": ["Timeline", "CitationGraph", "FullTextViewer"]},
            {"id": "stories-child-knowledge", "name": "子故事知识图谱", "englishName": "Story Knowledge Graph", "kind": "theme", "language": "Chinese", "components": ["KnowledgeGraph", "CoOccurrenceGraph"]},
            {"id": "stories-wilhelm", "name": "卫礼贤中国民间故事图谱", "englishName": "Richard Wilhelm Folktales Graph", "kind": "corpus", "language": "German", "components": ["DiffusionMap", "NetworkGraph", "ComparativeChart"]},
        ],
    },
    {
        "id": "world",
        "name": "世界文学的中国叙事",
        "englishName": "World Literature's China Narrative",
        "type": "domain",
        "color": "#0891b2",
        "description": "研究世界文学中的中国形象、中国主题、区域叙事与历史叙事网络。",
        "submodules": [
            {"id": "world-overview", "name": "总集", "englishName": "Global China Narrative Overview", "kind": "corpus", "language": "global", "components": ["Timeline", "TemporalHeatmap", "WorldMap"]},
            {"id": "world-western", "name": "欧美叙事语料库", "englishName": "Western Narrative Corpus", "kind": "region", "language": "multilingual", "components": ["FrequencyChart", "KnowledgeGraph"]},
            {"id": "world-asian", "name": "亚洲叙事语料库", "englishName": "Asian Narrative Corpus", "kind": "region", "language": "multilingual", "components": ["WorldMap", "ComparativeChart"]},
            {"id": "world-latin-american", "name": "拉美叙事语料库", "englishName": "Latin American Corpus", "kind": "region", "language": "Spanish/Portuguese", "components": ["WorldMap", "Timeline"]},
            {"id": "world-urban-imagery", "name": "中国城市意象图谱", "englishName": "Urban Imagery Graph", "kind": "theme", "language": "multilingual", "components": ["KnowledgeGraph", "FrequencyChart"]},
            {"id": "world-history", "name": "中国历史叙事网络", "englishName": "Historical Narrative Graph", "kind": "theme", "language": "multilingual", "components": ["NetworkGraph", "Timeline"]},
        ],
    },
    {
        "id": "repository",
        "name": "总库",
        "englishName": "Unified Global Knowledge Repository",
        "type": "domain",
        "color": "#334155",
        "description": "提供全球典籍索引、跨模块知识图谱、一站式检索与统计分析中心。",
        "submodules": [
            {"id": "repository-bibliography", "name": "全球典籍索引树", "englishName": "Global Bibliography Tree", "kind": "repository", "language": "global", "components": ["KnowledgeGraph", "FullTextViewer"]},
            {"id": "repository-search", "name": "一站式检索系统", "englishName": "Unified Search Engine", "kind": "repository", "language": "global", "components": ["FullTextViewer", "DistanceQueryEngine"]},
            {"id": "repository-cross-domain-graph", "name": "跨模块知识图谱", "englishName": "Cross-domain Knowledge Graph", "kind": "repository", "language": "global", "components": ["KnowledgeGraph", "NetworkGraph"]},
            {"id": "repository-tripartite", "name": "人物-作品-机构三元关系图", "englishName": "Tripartite Graph", "kind": "repository", "language": "global", "components": ["NetworkGraph", "CitationGraph"]},
            {"id": "repository-stats", "name": "全球统计与分析中心", "englishName": "Global Frequency Dashboard", "kind": "repository", "language": "global", "components": ["FrequencyChart", "ProbabilityChart", "TemporalHeatmap"]},
        ],
    },
]


CAPABILITY_MAP = [
    {"id": 1, "name": "词频与年代分布", "components": ["Timeline", "FrequencyChart"], "api": "/api/stats/frequency"},
    {"id": 2, "name": "字词体系浏览", "components": ["KnowledgeGraph", "NetworkGraph"], "api": "/api/graph/global"},
    {"id": 3, "name": "全文缩放展示", "components": ["FullTextViewer"], "api": "/api/search/fulltext"},
    {"id": 4, "name": "字词对比分析", "components": ["ComparativeChart", "AlignmentViewer"], "api": "/api/search/compare"},
    {"id": 5, "name": "字距检索", "components": ["DistanceQueryEngine"], "api": "/api/search/distance"},
    {"id": 6, "name": "地理+年代分布", "components": ["WorldMap", "Timeline"], "api": "/api/stats/geography"},
    {"id": 7, "name": "历史演化分析", "components": ["EvolutionGraph"], "api": "/api/stats/timeline"},
    {"id": 8, "name": "互见段落列表", "components": ["CitationGraph", "FullTextViewer"], "api": "/api/search/fulltext"},
    {"id": 9, "name": "概率统计", "components": ["ProbabilityChart"], "api": "/api/stats/frequency"},
    {"id": 10, "name": "古汉语分析", "components": ["FullTextViewer", "DistanceQueryEngine"], "api": "/api/nlp/analyze"},
    {"id": 11, "name": "典籍知识图谱", "components": ["KnowledgeGraph"], "api": "/api/graph/module/classics"},
    {"id": 12, "name": "全球古籍检索", "components": ["FullTextViewer"], "api": "/api/search/fulltext"},
]


def _read_registry() -> list[dict[str, Any]]:
    if not REGISTRY_PATH.exists():
        return []
    try:
        data = json.loads(REGISTRY_PATH.read_text(encoding="utf-8"))
    except Exception:
        return []
    return data if isinstance(data, list) else []


def _write_registry(items: list[dict[str, Any]]) -> None:
    REGISTRY_PATH.write_text(json.dumps(items, ensure_ascii=False, indent=2), encoding="utf-8")


def _dataset_summary_by_module() -> dict[str, dict[str, Any]]:
    try:
        payload = module_dataset_packages(summary=True)
    except Exception:
        return {}
    result: dict[str, dict[str, Any]] = {}
    for module in payload.get("modules", []):
        result[module.get("id", "")] = {
            "datasetCount": module.get("datasetCount", 0),
            "rowCount": module.get("rowCount", 0),
            "datasets": module.get("datasets", []),
            "submodules": module.get("submodules", []),
        }
    return result


def _demo_documents(module_id: str = "", submodule_id: str = "") -> list[dict[str, Any]]:
    documents = []
    for document in DEMO_DOCUMENTS:
        if module_id and module_id != "global" and document.get("moduleId") != module_id:
            continue
        if submodule_id and document.get("submoduleId") != submodule_id:
            continue
        documents.append(dict(document))
    return documents


def _document_to_visual_item(document: dict[str, Any]) -> dict[str, Any]:
    return {
        "id": document.get("id"),
        "datasetId": "demo-literary-documents",
        "sectionId": document.get("moduleId"),
        "submoduleId": document.get("submoduleId"),
        "resourceType": document.get("corpus") or "Demo Corpus",
        "canonicalTitle": document.get("title"),
        "translatedTitle": document.get("translatedTitle"),
        "year": document.get("publicationYear"),
        "language": document.get("language"),
        "country": document.get("country"),
        "city": document.get("city"),
        "publisher": document.get("publisher"),
        "translator": document.get("translator"),
        "author": document.get("author"),
        "summary": document.get("summary"),
        "source": document.get("corpus"),
        "sourceKind": "demo-document",
        "raw": document,
    }


def _merge_dynamic_submodules(modules: list[dict[str, Any]]) -> list[dict[str, Any]]:
    dynamic = _read_registry()
    by_module = {module["id"]: module for module in modules}
    for submodule in dynamic:
        module_id = str(submodule.get("moduleId") or "")
        if module_id not in by_module:
            continue
        by_module[module_id]["submodules"].append({**submodule, "dynamic": True})
    return modules


def architecture_payload() -> dict[str, Any]:
    dataset_summary = _dataset_summary_by_module()
    modules = []
    for module in DOMAIN_MODULES:
        summary = dataset_summary.get(module["id"], {})
        live_submodules = {item.get("id"): item for item in summary.get("submodules", [])}
        submodules = []
        for submodule in module["submodules"]:
            live = live_submodules.get(submodule["id"], {})
            demo_rows = len(_demo_documents(module["id"], submodule["id"]))
            submodules.append({
                **submodule,
                "moduleId": module["id"],
                "datasetCount": live.get("datasetCount", 0) + (1 if demo_rows else 0),
                "rowCount": live.get("rowCount", 0) + demo_rows,
                "datasetIds": [item.get("id") for item in live.get("datasets", [])],
            })
        demo_module_rows = len(_demo_documents(module["id"]))
        modules.append({
            **module,
            "submodules": submodules,
            "datasetCount": summary.get("datasetCount", 0) + (1 if demo_module_rows else 0),
            "rowCount": summary.get("rowCount", 0) + demo_module_rows,
        })
    modules = _merge_dynamic_submodules(modules)
    return {
        "modules": modules,
        "visualComponents": VISUAL_COMPONENTS,
        "capabilities": CAPABILITY_MAP,
        "model": {
            "entities": ["Document", "Entity", "Relation", "Corpus", "Language", "Module", "VisualizationConfig", "TextSegment"],
            "relations": ["Module 1:N SubModule", "SubModule 1:N Corpus", "Corpus 1:N Document", "Document N:M Entity", "Entity 1:N Relation", "SubModule 1:N VisualizationConfig"],
            "pluginApi": "registerSubmodule({ id, moduleId, name, language, dataset, visualizationConfig })",
        },
    }


def register_submodule(payload: dict[str, Any]) -> dict[str, Any]:
    module_id = str(payload.get("moduleId") or payload.get("module_id") or "").strip()
    if module_id not in {module["id"] for module in DOMAIN_MODULES}:
        raise ValueError("moduleId must match an existing domain module.")
    name = str(payload.get("name") or "").strip()
    if not name:
        raise ValueError("Submodule name is required.")
    submodule_id = str(payload.get("id") or f"{module_id}-{int(time.time())}").strip()
    components = payload.get("components") or payload.get("visualizationConfig") or ["KnowledgeGraph", "Timeline", "WorldMap"]
    if isinstance(components, dict):
        components = components.get("components") or components.get("componentTypes") or []
    item = {
        "id": submodule_id,
        "moduleId": module_id,
        "name": name,
        "englishName": str(payload.get("englishName") or payload.get("english_name") or name),
        "kind": str(payload.get("kind") or "plugin"),
        "language": str(payload.get("language") or "multilingual"),
        "dataset": payload.get("dataset") or payload.get("datasetId") or "",
        "components": list(components) if isinstance(components, list) else ["KnowledgeGraph"],
        "description": str(payload.get("description") or "动态注册子模块"),
        "createdAt": int(time.time()),
    }
    items = [entry for entry in _read_registry() if entry.get("id") != submodule_id]
    items.append(item)
    _write_registry(items)
    return item


def remove_submodule(module_id: str) -> bool:
    items = _read_registry()
    kept = [entry for entry in items if entry.get("id") != module_id]
    if len(kept) == len(items):
        return False
    _write_registry(kept)
    return True


def graph_payload(module_id: str = "global") -> dict[str, Any]:
    architecture = architecture_payload()
    modules = architecture["modules"] if module_id in {"", "global"} else [m for m in architecture["modules"] if m["id"] == module_id]
    nodes = []
    edges = []
    nodes.append({"id": "platform", "label": "全球多语种文学知识平台", "type": "platform", "section": "repository", "size": 28})
    for module in modules:
        nodes.append({"id": module["id"], "label": module["name"], "type": "domain", "section": module["id"], "size": 20})
        edges.append({"from": "platform", "to": module["id"], "relation": "包含知识域"})
        for submodule in module.get("submodules", []):
            nodes.append({"id": submodule["id"], "label": submodule["name"], "type": submodule.get("kind", "subdomain"), "section": module["id"], "size": 12})
            edges.append({"from": module["id"], "to": submodule["id"], "relation": "注册子模块"})
            for component in submodule.get("components", [])[:4]:
                component_id = f"{submodule['id']}:{component}"
                nodes.append({"id": component_id, "label": component, "type": "visualization", "section": module["id"], "size": 8})
                edges.append({"from": submodule["id"], "to": component_id, "relation": "调用组件"})
    entity_nodes: dict[str, dict[str, Any]] = {}
    for document in _demo_documents("" if module_id in {"", "global"} else module_id):
        doc_id = f"doc:{document['id']}"
        nodes.append({
            "id": doc_id,
            "label": document.get("title"),
            "type": "Document",
            "section": document.get("moduleId"),
            "year": document.get("publicationYear"),
            "lang": document.get("language"),
            "size": 10,
        })
        edges.append({"from": document.get("submoduleId"), "to": doc_id, "relation": "document"})
        for field, relation, entity_type in [
            ("author", "author", "person"),
            ("translator", "translator", "person"),
            ("publisher", "publisher", "institution"),
            ("country", "country", "location"),
            ("city", "city", "location"),
            ("language", "language", "language"),
        ]:
            value = str(document.get(field) or "").strip()
            if not value:
                continue
            entity_id = f"entity:{entity_type}:{value.lower().replace(' ', '-')}"
            entity_nodes[entity_id] = {
                "id": entity_id,
                "label": value,
                "type": entity_type,
                "section": document.get("moduleId"),
                "size": 8,
            }
            edges.append({"from": doc_id, "to": entity_id, "relation": relation})
    nodes.extend(entity_nodes.values())
    return {"nodes": nodes, "edges": edges}


def _all_visual_items(module_id: str = "") -> list[dict[str, Any]]:
    try:
        payload = module_dataset_packages(module_id if module_id and module_id != "global" else None, summary=False)
    except Exception:
        return []
    items: list[dict[str, Any]] = []
    for dataset in payload.get("datasets", []):
        items.extend(dataset.get("items", []))
    if not items:
        items.extend(_document_to_visual_item(document) for document in _demo_documents(module_id))
    return items


def _scoped_visual_items(module_id: str = "", submodule_id: str = "") -> list[dict[str, Any]]:
    try:
        payload = module_dataset_packages(
            module_id if module_id and module_id != "global" else None,
            submodule_id if submodule_id else None,
            summary=False,
        )
    except Exception:
        payload = {"datasets": []}
    items: list[dict[str, Any]] = []
    for dataset in payload.get("datasets", []):
        dataset_id = dataset.get("id") or dataset.get("datasetId") or ""
        for item in dataset.get("items", []):
            if submodule_id and item.get("submoduleId") and item.get("submoduleId") != submodule_id:
                continue
            items.append({**item, "datasetId": item.get("datasetId") or dataset_id})
    if not items:
        items.extend(_document_to_visual_item(document) for document in _demo_documents(module_id, submodule_id))
    return items


def _text_for_item(item: dict[str, Any]) -> str:
    fields = [
        "canonicalTitle",
        "translatedTitle",
        "title",
        "summary",
        "source",
        "language",
        "country",
        "city",
        "publisher",
        "translator",
        "author",
    ]
    raw = item.get("raw")
    if isinstance(raw, dict):
        fields.extend(["prefaceText", "text", "corpus"])
    text_parts = [str(item.get(field) or "") for field in fields]
    if isinstance(raw, dict):
        text_parts.extend(str(raw.get(field) or "") for field in fields)
        text_parts.extend(str(segment) for segment in raw.get("segments", []) if segment)
    return " ".join(part for part in text_parts if part)


def _tokenize_item(item: dict[str, Any]) -> list[str]:
    text = _text_for_item(item)
    tokens = re.findall(r"[\u4e00-\u9fff]{2,8}|[A-Za-z][A-Za-z-]{3,}", text)
    stopwords = {
        "the", "and", "with", "from", "this", "that", "into", "through",
        "translation", "literature", "chinese", "china", "global",
    }
    result = []
    for token in tokens:
        lowered = token.lower()
        if lowered in stopwords:
            continue
        result.append(token)
    return result


def _item_year(item: dict[str, Any]) -> int | None:
    for key in ["year", "publicationYear"]:
        value = item.get(key)
        if isinstance(value, int) and value:
            return value
        try:
            parsed = int(str(value))
        except (TypeError, ValueError):
            continue
        if parsed:
            return parsed
    return None


def _item_title(item: dict[str, Any]) -> str:
    return str(item.get("canonicalTitle") or item.get("title") or item.get("translatedTitle") or "未命名文献")


def _counter_payload(counter: Counter, label_key: str, limit: int = 20) -> list[dict[str, Any]]:
    return [{label_key: label, "count": count} for label, count in counter.most_common(limit)]


def documents_payload(module_id: str = "", submodule_id: str = "", query: str = "", limit: int = 80) -> dict[str, Any]:
    needle = query.lower().strip()
    documents = []
    for document in _demo_documents(module_id, submodule_id):
        text = json.dumps(document, ensure_ascii=False).lower()
        if needle and needle not in text:
            continue
        documents.append(document)
        if len(documents) >= limit:
            break
    return {"documents": documents, "query": query, "total": len(documents)}


def frequency_stats(module_id: str = "", limit: int = 20) -> dict[str, Any]:
    items = _all_visual_items(module_id)
    fields = ["canonicalTitle", "translatedTitle", "summary", "language", "country", "publisher", "translator", "author"]
    counts: Counter[str] = Counter()
    for item in items:
        for field in fields:
            text = str(item.get(field) or "")
            for token in __import__("re").findall(r"[\u4e00-\u9fff]{2,8}|[A-Za-z][A-Za-z-]{3,}", text):
                counts[token] += 1
    return {"items": [{"term": term, "count": count} for term, count in counts.most_common(limit)], "totalRecords": len(items)}


def timeline_stats(module_id: str = "") -> dict[str, Any]:
    items = _all_visual_items(module_id)
    counts: Counter[int] = Counter()
    for item in items:
        year = item.get("year")
        if isinstance(year, int) and year:
            counts[year] += 1
    return {"items": [{"year": year, "count": count} for year, count in sorted(counts.items())], "totalRecords": len(items)}


def geography_stats(module_id: str = "") -> dict[str, Any]:
    items = _all_visual_items(module_id)
    counts: Counter[str] = Counter()
    for item in items:
        place = str(item.get("country") or item.get("city") or "").strip()
        if place:
            counts[place] += 1
    return {"items": [{"place": place, "count": count} for place, count in counts.most_common(30)], "totalRecords": len(items)}


def search_fulltext(query: str = "", module_id: str = "", limit: int = 40) -> dict[str, Any]:
    needle = query.lower().strip()
    records = []
    for item in _all_visual_items(module_id):
        text = " ".join(str(item.get(key) or "") for key in ["canonicalTitle", "translatedTitle", "summary", "language", "country", "publisher", "translator", "author"])
        if not needle or needle in text.lower():
            records.append({**item, "snippet": text[:260]})
        if len(records) >= limit:
            break
    return {"items": records, "query": query, "total": len(records)}


def distance_search(q1: str = "", q2: str = "", range_value: int = 10, module_id: str = "") -> dict[str, Any]:
    records = search_fulltext("", module_id, limit=300).get("items", [])
    matches = []
    for item in records:
        text = str(item.get("summary") or item.get("translatedTitle") or item.get("canonicalTitle") or "")
        left = text.find(q1) if q1 else -1
        right = text.find(q2) if q2 else -1
        if left >= 0 and right >= 0 and abs(right - left) <= range_value + max(len(q1), len(q2)):
            matches.append({**item, "distance": abs(right - left), "snippet": text[max(0, min(left, right) - 30): max(left, right) + 60]})
    return {"items": matches[:40], "q1": q1, "q2": q2, "range": range_value}


def compare_terms(terms: str = "", module_id: str = "") -> dict[str, Any]:
    term_list = [term.strip() for term in terms.replace("=", ",").split(",") if term.strip()]
    records = search_fulltext("", module_id, limit=500).get("items", [])
    result = []
    for term in term_list:
        count = 0
        for item in records:
            text = json.dumps(item, ensure_ascii=False).lower()
            if term.lower() in text:
                count += 1
        result.append({"term": term, "count": count})
    return {"items": result, "terms": term_list}


def visualization_layer_payload(module_id: str = "", submodule_id: str = "") -> dict[str, Any]:
    items = _scoped_visual_items(module_id, submodule_id)
    module_graph = graph_payload(module_id or "global")

    token_counts: Counter[str] = Counter()
    year_counts: Counter[int] = Counter()
    decade_counts: Counter[str] = Counter()
    place_counts: Counter[str] = Counter()
    city_counts: Counter[str] = Counter()
    language_counts: Counter[str] = Counter()
    country_counts: Counter[str] = Counter()
    matrix_counts: Counter[tuple[str, str]] = Counter()
    route_counts: Counter[tuple[str, str]] = Counter()

    item_tokens: list[tuple[dict[str, Any], list[str]]] = []
    for item in items:
        tokens = _tokenize_item(item)
        item_tokens.append((item, tokens))
        token_counts.update(tokens)
        year = _item_year(item)
        if year:
            year_counts[year] += 1
            decade_counts[f"{year // 10 * 10}年代"] += 1
        place = str(item.get("country") or item.get("city") or "").strip()
        city = str(item.get("city") or item.get("country") or "").strip()
        language = str(item.get("language") or "未标注").strip() or "未标注"
        country = str(item.get("country") or "未标注").strip() or "未标注"
        if place:
            place_counts[place] += 1
        if city:
            city_counts[city] += 1
        language_counts[language] += 1
        country_counts[country] += 1
        matrix_counts[(language, country)] += 1
        raw = item.get("raw") if isinstance(item.get("raw"), dict) else {}
        source = str(raw.get("sourceProvince") or raw.get("sourceRegion") or item.get("source") or "中国").strip() or "中国"
        target = city or country
        if target:
            route_counts[(source, target)] += 1

    cooccurrence: Counter[tuple[str, str]] = Counter()
    for _, tokens in item_tokens:
        unique_tokens = list(dict.fromkeys(tokens[:12]))
        for index, left in enumerate(unique_tokens):
            for right in unique_tokens[index + 1:index + 5]:
                if left == right:
                    continue
                pair = tuple(sorted([left, right]))
                cooccurrence[pair] += 1

    citation_links = []
    sorted_items = sorted(items, key=lambda item: (_item_year(item) or 9999, _item_title(item)))
    for index, current in enumerate(sorted_items):
        current_terms = set(_tokenize_item(current)[:12])
        for candidate in sorted_items[index + 1:]:
            candidate_terms = set(_tokenize_item(candidate)[:12])
            shared = sorted(current_terms & candidate_terms)
            same_channel = (
                current.get("publisher") and current.get("publisher") == candidate.get("publisher")
            ) or (
                current.get("translator") and current.get("translator") == candidate.get("translator")
            ) or (
                current.get("country") and current.get("country") == candidate.get("country")
            )
            if shared or same_channel:
                citation_links.append({
                    "source": _item_title(current),
                    "target": _item_title(candidate),
                    "basis": "、".join(shared[:3]) if shared else "同一传播通道",
                    "sourceYear": _item_year(current),
                    "targetYear": _item_year(candidate),
                })
            if len(citation_links) >= 18:
                break
        if len(citation_links) >= 18:
            break

    total_tokens = max(1, sum(token_counts.values()))
    frequency_items = _counter_payload(token_counts, "term", 30)
    probability_items = [
        {**item, "probability": item["count"] / total_tokens}
        for item in frequency_items[:18]
    ]
    timeline_items = [{"year": year, "count": count} for year, count in sorted(year_counts.items())]
    cumulative = 0
    evolution_items = []
    for year, count in sorted(year_counts.items()):
        cumulative += count
        evolution_items.append({
            "year": year,
            "count": count,
            "cumulative": cumulative,
            "stage": "早期译介" if year < 1950 else "扩展传播" if year < 2000 else "当代接受",
        })

    return {
        "moduleId": module_id,
        "submoduleId": submodule_id,
        "recordCount": len(items),
        "graph": {
            "knowledgeGraph": module_graph,
            "network": {
                "nodes": module_graph.get("nodes", []),
                "edges": module_graph.get("edges", []),
                "relationCounts": _counter_payload(Counter(edge.get("relation") or "关系" for edge in module_graph.get("edges", [])), "relation", 16),
            },
            "cooccurrence": [{"source": left, "target": right, "count": count} for (left, right), count in cooccurrence.most_common(24)],
            "citations": citation_links,
        },
        "time": {
            "timeline": timeline_items,
            "evolution": evolution_items,
            "heatmap": [{"period": period, "count": count} for period, count in sorted(decade_counts.items())],
        },
        "space": {
            "places": _counter_payload(place_counts, "place", 30),
            "cities": _counter_payload(city_counts, "city", 30),
            "routes": [
                {"source": source, "target": target, "count": count}
                for (source, target), count in route_counts.most_common(30)
            ],
        },
        "stats": {
            "frequency": frequency_items,
            "probability": probability_items,
            "languages": _counter_payload(language_counts, "language", 20),
            "countries": _counter_payload(country_counts, "country", 20),
            "comparison": [
                {"language": language, "country": country, "count": count}
                for (language, country), count in matrix_counts.most_common(40)
            ],
        },
        "text": {
            "documents": [
                {
                    "id": item.get("id"),
                    "title": _item_title(item),
                    "year": _item_year(item),
                    "language": item.get("language") or "未标注",
                    "country": item.get("country") or "未标注",
                    "city": item.get("city") or "",
                    "publisher": item.get("publisher") or "",
                    "summary": str(item.get("summary") or _text_for_item(item))[:420],
                }
                for item in items[:60]
            ],
            "alignment": [
                {
                    "language": item.get("language") or "未标注",
                    "title": _item_title(item),
                    "year": _item_year(item),
                    "summary": str(item.get("summary") or _text_for_item(item))[:180],
                }
                for item in sorted_items[:16]
            ],
            "distance": distance_search("中国", "故事", 10, module_id).get("items", [])[:12],
        },
    }
