import { useEffect, useMemo, useRef, useState } from "react";
import { useGlobalFilter } from "../context/GlobalFilterContext.jsx";
import { api } from "../services/api.js";
import VisualModal, { ExpandButton } from "./VisualModal.jsx";
import {
  PublicationBubbleMap as StoryMapPublicationBubbleMap,
  SourceChinaMap as StoryMapSourceChinaMap,
} from "./StoryMapAtlas.jsx";

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

function yearRange(years = []) {
  const values = [...new Set(years.filter(Boolean).map(Number))].sort((a, b) => a - b);
  return { values, min: values[0] || 1900, max: values[values.length - 1] || 2026 };
}

function yearsMatch(years = [], mode, start, end) {
  if (mode === "all") return true;
  const values = years.map(Number).filter(Boolean);
  if (!values.length) return false;
  if (mode === "single") return values.includes(Number(start));
  return values.some((year) => year >= Number(start) && year <= Number(end));
}

function TimeFilter({ years = [], mode, start, end, onMode, onStart, onEnd }) {
  const range = yearRange(years);
  const safeEnd = Math.max(Number(start), Number(end));
  return (
    <div className="atlas-time-filter">
      <div className="segmented">
        <button className={mode === "all" ? "active" : ""} type="button" onClick={() => onMode("all")}>总览</button>
        <button className={mode === "single" ? "active" : ""} type="button" onClick={() => onMode("single")}>单年</button>
        <button className={mode === "range" ? "active" : ""} type="button" onClick={() => onMode("range")}>时间段</button>
      </div>
      {mode === "single" && (
        <label className="time-slider-label">年份 <b>{start}</b>
          <input type="range" min={range.min} max={range.max} step="1" value={start} onChange={(event) => onStart(Number(event.target.value))} />
        </label>
      )}
      {mode === "range" && (
        <div className="time-range-sliders">
          <span>{start} - {safeEnd}</span>
          <input type="range" min={range.min} max={range.max} step="1" value={start} onChange={(event) => onStart(Math.min(Number(event.target.value), safeEnd))} />
          <input type="range" min={range.min} max={range.max} step="1" value={safeEnd} onChange={(event) => onEnd(Math.max(Number(event.target.value), Number(start)))} />
        </div>
      )}
    </div>
  );
}

function useAtlasForceLayout(graph, width = 980, height = 600, options = {}) {
  const [positions, setPositions] = useState({});
  const dragRef = useRef(null);
  const fixedRef = useRef({});
  const frameRef = useRef(0);
  const optionKey = JSON.stringify({
    repel: options.repel,
    linkDistance: options.linkDistance,
    linkStrength: options.linkStrength,
    centerStrength: options.centerStrength,
    clusterStrength: options.clusterStrength,
    damping: options.damping,
    ticks: options.ticks,
    paddingX: options.paddingX,
    paddingY: options.paddingY,
    paddingTop: options.paddingTop,
    paddingBottom: options.paddingBottom,
    clusterRadiusX: options.clusterRadiusX,
    clusterRadiusY: options.clusterRadiusY,
    localRadiusX: options.localRadiusX,
    localRadiusY: options.localRadiusY,
    collisionPadding: options.collisionPadding,
    collisionStrength: options.collisionStrength,
    collisionRadius: options.collisionRadius,
    maxCollisionRadius: options.maxCollisionRadius,
    maxVelocity: options.maxVelocity,
  });
  const layoutKey = useMemo(() => JSON.stringify({
    nodes: (graph?.nodes || []).map((node) => [node.id, node.count, node.cluster]),
    edges: (graph?.edges || []).map((edge) => [edge.source, edge.target, edge.weight]),
    options: optionKey,
  }), [graph, optionKey]);

  useEffect(() => {
    const nodes = graph?.nodes || [];
    const edges = graph?.edges || [];
    const config = {
      repel: options.repel ?? 480,
      linkDistance: options.linkDistance ?? 126,
      linkStrength: options.linkStrength ?? 0.006,
      centerStrength: options.centerStrength ?? 0.0008,
      clusterStrength: options.clusterStrength ?? 0.0007,
      damping: options.damping ?? 0.86,
      ticks: options.ticks ?? 140,
      paddingX: options.paddingX ?? 40,
      paddingY: options.paddingY ?? 48,
      paddingTop: options.paddingTop ?? options.paddingY ?? 48,
      paddingBottom: options.paddingBottom ?? options.paddingY ?? 48,
      clusterRadiusX: options.clusterRadiusX ?? 185,
      clusterRadiusY: options.clusterRadiusY ?? 112,
      localRadiusX: options.localRadiusX ?? 52,
      localRadiusY: options.localRadiusY ?? 42,
      collisionPadding: options.collisionPadding ?? 0,
      collisionStrength: options.collisionStrength ?? 0.035,
      collisionRadius: options.collisionRadius ?? 18,
      maxCollisionRadius: options.maxCollisionRadius ?? 72,
      maxVelocity: options.maxVelocity ?? 18,
    };
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const radiusOf = (id) => {
      const node = nodeById.get(id);
      const count = Number(node?.count || 1);
      const base = typeof config.collisionRadius === "function"
        ? config.collisionRadius(node)
        : Number(config.collisionRadius) + Math.sqrt(Math.max(1, count)) * 1.8;
      return Math.max(8, Math.min(config.maxCollisionRadius, base || 18));
    };
    const clusters = [...new Set(nodes.map((node) => node.cluster || "default"))];
    const clusterMembers = new Map(clusters.map((cluster) => [cluster, nodes.filter((node) => (node.cluster || "default") === cluster)]));
    const clusterAnchors = new Map(clusters.map((cluster, index) => {
      const angle = (index / Math.max(1, clusters.length)) * Math.PI * 2 - Math.PI / 2;
      return [cluster, {
        x: width / 2 + Math.cos(angle) * config.clusterRadiusX,
        y: height / 2 + Math.sin(angle) * config.clusterRadiusY,
      }];
    }));
    fixedRef.current = {};
    const next = {};
    nodes.forEach((node) => {
      const cluster = node.cluster || "default";
      const clusterIndex = Math.max(0, clusters.indexOf(cluster));
      const members = clusterMembers.get(cluster) || nodes;
      const localIndex = Math.max(0, members.findIndex((item) => item.id === node.id));
      const anchor = clusterAnchors.get(cluster) || { x: width / 2, y: height / 2 };
      const localAngle = (localIndex / Math.max(1, members.length)) * Math.PI * 2 + clusterIndex * 0.38;
      const localRing = 0.72 + Math.floor(localIndex / 8) * 0.28;
      next[node.id] = {
        x: anchor.x + Math.cos(localAngle) * config.localRadiusX * localRing,
        y: anchor.y + Math.sin(localAngle) * config.localRadiusY * localRing,
        vx: (Math.random() - 0.5) * 2,
        vy: (Math.random() - 0.5) * 2,
      };
    });
    setPositions(next);
    cancelAnimationFrame(frameRef.current);
    let tick = 0;
    function step() {
      tick += 1;
      setPositions((current) => {
        const ids = Object.keys(current);
        const updated = Object.fromEntries(ids.map((id) => [id, { ...current[id] }]));
        for (let i = 0; i < ids.length; i += 1) {
          for (let j = i + 1; j < ids.length; j += 1) {
            const a = updated[ids[i]];
            const b = updated[ids[j]];
            let dx = a.x - b.x;
            let dy = a.y - b.y;
            if (!dx && !dy) {
              const angle = ((i + 1) * (j + 3)) % 360 / 180 * Math.PI;
              dx = Math.cos(angle);
              dy = Math.sin(angle);
            }
            const dist = Math.max(1, Math.hypot(dx, dy));
            const force = config.repel / (dist * dist);
            a.vx += (dx / dist) * force;
            a.vy += (dy / dist) * force;
            b.vx -= (dx / dist) * force;
            b.vy -= (dy / dist) * force;
            const minDistance = radiusOf(ids[i]) + radiusOf(ids[j]) + config.collisionPadding;
            if (dist < minDistance) {
              const push = (minDistance - dist) * config.collisionStrength;
              a.vx += (dx / dist) * push;
              a.vy += (dy / dist) * push;
              b.vx -= (dx / dist) * push;
              b.vy -= (dy / dist) * push;
            }
          }
        }
        edges.forEach((edge) => {
          const a = updated[edge.source];
          const b = updated[edge.target];
          if (!a || !b) return;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.max(1, Math.hypot(dx, dy));
          const force = (dist - config.linkDistance) * config.linkStrength;
          a.vx += (dx / dist) * force;
          a.vy += (dy / dist) * force;
          b.vx -= (dx / dist) * force;
          b.vy -= (dy / dist) * force;
        });
        ids.forEach((id) => {
          const node = updated[id];
          const fixed = fixedRef.current[id];
          if (fixed) {
            node.x = fixed.x;
            node.y = fixed.y;
            node.vx = 0;
            node.vy = 0;
            return;
          }
          const radius = radiusOf(id);
          const sourceNode = nodeById.get(id);
          const anchor = clusterAnchors.get(sourceNode?.cluster || "default");
          if (anchor) {
            node.vx += (anchor.x - node.x) * config.clusterStrength;
            node.vy += (anchor.y - node.y) * config.clusterStrength;
          }
          node.vx += (width / 2 - node.x) * config.centerStrength;
          node.vy += (height / 2 - node.y) * config.centerStrength;
          node.vx *= config.damping;
          node.vy *= config.damping;
          node.vx = Math.max(-config.maxVelocity, Math.min(config.maxVelocity, node.vx));
          node.vy = Math.max(-config.maxVelocity, Math.min(config.maxVelocity, node.vy));
          node.x = Math.max(config.paddingX + radius, Math.min(width - config.paddingX - radius, node.x + node.vx));
          node.y = Math.max(config.paddingTop + radius, Math.min(height - config.paddingBottom - radius, node.y + node.vy));
        });
        return updated;
      });
      if (tick < config.ticks) frameRef.current = requestAnimationFrame(step);
    }
    frameRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameRef.current);
  }, [height, layoutKey, width]);

  function point(event) {
    const svg = event.currentTarget.ownerSVGElement || event.currentTarget;
    const rect = svg.getBoundingClientRect();
    return {
      x: ((event.clientX - rect.left) / rect.width) * width,
      y: ((event.clientY - rect.top) / rect.height) * height,
    };
  }

  function startDrag(event, id) {
    dragRef.current = id;
    fixedRef.current[id] = point(event);
    event.currentTarget.setPointerCapture?.(event.pointerId);
  }

  function moveDrag(event) {
    if (!dragRef.current) return;
    const p = point(event);
    fixedRef.current[dragRef.current] = p;
    setPositions((current) => ({ ...current, [dragRef.current]: p }));
  }

  function endDrag() {
    dragRef.current = null;
  }

  return { positions, startDrag, moveDrag, endDrag };
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

const hiddenMethodSubtitleMarkers = [
  ["领", "域", "词", "典"].join(""),
  ["j", "i", "e", "b", "a"].join(""),
  ["词", "性", "过", "滤"].join(""),
  ["短", "语", "合", "并"].join(""),
  ["T", "F", "-", "I", "D", "F"].join(""),
  ["T", "e", "x", "t", "R", "a", "n", "k"].join(""),
  ["融", "合", "权", "重"].join(""),
];

function cleanChartSubtitle(value) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return hiddenMethodSubtitleMarkers.some((marker) => text.includes(marker)) ? "" : text;
}

