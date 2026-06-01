from __future__ import annotations

import json
import re
from collections import Counter, defaultdict
from pathlib import Path
from typing import Any


ROOT = Path(__file__).resolve().parents[3]
STORY_DATA_PATH = ROOT / "frontend" / "src" / "data" / "storyCollections.json"

STAGES = [
    {"id": "early", "title": "1910s-1930s", "note": "早期译介", "range": [1910, 1940]},
    {"id": "middle", "title": "1950s-1970s", "note": "学术整理", "range": [1950, 1980]},
    {"id": "late", "title": "1980s-2000s", "note": "文学与出版扩展", "range": [1980, 2010]},
    {"id": "recent", "title": "2010s-2020s", "note": "多主体参与", "range": [2010, 2030]},
]

CITY_COORDS = {
    "Berlin": [13.405, 52.52],
    "Jena": [11.59, 50.93],
    "München": [11.58, 48.14],
    "Leipzig": [12.37, 51.34],
    "Frankfurt am Main": [8.68, 50.11],
    "Stuttgart": [9.18, 48.78],
    "Basel": [7.59, 47.56],
    "Sankt Augustin": [7.19, 50.78],
    "Esslingen": [9.31, 48.74],
    "Norderstedt": [9.98, 53.71],
    "Bickenbach": [8.62, 49.76],
    "Hamburg": [9.99, 53.55],
    "Köln": [6.96, 50.94],
    "Düsseldorf": [6.77, 51.23],
    "Freiburg": [7.85, 47.99],
    "Eisennach": [10.32, 50.98],
    "Eisenach": [10.32, 50.98],
    "Kassel": [9.49, 51.31],
    "Zürich": [8.54, 47.38],
    "Prag": [14.42, 50.08],
    "Wien": [16.37, 48.21],
    "Peking": [116.4, 39.9],
    "Beijing": [116.4, 39.9],
    "北京": [116.4, 39.9],
    "Shanghai": [121.47, 31.23],
    "上海": [121.47, 31.23],
    "Bayreuth": [11.58, 49.95],
    "Meerbusch": [6.69, 51.25],
    "Augsburg": [10.9, 48.37],
    "Bielefeld": [8.53, 52.02],
    "Schiedlberg": [14.27, 48.1],
    "Kreuzlingen": [9.18, 47.65],
}

PROVINCE_COORDS = {
    "北京": [116.4, 39.9],
    "天津": [117.2, 39.12],
    "河北": [114.5, 38.04],
    "山西": [112.55, 37.87],
    "内蒙古": [111.67, 40.82],
    "辽宁": [123.43, 41.8],
    "吉林": [125.32, 43.9],
    "黑龙江": [126.64, 45.76],
    "上海": [121.47, 31.23],
    "江苏": [118.8, 32.1],
    "浙江": [120.2, 30.3],
    "安徽": [117.27, 31.86],
    "福建": [119.3, 26.08],
    "江西": [115.86, 28.68],
    "山东": [117.0, 36.7],
    "河南": [113.62, 34.75],
    "湖北": [114.3, 30.6],
    "湖南": [112.98, 28.2],
    "广东": [113.27, 23.13],
    "广西": [108.32, 22.82],
    "海南": [110.35, 20.02],
    "重庆": [106.55, 29.56],
    "四川": [104.06, 30.67],
    "贵州": [106.63, 26.65],
    "云南": [102.71, 25.04],
    "西藏": [91.13, 29.65],
    "陕西": [108.94, 34.34],
    "甘肃": [103.82, 36.06],
    "青海": [101.78, 36.62],
    "宁夏": [106.27, 38.47],
    "新疆": [87.62, 43.82],
    "台湾": [121.0, 23.7],
    "香港": [114.17, 22.32],
    "澳门": [113.55, 22.2],
}

