import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../services/api.js";
import VisualModal, { ExpandButton } from "./VisualModal.jsx";

const WIDTH = 1400;
const HEIGHT = 620;
const PANEL_GAP = 16;
const HEADER_H = 32;
const MAP_Y = HEADER_H + 18;
const MAP_H = HEIGHT - MAP_Y - 14;
const FRAME_PAD = 6;
const FRAME_RX = 14;
const FLOW_W = 82;
const RIGHT_W = 620;
const LEFT_W = WIDTH - FLOW_W - RIGHT_W - PANEL_GAP * 3;
const CHINA_X = PANEL_GAP;
const FLOW_X = CHINA_X + LEFT_W + PANEL_GAP;
const RIGHT_X = FLOW_X + FLOW_W + PANEL_GAP;
const CHINA_VIEW_BOUNDS = { minLon: 73.0, minLat: 18.0, maxLon: 135.5, maxLat: 54.5 };
const EUROPE_VIEW_BOUNDS = { minLon: 2.4, minLat: 45.6, maxLon: 17.2, maxLat: 55.6 };
const FALLBACK_DE_CITY = {
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
  "frankfurt a. m.": [8.6821, 50.1109],
  cologne: [6.9603, 50.9375],
  köln: [6.9603, 50.9375],
  koeln: [6.9603, 50.9375],
  düsseldorf: [6.7735, 51.2277],
  duesseldorf: [6.7735, 51.2277],
  dusseldorf: [6.7735, 51.2277],
  norderstedt: [9.9791, 53.7088],
  "sankt augustin": [7.1902, 50.7754],
  "st. augustin": [7.1902, 50.7754],
  eisenach: [10.3157, 50.9795],
  kassel: [9.4797, 51.3127],
  basel: [7.5886, 47.5596],
  zurich: [8.5417, 47.3769],
  zürich: [8.5417, 47.3769],
  vienna: [16.3738, 48.2082],
  wien: [16.3738, 48.2082],
  prag: [14.4378, 50.0755],
  prague: [14.4378, 50.0755],
  london: [-0.1276, 51.5072],
  "new york": [-74.006, 40.7128],
  rudolstadt: [11.3405, 50.7204],
};

function rawMercator(point) {
  const lon = Number(point?.[0] || 0) * Math.PI / 180;
  const lat = Math.max(-85, Math.min(85, Number(point?.[1] || 0))) * Math.PI / 180;
  return [lon, Math.log(Math.tan(Math.PI / 4 + lat / 2))];
}

function collectPoints(geometry, points = []) {
  if (!geometry) return points;
  if (geometry.type === "Polygon") geometry.coordinates.flat().forEach((p) => points.push(p));
  if (geometry.type === "MultiPolygon") geometry.coordinates.flat(2).forEach((p) => points.push(p));
  if (geometry.type === "LineString") geometry.coordinates.forEach((p) => points.push(p));
  if (geometry.type === "MultiLineString") geometry.coordinates.flat().forEach((p) => points.push(p));
  return points;
}

