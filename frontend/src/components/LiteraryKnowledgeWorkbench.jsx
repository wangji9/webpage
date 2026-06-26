import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api.js";
import GraphCanvas from "./GraphCanvas.jsx";

const fallbackArchitecture = {
  modules: [],
  visualComponents: [],
  capabilities: []
};

function groupBy(items, key) {
  return items.reduce((acc, item) => {
    const value = item[key] || "other";
    acc[value] = acc[value] || [];
    acc[value].push(item);
    return acc;
  }, {});
}

function shortNumber(value) {
  const number = Number(value || 0);
  if (number >= 10000) return `${(number / 10000).toFixed(1)}万`;
  return String(number);
}

function componentLabel(componentId, components) {
  return components.find((item) => item.id === componentId)?.name || componentId;
}

function buildSections(modules) {
  return modules.map((module) => ({
    id: module.id,
    title: module.name,
    color: module.color || "#1e3a8a"
  }));
}

const kindLabels = {
  language: "语种库",
  theme: "专题库",
  corpus: "语料库",
  author: "作家专题",
  region: "区域库",
  repository: "总库",
  plugin: "扩展模块",
  subdomain: "子域"
};

const languageLabels = {
  global: "全球",
  multilingual: "多语种",
  English: "英语",
  German: "德语",
  French: "法语",
  Spanish: "西班牙语",
  "Spanish/Portuguese": "西班牙语/葡萄牙语",
  Japanese: "日语",
  Chinese: "中文"
};

function kindLabel(value) {
  return kindLabels[value] || value || "子域";
}

function languageLabel(value) {
  return languageLabels[value] || value || "未标注";
}

const visualizationCategories = [
  {
    id: "graph",
    label: "图谱",
    title: "图谱关系层",
    summary: "覆盖知识图谱、关系网络、角色共现网络与引用关系链。"
  },
  {
    id: "time",
    label: "时间",
    title: "时间演化层",
    summary: "覆盖出版、翻译、接受史时间轴、动态演化与历史密度热图。"
  },
  {
    id: "space",
    label: "空间",
    title: "空间传播层",
    summary: "覆盖全球地图、地理传播路径与出版/接受/机构城市分布。"
  },
  {
    id: "stats",
    label: "统计",
    title: "统计分析层",
    summary: "覆盖词频统计、概率分布与语种、版本、年代、国家对比。"
  },
  {
    id: "text",
    label: "文本",
    title: "文本证据层",
    summary: "覆盖全文查看、多版本对齐与 A[0-10]B 字距检索。"
  }
];

function topItems(stats, limit = 8) {
  return (stats?.items || []).slice(0, limit);
}

function countDocumentsBy(documents, field, limit = 5) {
  const counts = new Map();
  documents.forEach((document) => {
    const value = String(document[field] || "未标注").trim() || "未标注";
    counts.set(value, (counts.get(value) || 0) + 1);
  });
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-Hans-CN"))
    .slice(0, limit)
    .map(([label, count]) => ({ label, count }));
}

function titleForDocument(document) {
  return document?.title || document?.canonicalTitle || document?.translatedTitle || "未命名文献";
}

function rowText(row) {
  return Object.values(row || {}).map((value) => String(value ?? "").trim()).join(" ");
}

function buildFallbackVisualData({ graphData, frequencyData, timelineData, geographyData, documentData, moduleId, submoduleId }) {
  const documents = documentData?.documents || [];
  return {
    moduleId,
    submoduleId,
    recordCount: documentData?.total ?? documents.length,
    graph: {
      knowledgeGraph: graphData || { nodes: [], edges: [] },
      cooccurrence: [],
      citations: []
    },
    time: {
      timeline: timelineData?.items || [],
      evolution: timelineData?.items || [],
      heatmap: (timelineData?.items || []).map((item) => ({ period: item.year, count: item.count }))
    },
    space: {
      places: geographyData?.items || [],
      cities: geographyData?.items?.map((item) => ({ city: item.place, count: item.count })) || [],
      routes: []
    },
    stats: {
      frequency: frequencyData?.items || [],
      probability: frequencyData?.items || [],
      comparison: []
    },
    text: {
      documents,
      alignment: documents,
      distance: []
    }
  };
}

function TimelinePreview({ stats, onSelect }) {
  const items = stats?.items || [];
  const max = Math.max(1, ...items.map((item) => item.count || 0));
  const visible = items.slice(-18);
  return (
    <div className="lit-mini-bars" aria-label="时间分布">
      {visible.length ? visible.map((item) => (
        <span key={item.year} title={`${item.year}: ${item.count}`} onClick={() => onSelect?.(`时间 ${item.year}：${item.count} 条记录`)}>
          <i style={{ height: `${18 + (item.count / max) * 72}px` }} />
          <b>{String(item.year).slice(2)}</b>
        </span>
      )) : <em>等待时间字段数据</em>}
    </div>
  );
}

function FrequencyPreview({ stats, onSelect }) {
  const items = stats?.items || [];
  const max = Math.max(1, ...items.map((item) => item.count || 0));
  return (
    <div className="lit-frequency-list">
      {items.slice(0, 8).map((item) => (
        <div key={item.term} onClick={() => onSelect?.(`词项“${item.term}”：${item.count} 次`)}>
          <span>{item.term}</span>
          <i><b style={{ width: `${Math.max(8, (item.count / max) * 100)}%` }} /></i>
          <strong>{item.count}</strong>
        </div>
      ))}
      {!items.length && <em>等待文本字段数据</em>}
    </div>
  );
}

