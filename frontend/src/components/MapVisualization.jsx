import { useEffect, useMemo, useState } from "react";

const MAP_WIDTH = 980;
const MAP_HEIGHT = 520;
const WORLD_GEOJSON_URLS = [
  "https://cdn.jsdelivr.net/gh/johan/world.geo.json@master/countries.geo.json",
  "https://raw.githubusercontent.com/johan/world.geo.json/master/countries.geo.json"
];

const COUNTRY_NAME_MAP = {
  "中国": "China",
  "法国": "France",
  "美国": "United States of America",
  "英国": "United Kingdom",
  "德国": "Germany",
  "西班牙": "Spain",
  "意大利": "Italy",
  "加拿大": "Canada",
  "日本": "Japan",
  "俄罗斯": "Russia",
  "韩国": "South Korea",
  "新加坡": "Singapore",
  "澳大利亚": "Australia"
};

function downloadText(filename, text, type = "text/plain") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function project(point) {
  const lon = Math.max(-180, Math.min(180, Number(point?.[0] || 0)));
  const lat = Math.max(-84, Math.min(84, Number(point?.[1] || 0)));
  return [((lon + 180) / 360) * MAP_WIDTH, ((84 - lat) / 168) * MAP_HEIGHT];
}

function ringPath(ring) {
  return ring.map((point, index) => {
    const [x, y] = project(point);
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ") + " Z";
}

function geometryPaths(geometry) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return geometry.coordinates.map(ringPath);
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flatMap((polygon) => polygon.map(ringPath));
  return [];
}

function countryName(feature) {
  const props = feature?.properties || {};
  return props.name || props.ADMIN || props.NAME || "";
}

function flowCountry(flow) {
  const label = String(flow.country || flow.toLabel || "");
  const raw = label.includes("·") ? label.split("·").pop().trim() : label.includes("→") ? label.split("→").pop().trim() : label.trim();
  return COUNTRY_NAME_MAP[raw] || raw;
}

function routeGeometry(flow) {
  const [sx, sy] = project(flow.from);
  let [ex, ey] = project(flow.to);
  const dx = ex - sx;
  if (Math.abs(dx) > MAP_WIDTH * 0.55) {
    ex += dx < 0 ? MAP_WIDTH : -MAP_WIDTH;
  }
  const cy = Math.min(sy, ey) - Math.max(34, Math.abs(ex - sx) * 0.16);
  return { d: `M${sx.toFixed(1)},${sy.toFixed(1)} Q${((sx + ex) / 2).toFixed(1)},${cy.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`, sx, sy, ex, ey };
}

function sectionColor(flow, sections) {
  return sections.find((section) => section.id === flow.sectionId)?.color || "#1f7acb";
}

function featureFill(feature, countryCounts, viewMode) {
  const count = countryCounts.get(countryName(feature)) || 0;
  if (viewMode === "heat" && count > 0) return "#21c8d8";
  if (count > 0) return "#2f85b7";
  return "#b9c8d2";
}

function featureOpacity(feature, countryCounts, maxCount, viewMode) {
  const count = countryCounts.get(countryName(feature)) || 0;
  if (!count) return viewMode === "heat" ? 0.82 : 0.94;
  return viewMode === "heat" ? 0.42 + (count / Math.max(1, maxCount)) * 0.46 : 0.96;
}

export default function MapVisualization({ flows = [], title = "传播地图", sections = [], selectedFlowId = "" }) {
  const [viewMode, setViewMode] = useState("flow");
  const [playing, setPlaying] = useState(false);
  const [pickedFlowId, setPickedFlowId] = useState(selectedFlowId);
  const [world, setWorld] = useState(null);
  const [mapError, setMapError] = useState("");
  const years = useMemo(() => [...new Set(flows.map((flow) => Number(flow.year)).filter(Boolean))].sort((a, b) => a - b), [flows]);
  const [yearIndex, setYearIndex] = useState(Math.max(0, years.length - 1));
  const activeYear = years[Math.min(yearIndex, Math.max(0, years.length - 1))] || null;
  const timelineFlows = useMemo(() => flows.filter((flow) => !activeYear || Number(flow.year) <= activeYear), [activeYear, flows]);
  const pickedFlow = useMemo(() => flows.find((flow) => flow.id === pickedFlowId), [flows, pickedFlowId]);
  const activeFlows = pickedFlow ? [pickedFlow] : timelineFlows;
  const countryCounts = useMemo(() => {
    const counts = new Map();
    activeFlows.forEach((flow) => {
      const name = flowCountry(flow);
      if (name) counts.set(name, (counts.get(name) || 0) + 1);
    });
    return counts;
  }, [activeFlows]);
  const maxCountryCount = Math.max(1, ...countryCounts.values());

  useEffect(() => {
    let canceled = false;
    async function loadWorldMap() {
      setMapError("");
      for (const url of WORLD_GEOJSON_URLS) {
        try {
          const response = await fetch(url, { cache: "force-cache" });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = await response.json();
          if (!canceled) setWorld(data);
          return;
        } catch (error) {
          if (url === WORLD_GEOJSON_URLS[WORLD_GEOJSON_URLS.length - 1] && !canceled) {
            setMapError("在线世界地图加载失败，请检查网络后刷新。");
          }
        }
      }
    }
    loadWorldMap();
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    setYearIndex(Math.max(0, years.length - 1));
    setPlaying(false);
  }, [years.length]);

  useEffect(() => setPickedFlowId(selectedFlowId || ""), [selectedFlowId, flows]);

  useEffect(() => {
    if (!playing || years.length <= 1 || pickedFlow) return undefined;
    const timer = window.setInterval(() => {
      setYearIndex((value) => {
        if (value >= years.length - 1) {
          setPlaying(false);
          return value;
        }
        return value + 1;
      });
    }, 900);
    return () => window.clearInterval(timer);
  }, [pickedFlow, playing, years.length]);

  function exportMapSvg() {
    const svg = document.querySelector(".thematic-world-map svg");
    if (!svg) return;
    downloadText("传播地图.svg", new XMLSerializer().serializeToString(svg), "image/svg+xml");
  }

  function exportMapCsv() {
    const header = "年份,资源类型,语种,起点,终点,标题\n";
    const rows = activeFlows.map((flow) => [flow.year, flow.resourceType, flow.language, flow.fromLabel, flow.toLabel, flow.title].map((value) => `"${String(value || "").replaceAll("\"", "\"\"")}"`).join(","));
    downloadText("传播地图数据.csv", header + rows.join("\n"), "text/csv;charset=utf-8");
  }

  function togglePlay() {
    if (!years.length || pickedFlow) return;
    setPlaying((value) => {
      if (!value && yearIndex >= years.length - 1) setYearIndex(0);
      return !value;
    });
  }

  function pickFlow(flowId) {
    setPlaying(false);
    setPickedFlowId((current) => current === flowId ? "" : flowId);
  }

  return (
    <div className="map-visual real-map thematic-map-shell">
      <div className="visual-heading map-heading">
        <div>
          <strong>{title}</strong>
          <span>{activeFlows.length} 条路径 · {pickedFlow ? "当前条目路线" : `时间至 ${activeYear || "全部"}`}</span>
        </div>
        <div className="map-mode-tabs">
          <button className={viewMode === "flow" ? "active" : ""} type="button" onClick={() => setViewMode("flow")}>流变地图</button>
          <button className={viewMode === "heat" ? "active" : ""} type="button" onClick={() => setViewMode("heat")}>热力地图</button>
          <button type="button" onClick={exportMapSvg}>导出 SVG</button>
          <button type="button" onClick={exportMapCsv}>导出数据</button>
        </div>
      </div>

      <div className="thematic-world-map" aria-label="世界传播地图">
        <svg viewBox={`0 0 ${MAP_WIDTH} ${MAP_HEIGHT}`} preserveAspectRatio="xMidYMid meet">
          <rect width={MAP_WIDTH} height={MAP_HEIGHT} rx="8" />
          <g className="map-graticule">
            {[-120, -60, 0, 60, 120].map((lon) => {
              const [x] = project([lon, 0]);
              return <line key={`lon-${lon}`} x1={x} x2={x} y1="0" y2={MAP_HEIGHT} />;
            })}
            {[-60, -30, 0, 30, 60].map((lat) => {
              const [, y] = project([0, lat]);
              return <line key={`lat-${lat}`} x1="0" x2={MAP_WIDTH} y1={y} y2={y} />;
            })}
          </g>
          <g className="countries">
            {world?.features?.flatMap((feature, featureIndex) => geometryPaths(feature.geometry).map((path, pathIndex) => {
              const highlighted = countryCounts.has(countryName(feature));
              return (
                <path
                  className={highlighted ? "highlighted" : ""}
                  d={path}
                  fill={featureFill(feature, countryCounts, viewMode)}
                  key={`${featureIndex}-${pathIndex}`}
                  opacity={featureOpacity(feature, countryCounts, maxCountryCount, viewMode)}
                />
              );
            }))}
          </g>
          {viewMode === "heat" && (
            <g className="heat-points">
              {activeFlows.map((flow) => {
                const [x, y] = project(flow.to);
                return <circle cx={x} cy={y} fill={sectionColor(flow, sections)} key={flow.id} r={8 + Number(flow.weight || 1) * 7} />;
              })}
            </g>
          )}
          <g className="routes">
            {activeFlows.map((flow, index) => {
              const route = routeGeometry(flow);
              const radius = 4.5 + Math.min(6, Number(flow.weight || 1) * 3);
              const showLabel = pickedFlow || index < 18;
              return (
                <g key={flow.id}>
                  {viewMode === "flow" && <path d={route.d} stroke={sectionColor(flow, sections)} strokeWidth={2.2 + Number(flow.weight || 1) * 1.1} />}
                  <circle cx={route.sx} cy={route.sy} r="3.8" />
                  <circle className="target" cx={route.ex} cy={route.ey} fill={sectionColor(flow, sections)} r={radius} />
                  {showLabel && <text x={route.ex + 8} y={route.ey - 7}>{flow.toLabel}</text>}
                </g>
              );
            })}
          </g>
        </svg>
        {!world && <div className="map-loading">{mapError || "正在加载在线世界地图..."}</div>}
      </div>

      <div className="map-timeline">
        <button type="button" disabled={Boolean(pickedFlow)} onClick={() => setYearIndex((value) => Math.max(0, value - 1))}>‹</button>
        <button className={playing ? "pause" : ""} disabled={Boolean(pickedFlow)} type="button" onClick={togglePlay}>{playing ? "暂停" : "播放"}</button>
        <input disabled={Boolean(pickedFlow)} max={Math.max(0, years.length - 1)} min="0" onChange={(event) => { setPlaying(false); setYearIndex(Number(event.target.value)); }} type="range" value={Math.min(yearIndex, Math.max(0, years.length - 1))} />
        <button type="button" disabled={Boolean(pickedFlow)} onClick={() => setYearIndex((value) => Math.min(Math.max(0, years.length - 1), value + 1))}>›</button>
        <strong>{pickedFlow ? pickedFlow.year : activeYear || "全部"}</strong>
      </div>
      <div className="map-flow-list" role="list">
        {timelineFlows.slice(0, 24).map((flow) => (
          <button className={pickedFlowId === flow.id ? "active" : ""} key={flow.id} type="button" onClick={() => pickFlow(flow.id)}>
            {flow.year} | {flow.fromLabel} → {flow.toLabel} | {flow.language}
          </button>
        ))}
      </div>
    </div>
  );
}
