from __future__ import annotations

import json
import re
from collections import Counter
from dataclasses import dataclass
from typing import Any

from backend.app.core.llm_client import chat_completion
from backend.app.core.map_renderer import render_map_svg
from backend.app.core.story_visuals import story_data, visual_atlas, wilhelm_visuals, workbook_knowledge


@dataclass(frozen=True)
class WorkflowPlan:
    visual_type: str = "text"  # text|graph|map|stats|mixed
    keywords: list[str] = None
    chart_keys: list[str] = None
    retrieval_needed: bool = True


def _safe_json(text: str) -> dict[str, Any]:
    if not isinstance(text, str):
        return {}
    text = text.strip()
    if not text:
        return {}
    # tolerate ```json ... ```
    if text.startswith("```"):
        text = text.strip("`")
        text = text.replace("json", "", 1).strip()
    try:
        obj = json.loads(text)
        return obj if isinstance(obj, dict) else {}
    except json.JSONDecodeError:
        # try to locate the first {...} block
        start = text.find("{")
        end = text.rfind("}")
        if start != -1 and end != -1 and end > start:
            try:
                obj = json.loads(text[start : end + 1])
                return obj if isinstance(obj, dict) else {}
            except json.JSONDecodeError:
                return {}
        return {}


CHART_CATALOG = [
    {
        "key": "story_flow_map",
        "visual_type": "map",
        "when": "询问传播路径、传播路线、传播地区、跨国流动、源地到目的地",
        "component": "SplitFlowMap / ChinaStoryMap",
    },
    {
        "key": "wilhelm_reprint_map",
        "visual_type": "map",
        "when": "询问《卫礼贤中国民间故事》再版、传播、流传、出版情况",
        "component": "WilhelmSplitMap",
    },
    {
        "key": "publication_map",
        "visual_type": "map",
        "when": "询问出版地、出版地区、主要出版中心、出版城市分布",
        "component": "PublicationBubbleMap",
    },
    {
        "key": "source_map",
        "visual_type": "map",
        "when": "询问取材来源、来源地、来源省份、地区来源分布",
        "component": "SourceChinaMap",
    },
    {
        "key": "identity_process",
        "visual_type": "mixed",
        "when": "询问译者身份、编者身份、谁在翻译、身份流变",
        "component": "IdentityProcessChart",
    },
    {
        "key": "identity_river",
        "visual_type": "mixed",
        "when": "询问译者身份随时间变化、阶段性参与度、时间河流",
        "component": "IdentityRiverChart",
    },
    {
        "key": "knowledge_graph",
        "visual_type": "graph",
        "when": "询问关系图谱、实体关系、节点网络、路径关联",
        "component": "GraphCanvas",
    },
    {
        "key": "stats_panel",
        "visual_type": "stats",
        "when": "询问数量、趋势、统计分布、Top 排名",
        "component": "StatisticsPanel",
    },
    {
        "key": "preface_cluster",
        "visual_type": "graph",
        "when": "询问序跋主题、序跋话题结构、主题聚类",
        "component": "PrefaceThemeCluster",
    },
    {
        "key": "preface_word_cloud",
        "visual_type": "stats",
        "when": "询问序跋高频词、词云、关键词分布",
        "component": "PrefaceWordCloud",
    },
    {
        "key": "child_theme_cooccurrence",
        "visual_type": "graph",
        "when": "询问子故事主题共现、母题组合、主题关联",
        "component": "ChildThemeCooccurrence",
    },
]
CHART_TYPE_MAP = {item["key"]: item["visual_type"] for item in CHART_CATALOG}

IDENTITY_CHART_KEYS = ["identity_process", "identity_river"]

PUBLICATION_QUESTION_TOKENS = ["出版地", "出版地区", "出版区域", "主要出版地区", "出版中心", "出版城市", "哪里出版"]
SOURCE_QUESTION_TOKENS = ["取材来源", "来源地", "来源省", "来源省份", "来源地区", "哪些地区", "哪些省份"]
IDENTITY_QUESTION_TOKENS = ["译者身份", "编者身份", "身份流变", "身份变化", "谁在翻译", "时间河流"]
WILHELM_MAP_TOKENS = ["卫礼贤", "Richard Wilhelm", "Wilhelm", "Chinesische Volksmärchen", "再版", "传播情况", "流传", "出版情况"]
STORY_FLOW_QUESTION_TOKENS = ["传播情况", "传播路径", "传播路线", "传播地图", "路径图", "流传情况"]


def wants_story_flow_map(question: str) -> bool:
    q = str(question or "").lower()
    has_subject = "多语种中国故事集" in q or "中国故事集" in q
    has_flow_intent = any(token in q for token in STORY_FLOW_QUESTION_TOKENS) or bool(re.search(r"传播.*什么样", q))
    return has_subject and has_flow_intent