function GeographyPreview({ stats, onSelect }) {
  const items = stats?.items || [];
  return (
    <div className="lit-geo-list">
      {items.slice(0, 8).map((item, index) => (
        <div key={item.place} onClick={() => onSelect?.(`地点“${item.place}”：${item.count} 条记录`)}>
          <span>{index + 1}</span>
          <strong>{item.place}</strong>
          <b>{item.count}</b>
        </div>
      ))}
      {!items.length && <em>等待地理字段数据</em>}
    </div>
  );
}

function MiniNetworkPreview({ graph, onSelect }) {
  const nodes = (graph?.nodes || []).slice(0, 9);
  const nodeMap = new Map(nodes.map((node, index) => {
    const angle = (index / Math.max(1, nodes.length)) * Math.PI * 2 - Math.PI / 2;
    const radius = index === 0 ? 0 : 82;
    return [node.id, {
      ...node,
      x: 170 + Math.cos(angle) * radius,
      y: 112 + Math.sin(angle) * radius
    }];
  }));
  const edges = (graph?.edges || []).filter((edge) => nodeMap.has(edge.from) && nodeMap.has(edge.to)).slice(0, 14);

  return (
    <svg className="lit-mini-network" viewBox="0 0 340 224" role="img" aria-label="关系网络图预览">
      <rect x="1" y="1" width="338" height="222" rx="8" />
      {edges.map((edge, index) => {
        const source = nodeMap.get(edge.from);
        const target = nodeMap.get(edge.to);
        return (
          <line
            key={`${edge.from}-${edge.to}-${index}`}
            x1={source.x}
            y1={source.y}
            x2={target.x}
            y2={target.y}
          />
        );
      })}
      {nodes.map((node) => {
        const point = nodeMap.get(node.id);
        return (
          <g
            key={node.id}
            role="button"
            tabIndex={0}
            onClick={() => onSelect?.(`节点「${node.label || node.id}」：${node.type || "实体"}，关联边 ${edges.filter((edge) => edge.from === node.id || edge.to === node.id).length} 条`)}
            onKeyDown={(event) => {
              if (event.key === "Enter" || event.key === " ") {
                event.preventDefault();
                onSelect?.(`节点「${node.label || node.id}」：${node.type || "实体"}，关联边 ${edges.filter((edge) => edge.from === node.id || edge.to === node.id).length} 条`);
              }
            }}
          >
            <circle cx={point.x} cy={point.y} r={node.type === "domain" ? 13 : 9} />
            <text x={point.x} y={point.y + 25}>{String(node.label || node.id).slice(0, 8)}</text>
          </g>
        );
      })}
    </svg>
  );
}

function TemporalHeatmapPreview({ stats, onSelect }) {
  const items = (stats?.items || []).slice(-36);
  const max = Math.max(1, ...items.map((item) => item.count || 0));
  return (
    <div className="lit-temporal-heatmap" aria-label="历史分布热图">
      {items.length ? items.map((item) => (
        <span
          key={item.year}
          style={{ "--heat": Math.max(0.12, (item.count || 0) / max) }}
          title={`${item.year}: ${item.count}`}
          onClick={() => onSelect?.(`阶段 ${item.year}：${item.count} 条记录`)}
        >
          {String(item.year).slice(2)}
        </span>
      )) : <em>等待年代密度数据</em>}
    </div>
  );
}

function EvolutionPreview({ stats, onSelect }) {
  const items = (stats?.items || []).slice(-10);
  const max = Math.max(1, ...items.map((item) => item.count || 0));
  return (
    <div className="lit-evolution-preview" aria-label="动态演化图">
      {items.length ? items.map((item, index) => (
        <span key={item.year} onClick={() => onSelect?.(`${item.year}：本期 ${item.count} 条，累计 ${item.cumulative || item.count} 条`)}>
          <b>{item.year}</b>
          <i style={{ width: `${Math.max(12, ((item.count || 0) / max) * 100)}%` }} />
          <small>{index < items.length - 1 ? "主题推进" : "当前阶段"}</small>
        </span>
      )) : <em>等待阶段演化数据</em>}
    </div>
  );
}

function SpaceMapPreview({ stats, onSelect }) {
  const places = topItems(stats, 10);
  const max = Math.max(1, ...places.map((item) => item.count || 0));

  return (
    <div className="lit-space-preview">
      <svg viewBox="0 0 520 230" role="img" aria-label="全球地图与地理传播路径图预览">
        <rect x="1" y="1" width="518" height="228" rx="8" />
        <ellipse cx="260" cy="116" rx="212" ry="82" />
        <path d="M66 118 C145 70 202 72 260 116 S377 160 454 112" />
        <path d="M94 151 C168 109 249 94 426 148" />
        {places.map((item, index) => {
          const x = 82 + (index % 5) * 88 + (index > 4 ? 22 : 0);
          const y = 76 + Math.floor(index / 5) * 72 + ((index % 2) * 16);
          const r = 5 + Math.sqrt(item.count || 1) / Math.sqrt(max) * 12;
          return (
            <g key={item.place}>
              {index < 4 && <path className="route" d={`M252 124 C${300 + index * 24} ${70 + index * 12} ${x - 28} ${y - 24} ${x} ${y}`} />}
              <circle cx={x} cy={y} r={r} onClick={() => onSelect?.(`空间节点“${item.place}”：${item.count} 条记录`)} />
              <text x={x + 13} y={y + 4}>{String(item.place).slice(0, 10)}</text>
            </g>
          );
        })}
      </svg>
      <div className="lit-space-rank">
        {places.slice(0, 6).map((item, index) => (
          <span key={item.place}><b>{index + 1}</b><strong>{item.place}</strong><small>{item.count}</small></span>
        ))}
      </div>
    </div>
  );
}

