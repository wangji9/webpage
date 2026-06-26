import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../services/api.js";
import { echarts } from "../utils/echartsCore.js";

const SEARCH_MODES = [
  ["hybrid", "混合检索"],
  ["keyword", "关键词检索"],
  ["fuzzy", "模糊检索"],
];

const SOURCE_OPTIONS = [
  ["all", "全部语料"],
  ["german", "百部德译故事集"],
  ["submodule", "当前子模块"],
  ["platform", "平台文档"],
];

const CHART_COLORS = ["#155e75", "#0f766e", "#1d4ed8", "#7c3aed", "#b45309", "#be123c", "#475569"];
const TERM_RE = /[\u4e00-\u9fff]{2,8}|[A-Za-zÀ-ÖØ-öø-ÿ][A-Za-zÀ-ÖØ-öø-ÿ'\-]{2,}/g;

function formatNumber(value) {
  return Number(value || 0).toLocaleString("zh-CN");
}

function compactText(value, length = 34) {
  const text = String(value || "").replace(/\s+/g, " ").trim();
  return text.length > length ? `${text.slice(0, length - 1)}…` : text;
}

function textFromSegments(segments = []) {
  return segments.map((segment) => segment.text || "").join(" ");
}

function tokenize(value) {
  return [...String(value || "").matchAll(TERM_RE)]
    .map((match) => match[0].toLowerCase())
    .filter((term) => term.length >= 2);
}

function ResultSnippet({ segments = [] }) {
  if (!segments.length) return null;
  return (
    <p className="academic-search-snippet">
      {segments.map((segment, index) => (
        segment.hit
          ? <mark key={`${index}-${segment.text}`}>{segment.text}</mark>
          : <span key={`${index}-${segment.text}`}>{segment.text}</span>
      ))}
    </p>
  );
}

function AcademicMiniChart({ option, height = 180 }) {
  const ref = useRef(null);
  const [node, setNode] = useState(null);

  useEffect(() => {
    if (!node) return undefined;
    const chart = echarts.init(node);
    chart.setOption(option || {}, true);
    const resize = () => chart.resize();
    window.addEventListener("resize", resize);
    return () => {
      window.removeEventListener("resize", resize);
      chart.dispose();
    };
  }, [node, option]);

  ref.current = node;
  return <div className="academic-search-chart" ref={setNode} style={{ height }} />;
}

function buildSearchAnalytics(payload) {
  const items = payload?.items || [];
  const matchedCounter = new Map();
  const docCounter = new Map();
  const chunkCounter = new Map();
  const termCounter = new Map();
  const coCounter = new Map();

  items.forEach((item) => {
    const docKey = item.title || item.documentId || "未命名文档";
    docCounter.set(docKey, (docCounter.get(docKey) || 0) + 1);
    const chunkKey = `片段 ${item.chunkIndex || "-"}`;
    chunkCounter.set(chunkKey, (chunkCounter.get(chunkKey) || 0) + 1);
    const matched = item.matchedTerms?.length ? item.matchedTerms : payload?.terms || [];
    matched.forEach((term) => matchedCounter.set(term, (matchedCounter.get(term) || 0) + 1));
    tokenize(`${item.title || ""} ${textFromSegments(item.snippetSegments || [])}`)
      .filter((term) => !matched.includes(term))
      .forEach((term) => termCounter.set(term, (termCounter.get(term) || 0) + 1));
    const terms = [...new Set([...matched, ...tokenize(textFromSegments(item.snippetSegments || [])).slice(0, 14)])].slice(0, 16);
    terms.forEach((source, i) => {
      terms.slice(i + 1).forEach((target) => {
        const key = [source, target].sort().join("|||");
        coCounter.set(key, (coCounter.get(key) || 0) + 1);
      });
    });
  });

  const topTerms = [...termCounter.entries()]
    .filter(([term]) => !String(payload?.query || "").toLowerCase().includes(term))
    .sort((a, b) => b[1] - a[1])
    .slice(0, 14)
    .map(([name, count]) => ({ name, count }));
  const cooccurrence = [...coCounter.entries()]
    .map(([key, count]) => {
      const [source, target] = key.split("|||");
      return { source, target, count };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 28);
  const uniqueDocs = new Set(items.map((item) => item.documentId || item.title).filter(Boolean)).size;

  return {
    uniqueDocs,
    matchedTerms: [...matchedCounter.entries()].sort((a, b) => b[1] - a[1]).map(([name, count]) => ({ name, count })),
    topTerms,
    topDocuments: [...docCounter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10).map(([name, count]) => ({ name, count })),
    chunkDistribution: [...chunkCounter.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, count]) => ({ name, count })),
    cooccurrence,
  };
}

