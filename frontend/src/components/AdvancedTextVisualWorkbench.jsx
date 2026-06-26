import { useEffect, useMemo, useRef, useState } from "react";
import LandscapeChartModal, { LandscapeChartButton } from "./LandscapeChartModal.jsx";
import { echarts } from "../utils/echartsCore.js";

const METHOD_LABELS = {
  "nlp-overview": "语料规模总览",
  "nlp-word-frequency": "高频词与关键词统计",
  "word-cloud": "关键词词云图",
  "nlp-pos-distribution": "词性结构分布",
  "nlp-entity-distribution": "命名实体统计",
  "nlp-lexical-metrics": "词汇丰富度与句长",
  "nlp-script-profile": "语种与字符系统分布",
  "semantic-manifold": "三维语义流形图",
  "concept-sankey": "概念演变桑基图",
  "semantic-heatmap": "语义热图矩阵",
  "cooccurrence-network": "加权共现网络图谱",
  "multilayer-network": "多层级影响力网络",
  "centrality-radar": "实体中心性雷达图",
  "topic-clustering-map": "主题聚类图",
  "topic-tree": "层次主题树图",
  "topic-river": "主题河流图",
  "topic-concept-matrix": "主题-概念关联矩阵",
  "topic-cooccurrence-network": "主题共现关系图",
  "citation-network": "引文网络图谱",
  "idea-diffusion": "思想传播扩散图",
  "place-entity-map": "地名解析与空间分布",
  "transmission-path-map": "传播路径图",
  "concept-migration": "跨文本概念迁移图",
  "author-concept": "作者-概念二分网络",
};

const DEFAULT_METHODS = [
  ["基础自然语言处理统计", "nlp-overview"],
  ["基础自然语言处理统计", "nlp-word-frequency"],
  ["基础自然语言处理统计", "word-cloud"],
  ["基础自然语言处理统计", "nlp-pos-distribution"],
  ["基础自然语言处理统计", "nlp-entity-distribution"],
  ["基础自然语言处理统计", "nlp-lexical-metrics"],
  ["基础自然语言处理统计", "nlp-script-profile"],
  ["概念语义空间与演变可视化", "semantic-manifold"],
  ["概念语义空间与演变可视化", "concept-sankey"],
  ["概念语义空间与演变可视化", "semantic-heatmap"],
  ["人物与实体关系网络可视化", "cooccurrence-network"],
  ["人物与实体关系网络可视化", "multilayer-network"],
  ["人物与实体关系网络可视化", "centrality-radar"],
  ["主题结构与分布可视化", "topic-clustering-map"],
  ["主题结构与分布可视化", "topic-tree"],
  ["主题结构与分布可视化", "topic-river"],
  ["主题结构与分布可视化", "topic-concept-matrix"],
  ["主题结构与分布可视化", "topic-cooccurrence-network"],
  ["文化传播与影响可视化", "citation-network"],
  ["文化传播与影响可视化", "idea-diffusion"],
  ["文化传播与影响可视化", "place-entity-map"],
  ["文化传播与影响可视化", "transmission-path-map"],
  ["文化传播与影响可视化", "concept-migration"],
  ["文化传播与影响可视化", "author-concept"],
].map(([group, id, scope = "single/global"]) => ({
  id,
  group,
  name: METHOD_LABELS[id],
  scope,
}));

const CLEAN_METHOD_LABELS = {
  "nlp-overview": "语料规模总览",
  "nlp-word-frequency": "高频词与关键词统计",
  "word-cloud": "关键词词云图",
  "nlp-pos-distribution": "词性结构分布",
  "nlp-entity-distribution": "命名实体统计",
  "nlp-lexical-metrics": "词汇丰富度与句长",
  "nlp-script-profile": "语种与字符系统分布",
  "semantic-manifold": "三维语义流形图",
  "concept-sankey": "概念演变桑基图",
  "semantic-heatmap": "语义热图矩阵",
  "cooccurrence-network": "加权共现网络图",
  "multilayer-network": "多层级影响力网络",
  "centrality-radar": "实体中心性雷达图",
  "topic-clustering-map": "主题聚类图",
  "topic-tree": "层次主题树图",
  "topic-river": "主题河流图",
  "topic-concept-matrix": "主题-概念关联矩阵",
  "topic-cooccurrence-network": "主题共现关系图",
  "citation-network": "引文网络图",
  "idea-diffusion": "思想传播扩散图",
  "place-entity-map": "地名解析与空间分布",
  "transmission-path-map": "传播路径图",
  "concept-migration": "跨文本概念迁移图",
  "author-concept": "作者-概念二分网络",
};

const CLEAN_METHOD_GROUPS = {
  "nlp-overview": "基础自然语言处理统计",
  "nlp-word-frequency": "基础自然语言处理统计",
  "word-cloud": "基础自然语言处理统计",
  "nlp-pos-distribution": "基础自然语言处理统计",
  "nlp-entity-distribution": "基础自然语言处理统计",
  "nlp-lexical-metrics": "基础自然语言处理统计",
  "nlp-script-profile": "基础自然语言处理统计",
  "semantic-manifold": "概念语义空间与演变可视化",
  "concept-sankey": "概念语义空间与演变可视化",
  "semantic-heatmap": "概念语义空间与演变可视化",
  "cooccurrence-network": "人物与实体关系网络可视化",
  "multilayer-network": "人物与实体关系网络可视化",
  "centrality-radar": "人物与实体关系网络可视化",
  "topic-clustering-map": "主题结构与分布可视化",
  "topic-tree": "主题结构与分布可视化",
  "topic-river": "主题结构与分布可视化",
  "topic-concept-matrix": "主题结构与分布可视化",
  "topic-cooccurrence-network": "主题结构与分布可视化",
  "citation-network": "文化传播与影响可视化",
  "idea-diffusion": "文化传播与影响可视化",
  "place-entity-map": "文化传播与影响可视化",
  "transmission-path-map": "文化传播与影响可视化",
  "concept-migration": "文化传播与影响可视化",
  "author-concept": "文化传播与影响可视化",
};

const CHART_COLORS = [
  "#0f4c5c",
  "#2a9d8f",
  "#3a86ff",
  "#8338ec",
  "#ffb703",
  "#d62828",
  "#6c757d",
  "#006d77",
  "#8d99ae",
  "#bc6c25",
  "#7209b7",
  "#588157",
];
const NETWORK_COLORS = [
  "#0f4c5c",
  "#164e63",
  "#14532d",
  "#4c1d95",
  "#7f1d1d",
  "#78350f",
  "#1f2937",
  "#0f766e",
  "#1e3a8a",
  "#5b21b6",
];
const HEAT_COLORS = ["#f8fafc", "#dbeafe", "#93c5fd", "#2dd4bf", "#0f766e", "#78350f"];
const DIVERGING_COLORS = ["#313695", "#74add1", "#e0f3f8", "#ffffbf", "#fdae61", "#d73027", "#7f0000"];
const CHART_FONT_FAMILY = "Times New Roman, Computer Modern, SimSun, serif";
const TOPIC_METHOD_IDS = new Set(["topic-clustering-map", "topic-tree", "topic-river", "topic-concept-matrix", "topic-cooccurrence-network"]);
const CHART_FONT = {
  body: 14,
  axis: 13,
  axisName: 14,
  legend: 13,
  label: 12,
  denseLabel: 11,
  tooltip: 14,
};
const TEXT_STYLE = { fontFamily: CHART_FONT_FAMILY, color: "#172033", fontSize: CHART_FONT.body };
const AXIS_LINE = { lineStyle: { color: "rgba(71, 85, 105, 0.42)" } };
const SPLIT_LINE = { lineStyle: { color: "rgba(148, 163, 184, 0.18)", type: "dashed" } };
const LEGEND_TEXT_STYLE = { color: "#334155", fontSize: CHART_FONT.legend, fontWeight: 700 };

function formatNumber(value, digits = 0) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0";
  return number.toLocaleString("zh-CN", { maximumFractionDigits: digits });
}

function formatPercent(value, digits = 1) {
  const number = Number(value || 0);
  if (!Number.isFinite(number)) return "0%";
  return `${(number * 100).toFixed(digits)}%`;
}

function normalizeTopicCount(value) {
  const number = Number.parseInt(value, 10);
  if (!Number.isFinite(number)) return 18;
  return Math.min(60, Math.max(1, number));
}

function truncateLabel(value, limit = 18) {
  const text = String(value || "");
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}

function colorAlpha(hex, alpha = 0.2) {
  const value = String(hex || "").replace("#", "");
  if (value.length !== 6) return `rgba(15, 23, 42, ${alpha})`;
  const intValue = parseInt(value, 16);
  const r = (intValue >> 16) & 255;
  const g = (intValue >> 8) & 255;
  const b = intValue & 255;
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

function makeToolbox() {
  return {
    top: 8,
    right: 10,
    itemSize: 17,
    itemGap: 8,
    feature: {
      restore: { title: "还原" },
      saveAsImage: { pixelRatio: 3, title: "300DPI PNG", backgroundColor: "#fff" },
    },
  };
}

function readableTextStyle(style = {}, minSize = CHART_FONT.label, defaults = {}) {
  const next = { ...defaults, ...(style || {}) };
  const size = Number(next.fontSize || 0);
  if (!size || size < minSize) next.fontSize = minSize;
  return next;
}

function improveLegend(legend) {
  if (!legend) return;
  if (Array.isArray(legend)) {
    legend.forEach(improveLegend);
    return;
  }
  legend.textStyle = readableTextStyle(legend.textStyle, CHART_FONT.legend, LEGEND_TEXT_STYLE);
  legend.itemWidth = Math.max(Number(legend.itemWidth || 0), 14);
  legend.itemHeight = Math.max(Number(legend.itemHeight || 0), 10);
}

function improveDataZoom(dataZoom) {
  if (!dataZoom) return;
  if (Array.isArray(dataZoom)) {
    dataZoom.forEach(improveDataZoom);
    return;
  }
  dataZoom.textStyle = readableTextStyle(dataZoom.textStyle, 12, { color: "#64748b" });
  if (dataZoom.type === "slider" && dataZoom.height) dataZoom.height = Math.max(Number(dataZoom.height || 0), 22);
  if (dataZoom.type === "slider" && dataZoom.width) dataZoom.width = Math.max(Number(dataZoom.width || 0), 20);
}

function boostChartTypography(value, parentKey = "") {
  if (!value || typeof value !== "object") return value;
  if (Array.isArray(value)) {
    value.forEach((item) => boostChartTypography(item, parentKey));
    return value;
  }

  if (typeof value.fontSize === "number" && value.fontSize < CHART_FONT.label) {
    value.fontSize = CHART_FONT.label;
  }
  if (parentKey === "label" || parentKey === "upperLabel") {
    value.fontSize = Math.max(Number(value.fontSize || 0), CHART_FONT.label);
    value.hideOverlap = value.hideOverlap ?? true;
    value.overflow = value.overflow || "truncate";
  }
  if (parentKey === "axisLabel") {
    value.fontSize = Math.max(Number(value.fontSize || 0), CHART_FONT.axis);
    value.hideOverlap = value.hideOverlap ?? true;
  }
  if (parentKey === "nameTextStyle" || parentKey === "axisName") {
    value.fontSize = Math.max(Number(value.fontSize || 0), CHART_FONT.axisName);
  }
  if (parentKey === "textStyle") {
    value.fontSize = Math.max(Number(value.fontSize || 0), CHART_FONT.body);
  }

  Object.entries(value).forEach(([key, child]) => {
    if (key === "legend") improveLegend(child);
    if (key === "dataZoom") improveDataZoom(child);
    if (key === "tooltip" && child && typeof child === "object") {
      child.textStyle = readableTextStyle(child.textStyle, CHART_FONT.tooltip, { color: "#172033", lineHeight: 22 });
    }
    if (key === "visualMap" && child && typeof child === "object") {
      const maps = Array.isArray(child) ? child : [child];
      maps.forEach((item) => {
        item.textStyle = readableTextStyle(item.textStyle, CHART_FONT.axis, { color: "#334155" });
      });
    }
    if (key === "axisLabel" && child && typeof child === "object") {
      value[key] = readableTextStyle(child, CHART_FONT.axis, { color: child.color || "#475569", hideOverlap: true });
    }
    if (key === "nameTextStyle" && child && typeof child === "object") {
      value[key] = readableTextStyle(child, CHART_FONT.axisName, { color: child.color || "#334155", fontWeight: child.fontWeight || 800 });
    }
    if ((key === "label" || key === "upperLabel") && child && typeof child === "object") {
      value[key] = readableTextStyle(child, CHART_FONT.label, { color: child.color || "#172033", hideOverlap: true, overflow: "truncate" });
    }
    if (key === "axisName" && child && typeof child === "object") {
      value[key] = readableTextStyle(child, CHART_FONT.axisName, { color: child.color || "#334155" });
    }
    boostChartTypography(child, key);
  });
  return value;
}

function baseOption(extra = {}) {
  return boostChartTypography({
    color: CHART_COLORS,
    backgroundColor: "#fff",
    textStyle: TEXT_STYLE,
    animationDuration: 420,
    animationEasing: "quadraticOut",
    aria: { enabled: true },
    toolbox: makeToolbox(),
    tooltip: {
      trigger: "item",
      confine: true,
      appendToBody: true,
      backgroundColor: "rgba(255,255,255,0.96)",
      borderColor: "rgba(15,23,42,0.16)",
      borderWidth: 1,
      textStyle: { color: "#172033", fontSize: CHART_FONT.tooltip, lineHeight: 22 },
      extraCssText: "box-shadow:0 14px 30px rgba(15,23,42,.14);border-radius:8px;",
    },
    ...extra,
  });
}

function valueAxis(name, extra = {}) {
  return {
    type: "value",
    name,
    nameTextStyle: { color: "#334155", fontWeight: 800, fontSize: CHART_FONT.axisName, padding: [0, 0, 6, 0] },
    axisLine: AXIS_LINE,
    axisTick: { lineStyle: { color: "rgba(71, 85, 105, 0.34)" } },
    axisLabel: { color: "#475569", fontSize: CHART_FONT.axis, hideOverlap: true, formatter: (value) => formatNumber(value) },
    splitLine: SPLIT_LINE,
    ...extra,
  };
}

function categoryAxis(data, extra = {}) {
  return {
    type: "category",
    data,
    axisLine: AXIS_LINE,
    axisTick: { alignWithLabel: true, lineStyle: { color: "rgba(71, 85, 105, 0.34)" } },
    axisLabel: { color: "#475569", fontSize: CHART_FONT.axis, hideOverlap: true, formatter: (value) => truncateLabel(value, 16) },
    ...extra,
  };
}

function sliderZoom(xAxisIndex = 0, yAxisIndex = null) {
  const zooms = [
    { type: "inside", xAxisIndex, filterMode: "none" },
    { type: "slider", xAxisIndex, height: 22, bottom: 16, brushSelect: false, filterMode: "none", textStyle: { fontSize: 12 } },
  ];
  if (yAxisIndex !== null) {
    zooms.push({ type: "inside", yAxisIndex, filterMode: "none" });
    zooms.push({ type: "slider", yAxisIndex, width: 20, right: 8, filterMode: "none", textStyle: { fontSize: 12 } });
  }
  return zooms;
}

function fullSliderZoom(axisIndex = 0, axis = "x", visibleItems = 60, totalItems = 0) {
  const end = totalItems > visibleItems ? Math.max(8, Math.min(100, (visibleItems / Math.max(1, totalItems)) * 100)) : 100;
  const axisKey = axis === "y" ? "yAxisIndex" : "xAxisIndex";
  const sliderShape = axis === "y"
    ? { type: "slider", [axisKey]: axisIndex, width: 20, right: 8, brushSelect: false, filterMode: "none", start: 0, end, textStyle: { fontSize: 12 } }
    : { type: "slider", [axisKey]: axisIndex, height: 22, bottom: 16, brushSelect: false, filterMode: "none", start: 0, end, textStyle: { fontSize: 12 } };
  return [
    { type: "inside", [axisKey]: axisIndex, filterMode: "none", start: 0, end },
    sliderShape,
  ];
}

function meanOf(rows, accessor) {
  const values = rows.map(accessor).map(Number).filter(Number.isFinite);
  return values.length ? values.reduce((sum, item) => sum + item, 0) / values.length : 0;
}

const METHOD_DESCRIPTIONS = {
  "nlp-overview": "这张图汇总语料的文档数、字符数、段落数、句子数、词元数、分块数、唯一词项和实体数量，用来先判断语料规模、分块密度与整体可分析性。",
  "nlp-word-frequency": "这张图展示最高频词和关键词的出现次数。高频词越靠前，说明它在当前单篇或全局语料中越常作为核心概念、叙事对象或主题线索出现。",
  "word-cloud": "这张图把关键词按频次、主题类别和空间排布组合呈现。字号越大表示越高频，颜色表示主题域，右侧排行用于判断哪些主题词共同构成当前语料的核心语义场。",
  "nlp-pos-distribution": "这张图展示 spaCy 词性标注后的结构比例。名词和专名偏高通常意味着实体和概念密集，动词偏高则说明事件行动和叙事推进更强。",
  "nlp-entity-distribution": "这张图展示人名、地名、机构、作品名等命名实体的出现频率，用来观察文本中的人物、空间、文化对象和传播主体。",
  "nlp-lexical-metrics": "这张图比较文档的词汇丰富度、平均句长和词元规模。词汇丰富度越高，说明用词变化越大；平均句长越高，说明句法结构可能更复杂。",
  "nlp-script-profile": "这张图展示汉字、拉丁字母等字符系统的比例，用来判断语料中的中文、德文及其他文字系统混合情况。",
  "semantic-manifold": "这张图把关键概念嵌入到二维语义空间中。距离越近，说明概念在语义或上下文中越相似；聚成团的区域可视为潜在主题簇。",
  "concept-sankey": "这张图展示概念在章节、文档或时间阶段之间的流动关系。连线越粗，表示相邻阶段之间概念延续或语义转移越强。",
  "semantic-heatmap": "这张图量化主题或概念组之间的语义相似度。颜色越深，表示两组主题词越接近，可用于发现文本内部的主题群和潜在关联。",
  "cooccurrence-network": "这张图展示实体、人物、地点和概念在同一片段中的共现关系。节点越大代表出现越频繁，连线越粗代表共同出现越密集。",
  "multilayer-network": "这张图把作者、书籍和概念放入不同层级，展示思想和文本如何通过作者、作品、概念之间的关系连接起来。",
  "centrality-radar": "这张图比较核心实体的度中心性、加权中心性、介数中心性、接近中心性和特征向量中心性，用来识别文化传播中的枢纽概念或桥梁实体。",
  "topic-clustering-map": "这张图展示文档片段或关键词在主题空间中的聚类状态。点越集中，说明主题内部越稳定；不同簇之间的连线和右侧排名用于观察主题之间的邻近关系与主导主题。",
  "topic-tree": "这张图用横向层级树展示主题到关键词的展开关系，右侧排行帮助判断哪些主题和概念承担了主要解释力。",
  "topic-river": "这张图展示主题强度在文档、章节或时间序列中的变化。河流越宽，表示该主题在对应阶段越活跃。",
  "topic-concept-matrix": "这张图展示主题与概念之间的关联强度，并加入行列边际统计。颜色越深说明概念越能代表对应主题，边际柱图显示主题总强度和概念总贡献。",
  "topic-cooccurrence-network": "这张图展示主题在同一文档或叙事单元中的共现结构。节点越大代表主题越活跃，连线越粗表示两个主题越常共同出现，可用于识别复合叙事结构。",
  "citation-network": "这张图展示文本之间的书名互见、疑似引用和语义互证路径。节点影响力由入边、出边和主题相似度综合估计，右侧排行用于识别核心文本。",
  "idea-diffusion": "这张图追踪核心概念在文档序列或叙事阶段中的出现强度、累计扩散和与源头的相似度，用来观察思想传播范围和阶段性高峰。",
  "place-entity-map": "这张图解析文本中的地名和空间实体。节点位置按空间类型分区，大小表示出现次数，连线表示同文档共现，可用于观察文化叙事的空间重心。",
  "transmission-path-map": "这张图把核心概念、文档顺序或叙事阶段、主题位置和相似度组合成传播路径。路径越粗表示相邻阶段之间共享概念或语义延续越强。",
  "concept-migration": "这张图展示概念在不同文档中的分布差异。某个概念在多个文档中持续高频，说明它可能发生了跨文本迁移。",
  "author-concept": "这张图展示作者和概念之间的二分关系。作者连接的概念越多、边越粗，说明该作者的主题覆盖越广或某些概念使用更集中。",
};

function safeFilename(value, fallback = "advanced-text-visual") {
  return String(value || fallback).replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 90) || fallback;
}