CITY_ZH = {
    "Berlin": "柏林",
    "Jena": "耶拿",
    "München": "慕尼黑",
    "Leipzig": "莱比锡",
    "Frankfurt am Main": "法兰克福",
    "Stuttgart": "斯图加特",
    "Basel": "巴塞尔",
    "Sankt Augustin": "圣奥古斯丁",
    "Esslingen": "埃斯林根",
    "Norderstedt": "诺德施泰特",
    "Bickenbach": "比肯巴赫",
    "Hamburg": "汉堡",
    "Köln": "科隆",
    "Düsseldorf": "杜塞尔多夫",
    "Freiburg": "弗赖堡",
    "Eisennach": "艾森纳赫",
    "Eisenach": "艾森纳赫",
    "Kassel": "卡塞尔",
    "Zürich": "苏黎世",
    "Prag": "布拉格",
    "Wien": "维也纳",
    "Peking": "北京",
    "Beijing": "北京",
    "北京": "北京",
    "Shanghai": "上海",
    "上海": "上海",
    "Bayreuth": "拜罗伊特",
    "Meerbusch": "梅尔布施",
    "Augsburg": "奥格斯堡",
    "Bielefeld": "比勒费尔德",
    "Schiedlberg": "席德尔贝格",
    "Kreuzlingen": "克罗伊茨林根",
}

PREFACE_CLUSTERS = [
    {"id": "translate", "title": "翻译与改写", "terms": ["翻译", "改写", "选编", "转述", "忠实", "传播"]},
    {"id": "image", "title": "中国形象", "terms": ["中国", "东方", "古老", "神秘", "智慧", "异域"]},
    {"id": "folk", "title": "民间叙事", "terms": ["民间故事", "童话", "传说", "寓言", "神怪", "动物故事"]},
    {"id": "reader", "title": "读者与教育", "terms": ["儿童", "教育", "读者", "道德", "学习", "后记"]},
    {"id": "mediation", "title": "文化中介", "terms": ["汉学", "译者", "出版社", "交流", "理解", "文化"]},
]


def story_data() -> dict[str, Any]:
    with STORY_DATA_PATH.open("r", encoding="utf-8") as file:
        return json.load(file)


def short(text: Any, limit: int = 16) -> str:
    value = str(text or "未记录")
    return value if len(value) <= limit else value[: limit - 1] + "…"


def classify_role(role: str = "", editor: str = "") -> str:
    text = f"{role} {editor}"
    if "传教士" in text:
        return "传教士"
    if "民俗" in text:
        return "民俗学家"
    if any(mark in text for mark in ["汉学", "藏学", "教授", "学者"]):
        return "汉学家"
    if any(mark in text for mark in ["出版", "出版社", "出版商"]):
        return "出版机构"
    if any(mark in text for mark in ["作家", "改写", "记者", "文学"]):
        return "作家/改写者"
    if any(mark in text for mark in ["中国", "中德", "北外", "教师", "译者"]):
        return "中国译者/中德合作"
    return "学术编选者"


def stage_for(year: Any) -> dict[str, Any]:
    value = int(year or 0)
    for stage in STAGES:
        if value >= stage["range"][0] and value < stage["range"][1]:
            return stage
    return STAGES[0]


def clean_cities(value: str = "") -> list[str]:
    text = str(value or "").replace("Zurich", "Zürich")
    matched = [city for city in CITY_COORDS if city in text]
    if matched:
        return matched
    return [item.strip() for item in re.split(r"/|,|，| und | u\.a\.|;|；", text) if item.strip()]


def terms_count(text: str) -> Counter:
    source = str(text or "").lower()
    counts: Counter = Counter()
    for term in [term for cluster in PREFACE_CLUSTERS for term in cluster["terms"]]:
        escaped = re.escape(term.lower())
        counts[term] = max(len(re.findall(escaped, source)), 2 if len(term) > 2 else 1)
    return counts


def preface_source(collections: list[dict[str, Any]]) -> str:
    return "\n".join(
        " ".join(
            str(part or "")
            for part in [item.get("name"), item.get("foreignTitle"), item.get("prefaceAuthor"), item.get("editorRole"), item.get("publisher")]
        )
        for item in collections
    )


