import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useGlobalFilter } from "../context/GlobalFilterContext.jsx";
import storyData from "../data/storyCollections.json";
import { api } from "../services/api.js";
import AdvancedTextVisualWorkbench from "./AdvancedTextVisualWorkbench.jsx";
import StatisticsPanel from "./StatisticsPanel.jsx";
import StoryVisualAtlas from "./StoryVisualAtlas.jsx";

const ANCHORS = [
  ["linked-tables", "故事集与子故事"],
  ["identity", "译介主体与译者身份"],
  ["advanced-text", "文本分析"],
];

function textOf(value) {
  return String(value || "").trim();
}

function short(value, length = 38) {
  const text = textOf(value);
  return text.length > length ? `${text.slice(0, length - 1)}...` : text;
}

function rowTitle(record) {
  const raw = record?.raw || {};
  const system = record?.system || {};
  return textOf(record?.title || system.title || raw["故事集标题"] || raw.title || raw.name);
}

function collectionMatchesRecord(collection, record) {
  const title = rowTitle(record);
  if (!title) return false;
  return [collection.name, collection.foreignTitle, collection.chineseTitle]
    .filter(Boolean)
    .some((value) => {
      const candidate = textOf(value);
      return candidate === title || candidate.includes(title) || title.includes(candidate);
    });
}

function childRowsFor(collection) {
  if (!collection) return storyData.childStories || [];
  const ids = new Set(collection.matchedChildIds || []);
  return (storyData.childStories || []).filter(
    (child) => ids.has(child.id) || textOf(child.bookName) === textOf(collection.name),
  );
}

function collectionHash(id) {
  return `#knowledge?domain=stories&submodule=stories-german-story-atlas&collection=${encodeURIComponent(id)}`;
}

function collectionIdFromHash() {
  if (typeof window === "undefined") return "";
  const [, query = ""] = (window.location.hash || "").split("?");
  return new URLSearchParams(query).get("collection") || "";
}

function collectionToRecord(collection) {
  return {
    id: collection.id,
    title: collection.name,
    translator: collection.editor,
    publisher: collection.publisher,
    publish_year: collection.year,
    document_type: "故事集",
    collection: collection.name,
    source_place: collection.sourceRegion,
    raw: collection,
    system: {
      title: collection.name,
      translator: collection.editor,
      publisher: collection.publisher,
      publish_year: collection.yearText || collection.year,
      country: collection.country,
      city: collection.city,
      theme: collection.editorRole,
      content: collection.prefaceIntro || collection.prefaceText || "",
      source: collection.sourceRegion,
      notes: collection.chineseTitle,
    },
  };
}