function ChartBox({ option, height = 420, chartKey, registryName = "__advancedTextCharts", title = "图表" }) {
  const ref = useRef(null);
  const chartRef = useRef(null);
  const [landscapeOpen, setLandscapeOpen] = useState(false);
  const [renderError, setRenderError] = useState("");

  useEffect(() => {
    if (!ref.current) return undefined;
    try {
      chartRef.current = echarts.init(ref.current);
      setRenderError("");
    } catch (error) {
      setRenderError(error.message || String(error));
    }
    return () => {
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;
    try {
      chartRef.current.setOption(option || {}, { notMerge: true, lazyUpdate: true });
      setRenderError("");
      requestAnimationFrame(() => chartRef.current?.resize());
    } catch (error) {
      setRenderError(error.message || String(error));
    }
  }, [option]);

  useEffect(() => {
    const resize = () => chartRef.current?.resize();
    window.addEventListener("resize", resize);
    const observer = typeof ResizeObserver !== "undefined" && ref.current ? new ResizeObserver(resize) : null;
    if (observer && ref.current) observer.observe(ref.current);
    return () => {
      window.removeEventListener("resize", resize);
      observer?.disconnect();
    };
  }, []);

  useEffect(() => {
    if (!chartKey) return undefined;
    window[registryName] = window[registryName] || {};
    window[registryName][chartKey] = chartRef;
    return () => {
      if (window[registryName]) delete window[registryName][chartKey];
    };
  }, [chartKey, registryName]);

  return (
    <>
      <div className="landscape-chart-shell advanced-text-chart-shell">
        <div className="landscape-chart-inline-toolbar">
          <LandscapeChartButton disabled={!option || Boolean(renderError)} onClick={() => setLandscapeOpen(true)} />
        </div>
        <div className="german-corpus-chart advanced-text-chart" ref={ref} style={{ height }} />
        {renderError && (
          <div className="advanced-text-render-error">
            <strong>图表渲染失败</strong>
            <span>{renderError}</span>
          </div>
        )}
      </div>
      <LandscapeChartModal
        open={landscapeOpen}
        title={title}
        option={option}
        onClose={() => setLandscapeOpen(false)}
      />
    </>
  );
}

function exportChart(chartKey, title, type, registryName = "__advancedTextCharts") {
  const chart = window[registryName]?.[chartKey]?.current;
  if (!chart) return;
  const url = chart.getDataURL({ type: type === "pdf" ? "png" : type, pixelRatio: 3, backgroundColor: "#fff" });
  if (type === "pdf") {
    const win = window.open("", "_blank");
    if (!win) return;
    win.document.write(`<!doctype html><meta charset="utf-8"><title>${title}</title><style>body{margin:0;padding:24px;font-family:"Times New Roman",serif}img{display:block;max-width:100%;margin:auto}</style><img src="${url}" alt="${title}" />`);
    win.document.close();
    win.print();
    return;
  }
  const link = document.createElement("a");
  link.href = url;
  link.download = `${safeFilename(title)}.${type}`;
  link.click();
}

function hasVisualData(methodId, payload) {
  const visuals = payload?.visualizations || {};
  const keyMap = {
    "nlp-overview": "nlpStatistics",
    "nlp-word-frequency": "nlpStatistics",
    "word-cloud": "wordCloud",
    "nlp-pos-distribution": "nlpStatistics",
    "nlp-entity-distribution": "nlpStatistics",
    "nlp-lexical-metrics": "nlpStatistics",
    "nlp-script-profile": "nlpStatistics",
    "semantic-manifold": "semanticManifold",
    "concept-sankey": "conceptSankey",
    "semantic-heatmap": "semanticHeatmap",
    "cooccurrence-network": "cooccurrenceNetwork",
    "multilayer-network": "multilayerNetwork",
    "centrality-radar": "centralityRadar",
    "topic-clustering-map": "topicClusteringMap",
    "topic-tree": "topicTree",
    "topic-river": "topicRiver",
    "topic-concept-matrix": "topicConceptMatrix",
    "topic-cooccurrence-network": "topicCooccurrenceNetwork",
    "citation-network": "citationNetwork",
    "idea-diffusion": "ideaDiffusion",
    "place-entity-map": "placeEntityMap",
    "transmission-path-map": "transmissionPathMap",
    "concept-migration": "conceptMigration",
    "author-concept": "authorConcept",
  };
  const value = visuals[keyMap[methodId]];
  if (Array.isArray(value)) return value.length > 0;
  if (value && typeof value === "object") {
    if (Array.isArray(value.nodes)) return value.nodes.length > 0;
    if (Array.isArray(value.items)) return value.items.length > 0;
    if (Array.isArray(value.labels)) return value.labels.length > 0;
    if (Array.isArray(value.children)) return value.children.length > 0;
    if (Array.isArray(value.series)) return value.series.length > 0;
    if (Array.isArray(value.matrix)) return value.matrix.length > 0;
    return Object.keys(value).length > 0;
  }
  return Boolean(value);
}

function methodSupportsScope(method, nextScope) {
  return String(method?.scope || "single/global").includes(nextScope);
}

function nextSupportedScope(method, currentScope) {
  if (methodSupportsScope(method, currentScope)) return currentScope;
  if (methodSupportsScope(method, "global")) return "global";
  if (methodSupportsScope(method, "single")) return "single";
  return currentScope || "single";
}

function scaledPresetCoordinate(nodes, axis, value, span = 760) {
  const values = nodes
    .map((node) => Number(node?.[axis]))
    .filter(Number.isFinite);
  if (!Number.isFinite(Number(value)) || values.length < 2) return Number(value || 0);
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  return ((Number(value) - min) / range - 0.5) * span;
}

function spreadGraphNodes(rawNodes, rawEdges, nodeLimit, edgeLimit) {
  const ranked = rawNodes
    .slice()
    .sort((left, right) => Number(right.value || right.count || 0) - Number(left.value || left.count || 0));
  const allowedIds = new Set(ranked.map((node) => node.id || node.name));
  const edges = rawEdges
    .filter((edge) => allowedIds.has(edge.source) && allowedIds.has(edge.target))
    .sort((left, right) => Number(right.value || right.count || 0) - Number(left.value || left.count || 0));
  const degree = new Map();
  edges.forEach((edge) => {
    degree.set(edge.source, (degree.get(edge.source) || 0) + Number(edge.value || edge.count || 1));
    degree.set(edge.target, (degree.get(edge.target) || 0) + Number(edge.value || edge.count || 1));
  });
  const categories = [...new Set(ranked.map((node) => node.type || node.layer || "概念"))];
  const categoryIndex = new Map(categories.map((name, index) => [name, index]));
  const groups = new Map(categories.map((name) => [name, []]));
  ranked.forEach((node) => groups.get(node.type || node.layer || "概念")?.push(node));
  const panelCols = Math.min(3, Math.max(1, Math.ceil(Math.sqrt(categories.length))));
  const panelWidth = 560;
  const panelHeight = 390;
  const importantIds = new Set(ranked.slice(0, Math.min(26, ranked.length)).map((node) => node.id || node.name));
  const nodes = ranked.map((node, index) => {
    const category = node.type || node.layer || "概念";
    const catShift = categoryIndex.get(category) || 0;
    const peers = groups.get(category) || [];
    const localIndex = Math.max(0, peers.findIndex((item) => (item.id || item.name) === (node.id || node.name)));
    const localCount = Math.max(1, peers.length);
    const localCols = Math.ceil(Math.sqrt(localCount * 1.35));
    const row = Math.floor(localIndex / localCols);
    const col = localIndex % localCols;
    const panelCol = catShift % panelCols;
    const panelRow = Math.floor(catShift / panelCols);
    const xGap = Math.max(86, Math.min(142, panelWidth / Math.max(2, localCols + 1)));
    const yGap = Math.max(62, Math.min(108, panelHeight / Math.max(2, Math.ceil(localCount / localCols) + 1)));
    const jitterX = ((index * 37) % 31) - 15;
    const jitterY = ((index * 53) % 29) - 14;
    const value = Number(node.value || node.count || degree.get(node.id || node.name) || 1);
    const color = NETWORK_COLORS[catShift % NETWORK_COLORS.length];
    const hasPresetPosition = Number.isFinite(Number(node.x)) && Number.isFinite(Number(node.y));
    return {
      id: node.id || node.name,
      name: node.name || node.label || node.id,
      category,
      value,
      x: hasPresetPosition ? scaledPresetCoordinate(ranked, "x", node.x, 760) : panelCol * panelWidth + (col + 1) * xGap + jitterX,
      y: hasPresetPosition ? scaledPresetCoordinate(ranked, "y", node.y, 520) : panelRow * panelHeight + (row + 1) * yGap + jitterY,
      year: node.year,
      topic: node.topic,
      concepts: node.concepts,
      documents: node.documents,
      evidence: node.evidence,
      influence: node.influence,
      symbol: "circle",
      symbolSize: Math.max(22, Math.min(74, 18 + Math.sqrt(value) * 4.8)),
      isImportant: importantIds.has(node.id || node.name),
      itemStyle: {
        color,
        borderColor: "#fff",
        borderWidth: importantIds.has(node.id || node.name) ? 2 : 1,
        shadowBlur: importantIds.has(node.id || node.name) ? 14 : 5,
        shadowColor: colorAlpha(color, 0.32),
      },
    };
  });
  return {
    nodes,
    edges,
    categories: categories.map((name, index) => ({
      name,
      itemStyle: { color: NETWORK_COLORS[index % NETWORK_COLORS.length] },
    })),
  };
}

function layoutAuthorConceptNodes(rawNodes, rawEdges, nodeLimit, edgeLimit) {
  const categoryOf = (node) => node.type || node.layer || "概念";
  const isConcept = (node) => categoryOf(node) === "概念";
  const essentials = rawNodes.filter((node) => !isConcept(node));
  const concepts = rawNodes
    .filter(isConcept)
    .sort((left, right) => Number(right.value || right.count || 0) - Number(left.value || left.count || 0));
  const ranked = [...essentials, ...concepts];
  const allowedIds = new Set(ranked.map((node) => node.id || node.name));
  const edges = rawEdges
    .filter((edge) => allowedIds.has(edge.source) && allowedIds.has(edge.target))
    .sort((left, right) => Number(right.value || right.count || 0) - Number(left.value || left.count || 0));
  const degree = new Map();
  edges.forEach((edge) => {
    degree.set(edge.source, (degree.get(edge.source) || 0) + Number(edge.value || edge.count || 1));
    degree.set(edge.target, (degree.get(edge.target) || 0) + Number(edge.value || edge.count || 1));
  });
  const categories = ["概念", "作品", "作者", "叙事阶段"].filter((name) => ranked.some((node) => categoryOf(node) === name));
  const categoryIndex = new Map(categories.map((name, index) => [name, index]));
  const groups = new Map(categories.map((name) => [name, []]));
  ranked.forEach((node) => groups.get(categoryOf(node))?.push(node));

  const stageIndex = new Map(
    (groups.get("叙事阶段") || [])
      .slice()
      .sort((left, right) => Number(left.year || 0) - Number(right.year || 0) || String(left.id || "").localeCompare(String(right.id || "")))
      .map((node, index) => [node.id || node.name, index]),
  );
  const conceptStageScore = new Map();
  edges.forEach((edge) => {
    const sourceStage = stageIndex.get(edge.source);
    const targetStage = stageIndex.get(edge.target);
    const sourceNode = ranked.find((node) => (node.id || node.name) === edge.source);
    const targetNode = ranked.find((node) => (node.id || node.name) === edge.target);
    if (sourceStage !== undefined && targetNode && isConcept(targetNode)) {
      conceptStageScore.set(edge.target, Math.min(conceptStageScore.get(edge.target) ?? sourceStage, sourceStage));
    }
    if (targetStage !== undefined && sourceNode && isConcept(sourceNode)) {
      conceptStageScore.set(edge.source, Math.min(conceptStageScore.get(edge.source) ?? targetStage, targetStage));
    }
  });
  const sortedGroups = new Map(categories.map((name) => {
    const items = (groups.get(name) || []).slice();
    if (name === "叙事阶段") {
      items.sort((left, right) => Number(left.year || 0) - Number(right.year || 0) || String(left.id || "").localeCompare(String(right.id || "")));
    } else if (name === "概念") {
      items.sort((left, right) => {
        const leftId = left.id || left.name;
        const rightId = right.id || right.name;
        return (conceptStageScore.get(leftId) ?? 99) - (conceptStageScore.get(rightId) ?? 99)
          || Number(right.value || right.count || 0) - Number(left.value || left.count || 0);
      });
    } else {
      items.sort((left, right) => Number(right.value || right.count || 0) - Number(left.value || left.count || 0));
    }
    return [name, items];
  }));
  const yFor = (index, count, top = 70, bottom = 560) => {
    if (count <= 1) return (top + bottom) / 2;
    return top + ((bottom - top) * index) / Math.max(1, count - 1);
  };
  const importantIds = new Set(ranked.slice(0, Math.min(28, ranked.length)).map((node) => node.id || node.name));
  const nodes = ranked.map((node) => {
    const category = categoryOf(node);
    const peers = sortedGroups.get(category) || [];
    const localIndex = Math.max(0, peers.findIndex((item) => (item.id || item.name) === (node.id || node.name)));
    const value = Number(node.value || node.count || degree.get(node.id || node.name) || 1);
    let x = 140;
    let y = 315;
    if (category === "作者") {
      x = 130;
      y = yFor(localIndex, peers.length, 190, 440);
    } else if (category === "作品") {
      x = 310;
      y = yFor(localIndex, peers.length, 170, 460);
    } else if (category === "叙事阶段") {
      x = 510;
      y = yFor(localIndex, peers.length, 92, 538);
    } else {
      const columns = peers.length > 7 ? 2 : 1;
      const column = localIndex % columns;
      const row = Math.floor(localIndex / columns);
      const rows = Math.ceil(peers.length / columns);
      x = 740 + column * 180;
      y = yFor(row, rows, 72, 558) + (column ? 20 : -20);
    }
    const color = NETWORK_COLORS[(categoryIndex.get(category) || 0) % NETWORK_COLORS.length];
    return {
      id: node.id || node.name,
      name: node.name || node.label || node.id,
      category,
      value,
      x,
      y,
      year: node.year,
      topic: node.topic,
      concepts: node.concepts,
      documents: node.documents,
      evidence: node.evidence,
      influence: node.influence,
      symbol: "circle",
      symbolSize: Math.max(24, Math.min(78, 20 + Math.sqrt(value) * 5.2)),
      isImportant: importantIds.has(node.id || node.name),
      fixed: true,
      itemStyle: {
        color,
        borderColor: "#fff",
        borderWidth: importantIds.has(node.id || node.name) ? 2 : 1,
        shadowBlur: importantIds.has(node.id || node.name) ? 14 : 5,
        shadowColor: colorAlpha(color, 0.32),
      },
    };
  });
  return {
    nodes,
    edges,
    categories: categories.map((name, index) => ({
      name,
      itemStyle: { color: NETWORK_COLORS[index % NETWORK_COLORS.length] },
    })),
  };
}

function displayLabelForNetwork(methodId, params, importantCutoff, isTopicNetwork, isCircularNetwork) {
  const data = params?.data || {};
  const name = params?.name || data.name || "";
  if (methodId === "author-concept") {
    if (data.category === "概念") return Number(data.value || 0) >= 12 ? truncateLabel(name, 8) : "";
    if (data.category === "叙事阶段") return truncateLabel(name, 4);
    return truncateLabel(name, 8);
  }
  if (isTopicNetwork) return truncateLabel(name, 13);
  if (isCircularNetwork) return data.isImportant || Number(data.value || 0) >= importantCutoff ? truncateLabel(name, 10) : "";
  return data.isImportant || Number(data.value || 0) >= importantCutoff ? truncateLabel(name, 14) : "";
}

function rawChartOptionFor(methodId, payload, scope) {
  const visuals = payload?.visualizations || {};
  const titleText = METHOD_LABELS[methodId] || methodId;
  const nlp = visuals.nlpStatistics || {};
  if (methodId === "nlp-overview") {
    const overview = nlp.overview || {};
    const rows = [
      ["文档数", overview.documentCount, "规模"],
      ["字符数", overview.charCount, "规模"],
      ["段落数", overview.paragraphCount, "结构"],
      ["句子数", overview.sentenceCount, "结构"],
      ["词元数", overview.tokenCount, "语言"],
      ["分块数", overview.chunkCount, "结构"],
      ["唯一词项", overview.uniqueTerms, "语言"],
      ["实体次数", overview.entityCount, "实体"],
    ];
    const values = rows.map((item) => Number(item[1] || 0));
    const maxValue = Math.max(1, ...values);
    return baseOption({
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params) => {
          const bar = params.find((item) => item.seriesName === "绝对数量");
          const item = rows[bar?.dataIndex || 0];
          return `${item[0]}<br/>类别：${item[2]}<br/>数量：${formatNumber(item[1])}`;
        },
      },
      legend: { top: 12, left: 18, itemWidth: 14, itemHeight: 10, textStyle: LEGEND_TEXT_STYLE },
      grid: { left: 82, right: 92, top: 96, bottom: 92 },
      dataZoom: sliderZoom(0),
      xAxis: categoryAxis(rows.map((item) => item[0]), { axisLabel: { rotate: 22, color: "#475569", margin: 16 } }),
      yAxis: [
        valueAxis("log10 数量", { type: "log", logBase: 10, min: 1, nameGap: 34 }),
        valueAxis("归一化指数", { min: 0, max: 100, nameGap: 34, axisLabel: { formatter: "{value}", margin: 12 }, splitLine: { show: false } }),
      ],
      graphic: [
        {
          type: "text",
          right: 28,
          top: 58,
          style: {
            text: `TTR ${formatPercent(overview.typeTokenRatio || 0)}  |  平均句长 ${formatNumber(overview.meanSentenceLength || 0, 2)}`,
            fill: "#475569",
            font: `800 ${CHART_FONT.label}px ${CHART_FONT_FAMILY}`,
            textAlign: "right",
          },
        },
      ],
      series: [
        {
          name: "绝对数量",
          type: "bar",
          data: values.map((value, index) => ({ value: Math.max(1, value), raw: value, group: rows[index][2] })),
          barMaxWidth: 42,
          itemStyle: {
            borderRadius: [5, 5, 0, 0],
            color: (params) => CHART_COLORS[params.dataIndex % CHART_COLORS.length],
          },
          label: {
            show: true,
            position: "top",
            color: "#334155",
            fontSize: 10,
            formatter: (params) => formatNumber(params.data.raw),
          },
        },
        {
          name: "归一化指数",
          type: "line",
          yAxisIndex: 1,
          smooth: true,
          symbol: "circle",
          symbolSize: 8,
          data: values.map((value) => Number(((value / maxValue) * 100).toFixed(2))),
          lineStyle: { width: 2.4, color: "#d62828" },
          itemStyle: { color: "#d62828" },
          areaStyle: { color: colorAlpha("#d62828", 0.08) },
        },
      ],
    });
  }
  if (methodId === "nlp-word-frequency") {
    const source = nlp.wordFrequency || [];
    const total = Math.max(1, source.reduce((sum, item) => sum + Number(item.count || 0), 0));
    let running = 0;
    const ranked = source.map((item) => {
      running += Number(item.count || 0);
      return { ...item, cumulative: Number(((running / total) * 100).toFixed(2)) };
    });
    const visibleEnd = Math.min(520, Math.max(48, ranked.length));
    const topics = [...new Set(source.map((item) => item.topic || "概念"))];
    const topicIndex = new Map(topics.map((topic, index) => [topic, index]));
    return baseOption({
      tooltip: {
        trigger: "item",
        formatter: (params) => {
          const data = params.data || [];
          return `${data[2]}<br/>Rank：${formatNumber(data[1])}<br/>主题：${data[3] || "概念"}<br/>出现次数：${formatNumber(data[0])}<br/>累计覆盖：${formatNumber(data[4], 2)}%`;
        },
      },
      legend: { top: 8, left: 12, itemWidth: 12, itemHeight: 8, textStyle: { color: "#475569" } },
      grid: { left: 82, right: 94, top: 58, bottom: 56 },
      dataZoom: [
        { type: "inside", yAxisIndex: 0, filterMode: "none", startValue: 1, endValue: visibleEnd },
        { type: "slider", yAxisIndex: 0, width: 22, right: 24, filterMode: "none", brushSelect: false, startValue: 1, endValue: visibleEnd, textStyle: { fontSize: 12 } },
      ],
      xAxis: [
        valueAxis("出现次数(log)", { type: "log", min: 1, logBase: 10 }),
        valueAxis("累计占比(%)", { min: 0, max: 100, splitLine: { show: false }, axisLabel: { formatter: "{value}%" } }),
      ],
      yAxis: valueAxis("Rank", {
        min: 1,
        max: Math.max(visibleEnd, ranked.length),
        inverse: true,
        axisLabel: { color: "#475569", fontSize: 12, formatter: (value) => formatNumber(value) },
      }),
      series: [
        {
          name: "Rank-frequency",
          type: "scatter",
          data: ranked.map((item, index) => [Math.max(1, Number(item.count || 0)), index + 1, item.word, item.topic, item.cumulative]),
          symbolSize: (value) => Math.max(3, Math.min(14, Math.log1p(Number(value[0] || 1)) * 1.8)),
          progressive: 4000,
          progressiveThreshold: 1200,
          itemStyle: {
            opacity: 0.68,
            color: (params) => CHART_COLORS[(topicIndex.get(params.data?.[3] || "概念") || 0) % CHART_COLORS.length],
          },
          label: {
            show: true,
            position: "right",
            fontSize: 10,
            color: "#334155",
            formatter: (params) => Number(params.data?.[1] || 0) <= 36 ? truncateLabel(params.data?.[2], 14) : "",
          },
        },
        {
          name: "累计占比",
          type: "line",
          xAxisIndex: 1,
          symbolSize: 0,
          smooth: false,
          sampling: "lttb",
          data: ranked.map((item, index) => [item.cumulative, index + 1, item.word, item.topic, item.count]),
          lineStyle: { width: 2, color: "#d62828" },
          itemStyle: { color: "#d62828" },
        },
      ],
    });
  }
  if (methodId === "word-cloud") {
    const cloud = visuals.wordCloud || { words: [], topics: [] };
    const words = cloud.words || [];
    const topics = [...new Set(words.map((item) => item.topic || "概念"))];
    const topicIndex = new Map(topics.map((topic, index) => [topic, index]));
    const topicRows = (cloud.topics || [])
      .map((item) => ({ name: item.topic, value: item.count }))
      .reverse();
    const maxCount = Math.max(1, ...words.map((item) => Number(item.count || 0)));
    return baseOption({
      tooltip: {
        formatter: (params) => {
          if (params.seriesName === "主题权重") return `${params.name}<br/>总频次：${formatNumber(params.value)}`;
          const data = params.data || [];
          return `${data[3]}<br/>主题：${data[4]}<br/>出现次数：${formatNumber(data[5])}<br/>${data[7] || ""}`;
        },
      },
      grid: [
        { left: 20, right: "34%", top: 26, bottom: 34 },
        { left: "72%", right: 42, top: 58, bottom: 48 },
      ],
      xAxis: [
        { type: "value", min: -92, max: 92, show: false },
        valueAxis("频次", { gridIndex: 1 }),
      ],
      yAxis: [
        { type: "value", min: -68, max: 68, show: false },
        categoryAxis(topicRows.map((item) => item.name), {
          gridIndex: 1,
          axisLabel: { formatter: (value) => truncateLabel(value, 12), fontSize: 12 },
        }),
      ],
      visualMap: {
        min: 1,
        max: maxCount,
        dimension: 5,
        seriesIndex: 0,
        left: 20,
        bottom: 8,
        orient: "horizontal",
        calculable: true,
        itemWidth: 16,
        itemHeight: 142,
        text: ["高频", "低频"],
        inRange: { color: ["#93c5fd", "#2a9d8f", "#ffb703", "#d62828"] },
      },
      series: [
        {
          name: "关键词词云",
          type: "custom",
          coordinateSystem: "cartesian2d",
          data: words.map((item) => [item.x, item.y, item.fontSize, item.word, item.topic, item.count, item.rotate, item.example]),
          renderItem: (params, api) => {
            const point = api.coord([api.value(0), api.value(1)]);
            const topic = api.value(4) || "概念";
            const color = CHART_COLORS[(topicIndex.get(topic) || 0) % CHART_COLORS.length];
            return {
              type: "text",
              rotation: (Number(api.value(6) || 0) * Math.PI) / 180,
              origin: point,
              style: {
                x: point[0],
                y: point[1],
                text: api.value(3),
                fill: color,
                opacity: 0.78,
                font: `800 ${api.value(2)}px ${CHART_FONT_FAMILY}`,
                textAlign: "center",
                textVerticalAlign: "middle",
              },
              emphasis: {
                style: { opacity: 1, shadowBlur: 12, shadowColor: colorAlpha(color, 0.26) },
              },
            };
          },
        },
        {
          name: "主题权重",
          type: "bar",
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: topicRows.map((item) => item.value),
          barMaxWidth: 14,
          itemStyle: {
            borderRadius: [0, 5, 5, 0],
            color: (params) => CHART_COLORS[params.dataIndex % CHART_COLORS.length],
          },
          label: { show: true, position: "right", formatter: (params) => formatNumber(params.value), color: "#334155", fontSize: 12 },
        },
      ],
    });
  }
  if (methodId === "nlp-pos-distribution") {
    const rows = nlp.posDistribution || [];
    const total = Math.max(1, rows.reduce((sum, item) => sum + Number(item.count || 0), 0));
    const barRows = rows.slice().reverse();
    return baseOption({
      tooltip: {
        trigger: "item",
        formatter: (params) => `${params.name}<br/>数量：${formatNumber(params.value)}<br/>占比：${formatPercent(Number(params.value || 0) / total)}`,
      },
      legend: { type: "scroll", orient: "vertical", left: 8, top: 18, bottom: 18, width: 116, textStyle: { color: "#475569" } },
      grid: { left: "48%", right: 42, top: 42, bottom: 34 },
      xAxis: valueAxis("数量"),
      yAxis: categoryAxis(barRows.map((item) => item.name), { axisLabel: { fontSize: 11, color: "#334155" } }),
      series: [
        {
          name: "词性占比",
          type: "pie",
          radius: ["20%", "43%"],
          center: ["28%", "53%"],
          roseType: "radius",
          avoidLabelOverlap: true,
          data: rows.map((item) => ({ name: item.name, value: item.count })),
          itemStyle: { borderColor: "#fff", borderWidth: 2 },
          label: { color: "#172033", fontSize: 11, formatter: "{b}\n{d}%" },
          labelLine: { lineStyle: { color: "rgba(71,85,105,.38)" } },
        },
        {
          name: "词性数量",
          type: "bar",
          data: barRows.map((item) => item.count),
          barMaxWidth: 14,
          itemStyle: { borderRadius: [0, 5, 5, 0], color: "#0f4c5c" },
          label: { show: true, position: "right", formatter: (params) => formatNumber(params.value), color: "#334155", fontSize: 10 },
        },
      ],
    });
  }
  if (methodId === "nlp-entity-distribution") {
    const rows = (nlp.entityDistribution || []).slice().reverse();
    const types = [...new Set(rows.map((item) => item.type || "ENTITY"))];
    return baseOption({
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params) => {
          const item = rows[params[0]?.dataIndex || 0] || {};
          return `${item.name}<br/>类型：${item.type || "ENTITY"}<br/>出现次数：${formatNumber(item.count)}`;
        },
      },
      legend: { type: "scroll", top: 8, left: 12, textStyle: { color: "#475569" } },
      grid: { left: 172, right: 54, top: 58, bottom: 38 },
      dataZoom: fullSliderZoom(0, "y", 42, rows.length),
      xAxis: valueAxis("实体出现次数"),
      yAxis: categoryAxis(rows.map((item) => `${item.name} · ${item.type}`), {
        axisLabel: { fontSize: 10.5, color: "#334155", formatter: (value) => truncateLabel(value, 24) },
      }),
      series: types.map((type, index) => ({
        name: type,
        type: "bar",
        stack: "entity",
        data: rows.map((item) => (item.type === type ? item.count : 0)),
        barMaxWidth: 14,
        itemStyle: { borderRadius: [0, 4, 4, 0], color: CHART_COLORS[index % CHART_COLORS.length] },
      })),
    });
  }
  if (methodId === "nlp-lexical-metrics") {
    const rows = nlp.lexicalMetrics || nlp.documentMetrics || [];
    const meanX = meanOf(rows, (item) => item.lexicalDensity);
    const meanY = meanOf(rows, (item) => item.avgSentenceLength);
    const maxEntity = Math.max(1, ...rows.map((item) => Number(item.entityCount || 0)));
    return baseOption({
      tooltip: {
        formatter: (params) => {
          const [density, sentence, tokens, title, entities, chunks] = params.data;
          return `${title}<br/>词汇丰富度：${formatPercent(density, 2)}<br/>平均句长：${formatNumber(sentence, 2)}<br/>词元数：${formatNumber(tokens)}<br/>实体次数：${formatNumber(entities)}<br/>分块数：${formatNumber(chunks)}`;
        },
      },
      grid: { left: 70, right: 72, top: 42, bottom: 62 },
      dataZoom: [
        { type: "inside", xAxisIndex: 0, filterMode: "none" },
        { type: "inside", yAxisIndex: 0, filterMode: "none" },
      ],
      visualMap: {
        min: 0,
        max: maxEntity,
        right: 8,
        top: 56,
        calculable: true,
        itemHeight: 120,
        text: ["实体多", "实体少"],
        inRange: { color: ["#93c5fd", "#2a9d8f", "#ffb703", "#d62828"] },
      },
      xAxis: valueAxis("词汇丰富度", { axisLabel: { formatter: (value) => `${(value * 100).toFixed(0)}%` } }),
      yAxis: valueAxis("平均句长"),
      series: [{
        name: "文档",
        type: "scatter",
        data: rows.map((item) => [item.lexicalDensity, item.avgSentenceLength, item.tokenCount, item.title, item.entityCount, item.chunkCount]),
        symbolSize: (value) => Math.max(10, Math.min(58, Math.sqrt(value[2] || 1) / (scope === "global" ? 18 : 8))),
        itemStyle: { opacity: 0.78, borderColor: "#fff", borderWidth: 1 },
        label: {
          show: true,
          formatter: (params) => (scope === "single" || params.data[2] > meanOf(rows, (item) => item.tokenCount) * 1.35 ? truncateLabel(params.data[3], 14) : ""),
          color: "#172033",
          fontSize: 10,
        },
        markLine: {
          symbol: "none",
          label: { color: "#64748b", fontSize: 10 },
          lineStyle: { type: "dashed", color: "rgba(15,23,42,.34)" },
          data: [{ xAxis: meanX, name: "平均丰富度" }, { yAxis: meanY, name: "平均句长" }],
        },
      }],
    });
  }
  if (methodId === "nlp-script-profile") {
    const rows = (nlp.scriptProfile || []).filter((item) => item.count > 0);
    const total = Math.max(1, rows.reduce((sum, item) => sum + Number(item.count || 0), 0));
    return baseOption({
      tooltip: {
        trigger: "item",
        formatter: (params) => `${params.name}<br/>字符数：${formatNumber(params.value)}<br/>占比：${formatPercent(Number(params.value || 0) / total)}`,
      },
      series: [{
        type: "treemap",
        roam: false,
        breadcrumb: { show: false },
        nodeClick: false,
        squareRatio: 1.15,
        leafDepth: 1,
        data: rows.map((item, index) => ({
          name: item.name,
          value: item.count,
          itemStyle: { color: CHART_COLORS[index % CHART_COLORS.length] },
        })),
        label: {
          show: true,
          formatter: (params) => `${params.name}\n${formatPercent(Number(params.value || 0) / total)}`,
          fontSize: 15,
          fontWeight: 800,
          color: "#fff",
        },
        upperLabel: { show: true, height: 24 },
        levels: [
          { itemStyle: { borderColor: "#fff", borderWidth: 3, gapWidth: 4 } },
          { itemStyle: { borderColor: "#fff", borderWidth: 2, gapWidth: 3 } },
        ],
      }],
    });
  }
  if (methodId === "semantic-manifold") {
    const data = visuals.semanticManifold || [];
    const topics = [...new Set(data.map((item) => item.topic || "概念"))];
    const topConcepts = data.slice().sort((left, right) => Number(right.frequency || 0) - Number(left.frequency || 0));
    return baseOption({
      tooltip: {
        formatter: (params) => {
          const [, , frequency, concept, topic, example] = params.data;
          return `${concept}<br/>频次：${formatNumber(frequency)}<br/>主题：${topic}<br/>${example || ""}`;
        },
      },
      legend: { type: "scroll", top: 8, left: 12, right: 120, textStyle: { color: "#475569" } },
      grid: { left: 56, right: 38, top: 58, bottom: 58 },
      dataZoom: [
        { type: "inside", xAxisIndex: 0, filterMode: "none" },
        { type: "inside", yAxisIndex: 0, filterMode: "none" },
      ],
      xAxis: valueAxis("UMAP-1"),
      yAxis: valueAxis("UMAP-2"),
      series: [
        ...topics.map((topic, index) => ({
          name: topic,
          type: "scatter",
          symbolSize: (value) => Math.max(7, Math.min(44, Math.sqrt(value[2] || 1) * 4.6)),
          data: data
            .filter((item) => (item.topic || "概念") === topic)
            .map((item) => [item.x, item.y, item.frequency, item.concept, item.topic, item.example]),
          itemStyle: { color: CHART_COLORS[index % CHART_COLORS.length], opacity: 0.72, borderColor: "#fff", borderWidth: 1 },
          label: { show: true, formatter: (params) => (params.data[2] > 14 ? truncateLabel(params.data[3], 12) : ""), fontSize: 10, color: "#172033" },
          emphasis: { focus: "series" },
        })),
        {
          name: "高频概念",
          type: "effectScatter",
          data: topConcepts.map((item) => [item.x, item.y, item.frequency, item.concept, item.topic, item.example]),
          symbolSize: (value) => Math.max(12, Math.min(54, Math.sqrt(value[2] || 1) * 5.2)),
          rippleEffect: { brushType: "stroke", scale: 2.2 },
          itemStyle: { color: "#d62828", opacity: 0.82 },
          label: { show: true, formatter: (params) => truncateLabel(params.data[3], 12), position: "right", fontWeight: 800, fontSize: 10 },
          z: 5,
        },
      ],
    });
  }
  if (methodId === "concept-sankey") {
    const sankey = visuals.conceptSankey || { nodes: [], links: [] };
    const nodeWeights = new Map((sankey.nodes || []).map((_node, index) => [String(index), 0]));
    (sankey.links || []).forEach((link) => {
      const value = Number(link.value || 0);
      const source = String(link.source);
      const target = String(link.target);
      nodeWeights.set(source, (nodeWeights.get(source) || 0) + value);
      nodeWeights.set(target, (nodeWeights.get(target) || 0) + value);
    });
    const labelThreshold = scope === "global" ? 18 : 14;
    return baseOption({
      tooltip: {
        trigger: "item",
        formatter: (params) => {
          if (params.dataType === "edge") return `语义延续强度：${formatNumber(params.value, 2)}`;
          return `${params.data?.fullName || params.name}<br/>节点权重：${formatNumber(params.data?.weight || 0, 2)}`;
        },
      },
      series: [{
        type: "sankey",
        data: sankey.nodes.map((item, index) => {
          const name = String(index);
          const fullName = item.term || item.name;
          const weight = nodeWeights.get(name) || Number(item.value || 0);
          const showLabel = weight >= labelThreshold || index < 24;
          return {
            name,
            fullName,
            weight,
            label: {
              show: showLabel,
              formatter: showLabel ? truncateLabel(fullName, 11) : "",
            },
          };
        }),
        links: sankey.links.map((item) => ({ source: String(item.source), target: String(item.target), value: item.value })),
        left: 16,
        right: 170,
        top: 38,
        bottom: 30,
        nodeWidth: 13,
        nodeGap: 13,
        layoutIterations: 96,
        emphasis: { focus: "adjacency" },
        levels: CHART_COLORS.slice(0, 6).map((color, depth) => ({ depth, itemStyle: { color }, lineStyle: { color: "gradient" } })),
        lineStyle: { color: "gradient", opacity: 0.34, curveness: 0.48 },
        label: { color: "#172033", fontSize: 10, fontWeight: 700, overflow: "truncate", width: 72 },
      }],
    });
  }
  if (methodId === "semantic-heatmap") {
    const rawHeatmap = visuals.semanticHeatmap || { labels: [], matrix: [] };
    const heatmap = {
      labels: rawHeatmap.labels || [],
      matrix: rawHeatmap.matrix || [],
    };
    const data = heatmap.matrix.flatMap((row, y) => row.map((value, x) => [x, y, value]));
    return baseOption({
      tooltip: { formatter: (params) => `${heatmap.labels[params.value[1]]}<br/>× ${heatmap.labels[params.value[0]]}<br/>相似度：${formatNumber(params.value[2], 4)}` },
      grid: { left: 132, right: 54, top: 42, bottom: 112 },
      dataZoom: [
        ...fullSliderZoom(0, "x", 60, heatmap.labels.length).map((item) => item.type === "slider" ? { ...item, bottom: 52 } : item),
        ...fullSliderZoom(0, "y", 60, heatmap.labels.length),
      ],
      xAxis: categoryAxis(heatmap.labels, { axisLabel: { rotate: 42, fontSize: 10, formatter: (value) => truncateLabel(value, 13) } }),
      yAxis: categoryAxis(heatmap.labels, { axisLabel: { fontSize: 10, formatter: (value) => truncateLabel(value, 18) } }),
      visualMap: { min: 0, max: 1, left: "center", bottom: 8, orient: "horizontal", calculable: true, itemWidth: 18, itemHeight: 180, inRange: { color: HEAT_COLORS } },
      series: [{
        type: "heatmap",
        data,
        progressive: 500,
        emphasis: { itemStyle: { borderColor: "#0f172a", borderWidth: 1.2 } },
      }],
    });
  }
  if (methodId === "topic-cooccurrence-network") {
    const graph = visuals.topicCooccurrenceNetwork || { nodes: [], edges: [], conceptRanks: [] };
    const nodes = graph.nodes || [];
    const nodeById = new Map(nodes.map((node) => [node.id || node.name, node]));
    const links = (graph.edges || graph.links || [])
      .map((edge) => {
        const source = nodeById.get(edge.source);
        const target = nodeById.get(edge.target);
        if (!source || !target) return null;
        return [
          Number(source.x || 0),
          Number(source.y || 0),
          Number(target.x || 0),
          Number(target.y || 0),
          Number(edge.value || 1),
          source.name || edge.source,
          target.name || edge.target,
          edge.relation || "主题语义邻近",
          Number(edge.similarity || 0),
        ];
      })
      .filter(Boolean)
      ;
    const topicRows = nodes
      .slice()
      .sort((left, right) => Number(right.value || 0) - Number(left.value || 0))
      .slice(0, 14)
      .map((item) => ({ name: item.name || item.id, value: Number(item.value || 0), concepts: item.concepts || [] }))
      .reverse();
    const conceptRows = (graph.conceptRanks || [])
      .slice()
      .sort((left, right) => Number(right.count || 0) - Number(left.count || 0))
      .slice(0, 16)
      .map((item) => ({
        name: `${item.topic || "主题"} · ${item.concept || ""}`,
        concept: item.concept || "",
        topic: item.topic || "",
        value: Number(item.count || 0),
      }))
      .reverse();
    return baseOption({
      legend: { top: 8, left: 12, right: 150, data: ["主题节点", "Sentence-BERT语义边", "主题规模", "主题-概念权重"], type: "scroll", textStyle: LEGEND_TEXT_STYLE },
      tooltip: {
        formatter: (params) => {
          if (params.seriesName === "Sentence-BERT语义边") {
            const data = params.data || [];
            return `${data[5]} → ${data[6]}<br/>关系：${data[7]}<br/>权重：${formatNumber(data[4], 3)}${data[8] ? `<br/>相似度：${formatNumber(data[8], 3)}` : ""}`;
          }
          if (params.seriesName === "主题节点") {
            const data = params.data || [];
            return `${data[3]}<br/>主题规模：${formatNumber(data[2])}<br/>核心概念：${data[4] || ""}`;
          }
          if (params.seriesName === "主题-概念权重") {
            const item = conceptRows[params.dataIndex] || {};
            return `${item.topic}<br/>概念：${item.concept}<br/>权重：${formatNumber(item.value)}`;
          }
          return `${params.name}<br/>权重：${formatNumber(params.value, 2)}`;
        },
      },
      grid: [
        { left: 82, right: "39%", top: 96, bottom: 78, containLabel: true },
        { left: "70%", right: 58, top: 92, height: "30%", containLabel: true },
        { left: "70%", right: 58, top: "58%", bottom: 70, containLabel: true },
      ],
      xAxis: [
        valueAxis("主题语义空间 X", { nameLocation: "middle", nameGap: 34 }),
        valueAxis("主题规模", { gridIndex: 1, nameLocation: "middle", nameGap: 30 }),
        valueAxis("概念权重", { gridIndex: 2, nameLocation: "middle", nameGap: 30 }),
      ],
      yAxis: [
        valueAxis("主题语义空间 Y", { nameLocation: "middle", nameGap: 48 }),
        categoryAxis(topicRows.map((item) => item.name), {
          gridIndex: 1,
          axisLabel: { formatter: (value) => truncateLabel(value, 12), fontSize: 12 },
        }),
        categoryAxis(conceptRows.map((item) => item.name), {
          gridIndex: 2,
          axisLabel: { formatter: (value) => truncateLabel(value, 15), fontSize: 11 },
        }),
      ],
      series: [
        {
          name: "Sentence-BERT语义边",
          type: "custom",
          coordinateSystem: "cartesian2d",
          data: links,
          renderItem: (_params, api) => {
            const source = api.coord([api.value(0), api.value(1)]);
            const target = api.coord([api.value(2), api.value(3)]);
            const width = Math.max(1.2, Math.min(7, Math.sqrt(Number(api.value(4) || 1)) * 0.9));
            return {
              type: "line",
              shape: { x1: source[0], y1: source[1], x2: target[0], y2: target[1] },
              style: { stroke: "rgba(15,76,92,0.34)", lineWidth: width, lineDash: [6, 5] },
            };
          },
          z: 1,
        },
        {
          name: "主题节点",
          type: "effectScatter",
          data: nodes.map((item) => [
            Number(item.x || 0),
            Number(item.y || 0),
            Number(item.value || 1),
            item.name || item.id,
            (item.concepts || []).map((term) => term.word || term.name).slice(0, 5).join(" / "),
          ]),
          symbolSize: (value) => Math.max(30, Math.min(84, 24 + Math.sqrt(value[2] || 1) * 9.5)),
          rippleEffect: { scale: 2.05, brushType: "stroke" },
          itemStyle: {
            color: (params) => CHART_COLORS[params.dataIndex % CHART_COLORS.length],
            opacity: 0.82,
            borderColor: "#fff",
            borderWidth: 2,
          },
          label: {
            show: true,
            formatter: (params) => truncateLabel(params.data[3], 13),
            position: "right",
            fontSize: 12,
            fontWeight: 800,
            color: "#172033",
            textBorderColor: "#fff",
            textBorderWidth: 3,
          },
          z: 4,
        },
        {
          name: "主题规模",
          type: "bar",
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: topicRows.map((item) => item.value),
          barMaxWidth: 14,
          itemStyle: {
            borderRadius: [0, 5, 5, 0],
            color: (params) => CHART_COLORS[params.dataIndex % CHART_COLORS.length],
          },
          label: { show: true, position: "right", formatter: (params) => formatNumber(params.value), color: "#334155", fontSize: 12 },
        },
        {
          name: "主题-概念权重",
          type: "bar",
          xAxisIndex: 2,
          yAxisIndex: 2,
          data: conceptRows.map((item) => item.value),
          barMaxWidth: 12,
          itemStyle: {
            borderRadius: [0, 5, 5, 0],
            color: (params) => CHART_COLORS[(params.dataIndex + 5) % CHART_COLORS.length],
          },
          label: { show: true, position: "right", formatter: (params) => formatNumber(params.value), color: "#334155", fontSize: 11 },
        },
      ],
    });
  }
  if (
    methodId === "cooccurrence-network"
    || methodId === "multilayer-network"
    || methodId === "citation-network"
    || methodId === "author-concept"
  ) {
    const graph = methodId === "multilayer-network"
      ? visuals.multilayerNetwork
      : methodId === "citation-network"
        ? visuals.citationNetwork
        : methodId === "author-concept"
          ? visuals.authorConcept
          : methodId === "topic-cooccurrence-network"
            ? visuals.topicCooccurrenceNetwork
            : methodId === "place-entity-map"
              ? visuals.placeEntityMap
              : visuals.cooccurrenceNetwork;
    const isTopicNetwork = methodId === "topic-cooccurrence-network";
    const isCircularNetwork = ["cooccurrence-network", "multilayer-network", "author-concept", "topic-cooccurrence-network"].includes(methodId);
    const isAuthorConcept = methodId === "author-concept";
    const usesForceLayout = false;
    const nodeLimit = Number.POSITIVE_INFINITY;
    const edgeLimit = Number.POSITIVE_INFINITY;
    const { nodes, edges, categories } = isAuthorConcept
      ? layoutAuthorConceptNodes(graph?.nodes || [], graph?.edges || [], nodeLimit, edgeLimit)
      : spreadGraphNodes(graph?.nodes || [], graph?.edges || [], nodeLimit, edgeLimit);
    const importantCutoff = scope === "global" ? 9 : 6;
    const directed = methodId === "citation-network";
    const graphNodes = nodes.map((node) => {
      const value = Number(node.value || 1);
      const symbolSize = isTopicNetwork
        ? Math.max(42, Math.min(108, 34 + Math.sqrt(value) * 9.5))
        : isCircularNetwork
          ? Math.max(34, Math.min(92, 26 + Math.sqrt(value) * 5.8))
          : node.symbolSize;
      return {
        ...node,
        symbol: "circle",
        symbolSize,
      };
    });
    const nameById = new Map(graphNodes.map((node) => [node.id, node.name]));
    const sideRows = methodId === "citation-network"
      ? (graph?.ranks || []).slice(0, 18).map((item) => ({ name: item.title || item.name, value: item.influence || item.value || 0, type: item.topic || "文本" })).reverse()
      : methodId === "topic-cooccurrence-network"
        ? (graph?.nodes || []).slice().sort((left, right) => Number(right.value || 0) - Number(left.value || 0)).slice(0, 16).map((item) => ({ name: item.name, value: item.value || 0, type: item.concepts?.map((term) => term.word).slice(0, 3).join(" / ") || "主题" })).reverse()
        : methodId === "place-entity-map"
          ? (graph?.families || []).map((item) => ({ name: item.family, value: item.count || 0, type: "空间类型" })).reverse()
          : [];
    return baseOption({
      legend: { top: 8, left: 12, right: 120, data: categories.map((item) => item.name), type: "scroll", textStyle: { color: "#475569" } },
      tooltip: {
        formatter: (params) => {
          if (params.dataType === "edge") {
            return `${nameById.get(params.data.source) || params.data.source} → ${nameById.get(params.data.target) || params.data.target}<br/>关系：${params.data.relation || "共现关系"}<br/>权重：${formatNumber(params.data.value, 2)}${params.data.evidence ? `<br/>证据：${params.data.evidence}` : ""}`;
          }
          const concepts = params.data.concepts?.length ? `<br/>核心概念：${params.data.concepts.map((item) => item.word || item.name).slice(0, 4).join(" / ")}` : "";
          const docs = params.data.documents?.length ? `<br/>来源：${params.data.documents.slice(0, 4).join(" / ")}` : "";
          return `${params.name}<br/>类型：${params.data.category}<br/>权重：${formatNumber(params.data.value, 2)}${params.data.year ? `<br/>年份/顺序：${params.data.year}` : ""}${concepts}${docs}`;
        },
      },
      ...(sideRows.length ? {
        grid: { left: "72%", right: 58, top: 88, bottom: 62, containLabel: true },
        xAxis: valueAxis(methodId === "citation-network" ? "影响力" : "权重"),
        yAxis: categoryAxis(sideRows.map((item) => item.name), {
          axisLabel: { formatter: (value) => truncateLabel(value, 13), fontSize: 12 },
        }),
      } : {}),
      series: [
        {
          type: "graph",
          layout: usesForceLayout ? "force" : "none",
          animation: false,
          roam: true,
          draggable: false,
          left: isAuthorConcept ? 54 : 28,
          right: sideRows.length ? "34%" : 28,
          top: isAuthorConcept ? 86 : 76,
          bottom: isAuthorConcept ? 58 : 40,
          categories,
          data: graphNodes,
          force: usesForceLayout ? {
            repulsion: isAuthorConcept ? 760 : (isTopicNetwork ? 720 : 380),
            gravity: isAuthorConcept ? 0.025 : 0.055,
            edgeLength: isAuthorConcept ? [150, 310] : [90, 220],
            layoutAnimation: false,
            friction: 0.28,
          } : undefined,
          links: edges.map((edge) => ({
            source: edge.source,
            target: edge.target,
            value: edge.value || edge.count || 1,
            relation: edge.relation,
            evidence: edge.evidence,
            lineStyle: {
              width: Math.max(1.1, Math.min(8, Math.sqrt(edge.value || edge.count || 1) * 1.05)),
              opacity: Math.max(0.2, Math.min(0.72, Number(edge.value || edge.count || 1) / 10)),
              curveness: directed ? 0.18 : 0.08,
            },
          })),
          edgeSymbol: directed ? ["none", "arrow"] : ["none", "none"],
          edgeSymbolSize: directed ? [0, 8] : [0, 0],
          label: {
            show: true,
            position: isCircularNetwork ? "inside" : "right",
            formatter: (params) => displayLabelForNetwork(methodId, params, importantCutoff, isTopicNetwork, isCircularNetwork),
            fontSize: isAuthorConcept ? 10 : (isTopicNetwork ? 13 : 12),
            fontWeight: 800,
            color: isCircularNetwork ? "#fff" : "#172033",
            lineHeight: isAuthorConcept ? 12 : 15,
            width: isAuthorConcept ? 48 : (isTopicNetwork ? 82 : 62),
            overflow: "truncate",
            textBorderColor: isCircularNetwork ? "rgba(2,6,23,0.55)" : "transparent",
            textBorderWidth: isCircularNetwork ? 2 : 0,
          },
          lineStyle: { color: "source" },
          labelLayout: { hideOverlap: true },
          emphasis: { focus: "adjacency", scale: true, lineStyle: { opacity: 0.88, width: 3.2 } },
          scaleLimit: { min: 0.35, max: 4.5 },
        },
        ...(sideRows.length ? [{
          name: methodId === "citation-network" ? "核心文本排行" : "侧边统计",
          type: "bar",
          data: sideRows.map((item) => item.value),
          barMaxWidth: 14,
          itemStyle: {
            borderRadius: [0, 5, 5, 0],
            color: (params) => CHART_COLORS[params.dataIndex % CHART_COLORS.length],
          },
          label: { show: true, position: "right", formatter: (params) => formatNumber(params.value, 2), color: "#334155", fontSize: 12 },
        }] : []),
      ],
    });
  }
  if (methodId === "centrality-radar") {
    const rows = visuals.centralityRadar || [];
    const indicators = [
      { name: "度中心性", max: 1 },
      { name: "加权中心性", max: 1 },
      { name: "介数中心性", max: 1 },
      { name: "接近中心性", max: 1 },
      { name: "特征向量", max: 1 },
    ];
    const scored = rows.map((item) => ({
      ...item,
      score: Number(((Number(item.degree || 0) + Number(item.weighted || 0) + Number(item.betweenness || 0) + Number(item.closeness || 0) + Number(item.eigenvector || 0)) / 5).toFixed(3)),
    }));
    const barRows = scored.slice().reverse();
    return baseOption({
      tooltip: { trigger: "item" },
      legend: { type: "scroll", bottom: 2, left: 12, right: 12, textStyle: { color: "#475569" } },
      radar: {
        indicator: indicators,
        center: ["31%", "48%"],
        radius: "58%",
        splitNumber: 5,
        shape: "polygon",
        axisName: { color: "#334155", fontSize: 11, fontWeight: 700 },
        splitLine: { lineStyle: { color: "rgba(148,163,184,.26)" } },
        splitArea: { areaStyle: { color: ["rgba(248,250,252,.88)", "rgba(241,245,249,.72)"] } },
        axisLine: { lineStyle: { color: "rgba(100,116,139,.32)" } },
      },
      grid: { left: "58%", right: 42, top: 64, bottom: 78 },
      xAxis: valueAxis("综合中心性", { min: 0, max: 1 }),
      yAxis: categoryAxis(barRows.map((item) => item.name), { axisLabel: { formatter: (value) => truncateLabel(value, 16), fontSize: 10 } }),
      series: [
        {
          type: "radar",
          data: scored.map((item, index) => ({
            name: item.name,
            value: [item.degree, item.weighted, item.betweenness, item.closeness, item.eigenvector],
            areaStyle: { opacity: index < 4 ? 0.14 : 0.04 },
            lineStyle: { width: index < 4 ? 2 : 1 },
          })),
          symbolSize: 4,
        },
        {
          name: "综合中心性",
          type: "bar",
          data: barRows.map((item) => item.score),
          barMaxWidth: 14,
          itemStyle: { borderRadius: [0, 5, 5, 0], color: "#0f4c5c" },
          label: { show: true, position: "right", formatter: (params) => formatNumber(params.value, 3), color: "#334155", fontSize: 10 },
        },
      ],
    });
  }
  if (methodId === "place-entity-map") {
    const place = visuals.placeEntityMap || { nodes: [], links: [], families: [], paths: [] };
    const rawNodes = place.nodes || [];
    const nodeById = new Map(rawNodes.map((item) => [item.id || item.name, item]));
    const families = [...new Set(rawNodes.map((item) => item.type || "空间实体"))];
    const familyIndex = new Map(families.map((family, index) => [family, index]));
    const links = (place.links || place.edges || [])
      .map((link) => {
        const source = nodeById.get(link.source);
        const target = nodeById.get(link.target);
        if (!source || !target) return null;
        return [source.x, source.y, target.x, target.y, link.value || 1, source.name || link.source, target.name || link.target];
      })
      .filter(Boolean);
    const familyRows = (place.families || families.map((family) => ({
      family,
      count: rawNodes.filter((item) => (item.type || "空间实体") === family).reduce((sum, item) => sum + Number(item.value || 0), 0),
    }))).reverse();
    const maxValue = Math.max(1, ...rawNodes.map((item) => Number(item.value || 0)));
    return baseOption({
      legend: { type: "scroll", top: 8, left: 12, right: 130, data: families, textStyle: LEGEND_TEXT_STYLE },
      tooltip: {
        formatter: (params) => {
          if (params.seriesName === "地名共现边") {
            const data = params.data || [];
            return `${data[5]} → ${data[6]}<br/>同文档共现：${formatNumber(data[4])}`;
          }
          if (params.seriesName === "空间类型统计") {
            const item = familyRows[params.dataIndex] || {};
            return `${item.family}<br/>出现次数：${formatNumber(item.count)}`;
          }
          const data = params.data || [];
          return `${data[3]}<br/>空间类型：${data[4]}<br/>实体标签：${data[6] || ""}<br/>出现次数：${formatNumber(data[2])}<br/>覆盖文档：${formatNumber(data[7])}${data[8] ? `<br/>来源：${data[8]}` : ""}`;
        },
      },
      grid: [
        { left: 58, right: "33%", top: 58, bottom: 62 },
        { left: "72%", right: 42, top: 78, bottom: 56 },
      ],
      dataZoom: [
        { type: "inside", xAxisIndex: 0, filterMode: "none" },
        { type: "inside", yAxisIndex: 0, filterMode: "none" },
      ],
      xAxis: [
        valueAxis("空间语义 X", { min: -92, max: 92 }),
        valueAxis("出现次数", { gridIndex: 1 }),
      ],
      yAxis: [
        valueAxis("空间语义 Y", { min: -72, max: 72 }),
        categoryAxis(familyRows.map((item) => item.family), {
          gridIndex: 1,
          axisLabel: { formatter: (value) => truncateLabel(value, 12), fontSize: 12 },
        }),
      ],
      visualMap: {
        min: 1,
        max: maxValue,
        left: 20,
        bottom: 8,
        orient: "horizontal",
        calculable: true,
        dimension: 2,
        seriesIndex: families.map((_family, index) => index + 1),
        itemWidth: 18,
        itemHeight: 160,
        text: ["高频", "低频"],
        inRange: { color: ["#93c5fd", "#2a9d8f", "#ffb703", "#d62828"] },
      },
      graphic: [
        {
          type: "text",
          left: 72,
          top: 38,
          style: {
            text: "按空间类型分区：节点大小=出现次数，连线=同文档共现",
            fill: "#64748b",
            font: `800 13px ${CHART_FONT_FAMILY}`,
          },
        },
      ],
      series: [
        {
          name: "地名共现边",
          type: "custom",
          coordinateSystem: "cartesian2d",
          data: links,
          renderItem: (_params, api) => {
            const source = api.coord([api.value(0), api.value(1)]);
            const target = api.coord([api.value(2), api.value(3)]);
            return {
              type: "line",
              shape: { x1: source[0], y1: source[1], x2: target[0], y2: target[1] },
              style: {
                stroke: "rgba(15,76,92,0.24)",
                lineWidth: Math.max(0.7, Math.min(5.5, Math.sqrt(Number(api.value(4) || 1)))),
              },
            };
          },
          z: 1,
        },
        ...families.map((family, index) => ({
          name: family,
          type: "scatter",
          data: rawNodes
            .filter((item) => (item.type || "空间实体") === family)
            .map((item) => [
              Number(item.x || 0),
              Number(item.y || 0),
              Number(item.value || 1),
              item.name || item.id,
              item.type || "空间实体",
              item.documents || [],
              item.entityType || "",
              item.documentCount || 0,
              (item.documents || []).slice(0, 4).join(" / "),
            ]),
          symbolSize: (value) => Math.max(11, Math.min(62, 9 + Math.sqrt(Number(value[2] || 1)) * 5.2)),
          itemStyle: {
            color: CHART_COLORS[(familyIndex.get(family) || index) % CHART_COLORS.length],
            opacity: 0.8,
            borderColor: "#fff",
            borderWidth: 1.2,
          },
          label: {
            show: true,
            formatter: (params) => (Number(params.data[2] || 0) >= maxValue * 0.18 ? truncateLabel(params.data[3], 12) : ""),
            fontSize: 12,
            fontWeight: 800,
            color: "#172033",
          },
          emphasis: { focus: "series", scale: true },
          z: 3,
        })),
        {
          name: "空间类型统计",
          type: "bar",
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: familyRows.map((item) => item.count),
          barMaxWidth: 16,
          itemStyle: {
            borderRadius: [0, 5, 5, 0],
            color: (params) => CHART_COLORS[params.dataIndex % CHART_COLORS.length],
          },
          label: { show: true, position: "right", formatter: (params) => formatNumber(params.value), color: "#334155", fontSize: 12 },
        },
      ],
    });
  }
  if (methodId === "topic-clustering-map") {
    const clustering = visuals.topicClusteringMap || { points: [], clusters: [], links: [] };
    const requestedTopicCount = normalizeTopicCount(visuals.topicModel?.requestedTopicCount || payload?.topicCount || 18);
    const points = clustering.points || [];
    const clusters = clustering.clusters || [];
    const topics = [...new Set(points.map((item) => item.topic || "主题"))];
    const topicIndex = new Map(topics.map((topic, index) => [topic, index]));
    const rankRows = clusters.map((item) => ({ name: item.label, value: item.count, terms: item.topTerms || [] })).reverse();
    const clusterById = new Map(clusters.map((item) => [item.id || item.label, item]));
    const clusterLinks = (clustering.links || [])
      .map((item) => {
        const source = clusterById.get(item.source);
        const target = clusterById.get(item.target);
        if (!source || !target) return null;
        return [source.x, source.y, target.x, target.y, item.value, item.source, item.target];
      })
      .filter(Boolean);
    return baseOption({
      legend: { type: "scroll", top: 8, left: 12, right: 170, data: topics, textStyle: LEGEND_TEXT_STYLE },
      tooltip: {
        formatter: (params) => {
          if (params.seriesName === "主题簇中心") {
            const item = clusters.find((cluster) => (cluster.id || cluster.label) === params.data.id) || {};
            const data = params.data || [];
            return `${data[3] || item.label}<br/>规模：${formatNumber(data[2] || item.count)}<br/>代表词：${data[4] || (item.topTerms || []).map((term) => term.word).join(" / ")}`;
          }
          if (params.seriesName === "主题规模") {
            const item = rankRows[params.dataIndex] || {};
            return `${item.name}<br/>规模：${formatNumber(item.value)}<br/>代表词：${item.terms.map((term) => term.word).join(" / ")}`;
          }
          const data = params.data || [];
          return `${data[3]}<br/>主题：${data[4]}<br/>来源：${data[5] || ""}<br/>权重：${formatNumber(data[2], 2)}${data[6] ? `<br/>证据：${data[6]}` : ""}`;
        },
      },
      grid: [
        { left: 82, right: "35%", top: 100, bottom: 78, containLabel: true },
        { left: "73%", right: 58, top: 96, bottom: 70, containLabel: true },
      ],
      dataZoom: [
        { type: "inside", xAxisIndex: 0, filterMode: "none" },
        { type: "inside", yAxisIndex: 0, filterMode: "none" },
      ],
      xAxis: [
        valueAxis("主题空间 X", { min: -104, max: 104, nameLocation: "middle", nameGap: 34 }),
        valueAxis("规模", { gridIndex: 1, nameLocation: "middle", nameGap: 32 }),
      ],
      yAxis: [
        valueAxis("主题空间 Y", { min: -82, max: 82, nameLocation: "middle", nameGap: 50 }),
        categoryAxis(rankRows.map((item) => item.name), {
          gridIndex: 1,
          axisLabel: { formatter: (value) => truncateLabel(value, 12), fontSize: 12 },
        }),
      ],
      series: [
        ...topics.map((topic, index) => ({
          name: topic,
          type: "scatter",
          data: points
            .filter((item) => (item.topic || "主题") === topic)
            .map((item) => [item.x, item.y, item.value, item.label, item.topic, item.document, item.stage]),
          symbolSize: (value) => Math.max(7, Math.min(38, 7 + Math.sqrt(value[2] || 1) * 3.5)),
          itemStyle: { color: CHART_COLORS[index % CHART_COLORS.length], opacity: 0.66, borderColor: "#fff", borderWidth: 1 },
          label: {
            show: true,
            formatter: (params) => (Number(params.data[2] || 0) > 8 ? truncateLabel(params.data[3], 11) : ""),
            color: "#172033",
            fontSize: 12,
          },
          emphasis: { focus: "series", scale: true },
        })),
        {
          name: "簇间关系",
          type: "custom",
          coordinateSystem: "cartesian2d",
          data: clusterLinks,
          renderItem: (_params, api) => {
            const source = api.coord([api.value(0), api.value(1)]);
            const target = api.coord([api.value(2), api.value(3)]);
            const width = Math.max(1, Math.min(6, Math.sqrt(Number(api.value(4) || 1))));
            return {
              type: "line",
              shape: { x1: source[0], y1: source[1], x2: target[0], y2: target[1] },
              style: { stroke: "rgba(15,76,92,0.28)", lineWidth: width, lineDash: [5, 5] },
            };
          },
          z: 1,
        },
        {
          name: "主题簇中心",
          type: "effectScatter",
          data: clusters.map((item) => [item.x, item.y, item.count, item.label, (item.topTerms || []).map((term) => term.word).join(" / ")]),
          symbolSize: (value) => Math.max(24, Math.min(78, 18 + Math.sqrt(value[2] || 1) * 5.6)),
          rippleEffect: { scale: 2.1, brushType: "stroke" },
          itemStyle: {
            color: (params) => CHART_COLORS[params.dataIndex % CHART_COLORS.length],
            opacity: 0.8,
            borderColor: "#fff",
            borderWidth: 2,
          },
          label: { show: true, formatter: (params) => truncateLabel(params.data[3], 12), fontSize: 12, fontWeight: 800, color: "#172033", position: "right" },
          z: 4,
        },
        {
          name: "主题规模",
          type: "bar",
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: rankRows.map((item) => item.value),
          barMaxWidth: 14,
          itemStyle: {
            borderRadius: [0, 5, 5, 0],
            color: (params) => CHART_COLORS[(topicIndex.get(rankRows[params.dataIndex]?.name) || params.dataIndex) % CHART_COLORS.length],
          },
          label: { show: true, position: "right", formatter: (params) => formatNumber(params.value), color: "#334155", fontSize: 12 },
        },
      ],
    });
  }
  if (methodId === "topic-tree") {
    const tree = visuals.topicTree || { children: [], topicRanks: [], conceptRanks: [], depthStats: [] };
    const topicRows = (tree.topicRanks || []).map((item) => ({
      name: item.topic || item.name,
      value: item.count || item.value || 0,
      concepts: item.concepts || "",
    })).reverse();
    const conceptRows = (tree.conceptRanks || []).map((item) => ({
      name: item.concept || item.name,
      value: item.value || item.count || 0,
    })).reverse();
    return baseOption({
      tooltip: {
        formatter: (params) => {
          if (params.seriesName === "主题覆盖量") {
            const item = topicRows[params.dataIndex] || {};
            return `${item.name}<br/>覆盖量：${formatNumber(item.value, 2)}<br/>代表概念：${item.concepts}`;
          }
          if (params.seriesName === "概念解释力") return `${params.name}<br/>权重：${formatNumber(params.value, 4)}`;
          return `${params.name}<br/>权重：${formatNumber(params.value, 4)}`;
        },
      },
      grid: [
        { left: "64%", right: 64, top: 90, height: "30%", containLabel: true },
        { left: "64%", right: 64, top: "60%", bottom: 68, containLabel: true },
      ],
      xAxis: [
        valueAxis("主题覆盖量", { gridIndex: 0, nameLocation: "middle", nameGap: 32 }),
        valueAxis("概念解释力", { gridIndex: 1, nameLocation: "middle", nameGap: 32 }),
      ],
      yAxis: [
        categoryAxis(topicRows.map((item) => item.name), {
          gridIndex: 0,
          axisLabel: { formatter: (value) => truncateLabel(value, 12), fontSize: 12 },
        }),
        categoryAxis(conceptRows.map((item) => item.name), {
          gridIndex: 1,
          axisLabel: { formatter: (value) => truncateLabel(value, 12), fontSize: 12 },
        }),
      ],
      series: [
        {
          name: "层次主题树",
          type: "tree",
          data: [{
            name: tree.name || "主题结构",
            children: (tree.children || []).map((topic) => ({
              ...topic,
              name: topic.name,
              children: topic.children || [],
            })),
          }],
          left: 24,
          right: "40%",
          top: 72,
          bottom: 44,
          orient: "LR",
          roam: true,
          expandAndCollapse: true,
          initialTreeDepth: 2,
          symbol: "roundRect",
          symbolSize: (value, params) => (params?.treeAncestors?.length <= 2 ? 16 : 10),
          edgeShape: "polyline",
          edgeForkPosition: "56%",
          lineStyle: { color: "rgba(15,76,92,0.32)", width: 1.4, curveness: 0.18 },
          itemStyle: { color: "#0f4c5c", borderColor: "#fff", borderWidth: 1.5 },
          label: {
            show: true,
            position: "left",
            verticalAlign: "middle",
            align: "right",
            formatter: (params) => truncateLabel(params.name, params?.treeAncestors?.length <= 2 ? 18 : 14),
            color: "#172033",
            fontSize: 12,
            fontWeight: 800,
            width: 120,
            overflow: "truncate",
          },
          leaves: {
            label: {
              position: "right",
              align: "left",
              color: "#334155",
              fontSize: 12,
              fontWeight: 700,
              width: 110,
              overflow: "truncate",
            },
            itemStyle: { color: "#2a9d8f" },
          },
          emphasis: { focus: "descendant" },
        },
        {
          name: "主题覆盖量",
          type: "bar",
          xAxisIndex: 0,
          yAxisIndex: 0,
          data: topicRows.map((item) => item.value),
          barMaxWidth: 13,
          itemStyle: { borderRadius: [0, 5, 5, 0], color: "#0f4c5c" },
          label: { show: true, position: "right", formatter: (params) => formatNumber(params.value, 2), color: "#334155", fontSize: 12 },
        },
        {
          name: "概念解释力",
          type: "bar",
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: conceptRows.map((item) => item.value),
          barMaxWidth: 12,
          itemStyle: {
            borderRadius: [0, 5, 5, 0],
            color: (params) => CHART_COLORS[(params.dataIndex + 2) % CHART_COLORS.length],
          },
          label: { show: true, position: "right", formatter: (params) => formatNumber(params.value, 2), color: "#334155", fontSize: 12 },
        },
      ],
    });
  }
  if (methodId === "topic-river") {
    const river = visuals.topicRiver || { topics: [], series: [] };
    return baseOption({
      tooltip: { trigger: "axis", axisPointer: { type: "line" } },
      legend: { top: 8, left: 12, right: 130, type: "scroll", textStyle: { color: "#475569" } },
      grid: { left: 78, right: 46, top: 96, bottom: 86, containLabel: true },
      dataZoom: sliderZoom(0),
      xAxis: categoryAxis(river.series.map((item) => item.stage), { axisLabel: { rotate: scope === "global" ? 34 : 0, formatter: (value) => truncateLabel(value, 14) } }),
      yAxis: valueAxis("主题强度", { nameLocation: "middle", nameGap: 52 }),
      series: river.topics.map((topic, index) => {
        const color = CHART_COLORS[index % CHART_COLORS.length];
        return {
          name: topic,
          type: "line",
          stack: "topic",
          smooth: true,
          symbol: "none",
          sampling: "lttb",
          data: river.series.map((item) => item[topic] || 0),
          lineStyle: { width: 1.2, color },
          areaStyle: { opacity: 0.42, color: new echarts.graphic.LinearGradient(0, 0, 0, 1, [{ offset: 0, color: colorAlpha(color, 0.62) }, { offset: 1, color: colorAlpha(color, 0.08) }]) },
          emphasis: { focus: "series" },
        };
      }),
    });
  }
  if (methodId === "topic-concept-matrix" || methodId === "concept-migration") {
    const matrix = methodId === "concept-migration" ? visuals.conceptMigration : visuals.topicConceptMatrix;
    const yLabels = methodId === "concept-migration"
      ? (matrix?.concepts || [])
      : (matrix?.topics || []);
    const xLabels = methodId === "concept-migration"
      ? (matrix?.documents || [])
      : (matrix?.concepts || []);
    const data = (matrix?.matrix || []).flatMap((row, y) => row.map((value, x) => [x, y, value]));
    const maxValue = Math.max(1, ...data.map((item) => Number(item[2] || 0)));
    const rowTotals = matrix?.rowTotals || (matrix?.matrix || []).map((row) => row.reduce((sum, value) => sum + Number(value || 0), 0));
    const colTotals = matrix?.colTotals || xLabels.map((_label, x) => (matrix?.matrix || []).reduce((sum, row) => sum + Number(row[x] || 0), 0));
    const topCells = (matrix?.topCells || []).slice(0, 12);
    return baseOption({
      tooltip: {
        formatter: (params) => {
          if (params.seriesName === "概念总贡献") return `${params.name}<br/>总贡献：${formatNumber(params.value, 4)}`;
          if (params.seriesName === "主题总强度") return `${params.name}<br/>总强度：${formatNumber(params.value, 4)}`;
          return `${yLabels[params.value[1]]}<br/>${xLabels[params.value[0]]}<br/>强度：${formatNumber(params.value[2], 4)}`;
        },
      },
      grid: [
        { left: 146, right: 204, top: 104, bottom: 150, containLabel: true },
        { left: 146, right: 204, top: 46, height: 42, containLabel: true },
        { right: 76, width: 106, top: 104, bottom: 150, containLabel: true },
      ],
      dataZoom: [
        ...fullSliderZoom([0, 1], "x", 48, xLabels.length).map((item) => item.type === "slider" ? { ...item, bottom: 64 } : item),
        ...fullSliderZoom([0, 2], "y", 34, yLabels.length).map((item) => item.type === "slider" ? { ...item, right: 18 } : item),
      ],
      xAxis: [
        categoryAxis(xLabels, { axisLabel: { rotate: 42, fontSize: 12, formatter: (value) => truncateLabel(value, 13) } }),
        categoryAxis(xLabels, { gridIndex: 1, axisLabel: { show: false }, axisTick: { show: false } }),
        valueAxis("总强度", { gridIndex: 2, nameLocation: "middle", nameGap: 32, splitLine: { show: false }, axisLabel: { formatter: (value) => formatNumber(value, 1) } }),
      ],
      yAxis: [
        categoryAxis(yLabels, { axisLabel: { fontSize: 12, formatter: (value) => truncateLabel(value, 18) } }),
        valueAxis("概念总贡献", { gridIndex: 1, nameLocation: "middle", nameGap: 38, splitLine: { show: false }, axisLabel: { show: false } }),
        categoryAxis(yLabels, { gridIndex: 2, axisLabel: { show: false }, axisTick: { show: false } }),
      ],
      visualMap: { min: 0, max: maxValue, left: "center", bottom: 12, orient: "horizontal", calculable: true, itemWidth: 18, itemHeight: 150, inRange: { color: methodId === "concept-migration" ? DIVERGING_COLORS : HEAT_COLORS }, seriesIndex: 0 },
      graphic: topCells.map((cell, index) => ({
        type: "text",
        right: 16,
        top: 18 + index * 19,
        style: {
          text: index < 5 ? `${truncateLabel(cell.topic || "", 7)} × ${truncateLabel(cell.concept || "", 7)} ${formatNumber(cell.value, 2)}` : "",
          fill: "#64748b",
          font: `700 12px ${CHART_FONT_FAMILY}`,
        },
      })),
      series: [
        {
          name: "主题-概念关联",
          type: "heatmap",
          data,
          progressive: 600,
          label: {
            show: true,
            formatter: (params) => (Number(params.value[2] || 0) >= maxValue * 0.72 ? formatNumber(params.value[2], 2) : ""),
            fontSize: 12,
            color: "#172033",
          },
          emphasis: { itemStyle: { borderColor: "#0f172a", borderWidth: 1.2 } },
        },
        {
          name: "概念总贡献",
          type: "bar",
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: colTotals,
          barMaxWidth: 12,
          itemStyle: { color: "#2a9d8f", opacity: 0.76 },
        },
        {
          name: "主题总强度",
          type: "bar",
          xAxisIndex: 2,
          yAxisIndex: 2,
          data: rowTotals,
          barMaxWidth: 12,
          itemStyle: { color: "#0f4c5c", opacity: 0.78 },
        },
      ],
    });
  }
  if (methodId === "idea-diffusion") {
    const diffusion = visuals.ideaDiffusion || { items: [] };
    const items = diffusion.items || [];
    const maxCumulative = Math.max(1, ...items.map((item) => Number(item.cumulative || 0)));
    const topics = [...new Set(items.map((item) => item.topic || "主题"))];
    const topicIndex = new Map(topics.map((topic, index) => [topic, index]));
    return baseOption({
      tooltip: {
        trigger: "axis",
        axisPointer: { type: "shadow" },
        formatter: (params) => {
          const item = items[params[0]?.dataIndex || 0] || {};
          return `${item.title}<br/>年份/顺序：${item.year || ""}<br/>概念：${diffusion.concept || "概念"}<br/>频次：${formatNumber(item.count)}<br/>累计扩散：${formatNumber(item.cumulative)}<br/>与源头相似度：${formatNumber(item.similarity, 3)}<br/>主题：${item.topic || ""}`;
        },
      },
      legend: { top: 8, left: 12, right: 120, type: "scroll", textStyle: LEGEND_TEXT_STYLE },
      grid: [
        { left: 64, right: 80, top: 66, height: "42%" },
        { left: 64, right: 80, top: "64%", bottom: 78 },
      ],
      dataZoom: sliderZoom(0),
      xAxis: [
        categoryAxis(items.map((item) => item.title), { axisLabel: { rotate: 32, formatter: (value) => truncateLabel(value, 14) } }),
        categoryAxis(items.map((item) => item.title), { gridIndex: 1, axisLabel: { rotate: 32, formatter: (value) => truncateLabel(value, 14) } }),
      ],
      yAxis: [
        valueAxis("频次/累计"),
        valueAxis("语义相似度", { min: 0, max: 1, splitLine: { show: false } }),
        valueAxis("扩散指数", { gridIndex: 1, min: 0, max: maxCumulative, splitLine: SPLIT_LINE }),
      ],
      series: [
        {
          name: `${diffusion.concept || "概念"}频次`,
          type: "bar",
          data: items.map((item) => item.count),
          barMaxWidth: 28,
          itemStyle: {
            borderRadius: [5, 5, 0, 0],
            color: (params) => CHART_COLORS[(topicIndex.get(items[params.dataIndex]?.topic || "主题") || 0) % CHART_COLORS.length],
          },
          markPoint: { data: [{ type: "max", name: "最高频" }], symbolSize: 48 },
        },
        {
          name: "累计扩散",
          type: "line",
          smooth: true,
          symbolSize: 6,
          data: items.map((item) => item.cumulative || 0),
          lineStyle: { width: 2.2, color: "#0f4c5c", type: "dashed" },
          itemStyle: { color: "#0f4c5c" },
          areaStyle: { color: colorAlpha("#0f4c5c", 0.08) },
        },
        {
          name: "与源头相似度",
          type: "line",
          yAxisIndex: 1,
          smooth: true,
          symbolSize: 7,
          data: items.map((item) => item.similarity),
          lineStyle: { width: 2.4, color: "#d62828" },
          itemStyle: { color: "#d62828" },
          areaStyle: { color: colorAlpha("#d62828", 0.08) },
        },
        {
          name: "扩散路径强度",
          type: "line",
          xAxisIndex: 1,
          yAxisIndex: 2,
          smooth: true,
          symbol: "circle",
          symbolSize: (value) => Math.max(7, Math.min(22, 7 + Math.sqrt(value || 1))),
          data: items.map((item) => item.cumulative || 0),
          lineStyle: { width: 2.8, color: "#8338ec" },
          itemStyle: { color: "#8338ec" },
          markArea: {
            silent: true,
            itemStyle: { color: "rgba(131,56,236,0.06)" },
            data: [[{ xAxis: items[0]?.title || "" }, { xAxis: items[Math.min(items.length - 1, Math.ceil(items.length / 3))]?.title || "" }]],
          },
        },
      ],
    });
  }
  if (methodId === "transmission-path-map") {
    const path = visuals.transmissionPathMap || { nodes: [], links: [], concepts: [], topics: [], matrix: [] };
    const nodes = path.nodes || [];
    const concepts = path.concepts || [];
    const topics = path.topics || [...new Set(nodes.map((item) => item.topic || "主题"))];
    const topicIndex = new Map(topics.map((topic, index) => [topic, index]));
    const stageLabels = nodes.map((item, index) => item.name || `阶段 ${index + 1}`);
    const nodeOrder = new Map(nodes.map((node, index) => [node.id, index]));
    const matrixData = concepts.flatMap((concept, conceptIndex) => (
      nodes.map((_node, stageIndex) => [stageIndex, conceptIndex, Number((path.matrix || [])[stageIndex]?.[conceptIndex] || 0), concept])
    ));
    const maxMatrix = Math.max(1, ...matrixData.map((item) => Number(item[2] || 0)));
    const fallbackLinks = nodes.slice(1).map((node, index) => ({
      source: nodes[index]?.id,
      target: node.id,
      value: Math.max(1, Number(node.value || 1)),
      relation: "相邻阶段",
      evidence: "",
    }));
    const linkPairs = ((path.links || []).length ? path.links : fallbackLinks).map((link) => {
      const source = nodes[nodeOrder.get(link.source)];
      const target = nodes[nodeOrder.get(link.target)];
      if (!source || !target) return null;
      const sourceOrder = nodeOrder.get(source.id) || 0;
      const targetOrder = nodeOrder.get(target.id) || 0;
      const sourceTopic = source.topic || "主题";
      const targetTopic = target.topic || "主题";
      return [
        sourceOrder,
        topicIndex.get(sourceTopic) ?? 0,
        targetOrder,
        topicIndex.get(targetTopic) ?? 0,
        link.value,
        link.relation,
        link.evidence,
        source.name,
        target.name,
      ];
    }).filter(Boolean);
    const nodeData = nodes.map((item, index) => [
      index,
      topicIndex.get(item.topic || "主题") ?? 0,
      item.value,
      item.name,
      item.topic || "主题",
      item.year,
      item.similarity,
    ]);
    return baseOption({
      legend: { top: 8, left: 12, right: 130, type: "scroll", data: topics, textStyle: LEGEND_TEXT_STYLE },
      tooltip: {
        formatter: (params) => {
          if (params.seriesName === "概念剖面") return `${stageLabels[params.value[0]] || ""}<br/>${concepts[params.value[1]]}<br/>频次：${formatNumber(params.value[2])}`;
          if (params.seriesName === "传播边") return `${params.data?.[7] || ""} → ${params.data?.[8] || ""}<br/>关系：${params.data?.[5] || "传播路径"}<br/>强度：${formatNumber(params.data?.[4], 2)}${params.data?.[6] ? `<br/>证据：${params.data[6]}` : ""}`;
          const data = params.data || [];
          return `${data[3]}<br/>主题：${data[4]}<br/>阶段/年份：${data[5]}<br/>概念强度：${formatNumber(data[2])}<br/>源头相似度：${formatNumber(data[6], 3)}`;
        },
      },
      grid: [
        { left: 92, right: 42, top: 96, height: "42%", containLabel: true },
        { left: 92, right: 42, top: "64%", bottom: 92, containLabel: true },
      ],
      dataZoom: [
        ...fullSliderZoom([0, 1], "x", 44, stageLabels.length).map((item) => item.type === "slider" ? { ...item, bottom: 54 } : item),
      ],
      xAxis: [
        categoryAxis(stageLabels, { axisLabel: { rotate: scope === "global" ? 28 : 18, formatter: (value) => truncateLabel(value, 14), margin: 16 } }),
        categoryAxis(stageLabels, { gridIndex: 1, axisLabel: { rotate: scope === "global" ? 28 : 18, formatter: (value) => truncateLabel(value, 14), margin: 16 } }),
      ],
      yAxis: [
        categoryAxis(topics, { axisLabel: { formatter: (value) => truncateLabel(value, 16), margin: 12 } }),
        categoryAxis(concepts, { gridIndex: 1, axisLabel: { formatter: (value) => truncateLabel(value, 14), fontSize: 12, margin: 12 } }),
      ],
      visualMap: {
        min: 0,
        max: maxMatrix,
        left: "center",
        bottom: 8,
        orient: "horizontal",
        calculable: true,
        itemWidth: 18,
        itemHeight: 150,
        inRange: { color: HEAT_COLORS },
        seriesIndex: topics.length + 1,
      },
      series: [
        {
          name: "传播边",
          type: "custom",
          coordinateSystem: "cartesian2d",
          data: linkPairs,
          renderItem: (_params, api) => {
            const source = api.coord([api.value(0), api.value(1)]);
            const target = api.coord([api.value(2), api.value(3)]);
            return {
              type: "line",
              shape: { x1: source[0], y1: source[1], x2: target[0], y2: target[1] },
              style: {
                stroke: "rgba(15,76,92,0.34)",
                lineWidth: Math.max(1, Math.min(7, Math.sqrt(Number(api.value(4) || 1)))),
                lineDash: api.value(5) === "源头相似路径" ? [6, 4] : null,
              },
            };
          },
          z: 1,
        },
        ...topics.map((topic, index) => ({
          name: topic,
          type: "scatter",
          data: nodeData.filter((item) => item[4] === topic),
          symbol: "circle",
          symbolSize: (value) => Math.max(24, Math.min(72, 22 + Math.sqrt(value[2] || 1) * 5.2)),
          itemStyle: { color: NETWORK_COLORS[index % NETWORK_COLORS.length], opacity: 0.92, borderColor: "#fff", borderWidth: 2, shadowBlur: 10, shadowColor: colorAlpha(NETWORK_COLORS[index % NETWORK_COLORS.length], 0.34) },
          label: {
            show: true,
            position: "inside",
            formatter: (params) => (params.data[2] > 0 ? truncateLabel(params.data[3], 10) : ""),
            fontSize: 12,
            fontWeight: 900,
            color: "#fff",
            textBorderColor: "rgba(2,6,23,.56)",
            textBorderWidth: 2,
            width: 64,
            overflow: "truncate",
          },
          emphasis: { focus: "series", scale: true },
        })),
        {
          name: "概念剖面",
          type: "heatmap",
          xAxisIndex: 1,
          yAxisIndex: 1,
          data: matrixData,
          progressive: 400,
          label: { show: true, formatter: (params) => (params.value[2] >= maxMatrix * 0.65 ? formatNumber(params.value[2]) : ""), fontSize: 12, color: "#172033" },
          emphasis: { itemStyle: { borderColor: "#0f172a", borderWidth: 1.1 } },
        },
      ],
    });
  }
  return baseOption({ title: { text: titleText, left: "center", textStyle: { color: "#172033" } }, series: [] });
}

