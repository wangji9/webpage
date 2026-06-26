import { mockGraph, mockKnowledgeItems, mockResults, mockSections, mockSession, mockUsers } from "../data/mockData.js";

// Use same-origin API calls in production because FastAPI serves frontend/dist.
// VITE_API_BASE_URL can still override this when the backend is intentionally
// hosted on another domain.
const API_BASE = import.meta.env.VITE_API_BASE_URL || "";
const DEV_API_BASES = [
  "",
  "http://127.0.0.1:8002",
  "http://localhost:8002",
  "http://127.0.0.1:8003",
  "http://localhost:8003",
];
const getCache = new Map();

function normalizeBase(base) {
  return String(base || "").replace(/\/$/, "");
}

function urlFor(path, base = API_BASE) {
  const normalized = normalizeBase(base);
  if (!normalized) return path;
  return `${normalized}${path}`;
}

function candidateUrls(path) {
  if (API_BASE) return [urlFor(path, API_BASE)];
  if (!import.meta.env.DEV) {
    const port = window.location.port;
    if (port && port !== "8002") {
      return [
        "http://127.0.0.1:8002",
        "http://localhost:8002",
        path,
      ].map((base) => urlFor(path, base));
    }
    return [path];
  }
  return [...new Set(DEV_API_BASES.map((base) => urlFor(path, base)))];
}

async function responseSnippet(response) {
  const text = await response.text().catch(() => "");
  return text.replace(/\s+/g, " ").slice(0, 180);
}

function apiError(message, detail) {
  const formatted = formatApiDetail(detail);
  const suffix = formatted ? `（${formatted}）` : "";
  return new Error(`${message}${suffix}`);
}

function formatApiDetail(detail) {
  if (!detail) return "";
  if (typeof detail === "string") return detail;
  if (Array.isArray(detail)) {
    return detail.map((item) => {
      if (typeof item === "string") return item;
      if (!item || typeof item !== "object") return String(item || "");
      const field = Array.isArray(item.loc) ? item.loc.filter((part) => part !== "body").join(".") : "";
      return [field, item.msg || item.message || item.type || JSON.stringify(item)].filter(Boolean).join("：");
    }).filter(Boolean).join("；");
  }
  if (typeof detail === "object") return detail.message || detail.msg || JSON.stringify(detail);
  return String(detail);
}

async function request(path, options = {}) {
  const urls = candidateUrls(path);
  const failures = [];

  for (const url of urls) {
    let response;
    try {
      response = await fetch(url, {
        credentials: "include",
        headers: {
          "Content-Type": "application/json",
          ...(options.headers || {})
        },
        ...options
      });
    } catch (error) {
      if (error?.name === "AbortError") {
        const aborted = new Error("请求已终止");
        aborted.name = "AbortError";
        throw aborted;
      }
      failures.push(`${url}: ${error.message}`);
      continue;
    }

    const contentType = response.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      const snippet = await responseSnippet(response);
      failures.push(`${url}: HTTP ${response.status}，Content-Type=${contentType || "空"}，响应片段=${snippet || "空"}`);
      continue;
    }

    const payload = await response.json().catch(() => ({}));
    if (!response.ok) {
      throw new Error(formatApiDetail(payload.detail) || payload.message || `请求失败：HTTP ${response.status}`);
    }
    return payload;
  }

  if (failures.length) {
    throw apiError("后端接口未返回 JSON，请检查后端服务或 API 地址", failures.join("；"));
  }
  throw new Error("无法连接本地后端服务。");
}

async function formRequest(path, formData, options = {}) {
  const urls = candidateUrls(path);
  const failures = [];
  for (const url of urls) {
    try {
      const response = await fetch(url, {
        method: options.method || "POST",
        body: formData,
        credentials: "include",
        ...(options.signal ? { signal: options.signal } : {})
      });
      const contentType = response.headers.get("content-type") || "";
      const payload = contentType.includes("application/json") ? await response.json().catch(() => ({})) : await response.text();
      if (!response.ok) throw new Error(formatApiDetail(payload.detail) || payload.message || `HTTP ${response.status}`);
      return payload;
    } catch (error) {
      failures.push(`${url}: ${error.message}`);
    }
  }
  throw apiError("表单接口请求失败", failures.join("；"));
}