def parse_publication_time_range(question: str) -> dict[str, Any] | None:
    q = str(question or "")
    compact = re.sub(r"\s+", "", q)
    current_year = 2026

    match = re.search(r"(\d{4})年?[至到~\-—]+(\d{4})年?", compact)
    if match:
        start, end = sorted([int(match.group(1)), int(match.group(2))])
        return {"start": start, "end": end, "label": f"{start}-{end}"}

    match = re.search(r"(\d{2})世纪(\d{2})年代", compact)
    if match:
        century = int(match.group(1))
        decade = int(match.group(2))
        start = (century - 1) * 100 + decade
        return {"start": start, "end": start + 9, "label": f"{century}世纪{decade}年代"}

    match = re.search(r"(?<!\d)(\d{2})年代", compact)
    if match:
        decade = int(match.group(1))
        start = 1900 + decade if decade >= 30 else 2000 + decade
        return {"start": start, "end": start + 9, "label": f"{start}年代"}

    match = re.search(r"(\d{2})世纪(上半叶|下半叶|初|中叶|末)?", compact)
    if match:
        century = int(match.group(1))
        base_start = (century - 1) * 100 + 1
        base_end = century * 100
        phase = match.group(2) or ""
        ranges = {
            "上半叶": (base_start, base_start + 49),
            "下半叶": (base_start + 50, base_end),
            "初": (base_start, base_start + 9),
            "中叶": (base_start + 39, base_start + 59),
            "末": (base_end - 9, base_end),
        }
        start, end = ranges.get(phase, (base_start, base_end))
        return {"start": start, "end": min(end, current_year), "label": f"{century}世纪{phase}" if phase else f"{century}世纪"}

    match = re.search(r"(\d{4})年?(以前|之前|前)", compact)
    if match:
        end = int(match.group(1))
        return {"start": 0, "end": end, "label": f"{end}年以前"}

    match = re.search(r"(\d{4})年?(以后|之后|以来|后)", compact)
    if match:
        start = int(match.group(1))
        return {"start": start, "end": current_year, "label": f"{start}年以来"}

    if "改革开放以来" in compact:
        return {"start": 1978, "end": current_year, "label": "改革开放以来"}
    if "新中国成立以来" in compact or "建国以来" in compact:
        return {"start": 1949, "end": current_year, "label": "新中国成立以来"}

    match = re.search(r"(\d{4})年", compact)
    if match and any(token in compact for token in ["这一年", "当年", "该年"]):
        year = int(match.group(1))
        return {"start": year, "end": year, "label": f"{year}年"}

    return None


def _point_year_entries(point: dict[str, Any]) -> list[tuple[int, int]]:
    year_counts = point.get("yearCounts") or {}
    if isinstance(year_counts, dict) and year_counts:
        return sorted(
            (int(year), int(count or 0))
            for year, count in year_counts.items()
            if str(year).isdigit() and int(count or 0) > 0
        )
    return [(int(year), 1) for year in sorted(set(point.get("years") or [])) if int(year or 0) > 0]


def _filter_publication_chart_by_time(chart: dict[str, Any], time_range: dict[str, Any] | None) -> dict[str, Any]:
    if not time_range:
        return chart
    start = int(time_range.get("start") or 0)
    end = int(time_range.get("end") or 9999)
    filtered_points: list[dict[str, Any]] = []
    for point in chart.get("points") or []:
        entries = [(year, count) for year, count in _point_year_entries(point) if start <= year <= end]
        if not entries:
            continue
        years = [year for year, _ in entries]
        year_counts = {str(year): count for year, count in entries}
        works = [
            work for work in (point.get("works") or [])
            if start <= int(work.get("year") or 0) <= end
        ]
        filtered_points.append(
            {
                **point,
                "count": sum(count for _, count in entries),
                "years": years,
                "yearCounts": year_counts,
                "works": works,
            }
        )
    filtered_points.sort(key=lambda item: int(item.get("count") or 0), reverse=True)
    return {
        **chart,
        "points": filtered_points,
        "timeRange": time_range,
        "subtitle": f"{chart.get('subtitle') or '出版地图'} 当前已按“{time_range.get('label')}”筛选。",
    }


def _publication_regions_change(chart: dict[str, Any], top_n: int = 5) -> bool:
    points = chart.get("points") or []
    years = sorted({year for point in points for year, _ in _point_year_entries(point)})
    if len(years) <= 1:
        return False
    signatures: list[tuple[str, ...]] = []
    for cutoff in years:
        ranked = []
        for point in points:
            count = sum(count for year, count in _point_year_entries(point) if year <= cutoff)
            if count > 0:
                ranked.append((str(point.get("id") or point.get("city") or point.get("label") or ""), count))
        ranked.sort(key=lambda item: (-item[1], item[0]))
        signature = tuple(item[0] for item in ranked[:top_n])
        if signature and (not signatures or signatures[-1] != signature):
            signatures.append(signature)
    return len(set(signatures)) > 1


def _source_year_entries(point: dict[str, Any]) -> list[tuple[int, int]]:
    counts: Counter = Counter()
    for work in point.get("works") or []:
        year = int(work.get("year") or 0)
        if year:
            counts[year] += 1
    if counts:
        return sorted((year, count) for year, count in counts.items() if count > 0)
    year_counts = point.get("yearCounts") or {}
    if isinstance(year_counts, dict):
        return sorted(
            (int(year), int(count or 0))
            for year, count in year_counts.items()
            if str(year).isdigit() and int(count or 0) > 0
        )
    return []


