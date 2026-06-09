import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api.js";

const WIDTH = 1200;
const HEIGHT = 560;
const PANEL_GAP = 30;
const HEADER_H = 34;
const MAP_Y = HEADER_H + 18;
const MAP_H = HEIGHT - MAP_Y - 18;
const FRAME_RX = 14;
const LEFT_W = Math.round((WIDTH - PANEL_GAP * 3) * 0.42);
const RIGHT_W = (WIDTH - PANEL_GAP * 3) - LEFT_W;
const LEFT_X = PANEL_GAP;
const RIGHT_X = LEFT_X + LEFT_W + PANEL_GAP;

const CN_BOUNDS = { minLon: 73, maxLon: 135, minLat: 18, maxLat: 54 };
const DEFAULT_OVERSEAS_BOUNDS = { minLon: -25, maxLon: 40, minLat: 25, maxLat: 72 };
const FRAME_PAD = 6;
const PLACEHOLDER_TARGET_COORDS = [10.45, 51.16];

function rawMercator(point) {
  const lon = Number(point?.[0] || 0) * Math.PI / 180;
  const lat = Math.max(-85, Math.min(85, Number(point?.[1] || 0))) * Math.PI / 180;
  return [lon, Math.log(Math.tan(Math.PI / 4 + lat / 2))];
}

const FALLBACK_CITY_COORDS = {
  北京: [116.4, 39.9],
  上海: [121.47, 31.23],
  柏林: [13.405, 52.52],
  慕尼黑: [11.582, 48.1351],
  耶拿: [11.5892, 50.9271],
  莱比锡: [12.3731, 51.3397],
  汉堡: [9.9937, 53.5511],
  布拉格: [14.4378, 50.0755],
  berlin: [13.405, 52.52],
  jena: [11.5892, 50.9271],
  leipzig: [12.3731, 51.3397],
  stuttgart: [9.1829, 48.7758],
  hamburg: [9.9937, 53.5511],
  munich: [11.582, 48.1351],
  münchen: [11.582, 48.1351],
  muenchen: [11.582, 48.1351],
  frankfurt: [8.6821, 50.1109],
  "frankfurt am main": [8.6821, 50.1109],
  cologne: [6.9603, 50.9375],
  köln: [6.9603, 50.9375],
  koeln: [6.9603, 50.9375],
  düsseldorf: [6.7735, 51.2277],
  duesseldorf: [6.7735, 51.2277],
  dusseldorf: [6.7735, 51.2277],
  esslingen: [9.3103, 48.7428],
  bickenbach: [8.6106, 49.7595],
  norderstedt: [9.9791, 53.7088],
  "sankt augustin": [7.1902, 50.7754],
  "st. augustin": [7.1902, 50.7754],
  eisenach: [10.3157, 50.9795],
  kassel: [9.4797, 51.3127],
  freiburg: [7.8421, 47.999],
  bayreuth: [11.5783, 49.9456],
  meerbusch: [6.6897, 51.2529],
  augsburg: [10.8978, 48.3705],
  bielefeld: [8.5325, 52.0302],
  kreuzlingen: [9.175, 47.65],
  schiedlberg: [14.0546, 48.111],
  basel: [7.5886, 47.5596],
  zurich: [8.5417, 47.3769],
  zürich: [8.5417, 47.3769],
  vienna: [16.3738, 48.2082],
  wien: [16.3738, 48.2082],
  prag: [14.4378, 50.0755],
  prague: [14.4378, 50.0755],
  london: [-0.1276, 51.5072],
  cambridge: [0.1218, 52.2053],
  paris: [2.3522, 48.8566],
  lyon: [4.8357, 45.764],
  rome: [12.4964, 41.9028],
  madrid: [-3.7038, 40.4168],
};

function collectLonLat(geometry, out = []) {
  if (!geometry) return out;
  if (geometry.type === "Polygon") geometry.coordinates?.flat()?.forEach((p) => out.push(p));
  if (geometry.type === "MultiPolygon") geometry.coordinates?.flat(2)?.forEach((p) => out.push(p));
  if (geometry.type === "LineString") geometry.coordinates?.forEach((p) => out.push(p));
  if (geometry.type === "MultiLineString") geometry.coordinates?.flat()?.forEach((p) => out.push(p));
  return out;
}