function formRequestWithProgress(path, formData, { onProgress, method = "POST" } = {}) {
  const urls = candidateUrls(path);
  let index = 0;
  const tryNext = (failures = []) => new Promise((resolve, reject) => {
    if (index >= urls.length) {
      reject(apiError("表单接口请求失败", failures.join("；")));
      return;
    }
    const url = urls[index];
    index += 1;
    const xhr = new XMLHttpRequest();
    xhr.open(method, url);
    xhr.withCredentials = true;
    xhr.upload.onprogress = (event) => {
      if (!event.lengthComputable) return;
      onProgress?.({ phase: "upload", loaded: event.loaded, total: event.total, progress: event.loaded / Math.max(1, event.total) });
    };
    xhr.onload = () => {
      const contentType = xhr.getResponseHeader("content-type") || "";
      const payload = contentType.includes("application/json")
        ? JSON.parse(xhr.responseText || "{}")
        : xhr.responseText;
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(payload);
        return;
      }
      const detail = typeof payload === "object" ? payload.detail || payload.message : payload;
      failures.push(`${url}: ${formatApiDetail(detail) || `HTTP ${xhr.status}`}`);
      tryNext(failures).then(resolve).catch(reject);
    };
    xhr.onerror = () => {
      failures.push(`${url}: 网络请求失败`);
      tryNext(failures).then(resolve).catch(reject);
    };
    xhr.send(formData);
  });
  return tryNext();
}

function encodeQueryValue(value) {
  if (!value) return "";
  return encodeURIComponent(typeof value === "string" ? value : JSON.stringify(value));
}

function cachedRequest(path) {
  if (getCache.has(path)) return getCache.get(path);
  const promise = request(path).catch((error) => {
    getCache.delete(path);
    throw error;
  });
  getCache.set(path, promise);
  return promise;
}

function staticLogin(data) {
  const matched = mockUsers[data.username];
  if (!matched || matched.password !== data.password) {
    throw new Error("用户名或密码错误");
  }
  return { loggedIn: true, user: matched.user };
}