def _filter_source_chart_by_time(chart: dict[str, Any], time_range: dict[str, Any] | None) -> dict[str, Any]:
    if not time_range:
        return chart
    start = int(time_range.get("start") or 0)
    end = int(time_range.get("end") or 9999)
    filtered_points: list[dict[str, Any]] = []
    for point in chart.get("points") or []:
        works = [
            work for work in (point.get("works") or [])
            if start <= int(work.get("year") or 0) <= end
        ]
        if not works:
            continue
        year_counts: Counter = Counter(int(work.get("year") or 0) for work in works if int(work.get("year") or 0))
        years = sorted(year_counts)
        filtered_points.append(
            {
                **point,
                "count": len(works),
                "years": years,
                "yearCounts": {str(year): count for year, count in sorted(year_counts.items())},
                "works": works,
            }
        )
    filtered_points.sort(key=lambda item: int(item.get("count") or 0), reverse=True)
    return {
        **chart,
        "points": filtered_points,
        "timeRange": time_range,
        "subtitle": f"{chart.get('subtitle') or '取材来源地图'} 当前已按“{time_range.get('label')}”筛选。",
    }


def _source_regions_change(chart: dict[str, Any], top_n: int = 5) -> bool:
    points = chart.get("points") or []
    years = sorted({year for point in points for year, _ in _source_year_entries(point)})
    if len(years) <= 1:
        return False
    signatures: list[tuple[str, ...]] = []
    for cutoff in years:
        ranked = []
        for point in points:
            count = sum(count for year, count in _source_year_entries(point) if year <= cutoff)
            if count > 0:
                ranked.append((str(point.get("province") or point.get("id") or point.get("label") or ""), count))
        ranked.sort(key=lambda item: (-item[1], item[0]))
        signature = tuple(item[0] for item in ranked[:top_n])
        if signature and (not signatures or signatures[-1] != signature):
            signatures.append(signature)
    return len(set(signatures)) > 1


def pick_chart_keys(question: str, visual_type: str) -> list[str]:
    q = (question or "").lower()
    if (("卫礼贤" in question) or ("richard wilhelm" in q) or ("chinesische volksmärchen" in q) or ("wilhelm" in q)) and any(
        token in question or token.lower() in q for token in ["再版", "传播", "传播情况", "流传", "出版情况"]
    ):
        return ["wilhelm_reprint_map"]
    if wants_story_flow_map(question):
        return ["story_flow_map"]
    if any(token in q for token in SOURCE_QUESTION_TOKENS):
        return ["source_map"]
    if any(token in q for token in PUBLICATION_QUESTION_TOKENS):
        return ["publication_map"]
    if any(token in q for token in IDENTITY_QUESTION_TOKENS):
        return IDENTITY_CHART_KEYS
    if any(token in q for token in ["序跋", "前言", "后记"]) and any(token in q for token in ["词云", "高频词", "关键词"]):
        return ["preface_word_cloud"]
    if any(token in q for token in ["序跋", "前言", "后记"]) and any(token in q for token in ["主题", "聚类", "结构"]):
        return ["preface_cluster"]
    if any(token in q for token in ["主题共现", "母题组合", "主题关联", "子故事主题"]):
        return ["child_theme_cooccurrence"]
    if visual_type == "graph":
        return ["knowledge_graph"]
    if visual_type == "stats":
        return ["stats_panel"]
    if visual_type == "mixed":
        return ["knowledge_graph"]
    return []