function lonLatBoundsFromPoints(points) {
  let minLon = Infinity;
  let maxLon = -Infinity;
  let minLat = Infinity;
  let maxLat = -Infinity;
  points.forEach((point) => {
    const lon = Number(point?.[0]);
    const lat = Number(point?.[1]);
    if (!Number.isFinite(lon) || !Number.isFinite(lat)) return;
    minLon = Math.min(minLon, lon);
    maxLon = Math.max(maxLon, lon);
    minLat = Math.min(minLat, lat);
    maxLat = Math.max(maxLat, lat);
  });
  if (!Number.isFinite(minLon) || !Number.isFinite(maxLon) || !Number.isFinite(minLat) || !Number.isFinite(maxLat)) return null;
  return { minLon, maxLon, minLat, maxLat };
}

function expandBounds(bounds, padDeg = 6, minSpanDeg = 10) {
  if (!bounds) return null;
  const lonSpan = Math.max(minSpanDeg, bounds.maxLon - bounds.minLon);
  const latSpan = Math.max(minSpanDeg, bounds.maxLat - bounds.minLat);
  const lonPad = Math.max(padDeg, (lonSpan * 0.18));
  const latPad = Math.max(padDeg, (latSpan * 0.18));
  const centerLon = (bounds.minLon + bounds.maxLon) / 2;
  const centerLat = (bounds.minLat + bounds.maxLat) / 2;
  const halfLon = lonSpan / 2 + lonPad;
  const halfLat = latSpan / 2 + latPad;
  return {
    minLon: Math.max(-180, centerLon - halfLon),
    maxLon: Math.min(180, centerLon + halfLon),
    minLat: Math.max(-80, centerLat - halfLat),
    maxLat: Math.min(80, centerLat + halfLat),
  };
}

function geometryBounds(geometry) {
  const pts = collectLonLat(geometry, []);
  return lonLatBoundsFromPoints(pts);
}

function boundsOverlap(a, b) {
  if (!a || !b) return false;
  return !(a.maxLon < b.minLon || a.minLon > b.maxLon || a.maxLat < b.minLat || a.minLat > b.maxLat);
}

