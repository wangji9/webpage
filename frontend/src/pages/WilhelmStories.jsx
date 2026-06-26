import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../services/api.js";
import storyData from "../data/storyCollections.json";
import WilhelmSplitMap from "../components/WilhelmSplitMap.jsx";
import StatisticsPanel from "../components/StatisticsPanel.jsx";
import { PublicationBubbleMap } from "../components/StoryVisualAtlas.jsx";
import { downloadTextFile, loadWilhelmRecords, parseTableFile, pickField, saveWilhelmRecords } from "../utils/localKnowledgeStore.js";

const STORY_DRAFT_KEY = "china-narrative-platform:wilhelm-story-drafts:v1";
const KG_CACHE_KEY = "china-narrative-platform:wilhelm-llm-knowledge-graphs:v1";

const provinceCoords = {
  山东: [117.0, 36.7],
  北京: [116.4, 39.9],
  上海: [121.47, 31.23],
  江苏: [118.8, 32.1],
  浙江: [120.2, 30.3],
  山西: [112.55, 37.87],
  安徽: [117.27, 31.86],
  江西: [115.86, 28.68],
  河南: [113.62, 34.75],
  湖北: [114.3, 30.6],
  湖南: [112.98, 28.2],
  广东: [113.27, 23.13],
  四川: [104.06, 30.67],
  福建: [119.3, 26.08],
  云南: [102.71, 25.04],
  陕西: [108.94, 34.34],
};

const graphPalette = {
  故事: "#b7dc28",
  故事集: "#b7dc28",
  实体: "#2cb7a0",
  关键词: "#f25f8f",
  动物: "#4f73d9",
  气象: "#10a7c4",
  空间: "#ff8a3d",
  人物: "#2cb7a0",
  事件: "#16a2b8",
  母题: "#ef5b8a",
  物象: "#f2b338",
  神怪: "#7a58c9",
  人物身份: "#6d55c8",
  来源: "#2aa7df",
  分类: "#ffb22e",
  动物形象: "#4f73d9",
  自然气象: "#10a7c4",
  神怪信仰: "#7a58c9",
  空间场景: "#ff8a3d",
  伦理母题: "#f25f8f",
  行为事件: "#35425f",
  核心意象: "#2cb7a0",
};

const preferredGraphLegend = ["故事集", "故事", "人物身份", "动物形象", "自然气象", "神怪信仰", "空间场景", "伦理母题", "行为事件", "核心意象", "关键词", "实体"];
const weakKeywordLeadWords = ["于是", "然而", "随后", "然后", "后来", "从此", "因此", "所以", "可是", "但是", "一日", "有一天", "这时", "此时", "忽然", "突然", "终于", "随即", "接着", "之后", "原来", "不久"];
const weakKeywordTerms = new Set([...weakKeywordLeadWords, "于是乎", "于是便", "于是就", "后来又", "从那时起", "过了一会", "过了不久"]);
const WILHELM_DIVINE_CATEGORY = "神仙、术士与圣人的传说与童话";
const WILHELM_CATEGORY_OVERRIDES = new Map([
  ["月仙", WILHELM_DIVINE_CATEGORY],
  ["启明星和长庚星", WILHELM_DIVINE_CATEGORY],
]);
const WILHELM_PREFACE_ROW = {
  id: "wilhelm-preface",
  title: "序言",
  source: "",
  category: "",
  text: `在本书中，我们从广义的中国童话里选取了一系列故事以飨读者，并且在选取的过程中，尽可能兼顾所有体裁。所谓童话，在中国并未形成一个界限分明的领域。从摇篮故事到动物寓言，从神明故事到民间传说乃至中篇小说，这些体裁在中国的区分并不明显。对于中国而言，奇异之事仍是世界自然进程的组成部分，因此，在这个领域，各种故事体裁难以严格区分。
一般意义上，在中国，单个的图景，或者说，单个的情景，相比于整体的上下文而言，更加重要。因此，将各个母题有逻辑地串联成一个完整情节，只在艺术童话中有所体现。在艺术童话中，不乏大量的瑰宝。由于篇幅限制，我们无法面面俱到。
本书选编主要遵从以下原则：
1. 本书选取的中国故事基本采用口头流传版本，即便这些故事在文献中早已存在。如此选取的目的，在于确认这些故事在如今民间的鲜活样貌。本书选取的故事中，唯有艺术童话更接近于书面原作。
2. 除中国本土童话外，书中也收录了一些展现出外来影响的作品，前提是这些外来影响已经被吸收融入到了中国精神之中。在本书中，我们提供了可供比较的素材。如何用中国艺术手段呈现这些素材，是本书中动人心魄的亮点。
3. 除原本意义上的童话外，书中还收录了民间传说和神明故事，只要它们是以童话般轻松的方式讲述的。通过我们这部故事集，读者能够窥见中国人民的风俗习惯、信仰和思维方式，这不失为一个阅读中颇受欢迎的附带收获。
4. 对于粗俗的内容和大胆的情境，只要原著中存在，我们并没有刻意回避，但也并未故意去寻觅，目的是尽可能原汁原味地还原文本的本来面貌。本书可以为儿童故事提供素材，但并不是普通意义上的儿童书。
5. 在本书选取的故事中，第1—10篇是口口相传的摇篮与儿童童话（Ammen- und Kindermärchen），第11—14篇是为数不多的动物寓言（Tierfabeln），第15—44篇是神仙、术士与圣人的传说与童话（Sagen und Märchen von Göttern, Zauberern und Heiligen），第45—61篇是自然与动物精怪故事（Geschichten von Natur- und Tiergeister）、第62—82篇是鬼怪故事及魔鬼与幽灵童话（Gespenstergeschichte und Märchen von Teufeln und Geistern），第83—92篇是历史传说（Historische Sagen），第93—99篇是艺术童话（Kunstmärchen），最后一篇是一则宏大的、集各种母题和情节于一身的故事。
青岛，1913年4月                                              卫礼贤`,
  isTableOnly: true,
};

function short(text, limit = 28) {
  const value = String(text || "未记录");
  return value.length > limit ? `${value.slice(0, limit - 1)}...` : value;
}

function graphColor(type, fallback = "#2cb7a0") {
  return graphPalette[type] || fallback;
}

function isKnowledgeCenter(node, title) {
  const label = String(node?.label || "");
  const cleanTitle = String(title || "").replace("知识图谱", "").trim();
  return node?.id === "center"
    || label === title
    || label === cleanTitle
    || (label.includes("卫礼贤") && label.includes("中国民间童话"));
}

function graphLegendTypes(nodes, limit = 8) {
  const types = [...new Set((nodes || []).map((node) => node.type || node.category || "实体"))];
  return [
    ...preferredGraphLegend.filter((type) => types.includes(type)),
    ...types.filter((type) => !preferredGraphLegend.includes(type)),
  ].slice(0, limit);
}