def plan_workflow(question: str, retrieval_mode: str, model: str, provider: str = "gpt") -> WorkflowPlan:
    q = (question or "").strip()
    q_lower = q.lower()

    identity_hits = IDENTITY_QUESTION_TOKENS
    publication_hits = PUBLICATION_QUESTION_TOKENS
    source_hits = SOURCE_QUESTION_TOKENS
    wilhelm_hits = WILHELM_MAP_TOKENS

    if any(token in q for token in ["序跋", "前言", "后记"]) and any(token in q for token in ["词云", "高频词", "关键词"]):
        keywords = [token for token in ["序跋", "前言", "后记", "词云", "高频词", "关键词"] if token in q]
        return WorkflowPlan(visual_type="stats", keywords=keywords, chart_keys=["preface_word_cloud"], retrieval_needed=True)
    if any(token in q for token in ["序跋", "前言", "后记"]) and any(token in q for token in ["主题", "话题", "聚类", "结构"]):
        keywords = [token for token in ["序跋", "前言", "后记", "主题", "话题", "聚类", "结构"] if token in q]
        return WorkflowPlan(visual_type="graph", keywords=keywords, chart_keys=["preface_cluster"], retrieval_needed=True)

    if (("卫礼贤" in q) or ("richard wilhelm" in q_lower) or ("chinesische volksmärchen" in q_lower) or ("wilhelm" in q_lower)) and any(
        token in q or token.lower() in q_lower for token in ["再版", "传播", "传播情况", "流传", "出版情况"]
    ):
        keywords = [k for k in wilhelm_hits if k in q or k.lower() in q_lower]
        return WorkflowPlan(visual_type="map", keywords=keywords[:12], chart_keys=["wilhelm_reprint_map"], retrieval_needed=True)

    if wants_story_flow_map(q):
        keywords = [k for k in STORY_FLOW_QUESTION_TOKENS if k in q]
        return WorkflowPlan(visual_type="map", keywords=keywords[:12], chart_keys=["story_flow_map"], retrieval_needed=True)

    if any(k in q for k in identity_hits):
        keywords = [k for k in identity_hits if k in q]
        return WorkflowPlan(visual_type="mixed", keywords=keywords, chart_keys=["identity_process", "identity_river"], retrieval_needed=True)
    if any(k in q for k in publication_hits):
        keywords = [k for k in publication_hits if k in q]
        return WorkflowPlan(visual_type="map", keywords=keywords, chart_keys=["publication_map"], retrieval_needed=True)
    if any(k in q for k in source_hits):
        keywords = [k for k in source_hits if k in q]
        return WorkflowPlan(visual_type="map", keywords=keywords, chart_keys=["source_map"], retrieval_needed=True)

    # Deterministic overrides for stability and speed.
    graph_hits = ["知识图谱", "图谱", "关系图", "关系网络", "网络图", "graph"]
    stats_hits = ["统计", "数量", "趋势", "分布", "词云", "词频", "思维导图"]
    map_hits = [
        "地图",
        "传播",
        "路线",
        "路径",
        "地理",
        "出版地",
        "出版地区",
        "主要出版地区",
        "出版中心",
        "取材来源",
        "来源地",
        "来源省",
        "省份",
        "城市",
        "地区",
        "区域",
        "map",
        "route",
    ]

    if any(k.lower() in q_lower for k in graph_hits):
        visual_type = "graph"
        keywords = [k for k in graph_hits if k.lower() in q_lower]
        return WorkflowPlan(visual_type=visual_type, keywords=keywords, chart_keys=pick_chart_keys(q, visual_type), retrieval_needed=True)
    if any(k.lower() in q_lower for k in stats_hits):
        visual_type = "stats"
        keywords = [k for k in stats_hits if k.lower() in q_lower]
        return WorkflowPlan(visual_type=visual_type, keywords=keywords, chart_keys=pick_chart_keys(q, visual_type), retrieval_needed=True)
    # Geography/spread questions default to map unless explicitly asking for graph/stats above.
    if any(k.lower() in q_lower for k in map_hits):
        hits = [k for k in map_hits if k.lower() in q_lower]
        visual_type = "map"
        return WorkflowPlan(visual_type=visual_type, keywords=hits[:12], chart_keys=pick_chart_keys(q, visual_type), retrieval_needed=True)

    system = (
        "你是一个工作流规划器。"
        "任务：根据用户问题，判断需要输出哪种可视化：text/graph/map/stats/mixed，并从候选图表中选择最合适的 chart_keys。"
        "你只返回 JSON，不要输出多余文字。"
        "JSON schema:\n"
        "{\n"
        '  "visual_type": "text|graph|map|stats|mixed",\n'
        '  "keywords": ["..."],\n'
        '  "chart_keys": ["..."],\n'
        '  "retrieval_needed": true|false\n'
        "}\n"
        "判定规则：\n"
        "- 若用户明确提出“知识图谱/图谱/关系图/网络图”，优先 graph。\n"
        "- 若问题涉及地区/省份/城市/出版中心/出版地区/取材来源/传播路线/地图，优先 map。\n"
        "- 若问题涉及统计/数量/趋势/分布/词云/词频/思维导图，优先 stats。\n"
        "- 若同时明确需要地图与图谱，返回 mixed。\n"
        "- 若问题涉及“译者身份流变/编者身份流变/谁在翻译/身份变化/时间河流”，必须优先返回 chart_keys=['identity_process','identity_river']，visual_type= mixed；不得返回 stats_panel 作为主图。\n"
        "- 若问题涉及“出版地/主要出版地区/出版中心”，必须优先返回 publication_map；如同时询问传播，可同时返回 story_flow_map。\n"
        "- 若问题涉及“取材来源/来源地/来源省份”，必须优先返回 source_map；不得仅返回通用统计图。\n"
        "- 若问题涉及“卫礼贤中国民间故事”的再版、传播或出版情况，必须优先返回 wilhelm_reprint_map。\n"
        "注意：检索技术 retrievalMode 只是技术选项，不代表用户一定想要图谱。\n"
        "候选图表：\n"
        + "\n".join([f"- {item['key']} | {item['component']} | 适用：{item['when']}" for item in CHART_CATALOG])
    )
    user = f"retrievalMode={retrieval_mode}\n用户问题：{q}"
    raw = chat_completion(
        [{"role": "system", "content": system}, {"role": "user", "content": user}],
        model=model,
        provider=provider,
        timeout=45,
    )
    data = _safe_json(raw)
    visual_type = str(data.get("visual_type") or "text").strip().lower()
    if visual_type not in {"text", "graph", "map", "stats", "mixed"}:
        visual_type = "text"
    keywords = data.get("keywords") if isinstance(data.get("keywords"), list) else []
    keywords = [str(k).strip() for k in keywords if str(k).strip()][:12]
    chart_keys = data.get("chart_keys") if isinstance(data.get("chart_keys"), list) else []
    chart_keys = [str(k).strip() for k in chart_keys if str(k).strip()]
    valid_chart_keys = {item["key"] for item in CHART_CATALOG}
    chart_keys = [item for item in chart_keys if item in valid_chart_keys]
    if not chart_keys:
        chart_keys = pick_chart_keys(q, visual_type)
    if any(token in q for token in ["译者身份", "编者身份", "身份流变", "谁在翻译", "身份变化", "时间河流"]):
        chart_keys = IDENTITY_CHART_KEYS
        visual_type = "mixed"
    if visual_type == "text" and chart_keys:
        chart_types = {CHART_TYPE_MAP.get(item, "text") for item in chart_keys}
        if len(chart_types) > 1 or len(chart_keys) > 1:
            visual_type = "mixed"
        else:
            visual_type = next(iter(chart_types))
    retrieval_needed = bool(data.get("retrieval_needed", True))
    return WorkflowPlan(visual_type=visual_type, keywords=keywords, chart_keys=chart_keys, retrieval_needed=retrieval_needed)