function ringPath(ring, project) {
  return ring.map((point, index) => {
    const [x, y] = project(point);
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ") + " Z";
}

function linePath(line, project) {
  return line.map((point, index) => {
    const [x, y] = project(point);
    return `${index === 0 ? "M" : "L"}${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");
}

function geometryPaths(geometry, project) {
  if (!geometry) return [];
  if (geometry.type === "Polygon") return (geometry.coordinates || []).map((ring) => ringPath(ring, project));
  if (geometry.type === "MultiPolygon") return (geometry.coordinates || []).flatMap((polygon) => (polygon || []).map((ring) => ringPath(ring, project)));
  if (geometry.type === "LineString") return [linePath(geometry.coordinates || [], project)];
  if (geometry.type === "MultiLineString") return (geometry.coordinates || []).map((line) => linePath(line || [], project));
  return [];
}

function makeProjectFromLonLatBounds(bounds, viewport) {
  const a = rawMercator([bounds.minLon, bounds.minLat]);
  const b = rawMercator([bounds.maxLon, bounds.maxLat]);
  const minX = Math.min(a[0], b[0]);
  const maxX = Math.max(a[0], b[0]);
  const minY = Math.min(a[1], b[1]);
  const maxY = Math.max(a[1], b[1]);
  const pad = viewport.pad ?? 0;
  const sx = (viewport.width - pad * 2) / Math.max(1e-9, (maxX - minX));
  const sy = (viewport.height - pad * 2) / Math.max(1e-9, (maxY - minY));
  const scale = Math.min(sx, sy);
  const mapW = (maxX - minX) * scale;
  const mapH = (maxY - minY) * scale;
  const ox = viewport.x + (viewport.width - mapW) / 2;
  const oy = viewport.y + (viewport.height - mapH) / 2;
  return (point) => {
    const [x, y] = rawMercator(point);
    return [ox + (x - minX) * scale, oy + (maxY - y) * scale];
  };
}

function normalizeCityLabel(text) {
  return String(text || "").replace(/\s+/g, " ").trim();
}

function cityNameFromFlow(flow) {
  const raw = String(flow?.toLabel || flow?.city || flow?.toCity || flow?.targetCity || "");
  const parts = raw.split("·").map((s) => s.trim()).filter(Boolean);
  return normalizeCityLabel(parts[0] || raw);
}

function validCoords(coords) {
  return Array.isArray(coords)
    && coords.length >= 2
    && Number.isFinite(Number(coords[0]))
    && Number.isFinite(Number(coords[1]));
}

function cityKey(text) {
  return normalizeCityLabel(text)
    .replace(/\bu\.a\.?/gi, "")
    .replace(/\bet al\.?\b/gi, "")
    .replace(/\.+$/g, "")
    .trim()
    .toLowerCase();
}

function isPlaceholderCoords(coords) {
  if (!validCoords(coords)) return false;
  return Math.abs(Number(coords[0]) - PLACEHOLDER_TARGET_COORDS[0]) < 0.001
    && Math.abs(Number(coords[1]) - PLACEHOLDER_TARGET_COORDS[1]) < 0.001;
}

function averageCoords(coordsList) {
  const valid = coordsList.filter(validCoords);
  if (!valid.length) return null;
  const sum = valid.reduce((acc, coords) => [acc[0] + Number(coords[0]), acc[1] + Number(coords[1])], [0, 0]);
  return [sum[0] / valid.length, sum[1] / valid.length];
}

function lookupCityCoords(label, cityLookup) {
  const key = cityKey(label);
  if (!key) return null;
  const fallback = FALLBACK_CITY_COORDS[key];
  if (validCoords(fallback)) return fallback;
  const coords = cityLookup?.get(key) || cityLookup?.get(`${key} germany`);
  return validCoords(coords) ? coords : null;
}

function coordsFromCityLabel(label, cityLookup) {
  const exact = lookupCityCoords(label, cityLookup);
  if (exact) return exact;
  const parts = String(label || "")
    .replace(/\bu\.a\.?/gi, "")
    .split(/\s*(?:\/|,|;|&|\+|\bund\b|\band\b)\s*/i)
    .map((part) => part.trim())
    .filter(Boolean);
  const coords = parts.map((part) => lookupCityCoords(part, cityLookup)).filter(Boolean);
  return coords.length ? averageCoords(coords) : null;
}

function normalizeLabel(text) {
  return String(text || "")
    .replace(/[（(].*?[）)]/g, "")
    .replace(/[·•]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function countBy(items, keyFn) {
  const map = new Map();
  items.forEach((item) => {
    const key = keyFn(item);
    if (!key) return;
    map.set(key, (map.get(key) || 0) + 1);
  });
  return map;
}

export default function SplitFlowMap({ flows = [], selectedId = "", onSelect, title = "传播路径图（源地—目的地）", timeline = false }) {
  const [china, setChina] = useState(null);
  const [world, setWorld] = useState(null);
  const [cityLookup, setCityLookup] = useState(null);
  const [basemapError, setBasemapError] = useState({ cn: "", de: "", city: "" });
  const [timelineIndex, setTimelineIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [pickedId, setPickedId] = useState("");

  const years = useMemo(() => [...new Set(flows.map((flow) => Number(flow.year)).filter(Boolean))].sort((a, b) => a - b), [flows]);
  const currentYear = years[Math.min(timelineIndex, Math.max(0, years.length - 1))] || "";
  const visibleFlows = useMemo(() => (
    timeline && currentYear ? flows.filter((flow) => Number(flow.year) <= currentYear) : flows
  ), [currentYear, flows, timeline]);
  const effectiveSelectedId = selectedId || pickedId;
  const activeFlows = effectiveSelectedId ? visibleFlows.filter((flow) => flow.id === effectiveSelectedId) : visibleFlows;

  const cityCounts = useMemo(() => countBy(activeFlows, cityNameFromFlow), [activeFlows]);
  const maxCity = Math.max(1, ...cityCounts.values());

  const cnProject = useMemo(() => makeProjectFromLonLatBounds(
    CN_BOUNDS,
    { x: LEFT_X, y: MAP_Y, width: LEFT_W, height: MAP_H, pad: 18 },
  ), []);

  function cityCoordsForFlow(flow) {
    const name = cityNameFromFlow(flow);
    const labelCoords = coordsFromCityLabel(name, cityLookup);
    if (validCoords(labelCoords)) return labelCoords;
    if (validCoords(flow.to) && !isPlaceholderCoords(flow.to)) return flow.to;
    return null;
  }

  const overseasBounds = useMemo(() => {
    const points = activeFlows.map((flow) => cityCoordsForFlow(flow)).filter(Boolean);
    const bounds = lonLatBoundsFromPoints(points);
    return expandBounds(bounds, 8, 18);
  }, [activeFlows, cityLookup]);

  const deProject = useMemo(() => {
    const bounds = overseasBounds || DEFAULT_OVERSEAS_BOUNDS;
    return makeProjectFromLonLatBounds(bounds, { x: RIGHT_X, y: MAP_Y, width: RIGHT_W, height: MAP_H, pad: 18 });
  }, [overseasBounds]);

  useEffect(() => {
    if (!playing || years.length < 2) return undefined;
    const timer = window.setInterval(() => {
      setTimelineIndex((idx) => (idx + 1 > years.length - 1 ? 0 : idx + 1));
    }, 900);
    return () => window.clearInterval(timer);
  }, [playing, years.length]);

  useEffect(() => {
    let canceled = false;
    async function load() {
      setBasemapError({ cn: "", de: "", city: "" });
      try {
        const [worldData, cnData, cityData] = await Promise.all([
          api.basemapLand(),
          api.basemapProvince(),
          api.basemapWorldCities(),
        ]);

        const nextError = { cn: "", de: "", city: "" };
        if (canceled) return;

        const map = new Map();
        (cityData?.features || []).forEach((feature) => {
          const name = normalizeCityLabel(feature?.properties?.CITY_NAME || feature?.properties?.name || "");
          const admin = normalizeCityLabel(feature?.properties?.ADMIN_NAME || "");
          const coords = feature?.geometry?.coordinates;
          if (!name || !Array.isArray(coords) || coords.length < 2) return;
          map.set(name.toLowerCase(), coords);
          if (admin) map.set(`${name} ${admin}`.toLowerCase(), coords);
        });

        setWorld(worldData);
        setChina(cnData);
        setCityLookup(map);
        setBasemapError(nextError);
      } catch (error) {
        if (canceled) return;
        console.error("SplitFlowMap basemap load failed:", error);
        setWorld({ type: "FeatureCollection", features: [] });
        setChina({ type: "FeatureCollection", features: [] });
        setCityLookup(new Map());
        setBasemapError({ cn: "省级底图加载失败", de: "目的地底图加载失败", city: "城市点加载失败" });
      }
    }
    load();
    return () => { canceled = true; };
  }, []);

  function togglePlay() {
    if (!years.length) return;
    setPlaying((value) => {
      if (!value && timelineIndex >= years.length - 1) setTimelineIndex(0);
      return !value;
    });
  }

  function pick(flowId) {
    if (!flowId) return;
    setPlaying(false);
    setPickedId((current) => (current === flowId ? "" : flowId));
    onSelect?.(flowId);
  }

  const cnFeatures = china?.features || [];
  const countries = world?.features || [];
  const deFeatures = useMemo(() => {
    if (!countries.length) return [];
    if (!overseasBounds) return countries;
    return countries.filter((feature) => boundsOverlap(geometryBounds(feature.geometry), overseasBounds));
  }, [countries, overseasBounds]);

  const uniqueCities = useMemo(() => {
    const map = new Map();
    activeFlows.forEach((flow) => {
      const label = cityNameFromFlow(flow);
      const coords = cityCoordsForFlow(flow);
      if (!label || !Array.isArray(coords) || coords.length < 2) return;
      map.set(label, { label, coords, count: cityCounts.get(label) || 1 });
    });
    return [...map.values()].sort((a, b) => b.count - a.count);
  }, [activeFlows, cityCounts, cityLookup]);

  return (
    <div className="work-panel china-map-panel wilhelm-split-map">
      <div className="visual-heading map-heading">
        <div>
          <strong>{title}</strong>
          <span>{activeFlows.length} 条路径 · {timeline ? `时间至 ${currentYear || "全部"}` : "全部"}</span>
        </div>
        {timeline && (
          <div className="china-map-timeline-controls">
            <button type="button" onClick={togglePlay}>{playing ? "暂停" : "播放"}</button>
            <input
              type="range"
              min="0"
              max={Math.max(0, years.length - 1)}
              value={Math.min(timelineIndex, Math.max(0, years.length - 1))}
              onChange={(event) => { setPlaying(false); setTimelineIndex(Number(event.target.value)); }}
            />
            <strong>{currentYear || "全部"}</strong>
          </div>
        )}
      </div>

      <div className="china-map-frame">
        <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} className="china-map-svg" role="img" aria-label={title}>
          <defs>
            <clipPath id="splitCnClip">
              <rect x={LEFT_X - FRAME_PAD} y={MAP_Y - FRAME_PAD} width={LEFT_W + FRAME_PAD * 2} height={MAP_H + FRAME_PAD * 2} rx={FRAME_RX} />
            </clipPath>
            <clipPath id="splitDeClip">
              <rect x={RIGHT_X - FRAME_PAD} y={MAP_Y - FRAME_PAD} width={RIGHT_W + FRAME_PAD * 2} height={MAP_H + FRAME_PAD * 2} rx={FRAME_RX} />
            </clipPath>
            <marker
              id="splitArrow"
              markerWidth="10"
              markerHeight="10"
              refX="9"
              refY="5"
              orient="auto"
              markerUnits="strokeWidth"
            >
              <path d="M0,0 L10,5 L0,10 Z" fill="rgba(14,165,233,0.85)" />
            </marker>
          </defs>

          <rect width={WIDTH} height={HEIGHT} fill="#ffffff" />
          <text x={LEFT_X} y={24} fontSize="18" fontWeight="900" fill="#111827">中国</text>
          <text x={RIGHT_X} y={24} fontSize="18" fontWeight="900" fill="#111827">海外出版城市</text>

          <rect x={LEFT_X - FRAME_PAD} y={MAP_Y - FRAME_PAD} width={LEFT_W + FRAME_PAD * 2} height={MAP_H + FRAME_PAD * 2} rx={FRAME_RX} fill="#ffffff" stroke="#dce7f2" />
          <rect x={RIGHT_X - FRAME_PAD} y={MAP_Y - FRAME_PAD} width={RIGHT_W + FRAME_PAD * 2} height={MAP_H + FRAME_PAD * 2} rx={FRAME_RX} fill="#ffffff" stroke="#dce7f2" />

          <g clipPath="url(#splitCnClip)">
            {cnFeatures.flatMap((feature, fi) => geometryPaths(feature.geometry, cnProject).map((d, pi) => (
              <path key={`cn-fill-${fi}-${pi}`} d={d} fill="#f8fbff" stroke="none" />
            )))}
            {cnFeatures.flatMap((feature, fi) => geometryPaths(feature.geometry, cnProject).map((d, pi) => (
              <path key={`cn-outline-${fi}-${pi}`} d={d} fill="none" stroke="#9bb0c5" strokeWidth="1" />
            )))}
            {activeFlows.slice(0, effectiveSelectedId ? 1 : 80).map((flow) => {
              if (!Array.isArray(flow.from) || flow.from.length < 2) return null;
              const [x, y] = cnProject(flow.from);
              return <circle key={`src-${flow.id}`} cx={x} cy={y} r="4.6" fill="#fff" stroke="#0b66b2" strokeWidth="2.2" />;
            })}
            {!china && (
              <g>
                <rect x={LEFT_X} y={MAP_Y} width={LEFT_W} height={MAP_H} fill="rgba(248,251,255,0.9)" />
                <text x={LEFT_X + LEFT_W / 2} y={MAP_Y + MAP_H / 2} textAnchor="middle" fontSize="14" fontWeight="900" fill="#0f172a">
                  {basemapError.cn || "正在加载省级底图..."}
                </text>
              </g>
            )}
          </g>

          <g clipPath="url(#splitDeClip)">
            {deFeatures.flatMap((feature, fi) => geometryPaths(feature.geometry, deProject).map((d, pi) => (
              <path key={`de-fill-${fi}-${pi}`} d={d} fill="#f8fbff" stroke="none" />
            )))}
            {deFeatures.flatMap((feature, fi) => geometryPaths(feature.geometry, deProject).map((d, pi) => (
              <path key={`de-outline-${fi}-${pi}`} d={d} fill="none" stroke="#9bb0c5" strokeWidth="1" />
            )))}
            {uniqueCities.map((city) => {
              const [x, y] = deProject(city.coords);
              return (
                <g key={`city-${city.label}`} style={{ cursor: "default" }}>
                  <circle cx={x} cy={y} r={4 + Math.min(10, city.count * 0.6)} fill="transparent" stroke="#f59e0b" strokeWidth="2" />
                  <text x={x + 10} y={y + 4} fontSize="12" fontWeight="850" fill="#111827" stroke="rgba(255,255,255,0.95)" strokeWidth="3" paintOrder="stroke">
                    {city.label}
                  </text>
                </g>
              );
            })}
            {!world && (
              <g>
                <rect x={RIGHT_X} y={MAP_Y} width={RIGHT_W} height={MAP_H} fill="rgba(248,251,255,0.9)" />
                <text x={RIGHT_X + RIGHT_W / 2} y={MAP_Y + MAP_H / 2} textAnchor="middle" fontSize="14" fontWeight="900" fill="#0f172a">
                  {basemapError.de || "正在加载目的地底图..."}
                </text>
                {basemapError.city && (
                  <text x={RIGHT_X + RIGHT_W / 2} y={MAP_Y + MAP_H / 2 + 22} textAnchor="middle" fontSize="12" fontWeight="850" fill="#475569">
                    {basemapError.city}
                  </text>
                )}
              </g>
            )}
          </g>

          {/* Cross-panel links in global coordinates */}
          <g className="split-links">
            {activeFlows.slice(0, effectiveSelectedId ? 1 : 80).map((flow, index) => {
              const toCoords = cityCoordsForFlow(flow);
              if (!Array.isArray(flow.from) || flow.from.length < 2 || !Array.isArray(toCoords) || toCoords.length < 2) return null;
              const [aX, aY] = cnProject(flow.from);
              const [bX, bY] = deProject(toCoords);
              const c1x = aX + Math.min(240, (bX - aX) * 0.45);
              const c2x = bX - Math.min(240, (bX - aX) * 0.45);
              const cy = Math.min(aY, bY) - 70 - (index % 7) * 6;
              const selected = effectiveSelectedId ? flow.id === effectiveSelectedId : false;
              const stroke = selected ? "#0ea5e9" : "rgba(14,165,233,0.55)";
              const strokeWidth = selected ? 2.6 : 1.5;
              return (
                <path
                  key={`link-${flow.id}`}
                  d={`M${aX.toFixed(1)},${aY.toFixed(1)} C${c1x.toFixed(1)},${cy.toFixed(1)} ${c2x.toFixed(1)},${cy.toFixed(1)} ${bX.toFixed(1)},${bY.toFixed(1)}`}
                  stroke={stroke}
                  strokeWidth={strokeWidth}
                  fill="none"
                  markerEnd="url(#splitArrow)"
                  style={{ cursor: "pointer" }}
                  onClick={() => pick(flow.id)}
                />
              );
            })}
          </g>
        </svg>
        <aside className="split-flow-panel" aria-label="传播路径列表">
          <strong>传播路径（累计至 {currentYear || "全部"}）</strong>
          <div className="split-flow-list" role="list">
            {visibleFlows.slice(0, 14).map((flow) => (
              <button
                key={`row-${flow.id}`}
                type="button"
                className={flow.id === effectiveSelectedId ? "active" : ""}
                onClick={() => pick(flow.id)}
              >
                {flow.year ? `${flow.year}: ` : ""}{normalizeLabel(flow.fromLabel || "中国")}→{cityNameFromFlow(flow)}
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}