function asSeriesArray(option) {
  if (!option) return [];
  if (!Array.isArray(option.series)) option.series = option.series ? [option.series] : [];
  return option.series;
}

function appendGraphic(option, elements) {
  if (!elements?.length) return;
  const current = option.graphic ? (Array.isArray(option.graphic) ? option.graphic : [option.graphic]) : [];
  option.graphic = [...current, ...elements];
}

function methodBadge(methodId, text) {
  return {
    type: "text",
    right: 18,
    bottom: 14,
    silent: true,
    z: 90,
    style: {
      text: `${METHOD_LABELS[methodId] || methodId} · ${text}`,
      fill: "rgba(15,23,42,0.42)",
      font: `800 12px ${CHART_FONT_FAMILY}`,
      textAlign: "right",
    },
  };
}

function addSeriesGlow(series, color = "#0f4c5c") {
  series.itemStyle = {
    ...(series.itemStyle || {}),
    shadowBlur: Math.max(Number(series.itemStyle?.shadowBlur || 0), 10),
    shadowColor: series.itemStyle?.shadowColor || colorAlpha(color, 0.26),
  };
  series.emphasis = {
    focus: "series",
    scale: true,
    ...(series.emphasis || {}),
  };
}

function addTopMarkPoint(series, name = "峰值") {
  if (!["bar", "line", "scatter", "effectScatter"].includes(series.type)) return;
  series.markPoint = {
    symbol: "pin",
    symbolSize: 46,
    label: { color: "#fff", fontSize: 11, fontWeight: 900 },
    itemStyle: { color: "#d62828", shadowBlur: 12, shadowColor: colorAlpha("#d62828", 0.32) },
    data: [{ type: "max", name }],
    ...(series.markPoint || {}),
  };
}