function chartBase() {
  return {
    color: CHART_COLORS,
    textStyle: { fontFamily: "Times New Roman, SimSun, serif", color: "#0f172a" },
    tooltip: { trigger: "item" },
    animationDuration: 180,
  };
}

function SearchVisualAnalytics({ payload, loading }) {
  const analytics = useMemo(() => buildSearchAnalytics(payload), [payload]);
  const sourceRows = payload?.facets?.sources || [];
  const documentRows = payload?.facets?.topDocuments?.length ? payload.facets.topDocuments : analytics.topDocuments;
  const hasData = Boolean(payload?.items?.length);

  const sourceOption = useMemo(() => ({
    ...chartBase(),
    grid: { left: 92, right: 18, top: 14, bottom: 24 },
    xAxis: { type: "value", axisLabel: { fontSize: 11 } },
    yAxis: { type: "category", inverse: true, data: sourceRows.map((item) => compactText(item.name, 16)), axisLabel: { fontSize: 11 } },
    series: [{ type: "bar", data: sourceRows.map((item) => item.count), itemStyle: { color: "#155e75", borderRadius: [0, 4, 4, 0] } }],
  }), [sourceRows]);

  const documentOption = useMemo(() => ({
    ...chartBase(),
    grid: { left: 116, right: 18, top: 14, bottom: 24 },
    xAxis: { type: "value", axisLabel: { fontSize: 11 } },
    yAxis: { type: "category", inverse: true, data: documentRows.slice(0, 8).map((item) => compactText(item.title || item.name, 18)), axisLabel: { fontSize: 11 } },
    series: [{ type: "bar", data: documentRows.slice(0, 8).map((item) => item.count), itemStyle: { color: "#0f766e", borderRadius: [0, 4, 4, 0] } }],
  }), [documentRows]);

  const termOption = useMemo(() => {
    const nodes = [
      ...analytics.matchedTerms.slice(0, 6).map((item) => ({ id: item.name, name: item.name, value: item.count, category: "命中词", symbolSize: 22 + Math.min(22, item.count * 3), itemStyle: { color: "#be123c" } })),
      ...analytics.topTerms.slice(0, 12).map((item) => ({ id: item.name, name: item.name, value: item.count, category: "共现词", symbolSize: 14 + Math.min(20, item.count * 2), itemStyle: { color: "#1d4ed8" } })),
    ];
    const visible = new Set(nodes.map((node) => node.id));
    return {
      ...chartBase(),
      tooltip: {},
      series: [{
        type: "graph",
        layout: "circular",
        roam: true,
        animation: false,
        data: nodes,
        links: analytics.cooccurrence
          .filter((item) => visible.has(item.source) && visible.has(item.target))
          .map((item) => ({
            source: item.source,
            target: item.target,
            value: item.count,
            lineStyle: { width: Math.max(1, Math.min(6, item.count)), opacity: 0.38 },
          })),
        categories: [{ name: "命中词" }, { name: "共现词" }],
        label: { show: true, fontSize: 11, fontWeight: 700 },
        lineStyle: { color: "#94a3b8" },
        emphasis: { focus: "adjacency" },
      }],
    };
  }, [analytics]);

  if (loading) return <div className="platform-skeleton academic-search-analytics-loading" />;
  if (!hasData) {
    return (
      <div className="academic-search-analytics-empty">
        <strong>等待检索结果</strong>
        <span>输入检索词后，这里会显示来源分布、全文命中分布、共现词网络与统计概览。</span>
      </div>
    );
  }

  return (
    <div className="academic-search-analytics">
      <dl className="academic-search-stat-grid">
        <div>
          <dt>检索范围</dt>
          <dd>{formatNumber(payload?.facets?.documents || 0)}</dd>
        </div>
        <div>
          <dt>命中片段</dt>
          <dd>{formatNumber(payload?.total || 0)}</dd>
        </div>
        <div>
          <dt>命中文档</dt>
          <dd>{formatNumber(analytics.uniqueDocs)}</dd>
        </div>
        <div>
          <dt>共现关系</dt>
          <dd>{formatNumber(analytics.cooccurrence.length)}</dd>
        </div>
      </dl>

      <section className="academic-search-visual-card">
        <header>
          <strong>来源分布</strong>
          <span>不同语料来源的命中片段数量。</span>
        </header>
        <AcademicMiniChart option={sourceOption} />
      </section>
      <section className="academic-search-visual-card">
        <header>
          <strong>全文分布</strong>
          <span>命中最集中的文档与片段来源。</span>
        </header>
        <AcademicMiniChart option={documentOption} />
      </section>
      <section className="academic-search-visual-card wide">
        <header>
          <strong>检索词共现网络</strong>
          <span>根据命中片段抽取高频词与检索词的同片段共现关系。</span>
        </header>
        <AcademicMiniChart option={termOption} height={260} />
      </section>
      <section className="academic-search-term-list">
        <strong>高频共现词</strong>
        <div>
          {analytics.topTerms.slice(0, 18).map((item) => (
            <span key={item.name}>{item.name}<b>{formatNumber(item.count)}</b></span>
          ))}
          {!analytics.topTerms.length && <small>暂无可计算的共现词。</small>}
        </div>
      </section>
    </div>
  );
}

