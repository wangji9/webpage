import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api.js";

const palette = ["#0b66b2", "#15a884", "#f59e0b", "#7c3aed", "#ef4444", "#0891b2", "#64748b", "#d97706"];
const regionColors = ["#2563eb", "#15a884", "#f59e0b", "#7c3aed", "#ef4444", "#0891b2", "#64748b", "#84cc16", "#ec4899", "#14b8a6"];
const fallbackCityCoords = {
  Berlin: [13.405, 52.52],
  Jena: [11.59, 50.93],
  "München": [11.58, 48.14],
  Leipzig: [12.37, 51.34],
  Stuttgart: [9.18, 48.78],
  Hamburg: [9.99, 53.55],
  Peking: [116.4, 39.9],
  Beijing: [116.4, 39.9],
  "北京": [116.4, 39.9],
  Shanghai: [121.47, 31.23],
  "上海": [121.47, 31.23]
};
const fallbackCityLabels = {
  Berlin: "柏林",
  Jena: "耶拿",
  "München": "慕尼黑",
  Leipzig: "莱比锡",
  Stuttgart: "斯图加特",
  Hamburg: "汉堡",
  Peking: "北京",
  Beijing: "北京",
  "北京": "北京",
  Shanghai: "上海",
  "上海": "上海"
};