function addMeanMarkLine(series, name = "均值") {
  if (!["bar", "line", "scatter", "effectScatter"].includes(series.type)) return;
  series.markLine = {
    symbol: "none",
    label: { color: "#64748b", fontSize: 11, formatter: name },
    lineStyle: { type: "dashed", color: "rgba(15,23,42,.34)", width: 1.2 },
    data: [{ type: "average", name }],
    ...(series.markLine || {}),
  };
}

function enhanceBarsAndLines(option, methodId) {
  asSeriesArray(option).forEach((series, index) => {
    if (series.type === "bar") {
      series.large = series.large ?? true;
      series.largeThreshold = series.largeThreshold || 80;
      series.realtimeSort = series.realtimeSort ?? false;
      series.barCategoryGap = series.barCategoryGap || "28%";
      series.itemStyle = {
        borderRadius: series.stack ? [0, 4, 4, 0] : (series.itemStyle?.borderRadius || [5, 5, 0, 0]),
        ...(series.itemStyle || {}),
      };
      if (["nlp-word-frequency", "nlp-entity-distribution", "topic-tree"].includes(methodId)) addTopMarkPoint(series, "最高权重");
    }
    if (series.type === "line") {
      series.smooth = series.smooth ?? true;
      series.symbolSize = Math.max(Number(series.symbolSize || 0), 6);
      series.lineStyle = { width: 2.4, ...(series.lineStyle || {}) };
      series.emphasis = { focus: "series", ...(series.emphasis || {}) };
    }
  });
}

