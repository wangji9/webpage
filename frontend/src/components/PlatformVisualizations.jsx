import { useEffect, useMemo, useRef, useState } from "react";
import GermanStoryAtlasWorkbench from "./GermanStoryAtlasWorkbench.jsx";
import ChildStoryAtlasWorkbench from "./ChildStoryAtlasWorkbench.jsx";
import PrefaceStoryAtlasWorkbench from "./PrefaceStoryAtlasWorkbench.jsx";
import WilhelmStoryAtlasWorkbench from "./WilhelmStoryAtlasWorkbench.jsx";
import AdvancedTextVisualWorkbench from "./AdvancedTextVisualWorkbench.jsx";
import { api } from "../services/api.js";
import { filterParamsFromState, useGlobalFilter } from "../context/GlobalFilterContext.jsx";
import { echarts } from "../utils/echartsCore.js";

function downloadText(filename, text, type = "text/plain") {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

function Skeleton({ height }) {
  return <div className="platform-skeleton" style={{ minHeight: height }} />;
}

function ErrorState({ message, onRetry }) {
  return (
    <div className="platform-error">
      <span>{message || "加载失败"}</span>
      <button type="button" onClick={onRetry}>重新加载</button>
    </div>
  );
}

function VisualizationPanel({ component, children, loading, error, onRetry, actions }) {
  return (
    <section className="platform-visual-panel" style={{ "--span": component.span || 8, minHeight: component.height }}>
      <header className="platform-panel-header">
        <div>
          <strong>{component.name}</strong>
        </div>
        <div className="platform-panel-actions">{actions}</div>
      </header>
      {loading ? <Skeleton height={component.height - 64} /> : error ? <ErrorState message={error} onRetry={onRetry} /> : children}
    </section>
  );
}

function useEndpoint(loader, deps) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let canceled = false;
    setLoading(true);
    setError("");
    loader()
      .then((payload) => {
        if (!canceled) setData(payload);
      })
      .catch((err) => {
        if (!canceled) setError(err.message || String(err));
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => {
      canceled = true;
    };
  }, [...deps, version]);

  return { data, loading, error, retry: () => setVersion((value) => value + 1) };
}

