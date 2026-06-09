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

  return (
    <section className="graph-page">
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
