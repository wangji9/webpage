import { mockGraph, mockKnowledgeItems, mockResults, mockSections, mockSession, mockUsers } from "../data/mockData.js";

// Use same-origin API calls in production because FastAPI serves frontend/dist.
// VITE_API_BASE_URL can still override this when the backend is intentionally
// hosted on another domain.
const API_BASE = import.meta.env.VITE_API_BASE_URL || "";

function urlFor(path) {
  if (!API_BASE) return path;
  return `${API_BASE}${path}`;
}

async function request(path, options = {}) {
  let response;
  try {
    response = await fetch(urlFor(path), {
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
    throw new Error(`无法连接本地后端服务：${error.message}`);
  }
  const contentType = response.headers.get("content-type") || "";
  if (!contentType.includes("application/json")) {
    throw new Error("后端接口未返回 JSON，请检查后端服务或 API 地址。");
  }
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.detail || payload.message || "请求失败");
  }
  return payload;
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
  sections: () => request("/api/kb/sections").catch(() => ({ sections: mockSections })),
  knowledgeItems: () => request("/api/kb/items").catch(() => ({ items: mockKnowledgeItems })),
  results: () => request("/api/results").catch(() => ({ results: mockResults })),
  graph: () => request("/api/graph").catch(() => mockGraph),
  storyVisualAtlas: (mode = "all") => request(`/api/story/visual-atlas?mode=${encodeURIComponent(mode)}`),
  storyCollectionGraph: (collectionId) => request(`/api/story/collection-graph/${encodeURIComponent(collectionId)}`),
  wilhelmVisuals: (records) => request("/api/story/wilhelm-visuals", { method: "POST", body: JSON.stringify({ records }) }),
  wilhelmStoryAnalysis: (stories) => request("/api/story/wilhelm-story-analysis", { method: "POST", body: JSON.stringify({ stories }) }),
  wilhelmKeywordNetwork: (data, options = {}) => request("/api/story/wilhelm-keyword-network", { method: "POST", body: JSON.stringify(Array.isArray(data) ? { stories: data } : data), ...options }),
  wilhelmKnowledgeGraph: (data, options = {}) => request("/api/story/wilhelm-knowledge-graph", { method: "POST", body: JSON.stringify(data), ...options }),
  wilhelmKeywordCategories: (terms) => request("/api/story/wilhelm-keyword-categories", { method: "POST", body: JSON.stringify({ terms }) }),
  statsVisual: (items) => request("/api/story/stats-visual", { method: "POST", body: JSON.stringify({ items }) }),
  prefaceVisuals: (prefaces) => request("/api/story/preface-visuals", { method: "POST", body: JSON.stringify({ prefaces }) }),
  renderMap: (data) => request("/api/map/render", { method: "POST", body: JSON.stringify(data) }),
  nlpAnalyze: (data) => request("/api/nlp/analyze", { method: "POST", body: JSON.stringify(data) }),
  llmConfig: () => request("/api/admin/llm-config"),
  saveLlmConfig: (data) => request("/api/admin/llm-config", { method: "POST", body: JSON.stringify(data) }),
  testLlmConfig: (data) => request("/api/admin/llm-test", { method: "POST", body: JSON.stringify(data) }),
  chat: (data, options = {}) => request("/api/chat", { method: "POST", body: JSON.stringify(data), ...options }),
  streamChat
};

// 流式 chat：使用 fetch + ReadableStream，解析 SSE 风格的 data: 行
async function streamChat(data, onChunk) {
  const url = urlFor("/api/chat/stream");
  const controller = new AbortController();
  const response = await fetch(url, {
    method: "POST",
    body: JSON.stringify(data),
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    signal: controller.signal,
  });
  if (!response.ok) {
    const txt = await response.text().catch(() => "");
    throw new Error(txt || "stream request failed");
  }

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
