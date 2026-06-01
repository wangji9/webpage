import { useEffect, useMemo, useRef, useState } from "react";

const WIDTH = 960;
const HEIGHT = 640;
const CHINA_GEOJSON_URLS = [
  "https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json",
  "https://geo.datav.aliyun.com/areas_v3/bound/100000.json"
];

function downloadText(filename, text, type = "text/plain") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function provinceName(feature) {
  return feature?.properties?.name || feature?.properties?.NAME || "";
}

function collectPoints(geometry, points = []) {
  if (!geometry) return points;
  if (geometry.type === "Polygon") geometry.coordinates.flat().forEach((point) => points.push(point));
  if (geometry.type === "MultiPolygon") geometry.coordinates.flat(2).forEach((point) => points.push(point));
  return points;
}

function boundsOf(features = []) {
  const points = features.flatMap((feature) => collectPoints(feature.geometry, []));
  const projected = points.map((point) => rawMercator(point)).filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  const lons = projected.map((point) => point[0]);
  const lats = projected.map((point) => point[1]);
  return {
    minX: Math.min(...lons, rawMercator([73, 18])[0]),
    maxX: Math.max(...lons, rawMercator([135, 54])[0]),
    minY: Math.min(...lats, rawMercator([73, 54])[1]),
    maxY: Math.max(...lats, rawMercator([135, 18])[1])
  };
}

function rawMercator(point) {
  const lon = Number(point?.[0] || 0) * Math.PI / 180;
  const lat = Math.max(-85, Math.min(85, Number(point?.[1] || 0))) * Math.PI / 180;
  return [lon, Math.log(Math.tan(Math.PI / 4 + lat / 2))];
}

function makeProject(bounds) {
  const padX = 30;
  const padY = 20;
  const sx = (WIDTH - padX * 2) / (bounds.maxX - bounds.minX);
  const sy = (HEIGHT - padY * 2) / (bounds.maxY - bounds.minY);
  const scale = Math.min(sx, sy);
  const mapW = (bounds.maxX - bounds.minX) * scale;
  const mapH = (bounds.maxY - bounds.minY) * scale;
  const ox = (WIDTH - mapW) / 2;
  const oy = (HEIGHT - mapH) / 2;
  return (point) => {
    const [x, y] = rawMercator(point);
    return [ox + (x - bounds.minX) * scale, oy + (bounds.maxY - y) * scale];
  };
}

