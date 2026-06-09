import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api.js";
import { mockKnowledgeItems, mockMapFlows } from "../data/mockData.js";
import SplitFlowMap from "../components/SplitFlowMap.jsx";
import StatisticsPanel from "../components/StatisticsPanel.jsx";
import StoryCollectionResearch from "../components/StoryCollectionResearch.jsx";

const sectionMeta = {
  stories: { title: "多语种中国故事集", keywords: "真实数据 / 故事集 / 子故事 / 序跋", tone: "stories" }
};

function normalizeSections(sections) {
  const actualSections = sections.length ? sections : [{
    id: "stories",
    title: "多语种中国故事集",
    color: "#15a884",
    keywords: ["真实数据", "故事集", "子故事", "序跋"]
  }];
  return actualSections.map((section) => {
    const meta = sectionMeta[section.id] || {
      title: section.title,
      keywords: Array.isArray(section.keywords) ? section.keywords.join(" / ") : "真实数据",
      tone: "stories"
    };
    return {
      ...section,
      ...meta,
      color: section.color || "#15a884",
      title: section.title || meta.title,
      keywords: Array.isArray(section.keywords) ? section.keywords.join(" / ") : meta.keywords
    };
  });
}

function downloadCsv(filename, rows) {
  const blob = new Blob([rows.join("\n")], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export default function Knowledge({ sections = [] }) {
  const normalizedSections = useMemo(() => normalizeSections(sections), [sections]);
  const [items, setItems] = useState([]);
  const [selectedId, setSelectedId] = useState("stories");
  const [query, setQuery] = useState("");

  useEffect(() => {
    api.knowledgeItems().then((data) => setItems(data.items || [])).catch(() => setItems(mockKnowledgeItems));
  }, []);

  const selected = normalizedSections.find((item) => item.id === selectedId) || normalizedSections[0];
  const sectionItems = useMemo(() => items.filter((item) => item.sectionId === selectedId), [items, selectedId]);
  const filtered = useMemo(() => {
    const text = query.trim().toLowerCase();
    if (!text) return sectionItems;
    return sectionItems.filter((item) => [item.canonicalTitle, item.translatedTitle, item.translator, item.country, item.language, item.publisher].join(" ").toLowerCase().includes(text));
  }, [query, sectionItems]);
  const flows = useMemo(() => mockMapFlows.filter((flow) => flow.sectionId === selectedId), [selectedId]);

  function exportTable() {
    const rows = [
      "资源类型,规范名,译名/变体名,出版地,年份,语种,作者/译者,出版社",
      ...filtered.map((item) => [item.resourceType, item.canonicalTitle, item.translatedTitle, `${item.city || ""} ${item.country || ""}`, item.year, item.language, item.translator || item.author, item.publisher].map((value) => `"${String(value || "").replaceAll("\"", "\"\"")}"`).join(","))
    ];
    downloadCsv(`${selected.title}数据.csv`, rows);
  }

  return (
    <section className={`knowledge-dashboard product-workspace section-style-${selected.tone}`}>
      <div className="work-panel kb-section-tabs differentiated-tabs">
        {normalizedSections.map((section) => (
          <button className={section.id === selectedId ? "active" : ""} key={section.id} type="button" onClick={() => setSelectedId(section.id)}>
            <span>{section.title}</span>
            <small>{section.keywords}</small>
          </button>
        ))}
      </div>

      {selectedId === "stories" ? (
        <StoryCollectionResearch />
      ) : (
        <>
          <div className="kb-kpi-row">
            <div><b>{sectionItems.length}</b><span>上传条目</span></div>
            <div><b>{sectionItems.filter((item) => item.status === "通过" || item.status === "閫氳繃").length}</b><span>已审核</span></div>
            <div><b>{new Set(sectionItems.map((item) => item.language)).size}</b><span>语种</span></div>
            <div><b>{new Set(sectionItems.map((item) => item.country)).size}</b><span>国家/地区</span></div>
          </div>

          <div className="work-panel kb-controls aligned-controls">
            <label>关键词
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="题名、译者、出版社、国家、语种" />
            </label>
            <button type="button" onClick={exportTable}>导出列表</button>
          </div>

          <div className="kb-data-grid">
            <div className="work-panel kb-table-panel">
              <div className="panel-title-row">
                <div><strong>{selected.title}数据列表</strong><span>{filtered.length} 条匹配记录</span></div>
              </div>
              <div className="kb-table-wrap">
                <table className="kb-table">
                  <thead>
                    <tr>
                      <th>资源类型</th>
                      <th>规范名</th>
                      <th>译名/变体名</th>
                      <th>出版地</th>
                      <th>年份</th>
                      <th>语种</th>
                      <th>作者/译者</th>
                      <th>出版社</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filtered.map((item) => (
                      <tr key={item.id}>
                        <td>{item.resourceType}</td>
                        <td>{item.canonicalTitle}</td>
                        <td>{item.translatedTitle}</td>
                        <td>{item.city} · {item.country}</td>
                        <td>{item.year}</td>
                        <td>{item.language}</td>
                        <td>{item.translator || item.author}</td>
                        <td>{item.publisher}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
            <aside className="work-panel record-detail section-research-note">
              <strong>{selected.title}</strong>
              <h3>{selected.keywords}</h3>
              <p>当前分库只展示真实表格生成的数据，可视化侧重故事集、子故事、序跋、译者/编者、出版机构和传播路径之间的关系。</p>
            </aside>
          </div>

          <div className="kb-visual-grid">
            <SplitFlowMap flows={flows} title={`${selected.title}传播路径图`} timeline />
            <StatisticsPanel items={sectionItems} title={`${selected.title}统计可视化`} />
          </div>
        </>
      )}
    </section>
  );
}