function short(text, limit = 16) {
  const value = String(text || "未记录");
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

function downloadSvg(filename, node) {
  if (!node) return;
  const blob = new Blob([new XMLSerializer().serializeToString(node)], { type: "image/svg+xml;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function rawMercator(point) {
  const lon = Number(point?.[0] || 0) * Math.PI / 180;
  const lat = Math.max(-85, Math.min(85, Number(point?.[1] || 0))) * Math.PI / 180;
  return [lon, Math.log(Math.tan(Math.PI / 4 + lat / 2))];
}

function collectPoints(geometry, points = []) {
  if (!geometry) return points;
  if (geometry.type === "Polygon") geometry.coordinates.flat().forEach((point) => points.push(point));
  if (geometry.type === "MultiPolygon") geometry.coordinates.flat(2).forEach((point) => points.push(point));
  return points;
}

function boundsOf(features = []) {
  const projected = features
    .flatMap((feature) => collectPoints(feature.geometry, []))
    .map((point) => rawMercator(point))
    .filter(([x, y]) => Number.isFinite(x) && Number.isFinite(y));
  if (!projected.length) return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
  return {
    minX: Math.min(...projected.map((point) => point[0])),
    maxX: Math.max(...projected.map((point) => point[0])),
    minY: Math.min(...projected.map((point) => point[1])),
    maxY: Math.max(...projected.map((point) => point[1]))
  };
}

function makeProject(features, box) {
  const bounds = boundsOf(features);
  const pad = box.pad || 18;
  const sx = (box.width - pad * 2) / Math.max(0.0001, bounds.maxX - bounds.minX);
  const sy = (box.height - pad * 2) / Math.max(0.0001, bounds.maxY - bounds.minY);
  const scale = Math.min(sx, sy);
  const mapW = (bounds.maxX - bounds.minX) * scale;
  const mapH = (bounds.maxY - bounds.minY) * scale;
  const ox = box.x + (box.width - mapW) / 2;
  const oy = box.y + (box.height - mapH) / 2;
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
  if (!geometry || !project) return [];
  if (geometry.type === "Polygon") return geometry.coordinates.map((ring) => ringPath(ring, project));
  if (geometry.type === "MultiPolygon") return geometry.coordinates.flatMap((polygon) => polygon.map((ring) => ringPath(ring, project)));
  return [];
}

function featureName(feature) {
  const props = feature?.properties || {};
  return props.ADMIN || props.name || props.NAME || props.NAME_EN || props.name_en || "";
}

function provinceKey(name = "") {
  return String(name).replace(/省|市|自治区|特别行政区|壮族|回族|维吾尔/g, "");
}

function fallbackPublicationPoints(items = []) {
  const cities = new Map();
  items.forEach((item) => {
    const text = `${item.city || ""} ${item.publisher || ""}`;
    const matched = Object.keys(fallbackCityCoords).filter((city) => text.includes(city));
    (matched.length ? matched : ["Berlin"]).forEach((city) => {
      const current = cities.get(city) || {
        id: city,
        city,
        label: fallbackCityLabels[city] || city,
        coords: fallbackCityCoords[city],
        count: 0,
        years: [],
        publishers: new Set(),
        country: ["Peking", "Beijing", "北京", "Shanghai", "上海"].includes(city) ? "中国" : (item.country || "德国/德语区")
      };
      current.count += 1;
      if (Number(item.year)) current.years.push(Number(item.year));
      if (item.publisher) current.publishers.add(item.publisher);
      cities.set(city, current);
    });
  });
  return [...cities.values()].map((point) => ({ ...point, publishers: [...point.publishers] })).sort((a, b) => b.count - a.count);
}

function Panel({ chart, children, selected, onExport, id }) {
  return (
    <div className="work-panel atlas-panel" id={id}>
      <div className="panel-title-row">
        <div><strong>{chart?.title}</strong><span>{chart?.subtitle}</span></div>
        <button className="atlas-export-button" type="button" onClick={onExport}>导出 SVG</button>
      </div>
      {children}
      {selected && (
        <div className="atlas-selection">
          <strong>{selected.title || selected.label || selected.role || selected.city || selected.province || selected.text}</strong>
          <span>{selected.detail || selected.subtitle || selected.note || selected.valueText || ""}</span>
        </div>
      )}
    </div>
  );
}

function IdentityProcessChart({ chart }) {
  const [selected, setSelected] = useState(null);
  const [svg, setSvg] = useState(null);
  const columns = chart?.columns || [];
  const steps = chart?.steps || [];
  const stageXs = [70, 325, 580, 835];
  const roleYs = [116, 182, 248];
  const stepXs = [70, 315, 560, 805];
  return (
    <Panel id="visual-atlas-identity-process" chart={chart} selected={selected} onExport={() => downloadSvg("译者身份流变图.svg", svg)}>
      <svg ref={setSvg} viewBox="0 0 1040 470" className="atlas-svg identity-process-svg" role="img">
        <rect width="1040" height="470" fill="#fff" />
        <defs>
          <marker id="identitySpecArrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 Z" fill="#1f2937" /></marker>
        </defs>
        {stageXs.map((x) => <line key={x} x1={x + 86} x2={x + 86} y1="58" y2="316" stroke="#edf2f7" />)}
        {roleYs.map((y) => <line key={y} x1="70" x2="955" y1={y + 21} y2={y + 21} stroke="#f3f6fa" />)}
        {columns.map((stage, stageIndex) => (
          <g key={stage.id} transform={`translate(${stageXs[stageIndex]} 0)`}>
            <text className="atlas-title" x="86" y="58" textAnchor="middle">{stage.title}</text>
            <text className="atlas-subtitle" x="86" y="84" textAnchor="middle">{stage.note}</text>
            {(stage.roles?.length ? stage.roles : [{ name: "未记录", count: 0 }]).slice(0, 3).map((role, index) => (
              <g
                className="atlas-clickable"
                key={`${stage.id}-${role.name}`}
                transform={`translate(0 ${roleYs[index]})`}
                onClick={() => setSelected({ title: role.name, detail: `${stage.title}：${role.count} 条故事集相关记录` })}
              >
                <rect className={selected?.title === role.name ? "selected" : ""} width="172" height="42" rx="5" fill="#fff" stroke="#1f2937" strokeWidth="1.5" />
                <text className="atlas-node-label" x="86" y="26" textAnchor="middle">{role.name}</text>
                {stageIndex < columns.length - 1 && <path d="M172,21 L238,21" stroke="#1f2937" strokeWidth="1.35" markerEnd="url(#identitySpecArrow)" />}
              </g>
            ))}
          </g>
        ))}
        <g transform="translate(0 372)">
          {steps.map((step, index) => (
            <g className="atlas-clickable" key={step} transform={`translate(${stepXs[index]} 0)`} onClick={() => setSelected({ title: step, detail: "后端根据故事集表格字段生成该流程节点。" })}>
              <rect width="190" height="42" rx="5" fill="#f8fbff" stroke="#1f2937" strokeWidth="1.35" />
              <text className="atlas-node-label" x="95" y="26" textAnchor="middle">{step}</text>
              {index < steps.length - 1 && <path d="M190,21 L230,21" stroke="#1f2937" strokeWidth="1.25" markerEnd="url(#identitySpecArrow)" />}
            </g>
          ))}
        </g>
      </svg>
    </Panel>
  );
}

function IdentityRiverChart({ chart }) {
  const [selected, setSelected] = useState(null);
  const [svg, setSvg] = useState(null);
  const stages = chart?.stages || [];
  const series = chart?.series || [];
  const x = [196, 420, 644, 868];
  const plotTop = 74;
  const plotBottom = 330;
  const plotHeight = plotBottom - plotTop;
  const totals = stages.map((_, stageIndex) => Math.max(1, series.reduce((sum, item) => sum + (item.values?.[stageIndex] || 0), 0)));
  const stacks = stages.map((_, stageIndex) => {
    let y = plotTop + 20;
    return series.map((item) => {
      const h = Math.max(7, ((item.values?.[stageIndex] || 0) / totals[stageIndex]) * (plotHeight - 42));
      const row = { top: y, bottom: y + h, mid: y + h / 2 };
      y += h + 3;
      return row;
    });
  });
  return (
    <Panel chart={chart} selected={selected} onExport={() => downloadSvg("译者身份时间河流图.svg", svg)}>
      <svg ref={setSvg} viewBox="0 0 1040 460" className="atlas-svg identity-river-svg" role="img">
        <rect width="1040" height="460" fill="#fff" />
        <line x1="168" x2="904" y1={plotBottom} y2={plotBottom} stroke="#1f2937" strokeWidth="1.6" />
        <line x1="168" x2="168" y1={plotTop} y2={plotBottom} stroke="#1f2937" strokeWidth="1.2" />
        <line x1="904" x2="904" y1={plotTop} y2={plotBottom} stroke="#1f2937" strokeWidth="1.2" />
        {[0, 1, 2, 3, 4].map((tick) => (
          <line key={tick} x1="168" x2="904" y1={plotTop + tick * (plotHeight / 4)} y2={plotTop + tick * (plotHeight / 4)} stroke="#edf2f7" />
        ))}
        {x.map((axisX, index) => (
          <g key={stages[index]?.id || axisX}>
            <line x1={axisX} x2={axisX} y1={plotTop} y2={plotBottom + 12} stroke="#dbe7f3" />
            <circle cx={axisX} cy={plotBottom} r="5" fill="#fff" stroke="#1f2937" strokeWidth="1.4" />
            <text className="atlas-title" x={axisX} y="374" textAnchor="middle">{stages[index]?.title}</text>
            <text className="atlas-subtitle" x={axisX} y="398" textAnchor="middle">{stages[index]?.note}</text>
          </g>
        ))}
        {series.map((item, roleIndex) => (
          <g key={item.role}>
            {[0, 1, 2].map((stageIndex) => {
              const a = stacks[stageIndex]?.[roleIndex];
              const b = stacks[stageIndex + 1]?.[roleIndex];
              if (!a || !b) return null;
              const active = !selected?.role || selected.role === item.role;
              return (
                <path
                  className="atlas-clickable"
                  key={`${item.role}-${stageIndex}`}
                  d={`M${x[stageIndex]},${a.top} C${x[stageIndex] + 88},${a.top} ${x[stageIndex + 1] - 88},${b.top} ${x[stageIndex + 1]},${b.top} L${x[stageIndex + 1]},${b.bottom} C${x[stageIndex + 1] - 88},${b.bottom} ${x[stageIndex] + 88},${a.bottom} ${x[stageIndex]},${a.bottom} Z`}
                  fill={palette[roleIndex % palette.length]}
                  opacity={active ? 0.5 : 0.08}
                  onClick={() => setSelected({ role: item.role, title: item.role, detail: `四个阶段数量：${item.values.join(" / ")}` })}
                />
              );
            })}
          </g>
        ))}
        {series.map((item, roleIndex) => {
          const left = stacks[0]?.[roleIndex]?.mid || plotTop;
          const right = stacks[3]?.[roleIndex]?.mid || plotTop;
          const leftLabelY = 92 + roleIndex * 32;
          const rightLabelY = 92 + roleIndex * 32;
          return (
            <g className="atlas-clickable" key={`label-${item.role}`} onClick={() => setSelected({ role: item.role, title: item.role, detail: `四个阶段数量：${item.values.join(" / ")}` })}>
              <path d={`M${x[0] - 4},${left} L140,${leftLabelY}`} stroke="#94a3b8" strokeWidth="1" fill="none" />
              <text className="atlas-node-label" x="36" y={leftLabelY + 4}>{item.role}</text>
              <path d={`M${x[3] + 4},${right} L930,${rightLabelY}`} stroke="#94a3b8" strokeWidth="1" fill="none" />
              <text className="atlas-node-label" x="938" y={rightLabelY + 4}>{item.role}</text>
            </g>
          );
        })}
      </svg>
    </Panel>
  );
}

function PublicationBubbleMap({ chart, items, title, id }) {
  const [world, setWorld] = useState(null);
  const [selected, setSelected] = useState(null);
  const [year, setYear] = useState("all");
  const [svg, setSvg] = useState(null);
  const fallbackPoints = useMemo(() => fallbackPublicationPoints(items), [items]);
  const effectiveChart = chart || {
    title,
    subtitle: "出版地图",
    geo: {
      world: "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson",
      countries: ["Germany", "China", "Switzerland", "Austria", "Czechia"]
    },
    points: fallbackPoints
  };
  const points = effectiveChart.points || [];
  const years = points.flatMap((point) => point.years || []).filter(Boolean).sort((a, b) => a - b);
  const minYear = years[0] || 1900;
  const maxYear = years[years.length - 1] || 2026;
  const shown = year === "all" ? points : points.filter((point) => (point.years || []).some((item) => item <= Number(year)));
  const max = Math.max(1, ...shown.map((point) => point.count));

  useEffect(() => {
    let canceled = false;
    async function load() {
      try {
        const response = await fetch(effectiveChart.geo?.world || "https://raw.githubusercontent.com/datasets/geo-countries/master/data/countries.geojson", { cache: "force-cache" });
        const data = await response.json();
        if (!canceled) setWorld(data);
      } catch {
        if (!canceled) setWorld({ features: [] });
      }
    }
    load();
    return () => { canceled = true; };
  }, [effectiveChart.geo?.world]);

  const features = world?.features || [];
  const mapNames = new Set(effectiveChart.geo?.countries || ["Germany", "China", "Switzerland", "Austria", "Czechia"]);
  const europe = features.filter((feature) => mapNames.has(featureName(feature)) && featureName(feature) !== "China");
  const china = features.filter((feature) => featureName(feature) === "China");
  const projectEurope = europe.length ? makeProject(europe, { x: 44, y: 86, width: 570, height: 415, pad: 12 }) : null;
  const projectChina = china.length ? makeProject(china, { x: 666, y: 330, width: 234, height: 150, pad: 8 }) : null;

  function isChinaPoint(point) {
    return String(point.country || "").includes("中国") || ["Peking", "Beijing", "北京", "Shanghai", "上海"].includes(point.city);
  }
  function pointXY(point) {
    const projector = isChinaPoint(point) ? projectChina : projectEurope;
    return projector ? projector(point.coords) : [0, 0];
  }

  return (
    <Panel chart={effectiveChart} selected={selected} onExport={() => downloadSvg(`${effectiveChart.title || "出版地图"}.svg`, svg)}>
      <div className="atlas-map-controls">
        <label>时间过滤
          <input type="range" min={minYear} max={maxYear} value={year === "all" ? maxYear : year} onChange={(event) => setYear(event.target.value)} />
        </label>
        <button type="button" onClick={() => setYear("all")}>全部年份</button>
        <span>{year === "all" ? "显示全部出版节点" : `显示 ${year} 年及以前节点`}</span>
      </div>
      <svg ref={setSvg} viewBox="0 0 980 600" className="atlas-svg publication-svg" role="img" id={id}>
        <rect width="980" height="600" fill="#fff" />
        <text className="atlas-title" x="44" y="56">德国及德语区出版城市</text>
        {europe.flatMap((feature, featureIndex) => geometryPaths(feature.geometry, projectEurope).map((path, pathIndex) => (
          <path key={`${featureIndex}-${pathIndex}`} d={path} fill="#f2f7fb" stroke="#9bb0c5" strokeWidth="1" />
        )))}
        <g>
          <rect x="642" y="286" width="296" height="238" rx="8" fill="#fffdf7" stroke="#e7c873" />
          <text className="atlas-title publication-legend-title" x="660" y="318">中国出版节点</text>
          {china.flatMap((feature, featureIndex) => geometryPaths(feature.geometry, projectChina).map((path, pathIndex) => (
            <path key={`${featureIndex}-${pathIndex}`} d={path} fill="#fff8df" stroke="#c59b25" strokeWidth="1" />
          )))}
        </g>
        {shown.map((point, index) => {
          const [cx, cy] = pointXY(point);
          const r = 7 + point.count / max * 22;
          const color = palette[index % palette.length];
          const active = selected?.id === point.id;
          return (
            <g className="atlas-clickable" key={point.id} onClick={() => setSelected({ ...point, title: point.label, detail: `${point.city}：${point.count} 部；年份 ${Math.min(...(point.years || [0]))}-${Math.max(...(point.years || [0]))}` })}>
              <circle className={active ? "selected" : ""} cx={cx} cy={cy} r={r} fill={color} fillOpacity={isChinaPoint(point) ? 0.82 : 0.68} stroke="#111827" strokeWidth={active ? 3 : 1.2} />
              {(active || index < 9) && (
                <text className="atlas-map-label publication-label" x={cx + r + 7} y={cy - 7}>
                  <tspan x={cx + r + 7}>{point.label}</tspan>
                  <tspan x={cx + r + 7} dy="16">{point.city} · {point.count}部</tspan>
                </text>
              )}
            </g>
          );
        })}
        <g className="publication-legend" transform="translate(650 76)">
          <rect width="288" height="184" rx="8" fill="#f8fbff" stroke="#dce7f2" />
          <text className="atlas-title publication-legend-title" x="18" y="34">主要出版中心</text>
          {shown.slice(0, 7).map((point, index) => (
            <g className="atlas-clickable" key={point.id} transform={`translate(18 ${62 + index * 17})`} onClick={() => setSelected({ ...point, title: point.label, detail: `${point.city}：${point.count} 部` })}>
              <circle cx="6" cy="-5" r="5" fill={palette[index % palette.length]} />
              <text className="atlas-subtitle publication-legend-text" x="20" y="0">{point.label}</text>
              <rect x="92" y="-10" width="126" height="9" rx="3" fill="#eaf2fb" />
              <rect x="92" y="-10" width={(point.count / max) * 126} height="9" rx="3" fill={palette[index % palette.length]} />
              <text className="atlas-subtitle publication-legend-text" x="230" y="0">{point.count}</text>
            </g>
          ))}
        </g>
      </svg>
    </Panel>
  );
}

function SourceChinaMap({ chart }) {
  const [geo, setGeo] = useState(null);
  const [selected, setSelected] = useState(null);
  const [svg, setSvg] = useState(null);
  const points = chart?.points || [];
  const max = Math.max(1, ...points.map((point) => point.count));

  useEffect(() => {
    let canceled = false;
    async function load() {
      try {
        const response = await fetch(chart?.geo?.china || "https://geo.datav.aliyun.com/areas_v3/bound/100000_full.json", { cache: "force-cache" });
        const data = await response.json();
        if (!canceled) setGeo(data);
      } catch {
        if (!canceled) setGeo({ features: [] });
      }
    }
    load();
    return () => { canceled = true; };
  }, [chart?.geo?.china]);

  const features = geo?.features || [];
  const project = features.length ? makeProject(features, { x: 24, y: 32, width: 740, height: 500, pad: 6 }) : null;
  const pointMap = new Map(points.map((point, index) => [point.province, { ...point, color: regionColors[index % regionColors.length] }]));

  return (
    <Panel chart={chart} selected={selected} onExport={() => downloadSvg("故事取材来源地图.svg", svg)}>
      <svg ref={setSvg} viewBox="0 0 980 600" className="atlas-svg source-china-svg" role="img">
        <rect width="980" height="600" fill="#fff" />
        {features.flatMap((feature, featureIndex) => {
          const name = featureName(feature);
          const matched = points.find((point) => provinceKey(name).includes(point.province) || String(point.province || "").includes(provinceKey(name)));
          const index = points.findIndex((point) => point.province === matched?.province);
          const color = regionColors[Math.max(0, index) % regionColors.length];
          const count = matched?.count || 0;
          const fill = count ? color : "#eef3f8";
          const opacity = count ? 0.2 + count / max * 0.42 : 1;
          return geometryPaths(feature.geometry, project).map((path, pathIndex) => <path key={`${featureIndex}-${pathIndex}`} d={path} fill={fill} opacity={opacity} stroke="#9aa9ba" strokeWidth="0.7" />);
        })}
        {points.slice(0, 22).map((point, index) => {
          const [x, y] = project ? project(point.coords) : [0, 0];
          const r = 4 + point.count / max * 11;
          const color = regionColors[index % regionColors.length];
          const active = selected?.id === point.id;
          return (
            <g className="atlas-clickable" key={point.id} onClick={() => setSelected({ ...point, title: point.province, detail: `${point.count} 条来源线索；示例：${(point.examples || []).slice(0, 2).join("；")}` })}>
              <circle className={active ? "selected" : ""} cx={x} cy={y} r={r} fill={color} fillOpacity="0.82" stroke="#fff" strokeWidth={active ? 3 : 1.5} />
              {(active || index < 10) && <text className="atlas-map-label" x={x + r + 6} y={y + 4}>{point.province} {point.count}</text>}
            </g>
          );
        })}
        <g transform="translate(774 72)">
          <text className="atlas-title" x="0" y="0">来源热点</text>
          {points.slice(0, 13).map((point, index) => (
            <g className="atlas-clickable" key={point.id} transform={`translate(0 ${30 + index * 25})`} onClick={() => setSelected({ ...point, title: point.province, detail: `${point.count} 条来源线索` })}>
              <circle cx="8" cy="-6" r="5" fill={regionColors[index % regionColors.length]} />
              <text className="atlas-subtitle" x="22" y="0">{point.province}</text>
              <rect x="78" y="-11" width="110" height="10" rx="3" fill="#eaf2fb" />
              <rect x="78" y="-11" width={(point.count / max) * 110} height="10" rx="3" fill={regionColors[index % regionColors.length]} />
              <text className="atlas-subtitle" x="198" y="0">{point.count}</text>
            </g>
          ))}
        </g>
      </svg>
    </Panel>
  );
}

function PrefaceThemeCluster({ chart }) {
  const [selected, setSelected] = useState(null);
  const [svg, setSvg] = useState(null);
  const clusterAnchors = {
    translate: [260, 160],
    image: [700, 150],
    folk: [260, 405],
    reader: [710, 410],
    mediation: [500, 280]
  };
  const nodes = (chart?.nodes || []).map((node) => {
    const clusterNodes = (chart?.nodes || []).filter((item) => item.cluster === node.cluster);
    const localIndex = clusterNodes.findIndex((item) => item.id === node.id);
    const [cx, cy] = clusterAnchors[node.cluster] || [500, 280];
    const angle = (localIndex / Math.max(1, clusterNodes.length)) * Math.PI * 2 - Math.PI / 2;
    const radius = node.cluster === "mediation" ? 74 : 84;
    const clusterIndex = (chart?.clusters || []).findIndex((item) => item.id === node.cluster);
    return {
      ...node,
      x: cx + Math.cos(angle) * radius,
      y: cy + Math.sin(angle) * radius * 0.72,
      color: palette[Math.max(0, clusterIndex) % palette.length]
    };
  });
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const related = new Set((chart?.edges || []).filter((edge) => selected && (edge.source === selected.id || edge.target === selected.id)).flatMap((edge) => [edge.source, edge.target]));
  return (
    <Panel chart={chart} selected={selected && { title: selected.label, detail: `${selected.count} 次；主题群：${(chart?.clusters || []).find((item) => item.id === selected.cluster)?.title || ""}` }} onExport={() => downloadSvg("序跋主题聚类图.svg", svg)}>
      <svg ref={setSvg} viewBox="0 0 980 600" className="atlas-svg preface-cluster-svg" role="img">
        <rect width="980" height="600" fill="#fff" />
        {(chart?.clusters || []).map((cluster, index) => {
          const [x, y] = clusterAnchors[cluster.id] || [500, 280];
          return (
            <g key={cluster.id}>
              <ellipse cx={x} cy={y} rx={cluster.id === "mediation" ? 124 : 160} ry={cluster.id === "mediation" ? 94 : 112} fill={palette[index % palette.length]} opacity="0.07" stroke={palette[index % palette.length]} strokeWidth="1.2" />
              <text className="atlas-title cluster-title" x={x} y={y - 92} textAnchor="middle">{cluster.title}</text>
            </g>
          );
        })}
        {(chart?.edges || []).map((edge) => {
          const a = nodeMap.get(edge.source);
          const b = nodeMap.get(edge.target);
          if (!a || !b) return null;
          const active = !selected || edge.source === selected.id || edge.target === selected.id;
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2 - 24;
          return <path key={`${edge.source}-${edge.target}`} d={`M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`} fill="none" stroke={a.color} strokeWidth={Math.min(5.5, 1 + edge.weight / 7)} opacity={active ? 0.46 : 0.08} />;
        })}
        {nodes.map((node) => {
          const active = selected?.id === node.id || related.has(node.id);
          const r = 13 + Math.min(20, node.count * 1.35);
          return (
            <g className="atlas-clickable" key={node.id} onClick={() => setSelected(node)}>
              <circle className={selected?.id === node.id ? "selected" : ""} cx={node.x} cy={node.y} r={r} fill={node.color} opacity={active || !selected ? 0.86 : 0.22} stroke="#fff" strokeWidth="2" />
              <text className="atlas-node-label cluster-node-label" x={node.x} y={node.y + 5} textAnchor="middle">{node.label}</text>
            </g>
          );
        })}
      </svg>
    </Panel>
  );
}

function PrefaceWordCloud({ chart }) {
  const [selected, setSelected] = useState(null);
  const [cloudId, setCloudId] = useState("all");
  const [svg, setSvg] = useState(null);
  const clouds = chart?.wordClouds?.length ? chart.wordClouds : [{ id: "all", label: "总词云", words: chart?.words || [] }];
  const activeCloud = clouds.find((item) => item.id === cloudId) || clouds[0];
  const words = activeCloud?.words || [];
  const max = Math.max(1, ...words.map((item) => item.value));

  function cloudPosition(index) {
    if (index === 0) return [490, 278, 0];
    const angle = index * 2.399963;
    const radius = 28 + Math.sqrt(index) * 35;
    const x = 490 + Math.cos(angle) * radius * 1.45;
    const y = 280 + Math.sin(angle) * radius * 0.82;
    const rotate = index % 5 === 0 ? -18 : index % 7 === 0 ? 18 : 0;
    return [Math.max(70, Math.min(910, x)), Math.max(72, Math.min(520, y)), rotate];
  }

  return (
    <Panel chart={chart} selected={selected && { title: selected.text, detail: `词频权重：${selected.value}` }} onExport={() => downloadSvg("序跋词云图.svg", svg)}>
      <div className="word-cloud-toolbar">
        <label>序跋词云
          <select value={activeCloud?.id || "all"} onChange={(event) => { setCloudId(event.target.value); setSelected(null); }}>
            {clouds.map((cloud) => <option key={cloud.id} value={cloud.id}>{cloud.label}</option>)}
          </select>
        </label>
      </div>
      <svg ref={setSvg} viewBox="0 0 980 600" className="atlas-svg word-cloud-svg" role="img">
        <rect width="980" height="600" fill="#fff" />
        <ellipse cx="490" cy="294" rx="410" ry="220" fill="#f8fbff" stroke="#e0ebf6" />
        {words.slice(0, 95).map((word, index) => {
          const [x, y, rotate] = cloudPosition(index);
          const size = 12 + Math.pow(word.value / max, 0.72) * 58;
          const active = !selected || selected.text === word.text;
          return (
            <text
              className="word-cloud-word atlas-clickable"
              key={`${word.text}-${index}`}
              x={x}
              y={y}
              textAnchor="middle"
              transform={`rotate(${rotate} ${x} ${y})`}
              style={{ fontSize: `${size}px`, fill: palette[index % palette.length], fontWeight: index < 18 ? 900 : 760, opacity: active ? 0.94 : 0.18 }}
              onClick={() => setSelected(word)}
            >
              {short(word.text, index < 12 ? 10 : 8)}
            </text>
          );
        })}
      </svg>
    </Panel>
  );
}

function ChildThemeCooccurrence({ chart }) {
  const [selected, setSelected] = useState(null);
  const [svg, setSvg] = useState(null);
  const nodes = (chart?.nodes || []).map((node, index) => {
    const angle = (index / Math.max(1, (chart?.nodes || []).length)) * Math.PI * 2 - Math.PI / 2;
    const radius = index < 4 ? 124 : index < 10 ? 204 : 272;
    return {
      ...node,
      x: 500 + Math.cos(angle) * radius * 1.22,
      y: 296 + Math.sin(angle) * radius * 0.76,
      color: palette[index % palette.length],
      group: index < 4 ? "核心主题" : index < 10 ? "高频组合" : "扩展母题"
    };
  });
  const nodeMap = new Map(nodes.map((node) => [node.id, node]));
  const maxNode = Math.max(1, ...nodes.map((node) => node.count));
  const maxEdge = Math.max(1, ...(chart?.edges || []).map((edge) => edge.weight));
  const related = new Set((chart?.edges || []).filter((edge) => selected && (edge.source === selected.id || edge.target === selected.id)).flatMap((edge) => [edge.source, edge.target]));
  return (
    <Panel id="visual-atlas-child-co" chart={chart} selected={selected && { title: selected.label, detail: `出现在 ${selected.count} 个故事集主题组合中；分组：${selected.group}` }} onExport={() => downloadSvg("子故事主题共现图.svg", svg)}>
      <svg ref={setSvg} viewBox="0 0 980 620" className="atlas-svg child-co-svg" role="img">
        <rect width="980" height="620" fill="#fff" />
        {[170, 290, 410, 530, 650, 770].map((x) => <line key={x} x1={x} x2={x} y1="58" y2="540" stroke="#f1f5f9" />)}
        {[110, 210, 310, 410, 510].map((y) => <line key={y} x1="90" x2="900" y1={y} y2={y} stroke="#f1f5f9" />)}
        {(chart?.edges || []).map((edge) => {
          const a = nodeMap.get(edge.source);
          const b = nodeMap.get(edge.target);
          if (!a || !b) return null;
          const active = !selected || edge.source === selected.id || edge.target === selected.id;
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          return <path key={`${edge.source}-${edge.target}`} d={`M${a.x},${a.y} Q${mx},${my - 18} ${b.x},${b.y}`} fill="none" stroke={a.color} strokeWidth={1 + edge.weight / maxEdge * 5} opacity={active ? 0.52 : 0.08} />;
        })}
        {nodes.map((node) => {
          const r = 18 + node.count / maxNode * 25;
          const active = !selected || selected.id === node.id || related.has(node.id);
          return (
            <g className="atlas-clickable" key={node.id} onClick={() => setSelected(node)}>
              <circle className={selected?.id === node.id ? "selected" : ""} cx={node.x} cy={node.y} r={r} fill={node.color} fillOpacity={active ? 0.86 : 0.18} stroke="#fff" strokeWidth="2" />
              <text className="atlas-node-label child-node-label" x={node.x} y={node.y + 5} textAnchor="middle">{node.label}</text>
              {r > 30 && <text className="atlas-subtitle child-count-label" x={node.x} y={node.y + r + 18} textAnchor="middle">{node.count}</text>}
            </g>
          );
        })}
        <g transform="translate(724 68)">
          <rect width="190" height="112" rx="8" fill="#f8fbff" stroke="#dce7f2" />
          {["核心主题", "高频组合", "扩展母题"].map((label, index) => (
            <g key={label} transform={`translate(18 ${30 + index * 26})`}>
              <circle cx="7" cy="-5" r="7" fill={palette[index]} />
              <text className="atlas-subtitle" x="24" y="0">{label}</text>
            </g>
          ))}
        </g>
      </svg>
    </Panel>
  );
}

export { PublicationBubbleMap };

export default function StoryVisualAtlas({ mode = "collections", prefaces = {} }) {
  const [atlas, setAtlas] = useState(null);
  const [error, setError] = useState("");
  const [prefaceAtlas, setPrefaceAtlas] = useState(null);

  useEffect(() => {
    let canceled = false;
    api.storyVisualAtlas()
      .then((data) => { if (!canceled) setAtlas(data); })
      .catch((err) => { if (!canceled) setError(err.message); });
    return () => { canceled = true; };
  }, []);

  useEffect(() => {
    if (mode !== "prefaces") return undefined;
    let canceled = false;
    api.prefaceVisuals(prefaces)
      .then((data) => { if (!canceled) setPrefaceAtlas(data); })
      .catch(() => { if (!canceled) setPrefaceAtlas(null); });
    return () => { canceled = true; };
  }, [mode, prefaces]);

  if (error) {
    return <div className="work-panel atlas-loading">后端图表数据生成失败：{error}</div>;
  }
  if (!atlas) {
    return <div className="work-panel atlas-loading">正在从后端生成可视化图谱...</div>;
  }

  const charts = atlas.charts || {};
  const wordCloudChart = prefaceAtlas?.wordClouds?.length
    ? { ...charts.wordCloud, wordClouds: prefaceAtlas.wordClouds, words: prefaceAtlas.wordClouds[0]?.words || charts.wordCloud?.words || [] }
    : charts.wordCloud;

  if (mode === "prefaces") {
    return (
      <section className="story-atlas story-atlas-prefaces" id="visual-atlas-preface-cluster">
        <div className="atlas-grid two-col equal-atlas-row">
          <PrefaceThemeCluster chart={charts.prefaceCluster} />
          <PrefaceWordCloud chart={wordCloudChart} />
        </div>
      </section>
    );
  }

  if (mode === "children") {
    return (
      <section className="story-atlas story-atlas-children" id="visual-atlas-child-co">
        <ChildThemeCooccurrence chart={charts.childCooccurrence} />
      </section>
    );
  }

  return (
    <section className="story-atlas story-atlas-collections" id="visual-atlas-identity-process">
      <div className="atlas-grid two-col equal-atlas-row">
        <IdentityProcessChart chart={charts.identityProcess} />
        <IdentityRiverChart chart={charts.identityRiver} />
      </div>
      <div className="atlas-grid two-col equal-atlas-row">
        <PublicationBubbleMap chart={charts.publicationMap} />
        <SourceChinaMap chart={charts.sourceMap} />
      </div>
    </section>
  );
}