function ringPath(ring, project) {
  return ring.map((point, index) => {
    const [x, y] = project(point);
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ") + " Z";
}

function geometryPaths(geometry, project) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return geometry.coordinates.map((ring) => ringPath(ring, project));
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flatMap((polygon) => polygon.map((ring) => ringPath(ring, project)));
  return [];
}

function matchesProvince(featureName, province) {
  return featureName && province && (featureName.includes(province) || province.includes(featureName.replace(/省|市|自治区|特别行政区|壮族|回族|维吾尔/g, "")));
}

export default function ChinaStoryMap({ flows = [], selectedId = "", onSelect, title = "多语种中国故事集传播地图", timeline = false, expandable = false, expanded = false, className = "" }) {
  const svgRef = useRef(null);
  const [mode, setMode] = useState("flow");
  const [geo, setGeo] = useState(null);
  const [error, setError] = useState("");
  const [timelineIndex, setTimelineIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [modalOpen, setModalOpen] = useState(false);
  const bounds = useMemo(() => boundsOf(geo?.features || []), [geo]);
  const project = useMemo(() => makeProject(bounds), [bounds]);
  const years = useMemo(() => [...new Set(flows.map((flow) => Number(flow.year)).filter(Boolean))].sort((a, b) => a - b), [flows]);
  const currentYear = years[Math.min(timelineIndex, Math.max(0, years.length - 1))] || "";
  const timelineFlows = useMemo(() => (
    timeline && currentYear ? flows.filter((flow) => Number(flow.year) <= currentYear) : flows
  ), [currentYear, flows, timeline]);
  const counts = useMemo(() => {
    const map = new Map();
    timelineFlows.forEach((flow) => map.set(flow.province, (map.get(flow.province) || 0) + 1));
    return map;
  }, [timelineFlows]);
  const max = Math.max(1, ...counts.values());
  const active = selectedId ? timelineFlows.filter((flow) => flow.id === selectedId) : timelineFlows;

  useEffect(() => {
    let canceled = false;
    async function loadChina() {
      setError("");
      for (const url of CHINA_GEOJSON_URLS) {
        try {
          const response = await fetch(url, { cache: "force-cache" });
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          const data = await response.json();
          if (!canceled) setGeo(data);
          return;
        } catch (loadError) {
          if (url === CHINA_GEOJSON_URLS[CHINA_GEOJSON_URLS.length - 1] && !canceled) {
            setError("在线中国地图加载失败，请检查网络后刷新。");
          }
        }
      }
    }
    loadChina();
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    if (!timeline || !playing || years.length <= 1) return undefined;
    const timer = window.setInterval(() => {
      setTimelineIndex((value) => (value + 1) % years.length);
    }, 1100);
    return () => window.clearInterval(timer);
  }, [playing, timeline, years.length]);

  useEffect(() => {
    if (!timeline || timelineIndex < years.length) return;
    setTimelineIndex(Math.max(0, years.length - 1));
  }, [timeline, timelineIndex, years.length]);

  function exportSvg() {
    if (!svgRef.current) return;
    downloadText("中国故事集传播地图.svg", new XMLSerializer().serializeToString(svgRef.current), "image/svg+xml");
  }

  function exportCsv() {
    const rows = ["年份,起点省份,终点,题名", ...active.map((flow) => [flow.year, flow.fromLabel, flow.toLabel, flow.title].map((value) => `"${String(value || "").replaceAll("\"", "\"\"")}"`).join(","))];
    downloadText("中国故事集传播地图数据.csv", rows.join("\n"), "text/csv;charset=utf-8");
  }

  return (
    <div className={`work-panel china-map-panel ${expanded ? "expanded-map" : ""} ${className}`}>
      <div className="visual-heading map-heading">
        <div>
          <strong>{title}</strong>
          <span>{active.length} 条路径 · 中国省级边界 · {timeline && currentYear ? `时间至 ${currentYear}` : mode === "flow" ? "传播路径" : "省区热力"}</span>
        </div>
        <div className="map-mode-tabs">
          <button className={mode === "flow" ? "active" : ""} type="button" onClick={() => setMode("flow")}>流变地图</button>
          <button className={mode === "heat" ? "active" : ""} type="button" onClick={() => setMode("heat")}>热力地图</button>
          {expandable && <button type="button" onClick={() => setModalOpen(true)}>放大地图</button>}
          <button type="button" onClick={exportSvg}>导出 SVG</button>
          <button type="button" onClick={exportCsv}>导出数据</button>
        </div>
      </div>
      {timeline && years.length > 1 && (
        <div className="china-map-timeline-controls">
          <button type="button" onClick={() => setPlaying((value) => !value)}>{playing ? "暂停" : "播放"}</button>
          <input
            type="range"
            min="0"
            max={Math.max(0, years.length - 1)}
            value={Math.min(timelineIndex, Math.max(0, years.length - 1))}
            onChange={(event) => { setPlaying(false); setTimelineIndex(Number(event.target.value)); }}
          />
          <strong>{currentYear}</strong>
        </div>
      )}
      <div className="china-map-frame">
        <svg ref={svgRef} className="china-map-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={title}>
          <rect width={WIDTH} height={HEIGHT} fill="#101826" />
          <g className="map-graticule">
            {[120, 240, 360, 480, 600, 720, 840].map((x) => <line key={x} x1={x} x2={x} y1="24" y2={HEIGHT - 24} />)}
            {[120, 240, 360, 480, 600].map((y) => <line key={y} x1="32" x2={WIDTH - 32} y1={y} y2={y} />)}
          </g>
          <g className="china-provinces">
            {geo?.features?.flatMap((feature, featureIndex) => {
              const name = provinceName(feature);
              const count = [...counts.entries()].find(([province]) => matchesProvince(name, province))?.[1] || 0;
              const highlighted = count > 0;
              const fill = mode === "heat" && highlighted ? `rgba(217, 170, 43, ${0.35 + count / max * 0.55})` : highlighted ? "#d6a832" : "rgba(255,255,255,0.08)";
              return geometryPaths(feature.geometry, project).map((path, pathIndex) => (
                <path
                  className={highlighted ? "highlighted" : ""}
                  d={path}
                  fill={fill}
                  key={`${featureIndex}-${pathIndex}`}
                  onClick={() => onSelect?.(flows.find((flow) => matchesProvince(name, flow.province))?.id || "")}
                />
              ));
            })}
          </g>
          <g className="china-labels">
            {geo?.features?.map((feature, index) => {
              const points = collectPoints(feature.geometry, []);
              if (!points.length || index % 1 !== 0) return null;
              const center = points.reduce((sum, point) => [sum[0] + Number(point[0]), sum[1] + Number(point[1])], [0, 0]).map((value) => value / points.length);
              const [x, y] = project(center);
              return <text key={provinceName(feature)} x={x} y={y} textAnchor="middle">{provinceName(feature).replace(/省|市|自治区|特别行政区/g, "")}</text>;
            })}
          </g>
          {mode === "flow" && (
            <g className="china-routes">
              {active.slice(0, selectedId ? 1 : 80).map((flow, index) => {
                const [sx, sy] = project(flow.from);
                const ex = WIDTH - 92;
                const ey = 70 + (index % 18) * 28;
                const cy = Math.min(sy, ey) - 72 - (index % 5) * 10;
                return (
                  <g key={flow.id} onClick={() => onSelect?.(flow.id)}>
                    <path d={`M${sx.toFixed(1)},${sy.toFixed(1)} Q${((sx + ex) / 2).toFixed(1)},${cy.toFixed(1)} ${ex},${ey}`} />
                    <circle cx={sx} cy={sy} r="4" />
                    <circle className="target" cx={ex} cy={ey} r={4 + Number(flow.weight || 1) * 1.8} />
                    {(selectedId === flow.id || index < 12) && <text x={ex + 8} y={ey + 4}>{flow.year} {flow.toLabel}</text>}
                  </g>
                );
              })}
            </g>
          )}
        </svg>
        {!geo && <div className="map-loading">{error || "正在加载中国省级边界..."}</div>}
      </div>
      {modalOpen && (
        <div className="map-modal-backdrop" role="presentation" onClick={() => setModalOpen(false)}>
          <section className="map-modal" role="dialog" aria-modal="true" aria-label="放大地图" onClick={(event) => event.stopPropagation()}>
            <div className="panel-title-row">
              <div><strong>{title}</strong><span>放大查看动态传播路径</span></div>
              <button type="button" onClick={() => setModalOpen(false)}>关闭</button>
            </div>
            <ChinaStoryMap flows={flows} selectedId={selectedId} onSelect={onSelect} title={title} timeline={timeline} expandable={false} expanded />
          </section>
        </div>
      )}
    </div>
  );
}