def child_themes(child: dict[str, Any]) -> list[str]:
    text = "".join(str(child.get(key) or "") for key in ["canonicalName", "variantName", "storyType", "notes"])
    themes: list[str] = []
    rules = [
        ("龙蛇", r"龙|蛇"),
        ("神仙", r"神|仙|嫦娥|女娲|八仙|天"),
        ("道士", r"道士|和尚|僧"),
        ("法术", r"法|魔|妖|变|怪"),
        ("梦", r"梦"),
        ("狐狸", r"狐"),
        ("婚姻", r"婚|妻|夫|牛郎|织女|梁山伯|祝英台|孟姜女|白蛇"),
        ("孝道", r"孝|父|母"),
        ("报恩", r"报|恩"),
        ("动物", r"虎|兔|马|蛙|鸟|鱼|猫|狗|猴|鼠|动物"),
        ("寓言", r"守株|狐假|画蛇|井底|刻舟|滥竽|自相|亡羊|寓言"),
        ("智慧", r"智|聪明|计|巧"),
    ]
    for name, pattern in rules:
        if re.search(pattern, text):
            themes.append(name)
    if not themes and child.get("canonicalName"):
        themes.append(short(child.get("canonicalName"), 5))
    return list(dict.fromkeys(themes))[:3]


def identity_process(collections: list[dict[str, Any]]) -> dict[str, Any]:
    columns = []
    for stage in STAGES:
        rows = [item for item in collections if stage_for(item.get("year"))["id"] == stage["id"]]
        top = Counter(classify_role(item.get("editorRole", ""), item.get("editor", "")) for item in rows).most_common(3)
        columns.append({**stage, "roles": [{"name": name, "count": count} for name, count in top]})
    return {
        "type": "identityProcess",
        "title": "德译中国故事集译者身份流变图",
        "subtitle": "按出版阶段展示“谁在翻译、编选和传播”。",
        "columns": columns,
        "steps": ["整理译者/编者信息", "标注身份类别", "按年代统计变化", "分析传播主体转移"],
    }


def identity_river(collections: list[dict[str, Any]]) -> dict[str, Any]:
    roles = ["传教士", "汉学家", "民俗学家", "作家/改写者", "出版机构", "中国译者/中德合作"]
    series = []
    for role in roles:
        values = []
        for stage in STAGES:
            count = sum(
                1
                for item in collections
                if stage_for(item.get("year"))["id"] == stage["id"]
                and classify_role(item.get("editorRole", ""), item.get("editor", "")) == role
            )
            values.append(count)
        series.append({"role": role, "values": values})
    return {
        "type": "identityRiver",
        "title": "译者身份流变图：时间河流",
        "subtitle": "线带越宽，表示该身份在该时期参与度越高。",
        "stages": STAGES,
        "series": series,
    }


def publication_map(collections: list[dict[str, Any]], title: str = "德译中国故事集出版地图") -> dict[str, Any]:
    cities: dict[str, dict[str, Any]] = {}
    china_cities = {"Peking", "Beijing", "北京", "Shanghai", "上海"}
    for item in collections:
        for city in clean_cities(item.get("city") or item.get("publisher", "")):
            if city not in CITY_COORDS:
                continue
            record = cities.setdefault(
                city,
                {
                    "id": city,
                    "city": city,
                    "label": CITY_ZH.get(city, city),
                    "coords": CITY_COORDS[city],
                    "count": 0,
                    "years": [],
                    "publishers": set(),
                    "country": "中国" if city in china_cities else item.get("country") or "德国/德语区",
                },
            )
            record["count"] += 1
            if item.get("year"):
                record["years"].append(item["year"])
            if item.get("publisher"):
                record["publishers"].add(item["publisher"])
    points = []
    for item in sorted(cities.values(), key=lambda row: row["count"], reverse=True):
        points.append({**item, "publishers": sorted(item["publishers"])[:8]})
    return {
        "type": "publicationMap",
        "title": title,
        "subtitle": "圆点越大表示出版城市越活跃；真实地图显示德国、德语区与中国出版节点。",
        "geo": {
            "world": "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson",
            "china": "https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json",
            "countries": ["Germany", "China", "Switzerland", "Austria", "Czechia"],
        },
        "points": points,
    }


