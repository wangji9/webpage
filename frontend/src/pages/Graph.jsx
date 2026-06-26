import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api.js";
import { mockKnowledgeItems, mockMapFlows } from "../data/mockData.js";
import storyData from "../data/storyCollections.json";
import GraphCanvas from "../components/GraphCanvas.jsx";
import SplitFlowMap from "../components/SplitFlowMap.jsx";
import StatisticsPanel from "../components/StatisticsPanel.jsx";

function graphWithItems(graph, items) {
  if (!graph) return null;
  const itemNodes = items.map((item, index) => ({
    id: `item-${item.id}`,
    label: item.translatedTitle.length > 18 ? `${item.canonicalTitle}·${item.year}` : item.translatedTitle,
    type: item.resourceType,
    section: item.sectionId,
    year: item.year,
    lang: item.language,
    x: 0.12 + ((index * 37) % 78) / 100,
    y: 0.16 + ((index * 29) % 72) / 100,
    size: 10 + (item.status === "通过" ? 2 : 0)
  }));
  const itemEdges = items.flatMap((item) => (item.graphNodeIds || []).slice(0, 2).map((nodeId) => ({
    from: nodeId,
    to: `item-${item.id}`,
    relation: item.resourceType,
    note: `${item.canonicalTitle}上传条目`
  })));
  return { nodes: [...graph.nodes, ...itemNodes], edges: [...graph.edges, ...itemEdges] };
}

export default function Graph({ sections }) {
  const [graph, setGraph] = useState(null);
  const [items, setItems] = useState([]);
  const [error, setError] = useState("");
  const [sectionId, setSectionId] = useState("stories");
  const [collectionId, setCollectionId] = useState(storyData.collections[0]?.id || "");
  const [storyGraph, setStoryGraph] = useState(null);
  const [storyError, setStoryError] = useState("");

  useEffect(() => {
    api.graph().then(setGraph).catch((err) => setError(err.message));
    api.knowledgeItems().then((data) => setItems(data.items)).catch(() => setItems(mockKnowledgeItems));
  }, []);

  useEffect(() => {
    if (sectionId !== "stories" || !collectionId) return;
    let canceled = false;
    setStoryError("");
    api.storyCollectionGraph(collectionId)
      .then((data) => { if (!canceled) setStoryGraph(data); })
      .catch((err) => { if (!canceled) setStoryError(err.message); });
    return () => { canceled = true; };
  }, [collectionId, sectionId]);

  const selectedCollection = storyGraph?.collection || storyData.collections.find((item) => item.id === collectionId) || storyData.collections[0];
  const selectedChildren = storyGraph?.children || [];
  const selectedFlow = storyGraph?.flow || storyData.flows.find((flow) => flow.id === selectedCollection?.id);
  const visibleItems = useMemo(() => items.filter((item) => item.sectionId === sectionId), [items, sectionId]);
  const visibleFlows = useMemo(() => mockMapFlows.filter((flow) => flow.sectionId === sectionId), [sectionId]);
  const visualGraph = useMemo(() => sectionId === "stories" ? storyGraph?.graph : graphWithItems(graph, visibleItems), [graph, sectionId, storyGraph, visibleItems]);
  const focusNodeIds = useMemo(() => sectionId === "stories" ? [`collection-${selectedCollection?.id}`] : visibleItems.flatMap((item) => item.graphNodeIds).slice(0, 9), [sectionId, selectedCollection, visibleItems]);
  const statsItems = sectionId === "stories"
    ? selectedChildren.map((item) => ({ ...item, country: item.country || item.nationality, translator: item.translator || item.editor }))
    : visibleItems;
  const selectedSection = sections.find((section) => section.id === sectionId) || (sectionId === "stories" ? { title: "多语种中国故事集" } : null);
  const activeFlows = sectionId === "stories" ? (selectedFlow ? [selectedFlow] : []) : visibleFlows;
  const fallbackStoryCount = selectedCollection?.matchedChildIds?.length || selectedCollection?.declaredChildCount || 0;
  const analysisItemCount = statsItems.length || (sectionId === "stories" ? fallbackStoryCount : visibleItems.length);
  const graphNodeCount = visualGraph?.nodes?.length || (sectionId === "stories" ? analysisItemCount + (selectedCollection ? 1 : 0) : visibleItems.length);
  const graphEdgeCount = visualGraph?.edges?.length || (sectionId === "stories" ? analysisItemCount : visibleItems.reduce((sum, item) => sum + (item.graphNodeIds?.length || 0), 0));
  const graphCapabilities = ["实体关系抽取", "跨表节点联结", "传播路径映射", "子图聚焦分析", "统计图表联动", "研究线索发现"];
  const graphMetrics = [
    ["图谱节点", graphNodeCount],
    ["关系边", graphEdgeCount],
    ["分析条目", analysisItemCount],
    ["传播路径", activeFlows.length],
  ];

  return (
    <section className="graph-page">
      <header className="graph-page-title">
        <div className="graph-title-main">
          <span className="graph-title-kicker">Knowledge Graph</span>
          <strong>知识图谱</strong>
          <p>面向译介文献、故事集、子故事、译者机构与传播地点的关系网络分析工作台，支持实体关系浏览、路径追踪、子图聚焦、地图联动与统计解释。</p>
          <div className="graph-title-context" aria-label="当前图谱上下文">
            <span><b>当前范围</b>{selectedSection?.title || "待选择"}</span>
            {sectionId === "stories" && <span><b>当前故事集</b>{selectedCollection?.chineseTitle || selectedCollection?.name || "待选择"}</span>}
          </div>
          <div className="graph-title-tags" aria-label="图谱分析能力">
            {graphCapabilities.map((item) => <span key={item}>{item}</span>)}
          </div>
        </div>
        <dl className="graph-title-metrics">
          {graphMetrics.map(([label, value]) => (
            <div key={label}><dt>{label}</dt><dd>{value}</dd></div>
          ))}
        </dl>
      </header>
      {error && <div className="alert">{error}</div>}
      {storyError && <div className="alert">{storyError}</div>}
      <div className="work-panel graph-query-panel graph-specific-controls">
        <label>图谱范围
          <select value={sectionId} onChange={(event) => setSectionId(event.target.value)}>
            {sections.map((section) => <option key={section.id} value={section.id}>{section.title}</option>)}
          </select>
        </label>
        {sectionId === "stories" && (
          <label>故事集
            <select value={collectionId} onChange={(event) => setCollectionId(event.target.value)}>
              {storyData.collections.map((collection) => (
                <option key={collection.id} value={collection.id}>{collection.yearText} · {collection.name}</option>
              ))}
            </select>
          </label>
        )}
      </div>

      <div className="graph-visual-layout">
        {visualGraph && (
          <GraphCanvas
            graph={visualGraph}
            sections={sections}
            focusNodeIds={focusNodeIds}
            initialFilter={sectionId}
            title={sectionId === "stories" ? `${selectedCollection?.chineseTitle || "故事集"}知识图谱` : `${sections.find((section) => section.id === sectionId)?.title || "知识库"}关系网络`}
          />
        )}
        {sectionId === "stories"
          ? <SplitFlowMap flows={selectedFlow ? [selectedFlow] : []} selectedId={selectedFlow?.id} title={`${selectedCollection?.chineseTitle || "故事集"}传播路径图`} timeline />
          : <SplitFlowMap flows={visibleFlows} title="上传数据传播路径图" timeline />}
      </div>

      <StatisticsPanel items={statsItems} title={sectionId === "stories" ? `${selectedCollection?.chineseTitle || "故事集"}统计可视化` : "分库统计可视化"} />
    </section>
  );
}
