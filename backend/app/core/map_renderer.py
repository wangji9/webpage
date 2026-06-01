from __future__ import annotations

import math
from html import escape
from typing import Any, Optional

WIDTH = 960
HEIGHT = 520
MAP_TOP = 34
MAP_BOTTOM = 492

COUNTRY_ALIAS = {
    "中国": "CHN",
    "法国": "FRA",
    "德国": "DEU",
    "英国": "GBR",
    "美国": "USA",
    "西班牙": "ESP",
    "意大利": "ITA",
    "加拿大": "CAN",
    "日本": "JPN",
}

COUNTRY_NAME_TO_ISO = {
    "China": "CHN",
    "France": "FRA",
    "Germany": "DEU",
    "United Kingdom": "GBR",
    "United States": "USA",
    "United States of America": "USA",
    "Spain": "ESP",
    "Italy": "ITA",
    "Canada": "CAN",
    "Japan": "JPN",
}

COUNTRY_CENTERS = {
    "CHN": [104.2, 35.9],
    "FRA": [2.2, 46.2],
    "DEU": [10.4, 51.1],
    "GBR": [-2.5, 54.1],
    "USA": [-98.6, 39.8],
    "ESP": [-3.7, 40.3],
    "ITA": [12.6, 42.7],
    "CAN": [-106.3, 56.1],
    "JPN": [138.2, 37.5],
}

# Offline landmass outlines. They are deliberately drawn as broad but coherent
# world silhouettes so the map works without network access or native GIS libs.
LANDMASSES = [
    {
        "name": "North America",
        "rings": [[
            [-168, 71], [-145, 69], [-125, 72], [-105, 67], [-88, 57], [-62, 54],
            [-53, 47], [-66, 38], [-83, 29], [-96, 17], [-107, 23], [-119, 33],
            [-126, 49], [-139, 58], [-168, 71],
        ]],
    },
    {
        "name": "Greenland",
        "rings": [[
            [-52, 82], [-28, 78], [-21, 70], [-36, 60], [-53, 60], [-62, 70], [-52, 82],
        ]],
    },
    {
        "name": "South America",
        "rings": [[
            [-81, 12], [-66, 9], [-50, -2], [-38, -15], [-45, -32], [-54, -55],
            [-68, -53], [-76, -35], [-81, -15], [-81, 12],
        ]],
    },
    {
        "name": "Europe",
        "rings": [[
            [-11, 36], [-8, 50], [4, 58], [18, 60], [31, 55], [38, 45],
            [25, 37], [10, 36], [-11, 36],
        ]],
    },
    {
        "name": "Africa",
        "rings": [[
            [-17, 34], [8, 37], [34, 31], [51, 11], [43, -12], [31, -34],
            [18, -35], [4, -27], [-10, -7], [-17, 14], [-17, 34],
        ]],
    },
    {
        "name": "Asia",
        "rings": [[
            [33, 35], [45, 55], [73, 67], [103, 72], [137, 59], [153, 45],
            [143, 25], [122, 20], [107, 5], [95, 18], [78, 7], [67, 25],
            [49, 24], [33, 35],
        ]],
    },
    {
        "name": "Southeast Asia",
        "rings": [[
            [96, 21], [108, 16], [122, 10], [127, -4], [115, -9], [104, 1], [96, 21],
        ]],
    },
    {
        "name": "Australia",
        "rings": [[
            [113, -11], [154, -12], [153, -32], [140, -44], [118, -35], [113, -11],
        ]],
    },
    {
        "name": "Japan",
        "rings": [[[130, 31], [143, 36], [146, 44], [138, 46], [130, 31]]],
    },
    {
        "name": "United Kingdom",
        "rings": [[[-8, 50], [1, 51], [0, 58], [-6, 59], [-8, 50]]],
    },
]


def _lonlat_to_xy(point: list[float] | tuple[float, float]) -> tuple[float, float]:
    lon = max(-180, min(180, float(point[0])))
    lat = max(-82, min(84, float(point[1])))
    x = (lon + 180) / 360 * WIDTH
    y = MAP_TOP + (84 - lat) / 166 * (MAP_BOTTOM - MAP_TOP)
    return x, y


