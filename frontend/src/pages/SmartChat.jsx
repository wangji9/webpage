import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../services/api.js";
import { modelProviders, mockKnowledgeItems, mockMapFlows } from "../data/mockData.js";
import storyData from "../data/storyCollections.json";
import wilhelmMapData from "../data/wilhelmPublicationSourceMap.json";
import GraphCanvas from "../components/GraphCanvas.jsx";
import SplitFlowMap from "../components/SplitFlowMap.jsx";
import WilhelmSplitMap from "../components/WilhelmSplitMap.jsx";
import {
  IdentityProcessChart,
  IdentityRiverChart,
  PublicationBubbleMap,
  SourceChinaMap,
  PrefaceThemeCluster,
  PrefaceWordCloud,
  ChildThemeCooccurrence,
} from "../components/StoryVisualAtlas.jsx";
import StatisticsPanel from "../components/StatisticsPanel.jsx";
import { loadWilhelmKnowledgeGraphs, loadWilhelmRecords, loadWilhelmStoryDrafts } from "../utils/localKnowledgeStore.js";

const HISTORY_KEY = "china-narrative-chat-history-real-data-v2";
const CHAT_QUICK_ACTIONS = [
  { label: "传播路径图", prompt: "基于多语种中国故事集，生成传播路径图，并解释关键出版地、译介路径和节点关系。" },
  { label: "译者身份变化", prompt: "梳理中国故事海外译介中译者、编者与出版机构的身份变化，并给出时间线分析。" },
  { label: "知识图谱", prompt: "围绕当前知识范围生成问答关联知识图谱，说明核心人物、作品、地点和关系。" },
  { label: "数据摘要", prompt: "请用研究报告口吻总结当前知识库中的数据分布、代表案例和可视化结论。" },
];

function readHistory() {
  try {
    const history = JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]");
    return Array.isArray(history) ? history : [];
  } catch {
    return [];
  }
}

function writeHistory(history) {
  localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(0, 30)));
}

function downloadText(filename, text, type = "text/plain;charset=utf-8") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function downloadDataUrl(filename, dataUrl) {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  link.click();
}