def source_map(flows: list[dict[str, Any]]) -> dict[str, Any]:
    counts = Counter(flow.get("province") or "未记录" for flow in flows)
    points = []
    for province, count in counts.most_common():
        if province == "未记录":
            continue
        first = next((flow for flow in flows if flow.get("province") == province), {})
        points.append(
            {
                "id": province,
                "province": province,
                "label": province,
                "count": count,
                "coords": first.get("from") or [116.4, 39.9],
                "examples": [flow.get("title") for flow in flows if flow.get("province") == province][:5],
            }
        )
    return {
        "type": "sourceMap",
        "title": "德译中国故事集取材来源地图",
        "subtitle": "以中国地图呈现故事来源、民族来源和地域叙事分布。",
        "geo": {"china": "https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json"},
        "points": points,
    }


def preface_cluster(collections: list[dict[str, Any]]) -> dict[str, Any]:
    text = preface_source(collections)
    counts = terms_count(text)
    nodes = []
    for cluster in PREFACE_CLUSTERS:
        for term in cluster["terms"]:
            nodes.append({"id": term, "label": term, "cluster": cluster["id"], "count": counts[term]})
    edges_seed = [
        ("翻译", "改写"),
        ("翻译", "选编"),
        ("翻译", "忠实"),
        ("传播", "民间故事"),
        ("民间故事", "童话"),
        ("中国", "东方"),
        ("东方", "神秘"),
        ("古老", "智慧"),
        ("读者", "儿童"),
        ("儿童", "教育"),
        ("教育", "道德"),
        ("汉学", "译者"),
        ("汉学", "出版社"),
        ("出版社", "传播"),
        ("交流", "理解"),
        ("传说", "神怪"),
        ("寓言", "道德"),
        ("文化", "中国"),
        ("后记", "读者"),
        ("转述", "改写"),
    ]
    edges = [{"source": a, "target": b, "weight": counts[a] + counts[b]} for a, b in edges_seed if a in counts and b in counts]
    return {
        "type": "prefaceCluster",
        "title": "序跋文本主题聚类图",
        "subtitle": "节点代表主题词，连线代表共同出现或语义邻近。",
        "clusters": PREFACE_CLUSTERS,
        "nodes": nodes,
        "edges": edges,
    }


def word_cloud(collections: list[dict[str, Any]]) -> dict[str, Any]:
    text = preface_source(collections)
    counts = terms_count(text)
    stop_words = {"未记录", "中国", "故事", "民间", "德语", "chinesische", "märchen", "sagen", "und", "der", "die", "das", "aus"}
    for item in collections:
        for word in re.split(r"[（）()\s,，:：;；·]+", " ".join(str(item.get(key) or "") for key in ["chineseTitle", "editorRole", "prefaceAuthor"])):
            value = word.strip()
            if len(value) >= 2 and value.lower() not in stop_words:
                counts[value] += 1
    words = [{"text": word, "value": count} for word, count in counts.most_common(34)]
    return {
        "type": "wordCloud",
        "title": "序跋文本词云图",
        "subtitle": "词越大，表示在序跋或序跋相关信息中出现频率越高。",
        "words": words,
    }