MAX_STORY_CONTEXT_LINES = 120
MAX_STORY_CONTEXT_CHARS = 24000
MAX_USER_PROMPT_CHARS = 32000


def _limit_lines(lines: list[str], *, max_lines: int, max_chars: int) -> list[str]:
    trimmed: list[str] = []
    total_chars = 0
    for line in lines:
        text = str(line or "").strip()
        if not text:
            continue
        addition = len(text) + 1
        if len(trimmed) >= max_lines or total_chars + addition > max_chars:
            break
        trimmed.append(text)
        total_chars += addition
    return trimmed


def _compact_rows(rows: list[str], *, heading: str, max_items: int, max_chars: int) -> list[str]:
    limited = _limit_lines(rows, max_lines=max_items, max_chars=max_chars)
    if not limited:
        return []
    hidden = max(0, len(rows) - len(limited))
    summary = f"{heading}（展示 {len(limited)} 条"
    if hidden:
        summary += f"，省略 {hidden} 条"
    summary += "）："
    return [summary, *limited]


def _trim_user_prompt(prompt: str, context_lines: list[str]) -> str:
    base = prompt.split("召回证据：\n", 1)[0] + "召回证据：\n"
    lines = list(context_lines)
    while lines:
        joined = "\n".join(lines)
        candidate = base + joined
        if len(candidate) <= MAX_USER_PROMPT_CHARS:
            return candidate
        lines = lines[:-8]
    return base + "证据过长，已自动裁剪；请优先依据全库统计与高相关样本回答。"


def _publication_answer_from_visual_atlas(question: str, chart: dict[str, Any] | None = None) -> str:
    chart = chart or (visual_atlas().get("charts") or {}).get("publicationMap") or {}
    points = list(chart.get("points") or [])
    if not points:
        return ""
    top_points = sorted(points, key=lambda item: int(item.get("count") or 0), reverse=True)
    city_lines = []
    for item in top_points[:8]:
        label = str(item.get("label") or item.get("city") or "未标注")
        count = int(item.get("count") or 0)
        country = str(item.get("country") or "").strip()
        if country:
            city_lines.append(f"{label}（{country}，{count}种）")
        else:
            city_lines.append(f"{label}（{count}种）")

    country_counter = Counter()
    for item in top_points:
        country = str(item.get("country") or "未标注").strip()
        country_counter[country] += int(item.get("count") or 0)
    country_lines = [f"{name} {count}种" for name, count in country_counter.most_common(5)]

    time_range = chart.get("timeRange") or parse_publication_time_range(question)
    answer_parts = []
    if time_range:
        answer_parts.append(f"在“{time_range.get('label')}”这一时间阶段内，德译中国故事集的主要出版地区如下。")
    else:
        answer_parts.append("德译中国故事集的主要出版地区明显集中在德国，其次是中国。")
    if country_lines:
        answer_parts.append("按国家聚合，最活跃的出版区域依次为：" + "；".join(country_lines) + "。")
    if city_lines:
        answer_parts.append("按城市看，最主要的出版中心包括：" + "；".join(city_lines) + "。")

    if any(token in str(question or "") for token in ["哪些", "哪些地方", "哪里", "主要出版地区", "出版城市", "出版中心"]):
        examples = []
        for item in top_points[:3]:
            works = list(item.get("works") or [])
            if not works:
                continue
            sample_titles = "；".join(str(work.get("title") or "未记录") for work in works[:2])
            examples.append(f"{item.get('label') or item.get('city')}可见《{sample_titles.replace(' / ', '》与《')}》等")
        if examples:
            answer_parts.append("例如，" + "；".join(examples) + "。")
    return "\n\n".join(answer_parts)