function Panel({ chart, children, selected, onExport, id, allowExpand = true }) {
  const [modalOpen, setModalOpen] = useState(false);
  const subtitle = cleanChartSubtitle(chart?.subtitle);
  return (
    <>
    <div className="work-panel atlas-panel" id={id}>
      <div className="panel-title-row">
        <div><strong>{chart?.title}</strong>{subtitle && <span>{subtitle}</span>}</div>
        <div className="visual-heading-actions">
          {allowExpand && <ExpandButton onClick={() => setModalOpen(true)} label="放大图表" />}
          {onExport && <button className="atlas-export-button" type="button" onClick={onExport}>导出 SVG</button>}
        </div>
      </div>
      {children}
      {selected && (
        <div className="atlas-selection">
          <strong>{selected.title || selected.label || selected.role || selected.city || selected.province || selected.text}</strong>
          <span>{selected.detail || selected.subtitle || selected.note || selected.valueText || ""}</span>
        </div>
      )}
    </div>
    {allowExpand && (
      <VisualModal open={modalOpen} title={chart?.title} subtitle={subtitle || "放大查看图表细节"} onClose={() => setModalOpen(false)}>
        <div className="work-panel atlas-panel visual-modal-panel">
          <div className="panel-title-row">
            <div><strong>{chart?.title}</strong>{subtitle && <span>{subtitle}</span>}</div>
          </div>
          {children}
        </div>
      </VisualModal>
    )}
    </>
  );
}

function IdentityProcessChart({ chart }) {
  const [selected, setSelected] = useState(null);
  const [svg, setSvg] = useState(null);
  const decades = chart?.decades || [];
  const roles = chart?.roles?.length
    ? chart.roles
    : [...new Set(decades.flatMap((decade) => (decade.roles || []).map((row) => row.role)))].map((name) => ({ name, total: 0 }));
  const transitions = chart?.transitions || [];
  const width = 1120;
  const height = 540;
  const matrixX = 176;
  const roleDotX = 10;
  const labelX = 126;
  const countX = 154;
  const left = 190;
  const right = 914;
  const top = 72;
  const rowH = 36;
  const matrixBottom = top + roles.length * rowH + 18;
  const cellW = decades.length ? (right - left) / decades.length : 68;
  const roleRows = roles.map((role, index) => ({ ...role, y: top + index * rowH + 22 }));
  const maxCount = Math.max(1, ...decades.flatMap((decade) => (decade.roles || []).map((role) => role.count || 0)));
  const maxTotal = Math.max(1, ...decades.map((decade) => decade.total || 0));
  const maxRoleTotal = Math.max(1, ...roles.map((role) => role.total || 0));
  const roleColor = (role) => palette[Math.max(0, roles.findIndex((item) => item.name === role)) % palette.length];
  const roleY = (role) => roleRows.find((item) => item.name === role)?.y || top;
  const decadeX = (index) => left + index * cellW + cellW / 2;
  const dominantPoints = decades
    .map((decade, index) => ({ x: decadeX(index), y: roleY(decade.topRole) - 5, decade }))
    .filter((point) => point.decade.topCount > 0);
  const dominantPath = dominantPoints.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ");
  const totalBase = 452;
  const totalMaxH = 52;
  const diversityBase = 504;
  const diversityMaxH = 38;
  const diversityPath = decades
    .map((decade, index) => {
      const y = diversityBase - Number(decade.diversity || 0) * diversityMaxH;
      return `${index ? "L" : "M"}${decadeX(index)},${y}`;
    })
    .join(" ");
  const sidePanelY = 46;
  const sidePanelH = 478;
  const sideItemTop = 104;
  const sideItemBottom = 486;
  const sideStep = roles.length > 1 ? (sideItemBottom - sideItemTop) / (roles.length - 1) : 0;
  const selectedInfo = selected && {
    title: selected.title || selected.role || selected.name,
    detail: selected.detail || `${selected.decade || ""}：${selected.count || 0} 条，占该年代 ${(Number(selected.share || 0) * 100).toFixed(1)}%。`,
  };
  const toggleSelected = (key, payload) => {
    setSelected((current) => (current?.selectionKey === key ? null : { ...payload, selectionKey: key }));
  };
  return (
    <Panel id="visual-atlas-identity-process" chart={chart} selected={selectedInfo} onExport={() => downloadSvg("译者身份流变图.svg", svg)}>
      <svg ref={setSvg} viewBox={`0 0 ${width} ${height}`} className="atlas-svg identity-process-svg" role="img">
        <rect width={width} height={height} fill="#fff" />
        <defs>
          <linearGradient id="identityMatrixFade" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stopColor="#f8fbff" />
            <stop offset="100%" stopColor="#eef6f3" />
          </linearGradient>
          <linearGradient id="identitySideFade" x1="0%" x2="0%" y1="0%" y2="100%">
            <stop offset="0%" stopColor="#f8fbff" />
            <stop offset="100%" stopColor="#ffffff" />
          </linearGradient>
          <filter id="identityCellShadow"><feDropShadow dx="0" dy="5" stdDeviation="5" floodColor="#0f172a" floodOpacity="0.09" /></filter>
        </defs>
        <rect x={matrixX} y="46" width={926 - matrixX} height={matrixBottom - 40} rx="6" fill="url(#identityMatrixFade)" stroke="#dbe7f3" />
        <rect x="944" y={sidePanelY} width="148" height={sidePanelH} rx="6" fill="url(#identitySideFade)" stroke="#dbe7f3" />
        <text className="atlas-subtitle identity-small-label" x="42" y="62">译介主体身份</text>
        <text className="atlas-subtitle identity-small-label" x="914" y="62" textAnchor="end">十年尺度 · 计数 / 占比</text>
        {roleRows.map((role, index) => (
          <g key={role.name}>
            <line x1={matrixX} x2="926" y1={role.y + rowH / 2 - 5} y2={role.y + rowH / 2 - 5} stroke="#e8eef5" />
            <circle cx={roleDotX} cy={role.y - 4} r="6" fill={roleColor(role.name)} />
            <text className="atlas-node-label identity-role-label" x={labelX} y={role.y} textAnchor="end">{role.name}</text>
            <text className="atlas-subtitle identity-small-label" x={countX} y={role.y} textAnchor="middle">{role.total || 0}</text>
            {index === 0 && <text className="atlas-subtitle identity-small-label" x={countX} y="42" textAnchor="middle">总量</text>}
          </g>
        ))}
        {decades.map((decade, decadeIndex) => {
          const x = left + decadeIndex * cellW;
          return (
            <g key={decade.id}>
              <line x1={x + cellW / 2} x2={x + cellW / 2} y1="56" y2="506" stroke="#dbe7f3" />
              <text className="atlas-subtitle identity-axis-label" x={x + cellW / 2} y={matrixBottom + 28} textAnchor="middle">{decade.label}</text>
              <rect
                className="atlas-clickable"
                x={x + cellW * 0.24}
                y={totalBase - (decade.total / maxTotal) * totalMaxH}
                width={cellW * 0.52}
                height={(decade.total / maxTotal) * totalMaxH}
                fill="#0b66b2"
                opacity="0.52"
                onClick={() => toggleSelected(`total-${decade.id}`, { title: `${decade.label} 样本量`, detail: `该年代共 ${decade.total} 条记录；活跃身份 ${decade.activeRoles || 0} 类，多样性指数 ${Number(decade.diversity || 0).toFixed(2)}。` })}
              />
              <text className="atlas-subtitle identity-small-label" x={x + cellW / 2} y={totalBase + 18} textAnchor="middle">{decade.total}</text>
              {(decade.roles || []).map((row) => {
                const y = roleY(row.role);
                const strength = row.count / maxCount;
                const size = 9 + Math.sqrt(strength) * 19;
                const active = !selected || selected.role === row.role || selected.decade === decade.label;
                return (
                  <g
                    className="atlas-clickable"
                    key={`${decade.id}-${row.role}`}
                    onClick={() => toggleSelected(`cell-${decade.id}-${row.role}`, { ...row, role: row.role, decade: decade.label, title: `${decade.label} · ${row.role}`, detail: `${row.count} 条，占该年代 ${(Number(row.share || 0) * 100).toFixed(1)}%；该年代主导身份为 ${decade.topRole}。` })}
                  >
                    <rect x={x + 6} y={y - 19} width={cellW - 12} height="28" rx="4" fill={roleColor(row.role)} opacity={active ? 0.08 + strength * 0.62 : 0.04} />
                    {row.count > 0 && (
                      <>
                        <circle cx={x + cellW / 2} cy={y - 5} r={size / 2} fill={roleColor(row.role)} opacity={active ? 0.86 : 0.18} filter="url(#identityCellShadow)" />
                        <text className="atlas-subtitle identity-count-label" x={x + cellW / 2} y={y - 1} textAnchor="middle">{row.count}</text>
                      </>
                    )}
                  </g>
                );
              })}
            </g>
          );
        })}
        {transitions.map((edge, index) => {
          const sourceIndex = decades.findIndex((item) => item.id === edge.sourceDecade);
          const targetIndex = decades.findIndex((item) => item.id === edge.targetDecade);
          if (sourceIndex < 0 || targetIndex < 0) return null;
          const y = roleY(edge.sourceRole) - 5;
          const x1 = decadeX(sourceIndex) + Math.min(20, cellW * 0.28);
          const x2 = decadeX(targetIndex) - Math.min(20, cellW * 0.28);
          const active = !selected || selected.role === edge.sourceRole;
          return (
            <path
              className="atlas-clickable"
              key={`${edge.sourceDecade}-${edge.sourceRole}-${index}`}
              d={`M${x1},${y} C${x1 + cellW * 0.28},${y - 8} ${x2 - cellW * 0.28},${y - 8} ${x2},${y}`}
              fill="none"
              stroke={roleColor(edge.sourceRole)}
              strokeWidth={Math.max(1, Math.min(8, 1 + edge.weight * 0.65))}
              opacity={active ? 0.34 : 0.035}
              onClick={() => toggleSelected(`transition-${edge.sourceDecade}-${edge.targetDecade}-${edge.sourceRole}`, { role: edge.sourceRole, title: `${edge.sourceDecade} → ${edge.targetDecade}`, detail: `${edge.sourceRole}：相邻年代变化 ${edge.delta >= 0 ? "+" : ""}${edge.delta}，关联强度 ${edge.weight}` })}
            />
          );
        })}
        {dominantPath && (
          <path
            d={dominantPath}
            fill="none"
            stroke="#111827"
            strokeWidth="2"
            strokeDasharray="5 5"
            opacity="0.62"
          />
        )}
        {dominantPoints.map((point, index) => (
          <g
            className="atlas-clickable"
            key={`dominant-${point.decade.id}`}
            onClick={() => toggleSelected(`dominant-${point.decade.id}`, { title: `${point.decade.label} 主导身份`, detail: `${point.decade.topRole}，${point.decade.topCount} 条；该年代总量 ${point.decade.total} 条，集中度 ${Number(point.decade.concentration || 0).toFixed(2)}。`, decade: point.decade.label })}
          >
            <circle cx={point.x} cy={point.y} r="5" fill="#111827" />
            <text className="atlas-subtitle identity-small-label" x={point.x} y={point.y - 12} textAnchor="middle">{point.decade.topRole}</text>
          </g>
        ))}
        <text className="atlas-subtitle identity-small-label" x="46" y="410">年代样本量</text>
        <text className="atlas-subtitle identity-small-label" x="46" y="492">结构多样性</text>
        {diversityPath && <path d={diversityPath} fill="none" stroke="#15a884" strokeWidth="2.6" opacity="0.8" />}
        {decades.map((decade, index) => (
          <circle
            className="atlas-clickable"
            key={`diversity-${decade.id}`}
            cx={decadeX(index)}
            cy={diversityBase - Number(decade.diversity || 0) * diversityMaxH}
            r="3.8"
            fill="#15a884"
            onClick={() => toggleSelected(`diversity-${decade.id}`, { title: `${decade.label} 结构指数`, detail: `多样性指数 ${Number(decade.diversity || 0).toFixed(2)}，集中度 ${Number(decade.concentration || 0).toFixed(2)}，活跃身份 ${decade.activeRoles || 0} 类。` })}
          />
        ))}
        <text className="atlas-subtitle identity-small-label" x="154" y="526">底部柱高表示该年代记录总量；绿色折线表示身份结构多样性；黑色虚线连接各年代主导身份。</text>
        <text className="atlas-title identity-side-title" x="960" y="76">身份总量与峰值</text>
        {roles.map((role, index) => {
          const y = sideItemTop + index * sideStep;
          return (
            <g className="atlas-clickable" key={`side-${role.name}`} onClick={() => toggleSelected(`side-${role.name}`, { title: role.name, detail: `总量 ${role.total || 0} 条，占全部 ${(Number(role.share || 0) * 100).toFixed(1)}%；峰值年代 ${role.peakDecade || "未记录"}，${role.peakCount || 0} 条。`, role: role.name })}>
              <circle cx="960" cy={y - 5} r="5" fill={roleColor(role.name)} />
              <text className="atlas-subtitle identity-side-label" x="972" y={y - 1}>{role.name}</text>
              <rect x="960" y={y + 9} width="104" height="7" rx="3.5" fill="#edf2f7" />
              <rect x="960" y={y + 9} width={(Number(role.total || 0) / maxRoleTotal) * 104} height="7" rx="3.5" fill={roleColor(role.name)} opacity="0.76" />
              <text className="atlas-subtitle identity-small-label" x="1076" y={y + 16} textAnchor="end">{role.total || 0}</text>
              <text className="atlas-subtitle identity-small-label" x="960" y={y + 33}>{role.peakDecade || ""} 峰值 {role.peakCount || 0}</text>
            </g>
          );
        })}
      </svg>
    </Panel>
  );
}