const GERMANY_NEIGHBOR_BBOXES = [
  [3.0, 50.65, 7.3, 53.8],   // Netherlands
  [2.5, 49.45, 6.5, 51.6],   // Belgium
  [5.7, 45.75, 10.7, 47.95], // Switzerland
  [9.35, 46.15, 17.2, 49.15],// Austria
  [11.8, 48.45, 16.95, 51.15],// Czechia
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

function clipLineToBboxes(line = [], bboxes = GERMANY_NEIGHBOR_BBOXES) {
  const parts = [];
  let current = [];
  line.forEach((point) => {
    if (pointInAnyBbox(point, bboxes)) {
      current.push(point);
      return;
    }
    if (current.length >= 2) parts.push(current);
    current = [];
  });
  if (current.length >= 2) parts.push(current);
  return parts;
}

function cropGeometryToBboxes(geometry, bboxes = GERMANY_NEIGHBOR_BBOXES) {
  if (!geometry) return null;
  if (geometry.type === "LineString") {
    const lines = clipLineToBboxes(geometry.coordinates || [], bboxes);
    if (!lines.length) return null;
    return lines.length === 1 ? { type: "LineString", coordinates: lines[0] } : { type: "MultiLineString", coordinates: lines };
  }
  if (geometry.type === "MultiLineString") {
    const lines = (geometry.coordinates || []).flatMap((line) => clipLineToBboxes(line, bboxes));
    return lines.length ? { type: "MultiLineString", coordinates: lines } : null;
  }
  const points = collectPoints(geometry, []);
  return points.some((point) => pointInAnyBbox(point, bboxes)) ? geometry : null;
}

function cropFeatureCollectionToBboxes(collection, bboxes = GERMANY_NEIGHBOR_BBOXES) {
  const features = (collection?.features || [])
    .map((feature) => ({ ...feature, geometry: cropGeometryToBboxes(feature.geometry, bboxes) }))
    .filter((feature) => feature.geometry);
  return { type: "FeatureCollection", features };
}

function geometryCenter(geometry) {
  const pts = collectPoints(geometry, []);
  if (!pts.length) return null;
  const sum = pts.reduce((acc, p) => [acc[0] + Number(p[0]), acc[1] + Number(p[1])], [0, 0]);
  return [sum[0] / pts.length, sum[1] / pts.length];
}

function lonLatBoundsFromPoints(points = []) {
  const valid = points.filter((point) => Array.isArray(point) && point.length >= 2).map(([lon, lat]) => [Number(lon), Number(lat)]).filter(([lon, lat]) => Number.isFinite(lon) && Number.isFinite(lat));
  if (!valid.length) return null;
  const lons = valid.map(([lon]) => lon);
  const lats = valid.map(([, lat]) => lat);
  return {
    minLon: Math.min(...lons),
    maxLon: Math.max(...lons),
    minLat: Math.min(...lats),
    maxLat: Math.max(...lats),
  };
}

function expandBounds(bounds, ratio = 0.18, minPad = 1.8) {
  if (!bounds) return null;
  const lonSpan = Math.max(bounds.maxLon - bounds.minLon, minPad);
  const latSpan = Math.max(bounds.maxLat - bounds.minLat, minPad);
  const lonPad = Math.max(lonSpan * ratio, minPad);
  const latPad = Math.max(latSpan * ratio, minPad);
  return {
    minLon: bounds.minLon - lonPad,
    maxLon: bounds.maxLon + lonPad,
    minLat: bounds.minLat - latPad,
    maxLat: bounds.maxLat + latPad,
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
  return feature?.properties?.ADMIN || feature?.properties?.name || feature?.properties?.NAME || "";
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

function boundsOf(features = []) {
  let minX = Infinity;
  let maxX = -Infinity;
  let minY = Infinity;
  let maxY = -Infinity;
  features.forEach((feature) => {
    collectPoints(feature.geometry).forEach((point) => {
      const [x, y] = rawMercator(point);
      if (!Number.isFinite(x) || !Number.isFinite(y)) return;
      minX = Math.min(minX, x);
      maxX = Math.max(maxX, x);
      minY = Math.min(minY, y);
      maxY = Math.max(maxY, y);
    });
  });
  if (!Number.isFinite(minX) || !Number.isFinite(minY) || !Number.isFinite(maxX) || !Number.isFinite(maxY)) {
    return null;
  }
  return { minX, maxX, minY, maxY };
}

function makeProject(features, viewport) {
  const bounds = boundsOf(features);
  if (!bounds) return makeProjectFromLonLatBounds({ minLon: 4.8, minLat: 47.0, maxLon: 16.8, maxLat: 55.9 }, viewport);
  const pad = viewport.pad ?? 0;
  const sx = (viewport.width - pad * 2) / Math.max(1e-9, (bounds.maxX - bounds.minX));
  const sy = (viewport.height - pad * 2) / Math.max(1e-9, (bounds.maxY - bounds.minY));
  const scale = Math.min(sx, sy);
  const mapW = (bounds.maxX - bounds.minX) * scale;
  const mapH = (bounds.maxY - bounds.minY) * scale;
  const ox = viewport.x + (viewport.width - mapW) / 2;
  const oy = viewport.y + (viewport.height - mapH) / 2;
  return (point) => {
    const [x, y] = rawMercator(point);
    return [ox + (x - bounds.minX) * scale, oy + (bounds.maxY - y) * scale];
  };
}

function normalizeLabel(text) {
  return String(text || "")
    .replace(/[（(].*?[）)]/g, "")
    .replace(/[·•]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function normalizeProvinceName(text) {
  return normalizeLabel(text).replace(/省|市|自治区|特别行政区/g, "");
}

function cityNameFromToLabel(toLabel) {
  const raw = String(toLabel || "");
  const parts = raw.split("·").map((s) => s.trim()).filter(Boolean);
  return normalizeLabel(parts[0] || raw);
}

function validCoords(coords) {
  return Array.isArray(coords)
    && coords.length >= 2
    && Number.isFinite(Number(coords[0]))
    && Number.isFinite(Number(coords[1]));
}

function cityKey(text) {
  return normalizeLabel(text).toLowerCase();
}

export default function WilhelmSplitMap({ flows = [], selectedId = "", onSelect, title = "德译中国故事集故事来源及出版地参照图", timeline = false, allowExpand = true }) {
  const svgRef = useRef(null);
  const [world, setWorld] = useState(null);
  const [germany, setGermany] = useState(null);
  const [china, setChina] = useState(null);
  const [cityLookup, setCityLookup] = useState(null);
  const [timelineIndex, setTimelineIndex] = useState(null);
  const [playing, setPlaying] = useState(false);
  const [hoveredRouteKey, setHoveredRouteKey] = useState("");
  const [focusedRouteKey, setFocusedRouteKey] = useState("");
  const [sourceFilter, setSourceFilter] = useState("all");
  const [cityFilter, setCityFilter] = useState("all");
  const [minCount, setMinCount] = useState(1);
  const [modalOpen, setModalOpen] = useState(false);

  const years = useMemo(() => [...new Set(flows.map((flow) => Number(flow.year)).filter(Boolean))].sort((a, b) => a - b), [flows]);
  const timelineIndexValue = Math.min(timelineIndex ?? Math.max(0, years.length - 1), Math.max(0, years.length - 1));
  const currentYear = years[timelineIndexValue] || "";
  const timelineFlows = useMemo(() => (
    timeline && currentYear ? flows.filter((flow) => Number(flow.year) <= currentYear) : flows
  ), [currentYear, flows, timeline]);
  const sourceOptions = useMemo(() => [...new Set(timelineFlows.map((flow) => normalizeProvinceName(flow?.province || flow?.fromLabel || "")).filter((name) => name && name !== "未记录"))].sort((a, b) => a.localeCompare(b, "zh-Hans-CN")), [timelineFlows]);
  const cityOptions = useMemo(() => [...new Set(timelineFlows.map((flow) => cityNameFromToLabel(flow?.toLabel || "")).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh-Hans-CN")), [timelineFlows]);
  const visibleFlows = useMemo(() => timelineFlows.filter((flow) => {
    const source = normalizeProvinceName(flow?.province || flow?.fromLabel || "");
    const city = cityNameFromToLabel(flow?.toLabel || "");
    return (sourceFilter === "all" || source === sourceFilter) && (cityFilter === "all" || city === cityFilter);
  }), [cityFilter, sourceFilter, timelineFlows]);

  useEffect(() => {
    if (!playing || years.length < 2) return undefined;
    const timer = setInterval(() => {
      setTimelineIndex((idx) => {
        const current = idx ?? 0;
        if (current >= years.length - 1) {
          setPlaying(false);
          return current;
        }
        return current + 1;
      });
    }, 900);
    return () => clearInterval(timer);
  }, [playing, years.length]);

  useEffect(() => {
    let canceled = false;
    async function load() {
      try {
        const [boundaryData, germanyData, cnData, cityData] = await Promise.all([
          api.basemapBoundary(),
          api.basemapGermanyAdm02(),
          api.basemapProvince(),
          api.basemapWorldCities(),
        ]);
        if (canceled) return;
        const croppedBoundary = cropFeatureCollectionToBboxes(boundaryData);
        setWorld({
          type: "FeatureCollection",
          features: [...(croppedBoundary.features || []), ...(germanyData?.features || [])],
        });
        setGermany(germanyData);
        setChina(cnData);
        const map = new Map();
        (cityData?.features || []).forEach((feature) => {
          const name = normalizeLabel(feature?.properties?.CITY_NAME || "");
          const admin = normalizeLabel(feature?.properties?.ADMIN_NAME || "");
          const coords = feature?.geometry?.coordinates;
          if (!name || !Array.isArray(coords) || coords.length < 2) return;
          map.set(name.toLowerCase(), coords);
          if (admin) map.set(`${name} ${admin}`.toLowerCase(), coords);
        });
        setCityLookup(map);
      } catch {
        if (!canceled) {
          setWorld({ type: "FeatureCollection", features: [] });
          setGermany({ type: "FeatureCollection", features: [] });
          setChina({ type: "FeatureCollection", features: [] });
          setCityLookup(new Map());
        }
      }
    }
    load();
    return () => { canceled = true; };
  }, []);

  const europeFeatures = world?.features || [];
  const germanyFeatures = germany?.features || [];
  const deProject = useMemo(() => makeProjectFromLonLatBounds(
    EUROPE_VIEW_BOUNDS,
    { x: RIGHT_X, y: MAP_Y, width: RIGHT_W, height: MAP_H, pad: 12 },
  ), []);

  const chinaFeatures = china?.features || [];
  const basemapReady = europeFeatures.length > 0 && chinaFeatures.length > 0;
  const sourceProvinceCounts = useMemo(() => {
    const counts = new Map();
    visibleFlows.forEach((flow) => {
      const name = normalizeProvinceName(flow?.province || flow?.fromLabel || "");
      if (!name || name === "未记录") return;
      counts.set(name, (counts.get(name) || 0) + 1);
    });
    return counts;
  }, [visibleFlows]);
  const sourceAnchors = useMemo(() => {
    const anchors = new Map();
    chinaFeatures.forEach((feature) => {
      const name = normalizeProvinceName(feature?.properties?.name || feature?.properties?.NAME || feature?.properties?.省 || "");
      const center = geometryCenter(feature.geometry);
      if (!name || !center) return;
      anchors.set(name, center);
    });
    return anchors;
  }, [chinaFeatures]);
  const sourceProvinceList = useMemo(
    () => [...sourceProvinceCounts.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name),
    [sourceProvinceCounts]
  );
  const sourceCoordsByProvince = useMemo(() => {
    const coords = new Map();
    visibleFlows.forEach((flow) => {
      const name = normalizeProvinceName(flow?.province || flow?.fromLabel || "");
      const from = Array.isArray(flow?.from) && flow.from.length >= 2 ? flow.from : null;
      if (!name || name === "未记录" || !from || coords.has(name)) return;
      coords.set(name, from);
    });
    sourceProvinceList.forEach((province) => {
      if (coords.has(province)) return;
      const fallback = sourceAnchors.get(province);
      if (Array.isArray(fallback) && fallback.length >= 2) coords.set(province, fallback);
    });
    return coords;
  }, [sourceAnchors, sourceProvinceList, visibleFlows]);
  const chinaProject = useMemo(() => makeProjectFromLonLatBounds(
    CHINA_VIEW_BOUNDS,
    { x: CHINA_X, y: MAP_Y, width: LEFT_W, height: MAP_H, pad: 12 },
  ), []);

  const yearDestinations = useMemo(() => {
    if (!timeline || !currentYear) return [];
    const yearValue = Number(currentYear);
    const seen = new Map();
    visibleFlows.forEach((flow) => {
      if (Number(flow.year) !== yearValue) return;
      const name = cityNameFromToLabel(flow.toLabel || "");
      if (!name) return;
      seen.set(name, (seen.get(name) || 0) + 1);
    });
    return [...seen.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [currentYear, timeline, visibleFlows]);

  const yearNotes = useMemo(() => {
    if (!timeline || !currentYear) return [];
    const yearValue = Number(currentYear);
    const byYear = new Map();
    visibleFlows.forEach((flow) => {
      const y = Number(flow.year) || 0;
      if (!y || y > yearValue) return;
      const name = cityNameFromToLabel(flow.toLabel || "");
      const origin = normalizeProvinceName(flow.province || flow.fromLabel || "");
      if (!name) return;
      if (!byYear.has(y)) byYear.set(y, { destinations: new Map(), origins: new Map() });
      const bucket = byYear.get(y);
      bucket.destinations.set(name, (bucket.destinations.get(name) || 0) + 1);
      if (origin && origin !== "未记录") bucket.origins.set(origin, (bucket.origins.get(origin) || 0) + 1);
    });
    const lines = [...byYear.entries()]
      .sort((a, b) => a[0] - b[0])
      .slice(-9)
      .map(([y, bucket]) => {
        const dests = [...bucket.destinations.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
        const origins = [...bucket.origins.entries()].sort((a, b) => b[1] - a[1]).map(([name]) => name);
        const shown = dests.slice(0, 3).join("、");
        const suffix = dests.length > 3 ? ` 等${dests.length}地` : "";
        return `${y}：${origins.slice(0, 2).join("、") || "未记录源地"}→${shown}${suffix}`;
      });
    return lines;
  }, [currentYear, timeline, visibleFlows]);

  function resolveToCoords(flow) {
    const name = cityNameFromToLabel(flow?.toLabel);
    if (validCoords(flow?.to)) return flow.to;
    const key = cityKey(name);
    const fallback = FALLBACK_DE_CITY[key];
    if (validCoords(fallback)) return fallback;
    const coords = cityLookup?.get(key) || cityLookup?.get(`${key} germany`);
    if (validCoords(coords)) return coords;
    return null;
  }

  function routeKeyForFlow(flow) {
    return `${normalizeProvinceName(flow?.province || flow?.fromLabel || "未记录")}→${cityNameFromToLabel(flow?.toLabel || "") || "未记录"}`;
  }

  const uniqueCities = useMemo(() => {
    const byCity = new Map();
    visibleFlows.forEach((flow) => {
      const key = cityNameFromToLabel(flow.toLabel || "");
      const coords = resolveToCoords(flow);
      if (!Array.isArray(coords) || coords.length < 2) return;
      if (!byCity.has(key)) byCity.set(key, { label: key, coords, count: 0 });
      byCity.get(key).count += 1;
    });
    return [...byCity.values()].sort((a, b) => b.count - a.count);
  }, [visibleFlows, cityLookup]);

  const routeGroups = useMemo(() => {
    const grouped = new Map();
    visibleFlows.forEach((flow) => {
      const province = normalizeProvinceName(flow?.province || flow?.fromLabel || "");
      const city = cityNameFromToLabel(flow?.toLabel || "");
      const sourceCoords = sourceCoordsByProvince.get(province) || (Array.isArray(flow.from) && flow.from.length >= 2 ? flow.from : null);
      const toCoords = resolveToCoords(flow);
      if (!province || !city || !Array.isArray(sourceCoords) || sourceCoords.length < 2 || !Array.isArray(toCoords) || toCoords.length < 2) return;
      const key = `${province}→${city}`;
      if (!grouped.has(key)) {
        grouped.set(key, { key, province, city, sourceCoords, toCoords, flows: [], years: new Set() });
      }
      const group = grouped.get(key);
      group.flows.push(flow);
      if (flow.year) group.years.add(Number(flow.year));
    });
    return [...grouped.values()]
      .map((group) => ({
        ...group,
        count: group.flows.length,
        years: [...group.years].filter(Boolean).sort((a, b) => a - b),
      }))
      .sort((a, b) => b.count - a.count || a.province.localeCompare(b.province, "zh-Hans-CN"));
  }, [visibleFlows, sourceCoordsByProvince, cityLookup]);
  const displayedRouteGroups = useMemo(
    () => routeGroups.filter((route) => route.count >= minCount),
    [minCount, routeGroups],
  );
  const displayedSourceCounts = useMemo(() => {
    const counts = new Map();
    displayedRouteGroups.forEach((route) => counts.set(route.province, (counts.get(route.province) || 0) + route.count));
    return counts;
  }, [displayedRouteGroups]);
  const displayedCityCounts = useMemo(() => {
    const byCity = new Map();
    displayedRouteGroups.forEach((route) => {
      if (!byCity.has(route.city)) byCity.set(route.city, { label: route.city, coords: route.toCoords, count: 0 });
      byCity.get(route.city).count += route.count;
    });
    return [...byCity.values()].sort((a, b) => b.count - a.count);
  }, [displayedRouteGroups]);

  const selectedFlow = selectedId ? visibleFlows.find((flow) => flow.id === selectedId) : null;
  const selectedRouteKey = selectedFlow ? routeKeyForFlow(selectedFlow) : "";
  const currentYearLabelRouteKey = useMemo(() => {
    if (!timeline || !currentYear) return "";
    const yearValue = Number(currentYear);
    const matched = displayedRouteGroups.find((route) => route.years.includes(yearValue));
    return matched?.key || "";
  }, [currentYear, displayedRouteGroups, timeline]);
  const activeRouteKey = hoveredRouteKey || focusedRouteKey || selectedRouteKey || currentYearLabelRouteKey;
  const activeRoute = useMemo(
    () => displayedRouteGroups.find((route) => route.key === activeRouteKey) || null,
    [activeRouteKey, displayedRouteGroups],
  );
  const detailRows = useMemo(() => {
    const target = activeRoute || displayedRouteGroups[0];
    if (!target) return [];
    return target.flows
      .slice()
      .sort((a, b) => (Number(a.year) || 9999) - (Number(b.year) || 9999))
      .map((flow) => `${flow.year || "未记录"} · ${flow.title || flow.toLabel || target.city}`);
  }, [activeRoute, displayedRouteGroups]);

  function pickLabel(label) {
    const parts = String(label || "").split("·").map((s) => s.trim()).filter(Boolean);
    return (parts[0] || label || "").slice(0, 10);
  }

  function yearRangeText(route) {
    const years = route?.years || [];
    if (!years.length) return "年份未记录";
    return years.length === 1 ? `${years[0]}` : `${years[0]}-${years[years.length - 1]}`;
  }
  const topRoutes = displayedRouteGroups.slice(0, 40);
  const maxRouteCount = Math.max(1, ...topRoutes.map((route) => route.count || 0));
  const detailRoute = activeRoute || displayedRouteGroups[0] || null;

  return (
    <>
    <div className="work-panel china-map-panel wilhelm-split-map">
      <div className="visual-heading map-heading">
        <div>
          <strong>{title}</strong>
          <span>{visibleFlows.length} 条记录 · {displayedRouteGroups.length}/{routeGroups.length} 条聚合路径 · 左：中国故事源地 · 中：聚合流带 · 右：德语出版城市</span>
        </div>
        <div className="visual-heading-actions">
        {timeline && years.length > 1 && (
          <div className="china-map-timeline-controls">
            <button
              type="button"
              onClick={() => {
                if (playing) {
                  setPlaying(false);
                  return;
                }
                if (timelineIndexValue >= years.length - 1) setTimelineIndex(0);
                setPlaying(true);
              }}
            >
              {playing ? "暂停" : "播放"}
            </button>
            <input
              type="range"
              min="0"
              max={Math.max(0, years.length - 1)}
              value={timelineIndexValue}
              onChange={(event) => { setPlaying(false); setTimelineIndex(Number(event.target.value)); }}
            />
            <strong>{currentYear}</strong>
          </div>
        )}
        {allowExpand && <ExpandButton onClick={() => setModalOpen(true)} label="放大地图" />}
        </div>
      </div>
      <div className="wilhelm-flow-filters legacy-hidden">
        <label>来源区
          <select value={sourceFilter} onChange={(event) => { setSourceFilter(event.target.value); setFocusedRouteKey(""); }}>
            <option value="all">全部</option>
            {sourceOptions.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label>目标城市
          <select value={cityFilter} onChange={(event) => { setCityFilter(event.target.value); setFocusedRouteKey(""); }}>
            <option value="all">全部</option>
            {cityOptions.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
        </label>
        <label>最小数量
          <input type="number" min="1" max="99" value={minCount} onChange={(event) => { setMinCount(Math.max(1, Number(event.target.value) || 1)); setFocusedRouteKey(""); }} />
        </label>
        <button type="button" onClick={() => { setSourceFilter("all"); setCityFilter("all"); setMinCount(1); setFocusedRouteKey(""); }}>重置筛选</button>
      </div>
      <div className="wilhelm-split-body">
        <div className="china-map-frame">
        <svg ref={svgRef} className="china-map-svg" viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-label={title}>
          <rect width={WIDTH} height={HEIGHT} fill="#fff" />

          <text x={CHINA_X} y="22" fontSize="16" fontWeight="900" fill="#111827">中国</text>
          <text x={RIGHT_X} y="22" fontSize="16" fontWeight="900" fill="#111827">德国及德语区出版城市</text>

          <defs>
            <clipPath id="wilhelmCnClip">
              <rect x={CHINA_X - FRAME_PAD} y={MAP_Y - FRAME_PAD} width={LEFT_W + FRAME_PAD * 2} height={MAP_H + FRAME_PAD * 2} rx={FRAME_RX} />
            </clipPath>
            <clipPath id="wilhelmDeClip">
              <rect x={RIGHT_X - FRAME_PAD} y={MAP_Y - FRAME_PAD} width={RIGHT_W + FRAME_PAD * 2} height={MAP_H + FRAME_PAD * 2} rx={FRAME_RX} />
            </clipPath>
            <pattern id="sourceHatch" width="6" height="6" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="6" height="6" fill="rgba(248,250,252,0.78)" />
              <line x1="0" y1="0" x2="0" y2="6" stroke="rgba(148,163,184,0.52)" strokeWidth="1.35" />
            </pattern>
          </defs>

          {/* Frames */}
          <rect x={CHINA_X - FRAME_PAD} y={MAP_Y - FRAME_PAD} width={LEFT_W + FRAME_PAD * 2} height={MAP_H + FRAME_PAD * 2} rx={FRAME_RX} fill="#ffffff" stroke="#dce7f2" />
          <rect x={FLOW_X - FRAME_PAD} y={MAP_Y - FRAME_PAD} width={FLOW_W + FRAME_PAD * 2} height={MAP_H + FRAME_PAD * 2} rx={FRAME_RX} fill="#fbfdff" stroke="#dce7f2" />
          <rect x={RIGHT_X - FRAME_PAD} y={MAP_Y - FRAME_PAD} width={RIGHT_W + FRAME_PAD * 2} height={MAP_H + FRAME_PAD * 2} rx={FRAME_RX} fill="#ffffff" stroke="#dce7f2" />

          <g clipPath="url(#wilhelmCnClip)">
            {chinaFeatures.flatMap((feature, fi) => {
              const name = normalizeLabel(feature?.properties?.name || feature?.properties?.NAME || feature?.properties?.省 || "");
              const displayName = normalizeProvinceName(name);
              const fill = displayedSourceCounts.get(displayName) ? "url(#sourceHatch)" : "#f8fbff";
              return geometryPaths(feature.geometry, chinaProject).map((d, pi) => (
                <path key={`cn-fill-${fi}-${pi}`} d={d} fill={fill} stroke="none" />
              ));
            })}
            {chinaFeatures.map((feature) => {
              const name = normalizeLabel(feature?.properties?.name || feature?.properties?.NAME || feature?.properties?.省 || "");
              const center = geometryCenter(feature.geometry);
              if (!name || !center) return null;
              const displayName = normalizeProvinceName(name);
              if (displayedSourceCounts.get(displayName)) return null;
              const [x, y] = chinaProject(center);
              return (
                <text
                  key={`cn-label-${name}`}
                  x={x}
                  y={y}
                  textAnchor="middle"
                  fontSize="11"
                  fontWeight="850"
                  fill="#0f172a"
                  stroke="rgba(255,255,255,0.95)"
                  strokeWidth="3"
                  paintOrder="stroke"
                >
                  {displayName}
                </text>
              );
            })}
          </g>

          <g clipPath="url(#wilhelmDeClip)">
            {europeFeatures.flatMap((feature, fi) => geometryPaths(feature.geometry, deProject).map((d, pi) => (
              <path key={`de-fill-${fi}-${pi}`} d={d} fill={["Polygon", "MultiPolygon"].includes(feature.geometry?.type) ? "#f8fafc" : "none"} fillOpacity="0.9" stroke="none" />
            )))}
          </g>

          {/* Interactive route detail panel */}
          {false && basemapReady && displayedRouteGroups.length > 0 && (
            <g>
              {(() => {
                const boxW = NOTE_W - 18;
                const boxX = NOTE_X + 8;
                const boxY = MAP_Y + 8;
                const boxH = MAP_H - 16;
                const route = activeRoute || displayedRouteGroups[0];
                return (
                  <foreignObject x={boxX} y={boxY} width={boxW} height={boxH}>
                    <div
                      xmlns="http://www.w3.org/1999/xhtml"
                      style={{
                        boxSizing: "border-box",
                        width: "100%",
                        height: "100%",
                        padding: "10px 12px",
                        overflowY: "auto",
                        background: "rgba(255,255,255,0.92)",
                        border: "1px solid #dce7f2",
                        borderRadius: "12px",
                        color: "#0f172a",
                        fontFamily: "inherit",
                        boxShadow: "0 10px 26px rgba(6,20,42,0.10)",
                      }}
                    >
                      <div style={{ marginBottom: "8px", color: "#111827", fontSize: "12px", fontWeight: 900 }}>
                        {activeRoute ? "流向详情" : "主要流向"}
                      </div>
                      <div style={{ marginBottom: "8px", fontSize: "12px", fontWeight: 900, lineHeight: 1.4 }}>
                        {route.province} → {route.city}
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "6px", marginBottom: "10px", fontSize: "11px", fontWeight: 850 }}>
                        <span>数量：{route.count}</span>
                        <span>年份：{yearRangeText(route)}</span>
                      </div>
                      <div style={{ display: "grid", gap: "6px" }}>
                        {detailRows.map((line, idx) => (
                          <div key={`note-${idx}`} style={{ fontSize: "11px", fontWeight: 800, lineHeight: 1.35 }}>
                            {line}
                          </div>
                        ))}
                      </div>
                    </div>
                  </foreignObject>
                );
              })()}
            </g>
          )}

          <g className="wilhelm-split-links">
            {(basemapReady ? displayedRouteGroups : []).slice(0, 180).map((route, index) => {
              const [sx, sy] = chinaProject(route.sourceCoords);
              const [ex, ey] = deProject(route.toCoords);
              const sourceHubX = FLOW_X + 28;
              const targetHubX = FLOW_X + FLOW_W - 28;
              const laneY = MAP_Y + 34 + (displayedRouteGroups.length <= 1 ? 0.5 : index / (displayedRouteGroups.length - 1)) * (MAP_H - 68);
              const active = hoveredRouteKey === route.key || focusedRouteKey === route.key || selectedRouteKey === route.key;
              const hasCurrent = timeline && currentYear ? route.years.includes(Number(currentYear)) : false;
              const stroke = active ? "#0ea5e9" : hasCurrent ? "rgba(14,165,233,0.62)" : "rgba(14,165,233,0.26)";
              const strokeWidth = active ? Math.min(4.4, 2.3 + Math.sqrt(route.count) * 0.6) : Math.min(3.8, 1.15 + Math.sqrt(route.count) * 0.62);
              const labelText = active && route.count > 1
                ? `${route.count}条`
                : (route.key === currentYearLabelRouteKey ? currentYear : "");
              return (
                <g
                  key={`route-${route.key}`}
                  onClick={() => { setFocusedRouteKey(route.key); onSelect?.(route.flows[0]?.id); }}
                  onMouseEnter={() => setHoveredRouteKey(route.key)}
                  onMouseLeave={() => setHoveredRouteKey("")}
                  style={{ cursor: "pointer" }}
                >
                  <path
                    d={`M${sx.toFixed(1)},${sy.toFixed(1)} C${sourceHubX.toFixed(1)},${sy.toFixed(1)} ${sourceHubX.toFixed(1)},${laneY.toFixed(1)} ${sourceHubX.toFixed(1)},${laneY.toFixed(1)} L${targetHubX.toFixed(1)},${laneY.toFixed(1)} C${targetHubX.toFixed(1)},${laneY.toFixed(1)} ${targetHubX.toFixed(1)},${ey.toFixed(1)} ${ex.toFixed(1)},${ey.toFixed(1)}`}
                    stroke={stroke}
                    strokeWidth={strokeWidth}
                    fill="none"
                    opacity={active ? 0.95 : 1}
                    strokeLinecap="round"
                  />
                  {labelText && (
                    <text
                      x={(sourceHubX + targetHubX) / 2}
                      y={laneY - 6}
                      textAnchor="middle"
                      fontSize="11"
                      fontWeight="850"
                      fill="#111827"
                      stroke="rgba(255,255,255,0.95)"
                      strokeWidth="3"
                      paintOrder="stroke"
                    >
                      {labelText}
                    </text>
                  )}
                </g>
              );
            })}
          </g>

          {/* Outlines above links */}
          <g clipPath="url(#wilhelmCnClip)" pointerEvents="none">
            {chinaFeatures.flatMap((feature, fi) => {
              return geometryPaths(feature.geometry, chinaProject).map((d, pi) => (
                <path key={`cn-outline-${fi}-${pi}`} d={d} fill="none" stroke="#9bb0c5" strokeWidth="1" />
              ));
            })}
          </g>

          <g clipPath="url(#wilhelmDeClip)" pointerEvents="none">
            {europeFeatures.flatMap((feature, fi) => {
              if (["Polygon", "MultiPolygon"].includes(feature.geometry?.type)) return [];
              return geometryPaths(feature.geometry, deProject).map((d, pi) => (
                <path key={`de-outline-${fi}-${pi}`} d={d} fill="none" stroke="#8fa1b3" strokeWidth="1.15" />
              ));
            })}
            {germanyFeatures.flatMap((feature, fi) => geometryPaths(feature.geometry, deProject).map((d, pi) => (
              <path key={`de-boundary-${fi}-${pi}`} d={d} fill="none" stroke="#6f7f91" strokeWidth="1.2" />
            )))}
            {GERMANY_NEIGHBOR_LABELS.map((item) => {
              const [x, y] = deProject(item.coords);
              return (
                <text
                  key={`de-neighbor-label-${item.id}`}
                  x={x}
                  y={y}
                  textAnchor="middle"
                  fontSize="12"
                  fontWeight="850"
                  fill="#64748b"
                  stroke="rgba(255,255,255,0.94)"
                  strokeWidth="3"
                  paintOrder="stroke"
                >
                  {item.label}
                </text>
              );
            })}
          </g>

          {basemapReady && (
            <g className="wilhelm-split-points">
              {sourceProvinceList.filter((province) => displayedSourceCounts.get(province)).map((province) => {
                const sourceCoords = sourceCoordsByProvince.get(province);
                if (!Array.isArray(sourceCoords) || sourceCoords.length < 2) return null;
                const [x, y] = chinaProject(sourceCoords);
                const count = displayedSourceCounts.get(province) || 0;
                const r = 5.5 + Math.min(12, Math.sqrt(count) * 2.3);
                return (
                  <g key={`source-${province}`} onClick={() => { setSourceFilter(province); setFocusedRouteKey(""); }} style={{ cursor: "pointer" }}>
                    <circle cx={x} cy={y} r={r} fill="none" stroke="#ef4444" strokeWidth={2.4} />
                    <text x={x + 10} y={y + 4} fontSize="12" fontWeight="900" fill="#111827" stroke="rgba(255,255,255,0.95)" strokeWidth="3" paintOrder="stroke">
                      {province}
                    </text>
                  </g>
                );
              })}
              {displayedCityCounts.map((city) => {
                const [x, y] = deProject(city.coords);
                const r = 5.5 + Math.min(12, Math.sqrt(city.count || 0) * 2.3);
                return (
                  <g key={`city-${city.label}`} onClick={() => { setCityFilter(city.label); setFocusedRouteKey(""); }} style={{ cursor: "pointer" }}>
                    <circle cx={x} cy={y} r={r} fill="none" stroke="#ef4444" strokeWidth={2.4} />
                    <text x={x + 10} y={y + 4} fontSize="12" fontWeight="850" fill="#111827" stroke="rgba(255,255,255,0.95)" strokeWidth="3" paintOrder="stroke">
                      {pickLabel(city.label)}
                    </text>
                  </g>
                );
              })}
            </g>
          )}
        </svg>
        </div>
        <aside className="wilhelm-flow-side">
          <section className="wilhelm-flow-card wilhelm-flow-control-card">
            <div className="wilhelm-flow-card-title">筛选</div>
            <label>
              <span>来源区</span>
              <select value={sourceFilter} onChange={(event) => { setSourceFilter(event.target.value); setFocusedRouteKey(""); }}>
                <option value="all">全部</option>
                {sourceOptions.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <label>
              <span>目标城市</span>
              <select value={cityFilter} onChange={(event) => { setCityFilter(event.target.value); setFocusedRouteKey(""); }}>
                <option value="all">全部</option>
                {cityOptions.map((name) => <option key={name} value={name}>{name}</option>)}
              </select>
            </label>
            <label>
              <span>最小数量</span>
              <input type="number" min="1" max="99" value={minCount} onChange={(event) => { setMinCount(Math.max(1, Number(event.target.value) || 1)); setFocusedRouteKey(""); }} />
            </label>
            <button type="button" onClick={() => { setSourceFilter("all"); setCityFilter("all"); setMinCount(1); setFocusedRouteKey(""); }}>重置筛选</button>
          </section>

          <section className="wilhelm-flow-card wilhelm-flow-detail-card">
            <div className="wilhelm-flow-card-title">{activeRoute ? "流向详情" : "主要流向"}</div>
            {detailRoute ? (
              <>
                <strong>{detailRoute.province} → {detailRoute.city}</strong>
                <div className="wilhelm-flow-meta">
                  <span>数量 {detailRoute.count}</span>
                  <span>年份 {yearRangeText(detailRoute)}</span>
                </div>
                <div className="wilhelm-flow-detail-list">
                  {detailRows.slice(0, 12).map((line, index) => (
                    <p key={`detail-${index}`}>{line}</p>
                  ))}
                </div>
              </>
            ) : (
              <p className="wilhelm-empty-note">暂无可显示流向</p>
            )}
          </section>

          <div className="wilhelm-flow-summary" aria-label="Top 流向条形图">
        <div className="wilhelm-flow-summary-title">Top 流向</div>
        <div className="wilhelm-flow-bars">
          {topRoutes.map((route) => (
            <button
              type="button"
              key={`top-${route.key}`}
              className={activeRouteKey === route.key ? "active" : ""}
              onClick={() => { setFocusedRouteKey(route.key); onSelect?.(route.flows[0]?.id); }}
              title={`${route.province} → ${route.city}：${route.count} 条，${yearRangeText(route)}`}
            >
              <span>{route.province} → {route.city}</span>
              <i style={{ width: `${Math.max(8, (route.count / maxRouteCount) * 100)}%` }} />
              <b>{route.count}</b>
            </button>
          ))}
          </div>
          </div>
        </aside>
      </div>
    </div>
    {allowExpand && (
      <VisualModal open={modalOpen} title={title} subtitle="放大查看故事来源、聚合流带与德语区出版城市" onClose={() => setModalOpen(false)}>
        <WilhelmSplitMap flows={flows} selectedId={selectedId} onSelect={onSelect} title={title} timeline={timeline} allowExpand={false} />
      </VisualModal>
    )}
    </>
  );
}