def _ring_to_path(ring: list[list[float]]) -> str:
    pieces = []
    for index, point in enumerate(ring):
        x, y = _lonlat_to_xy(point)
        pieces.append(f"{'M' if index == 0 else 'L'}{x:.1f},{y:.1f}")
    pieces.append("Z")
    return " ".join(pieces)


def _country_from_flow(flow: dict[str, Any]) -> str:
    country = str(flow.get("country") or "").strip()
    if country:
        return country
    label = str(flow.get("toLabel") or "")
    if "·" in label:
        return label.split("·")[-1].strip()
    if "路" in label:
        return label.split("路")[-1].strip()
    return label.strip()


def _country_iso(flow: dict[str, Any]) -> str:
    country = _country_from_flow(flow)
    return COUNTRY_ALIAS.get(country) or COUNTRY_NAME_TO_ISO.get(country) or country


def _section_color(flow: dict[str, Any], section_colors: dict[str, str]) -> str:
    return section_colors.get(str(flow.get("sectionId")), "#0b66b2")


def _curve_path(start: list[float], end: list[float]) -> tuple[str, float, float, float, float]:
    sx, sy = _lonlat_to_xy(start)
    ex, ey = _lonlat_to_xy(end)
    dx = ex - sx
    if abs(dx) > WIDTH * 0.55:
        ex += WIDTH if dx < 0 else -WIDTH
    cx = (sx + ex) / 2
    cy = min(sy, ey) - max(42, abs(ex - sx) * 0.18)
    return f"M{sx:.1f},{sy:.1f} Q{cx:.1f},{cy:.1f} {ex:.1f},{ey:.1f}", sx, sy, ex, ey


def _point_from_flow(flow: dict[str, Any], key: str) -> Optional[list[float]]:
    value = flow.get(key)
    if not isinstance(value, list) or len(value) < 2:
        return None
    try:
        return [float(value[0]), float(value[1])]
    except (TypeError, ValueError):
        return None


def _heat_color(count: int, max_count: int) -> tuple[str, float]:
    if not count:
        return "#dbeaf1", 0.92
    ratio = count / max(1, max_count)
    if ratio > 0.66:
        return "#0f766e", 0.74
    if ratio > 0.33:
        return "#24a7b6", 0.62
    return "#8bd3df", 0.54