function safeFilename(value) {
  return String(value || "智能问答记录").replace(/[\\/:*?"<>|]/g, "-").slice(0, 42);
}

function chatMarkdown(record) {
  const lines = [
    `# ${record.title || "智能问答记录"}`,
    "",
    `- 更新时间：${record.updatedAt || new Date().toLocaleString("zh-CN", { hour12: false })}`,
    `- 知识范围：${record.sectionId || "未记录"}`,
    `- 模型：${record.provider || ""} / ${record.model || ""}`,
    `- 检索：${record.retrievalMode || "未记录"}`,
    "",
  ];
  (record.messages || []).forEach((message, index) => {
    lines.push(`## ${index + 1}. ${message.role === "user" ? "用户" : "助手"}`);
    lines.push("");
    lines.push(String(message.text || "").trim() || "（无文本内容）");
    if (message.meta?.database) lines.push("", `> 数据库：${message.meta.database}`);
    if (Array.isArray(message.meta?.evidence) && message.meta.evidence.length) {
      lines.push("", `> 依据：${message.meta.evidence.slice(0, 6).join("；")}`);
    }
    lines.push("");
  });
  return lines.join("\n");
}

function buildProcessSteps(message, fallbackRetrievalMode) {
  const meta = message.meta || {};
  const workflow = meta.workflow || {};
  const plan = workflow.plan || {};
  const workflowSteps = Array.isArray(workflow.steps) ? workflow.steps : [];
  const chartKeys = Array.isArray(meta.chartKeys)
    ? meta.chartKeys
    : Array.isArray(plan.chart_keys)
      ? plan.chart_keys
      : [];
  const retrievalMode = message.retrievalMode || fallbackRetrievalMode;
  const retrievalNeeded = meta.retrieval_needed !== false && retrievalMode !== "none";
  const steps = [
    {
      label: "理解问题",
      detail: Array.isArray(plan.keywords) && plan.keywords.length ? `关键词：${plan.keywords.slice(0, 5).join(" / ")}` : "解析研究意图与输出形式",
    },
    {
      label: retrievalNeeded ? "检索知识库" : "直连模型",
      detail: retrievalNeeded ? `范围：${meta.database || "当前知识库"}` : "不使用本地知识库召回",
    },
    ...workflowSteps.slice(0, 4).map((step) => ({ label: step, detail: "后端工作流已完成该步骤" })),
    {
      label: chartKeys.length ? "准备可视化" : "组织回答",
      detail: chartKeys.length ? `图表：${chartKeys.join(" / ")}` : "生成结构化文本回答",
    },
    {
      label: "流式输出",
      detail: message.text ? `已输出 ${message.text.length} 字` : "等待首段内容",
    },
  ];
  const deduped = [];
  steps.forEach((step) => {
    if (!step.label || deduped.some((item) => item.label === step.label)) return;
    deduped.push(step);
  });
  const activeIndex = message.streaming
    ? Math.min(deduped.length - 1, message.text ? deduped.length - 1 : Math.max(1, deduped.length - 2))
    : deduped.length;
  return deduped.map((step, index) => ({
    ...step,
    status: !message.streaming || index < activeIndex ? "done" : index === activeIndex ? "active" : "pending",
  }));
}

function wantsStoryCollectionFlowMap(question) {
  const text = String(question || "").toLowerCase();
  return /(多语种中国故事集|中国故事集|德译中国故事集|story collection|story collections)/i.test(text)
    && /(传播情况|传播路径|传播路线|传播地图|路径图|流传情况|传播.*什么样|flow map|route map)/i.test(text);
}

function inferVisual(question, answer) {
  const text = `${question} ${answer?.visuals?.type || ""}`.toLowerCase();
  if (/(卫礼贤|richard wilhelm|wilhelm|chinesische volksmärchen|chinesische volksm.rchen)/i.test(text) && /(再版|传播|流传|出版情况|reprint|publication|map|route)/i.test(text)) return "wilhelm-map";
  if (wantsStoryCollectionFlowMap(question)) return "story-flow-map";
  if (/(取材来源|故事来源|来源地图|source map|source)/i.test(text)) return "source-map";
  if (/(出版地图|出版地|出版城市|publication map|publisher)/i.test(text)) return "publication-map";
  if (/(译者身份|编者身份|身份流变|身份变化|谁在翻译|时间河流|identity)/i.test(text)) return "identity";
  if (/智能体|传播路径|路径图|中国地图|省级|china-agent/.test(text)) return "agent-map";
  if (/统计|词云|词频|分布|趋势|stats/.test(text)) return "stats";
  if (/地图|路线|传播|国家|map|route/.test(text) && /图谱|关系|网络|graph/.test(text)) return "mixed";
  if (/地图|路线|传播|国家|map|route/.test(text)) return "map";
  if (/图谱|关系|网络|graph|graphrag/.test(text)) return "graph";
  return answer?.visuals?.type || "text";
}

function graphWithItems(graph, items) {
  if (!graph) return null;
  const itemNodes = items.map((item, index) => ({
    id: `item-${item.id}`,
    label: item.translatedTitle?.length > 18 ? `${item.canonicalTitle}-${item.year}` : item.translatedTitle,
    type: item.resourceType,
    section: item.sectionId,
    year: item.year,
    lang: item.language,
    x: 0.12 + ((index * 37) % 78) / 100,
    y: 0.16 + ((index * 29) % 72) / 100,
    size: 10
  }));
  const itemEdges = items.flatMap((item) => (item.graphNodeIds || []).slice(0, 2).map((nodeId) => ({
    from: nodeId,
    to: `item-${item.id}`,
    relation: item.resourceType,
    note: `${item.canonicalTitle}上传条目`
  })));
  return { nodes: [...graph.nodes, ...itemNodes], edges: [...graph.edges, ...itemEdges] };
}

async function fileToAttachment(file) {
  const base = { id: `${Date.now()}-${file.name}`, name: file.name, type: file.type || "application/octet-stream", size: file.size };
  if (file.type.startsWith("text/") || /\.(txt|md|csv|json|xml|html)$/i.test(file.name)) {
    return { ...base, text: (await file.text()).slice(0, 12000) };
  }
  if (file.type.startsWith("image/")) {
    const dataUrl = await new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
    return { ...base, dataUrl, text: `图片附件：${file.name}` };
  }
  return { ...base, text: `附件 ${file.name} 已上传，当前浏览器端仅传递文件名、类型和大小。` };
}

function agentAnswer(question) {
  if (/传播|路径|地图/.test(question)) {
    return [
      "已根据故事集年份、来源省区与海外出版地生成传播路径图。",
      "",
      "| 输出内容 | 说明 |",
      "| --- | --- |",
      "| 传播路径图 | 展示中国故事集从来源省区到海外出版地的流向。 |",
      "| 节点关系 | 对照出版地、年份和故事集条目，突出关键中转节点。 |",
      "| 可视化文件 | 下方图表可直接保存为 PNG 图片。 |",
      "",
      "> 图中路径用于辅助解释故事集海外传播格局，后续可继续叠加译者、出版社和年份筛选。"
    ].join("\n");
  }
  if (/表格|子故事|故事集/.test(question)) {
    return [
      "已根据故事集总表和“图书/期刊名”匹配结果生成嵌套表格。",
      "",
      "| 数据层级 | 更新方式 | 前端展示 |",
      "| --- | --- | --- |",
      "| 故事集总表 | 管理员上传新表格后重建索引 | 知识库列表、详情页、问答依据 |",
      "| 子故事明细 | 按图书或期刊名自动匹配 | 嵌套表格、知识图谱节点 |",
      "| 传播关系 | 依据年份、来源地、出版地生成 | 地图、路径图、统计图 |"
    ].join("\n");
  }
  return [
    "已基于当前故事集数据生成对应的图表结果。",
    "",
    "- 回答文本会以 Markdown 形式渲染。",
    "- 如包含地图、图表或知识图谱，会在回答下方同步展示。",
    "- 可通过“保存图片”导出当前可视化结果。"
  ].join("\n");
}

function localStoryKnowledgePayload(sectionId, retrievalMode) {
  if (sectionId !== "stories" || retrievalMode === "none") return {};
  return {
    localRecords: loadWilhelmRecords(),
    localStoryDrafts: loadWilhelmStoryDrafts(),
    localGraphs: loadWilhelmKnowledgeGraphs(),
  };
}

const WILHELM_TEXT_PATTERN = /卫礼贤|Richard Wilhelm|Wilhelm|Chinesische Volksmärchen|Chinesische Volksm.rchen/i;

function isWilhelmCollection(item) {
  return [
    item?.name,
    item?.chineseTitle,
    item?.foreignTitle,
    item?.editor,
    item?.prefaceAuthor,
    item?.publisher,
  ].some((value) => WILHELM_TEXT_PATTERN.test(String(value || "")));
}

function buildWilhelmFallbackFlows() {
  if (Array.isArray(wilhelmMapData.flows) && wilhelmMapData.flows.length) return wilhelmMapData.flows;
  const collections = Array.isArray(storyData.collections) ? storyData.collections : [];
  const allFlows = Array.isArray(storyData.flows) ? storyData.flows : [];
  const matchedCollections = collections.filter(isWilhelmCollection);
  const matchedIds = new Set(matchedCollections.map((item) => item.id).filter(Boolean));
  const matchedFlows = allFlows.filter((flow) => matchedIds.has(flow.id));
  if (matchedFlows.length) return matchedFlows;
  return allFlows.filter((flow) =>
    WILHELM_TEXT_PATTERN.test(`${flow?.title || ""} ${flow?.name || ""} ${flow?.resourceType || ""}`)
  );
}

function normalizeMarkdown(text = "") {
  return String(text)
    .replace(/\r\n/g, "\n")
    .replace(/\s+(#{2,4}\s+)/g, "\n\n$1")
    .replace(/\s+(\d+\.\s+\*\*)/g, "\n$1")
    .replace(/\s+(-\s+\*\*)/g, "\n$1")
    .replace(/\s+(-\s+《)/g, "\n$1")
    .trim();
}

function renderInlineMarkdown(text) {
  const parts = String(text).split(/(\[[^\]]+\]\([^)]+\)|`[^`]+`|\*\*[^*]+\*\*|\*[^*]+\*)/g).filter(Boolean);
  return parts.map((part, index) => {
    const link = part.match(/^\[([^\]]+)\]\(([^)]+)\)$/);
    if (link) {
      return <a href={link[2]} key={index} rel="noreferrer" target="_blank">{link[1]}</a>;
    }
    if (part.startsWith("`") && part.endsWith("`")) {
      return <code key={index}>{part.slice(1, -1)}</code>;
    }
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={index}>{part.slice(2, -2).trim()}</strong>;
    }
    if (part.startsWith("*") && part.endsWith("*")) {
      return <em key={index}>{part.slice(1, -1).trim()}</em>;
    }
    return <span key={index}>{part}</span>;
  });
}

function parseMarkdownTable(lines, startIndex) {
  const headerLine = lines[startIndex]?.trim();
  const dividerLine = lines[startIndex + 1]?.trim();
  if (!headerLine?.includes("|") || !/^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)+\|?$/.test(dividerLine || "")) return null;
  const rows = [];
  let index = startIndex;
  while (index < lines.length && lines[index].trim().includes("|")) {
    rows.push(lines[index].trim());
    index += 1;
  }
  const cells = (line) => line.replace(/^\|/, "").replace(/\|$/, "").split("|").map((cell) => cell.trim());
  return {
    endIndex: index,
    headers: cells(rows[0]),
    rows: rows.slice(2).map(cells),
  };
}

function renderMarkdown(text) {
  const lines = normalizeMarkdown(text).split("\n");
  const blocks = [];
  let list = [];
  let paragraph = [];

  function flushList() {
    if (!list.length) return;
    const ordered = list.every((item) => item.type === "ol");
    const Tag = ordered ? "ol" : "ul";
    blocks.push(
      <Tag className="markdown-list" key={`list-${blocks.length}`}>
        {list.map((item, index) => <li key={index}>{renderInlineMarkdown(item.text)}</li>)}
      </Tag>
    );
    list = [];
  }

  function flushParagraph() {
    if (!paragraph.length) return;
    const body = paragraph.join("\n").trim();
    if (body) blocks.push(<p key={`p-${blocks.length}`}>{renderInlineMarkdown(body)}</p>);
    paragraph = [];
  }

  let index = 0;
  while (index < lines.length) {
    const line = lines[index].trim();

    if (!line) {
      flushList();
      flushParagraph();
      index += 1;
      continue;
    }

    const fence = line.match(/^```(\w+)?/);
    if (fence) {
      flushList();
      flushParagraph();
      const codeLines = [];
      index += 1;
      while (index < lines.length && !lines[index].trim().startsWith("```")) {
        codeLines.push(lines[index]);
        index += 1;
      }
      if (index < lines.length) index += 1;
      blocks.push(
        <pre className="markdown-code-block" key={`code-${blocks.length}`}>
          <code>{codeLines.join("\n")}</code>
        </pre>
      );
      continue;
    }

    const table = parseMarkdownTable(lines, index);
    if (table) {
      flushList();
      flushParagraph();
      blocks.push(
        <div className="markdown-table-wrap" key={`table-${blocks.length}`}>
          <table className="markdown-table">
            <thead>
              <tr>{table.headers.map((cell, cellIndex) => <th key={cellIndex}>{renderInlineMarkdown(cell)}</th>)}</tr>
            </thead>
            <tbody>
              {table.rows.map((row, rowIndex) => (
                <tr key={rowIndex}>{row.map((cell, cellIndex) => <td key={cellIndex}>{renderInlineMarkdown(cell)}</td>)}</tr>
              ))}
            </tbody>
          </table>
        </div>
      );
      index = table.endIndex;
      continue;
    }

    const quote = line.match(/^>\s+(.+)$/);
    if (quote) {
      flushList();
      flushParagraph();
      const quoteLines = [quote[1]];
      index += 1;
      while (index < lines.length) {
        const next = lines[index].trim().match(/^>\s+(.+)$/);
        if (!next) break;
        quoteLines.push(next[1]);
        index += 1;
      }
      blocks.push(<blockquote key={`quote-${blocks.length}`}>{renderInlineMarkdown(quoteLines.join(" "))}</blockquote>);
      continue;
    }

    const heading = line.match(/^(#{1,4})\s+(.+)$/);
    if (heading) {
      flushList();
      flushParagraph();
      const level = Math.min(heading[1].length + 2, 4);
      const HeadingTag = `h${level}`;
      blocks.push(<HeadingTag className="markdown-heading" key={`heading-${blocks.length}`}>{renderInlineMarkdown(heading[2])}</HeadingTag>);
      index += 1;
      continue;
    }

    const ordered = line.match(/^\d+\.\s+(.+)$/);
    if (ordered) {
      flushParagraph();
      list.push({ type: "ol", text: ordered[1] });
      index += 1;
      continue;
    }

    const unordered = line.match(/^[-*]\s+(.+)$/);
    if (unordered) {
      flushParagraph();
      list.push({ type: "ul", text: unordered[1] });
      index += 1;
      continue;
    }

    flushList();
    paragraph.push(line);
    index += 1;
  }

  flushList();
  flushParagraph();
  return blocks.length ? blocks : <p>{text}</p>;
}

function ChatAvatar({ role }) {
  if (role === "user") {
    return (
      <div className="chat-avatar user-avatar" aria-hidden="true">
        <svg viewBox="0 0 40 40" role="img">
          <circle cx="20" cy="14" r="7" />
          <path d="M8 34c1.8-8 6.3-12 12-12s10.2 4 12 12" />
        </svg>
      </div>
    );
  }

  return (
    <div className="chat-avatar assistant-avatar" aria-hidden="true">
      <svg viewBox="0 0 44 44" role="img">
        <rect x="9" y="12" width="26" height="24" rx="8" />
        <path d="M17 12V8m10 4V8M9 24H5m34 0h-4" />
        <circle cx="18" cy="24" r="2.4" />
        <circle cx="26" cy="24" r="2.4" />
        <path d="M17 31c3 2 7 2 10 0" />
      </svg>
    </div>
  );
}

function ChatMeta({ meta }) {
  if (!meta) return null;
  const elapsed = typeof meta.elapsed_ms === "number" ? `${(meta.elapsed_ms / 1000).toFixed(2)}s` : "计算中";
  const tokenText = meta.tokens ? `${meta.token_estimated ? "约 " : ""}${meta.tokens}` : "未返回";
  const evidence = Array.isArray(meta.evidence) && meta.evidence.length ? meta.evidence.slice(0, 4).join("；") : "无";
  const subgraph = meta.subgraph?.scope?.name ? `${meta.subgraph.scope.name}（${meta.subgraph.nodes?.length || 0}点/${meta.subgraph.edges?.length || 0}边）` : "";
  return (
    <div className="chat-answer-meta">
      <span>Token：{tokenText}</span>
      <span>耗时：{elapsed}</span>
      <span>数据库：{meta.database || "无"}</span>
      {subgraph && <span>子图：{subgraph}</span>}
      <span>依据：{evidence}</span>
    </div>
  );
}

function ThinkingTrace({ message, retrievalMode }) {
  if (message.role !== "assistant") return null;
  if (!message.streaming && !message.meta?.workflow && !message.meta?.database && !message.meta?.chartKeys?.length) return null;
  const steps = buildProcessSteps(message, retrievalMode);
  return (
    <div className="thinking-trace" aria-live={message.streaming ? "polite" : "off"}>
      <div className="thinking-trace-head">
        <strong>{message.streaming ? "正在处理" : "处理过程"}</strong>
        {message.streaming && <span>实时生成中</span>}
      </div>
      <div className="thinking-steps">
        {steps.map((step, index) => (
          <div className={`thinking-step ${step.status}`} key={`${step.label}-${index}`}>
            <i aria-hidden="true" />
            <div>
              <strong>{step.label}</strong>
              <span>{step.detail}</span>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function svgToPngDataUrl(svg) {
  return new Promise((resolve, reject) => {
    const clone = svg.cloneNode(true);
    const box = svg.getBoundingClientRect();
    const width = Math.max(1, Math.round(box.width || svg.clientWidth || 1200));
    const height = Math.max(1, Math.round(box.height || svg.clientHeight || 760));
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", `${width}`);
    clone.setAttribute("height", `${height}`);
    const serialized = new XMLSerializer().serializeToString(clone);
    const blob = new Blob([serialized], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const image = new Image();
    image.onload = () => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d");
      context.fillStyle = "#ffffff";
      context.fillRect(0, 0, width, height);
      context.drawImage(image, 0, 0, width, height);
      URL.revokeObjectURL(url);
      resolve(canvas.toDataURL("image/png"));
    };
    image.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error("无法导出该可视化图片"));
    };
    image.src = url;
  });
}

async function captureVisualElement(element) {
  if (!element) return null;
  const svg = element.querySelector("svg");
  if (svg) {
    return svgToPngDataUrl(svg);
  }
  const canvas = element.querySelector("canvas");
  if (canvas) return canvas.toDataURL("image/png");
  return null;
}

export default function SmartChat({ sections = [] }) {
  const [items, setItems] = useState([]);
  const [graph, setGraph] = useState(null);
  const [atlas, setAtlas] = useState(null);
  const [sectionId, setSectionId] = useState("stories");
  const [provider, setProvider] = useState("gpt");
  const [model, setModel] = useState("gpt-5.4");
  const [retrievalMode, setRetrievalMode] = useState("graph-rag");
  const [question, setQuestion] = useState("");
  const [attachments, setAttachments] = useState([]);
  const [history, setHistory] = useState(() => readHistory());
  const [conversationId, setConversationId] = useState("");
  const [loading, setLoading] = useState(false);
  const [indexNotice, setIndexNotice] = useState("");
  const threadRef = useRef(null);
  const textareaRef = useRef(null);
  const streamQueueRef = useRef([]);
  const streamTimerRef = useRef(0);
  const [copiedMessageKey, setCopiedMessageKey] = useState("");
  const [messages, setMessages] = useState([
    { role: "assistant", text: "我可以调用已配置的大模型 API，并按问题返回文本、知识图谱、传播地图、统计图或故事集传播路径智能体结果。你也可以上传附件作为上下文。" }
  ]);
  const fallbackWilhelmFlows = useMemo(() => buildWilhelmFallbackFlows(), []);

  useEffect(() => {
    api.knowledgeItems().then((data) => setItems(data.items || [])).catch(() => setItems(mockKnowledgeItems));
    api.graph().then(setGraph).catch(() => {});
    api.storyVisualAtlas().then(setAtlas).catch(() => {});
  }, []);

  useEffect(() => writeHistory(history), [history]);

  useEffect(() => {
    threadRef.current?.scrollTo({ top: threadRef.current.scrollHeight, behavior: "smooth" });
  }, [messages, loading]);

  useEffect(() => () => {
    if (streamTimerRef.current) window.clearTimeout(streamTimerRef.current);
  }, []);

  const providerInfo = modelProviders.find((item) => item.id === provider) || modelProviders[0];
  const section = sections.find((item) => item.id === sectionId) || sections[0] || { title: "知识库" };
  const scopedItems = useMemo(() => items.filter((item) => item.sectionId === sectionId), [items, sectionId]);
  const visualGraph = useMemo(() => graphWithItems(graph, scopedItems), [graph, scopedItems]);
  const storyStatsItems = useMemo(() => storyData.childStories.map((item) => ({
    ...item,
    country: item.country || item.nationality,
    translator: item.translator || item.editor
  })), []);

  function handleProvider(value) {
    const next = modelProviders.find((item) => item.id === value) || modelProviders[0];
    setProvider(next.id);
    setModel(next.models[0]);
  }

  function newConversation() {
    setConversationId("");
    setMessages([{ role: "assistant", text: "新的研究对话已开始。请提出问题，或上传附件后一起分析。" }]);
    setAttachments([]);
    setQuestion("");
  }

  function saveConversation(nextMessages) {
    const title = nextMessages.find((item) => item.role === "user")?.text?.slice(0, 28) || "未命名对话";
    const id = conversationId || `${Date.now()}`;
    const record = { id, title, sectionId, provider, model, retrievalMode, messages: nextMessages, updatedAt: new Date().toLocaleString("zh-CN", { hour12: false }) };
    setConversationId(id);
    setHistory((current) => [record, ...current.filter((item) => item.id !== id)]);
  }

  function loadConversation(record) {
    setConversationId(record.id);
    setSectionId(record.sectionId || "stories");
    setProvider(record.provider || "gpt");
    setModel(record.model || "gpt-5.4");
    setRetrievalMode(record.retrievalMode || "graph-rag");
    setMessages(record.messages || []);
  }

  function deleteConversation(id) {
    setHistory((current) => current.filter((item) => item.id !== id));
    if (conversationId === id) newConversation();
  }

  function clearHistory() {
    if (!history.length) return;
    if (!window.confirm("确定清空所有历史对话吗？")) return;
    setHistory([]);
    setConversationId("");
  }

  function applyQuickAction(prompt) {
    setQuestion(prompt);
    window.requestAnimationFrame(() => textareaRef.current?.focus());
  }

  async function copyMessageText(text, key) {
    const content = String(text || "").trim();
    if (!content) return;
    try {
      await navigator.clipboard.writeText(content);
      setCopiedMessageKey(key);
      window.setTimeout(() => setCopiedMessageKey((current) => current === key ? "" : current), 1400);
    } catch {
      downloadText("智能问答回答.txt", content);
    }
  }

  function downloadMessageText(message, index) {
    const title = messages.find((item) => item.role === "user")?.text?.slice(0, 24) || `回答-${index + 1}`;
    downloadText(`${safeFilename(title)}.md`, String(message.text || ""), "text/markdown;charset=utf-8");
  }

  async function downloadVisual(event, message, index) {
    const visualNode = event.currentTarget.closest(".chat-visual-shell")?.querySelector(".chat-visual-content");
    const dataUrl = await captureVisualElement(visualNode).catch(() => null);
    if (dataUrl) {
      downloadDataUrl(`${safeFilename(message.question || `问答可视化-${index + 1}`)}.png`, dataUrl);
    }
  }

  function clearStreamQueue() {
    streamQueueRef.current = [];
    if (streamTimerRef.current) {
      window.clearTimeout(streamTimerRef.current);
      streamTimerRef.current = 0;
    }
  }

  function revealQueuedText(assistantId, meta = {}) {
    if (!streamQueueRef.current.length) {
      streamTimerRef.current = 0;
      return;
    }
    const batch = streamQueueRef.current.splice(0, Math.min(3, streamQueueRef.current.length)).join("");
    setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, text: `${item.text || ""}${batch}`, meta, retrievalMode, streaming: true } : item));
    streamTimerRef.current = window.setTimeout(() => revealQueuedText(assistantId, meta), 24);
  }

  function enqueueStreamingText(assistantId, text, meta = {}) {
    streamQueueRef.current.push(...String(text || "").split(""));
    if (!streamTimerRef.current) revealQueuedText(assistantId, meta);
  }

  function streamAssistantMessage({ nextMessages, assistantId, text, userQuestion, answer = {}, meta = {}, intent = "" }) {
    clearStreamQueue();
    setMessages([...nextMessages, { id: assistantId, role: "assistant", text: "", question: userQuestion, answer, meta, intent, retrievalMode, streaming: true }]);
    enqueueStreamingText(assistantId, text, meta);
    const finalize = () => {
      if (streamQueueRef.current.length || streamTimerRef.current) {
        window.setTimeout(finalize, 40);
        return;
      }
      const finalMessages = [...nextMessages, { role: "assistant", text, question: userQuestion, answer, meta, intent, retrievalMode, streaming: false }];
      setMessages(finalMessages);
      saveConversation(finalMessages);
      setLoading(false);
    };
    finalize();
  }

  function exportCurrentConversation() {
    const record = {
      id: conversationId || `${Date.now()}`,
      title: messages.find((item) => item.role === "user")?.text?.slice(0, 28) || "智能问答记录",
      sectionId,
      provider,
      model,
      retrievalMode,
      messages,
      updatedAt: new Date().toLocaleString("zh-CN", { hour12: false }),
    };
    downloadText(`${safeFilename(record.title)}.md`, chatMarkdown(record), "text/markdown;charset=utf-8");
  }

  function exportAllConversations() {
    const payload = {
      exportedAt: new Date().toISOString(),
      conversations: history,
    };
    downloadText("智能问答历史记录.json", JSON.stringify(payload, null, 2), "application/json;charset=utf-8");
  }

  async function handleFiles(event) {
    const files = Array.from(event.target.files || []);
    if (!files.length) return;
    const parsed = await Promise.all(files.map(fileToAttachment));
    setAttachments((current) => [...parsed, ...current].slice(0, 8));
    setIndexNotice("");
    const textAttachments = parsed.filter((file) => String(file.text || "").trim().length > 40);
    if (textAttachments.length) {
      Promise.allSettled(textAttachments.map((file) => api.extractKnowledgeGraph({
        title: file.name,
        text: file.text,
        scopeId: sectionId === "stories" ? "stories:upload" : sectionId,
        textKind: /\.(pdf)$/i.test(file.name) ? "pdf" : /\.(png|jpg|jpeg|webp|tif|tiff)$/i.test(file.name) ? "ocr" : "upload"
      }))).then((results) => {
        const success = results.filter((item) => item.status === "fulfilled").length;
        if (success) setIndexNotice(`已从 ${success} 个附件抽取知识图谱并写入检索索引。`);
      }).catch(() => {});
    }
    event.target.value = "";
  }

  async function submit(event) {
    event.preventDefault();
    const content = question.trim();
    if ((!content && !attachments.length) || loading) return;
    const userMessage = { role: "user", text: content || "请分析已上传附件。", attachments };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setQuestion("");
    setAttachments([]);

    if (/(智能体|china-agent|省级中国地图)/i.test(content) && !/(卫礼贤|德译中国故事集|取材来源|出版地|出版地图)/.test(content)) {
      setLoading(true);
      const assistantId = `assistant-${Date.now()}`;
      const meta = {
        retrieval_needed: false,
        database: "智能体本地绘图",
        chartKeys: ["story_flow_map"],
        workflow: {
          plan: { keywords: ["智能体", "传播路径图"], chart_keys: ["story_flow_map"] },
          steps: ["识别绘图意图", "生成传播路径图", "组织图文回答"],
        },
      };
      streamAssistantMessage({
        nextMessages,
        assistantId,
        text: agentAnswer(content),
        userQuestion: userMessage.text,
        answer: { visuals: { type: "agent-map", chartKeys: ["story_flow_map"] } },
        meta,
        intent: "agent-map",
      });
      return;
    }

    setLoading(true);
    const assistantId = `assistant-${Date.now()}`;
    setMessages([...nextMessages, { id: assistantId, role: "assistant", text: "", question: userMessage.text, answer: { visuals: null }, retrievalMode, streaming: true }]);
    let accumulated = "";
    let responseMeta = {};
    clearStreamQueue();

    function updateStreamingMessage(text, streaming = true, meta = responseMeta) {
      setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, meta, retrievalMode, streaming } : item));
    }

    function flushStreamingMessage(text, streaming = false, meta = responseMeta) {
      clearStreamQueue();
      setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, text, meta, retrievalMode, streaming } : item));
    }

    try {
      const localKnowledge = localStoryKnowledgePayload(sectionId, retrievalMode);
      await api.streamChat({ question: userMessage.text, sectionId, provider, model, retrievalMode, attachments, ...localKnowledge }, (chunk) => {
        if (chunk.meta) {
          responseMeta = { ...responseMeta, ...chunk.meta };
          updateStreamingMessage(accumulated, true, responseMeta);
        }
        if (chunk.text) {
          accumulated += chunk.text;
          enqueueStreamingText(assistantId, chunk.text, responseMeta);
        }
        if (chunk.error) {
          flushStreamingMessage(chunk.error, false);
          setMessages((current) => current.map((item) => item.id === assistantId ? { ...item, meta: responseMeta, answer: { visuals: responseMeta.visuals || { type: retrievalMode === "none" ? "text" : inferVisual(userMessage.text, {}) } }, retrievalMode } : item));
          setLoading(false);
        }
        if (chunk.done) {
          const finalText = accumulated || "大模型没有返回内容。";
          const finalize = () => {
            const finalMessages = [...nextMessages, { role: "assistant", text: finalText, question: userMessage.text, answer: { visuals: responseMeta.visuals || { type: retrievalMode === "none" ? "text" : inferVisual(userMessage.text, {}) } }, meta: responseMeta, retrievalMode, streaming: false }];
            setMessages(finalMessages);
            saveConversation(finalMessages);
            setLoading(false);
          };
          const waitForQueue = () => {
            if (streamQueueRef.current.length || streamTimerRef.current) {
              window.setTimeout(waitForQueue, 40);
              return;
            }
            finalize();
          };
          waitForQueue();
        }
      });
    } catch (error) {
      const finalMessages = [...nextMessages, { role: "assistant", text: error.message || "大模型调用失败，请检查管理员接口配置。", answer: { visuals: responseMeta.visuals || { type: retrievalMode === "none" ? "text" : inferVisual(userMessage.text, {}) } }, meta: responseMeta, retrievalMode }];
      setMessages(finalMessages);
      saveConversation(finalMessages);
      setLoading(false);
    }
  }

  function withVisualShell(content, message, index, title = "问答可视化") {
    return (
      <div className="chat-visual-shell">
        <div className="chat-visual-toolbar">
          <strong>{title}</strong>
          <button type="button" onClick={(event) => downloadVisual(event, message, index)}>保存图片</button>
        </div>
        <div className="chat-visual-content">{content}</div>
      </div>
    );
  }

  function renderVisual(message, index) {
    if (message.retrievalMode === "none") return null;
    if (message.role === "user") return null;
    const answer = message.answer || {};
    const hasVisualSignal = Boolean(
      message.question
      || message.intent
      || answer?.visuals
      || message.meta?.visuals
      || message.meta?.chartKeys?.length
      || message.meta?.workflow?.plan?.chart_keys?.length
    );
    if (!hasVisualSignal) return null;
    const qText = String(message.question || "");
    const type = message.intent || inferVisual(qText, answer);
    const answerItems = scopedItems.slice(0, 8);
    const retrievedFlows = Array.isArray(message.meta?.flows) ? message.meta.flows : [];
    const answerFlows = Array.isArray(answer?.visuals?.map?.flows)
      ? answer.visuals.map.flows
      : Array.isArray(message.meta?.visuals?.map?.flows)
        ? message.meta.visuals.map.flows
        : [];
    const flows = answerFlows.length ? answerFlows : retrievedFlows.length ? retrievedFlows : mockMapFlows.filter((flow) => flow.sectionId === sectionId);
    const chartKeys = Array.isArray(answer?.visuals?.chartKeys)
      ? answer.visuals.chartKeys
      : Array.isArray(answer?.workflow?.plan?.chart_keys)
        ? answer.workflow.plan.chart_keys
        : Array.isArray(message.meta?.chartKeys)
          ? message.meta.chartKeys
          : Array.isArray(message.meta?.workflow?.plan?.chart_keys)
            ? message.meta.workflow.plan.chart_keys
            : [];
    const charts = answer?.visuals?.charts || message.meta?.charts || atlas?.charts || {};
    const returnedSubgraph = answer?.visuals?.subgraph || message.meta?.subgraph || message.meta?.visuals?.subgraph;
    const graphForAnswer = returnedSubgraph?.nodes?.length ? returnedSubgraph : visualGraph;
    const graphFocusNodeIds = returnedSubgraph?.nodes?.length
      ? returnedSubgraph.nodes.slice(0, 12).map((node) => node.id)
      : answerItems.flatMap((item) => item.graphNodeIds || []);
    const wilhelmFlows = Array.isArray(answer?.visuals?.wilhelm?.flows) && answer.visuals.wilhelm.flows.length
      ? answer.visuals.wilhelm.flows
      : Array.isArray(message.meta?.wilhelm?.flows) && message.meta.wilhelm.flows.length
        ? message.meta.wilhelm.flows
      : Array.isArray(wilhelmMapData.flows) && wilhelmMapData.flows.length
        ? wilhelmMapData.flows
        : fallbackWilhelmFlows;
    const wantsWilhelm = type === "wilhelm-map" || chartKeys.includes("wilhelm_reprint_map");
    const wantsPublication = type === "publication-map" || chartKeys.includes("publication_map");
    const wantsSource = type === "source-map" || chartKeys.includes("source_map");
    const wantsIdentity = type === "identity" || chartKeys.includes("identity_process") || chartKeys.includes("identity_river");
    const wantsStoryFlow = type === "story-flow-map" || chartKeys.includes("story_flow_map") || wantsStoryCollectionFlowMap(qText);

    if (wantsWilhelm) {
      return withVisualShell(<WilhelmSplitMap flows={wilhelmFlows} title="德译中国故事集故事来源及出版地参照图" timeline />, message, index, "德译中国故事集地图");
    }
    if (wantsPublication && sectionId === "stories") {
      return withVisualShell(
        <div className="chat-visual-stack">
          <PublicationBubbleMap
            chart={charts.publicationMap || { title: "德译中国故事集出版地图", subtitle: "出版地分布", points: [] }}
            id="smartchat-publication-map"
          />
        </div>,
        message,
        index,
        "出版地分布图"
      );
    }
    if (wantsSource && sectionId === "stories" && charts.sourceMap) {
      return withVisualShell(<SourceChinaMap chart={charts.sourceMap} />, message, index, "故事来源地图");
    }
    if (wantsIdentity) {
      return withVisualShell(
        <div className="chat-visual-stack">
          {charts.identityProcess && <IdentityProcessChart chart={charts.identityProcess} />}
          {charts.identityRiver && <IdentityRiverChart chart={charts.identityRiver} />}
        </div>,
        message,
        index,
        "身份变化图"
      );
    }
    if (chartKeys.length) {
      return withVisualShell(
        <div className="chat-visual-stack">
          {chartKeys.includes("story_flow_map") && (
            <SplitFlowMap flows={flows.length ? flows : storyData.flows} title={`${section?.title || "知识库"}传播路径图`} timeline />
          )}
          {chartKeys.includes("preface_cluster") && charts.prefaceCluster && <PrefaceThemeCluster chart={charts.prefaceCluster} />}
          {chartKeys.includes("preface_word_cloud") && charts.wordCloud && <PrefaceWordCloud chart={charts.wordCloud} />}
          {chartKeys.includes("child_theme_cooccurrence") && charts.childCooccurrence && <ChildThemeCooccurrence chart={charts.childCooccurrence} />}
          {chartKeys.includes("knowledge_graph") && graphForAnswer && (
            <GraphCanvas graph={graphForAnswer} sections={sections} focusNodeIds={graphFocusNodeIds} initialFilter={sectionId} title={returnedSubgraph?.scope?.name || "问答关联图谱"} />
          )}
          {chartKeys.includes("stats_panel") && (
            <StatisticsPanel items={sectionId === "stories" ? storyStatsItems : answerItems} title="问答统计分析" />
          )}
        </div>,
        message,
        index,
        "问答可视化"
      );
    }
    if (type === "agent-map") {
      return withVisualShell(<SplitFlowMap flows={storyData.flows} title="智能体生成传播路径图" timeline />, message, index, "智能体传播路径图");
    }
    if ((type === "graph" || type === "mixed") && graphForAnswer) {
      return withVisualShell(<GraphCanvas graph={graphForAnswer} sections={sections} focusNodeIds={graphFocusNodeIds} initialFilter={sectionId} title={returnedSubgraph?.scope?.name || "问答关联图谱"} />, message, index, "问答关联图谱");
    }
    if ((type === "map" || type === "mixed" || wantsStoryFlow) && (sectionId !== "stories" || wantsStoryFlow)) {
      return withVisualShell(<SplitFlowMap flows={flows.length ? flows : storyData.flows} title={`${section?.title || "知识库"}传播路径图`} timeline />, message, index, "传播路径图");
    }
    if (type === "stats") {
      return withVisualShell(<StatisticsPanel items={sectionId === "stories" ? storyStatsItems : answerItems} title="问答统计分析" />, message, index, "统计分析图");
    }
    return null;
  }

  return (
    <section className="chat-page advanced-chat-page">
      <aside className="chat-side work-panel">
        <div className="chat-side-head">
          <strong>智能问答</strong>
          <button type="button" onClick={newConversation}>新对话</button>
        </div>
        <div className="chat-side-actions">
          <button type="button" onClick={exportCurrentConversation}>下载当前记录</button>
          <button type="button" onClick={exportAllConversations} disabled={!history.length}>导出全部历史</button>
          <button type="button" onClick={clearHistory} disabled={!history.length}>清空历史</button>
        </div>
        <label>知识范围
          <select value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
            {sections.map((item) => <option key={item.id} value={item.id}>{item.title}</option>)}
          </select>
        </label>
        <label>模型供应商
          <select value={provider} onChange={(event) => handleProvider(event.target.value)}>
            {modelProviders.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <label>模型
          <select value={model} onChange={(event) => setModel(event.target.value)}>
            {providerInfo.models.map((item) => <option key={item} value={item}>{item}</option>)}
          </select>
        </label>
        <label>检索技术
          <select value={retrievalMode} onChange={(event) => setRetrievalMode(event.target.value)}>
            <option value="none">无：直接使用大模型</option>
            <option value="graph-rag">GraphRAG：知识图谱</option>
            <option value="rag">RAG：语义召回</option>
          </select>
        </label>
        <div className="agent-card">
          <strong>智能体绘图能力</strong>
          <p>作为智能问答的一部分，可根据问题完成传播路径图、嵌套表格和统计图生成。</p>
        </div>
        <div className="conversation-history">
          <strong>历史对话</strong>
          {history.length ? history.map((record) => (
            <div className={record.id === conversationId ? "history-item active" : "history-item"} key={record.id}>
              <button type="button" onClick={() => loadConversation(record)}><span>{record.title}</span><small>{record.updatedAt}</small></button>
              <button aria-label="删除对话" type="button" onClick={() => deleteConversation(record.id)}>删除</button>
            </div>
          )) : <p>暂无保存的历史对话。</p>}
        </div>
      </aside>

      <div className="chat-main work-panel">
        <div className="chat-main-head">
          <div>
            <span>Research Copilot</span>
            <strong>{section?.title || "知识库"}智能问答</strong>
            <p>{retrievalMode === "none" ? "直连已配置大模型，适合开放式写作与附件分析。" : "结合本地知识库、GraphRAG、地图与统计图表生成回答。"}</p>
          </div>
          <div className="chat-status-pills">
            <span>{providerInfo?.name || provider}</span>
            <span>{model}</span>
            <span>{retrievalMode === "graph-rag" ? "GraphRAG" : retrievalMode === "rag" ? "RAG" : "Direct"}</span>
          </div>
        </div>
        <div className="chat-quick-actions" aria-label="快捷研究指令">
          <span>快捷研究</span>
          {CHAT_QUICK_ACTIONS.map((action) => (
            <button type="button" key={action.label} onClick={() => applyQuickAction(action.prompt)}>
              {action.label}
            </button>
          ))}
        </div>
        <div className="chat-thread" ref={threadRef}>
          {messages.map((message, index) => (
            <article className={`chat-message-row ${message.role}`} key={`${message.role}-${index}`}>
              <div className={`chat-bubble ${message.role}`}>
                {message.role === "assistant" && <ThinkingTrace message={message} retrievalMode={retrievalMode} />}
                <div className={[
                  "markdown-body",
                  message.streaming ? "streaming-answer" : "",
                  message.streaming && !message.text ? "streaming-placeholder" : ""
                ].filter(Boolean).join(" ")}>
                  {message.text ? renderMarkdown(message.text) : <p>{message.streaming ? "正在组织回答，内容会实时出现在这里..." : "（无文本内容）"}</p>}
                </div>
                {message.attachments?.length > 0 && (
                  <div className="attachment-strip">{message.attachments.map((file) => <span key={file.id}>{file.name}</span>)}</div>
                )}
                {renderVisual(message, index)}
                {message.role === "assistant" && message.text && (
                  <div className="chat-message-actions">
                    <button type="button" onClick={() => copyMessageText(message.text, `${message.role}-${index}`)}>
                      {copiedMessageKey === `${message.role}-${index}` ? "已复制" : "复制回答"}
                    </button>
                    <button type="button" onClick={() => downloadMessageText(message, index)}>下载回答</button>
                  </div>
                )}
                {message.role === "assistant" && <ChatMeta meta={message.meta} />}
              </div>
            </article>
          ))}
        </div>
        <form className="chat-composer advanced-composer" onSubmit={submit}>
          {indexNotice && <div className="composer-index-notice">{indexNotice}</div>}
          <div className="composer-attachments">
            <label className="attach-button">上传附件
              <input accept=".txt,.md,.csv,.json,.pdf,.doc,.docx,image/*,text/*" multiple onChange={handleFiles} type="file" />
            </label>
            {attachments.map((file) => (
              <span key={file.id}>{file.name}<button type="button" onClick={() => setAttachments((current) => current.filter((item) => item.id !== file.id))}>×</button></span>
            ))}
          </div>
          <textarea
            ref={textareaRef}
            value={question}
            onChange={(event) => setQuestion(event.target.value)}
            onKeyDown={(event) => {
              if ((event.ctrlKey || event.metaKey) && event.key === "Enter") submit(event);
            }}
            placeholder="询问译本、传播路径、知识图谱、统计图，或输入“用智能体绘制传播路径图”"
          />
          <button type="submit">{loading ? "生成中" : "发送"}</button>
        </form>
      </div>
    </section>
  );
}