function ProbabilityPreview({ stats, onSelect }) {
  const items = topItems(stats, 7);
  const total = Math.max(1, items.reduce((sum, item) => sum + (item.count || 0), 0));
  return (
    <div className="lit-probability-preview" aria-label="概率分布图">
      {items.length ? items.map((item) => {
        const probability = (item.count || 0) / total;
        return (
          <span key={item.term} onClick={() => onSelect?.(`概率项“${item.term}”：${(probability * 100).toFixed(1)}%`)}>
            <strong>{item.term}</strong>
            <i><b style={{ width: `${Math.max(8, probability * 100)}%` }} /></i>
            <small>{(probability * 100).toFixed(1)}%</small>
          </span>
        );
      }) : <em>等待概率统计数据</em>}
    </div>
  );
}

function ComparativeMatrixPreview({ documents, onSelect }) {
  const languages = countDocumentsBy(documents, "language", 4);
  const countries = countDocumentsBy(documents, "country", 4);
  return (
    <div className="lit-comparison-matrix" aria-label="对比分析图">
      <span />
      {countries.map((country) => <strong key={country.label}>{country.label}</strong>)}
      {languages.map((language) => (
        <div className="lit-comparison-row" key={language.label}>
          <b>{language.label}</b>
          {countries.map((country) => {
            const count = documents.filter((document) => (
              (document.language || "未标注") === language.label
              && (document.country || "未标注") === country.label
            )).length;
            return <i key={`${language.label}-${country.label}`} onClick={() => onSelect?.(`${language.label} × ${country.label}：${count} 条记录`)}>{count}</i>;
          })}
        </div>
      ))}
      {!documents.length && <em>等待语种、版本、年代、国家对比数据</em>}
    </div>
  );
}

function TextLayerPreview({ documents, moduleId }) {
  const [zoom, setZoom] = useState(1);
  const document = documents[0] || {};
  const alignedDocuments = documents.slice(0, 4);
  const paragraph = document.summary || document.prefaceText || document.text || "等待全文片段、段落定位与证据回看数据。";

  return (
    <div className="lit-text-layer-preview">
      <article className="lit-fulltext-viewer">
        <header>
          <div>
            <span>全文查看器</span>
            <strong>{titleForDocument(document)}</strong>
          </div>
          <div>
            <button type="button" onClick={() => setZoom((value) => Math.max(0.86, value - 0.08))}>缩小</button>
            <button type="button" onClick={() => setZoom((value) => Math.min(1.32, value + 0.08))}>放大</button>
          </div>
        </header>
        <p style={{ fontSize: `${14 * zoom}px` }}>{paragraph}</p>
      </article>
      <div className="lit-alignment-viewer" aria-label="多版本对齐">
        <span>多版本对齐</span>
        {alignedDocuments.length ? alignedDocuments.map((item, index) => (
          <div key={item.id || index}>
            <b>{languageLabel(item.language)}</b>
            <strong>{titleForDocument(item)}</strong>
            <small>{item.publicationYear || item.year || "未标注"}</small>
          </div>
        )) : <em>等待跨语种、跨版本文本对齐数据</em>}
      </div>
      <SearchTools moduleId={moduleId} compact />
    </div>
  );
}

