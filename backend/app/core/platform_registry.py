from __future__ import annotations

from copy import deepcopy
from typing import Any


SYSTEM_FIELDS = [
    "title",
    "author",
    "translator",
    "publisher",
    "publish_year",
    "country",
    "city",
    "theme",
    "content",
    "source",
    "preface",
    "notes",
]


VISUAL_COMPONENTS: list[dict[str, Any]] = [
    {"id": "metrics", "name": "统计指标卡片组", "span": 24, "height": 120, "endpoint": None},
    {"id": "german-story-atlas", "name": "百部德译故事集图谱工作台", "span": 24, "height": 1600, "endpoint": "/api/story/visual-atlas"},
    {"id": "wilhelm-story-atlas", "name": "卫礼贤《中国民间童话》专题工作台", "span": 24, "height": 1600, "endpoint": "/api/wilhelm/visuals"},
    {"id": "knowledge-graph", "name": "知识图谱组件", "span": 12, "height": 500, "endpoint": "/api/visualizations/knowledge-graph/{sub_module_id}"},
    {"id": "global-map", "name": "全球传播地图组件", "span": 12, "height": 500, "endpoint": "/api/visualizations/map/{sub_module_id}"},
    {"id": "time-evolution", "name": "时间演化轴组件", "span": 8, "height": 300, "endpoint": "/api/visualizations/time-evolution/{sub_module_id}"},
    {"id": "word-frequency", "name": "词频统计柱状图组件", "span": 8, "height": 300, "endpoint": "/api/visualizations/word-frequency/{sub_module_id}"},
    {"id": "topic-clustering", "name": "主题聚类图组件", "span": 8, "height": 300, "endpoint": "/api/visualizations/topic-clustering/{sub_module_id}"},
    {"id": "advanced-text-visuals", "name": "文本分析", "span": 24, "height": 980, "endpoint": "/api/visualizations/advanced-text/{sub_module_id}"},
    {"id": "translator-flow", "name": "译者身份流变图组件", "span": 12, "height": 400, "endpoint": None},
    {"id": "keyword-cooccurrence", "name": "关键词共现网络组件", "span": 12, "height": 400, "endpoint": "/api/visualizations/word-frequency/{sub_module_id}"},
    {"id": "translation-tree", "name": "单篇译文结构谱系图组件", "span": 12, "height": 400, "endpoint": None},
    {"id": "reprint-heatmap", "name": "再版传播时间密度图组件", "span": 8, "height": 300, "endpoint": "/api/visualizations/time-evolution/{sub_module_id}"},
    {"id": "preface-analysis", "name": "序跋中文版本图谱工作台", "span": 24, "height": 900, "endpoint": "/api/story/visual-atlas?mode=prefaces"},
    {"id": "story-bibliography-graph", "name": "子故事知识图谱工作台", "span": 24, "height": 900, "endpoint": "/api/story/visual-atlas?mode=children"},
    {"id": "comparison", "name": "对比分析图组件", "span": 8, "height": 300, "endpoint": "/api/visualizations/comparison/{sub_module_id}"},
    {"id": "probability", "name": "概率分布图组件", "span": 8, "height": 300, "endpoint": "/api/visualizations/comparison/{sub_module_id}"},
    {"id": "citation-graph", "name": "引用关系图组件", "span": 12, "height": 400, "endpoint": None},
    {"id": "word-trend", "name": "字词年代分布组件", "span": 12, "height": 400, "endpoint": "/api/visualizations/word-trend/{sub_module_id}"},
    {"id": "word-distance", "name": "字距检索结果组件", "span": 12, "height": 400, "endpoint": "/api/visualizations/word-distance/{sub_module_id}"},
    {"id": "version-alignment", "name": "多版本对齐组件", "span": 24, "height": 600, "endpoint": None},
    {"id": "full-text", "name": "全文查看器组件", "span": 24, "height": 600, "endpoint": "/api/search/full-text"},
    {"id": "data-table", "name": "数据表格组件", "span": 24, "height": 500, "endpoint": "/api/sub-modules/{sub_module_id}/all-records"},
    {"id": "word-comparison", "name": "字词对比分析组件", "span": 12, "height": 400, "endpoint": "/api/visualizations/word-trend/{sub_module_id}"},
    {"id": "smart-qa", "name": "智能问答组件", "span": 12, "height": 500, "endpoint": "/api/chat"},
    {"id": "mutual-citation", "name": "互见引用列表组件", "span": 24, "height": 500, "endpoint": None},
]