function enhanceScatter(option, methodId) {
  const scatterMethods = new Set(["semantic-manifold", "nlp-lexical-metrics", "topic-clustering-map", "place-entity-map", "transmission-path-map"]);
  if (!scatterMethods.has(methodId)) return;
  asSeriesArray(option).forEach((series, index) => {
    if (!["scatter", "effectScatter"].includes(series.type)) return;
    series.progressive = Math.max(Number(series.progressive || 0), 1000);
    series.progressiveThreshold = Math.max(Number(series.progressiveThreshold || 0), 600);
    series.large = series.large ?? (Array.isArray(series.data) && series.data.length > 800);
    series.largeThreshold = Math.max(Number(series.largeThreshold || 0), 800);
    addSeriesGlow(series, CHART_COLORS[index % CHART_COLORS.length]);
    series.blur = { itemStyle: { opacity: 0.18 }, label: { opacity: 0.12 }, ...(series.blur || {}) };
    series.select = {
      itemStyle: { borderColor: "#0f172a", borderWidth: 2.4 },
      label: { show: true, fontWeight: 900 },
      ...(series.select || {}),
    };
    if (methodId === "nlp-lexical-metrics") {
      series.markLine = series.markLine || {
        symbol: "none",
        lineStyle: { type: "dashed", color: "rgba(15,23,42,.34)" },
        label: { color: "#64748b", fontSize: 11 },
        data: [{ type: "average", name: "均值" }],
      };
    }
  });
}