function VisualizationLayerWorkbench({ componentGroups, graph, frequency, timeline, geography, documents, moduleId, visualData }) {
  const [insight, setInsight] = useState("点击图谱节点、柱形、热力格、空间点或矩阵单元查看计算结果。");
  const graphData = visualData?.graph?.knowledgeGraph || graph;
  const frequencyData = { items: visualData?.stats?.frequency || frequency?.items || [] };
  const timelineData = { items: visualData?.time?.timeline || timeline?.items || [] };
  const geographyData = { items: visualData?.space?.places || geography?.items || [] };
  const textDocuments = visualData?.text?.documents || documents || [];

  function scrollToCategory(categoryId) {
    document.getElementById(`lit-layer-${categoryId}`)?.scrollIntoView({ behavior: "smooth", block: "nearest" });
  }

  function renderPreview(categoryId) {
    if (categoryId === "graph") {
      return (
        <div className="lit-layer-preview lit-graph-layer-preview">
          <MiniNetworkPreview graph={graphData} onSelect={setInsight} />
          <div className="lit-graph-metrics">
            <span><b>{shortNumber(graphData.nodes?.length)}</b><strong>知识图谱</strong><small>人物、作品、机构、地点多元关系浏览</small></span>
            <span><b>{shortNumber(graphData.edges?.length)}</b><strong>关系网络图</strong><small>译者、作者、出版社、文本共现网络</small></span>
            <span><b>{shortNumber(visualData?.graph?.cooccurrence?.length || 0)}</b><strong>角色共现网络</strong><small>角色、母题、主题共现分析</small></span>
            <span><b>{shortNumber(visualData?.graph?.citations?.length || 0)}</b><strong>引用关系图</strong><small>序跋、研究文献、互见段落引用链</small></span>
          </div>
        </div>
      );
    }
    if (categoryId === "time") {
      return (
        <div className="lit-layer-preview lit-time-layer-preview">
          <div><strong>时间轴</strong><TimelinePreview stats={timelineData} onSelect={setInsight} /></div>
          <div><strong>动态演化图</strong><EvolutionPreview stats={{ items: visualData?.time?.evolution || timelineData.items }} onSelect={setInsight} /></div>
          <div><strong>历史分布热图</strong><TemporalHeatmapPreview stats={{ items: (visualData?.time?.heatmap || []).map((item) => ({ year: item.period, count: item.count })) }} onSelect={setInsight} /></div>
        </div>
      );
    }
    if (categoryId === "space") {
      return (
        <div className="lit-layer-preview lit-space-layer-preview">
          <SpaceMapPreview stats={geographyData} onSelect={setInsight} />
          <div className="lit-space-metrics">
            <span><b>{topItems(geographyData, 30).length}</b><strong>全球地图</strong><small>国家、区域、城市聚合</small></span>
            <span><b>{shortNumber(visualData?.space?.routes?.length || 0)}</b><strong>地理传播路径图</strong><small>中国来源地到海外出版地传播路径</small></span>
            <span><b>{shortNumber(visualData?.space?.cities?.length || 0)}</b><strong>城市分布图</strong><small>出版城市、接受城市、研究机构分布</small></span>
          </div>
        </div>
      );
    }
    if (categoryId === "stats") {
      return (
        <div className="lit-layer-preview lit-stats-layer-preview">
          <div><strong>词频统计图</strong><FrequencyPreview stats={frequencyData} onSelect={setInsight} /></div>
          <div><strong>概率分布图</strong><ProbabilityPreview stats={frequencyData} onSelect={setInsight} /></div>
          <div><strong>对比分析图</strong><ComparativeMatrixPreview documents={textDocuments} onSelect={setInsight} /></div>
        </div>
      );
    }
    return <TextLayerPreview documents={textDocuments} moduleId={moduleId} />;
  }

  return (
    <section className="lit-visualization-lab">
      <div className="lit-section-heading lit-visualization-heading">
        <div>
          <span>第二部分</span>
          <strong>统一可视化组件库</strong>
          <p>五层组件全部由后端聚合算法输出，随当前知识域与子模块联动渲染。</p>
        </div>
        <div className="lit-visual-category-index">
          {visualizationCategories.map((category) => (
            <button type="button" key={category.id} onClick={() => scrollToCategory(category.id)}>
              <span>{category.label}</span>
              <b>{componentGroups[category.id]?.length || 0}</b>
            </button>
          ))}
        </div>
      </div>

      <div className="lit-interaction-detail">{insight}</div>

      <div className="lit-layer-grid">
        {visualizationCategories.map((category) => (
          <article className={`lit-layer-panel lit-layer-${category.id}`} id={`lit-layer-${category.id}`} key={category.id}>
            <header>
              <span>{category.label}</span>
              <strong>{category.title}</strong>
              <p>{category.summary}</p>
            </header>
            {renderPreview(category.id)}
          </article>
        ))}
      </div>
    </section>
  );
}

function SearchTools({ moduleId, compact = false }) {
  const [query, setQuery] = useState("中国");
  const [q1, setQ1] = useState("中国");
  const [q2, setQ2] = useState("故事");
  const [range, setRange] = useState(10);
  const [terms, setTerms] = useState("中国=故事=民间");
  const [result, setResult] = useState({ mode: "fulltext", items: [] });
  const [loading, setLoading] = useState(false);

  function run(mode) {
    setLoading(true);
    const task = mode === "distance"
      ? api.distanceSearch(q1, q2, range, moduleId)
      : mode === "compare"
      ? api.compareTerms(terms, moduleId)
      : api.fulltextSearch(query, moduleId);
    task.then((data) => setResult({ mode, ...(data || {}) }))
      .catch((error) => setResult({ mode, items: [], error: error.message }))
      .finally(() => setLoading(false));
  }

  return (
    <section className={`lit-toolbox${compact ? " compact" : ""}`}>
      <div className="lit-tool-row">
        <label>全文检索<input value={query} onChange={(event) => setQuery(event.target.value)} /></label>
        <button type="button" onClick={() => run("fulltext")}>检索</button>
      </div>
      <div className="lit-tool-row">
        <label>字距 A<input value={q1} onChange={(event) => setQ1(event.target.value)} /></label>
        <label>B<input value={q2} onChange={(event) => setQ2(event.target.value)} /></label>
        <label>范围<input type="number" min="0" max="80" value={range} onChange={(event) => setRange(event.target.value)} /></label>
        <button type="button" onClick={() => run("distance")}>A[0-{range}]B</button>
      </div>
      <div className="lit-tool-row">
        <label>多词对比<input value={terms} onChange={(event) => setTerms(event.target.value)} /></label>
        <button type="button" onClick={() => run("compare")}>A=B=C</button>
      </div>
      <div className="lit-search-results">
        {loading && <span>正在查询...</span>}
        {result.error && <span>{result.error}</span>}
        {!loading && result.mode === "compare" && (result.items || []).map((item) => (
          <div key={item.term}><strong>{item.term}</strong><b>{item.count}</b></div>
        ))}
        {!loading && result.mode !== "compare" && (result.items || []).slice(0, 5).map((item) => (
          <article key={item.id}>
            <strong>{item.canonicalTitle || item.translatedTitle || "未命名文献"}</strong>
            <p>{item.snippet || item.summary || item.source}</p>
          </article>
        ))}
      </div>
    </section>
  );
}