def build_stories_context(question: str, target_items: list[dict[str, Any]]) -> list[str]:
    corpus = story_data()
    collections = corpus.get("collections", [])
    children = corpus.get("childStories", [])
    workbook_rows = workbook_knowledge()
    q = str(question or "")

    language_top = Counter(str(item.get("language") or "未标注") for item in children).most_common(8)
    city_top = Counter(str(item.get("place") or item.get("city") or "未标注") for item in children).most_common(10)
    role_top = Counter(str(item.get("editorRole") or "未标注") for item in collections).most_common(8)

    workbook_names = "、".join([
        "地图_中国故事集总表_知识库.xlsx",
        "地图_中国民间童话.xlsx",
        "数据库信息.xlsx",
        "中国故事集_序跋.xlsx",
        "中国故事集_子故事（3533篇）.xlsx",
        "中国故事集总表_知识库.xlsx",
    ])
    related_items = _limit_lines([
        f"- {item.get('canonicalTitle')} / {item.get('translatedTitle')}，{item.get('year')}，{item.get('language')}，{item.get('city')}，{item.get('country')}，译者/作者：{item.get('translator') or item.get('author')}。摘要：{item.get('summary', '')[:140]}"
        for item in target_items
    ], max_lines=12, max_chars=3600)
    lines = [
        f"- 全库概况：故事集 {len(collections)} 部；子故事/条目 {len(children)} 条。",
        f"- 全库语种 Top：{'；'.join(f'{name} {count}' for name, count in language_top)}。",
        f"- 全库出版地 Top：{'；'.join(f'{name} {count}' for name, count in city_top)}。",
        f"- 全库译者/编者身份 Top：{'；'.join(f'{name} {count}' for name, count in role_top)}。",
        f"- 外部表格知识：{len(workbook_rows)} 条记录（来源：{workbook_names}；若文件存在且可读取）。",
        "- 可调用地图工具算子：publication_map=德译中国故事集出版地图；source_map=德译中国故事集取材来源地图；wilhelm_reprint_map=德译中国故事集故事来源及出版地参照图。",
        "- 相关故事集条目：",
        *related_items,
    ]

    if any(token in q for token in IDENTITY_QUESTION_TOKENS):
        role_rows = []
        for item in collections:
            role = str(item.get("editorRole") or "").strip()
            editor = str(item.get("editor") or "").strip()
            if not role and not editor:
                continue
            role_rows.append(
                f"- {item.get('chineseTitle') or item.get('name') or '未命名'}｜{item.get('year') or '未标年'}｜译者/编者：{editor or '未记载'}｜身份：{role or '未标注'}｜出版社：{item.get('publisher') or '未记载'}"
            )
        role_top_examples = []
        for role, count in role_top[:6]:
            role_top_examples.append(f"- 身份聚合：{role} {count} 部故事集")
        lines.extend(role_top_examples)
        lines.extend(_compact_rows(role_rows, heading="- 译者/编者身份相关样本", max_items=24, max_chars=4200))
        workbook_identity = []
        for row in workbook_rows:
            row_text = " ".join(str(value or "") for value in row.values())
            if re.search(r"译者|编者|身份|editor|translator|Wilhelm|Richard", row_text, re.I):
                workbook_identity.append(f"- [{row.get('_workbook')}/{row.get('_sheet')}] {row_text[:280]}")
        if workbook_identity:
            lines.extend(_compact_rows(workbook_identity, heading="- 外部表格中的译者/编者身份相关记录", max_items=18, max_chars=3600))

    elif any(token in q for token in PUBLICATION_QUESTION_TOKENS):
        publication_rows = []
        publication_city_top = Counter()
        for child in children:
            place = str(child.get("place") or "").strip()
            if not place:
                continue
            publication_city_top[place] += 1
            publication_rows.append(
                f"- {child.get('bookName') or child.get('canonicalName') or '未命名'}｜{child.get('year') or '未标年'}｜{child.get('language') or '未标语种'}｜出版地：{place}｜出版社：{child.get('publisher') or '未记载'}｜译者：{child.get('translator') or '未记载'}"
            )
        lines.append(
            f"- 出版地聚合 Top：{'；'.join(f'{name} {count}' for name, count in publication_city_top.most_common(12)) or '暂无'}。"
        )
        lines.extend(_compact_rows(publication_rows, heading="- 子故事层出版信息样本", max_items=28, max_chars=5200))
        workbook_publication = []
        for row in workbook_rows:
            row_text = " ".join(str(value or "") for value in row.values())
            if re.search(r"出版|城市|地点|place|publisher|Berlin|Beijing|Shanghai|德国|中国", row_text, re.I):
                workbook_publication.append(f"- [{row.get('_workbook')}/{row.get('_sheet')}] {row_text[:280]}")
        if workbook_publication:
            lines.extend(_compact_rows(workbook_publication, heading="- 外部表格中的出版相关记录", max_items=24, max_chars=4800))

    elif any(token in q for token in SOURCE_QUESTION_TOKENS):
        source_rows = []
        source_province_top = Counter()
        for collection in collections:
            province = collection.get("province") or collection.get("sourceProvince")
            child_count = len(collection.get("matchedChildIds") or [])
            if not province and not child_count:
                continue
            if province:
                source_province_top[str(province)] += 1
            source_rows.append(
                f"- {collection.get('chineseTitle') or collection.get('name') or '未命名'}｜{collection.get('year') or '未标年'}｜来源省份：{province or '未标注'}｜关联子故事：{child_count}｜出版社：{collection.get('publisher') or '未记载'}"
            )
        lines.append(
            f"- 来源省份聚合 Top：{'；'.join(f'{name} {count}' for name, count in source_province_top.most_common(12)) or '暂无'}。"
        )
        lines.extend(_compact_rows(source_rows, heading="- 故事集来源信息样本", max_items=24, max_chars=4200))
        workbook_sources = []
        for row in workbook_rows:
            row_text = " ".join(str(value or "") for value in row.values())
            if re.search(r"来源|取材|省|地区|民族|source|province|region", row_text, re.I):
                workbook_sources.append(f"- [{row.get('_workbook')}/{row.get('_sheet')}] {row_text[:280]}")
        if workbook_sources:
            lines.extend(_compact_rows(workbook_sources, heading="- 外部表格中的来源相关记录", max_items=20, max_chars=3600))

    return _limit_lines(lines, max_lines=MAX_STORY_CONTEXT_LINES, max_chars=MAX_STORY_CONTEXT_CHARS)


