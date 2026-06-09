import storyData from "./storyCollections.json";

export const mockSession = {
  loggedIn: false,
  user: null
};

export const mockUsers = {
  user: {
    password: "user123",
    user: { id: "u-1001", name: "注册用户", username: "user", role: "registered" }
  },
  researcher: {
    password: "research123",
    user: { id: "u-2001", name: "研究者用户", username: "researcher", role: "researcher" }
  },
  admin: {
    password: "admin123",
    user: { id: "u-9001", name: "管理员", username: "admin", role: "admin" }
  }
};

export const mockSections = [
  {
    id: "stories",
    title: "多语种中国故事集",
    intro: "依据《中国民间童话.xlsx》等真实表格构建，整理故事集总表、子故事、序跋、卫礼贤版本与传播路径。",
    color: "#15a884",
    sublibraries: ["故事集总表", "子故事表", "序跋表", "卫礼贤《中国民间童话》", "传播地图"],
    keywords: ["真实数据", "故事集", "子故事", "序跋", "传播路径"]
  }
];

export const mockResults = [
  {
    id: "real-story-db",
    title: "多语种中国故事集真实数据库",
    summary: "由项目表格生成，包含故事集总表、3533 条子故事、序跋、卫礼贤《中国民间童话》与传播路径数据。",
    section: "多语种中国故事集",
    date: "2026-06-05",
    type: "真实数据集"
  }
];

export const modelProviders = [
  {
    id: "gpt",
    name: "OpenAI GPT",
    models: ["gpt-5.2", "gpt-5.3-codex", "gpt-5.4", "gpt-5.4-mini", "gpt-5.4-openai-compact", "gpt-5.5"],
    status: "API 可接入",
    note: "适合综合问答、长文本归纳与跨语种比较。"
  },
  {
    id: "claude",
    name: "Anthropic Claude",
    models: [
      "claude-haiku-4-5",
      "claude-haiku-4-5-20251001",
      "claude-opus-4-5",
      "claude-opus-4-5-20251101",
      "claude-opus-4-6",
      "claude-opus-4-7",
      "claude-opus-4-8",
      "claude-sonnet-4-5",
      "claude-sonnet-4-5-20250929",
      "claude-sonnet-4-6"
    ],
    status: "API 可接入",
    note: "适合长文本分析、学术归纳与高质量中文问答。"
  },
  {
    id: "deepseek",
    name: "DeepSeek",
    models: ["deepseek-v4-pro"],
    status: "已内置接入",
    note: "使用内置 DeepSeek V4 Pro 配置，并启用高强度推理。"
  },
  {
    id: "gemini",
    name: "Google Gemini",
    models: ["gemini-1.5-pro", "gemini-1.5-flash"],
    status: "API 可接入",
    note: "适合多模态材料、地图解释与结构化摘要。"
  },
  {
    id: "glm",
    name: "智谱 GLM",
    models: ["glm-4-plus", "glm-4-air"],
    status: "API 可接入",
    note: "适合中文知识库检索、术语统一与中文报告生成。"
  },
  {
    id: "qwen",
    name: "通义千问",
    models: ["qwen-max", "qwen-plus"],
    status: "API 可接入",
    note: "适合中文语料抽取、表格化输出与批处理。"
  }
];

const chinaCoords = [116.4, 39.9];
const collectionsByName = new Map((storyData.collections || []).map((item) => [String(item.name || item.foreignTitle || "").trim(), item]));
const flowsById = new Map((storyData.flows || []).map((item) => [item.id, item]));