def preface_tokens(text: str) -> list[str]:
    stop_words = {
        "the", "and", "und", "der", "die", "das", "aus", "von", "mit", "für", "eine", "einer",
        "中国", "故事", "民间", "德语", "序跋", "文本", "版本", "作者", "未记录", "chinesische", "märchen", "sagen",
    }
    lexicon = [
        "翻译", "改写", "选编", "转述", "忠实", "传播", "汉学", "译者", "出版社", "文化", "交流", "理解",
        "中国形象", "东方", "古老", "神秘", "智慧", "异域", "民间故事", "童话", "传说", "寓言", "神怪",
        "动物故事", "儿童", "教育", "读者", "道德", "学习", "前言", "后记", "来源", "民族", "文学",
        "叙事", "采录", "整理", "出版", "接受", "德国", "世界", "宗教", "伦理", "想象", "知识",
    ]
    source = str(text or "")
    tokens: list[str] = []

    for term in lexicon:
        hits = len(re.findall(re.escape(term), source, flags=re.I))
        if hits:
            tokens.extend([term] * hits)

    for token in re.findall(r"[A-Za-zÄÖÜäöüß]{3,}", source):
        value = token.strip()
        if value.lower() not in stop_words:
            tokens.append(value)

    chinese_chunks = [chunk for chunk in re.findall(r"[\u4e00-\u9fff]{2,}", source) if chunk not in stop_words and chunk not in lexicon]
    for chunk in chinese_chunks:
        if 2 <= len(chunk) <= 8:
            tokens.append(chunk)

    if len(tokens) < 8:
        for chunk in chinese_chunks:
            for index in range(0, max(len(chunk) - 1, 0), 2):
                value = chunk[index : index + 2]
                if value not in stop_words and value not in lexicon:
                    tokens.append(value)
    return tokens


def preface_visuals(prefaces: dict[str, Any] | None = None) -> dict[str, Any]:
    entries = []
    combined: Counter = Counter()
    for collection_id, preface in (prefaces or {}).items():
        text = str((preface or {}).get("text") or "")
        counts = Counter(preface_tokens(text))
        combined.update(counts)
        if counts:
            entries.append(
                {
                    "id": collection_id,
                    "label": (preface or {}).get("sourceTitle") or (preface or {}).get("filename") or collection_id,
                    "words": [{"text": word, "value": count} for word, count in counts.most_common(90)],
                }
            )
    word_clouds = [{"id": "all", "label": "总词云", "words": [{"text": word, "value": count} for word, count in combined.most_common(120)]}]
    word_clouds.extend(entries)
    return {"wordClouds": [item for item in word_clouds if item["words"]]}


def child_cooccurrence(collections: list[dict[str, Any]], children: list[dict[str, Any]]) -> dict[str, Any]:
    child_by_id = {item["id"]: item for item in children}
    node_counts: Counter = Counter()
    pair_counts: Counter = Counter()
    for collection in collections:
        themes = set()
        for child_id in collection.get("matchedChildIds", []):
            child = child_by_id.get(child_id)
            if child:
                themes.update(child_themes(child))
        ordered = sorted(themes)
        node_counts.update(ordered)
        for index, source in enumerate(ordered):
            for target in ordered[index + 1 :]:
                pair_counts["|".join(sorted([source, target]))] += 1
    nodes = [{"id": key, "label": key, "count": value} for key, value in node_counts.most_common(16)]
    node_ids = {node["id"] for node in nodes}
    edges = []
    for key, value in pair_counts.most_common(28):
        source, target = key.split("|")
        if source in node_ids and target in node_ids:
            edges.append({"source": source, "target": target, "weight": value})
    return {
        "type": "childCooccurrence",
        "title": "德译中国故事集主题共现图",
        "subtitle": "节点代表故事主题，节点越大表示出现越多；连线越粗表示两个主题越常同时出现。",
        "nodes": nodes,
        "edges": edges,
    }


def wilhelm_rows(collections: list[dict[str, Any]]) -> list[dict[str, Any]]:
    pattern = re.compile(r"卫礼贤|Richard Wilhelm|Wilhelm|Chinesische Volksmärchen", re.I)
    rows = [item for item in collections if pattern.search(" ".join(str(item.get(key) or "") for key in ["name", "foreignTitle", "editor", "prefaceAuthor", "publisher"]))]
    return rows or [item for item in collections if 1910 <= int(item.get("year") or 0) <= 1920]


def normalize_province(value: Any) -> str:
    text = re.sub(r"省|市|自治区|特别行政区|壮族|回族|维吾尔", "", str(value or "北京")).strip()
    return text if text in PROVINCE_COORDS else "北京"