function IdentityRiverChart({ chart }) {
  const [selected, setSelected] = useState(null);
  const [svg, setSvg] = useState(null);
  const stages = chart?.decades || chart?.stages || [];
  const series = chart?.series || [];
  const width = 1120;
  const height = 540;
  const x = stages.map((_, index) => 158 + (index / Math.max(1, stages.length - 1)) * 800);
  const plotTop = 50;
  const plotBottom = 406;
  const plotMid = (plotTop + plotBottom) / 2;
  const plotHeight = plotBottom - plotTop;
  const axisLabelY = plotBottom + 38;
  const axisCountY = plotBottom + 60;
  const footerY = plotBottom + 94;
  const totals = stages.map((_, stageIndex) => series.reduce((sum, item) => sum + (item.values?.[stageIndex] || 0), 0));
  const maxTotal = Math.max(1, ...totals);
  const valueScale = (plotHeight - 34) / maxTotal;
  const stacks = stages.map((_, stageIndex) => {
    const totalHeight = totals[stageIndex] * valueScale;
    let y = plotMid - totalHeight / 2;
    return series.map((item) => {
      const value = Number(item.values?.[stageIndex] || 0);
      const h = value * valueScale;
      const row = { top: y, bottom: y + h, mid: y + h / 2, value, height: h };
      y += h;
      return row;
    });
  });
  const roleDetail = (item) => `各年代数量：${item.values.map((value, index) => `${stages[index]?.label || stages[index]?.title}:${value}`).join(" / ")}`;
  const toggleSelected = (key, payload) => {
    setSelected((current) => (current?.selectionKey === key ? null : { ...payload, selectionKey: key }));
  };
  return (
    <Panel chart={chart} selected={selected} onExport={() => downloadSvg("译者身份时间河流图.svg", svg)}>
      <svg ref={setSvg} viewBox={`0 0 ${width} ${height}`} className="atlas-svg identity-river-svg" role="img">
        <rect width={width} height={height} fill="#fff" />
        <defs>
          <linearGradient id="identityRiverGuide" x1="0%" x2="100%" y1="0%" y2="0%">
            <stop offset="0%" stopColor="#f8fbff" />
            <stop offset="50%" stopColor="#eef6ff" />
            <stop offset="100%" stopColor="#f8fbff" />
          </linearGradient>
        </defs>
        <rect x="132" y="42" width="850" height={plotBottom - 12} rx="6" fill="url(#identityRiverGuide)" stroke="#dbe7f3" />
        <line x1="158" x2="958" y1={plotMid} y2={plotMid} stroke="#94a3b8" strokeWidth="1.2" strokeDasharray="5 6" />
        <line x1="158" x2="958" y1={plotBottom} y2={plotBottom} stroke="#1f2937" strokeWidth="1.5" />
        <line x1="158" x2="158" y1={plotTop} y2={plotBottom} stroke="#1f2937" strokeWidth="1.1" />
        <line x1="958" x2="958" y1={plotTop} y2={plotBottom} stroke="#1f2937" strokeWidth="1.1" />
        {[0.25, 0.5, 0.75].map((ratio) => (
          <g key={ratio}>
            <line x1="158" x2="958" y1={plotMid - (plotHeight / 2 - 17) * ratio} y2={plotMid - (plotHeight / 2 - 17) * ratio} stroke="#e8eef5" />
            <line x1="158" x2="958" y1={plotMid + (plotHeight / 2 - 17) * ratio} y2={plotMid + (plotHeight / 2 - 17) * ratio} stroke="#e8eef5" />
          </g>
        ))}
        {x.map((axisX, index) => (
          <g key={stages[index]?.id || axisX}>
            <line x1={axisX} x2={axisX} y1={plotTop} y2={plotBottom + 12} stroke="#dbe7f3" />
            <circle cx={axisX} cy={plotBottom} r="5" fill="#fff" stroke="#1f2937" strokeWidth="1.4" />
            <text className="atlas-subtitle identity-axis-label" x={axisX} y={axisLabelY} textAnchor="middle">{stages[index]?.label || stages[index]?.title}</text>
            <text className="atlas-subtitle identity-small-label" x={axisX} y={axisCountY} textAnchor="middle">{totals[index] || 0} 条</text>
          </g>
        ))}
        {series.map((item, roleIndex) => (
          <g key={item.role}>
            {stages.slice(0, -1).map((_, stageIndex) => {
              const a = stacks[stageIndex]?.[roleIndex];
              const b = stacks[stageIndex + 1]?.[roleIndex];
              if (!a || !b) return null;
              if ((a.value || 0) + (b.value || 0) <= 0) return null;
              const active = !selected?.role || selected.role === item.role;
              const curve = Math.min(88, Math.max(24, (x[stageIndex + 1] - x[stageIndex]) * 0.42));
              return (
                <path
                  className="atlas-clickable"
                  key={`${item.role}-${stageIndex}`}
                  d={`M${x[stageIndex]},${a.top} C${x[stageIndex] + curve},${a.top} ${x[stageIndex + 1] - curve},${b.top} ${x[stageIndex + 1]},${b.top} L${x[stageIndex + 1]},${b.bottom} C${x[stageIndex + 1] - curve},${b.bottom} ${x[stageIndex] + curve},${a.bottom} ${x[stageIndex]},${a.bottom} Z`}
                  fill={palette[roleIndex % palette.length]}
                  opacity={active ? 0.54 : 0.08}
                  onClick={() => toggleSelected(`river-${item.role}`, { role: item.role, title: item.role, detail: roleDetail(item) })}
                />
              );
            })}
          </g>
        ))}
        {series.map((item, roleIndex) => {
          const left = stacks[0]?.[roleIndex]?.mid || plotTop;
          const right = stacks[stages.length - 1]?.[roleIndex]?.mid || plotTop;
          const leftLabelY = 88 + roleIndex * 31;
          const rightLabelY = 88 + roleIndex * 31;
          return (
            <g className="atlas-clickable" key={`label-${item.role}`} onClick={() => toggleSelected(`river-${item.role}`, { role: item.role, title: item.role, detail: roleDetail(item) })}>
              <path d={`M${x[0] - 4},${left} L134,${leftLabelY}`} stroke="#94a3b8" strokeWidth="1" fill="none" />
              <circle cx="38" cy={leftLabelY} r="5" fill={palette[roleIndex % palette.length]} />
              <text className="atlas-node-label identity-river-role-label" x="50" y={leftLabelY + 4}>{item.role}</text>
              <path d={`M${x[x.length - 1] + 4},${right} L982,${rightLabelY}`} stroke="#94a3b8" strokeWidth="1" fill="none" />
              <circle cx="994" cy={rightLabelY} r="5" fill={palette[roleIndex % palette.length]} />
              <text className="atlas-node-label identity-river-role-label" x="1006" y={rightLabelY + 4}>{item.role}</text>
            </g>
          );
        })}
        <text className="atlas-subtitle identity-small-label" x="158" y={footerY}>出版年代（十年）</text>
        <text className="atlas-subtitle identity-small-label" x="958" y={footerY} textAnchor="end">河流宽度按全局最大年代总量缩放，底部数字为该年代总记录数。</text>
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
      world: "basemap:boundary",
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
        const data = await api.basemapBoundary();
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
    <div id={id} className="atlas-panel-anchor">
    <Panel chart={effectiveChart} selected={selected} onExport={() => downloadSvg(`${effectiveChart.title || "出版地图"}.svg`, svg)}>
      <div className="atlas-map-controls">
        <label>时间过滤
          <input type="range" min={minYear} max={maxYear} value={year === "all" ? maxYear : year} onChange={(event) => setYear(event.target.value)} />
        </label>
        <button type="button" onClick={() => setYear("all")}>全部年份</button>
        <span>{year === "all" ? "显示全部出版节点" : `显示 ${year} 年及以前节点`}</span>
      </div>
      <svg ref={setSvg} viewBox="0 0 980 600" className="atlas-svg publication-svg" role="img">
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
    </div>
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
        const data = await api.basemapProvince();
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

const prefaceTopicRules = [
  { id: "translation", title: "翻译出版", seeds: ["翻译", "改写", "选编", "转述", "译者", "编者", "出版", "传播", "接受", "出版社", "德译"] },
  { id: "genre", title: "民间叙事", seeds: ["民间故事", "童话故事", "动物故事", "寓言", "传说", "神话", "神怪", "故事集", "口头文学", "民间文学"] },
  { id: "china-image", title: "中国形象", seeds: ["中国形象", "东方", "古老", "神秘", "智慧", "风俗", "民族", "少数民族", "蒙古族", "维吾尔族"] },
  { id: "ethics-religion", title: "宗教伦理", seeds: ["宗教", "信仰", "伦理", "道德", "善恶", "孝道", "教化", "神仙", "佛教", "道教"] },
  { id: "reader-education", title: "读者教育", seeds: ["读者", "儿童", "教育", "学习", "阅读", "青年", "家庭", "知识"] },
  { id: "source-method", title: "来源方法", seeds: ["来源", "采录", "整理", "材料", "版本", "注释", "分类", "研究", "题材"] },
  { id: "culture", title: "文化中介", seeds: ["文化", "文学", "汉学", "交流", "理解", "德国", "欧洲", "世界", "民族文学"] },
  { id: "orality", title: "口头传统", seeds: ["口头", "传统", "讲述", "叙述", "讲述者", "语言", "民歌", "歌谣"] },
];

const prefaceFunctionChars = new Set(["的", "了", "着", "过", "是", "在", "有", "和", "与", "及", "或", "而", "并", "也", "都", "就", "才", "乃", "其", "之", "者", "所", "于", "从", "到", "对", "为", "以", "把", "被", "将", "让", "使", "给"]);
const prefaceNoiseTerms = new Set([
  "的中国", "数民族", "故事的", "故事中", "中的故事", "这些故事", "那些故事", "他们的", "我们的", "自己的", "话中的", "的故事", "一个故事",
  "间故事", "些故事", "话故事", "个故事", "则故事", "类故事", "种故事", "篇故事", "部故事", "本故事", "段故事",
  "什么意", "凡意思", "几乎随", "人们几乎", "语越多", "成语越多", "格言式表", "言式表", "式表达", "们几乎", "人喜爱彦", "国人喜爱", "爱彦语", "至今仍",
]);
const prefaceAllowedStoryTerms = new Set(["中国故事", "民间故事", "童话故事", "动物故事", "神话故事", "寓言故事", "志怪故事", "机智故事", "故事集"]);
const prefaceBrokenStoryPrefixes = new Set(["间", "些", "话", "个", "则", "类", "种", "篇", "部", "本", "段", "中", "的", "其", "这", "那"]);
const prefaceLowInfoTerms = new Set([
  "部分", "大量", "内容", "类型", "工作", "时期", "地方", "地区", "国家", "人民", "人类", "社会", "生活", "时代",
  "范围", "全部", "整体", "一般", "普通", "基本", "主要", "重要", "相关", "直接", "间接", "可能", "现实", "状况",
  "无法", "不能", "不可", "常常", "往往", "总是", "未能", "显然", "尤其", "比较", "特殊", "具体", "抽象",
  "情况", "问题", "结果", "过程", "目的", "原因", "基础", "关系", "方面", "意义", "价值", "特点", "特征", "位置",
  "道路", "力量", "精神", "意识", "意志", "活动", "事件", "文章", "本册", "本书", "资料", "记录", "发展", "产生",
  "形成", "存在", "发现", "使用", "采用", "提供", "作出", "成为", "属于", "具有", "包括", "包含", "显示", "指出",
]);

function normalizePrefaceDisplayTerm(value) {
  let text = String(value || "").replace(/\s+/g, "").replace(/^[，。、“”‘’"'（）()《》:：；;,.!?！？]+|[，。、“”‘’"'（）()《》:：；;,.!?！？]+$/g, "");
  return text;
}

function brokenPrefaceDisplayFragment(value) {
  if (prefaceNoiseTerms.has(value)) return true;
  if (prefaceAllowedStoryTerms.has(value)) return false;
  if (value.endsWith("故事") && (value.length <= 4 || prefaceBrokenStoryPrefixes.has(value.slice(0, 1)))) return true;
  if (/(童话|民间|民族|文学|传统)$/.test(value) && value.length <= 3) return true;
  return false;
}

function validPrefaceDisplayTerm(value) {
  const text = normalizePrefaceDisplayTerm(value);
  if (text.length < 2 || text.length > 14) return false;
  if (brokenPrefaceDisplayFragment(text)) return false;
  if (prefaceLowInfoTerms.has(text)) return false;
  if (/^[一二三四五六七八九十百千万两几数多许若某各每半]+(个|部|种|些|点|位|篇|本|条|件|次|处|方面|部分|类|层|批|群|段)$/.test(text)) return false;
  if (/^\d+$|^[A-Za-zÄÖÜäöüß]{1,3}$/.test(text)) return false;
  if (/[的了着过是有和与及或而并也都其之者所于从到对为以把被将让使给]/.test(text) && !["民间故事", "童话故事", "动物故事", "口头文学", "民间文学", "少数民族", "中国形象"].includes(text)) return false;
  if (["中国", "故事", "民间", "童话", "文本", "作者", "版本", "一个", "一些", "一种", "一部分", "一方面", "另一方面", "我们", "他们", "人们", "自己", "这些", "那些", "什么", "几乎", "仍然", "于是", "因此", "以及", "或者", "如果", "因为", "所以", "已经", "进行", "可以", "能够", "应该", "表示", "说明", "认为", "不同", "出现", "作品", "方式", "形式", "适用", "会遇", "谁知道", "它们", "国人", "中国人", "喜爱", "喜欢"].includes(text)) return false;
  return /[\u4e00-\u9fffA-Za-zÄÖÜäöüß]/.test(text);
}

function normalizePrefaceCloudWords(sourceWords, limit = 118, options = {}) {
  const merged = new Map();
  (sourceWords || []).forEach((word) => {
    const rawText = normalizePrefaceDisplayTerm(word.text);
    if (!validPrefaceDisplayTerm(rawText)) return;
    const value = Number(word.value || word.weight || word.count || 1);
    const current = merged.get(rawText);
    if (current) {
      current.value = Math.max(current.value, value);
      current.count = Number(current.count || 0) + Number(word.count || 0);
      current.docCount = Math.max(Number(current.docCount || 0), Number(word.docCount || 0));
    } else {
      merged.set(rawText, { ...word, rawText, text: rawText, value, topic: word.topic || prefaceTopicForTerm(rawText) });
    }
  });
  let rows = [...merged.values()].sort((a, b) => Number(b.value || 0) - Number(a.value || 0));
  if (!options.keepContained) {
    rows = rows.filter((word, index) => !rows.slice(0, index).some((item) => (
      word.rawText.length <= 3
      && item.rawText.includes(word.rawText)
      && item.value >= word.value
    )));
  }
  return rows.slice(0, limit);
}

function prefaceTopicForTerm(value) {
  const text = normalizePrefaceDisplayTerm(value);
  let best = prefaceTopicRules[prefaceTopicRules.length - 2];
  let bestScore = 0;
  prefaceTopicRules.forEach((rule) => {
    const score = rule.seeds.reduce((sum, seed) => {
      if (text === seed) return sum + 9;
      if (seed.includes(text) || text.includes(seed)) return sum + 4;
      return sum;
    }, 0);
    if (score > bestScore) {
      best = rule;
      bestScore = score;
    }
  });
  if (bestScore) return best.id;
  if (/翻译|改写|选编|转述|传播|出版|接受|译/.test(text)) return "translation";
  if (/故事|童话|传说|神话|寓言|神怪/.test(text)) return "genre";
  if (/中国|东方|民族|蒙古|维吾尔|满族|古老|神秘/.test(text)) return "china-image";
  if (/宗教|信仰|伦理|道德|孝|善恶|教化/.test(text)) return "ethics-religion";
  if (/读者|儿童|教育|学习|知识/.test(text)) return "reader-education";
  if (/来源|采录|整理|材料|版本|分类|研究|题材/.test(text)) return "source-method";
  if (/口头|传统|讲述|叙述|语言|歌谣/.test(text)) return "orality";
  return "culture";
}

function PrefaceThemeCluster({ chart }) {
  const [selected, setSelected] = useState(null);
  const [svg, setSvg] = useState(null);
  const range = yearRange(chart?.years || []);
  const [mode, setMode] = useState("all");
  const [start, setStart] = useState(range.min);
  const [end, setEnd] = useState(range.max);
  useEffect(() => {
    setStart(range.min);
    setEnd(range.max);
  }, [range.min, range.max]);
  const rawNodes = chart?.nodes || [];
  const rawClusters = chart?.clusters || [];
  const needsClientClusters = rawClusters.length <= 1 || new Set(rawNodes.map((node) => node.cluster || "default")).size <= 1;
  const clusters = useMemo(() => {
    if (!needsClientClusters && rawClusters.length) return rawClusters;
    const counts = {};
    rawNodes.forEach((node) => {
      const label = normalizePrefaceDisplayTerm(node.label || node.id);
      if (!validPrefaceDisplayTerm(label)) return;
      const clusterId = prefaceTopicForTerm(label);
      counts[clusterId] = (counts[clusterId] || 0) + Number(node.count || 1);
    });
    return prefaceTopicRules
      .filter((rule) => counts[rule.id])
      .map((rule) => ({ ...rule, size: counts[rule.id], terms: rule.seeds }))
      .sort((a, b) => Number(b.size || 0) - Number(a.size || 0));
  }, [needsClientClusters, rawClusters, rawNodes]);
  const visibleNodes = useMemo(() => (chart?.nodes || [])
    .filter((node) => yearsMatch(node.years, mode, start, end))
    .reduce((rows, node) => {
      const label = normalizePrefaceDisplayTerm(node.label || node.id);
      if (!validPrefaceDisplayTerm(label) || rows.some((item) => item.label === label)) return rows;
      const cluster = needsClientClusters ? prefaceTopicForTerm(label) : node.cluster;
      const clusterIndex = clusters.findIndex((item) => item.id === cluster);
      rows.push({
        ...node,
        label,
        count: Number(node.count || 1),
        cluster,
        color: palette[Math.max(0, clusterIndex) % palette.length],
      });
      return rows;
    }, []), [chart?.nodes, clusters, end, mode, needsClientClusters, start]);
  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const visibleClusterById = useMemo(() => new Map(visibleNodes.map((node) => [node.id, node.cluster])), [visibleNodes]);
  const visibleEdges = useMemo(() => {
    const sorted = (chart?.edges || [])
      .filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
      .map((edge) => ({
        ...edge,
        weight: Number(edge.weight || 1),
        sameCluster: visibleClusterById.get(edge.source) === visibleClusterById.get(edge.target),
      }))
      .sort((a, b) => Number(b.weight || 0) - Number(a.weight || 0));
    let crossClusterCount = 0;
    return sorted.filter((edge) => {
      if (edge.sameCluster) return true;
      if (edge.weight < 1.2 || crossClusterCount >= 30) return false;
      crossClusterCount += 1;
      return true;
    }).slice(0, 135);
  }, [chart?.edges, visibleClusterById, visibleNodeIds]);
  const layoutEdges = useMemo(() => visibleEdges.filter((edge) => edge.sameCluster), [visibleEdges]);
  const { positions, startDrag, moveDrag, endDrag } = useAtlasForceLayout({ nodes: visibleNodes, edges: layoutEdges }, 1180, 720, {
    repel: 11200,
    linkDistance: 214,
    linkStrength: 0.0017,
    centerStrength: 0.00008,
    clusterStrength: 0.0038,
    damping: 0.9,
    ticks: 420,
    paddingX: 76,
    paddingY: 82,
    clusterRadiusX: 435,
    clusterRadiusY: 252,
    localRadiusX: 156,
    localRadiusY: 118,
    collisionPadding: 36,
    collisionStrength: 0.12,
    collisionRadius: 44,
    maxCollisionRadius: 82,
    maxVelocity: 24,
  });
  const nodeMap = useMemo(() => new Map(visibleNodes.map((node) => [node.id, node])), [visibleNodes]);
  const related = useMemo(() => new Set(visibleEdges.filter((edge) => selected && (edge.source === selected.id || edge.target === selected.id)).flatMap((edge) => [edge.source, edge.target])), [selected, visibleEdges]);
  const clusterShapes = useMemo(() => clusters.map((cluster, index) => {
    const clusterNodes = visibleNodes.filter((node) => node.cluster === cluster.id);
    const clusterPositions = clusterNodes.map((node) => positions[node.id]).filter(Boolean);
    if (!clusterPositions.length) return { cluster, index, empty: true };
    const minX = Math.min(...clusterPositions.map((pos) => pos.x));
    const maxX = Math.max(...clusterPositions.map((pos) => pos.x));
    const minY = Math.min(...clusterPositions.map((pos) => pos.y));
    const maxY = Math.max(...clusterPositions.map((pos) => pos.y));
    const padX = 72 + Math.min(70, clusterPositions.length * 3.5);
    const padY = 48 + Math.min(56, clusterPositions.length * 2.6);
    const x = (minX + maxX) / 2;
    const y = (minY + maxY) / 2;
    return {
      cluster,
      index,
      x,
      y,
      rx: Math.max(92, (maxX - minX) / 2 + padX),
      ry: Math.max(62, (maxY - minY) / 2 + padY),
    };
  }), [clusters, positions, visibleNodes]);
  const detail = selected && `${selected.count || 1} 次；文档覆盖 ${selected.docCount || 1} 处；主题簇：${clusters.find((item) => item.id === selected.cluster)?.title || "未分类"}`;

  return (
    <Panel chart={chart} selected={selected && { title: selected.label, detail }} onExport={() => downloadSvg("序跋文本主题聚类图.svg", svg)}>
      <TimeFilter years={chart?.years || []} mode={mode} start={start} end={end} onMode={setMode} onStart={setStart} onEnd={setEnd} />
      <svg ref={setSvg} viewBox="0 0 1180 720" className="atlas-svg preface-cluster-svg interactive-graph-svg" role="img" onPointerMove={moveDrag} onPointerUp={endDrag} onPointerLeave={endDrag}>
        <defs>
          <filter id="prefaceClusterShadow"><feDropShadow dx="0" dy="7" stdDeviation="7" floodColor="#0f172a" floodOpacity="0.13" /></filter>
        </defs>
        <rect width="1180" height="720" fill="#fff" />
        {clusterShapes.map(({ cluster, index, empty, x, y, rx, ry }) => {
          if (empty) return null;
          return (
            <g key={cluster.id} className="preface-cluster-hull">
              <ellipse cx={x} cy={y} rx={rx} ry={ry} fill={palette[index % palette.length]} opacity="0.045" stroke={palette[index % palette.length]} strokeWidth="1.6" strokeDasharray="8 7" />
              <text className="atlas-title cluster-title" x={x} y={Math.max(30, y - ry - 12)} textAnchor="middle">{cluster.title}</text>
            </g>
          );
        })}
        {visibleEdges.map((edge) => {
          const a = positions[edge.source];
          const b = positions[edge.target];
          const source = nodeMap.get(edge.source);
          if (!a || !b || !source) return null;
          const active = !selected || edge.source === selected.id || edge.target === selected.id;
          return <line key={`${edge.source}-${edge.target}`} x1={a.x} y1={a.y} x2={b.x} y2={b.y} stroke={source.color} strokeWidth={Math.min(4.5, 0.9 + edge.weight / 8)} opacity={active ? 0.38 : 0.06} />;
        })}
        {visibleNodes.map((node) => {
          const pos = positions[node.id];
          if (!pos) return null;
          const active = selected?.id === node.id || related.has(node.id);
          const r = 9 + Math.min(16, Math.sqrt(node.count || 1) * 3.8);
          return (
            <g
              className="atlas-clickable drag-node"
              key={node.id}
              transform={`translate(${pos.x},${pos.y})`}
              onPointerDown={(event) => startDrag(event, node.id)}
              onPointerUp={(event) => { event.stopPropagation(); endDrag(); }}
              onClick={(event) => { event.stopPropagation(); setSelected(selected?.id === node.id ? null : node); }}
            >
              <circle className={selected?.id === node.id ? "selected" : ""} r={r} fill={node.color} opacity={active || !selected ? 0.9 : 0.2} stroke="#fff" strokeWidth="2" filter="url(#prefaceClusterShadow)" />
              <text className="atlas-node-label cluster-node-label" y="5" textAnchor="middle">{short(node.label, 8)}</text>
            </g>
          );
        })}
      </svg>
    </Panel>
  );
}

function PrefaceThemeClusterLegacy({ chart }) {
  const [selected, setSelected] = useState(null);
  const [svg, setSvg] = useState(null);
  const range = yearRange(chart?.years || []);
  const [mode, setMode] = useState("all");
  const [start, setStart] = useState(range.min);
  const [end, setEnd] = useState(range.max);
  const clusterAnchors = useMemo(() => {
    const clusters = chart?.clusters || [];
    const anchors = {};
    clusters.forEach((cluster, index) => {
      const angle = (index / Math.max(1, clusters.length)) * Math.PI * 2 - Math.PI / 2;
      const radius = clusters.length <= 1 ? 0 : 230;
      anchors[cluster.id] = [490 + Math.cos(angle) * radius * 1.25, 300 + Math.sin(angle) * radius * 0.72];
    });
    return anchors;
  }, [chart?.clusters]);
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
  const visibleNodeIds = new Set(nodes.filter((node) => yearsMatch(node.years, mode, start, end)).map((node) => node.id));
  const related = new Set((chart?.edges || []).filter((edge) => selected && (edge.source === selected.id || edge.target === selected.id)).flatMap((edge) => [edge.source, edge.target]));
  return (
    <Panel chart={chart} selected={selected && { title: selected.label, detail: `${selected.count} 次；主题群：${(chart?.clusters || []).find((item) => item.id === selected.cluster)?.title || ""}` }} onExport={() => downloadSvg("序跋主题聚类图.svg", svg)}>
      <TimeFilter years={chart?.years || []} mode={mode} start={start} end={end} onMode={setMode} onStart={setStart} onEnd={setEnd} />
      <svg ref={setSvg} viewBox="0 0 980 600" className="atlas-svg preface-cluster-svg" role="img">
        <rect width="980" height="600" fill="#fff" />
        {(chart?.clusters || []).map((cluster, index) => {
          const [x, y] = clusterAnchors[cluster.id] || [500, 280];
          return (
            <g key={cluster.id}>
              <ellipse cx={x} cy={y} rx="150" ry="105" fill={palette[index % palette.length]} opacity="0.07" stroke={palette[index % palette.length]} strokeWidth="1.2" />
              <text className="atlas-title cluster-title" x={x} y={y - 92} textAnchor="middle">{cluster.title}</text>
            </g>
          );
        })}
        {(chart?.edges || []).map((edge) => {
          const a = nodeMap.get(edge.source);
          const b = nodeMap.get(edge.target);
          if (!a || !b) return null;
          if (!visibleNodeIds.has(edge.source) || !visibleNodeIds.has(edge.target)) return null;
          const active = !selected || edge.source === selected.id || edge.target === selected.id;
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2 - 24;
          return <path key={`${edge.source}-${edge.target}`} d={`M${a.x},${a.y} Q${mx},${my} ${b.x},${b.y}`} fill="none" stroke={a.color} strokeWidth={Math.min(5.5, 1 + edge.weight / 7)} opacity={active ? 0.46 : 0.08} />;
        })}
        {nodes.map((node) => {
          const active = selected?.id === node.id || related.has(node.id);
          const visible = visibleNodeIds.has(node.id);
          const r = 13 + Math.min(20, node.count * 1.35);
          return (
            <g className="atlas-clickable" key={node.id} onClick={() => setSelected(node)}>
              <circle className={selected?.id === node.id ? "selected" : ""} cx={node.x} cy={node.y} r={r} fill={node.color} opacity={!visible ? 0.08 : active || !selected ? 0.86 : 0.22} stroke="#fff" strokeWidth="2" />
              {visible && <text className="atlas-node-label cluster-node-label" x={node.x} y={node.y + 5} textAnchor="middle">{node.label}</text>}
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
  const clouds = useMemo(() => {
    const sourceClouds = chart?.wordClouds || [];
    const allCloud = sourceClouds.find((item) => item.id === "all") || { id: "all", label: "总词云", words: chart?.words || [] };
    const itemClouds = sourceClouds
      .filter((item) => item.id !== "all")
      .map((item) => ({
        ...item,
        label: [item.year, item.label].filter(Boolean).join(" · ") || item.id,
      }));
    return [allCloud, ...itemClouds].filter((item) => item.words?.length);
  }, [chart?.wordClouds, chart?.words]);
  useEffect(() => {
    if (!clouds.some((item) => item.id === cloudId)) {
      setCloudId(clouds[0]?.id || "all");
      setSelected(null);
    }
  }, [cloudId, clouds]);
  const activeCloud = clouds.find((item) => item.id === cloudId) || clouds[0];
  const cloudLimit = activeCloud?.id === "all" ? 980 : 420;
  const words = useMemo(() => {
    const seen = new Set();
    const normalized = normalizePrefaceCloudWords(activeCloud?.words, cloudLimit, { keepContained: activeCloud?.id === "all" });
    return normalized.filter((word) => {
      const key = word.rawText || word.text;
      if (!key || seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  }, [activeCloud, cloudLimit]);
  const maxFrequency = Math.max(1, ...words.map((item) => Number(item.count || item.value || 1)));
  const placedWords = useMemo(() => {
    const widthOf = (text, size) => {
      const chars = [...String(text || "")];
      const cjk = chars.filter((char) => /[\u4e00-\u9fff]/.test(char)).length;
      const latin = chars.length - cjk;
      return Math.max(10, cjk * size * 0.9 + latin * size * 0.52);
    };
    const cloudWidth = 1180;
    const cloudHeight = 650;
    const pad = 4;
    const measure = (word, rank) => {
      const text = word.rawText;
      const frequency = Math.max(0.004, Number(word.count || word.value || 1) / maxFrequency);
      const lengthFactor = text.length > 10 ? 0.64 : text.length > 7 ? 0.72 : text.length > 4 ? 0.88 : 1.08;
      const rankFactor = rank < 10 ? 1.48 : rank < 32 ? 1.28 : rank < 92 ? 1.08 : rank < 220 ? 0.92 : rank < 520 ? 0.8 : 0.68;
      const size = Math.max(10.2, Math.min(54, (9.6 + Math.pow(frequency, 0.43) * 45) * lengthFactor * rankFactor));
      return {
        ...word,
        text,
        rank,
        size,
        width: widthOf(text, size),
        height: size * 0.96,
        rotate: 0,
      };
    };

    const availableWidth = cloudWidth - pad * 2;
    const availableHeight = cloudHeight - pad * 2;
    const arrangeRows = (count, scale) => {
      const gap = 9;
      const items = words.slice(0, count).map((word, rank) => {
        const base = measure(word, rank);
        const size = Math.max(15.5, Math.min(66, base.size * scale));
        return {
          ...base,
          size,
          width: widthOf(base.text, size),
          height: size * 1.08,
        };
      });
      const rows = [];
      let current = [];
      let rowWidth = 0;
      let rowHeight = 0;
      items.forEach((word) => {
        const nextWidth = rowWidth + (current.length ? gap : 0) + word.width;
        if (current.length && nextWidth > availableWidth) {
          rows.push({ words: current, width: rowWidth, height: rowHeight });
          current = [];
          rowWidth = 0;
          rowHeight = 0;
        }
        current.push(word);
        rowWidth += (current.length > 1 ? gap : 0) + word.width;
        rowHeight = Math.max(rowHeight, word.height);
      });
      if (current.length) rows.push({ words: current, width: rowWidth, height: rowHeight });
      while (rows.length > 2 && rows[rows.length - 1].width < availableWidth * 0.68) {
        rows.pop();
      }
      if (rows.some((row) => row.width < availableWidth * 0.54 || row.words.length < 4)) return null;
      const baseRowGap = 9;
      const totalHeight = rows.reduce((sum, row) => sum + row.height, 0) + Math.max(0, rows.length - 1) * baseRowGap;
      if (totalHeight > availableHeight || rows.length < 2) return null;

      const centerOrder = [];
      const center = Math.floor(rows.length / 2);
      for (let offset = 0; offset <= center + 1; offset += 1) {
        const upper = center - offset;
        const lower = center + offset;
        if (upper >= 0) centerOrder.push(upper);
        if (lower !== upper && lower < rows.length) centerOrder.push(lower);
      }
      const visualRows = Array.from({ length: rows.length });
      const rowScore = (row) => row.width / availableWidth + Math.min(1, row.words.length / 8) * 0.22 - Math.max(...row.words.map((word) => word.size)) / 180;
      const topRow = [...rows].sort((a, b) => rowScore(b) - rowScore(a))[0];
      const bottomRow = [...rows].filter((row) => row !== topRow).sort((a, b) => rowScore(b) - rowScore(a))[0];
      visualRows[0] = topRow;
      visualRows[visualRows.length - 1] = bottomRow;
      [...rows]
        .filter((row) => row !== topRow && row !== bottomRow)
        .sort((a, b) => Math.max(...b.words.map((word) => word.size)) - Math.max(...a.words.map((word) => word.size)))
        .forEach((row) => {
          const slot = centerOrder.find((item) => item !== 0 && item !== visualRows.length - 1 && !visualRows[item]);
          visualRows[slot ?? visualRows.findIndex((item) => !item)] = row;
        });

      const rowGap = rows.length > 1
        ? Math.max(baseRowGap, (availableHeight - visualRows.reduce((sum, row) => sum + row.height, 0)) / (rows.length - 1))
        : baseRowGap;
      let y = pad;
      return visualRows.flatMap((row) => {
        const extra = availableWidth - row.width;
        const justify = row.words.length > 1 ? Math.max(gap, extra / (row.words.length - 1) + gap) : 0;
        let x = pad;
        const baseline = y + row.height * 0.56;
        const placed = row.words.map((word) => {
          const item = { ...word, x: x + word.width / 2, y: baseline };
          x += word.width + justify;
          return item;
        });
        y += row.height + rowGap;
        return placed;
      });
    };
    const countOptions = activeCloud?.id === "all" ? [520, 480, 440, 400, 360, 320, 280] : [360, 320, 280, 240, 210];
    const scaleOptions = [1.16, 1.1, 1.04, 0.98, 0.92, 0.86, 0.8];
    for (const count of countOptions) {
      for (const scale of scaleOptions) {
        const layout = arrangeRows(count, scale);
        if (layout) return layout;
      }
    }
    return arrangeRows(activeCloud?.id === "all" ? 240 : 180, 0.74) || [];
  }, [activeCloud?.id, cloudLimit, maxFrequency, words]);

  return (
    <Panel chart={chart} selected={selected && { title: selected.rawText, detail: `出现频次：${selected.count || 1}；关键词权重：${selected.value}` }} onExport={() => downloadSvg("序跋文本词云图.svg", svg)}>
      <div className="word-cloud-toolbar">
        <label><span>序跋词云</span>
          <select value={activeCloud?.id || "all"} onChange={(event) => { setCloudId(event.target.value); setSelected(null); }}>
            {clouds.map((cloud) => <option key={cloud.id} value={cloud.id}>{cloud.label}</option>)}
          </select>
        </label>
      </div>
      <svg ref={setSvg} viewBox="0 0 1180 650" className="atlas-svg word-cloud-svg" role="img">
        <rect width="1180" height="650" fill="#fff" />
        {placedWords.map((word, index) => {
          const active = !selected || selected.rawText === word.rawText;
          return (
            <text
              className="word-cloud-word atlas-clickable"
              key={word.rawText}
              x={word.x}
              y={word.y}
              textAnchor="middle"
              transform={`rotate(${word.rotate} ${word.x} ${word.y})`}
              style={{ fontSize: `${word.size}px`, fill: palette[index % palette.length], fontWeight: word.rank < 24 ? 900 : word.rank < 180 ? 800 : 720, opacity: active ? 0.94 : 0.16 }}
              onClick={() => setSelected(selected?.rawText === word.rawText ? null : word)}
            >
              {word.text}
            </text>
          );
        })}
      </svg>
    </Panel>
  );
}

const childStructurePalette = {
  故事集: "#0b66b2",
  子故事: "#15a884",
  抽取主题: "#f59e0b",
  推断类型: "#7c3aed",
  年代: "#0891b2",
  "译者身份": "#64748b",
  "译者/编者": "#475569",
  出版机构: "#ef4444",
  出版地: "#14b8a6",
  来源区域: "#d97706",
  语种: "#84cc16",
};

const childGraphView = {
  width: 1180,
  height: 760,
  legendY: 684,
  legendX: 30,
  legendWidth: 1120,
  legendHeight: 54,
};

const childStructureRelationPriority = new Map([
  ["抽取主题", 1],
  ["类型归属", 2],
  ["包含子故事", 3],
  ["样本子故事", 3],
  ["主题共现", 4],
  ["出版机构", 5],
  ["译者身份", 5],
  ["来源区域", 5],
  ["出版地", 6],
  ["年份", 6],
  ["语种", 6],
]);

const childStructureRelationQuota = new Map([
  ["抽取主题", 26],
  ["类型归属", 22],
  ["包含子故事", 18],
  ["样本子故事", 10],
  ["主题共现", 14],
  ["出版机构", 8],
  ["译者身份", 8],
  ["来源区域", 8],
  ["出版地", 7],
  ["年份", 7],
  ["语种", 7],
]);

function childNodeColor(node, index = 0) {
  return childStructurePalette[node?.type] || palette[index % palette.length] || "#0b66b2";
}

function childStructureDegreeLimit(node) {
  if (node?.type === "故事集") return 34;
  if (node?.type === "抽取主题") return 6;
  if (node?.type === "推断类型") return 8;
  if (node?.type === "子故事") return 3;
  return 4;
}

function fallbackGraphId(prefix, value) {
  return `${prefix}-${String(value || "未记录").trim().replace(/[^\w\u4e00-\u9fa5-]+/g, "-").slice(0, 42)}`;
}

function buildFallbackChildStructureGraph(chart) {
  const themeRows = chart?.nodes || [];
  const coEdges = chart?.edges || [];
  const typeRows = chart?.types || [];
  const typeEdges = chart?.typeEdges || [];
  const timeline = chart?.timeline || [];
  const nodes = new Map();
  const edgeMap = new Map();
  const addNode = (node) => {
    if (!node?.id) return;
    const current = nodes.get(node.id);
    if (current) {
      current.count = Number(current.count || 0) + Number(node.count || 1);
      current.examples = [...new Set([...(current.examples || []), ...(node.examples || [])])].slice(0, 8);
      return;
    }
    nodes.set(node.id, { ...node, count: Number(node.count || 1) });
  };
  const addEdge = (source, target, relation, weight = 1, examples = []) => {
    if (!source || !target || source === target) return;
    const key = `${source}|${target}|${relation}`;
    const current = edgeMap.get(key);
    if (current) {
      current.weight += Number(weight || 1);
      current.examples = [...new Set([...(current.examples || []), ...examples])].slice(0, 6);
      return;
    }
    edgeMap.set(key, { source, target, relation, weight: Number(weight || 1), examples: examples.slice(0, 6) });
  };
  const themeId = (value) => fallbackGraphId("theme", value);
  const typeId = (value) => fallbackGraphId("type", value);
  const rootId = "fallback-child-corpus";
  const totalThemeWeight = themeRows.reduce((sum, node) => sum + Number(node.count || 0), 0);
  addNode({
    id: rootId,
    label: "德译中国故事集",
    type: "故事集",
    cluster: "书目层",
    count: Math.max(1, totalThemeWeight),
    summary: "由结构化表格中的子故事主题、类型、年代与样本标题生成的结构图谱。",
  });

  themeRows.slice(0, 34).forEach((theme, index) => {
    const id = themeId(theme.id || theme.label);
    const label = theme.label || theme.id || `主题${index + 1}`;
    const examples = (theme.examples || []).filter(Boolean);
    addNode({
      id,
      label,
      type: "抽取主题",
      cluster: index < 10 ? "主题层-核心" : index < 22 ? "主题层-高频" : "主题层-扩展",
      count: Number(theme.count || 1),
      summary: `主题出现 ${theme.count || 1} 次；年份 ${(theme.years || []).join("、") || "未记录"}`,
      examples,
    });
    addEdge(rootId, id, "抽取主题", Math.max(1, Number(theme.count || 1) / 2), examples);
    (theme.types || []).slice(0, 3).forEach((item) => {
      const tid = typeId(item.name);
      addNode({ id: tid, label: item.name, type: "推断类型", cluster: "类型层", count: item.count || 1, examples });
      addEdge(id, tid, "类型归属", item.count || 1, examples);
    });
    (theme.languages || []).slice(0, 2).forEach((item) => {
      const lid = fallbackGraphId("language", item.name);
      addNode({ id: lid, label: item.name, type: "语种", cluster: "出版层", count: item.count || 1, examples });
      addEdge(id, lid, "语种分布", item.count || 1, examples);
    });
    examples.slice(0, 3).forEach((example) => {
      const sid = fallbackGraphId("story", example);
      addNode({ id: sid, label: example, type: "子故事", cluster: "文本层", count: 1, summary: `样本子故事：${example}` });
      addEdge(rootId, sid, "样本子故事", 0.7, [example]);
      addEdge(sid, id, "题名语义", 1.1, [example]);
    });
  });

  typeRows.slice(0, 12).forEach((type) => {
    const tid = typeId(type.id || type.label);
    addNode({ id: tid, label: type.label || type.id, type: "推断类型", cluster: "类型层", count: type.count || 1 });
    addEdge(rootId, tid, "类型覆盖", Math.max(0.8, Number(type.count || 1) / 2));
  });
  typeEdges.slice(0, 48).forEach((edge) => {
    addEdge(themeId(edge.source), typeId(edge.target), "类型主题分布", edge.weight || 1);
  });
  coEdges.slice(0, 70).forEach((edge) => {
    addEdge(themeId(edge.source), themeId(edge.target), "主题共现", edge.weight || 1);
  });
  timeline.forEach((period) => {
    const pid = fallbackGraphId("period", period.period);
    addNode({ id: pid, label: period.period, type: "年代", cluster: "时间层", count: period.total || 1, summary: `该时段主题总量 ${period.total || 0}` });
    addEdge(rootId, pid, "时间分布", Math.max(1, Number(period.total || 1) / 3));
    (period.themes || []).slice(0, 8).forEach((item) => {
      addEdge(themeId(item.theme), pid, "年代共现", item.count || 1);
    });
  });

  const graphNodes = [...nodes.values()]
    .sort((a, b) => (a.type === "故事集" ? -1 : b.type === "故事集" ? 1 : Number(b.count || 0) - Number(a.count || 0)))
    .slice(0, 118);
  const nodeIds = new Set(graphNodes.map((node) => node.id));
  const graphEdges = [...edgeMap.values()]
    .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
    .sort((a, b) => Number(b.weight || 0) - Number(a.weight || 0))
    .slice(0, 210);
  const labelOf = (id) => nodes.get(id)?.label || id;
  return {
    title: "子故事语义—书目结构知识图谱",
    subtitle: "在后端结构图谱未加载时，依据结构化表格中的主题共现、类型归属、年代分布与样本子故事动态重建。",
    nodes: graphNodes,
    edges: graphEdges,
    triples: graphEdges.map((edge) => ({ subject: labelOf(edge.source), predicate: edge.relation, object: labelOf(edge.target), weight: edge.weight })),
    stats: { nodes: graphNodes.length, edges: graphEdges.length, triples: graphEdges.length },
  };
}

function ChildThemeCooccurrence({ chart }) {
  const [selected, setSelected] = useState(null);
  const [svg, setSvg] = useState(null);
  const range = yearRange(chart?.years || []);
  const [mode, setMode] = useState("all");
  const [start, setStart] = useState(range.min);
  const [end, setEnd] = useState(range.max);
  const visibleNodes = useMemo(() => (chart?.nodes || [])
    .filter((node) => yearsMatch(node.years, mode, start, end))
    .slice(0, 34)
    .map((node, index) => ({
      ...node,
      count: Number(node.count || 1),
      color: palette[index % palette.length],
      cluster: index < 8 ? "核心主题" : index < 20 ? "高频母题" : "扩展主题",
      group: index < 8 ? "核心主题" : index < 20 ? "高频母题" : "扩展主题",
    })), [chart?.nodes, end, mode, start]);
  const visibleNodeIds = useMemo(() => new Set(visibleNodes.map((node) => node.id)), [visibleNodes]);
  const visibleEdges = useMemo(() => (chart?.edges || [])
    .filter((edge) => visibleNodeIds.has(edge.source) && visibleNodeIds.has(edge.target))
    .map((edge) => ({ ...edge, weight: Number(edge.weight || 1) }))
    .slice(0, 118), [chart?.edges, visibleNodeIds]);
  const { positions, startDrag, moveDrag, endDrag } = useAtlasForceLayout({ nodes: visibleNodes, edges: visibleEdges }, childGraphView.width, childGraphView.height, {
    repel: 7600,
    linkDistance: 232,
    linkStrength: 0.0025,
    centerStrength: 0.00012,
    clusterStrength: 0.0024,
    damping: 0.9,
    ticks: 320,
    paddingX: 32,
    paddingTop: 52,
    paddingBottom: 126,
    clusterRadiusX: 500,
    clusterRadiusY: 224,
    localRadiusX: 172,
    localRadiusY: 108,
    collisionPadding: 26,
    collisionStrength: 0.082,
    collisionRadius: 34,
    maxCollisionRadius: 84,
    maxVelocity: 22,
  });
  const nodeMap = useMemo(() => new Map(visibleNodes.map((node) => [node.id, node])), [visibleNodes]);
  const maxNode = Math.max(1, ...visibleNodes.map((node) => node.count));
  const maxEdge = Math.max(1, ...visibleEdges.map((edge) => edge.weight));
  const related = useMemo(() => {
    if (!selected) return new Set();
    if (selected.kind === "edge") return new Set([selected.source, selected.target]);
    return new Set(visibleEdges.filter((edge) => edge.source === selected.id || edge.target === selected.id).flatMap((edge) => [edge.source, edge.target]));
  }, [selected, visibleEdges]);
  const selectedInfo = selected?.kind === "edge"
    ? {
      title: `${nodeMap.get(selected.source)?.label || selected.source} - ${nodeMap.get(selected.target)?.label || selected.target}`,
      detail: `主题共现权重 ${selected.weight || 1}；相关年份：${(selected.years || []).slice(0, 8).join("、") || "未记录"}`,
    }
    : selected && {
      title: selected.label,
      detail: `出现 ${selected.count} 次；分组：${selected.group}；类型：${(selected.types || []).map((item) => `${item.name}(${item.count})`).join(" / ") || "未记录"}；样本：${(selected.examples || []).slice(0, 5).join(" / ") || "未记录"}`,
  };
  return (
    <Panel id="visual-atlas-child-co" chart={chart} selected={selectedInfo} onExport={() => downloadSvg("子故事主题共现图.svg", svg)}>
      <svg ref={setSvg} viewBox={`0 0 ${childGraphView.width} ${childGraphView.height}`} className="atlas-svg child-co-svg child-split-svg interactive-graph-svg" role="img" onPointerMove={moveDrag} onPointerUp={endDrag} onPointerLeave={endDrag}>
        <defs>
          <radialGradient id="childThemeGlow" cx="50%" cy="50%" r="62%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.94" />
            <stop offset="100%" stopColor="#0b66b2" stopOpacity="0.2" />
          </radialGradient>
          <filter id="childThemeShadow"><feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#0f172a" floodOpacity="0.14" /></filter>
        </defs>
        <rect width={childGraphView.width} height={childGraphView.height} fill="#fff" />
        {visibleEdges.map((edge) => {
          const a = positions[edge.source];
          const b = positions[edge.target];
          const source = nodeMap.get(edge.source);
          if (!a || !b) return null;
          const active = !selected || related.has(edge.source) || related.has(edge.target);
          const mx = (a.x + b.x) / 2;
          const my = (a.y + b.y) / 2;
          return (
            <g className="atlas-clickable" key={`${edge.source}-${edge.target}`} onClick={() => setSelected({ ...edge, kind: "edge" })}>
              <path d={`M${a.x},${a.y} Q${mx},${my - 28} ${b.x},${b.y}`} fill="none" stroke={source?.color || "#15a884"} strokeWidth={1 + edge.weight / maxEdge * 5.2} opacity={active ? 0.48 : 0.07} />
              {selected?.kind === "edge" && selected.source === edge.source && selected.target === edge.target && (
                <text className="edge-caption" x={mx} y={my - 12} textAnchor="middle">共现 {edge.weight}</text>
              )}
            </g>
          );
        })}
        {visibleNodes.map((node) => {
          const pos = positions[node.id];
          if (!pos) return null;
          const r = 18 + Math.sqrt(node.count / maxNode) * 30;
          const active = !selected || selected.id === node.id || related.has(node.id);
          return (
            <g className="atlas-clickable drag-node" key={node.id} transform={`translate(${pos.x},${pos.y})`} onPointerDown={(event) => startDrag(event, node.id)} onPointerUp={(event) => { event.stopPropagation(); endDrag(); setSelected(node); }}>
              <circle r={r + 7} fill={node.color} opacity={active ? 0.1 : 0.02} />
              <circle className={selected?.id === node.id ? "selected" : ""} r={r} fill={node.group === "核心主题" ? "url(#childThemeGlow)" : node.color} fillOpacity={active ? 0.9 : 0.2} stroke={node.color} strokeWidth={node.group === "核心主题" ? 3 : 1.5} filter="url(#childThemeShadow)" />
              <text className="atlas-node-label child-node-label child-theme-label" y="6" textAnchor="middle">{short(node.label, r > 34 ? 8 : 6)}</text>
              {r > 33 && <text className="atlas-subtitle child-count-label" y={r + 17} textAnchor="middle">{node.count} 次</text>}
            </g>
          );
        })}
        <g className="child-graph-svg-legend" transform={`translate(${childGraphView.legendX} ${childGraphView.legendY})`}>
          <rect width={childGraphView.legendWidth} height={childGraphView.legendHeight} rx="6" fill="#f8fbff" stroke="#dce7f2" />
          {["核心主题", "高频母题", "扩展主题"].map((label, index) => (
            <g key={label} transform={`translate(${32 + index * 238} 32)`}>
              <rect x="0" y="-12" width="22" height="12" rx="3" fill={palette[index]} opacity="0.9" />
              <text className="atlas-subtitle child-legend-text" x="32" y="0">{label}</text>
            </g>
          ))}
          <text className="atlas-subtitle child-legend-text" x={childGraphView.legendWidth - 30} y="32" textAnchor="end">节点 {visibleNodes.length} · 关系 {visibleEdges.length}</text>
        </g>
      </svg>
      <TimeFilter years={chart?.years || []} mode={mode} start={start} end={end} onMode={setMode} onStart={setStart} onEnd={setEnd} />
    </Panel>
  );
}

function ChildThemeTypeNetwork({ chart }) {
  const [selected, setSelected] = useState(null);
  const [svg, setSvg] = useState(null);
  const graph = useMemo(() => {
    const backendGraph = chart?.structureGraph;
    return backendGraph?.nodes?.length ? backendGraph : buildFallbackChildStructureGraph(chart);
  }, [chart]);
  const nodes = useMemo(() => (graph.nodes || []).slice(0, 110).map((node, index) => ({
    ...node,
    count: Number(node.count || 1),
    color: childNodeColor(node, index),
    cluster: node.cluster || node.type || "结构层",
  })), [graph.nodes]);
  const nodeIds = useMemo(() => new Set(nodes.map((node) => node.id)), [nodes]);
  const edges = useMemo(() => {
    const nodeInfo = new Map(nodes.map((node) => [node.id, node]));
    const relationCount = new Map();
    const degree = new Map();
    const sorted = (graph.edges || [])
      .filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target))
      .map((edge) => ({ ...edge, weight: Number(edge.weight || 1), relation: edge.relation || "关联" }))
      .sort((a, b) => {
        const priority = (childStructureRelationPriority.get(a.relation) || 9) - (childStructureRelationPriority.get(b.relation) || 9);
        return priority || Number(b.weight || 0) - Number(a.weight || 0);
      });
    return sorted.filter((edge) => {
      const relationLimit = childStructureRelationQuota.get(edge.relation) || 6;
      if ((relationCount.get(edge.relation) || 0) >= relationLimit) return false;
      const sourceLimit = childStructureDegreeLimit(nodeInfo.get(edge.source));
      const targetLimit = childStructureDegreeLimit(nodeInfo.get(edge.target));
      if ((degree.get(edge.source) || 0) >= sourceLimit || (degree.get(edge.target) || 0) >= targetLimit) return false;
      relationCount.set(edge.relation, (relationCount.get(edge.relation) || 0) + 1);
      degree.set(edge.source, (degree.get(edge.source) || 0) + 1);
      degree.set(edge.target, (degree.get(edge.target) || 0) + 1);
      return true;
    }).slice(0, 92);
  }, [graph.edges, nodeIds, nodes]);
  const { positions, startDrag, moveDrag, endDrag } = useAtlasForceLayout({ nodes, edges }, childGraphView.width, childGraphView.height, {
    repel: 9800,
    linkDistance: 218,
    linkStrength: 0.0019,
    centerStrength: 0.00012,
    clusterStrength: 0.0028,
    damping: 0.9,
    ticks: 360,
    paddingX: 8,
    paddingTop: 10,
    paddingBottom: 68,
    clusterRadiusX: 585,
    clusterRadiusY: 300,
    localRadiusX: 188,
    localRadiusY: 136,
    collisionPadding: 16,
    collisionStrength: 0.08,
    collisionRadius: 26,
    maxCollisionRadius: 76,
    maxVelocity: 22,
  });
  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const maxNode = Math.max(1, ...nodes.map((node) => node.count));
  const maxEdge = Math.max(1, ...edges.map((edge) => edge.weight));
  const related = useMemo(() => {
    if (!selected) return new Set();
    if (selected.kind === "edge") return new Set([selected.source, selected.target]);
    return new Set(edges.filter((edge) => edge.source === selected.id || edge.target === selected.id).flatMap((edge) => [edge.source, edge.target]));
  }, [edges, selected]);
  const panelChart = { title: graph.title || "子故事语义—书目结构知识图谱", subtitle: graph.subtitle || "基于故事集总表与子故事匹配关系生成多关系动态图谱。" };
  const selectedInfo = selected?.kind === "edge"
    ? {
      title: selected.relation,
      detail: `${nodeMap.get(selected.source)?.label || selected.source} → ${nodeMap.get(selected.target)?.label || selected.target}；权重 ${selected.weight || 1}；样本：${(selected.examples || []).slice(0, 4).join(" / ") || "未记录"}`,
    }
    : selected && {
      title: selected.label,
      detail: `${selected.type || "实体"} · ${selected.cluster || "结构层"}；权重 ${Number(selected.count || 1).toFixed(1)}；${selected.summary || ""}`,
    };
  const legendTypes = ["故事集", "子故事", "抽取主题", "推断类型", "年代", "译者身份", "出版机构", "来源区域"];

  return (
    <Panel chart={panelChart} selected={selectedInfo} onExport={() => downloadSvg("子故事语义书目结构知识图谱.svg", svg)}>
      <svg ref={setSvg} viewBox={`0 0 ${childGraphView.width} ${childGraphView.height}`} className="atlas-svg child-co-svg child-split-svg interactive-graph-svg" role="img" onPointerMove={moveDrag} onPointerUp={endDrag} onPointerLeave={endDrag}>
        <defs>
          <radialGradient id="childStructureGlow" cx="50%" cy="50%" r="62%">
            <stop offset="0%" stopColor="#fff" stopOpacity="0.94" />
            <stop offset="100%" stopColor="#0b66b2" stopOpacity="0.2" />
          </radialGradient>
          <filter id="childStructureShadow"><feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#0f172a" floodOpacity="0.14" /></filter>
        </defs>
        <rect width={childGraphView.width} height={childGraphView.height} fill="#fff" />
        {edges.map((edge) => {
          const source = positions[edge.source];
          const target = positions[edge.target];
          const sourceNode = nodeMap.get(edge.source);
          if (!source || !target) return null;
          const active = selected ? related.has(edge.source) || related.has(edge.target) : true;
          const opacity = selected ? (active ? 0.42 : 0.025) : (edge.relation === "主题共现" ? 0.13 : 0.23);
          return (
            <g className="atlas-clickable" key={`${edge.source}-${edge.target}-${edge.relation}`} onClick={() => setSelected({ ...edge, kind: "edge" })}>
              <line x1={source.x} y1={source.y} x2={target.x} y2={target.y} stroke={sourceNode?.color || "#88a7c4"} strokeWidth={Math.min(3.6, 0.55 + edge.weight / maxEdge * 3.1)} strokeLinecap="round" opacity={opacity} />
              {active && selected?.kind === "edge" && selected.source === edge.source && selected.target === edge.target && (
                <text className="edge-caption" x={(source.x + target.x) / 2} y={(source.y + target.y) / 2 - 5} textAnchor="middle">{edge.relation}</text>
              )}
            </g>
          );
        })}
        {nodes.map((node, index) => {
          const pos = positions[node.id];
          if (!pos) return null;
          const color = node.color || childNodeColor(node, index);
          const r = node.type === "故事集" ? 25 + Math.sqrt(node.count / maxNode) * 25 : 13 + Math.sqrt(node.count / maxNode) * 27;
          const active = !selected || selected.id === node.id || related.has(node.id);
          const labelLimit = node.type === "故事集" ? 10 : node.type === "子故事" ? 8 : 6;
          return (
            <g className="atlas-clickable drag-node" key={node.id} transform={`translate(${pos.x},${pos.y})`} onPointerDown={(event) => startDrag(event, node.id)} onPointerUp={(event) => { event.stopPropagation(); endDrag(); setSelected(node); }}>
              {node.type === "抽取主题" ? (
                <rect x={-r * 1.45} y={-r} width={r * 2.9} height={r * 2} rx="6" fill={color} fillOpacity={active ? 0.84 : 0.18} stroke="#fff" strokeWidth="2" filter="url(#childStructureShadow)" />
              ) : node.type === "推断类型" ? (
                <path d={`M0,${-r * 1.25} L${r * 1.45},0 L0,${r * 1.25} L${-r * 1.45},0 Z`} fill={color} fillOpacity={active ? 0.84 : 0.18} stroke="#fff" strokeWidth="2" filter="url(#childStructureShadow)" />
              ) : (
                <circle r={r} fill={node.type === "故事集" ? "url(#childStructureGlow)" : color} fillOpacity={active ? 0.9 : 0.2} stroke={color} strokeWidth={node.type === "故事集" ? 3 : 1.5} filter="url(#childStructureShadow)" />
              )}
              <text className="atlas-node-label child-node-label child-structure-label" y="5" textAnchor="middle">{short(node.label, labelLimit)}</text>
            </g>
          );
        })}
        <g className="child-graph-svg-legend" transform={`translate(${childGraphView.legendX} ${childGraphView.legendY})`}>
          <rect width={childGraphView.legendWidth} height={childGraphView.legendHeight} rx="6" fill="#f8fbff" stroke="#dce7f2" />
          {legendTypes.map((type, index) => (
            <g key={type} transform={`translate(${30 + (index % 4) * 188} ${22 + Math.floor(index / 4) * 23})`}>
              <circle cx="7" cy="-5" r="6.5" fill={childStructurePalette[type] || regionColors[index]} />
              <text className="atlas-subtitle child-legend-text" x="24" y="0">{type}</text>
            </g>
          ))}
          <text className="atlas-subtitle child-legend-text" x={childGraphView.legendWidth - 30} y="43" textAnchor="end">
            显示 {nodes.length} 节点 · {edges.length} 关系 / 全量 {graph.stats?.nodes || nodes.length} 节点
          </text>
        </g>
      </svg>
    </Panel>
  );
}

export {
  StoryMapPublicationBubbleMap as PublicationBubbleMap,
  StoryMapSourceChinaMap as SourceChinaMap,
  IdentityProcessChart,
  IdentityRiverChart,
  PrefaceThemeCluster,
  PrefaceWordCloud,
  ChildThemeCooccurrence,
};

function focusValue(record, key, fallback = "") {
  const raw = record?.raw || {};
  const system = record?.system || {};
  const value = record?.[key] ?? system[key] ?? raw[key];
  return value === undefined || value === null || value === "" ? fallback : String(value);
}

function FocusedRecordVisual({ records }) {
  if (!records?.length || records.length !== 1) return null;
  const record = records[0];
  const raw = record.raw || {};
  const title = focusValue(record, "title", raw.name || raw.foreignTitle || "当前选中记录");
  const year = focusValue(record, "publish_year", raw.yearText || raw.year || "未记录");
  const translator = focusValue(record, "translator", raw.editor || "未记录");
  const publisher = focusValue(record, "publisher", raw.publisher || "未记录");
  const type = focusValue(record, "document_type", raw.prefaceType || raw.carrier || "文献记录");
  const collection = focusValue(record, "collection", raw.bookName || raw.name || "");
  const source = focusValue(record, "source_place", raw.sourceRegion || raw.ethnicity || raw.source || "");
  const childCount = Number(raw.declaredChildCount || raw.matchedChildIds?.length || record.reprint_count || 0);
  const bars = [
    { label: "时间", value: /^\d+$/.test(String(year)) ? Math.max(4, Math.min(100, (Number(year) - 1900) / 1.3)) : 18 },
    { label: "子故事", value: childCount ? Math.max(8, Math.min(100, childCount)) : 16 },
    { label: "文本", value: Math.max(10, Math.min(100, String(focusValue(record, "content", raw.prefaceText || raw.prefaceIntro || "")).length / 90)) },
  ];
  return (
    <section className="focused-record-visual" aria-label="当前选中记录可视化">
      <div>
        <span>当前选中记录</span>
        <strong>{title}</strong>
        {collection && collection !== title && <small>{collection}</small>}
      </div>
      <dl>
        <div><dt>年份</dt><dd>{year}</dd></div>
        <div><dt>译者/编者</dt><dd>{translator}</dd></div>
        <div><dt>出版社</dt><dd>{publisher}</dd></div>
        <div><dt>类型</dt><dd>{type}</dd></div>
        <div><dt>来源</dt><dd>{source || "未记录"}</dd></div>
      </dl>
      <div className="focused-record-bars">
        {bars.map((bar) => (
          <label key={bar.label}>
            <span>{bar.label}</span>
            <i style={{ "--value": `${bar.value}%` }} />
          </label>
        ))}
      </div>
    </section>
  );
}

export default function StoryVisualAtlas({ mode = "collections", prefaces = {}, focusedRecords }) {
  const { state } = useGlobalFilter();
  const [atlas, setAtlas] = useState(null);
  const [error, setError] = useState("");
  const [prefaceAtlas, setPrefaceAtlas] = useState(null);
  const apiMode = mode === "identity" ? "collections" : mode;

  useEffect(() => {
    let canceled = false;
    setError("");
    api.storyVisualAtlas(apiMode)
      .then((data) => {
        if (canceled) return;
        setAtlas((current) => ({
          ...current,
          ...data,
          stats: data.stats || current?.stats || {},
          charts: { ...(current?.charts || {}), ...(data.charts || {}) },
        }));
      })
      .catch((err) => { if (!canceled) setError(err.message); });
    return () => { canceled = true; };
  }, [apiMode]);

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
  const prefaceClusterChart = prefaceAtlas?.cluster?.nodes?.length ? prefaceAtlas.cluster : charts.prefaceCluster;
  const wordCloudChart = prefaceAtlas?.wordClouds?.length
    ? { ...charts.wordCloud, wordClouds: prefaceAtlas.wordClouds, words: prefaceAtlas.wordClouds[0]?.words || charts.wordCloud?.words || [] }
    : charts.wordCloud;
  const activeFocusedRecords = focusedRecords || state.analysisRecords;
  const chartReady = mode === "identity"
    ? Boolean(charts.identityProcess && charts.identityRiver)
    : mode === "collections"
    ? Boolean(charts.identityProcess && charts.identityRiver && charts.publicationMap && charts.sourceMap)
    : mode === "prefaces"
      ? Boolean(prefaceClusterChart && wordCloudChart)
      : Boolean(charts.childCooccurrence);

  if (!chartReady) {
    return <div className="work-panel atlas-loading">正在从后端生成可视化图谱...</div>;
  }

  if (mode === "prefaces") {
    return (
      <section className="story-atlas story-atlas-prefaces" id="visual-atlas-preface-cluster">
        <FocusedRecordVisual records={activeFocusedRecords} />
        <div className="atlas-grid two-col equal-atlas-row">
          <PrefaceThemeCluster chart={prefaceClusterChart} />
          <PrefaceWordCloud chart={wordCloudChart} />
        </div>
      </section>
    );
  }

  if (mode === "children") {
    return (
      <section className="story-atlas story-atlas-children" id="visual-atlas-child-co">
        <FocusedRecordVisual records={activeFocusedRecords} />
        <div className="atlas-grid two-col equal-atlas-row child-graph-split">
          <ChildThemeCooccurrence chart={charts.childCooccurrence} />
          <ChildThemeTypeNetwork chart={charts.childCooccurrence} />
        </div>
      </section>
    );
  }

  if (mode === "identity") {
    return (
      <section className="story-atlas story-atlas-collections" id="visual-atlas-identity-process">
        <FocusedRecordVisual records={activeFocusedRecords} />
        <div className="atlas-grid two-col equal-atlas-row">
          <IdentityProcessChart chart={charts.identityProcess} />
          <IdentityRiverChart chart={charts.identityRiver} />
        </div>
      </section>
    );
  }

  return (
    <section className="story-atlas story-atlas-collections" id="visual-atlas-identity-process">
      <FocusedRecordVisual records={activeFocusedRecords} />
      <div className="atlas-grid two-col equal-atlas-row">
        <IdentityProcessChart chart={charts.identityProcess} />
        <IdentityRiverChart chart={charts.identityRiver} />
      </div>
      <div className="atlas-grid two-col equal-atlas-row">
        <StoryMapPublicationBubbleMap chart={charts.publicationMap} />
        <StoryMapSourceChinaMap chart={charts.sourceMap} />
      </div>
    </section>
  );
}