def run_workflow(
    *,
    question: str,
    retrieval_mode: str,
    model: str,
    provider: str,
    section: dict[str, Any],
    target_items: list[dict[str, Any]],
    map_flows: list[dict[str, Any]],
    knowledge_sections: list[dict[str, Any]],
) -> dict[str, Any]:
    plan = plan_workflow(question, retrieval_mode, model, provider=provider)
    target_ids = {item.get("id") for item in target_items if item.get("id")}
    atlas_charts = (visual_atlas().get("charts") or {}) if section.get("id") == "stories" else {}
    publication_time_range = parse_publication_time_range(question) if "publication_map" in (plan.chart_keys or []) else None
    source_time_range = parse_publication_time_range(question) if "source_map" in (plan.chart_keys or []) else None
    publication_chart = None
    source_chart = None
    if "publication_map" in (plan.chart_keys or []) and atlas_charts.get("publicationMap"):
        publication_chart = _filter_publication_chart_by_time(atlas_charts["publicationMap"], publication_time_range)
        if publication_time_range:
            changed = _publication_regions_change(publication_chart)
            publication_chart["timelineMode"] = "timeline" if changed else "static"
            publication_chart["timelineReason"] = "主要出版地区随时间阶段变化" if changed else "主要出版地区在该时间阶段内无明显变化"
    if "source_map" in (plan.chart_keys or []) and atlas_charts.get("sourceMap"):
        source_chart = _filter_source_chart_by_time(atlas_charts["sourceMap"], source_time_range)
        if source_time_range:
            changed = _source_regions_change(source_chart)
            source_chart["timelineMode"] = "timeline" if changed else "static"
            source_chart["timelineReason"] = "取材来源地区随时间阶段变化" if changed else "取材来源地区在该时间阶段内无明显变化"

    # Step 1: natural language answer (keep existing behavior: evidence + attachments are already upstream in routes)
    # Here we only add a short workflow header to help the user understand the pipeline.
    workflow_note = (
        f"（工作流：识别类型={plan.visual_type}；关键词={('、'.join(plan.keywords) if plan.keywords else '无')}；图表={('、'.join(plan.chart_keys) if plan.chart_keys else '无')}）\n"
        if plan.visual_type != "text"
        else ""
    )

    source_summary_prompt = (
        "当前问题询问德译中国故事集取材来源地区。回答必须是总体摘要，不要逐条列举具体故事集或外部表格记录。\n"
        "请用 2-3 个自然段概括：主要来源地区格局、是否呈现区域集中/分散、数据标注是否完整。\n"
        "可以概括性提到代表性区域名称，但不要写成编号清单，不要逐条给出书名、年份、出版社和文件来源。\n"
        "证据只用于支撑判断，不要在回答中展开证据清单。\n"
        if "source_map" in (plan.chart_keys or []) else ""
    )
    answer_prompt = (
        "请回答用户问题。回答使用中文，结构清晰。\n"
        "不要使用 Markdown 标题、井号、星号或项目符号。\n"
        "请使用自然段分段书写，每段之间空一行。\n"
        "除非用户明确要求列清单，否则不要使用编号列表。\n"
        "如果你需要引用证据，请在回答中指出对应条目（标题/年份/地点/语种/译者/作者）。\n"
        "不要编造不存在的文献。\n"
        f"{source_summary_prompt}"
    )
    context_lines = [
        f"- {item.get('canonicalTitle')} / {item.get('translatedTitle')}，{item.get('year')}，{item.get('language')}，{item.get('city')}，{item.get('country')}，译者/作者：{item.get('translator') or item.get('author')}。摘要：{item.get('summary', '')}"
        for item in target_items
    ]
    if section.get("id") == "stories":
        context_lines = build_stories_context(question, target_items)
    if publication_chart and publication_time_range:
        top_regions = "；".join(
            f"{point.get('label') or point.get('city')} {point.get('count')}种"
            for point in (publication_chart.get("points") or [])[:8]
        ) or "该时间阶段内暂无出版地区记录"
        context_lines = [
            f"- 已识别时间阶段：{publication_time_range.get('label')}（{publication_time_range.get('start')}-{publication_time_range.get('end')}）。",
            f"- 时间筛选后的主要出版地区：{top_regions}。",
            f"- 地图生成策略：{publication_chart.get('timelineReason') or '按该时间阶段生成出版地区地图'}。",
            *context_lines,
        ]
    if source_chart and source_time_range:
        top_sources = "；".join(
            f"{point.get('province') or point.get('label')} {point.get('count')}条"
            for point in (source_chart.get("points") or [])[:8]
        ) or "该时间阶段内暂无取材来源地区记录"
        context_lines = [
            f"- 已识别时间阶段：{source_time_range.get('label')}（{source_time_range.get('start')}-{source_time_range.get('end')}）。",
            f"- 时间筛选后的主要取材来源地区：{top_sources}。",
            f"- 地图生成策略：{source_chart.get('timelineReason') or '按该时间阶段生成取材来源地图'}。",
            *context_lines,
        ]
    elif source_chart:
        top_sources = "；".join(
            f"{point.get('province') or point.get('label')} {point.get('count')}条"
            for point in (source_chart.get("points") or [])[:8]
        ) or "暂无可聚合的取材来源地区记录"
        context_lines = [
            f"- 取材来源地区聚合摘要：{top_sources}。",
            "- 回答要求：围绕聚合格局做总体摘要，不要逐条复述下方样本记录。",
            *context_lines,
        ]
    user_prompt = (
        f"{answer_prompt}\n"
        f"用户问题：{question}\n"
        f"知识库分区：{section.get('title')}\n"
        f"召回证据：\n" + "\n".join(context_lines)
    )
    user_prompt = _trim_user_prompt(user_prompt, context_lines)
    try:
        answer_text = chat_completion(
            [{"role": "system", "content": "你是中国文学海外译介与中国叙事知识平台的研究型智能问答助手。"}, {"role": "user", "content": user_prompt}],
            model=model,
            provider=provider,
            timeout=90,
        )
    except RuntimeError:
        answer_text = ""
        if section.get("id") == "stories" and any(token in str(question or "") for token in PUBLICATION_QUESTION_TOKENS):
            answer_text = _publication_answer_from_visual_atlas(question, publication_chart)
        if not answer_text:
            raise

    visuals: dict[str, Any] = {
        "type": plan.visual_type,
        "chartKeys": plan.chart_keys or [],
        "records": [item.get("id") for item in target_items if item.get("id")],
        "graph": {"focusNodeIds": list({node_id for item in target_items for node_id in (item.get("graphNodeIds") or [])})},
        "map": {"flows": [flow for flow in map_flows if flow.get("id") in target_ids]},
        "charts": {},
        "tools": [
            {"name": "publication_map", "label": "德译中国故事集出版地图", "kind": "map_operator", "enabled": "publication_map" in (plan.chart_keys or [])},
            {"name": "source_map", "label": "德译中国故事集取材来源地图", "kind": "map_operator", "enabled": "source_map" in (plan.chart_keys or [])},
            {"name": "wilhelm_reprint_map", "label": "德译中国故事集故事来源及出版地参照图", "kind": "map_operator", "enabled": "wilhelm_reprint_map" in (plan.chart_keys or [])},
            {"name": "identity_process", "label": "德译中国故事集译者身份流变图", "kind": "chart_operator", "enabled": "identity_process" in (plan.chart_keys or [])},
            {"name": "identity_river", "label": "译者身份流变图：时间河流", "kind": "chart_operator", "enabled": "identity_river" in (plan.chart_keys or [])},
            {"name": "preface_cluster", "label": "序跋文本主题聚类图", "kind": "chart_operator", "enabled": "preface_cluster" in (plan.chart_keys or [])},
            {"name": "preface_word_cloud", "label": "序跋文本词云图", "kind": "chart_operator", "enabled": "preface_word_cloud" in (plan.chart_keys or [])},
            {"name": "child_theme_cooccurrence", "label": "子故事主题共现图", "kind": "chart_operator", "enabled": "child_theme_cooccurrence" in (plan.chart_keys or [])},
        ],
    }
    if publication_chart:
        visuals["charts"]["publicationMap"] = publication_chart
    if source_chart:
        visuals["charts"]["sourceMap"] = source_chart
    if "wilhelm_reprint_map" in (plan.chart_keys or []):
        wilhelm_chart = wilhelm_visuals()
        if atlas_charts.get("wilhelmPublicationMap"):
            visuals["charts"]["wilhelmPublicationMap"] = atlas_charts["wilhelmPublicationMap"]
        elif wilhelm_chart.get("publicationMap"):
            visuals["charts"]["wilhelmPublicationMap"] = wilhelm_chart["publicationMap"]
        visuals["wilhelm"] = {"flows": wilhelm_chart.get("flows", [])}
    if "identity_process" in (plan.chart_keys or []) and atlas_charts.get("identityProcess"):
        visuals["charts"]["identityProcess"] = atlas_charts["identityProcess"]
    if "identity_river" in (plan.chart_keys or []) and atlas_charts.get("identityRiver"):
        visuals["charts"]["identityRiver"] = atlas_charts["identityRiver"]
    if "preface_cluster" in (plan.chart_keys or []) and atlas_charts.get("prefaceCluster"):
        visuals["charts"]["prefaceCluster"] = atlas_charts["prefaceCluster"]
    if "preface_word_cloud" in (plan.chart_keys or []) and atlas_charts.get("wordCloud"):
        visuals["charts"]["wordCloud"] = atlas_charts["wordCloud"]
    if "child_theme_cooccurrence" in (plan.chart_keys or []) and atlas_charts.get("childCooccurrence"):
        visuals["charts"]["childCooccurrence"] = atlas_charts["childCooccurrence"]

    images: list[dict[str, Any]] = []
    allow_rendered_flow_map = section.get("id") != "stories" or wants_story_flow_map(question)
    if plan.visual_type in {"map", "mixed"} and visuals["map"]["flows"] and allow_rendered_flow_map:
        rendered = render_map_svg(
            flows=visuals["map"]["flows"],
            sections=knowledge_sections,
            mode="flow",
            year=None,
            title=f"{section.get('title') or '知识库'}传播地图",
        )
        svg_text = str(rendered.get("svg") or "")
        if svg_text:
            images.append(
                {
                    "type": "image/svg+xml",
                    "title": rendered.get("title") or "传播地图",
                    "data": svg_text,
                }
            )

    return {
        "answer": (workflow_note + (answer_text or "")).strip(),
        "visuals": visuals,
        "citations": [f"{item.get('resourceType')}｜{item.get('translatedTitle')}｜{item.get('city')}，{item.get('year')}" for item in target_items],
        "workflow": {
            "provider": provider,
            "model": model,
            "sectionId": section.get("id"),
            "plan": {"visual_type": plan.visual_type, "keywords": plan.keywords, "chart_keys": plan.chart_keys or [], "retrieval_needed": plan.retrieval_needed},
            "steps": ["LLM 规划", "证据召回", "LLM 回答", "工具算子生成" if images or plan.visual_type != "text" else "完成"],
        },
        "images": images,
    }