function DatasetTablePanel({ datasets = [], selectedDatasetId, onSelect, loading = false }) {
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(28);
  const activeDataset = datasets.find((dataset) => dataset.id === selectedDatasetId) || datasets[0] || null;
  const rows = activeDataset?.rows || [];
  const columns = activeDataset?.columns?.length ? activeDataset.columns : Object.keys(rows[0] || {});
  const totalRows = activeDataset?.stats?.rowCount || rows.length;
  const previewRows = activeDataset?.previewRowCount || rows.length;

  useEffect(() => {
    setQuery("");
    setLimit(28);
  }, [activeDataset?.id]);

  const filteredRows = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (!keyword) return rows;
    return rows.filter((row) => rowText(row).toLowerCase().includes(keyword));
  }, [query, rows]);
  const visibleRows = filteredRows.slice(0, limit);

  return (
    <section className="lit-dataset-panel">
      <header>
        <div>
          <span>子模块数据表格</span>
          <strong>{activeDataset?.title || "当前子模块暂无绑定表"}</strong>
          <p>{loading ? "正在读取后端数据表..." : `${filteredRows.length} / ${previewRows} 条预览，全量 ${totalRows} 条记录。`}</p>
        </div>
        <label>
          <span>表内检索</span>
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="题名、译者、国家、主题" />
        </label>
      </header>

      {datasets.length > 1 && (
        <div className="lit-dataset-tabs" aria-label="数据表切换">
          {datasets.map((dataset) => (
            <button
              type="button"
              key={dataset.id}
              className={dataset.id === activeDataset?.id ? "active" : ""}
              onClick={() => onSelect(dataset.id)}
            >
              <strong>{dataset.title}</strong>
              <small>{dataset.stats?.rowCount || 0} 行 / {dataset.stats?.columnCount || dataset.columns?.length || 0} 字段</small>
            </button>
          ))}
        </div>
      )}

      <div className="lit-dataset-table-wrap">
        <table className="kb-table lit-dataset-table">
          <thead>
            <tr>{columns.map((column) => <th key={column}>{column}</th>)}</tr>
          </thead>
          <tbody>
            {visibleRows.map((row, rowIndex) => (
              <tr key={`${activeDataset?.id || "dataset"}-${rowIndex}`}>
                {columns.map((column) => <td key={column}>{String(row[column] ?? "")}</td>)}
              </tr>
            ))}
            {!loading && !visibleRows.length && (
              <tr><td colSpan={Math.max(1, columns.length)}>当前筛选条件下暂无记录。</td></tr>
            )}
            {loading && (
              <tr><td colSpan={Math.max(1, columns.length)}>正在加载数据表...</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {filteredRows.length > visibleRows.length && (
        <button className="lit-more-table-button" type="button" onClick={() => setLimit((value) => value + 28)}>继续显示</button>
      )}
    </section>
  );
}

function PluginRegistrationPanel({ modules, visualComponents = [], onRegistered }) {
  const [form, setForm] = useState({
    moduleId: "stories",
    name: "新专题子模块",
    kind: "theme",
    language: "多语种",
    components: ["KnowledgeGraph", "Timeline", "WorldMap"]
  });
  const [status, setStatus] = useState("");

  function toggleComponent(componentId) {
    setForm((current) => {
      const enabled = new Set(current.components);
      if (enabled.has(componentId)) enabled.delete(componentId);
      else enabled.add(componentId);
      return { ...current, components: [...enabled] };
    });
  }

  function submit(event) {
    event.preventDefault();
    setStatus("正在注册...");
    fetch("/api/modules", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ...form,
        englishName: form.name,
        components: form.components
      })
    })
      .then(async (response) => {
        const payload = await response.json().catch(() => ({}));
        if (!response.ok) throw new Error(payload.detail || "当前账号无权注册动态子模块");
        setStatus("已注册动态子模块");
        onRegistered?.();
      })
      .catch((error) => setStatus(error.message));
  }

  return (
    <form className="lit-plugin-panel" onSubmit={submit}>
      <div className="lit-rail-title">
        <span>扩展架构</span>
        <strong>动态子模块注册</strong>
      </div>
      <label>知识域
        <select value={form.moduleId} onChange={(event) => setForm({ ...form, moduleId: event.target.value })}>
          {modules.map((module) => <option key={module.id} value={module.id}>{module.name}</option>)}
        </select>
      </label>
      <label>子模块名称
        <input value={form.name} onChange={(event) => setForm({ ...form, name: event.target.value })} />
      </label>
      <div className="lit-plugin-grid">
        <label>类型
          <select value={form.kind} onChange={(event) => setForm({ ...form, kind: event.target.value })}>
            <option value="theme">专题库</option>
            <option value="corpus">语料库</option>
            <option value="language">语种库</option>
            <option value="author">作家专题</option>
            <option value="plugin">扩展模块</option>
          </select>
        </label>
        <label>语种
          <input value={form.language} onChange={(event) => setForm({ ...form, language: event.target.value })} />
        </label>
      </div>
      <div className="lit-component-picker" aria-label="组件配置">
        <span>组件配置</span>
        {(visualComponents || []).map((component) => (
          <button
            type="button"
            key={component.id}
            className={form.components.includes(component.id) ? "active" : ""}
            onClick={() => toggleComponent(component.id)}
          >
            {component.name}
          </button>
        ))}
      </div>
      <button type="submit">注册子模块</button>
      {status && <p>{status}</p>}
    </form>
  );
}