function LinkedStoryTables({ selectedCollection, onSelect, onClear }) {
  const rootRef = useRef(null);
  const [query, setQuery] = useState("");
  const [childQuery, setChildQuery] = useState("");

  useEffect(() => {
    const root = rootRef.current;
    if (!root) return undefined;
    const handleNativeSelect = (event) => {
      const row = event.target.closest("[data-collection-id]");
      if (!row || !root.contains(row)) return;
      const collection = (storyData.collections || []).find((item) => item.id === row.dataset.collectionId);
      if (collection) onSelect(collection);
    };
    root.addEventListener("click", handleNativeSelect);
    return () => root.removeEventListener("click", handleNativeSelect);
  }, [onSelect]);

  const collections = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return storyData.collections || [];
    return (storyData.collections || []).filter((item) => [
      item.name,
      item.chineseTitle,
      item.editor,
      item.publisher,
      item.city,
      item.sourceRegion,
    ].some((value) => textOf(value).toLowerCase().includes(needle)));
  }, [query]);

  const childRows = useMemo(() => {
    const rows = childRowsFor(selectedCollection);
    const needle = childQuery.trim().toLowerCase();
    if (!needle) return rows;
    return rows.filter((item) => [
      item.canonicalName,
      item.variantName,
      item.ethnicity,
      item.bookName,
      item.publisher,
      item.country,
    ].some((value) => textOf(value).toLowerCase().includes(needle)));
  }, [selectedCollection, childQuery]);

  const childTitle = selectedCollection
    ? `${selectedCollection.name} · 匹配 ${childRows.length} 条子故事`
    : `全部子故事 · ${childRows.length} 条`;

  return (
    <section id="german-story-atlas-linked-tables" className="german-story-linked-tables" ref={rootRef}>
      <div className="german-linked-panel">
        <header>
          <div>
            <strong>故事集总表</strong>
            <span>点击故事集，嵌套子故事表与下方图表同步切换。</span>
          </div>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="检索故事集、译者、出版社..."
          />
        </header>
        <div className="kb-table-wrap nested-table-wrap german-master-table-wrap">
          <table className="kb-table story-table german-linked-table">
            <thead>
              <tr>
                <th>选择</th>
                <th>故事集名称</th>
                <th>年份</th>
                <th>译者/编者</th>
                <th>身份</th>
                <th>出版地/出版社</th>
                <th>子故事数</th>
              </tr>
            </thead>
            <tbody>
              {collections.map((item) => {
                const active = selectedCollection?.id === item.id;
                return (
                  <tr className={active ? "selected" : ""} key={item.id} data-collection-id={item.id} onClick={() => onSelect(item)}>
                    <td>
                      <input
                        aria-label={`选择 ${item.name}`}
                        checked={active}
                        name="german-story-collection"
                        onChange={() => onSelect(item)}
                        onClick={(event) => { event.stopPropagation(); onSelect(item); }}
                        onFocus={() => onSelect(item)}
                        onPointerDown={() => onSelect(item)}
                        type="radio"
                      />
                    </td>
                    <td>
                      <a className="german-collection-select" href={collectionHash(item.id)} onClick={() => onSelect(item)}>
                        <strong>{item.name}</strong>
                        <small>{item.chineseTitle}</small>
                      </a>
                    </td>
                    <td>{item.yearText || item.year}</td>
                    <td>{item.editor || "未记录"}</td>
                    <td>{item.editorRole || "未记录"}</td>
                    <td>{[item.city, item.publisher].filter(Boolean).join(" · ") || "未记录"}</td>
                    <td><strong>{item.declaredChildCount || item.matchedChildIds?.length || 0}</strong><small>匹配 {item.matchedChildIds?.length || 0}</small></td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      <div className="german-linked-panel">
        <header>
          <div>
            <strong>嵌套子故事表</strong>
            <span>{childTitle}</span>
          </div>
          <div className="german-linked-actions">
            <input
              value={childQuery}
              onChange={(event) => setChildQuery(event.target.value)}
              placeholder="检索子故事、母题、来源..."
            />
            {selectedCollection && <button type="button" onClick={onClear}>清除选择</button>}
          </div>
        </header>
        <div className="kb-table-wrap nested-table-wrap german-child-table-wrap">
          <table className="kb-table story-table german-linked-table">
            <thead>
              <tr>
                <th>规范故事名</th>
                <th>子故事标题</th>
                <th>出版时间</th>
                <th>语种</th>
                <th>文献载体</th>
                <th>图书/出处</th>
                <th>民族/地区/出版社</th>
              </tr>
            </thead>
            <tbody>
              {childRows.map((item) => (
                <tr key={item.id}>
                  <td><strong>{item.canonicalName || "未记录"}</strong></td>
                  <td>{item.variantName || "未记录"}</td>
                  <td>{item.yearText || item.year || "未记录"}</td>
                  <td>{item.language || "未记录"}</td>
                  <td>{item.carrier || "未记录"}</td>
                  <td><strong>{short(item.bookName, 42)}</strong></td>
                  <td>{[item.ethnicity, item.country, item.publisher].filter(Boolean).join(" · ") || "未记录"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  );
}

export default function GermanStoryAtlasWorkbench({ component, region = "all", documentId = "" }) {
  const { state, dispatch } = useGlobalFilter();
  const didMountResetRef = useRef(false);
  const advancedRequestRef = useRef(0);
  const advancedWarmupRef = useRef(new Set());
  const advancedInitialLoadRef = useRef(false);
  const [selectedId, setSelectedId] = useState(() => collectionIdFromHash());
  const [advancedPayload, setAdvancedPayload] = useState(null);
  const [advancedLoading, setAdvancedLoading] = useState(false);
  const [advancedError, setAdvancedError] = useState("");
  const [advancedScope, setAdvancedScope] = useState("single");
  const [advancedMethod, setAdvancedMethod] = useState("topic-clustering-map");
  const [advancedTopicCount, setAdvancedTopicCount] = useState(18);
  const selectedCollection = useMemo(
    () => (storyData.collections || []).find((item) => item.id === selectedId) || null,
    [selectedId],
  );
  const selectedCollectionRecords = useMemo(
    () => (selectedCollection ? [collectionToRecord(selectedCollection)] : undefined),
    [selectedCollection],
  );

  useEffect(() => {
    const record = state.analysisRecords?.length === 1 ? state.analysisRecords[0] : null;
    if (!record) {
      if (!collectionIdFromHash()) setSelectedId("");
      return;
    }
    const match = (storyData.collections || []).find((item) => collectionMatchesRecord(item, record));
    if (match) setSelectedId(match.id);
  }, [state.analysisRecords]);

  useEffect(() => {
    if (!didMountResetRef.current) {
      didMountResetRef.current = true;
      return;
    }
    setSelectedId("");
  }, [state.selectionResetToken]);

  function scrollToAnchor(anchor) {
    document
      .getElementById(`german-story-atlas-${anchor}`)
      ?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  const selectCollection = useCallback((collection) => {
    setSelectedId(collection.id);
    const record = collectionToRecord(collection);
    dispatch({ type: "setAnalysisRecordIds", ids: [collection.id] });
    dispatch({ type: "setAnalysisRecords", records: [record] });
  }, [dispatch]);

  function clearSelection() {
    setSelectedId("");
    dispatch({ type: "clearAnalysisSelection" });
  }

  const loadAdvancedText = useCallback((nextScope = advancedScope, nextMethod = advancedMethod, nextDocumentId = "", nextTopicCount = advancedTopicCount) => {
    const requestId = advancedRequestRef.current + 1;
    advancedRequestRef.current = requestId;
    const resolvedDocumentId = nextScope === "single"
      ? (nextDocumentId || documentId || advancedPayload?.selectedDocument?.id || "")
      : "";
    setAdvancedScope(nextScope);
    setAdvancedMethod(nextMethod);
    setAdvancedTopicCount(nextTopicCount);
    setAdvancedLoading(true);
    setAdvancedError("");
    api.germanStoryCorpusAdvanced({
      documentId: resolvedDocumentId,
      methodId: nextMethod,
      scope: nextScope,
      topicCount: nextTopicCount,
    })
      .then((payload) => {
        if (advancedRequestRef.current !== requestId) return;
        setAdvancedPayload(payload);
      })
      .catch((error) => {
        if (advancedRequestRef.current !== requestId) return;
        setAdvancedError(error.message || String(error));
      })
      .finally(() => {
        if (advancedRequestRef.current !== requestId) return;
        setAdvancedLoading(false);
      });
  }, [advancedMethod, advancedPayload?.selectedDocument?.id, advancedScope, advancedTopicCount, documentId]);

  useEffect(() => {
    if (!["all", "text"].includes(region)) return;
    if (advancedInitialLoadRef.current) return;
    advancedInitialLoadRef.current = true;
    loadAdvancedText("single", advancedMethod, documentId, advancedTopicCount);
  }, [advancedMethod, advancedTopicCount, documentId, loadAdvancedText, region]);

  useEffect(() => {
    if (!documentId || advancedScope !== "single" || !advancedPayload) return;
    const currentId = advancedPayload?.selectedDocument?.id || "";
    if (currentId && currentId !== documentId) {
      loadAdvancedText("single", advancedMethod, documentId, advancedTopicCount);
    }
  }, [advancedMethod, advancedPayload, advancedScope, advancedTopicCount, documentId, loadAdvancedText]);

  useEffect(() => {
    if (advancedScope !== "single" || !advancedPayload) return;
    const selectedDocumentId = advancedPayload?.selectedDocument?.id || documentId || "";
    if (!selectedDocumentId) return;
    const key = `${selectedDocumentId}:${advancedTopicCount}`;
    if (advancedWarmupRef.current.has(key)) return;
    advancedWarmupRef.current.add(key);
    const timer = window.setTimeout(() => {
      api.warmGermanStoryCorpusAdvanced({
        documentId: selectedDocumentId,
        scope: "single",
        topicCount: advancedTopicCount,
      }).catch((error) => {
        console.warn("German story advanced warmup failed", error);
      });
    }, 2200);
    return () => window.clearTimeout(timer);
  }, [advancedPayload, advancedScope, advancedTopicCount, documentId]);

  useEffect(() => {
    if (advancedScope !== "global" || !advancedPayload) return;
    const key = `global:${advancedTopicCount}`;
    if (advancedWarmupRef.current.has(key)) return;
    advancedWarmupRef.current.add(key);
    const timer = window.setTimeout(() => {
      api.warmGermanStoryCorpusAdvanced({
        scope: "global",
        topicCount: advancedTopicCount,
      }).catch((error) => {
        console.warn("German story global advanced warmup failed", error);
      });
    }, 1200);
    return () => window.clearTimeout(timer);
  }, [advancedPayload, advancedScope, advancedTopicCount]);

  useEffect(() => {
    const applyCollectionFromHash = () => {
      const id = collectionIdFromHash();
      if (!id) return;
      const collection = (storyData.collections || []).find((item) => item.id === id);
      if (collection) selectCollection(collection);
    };
    applyCollectionFromHash();
    window.addEventListener("hashchange", applyCollectionFromHash);
    return () => window.removeEventListener("hashchange", applyCollectionFromHash);
  }, [selectCollection]);

  useEffect(() => {
    if (!collectionIdFromHash() || !selectedCollection) return;
    const currentId = state.analysisRecords?.length === 1 ? state.analysisRecords[0]?.id : "";
    if (String(currentId) !== String(selectedCollection.id)) {
      selectCollection(selectedCollection);
    }
  }, [selectedCollection, selectCollection, state.analysisRecords]);

  const tables = (
    <LinkedStoryTables selectedCollection={selectedCollection} onSelect={selectCollection} onClear={clearSelection} />
  );
  const textAnalysis = (
    <div id="german-story-atlas-advanced-text" className="german-story-atlas-section">
      <AdvancedTextVisualWorkbench
        activeMethod={advancedMethod}
        chartHeight={680}
        chartPrefix="german-story-corpus"
        corpusTitle={advancedPayload?.corpusTitle || "百部德译故事集"}
        error={advancedError}
        loading={advancedLoading}
        onGenerate={loadAdvancedText}
        payload={advancedPayload}
        scope={advancedScope}
        setActiveMethod={setAdvancedMethod}
        setScope={setAdvancedScope}
        setTopicCount={setAdvancedTopicCount}
        title="百部德译故事集文本分析"
        topicCount={advancedTopicCount}
      />
    </div>
  );
  const visualPanels = (
    <>
      <div id="german-story-atlas-identity" className="german-story-atlas-section german-story-identity-panel">
        <StoryVisualAtlas mode="identity" focusedRecords={selectedCollectionRecords} />
      </div>
      <div className="kb-stats-bottom kb-anchor-target german-story-statistics-panel">
        <StatisticsPanel items={storyData.collections || []} title="百部德译故事集专题统计可视化" />
      </div>
    </>
  );
  const showToolbar = region === "all";
  return (
    <section className={`platform-special-workbench german-story-atlas german-story-${region}-region`} style={{ "--span": component?.span || 24 }}>
      {showToolbar && (
        <header className="german-story-atlas-toolbar">
          <strong>百部德译故事集图谱</strong>
          <nav aria-label="德译故事图谱导航">
            {ANCHORS.map(([anchor, label]) => (
              <button key={anchor} type="button" onClick={() => scrollToAnchor(anchor)}>
                {label}
              </button>
            ))}
          </nav>
        </header>
      )}
      {(region === "all" || region === "table") && tables}
      {(region === "all" || region === "visual") && visualPanels}
      {(region === "all" || region === "text") && textAnalysis}
    </section>
  );
}