export const api = {
  session: () => request("/api/session").catch(() => mockSession),
  login: (data) => request("/api/login", { method: "POST", body: JSON.stringify(data) }).catch(() => staticLogin(data)),
  logout: () => request("/api/logout", { method: "POST" }).catch(() => ({ ok: true })),
  profile: () => request("/api/me/profile"),
  updateProfile: (data) => request("/api/me/profile", { method: "PATCH", body: JSON.stringify(data) }),
  changePassword: (data) => request("/api/me/password", { method: "POST", body: JSON.stringify(data) }),
  activity: () => request("/api/me/activity"),
  recordActivity: (data) => request("/api/me/activity", { method: "POST", body: JSON.stringify(data) }).catch(() => ({ ok: true, activity: [] })),
  sections: () => request("/api/kb/sections").catch(() => ({ sections: mockSections })),
  architecture: () => request("/api/architecture"),
  modules: () => request("/api/modules"),
  submodules: (moduleId) => request(`/api/modules/${encodeURIComponent(moduleId)}/submodules`),
  removeSubmodule: (submoduleId) => request(`/api/modules/${encodeURIComponent(submoduleId)}`, { method: "DELETE" }),
  documents: (moduleId = "", submoduleId = "", query = "") => {
    const params = new URLSearchParams();
    if (moduleId) params.set("module_id", moduleId);
    if (submoduleId) params.set("submodule_id", submoduleId);
    if (query) params.set("q", query);
    const qs = params.toString();
    return request(`/api/documents${qs ? `?${qs}` : ""}`);
  },
  document: (documentId) => request(`/api/documents/${encodeURIComponent(documentId)}`),
  globalGraph: () => request("/api/graph/global"),
  moduleGraph: (moduleId) => request(`/api/graph/module/${encodeURIComponent(moduleId)}`),
  frequencyStats: (moduleId = "") => request(`/api/stats/frequency${moduleId ? `?module_id=${encodeURIComponent(moduleId)}` : ""}`),
  timelineStats: (moduleId = "") => request(`/api/stats/timeline${moduleId ? `?module_id=${encodeURIComponent(moduleId)}` : ""}`),
  geographyStats: (moduleId = "") => request(`/api/stats/geography${moduleId ? `?module_id=${encodeURIComponent(moduleId)}` : ""}`),
  visualizationLayer: (moduleId = "", submoduleId = "") => {
    const params = new URLSearchParams();
    if (moduleId) params.set("module_id", moduleId);
    if (submoduleId) params.set("submodule_id", submoduleId);
    const query = params.toString();
    return request(`/api/visualization/layer${query ? `?${query}` : ""}`);
  },
  fulltextSearch: (query, moduleId = "") => request(`/api/search/fulltext?q=${encodeURIComponent(query)}${moduleId ? `&module_id=${encodeURIComponent(moduleId)}` : ""}`),
  distanceSearch: (q1, q2, range = 10, moduleId = "") => request(`/api/search/distance?q1=${encodeURIComponent(q1)}&q2=${encodeURIComponent(q2)}&range=${encodeURIComponent(range)}${moduleId ? `&module_id=${encodeURIComponent(moduleId)}` : ""}`),
  compareTerms: (terms, moduleId = "") => request(`/api/search/compare?terms=${encodeURIComponent(terms)}${moduleId ? `&module_id=${encodeURIComponent(moduleId)}` : ""}`),
  knowledgeItems: () => request("/api/kb/items").catch(() => ({ items: mockKnowledgeItems })),
  moduleDatasets: (moduleId = "", options = {}) => {
    const params = new URLSearchParams();
    if (moduleId) params.set("module_id", moduleId);
    if (options.submoduleId) params.set("submodule_id", options.submoduleId);
    if (options.summary) params.set("summary", "true");
    const query = params.toString();
    return request(`/api/kb/module-datasets${query ? `?${query}` : ""}`);
  },
  results: () => request("/api/results").catch(() => ({ results: mockResults })),
  graph: () => request("/api/graph").catch(() => mockGraph),
  indexStatus: () => request("/api/index/status"),
  rebuildKnowledgeIndex: () => request("/api/index/rebuild", { method: "POST" }),
  indexGraph: (scopeId = "global", query = "") => request(`/api/index/graph/${encodeURIComponent(scopeId)}?q=${encodeURIComponent(query)}`),
  extractKnowledgeGraph: (data) => request("/api/index/extract-graph", { method: "POST", body: JSON.stringify(data) }),
  storyVisualAtlas: (mode = "all") => cachedRequest(`/api/story/visual-atlas?mode=${encodeURIComponent(mode)}`),
  storyCollectionGraph: (collectionId) => request(`/api/story/collection-graph/${encodeURIComponent(collectionId)}`),
  germanStoryCorpus: ({ documentId = "", scope = "single", query = "" } = {}) => {
    const params = new URLSearchParams();
    if (documentId) params.set("document_id", documentId);
    if (scope) params.set("scope", scope);
    if (query) params.set("q", query);
    return request(`/api/story/german-corpus?${params.toString()}`);
  },
  germanStoryCorpusAdvanced: ({ documentId = "", scope = "single", query = "", methodId = "", topicCount = 18 } = {}) => {
    const params = new URLSearchParams();
    if (documentId) params.set("document_id", documentId);
    if (scope) params.set("scope", scope);
    if (query) params.set("q", query);
    if (methodId) params.set("method_id", methodId);
    if (topicCount) params.set("topic_count", topicCount);
    return request(`/api/story/german-corpus/advanced?${params.toString()}`);
  },
  warmGermanStoryCorpusAdvanced: ({ documentId = "", scope = "single", topicCount = 18, methodIds = [] } = {}) => request(
    "/api/story/german-corpus/advanced/warmup",
    {
      method: "POST",
      body: JSON.stringify({
        document_id: documentId,
        scope,
        topic_count: topicCount,
        method_ids: methodIds,
      }),
    },
  ),
  wilhelmVisuals: (records) => request("/api/story/wilhelm-visuals", { method: "POST", body: JSON.stringify({ records }) }),
  wilhelmStoryAnalysis: (data) => request("/api/story/wilhelm-story-analysis", { method: "POST", body: JSON.stringify(Array.isArray(data) ? { stories: data } : data) }),
  wilhelmKeywordNetwork: (data, options = {}) => request("/api/story/wilhelm-keyword-network", { method: "POST", body: JSON.stringify(Array.isArray(data) ? { stories: data } : data), ...options }),
  wilhelmKnowledgeGraph: (data, options = {}) => request("/api/story/wilhelm-knowledge-graph", { method: "POST", body: JSON.stringify(data), ...options }),
  wilhelmKeywordCategories: (terms) => request("/api/story/wilhelm-keyword-categories", { method: "POST", body: JSON.stringify({ terms }) }),
  statsVisual: (items) => request("/api/story/stats-visual", { method: "POST", body: JSON.stringify({ items }) }),
  prefaceVisuals: (prefaces) => request("/api/story/preface-visuals", { method: "POST", body: JSON.stringify({ prefaces }) }),
  renderMap: (data) => request("/api/map/render", { method: "POST", body: JSON.stringify(data) }),
  basemapProvince: () => cachedRequest("/api/basemap/province"),
  basemapBoundary: () => cachedRequest("/api/basemap/boundary"),
  basemapWorldCities: () => cachedRequest("/api/basemap/world-cities"),
  basemapLand: () => cachedRequest("/api/basemap/land"),
  basemapGermanyAdm02: () => cachedRequest("/api/basemap/germany-adm02"),
  basemapNanhaizhudao: () => cachedRequest("/api/basemap/nanhaizhudao"),
  basemapJiuduanxian: () => cachedRequest("/api/basemap/jiuduanxian"),
  nlpAnalyze: (data) => request("/api/nlp/analyze", { method: "POST", body: JSON.stringify(data) }),
  siteContent: () => request(`/api/site-content?_=${Date.now()}`, { cache: "no-store" }),
  localAiStatus: () => request(`/api/local-ai/status?_=${Date.now()}`, { cache: "no-store" }),
  llmConfig: (provider = "gpt") => request(`/api/admin/llm-config?provider=${encodeURIComponent(provider)}`),
  saveLlmConfig: (data) => request("/api/admin/llm-config", { method: "POST", body: JSON.stringify(data) }),
  testLlmConfig: (data) => request("/api/admin/llm-test", { method: "POST", body: JSON.stringify(data) }),
  adminUsers: () => request("/api/admin/users"),
  createAdminUser: (data) => request("/api/admin/users", { method: "POST", body: JSON.stringify(data) }),
  updateAdminUser: (id, data) => request(`/api/admin/users/${encodeURIComponent(id)}`, { method: "PATCH", body: JSON.stringify(data) }),
  deleteAdminUser: (id) => request(`/api/admin/users/${encodeURIComponent(id)}`, { method: "DELETE" }),
  adminDatasets: () => request("/api/admin/datasets"),
  adminSiteContent: () => request(`/api/admin/site-content?_=${Date.now()}`, { cache: "no-store" }),
  createSiteContent: (kind, data) => request(`/api/admin/site-content/${encodeURIComponent(kind)}`, { method: "POST", body: JSON.stringify(data) }),
  updateSiteContent: (kind, id, data) => request(`/api/admin/site-content/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteSiteContent: (kind, id) => request(`/api/admin/site-content/${encodeURIComponent(kind)}/${encodeURIComponent(id)}`, { method: "DELETE" }),
  platformRegistry: () => request(`/api/platform/registry?_=${Date.now()}`, { cache: "no-store" }),
  platformDatasets: () => request("/api/admin/platform-datasets"),
  submoduleRecords: (subModuleId, options = {}) => {
    const params = new URLSearchParams();
    params.set("page", options.page || 1);
    params.set("page_size", options.page_size || 20);
    if (options.sort_by) params.set("sort_by", options.sort_by);
    if (options.sort_order) params.set("sort_order", options.sort_order);
    if (options.filters) params.set("filters", JSON.stringify(options.filters));
    return request(`/api/sub-modules/${encodeURIComponent(subModuleId)}/all-records?${params.toString()}`);
  },
  datasetRecords: (datasetId, options = {}) => {
    const params = new URLSearchParams();
    params.set("page", options.page || 1);
    params.set("page_size", options.page_size || 20);
    if (options.sort_by) params.set("sort_by", options.sort_by);
    if (options.sort_order) params.set("sort_order", options.sort_order);
    if (options.filters) params.set("filters", JSON.stringify(options.filters));
    return request(`/api/datasets/${encodeURIComponent(datasetId)}/records?${params.toString()}`);
  },
  visualMetrics: (subModuleId, filters = {}) => request(`/api/visualizations/metrics/${encodeURIComponent(subModuleId)}?filter_params=${encodeQueryValue(filters)}`),
  visualKnowledgeGraph: (subModuleId, filters = {}) => request(`/api/visualizations/knowledge-graph/${encodeURIComponent(subModuleId)}?filter_params=${encodeQueryValue(filters)}`),
  visualMap: (subModuleId, mapType = "publication", filters = {}) => request(`/api/visualizations/map/${encodeURIComponent(subModuleId)}?map_type=${encodeURIComponent(mapType)}&filter_params=${encodeQueryValue(filters)}`),
  visualTimeEvolution: (subModuleId, timeField = "publish_year", aggregation = "year", filters = {}) => request(`/api/visualizations/time-evolution/${encodeURIComponent(subModuleId)}?time_field=${encodeURIComponent(timeField)}&aggregation=${encodeURIComponent(aggregation)}&filter_params=${encodeQueryValue(filters)}`),
  visualWordFrequency: (subModuleId, data) => request(`/api/visualizations/word-frequency/${encodeURIComponent(subModuleId)}`, { method: "POST", body: JSON.stringify(data) }),
  visualDocumentTextAnalysis: (subModuleId, data) => request(`/api/visualizations/document-text-analysis/${encodeURIComponent(subModuleId)}`, { method: "POST", body: JSON.stringify(data) }),
  visualAdvancedText: (subModuleId, data) => request(`/api/visualizations/advanced-text/${encodeURIComponent(subModuleId)}`, { method: "POST", body: JSON.stringify(data) }),
  visualTopicClustering: (subModuleId, data) => request(`/api/visualizations/topic-clustering/${encodeURIComponent(subModuleId)}`, { method: "POST", body: JSON.stringify(data) }),
  visualComparison: (subModuleId, data) => request(`/api/visualizations/comparison/${encodeURIComponent(subModuleId)}`, { method: "POST", body: JSON.stringify(data) }),
  visualWordDistance: (subModuleId, data) => request(`/api/visualizations/word-distance/${encodeURIComponent(subModuleId)}`, { method: "POST", body: JSON.stringify(data) }),
  visualWordTrend: (subModuleId, data) => request(`/api/visualizations/word-trend/${encodeURIComponent(subModuleId)}`, { method: "POST", body: JSON.stringify(data) }),
  fullTextSearchPlatform: (data) => request("/api/search/full-text", { method: "POST", body: JSON.stringify(data) }),
  academicSearch: (data) => request("/api/search/academic", { method: "POST", body: JSON.stringify(data) }),
  uploadPlatformDataset: ({ subModuleId, file, fieldMappings = {}, name = "", description = "", affectedPages = [], keyFields = [], datasetKind = "table" }) => {
    const form = new FormData();
    form.set("sub_module_id", subModuleId);
    form.set("field_mappings", JSON.stringify(fieldMappings));
    form.set("name", name);
    form.set("description", description);
    form.set("affected_pages", JSON.stringify(affectedPages));
    form.set("key_fields", JSON.stringify(keyFields));
    form.set("dataset_kind", datasetKind);
    form.set("file_name", file.name);
    form.set("file", file, file.name);
    return formRequest("/api/admin/datasets/upload", form);
  },
  adminDocuments: (subModuleId = "") => request(`/api/admin/documents${subModuleId ? `?sub_module_id=${encodeURIComponent(subModuleId)}` : ""}`),
  adminDocument: (id) => request(`/api/admin/documents/${encodeURIComponent(id)}`),
  uploadDocument: ({ subModuleId, file, name = "", description = "", forceOcr = false }) => {
    const form = new FormData();
    form.set("sub_module_id", subModuleId);
    form.set("name", name);
    form.set("description", description);
    form.set("force_ocr", String(forceOcr));
    form.set("file_name", file.name);
    form.set("file", file, file.name);
    return formRequest("/api/admin/documents/upload", form);
  },
  uploadDocumentWithProgress: ({ subModuleId, file, name = "", description = "", forceOcr = false, onProgress }) => {
    const form = new FormData();
    form.set("sub_module_id", subModuleId);
    form.set("name", name);
    form.set("description", description);
    form.set("force_ocr", String(forceOcr));
    form.set("file_name", file.name);
    form.set("file", file, file.name);
    return formRequestWithProgress("/api/admin/documents/upload", form, { onProgress });
  },
  reparseDocument: (id, forceOcr = false) => request(`/api/admin/documents/${encodeURIComponent(id)}/reparse`, { method: "POST", body: JSON.stringify({ force_ocr: forceOcr }) }),
  createSubmodule: (data) => request("/api/admin/sub-modules", { method: "POST", body: JSON.stringify(data) }),
  updateSubmodule: (id, data) => request(`/api/admin/sub-modules/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(data) }),
  deleteSubmodule: (id) => request(`/api/admin/sub-modules/${encodeURIComponent(id)}`, { method: "DELETE" }),
  systemConfig: () => request("/api/admin/system-config"),
  updateSystemConfig: (data) => request("/api/admin/system-config", { method: "PUT", body: JSON.stringify(data) }),
  backups: () => request("/api/admin/backups"),
  runBackup: (kind = "full") => request("/api/admin/backups", { method: "POST", body: JSON.stringify({ kind }) }),
  runBackupScheduler: () => request("/api/admin/backups/scheduler/run", { method: "POST" }),
  restoreBackup: (path) => request("/api/admin/restore", { method: "POST", body: JSON.stringify({ path }) }),
  databaseHealth: () => request("/api/admin/database/health"),
  applyDatabaseSchema: () => request("/api/admin/database/apply-schema", { method: "POST" }),
  exportData: (data) => request("/api/admin/export", { method: "POST", body: JSON.stringify(data) }),
  updateDataRecord: (id, data) => request(`/api/admin/data-records/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(data) }),
  importData: (formData) => formRequest("/api/admin/import", formData),
  operationLogs: (params = {}) => {
    const query = new URLSearchParams();
    Object.entries(params).forEach(([key, value]) => {
      if (value) query.set(key, value);
    });
    const qs = query.toString();
    return request(`/api/admin/operation-logs${qs ? `?${qs}` : ""}`);
  },
  createAdminDataset: (data) => request("/api/admin/datasets", { method: "POST", body: JSON.stringify(data) }),
  previewAdminDataset: (id) => request(`/api/admin/datasets/${encodeURIComponent(id)}/preview`),
  uploadAdminDataset: (data) => request("/api/admin/datasets/upload", { method: "POST", body: JSON.stringify(data) }),
  rebuildAdminDataset: (id) => request(`/api/admin/datasets/${encodeURIComponent(id)}/rebuild`, { method: "POST" }),
  updateAdminDataset: (id, data) => request(`/api/admin/datasets/${encodeURIComponent(id)}`, { method: "PUT", body: JSON.stringify(data) }),
  reparseAdminDataset: (id) => request(`/api/admin/datasets/${encodeURIComponent(id)}/reparse`, { method: "POST" }),
  deleteAdminDataset: (id) => request(`/api/admin/datasets/${encodeURIComponent(id)}`, { method: "DELETE" }),
  chat: (data, options = {}) => request("/api/chat", { method: "POST", body: JSON.stringify(data), ...options }),
  streamChat
};

// 流式 chat：使用 fetch + ReadableStream，解析 SSE 风格的 data: 行
async function openStream(path, data) {
  const urls = candidateUrls(path);
  const failures = [];

  for (const url of urls) {
    const controller = new AbortController();
    let response;
    try {
      response = await fetch(url, {
        method: "POST",
        body: JSON.stringify(data),
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        signal: controller.signal,
      });
    } catch (error) {
      failures.push(`${url}: ${error.message}`);
      continue;
    }

    const contentType = response.headers.get("content-type") || "";
    if (!response.ok) {
      if (contentType.includes("application/json")) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(formatApiDetail(payload.detail) || payload.message || `流式请求失败：HTTP ${response.status}`);
      }
      const text = await response.text().catch(() => "");
      failures.push(`${url}: HTTP ${response.status}，${text.replace(/\s+/g, " ").slice(0, 180) || "空响应"}`);
      continue;
    }

    if (!contentType.includes("text/event-stream") && !contentType.includes("application/x-ndjson")) {
      const snippet = await responseSnippet(response);
      failures.push(`${url}: Content-Type=${contentType || "空"}，响应片段=${snippet || "空"}`);
      continue;
    }

    return { response, controller };
  }

  throw apiError("流式接口未返回 SSE 数据，请检查后端服务或 API 地址", failures.join("；"));
}

async function streamChat(data, onChunk) {
  const { response, controller } = await openStream("/api/chat/stream", data);
  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");
  let buf = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buf += decoder.decode(value, { stream: true });
    let idx;
    while ((idx = buf.indexOf("\n\n")) !== -1) {
      const chunk = buf.slice(0, idx).trim();
      buf = buf.slice(idx + 2);
      // 解析 SSE 的 data: 前缀
      const lines = chunk.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
      for (const line of lines) {
        if (!line.startsWith("data:")) continue;
        const payload = line.slice(5).trim();
        if (payload === "[DONE]") {
          onChunk({ done: true });
          controller.abort();
          return;
        }
        try {
          const obj = JSON.parse(payload);
          if (obj.meta) onChunk({ meta: obj.meta });
          if (obj.text) onChunk({ text: obj.text });
          if (obj.error) onChunk({ error: obj.error });
        } catch (e) {
          // 非 JSON 情况直接当作文本
          onChunk({ text: payload });
        }
      }
    }
  }
}