export default function LiteraryKnowledgeWorkbench() {
  const [architecture, setArchitecture] = useState(fallbackArchitecture);
  const [selectedModuleId, setSelectedModuleId] = useState("shanghai");
  const [selectedSubmoduleId, setSelectedSubmoduleId] = useState("shanghai-luxun");
  const [perspective, setPerspective] = useState("global");
  const [graph, setGraph] = useState({ nodes: [], edges: [] });
  const [frequency, setFrequency] = useState({ items: [] });
  const [timeline, setTimeline] = useState({ items: [] });
  const [geography, setGeography] = useState({ items: [] });
  const [sampleDocuments, setSampleDocuments] = useState([]);
  const [visualData, setVisualData] = useState(null);
  const [datasetBundle, setDatasetBundle] = useState({ modules: [], datasets: [] });
  const [selectedDatasetId, setSelectedDatasetId] = useState("");
  const [datasetLoading, setDatasetLoading] = useState(false);
  const [primaryInsight, setPrimaryInsight] = useState("点击第一部分的词频、时间或地理统计单元查看当前子模块计算结果。");
  const [deleteStatus, setDeleteStatus] = useState("");
  const [deleteLoading, setDeleteLoading] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  function loadArchitecture() {
    let canceled = false;
    setLoading(true);
    api.architecture()
      .then((data) => {
        if (canceled) return;
        setArchitecture(data || fallbackArchitecture);
        const modules = data?.modules || [];
        const selected = modules.find((item) => item.id === selectedModuleId) || modules[0];
        const preferredSubmodule = selected?.submodules?.find((item) => item.id === selectedSubmoduleId)
          || selected?.submodules?.find((item) => item.id === "shanghai-luxun")
          || selected?.submodules?.[0];
        setSelectedModuleId(selected?.id || "shanghai");
        setSelectedSubmoduleId(preferredSubmodule?.id || "");
      })
      .catch((err) => setError(err.message))
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => { canceled = true; };
  }

  useEffect(() => {
    return loadArchitecture();
  }, []);

  const modules = architecture.modules || [];
  const visualComponents = architecture.visualComponents || [];
  const selectedModule = modules.find((item) => item.id === selectedModuleId) || modules[0] || {};
  const selectedSubmodule = (selectedModule.submodules || []).find((item) => item.id === selectedSubmoduleId)
    || selectedModule.submodules?.[0]
    || {};
  const componentGroups = useMemo(() => groupBy(visualComponents, "category"), [visualComponents]);

  useEffect(() => {
    if (!selectedModule?.id) return undefined;
    let canceled = false;
    setError("");
    api.visualizationLayer(selectedModule.id, selectedSubmodule?.id || "")
      .then((data) => {
        if (canceled) return;
        setVisualData(data || null);
        setGraph(data?.graph?.knowledgeGraph || { nodes: [], edges: [] });
        setFrequency({ items: data?.stats?.frequency || [] });
        setTimeline({ items: data?.time?.timeline || [] });
        setGeography({ items: data?.space?.places || [] });
        setSampleDocuments(data?.text?.documents || []);
      })
      .catch(() => {
        Promise.all([
          api.moduleGraph(selectedModule.id),
          api.frequencyStats(selectedModule.id),
          api.timelineStats(selectedModule.id),
          api.geographyStats(selectedModule.id),
          api.documents(selectedModule.id, selectedSubmodule?.id || "")
        ]).then(([graphData, frequencyData, timelineData, geographyData, documentData]) => {
          if (canceled) return;
          const fallback = buildFallbackVisualData({
            graphData,
            frequencyData,
            timelineData,
            geographyData,
            documentData,
            moduleId: selectedModule.id,
            submoduleId: selectedSubmodule?.id || ""
          });
          setVisualData(fallback);
          setGraph(fallback.graph.knowledgeGraph);
          setFrequency({ items: fallback.stats.frequency });
          setTimeline({ items: fallback.time.timeline });
          setGeography({ items: fallback.space.places });
          setSampleDocuments(fallback.text.documents);
        }).catch((err) => {
          if (!canceled) setError(err.message);
        });
      });
    return () => { canceled = true; };
  }, [selectedModule?.id, selectedSubmodule?.id]);

  useEffect(() => {
    if (!selectedModule?.id || visualData?.text?.documents?.length) return undefined;
    let canceled = false;
    Promise.all([
      api.moduleGraph(selectedModule.id),
      api.frequencyStats(selectedModule.id),
      api.timelineStats(selectedModule.id),
      api.geographyStats(selectedModule.id)
    ]).then(([graphData, frequencyData, timelineData, geographyData]) => {
      if (canceled) return;
      setGraph(graphData || { nodes: [], edges: [] });
      setFrequency(frequencyData || { items: [] });
      setTimeline(timelineData || { items: [] });
      setGeography(geographyData || { items: [] });
    }).catch((err) => setError(err.message));
    return () => { canceled = true; };
  }, [selectedModule?.id, visualData?.text?.documents?.length]);

  useEffect(() => {
    if (!selectedModule?.id || sampleDocuments.length) return undefined;
    let canceled = false;
    api.documents(selectedModule.id, selectedSubmodule?.id || "")
      .then((data) => {
        if (!canceled) setSampleDocuments(data?.documents || []);
      })
      .catch(() => {
        if (!canceled) setSampleDocuments([]);
      });
    return () => { canceled = true; };
  }, [sampleDocuments.length, selectedModule?.id, selectedSubmodule?.id]);

  useEffect(() => {
    if (!selectedModule?.id) return undefined;
    let canceled = false;
    setDatasetLoading(true);
    api.moduleDatasets(selectedModule.id, { submoduleId: selectedSubmodule?.id || "" })
      .then((data) => {
        if (canceled) return;
        const datasets = data?.modules?.[0]?.datasets || data?.datasets || [];
        setDatasetBundle(data || { modules: [], datasets: [] });
        setSelectedDatasetId(datasets[0]?.id || "");
      })
      .catch(() => {
        if (!canceled) {
          setDatasetBundle({ modules: [], datasets: [] });
          setSelectedDatasetId("");
        }
      })
      .finally(() => {
        if (!canceled) setDatasetLoading(false);
      });
    return () => { canceled = true; };
  }, [selectedModule?.id, selectedSubmodule?.id]);

  function selectModule(moduleId) {
    const next = modules.find((item) => item.id === moduleId);
    setSelectedModuleId(moduleId);
    setSelectedSubmoduleId(next?.submodules?.[0]?.id || "");
  }

  async function removeSelectedSubmodule() {
    if (!selectedSubmodule?.dynamic || deleteLoading) return;
    const ok = window.confirm(`确认删除动态子模块“${selectedSubmodule.name}”？`);
    if (!ok) return;
    setDeleteLoading(true);
    setDeleteStatus("正在删除子模块...");
    try {
      await api.removeSubmodule(selectedSubmodule.id);
      setDeleteStatus("子模块已删除");
      const next = (selectedModule.submodules || []).find((item) => item.id !== selectedSubmodule.id);
      setSelectedSubmoduleId(next?.id || "");
      loadArchitecture();
    } catch (err) {
      setDeleteStatus(err.message || "删除失败");
    } finally {
      setDeleteLoading(false);
    }
  }

  const activeComponents = selectedSubmodule.components || [];
  const computedRecords = visualData?.recordCount ?? selectedSubmodule.rowCount ?? selectedModule.rowCount ?? 0;
  const activeDatasets = datasetBundle.modules?.[0]?.datasets || datasetBundle.datasets || [];
  const showStoryCollectionAtlas = selectedModule.id === "stories" && selectedSubmodule.id === "stories-german-collections";

  return (
    <section className="lit-platform-shell">
      <header className="lit-platform-head">
        <div>
          <span>多语种文学知识可视化系统</span>
          <h1>全球多语种文学知识可视化平台</h1>
          <p>以“模块 - 语料 - 关系 - 可视化”为统一骨架，连接中国典籍、上海文学、中国故事集、世界文学中国叙事与总库。</p>
        </div>
        <div className="lit-perspective" role="tablist" aria-label="视角切换">
          <button type="button" className={perspective === "global" ? "active" : ""} onClick={() => setPerspective("global")}>全球视角</button>
          <button type="button" className={perspective === "language" ? "active" : ""} onClick={() => setPerspective("language")}>语种视角</button>
        </div>
      </header>

      {error && <div className="alert">{error}</div>}
      {loading && <div className="work-panel inherited-loading">正在加载三层知识架构...</div>}

      <section className="lit-domain-section">
        <div className="lit-section-heading">
          <span>知识域</span>
          <strong>五大知识域</strong>
        </div>
        <div className="lit-domain-rail">
          {modules.map((module) => (
            <button
              type="button"
              key={module.id}
              className={module.id === selectedModule.id ? "active" : ""}
              onClick={() => selectModule(module.id)}
              style={{ "--module-color": module.color || "#1e3a8a" }}
            >
              <strong>{module.name}</strong>
              <small>{shortNumber(module.datasetCount)} 数据集 / {shortNumber(module.rowCount)} 行</small>
            </button>
          ))}
        </div>
      </section>

      <section className="lit-submodule-zone">
        <section className="lit-subdomain-strip">
          {(selectedModule.submodules || []).map((submodule) => (
            <button
              type="button"
              key={submodule.id}
              className={submodule.id === selectedSubmodule.id ? "active" : ""}
              onClick={() => setSelectedSubmoduleId(submodule.id)}
            >
              <span>{kindLabel(submodule.kind)}</span>
              <strong>{submodule.name}</strong>
              <small>{languageLabel(submodule.language)} / {shortNumber(submodule.rowCount)} 行</small>
            </button>
          ))}
        </section>

        <article className="lit-submodule-card">
          <div className="lit-rail-title">
            <span>当前子域</span>
            <strong>{selectedSubmodule.name || "请选择子模块"}</strong>
          </div>
          <div className="lit-detail-meta">
            <div><span>类型</span><b>{kindLabel(selectedSubmodule.kind)}</b></div>
            <div><span>语种</span><b>{languageLabel(selectedSubmodule.language)}</b></div>
            <div><span>绑定数据</span><b>{shortNumber(selectedSubmodule.datasetCount)}</b></div>
          </div>
          <div className="lit-active-components">
            <span>已启用组件</span>
            {activeComponents.map((component) => (
              <b key={component}>{componentLabel(component, visualComponents)}</b>
            ))}
          </div>
          {selectedSubmodule.dynamic && (
            <div className="lit-submodule-actions">
              <button type="button" onClick={removeSelectedSubmodule} disabled={deleteLoading}>
                {deleteLoading ? "正在删除" : "删除子模块"}
              </button>
              {deleteStatus && <span>{deleteStatus}</span>}
            </div>
          )}
        </article>

        <PluginRegistrationPanel modules={modules} visualComponents={visualComponents} onRegistered={loadArchitecture} />
        <div className="lit-capability-map">
          <span>十二项功能映射</span>
          {(architecture.capabilities || []).map((item) => (
            <div key={item.id}>
              <b>{item.id}</b>
              <strong>{item.name}</strong>
              <small>{item.components.map((component) => componentLabel(component, visualComponents)).join("、")}</small>
            </div>
          ))}
        </div>
      </section>

      <main className="lit-main-stage">
        <section className="lit-content-block">
          <div className="lit-block-title">
            <span>第一部分</span>
            <strong>语料与知识关系</strong>
          </div>
          <section className="lit-module-summary" style={{ "--module-color": selectedModule.color || "#1e3a8a" }}>
            <div>
              <span>当前知识域</span>
              <h2>{selectedModule.name}</h2>
              <p>{selectedModule.description}</p>
            </div>
            <div className="lit-summary-metrics">
              <div><b>{selectedModule.submodules?.length || 0}</b><span>子模块</span></div>
              <div><b>{shortNumber(selectedModule.datasetCount)}</b><span>数据集</span></div>
              <div><b>{shortNumber(computedRecords)}</b><span>可计算记录</span></div>
            </div>
          </section>

          <section className="lit-visual-grid">
            <div className="lit-graph-panel">
              <GraphCanvas
                graph={graph}
                sections={buildSections(modules)}
                initialFilter={selectedModule.id}
                title={`${selectedModule.name} - 模块知识图谱`}
                allowExpand={false}
              />
            </div>
            <div className="lit-analytics-stack">
              <article>
                <header><strong>词频与主题</strong><span>后端频次统计</span></header>
                <FrequencyPreview stats={frequency} onSelect={setPrimaryInsight} />
              </article>
              <article>
                <header><strong>时间演化</strong><span>后端年代聚合</span></header>
                <TimelinePreview stats={timeline} onSelect={setPrimaryInsight} />
              </article>
              <article>
                <header><strong>地理分布</strong><span>后端空间聚合</span></header>
                <GeographyPreview stats={geography} onSelect={setPrimaryInsight} />
              </article>
              <article className="lit-story-atlas-entry">
                <header><strong>专题图谱组</strong><span>德译故事集原图接入</span></header>
                <div>
                  {[
                    "译介主体结构演化图",
                    "译者身份时间河流",
                    "出版地图",
                    "取材来源地图",
                    "传播地图",
                    "文本词云与主题聚类",
                    "统计图表"
                  ].map((item) => (
                    <button
                      key={item}
                      type="button"
                      onClick={() => {
                        window.location.hash = "knowledge?domain=stories&submodule=stories-german-story-atlas";
                      }}
                    >
                      {item}
                    </button>
                  ))}
                </div>
              </article>
            </div>
          </section>
          <div className="lit-interaction-detail">{primaryInsight}</div>

          <DatasetTablePanel
            datasets={activeDatasets}
            selectedDatasetId={selectedDatasetId}
            onSelect={setSelectedDatasetId}
            loading={datasetLoading}
          />

          {showStoryCollectionAtlas && (
            <section className="lit-story-collection-atlas" id="lit-story-collection-atlas">
              <div className="lit-block-title">
                <span>专题图谱</span>
                <strong>百部德译故事集图谱已并入标准模块</strong>
              </div>
              <article className="work-panel">
                <p>原德译中国故事集与卫礼贤《中国民间童话》专题可视化已统一接入新的“百部德译故事集图谱”模块。</p>
                <button
                  type="button"
                  onClick={() => {
                    window.location.hash = "knowledge?domain=stories&submodule=stories-german-story-atlas";
                  }}
                >
                  前往百部德译故事集图谱
                </button>
              </article>
            </section>
          )}
        </section>

        <section className="lit-content-block">
          <VisualizationLayerWorkbench
            componentGroups={componentGroups}
            graph={graph}
            frequency={frequency}
            timeline={timeline}
            geography={geography}
            documents={sampleDocuments}
            moduleId={selectedModule.id}
            visualData={visualData}
          />
        </section>
      </main>
    </section>
  );
}