function enhanceHeatmaps(option, methodId) {
  const heatMethods = new Set(["semantic-heatmap", "topic-concept-matrix", "concept-migration", "transmission-path-map"]);
  if (!heatMethods.has(methodId)) return;
  asSeriesArray(option).forEach((series) => {
    if (series.type !== "heatmap") return;
    series.progressive = Math.max(Number(series.progressive || 0), 600);
    series.label = {
      show: true,
      color: "#172033",
      fontWeight: 800,
      fontSize: 11,
      ...(series.label || {}),
    };
    series.itemStyle = {
      borderColor: "rgba(255,255,255,0.72)",
      borderWidth: 0.6,
      ...(series.itemStyle || {}),
    };
    series.emphasis = {
      itemStyle: { borderColor: "#0f172a", borderWidth: 1.4, shadowBlur: 8, shadowColor: "rgba(15,23,42,.18)" },
      ...(series.emphasis || {}),
    };
  });
  if (option.visualMap && !Array.isArray(option.visualMap)) {
    option.visualMap.realtime = false;
    option.visualMap.precision = option.visualMap.precision ?? 3;
  }
}

function enhanceNetworks(option, methodId) {
  const networkMethods = new Set(["cooccurrence-network", "multilayer-network", "citation-network", "topic-cooccurrence-network", "author-concept"]);
  if (!networkMethods.has(methodId)) return;
  asSeriesArray(option).forEach((series) => {
    if (series.type !== "graph") return;
    series.animation = false;
    series.progressive = Math.max(Number(series.progressive || 0), 600);
    series.progressiveThreshold = Math.max(Number(series.progressiveThreshold || 0), 500);
    series.edgeLabel = methodId === "citation-network" ? {
      show: true,
      formatter: (params) => Number(params.data?.value || 0) >= 4 ? formatNumber(params.data.value, 1) : "",
      color: "#475569",
      fontSize: 10,
    } : (series.edgeLabel || { show: false });
    series.edgeSymbol = methodId === "citation-network" ? ["none", "arrow"] : series.edgeSymbol;
    series.edgeSymbolSize = methodId === "citation-network" ? [0, 9] : series.edgeSymbolSize;
    series.focusNodeAdjacency = true;
    series.autoCurveness = methodId === "citation-network" ? 0.18 : 0.08;
    series.lineStyle = { color: "source", opacity: 0.42, curveness: 0.08, ...(series.lineStyle || {}) };
    series.emphasis = {
      focus: "adjacency",
      lineStyle: { opacity: 0.9, width: 4 },
      label: { show: true, fontWeight: 900 },
      ...(series.emphasis || {}),
    };
    series.blur = {
      itemStyle: { opacity: 0.22 },
      lineStyle: { opacity: 0.06 },
      label: { opacity: 0.14 },
      ...(series.blur || {}),
    };
    series.data = (series.data || []).map((node, index) => ({
      ...node,
      itemStyle: {
        ...(node.itemStyle || {}),
        borderColor: node.isImportant ? "#0f172a" : (node.itemStyle?.borderColor || "#fff"),
        borderWidth: node.isImportant ? 2.4 : (node.itemStyle?.borderWidth || 1),
      },
    }));
  });
}