function isWeakKeywordTerm(item) {
  const normalized = String(item?.term || item?.label || "")
    .replace(/[，。、“”‘’"'（）()【】《》\s]/g, "")
    .trim();
  if (!normalized) return true;
  if (weakKeywordTerms.has(normalized)) return true;
  return weakKeywordLeadWords.some((word) => normalized.startsWith(word));
}

function loadStoryDrafts() {
  try {
    return JSON.parse(window.localStorage.getItem(STORY_DRAFT_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveStoryDrafts(drafts) {
  window.localStorage.setItem(STORY_DRAFT_KEY, JSON.stringify(drafts));
}

function loadKnowledgeGraphCache() {
  try {
    return JSON.parse(window.localStorage.getItem(KG_CACHE_KEY) || "{}");
  } catch {
    return {};
  }
}

function saveKnowledgeGraphCache(cache) {
  window.localStorage.setItem(KG_CACHE_KEY, JSON.stringify(cache));
}

function normalizeRecord(row, index, fileName = "本地上传表") {
  const title = pickField(row, ["titel", "题名", "书名", "故事集标题", "title"], "卫礼贤《中国民间童话》");
  const yearText = pickField(row, ["year", "年份", "出版时间"], "");
  const province = pickField(row, ["来源地", "故事来源", "省份", "province"], "山东").replace(/省|市|自治区|特别行政区/g, "");
  return {
    id: `wilhelm-upload-${Date.now()}-${index}`,
    source: fileName,
    title: title === "Chinesische Volksmärchen" ? "卫礼贤《中国民间童话》" : title,
    foreignTitle: title,
    year: Number(String(yearText).match(/\d{4}/)?.[0]) || 0,
    yearText: yearText || "未记录",
    edition: pickField(row, ["再版/改编", "版次", "版本", "edition"], "未记录"),
    translator: pickField(row, ["译者", "编者", "translator", "editor"], "Richard Wilhelm（卫礼贤）"),
    publisher: pickField(row, ["publisher", "出版社", "出版机构"], "未记录"),
    city: pickField(row, ["city", "城市", "出版地"], "Jena"),
    country: pickField(row, ["country", "国家", "国家/地区"], "Germany"),
    province: provinceCoords[province] ? province : "山东",
    language: pickField(row, ["语种", "language"], "德语"),
    note: pickField(row, ["说明", "备注", "note"], ""),
  };
}

function recordFlow(record) {
  const province = provinceCoords[record.province] ? record.province : "山东";
  return {
    id: record.id,
    title: record.title,
    sectionId: "stories",
    resourceType: "卫礼贤《中国民间童话》专题",
    language: record.language || "德语",
    year: record.year || 0,
    from: provinceCoords[province],
    to: [10.45, 51.16],
    fromLabel: province,
    toLabel: `${record.city || ""} - ${record.country || "Germany"}`.replace(/^- /, ""),
    province,
    country: record.country || "Germany",
    weight: 0.85,
  };
}

function tableRows(records) {
  return records.map((record) => ({
    ...record,
    canonicalName: record.title,
    country: record.country,
    carrier: record.edition,
    translationMode: record.source,
    translator: record.translator,
  }));
}

function downloadSvg(filename, svgNode) {
  if (!svgNode) return;
  const text = new XMLSerializer().serializeToString(svgNode);
  downloadTextFile(filename, text, "image/svg+xml;charset=utf-8");
}

function toCsv(rows) {
  return "\uFEFF" + rows
    .map((row) => row.map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`).join(","))
    .join("\n");
}

function extractJsonObject(text) {
  const raw = String(text || "").trim();
  const fenced = raw.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  const source = fenced ? fenced[1] : raw.slice(Math.max(0, raw.indexOf("{")), raw.lastIndexOf("}") + 1);
  return JSON.parse(source);
}

function normalizeChatGraph(payload, title) {
  const nodes = (payload.nodes || []).map((node, index) => ({
    id: String(node.id || `node-${index + 1}`),
    label: String(node.label || node.name || node.id || `节点${index + 1}`),
    type: String(node.type || "实体"),
    count: Number(node.count || node.weight || 1),
    summary: String(node.summary || ""),
  }));
  const ids = new Set(nodes.map((node) => node.id));
  const byLabel = new Map(nodes.map((node) => [node.label, node.id]));
  const edges = (payload.edges || payload.triples || []).map((edge) => {
    const source = edge.source || edge.sourceId || byLabel.get(edge.subject) || edge.subject;
    const target = edge.target || edge.targetId || byLabel.get(edge.object) || edge.object;
    return {
      source: String(source || ""),
      target: String(target || ""),
      relation: String(edge.relation || edge.predicate || "关联"),
      weight: Number(edge.weight || edge.count || 1),
    };
  }).filter((edge) => ids.has(edge.source) && ids.has(edge.target));
  const labelOf = (id) => nodes.find((node) => node.id === id)?.label || id;
  return {
    title,
    source: "chat-fallback",
    nodes,
    edges,
    triples: edges.map((edge) => ({ subject: labelOf(edge.source), predicate: edge.relation, object: labelOf(edge.target), weight: edge.weight })),
  };
}

function modelErrorMessage(error) {
  const text = String(error?.message || error || "");
  if (text.includes("502") || text.includes("upstream") || text.includes("temporarily unavailable")) {
    return "上游大模型服务暂不可用，请稍后重新点击自动抽取。";
  }
  return text || "大模型调用失败。";
}

function useSortableRows(rows, searchText, searchableKeys) {
  const [sort, setSort] = useState({ key: "", dir: "asc" });
  const [filters, setFilters] = useState({});
  const filtered = useMemo(() => {
    const keyword = searchText.trim().toLowerCase();
    return rows.filter((row) => {
      const keywordOk = !keyword || searchableKeys.some((key) => String(row[key] || "").toLowerCase().includes(keyword));
      const filterOk = Object.entries(filters).every(([key, value]) => !value || String(row[key] || "").includes(value));
      return keywordOk && filterOk;
    });
  }, [filters, rows, searchText, searchableKeys]);
  const sorted = useMemo(() => {
    if (!sort.key) return filtered;
    return [...filtered].sort((a, b) => {
      const av = a[sort.key] ?? "";
      const bv = b[sort.key] ?? "";
      const result = Number.isFinite(Number(av)) && Number.isFinite(Number(bv))
        ? Number(av) - Number(bv)
        : String(av).localeCompare(String(bv), "zh-Hans-CN");
      return sort.dir === "asc" ? result : -result;
    });
  }, [filtered, sort]);
  function toggleSort(key) {
    setSort((current) => current.key === key ? { key, dir: current.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
  }
  function updateFilter(key, value) {
    setFilters((current) => ({ ...current, [key]: value }));
  }
  return { rows: sorted, sort, filters, toggleSort, updateFilter };
}

function SortHeader({ label, keyName, sort, onSort }) {
  const mark = sort.key === keyName ? (sort.dir === "asc" ? "↑" : "↓") : "↕";
  return <button className="table-sort-button" type="button" onClick={() => onSort(keyName)}>{label}<span>{mark}</span></button>;
}

function GraphExportButtons({ svgRef, csvRows, baseName, children }) {
  return (
    <div className="graph-export-actions">
      {children}
      <button type="button" onClick={() => downloadSvg(`${baseName}.svg`, svgRef.current)}>保存图片</button>
      <button type="button" onClick={() => downloadTextFile(`${baseName}.csv`, toCsv(csvRows), "text/csv;charset=utf-8")}>导出 CSV</button>
    </div>
  );
}

function useForceLayout(graph, width, height, centerRadius = 180, options = {}) {
  const [positions, setPositions] = useState({});
  const dragRef = useRef(null);
  const fixedRef = useRef({});
  const frameRef = useRef(0);
  const optionKey = JSON.stringify({
    centerIds: options.centerIds || [],
    repel: options.repel,
    linkDistance: options.linkDistance,
    coLinkDistance: options.coLinkDistance,
    linkStrength: options.linkStrength,
    centerStrength: options.centerStrength,
    damping: options.damping,
    ticks: options.ticks,
    paddingX: options.paddingX,
    paddingY: options.paddingY,
    orbitJitter: options.orbitJitter,
    verticalScale: options.verticalScale,
    collisionPadding: options.collisionPadding,
    collisionRadius: options.collisionRadius,
    maxCollisionRadius: options.maxCollisionRadius,
    maxVelocity: options.maxVelocity,
    clusterByType: options.clusterByType,
    clusterStrength: options.clusterStrength,
    clusterRadiusX: options.clusterRadiusX,
    clusterRadiusY: options.clusterRadiusY,
  });

  const layoutKey = useMemo(() => {
    const nodes = graph?.nodes || [];
    const edges = graph?.edges || [];
    return JSON.stringify({
      nodes: nodes.map((node) => [node.id, node.count, node.type]),
      edges: edges.map((edge) => [edge.source, edge.target, edge.weight, edge.relation]),
      options: optionKey,
    });
  }, [graph, optionKey]);

  useEffect(() => {
    const nodes = graph?.nodes || [];
    const config = {
      centerIds: new Set(["center", ...(options.centerIds || [])]),
      repel: options.repel ?? 520,
      linkDistance: options.linkDistance ?? 120,
      coLinkDistance: options.coLinkDistance ?? 145,
      linkStrength: options.linkStrength ?? 0.006,
      centerStrength: options.centerStrength ?? 0.0008,
      damping: options.damping ?? 0.86,
      ticks: options.ticks ?? 150,
      paddingX: options.paddingX ?? 36,
      paddingY: options.paddingY ?? 36,
      orbitJitter: options.orbitJitter ?? 28,
      verticalScale: options.verticalScale ?? 0.72,
      collisionPadding: options.collisionPadding ?? 5,
      collisionRadius: options.collisionRadius ?? 16,
      maxCollisionRadius: options.maxCollisionRadius ?? 58,
      maxVelocity: options.maxVelocity ?? 14,
      clusterByType: Boolean(options.clusterByType),
      clusterStrength: options.clusterStrength ?? 0.0018,
      clusterRadiusX: options.clusterRadiusX ?? width * 0.34,
      clusterRadiusY: options.clusterRadiusY ?? height * 0.26,
    };
    const nodeById = new Map(nodes.map((node) => [node.id, node]));
    const clusterTypes = [...new Set(nodes.map((node) => node.type || node.category || "实体"))];
    const clusterAnchors = new Map(clusterTypes.map((type, index) => {
      const angle = (index / Math.max(1, clusterTypes.length)) * Math.PI * 2 - Math.PI / 2;
      return [type, {
        x: width / 2 + Math.cos(angle) * config.clusterRadiusX,
        y: height / 2 + Math.sin(angle) * config.clusterRadiusY,
      }];
    }));
    const isCenter = (id) => config.centerIds.has(id);
    const radiusOf = (id) => {
      const node = nodeById.get(id);
      const count = Number(node?.count || 1);
      const bonus = Math.sqrt(Math.max(1, count)) * 1.4;
      return Math.min(config.maxCollisionRadius, config.collisionRadius + bonus + (isCenter(id) ? 16 : 0));
    };
    fixedRef.current = {};
    const next = {};
    nodes.forEach((node, index) => {
      const angle = (index / Math.max(1, nodes.length)) * Math.PI * 2 - Math.PI / 2;
      const layer = isCenter(node.id) ? 0 : centerRadius + (index % 5) * config.orbitJitter;
      const anchor = config.clusterByType ? clusterAnchors.get(node.type || node.category || "实体") : null;
      next[node.id] = {
        x: (anchor?.x ?? width / 2) + Math.cos(angle) * layer * (anchor ? 0.34 : 1),
        y: (anchor?.y ?? height / 2) + Math.sin(angle) * layer * config.verticalScale * (anchor ? 0.34 : 1),
        vx: isCenter(node.id) ? 0 : (Math.random() - 0.5) * 2.4,
        vy: isCenter(node.id) ? 0 : (Math.random() - 0.5) * 2.4,
      };
    });
    setPositions(next);
    let tick = 0;
    cancelAnimationFrame(frameRef.current);
    const edges = graph?.edges || [];
    function step() {
      tick += 1;
      setPositions((current) => {
        const ids = Object.keys(current);
        const updated = Object.fromEntries(ids.map((id) => [id, { ...current[id] }]));
        for (let i = 0; i < ids.length; i += 1) {
          for (let j = i + 1; j < ids.length; j += 1) {
            const a = updated[ids[i]];
            const b = updated[ids[j]];
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            const dist = Math.max(18, Math.hypot(dx, dy));
            const force = config.repel / (dist * dist);
            if (!isCenter(ids[i])) {
              a.vx += (dx / dist) * force;
              a.vy += (dy / dist) * force;
            }
            if (!isCenter(ids[j])) {
              b.vx -= (dx / dist) * force;
              b.vy -= (dy / dist) * force;
            }
            const minDistance = radiusOf(ids[i]) + radiusOf(ids[j]) + config.collisionPadding;
            if (dist < minDistance) {
              const push = (minDistance - dist) * 0.035;
              if (!isCenter(ids[i])) {
                a.vx += (dx / dist) * push;
                a.vy += (dy / dist) * push;
              }
              if (!isCenter(ids[j])) {
                b.vx -= (dx / dist) * push;
                b.vy -= (dy / dist) * push;
              }
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
          const target = edge.relation === "共现" ? config.coLinkDistance : config.linkDistance;
          const force = (dist - target) * config.linkStrength;
          if (!isCenter(edge.source)) {
            a.vx += (dx / dist) * force;
            a.vy += (dy / dist) * force;
          }
          if (!isCenter(edge.target)) {
            b.vx -= (dx / dist) * force;
            b.vy -= (dy / dist) * force;
          }
        });
        ids.forEach((id) => {
          const node = updated[id];
          const fixed = fixedRef.current[id];
          if (isCenter(id)) {
            node.x = width / 2;
            node.y = height / 2;
            node.vx = 0;
            node.vy = 0;
            return;
          }
          if (fixed) {
            node.x = fixed.x;
            node.y = fixed.y;
            node.vx = 0;
            node.vy = 0;
            return;
          }
          const radius = radiusOf(id);
          const sourceNode = nodeById.get(id);
          const anchor = config.clusterByType ? clusterAnchors.get(sourceNode?.type || sourceNode?.category || "实体") : null;
          node.vx += ((anchor?.x ?? width / 2) - node.x) * (anchor ? config.clusterStrength : config.centerStrength);
          node.vy += ((anchor?.y ?? height / 2) - node.y) * (anchor ? config.clusterStrength : config.centerStrength);
          if (anchor) {
            node.vx += (width / 2 - node.x) * (config.centerStrength * 0.28);
            node.vy += (height / 2 - node.y) * (config.centerStrength * 0.28);
          }
          node.vx *= config.damping;
          node.vy *= config.damping;
          node.vx = Math.max(-config.maxVelocity, Math.min(config.maxVelocity, node.vx));
          node.vy = Math.max(-config.maxVelocity, Math.min(config.maxVelocity, node.vy));
          node.x = Math.max(config.paddingX + radius, Math.min(width - config.paddingX - radius, node.x + node.vx));
          node.y = Math.max(config.paddingY + radius, Math.min(height - config.paddingY - radius, node.y + node.vy));
        });
        return updated;
      });
      if (tick < config.ticks) frameRef.current = requestAnimationFrame(step);
    }
    frameRef.current = requestAnimationFrame(step);
    return () => cancelAnimationFrame(frameRef.current);
  }, [centerRadius, height, layoutKey, optionKey, width]);

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
    const p = point(event);
    fixedRef.current[id] = p;
    const captureTarget = event.currentTarget || event.currentTarget.ownerSVGElement;
    captureTarget.setPointerCapture?.(event.pointerId);
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

function WilhelmKnowledgeGraph({ graph, selectedTerm, onTermSelect, title, onExtract, onAlgorithmExtract, onAbort, extracting, cacheState, readOnly = false }) {
  const svgRef = useRef(null);
  const [query, setQuery] = useState("");
  const rawNodes = graph?.nodes || [];
  const rawEdges = graph?.edges || [];
  const rawTriples = graph?.triples || [];
  const fallbackCenterType = String(title || "").includes("卫礼贤") ? "故事集" : "故事";
  const fallbackCenterLabel = String(title || "").replace("知识图谱", "").trim() || title;
  const allNodes = (rawNodes.length ? rawNodes : [{ id: "center", label: fallbackCenterLabel, type: fallbackCenterType, count: 1, summary: readOnly ? "当前范围暂无可用知识图谱" : "点击算法抽取后生成知识图谱" }]).slice(0, 90);
  const allEdges = rawEdges.slice(0, 150);
  const allNodeMap = useMemo(() => new Map(allNodes.map((node) => [node.id, node])), [allNodes]);
  const nodeLookup = useMemo(() => {
    const byId = new Map();
    const byLabel = new Map();
    [...rawNodes, ...allNodes].forEach((node) => {
      const id = String(node?.id || "");
      const label = String(node?.label || node?.name || node?.id || "");
      if (id) byId.set(id, { ...node, id, label });
      if (label) byLabel.set(label, { ...node, id, label });
    });
    return { byId, byLabel };
  }, [allNodes, rawNodes]);
  const triples = useMemo(() => {
    const labelOf = (value) => {
      const key = String(value ?? "").trim();
      if (!key) return "未记录";
      return nodeLookup.byId.get(key)?.label || nodeLookup.byLabel.get(key)?.label || key;
    };
    const idOf = (value) => {
      const key = String(value ?? "").trim();
      if (!key) return "";
      return nodeLookup.byId.get(key)?.id || nodeLookup.byLabel.get(key)?.id || key;
    };
    const sourceRows = rawTriples.length
      ? rawTriples
      : allEdges.map((edge) => ({
        subject: edge.source,
        predicate: edge.relation,
        object: edge.target,
        weight: edge.weight,
      }));
    return sourceRows.map((item) => {
      const subjectRaw = item.subject ?? item.source ?? item.sourceId;
      const objectRaw = item.object ?? item.target ?? item.targetId;
      return {
        ...item,
        subject: labelOf(subjectRaw),
        predicate: String(item.predicate || item.relation || "关联"),
        object: labelOf(objectRaw),
        subjectId: idOf(subjectRaw),
        objectId: idOf(objectRaw),
        weight: Number(item.weight || item.count || 1),
      };
    }).filter((item) => item.subject && item.object);
  }, [allEdges, nodeLookup, rawTriples]);
  const filteredGraph = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return { nodes: allNodes, edges: allEdges, triples };
    const nodeIds = new Set();
    allNodes.forEach((node) => {
      const haystack = [node.id, node.label, node.type, node.category, node.summary].join(" ").toLowerCase();
      if (haystack.includes(q)) nodeIds.add(node.id);
    });
    const matchedEdges = allEdges.filter((edge) => {
      const source = allNodeMap.get(edge.source);
      const target = allNodeMap.get(edge.target);
      const haystack = [edge.relation, edge.source, edge.target, source?.label, target?.label].join(" ").toLowerCase();
      const matched = haystack.includes(q) || nodeIds.has(edge.source) || nodeIds.has(edge.target);
      if (matched) {
        nodeIds.add(edge.source);
        nodeIds.add(edge.target);
      }
      return matched;
    });
    const matchedTriples = triples.filter((item) => [item.subject, item.predicate, item.object].join(" ").toLowerCase().includes(q));
    matchedTriples.forEach((item) => {
      if (allNodeMap.has(item.subjectId)) nodeIds.add(item.subjectId);
      if (allNodeMap.has(item.objectId)) nodeIds.add(item.objectId);
    });
    return {
      nodes: allNodes.filter((node) => nodeIds.has(node.id)),
      edges: matchedEdges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)),
      triples: matchedTriples.length ? matchedTriples : triples.filter((item) => nodeIds.has(item.subjectId) || nodeIds.has(item.objectId)),
    };
  }, [allEdges, allNodeMap, allNodes, query, triples]);
  const nodes = filteredGraph.nodes;
  const edges = filteredGraph.edges;
  const visibleTriples = filteredGraph.triples;
  const centerNodeIds = useMemo(() => nodes.filter((node) => isKnowledgeCenter(node, title)).map((node) => node.id), [nodes, title]);
  const { positions, startDrag, moveDrag, endDrag } = useForceLayout({ nodes, edges }, 980, 560, 178, {
    centerIds: centerNodeIds,
    repel: 700,
    linkDistance: 122,
    coLinkDistance: 134,
    linkStrength: 0.0068,
    centerStrength: 0.0019,
    damping: 0.84,
    ticks: 210,
    paddingX: 48,
    paddingY: 50,
    orbitJitter: 20,
    collisionPadding: 7,
    collisionRadius: 15,
    maxCollisionRadius: 52,
  });
  const nodeMap = useMemo(() => new Map(nodes.map((node) => [node.id, node])), [nodes]);
  const nodeDegree = useMemo(() => {
    const counts = {};
    edges.forEach((edge) => {
      counts[edge.source] = (counts[edge.source] || 0) + 1;
      counts[edge.target] = (counts[edge.target] || 0) + 1;
    });
    return counts;
  }, [edges]);
  const selectedNode = nodes.find((node) => node.label === selectedTerm || node.id === selectedTerm);
  const selectedNodeIds = useMemo(() => {
    if (!selectedTerm) return new Set();
    const ids = new Set();
    nodes.forEach((node) => {
      if (node.label === selectedTerm || node.id === selectedTerm) ids.add(node.id);
    });
    edges.forEach((edge) => {
      const source = nodeMap.get(edge.source);
      const target = nodeMap.get(edge.target);
      if (ids.has(edge.source) || ids.has(edge.target) || source?.label === selectedTerm || target?.label === selectedTerm || edge.relation === selectedTerm) {
        ids.add(edge.source);
        ids.add(edge.target);
      }
    });
    visibleTriples.forEach((item) => {
      if ([item.subject, item.predicate, item.object, item.subjectId, item.objectId].includes(selectedTerm)) {
        if (item.subjectId) ids.add(item.subjectId);
        if (item.objectId) ids.add(item.objectId);
      }
    });
    return ids;
  }, [edges, nodeMap, nodes, selectedTerm, visibleTriples]);
  const csvRows = [
    ["source", "relation", "target", "weight"],
    ...edges.map((edge) => [nodeMap.get(edge.source)?.label || edge.source, edge.relation || "关联", nodeMap.get(edge.target)?.label || edge.target, edge.weight || 1]),
  ];
  const fullNodeTypeCount = new Set((rawNodes.length ? rawNodes : allNodes).map((node) => node.type || "实体")).size;
  const fullEdgeCount = rawEdges.length;
  const fullTripleCount = triples.length || rawEdges.length;
  const legendTypes = graphLegendTypes(nodes, 8);
  const displayText = query
    ? `当前显示：${nodes.length}/${rawNodes.length || allNodes.length} 个节点，${edges.length}/${fullEdgeCount} 条关系`
    : "点击节点、关系或三元组查看高亮关系";

  return (
    <div className="work-panel wilhelm-graph-panel">
      <div className="panel-title-row">
        <div><strong>{title}</strong><span>{cacheState || (readOnly ? "展示当前已接入的专题知识图谱。" : "使用智能问答同一套大模型 API 抽取，已保存的图谱会自动读取。")}</span></div>
        <GraphExportButtons svgRef={svgRef} csvRows={csvRows} baseName="卫礼贤中国民间童话知识图谱">
          {!readOnly && (
            <>
              <button type="button" onClick={onAlgorithmExtract}>算法抽取</button>
              <button type="button" onClick={extracting ? onAbort : onExtract}>{extracting ? "终止抽取" : "大模型抽取"}</button>
            </>
          )}
        </GraphExportButtons>
      </div>
      <label className="knowledge-search">检索节点边
        <input value={query} onChange={(event) => { setQuery(event.target.value); onTermSelect(""); }} placeholder="输入节点、关系或三元组关键词" />
      </label>
      <div className="knowledge-graph-stack">
        <svg ref={svgRef} className="wilhelm-topic-svg interactive-graph-svg" viewBox="0 0 980 560" role="img" aria-label="卫礼贤中国民间童话知识图谱" onPointerMove={moveDrag} onPointerUp={endDrag} onPointerLeave={endDrag}>
          <defs>
            <radialGradient id="wilhelmNodeGlow" cx="50%" cy="50%" r="62%">
              <stop offset="0%" stopColor="#fff" stopOpacity="0.96" />
              <stop offset="72%" stopColor="#eaf7a5" stopOpacity="0.86" />
              <stop offset="100%" stopColor="#b7dc28" stopOpacity="0.42" />
            </radialGradient>
            <radialGradient id="wilhelmCanvasGlow" cx="50%" cy="44%" r="68%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="72%" stopColor="#f8fbff" />
              <stop offset="100%" stopColor="#eef5fb" />
            </radialGradient>
            <filter id="softShadow"><feDropShadow dx="0" dy="8" stdDeviation="8" floodColor="#0f172a" floodOpacity="0.16" /></filter>
          </defs>
          <rect width="980" height="560" fill="url(#wilhelmCanvasGlow)" />
          {edges.map((edge) => {
            const source = positions[edge.source];
            const target = positions[edge.target];
            if (!source || !target) return null;
            const sourceNode = nodeMap.get(edge.source);
            const targetNode = nodeMap.get(edge.target);
            const color = graphColor(sourceNode?.type || targetNode?.type || sourceNode?.category || targetNode?.category, "#8aa7c5");
            const active = !selectedTerm || selectedNodeIds.has(edge.source) || selectedNodeIds.has(edge.target) || edge.relation === selectedTerm;
            const dx = target.x - source.x;
            const dy = target.y - source.y;
            const dist = Math.max(1, Math.hypot(dx, dy));
            const bend = (((edge.source.length + edge.target.length) % 7) - 3) * 7;
            const cx = (source.x + target.x) / 2 - (dy / dist) * bend;
            const cy = (source.y + target.y) / 2 + (dx / dist) * bend - 6;
            return (
              <g className="atlas-clickable" key={`${edge.source}-${edge.target}-${edge.relation}`} onClick={() => onTermSelect(selectedTerm === edge.relation ? "" : edge.relation)}>
                <path d={`M${source.x},${source.y} Q${cx},${cy} ${target.x},${target.y}`} fill="none" stroke={color} strokeWidth={Math.min(5.8, 0.8 + (edge.weight || 1) / 4.5)} opacity={active ? 0.44 : 0.075} />
                {selectedTerm && active && <text x={cx} y={cy - 5} textAnchor="middle" className="edge-caption">{edge.relation || "关联"}</text>}
              </g>
            );
          })}
          {nodes.map((node) => {
            const pos = positions[node.id];
            if (!pos) return null;
            const type = node.type || "实体";
            const center = centerNodeIds.includes(node.id);
            const color = graphColor(type, graphPalette[node.category] || "#2cb7a0");
            const radius = center ? Math.min(62, 36 + Math.sqrt((node.count || nodeDegree[node.id] || 1) * 7)) : Math.min(43, 11 + Math.sqrt((node.count || nodeDegree[node.id] || 1) * 8));
            const active = !selectedTerm || selectedNodeIds.has(node.id);
            return (
              <g
                className="atlas-clickable drag-node"
                key={node.id}
                transform={`translate(${pos.x},${pos.y})`}
                onPointerDown={(event) => startDrag(event, node.id)}
                onPointerUp={(event) => { event.stopPropagation(); endDrag(); }}
                onClick={(event) => { event.stopPropagation(); onTermSelect(selectedTerm === node.label ? "" : node.label); }}
              >
                <circle r={radius + 8} fill={color} opacity={active ? 0.14 : 0.035} />
                <circle r={radius} fill={center || type === "故事" || type === "故事集" ? "url(#wilhelmNodeGlow)" : color} opacity={active ? 0.94 : 0.2} stroke={center ? "#7aa50e" : "#ffffff"} strokeWidth={center ? 3.5 : 1.8} filter="url(#softShadow)" />
                <text className={`atlas-node-label wilhelm-node-label ${center ? "center-node-label" : ""}`} y="5" textAnchor="middle">{short(node.label, center ? 13 : 8)}</text>
              </g>
            );
          })}
          {!!legendTypes.length && (
            <g className="graph-svg-legend" transform="translate(28 510)">
              <rect className="legend-bg" width="924" height="34" rx="7" />
              {legendTypes.map((type, index) => (
                <g key={type} transform={`translate(${18 + index * 110} 21)`}>
                  <rect x="0" y="-11" width="24" height="12" rx="3" fill={graphColor(type, "#2cb7a0")} />
                  <text x="32" y="0">{type}</text>
                </g>
              ))}
            </g>
          )}
        </svg>
        <aside className="graph-insight-card knowledge-summary-card">
          <strong>{selectedNode?.label || "图谱摘要"}</strong>
          <span>{selectedNode ? `${selectedNode.type || "实体"} · 权重 ${selectedNode.count || 1}` : displayText}</span>
          <div className="mini-stat-grid">
            <b>{fullNodeTypeCount}</b><small>节点类型</small>
            <b>{fullEdgeCount}</b><small>关系边</small>
            <b>{fullTripleCount}</b><small>三元组</small>
          </div>
          <div className="triple-list">
            {(selectedTerm
              ? visibleTriples.filter((item) => [item.subject, item.predicate, item.object, item.subjectId, item.objectId].includes(selectedTerm)).slice(0, 8)
              : visibleTriples.slice(0, 8)
            ).map((item, index) => (
              <button className={selectedTerm && [item.subject, item.predicate, item.object, item.subjectId, item.objectId].includes(selectedTerm) ? "selected" : ""} type="button" key={`${item.subject}-${item.object}-${index}`} onClick={() => onTermSelect(selectedTerm === item.subject ? "" : item.subject)}>
                <span>{item.subject} <em>{item.predicate}</em> {item.object}</span>
              </button>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

function WilhelmKeywordNetwork({ graph, query, onQueryChange, onAlgorithmRefresh, onModelExtract, extracting, readOnly = false }) {
  const svgRef = useRef(null);
  const [category, setCategory] = useState("全部");
  const [selected, setSelected] = useState("");
  const rawTerms = graph?.terms || [];
  const categoryNotice = graph?.notice || (graph?.cached ? "已读取后端保存的关键词网络。" : graph?.fallback ? "已使用本地关键词网络。" : "关键词已由后端缓存生成。");
  function fineCategory(item) {
    const term = item.term || "";
    if (item.category) return item.category;
    if (/龙|虎|蛇|狐|牛|马|鸟|鱼|猴|鹿|兔/.test(term)) return "动物形象";
    if (/天|云|风|雨|雷|月|太阳|星|雪/.test(term)) return "自然气象";
    if (/神|仙|鬼|怪|魔|龙王|观音/.test(term)) return "神怪信仰";
    if (/皇帝|公主|王子|母亲|父亲|兄弟|妻子|老人/.test(term)) return "人物身份";
    if (/山|海|河|宫|村|庙|井|桥|田/.test(term)) return "空间场景";
    if (/报恩|惩罚|复仇|智慧|善良|忠诚|贪婪|仁慈/.test(term)) return "伦理母题";
    if (/变|救|求|逃|杀|娶|嫁|骗|赠|惩/.test(term)) return "行为事件";
    return "核心意象";
  }

  const enrichedTerms = rawTerms
    .filter((item) => !isWeakKeywordTerm(item))
    .map((item) => ({ ...item, fineCategory: fineCategory(item) }));
  const categories = ["全部", "动物形象", "自然气象", "神怪信仰", "人物身份", "空间场景", "伦理母题", "行为事件", "核心意象"];
  const requestedTerms = query.split(/[,，\s]+/).map((item) => item.trim()).filter(Boolean);
  const filteredTerms = enrichedTerms
    .filter((item) => category === "全部" || item.fineCategory === category)
    .filter((item) => !requestedTerms.length || requestedTerms.some((term) => item.term.includes(term) || term.includes(item.term)))
    .slice(0, category === "全部" ? 64 : 40);
  const visibleTermSet = new Set(filteredTerms.map((item) => item.term));
  let relations = (graph?.cooccurrence || []).filter((edge) => visibleTermSet.has(edge.source) && visibleTermSet.has(edge.target));
  if (relations.length < Math.min(46, Math.max(0, filteredTerms.length - 1))) {
    relations = [
      ...relations,
      ...filteredTerms.slice(0, 34).flatMap((item, index, arr) => arr.slice(index + 1, index + 4).map((target) => ({ source: item.term, target: target.term, weight: Math.max(1, Math.min(item.count, target.count) / 9) }))),
    ];
  }
  const nodes = filteredTerms.map((item) => ({ id: item.term, label: item.term, type: item.fineCategory, count: item.count, stories: item.stories }));
  const edges = relations
    .map((item) => ({ source: item.source, target: item.target, relation: "共现", weight: item.weight }))
    .sort((a, b) => Number(b.weight || 0) - Number(a.weight || 0))
    .slice(0, 168);
  const { positions, startDrag, moveDrag, endDrag } = useForceLayout({ nodes, edges }, 900, 486, 230, {
    repel: 3200,
    linkDistance: 166,
    coLinkDistance: 174,
    linkStrength: 0.0032,
    centerStrength: 0.0011,
    damping: 0.89,
    ticks: 330,
    paddingX: 34,
    paddingY: 32,
    orbitJitter: 34,
    verticalScale: 0.78,
    collisionPadding: 12,
    collisionRadius: 15,
    maxCollisionRadius: 50,
    maxVelocity: 22,
    clusterByType: true,
    clusterStrength: 0.0042,
    clusterRadiusX: 316,
    clusterRadiusY: 174,
  });
  const selectedTermItem = filteredTerms.find((item) => item.term === selected);
  const active = selectedTermItem || filteredTerms[0];
  const relatedTerms = useMemo(() => {
    if (!selectedTermItem) return new Set();
    return new Set(edges.filter((edge) => edge.source === selectedTermItem.term || edge.target === selectedTermItem.term).flatMap((edge) => [edge.source, edge.target]));
  }, [edges, selectedTermItem]);
  const legendCategories = categories.filter((item) => item !== "全部");
  const max = Math.max(1, ...filteredTerms.map((item) => item.count));
  const csvRows = [["keyword", "category", "count", "stories"], ...filteredTerms.map((item) => [item.term, item.fineCategory, item.count, (item.stories || []).map((story) => story.storyTitle).join(";")])];

  useEffect(() => {
    if (selected && !filteredTerms.some((item) => item.term === selected)) {
      setSelected("");
    }
  }, [filteredTerms, selected]);

  return (
    <div className="work-panel wilhelm-theme-panel">
      <div className="panel-title-row">
        <div><strong>关键词共现网络分析</strong><span>{categoryNotice}</span></div>
        <GraphExportButtons svgRef={svgRef} csvRows={csvRows} baseName="卫礼贤关键词共现网络分析">
          {!readOnly && (
            <>
              <button type="button" onClick={onAlgorithmRefresh}>算法提取</button>
              <button type="button" onClick={onModelExtract} disabled={extracting}>{extracting ? "抽取中..." : "大模型抽取关键词"}</button>
            </>
          )}
        </GraphExportButtons>
      </div>
      <div className="keyword-network-stack">
        <svg ref={svgRef} className="wilhelm-co-svg interactive-graph-svg" viewBox="0 0 900 540" role="img" aria-label="关键词共现网络分析" onPointerMove={moveDrag} onPointerUp={endDrag} onPointerLeave={endDrag}>
          <defs>
            <radialGradient id="keywordCanvasGlow" cx="48%" cy="42%" r="70%">
              <stop offset="0%" stopColor="#ffffff" />
              <stop offset="70%" stopColor="#fbfdff" />
              <stop offset="100%" stopColor="#edf7f4" />
            </radialGradient>
            <filter id="keywordNodeShadow"><feDropShadow dx="0" dy="7" stdDeviation="7" floodColor="#0f172a" floodOpacity="0.13" /></filter>
          </defs>
          <rect width="900" height="540" fill="url(#keywordCanvasGlow)" />
          {!nodes.length && (
            <g transform="translate(450 248)">
              <text className="atlas-title" textAnchor="middle">暂无关键词共现网络</text>
              <text className="atlas-subtitle" y="32" textAnchor="middle">{readOnly ? "当前范围暂无可用关键词关系数据。" : "点击“算法提取”后，系统将复用知识图谱的故事学分类抽取算法生成节点与共现关系。"}</text>
            </g>
          )}
          {edges.map((edge) => {
            const source = positions[edge.source];
            const target = positions[edge.target];
            if (!source || !target) return null;
            const sourceNode = nodes.find((node) => node.id === edge.source);
            const targetNode = nodes.find((node) => node.id === edge.target);
            const color = graphColor(sourceNode?.type || targetNode?.type, "#2cb7a0");
            const activeEdge = !selectedTermItem || edge.source === selectedTermItem.term || edge.target === selectedTermItem.term;
            const dx = target.x - source.x;
            const dy = target.y - source.y;
            const dist = Math.max(1, Math.hypot(dx, dy));
            const bend = (((edge.source.length + edge.target.length) % 5) - 2) * 6;
            const cx = (source.x + target.x) / 2 - (dy / dist) * bend;
            const cy = (source.y + target.y) / 2 + (dx / dist) * bend - 5;
            return <path key={`${edge.source}-${edge.target}`} d={`M${source.x},${source.y} Q${cx},${cy} ${target.x},${target.y}`} fill="none" stroke={color} strokeWidth={Math.min(5.2, 0.7 + (edge.weight || 1) / 7)} opacity={activeEdge ? 0.42 : 0.07} />;
          })}
          {nodes.map((node) => {
            const pos = positions[node.id];
            if (!pos) return null;
            const color = graphColor(node.type, "#2cb7a0");
            const radius = 11 + Math.sqrt(node.count / max) * 31;
            const activeNode = !selectedTermItem || node.label === selectedTermItem.term || relatedTerms.has(node.label);
            return (
              <g className="atlas-clickable drag-node" key={node.id} transform={`translate(${pos.x},${pos.y})`} onPointerDown={(event) => startDrag(event, node.id)} onPointerUp={(event) => { event.stopPropagation(); endDrag(); setSelected(node.label); }}>
                <circle r={radius + 6} fill={color} opacity={activeNode ? 0.12 : 0.025} />
                <circle r={radius} fill={color} fillOpacity={activeNode ? 0.88 : 0.22} stroke="#fff" strokeWidth="2" filter="url(#keywordNodeShadow)" />
                <text className="atlas-node-label wilhelm-node-label" y="5" textAnchor="middle">{short(node.label, radius > 34 ? 7 : 5)}</text>
              </g>
            );
          })}
          {!!legendCategories.length && (
            <g className="graph-svg-legend keyword-legend" transform="translate(20 488)">
              <rect className="legend-bg" width="860" height="44" rx="7" />
              {legendCategories.slice(0, 9).map((item, index) => (
                <g key={item} transform={`translate(${18 + (index % 5) * 168} ${index < 5 ? 17 : 35})`}>
                  <rect x="0" y="-10" width="24" height="12" rx="3" fill={graphColor(item, "#2cb7a0")} />
                  <text x="31" y="0">{item}</text>
                </g>
              ))}
            </g>
          )}
        </svg>
        <div className="keyword-network-bottom">
          <div className="keyword-control-panel">
            <div className="wilhelm-filter-row">
              {categories.map((item) => <button className={category === item ? "active" : ""} key={item} type="button" onClick={() => setCategory(item)}>{item}</button>)}
            </div>
            <label className="co-search">检索词汇
              <input value={query} onChange={(event) => onQueryChange(event.target.value)} placeholder="例如：龙 气象 鸟 公主" />
            </label>
          </div>
          <aside className="wilhelm-term-detail keyword-stat-panel">
            <div className="keyword-detail-head">
              <strong>{active?.term || "未选择"}</strong>
              <span>{active?.fineCategory} · 出现 {active?.count || 0} 次</span>
              <p>关系逻辑：{active?.term || "关键词"} - {active?.fineCategory || "类别"} - 具体故事</p>
            </div>
            <div className="keyword-stat-lists">
              <section>
                <b>关键词词频</b>
                <div className="keyword-bars">
                  {filteredTerms.slice(0, 12).map((item) => (
                    <button className={active?.term === item.term ? "selected" : ""} key={item.term} type="button" onClick={() => setSelected(item.term)}>
                      <span>{item.term}</span>
                      <small>{item.count} 次</small>
                      <i style={{ width: `${Math.max(8, (item.count / max) * 100)}%` }} />
                    </button>
                  ))}
                </div>
              </section>
              <section>
                <b>对应故事</b>
                <div className="linked-story-list">
                  {(active?.stories || []).slice(0, 12).map((story) => (
                    <button key={story.storyId} type="button">
                      <span>{story.storyTitle}</span>
                      <small>{story.count} 次</small>
                    </button>
                  ))}
                </div>
              </section>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}

const wilhelmChartEntries = [
  { id: "table", target: "table", title: "单篇译文表格", meta: "全文检索、分类筛选、译文证据回看" },
  { id: "knowledge", target: "graph", title: "卫礼贤《中国民间童话》知识图谱", meta: "后端自然语言算法与大模型双通道抽取" },
  { id: "keywords", target: "text", title: "关键词共现网络分析", meta: "后端关键词抽取、分类与共现关系计算" },
  { id: "structure", target: "structure", title: "单篇译文结构谱系", meta: "后端按分类、文本规模与来源重合度计算" },
  { id: "density", target: "density", title: "再版传播时间密度", meta: "后端按年代、出版城市、出版社与语种聚合" },
  { id: "route", target: "map", title: "故事来源及出版地参照图", meta: "中国来源地到德语区出版地传播路径" },
  { id: "publication", target: "publication", title: "卫礼贤《中国民间童话》再版出版地图", meta: "出版城市气泡、年份过滤与出版中心排行" },
  { id: "stats", target: "charts", title: "卫礼贤《中国民间童话》专题统计可视化", meta: "年份、语种、出版地、出版社对比统计" },
];

function WilhelmTopicMatrix({ anchorBase, records, stories, terms, graphEdges }) {
  function go(target) {
    document.getElementById(`${anchorBase}-${target}`)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }
  const counts = {
    table: stories.length,
    graph: graphEdges,
    text: terms,
    structure: stories.length,
    density: records.length,
    map: records.length,
    publication: records.length,
    charts: records.length,
  };
  return (
    <section className="work-panel wilhelm-topic-matrix" aria-label="卫礼贤专题图谱矩阵">
      <div className="panel-title-row">
        <div>
          <strong>卫礼贤《中国民间童话》专题图谱矩阵</strong>
          <span>下列图表均接入专题后端数据与算法结果，可点击进入对应图表。</span>
        </div>
      </div>
      <div className="wilhelm-topic-grid">
        {wilhelmChartEntries.map((entry) => (
          <button key={entry.id} type="button" onClick={() => go(entry.target)}>
            <span>{entry.title}</span>
            <strong>{counts[entry.target] ?? records.length}</strong>
            <small>{entry.meta}</small>
          </button>
        ))}
      </div>
    </section>
  );
}

function normalizeBackendStructure(analysis, stories) {
  const backendRows = analysis?.structure?.categories;
  if (Array.isArray(backendRows) && backendRows.length) {
    return backendRows.map((row) => ({
      ...row,
      sources: new Set(row.sources || []),
      examples: row.examples || [],
      avgLength: Number(row.avgLength || 0),
      sourceCount: Number(row.sourceCount || (row.sources || []).length || 0),
      count: Number(row.count || 0),
    }));
  }
  const map = new Map();
  stories.forEach((story) => {
    const key = story.category || "未分类";
    const row = map.get(key) || { category: key, count: 0, length: 0, sources: new Set(), examples: [] };
    row.count += 1;
    row.length += String(story.text || "").length;
    if (story.source) row.sources.add(story.source);
    if (row.examples.length < 4) row.examples.push(story.title);
    map.set(key, row);
  });
  return [...map.values()].map((row) => ({ ...row, avgLength: Math.round(row.length / Math.max(1, row.count)), sourceCount: row.sources.size })).sort((a, b) => b.count - a.count).slice(0, 11);
}

function normalizeBackendPeriods(analysis, records) {
  const backendRows = analysis?.timeDensity?.periods;
  if (Array.isArray(backendRows) && backendRows.length) {
    return backendRows.map((row) => ({
      ...row,
      count: Number(row.count || 0),
      publishers: new Set(row.publishers || []),
      cities: new Set(row.cities || []),
      languages: new Set(row.languages || []),
      examples: row.examples || [],
    }));
  }
  const map = new Map();
  records.forEach((record) => {
    const year = record.year || Number(String(record.yearText || "").match(/\d{4}/)?.[0]) || 0;
    const key = year ? String(Math.floor(year / 10) * 10) + "s" : "未记录";
    const row = map.get(key) || { period: key, count: 0, publishers: new Set(), cities: new Set(), languages: new Set(), examples: [] };
    row.count += 1;
    if (record.publisher) row.publishers.add(record.publisher);
    if (record.city) row.cities.add(record.city);
    if (record.language) row.languages.add(record.language);
    if (row.examples.length < 3) row.examples.push(record.title);
    map.set(key, row);
  });
  return [...map.values()].sort((a, b) => String(a.period).localeCompare(String(b.period)));
}

function normalizeBackendStructureLinks(analysis, categoryStats) {
  const backendLinks = analysis?.structure?.links;
  if (Array.isArray(backendLinks) && backendLinks.length) return backendLinks.slice(0, 14);
  const links = [];
  categoryStats.forEach((source, sourceIndex) => {
    categoryStats.slice(sourceIndex + 1).forEach((target, offset) => {
      const targetIndex = sourceIndex + offset + 1;
      const shared = [...(source.sources || new Set())].filter((item) => target.sources?.has(item)).length;
      if (shared) links.push({ sourceIndex, targetIndex, weight: shared });
    });
  });
  return links.sort((a, b) => b.weight - a.weight).slice(0, 14);
}

function WilhelmAdvancedVisuals({ stories, records, analysis, anchorBase = "kb-stories-wilhelm" }) {
  const [selectedCategory, setSelectedCategory] = useState("");
  const [selectedPeriod, setSelectedPeriod] = useState("");
  const categoryStats = useMemo(() => normalizeBackendStructure(analysis, stories), [analysis, stories]);
  const periodStats = useMemo(() => normalizeBackendPeriods(analysis, records), [analysis, records]);
  const maxCategory = Math.max(1, ...categoryStats.map((item) => item.count));
  const maxAvgLength = Math.max(1, ...categoryStats.map((item) => item.avgLength));
  const maxPeriod = Math.max(1, ...periodStats.map((item) => item.count));
  const activeCategory = categoryStats.find((item) => item.category === selectedCategory) || categoryStats[0];
  const activePeriod = periodStats.find((item) => item.period === selectedPeriod) || periodStats[0];
  const categoryLinks = useMemo(() => normalizeBackendStructureLinks(analysis, categoryStats), [analysis, categoryStats]);
  const categoryPlot = { left: 118, right: 820, top: 76, bottom: 350, width: 702, height: 274 };
  const periodPlot = { left: 74, right: 828, top: 76, bottom: 342, width: 754, height: 266 };
  const periodPoints = periodStats.map((item, index) => {
    const x = periodPlot.left + index * (periodPlot.width / Math.max(1, periodStats.length - 1));
    const y = periodPlot.bottom - (item.count / maxPeriod) * periodPlot.height;
    return { ...item, x, y };
  });
  return (
    <div className="wilhelm-advanced-grid">
      <div id={`${anchorBase}-structure`} className="work-panel advanced-visual-panel kb-anchor-target">
        <div className="panel-title-row"><div><strong>单篇译文结构谱系</strong><span>{analysis?.structure?.method || "分类数量、文本规模与来源复杂度的复合视图，可点击类别查看样本。"}</span></div></div>
        <svg viewBox="0 0 900 480" className="advanced-visual-svg" role="img" aria-label="单篇译文结构谱系">
          <rect width="900" height="480" fill="#fff" />
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
            const x = categoryPlot.left + tick * categoryPlot.width;
            return <g key={tick}><line x1={x} y1={categoryPlot.top} x2={x} y2={categoryPlot.bottom} stroke="#e2edf8" /><text x={x} y={categoryPlot.bottom + 22} textAnchor="middle" className="axis-label">{Math.round(tick * maxCategory)}</text></g>;
          })}
          <line x1={categoryPlot.left} y1={categoryPlot.bottom} x2={categoryPlot.right} y2={categoryPlot.bottom} stroke="#8aa8c7" />
          <line x1={categoryPlot.left} y1={categoryPlot.top} x2={categoryPlot.left} y2={categoryPlot.bottom} stroke="#8aa8c7" />
          <text x={categoryPlot.right - 10} y={categoryPlot.bottom + 42} textAnchor="end" className="axis-label">故事篇数</text>
          <g opacity="0.46">
            {categoryLinks.map((link) => {
              const y1 = categoryPlot.top + link.sourceIndex * (categoryPlot.height / Math.max(1, categoryStats.length - 1));
              const y2 = categoryPlot.top + link.targetIndex * (categoryPlot.height / Math.max(1, categoryStats.length - 1));
              return <path key={`${link.sourceIndex}-${link.targetIndex}`} d={`M${categoryPlot.right - 36},${y1} C${categoryPlot.right + 42},${y1} ${categoryPlot.right + 42},${y2} ${categoryPlot.right - 36},${y2}`} fill="none" stroke="#14a889" strokeWidth={Math.min(8, 1 + link.weight * 1.6)} />;
            })}
          </g>
          {categoryStats.map((item, index) => {
            const y = categoryPlot.top + index * (categoryPlot.height / Math.max(1, categoryStats.length - 1));
            const width = (item.count / maxCategory) * (categoryPlot.width - 130);
            const active = activeCategory?.category === item.category;
            return (
              <g key={item.category} className="atlas-clickable" onClick={() => setSelectedCategory(item.category)}>
                <line x1={categoryPlot.left} y1={y} x2={categoryPlot.right} y2={y} stroke="#edf4fb" />
                <text x="20" y={y + 5} className="axis-label">{short(item.category, 8)}</text>
                <rect x={categoryPlot.left} y={y - 10} width={width} height="20" rx="4" fill={active ? "#0b66b2" : "#9cc9e8"} opacity={active ? 0.92 : 0.62} />
                <circle cx={categoryPlot.left + width + 34} cy={y} r={8 + (item.avgLength / maxAvgLength) * 13} fill={["#14a889", "#f59e0b", "#7c3aed", "#ef4444"][index % 4]} opacity="0.78" stroke="#fff" strokeWidth="2" />
                <circle cx={categoryPlot.left + width + 84} cy={y} r={6 + Math.min(16, item.sourceCount * 1.15)} fill="#fff" stroke="#0b66b2" strokeWidth="2" />
                <text x={categoryPlot.left + width + 118} y={y + 5} className="axis-label">{item.count}篇</text>
              </g>
            );
          })}
          <g className="chart-legend">
            <circle cx="132" cy="36" r="8" fill="#14a889" /><text x="146" y="40" className="axis-label">圆点=平均文本长度</text>
            <circle cx="314" cy="36" r="8" fill="#fff" stroke="#0b66b2" strokeWidth="2" /><text x="328" y="40" className="axis-label">空心圆=来源复杂度</text>
            <path d="M514,36 C542,18 570,18 598,36" fill="none" stroke="#14a889" strokeWidth="3" opacity="0.5" /><text x="612" y="40" className="axis-label">弧线=来源重合</text>
          </g>
          <g className="chart-detail-chip">
            <rect x="94" y="392" width="760" height="64" rx="6" fill="#f8fbff" stroke="#d8e6f4" />
            <foreignObject x="110" y="398" width="728" height="52">
              <div className="chart-detail-box">
                <strong>当前类别：{activeCategory?.category}</strong>
                <span>篇数 {activeCategory?.count} · 平均文本长度 {activeCategory?.avgLength} · 来源类型 {activeCategory?.sourceCount} · 样本：{(activeCategory?.examples || []).join(" / ")}</span>
              </div>
            </foreignObject>
          </g>
        </svg>
      </div>
      <div id={`${anchorBase}-density`} className="work-panel advanced-visual-panel kb-anchor-target">
        <div className="panel-title-row"><div><strong>再版传播时间密度</strong><span>{analysis?.timeDensity?.method || "时间密度、出版地丰富度与出版社网络的复合视图，可点击时间段查看传播结构。"}</span></div></div>
        <svg viewBox="0 0 900 480" className="advanced-visual-svg" role="img" aria-label="再版传播时间密度">
          <rect width="900" height="480" fill="#fff" />
          {[0, 0.25, 0.5, 0.75, 1].map((tick) => {
            const y = periodPlot.bottom - tick * periodPlot.height;
            return <g key={tick}><line x1={periodPlot.left} y1={y} x2={periodPlot.right} y2={y} stroke="#e2edf8" /><text x={periodPlot.left - 12} y={y + 5} textAnchor="end" className="axis-label">{Math.round(tick * maxPeriod)}</text></g>;
          })}
          <line x1={periodPlot.left} y1={periodPlot.bottom} x2={periodPlot.right} y2={periodPlot.bottom} stroke="#8aa8c7" />
          <line x1={periodPlot.left} y1={periodPlot.top} x2={periodPlot.left} y2={periodPlot.bottom} stroke="#8aa8c7" />
          <text x={periodPlot.left} y={periodPlot.top - 18} className="axis-label">记录数</text>
          <path d={periodPoints.map((point, index) => `${index ? "L" : "M"}${point.x},${point.y}`).join(" ")} fill="none" stroke="#0b66b2" strokeWidth="4" />
          {periodPoints.slice(1).map((point, index) => {
            const prev = periodPoints[index];
            return <path key={`${prev.period}-${point.period}`} d={`M${prev.x},${periodPlot.bottom} C${prev.x + 40},${periodPlot.top + 30} ${point.x - 40},${periodPlot.top + 30} ${point.x},${periodPlot.bottom}`} fill="none" stroke="#14a889" strokeWidth={Math.max(1, Math.min(8, point.count + prev.count))} opacity="0.16" />;
          })}
          {periodPoints.map((item) => {
            const active = activePeriod?.period === item.period;
            return (
              <g key={item.period} className="atlas-clickable" onClick={() => setSelectedPeriod(item.period)}>
                <rect x={item.x - 16} y={item.y} width="32" height={periodPlot.bottom - item.y} fill={active ? "#0b66b2" : "#9cc9e8"} opacity={active ? 0.82 : 0.45} />
                <circle cx={item.x} cy={item.y} r={10 + item.cities.size * 3 + item.publishers.size} fill="#f59e0b" opacity="0.74" stroke="#fff" strokeWidth="2" />
                <text x={item.x} y={periodPlot.bottom + 26} textAnchor="middle" className="axis-label">{item.period}</text>
              </g>
            );
          })}
          <g className="chart-detail-chip">
            <rect x="80" y="392" width="780" height="64" rx="6" fill="#f8fbff" stroke="#d8e6f4" />
            <foreignObject x="102" y="398" width="736" height="52">
              <div className="chart-detail-box">
                <strong>当前时间段：{activePeriod?.period}</strong>
                <span>记录 {activePeriod?.count} · 城市 {activePeriod?.cities.size} · 出版社 {activePeriod?.publishers.size} · 语种 {activePeriod?.languages.size} · 样本：{(activePeriod?.examples || []).join(" / ")}</span>
              </div>
            </foreignObject>
          </g>
        </svg>
      </div>
    </div>
  );
}

function StoryPreviewModal({ story, draft, onChange, onSave, onClose, onOpenWindow, readOnly = false }) {
  if (!story) return null;
  const meta = [story.source, story.category].filter(Boolean).join(" · ");
  return (
    <div className="modal-backdrop" role="dialog" aria-modal="true">
      <div className="story-preview-modal">
        <div className="panel-title-row">
          <div><strong>{story.title}</strong><span>{meta}</span></div>
          <div className="upload-actions">
            <button type="button" onClick={onOpenWindow}>单独窗口打开</button>
            {!readOnly && <button type="button" onClick={onSave}>保存单条数据</button>}
            <button type="button" onClick={onClose}>关闭</button>
          </div>
        </div>
        <label>故事名<input value={draft.title || ""} readOnly={readOnly} onChange={(event) => onChange({ ...draft, title: event.target.value })} /></label>
        <label>故事来源<input value={draft.source || ""} readOnly={readOnly} onChange={(event) => onChange({ ...draft, source: event.target.value })} /></label>
        <label>卫礼贤分类<input value={draft.category || ""} readOnly={readOnly} onChange={(event) => onChange({ ...draft, category: event.target.value })} /></label>
        <label>译文内容<textarea value={draft.text || ""} readOnly={readOnly} onChange={(event) => onChange({ ...draft, text: event.target.value })} /></label>
      </div>
    </div>
  );
}

export function WilhelmStoriesWorkbench({ embedded = false, anchorBase = "kb-stories-wilhelm", focused = false } = {}) {
  const baseRecords = storyData.wilhelmEditions || [];
  const [uploaded, setUploaded] = useState(() => loadWilhelmRecords());
  const [storyDrafts, setStoryDrafts] = useState(() => loadStoryDrafts());
  const [selectedId, setSelectedId] = useState(baseRecords[0]?.id || "");
  const [notice, setNotice] = useState("");
  const [backendVisuals, setBackendVisuals] = useState(null);
  const [backendGraphs, setBackendGraphs] = useState(null);
  const [backendAnalysis, setBackendAnalysis] = useState(null);
  const [visualNotice, setVisualNotice] = useState("");
  const [keywordNetworkNotice, setKeywordNetworkNotice] = useState(embedded ? "展示当前已接入的关键词共现网络。" : "尚未提取关键词共现网络，请点击“算法提取”。");
  const [storyQuery, setStoryQuery] = useState("");
  const [storyTitleQuery, setStoryTitleQuery] = useState("");
  const [storyTextQuery, setStoryTextQuery] = useState("");
  const [recordQuery, setRecordQuery] = useState("");
  const [highlightTerm, setHighlightTerm] = useState("");
  const [networkQuery, setNetworkQuery] = useState("");
  const [knowledgeGraphCache, setKnowledgeGraphCache] = useState(() => loadKnowledgeGraphCache());
  const [knowledgeNotice, setKnowledgeNotice] = useState("");
  const [extractingGraph, setExtractingGraph] = useState(false);
  const [extractingKeywords, setExtractingKeywords] = useState(false);
  const extractControllerRef = useRef(null);
  const [selectedStoryId, setSelectedStoryId] = useState("all");
  const [previewStoryId, setPreviewStoryId] = useState("");
  const [previewDraft, setPreviewDraft] = useState(null);
  const records = useMemo(() => [...baseRecords, ...uploaded], [baseRecords, uploaded]);
  const selected = records.find((item) => item.id === selectedId) || records[0];
  const fallbackFlows = useMemo(() => records.map(recordFlow), [records]);
  const flows = backendVisuals?.flows?.length ? backendVisuals.flows : fallbackFlows;
  const stories = useMemo(() => (storyData.wilhelmStories || []).map((story) => {
    const draft = storyDrafts[story.id] || {};
    const normalizedTitle = String(draft.title || story.title || "").replace(/\s/g, "");
    const category = WILHELM_CATEGORY_OVERRIDES.get(normalizedTitle) || draft.category || story.category;
    return { ...story, ...draft, category };
  }), [storyDrafts]);
  const storyTableRows = useMemo(() => {
    const preface = { ...WILHELM_PREFACE_ROW, ...(storyDrafts[WILHELM_PREFACE_ROW.id] || {}), source: "", category: "", isTableOnly: true };
    return [preface, ...stories];
  }, [stories, storyDrafts]);
  const generatedGraphBundle = useMemo(() => ({
    total: backendAnalysis?.total || storyData.wilhelmThemeGraph || { terms: [], cooccurrence: [], nodes: [], edges: [], notice: keywordNetworkNotice },
    byStory: backendAnalysis?.byStory || storyData.wilhelmStoryGraphs || {},
  }), [backendAnalysis, keywordNetworkNotice]);
  const graphBundle = backendGraphs || generatedGraphBundle;
  const selectedStoryGraph = selectedStoryId === "all" ? null : graphBundle.byStory?.[selectedStoryId];
  const effectiveGraph = selectedStoryGraph || graphBundle.total || { terms: [], cooccurrence: [], notice: keywordNetworkNotice };
  const selectedStory = stories.find((story) => story.id === selectedStoryId);
  const knowledgeScopeId = selectedStoryId === "all" ? "wilhelm-total" : selectedStoryId;
  const knowledgeScopeTitle = selectedStory ? `${selectedStory.title} 知识图谱` : "卫礼贤《中国民间童话》知识图谱";
  const knowledgeScopeText = selectedStory
    ? String(selectedStory.text || "").slice(0, 8000)
    : stories.map((story) => `${story.title}\n${String(story.text || "").slice(0, 420)}`).join("\n\n").slice(0, 12000);
  const selectedKnowledgeGraph = knowledgeGraphCache[knowledgeScopeId]
    || (selectedStoryId === "all" ? backendAnalysis?.total : backendAnalysis?.byStory?.[selectedStoryId])
    || null;
  const previewStory = storyTableRows.find((story) => story.id === previewStoryId);
  const storyTable = useSortableRows(storyTableRows, storyQuery, ["title", "category", "source", "text"]);
  const recordTable = useSortableRows(records, recordQuery, ["title", "foreignTitle", "yearText", "edition", "language", "publisher", "city", "country", "province", "note"]);
  const filteredStories = storyTable.rows.filter((story) => {
    const titleOk = !storyTitleQuery.trim() || String(story.title || "").includes(storyTitleQuery.trim());
    const textOk = !storyTextQuery.trim() || String(story.text || "").includes(storyTextQuery.trim());
    return titleOk && textOk;
  });

  useEffect(() => {
    let canceled = false;
    setVisualNotice("");
    api.wilhelmVisuals(records)
      .then((data) => { if (!canceled) setBackendVisuals(data); })
      .catch((error) => {
        if (!canceled) {
          setBackendVisuals(null);
          setVisualNotice(`后端专题图生成失败，暂用本地表格数据预览：${error.message}`);
        }
      });
    return () => { canceled = true; };
  }, [records]);

  useEffect(() => {
    setBackendGraphs(null);
    setKeywordNetworkNotice(embedded ? "展示当前已接入的关键词共现网络。" : "尚未提取关键词共现网络，请点击“算法提取”。");
  }, [embedded, stories]);

  useEffect(() => {
    let canceled = false;
    api.wilhelmStoryAnalysis({ stories, records })
      .then((data) => {
        if (!canceled) setBackendAnalysis(data);
      })
      .catch(() => {
        if (!canceled) setBackendAnalysis(null);
      });
    return () => { canceled = true; };
  }, [records, stories]);

  useEffect(() => {
    if (knowledgeGraphCache[knowledgeScopeId]) {
      setKnowledgeNotice(embedded ? "已读取专题知识图谱。" : "已读取本地保存的知识图谱。");
      return;
    }
    if (selectedKnowledgeGraph?.nodes?.length) {
      setKnowledgeNotice(embedded ? "已接入后端自然语言算法生成的知识图谱。" : "已接入后端自然语言算法生成的知识图谱，可继续使用算法抽取或大模型抽取刷新。");
      return;
    }
    setKnowledgeNotice(embedded ? "当前范围暂无可用知识图谱。" : "当前范围尚未生成知识图谱，可点击“算法抽取”或“大模型抽取”。");
  }, [embedded, knowledgeGraphCache, knowledgeScopeId, selectedKnowledgeGraph]);

  async function extractKnowledgeGraph() {
    extractControllerRef.current?.abort();
    const controller = new AbortController();
    extractControllerRef.current = controller;
    setExtractingGraph(true);
    setKnowledgeNotice("正在调用智能问答同一套大模型接口抽取知识图谱...");
    try {
      const data = await api.wilhelmKnowledgeGraph({
        scopeId: knowledgeScopeId,
        title: knowledgeScopeTitle,
        text: knowledgeScopeText,
        force: true,
        method: "llm",
      }, { signal: controller.signal });
      const next = { ...knowledgeGraphCache, [knowledgeScopeId]: data.graph };
      setKnowledgeGraphCache(next);
      if (data.fallback) {
        setKnowledgeNotice(data.graph?.notice || "大模型暂未返回可用文本，已临时显示本地图谱。");
      } else {
        saveKnowledgeGraphCache(next);
        setKnowledgeNotice("知识图谱已抽取并保存。");
      }
    } catch (error) {
      if (!(error?.name === "AbortError" || String(error?.message || "").includes("终止"))) {
        try {
          const data = await api.wilhelmKnowledgeGraph({
            scopeId: knowledgeScopeId,
            title: knowledgeScopeTitle,
            text: knowledgeScopeText,
            force: true,
            method: "algorithm",
          }, { signal: controller.signal });
          const next = { ...knowledgeGraphCache, [knowledgeScopeId]: data.graph };
          setKnowledgeGraphCache(next);
          saveKnowledgeGraphCache(next);
          setKnowledgeNotice("大模型接口暂不可用，已自动切换为后端自然语言算法抽取并保存知识图谱。");
          return;
        } catch (algorithmError) {
          if (algorithmError?.name === "AbortError" || String(algorithmError?.message || "").includes("终止")) {
            setKnowledgeNotice("知识图谱抽取已终止。");
            return;
          }
        }
      }
      if (error?.name === "AbortError" || String(error?.message || "").includes("终止")) {
        setKnowledgeNotice("知识图谱抽取已终止。");
        return;
      }
      try {
        const prompt = [
          "请只输出 JSON，不要输出解释。",
          "根据下面译文抽取知识图谱，JSON 结构为：",
          "{\"nodes\":[{\"id\":\"n1\",\"label\":\"节点名\",\"type\":\"人物/动物/神怪/空间/母题/事件/物象\",\"count\":1,\"summary\":\"说明\"}],\"edges\":[{\"source\":\"n1\",\"target\":\"n2\",\"relation\":\"关系\",\"weight\":1}]}",
          "节点 20-45 个，关系 35-90 条，突出角色、动物、形象、空间、事件、母题和象征。",
          `标题：${knowledgeScopeTitle}`,
          `译文：${knowledgeScopeText}`,
        ].join("\n");
        const fallback = await api.chat({ question: prompt, sectionId: "stories", provider: "gpt", model: "", retrievalMode: "none", attachments: [] }, { signal: controller.signal });
        const graph = normalizeChatGraph(extractJsonObject(fallback.answer), knowledgeScopeTitle);
        const next = { ...knowledgeGraphCache, [knowledgeScopeId]: graph };
        setKnowledgeGraphCache(next);
        saveKnowledgeGraphCache(next);
        setKnowledgeNotice("已通过智能问答接口抽取并保存知识图谱。");
      } catch (fallbackError) {
        if (fallbackError?.name === "AbortError" || String(fallbackError?.message || "").includes("终止")) {
          setKnowledgeNotice("知识图谱抽取已终止。");
          return;
        }
        setKnowledgeNotice(`知识图谱抽取失败：${modelErrorMessage(fallbackError || error)}`);
      }
    } finally {
      if (extractControllerRef.current === controller) extractControllerRef.current = null;
      setExtractingGraph(false);
    }
  }

  async function extractAlgorithmKnowledgeGraph() {
    setKnowledgeNotice("正在使用后端自然语言算法抽取知识图谱...");
    try {
      const data = await api.wilhelmKnowledgeGraph({
        scopeId: knowledgeScopeId,
        title: knowledgeScopeTitle,
        text: knowledgeScopeText,
        force: true,
        method: "algorithm",
      });
      const next = { ...knowledgeGraphCache, [knowledgeScopeId]: data.graph };
      setKnowledgeGraphCache(next);
      saveKnowledgeGraphCache(next);
      setKnowledgeNotice("已使用后端自然语言算法抽取知识图谱；可选择大模型抽取覆盖。");
    } catch (error) {
      const text = String(error?.message || "");
      setKnowledgeNotice(text.includes("Responses API") ? "算法抽取失败：当前后端仍在运行旧版本接口，请重启后端服务后再试。" : `算法抽取失败：${modelErrorMessage(error)}`);
    }
  }

  async function refreshKeywordNetwork(method = "algorithm") {
    setExtractingKeywords(method === "llm");
    setKeywordNetworkNotice(method === "llm" ? "正在调用大模型抽取关键词并覆盖保存..." : "正在使用后端自然语言算法提取关键词网络...");
    try {
      const data = await api.wilhelmKeywordNetwork({ stories, method, force: true });
      const notice = method === "llm" && data.source === "llm" ? "大模型关键词已抽取并覆盖保存。" : "已使用后端自然语言算法提取关键词网络。";
      setBackendGraphs({
        ...data,
        total: { ...data.total, cached: data.cached, fallback: data.fallback, notice },
        byStory: Object.fromEntries(Object.entries(data.byStory || {}).map(([key, value]) => [key, { ...value, cached: data.cached, fallback: data.fallback, notice }])),
      });
      setKeywordNetworkNotice(notice);
    } catch (error) {
      setKeywordNetworkNotice(`${method === "llm" ? "大模型关键词抽取" : "算法关键词抽取"}失败：${modelErrorMessage(error)}`);
    } finally {
      setExtractingKeywords(false);
    }
  }

  function abortKnowledgeExtraction() {
    extractControllerRef.current?.abort();
    extractControllerRef.current = null;
    setExtractingGraph(false);
    setKnowledgeNotice("知识图谱抽取已终止。");
  }

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const rows = await parseTableFile(file);
      const next = [...uploaded, ...rows.map((row, index) => normalizeRecord(row, index, file.name))];
      setUploaded(next);
      saveWilhelmRecords(next);
      setNotice(`已保存 ${rows.length} 条卫礼贤《中国民间童话》补充记录。`);
      if (!selectedId && next[0]) setSelectedId(next[0].id);
    } catch (error) {
      setNotice(`上传失败：${error.message}`);
    } finally {
      event.target.value = "";
    }
  }

  function clearUploads() {
    setUploaded([]);
    saveWilhelmRecords([]);
    setNotice("已清空本地上传的补充记录，新表格数据仍保留。");
  }

  function openPreview(story) {
    setPreviewStoryId(story.id);
    setPreviewDraft({ title: story.title, source: story.source, category: story.category, text: story.text });
  }

  function savePreview() {
    const next = { ...storyDrafts, [previewStoryId]: previewDraft };
    setStoryDrafts(next);
    saveStoryDrafts(next);
    setNotice(`已保存单条译文数据：${previewDraft.title}`);
    setPreviewStoryId("");
  }

  function openPreviewWindow() {
    const win = window.open("", "_blank", "width=920,height=760");
    if (!win) return;
    win.document.write(`<html><head><title>${previewDraft.title}</title><style>body{font-family:"Microsoft YaHei",sans-serif;line-height:1.8;padding:32px;color:#123}h1{color:#0b66b2}pre{white-space:pre-wrap}</style></head><body><h1>${previewDraft.title}</h1><p>${previewDraft.source || ""} · ${previewDraft.category || ""}</p><pre>${previewDraft.text || ""}</pre></body></html>`);
    win.document.close();
  }

  function exportStories() {
    const rows = [["title", "source", "category", "text"], ...filteredStories.map((story) => [story.title, story.source, story.category, story.text])];
    downloadTextFile("卫礼贤单篇译文故事表格.csv", toCsv(rows), "text/csv;charset=utf-8");
  }

  function exportRecords() {
    const rows = [["title", "year", "edition", "language", "publisher", "place", "province", "note"], ...recordTable.rows.map((record) => [record.title, record.yearText, record.edition, record.language, record.publisher, `${record.city} ${record.country}`, record.province, record.note])];
    downloadTextFile("卫礼贤再版及传播表格.csv", toCsv(rows), "text/csv;charset=utf-8");
  }

  if (focused) {
    return (
      <section className={`wilhelm-page ${embedded ? "wilhelm-page-embedded" : ""}`}>
        {!embedded && (
          <div className="wilhelm-hero">
            <div>
              <strong>卫礼贤《中国民间童话》专题库</strong>
              <span>单篇译文结构谱系 / 再版传播时间密度 / 知识图谱 / 关键词共现网络</span>
            </div>
            <button type="button" onClick={() => { window.location.hash = "knowledge"; }}>返回德译故事集</button>
          </div>
        )}

        <WilhelmAdvancedVisuals stories={stories} records={records} analysis={backendAnalysis} anchorBase={anchorBase} />

        <div id={`${anchorBase}-graph`} className="wilhelm-atlas-grid kb-anchor-target">
          <WilhelmKnowledgeGraph graph={selectedKnowledgeGraph} selectedTerm={highlightTerm} onTermSelect={setHighlightTerm} title={knowledgeScopeTitle} onExtract={extractKnowledgeGraph} onAlgorithmExtract={extractAlgorithmKnowledgeGraph} onAbort={abortKnowledgeExtraction} extracting={extractingGraph} cacheState={knowledgeNotice} readOnly />
          <div id={`${anchorBase}-text`} className="kb-anchor-target">
            <WilhelmKeywordNetwork graph={effectiveGraph} query={networkQuery} onQueryChange={setNetworkQuery} onAlgorithmRefresh={() => refreshKeywordNetwork("algorithm")} onModelExtract={() => refreshKeywordNetwork("llm")} extracting={extractingKeywords} readOnly />
          </div>
        </div>

        <div id={`${anchorBase}-charts`} className="kb-stats-bottom kb-anchor-target">
          <StatisticsPanel items={tableRows(records)} title="卫礼贤《中国民间童话》专题统计可视化" />
        </div>

        <StoryPreviewModal
          story={previewStory}
          draft={previewDraft}
          onChange={setPreviewDraft}
          onSave={savePreview}
          onClose={() => setPreviewStoryId("")}
          onOpenWindow={openPreviewWindow}
          readOnly
        />
      </section>
    );
  }

  return (
    <section className={`wilhelm-page ${embedded ? "wilhelm-page-embedded" : ""}`}>
      {!embedded && (
        <div className="wilhelm-hero">
          <div>
            <strong>卫礼贤《中国民间童话》专题库</strong>
            <span>故事文本 / 关键词共现 / 知识图谱 / 再版传播地图</span>
          </div>
          <button type="button" onClick={() => { window.location.hash = "knowledge"; }}>返回德译故事集</button>
        </div>
      )}

      <div className="story-kpis">
        <div><b>{records.length}</b><span>再版传播记录</span></div>
        <div><b>{stories.length}</b><span>单篇故事文本</span></div>
        <div><b>{effectiveGraph?.terms?.length || 0}</b><span>自动抽取关键词</span></div>
        <div><b>{effectiveGraph?.triples?.length || effectiveGraph?.edges?.length || 0}</b><span>关系三元组</span></div>
      </div>

      {embedded && (
        <WilhelmTopicMatrix
          anchorBase={anchorBase}
          records={records}
          stories={stories}
          terms={effectiveGraph?.terms?.length || 0}
          graphEdges={selectedKnowledgeGraph?.edges?.length || backendAnalysis?.total?.edges?.length || 0}
        />
      )}

      <div id={`${anchorBase}-table`} className="work-panel wilhelm-story-text-panel kb-anchor-target">
        <div className="panel-title-row">
          <div><strong>单篇译文故事表格</strong></div>
          <div className="upload-actions">
            <button type="button" onClick={exportStories}>导出数据</button>
          </div>
        </div>
        <div className="table-tools">
          <label>综合检索<input value={storyQuery} onChange={(event) => setStoryQuery(event.target.value)} placeholder="分类、来源、故事名、译文" /></label>
          <label>从故事名检索<input value={storyTitleQuery} onChange={(event) => setStoryTitleQuery(event.target.value)} placeholder="如：龙公主" /></label>
          <label>从译文中检索<input value={storyTextQuery} onChange={(event) => setStoryTextQuery(event.target.value)} placeholder="如：气象、动物、神仙" /></label>
          <label>分类筛选<input value={storyTable.filters.category || ""} onChange={(event) => storyTable.updateFilter("category", event.target.value)} placeholder="卫礼贤分类" /></label>
        </div>
        <div className="kb-table-wrap nested-table-wrap wilhelm-table-wrap">
          <table className="kb-table story-table">
            <thead>
              <tr>
                <th><SortHeader label="单篇译文故事名" keyName="title" sort={storyTable.sort} onSort={storyTable.toggleSort} /></th>
                <th><SortHeader label="故事来源" keyName="source" sort={storyTable.sort} onSort={storyTable.toggleSort} /></th>
                <th><SortHeader label="卫礼贤分类" keyName="category" sort={storyTable.sort} onSort={storyTable.toggleSort} /></th>
                <th>译文内容摘录</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {filteredStories.slice(0, 180).map((story) => (
                <tr className={selectedStoryId === story.id ? "selected" : ""} key={story.id} onClick={() => { if (!story.isTableOnly) setSelectedStoryId(story.id); setHighlightTerm(""); }}>
                  <td><strong>{story.title}</strong></td>
                  <td>{story.isTableOnly ? "" : story.source || "未记录"}</td>
                  <td>{story.isTableOnly ? "" : story.category}</td>
                  <td><button className="text-preview-button" type="button" onClick={(event) => { event.stopPropagation(); openPreview(story); }}>{short(story.text, 90)}</button></td>
                  <td><button className="row-action-button" type="button" onClick={(event) => { event.stopPropagation(); openPreview(story); }}>{embedded ? "预览" : "预览/保存"}</button></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="work-panel wilhelm-upload-panel">
        <div className="panel-title-row">
          <div><strong>再版及传播表格</strong></div>
          <div className="upload-actions">
            <button type="button" onClick={exportRecords}>导出数据</button>
            {!embedded && <label className="upload-button compact-upload">上传补充表<input type="file" accept=".xlsx,.xls,.csv,.tsv,.json" onChange={handleUpload} /></label>}
            {!embedded && uploaded.length > 0 && <button type="button" onClick={clearUploads}>清空本地上传</button>}
          </div>
        </div>
        {!embedded && notice && <p className="local-save-notice">{notice}</p>}
        <div className="table-tools">
          <label>综合检索<input value={recordQuery} onChange={(event) => setRecordQuery(event.target.value)} placeholder="题名、年份、语种、出版地、出版社" /></label>
          <label>年份筛选<input value={recordTable.filters.yearText || ""} onChange={(event) => recordTable.updateFilter("yearText", event.target.value)} placeholder="如 1914" /></label>
          <label>语种筛选<input value={recordTable.filters.language || ""} onChange={(event) => recordTable.updateFilter("language", event.target.value)} placeholder="德语" /></label>
          <label>出版地筛选<input value={recordTable.filters.city || ""} onChange={(event) => recordTable.updateFilter("city", event.target.value)} placeholder="Jena" /></label>
        </div>
        <div className="kb-table-wrap nested-table-wrap wilhelm-table-wrap">
          <table className="kb-table story-table">
            <thead>
              <tr>
                <th><SortHeader label="题名" keyName="title" sort={recordTable.sort} onSort={recordTable.toggleSort} /></th>
                <th><SortHeader label="年份" keyName="year" sort={recordTable.sort} onSort={recordTable.toggleSort} /></th>
                <th><SortHeader label="再版/改编" keyName="edition" sort={recordTable.sort} onSort={recordTable.toggleSort} /></th>
                <th><SortHeader label="语种" keyName="language" sort={recordTable.sort} onSort={recordTable.toggleSort} /></th>
                <th><SortHeader label="出版社" keyName="publisher" sort={recordTable.sort} onSort={recordTable.toggleSort} /></th>
                <th><SortHeader label="出版地" keyName="city" sort={recordTable.sort} onSort={recordTable.toggleSort} /></th>
                <th><SortHeader label="来源地区" keyName="province" sort={recordTable.sort} onSort={recordTable.toggleSort} /></th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {recordTable.rows.map((record) => (
                <tr className={selected?.id === record.id ? "selected" : ""} key={record.id} onClick={() => setSelectedId(record.id)}>
                  <td><strong>{record.title}</strong><small>{record.foreignTitle}</small></td>
                  <td>{record.yearText}</td>
                  <td>{record.edition}</td>
                  <td>{record.language}</td>
                  <td>{record.publisher}</td>
                  <td>{record.city} - {record.country}</td>
                  <td>{record.province}</td>
                  <td>{record.note || "未记录"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="work-panel wilhelm-story-graph-switch">
        <div className="panel-title-row">
          <div>
            <strong>{selectedStory ? `单篇图谱：${selectedStory.title}` : "全书图谱：卫礼贤《中国民间童话》"}</strong>
          </div>
          <label><span>图谱范围</span>
            <select value={selectedStoryId} onChange={(event) => { setSelectedStoryId(event.target.value); setHighlightTerm(""); }}>
              <option value="all">全书图谱 / 网络图</option>
              {stories.map((story) => <option key={story.id} value={story.id}>{story.title}</option>)}
            </select>
          </label>
        </div>
      </div>

      <div id={embedded ? `${anchorBase}-graph` : undefined} className="wilhelm-atlas-grid kb-anchor-target">
        <WilhelmKnowledgeGraph graph={selectedKnowledgeGraph} selectedTerm={highlightTerm} onTermSelect={setHighlightTerm} title={knowledgeScopeTitle} onExtract={extractKnowledgeGraph} onAlgorithmExtract={extractAlgorithmKnowledgeGraph} onAbort={abortKnowledgeExtraction} extracting={extractingGraph} cacheState={knowledgeNotice} readOnly={embedded} />
        {embedded ? (
          <div id={`${anchorBase}-text`} className="kb-anchor-target">
            <WilhelmKeywordNetwork graph={effectiveGraph} query={networkQuery} onQueryChange={setNetworkQuery} onAlgorithmRefresh={() => refreshKeywordNetwork("algorithm")} onModelExtract={() => refreshKeywordNetwork("llm")} extracting={extractingKeywords} readOnly={embedded} />
          </div>
        ) : (
          <WilhelmKeywordNetwork graph={effectiveGraph} query={networkQuery} onQueryChange={setNetworkQuery} onAlgorithmRefresh={() => refreshKeywordNetwork("algorithm")} onModelExtract={() => refreshKeywordNetwork("llm")} extracting={extractingKeywords} readOnly={embedded} />
        )}
      </div>

      <WilhelmAdvancedVisuals stories={stories} records={records} analysis={backendAnalysis} anchorBase={anchorBase} />

      <div id={embedded ? `${anchorBase}-map` : undefined} className="wilhelm-map-wide kb-anchor-target">
        {visualNotice && <p className="local-save-notice">{visualNotice}</p>}
        <WilhelmSplitMap flows={flows.length ? flows : fallbackFlows.slice(0, 1)} selectedId={selected?.id || selectedId} onSelect={setSelectedId} title="德译中国故事集故事来源及出版地参照图" timeline />
      </div>

      <div id={embedded ? `${anchorBase}-publication` : undefined} className="wilhelm-layout wilhelm-detail-layout kb-anchor-target">
        <aside className="work-panel wilhelm-record-card">
          <div className="panel-title-row">
            <div><strong>当前出版记录</strong><span>{selected?.source}</span></div>
          </div>
          <h3>{selected?.title}</h3>
          <dl>
            <dt>年份</dt><dd>{selected?.yearText}</dd>
            <dt>译者/编者</dt><dd>{selected?.translator}</dd>
            <dt>版本</dt><dd>{selected?.edition}</dd>
            <dt>出版</dt><dd>{selected?.city} - {selected?.publisher}</dd>
            <dt>来源地区</dt><dd>{selected?.province}</dd>
          </dl>
          <p>{selected?.note || "来自《地图_中国民间童话.xlsx》的再版、选译或改编记录。"}</p>
        </aside>
        <PublicationBubbleMap chart={backendVisuals?.publicationMap} items={records} title="卫礼贤《中国民间童话》再版出版地" id="visual-atlas-wilhelm-publication" />
      </div>

      <div id={embedded ? `${anchorBase}-charts` : undefined} className="kb-stats-bottom kb-anchor-target">
        <StatisticsPanel items={tableRows(records)} title="卫礼贤《中国民间童话》专题统计可视化" />
      </div>

      <StoryPreviewModal
        story={previewStory}
        draft={previewDraft}
        onChange={setPreviewDraft}
        onSave={savePreview}
        onClose={() => setPreviewStoryId("")}
        onOpenWindow={openPreviewWindow}
        readOnly={embedded}
      />
    </section>
  );
}

export default function WilhelmStories() {
  useEffect(() => {
    window.location.hash = "knowledge?domain=stories&submodule=stories-wilhelm";
  }, []);

  return (
    <section className="platform-page-loading">
      正在打开“卫礼贤中国民间故事”子模块...
    </section>
  );
}
