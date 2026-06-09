import { useEffect, useMemo, useRef, useState } from "react";
import maplibregl from "maplibre-gl";
import "maplibre-gl/dist/maplibre-gl.css";
import { Protocol } from "pmtiles";
import { api } from "../services/api.js";

const palette = ["#0b66b2", "#15a884", "#f59e0b", "#7c3aed", "#ef4444", "#0891b2", "#64748b", "#d97706"];
const regionColors = ["#2563eb", "#15a884", "#f59e0b", "#7c3aed", "#ef4444", "#0891b2", "#64748b", "#84cc16", "#ec4899", "#14b8a6"];
const TIMELINE_SLIDE_HOLD_MS = 2200;
const SOURCE_TIMELINE_SLIDE_HOLD_MS = 2600;
const GERMANY_VIEW_BOUNDS = [[2.4, 45.6], [17.2, 55.6]];
const fallbackCityCoords = {
  Berlin: [13.405, 52.52],
  Jena: [11.5892, 50.9271],
  München: [11.582, 48.1351],
  Munich: [11.582, 48.1351],
  Leipzig: [12.3731, 51.3397],
  Stuttgart: [9.1829, 48.7758],
  Hamburg: [9.9937, 53.5511],
  "Frankfurt am Main": [8.6821, 50.1109],
  Frankfurt: [8.6821, 50.1109],
  Köln: [6.9603, 50.9375],
  Cologne: [6.9603, 50.9375],
  Düsseldorf: [6.7735, 51.2277],
  Esslingen: [9.3103, 48.7428],
  Norderstedt: [9.9791, 53.7088],
  "Sankt Augustin": [7.1902, 50.7754],
  Bickenbach: [8.6106, 49.7595],
  Eisenach: [10.3157, 50.9795],
  Kassel: [9.4797, 51.3127],
  Basel: [7.5886, 47.5596],
  Zürich: [8.5417, 47.3769],
  Zurich: [8.5417, 47.3769],
  Prag: [14.4378, 50.0755],
  Prague: [14.4378, 50.0755],
  Wien: [16.3738, 48.2082],
  Vienna: [16.3738, 48.2082],
  Freiburg: [7.8421, 47.999],
  Bayreuth: [11.5783, 49.9456],
  Meerbusch: [6.6897, 51.2529],
  Augsburg: [10.8978, 48.3705],
  Bielefeld: [8.5325, 52.0302],
  Schiedlberg: [14.0546, 48.111],
  Kreuzlingen: [9.175, 47.65],
  Peking: [116.4, 39.9],
  Beijing: [116.4, 39.9],
  北京: [116.4, 39.9],
  Shanghai: [121.47, 31.23],
  上海: [121.47, 31.23]
};
const fallbackCityLabels = {
  Berlin: "柏林",
  Jena: "耶拿",
  München: "慕尼黑",
  Munich: "慕尼黑",
  Leipzig: "莱比锡",
  Stuttgart: "斯图加特",
  Hamburg: "汉堡",
  "Frankfurt am Main": "法兰克福",
  Frankfurt: "法兰克福",
  Köln: "科隆",
  Cologne: "科隆",
  Düsseldorf: "杜塞尔多夫",
  Esslingen: "埃斯林根",
  Norderstedt: "诺德施泰特",
  "Sankt Augustin": "圣奥古斯丁",
  Bickenbach: "比肯巴赫",
  Eisenach: "艾森纳赫",
  Kassel: "卡塞尔",
  Basel: "巴塞尔",
  Zürich: "苏黎世",
  Zurich: "苏黎世",
  Prag: "布拉格",
  Prague: "布拉格",
  Wien: "维也纳",
  Vienna: "维也纳",
  Freiburg: "弗赖堡",
  Bayreuth: "拜罗伊特",
  Meerbusch: "梅尔布施",
  Augsburg: "奥格斯堡",
  Bielefeld: "比勒费尔德",
  Schiedlberg: "席德尔贝格",
  Kreuzlingen: "克罗伊茨林根",
  Peking: "北京",
  Beijing: "北京",
  北京: "北京",
  Shanghai: "上海",
  上海: "上海"
};

let pmtilesProtocolRegistered = false;
const EMPTY_FEATURE_COLLECTION = { type: "FeatureCollection", features: [] };

async function loadSouthChinaSeaBasemap() {
  const [islands, dash] = await Promise.all([
    api.basemapNanhaizhudao().catch(() => EMPTY_FEATURE_COLLECTION),
    api.basemapJiuduanxian().catch(() => EMPTY_FEATURE_COLLECTION),
  ]);
  return {
    islands: islands || EMPTY_FEATURE_COLLECTION,
    dash: dash || EMPTY_FEATURE_COLLECTION,
  };
}

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
  if (geometry.type === "LineString") geometry.coordinates.forEach((point) => points.push(point));
  if (geometry.type === "MultiLineString") geometry.coordinates.flat().forEach((point) => points.push(point));
  return points;
}

const GERMANY_NEIGHBOR_BBOXES = [
  [11.7, 48.45, 18.9, 51.1], // Czechia
  [9.4, 46.35, 17.2, 49.05], // Austria
  [5.9, 45.75, 10.65, 47.9], // Switzerland
  [2.45, 49.45, 6.45, 51.6], // Belgium
  [3.2, 50.7, 7.3, 53.7], // Netherlands
];
const GERMANY_NEIGHBOR_LABELS = [
  { id: "netherlands", label: "荷兰", coords: [5.25, 52.35] },
  { id: "belgium", label: "比利时", coords: [4.75, 50.65] },
  { id: "switzerland", label: "瑞士", coords: [8.15, 46.95] },
  { id: "austria", label: "奥地利", coords: [13.25, 47.55] },
  { id: "czechia", label: "捷克", coords: [14.85, 49.85] },
];

function pointInBbox(point, bbox) {
  const lon = Number(point?.[0]);
  const lat = Number(point?.[1]);
  return Number.isFinite(lon) && Number.isFinite(lat) && lon >= bbox[0] && lon <= bbox[2] && lat >= bbox[1] && lat <= bbox[3];
}

function pointInAnyBbox(point, bboxes = GERMANY_NEIGHBOR_BBOXES) {
  return bboxes.some((bbox) => pointInBbox(point, bbox));
}

function segmentTouchesBbox(a, b, bbox) {
  const ax = Number(a?.[0]);
  const ay = Number(a?.[1]);
  const bx = Number(b?.[0]);
  const by = Number(b?.[1]);
  if (![ax, ay, bx, by].every(Number.isFinite)) return false;
  if (pointInBbox(a, bbox) || pointInBbox(b, bbox)) return true;
  const minX = Math.min(ax, bx);
  const maxX = Math.max(ax, bx);
  const minY = Math.min(ay, by);
  const maxY = Math.max(ay, by);
  return maxX >= bbox[0] && minX <= bbox[2] && maxY >= bbox[1] && minY <= bbox[3];
}

function segmentTouchesAnyBbox(a, b, bboxes = GERMANY_NEIGHBOR_BBOXES) {
  return bboxes.some((bbox) => segmentTouchesBbox(a, b, bbox));
}

function lineTouchesBbox(line = [], bboxes = GERMANY_NEIGHBOR_BBOXES) {
  if (line.some((point) => pointInAnyBbox(point, bboxes))) return true;
  for (let index = 1; index < line.length; index += 1) {
    if (segmentTouchesAnyBbox(line[index - 1], line[index], bboxes)) return true;
  }
  return false;
}

function clipLineToBbox(line = [], bboxes = GERMANY_NEIGHBOR_BBOXES) {
  const parts = [];
  let current = [];
  for (let index = 0; index < line.length; index += 1) {
    const point = line[index];
    const prev = line[index - 1];
    const inside = pointInAnyBbox(point, bboxes);
    const touchesPrev = prev ? segmentTouchesAnyBbox(prev, point, bboxes) : false;
    if (inside || touchesPrev) {
      if (!current.length && prev && touchesPrev) current.push(prev);
      current.push(point);
      continue;
    }
    if (current.length >= 2) parts.push(current);
    current = [];
  }
  if (current.length >= 2) parts.push(current);
  return parts;
}

function cropGeometryToBbox(geometry, bboxes = GERMANY_NEIGHBOR_BBOXES) {
  if (!geometry) return null;
  if (geometry.type === "LineString") {
    const lines = clipLineToBbox(geometry.coordinates || [], bboxes);
    if (!lines.length) return null;
    return lines.length === 1 ? { type: "LineString", coordinates: lines[0] } : { type: "MultiLineString", coordinates: lines };
  }
  if (geometry.type === "MultiLineString") {
    const lines = (geometry.coordinates || []).flatMap((line) => clipLineToBbox(line, bboxes));
    return lines.length ? { type: "MultiLineString", coordinates: lines } : null;
  }
  const points = collectPoints(geometry, []);
  return points.some((point) => pointInAnyBbox(point, bboxes)) ? geometry : null;
}

function cropFeatureCollectionToBbox(collection, bboxes = GERMANY_NEIGHBOR_BBOXES) {
  const features = (collection?.features || [])
    .map((feature) => ({ ...feature, geometry: cropGeometryToBbox(feature.geometry, bboxes) }))
    .filter((feature) => feature.geometry);
  return { type: "FeatureCollection", features };
}

function boundsOf(features = []) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;

  features.forEach((feature) => {
    const points = collectPoints(feature.geometry, []);
    points.forEach((point) => {
      const [x, y] = rawMercator(point);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    });
  });

  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return { minX: -1, maxX: 1, minY: -1, maxY: 1 };
  }
  return { minX, maxX, minY, maxY };
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