export default function AcademicCorpusSearchPanel({
  title = "语料库专业检索",
  description = "跨文档、跨片段检索关键词、近似词形与混合证据；结果返回来源文档、片段位置、命中词和上下文。",
  defaultQuery = "",
  source = "all",
  submoduleId = "",
  filters = null,
  compact = false,
  autoSearch = false,
}) {
  const [query, setQuery] = useState(defaultQuery || "");
  const [mode, setMode] = useState("hybrid");
  const [activeSource, setActiveSource] = useState(source || "all");
  const [limit, setLimit] = useState(30);
  const [payload, setPayload] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const filtersKey = JSON.stringify(filters || null);
  const canSearch = query.trim().length > 0;

  const selectedMethod = useMemo(
    () => (payload?.methods || []).find((item) => item.id === mode),
    [payload?.methods, mode],
  );

  function runSearch(next = {}) {
    const nextQuery = "query" in next ? next.query : query;
    const nextMode = next.mode || mode;
    const nextSource = next.source || activeSource;
    if (!String(nextQuery || "").trim()) {
      setPayload(null);
      setError("");
      return;
    }
    setLoading(true);
    setError("");
    api.academicSearch({
      query: nextQuery,
      mode: nextMode,
      source: nextSource,
      submodule_id: submoduleId,
      limit,
      filter_params: filters,
    })
      .then((data) => setPayload(data))
      .catch((err) => {
        setError(err.message || String(err));
        setPayload(null);
      })
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    setActiveSource(source || "all");
  }, [source]);

  useEffect(() => {
    setQuery(defaultQuery || "");
  }, [defaultQuery]);

  useEffect(() => {
    if (!autoSearch || !canSearch) return undefined;
    const handle = window.setTimeout(() => runSearch(), 360);
    return () => window.clearTimeout(handle);
  }, [query, mode, activeSource, limit, filtersKey, autoSearch]);

  function submit(event) {
    event.preventDefault();
    runSearch();
  }

  return (
    <section className={`academic-search-panel ${compact ? "compact" : ""}`}>
      <header className="academic-search-header">
        <div>
          <strong>{title}</strong>
          <span>{description}</span>
        </div>
        <dl>
          <div>
            <dt>检索范围</dt>
            <dd>{formatNumber(payload?.facets?.documents || 0)}</dd>
          </div>
          <div>
            <dt>命中片段</dt>
            <dd>{formatNumber(payload?.total || 0)}</dd>
          </div>
          <div>
            <dt>当前模式</dt>
            <dd>{SEARCH_MODES.find((item) => item[0] === mode)?.[1]}</dd>
          </div>
        </dl>
      </header>

      <form className="academic-search-controls" onSubmit={submit}>
        <label>
          <span>检索词</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="输入人物、概念、书名、术语或德文词形"
          />
        </label>
        <label>
          <span>模式</span>
          <select value={mode} onChange={(event) => setMode(event.target.value)}>
            {SEARCH_MODES.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <label>
          <span>来源</span>
          <select value={activeSource} onChange={(event) => setActiveSource(event.target.value)}>
            {SOURCE_OPTIONS.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
          </select>
        </label>
        <label>
          <span>上限</span>
          <select value={limit} onChange={(event) => setLimit(Number(event.target.value))}>
            {[20, 30, 50, 80].map((value) => <option key={value} value={value}>{value}</option>)}
          </select>
        </label>
        <button type="submit" disabled={!canSearch || loading}>{loading ? "检索中" : "检索"}</button>
      </form>

      {selectedMethod && <p className="academic-search-method-note">{selectedMethod.description}</p>}
      {error && <div className="academic-search-error">{error}</div>}

      <SearchVisualAnalytics payload={payload} loading={loading} />

      <div className="academic-search-body">
        <aside className="academic-search-facets">
          <section>
            <strong>来源分布</strong>
            {(payload?.facets?.sources || []).map((item) => (
              <span key={item.name}>{item.name}<b>{formatNumber(item.count)}</b></span>
            ))}
            {!payload?.facets?.sources?.length && <small>等待检索结果</small>}
          </section>
          <section>
            <strong>高频文档</strong>
            {(payload?.facets?.topDocuments || []).map((item) => (
              <span key={item.title}>{item.title}<b>{formatNumber(item.count)}</b></span>
            ))}
            {!payload?.facets?.topDocuments?.length && <small>命中后显示文档分布</small>}
          </section>
        </aside>

        <main className="academic-search-results">
          {loading && <div className="platform-skeleton" style={{ minHeight: 220 }} />}
          {!loading && (payload?.items || []).map((item) => (
            <article key={item.id}>
              <header>
                <div>
                  <strong>{item.title}</strong>
                  <span>{item.sourceLabel} · 片段 {item.chunkIndex || "-"}{item.filename ? ` · ${item.filename}` : ""}</span>
                </div>
                <small>score {Number(item.score || 0).toFixed(2)}</small>
              </header>
              <ResultSnippet segments={item.snippetSegments} />
              <footer>
                <span>命中词：{(item.matchedTerms || []).join("、") || payload?.query}</span>
                {item.submoduleId && <span>子模块：{item.submoduleId}</span>}
                {item.recordId && <span>记录：{item.recordId}</span>}
                {item.documentId && <span>文档：{item.documentId}</span>}
              </footer>
            </article>
          ))}
          {!loading && canSearch && payload && !payload.items?.length && <div className="platform-empty">暂无匹配片段，可以切换模糊检索或扩大来源范围。</div>}
          {!loading && !canSearch && <div className="platform-empty">输入检索词后点击“检索”，开始跨语料专业检索。</div>}
        </main>
      </div>
    </section>
  );
}

export function AcademicCorpusSearchButton({
  label = "语料库检索",
  title = "全平台学术检索",
  description = "检索文档解析阅读工作台与平台语料，返回来源、片段位置、全文分布、共现关系和高亮证据。",
  defaultQuery = "",
  source = "all",
  submoduleId = "",
  filters = null,
  className = "",
}) {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return undefined;
    const handleKey = (event) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open]);

  return (
    <>
      <button
        className={`academic-search-open-button ${className}`.trim()}
        type="button"
        onClick={() => setOpen(true)}
      >
        {label}
      </button>
      {open && (
        <div className="academic-search-modal-backdrop" role="presentation" onMouseDown={(event) => {
          if (event.target === event.currentTarget) setOpen(false);
        }}>
          <section className="academic-search-modal" role="dialog" aria-modal="true" aria-label={title}>
            <header className="academic-search-modal-header">
              <div>
                <strong>{title}</strong>
                <span>{description}</span>
              </div>
              <button type="button" onClick={() => setOpen(false)} aria-label="关闭检索窗口">关闭</button>
            </header>
            <div className="academic-search-modal-body">
              <AcademicCorpusSearchPanel
                title={title}
                description={description}
                defaultQuery={defaultQuery}
                source={source}
                submoduleId={submoduleId}
                filters={filters}
                compact
              />
            </div>
          </section>
        </div>
      )}
    </>
  );
}