def wilhelm_visuals(records: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    data = story_data()
    rows = records or wilhelm_rows(data["collections"])
    normalized: list[dict[str, Any]] = []
    for index, row in enumerate(rows):
        city = row.get("city") or row.get("publisher") or "Berlin"
        province = normalize_province(row.get("province") or row.get("sourceProvince") or "北京")
        year_match = re.search(r"\d{4}", str(row.get("year") or row.get("yearText") or ""))
        year = int(year_match.group(0)) if year_match else int(row.get("year") or 0)
        normalized.append(
            {
                **row,
                "id": row.get("id") or f"wilhelm-backend-{index}",
                "title": row.get("title") or row.get("name") or "《卫礼贤中国民间故事》",
                "year": year,
                "city": city,
                "country": row.get("country") or ("中国" if city in {"Peking", "Beijing", "北京", "Shanghai", "上海"} else "德国"),
                "publisher": row.get("publisher") or "未记录",
                "province": province,
            }
        )
    flows = []
    for row in normalized:
        province = normalize_province(row.get("province"))
        flows.append(
            {
                "id": row["id"],
                "title": row.get("title") or row.get("name") or "《卫礼贤中国民间故事》",
                "sectionId": "stories",
                "resourceType": "《卫礼贤中国民间故事》专题",
                "language": row.get("language") or "德语",
                "year": row.get("year") or 0,
                "from": PROVINCE_COORDS[province],
                "to": [10.45, 51.16],
                "fromLabel": province,
                "toLabel": f"{row.get('city') or '德国'} · {row.get('country') or '德国'}",
                "province": province,
                "country": row.get("country") or "德国",
                "weight": 0.9,
            }
        )
    return {
        "publicationMap": publication_map(normalized, "《卫礼贤中国民间故事》再版出版地图"),
        "flows": flows,
    }


def bucket_year(year: Any) -> str:
    value = int(year or 0)
    if not value:
        return "未知"
    if value < 1900:
        return "1900前"
    if value < 1920:
        return "1900-1919"
    if value < 1940:
        return "1920-1939"
    if value < 1960:
        return "1940-1959"
    if value < 1980:
        return "1960-1979"
    if value < 2000:
        return "1980-1999"
    if value < 2020:
        return "2000-2019"
    return "2020后"


def stats_visual(items: list[dict[str, Any]] | None = None) -> dict[str, Any]:
    rows = items or []
    order = ["1900前", "1900-1919", "1920-1939", "1940-1959", "1960-1979", "1980-1999", "2000-2019", "2020后", "未知"]
    year_counts = Counter(bucket_year(row.get("year")) for row in rows)

    def top(key: str, limit: int) -> list[list[Any]]:
        counts = Counter(str(row.get(key) or "未知") for row in rows)
        return [[name, count] for name, count in counts.most_common(limit)]

    return {
        "yearBuckets": [[name, year_counts.get(name, 0)] for name in order],
        "languageTop": top("language", 7),
        "countryTop": top("country", 7),
        "authorTop": top("translator", 8),
        "storyTop": top("canonicalName", 12),
        "carrierTop": top("carrier", 5),
        "modeTop": top("translationMode", 5),
    }


def visual_atlas() -> dict[str, Any]:
    data = story_data()
    collections = data["collections"]
    children = data["childStories"]
    flows = data["flows"]
    wilhelm = wilhelm_rows(collections)
    return {
        "stats": data.get("stats", {}),
        "charts": {
            "identityProcess": identity_process(collections),
            "identityRiver": identity_river(collections),
            "publicationMap": publication_map(collections),
            "sourceMap": source_map(flows),
            "prefaceCluster": preface_cluster(collections),
            "wordCloud": word_cloud(collections),
            "childCooccurrence": child_cooccurrence(collections, children),
            "wilhelmPublicationMap": publication_map(wilhelm, "《卫礼贤中国民间故事》再版出版地图"),
        },
    }


def collection_graph(collection_id: str) -> dict[str, Any]:
    data = story_data()
    collections = data["collections"]
    children = data["childStories"]
    child_by_id = {item["id"]: item for item in children}
    collection = next((item for item in collections if item["id"] == collection_id), collections[0])
    flow = next((item for item in data["flows"] if item["id"] == collection["id"]), None)
    selected_children = [child_by_id[child_id] for child_id in collection.get("matchedChildIds", []) if child_id in child_by_id]
    nodes: dict[str, dict[str, Any]] = {}
    edges: list[dict[str, Any]] = []

    def node(node_id: str, **payload: Any) -> None:
        current = nodes.get(node_id)
        nodes[node_id] = {**(current or {}), "id": node_id, **payload}

    center_id = f"collection-{collection['id']}"
    node(center_id, label=collection.get("chineseTitle") or collection["name"], type="故事集", section="stories", year=collection.get("year"), lang="德语", x=0.48, y=0.22, size=27)
    editor_id = f"editor-{short(collection.get('editor'), 50)}"
    node(editor_id, label=collection.get("editor") or "未记录译者", type="译者/编者", section="stories", year=collection.get("year"), lang="德语", x=0.22, y=0.18, size=18)
    edges.append({"from": editor_id, "to": center_id, "relation": "编译", "note": collection["name"]})
    role_id = f"role-{short(collection.get('editorRole'), 50)}"
    node(role_id, label=collection.get("editorRole") or "未记录身份", type="译者身份", section="stories", year=collection.get("year"), lang="中文", x=0.1, y=0.26, size=15)
    edges.append({"from": role_id, "to": editor_id, "relation": "身份", "note": "译者身份"})
    publisher_id = f"publisher-{short(collection.get('publisher'), 60)}"
    node(publisher_id, label=collection.get("publisher") or "未记录出版社", type="出版社", section="stories", year=collection.get("year"), lang="德语", x=0.76, y=0.18, size=17)
    edges.append({"from": center_id, "to": publisher_id, "relation": "出版", "note": collection.get("publisher")})
    if collection.get("prefaceAuthor") and collection["prefaceAuthor"] != "/":
        preface_id = f"preface-{short(collection['prefaceAuthor'], 60)}"
        node(preface_id, label=collection["prefaceAuthor"], type="序跋作者", section="stories", year=collection.get("year"), lang="中文", x=0.74, y=0.32, size=15)
        edges.append({"from": preface_id, "to": center_id, "relation": "阐释", "note": "序跋作者如何塑造故事阐释"})
    if flow and flow.get("province"):
        province_id = f"province-{flow['province']}"
        node(province_id, label=flow["province"], type="取材来源", section="stories", year=collection.get("year"), lang="中文", x=0.5, y=0.38, size=15)
        edges.append({"from": province_id, "to": center_id, "relation": "来源", "note": "故事取材来源"})

    motif_counts = Counter((child.get("canonicalName") or child.get("variantName") or "未记录") for child in selected_children)
    motifs = {name: f"motif-{short(name, 60)}" for name, _ in motif_counts.most_common(28)}
    for index, (name, count) in enumerate(motif_counts.most_common(28)):
        node(motifs[name], label=short(name, 12), type="故事母题", section="stories", year=collection.get("year"), lang="中文", x=0.1 + (index % 7) * 0.11, y=0.48 + (index // 7) * 0.07, size=10 + min(10, count))
    for index, child in enumerate(selected_children[:80]):
        child_id = f"child-{child['id']}"
        node(child_id, label=short(child.get("variantName") or child.get("canonicalName"), 10), type="子故事", section="stories", year=child.get("year") or collection.get("year"), lang=child.get("language"), x=0.28 + (index % 9) * 0.068, y=min(0.94, 0.58 + (index // 9) * 0.041), size=7)
        edges.append({"from": center_id, "to": child_id, "relation": "收录", "note": child.get("bookName")})
        motif_id = motifs.get(child.get("canonicalName") or child.get("variantName") or "未记录")
        if motif_id:
            edges.append({"from": motif_id, "to": child_id, "relation": "母题关联", "note": child.get("variantName")})
    return {
        "collection": collection,
        "children": selected_children,
        "flow": flow,
        "graph": {"nodes": list(nodes.values()), "edges": edges},
    }