function makeProjectFromLonLatBounds(bounds, box) {
  const pad = box.pad || 18;
  const min = rawMercator([bounds.minLon, bounds.minLat]);
  const max = rawMercator([bounds.maxLon, bounds.maxLat]);
  const minX = Math.min(min[0], max[0]);
  const maxX = Math.max(min[0], max[0]);
  const minY = Math.min(min[1], max[1]);
  const maxY = Math.max(min[1], max[1]);
  const sx = (box.width - pad * 2) / Math.max(0.0001, maxX - minX);
  const sy = (box.height - pad * 2) / Math.max(0.0001, maxY - minY);
  const scale = Math.min(sx, sy);
  const mapW = (maxX - minX) * scale;
  const mapH = (maxY - minY) * scale;
  const ox = box.x + (box.width - mapW) / 2;
  const oy = box.y + (box.height - mapH) / 2;
  return (point) => {
    const [x, y] = rawMercator(point);
    return [ox + (x - minX) * scale, oy + (maxY - y) * scale];
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
  if (geometry.type === "LineString") {
    return [geometry.coordinates.map((point, index) => {
      const [x, y] = project(point);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" ")];
  }
  if (geometry.type === "MultiLineString") {
    return geometry.coordinates.map((line) => line.map((point, index) => {
      const [x, y] = project(point);
      return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
    }).join(" "));
  }
  return [];
}

function featureName(feature) {
  const props = feature?.properties || {};
  return props.ADMIN || props.name || props.NAME || props.NAME_EN || props.name_en || "";
}

function fitPublicationBounds(map, points = [], padding = { top: 64, left: 64, right: 230, bottom: 190 }) {
  const coords = points
    .filter((point) => Array.isArray(point?.coords) && point.coords.length >= 2)
    .map((point) => [Number(point.coords[0]), Number(point.coords[1])])
    .filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
  if (!map || !map.isStyleLoaded()) return;
  if (!coords.length) {
    map.fitBounds([[4.8, 47.0], [16.8, 55.9]], { padding, duration: 0 });
    return;
  }
  const lons = coords.map(([lon]) => lon);
  const lats = coords.map(([, lat]) => lat);
  const minLon = Math.min(...lons) - 1.2;
  const maxLon = Math.max(...lons) + 1.2;
  const minLat = Math.min(...lats) - 0.8;
  const maxLat = Math.max(...lats) + 0.8;
  map.fitBounds([[minLon, minLat], [maxLon, maxLat]], { padding, duration: 0 });
}

function fitGeoJsonBounds(map, geojson, padding = { top: 64, left: 64, right: 230, bottom: 190 }) {
  const coords = [];
  (geojson?.features || []).forEach((feature) => {
    collectPoints(feature.geometry).forEach((point) => {
      const lon = Number(point?.[0]);
      const lat = Number(point?.[1]);
      if (Number.isFinite(lon) && Number.isFinite(lat)) coords.push([lon, lat]);
    });
  });
  if (!map || !map.isStyleLoaded()) return false;
  if (!coords.length) return false;
  const lons = coords.map(([lon]) => lon);
  const lats = coords.map(([, lat]) => lat);
  map.fitBounds(
    [[Math.min(...lons), Math.min(...lats)], [Math.max(...lons), Math.max(...lats)]],
    { padding, duration: 0 },
  );
  return true;
}

function fitGermanyView(map, padding = { top: 64, left: 64, right: 230, bottom: 190 }) {
  if (!map) return false;
  map.resize();
  map.fitBounds(GERMANY_VIEW_BOUNDS, { padding, duration: 0, maxZoom: 7 });
  return true;
}

function germanBasemapData(data = {}) {
  const boundary = {
    type: "FeatureCollection",
    features: cropFeatureCollectionToBbox(data.boundary || data.world || {}).features,
  };
  const germany = {
    type: "FeatureCollection",
    features: data.germany?.features || [],
  };
  const combined = {
    type: "FeatureCollection",
    features: [...boundary.features, ...germany.features],
  };
  return { boundary, germany, combined };
}

function addGermanBasemapLayers(map, data = {}, options = {}) {
  const { boundary, germany } = germanBasemapData(data);
  map.addSource("europe-boundary", { type: "geojson", data: boundary });
  map.addLayer({
    id: "europe-boundary-outline",
    type: "line",
    source: "europe-boundary",
    paint: { "line-color": options.boundaryLine || "#8fa1b3", "line-width": options.boundaryWidth ?? 1.15 },
  });
  map.addSource("neighbor-country-labels", {
    type: "geojson",
    data: {
      type: "FeatureCollection",
      features: GERMANY_NEIGHBOR_LABELS.map((item) => ({
        type: "Feature",
        id: item.id,
        geometry: { type: "Point", coordinates: item.coords },
        properties: { label: item.label },
      })),
    },
  });
  map.addSource("germany-adm02", { type: "geojson", data: germany });
  map.addLayer({
    id: "germany-adm02-fill",
    type: "fill",
    source: "germany-adm02",
    paint: { "fill-color": options.germanyFill || "#f8fafc", "fill-opacity": options.germanyOpacity ?? 0.9 },
  });
  map.addLayer({
    id: "germany-adm02-outline",
    type: "line",
    source: "germany-adm02",
    paint: { "line-color": options.germanyLine || "#6f7f91", "line-width": options.germanyWidth ?? 1.15 },
  });
  map.addLayer({
    id: "neighbor-country-labels",
    type: "symbol",
    source: "neighbor-country-labels",
    layout: {
      "text-field": ["get", "label"],
      "text-size": 13,
      "text-anchor": "center",
      "text-allow-overlap": false,
      "text-ignore-placement": false,
    },
    paint: {
      "text-color": "#64748b",
      "text-halo-color": "rgba(255,255,255,0.94)",
      "text-halo-width": 1.4,
    },
  });
  return { boundary, germany };
}

function provinceKey(name = "") {
  return String(name).replace(/省|市|自治区|特别行政区|壮族|回族|维吾尔/g, "");
}

function fallbackPublicationPoints(items = []) {
  const cityPattern = new RegExp(`(?<!\\w)(${Object.keys(fallbackCityCoords).sort((a, b) => b.length - a.length).map((city) => city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?!\\w)`, "g");
  function extractCities(value = "") {
    const text = String(value || "").replaceAll("Zurich", "Zürich");
    const matched = [...text.matchAll(cityPattern)].map((match) => match[1]).filter(Boolean);
    return [...new Set(matched)];
  }
  function publicationCities(item) {
    const explicit = extractCities(item.city || "");
    if (explicit.length) return explicit;
    const publisher = String(item.publisher || "").replaceAll("Zurich", "Zürich");
    const leading = publisher.split(":", 1)[0];
    const matched = extractCities(leading);
    return matched.length ? matched : extractCities(publisher);
  }
  const cities = new Map();
  items.forEach((item) => {
    const matched = publicationCities(item);
    (matched.length ? matched : ["Berlin"]).forEach((city) => {
      const current = cities.get(city) || {
        id: city,
        city,
        label: fallbackCityLabels[city] || city,
        coords: fallbackCityCoords[city],
        count: 0,
        years: [],
        yearCounts: {},
        publishers: new Set(),
        country: ["Peking", "Beijing", "北京", "Shanghai", "上海"].includes(city) ? "中国" : (item.country || "德国/德语区")
      };
      current.count += 1;
      {
        const matchedYear = String(item.year || item.yearText || "").match(/\d{4}/);
        if (matchedYear) {
          const year = Number(matchedYear[0]);
          current.years.push(year);
          current.yearCounts[year] = (current.yearCounts[year] || 0) + 1;
        }
      }
      if (item.publisher) current.publishers.add(item.publisher);
      cities.set(city, current);
    });
  });
  return [...cities.values()].map((point) => ({
    ...point,
    years: [...new Set(point.years)].sort((a, b) => a - b),
    yearCounts: Object.fromEntries(Object.entries(point.yearCounts || {}).sort((a, b) => Number(a[0]) - Number(b[0]))),
    publishers: [...point.publishers],
  })).sort((a, b) => b.count - a.count);
}

function buildPublicationYearSlices(points = [], maxSlices = 7) {
  const years = [...new Set(
    points.flatMap((point) => point.years || []).map((year) => Number(year)).filter(Boolean)
  )].sort((a, b) => a - b);
  if (!years.length) return [];
  if (years.length <= maxSlices) {
    return years.map((year, index) => ({
      id: `slice-${index}`,
      start: year,
      end: year,
      cutoff: year,
      label: `${year}`,
    }));
  }
  const slices = [];
  const size = Math.ceil(years.length / maxSlices);
  for (let index = 0; index < years.length; index += size) {
    const chunk = years.slice(index, index + size);
    if (!chunk.length) continue;
    const start = chunk[0];
    const end = chunk[chunk.length - 1];
    slices.push({
      id: `slice-${slices.length}`,
      start,
      end,
      cutoff: end,
      label: start === end ? `${start}` : `${start}-${end}`,
    });
  }
  return slices;
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

function PublicationBubbleMap({ chart, items = [], title, id }) {
  const wrapperFallbackPoints = chart ? [] : fallbackPublicationPoints(items);
  const wrapperChart = chart || {
    title,
    subtitle: "出版地图",
    geo: {
      world: "basemap:boundary",
      countries: ["Germany", "China", "Switzerland", "Austria", "Czechia"]
    },
    points: wrapperFallbackPoints
  };
  const wrapperTitle = String(wrapperChart?.title || title || "");
  const isWrapperWilhelmPublicationMap = id === "visual-atlas-wilhelm-publication"
    || (wrapperTitle.includes("卫礼贤") && (wrapperTitle.includes("再版出版") || wrapperTitle.includes("传播地图")));
  const isWrapperGermanStoryPublicationMap = wrapperTitle.includes("德译中国故事集") || wrapperTitle.includes("故事集出版地图");

  if (isWrapperWilhelmPublicationMap) {
    return <MapLibreWilhelmPublicationMap chart={wrapperChart} />;
  }
  if (isWrapperGermanStoryPublicationMap || wrapperChart?.engine === "maplibre") {
    return <MapLibrePublicationOverlayMap chart={wrapperChart} />;
  }
  return <MapLibrePublicationOverlayMap chart={wrapperChart} />;

  const [world, setWorld] = useState(null);
  const [chinaBasemap, setChinaBasemap] = useState(null);
  const [selected, setSelected] = useState(null);
  const [year, setYear] = useState("all");
  const [playing, setPlaying] = useState(false);
  const [sliceIndex, setSliceIndex] = useState(0);
  const [svg, setSvg] = useState(null);
  const [mapViewBox, setMapViewBox] = useState(null);
  const panRef = useRef(null);
  const playingRef = useRef(false);
  const sliceIndexRef = useRef(0);
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
  const isGermanStoryPublicationMap = String(effectiveChart.title || "").includes("德译中国故事集") || String(effectiveChart.title || "").includes("故事集出版地图");
  const isWilhelmPublicationMap = String(effectiveChart.title || "").includes("卫礼贤") && String(effectiveChart.title || "").includes("再版出版地图");
  const isWilhelmPropagationMap = String(effectiveChart.title || "").includes("卫礼贤") && String(effectiveChart.title || "").includes("传播地图");

  if (isWilhelmPublicationMap) {
    return <MapLibreWilhelmPublicationMap chart={effectiveChart} year={year} setYear={setYear} minYear={minYear} maxYear={maxYear} />;
  }

  if (isGermanStoryPublicationMap) {
    return <MapLibrePublicationOverlayMap chart={effectiveChart} />;
  }

  const yearSlices = useMemo(() => (isGermanStoryPublicationMap ? buildPublicationYearSlices(points) : []), [isGermanStoryPublicationMap, points]);
  const activeSlice = isGermanStoryPublicationMap && sliceIndex >= 0 ? yearSlices[sliceIndex] : null;
  function pointYearCounts(point) {
    if (point?.yearCounts && typeof point.yearCounts === "object") {
      return Object.entries(point.yearCounts)
        .map(([entryYear, count]) => [Number(entryYear), Number(count) || 0])
        .filter(([entryYear, count]) => entryYear && count > 0)
        .sort((a, b) => a[0] - b[0]);
    }
    return (point?.years || [])
      .map((entryYear) => Number(entryYear))
      .filter(Boolean)
      .sort((a, b) => a - b)
      .map((entryYear) => [entryYear, 1]);
  }
  const shown = useMemo(() => {
    if (!isGermanStoryPublicationMap) {
      return year === "all" ? points : points.filter((point) => (point.years || []).some((item) => item <= Number(year)));
    }
    return points.map((point) => {
      const entries = pointYearCounts(point);
      const visibleEntries = !activeSlice ? entries : entries.filter(([entryYear]) => entryYear <= activeSlice.cutoff);
      const visibleYears = visibleEntries.map(([entryYear]) => entryYear);
      const visibleCount = visibleEntries.reduce((sum, [, count]) => sum + count, 0);
      return { ...point, years: visibleYears, count: visibleCount };
    }).filter((point) => point.count > 0).sort((a, b) => b.count - a.count);
  }, [activeSlice, isGermanStoryPublicationMap, points, year]);
  const max = Math.max(1, ...shown.map((point) => point.count));
  const globalMax = Math.max(1, ...points.map((point) => point.count || 0));

  useEffect(() => {
    if (!isGermanStoryPublicationMap) return;
    playingRef.current = playing;
  }, [isGermanStoryPublicationMap, playing]);

  useEffect(() => {
    if (!isGermanStoryPublicationMap) return;
    sliceIndexRef.current = sliceIndex;
  }, [isGermanStoryPublicationMap, sliceIndex]);

  useEffect(() => {
    if (!isGermanStoryPublicationMap || !playing || yearSlices.length <= 1) return;
    const timer = window.setInterval(() => {
      const current = sliceIndexRef.current;
      const next = current + 1;
      if (next >= yearSlices.length) {
        setPlaying(false);
        return;
      }
      setSliceIndex(next);
    }, TIMELINE_SLIDE_HOLD_MS);
    return () => window.clearInterval(timer);
  }, [isGermanStoryPublicationMap, playing, yearSlices]);

  useEffect(() => {
    let canceled = false;
    async function load() {
      try {
        const data = (isGermanStoryPublicationMap || isWilhelmPropagationMap)
          ? await Promise.all([api.basemapBoundary(), api.basemapGermanyAdm02()]).then(([boundary, germany]) => germanBasemapData({ boundary, germany }).combined)
          : await api.basemapBoundary();
        if (!canceled) setWorld(data);
      } catch {
        if (!canceled) setWorld({ features: [] });
      }
    }
    load();
    return () => { canceled = true; };
  }, [isGermanStoryPublicationMap, isWilhelmPropagationMap]);

  useEffect(() => {
    if (!isGermanStoryPublicationMap) {
      setChinaBasemap(null);
      return undefined;
    }
    let canceled = false;
    async function load() {
      try {
        const data = await api.basemapProvince();
        if (!canceled) setChinaBasemap(data);
      } catch {
        if (!canceled) setChinaBasemap({ features: [] });
      }
    }
    load();
    return () => { canceled = true; };
  }, [isGermanStoryPublicationMap]);

  const features = world?.features || [];
  const mapNames = new Set(effectiveChart.geo?.countries || ["Germany", "China", "Switzerland", "Austria", "Czechia"]);
  const useGermanBasemapStyle = isGermanStoryPublicationMap || isWilhelmPropagationMap;
  const europe = useGermanBasemapStyle
    ? features
    : features.filter((feature) => mapNames.has(featureName(feature)) && featureName(feature) !== "China");
  const china = isGermanStoryPublicationMap
    ? (chinaBasemap?.features || [])
    : features.filter((feature) => featureName(feature) === "China");

  const view = isGermanStoryPublicationMap ? { width: 1400, height: 980 } : { width: 980, height: 600 };

  const projectEurope = europe.length
    ? (
      useGermanBasemapStyle
        ? makeProject(europe, isGermanStoryPublicationMap ? { x: 54, y: 96, width: 980, height: 600, pad: 10 } : { x: 44, y: 86, width: 570, height: 415, pad: 12 })
        : makeProject(europe, { x: 44, y: 86, width: 570, height: 415, pad: 12 })
    )
    : null;

  const chinaDataBounds = useMemo(() => {
    if (!isGermanStoryPublicationMap) return null;
    const chinaPoints = shown.filter((point) => isChinaPoint(point) && Array.isArray(point.coords) && point.coords.length >= 2);
    if (!chinaPoints.length) return null;
    let minLon = Infinity;
    let maxLon = -Infinity;
    let minLat = Infinity;
    let maxLat = -Infinity;
    chinaPoints.forEach((point) => {
      const lon = Number(point.coords[0]);
      const lat = Number(point.coords[1]);
      if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
      if (lon < minLon) minLon = lon;
      if (lon > maxLon) maxLon = lon;
      if (lat < minLat) minLat = lat;
      if (lat > maxLat) maxLat = lat;
    });
    if (!Number.isFinite(minLon) || !Number.isFinite(minLat) || !Number.isFinite(maxLon) || !Number.isFinite(maxLat)) return null;
    const padLon = 3.2;
    const padLat = 2.2;
    return {
      minLon: Math.max(73.0, minLon - padLon),
      maxLon: Math.min(135.5, maxLon + padLon),
      minLat: Math.max(18.0, minLat - padLat),
      maxLat: Math.min(54.5, maxLat + padLat),
    };
  }, [isGermanStoryPublicationMap, shown]);

  const projectChina = china.length
    ? (
      isGermanStoryPublicationMap
        ? (
          chinaDataBounds
            ? makeProjectFromLonLatBounds(chinaDataBounds, { x: 1080, y: 500, width: 300, height: 220, pad: 8 })
            : makeProject(china, { x: 1080, y: 500, width: 300, height: 220, pad: 8 })
        )
        : makeProject(china, { x: 666, y: 330, width: 234, height: 150, pad: 8 })
    )
    : null;

  function isChinaPoint(point) {
    return String(point.country || "").includes("中国") || ["Peking", "Beijing", "北京", "Shanghai", "上海"].includes(point.city);
  }
  function pointXY(point) {
    const projector = isChinaPoint(point) ? projectChina : projectEurope;
    return projector ? projector(point.coords) : [0, 0];
  }

  const bars = isGermanStoryPublicationMap ? shown.slice(0, 10) : shown.slice(0, 7);
  const chinaInset = isGermanStoryPublicationMap
    ? { x: 1060, y: 440, width: 320, height: 280 }
    : { x: 642, y: 286, width: 296, height: 238 };

  const defaultViewBox = useMemo(
    () => ({ x: 0, y: 0, width: view.width, height: view.height }),
    [view.height, view.width],
  );

  useEffect(() => {
    setMapViewBox(defaultViewBox);
  }, [defaultViewBox]);

  function resetMapView() {
    setMapViewBox(defaultViewBox);
    panRef.current = null;
  }

  function clampZoomBox(box) {
    const minW = defaultViewBox.width * 0.35;
    const minH = defaultViewBox.height * 0.35;
    const maxW = defaultViewBox.width * 3.5;
    const maxH = defaultViewBox.height * 3.5;
    const width = Math.max(minW, Math.min(maxW, box.width));
    const height = Math.max(minH, Math.min(maxH, box.height));
    const x = box.x + (box.width - width) / 2;
    const y = box.y + (box.height - height) / 2;
    return { x, y, width, height };
  }

  function pointerToSvgPoint(event) {
    if (!svg || !mapViewBox) return null;
    const rect = svg.getBoundingClientRect();
    const px = (event.clientX - rect.left) / Math.max(1, rect.width);
    const py = (event.clientY - rect.top) / Math.max(1, rect.height);
    return {
      x: mapViewBox.x + px * mapViewBox.width,
      y: mapViewBox.y + py * mapViewBox.height,
      px,
      py,
      rect,
    };
  }

  function onWheel(event) {
    if (!mapViewBox) return;
    event.preventDefault();
    const pos = pointerToSvgPoint(event);
    if (!pos) return;

    const zoomIn = event.deltaY < 0;
    const factor = zoomIn ? 0.9 : 1.1;
    const nextW = mapViewBox.width * factor;
    const nextH = mapViewBox.height * factor;
    const nextX = pos.x - pos.px * nextW;
    const nextY = pos.y - pos.py * nextH;
    setMapViewBox(clampZoomBox({ x: nextX, y: nextY, width: nextW, height: nextH }));
  }

  function onPointerDown(event) {
    if (!mapViewBox || !svg) return;
    if (event.button !== undefined && event.button !== 0) return;
    const pos = pointerToSvgPoint(event);
    if (!pos) return;
    svg.setPointerCapture?.(event.pointerId);
    panRef.current = {
      pointerId: event.pointerId,
      startClientX: event.clientX,
      startClientY: event.clientY,
      startBox: mapViewBox,
      moved: false,
    };
  }

  function onPointerMove(event) {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId || !svg) return;
    const rect = svg.getBoundingClientRect();
    const dxPx = event.clientX - pan.startClientX;
    const dyPx = event.clientY - pan.startClientY;
    if (Math.abs(dxPx) + Math.abs(dyPx) > 3) pan.moved = true;

    const dx = (dxPx / Math.max(1, rect.width)) * pan.startBox.width;
    const dy = (dyPx / Math.max(1, rect.height)) * pan.startBox.height;
    setMapViewBox({ ...pan.startBox, x: pan.startBox.x - dx, y: pan.startBox.y - dy });
  }

  function onPointerUp(event) {
    const pan = panRef.current;
    if (!pan || pan.pointerId !== event.pointerId) return;
    panRef.current = null;
  }

  return (
    <Panel chart={effectiveChart} selected={selected} onExport={() => downloadSvg(`${effectiveChart.title || "出版地图"}.svg`, svg)}>
      <div className="atlas-map-controls">
        {isGermanStoryPublicationMap ? (
          <>
            <label>时间切片
              <input
                type="range"
                min={yearSlices.length ? 0 : -1}
                max={Math.max(-1, yearSlices.length - 1)}
                value={sliceIndex}
                onChange={(event) => {
                  setPlaying(false);
                  setSliceIndex(Number(event.target.value));
                }}
                disabled={!yearSlices.length}
              />
            </label>
            <button
              type="button"
              className={playing ? "pause" : ""}
              onClick={() => {
                if (playingRef.current) {
                  setPlaying(false);
                  return;
                }
                if (sliceIndexRef.current >= yearSlices.length - 1) setSliceIndex(0);
                setPlaying(true);
              }}
              disabled={yearSlices.length <= 1}
            >
              {playing ? "暂停" : "播放"}
            </button>
            <button type="button" onClick={() => { setPlaying(false); setSliceIndex(0); }}>回到起点</button>
          </>
        ) : (
          <>
            <label>时间过滤
              <input type="range" min={minYear} max={maxYear} value={year === "all" ? maxYear : year} onChange={(event) => setYear(event.target.value)} />
            </label>
            <button type="button" onClick={() => { setPlaying(false); setYear("all"); }}>全部年份</button>
          </>
        )}
        <button type="button" onClick={resetMapView}>重置缩放</button>
        <span>
          {isGermanStoryPublicationMap
            ? (activeSlice ? `显示 ${activeSlice.end} 年及以前节点（切片：${activeSlice.label}，节点数：${shown.length}）` : `显示全部出版节点（节点数：${shown.length}）`)
            : (year === "all" ? "显示全部出版节点" : `显示 ${year} 年及以前节点`)}
        </span>
      </div>
      <svg
        ref={setSvg}
        viewBox={mapViewBox ? `${mapViewBox.x} ${mapViewBox.y} ${mapViewBox.width} ${mapViewBox.height}` : `0 0 ${view.width} ${view.height}`}
        className="atlas-svg publication-svg"
        role="img"
        id={id}
        onWheel={onWheel}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={onPointerUp}
        style={{ touchAction: "none", cursor: panRef.current ? "grabbing" : "grab" }}
      >
        {isGermanStoryPublicationMap && (
          <defs>
            <clipPath id="chinaInsetClip">
              <rect x={chinaInset.x} y={chinaInset.y} width={chinaInset.width} height={chinaInset.height} rx="10" />
            </clipPath>
          </defs>
        )}
        <g>
          <rect width={view.width} height={view.height} fill="#fff" />
          <text
            className="atlas-title"
            x="44"
            y={isGermanStoryPublicationMap ? 46 : 56}
            style={isGermanStoryPublicationMap ? { fontSize: "26px" } : undefined}
          >
            德国及德语区出版城市
          </text>
          {europe.flatMap((feature, featureIndex) => {
            const name = featureName(feature);
            const isGermanPolygon = useGermanBasemapStyle && ["Polygon", "MultiPolygon"].includes(feature.geometry?.type);
            const stroke = useGermanBasemapStyle ? (isGermanPolygon ? "#6f7f91" : "#8fa1b3") : "#9bb0c5";
            const strokeWidth = useGermanBasemapStyle ? (isGermanPolygon ? 1.2 : 1.15) : 1;
            return geometryPaths(feature.geometry, projectEurope).map((path, pathIndex) => (
              <path key={`${featureIndex}-${pathIndex}`} d={path} fill={isGermanPolygon ? "#f8fafc" : (useGermanBasemapStyle ? "none" : "#f2f7fb")} fillOpacity={isGermanPolygon ? 0.9 : 1} stroke={stroke} strokeWidth={strokeWidth} />
            ));
          })}
          <g>
            <rect x={chinaInset.x} y={chinaInset.y} width={chinaInset.width} height={chinaInset.height} rx="10" fill="#fffdf7" stroke="#e7c873" />
            <text className="atlas-title publication-legend-title" x={chinaInset.x + 18} y={chinaInset.y + 32}>中国出版节点</text>
            <g clipPath={isGermanStoryPublicationMap ? "url(#chinaInsetClip)" : undefined}>
              {china.flatMap((feature, featureIndex) => geometryPaths(feature.geometry, projectChina).map((path, pathIndex) => (
                <path key={`${featureIndex}-${pathIndex}`} d={path} fill={isGermanStoryPublicationMap ? "none" : "#fff8df"} opacity={isGermanStoryPublicationMap ? 0.86 : 1} stroke="#c59b25" strokeWidth={isGermanStoryPublicationMap ? 0.8 : 1} />
              )))}
            </g>
          </g>
          {shown.map((point, index) => {
            const [cx, cy] = pointXY(point);
            const r = 7 + point.count / (isGermanStoryPublicationMap ? globalMax : max) * 22;
            const color = palette[index % palette.length];
            const active = selected?.id === point.id;
            return (
              <g className="atlas-clickable" key={point.id} onClick={() => setSelected({ ...point, title: point.label, detail: `${point.city}：${point.count} 部；年份 ${Math.min(...(point.years || [0]))}-${Math.max(...(point.years || [0]))}` })}>
                <circle
                  className={active ? "selected" : ""}
                  cx={cx}
                  cy={cy}
                  r={r}
                  fill={isGermanStoryPublicationMap ? "none" : color}
                  fillOpacity={isGermanStoryPublicationMap ? 1 : (isChinaPoint(point) ? 0.82 : 0.68)}
                  stroke={isGermanStoryPublicationMap ? color : "#111827"}
                  strokeWidth={active ? (isGermanStoryPublicationMap ? 3.2 : 3) : (isGermanStoryPublicationMap ? 2.1 : 1.2)}
                />
                {(() => {
                  const show = active || (!isGermanStoryPublicationMap && index < 9) || (isGermanStoryPublicationMap && index < 14);
                  if (!show) return null;
                  const europeMidX = 54 + 980 / 2;
                  const chinaMidX = chinaInset.x + chinaInset.width / 2;
                  const onChina = isChinaPoint(point);
                  const preferLeft = onChina ? (cx > chinaMidX) : (cx > europeMidX);
                  const dx = preferLeft ? -1 : 1;
                  const lx = cx + dx * (r + 7);
                  const ly = cy - 7;
                  const anchor = preferLeft ? "end" : "start";
                  return (
                    <text
                      className="atlas-map-label publication-label"
                      x={lx}
                      y={ly}
                      textAnchor={anchor}
                      style={{ pointerEvents: "all" }}
                    >
                      <tspan x={lx}>{point.label}</tspan>
                      <tspan x={lx} dy="16">{point.city} 路 {point.count}</tspan>
                    </text>
                  );
                })() /* end label */}
              </g>
            );
          })}
          {!isGermanStoryPublicationMap && (
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
          )}
          {isGermanStoryPublicationMap && (
            <g transform="translate(54 790)">
              <rect width="1328" height="170" rx="12" fill="#f8fbff" stroke="#dce7f2" />
              <text className="atlas-title publication-legend-title" x="18" y="34">主要出版中心（Top 10）</text>
              {(() => {
                const plotX = 26;
                const plotY = 74;
                const plotW = 1260;
                const plotH = 88;
                const gap = 16;
                const barW = Math.min(58, Math.max(34, (plotW - (bars.length - 1) * gap) / Math.max(1, bars.length)));
                const maxCount = Math.max(1, ...bars.map((p) => p.count));
                return (
                  <g transform={`translate(${plotX} ${plotY})`}>
                    {bars.map((point, index) => {
                      const h = (point.count / maxCount) * plotH;
                      const x = index * (barW + gap);
                      const y = plotH - h;
                      const color = palette[index % palette.length];
                      return (
                        <g
                          className="atlas-clickable"
                          key={`bar-${point.id}`}
                          transform={`translate(${x} 0)`}
                          onClick={() => setSelected({ ...point, title: point.label, detail: `${point.city}：${point.count} 部` })}
                        >
                          <text className="atlas-subtitle publication-legend-text" x={barW / 2} y={y - 8} textAnchor="middle">{point.count}</text>
                          <rect x="0" y={y} width={barW} height={h} rx="6" fill="none" stroke={color} strokeWidth="2.2" />
                          <text className="atlas-subtitle publication-legend-text" x={barW / 2} y={plotH + 22} textAnchor="middle">{short(point.label, 6)}</text>
                        </g>
                      );
                    })}
                  </g>
                );
              })()}
            </g>
          )}
        </g>
      </svg>
    </Panel>
  );
}

function MapLibrePublicationOverlayMap({ chart }) {
  const [selected, setSelected] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [sliceIndex, setSliceIndex] = useState(0);
  const [viewportVersion, setViewportVersion] = useState(0);
  const [mainSize, setMainSize] = useState({ width: 0, height: 0 });
  const [insetSize, setInsetSize] = useState({ width: 0, height: 0 });
  const mapContainerRef = useRef(null);
  const insetContainerRef = useRef(null);
  const mapRef = useRef(null);
  const insetRef = useRef(null);
  const playingRef = useRef(false);
  const sliceIndexRef = useRef(-1);
  const shownRef = useRef([]);

  const points = chart?.points || [];
  const timelineEnabled = chart?.timelineMode !== "static";
  const timeRange = chart?.timeRange;
  const yearSlices = useMemo(() => buildPublicationYearSlices(points), [points]);
  const activeSlice = timelineEnabled && sliceIndex >= 0 ? yearSlices[sliceIndex] : null;

  function pointYearCounts(point) {
    if (point?.yearCounts && typeof point.yearCounts === "object") {
      return Object.entries(point.yearCounts)
        .map(([year, count]) => [Number(year), Number(count) || 0])
        .filter(([year, count]) => year && count > 0)
        .sort((a, b) => a[0] - b[0]);
    }
    return (point?.years || [])
      .map((year) => Number(year))
      .filter(Boolean)
      .sort((a, b) => a - b)
      .map((year) => [year, 1]);
  }

  const shown = useMemo(() => {
    return points
      .map((point) => {
        const entries = pointYearCounts(point);
        const visibleEntries = !activeSlice
          ? entries
          : entries.filter(([year]) => year && year <= activeSlice.cutoff);
        const visibleYears = visibleEntries.map(([year]) => year);
        const visibleCount = visibleEntries.reduce((sum, [, count]) => sum + (Number(count) || 0), 0);
        return { ...point, years: visibleYears, count: visibleCount };
      })
      .filter((point) => (point.count || 0) > 0)
      .sort((a, b) => (b.count || 0) - (a.count || 0));
  }, [activeSlice, points]);

  const max = Math.max(1, ...shown.map((point) => point.count || 0));
  const globalMax = Math.max(1, ...points.map((point) => point.count || 0));
  const bars = shown.slice(0, 10);
  const colorById = useMemo(() => {
    const map = new Map();
    shown.forEach((point, index) => {
      map.set(point.id, palette[index % palette.length]);
    });
    return map;
  }, [shown]);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    sliceIndexRef.current = sliceIndex;
  }, [sliceIndex]);

  useEffect(() => {
    shownRef.current = shown;
  }, [shown]);

  useEffect(() => {
    if (!selected?.province) return;
    const matched = shown.find((point) => provinceKey(point?.province || "") === provinceKey(selected.province));
    if (matched) {
      if ((matched.count || 0) !== (selected.count || 0)) setSelectedPoint(matched);
      return;
    }
    setSelected(null);
  }, [shown, selected]);

  useEffect(() => {
    shownRef.current = shown;
  }, [shown]);

  useEffect(() => {
    if (!timelineEnabled) {
      if (playing) setPlaying(false);
      return;
    }
    if (!yearSlices.length) {
      return;
    }
    if (sliceIndex < 0 || sliceIndex >= yearSlices.length) setSliceIndex(0);
  }, [playing, sliceIndex, timelineEnabled, yearSlices]);

  useEffect(() => {
    if (!timelineEnabled || !playing || yearSlices.length <= 1) return;
    const timer = window.setInterval(() => {
      const current = sliceIndexRef.current;
      const next = current < 0 ? 0 : current + 1;
      if (next >= yearSlices.length) {
        setPlaying(false);
        return;
      }
      setSliceIndex(next);
    }, TIMELINE_SLIDE_HOLD_MS);
    return () => window.clearInterval(timer);
  }, [playing, timelineEnabled, yearSlices]);

  function pointDetail(point) {
    const years = (point.years || []).filter(Boolean);
    const minYear = years.length ? Math.min(...years) : 0;
    const maxYear = years.length ? Math.max(...years) : 0;
    const yearText = minYear && maxYear ? `；年份 ${minYear}-${maxYear}` : "";
    return `${point.city}：${point.count} 部${yearText}`;
  }

  function setSelectedPoint(point) {
    setSelected({ ...point, title: point.label, detail: pointDetail(point) });
  }

  function isChinaPoint(point) {
    return String(point.country || "").includes("中国") || ["Peking", "Beijing", "北京", "Shanghai", "上海"].includes(point.city);
  }

  function refreshOverlay() {
    if (mapContainerRef.current) {
      const rect = mapContainerRef.current.getBoundingClientRect();
      setMainSize((prev) => (prev.width === rect.width && prev.height === rect.height ? prev : { width: rect.width, height: rect.height }));
    }
    if (insetContainerRef.current) {
      const rect = insetContainerRef.current.getBoundingClientRect();
      setInsetSize((prev) => (prev.width === rect.width && prev.height === rect.height ? prev : { width: rect.width, height: rect.height }));
    }
    setViewportVersion((value) => value + 1);
  }

  function resetView() {
    const map = mapRef.current;
    if (map && map.isStyleLoaded()) {
      const insetPad = { top: 64, left: 64, right: 230, bottom: 190 };
      fitGermanyView(map, insetPad);
    }
    const inset = insetRef.current;
    if (inset && inset.isStyleLoaded()) {
      inset.fitBounds([[73.0, 18.0], [135.5, 54.5]], { padding: 10, duration: 0 });
    }
  }

  const europeOverlayPoints = useMemo(() => {
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded()) return [];
    return shown
      .filter((point) => !isChinaPoint(point) && Array.isArray(point.coords) && point.coords.length >= 2)
      .map((point, index) => {
        const projected = map.project([Number(point.coords[0]), Number(point.coords[1])]);
        return {
          ...point,
          x: projected.x,
          y: projected.y,
          color: colorById.get(point.id) || palette[index % palette.length],
          radius: 7 + ((Number(point.count) || 0) / Math.max(1, globalMax)) * 22,
        };
      });
  }, [shown, colorById, globalMax, viewportVersion]);

  const chinaOverlayPoints = useMemo(() => {
    const inset = insetRef.current;
    if (!inset || !inset.isStyleLoaded()) return [];
    return shown
      .filter((point) => isChinaPoint(point) && Array.isArray(point.coords) && point.coords.length >= 2)
      .map((point, index) => {
        const projected = inset.project([Number(point.coords[0]), Number(point.coords[1])]);
        return {
          ...point,
          x: projected.x,
          y: projected.y,
          color: colorById.get(point.id) || palette[index % palette.length],
          radius: 6 + ((Number(point.count) || 0) / Math.max(1, globalMax)) * 18,
        };
      });
  }, [shown, colorById, globalMax, viewportVersion]);

  const syncNote = activeSlice
    ? `切片 ${activeSlice.label}：欧洲 ${europeOverlayPoints.length}，中国 ${chinaOverlayPoints.length}`
    : `全部时期：欧洲 ${europeOverlayPoints.length}，中国 ${chinaOverlayPoints.length}`;
  const selectedWorks = useMemo(() => {
    const works = Array.isArray(selected?.works) ? selected.works : [];
    if (!activeSlice) return works;
    return works.filter((work) => {
      const year = Number(work?.year) || 0;
      return year > 0 && year <= activeSlice.cutoff;
    });
  }, [activeSlice, selected?.works]);

  function placeOverlayLabels(items, width, height, options = {}) {
    const {
      limit = items.length,
      offset = 8,
      nearDx = 54,
      nearDy = 26,
      fontSize = 14,
      lineHeight = 16,
    } = options;
    const directions = [
      { key: "right", dx: 1, dy: 0, anchor: "start" },
      { key: "left", dx: -1, dy: 0, anchor: "end" },
      { key: "top", dx: 0, dy: -1, anchor: "middle" },
      { key: "bottom", dx: 0, dy: 1, anchor: "middle" },
    ];
    const placed = [];
    return items.map((point, index) => {
      const active = selected?.id === point.id;
      if (!active && index >= limit) return { ...point, showLabel: false };
      const neighbors = placed.filter((item) => Math.abs(item.x - point.x) < nearDx && Math.abs(item.y - point.y) < nearDy);
      const baseDirection = point.x > width * 0.56 ? 1 : 0;
      const direction = directions[(baseDirection + neighbors.length) % directions.length];
      const distance = point.radius + offset;
      const lx = point.x + direction.dx * distance;
      const ly = point.y + direction.dy * distance - (direction.key === "bottom" ? -fontSize * 0.2 : direction.key === "top" ? fontSize * 0.45 : fontSize * 0.45);
      const label = {
        ...point,
        showLabel: true,
        labelX: Math.max(12, Math.min(width - 12, lx)),
        labelY: Math.max(18, Math.min(height - 18, ly)),
        textAnchor: direction.anchor,
        secondLineY: lineHeight,
      };
      placed.push(label);
      return label;
    });
  }

  const europeLabelPoints = useMemo(
    () => placeOverlayLabels(europeOverlayPoints, mainSize.width || 1, mainSize.height || 1, { limit: 14, offset: 16, nearDx: 64, nearDy: 28, fontSize: 14, lineHeight: 16 }),
    [europeOverlayPoints, mainSize.height, mainSize.width, selected?.id],
  );

  const chinaLabelPoints = useMemo(
    () => placeOverlayLabels(chinaOverlayPoints, insetSize.width || 1, insetSize.height || 1, { limit: 6, offset: 12, nearDx: 38, nearDy: 22, fontSize: 12, lineHeight: 14 }),
    [chinaOverlayPoints, insetSize.height, insetSize.width, selected?.id],
  );

  useEffect(() => {
    let canceled = false;

    async function loadBaseData() {
      const [boundary, germany, china] = await Promise.all([
        api.basemapBoundary(),
        api.basemapGermanyAdm02(),
        api.basemapProvince(),
      ]);
      if (canceled) return null;
      return { boundary, germany, china };
    }

    function makeBlankStyle(bg = "#ffffff") {
      return {
        version: 8,
        sources: {},
        layers: [{ id: "bg", type: "background", paint: { "background-color": bg } }],
      };
    }

    function initMap(container, style) {
      return new maplibregl.Map({
        container,
        style,
        attributionControl: false,
        interactive: true,
        dragRotate: false,
        pitchWithRotate: false,
      });
    }

    async function boot() {
      if (!mapContainerRef.current || !insetContainerRef.current) return;

      const data = await loadBaseData();
      if (!data) return;

      const map = initMap(mapContainerRef.current, makeBlankStyle("#ffffff"));
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");

      const inset = initMap(insetContainerRef.current, makeBlankStyle("#ffffff"));
      insetRef.current = inset;
      inset.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

      map.on("load", () => {
        const { germany, boundary } = addGermanBasemapLayers(map, data, { germanyWidth: 1.2 });
        const insetPad = { top: 64, left: 64, right: 230, bottom: 190 };
        fitGermanyView(map, insetPad);
        window.requestAnimationFrame(() => {
          if (!canceled) {
            fitGermanyView(map, insetPad);
            refreshOverlay();
          }
        });
        refreshOverlay();
      });

      inset.on("load", () => {
        inset.addSource("china", { type: "geojson", data: data.china });
        inset.addLayer({
          id: "china-fill",
          type: "fill",
          source: "china",
          paint: { "fill-color": "#f2f7fb", "fill-opacity": 0.9 },
        });
        inset.addLayer({
          id: "china-outline",
          type: "line",
          source: "china",
          paint: { "line-color": "#9bb0c5", "line-width": 1 },
        });
        inset.fitBounds([[73.0, 18.0], [135.5, 54.5]], { padding: 10, duration: 0 });
        refreshOverlay();
      });

      [map, inset].forEach((instance) => {
        ["move", "zoom", "resize", "idle"].forEach((eventName) => {
          instance.on(eventName, refreshOverlay);
        });
      });
    }

    boot().catch(() => {});
    return () => {
      canceled = true;
      mapRef.current?.remove();
      insetRef.current?.remove();
      mapRef.current = null;
      insetRef.current = null;
    };
  }, [chart]);

  useEffect(() => {
    refreshOverlay();
  }, [shown]);

  return (
    <Panel chart={chart} selected={null} onExport={undefined} id="visual-atlas-publication-maplibre">
      <div className="atlas-map-controls">
        {timelineEnabled ? (
          <>
            <label>时间切片
              <input
                type="range"
                min={yearSlices.length ? 0 : -1}
                max={Math.max(-1, yearSlices.length - 1)}
                value={sliceIndex}
                onChange={(event) => {
                  setPlaying(false);
                  setSliceIndex(Number(event.target.value));
                }}
                disabled={!yearSlices.length}
              />
            </label>
            <strong>{activeSlice ? activeSlice.label : (yearSlices[0] ? `${yearSlices[0].start}-${yearSlices[yearSlices.length - 1].end}` : "全部")}</strong>
            <button
              type="button"
              className={playing ? "pause" : ""}
              onClick={() => {
                if (playingRef.current) {
                  setPlaying(false);
                  return;
                }
                if (sliceIndexRef.current >= yearSlices.length - 1 || sliceIndexRef.current < 0) setSliceIndex(0);
                setPlaying(true);
              }}
              disabled={yearSlices.length <= 1}
            >
              {playing ? "暂停" : "播放"}
            </button>
            <button type="button" onClick={() => { setPlaying(false); setSliceIndex(-1); }}>全部时期</button>
          </>
        ) : (
          <strong>{timeRange?.label || (yearSlices[0] ? `${yearSlices[0].start}-${yearSlices[yearSlices.length - 1].end}` : "全部时期")}</strong>
        )}
        <button type="button" onClick={resetView}>重置视图</button>
        <span>
          {timelineEnabled
            ? (activeSlice ? `显示 ${activeSlice.end} 年及以前节点（切片：${activeSlice.label}，节点数：${shown.length}）` : `显示全部出版节点（节点数：${shown.length}）`)
            : `显示${timeRange?.label ? `“${timeRange.label}”` : "当前阶段"}出版节点（节点数：${shown.length}）`}
        </span>
        <span>{syncNote}</span>
      </div>
      <div className="maplibre-publication-wrap">
        <div className="maplibre-publication-map">
          <div ref={mapContainerRef} style={{ position: "absolute", inset: 0 }} />
          <svg
            width={mainSize.width}
            height={mainSize.height}
            viewBox={`0 0 ${Math.max(1, mainSize.width)} ${Math.max(1, mainSize.height)}`}
            style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
          >
            {europeLabelPoints.map((point) => {
              const active = selected?.id === point.id;
              return (
                <g key={`overlay-eu-${point.id}`} style={{ pointerEvents: "all", cursor: "pointer" }} onClick={() => setSelectedPoint(point)}>
                  <circle cx={point.x} cy={point.y} r={point.radius} fill="rgba(255,255,255,0.14)" stroke={point.color} strokeWidth={active ? 3.2 : 2.2} />
                  {point.showLabel && (
                    <text className="atlas-map-label publication-label" x={point.labelX} y={point.labelY} textAnchor={point.textAnchor}>
                      <tspan x={point.labelX}>{point.label}</tspan>
                      <tspan x={point.labelX} dy={point.secondLineY}>{point.city}</tspan>
                    </text>
                  )}
                </g>
              );
            })}
          </svg>
          <div className="maplibre-publication-legend">
            <div className="legend-title">图例</div>
            <div className="legend-row">
              <span>分级圆大小</span>
              <div className="legend-circles">
                <div className="legend-circle" style={{ width: 12, height: 12, borderColor: palette[0] }} />
                <div className="legend-circle" style={{ width: 20, height: 20, borderColor: palette[1] }} />
                <div className="legend-circle" style={{ width: 28, height: 28, borderColor: palette[2] }} />
              </div>
              <span>少 → 多</span>
            </div>
          </div>
          <div className="maplibre-publication-inset">
            <div className="inset-title">中国出版节点</div>
            <div ref={insetContainerRef} style={{ position: "absolute", inset: 0 }} />
            <svg
              width={insetSize.width}
              height={insetSize.height}
              viewBox={`0 0 ${Math.max(1, insetSize.width)} ${Math.max(1, insetSize.height)}`}
              style={{ position: "absolute", inset: 0, pointerEvents: "none", overflow: "visible" }}
            >
              {chinaLabelPoints.map((point) => {
                const active = selected?.id === point.id;
                return (
                  <g key={`overlay-cn-${point.id}`} style={{ pointerEvents: "all", cursor: "pointer" }} onClick={() => setSelectedPoint(point)}>
                    <circle cx={point.x} cy={point.y} r={point.radius} fill="rgba(255,255,255,0.14)" stroke={point.color} strokeWidth={active ? 3 : 2} />
                    {point.showLabel && (
                      <text className="atlas-map-label publication-label" x={point.labelX} y={point.labelY} textAnchor={point.textAnchor} style={{ fontSize: "12px" }}>
                        <tspan x={point.labelX}>{point.label}</tspan>
                      </text>
                    )}
                  </g>
                );
              })}
            </svg>
          </div>
        </div>
        <div className="maplibre-publication-ranking">
          <div className="rank-title">主要出版中心（Top 10）</div>
          <div className="rank-bars">
            {bars.map((point, index) => {
              const color = colorById.get(point.id) || palette[index % palette.length];
              const h = (Number(point.count || 0) / max) * 92;
              return (
                <div
                  key={`rank-${point.id}`}
                  className="rank-bar"
                  style={{ color }}
                  onClick={() => setSelectedPoint(point)}
                >
                  <div className="rank-num">{point.count}</div>
                  <div className="rank-rect" style={{ height: `${Math.max(8, h)}px` }} />
                  <div className="rank-label">{short(point.label, 6)}</div>
                </div>
              );
            })}
          </div>
          {selected && (
            <div className="maplibre-publication-detail rank-detail">
              <div className="detail-title">{selected.label || selected.city || "未命名地区"}</div>
              <div className="detail-subtitle">{selected.detail || ""}</div>
              <div className="detail-table-wrap">
                <table className="detail-table">
                  <thead>
                    <tr>
                      <th>故事集</th>
                      <th>年份</th>
                      <th>出版社</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedWorks.length ? selectedWorks.map((work, index) => (
                      <tr key={`${selected.id || selected.city}-work-${index}`}>
                        <td title={work.title || ""}>{work.title || "未记录"}</td>
                        <td>{work.year || "未记录"}</td>
                        <td title={work.publisher || ""}>{work.publisher || "未记录"}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan="3">当前数据源未返回该地区的出版清单。</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
    </Panel>
  );
}

function MapLibrePublicationMap({ chart }) {
  const [selected, setSelected] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [sliceIndex, setSliceIndex] = useState(0);
  const [syncNote, setSyncNote] = useState("等待地图同步");
  const [sourcesVersion, setSourcesVersion] = useState(0);
  const mapContainerRef = useRef(null);
  const insetContainerRef = useRef(null);
  const mapRef = useRef(null);
  const insetRef = useRef(null);
  const selectedIdRef = useRef("");
  const playingRef = useRef(false);
  const sliceIndexRef = useRef(-1);
  const shownRef = useRef([]);

  const points = chart?.points || [];
  const yearSlices = useMemo(() => buildPublicationYearSlices(points), [points]);
  const activeSlice = sliceIndex >= 0 ? yearSlices[sliceIndex] : null;
  function pointYearCounts(point) {
    if (point?.yearCounts && typeof point.yearCounts === "object") {
      return Object.entries(point.yearCounts)
        .map(([year, count]) => [Number(year), Number(count) || 0])
        .filter(([year, count]) => year && count > 0)
        .sort((a, b) => a[0] - b[0]);
    }
    return (point?.years || [])
      .map((year) => Number(year))
      .filter(Boolean)
      .sort((a, b) => a - b)
      .map((year) => [year, 1]);
  }
  const timelinePoints = useMemo(
    () => {
      return points.map((point) => {
        const entries = pointYearCounts(point);
        const visibleEntries = !activeSlice
          ? entries
          : entries.filter(([year]) => year && year <= activeSlice.cutoff);
        const visibleYears = visibleEntries.map(([year]) => year);
        const visibleCount = visibleEntries.reduce((sum, [, count]) => sum + (Number(count) || 0), 0);
        return {
          ...point,
          years: visibleYears,
          count: visibleCount,
        };
      });
    },
    [activeSlice, points],
  );
  const shown = useMemo(
    () => timelinePoints.filter((point) => (point.count || 0) > 0).sort((a, b) => (b.count || 0) - (a.count || 0)),
    [timelinePoints],
  );
  const shownIds = useMemo(() => shown.map((point) => point.id).filter(Boolean), [shown]);
  const max = Math.max(1, ...shown.map((point) => point.count || 0));
  const globalMax = Math.max(1, ...points.map((point) => point.count || 0));
  const bars = shown.slice(0, 10);
  const colorById = useMemo(() => {
    const map = new Map();
    shown.forEach((point, index) => {
      map.set(point.id, palette[index % palette.length]);
    });
    return map;
  }, [shown]);

  useEffect(() => {
    shownRef.current = shown;
  }, [shown]);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    sliceIndexRef.current = sliceIndex;
  }, [sliceIndex]);

  useEffect(() => {
    shownRef.current = shown;
  }, [shown]);

  useEffect(() => {
    if (!selected?.province) return;
    const matched = shown.find((point) => provinceKey(point?.province || "") === provinceKey(selected.province));
    if (matched) {
      if ((matched.count || 0) !== (selected.count || 0)) setSelectedPoint(matched);
      return;
    }
    setSelected(null);
  }, [shown, selected]);

  useEffect(() => {
    if (!yearSlices.length) {
      if (sliceIndex !== -1) setSliceIndex(-1);
      return;
    }
    if (sliceIndex < 0 || sliceIndex >= yearSlices.length) {
      setSliceIndex(0);
    }
  }, [sliceIndex, yearSlices]);

  useEffect(() => {
    if (!playing || yearSlices.length <= 1) return;
    const timer = window.setInterval(() => {
      const current = sliceIndexRef.current;
      const next = current < 0 ? 0 : current + 1;
      if (next >= yearSlices.length) {
        setPlaying(false);
        return;
      }
      setSliceIndex(next);
    }, TIMELINE_SLIDE_HOLD_MS);
    return () => window.clearInterval(timer);
  }, [playing, yearSlices]);

  function pointDetail(point) {
    const years = (point.years || []).filter(Boolean);
    const minYear = years.length ? Math.min(...years) : 0;
    const maxYear = years.length ? Math.max(...years) : 0;
    const yearText = minYear && maxYear ? `；年份 ${minYear}-${maxYear}` : "";
    return `${point.city}：${point.count} 部${yearText}`;
  }

  function setSelectedPoint(point) {
    setSelected({ ...point, title: point.label, detail: pointDetail(point) });
  }

  function makeShownFilter(ids) {
    if (!ids.length) return ["==", ["get", "id"], "__none__"];
    return ["all", [">", ["to-number", ["get", "count"]], 0], ["match", ["get", "id"], ids, true, false]];
  }

  function syncPublicationLayers(map, inset, visiblePoints, visibleColors, visibleIds, sliceLabel) {
    if (!map || !inset) return false;
    const europePoints = visiblePoints
      .filter((p) => !isChinaPoint(p) && Array.isArray(p.coords) && p.coords.length >= 2)
      .map((point, index) => ({ ...point, stroke: visibleColors.get(point.id) || palette[index % palette.length] }));
    const chinaPoints = visiblePoints
      .filter((p) => isChinaPoint(p) && Array.isArray(p.coords) && p.coords.length >= 2)
      .map((point, index) => ({ ...point, stroke: visibleColors.get(point.id) || palette[index % palette.length] }));

    const pointsGeo = {
      type: "FeatureCollection",
      features: europePoints.map((point) => ({
        type: "Feature",
        id: point.id,
        properties: { id: point.id, label: point.label, city: point.city, count: point.count, detail: pointDetail(point), stroke: point.stroke },
        geometry: { type: "Point", coordinates: point.coords },
      })),
    };
    const chinaPointsGeo = {
      type: "FeatureCollection",
      features: chinaPoints.map((point) => ({
        type: "Feature",
        id: point.id,
        properties: { id: point.id, label: point.label, city: point.city, count: point.count, detail: pointDetail(point), stroke: point.stroke },
        geometry: { type: "Point", coordinates: point.coords },
      })),
    };

    try {
      let updatedMain = false;
      let updatedInset = false;
      if (map.getSource("pubPoints") && map.getLayer("pub-circles") && map.getLayer("pub-labels")) {
        map.getSource("pubPoints").setData(pointsGeo);
        map.setFilter("pub-circles", makeShownFilter(visibleIds));
        map.setFilter("pub-labels", makeShownFilter(visibleIds));
        map.setPaintProperty("pub-circles", "circle-radius", ["+", 5, ["*", ["/", ["to-number", ["get", "count"]], Math.max(1, globalMax)], 22]]);
        updatedMain = true;
      }
      if (inset.getSource("chinaPoints") && inset.getLayer("cn-circles") && inset.getLayer("cn-labels")) {
        inset.getSource("chinaPoints").setData(chinaPointsGeo);
        inset.setFilter("cn-circles", makeShownFilter(visibleIds));
        inset.setFilter("cn-labels", makeShownFilter(visibleIds));
        inset.setPaintProperty("cn-circles", "circle-radius", ["+", 4, ["*", ["/", ["to-number", ["get", "count"]], Math.max(1, globalMax)], 18]]);
        updatedInset = true;
      }
      if (!updatedMain && !updatedInset) return false;
      setSyncNote(`切片 ${sliceLabel}：欧洲 ${europePoints.length}，中国 ${chinaPoints.length}`);
      return updatedMain || updatedInset;
    } catch (error) {
      setSyncNote(`同步失败：${error?.message || "未知错误"}`);
      return false;
    }
  }

  function resetView() {
    const map = mapRef.current;
    if (map && map.isStyleLoaded()) {
      const insetPad = { top: 64, left: 64, right: 230, bottom: 190 };
      fitGermanyView(map, insetPad);
    }
    const inset = insetRef.current;
    if (inset && inset.isStyleLoaded()) {
      inset.fitBounds([[73.0, 18.0], [135.5, 54.5]], { padding: 10, duration: 0 });
    }
  }

  function isChinaPoint(point) {
    return String(point.country || "").includes("中国") || ["Peking", "Beijing", "北京", "Shanghai", "上海"].includes(point.city);
  }

  useEffect(() => {
    let canceled = false;

    async function loadBaseData() {
      const [boundary, germany, china] = await Promise.all([
        api.basemapBoundary(),
        api.basemapGermanyAdm02(),
        api.basemapProvince(),
      ]);
      if (canceled) return null;
      return { boundary, germany, china };
    }

    function makeBlankStyle(bg = "#ffffff") {
      return {
        version: 8,
        sources: {},
        layers: [{ id: "bg", type: "background", paint: { "background-color": bg } }],
      };
    }

    function initMap(container, style) {
      return new maplibregl.Map({
        container,
        style,
        attributionControl: false,
        interactive: true,
        dragRotate: false,
        pitchWithRotate: false,
      });
    }

    function addHoverCursor(map, layerId) {
      map.on("mouseenter", layerId, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", layerId, () => { map.getCanvas().style.cursor = ""; });
    }

    async function boot() {
      if (!mapContainerRef.current || !insetContainerRef.current) return;

      if (!pmtilesProtocolRegistered) {
        const protocol = new Protocol();
        maplibregl.addProtocol("pmtiles", protocol.tile);
        pmtilesProtocolRegistered = true;
      }

      const data = await loadBaseData();
      if (!data) return;

        const europePoints = shown.filter((p) => !isChinaPoint(p) && Array.isArray(p.coords) && p.coords.length >= 2);
      const pointsGeo = {
        type: "FeatureCollection",
        features: europePoints.map((p) => ({
          type: "Feature",
          id: p.id,
          geometry: { type: "Point", coordinates: p.coords },
          properties: {
            id: p.id,
            label: p.label,
            city: p.city,
            count: p.count,
            detail: pointDetail(p),
            stroke: colorById.get(p.id) || "#0b66b2",
          },
        })),
      };

      const chinaPoints = shown.filter((p) => isChinaPoint(p) && Array.isArray(p.coords) && p.coords.length >= 2);
      const chinaPointsGeo = {
        type: "FeatureCollection",
        features: chinaPoints.map((p) => ({
          type: "Feature",
          id: p.id,
          geometry: { type: "Point", coordinates: p.coords },
          properties: {
            id: p.id,
            label: p.label,
            city: p.city,
            count: p.count,
            detail: pointDetail(p),
            stroke: colorById.get(p.id) || "#f59e0b",
          },
        })),
      };

      const map = initMap(mapContainerRef.current, makeBlankStyle("#ffffff"));
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");

      const inset = initMap(insetContainerRef.current, makeBlankStyle("#ffffff"));
      insetRef.current = inset;
      inset.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

      map.on("load", () => {
        const { germany, boundary } = addGermanBasemapLayers(map, data, { germanyWidth: 1.3 });

        map.addSource("pubPoints", { type: "geojson", data: pointsGeo });
        map.addLayer({
          id: "pub-circles",
          type: "circle",
          source: "pubPoints",
          filter: makeShownFilter(shownIds),
          paint: {
            "circle-radius": ["+", 5, ["*", ["/", ["to-number", ["get", "count"]], globalMax], 22]],
            "circle-color": "#0b66b2",
            "circle-opacity": 0.14,
            "circle-stroke-color": [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              "#ef4444",
              ["get", "stroke"],
            ],
            "circle-stroke-width": ["case", ["boolean", ["feature-state", "selected"], false], 3.2, 2.2],
          },
        });
        map.addLayer({
          id: "pub-labels",
          type: "symbol",
          source: "pubPoints",
          filter: makeShownFilter(shownIds),
          layout: {
            "text-field": ["get", "label"],
            "text-size": 15,
            "text-anchor": "left",
            "text-offset": [1.1, 0],
            "text-allow-overlap": false,
            "text-ignore-placement": false,
          },
          paint: {
            "text-color": "#111827",
            "text-halo-color": "rgba(255,255,255,0.9)",
            "text-halo-width": 1.8,
          },
        });

        addHoverCursor(map, "pub-circles");
        addHoverCursor(map, "pub-labels");
        map.on("click", "pub-circles", (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const props = f.properties || {};
          if (!props.id) return;
          setSelected({ ...props, title: props.label || props.city || props.id, detail: props.detail || "" });
        });
        map.on("click", "pub-labels", (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const props = f.properties || {};
          if (!props.id) return;
          setSelected({ ...props, title: props.label || props.city || props.id, detail: props.detail || "" });
        });

        // Reserve space for the bottom-right inset so the Germany view is not covered.
        const insetPad = { top: 64, left: 64, right: 230, bottom: 190 };
        fitGermanyView(map, insetPad);
        window.requestAnimationFrame(() => {
          if (!canceled) fitGermanyView(map, insetPad);
        });
        setSourcesVersion((value) => value + 1);
      });

      inset.on("load", () => {
        inset.addSource("china", { type: "geojson", data: data.china });
        inset.addLayer({
          id: "china-fill",
          type: "fill",
          source: "china",
          paint: { "fill-color": "#f2f7fb", "fill-opacity": 0.9 },
        });
        inset.addLayer({
          id: "china-outline",
          type: "line",
          source: "china",
          paint: { "line-color": "#9bb0c5", "line-width": 1 },
        });

        inset.addSource("chinaPoints", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        inset.addLayer({
          id: "cn-circles",
          type: "circle",
          source: "chinaPoints",
          filter: makeShownFilter(shownIds),
          paint: {
            "circle-radius": ["+", 4, ["*", ["/", ["to-number", ["get", "count"]], globalMax], 18]],
            "circle-color": "#f59e0b",
            "circle-opacity": 0.16,
            "circle-stroke-color": [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              "#ef4444",
              ["get", "stroke"],
            ],
            "circle-stroke-width": ["case", ["boolean", ["feature-state", "selected"], false], 3.2, 2.2],
          },
        });
        inset.addLayer({
          id: "cn-labels",
          type: "symbol",
          source: "chinaPoints",
          filter: makeShownFilter(shownIds),
          layout: {
            "text-field": ["get", "label"],
            "text-size": 14,
            "text-anchor": "left",
            "text-offset": [1.0, 0],
            "text-allow-overlap": false,
          },
          paint: {
            "text-color": "#111827",
            "text-halo-color": "rgba(255,255,255,0.95)",
            "text-halo-width": 1.7,
          },
        });

        addHoverCursor(inset, "cn-circles");
        addHoverCursor(inset, "cn-labels");
        inset.on("click", "cn-circles", (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const props = f.properties || {};
          if (!props.id) return;
          setSelected({ ...props, title: props.label || props.city || props.id, detail: props.detail || "" });
        });
        inset.on("click", "cn-labels", (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const props = f.properties || {};
          if (!props.id) return;
          setSelected({ ...props, title: props.label || props.city || props.id, detail: props.detail || "" });
        });

        inset.fitBounds([[73.0, 18.0], [135.5, 54.5]], { padding: 10, duration: 0 });
        setSourcesVersion((value) => value + 1);
      });
    }

    boot().catch(() => {});
    return () => {
      canceled = true;
      mapRef.current?.remove();
      insetRef.current?.remove();
      mapRef.current = null;
      insetRef.current = null;
    };
  }, [chart]);

  useEffect(() => {
    const nextId = selected?.id || "";
    const prevId = selectedIdRef.current;
    selectedIdRef.current = nextId;

    const map = mapRef.current;
    const inset = insetRef.current;

    if (map && map.isStyleLoaded() && map.getSource("pubPoints")) {
      try {
        if (prevId) map.setFeatureState({ source: "pubPoints", id: prevId }, { selected: false });
        if (nextId) map.setFeatureState({ source: "pubPoints", id: nextId }, { selected: true });
      } catch {}
    }
    if (inset && inset.isStyleLoaded() && inset.getSource("chinaPoints")) {
      try {
        if (prevId) inset.setFeatureState({ source: "chinaPoints", id: prevId }, { selected: false });
        if (nextId) inset.setFeatureState({ source: "chinaPoints", id: nextId }, { selected: true });
      } catch {}
    }
  }, [selected?.id]);

  return (
    <Panel chart={chart} selected={selected} onExport={undefined} id="visual-atlas-publication-maplibre">
      <div className="atlas-map-controls">
        <label>时间切片
          <input
            type="range"
            min={yearSlices.length ? 0 : -1}
            max={Math.max(-1, yearSlices.length - 1)}
            value={sliceIndex}
            onChange={(event) => {
              setPlaying(false);
              setSliceIndex(Number(event.target.value));
            }}
            disabled={!yearSlices.length}
          />
        </label>
        <strong>{activeSlice ? activeSlice.label : (yearSlices[0] ? `${yearSlices[0].start}-${yearSlices[yearSlices.length - 1].end}` : "全部")}</strong>
        <button
          type="button"
          className={playing ? "pause" : ""}
          onClick={() => {
            if (playingRef.current) {
              setPlaying(false);
              return;
            }
            if (sliceIndexRef.current >= yearSlices.length - 1) {
              setSliceIndex(0);
            } else if (sliceIndexRef.current < 0) {
              setSliceIndex(0);
            }
            setPlaying(true);
          }}
          disabled={yearSlices.length <= 1}
        >
          {playing ? "暂停" : "播放"}
        </button>
        <button type="button" onClick={() => { setPlaying(false); setSliceIndex(-1); }}>全部时期</button>
        <button type="button" onClick={resetView}>重置视图</button>
        <span>{activeSlice ? `显示 ${activeSlice.end} 年及以前节点（切片：${activeSlice.label}，节点数：${shown.length}）` : `显示全部出版节点（节点数：${shown.length}）`}</span>
        <span>{syncNote || "等待地图同步"}</span>
      </div>
      <div className="maplibre-publication-wrap">
        <div className="maplibre-publication-map">
          <div ref={mapContainerRef} style={{ position: "absolute", inset: 0 }} />
          <div className="maplibre-publication-legend">
            <div className="legend-title">图例</div>
            <div className="legend-row">
              <span>分级圆大小</span>
              <div className="legend-circles">
                <div className="legend-circle" style={{ width: 12, height: 12, borderColor: palette[0] }} />
                <div className="legend-circle" style={{ width: 20, height: 20, borderColor: palette[1] }} />
                <div className="legend-circle" style={{ width: 28, height: 28, borderColor: palette[2] }} />
              </div>
              <span>少 → 多</span>
            </div>
          </div>
          <div className="maplibre-publication-inset">
            <div className="inset-title">中国出版节点</div>
            <div ref={insetContainerRef} style={{ position: "absolute", inset: 0 }} />
          </div>
        </div>
        <div className="maplibre-publication-ranking">
          <div className="rank-title">主要出版中心（Top 10）</div>
          <div className="rank-bars">
            {bars.map((point, index) => {
              const color = colorById.get(point.id) || palette[index % palette.length];
              const h = (Number(point.count || 0) / max) * 92;
              return (
                <div
                  key={`rank-${point.id}`}
                  className="rank-bar"
                  style={{ color }}
                  onClick={() => setSelectedPoint(point)}
                >
                  <div className="rank-num">{point.count}</div>
                  <div className="rank-rect" style={{ height: `${Math.max(8, h)}px` }} />
                  <div className="rank-label">{short(point.label, 6)}</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </Panel>
  );
}

function MapLibreWilhelmPublicationMap({ chart }) {
  const [selected, setSelected] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [sliceIndex, setSliceIndex] = useState(0);
  const [syncNote, setSyncNote] = useState("等待地图同步");
  const [mapReadyVersion, setMapReadyVersion] = useState(0);
  const mapContainerRef = useRef(null);
  const insetContainerRef = useRef(null);
  const mapRef = useRef(null);
  const insetRef = useRef(null);
  const selectedIdRef = useRef("");
  const playingRef = useRef(false);
  const sliceIndexRef = useRef(-1);
  const shownRef = useRef([]);

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  const points = chart?.points || [];
  const yearSlices = useMemo(() => buildPublicationYearSlices(points), [points]);
  const activeSlice = sliceIndex >= 0 ? yearSlices[sliceIndex] : null;

  function pointYearCounts(point) {
    if (point?.yearCounts && typeof point.yearCounts === "object") {
      return Object.entries(point.yearCounts)
        .map(([entryYear, count]) => [Number(entryYear), Number(count) || 0])
        .filter(([entryYear, count]) => entryYear && count > 0)
        .sort((a, b) => a[0] - b[0]);
    }
    return (point?.years || [])
      .map((entryYear) => Number(entryYear))
      .filter(Boolean)
      .sort((a, b) => a - b)
      .map((entryYear) => [entryYear, 1]);
  }

  const shown = useMemo(() => {
    return points
      .map((point) => {
        const entries = pointYearCounts(point);
        const visibleEntries = !activeSlice
          ? entries
          : entries.filter(([entryYear]) => entryYear <= activeSlice.cutoff);
        const visibleYears = visibleEntries.map(([entryYear]) => entryYear);
        const visibleCount = visibleEntries.reduce((sum, [, count]) => sum + count, 0);
        return { ...point, years: visibleYears, count: visibleCount };
      })
      .filter((point) => (point.count || 0) > 0)
      .sort((a, b) => (b.count || 0) - (a.count || 0));
  }, [activeSlice, points]);
  const shownIds = useMemo(() => shown.map((point) => point.id).filter(Boolean), [shown]);
  const max = Math.max(1, ...shown.map((point) => point.count || 0));
  const globalMax = Math.max(1, ...points.map((point) => point.count || 0));
  const bars = shown.slice(0, 10);
  const colorById = useMemo(() => {
    const map = new Map();
    shown.forEach((point, index) => {
      map.set(point.id, palette[index % palette.length]);
    });
    return map;
  }, [shown]);

  useEffect(() => {
    shownRef.current = shown;
  }, [shown]);

  useEffect(() => {
    sliceIndexRef.current = sliceIndex;
  }, [sliceIndex]);

  useEffect(() => {
    if (!yearSlices.length) {
      if (sliceIndex !== -1) setSliceIndex(-1);
      return;
    }
    if (sliceIndex >= yearSlices.length) setSliceIndex(yearSlices.length - 1);
  }, [sliceIndex, yearSlices]);

  useEffect(() => {
    if (!playing || yearSlices.length <= 1) return;
    const timer = window.setInterval(() => {
      const current = sliceIndexRef.current;
      const next = current < 0 ? 0 : current + 1;
      if (next >= yearSlices.length) {
        setPlaying(false);
        return;
      }
      setSliceIndex(next);
    }, TIMELINE_SLIDE_HOLD_MS);
    return () => window.clearInterval(timer);
  }, [playing, yearSlices]);

  function pointDetail(point) {
    const years = (point.years || []).filter(Boolean);
    const yearText = years.length ? `；年份 ${Math.min(...years)}-${Math.max(...years)}` : "";
    return `${point.city || "未记录"}：${point.count || 0} 部${yearText}`;
  }

  function setSelectedPoint(point) {
    setSelected({ ...point, title: point.label, detail: pointDetail(point) });
  }

  function setSelectedFeature(feature) {
    const props = feature?.properties || {};
    const matched = shownRef.current.find((point) => String(point.id) === String(props.id));
    if (matched) {
      setSelectedPoint(matched);
      return;
    }
    if (props.id) setSelected({ ...props, title: props.label || props.city || props.id, detail: props.detail || "" });
  }

  function isChinaPoint(point) {
    return String(point.country || "").includes("中国") || ["Peking", "Beijing", "北京", "Shanghai", "上海"].includes(point.city);
  }

  const selectedWorks = useMemo(() => {
    const works = Array.isArray(selected?.works) ? selected.works : [];
    const filtered = activeSlice
      ? works.filter((work) => {
          const year = Number(work?.year) || 0;
          return year > 0 && year <= activeSlice.cutoff;
        })
      : works;
    return [...filtered].sort((a, b) => (Number(a?.year) || 9999) - (Number(b?.year) || 9999));
  }, [activeSlice, selected?.works]);

  function makeShownFilter(ids) {
    if (!ids.length) return ["==", ["get", "id"], "__none__"];
    return ["all", [">", ["to-number", ["get", "count"]], 0], ["match", ["get", "id"], ids, true, false]];
  }

  function syncPublicationLayers(map, inset, visiblePoints, visibleColors, visibleIds, label) {
    if (!map || !inset) return false;
    const europePoints = visiblePoints
      .filter((point) => !isChinaPoint(point) && Array.isArray(point.coords) && point.coords.length >= 2)
      .map((point, index) => ({ ...point, stroke: visibleColors.get(point.id) || palette[index % palette.length] }));
    const chinaPoints = visiblePoints
      .filter((point) => isChinaPoint(point) && Array.isArray(point.coords) && point.coords.length >= 2)
      .map((point, index) => ({ ...point, stroke: visibleColors.get(point.id) || palette[index % palette.length] }));

    const pointsGeo = {
      type: "FeatureCollection",
      features: europePoints.map((point) => ({
        type: "Feature",
        id: point.id,
        properties: { id: point.id, label: point.label, city: point.city, count: point.count, detail: pointDetail(point), stroke: point.stroke },
        geometry: { type: "Point", coordinates: point.coords },
      })),
    };
    const chinaPointsGeo = {
      type: "FeatureCollection",
      features: chinaPoints.map((point) => ({
        type: "Feature",
        id: point.id,
        properties: { id: point.id, label: point.label, city: point.city, count: point.count, detail: pointDetail(point), stroke: point.stroke },
        geometry: { type: "Point", coordinates: point.coords },
      })),
    };

    try {
      let updatedMain = false;
      let updatedInset = false;
      if (map.isStyleLoaded() && map.getSource("pubPoints")) {
        map.getSource("pubPoints").setData(pointsGeo);
        map.setFilter("pub-circles", makeShownFilter(visibleIds));
        map.setFilter("pub-labels", makeShownFilter(visibleIds));
        map.setPaintProperty("pub-circles", "circle-radius", ["+", 5, ["*", ["/", ["to-number", ["get", "count"]], Math.max(1, globalMax)], 22]]);
        updatedMain = true;
      }
      if (inset.isStyleLoaded() && inset.getSource("chinaPoints")) {
        inset.getSource("chinaPoints").setData(chinaPointsGeo);
        inset.setFilter("cn-circles", makeShownFilter(visibleIds));
        inset.setFilter("cn-labels", makeShownFilter(visibleIds));
        inset.setPaintProperty("cn-circles", "circle-radius", ["+", 4, ["*", ["/", ["to-number", ["get", "count"]], Math.max(1, globalMax)], 18]]);
        updatedInset = true;
      }
      if (!updatedMain && !updatedInset) return false;
      setSyncNote(`${label}：欧洲 ${europePoints.length}，中国 ${chinaPoints.length}`);
      return true;
    } catch (error) {
      setSyncNote(`同步失败：${error?.message || "未知错误"}`);
      return false;
    }
  }

  function resetView() {
    const map = mapRef.current;
    if (map && map.isStyleLoaded()) {
      fitGermanyView(map, { top: 64, left: 64, right: 64, bottom: 150 });
    }
    const inset = insetRef.current;
    if (inset && inset.isStyleLoaded()) {
      const chinaPoints = shown.filter((p) => isChinaPoint(p) && Array.isArray(p.coords) && p.coords.length >= 2);
      if (chinaPoints.length) {
        let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
        chinaPoints.forEach((p) => {
          const lon = Number(p.coords[0]);
          const lat = Number(p.coords[1]);
          if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
          minLon = Math.min(minLon, lon);
          minLat = Math.min(minLat, lat);
          maxLon = Math.max(maxLon, lon);
          maxLat = Math.max(maxLat, lat);
        });
        inset.fitBounds([[minLon - 3, minLat - 2], [maxLon + 3, maxLat + 2]], { padding: 18, duration: 0 });
      } else {
        inset.fitBounds([[73.0, 18.0], [135.5, 54.5]], { padding: 10, duration: 0 });
      }
    }
  }

  useEffect(() => {
    let canceled = false;

    async function loadBaseData() {
      const [boundary, germany, china] = await Promise.all([
        api.basemapBoundary(),
        api.basemapGermanyAdm02(),
        api.basemapProvince(),
      ]);
      if (canceled) return null;
      return { boundary, germany, china };
    }

    function makeBlankStyle(bg = "#ffffff") {
      return {
        version: 8,
        sources: {},
        layers: [{ id: "bg", type: "background", paint: { "background-color": bg } }],
      };
    }

    function initMap(container, style) {
      return new maplibregl.Map({
        container,
        style,
        attributionControl: false,
        interactive: true,
        dragRotate: false,
        pitchWithRotate: false,
      });
    }

    function addHoverCursor(map, layerId) {
      map.on("mouseenter", layerId, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", layerId, () => { map.getCanvas().style.cursor = ""; });
    }

    async function boot() {
      if (!mapContainerRef.current || !insetContainerRef.current) return;

      const data = await loadBaseData();
      if (!data) return;

      const europePoints = shown.filter((p) => !isChinaPoint(p) && Array.isArray(p.coords) && p.coords.length >= 2);
      const pointsGeo = {
        type: "FeatureCollection",
        features: europePoints.map((p) => ({
          type: "Feature",
          id: p.id,
          geometry: { type: "Point", coordinates: p.coords },
          properties: {
            id: p.id,
            label: p.label,
            city: p.city,
            count: p.count,
            detail: pointDetail(p),
            stroke: colorById.get(p.id) || "#0b66b2",
          },
        })),
      };

      const chinaPoints = shown.filter((p) => isChinaPoint(p) && Array.isArray(p.coords) && p.coords.length >= 2);
      const chinaPointsGeo = {
        type: "FeatureCollection",
        features: chinaPoints.map((p) => ({
          type: "Feature",
          id: p.id,
          geometry: { type: "Point", coordinates: p.coords },
          properties: {
            id: p.id,
            label: p.label,
            city: p.city,
            count: p.count,
            detail: pointDetail(p),
            stroke: colorById.get(p.id) || "#f59e0b",
          },
        })),
      };

      const map = initMap(mapContainerRef.current, makeBlankStyle("#ffffff"));
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");

      const inset = initMap(insetContainerRef.current, makeBlankStyle("#ffffff"));
      insetRef.current = inset;
      inset.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");

      map.on("load", () => {
        const { germany, boundary } = addGermanBasemapLayers(map, data, { germanyWidth: 1.2 });

        map.addSource("pubPoints", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({
          id: "pub-circles",
          type: "circle",
          source: "pubPoints",
          filter: makeShownFilter(shownIds),
          paint: {
            "circle-radius": ["+", 5, ["*", ["/", ["to-number", ["get", "count"]], globalMax], 22]],
            "circle-color": "#0b66b2",
            "circle-opacity": 0,
            "circle-stroke-color": [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              "#ef4444",
              ["get", "stroke"],
            ],
            "circle-stroke-width": ["case", ["boolean", ["feature-state", "selected"], false], 3.2, 2.2],
          },
        });
        map.addLayer({
          id: "pub-labels",
          type: "symbol",
          source: "pubPoints",
          filter: makeShownFilter(shownIds),
          layout: {
            "text-field": ["get", "label"],
            "text-size": 15,
            "text-anchor": "left",
            "text-offset": [1.1, 0],
            "text-allow-overlap": false,
            "text-ignore-placement": false,
          },
          paint: {
            "text-color": "#111827",
            "text-halo-color": "rgba(255,255,255,0.9)",
            "text-halo-width": 1.8,
          },
        });

        addHoverCursor(map, "pub-circles");
        addHoverCursor(map, "pub-labels");
        map.on("click", "pub-circles", (e) => {
          const f = e.features?.[0];
          if (f) setSelectedFeature(f);
        });
        map.on("click", "pub-labels", (e) => {
          const f = e.features?.[0];
          if (f) setSelectedFeature(f);
        });
        map.on("click", (e) => {
          const hitBox = [
            [e.point.x - 10, e.point.y - 10],
            [e.point.x + 10, e.point.y + 10],
          ];
          const features = map.queryRenderedFeatures(hitBox, { layers: ["pub-circles", "pub-labels"] });
          if (features?.[0]) setSelectedFeature(features[0]);
        });

        const mapPad = { top: 64, left: 64, right: 64, bottom: 150 };
        fitGermanyView(map, mapPad);
        window.requestAnimationFrame(() => {
          if (!canceled) fitGermanyView(map, mapPad);
        });
        setMapReadyVersion((value) => value + 1);
        map.once("idle", () => {
          if (!canceled) setMapReadyVersion((value) => value + 1);
        });
      });

      inset.on("load", () => {
        inset.addSource("china", { type: "geojson", data: data.china });
        inset.addLayer({ id: "china-fill", type: "fill", source: "china", paint: { "fill-color": "#f2f7fb", "fill-opacity": 0.9 } });
        inset.addLayer({ id: "china-outline", type: "line", source: "china", paint: { "line-color": "#9bb0c5", "line-width": 1 } });

        inset.addSource("chinaPoints", { type: "geojson", data: chinaPointsGeo });
        inset.addLayer({
          id: "cn-circles",
          type: "circle",
          source: "chinaPoints",
          paint: {
            "circle-radius": ["+", 4, ["*", ["/", ["to-number", ["get", "count"]], globalMax], 18]],
            "circle-color": "#f59e0b",
            "circle-opacity": 0,
            "circle-stroke-color": [
              "case",
              ["boolean", ["feature-state", "selected"], false],
              "#ef4444",
              ["get", "stroke"],
            ],
            "circle-stroke-width": ["case", ["boolean", ["feature-state", "selected"], false], 3.0, 2.0],
          },
        });
        inset.addLayer({
          id: "cn-labels",
          type: "symbol",
          source: "chinaPoints",
          layout: {
            "text-field": ["get", "label"],
            "text-size": 14,
            "text-anchor": "left",
            "text-offset": [1.0, 0],
            "text-allow-overlap": false,
          },
          paint: {
            "text-color": "#111827",
            "text-halo-color": "rgba(255,255,255,0.95)",
            "text-halo-width": 1.7,
          },
        });

        addHoverCursor(inset, "cn-circles");
        addHoverCursor(inset, "cn-labels");
        inset.on("click", "cn-circles", (e) => {
          const f = e.features?.[0];
          if (f) setSelectedFeature(f);
        });
        inset.on("click", "cn-labels", (e) => {
          const f = e.features?.[0];
          if (f) setSelectedFeature(f);
        });
        inset.on("click", (e) => {
          const hitBox = [
            [e.point.x - 10, e.point.y - 10],
            [e.point.x + 10, e.point.y + 10],
          ];
          const features = inset.queryRenderedFeatures(hitBox, { layers: ["cn-circles", "cn-labels"] });
          if (features?.[0]) setSelectedFeature(features[0]);
        });

        if (chinaPoints.length) {
          let minLon = Infinity, minLat = Infinity, maxLon = -Infinity, maxLat = -Infinity;
          chinaPoints.forEach((p) => {
            const lon = Number(p.coords[0]);
            const lat = Number(p.coords[1]);
            if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
            minLon = Math.min(minLon, lon);
            minLat = Math.min(minLat, lat);
            maxLon = Math.max(maxLon, lon);
            maxLat = Math.max(maxLat, lat);
          });
          inset.fitBounds([[minLon - 3, minLat - 2], [maxLon + 3, maxLat + 2]], { padding: 18, duration: 0 });
        } else {
          inset.fitBounds([[73.0, 18.0], [135.5, 54.5]], { padding: 10, duration: 0 });
        }
        setMapReadyVersion((value) => value + 1);
        inset.once("idle", () => {
          if (!canceled) setMapReadyVersion((value) => value + 1);
        });
      });
    }

    boot().catch(() => {});
    return () => {
      canceled = true;
      mapRef.current?.remove();
      insetRef.current?.remove();
      mapRef.current = null;
      insetRef.current = null;
    };
  }, [chart]);

  useEffect(() => {
    const map = mapRef.current;
    const inset = insetRef.current;
    if (!map || !inset) return;
    const label = activeSlice ? `${activeSlice.label} 年及以前` : "全部时期";
    syncPublicationLayers(map, inset, shown, colorById, shownIds, label);
  }, [activeSlice, shown, shownIds, globalMax, colorById, mapReadyVersion]);

  useEffect(() => {
    const nextId = selected?.id || "";
    const prevId = selectedIdRef.current;
    selectedIdRef.current = nextId;

    const map = mapRef.current;
    const inset = insetRef.current;

    if (map && map.isStyleLoaded() && map.getSource("pubPoints")) {
      try {
        if (prevId) map.setFeatureState({ source: "pubPoints", id: prevId }, { selected: false });
        if (nextId) map.setFeatureState({ source: "pubPoints", id: nextId }, { selected: true });
      } catch {}
    }
    if (inset && inset.isStyleLoaded() && inset.getSource("chinaPoints")) {
      try {
        if (prevId) inset.setFeatureState({ source: "chinaPoints", id: prevId }, { selected: false });
        if (nextId) inset.setFeatureState({ source: "chinaPoints", id: nextId }, { selected: true });
      } catch {}
    }
  }, [selected?.id]);

  return (
    <Panel chart={chart} selected={null} onExport={undefined} id="visual-atlas-wilhelm-publication-maplibre">
      <div className="atlas-map-controls">
        <label>时间切片
          <input
            type="range"
            min={yearSlices.length ? 0 : -1}
            max={Math.max(-1, yearSlices.length - 1)}
            value={sliceIndex}
            onChange={(event) => {
              setPlaying(false);
              setSliceIndex(Number(event.target.value));
            }}
            disabled={!yearSlices.length}
          />
        </label>
        <strong>{activeSlice ? activeSlice.label : (yearSlices[0] ? `${yearSlices[0].start}-${yearSlices[yearSlices.length - 1].end}` : "全部")}</strong>
        <button
          type="button"
          className={playing ? "pause" : ""}
          onClick={() => {
            if (playingRef.current) {
              setPlaying(false);
              return;
            }
            if (sliceIndexRef.current >= yearSlices.length - 1) {
              setSliceIndex(0);
            } else if (sliceIndexRef.current < 0) {
              setSliceIndex(0);
            }
            setPlaying(true);
          }}
          disabled={yearSlices.length <= 1}
        >
          {playing ? "暂停" : "播放"}
        </button>
        <button type="button" onClick={() => { setPlaying(false); setSliceIndex(-1); }}>全部时期</button>
        <button type="button" onClick={resetView}>重置视图</button>
        <span>{activeSlice ? `显示 ${activeSlice.end} 年及以前节点（切片：${activeSlice.label}，节点数：${shown.length}）` : `显示全部出版节点（节点数：${shown.length}）`}</span>
        <span>{syncNote || "等待地图同步"}</span>
      </div>
      <div className="maplibre-publication-wrap">
        <div className="maplibre-publication-map">
          <div ref={mapContainerRef} style={{ position: "absolute", inset: 0 }} />
          <div className="maplibre-publication-legend">
            <div className="legend-title">图例</div>
            <div className="legend-row">
              <span>分级圆大小</span>
              <div className="legend-circles">
                <div className="legend-circle" style={{ width: 12, height: 12, borderColor: palette[0] }} />
                <div className="legend-circle" style={{ width: 20, height: 20, borderColor: palette[1] }} />
                <div className="legend-circle" style={{ width: 28, height: 28, borderColor: palette[2] }} />
              </div>
              <span>少 → 多</span>
            </div>
          </div>
          <div ref={insetContainerRef} style={{ position: "absolute", width: 1, height: 1, right: 0, bottom: 0, opacity: 0, overflow: "hidden", pointerEvents: "none" }} />
        </div>
        <div className="maplibre-publication-ranking">
            <div className="rank-title">主要出版中心（Top 10）</div>
            <div className="rank-bars">
              {bars.map((point, index) => {
                const color = colorById.get(point.id) || palette[index % palette.length];
                const h = (Number(point.count || 0) / max) * 92;
                return (
                  <div key={`rank-${point.id}`} className="rank-bar" style={{ color }} onClick={() => setSelectedPoint(point)}>
                    <div className="rank-num">{point.count}</div>
                    <div className="rank-rect" style={{ height: `${Math.max(8, h)}px` }} />
                    <div className="rank-label">{short(point.label, 6)}</div>
                  </div>
                );
              })}
            </div>
          </div>
        {selected && (
          <div className="maplibre-publication-detail rank-detail">
            <div className="detail-title">{selected.label || selected.city || "未命名地区"}</div>
            <div className="detail-subtitle">{selected.detail || ""}</div>
            <div className="detail-table-wrap">
              <table className="detail-table">
                <thead>
                  <tr>
                    <th>故事集</th>
                    <th>年份</th>
                    <th>出版社</th>
                  </tr>
                </thead>
                <tbody>
                  {selectedWorks.length ? selectedWorks.map((work, index) => (
                    <tr key={`${selected.id || selected.city}-wilhelm-work-${index}`}>
                      <td title={work.title || ""}>{work.title || "未记录"}</td>
                      <td>{work.year || "未记录"}</td>
                      <td title={work.publisher || ""}>{work.publisher || "未记录"}</td>
                    </tr>
                  )) : (
                    <tr>
                      <td colSpan="3">当前数据源未返回该地区的出版清单。</td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </Panel>
  );
}

function SourceChinaMap({ chart }) {
  return <MapLibreSourceChinaMap chart={chart} />;

  const [geo, setGeo] = useState(null);
  const [islands, setIslands] = useState(null);
  const [dash, setDash] = useState(null);
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
  }, []);

  useEffect(() => {
    let canceled = false;
    async function load() {
      try {
        const { islands: islandsData, dash: dashData } = await loadSouthChinaSeaBasemap();
        if (!canceled) setIslands(islandsData);
        if (!canceled) setDash(dashData);
      } catch {
        if (!canceled) setIslands({ features: [] });
        if (!canceled) setDash({ features: [] });
      }
    }
    load();
    return () => { canceled = true; };
  }, []);

  const features = geo?.features || [];
  const project = features.length ? makeProject(features, { x: 24, y: 32, width: 740, height: 500, pad: 6 }) : null;
  const pointMap = new Map(points.map((point, index) => [point.province, { ...point, color: regionColors[index % regionColors.length] }]));
  const islandFeatures = islands?.features || [];
  const dashFeatures = dash?.features || [];
  const islandProject = islandFeatures.length ? makeProject([...islandFeatures, ...dashFeatures].filter(Boolean), { x: 808, y: 400, width: 150, height: 150, pad: 6 }) : null;

  function sourcePointDetail(point) {
    return `${point.count} 条来源线索`;
  }
  const selectedWorks = useMemo(() => {
    const works = Array.isArray(selected?.works) ? selected.works : [];
    return works;
  }, [selected?.works]);

  return (
    <Panel chart={chart} selected={null} onExport={() => downloadSvg("故事取材来源地图.svg", svg)}>
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
          return geometryPaths(feature.geometry, project).map((path, pathIndex) => (
            <path key={`${featureIndex}-${pathIndex}`} d={path} fill={fill} opacity={opacity} stroke="#9aa9ba" strokeWidth="0.7" />
          ));
        })}
        <g>
          <rect x="792" y="384" width="176" height="176" rx="10" fill="#ffffff" stroke="#dce7f2" />
          <text className="atlas-subtitle" x="804" y="410">南海诸岛</text>
          <g>
            {islandFeatures.flatMap((feature, featureIndex) => geometryPaths(feature.geometry, islandProject).map((path, pathIndex) => (
              <path key={`islands-${featureIndex}-${pathIndex}`} d={path} fill="#f8fafc" stroke="#94a3b8" strokeWidth="0.8" />
            )))}
            {dashFeatures.flatMap((feature, featureIndex) => geometryPaths(feature.geometry, islandProject).map((path, pathIndex) => (
              <path key={`dash-${featureIndex}-${pathIndex}`} d={path} fill="none" stroke="#64748b" strokeWidth="1.2" strokeDasharray="4 3" />
            )))}
          </g>
        </g>
        {points.slice(0, 22).map((point, index) => {
          const [x, y] = project ? project(point.coords) : [0, 0];
          const r = 4 + point.count / max * 11;
          const color = regionColors[index % regionColors.length];
          const active = selected?.id === point.id;
          return (
            <g className="atlas-clickable" key={point.id} onClick={() => setSelected({ ...point, title: point.province, detail: sourcePointDetail(point) })}>
              <circle className={active ? "selected" : ""} cx={x} cy={y} r={r} fill={color} fillOpacity="0.82" stroke="#fff" strokeWidth={active ? 3 : 1.5} />
              {(active || index < 10) && <text className="atlas-map-label" x={x + r + 6} y={y + 4}>{point.province}</text>}
            </g>
          );
        })}
        <g transform="translate(774 72)">
          <text className="atlas-title" x="0" y="0">来源热点</text>
          {points.slice(0, 13).map((point, index) => (
            <g className="atlas-clickable" key={point.id} transform={`translate(0 ${30 + index * 25})`} onClick={() => setSelected({ ...point, title: point.province, detail: sourcePointDetail(point) })}>
              <circle cx="8" cy="-6" r="5" fill={regionColors[index % regionColors.length]} />
              <text className="atlas-subtitle" x="22" y="0">{point.province}</text>
              <rect x="78" y="-11" width="110" height="10" rx="3" fill="#eaf2fb" />
              <rect x="78" y="-11" width={(point.count / max) * 110} height="10" rx="3" fill={regionColors[index % regionColors.length]} />
              <text className="atlas-subtitle" x="198" y="0">{point.count}</text>
            </g>
          ))}
        </g>
      </svg>
      {selected && (
        <div className="maplibre-publication-detail rank-detail">
          <div className="detail-title">{selected.province || "未命名地区"}</div>
          <div className="detail-subtitle">{selected.detail || ""}</div>
          <div className="detail-table-wrap">
            <table className="detail-table">
              <thead>
                <tr>
                  <th>故事集</th>
                  <th>目标城市</th>
                  <th>出版社</th>
                </tr>
              </thead>
              <tbody>
                {selectedWorks.length ? selectedWorks.map((work, index) => (
                  <tr key={`${selected.id || selected.province}-source-work-${index}`}>
                    <td title={work.title || ""}>{work.title || "未记录"}</td>
                    <td>{work.city || "未记录"}</td>
                    <td title={work.publisher || ""}>{work.publisher || "未记录"}</td>
                  </tr>
                )) : (
                  <tr>
                    <td colSpan="3">当前数据源未返回该省份对应的故事集明细。</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </Panel>
  );
}

function MapLibreSourceChinaMap({ chart }) {
  const [selected, setSelected] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [sliceIndex, setSliceIndex] = useState(0);
  const [baseData, setBaseData] = useState(null);
  const [sourcesVersion, setSourcesVersion] = useState(0);
  const mapContainerRef = useRef(null);
  const mapRef = useRef(null);
  const selectedIdRef = useRef("");
  const playingRef = useRef(false);
  const sliceIndexRef = useRef(0);
  const shownRef = useRef([]);

  const points = chart?.points || [];
  const timelineEnabled = chart?.timelineMode !== "static";
  const timeRange = chart?.timeRange;
  const timelinePoints = useMemo(
    () => points.map((point) => {
      const yearCounts = {};
      (point.works || []).forEach((work) => {
        const year = Number(work?.year) || 0;
        if (year) yearCounts[year] = (yearCounts[year] || 0) + 1;
      });
      const years = Object.keys(yearCounts).map(Number).filter(Boolean).sort((a, b) => a - b);
      return {
        ...point,
        years,
        yearCounts,
        fullCount: Number(point.count) || years.length || 0,
      };
    }),
    [points],
  );
  const yearSlices = useMemo(() => buildPublicationYearSlices(timelinePoints), [timelinePoints]);
  const activeSlice = timelineEnabled && sliceIndex >= 0 ? yearSlices[sliceIndex] : null;
  const shown = useMemo(
    () => {
      return timelinePoints
        .map((point) => {
          const entries = Object.entries(point.yearCounts || {})
            .map(([year, count]) => [Number(year), Number(count) || 0])
            .filter(([year, count]) => year && count > 0)
            .sort((a, b) => a[0] - b[0]);
          if (!activeSlice) return { ...point, count: point.fullCount || point.count || 0 };
          const visibleEntries = entries.filter(([year]) => year <= activeSlice.cutoff);
          const visibleYears = visibleEntries.map(([year]) => year);
          const visibleCount = visibleEntries.reduce((sum, [, count]) => sum + count, 0);
          return { ...point, years: visibleYears, count: visibleCount };
        })
        .filter((point) => (point.count || 0) > 0)
        .sort((a, b) => (b.count || 0) - (a.count || 0));
    },
    [activeSlice, sliceIndex, timelinePoints],
  );
  const max = Math.max(1, ...shown.map((point) => point.count || 0));
  const countBreaks = useMemo(() => {
    const values = [...shown]
      .map((point) => Number(point.count) || 0)
      .filter((value) => value > 0)
      .sort((a, b) => a - b);
    if (!values.length) return [1, 2, 3];
    const pick = (ratio) => values[Math.min(values.length - 1, Math.floor((values.length - 1) * ratio))] || 1;
    const b1 = pick(0.25);
    const b2 = Math.max(b1 + 1, pick(0.5));
    const b3 = Math.max(b2 + 1, pick(0.75));
    return [b1, b2, b3];
  }, [shown]);
  const bars = useMemo(
    () => [...shown].filter((point) => (point.count || 0) > 0).sort((a, b) => (b.count || 0) - (a.count || 0)),
    [shown],
  );
  const colorByProvince = useMemo(() => {
    const map = new Map();
    shown.forEach((point, index) => {
      map.set(point.province, regionColors[index % regionColors.length]);
    });
    return map;
  }, [shown]);
  const baseProvinceData = useMemo(() => {
    if (!baseData?.province) return null;
    return {
      ...baseData.province,
      features: (baseData.province.features || []).map((feature) => {
        const rawName = feature?.properties?.["省"] || feature?.properties?.name || featureName(feature);
        const key = provinceKey(rawName);
        return {
          ...feature,
          properties: {
            ...(feature.properties || {}),
            _k: key,
            _count: 0,
            _color: "#eef3f8",
            _opacity: 1,
            _label: key,
          },
        };
      }),
    };
  }, [baseData]);
  const selectedWorks = useMemo(() => {
    const works = Array.isArray(selected?.works) ? selected.works : [];
    const filtered = activeSlice
      ? works.filter((work) => {
          const year = Number(work?.year) || 0;
          return year > 0 && year <= activeSlice.cutoff;
        })
      : works;
    return [...filtered].sort((a, b) => (Number(a?.year) || 9999) - (Number(b?.year) || 9999));
  }, [activeSlice, selected?.works]);

  function setSelectedPoint(point) {
    const years = (point.years || []).filter(Boolean);
    const yearText = years.length ? `；年份 ${Math.min(...years)}-${Math.max(...years)}` : "";
    setSelected({
      ...point,
      title: point.province,
      detail: `${point.count} 条来源线索${yearText}`,
    });
  }

  function findShownPointByProvince(province) {
    if (!province) return null;
    const key = provinceKey(province);
    return shownRef.current.find((point) => {
      const pointKey = provinceKey(point?.province || "");
      return point?.province === province || pointKey === key || pointKey.includes(key) || key.includes(pointKey);
    }) || null;
  }

  function findShownPointByFeature(feature) {
    const rawName = feature?.properties?.province || feature?.properties?.["省"] || feature?.properties?.name || featureName(feature);
    return findShownPointByProvince(rawName);
  }

  useEffect(() => {
    playingRef.current = playing;
  }, [playing]);

  useEffect(() => {
    sliceIndexRef.current = sliceIndex;
  }, [sliceIndex]);

  useEffect(() => {
    shownRef.current = shown;
  }, [shown]);

  useEffect(() => {
    if (!selected?.province) return;
    const matched = shown.find((point) => provinceKey(point?.province || "") === provinceKey(selected.province));
    if (matched) {
      if ((matched.count || 0) !== (selected.count || 0)) setSelectedPoint(matched);
      return;
    }
    setSelected(null);
  }, [shown, selected]);

  useEffect(() => {
    if (!timelineEnabled) {
      if (playing) setPlaying(false);
      return;
    }
    if (!yearSlices.length) {
      if (sliceIndex !== -1) setSliceIndex(-1);
      return;
    }
    if (sliceIndex < 0 || sliceIndex >= yearSlices.length) setSliceIndex(0);
  }, [playing, sliceIndex, timelineEnabled, yearSlices]);

  useEffect(() => {
    if (!timelineEnabled || !playing || yearSlices.length <= 1) return;
    const timer = window.setInterval(() => {
      const current = sliceIndexRef.current;
      const next = current < 0 ? 0 : current + 1;
      if (next >= yearSlices.length) {
        setPlaying(false);
        return;
      }
      setSliceIndex(next);
    }, SOURCE_TIMELINE_SLIDE_HOLD_MS);
    return () => window.clearInterval(timer);
  }, [playing, timelineEnabled, yearSlices]);

  useEffect(() => {
    let canceled = false;
    async function loadBaseData() {
      const [province, southChinaSea] = await Promise.all([
        api.basemapProvince(),
        loadSouthChinaSeaBasemap(),
      ]);
      const { islands, dash } = southChinaSea;
      if (!canceled) setBaseData({ province, islands, dash });
    }
    loadBaseData().catch(() => {
      if (!canceled) {
        setBaseData({
          province: { type: "FeatureCollection", features: [] },
          islands: { type: "FeatureCollection", features: [] },
          dash: { type: "FeatureCollection", features: [] },
        });
      }
    });
    return () => {
      canceled = true;
    };
  }, []);

  useEffect(() => {
    if (!baseData || mapRef.current || !mapContainerRef.current) return;

    function makeBlankStyle(bg = "#ffffff") {
      return {
        version: 8,
        sources: {},
        layers: [{ id: "bg", type: "background", paint: { "background-color": bg } }],
      };
    }

    function initMap(container, style) {
      return new maplibregl.Map({
        container,
        style,
        attributionControl: false,
        interactive: true,
        dragRotate: false,
        pitchWithRotate: false,
      });
    }

    function addHoverCursor(map, layerId) {
      map.on("mouseenter", layerId, () => { map.getCanvas().style.cursor = "pointer"; });
      map.on("mouseleave", layerId, () => { map.getCanvas().style.cursor = ""; });
    }

    async function boot() {
      function makeHatchImage(size = 32) {
        const data = new Uint8Array(size * size * 4);
        const lineColor = [148, 163, 184, 230];
        for (let y = 0; y < size; y += 1) {
          for (let x = 0; x < size; x += 1) {
            const idx = (y * size + x) * 4;
            data[idx] = 0;
            data[idx + 1] = 0;
            data[idx + 2] = 0;
            data[idx + 3] = 0;
          }
        }
        // Draw diagonal stripes: y = -x + c
        const spacing = 8;
        const thickness = 2;
        for (let c = -size; c <= size * 2; c += spacing) {
          for (let t = 0; t < thickness; t += 1) {
            for (let x = 0; x < size; x += 1) {
              const y = (-x + c + t);
              if (y < 0 || y >= size) continue;
              const idx = (y * size + x) * 4;
              data[idx] = lineColor[0];
              data[idx + 1] = lineColor[1];
              data[idx + 2] = lineColor[2];
              data[idx + 3] = lineColor[3];
            }
          }
        }
        return { width: size, height: size, data };
      }

      const hatchImage = makeHatchImage(32);

      const map = initMap(mapContainerRef.current, makeBlankStyle("#ffffff"));
      mapRef.current = map;
      map.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-left");

      map.on("load", () => {
        try {
          if (!map.hasImage("hatch")) {
            map.addImage("hatch", hatchImage);
          }
        } catch {
          // If the style reloads or image size mismatches, ignore; the map will fall back to solid fill.
        }
        map.addSource("province", { type: "geojson", data: baseProvinceData || { ...baseData.province, features: [] } });
        map.addLayer({
          id: "province-base-fill",
          type: "fill",
          source: "province",
          paint: {
            "fill-color": "#f8fafc",
            "fill-opacity": 0.96,
          },
        });
        map.addLayer({
          id: "province-fill-solid",
          type: "fill",
          source: "province",
          filter: [">", ["to-number", ["get", "_count"]], 0],
          paint: {
            "fill-color": [
              "step",
              ["to-number", ["get", "_count"]],
              "#eef2f7",
              countBreaks[0], "#d8dee8",
              countBreaks[1], "#b8c2cf",
              countBreaks[2], "#8b97a8",
            ],
            "fill-opacity": 0.92,
            "fill-opacity-transition": { duration: 700, delay: 0 },
            "fill-color-transition": { duration: 700, delay: 0 },
          },
        });
        map.addLayer({
          id: "province-outline",
          type: "line",
          source: "province",
          paint: {
            "line-color": "#64748b",
            "line-width": 1.15,
            "line-color-transition": { duration: 700, delay: 0 },
            "line-width-transition": { duration: 700, delay: 0 },
          },
        });
        map.addLayer({
          id: "province-outline-top",
          type: "line",
          source: "province",
          filter: [">=", ["to-number", ["get", "_count"]], countBreaks[2]],
          paint: {
            "line-color": "#ffffff",
            "line-width": 1.65,
            "line-color-transition": { duration: 700, delay: 0 },
            "line-width-transition": { duration: 700, delay: 0 },
          },
        });
        map.addLayer({
          id: "province-empty-labels",
          type: "symbol",
          source: "province",
          filter: ["all", ["==", ["to-number", ["get", "_count"]], 0], ["!=", ["get", "_label"], "娴峰崡"]],
          layout: {
            "text-field": ["get", "_label"],
            "text-size": 12.5,
            "text-anchor": "center",
            "text-allow-overlap": false,
            "text-ignore-placement": false,
          },
          paint: {
            "text-color": "rgba(15,23,42,0.72)",
            "text-halo-color": "rgba(255,255,255,0.96)",
            "text-halo-width": 1.4,
          },
        });

        map.addSource("islands", { type: "geojson", data: baseData.islands });
        map.addSource("dash", { type: "geojson", data: baseData.dash });
        map.addLayer({
          id: "islands-fill",
          type: "fill",
          source: "islands",
          paint: { "fill-color": "#f8fafc", "fill-opacity": 1 },
        });
        map.addLayer({
          id: "islands-outline",
          type: "line",
          source: "islands",
          paint: { "line-color": "#94a3b8", "line-width": 1 },
        });
        map.addLayer({
          id: "dash-line",
          type: "line",
          source: "dash",
          paint: { "line-color": "#64748b", "line-width": 1.6, "line-dasharray": [2, 2] },
        });

        map.addSource("sourcePoints", { type: "geojson", data: { type: "FeatureCollection", features: [] } });
        map.addLayer({
          id: "source-hit-area",
          type: "circle",
          source: "sourcePoints",
          paint: {
            "circle-radius": [
              "step",
              ["to-number", ["get", "count"]],
              14,
              countBreaks[0], 18,
              countBreaks[1], 22,
              countBreaks[2], 26,
            ],
            "circle-color": "#ffffff",
            "circle-opacity": 0.01,
            "circle-stroke-width": 0,
          },
        });
        map.addLayer({
          id: "source-circles",
          type: "circle",
          source: "sourcePoints",
          paint: {
            "circle-radius": [
              "step",
              ["to-number", ["get", "count"]],
              7,
              countBreaks[0], 10,
              countBreaks[1], 14,
              countBreaks[2], 18,
            ],
            "circle-color": [
              "step",
              ["to-number", ["get", "count"]],
              "#ffffff",
              countBreaks[0], "#ffffff",
              countBreaks[1], "#ffffff",
              countBreaks[2], "#ffffff",
            ],
            "circle-opacity": 0,
            "circle-stroke-color": ["get", "stroke"],
            "circle-stroke-width": ["case", ["boolean", ["feature-state", "selected"], false], 4, 2.4],
            "circle-radius-transition": { duration: 700, delay: 0 },
            "circle-stroke-color-transition": { duration: 700, delay: 0 },
          },
        });
        map.addLayer({
          id: "source-labels",
          type: "symbol",
          source: "sourcePoints",
          layout: {
            "text-field": ["get", "province"],
            "text-size": 14.5,
            "text-variable-anchor": ["right", "left", "top", "bottom", "top-right", "bottom-right", "top-left", "bottom-left"],
            "text-radial-offset": 0.9,
            "text-justify": "auto",
            "text-padding": 3,
            "text-max-width": 6,
            "text-allow-overlap": false,
            "text-ignore-placement": false,
          },
          paint: {
            "text-color": "#111827",
            "text-halo-color": "rgba(255,255,255,0.95)",
            "text-halo-width": 1.8,
          },
        });

        addHoverCursor(map, "province-fill-solid");
        addHoverCursor(map, "source-hit-area");
        addHoverCursor(map, "source-circles");
        addHoverCursor(map, "source-labels");

        map.on("click", "province-fill-solid", (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const matched = findShownPointByFeature(f);
          if (matched) setSelectedPoint(matched);
        });
        map.on("click", "source-hit-area", (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const matched = findShownPointByFeature(f);
          if (matched) setSelectedPoint(matched);
        });
        map.on("click", "source-circles", (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const matched = findShownPointByFeature(f);
          if (matched) setSelectedPoint(matched);
        });
        map.on("click", "source-labels", (e) => {
          const f = e.features?.[0];
          if (!f) return;
          const matched = findShownPointByFeature(f);
          if (matched) setSelectedPoint(matched);
        });

        map.fitBounds([[73.0, 18.0], [135.5, 54.5]], { padding: { top: 36, bottom: 12, left: 12, right: 12 }, duration: 0 });

        // Render the first available time slice immediately after map load
        // so the initial frame does not flash an empty basemap.
        const initialShown = shown?.length ? shown : (shownRef.current || []);
        const initialPointMap = new Map(initialShown.map((point, index) => [point.province, { ...point, color: regionColors[index % regionColors.length] }]));
        const initialPointsByKey = new Map(initialShown.map((point) => [provinceKey(point.province), point]));
        const initialProvince = {
          ...baseData.province,
          features: (baseData.province?.features || []).map((feature) => {
            const rawName = feature?.properties?.["省"] || feature?.properties?.name || featureName(feature);
            const key = provinceKey(rawName);
            const matched = initialPointsByKey.get(key);
            const color = matched ? (initialPointMap.get(matched.province)?.color || "#eef3f8") : "#eef3f8";
            const count = matched?.count || 0;
            const opacity = count ? 0.2 + count / Math.max(1, max) * 0.42 : 1;
            return {
              ...feature,
              properties: {
                ...(feature.properties || {}),
                _k: key,
                _count: count,
                _color: color,
                _opacity: opacity,
                _label: key,
              },
            };
          }),
        };
        const initialPointGeo = {
          type: "FeatureCollection",
          features: initialShown.map((p) => ({
            type: "Feature",
            id: p.id,
            geometry: { type: "Point", coordinates: p.coords || [0, 0] },
            properties: {
              id: p.id,
              province: p.province,
              count: p.count || 0,
              stroke: initialPointMap.get(p.province)?.color || regionColors[0],
            },
          })),
        };
        try {
          map.getSource("province").setData(initialProvince);
          map.getSource("sourcePoints").setData(initialPointGeo);
        } catch {}
        setSourcesVersion((version) => version + 1);
      });
    }

    boot().catch(() => {});
    return () => {
      mapRef.current?.remove();
      mapRef.current = null;
    };
  }, [baseData]);

  useEffect(() => {
    const nextId = selected?.id || "";
    const prevId = selectedIdRef.current;
    selectedIdRef.current = nextId;
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !map.getSource("sourcePoints")) return;
    try {
      if (prevId) map.setFeatureState({ source: "sourcePoints", id: prevId }, { selected: false });
      if (nextId) map.setFeatureState({ source: "sourcePoints", id: nextId }, { selected: true });
    } catch {}
  }, [selected?.id]);

  useEffect(() => {
    if (!baseData) return;
    const map = mapRef.current;
    if (!map || !map.isStyleLoaded() || !map.getSource("province") || !map.getSource("sourcePoints")) return;

    const pointMap = new Map(shown.map((point, index) => [point.province, { ...point, color: regionColors[index % regionColors.length] }]));
    const pointsByKey = new Map(shown.map((point) => [provinceKey(point.province), point]));
    const paintedProvince = {
      ...baseData.province,
      features: (baseData.province?.features || []).map((feature) => {
        const rawName = feature?.properties?.["省"] || feature?.properties?.name || featureName(feature);
        const key = provinceKey(rawName);
        const matched = pointsByKey.get(key);
        const color = matched ? (pointMap.get(matched.province)?.color || "#eef3f8") : "#eef3f8";
        const count = matched?.count || 0;
        const opacity = count ? 0.2 + count / max * 0.42 : 1;
        return {
          ...feature,
          properties: {
            ...(feature.properties || {}),
            _k: key,
            _count: count,
            _color: color,
            _opacity: opacity,
            _label: key,
          },
        };
      }),
    };
    const pointGeo = {
      type: "FeatureCollection",
      features: shown.map((p) => ({
        type: "Feature",
        id: p.id,
        geometry: { type: "Point", coordinates: p.coords || [0, 0] },
        properties: {
          id: p.id,
          province: p.province,
          count: p.count || 0,
          stroke: pointMap.get(p.province)?.color || regionColors[0],
        },
      })),
    };

    try {
      map.getSource("province").setData(paintedProvince);
      map.getSource("sourcePoints").setData(pointGeo);
      map.setPaintProperty("province-fill-solid", "fill-color", [
        "step",
        ["to-number", ["get", "_count"]],
        "#eef2f7",
        countBreaks[0], "#d8dee8",
        countBreaks[1], "#b8c2cf",
        countBreaks[2], "#8b97a8",
      ]);
      map.setPaintProperty("province-fill-solid", "fill-opacity", 0.92);
      map.setPaintProperty("province-outline", "line-color", "#64748b");
      map.setPaintProperty("province-outline", "line-width", 1.15);
      map.setFilter("province-outline-top", [">=", ["to-number", ["get", "_count"]], countBreaks[2]]);
      map.setPaintProperty("province-outline-top", "line-color", "#ffffff");
      map.setPaintProperty("province-outline-top", "line-width", 1.65);
      map.setPaintProperty("source-circles", "circle-radius", [
        "step",
        ["to-number", ["get", "count"]],
        7,
        countBreaks[0], 10,
        countBreaks[1], 14,
        countBreaks[2], 18,
      ]);
    } catch {}
  }, [baseData, countBreaks, max, shown, sourcesVersion]);

  const sliderValue = Math.max(-1, sliceIndex);

  return (
    <Panel chart={chart} selected={null} onExport={undefined} id="visual-atlas-source-maplibre">
      <div className="atlas-map-controls">
        {timelineEnabled ? (
          <>
            <label>时间切片
              <input
                type="range"
                min={yearSlices.length ? 0 : -1}
                max={Math.max(-1, yearSlices.length - 1)}
                value={sliderValue}
                onChange={(event) => {
                  setPlaying(false);
                  setSliceIndex(Number(event.target.value));
                }}
                disabled={!yearSlices.length}
              />
            </label>
            <strong>{activeSlice ? activeSlice.label : (yearSlices[0] ? `${yearSlices[0].start}-${yearSlices[yearSlices.length - 1].end}` : "全部")}</strong>
            <button
              type="button"
              className={playing ? "pause" : ""}
              onClick={() => {
                if (playingRef.current) {
                  setPlaying(false);
                  return;
                }
                if (sliceIndexRef.current >= yearSlices.length - 1 || sliceIndexRef.current < 0) setSliceIndex(0);
                setPlaying(true);
              }}
              disabled={yearSlices.length <= 1}
            >
              {playing ? "暂停" : "播放"}
            </button>
            <button type="button" onClick={() => { setPlaying(false); setSliceIndex(-1); }}>全部时期</button>
          </>
        ) : (
          <strong>{timeRange?.label || (yearSlices[0] ? `${yearSlices[0].start}-${yearSlices[yearSlices.length - 1].end}` : "全部时期")}</strong>
        )}
        <span>
          {timelineEnabled
            ? (activeSlice ? `显示 ${activeSlice.end} 年及以前省份（节点数：${shown.length}）` : `显示全部时期省份（节点数：${shown.length}）`)
            : `显示${timeRange?.label ? `“${timeRange.label}”` : "当前阶段"}来源省份（节点数：${shown.length}）`}
        </span>
      </div>
      <div className="maplibre-publication-wrap">
        <div className="maplibre-source-map">
          <div ref={mapContainerRef} style={{ position: "absolute", inset: 0 }} />
          <div className="maplibre-source-legend">
            <div className="legend-title">图例</div>
            <div className="legend-row">
              <span>分级设色</span>
              <div className="legend-swatch" />
              <span>小 → 大</span>
            </div>
            <div className="legend-row">
              <span>无来源线索</span>
              <div className="legend-hatch" />
              <span />
            </div>
            <div className="legend-row">
              <span>分级圆大小</span>
              <div className="legend-circles">
                <div className="legend-circle" style={{ width: 12, height: 12, borderColor: regionColors[0] }} />
                <div className="legend-circle" style={{ width: 20, height: 20, borderColor: regionColors[1] }} />
                <div className="legend-circle" style={{ width: 28, height: 28, borderColor: regionColors[2] }} />
              </div>
              <span>小 → 大</span>
            </div>
          </div>
        </div>
        <div className="maplibre-publication-ranking maplibre-source-ranking-vert">
          <div className="rank-title">来源省份排名</div>
          <div className="rank-bars">
            {bars.map((point, index) => {
              const color = colorByProvince.get(point.province) || regionColors[index % regionColors.length];
              const h = (Number(point.count || 0) / max) * 92;
              return (
                <div
                  key={`rank-source-${point.province}`}
                  className="rank-bar"
                  style={{ color }}
                  onClick={() => setSelectedPoint(point)}
                  title={`${point.province}：${point.count}`}
                >
                  <div className="rank-num">{point.count}</div>
                  <div className="rank-rect" style={{ height: `${Math.max(8, h)}px`, background: color, border: "none" }} />
                  <div className="rank-label">{short(point.province, 4)}</div>
                </div>
              );
            })}
          </div>
          {selected && (
            <div className="maplibre-publication-detail rank-detail">
              <div className="detail-title">{selected.province || "未命名地区"}</div>
              <div className="detail-subtitle">{selected.detail || ""}</div>
              <div className="detail-table-wrap">
                <table className="detail-table">
                  <thead>
                    <tr>
                      <th>故事集</th>
                      <th>年份</th>
                      <th>目的地国家</th>
                      <th>出版社</th>
                    </tr>
                  </thead>
                  <tbody>
                    {selectedWorks.length ? selectedWorks.map((work, index) => (
                      <tr key={`${selected.id || selected.province}-source-rank-work-${index}`}>
                        <td title={work.title || ""}>{work.title || "未记录"}</td>
                        <td>{work.year || "未记录"}</td>
                        <td>{work.country || "未记录"}</td>
                        <td title={work.publisher || ""}>{work.publisher || "未记录"}</td>
                      </tr>
                    )) : (
                      <tr>
                        <td colSpan="4">当前时间切片下未返回该省份对应的故事集明细。</td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>
      </div>
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
  const clouds = chart?.wordClouds?.length ? chart.wordClouds : [{ id: "all", label: "总词频", words: chart?.words || [] }];
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

export {
  IdentityProcessChart,
  IdentityRiverChart,
  PublicationBubbleMap,
  SourceChinaMap,
  PrefaceThemeCluster,
  PrefaceWordCloud,
  ChildThemeCooccurrence,
};

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