function enhanceSankeyAndTree(option, methodId) {
  asSeriesArray(option).forEach((series) => {
    if (series.type === "sankey") {
      series.nodeAlign = "justify";
      series.draggable = true;
      series.focusNodeAdjacency = true;
      series.blur = { lineStyle: { opacity: 0.06 }, itemStyle: { opacity: 0.22 } };
      series.emphasis = { focus: "adjacency", lineStyle: { opacity: 0.82, width: 3 }, ...(series.emphasis || {}) };
    }
    if (series.type === "tree") {
      series.roam = true;
      series.scaleLimit = { min: 0.45, max: 2.8 };
      series.animationDurationUpdate = 520;
      series.emphasis = { focus: "descendant", ...(series.emphasis || {}) };
    }
    if (series.type === "treemap") {
      series.roam = false;
      series.drillDownIcon = "";
      series.visibleMin = 8;
      series.itemStyle = { gapWidth: 3, borderColor: "#fff", borderWidth: 2, ...(series.itemStyle || {}) };
    }
  });
}

function enhanceRiverAndDiffusion(option, methodId) {
  if (!["topic-river", "idea-diffusion"].includes(methodId)) return;
  asSeriesArray(option).forEach((series, index) => {
    if (series.type !== "line") return;
    series.sampling = series.sampling || "lttb";
    series.showSymbol = methodId === "idea-diffusion";
    series.areaStyle = series.areaStyle || { opacity: index === 0 ? 0.16 : 0.08 };
    if (methodId === "topic-river") {
      series.markLine = series.markLine || {
        symbol: "none",
        lineStyle: { color: "rgba(15,23,42,.22)", type: "dotted" },
        label: { color: "#64748b", fontSize: 11 },
        data: [{ type: "max", name: "峰值阶段" }],
      };
    }
  });
}