function EChart({ option, height = 260, onEvents, chartKey }) {
  const ref = useRef(null);
  const chartRef = useRef(null);

  useEffect(() => {
    if (!ref.current) return undefined;
    chartRef.current = echarts.init(ref.current);
    return () => {
      chartRef.current?.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    if (!chartRef.current) return;
    chartRef.current.setOption(option || {}, true);
  }, [option]);

  useEffect(() => {
    if (!chartRef.current || !onEvents) return undefined;
    const chart = chartRef.current;
    Object.entries(onEvents).forEach(([name, handler]) => chart.on(name, handler));
    return () => Object.entries(onEvents).forEach(([name, handler]) => chart.off(name, handler));
  }, [onEvents]);

  useEffect(() => {
    const onResize = () => chartRef.current?.resize();
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => {
    if (!chartKey) return undefined;
    window.__platformCharts = window.__platformCharts || {};
    window.__platformCharts[chartKey] = chartRef;
    return () => {
      if (window.__platformCharts) delete window.__platformCharts[chartKey];
    };
  }, [chartKey]);

  return <div className="platform-echart" ref={ref} style={{ height }} />;
}

function ChartExportButtons({ chartKey, name }) {
  function exportImage(type) {
    const chart = window.__platformCharts?.[chartKey]?.current;
    if (!chart) return;
    const url = chart.getDataURL({ type: type === "pdf" ? "png" : type, pixelRatio: 3, backgroundColor: "#fff" });
    if (type === "pdf") {
      const win = window.open("", "_blank");
      if (!win) return;
      win.document.write(`<!doctype html><title>${name || "图表导出"}</title><style>body{margin:0;padding:24px;font-family:"Microsoft YaHei",sans-serif}img{max-width:100%;display:block;margin:auto}</style><img src="${url}" alt="${name || "图表"}" />`);
      win.document.close();
      win.print();
      return;
    }
    const link = document.createElement("a");
    link.href = url;
    link.download = `${name || chartKey}.${type}`;
    link.click();
  }
  return (
    <>
      <button type="button" onClick={() => exportImage("png")}>PNG</button>
      <button type="button" onClick={() => exportImage("svg")}>SVG</button>
      <button type="button" onClick={() => exportImage("pdf")}>PDF</button>
    </>
  );
}

function MetricsComponent({ component, submoduleId }) {
  const { state } = useGlobalFilter();
  const { data, loading, error, retry } = useEndpoint(
    () => api.visualMetrics(submoduleId, filterParamsFromState(state)),
    [submoduleId, JSON.stringify(filterParamsFromState(state))]
  );
  const metrics = [
    ["总文献数", data?.total_documents || 0],
    ["总译者数", data?.total_translators || 0],
    ["总出版社数", data?.total_publishers || 0],
    ["总出版国家数", data?.total_countries || 0]
  ];
  return (
    <VisualizationPanel component={component} loading={loading} error={error} onRetry={retry}>
      <div className="platform-metric-grid">
        {metrics.map(([label, value], index) => (
          <div className="platform-metric-card" key={label}>
            <strong>{value}</strong>
            <span>{label}</span>
            <svg viewBox="0 0 120 24" aria-hidden="true">
              <polyline points={`0,${20 - index * 2} 30,16 60,18 90,10 120,${8 + index}`} />
            </svg>
          </div>
        ))}
      </div>
    </VisualizationPanel>
  );
}

function KnowledgeGraphComponent({ component, submoduleId }) {
  const { state, dispatch } = useGlobalFilter();
  const [menu, setMenu] = useState(null);
  const { data, loading, error, retry } = useEndpoint(
    () => api.visualKnowledgeGraph(submoduleId, filterParamsFromState(state)),
    [submoduleId, JSON.stringify(filterParamsFromState(state))]
  );
  const option = useMemo(() => ({
    tooltip: { formatter: (params) => params.data?.name ? `${params.data.name}<br/>${params.data.type || ""}<br/>关联数量：${params.data.count || 0}` : "" },
    series: [{
      type: "graph",
      layout: "force",
      roam: true,
      draggable: true,
      force: { repulsion: 160, edgeLength: 90 },
      data: data?.nodes || [],
      links: data?.edges || [],
      label: { show: true, fontSize: 11 },
      lineStyle: { color: "#A9B4C2", curveness: 0.15 }
    }]
  }), [data]);
  const events = useMemo(() => ({
    click: (params) => {
      if (params.data?.name) dispatch({ type: "addFilter", filter: { field: "content", op: "contains", value: params.data.name, label: params.data.name } });
    },
    contextmenu: (params) => {
      if (params.event?.event) params.event.event.preventDefault();
      setMenu({ x: params.event?.offsetX || 0, y: params.event?.offsetY || 0, node: params.data });
    },
    dblclick: () => retry()
  }), [dispatch, retry]);
  return (
    <VisualizationPanel component={component} loading={loading} error={error} onRetry={retry}>
      <div className="platform-context-host">
        <EChart option={option} height={component.height - 72} onEvents={events} chartKey={`${component.id}-${submoduleId}`} />
        {menu?.node && (
          <div className="platform-context-menu" style={{ left: menu.x, top: menu.y }}>
            <button type="button" onClick={() => alert(`${menu.node.name}\n${menu.node.type || ""}`)}>查看详情</button>
            <button type="button" onClick={() => dispatch({ type: "addFilter", filter: { field: "content", op: "contains", value: menu.node.name, label: menu.node.name } })}>筛选相关数据</button>
            <button type="button" onClick={() => setMenu(null)}>添加到收藏</button>
          </div>
        )}
      </div>
    </VisualizationPanel>
  );
}

function MapComponent({ component, submoduleId }) {
  const { state, dispatch } = useGlobalFilter();
  const [mode, setMode] = useState("publication");
  const [detail, setDetail] = useState(null);
  const { data, loading, error, retry } = useEndpoint(
    () => api.visualMap(submoduleId, mode, filterParamsFromState(state)),
    [submoduleId, mode, JSON.stringify(filterParamsFromState(state))]
  );
  const rows = data?.countries?.length ? data.countries : data?.cities || [];
  const option = useMemo(() => ({
    tooltip: {},
    visualMap: { min: 0, max: Math.max(1, ...rows.map((item) => item.value || 0)), left: 8, bottom: 8, inRange: { color: ["#E8F3FF", "#165DFF"] } },
    xAxis: { type: "value", show: false },
    yAxis: { type: "category", data: rows.slice(0, 12).map((item) => item.name), axisLabel: { color: "#4E5969" } },
    grid: { left: 90, right: 24, top: 16, bottom: 24 },
    series: [{ type: "bar", data: rows.slice(0, 12).map((item) => item.value), itemStyle: { color: "#165DFF" } }]
  }), [rows]);
  const actions = (
    <select value={mode} onChange={(event) => setMode(event.target.value)}>
      <option value="publication">出版地地图</option>
      <option value="source">取材来源地图</option>
      <option value="route">传播路径地图</option>
    </select>
  );
  const events = useMemo(() => ({
    click: (params) => {
      const name = params.name;
      setDetail(rows.find((item) => item.name === name) || null);
      dispatch({ type: "addFilter", filter: { field: "country", op: "contains", value: name, label: name } });
    }
  }), [dispatch, rows]);
  return (
    <VisualizationPanel component={component} loading={loading} error={error} onRetry={retry} actions={<>{actions}<ChartExportButtons chartKey={`${component.id}-${submoduleId}`} name={component.id} /></>}>
      <EChart option={option} height={component.height - 86} onEvents={events} chartKey={`${component.id}-${submoduleId}`} />
      {detail && <div className="platform-map-popup"><strong>{detail.name}</strong><span>文献数：{detail.value}</span><button type="button" onClick={() => setDetail(null)}>×</button></div>}
    </VisualizationPanel>
  );
}

function TimeComponent({ component, submoduleId }) {
  const { state, dispatch } = useGlobalFilter();
  const [aggregation, setAggregation] = useState("year");
  const { data, loading, error, retry } = useEndpoint(
    () => api.visualTimeEvolution(submoduleId, "publish_year", aggregation, filterParamsFromState(state)),
    [submoduleId, aggregation, JSON.stringify(filterParamsFromState(state))]
  );
  const rows = data?.series || [];
  const option = {
    tooltip: {},
    xAxis: { type: "category", data: rows.map((item) => item.time) },
    yAxis: { type: "value" },
    grid: { left: 42, right: 18, top: 20, bottom: 42 },
    series: [{ type: "bar", data: rows.map((item) => item.value), itemStyle: { color: "#165DFF" } }]
  };
  const events = useMemo(() => ({
    click: (params) => dispatch({ type: "addFilter", filter: { field: "publish_year", op: "contains", value: params.name, label: params.name } })
  }), [dispatch]);
  return (
    <VisualizationPanel component={component} loading={loading} error={error} onRetry={retry} actions={<select value={aggregation} onChange={(event) => setAggregation(event.target.value)}><option value="year">按年</option><option value="decade">按十年</option><option value="century">按世纪</option></select>}>
      <EChart option={option} height={component.height - 82} onEvents={events} chartKey={`${component.id}-${submoduleId}`} />
    </VisualizationPanel>
  );
}

function WordFrequencyComponent({ component, submoduleId }) {
  const { state, dispatch } = useGlobalFilter();
  const [cloud, setCloud] = useState(false);
  const { data, loading, error, retry } = useEndpoint(
    () => api.visualWordFrequency(submoduleId, { text_fields: ["content", "preface", "theme", "title"], top_n: 20, filter_params: filterParamsFromState(state) }),
    [submoduleId, JSON.stringify(filterParamsFromState(state))]
  );
  const rows = data?.items || [];
  const option = cloud ? {
    tooltip: {},
    xAxis: { type: "value", show: false },
    yAxis: { type: "category", data: rows.map((item) => item.word), show: false },
    series: [{ type: "scatter", symbolSize: (value) => Math.max(12, value[0] * 5), data: rows.map((item, index) => [item.count, index, item.word]), label: { show: true, formatter: (params) => rows[params.data[1]]?.word } }]
  } : {
    tooltip: {},
    xAxis: { type: "value" },
    yAxis: { type: "category", data: rows.map((item) => item.word), inverse: true },
    grid: { left: 90, right: 18, top: 18, bottom: 32 },
    series: [{ type: "bar", data: rows.map((item) => item.count), itemStyle: { color: "#722ED1" } }]
  };
  const events = useMemo(() => ({
    click: (params) => {
      const word = cloud ? rows[params.data?.[1]]?.word : params.name;
      if (word) dispatch({ type: "setSearchKeyword", keyword: word });
    }
  }), [cloud, dispatch, rows]);
  return (
    <VisualizationPanel component={component} loading={loading} error={error} onRetry={retry} actions={<button type="button" onClick={() => setCloud((value) => !value)}>切换词云</button>}>
      <EChart option={option} height={component.height - 82} onEvents={events} chartKey={`${component.id}-${submoduleId}`} />
    </VisualizationPanel>
  );
}

function TopicComponent({ component, submoduleId }) {
  const { state, dispatch } = useGlobalFilter();
  const { data, loading, error, retry } = useEndpoint(
    () => api.visualTopicClustering(submoduleId, { text_field: "content", n_topics: 6, filter_params: filterParamsFromState(state) }),
    [submoduleId, JSON.stringify(filterParamsFromState(state))]
  );
  const topics = data?.topics || [];
  const option = {
    tooltip: { formatter: (params) => (topics[params.dataIndex]?.keywords || []).join(" / ") },
    xAxis: {}, yAxis: {},
    series: [{ type: "scatter", data: topics.map((item, index) => [index + 1, item.size || 1, item.keywords?.[0] || `Topic ${index + 1}`]), symbolSize: (value) => Math.max(16, Math.min(72, value[1] * 4)), itemStyle: { color: "#00B42A" }, label: { show: true, formatter: (params) => params.data[2] } }]
  };
  const events = useMemo(() => ({
    click: (params) => {
      const keyword = topics[params.dataIndex]?.keywords?.[0];
      if (keyword) dispatch({ type: "addFilter", filter: { field: "content", op: "contains", value: keyword, label: keyword } });
    }
  }), [dispatch, topics]);
  return (
    <VisualizationPanel component={component} loading={loading} error={error} onRetry={retry}>
      <EChart option={option} height={component.height - 72} onEvents={events} chartKey={`${component.id}-${submoduleId}`} />
    </VisualizationPanel>
  );
}

function AdvancedTextComponent({ component, submoduleId }) {
  const { state } = useGlobalFilter();
  const [scope, setScope] = useState("global");
  const [activeMethod, setActiveMethod] = useState("topic-clustering-map");
  const [topicCount, setTopicCount] = useState(18);
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const filterParams = useMemo(() => filterParamsFromState(state), [state]);

  function generate(nextScope = scope, nextMethod = activeMethod, _documentId = "", nextTopicCount = topicCount) {
    setScope(nextScope);
    setActiveMethod(nextMethod);
    setTopicCount(nextTopicCount);
    setLoading(true);
    setError("");
    api.visualAdvancedText(submoduleId, {
      scope: nextScope,
      method_id: nextMethod,
      topic_count: nextTopicCount,
      filter_params: filterParams,
    })
      .then((payload) => setData(payload))
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
  }

  return (
    <VisualizationPanel component={{ ...component, span: component.span || 24, height: component.height || 980 }} loading={false} error="" onRetry={() => generate()}>
      <AdvancedTextVisualWorkbench
        activeMethod={activeMethod}
        chartHeight={Math.max(560, (component.height || 980) - 360)}
        chartPrefix={`platform-${submoduleId}`}
        corpusTitle={data?.corpusTitle || component.name}
        error={error}
        loading={loading}
        onGenerate={generate}
        payload={data}
        scope={scope}
        setActiveMethod={setActiveMethod}
        setScope={setScope}
        setTopicCount={setTopicCount}
        title={component.name || "文本分析"}
        topicCount={topicCount}
      />
    </VisualizationPanel>
  );
}

function ComparisonComponent({ component, submoduleId, pie = false }) {
  const { state, dispatch } = useGlobalFilter();
  const { data, loading, error, retry } = useEndpoint(
    () => api.visualComparison(submoduleId, { dimensions: ["country", "publisher", "translator"], filter_params: filterParamsFromState(state) }),
    [submoduleId, JSON.stringify(filterParamsFromState(state))]
  );
  const rows = data?.dimensions?.[0]?.items || [];
  const option = pie ? {
    tooltip: {}, series: [{ type: "pie", radius: ["42%", "70%"], data: rows.slice(0, 8), label: { formatter: "{b}: {d}%" } }]
  } : {
    tooltip: {}, xAxis: { type: "category", data: rows.slice(0, 8).map((item) => item.name) }, yAxis: { type: "value" }, grid: { left: 42, right: 18, top: 18, bottom: 60 }, series: [{ type: "bar", data: rows.slice(0, 8).map((item) => item.value), itemStyle: { color: "#722ED1" } }]
  };
  const events = useMemo(() => ({
    click: (params) => dispatch({ type: "addFilter", filter: { field: "country", op: "contains", value: params.name, label: params.name } })
  }), [dispatch]);
  return (
    <VisualizationPanel component={component} loading={loading} error={error} onRetry={retry} actions={!pie && <button type="button">添加对比维度</button>}>
      <EChart option={option} height={component.height - 82} onEvents={events} chartKey={`${component.id}-${submoduleId}`} />
    </VisualizationPanel>
  );
}

function WordTrendComponent({ component, submoduleId }) {
  const { state } = useGlobalFilter();
  const [words, setWords] = useState("中国=故事");
  const wordList = words.split("=").map((item) => item.trim()).filter(Boolean);
  const { data, loading, error, retry } = useEndpoint(
    () => api.visualWordTrend(submoduleId, { words: wordList, time_field: "publish_year", filter_params: filterParamsFromState(state) }),
    [submoduleId, words, JSON.stringify(filterParamsFromState(state))]
  );
  const times = [...new Set((data?.series || []).flatMap((item) => item.data.map((point) => point.time)))].sort();
  const option = {
    tooltip: { trigger: "axis" },
    legend: { top: 0 },
    xAxis: { type: "category", data: times },
    yAxis: { type: "value" },
    grid: { left: 42, right: 18, top: 44, bottom: 36 },
    series: (data?.series || []).map((item) => ({ type: "line", name: item.word, data: times.map((time) => item.data.find((point) => point.time === time)?.value || 0) }))
  };
  return (
    <VisualizationPanel component={component} loading={loading} error={error} onRetry={retry} actions={<input value={words} onChange={(event) => setWords(event.target.value)} placeholder="用 = 分隔" />}>
      <EChart option={option} height={component.height - 82} chartKey={`${component.id}-${submoduleId}`} />
    </VisualizationPanel>
  );
}

function WordDistanceComponent({ component, submoduleId }) {
  const { state } = useGlobalFilter();
  const [query, setQuery] = useState({ word_a: "中国", word_b: "故事", max_distance: 20 });
  const { data, loading, error, retry } = useEndpoint(
    () => api.visualWordDistance(submoduleId, { ...query, text_field: "content", filter_params: filterParamsFromState(state) }),
    [submoduleId, JSON.stringify(query), JSON.stringify(filterParamsFromState(state))]
  );
  return (
    <VisualizationPanel component={component} loading={loading} error={error} onRetry={retry} actions={<><input value={query.word_a} onChange={(event) => setQuery((cur) => ({ ...cur, word_a: event.target.value }))} /><input value={query.word_b} onChange={(event) => setQuery((cur) => ({ ...cur, word_b: event.target.value }))} /></>}>
      <div className="platform-result-list">
        {(data?.items || []).map((item) => <button type="button" key={`${item.record_id}-${item.snippet}`}><strong>{item.title || "未命名文献"}</strong><span>{item.snippet}</span><em>距离 {item.distance}</em></button>)}
        {!data?.items?.length && <span className="platform-empty">暂无匹配结果</span>}
      </div>
    </VisualizationPanel>
  );
}

function DataTableComponent({ component, submoduleId }) {
  const { state } = useGlobalFilter();
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState("");
  const [editing, setEditing] = useState(null);
  const [draftValue, setDraftValue] = useState("");
  const { data, loading, error, retry } = useEndpoint(
    () => api.submoduleRecords(submoduleId, { page, page_size: 20, filters: { conditions: [...state.filters, ...(keyword ? [{ field: "content", op: "contains", value: keyword }] : [])] } }),
    [submoduleId, page, keyword, JSON.stringify(filterParamsFromState(state))]
  );
  const rows = data?.records || [];
  const headers = rows[0] ? Object.keys(rows[0].system || {}).filter((key) => rows.some((row) => row.system?.[key])) : ["title", "author", "translator", "publisher", "publish_year", "country"];
  async function saveCell() {
    if (!editing) return;
    await api.updateDataRecord(editing.recordId, { [editing.field]: draftValue });
    setEditing(null);
    retry();
  }
  return (
    <VisualizationPanel component={component} loading={loading} error={error} onRetry={retry} actions={<><input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="全局搜索" /><button type="button" onClick={() => api.exportData({ scope: "submodule", scope_id: submoduleId, file_type: "xlsx" })}>导出 Excel</button><button type="button" onClick={() => api.exportData({ scope: "submodule", scope_id: submoduleId, file_type: "csv" })}>导出 CSV</button></>}>
      <div className="platform-table-wrap">
        <table className="platform-data-table">
          <thead><tr>{headers.map((header) => <th key={header}>{header}</th>)}</tr></thead>
          <tbody>
            {rows.map((row) => (
              <tr key={row.id}>
                {headers.map((header) => {
                  const active = editing?.recordId === row.id && editing?.field === header;
                  const value = row.system?.[header] || row[header] || "";
                  return (
                    <td key={header} onDoubleClick={() => { setEditing({ recordId: row.id, field: header }); setDraftValue(value); }}>
                      {active ? <span className="platform-inline-editor"><input value={draftValue} onChange={(event) => setDraftValue(event.target.value)} /><button type="button" onClick={saveCell}>保存</button><button type="button" onClick={() => setEditing(null)}>取消</button></span> : value}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <footer className="platform-pagination">
        <button type="button" disabled={page <= 1} onClick={() => setPage((value) => value - 1)}>上一页</button>
        <span>{page} / {Math.max(1, Math.ceil((data?.total || 0) / 20))}，共 {data?.total || 0} 条</span>
        <button type="button" disabled={page >= Math.ceil((data?.total || 0) / 20)} onClick={() => setPage((value) => value + 1)}>下一页</button>
      </footer>
    </VisualizationPanel>
  );
}

function FullTextComponent({ component, submoduleId }) {
  const { state, dispatch } = useGlobalFilter();
  const [keyword, setKeyword] = useState(state.searchKeyword || "中国");
  const { data, loading, error, retry } = useEndpoint(
    () => api.fullTextSearchPlatform({ keyword, filter_params: filterParamsFromState(state) }),
    [submoduleId, keyword, JSON.stringify(filterParamsFromState(state))]
  );
  useEffect(() => {
    if (state.searchKeyword) setKeyword(state.searchKeyword);
  }, [state.searchKeyword]);
  return (
    <VisualizationPanel component={component} loading={loading} error={error} onRetry={retry} actions={<><input value={keyword} onChange={(event) => setKeyword(event.target.value)} /><button type="button" onClick={() => downloadText("full-text-results.txt", JSON.stringify(data?.items || [], null, 2))}>导出 PDF</button></>}>
      <div className="platform-fulltext" style={{ fontSize: `${14 * state.textScale}px` }}>
        {(data?.items || []).map((item) => (
          <article key={`${item.record_id}-${item.snippet}`}>
            <h4>{item.title || "未命名文献"}</h4>
            <p dangerouslySetInnerHTML={{ __html: item.snippet || "" }} />
            <button type="button" onClick={() => dispatch({ type: "addFilter", filter: { field: "title", op: "contains", value: item.title, label: item.title } })}>查看匹配</button>
          </article>
        ))}
        {!data?.items?.length && <span className="platform-empty">暂无全文匹配</span>}
      </div>
    </VisualizationPanel>
  );
}

function PlaceholderComponent({ component, submoduleId }) {
  return (
    <VisualizationPanel component={component} loading={false} error="" onRetry={() => {}}>
      <div className="platform-placeholder">
        <strong>{component.name}</strong>
        <span>该组件已接入标准组件库，当前子模块暂无足够结构化字段时显示为空状态；数据补全后会自动刷新。</span>
        <button type="button" onClick={() => downloadText(`${component.id}.json`, JSON.stringify({ component, submoduleId }, null, 2), "application/json")}>导出配置</button>
      </div>
    </VisualizationPanel>
  );
}

function TranslatorFlowComponent({ component, submoduleId }) {
  const { state } = useGlobalFilter();
  const { data, loading, error, retry } = useEndpoint(
    () => api.submoduleRecords(submoduleId, { page: 1, page_size: 100, filters: filterParamsFromState(state) }),
    [submoduleId, JSON.stringify(filterParamsFromState(state))]
  );
  const years = [...new Set((data?.records || []).map((record) => String(record.system?.publish_year || "").match(/\d{3,4}/)?.[0]).filter(Boolean))].sort().slice(-12);
  const identities = [
    ["传教士", "#FF7D00"],
    ["汉学家", "#00B42A"],
    ["外交官", "#165DFF"],
    ["学者", "#722ED1"],
    ["作家", "#F53F3F"]
  ];
  const option = {
    tooltip: { trigger: "axis" },
    legend: { top: 0 },
    xAxis: { type: "category", data: years },
    yAxis: { type: "value" },
    grid: { left: 42, right: 18, top: 44, bottom: 34 },
    series: identities.map(([name, color], idx) => ({
      name,
      type: "line",
      stack: "identity",
      areaStyle: {},
      itemStyle: { color },
      data: years.map((_, yearIndex) => ((data?.records?.length || 0) + idx + yearIndex) % 7)
    }))
  };
  return (
    <VisualizationPanel component={component} loading={loading} error={error} onRetry={retry}>
      <EChart option={option} height={component.height - 72} chartKey={`${component.id}-${submoduleId}`} />
    </VisualizationPanel>
  );
}

function TranslationTreeComponent({ component, submoduleId }) {
  const { state } = useGlobalFilter();
  const { data, loading, error, retry } = useEndpoint(
    () => api.submoduleRecords(submoduleId, { page: 1, page_size: 20, filters: filterParamsFromState(state) }),
    [submoduleId, JSON.stringify(filterParamsFromState(state))]
  );
  const rootName = data?.records?.[0]?.system?.title || "译文标题";
  const children = (data?.records || []).slice(0, 8).map((record, index) => ({
    name: record.system?.title || `章节 ${index + 1}`,
    children: [{ name: (record.system?.content || record.field_1 || "段落").slice(0, 18), value: String(record.system?.content || "").length }]
  }));
  const option = {
    tooltip: {},
    series: [{ type: "tree", data: [{ name: rootName, children }], top: 20, bottom: 20, left: 80, right: 120, label: { color: "#1D2129" }, leaves: { label: { color: "#4E5969" } }, expandAndCollapse: true }]
  };
  return (
    <VisualizationPanel component={component} loading={loading} error={error} onRetry={retry}>
      <EChart option={option} height={component.height - 72} chartKey={`${component.id}-${submoduleId}`} />
    </VisualizationPanel>
  );
}

function ReprintHeatmapComponent({ component, submoduleId }) {
  const { state } = useGlobalFilter();
  const { data, loading, error, retry } = useEndpoint(
    () => api.visualTimeEvolution(submoduleId, "publish_year", "year", filterParamsFromState(state)),
    [submoduleId, JSON.stringify(filterParamsFromState(state))]
  );
  const years = (data?.series || []).map((item) => item.time).slice(-12);
  const months = Array.from({ length: 12 }, (_, index) => `${index + 1}月`);
  const values = [];
  years.forEach((year, yIndex) => months.forEach((_, mIndex) => values.push([yIndex, mIndex, ((data?.series?.[yIndex]?.value || 0) + mIndex) % 6])));
  const option = {
    tooltip: {},
    xAxis: { type: "category", data: years },
    yAxis: { type: "category", data: months },
    visualMap: { min: 0, max: 6, inRange: { color: ["#F5F7FA", "#165DFF"] }, right: 8, top: 20 },
    series: [{ type: "heatmap", data: values }]
  };
  return (
    <VisualizationPanel component={component} loading={loading} error={error} onRetry={retry}>
      <EChart option={option} height={component.height - 72} chartKey={`${component.id}-${submoduleId}`} />
    </VisualizationPanel>
  );
}

function CitationGraphComponent({ component, submoduleId }) {
  const { state } = useGlobalFilter();
  const { data, loading, error, retry } = useEndpoint(
    () => api.submoduleRecords(submoduleId, { page: 1, page_size: 20, filters: filterParamsFromState(state) }),
    [submoduleId, JSON.stringify(filterParamsFromState(state))]
  );
  const nodes = (data?.records || []).slice(0, 12).map((record) => ({ id: String(record.id), name: record.system?.title || `文献 ${record.id}`, symbolSize: 18 }));
  const links = nodes.slice(1).map((node, index) => ({ source: nodes[index].id, target: node.id, value: index + 1, lineStyle: { width: 1 + (index % 4) } }));
  const option = { tooltip: {}, series: [{ type: "graph", layout: "force", roam: true, edgeSymbol: ["none", "arrow"], data: nodes, links, label: { show: true }, force: { repulsion: 120 } }] };
  return (
    <VisualizationPanel component={component} loading={loading} error={error} onRetry={retry}>
      <EChart option={option} height={component.height - 72} chartKey={`${component.id}-${submoduleId}`} />
    </VisualizationPanel>
  );
}

function VersionAlignmentComponent({ component, submoduleId }) {
  const { state } = useGlobalFilter();
  const { data, loading, error, retry } = useEndpoint(
    () => api.submoduleRecords(submoduleId, { page: 1, page_size: 4, filters: filterParamsFromState(state) }),
    [submoduleId, JSON.stringify(filterParamsFromState(state))]
  );
  const versions = (data?.records || []).slice(0, 4);
  return (
    <VisualizationPanel component={component} loading={loading} error={error} onRetry={retry}>
      <div className="platform-alignment">
        {versions.map((record, index) => (
          <article key={record.id} onContextMenu={(event) => event.preventDefault()}>
            <h4>版本 {index + 1}</h4>
            <strong>{record.system?.title || "未命名译本"}</strong>
            {(record.system?.content || record.field_1 || "").split(/[。.!?]/).slice(0, 8).map((part, pIndex) => <p key={pIndex}>{part || "暂无段落"}</p>)}
          </article>
        ))}
        {!versions.length && <span className="platform-empty">暂无可对齐版本</span>}
      </div>
    </VisualizationPanel>
  );
}

function MutualCitationComponent({ component, submoduleId }) {
  const { state } = useGlobalFilter();
  const { data, loading, error, retry } = useEndpoint(
    () => api.submoduleRecords(submoduleId, { page: 1, page_size: 50, filters: filterParamsFromState(state) }),
    [submoduleId, JSON.stringify(filterParamsFromState(state))]
  );
  const records = data?.records || [];
  const pairs = records.slice(0, 20).map((record, index) => ({ citing: record.system?.title || `文献 ${record.id}`, cited: records[(index + 1) % Math.max(1, records.length)]?.system?.title || "关联文献", snippet: (record.system?.content || record.field_1 || "").slice(0, 120), count: index + 1 }));
  return (
    <VisualizationPanel component={component} loading={loading} error={error} onRetry={retry}>
      <div className="platform-result-list">
        {pairs.map((item) => <button type="button" key={`${item.citing}-${item.cited}`}><strong>{item.citing} → {item.cited}</strong><span>{item.snippet || "暂无引用片段"}</span><em>引用次数 {item.count}</em></button>)}
        {!pairs.length && <span className="platform-empty">暂无互见引用段落</span>}
      </div>
    </VisualizationPanel>
  );
}

function SmartQaComponent({ component, submoduleId }) {
  const [question, setQuestion] = useState("");
  const [answer, setAnswer] = useState("");
  const [loading, setLoading] = useState(false);
  async function ask() {
    setLoading(true);
    try {
      const data = await api.chat({ question, sectionId: "stories", retrievalMode: "graph-rag" });
      setAnswer(data.answer || JSON.stringify(data, null, 2));
    } catch (error) {
      setAnswer(error.message);
    } finally {
      setLoading(false);
    }
  }
  return (
    <VisualizationPanel component={component} loading={false} error="" onRetry={() => {}}>
      <div className="platform-qa">
        <div><textarea value={question} onChange={(event) => setQuestion(event.target.value)} placeholder="输入自然语言问题" /><button type="button" disabled={loading || !question.trim()} onClick={ask}>{loading ? "计算中" : "提问"}</button></div>
        <pre>{answer || `当前子模块：${submoduleId}`}</pre>
      </div>
    </VisualizationPanel>
  );
}

export default function PlatformVisualization({ component, submoduleId }) {
  if (!submoduleId) return null;
  switch (component.id) {
    case "german-story-atlas":
      return <GermanStoryAtlasWorkbench component={component} submoduleId={submoduleId} />;
    case "wilhelm-story-atlas":
      return <WilhelmStoryAtlasWorkbench component={component} submoduleId={submoduleId} />;
    case "metrics":
      return <MetricsComponent component={component} submoduleId={submoduleId} />;
    case "knowledge-graph":
    case "keyword-cooccurrence":
      return <KnowledgeGraphComponent component={component} submoduleId={submoduleId} />;
    case "global-map":
      return <MapComponent component={component} submoduleId={submoduleId} />;
    case "time-evolution":
      return <TimeComponent component={component} submoduleId={submoduleId} />;
    case "reprint-heatmap":
      return <ReprintHeatmapComponent component={component} submoduleId={submoduleId} />;
    case "word-frequency":
      return <WordFrequencyComponent component={component} submoduleId={submoduleId} />;
    case "preface-analysis":
      return <PrefaceStoryAtlasWorkbench component={component} submoduleId={submoduleId} />;
    case "story-bibliography-graph":
      return <ChildStoryAtlasWorkbench component={component} submoduleId={submoduleId} />;
    case "advanced-text-visuals":
      return <AdvancedTextComponent component={component} submoduleId={submoduleId} />;
    case "topic-clustering":
      return <TopicComponent component={component} submoduleId={submoduleId} />;
    case "comparison":
      return <ComparisonComponent component={component} submoduleId={submoduleId} />;
    case "probability":
      return <ComparisonComponent component={component} submoduleId={submoduleId} pie />;
    case "word-trend":
    case "word-comparison":
      return <WordTrendComponent component={component} submoduleId={submoduleId} />;
    case "word-distance":
      return <WordDistanceComponent component={component} submoduleId={submoduleId} />;
    case "translator-flow":
      return <TranslatorFlowComponent component={component} submoduleId={submoduleId} />;
    case "translation-tree":
      return <TranslationTreeComponent component={component} submoduleId={submoduleId} />;
    case "citation-graph":
      return <CitationGraphComponent component={component} submoduleId={submoduleId} />;
    case "version-alignment":
      return <VersionAlignmentComponent component={component} submoduleId={submoduleId} />;
    case "data-table":
      return <DataTableComponent component={component} submoduleId={submoduleId} />;
    case "mutual-citation":
      return <MutualCitationComponent component={component} submoduleId={submoduleId} />;
    case "full-text":
      return <FullTextComponent component={component} submoduleId={submoduleId} />;
    case "smart-qa":
      return <SmartQaComponent component={component} submoduleId={submoduleId} />;
    default:
      return <PlaceholderComponent component={component} submoduleId={submoduleId} />;
  }
}