def render_map_svg(
    flows: list[dict[str, Any]],
    sections: list[dict[str, Any]],
    mode: str = "flow",
    year: Optional[int] = None,
    title: str = "传播地图",
) -> dict[str, Any]:
    cleaned_flows = [
        flow for flow in flows
        if _point_from_flow(flow, "from") and _point_from_flow(flow, "to")
    ]
    years = sorted({int(flow.get("year", 0)) for flow in cleaned_flows if str(flow.get("year", "")).isdigit()})
    active_year = year if year is not None else (years[-1] if years else None)
    active_flows = [
        flow for flow in cleaned_flows
        if active_year is None or int(flow.get("year", 0) or 0) <= active_year
    ]
    section_colors = {str(section.get("id")): str(section.get("color")) for section in sections if section.get("id")}

    country_counts: dict[str, int] = {}
    for flow in active_flows:
        iso = _country_iso(flow)
        country_counts[iso] = country_counts.get(iso, 0) + 1
    max_count = max(country_counts.values(), default=1)

    land_parts = []
    for land in LANDMASSES:
        land_parts.extend(
            f'<path d="{_ring_to_path(ring)}" fill="#e8f4f7" stroke="#8eb0c3" stroke-width="0.9" vector-effect="non-scaling-stroke"/>'
            for ring in land["rings"]
        )

    heat_parts = []
    for iso, count in country_counts.items():
        center = COUNTRY_CENTERS.get(iso)
        if not center:
            continue
        x, y = _lonlat_to_xy(center)
        fill, opacity = _heat_color(count, max_count)
        heat_parts.append(
            f'<circle cx="{x:.1f}" cy="{y:.1f}" r="{26 + 12 * count:.1f}" fill="{fill}" fill-opacity="{opacity:.2f}"/>'
        )

    route_parts = []
    point_parts = []
    label_parts = []
    for index, flow in enumerate(active_flows):
        start = _point_from_flow(flow, "from")
        end = _point_from_flow(flow, "to")
        if not start or not end:
            continue
        color = _section_color(flow, section_colors)
        path, sx, sy, ex, ey = _curve_path(start, end)
        weight = float(flow.get("weight") or 0.8)
        if mode == "flow":
            route_parts.append(
                f'<path d="{path}" fill="none" stroke="{color}" stroke-opacity="0.82" stroke-width="{1.8 + weight * 1.6:.2f}" stroke-linecap="round"/>'
            )
        radius = 4.5 + min(6.5, weight * 4)
        point_parts.append(f'<circle cx="{sx:.1f}" cy="{sy:.1f}" r="4.2" fill="#0b66b2" stroke="#fff" stroke-width="1.8"/>')
        point_parts.append(f'<circle cx="{ex:.1f}" cy="{ey:.1f}" r="{radius:.1f}" fill="{color}" stroke="#fff" stroke-width="2.2"/>')
        if mode == "heat":
            point_parts.append(f'<circle cx="{ex:.1f}" cy="{ey:.1f}" r="{radius * 3.2:.1f}" fill="{color}" fill-opacity="0.17"/>')
        if index < 22:
            label = escape(str(flow.get("toLabel") or ""))
            label_parts.append(f'<text x="{ex + 8:.1f}" y="{ey - 7:.1f}">{label}</text>')

    legend_parts = []
    for section in sections:
        color = escape(str(section.get("color") or "#0b66b2"))
        name = escape(str(section.get("title") or section.get("id") or "分区"))
        y = 26 + len(legend_parts) * 24
        legend_parts.append(f'<circle cx="742" cy="{y}" r="6" fill="{color}"/><text x="758" y="{y + 5}" class="legend">{name}</text>')

    subtitle = f"{len(active_flows)} 条路径 · 时间至 {active_year if active_year is not None else '全部'}"
    svg = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {WIDTH} {HEIGHT}" role="img" aria-label="{escape(title)}">
  <defs>
    <linearGradient id="sea" x1="0" x2="1" y1="0" y2="1">
      <stop offset="0%" stop-color="#dff3f8"/>
      <stop offset="100%" stop-color="#b8dfe8"/>
    </linearGradient>
    <filter id="softShadow" x="-20%" y="-20%" width="140%" height="140%">
      <feDropShadow dx="0" dy="3" stdDeviation="3" flood-color="#062044" flood-opacity="0.18"/>
    </filter>
    <marker id="arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="5" markerHeight="5" orient="auto-start-reverse">
      <path d="M0,0 L10,5 L0,10 Z" fill="#0b66b2"/>
    </marker>
  </defs>
  <style>
    text {{ font-family: Microsoft YaHei, PingFang SC, Arial, sans-serif; font-weight: 900; fill: #062044; paint-order: stroke; stroke: rgba(255,255,255,.92); stroke-width: 3px; }}
    .title {{ font-size: 22px; stroke-width: 0; fill: #0b66b2; }}
    .subtitle {{ font-size: 15px; fill: #5f6f84; stroke-width: 0; }}
    .legend {{ font-size: 14px; fill: #334155; stroke-width: 0; }}
    .graticule {{ stroke: rgba(255,255,255,.58); stroke-width: 1; }}
  </style>
  <rect width="{WIDTH}" height="{HEIGHT}" rx="12" fill="url(#sea)"/>
  <g opacity="0.85">
    <path class="graticule" d="M0,115 H{WIDTH} M0,205 H{WIDTH} M0,295 H{WIDTH} M0,385 H{WIDTH}"/>
    <path class="graticule" d="M120,0 V{HEIGHT} M240,0 V{HEIGHT} M360,0 V{HEIGHT} M480,0 V{HEIGHT} M600,0 V{HEIGHT} M720,0 V{HEIGHT} M840,0 V{HEIGHT}"/>
  </g>
  <g class="land">{"".join(land_parts)}</g>
  <g class="heat">{"".join(heat_parts)}</g>
  <g class="routes" filter="url(#softShadow)">{"".join(route_parts)}</g>
  <g class="points">{"".join(point_parts)}</g>
  <g class="labels">{"".join(label_parts)}</g>
  <text class="title" x="22" y="34">{escape(title)}</text>
  <text class="subtitle" x="22" y="58">{escape(subtitle)}</text>
  <g class="legend-block">{"".join(legend_parts)}</g>
  <text class="subtitle" x="716" y="500">离线世界底图 · 经纬度投影</text>
</svg>'''
    return {"svg": svg, "activeYear": active_year, "years": years, "activeCount": len(active_flows)}