function addMethodSpecificGraphic(option, methodId) {
  const captions = {
    "nlp-overview": "规模-结构-语言三类指标",
    "nlp-word-frequency": "Pareto 高频词与累计覆盖",
    "word-cloud": "语义坐标 + 主题权重",
    "nlp-pos-distribution": "词性比例与绝对量并置",
    "nlp-entity-distribution": "NER 类型堆叠与实体排序",
    "nlp-lexical-metrics": "词汇密度 × 句长 × 实体量",
    "nlp-script-profile": "字符系统面积编码",
    "semantic-manifold": "Sentence-BERT/UMAP 语义邻近",
    "concept-sankey": "阶段间概念流动强度",
    "semantic-heatmap": "语义相似矩阵",
    "cooccurrence-network": "实体/概念共现中心性",
    "multilayer-network": "作者-作品-概念层级关系",
    "centrality-radar": "五维中心性综合比较",
    "topic-clustering-map": "BERTopic 聚类质心与分块分配",
    "topic-tree": "主题-概念层次解释",
    "topic-river": "主题强度随阶段流动",
    "topic-concept-matrix": "主题-概念权重矩阵与边际统计",
    "topic-cooccurrence-network": "主题共现 + 语义邻近边",
    "citation-network": "语义互证与方向关系",
    "idea-diffusion": "概念频次、累计扩散与相似度",
    "place-entity-map": "空间实体语义位置与共现",
    "transmission-path-map": "阶段路径、主题位置与概念剖面",
    "concept-migration": "概念跨阶段迁移矩阵",
    "author-concept": "作者-作品-阶段-概念分层网络",
  };
  appendGraphic(option, [methodBadge(methodId, captions[methodId] || "高级学术图表")]);
}

function enhanceChartOption(methodId, option) {
  if (!option) return option;
  enhanceBarsAndLines(option, methodId);
  enhanceScatter(option, methodId);
  enhanceHeatmaps(option, methodId);
  enhanceNetworks(option, methodId);
  enhanceSankeyAndTree(option, methodId);
  enhanceRiverAndDiffusion(option, methodId);
  addMethodSpecificGraphic(option, methodId);
  option.animationThreshold = Math.max(Number(option.animationThreshold || 0), 3000);
  const totalPoints = asSeriesArray(option).reduce((sum, series) => sum + (Array.isArray(series.data) ? series.data.length : 0), 0);
  if (totalPoints > 1200) {
    option.animation = false;
    option.animationDuration = 0;
    option.progressive = Math.max(Number(option.progressive || 0), 1200);
  }
  option.stateAnimation = { duration: 260, easing: "cubicOut", ...(option.stateAnimation || {}) };
  option.aria = {
    enabled: true,
    decal: { show: true },
    label: { description: `${METHOD_LABELS[methodId] || methodId} uses model-derived text analysis data.` },
    ...(option.aria || {}),
  };
  return boostChartTypography(option);
}

function chartOptionFor(methodId, payload, scope) {
  return enhanceChartOption(methodId, rawChartOptionFor(methodId, payload, scope));
}

export default function AdvancedTextVisualWorkbench({
  payload,
  scope,
  setScope,
  activeMethod,
  setActiveMethod,
  chartPrefix = "advanced-text",
  title = "文本分析",
  corpusTitle = "",
  chartHeight = 620,
  loading = false,
  error = "",
  onGenerate = null,
  topicCount: controlledTopicCount,
  setTopicCount: setControlledTopicCount,
}) {
  const [localTopicCount, setLocalTopicCount] = useState(controlledTopicCount ?? payload?.topicCount ?? 18);
  const topicCount = normalizeTopicCount(controlledTopicCount ?? localTopicCount);
  const updateTopicCount = setControlledTopicCount || setLocalTopicCount;
  const chartKey = `${chartPrefix}-${activeMethod}-${scope}`;
  const activeLabel = CLEAN_METHOD_LABELS[activeMethod] || METHOD_LABELS[activeMethod] || activeMethod;
  const option = useMemo(() => chartOptionFor(activeMethod, payload, scope), [activeMethod, payload, scope]);
  const methods = useMemo(() => (payload?.methods?.length ? payload.methods : DEFAULT_METHODS).map((method) => ({
    ...method,
    name: CLEAN_METHOD_LABELS[method.id] || method.name || method.id,
    group: CLEAN_METHOD_GROUPS[method.id] || method.group || "其他可视化",
  })), [payload?.methods]);
  const groups = useMemo(() => {
    const map = new Map();
    methods.forEach((method) => {
      if (!map.has(method.group)) map.set(method.group, []);
      map.get(method.group).push(method);
    });
    return [...map.entries()];
  }, [methods]);
  const hasData = hasVisualData(activeMethod, payload);
  const activeDescription = METHOD_DESCRIPTIONS[activeMethod] || "这张图用于展示当前文本分析方法得到的结构化结果，可结合图中节点、颜色、连线或矩阵颜色深浅理解文本关系。";
  const showTopicControls = TOPIC_METHOD_IDS.has(activeMethod);
  const activeMethodConfig = methods.find((method) => method.id === activeMethod);

  function chooseScope(nextScope) {
    setScope(nextScope);
    if (onGenerate && methodSupportsScope(activeMethodConfig, nextScope)) {
      onGenerate(nextScope, activeMethod, undefined, topicCount);
    }
  }

  function chooseMethod(method) {
    const nextScope = nextSupportedScope(method, scope);
    setActiveMethod(method.id);
    if (nextScope !== scope) setScope(nextScope);
    if (onGenerate) onGenerate(nextScope, method.id, undefined, topicCount);
  }

  return (
    <section className="german-corpus-visual-lab advanced-text-visual-lab" data-active-method-id={activeMethod} data-active-scope={scope}>
      <header className="knowledge-document-analytics-header german-corpus-visual-header">
        <div>
          <strong>{title}</strong>
          <span>{scope === "global" ? "全局视角" : "单文档视角"} · {activeLabel}</span>
        </div>
        <div className="knowledge-document-analytics-tabs">
          <button className={scope === "single" ? "active" : ""} type="button" data-scope-id="single" disabled={!methodSupportsScope(activeMethodConfig, "single")} onClick={() => chooseScope("single")}>单文档视角</button>
          <button className={scope === "global" ? "active" : ""} type="button" data-scope-id="global" disabled={!methodSupportsScope(activeMethodConfig, "global")} onClick={() => chooseScope("global")}>全局视角</button>
          {showTopicControls && (
            <label className="advanced-topic-count-control">
              <span>聚类数</span>
              <input
                type="number"
                min="1"
                max="60"
                step="1"
                value={topicCount}
                onChange={(event) => updateTopicCount(normalizeTopicCount(event.target.value))}
                onKeyDown={(event) => {
                  if (event.key === "Enter" && onGenerate) onGenerate(scope, activeMethod, undefined, topicCount);
                }}
              />
            </label>
          )}
          {onGenerate && <button type="button" onClick={() => onGenerate(scope, activeMethod, undefined, topicCount)} disabled={loading}>{loading ? "计算中" : "生成"}</button>}
          <button type="button" onClick={() => exportChart(chartKey, activeLabel, "png")} disabled={!hasData}>PNG</button>
          <button type="button" onClick={() => exportChart(chartKey, activeLabel, "svg")} disabled={!hasData}>SVG</button>
          <button type="button" onClick={() => exportChart(chartKey, activeLabel, "pdf")} disabled={!hasData}>PDF</button>
        </div>
      </header>

      <div className="german-corpus-method-layout">
        <aside className="german-corpus-methods">
          {groups.map(([group, items]) => (
            <section key={group}>
              <strong>{group}</strong>
              {items.map((method) => (
                <button
                  className={activeMethod === method.id ? "active" : ""}
                  key={method.id}
                  type="button"
                  data-method-id={method.id}
                  onClick={() => chooseMethod(method)}
                >
                  <span>{method.name}</span>
                  <small>{methodSupportsScope(method, scope) ? "当前视角可用" : "将自动切换视角"}</small>
                </button>
              ))}
            </section>
          ))}
        </aside>
        <section className="knowledge-document-chart-panel german-corpus-primary-chart wide" data-active-method-id={activeMethod} data-active-scope={scope}>
          <header>
            <div>
              <strong>{activeLabel}</strong>
              <span>{scope === "global" ? "覆盖全部文档" : "覆盖当前选中文档"}</span>
            </div>
          </header>
          {loading && !hasData ? (
            <div className="advanced-text-chart-placeholder" style={{ minHeight: chartHeight }}>
              <div className="platform-skeleton" style={{ minHeight: 220 }} />
              <strong>文本分析计算中</strong>
            </div>
          ) : error && !hasData ? (
            <div className="advanced-text-chart-placeholder error" style={{ minHeight: chartHeight }}>
              <span>{error}</span>
              {onGenerate && <button type="button" onClick={() => onGenerate(scope, activeMethod)}>重新生成</button>}
            </div>
          ) : hasData ? (
            <>
              <ChartBox option={option} height={chartHeight} chartKey={chartKey} title={activeLabel} />
              <div className="advanced-text-chart-explanation">
                <strong>图表说明</strong>
                <p>{activeDescription}</p>
              </div>
            </>
          ) : (
            <div className="advanced-text-chart-placeholder" style={{ minHeight: chartHeight }}>
              {onGenerate && <button type="button" onClick={() => onGenerate(scope, activeMethod)}>生成</button>}
            </div>
          )}
        </section>
      </div>
    </section>
  );
}