function clip(text, limit = 360) {
  const value = String(text || "").trim();
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

function collectionItem(item) {
  const flow = flowsById.get(item.id) || {};
  return {
    id: item.id,
    status: "真实数据",
    sectionId: "stories",
    resourceType: "故事集总表",
    canonicalTitle: item.chineseTitle || item.name || item.foreignTitle,
    translatedTitle: item.foreignTitle || item.name || item.chineseTitle,
    author: item.prefaceAuthor || "",
    translator: item.editor || "",
    language: "德语",
    country: item.country || flow.country || "",
    city: item.city || "",
    publisher: item.publisher || "",
    year: item.year || 0,
    uploadedAt: "",
    uploader: "真实表格",
    summary: clip(item.prefaceIntro || item.prefaceText || ""),
    tags: [item.editorRole, item.prefaceType, item.sourceProvince].filter(Boolean),
    evidence: ["storyCollections.json: collections", "中国民间童话.xlsx"],
    coordinates: { from: flow.from || chinaCoords, to: flow.to || chinaCoords },
    graphNodeIds: [`story-collection:${item.id}`]
  };
}

function childItem(item) {
  const collection = collectionsByName.get(String(item.bookName || "").trim()) || {};
  const flow = flowsById.get(collection.id) || {};
  return {
    id: item.id,
    status: "真实数据",
    sectionId: "stories",
    resourceType: "子故事条目",
    canonicalTitle: item.canonicalName || item.variantName || "未命名子故事",
    translatedTitle: item.variantName || item.canonicalName || "未命名子故事",
    author: item.creator || "",
    translator: item.translator || item.editor || collection.editor || "",
    language: item.language || "",
    country: item.country || item.nationality || collection.country || "",
    city: item.place || collection.city || "",
    publisher: item.publisher || collection.publisher || "",
    year: item.year || collection.year || 0,
    uploadedAt: "",
    uploader: "真实表格",
    summary: clip([item.notes, item.reference, item.versionNote].filter(Boolean).join("；")),
    tags: [item.ethnicity, item.storyType, item.carrier].filter(Boolean),
    evidence: ["storyCollections.json: childStories", "中国民间童话.xlsx"],
    coordinates: { from: chinaCoords, to: flow.to || chinaCoords },
    graphNodeIds: [`story-child:${item.id}`, `story-collection:${collection.id || ""}`]
  };
}

function wilhelmEditionItem(item) {
  return {
    id: item.id,
    status: "真实数据",
    sectionId: "stories",
    resourceType: "卫礼贤再版传播记录",
    canonicalTitle: item.title || item.foreignTitle || "卫礼贤《中国民间童话》",
    translatedTitle: item.foreignTitle || item.title || "Chinesische Volksmärchen",
    author: item.translator || "",
    translator: item.translator || "",
    language: item.language || "",
    country: item.country || "",
    city: item.city || "",
    publisher: item.publisher || "",
    year: item.year || 0,
    uploadedAt: "",
    uploader: "真实表格",
    summary: clip([item.edition, item.note, item.source].filter(Boolean).join("；")),
    tags: [item.edition, item.province].filter(Boolean),
    evidence: ["storyCollections.json: wilhelmEditions", "中国民间童话.xlsx"],
    coordinates: { from: chinaCoords, to: chinaCoords },
    graphNodeIds: [`wilhelm-edition:${item.id}`]
  };
}

export const mockKnowledgeItems = [
  ...(storyData.collections || []).map(collectionItem),
  ...(storyData.childStories || []).map(childItem),
  ...(storyData.wilhelmEditions || []).map(wilhelmEditionItem)
];

export const mockMapFlows = storyData.flows || [];

function buildGraph() {
  const collections = (storyData.collections || []).slice(0, 30);
  const nodes = collections.map((item, index) => ({
    id: `story-collection:${item.id}`,
    label: item.chineseTitle || item.name,
    type: "故事集",
    section: "stories",
    year: item.year || 0,
    lang: "德语",
    x: 0.08 + (index % 10) * 0.09,
    y: 0.16 + Math.floor(index / 10) * 0.22,
    size: 12 + Math.min(18, Math.floor((item.declaredChildCount || 0) / 6))
  }));
  const editors = [...new Set(collections.map((item) => item.editor).filter(Boolean))].slice(0, 12);
  const cities = [...new Set(collections.map((item) => item.city).filter(Boolean))].slice(0, 10);
  editors.forEach((editor, index) => nodes.push({
    id: `story-editor:${editor}`,
    label: editor,
    type: "编译者",
    section: "stories",
    year: 0,
    lang: "",
    x: 0.12 + (index % 6) * 0.14,
    y: 0.8 + Math.floor(index / 6) * 0.09,
    size: 12
  }));
  cities.forEach((city, index) => nodes.push({
    id: `story-city:${city}`,
    label: city,
    type: "出版地",
    section: "stories",
    year: 0,
    lang: "",
    x: 0.1 + (index % 5) * 0.18,
    y: 0.58 + Math.floor(index / 5) * 0.09,
    size: 12
  }));
  const edges = collections.flatMap((item) => [
    item.editor ? { from: `story-editor:${item.editor}`, to: `story-collection:${item.id}`, relation: "编译", note: item.name } : null,
    item.city ? { from: `story-collection:${item.id}`, to: `story-city:${item.city}`, relation: "出版", note: item.publisher } : null
  ].filter(Boolean));
  return { nodes, edges };
}

export const mockGraph = buildGraph();

export function buildSmartAnswer({ question = "", model = "gpt-4.1", provider = "gpt", retrievalMode = "graph-rag", recordId = "" } = {}) {
  const normalized = question.toLowerCase();
  const explicitItem = mockKnowledgeItems.find((item) => item.id === recordId);
  const keywordItem = mockKnowledgeItems.find((item) => normalized.includes(String(item.canonicalTitle || "").toLowerCase()) || normalized.includes(String(item.translatedTitle || "").toLowerCase()));
  const targetItems = explicitItem ? [explicitItem] : keywordItem ? [keywordItem] : mockKnowledgeItems.slice(0, 4);
  const providerName = modelProviders.find((item) => item.id === provider)?.name || "OpenAI GPT";
  return {
    answer: `已使用 ${providerName} / ${model}，按 ${retrievalMode === "graph-rag" ? "GraphRAG" : "RAG"} 流程检索真实故事集数据库。当前召回 ${targetItems.length} 条真实资料：${targetItems.map((item) => `${item.canonicalTitle}（${item.year || "未记录年份"}）`).join("；")}。`,
    citations: targetItems.map((item) => `${item.resourceType}｜${item.canonicalTitle}｜${item.evidence?.[0] || "真实数据"}`),
    retrieval: {
      provider,
      providerName,
      model,
      mode: retrievalMode,
      confidence: 0.78,
      steps: ["真实库召回", "元数据过滤", "证据重排", "回答生成"]
    },
    visuals: {
      type: retrievalMode === "graph-rag" ? "graph" : "text",
      records: targetItems.map((item) => item.id),
      graph: { focusNodeIds: [...new Set(targetItems.flatMap((item) => item.graphNodeIds || []))], title: "真实故事集关联子图" },
      map: { flows: mockMapFlows.filter((flow) => targetItems.some((item) => item.id === flow.id)), title: "真实故事集传播地图" }
    }
  };
}