DEFAULT_COMPONENTS = [
    "metrics",
    "knowledge-graph",
    "global-map",
    "time-evolution",
    "word-frequency",
    "topic-clustering",
    "advanced-text-visuals",
    "comparison",
    "probability",
    "word-trend",
    "word-distance",
    "data-table",
    "full-text",
]


DOMAIN_DEFINITIONS: list[dict[str, Any]] = [
    {
        "id": "classics",
        "name": "中国典籍海外译介",
        "description": "中国典籍、译者、出版社、出版地、主题与海外接受知识域。",
        "icon": "book-open",
        "sort_order": 1,
        "admin_upload_target": True,
        "submodules": [
            "总集",
            "英语译介专题",
            "法语译介专题",
            "德语译介专题",
            "日语译介专题",
            "西班牙语译介专题",
            "俄语译介专题",
            "阿拉伯语译介专题",
            "儒家典籍海外传播",
            "道家典籍海外传播",
            "四大名著海外传播",
            "唐诗海外传播",
            "宋词海外传播",
            "鲁迅典籍海外译介",
        ],
    },
    {
        "id": "shanghai",
        "name": "上海文学海外传播",
        "description": "上海作家作品、海外出版、评论接受与跨文化传播路径知识域。",
        "icon": "building-2",
        "sort_order": 2,
        "admin_upload_target": True,
        "submodules": [
            "总集",
            "英语传播语料库",
            "法语传播语料库",
            "西班牙语传播语料库",
            "德语传播语料库",
            "日语传播语料库",
            "俄语传播语料库",
            "鲁迅海外接受图谱",
            "张爱玲跨文化传播路径",
            "茅盾海外传播专题",
            "巴金海外传播专题",
            "老舍海外传播专题",
            "上海作家作品海外出版地图",
            "上海文学海外评论数据库",
        ],
    },
    {
        "id": "stories",
        "name": "多语种中国故事集",
        "description": "多语种故事集、序跋、子故事、神话寓言与民间故事类型知识域。",
        "icon": "library",
        "sort_order": 3,
        "admin_upload_target": True,
        "submodules": [
            "总集",
            "百部德译故事集图谱",
            "序跋中文版本图谱",
            "子故事知识图谱",
            "卫礼贤中国民间故事",
            "英语中国故事集",
            "法语中国故事集",
            "西班牙语中国故事集",
            "俄语中国故事集",
            "日语中国故事集",
            "阿拉伯语中国故事集",
            "中国神话海外传播",
            "中国寓言海外传播",
            "中国民间故事类型学图谱",
        ],
    },
    {
        "id": "world",
        "name": "世界文学的中国叙事",
        "description": "世界文学、影视、汉学与社交媒体中的中国叙事知识域。",
        "icon": "globe-2",
        "sort_order": 4,
        "admin_upload_target": True,
        "submodules": [
            "总集",
            "英语文学中的中国叙事",
            "法语文学中的中国叙事",
            "德语文学中的中国叙事",
            "日语文学中的中国叙事",
            "俄语文学中的中国叙事",
            "诺贝尔文学奖作品中的中国元素",
            "海外汉学家中国叙事研究",
            "好莱坞电影中的中国形象",
            "海外社交媒体中的中国叙事",
        ],
    },
    {
        "id": "repository",
        "name": "总库",
        "description": "跨知识域检索、联合分析、字词平台与全球古籍目录总入口。",
        "icon": "database",
        "sort_order": 5,
        "admin_upload_target": False,
        "submodules": [
            "全部文献检索",
            "作者总库",
            "译者总库",
            "出版社总库",
            "出版地总库",
            "主题词总库",
            "引用关系总库",
            "跨知识域联合分析",
            "字词综合分析平台",
            "全球古籍目录检索",
        ],
    },
]


LANGUAGE_KEYWORDS = {
    "英语": "English",
    "法语": "French",
    "德语": "German",
    "日语": "Japanese",
    "西班牙语": "Spanish",
    "俄语": "Russian",
    "阿拉伯语": "Arabic",
}


def slugify(value: str) -> str:
    mapping = {
        "总集": "overview",
        "百部德译故事集图谱": "german-story-atlas",
        "序跋中文版本图谱": "preface-atlas",
        "子故事知识图谱": "child-story-atlas",
        "全部文献检索": "all-literature-search",
        "作者总库": "authors",
        "译者总库": "translators",
        "出版社总库": "publishers",
        "出版地总库": "publication-places",
        "主题词总库": "subjects",
        "引用关系总库": "citations",
        "跨知识域联合分析": "cross-domain-analysis",
        "字词综合分析平台": "word-analysis",
        "全球古籍目录检索": "global-rare-book-catalog",
    }
    if value in mapping:
        return mapping[value]
    tokens = []
    for chinese, english in LANGUAGE_KEYWORDS.items():
        if chinese in value:
            tokens.append(english.lower())
    if "鲁迅" in value:
        tokens.append("luxun")
    if "张爱玲" in value:
        tokens.append("eileen-chang")
    if "茅盾" in value:
        tokens.append("maodun")
    if "巴金" in value:
        tokens.append("bajin")
    if "老舍" in value:
        tokens.append("laoshe")
    if "卫礼贤" in value:
        tokens.append("wilhelm")
    if "诺贝尔" in value:
        tokens.append("nobel")
    if "好莱坞" in value:
        tokens.append("hollywood")
    if "社交媒体" in value:
        tokens.append("social-media")
    if "四大名著" in value:
        tokens.append("four-classics")
    if "唐诗" in value:
        tokens.append("tang-poetry")
    if "宋词" in value:
        tokens.append("song-ci")
    if "儒家" in value:
        tokens.append("confucian")
    if "道家" in value:
        tokens.append("daoist")
    if "神话" in value:
        tokens.append("myth")
    if "寓言" in value:
        tokens.append("fable")
    if "民间故事类型学" in value:
        tokens.append("folktale-typology")
    if not tokens:
        tokens.append(str(abs(hash(value)))[:8])
    return "-".join(tokens)


def infer_submodule_type(name: str) -> str:
    if any(key in name for key in LANGUAGE_KEYWORDS):
        return "language"
    if name == "总集" or name.startswith("全部"):
        return "general"
    return "topic"


def infer_language(name: str) -> str | None:
    for chinese, english in LANGUAGE_KEYWORDS.items():
        if chinese in name:
            return english
    return None


def component_defaults_for(name: str) -> list[str]:
    if "百部德译故事集图谱" in name:
        return ["german-story-atlas", "advanced-text-visuals", "full-text"]
    if "序跋" in name:
        return ["preface-analysis", "advanced-text-visuals", "full-text"]
    if "子故事" in name:
        return ["story-bibliography-graph", "advanced-text-visuals", "full-text"]
    if "卫礼贤" in name:
        return ["wilhelm-story-atlas", "advanced-text-visuals", "full-text"]
    components = list(DEFAULT_COMPONENTS)
    if "引用" in name:
        components = ["metrics", "citation-graph", "mutual-citation", "advanced-text-visuals", "data-table", "full-text"]
    elif "字词" in name:
        components = ["metrics", "word-trend", "word-comparison", "word-distance", "advanced-text-visuals", "data-table", "full-text"]
    elif "检索" in name:
        components = ["metrics", "full-text", "word-distance", "word-comparison", "advanced-text-visuals", "data-table"]
    for required in ["advanced-text-visuals", "full-text"]:
        if required not in components:
            components.append(required)
    return components


def registry_payload() -> dict[str, Any]:
    domains = []
    submodule_id = 1
    for domain_index, domain in enumerate(DOMAIN_DEFINITIONS, start=1):
        submodules = []
        for order, name in enumerate(domain["submodules"], start=1):
            slug = slugify(name)
            submodules.append({
                "id": f"{domain['id']}-{slug}",
                "numericId": submodule_id,
                "knowledge_domain_id": domain_index,
                "domainId": domain["id"],
                "name": name,
                "description": f"{domain['name']} - {name}",
                "type": infer_submodule_type(name),
                "language": infer_language(name),
                "enabled_components": component_defaults_for(name),
                "sort_order": order,
                "is_active": True,
            })
            submodule_id += 1
        domains.append({
            "id": domain["id"],
            "numericId": domain_index,
            "name": domain["name"],
            "description": domain["description"],
            "icon": domain["icon"],
            "sort_order": domain["sort_order"],
            "is_active": True,
            "admin_upload_target": domain["admin_upload_target"],
            "submodules": submodules,
        })
    return {"domains": domains, "components": deepcopy(VISUAL_COMPONENTS), "systemFields": list(SYSTEM_FIELDS)}


def all_submodules() -> list[dict[str, Any]]:
    return [submodule for domain in registry_payload()["domains"] for submodule in domain["submodules"]]


def find_domain(domain_id_or_numeric: str | int) -> dict[str, Any] | None:
    needle = str(domain_id_or_numeric)
    for domain in registry_payload()["domains"]:
        if str(domain["id"]) == needle or str(domain["numericId"]) == needle:
            return domain
    return None


def find_submodule(sub_module_id: str | int) -> dict[str, Any] | None:
    needle = str(sub_module_id)
    for submodule in all_submodules():
        if str(submodule["id"]) == needle or str(submodule["numericId"]) == needle:
            return submodule
    return None
