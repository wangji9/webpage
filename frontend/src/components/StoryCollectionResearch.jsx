import { useMemo, useState } from "react";
import storyData from "../data/storyCollections.json";
import StatisticsPanel from "./StatisticsPanel.jsx";
import StoryVisualAtlas from "./StoryVisualAtlas.jsx";
import { loadPrefaces, parseTableFile, pickField, savePrefaces } from "../utils/localKnowledgeStore.js";

function value(text) {
  return text || "未记录";
}

function includesText(row, query) {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return [row.name, row.editor, row.editorRole, row.prefaceAuthor, row.publisher, row.foreignTitle, row.chineseTitle].join(" ").toLowerCase().includes(q);
}

function downloadJson() {
  const blob = new Blob([JSON.stringify(storyData, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = "多语种中国故事集数据库.json";
  link.click();
  URL.revokeObjectURL(url);
}

function builtInPrefaces() {
  return Object.fromEntries((storyData.prefaces || [])
    .filter((item) => item.collectionId && item.text)
    .map((item) => [item.collectionId, {
      text: item.text,
      filename: "中国故事集_序跋.xlsx",
      author: item.author,
      updatedAt: item.yearText || "未记录年份",
      sourceTitle: item.collectionTitle,
      year: item.year,
      type: item.type,
      intro: item.intro
    }]));
}

function short(text, limit = 18) {
  const value = String(text || "未记录");
  return value.length > limit ? `${value.slice(0, limit - 1)}…` : value;
}

function normalizeTitle(text) {
  return String(text || "")
    .toLowerCase()
    .replace(/[《》（）()""''“”‘’\s:：,，.;；·-]/g, "");
}

function decadeLabel(year) {
  const value = Number(year);
  if (!value) return "未知";
  return `${Math.floor(value / 10) * 10}s`;
}

function countBy(rows, keyGetter, limit = 8) {
  const counts = new Map();
  rows.forEach((row) => {
    const key = keyGetter(row) || "未记录";
    counts.set(key, (counts.get(key) || 0) + 1);
  });
  return [...counts.entries()].sort((a, b) => b[1] - a[1]).slice(0, limit);
}

function matchCollection(row, collections, fallback) {
  const title = pickField(row, ["故事集名称", "图书/期刊名", "书名", "题名", "标题", "title", "name"]);
  const normalized = normalizeTitle(title);
  if (!normalized) return fallback;
  return collections.find((item) => {
    const names = [item.name, item.chineseTitle, item.foreignTitle].map(normalizeTitle);
    return names.some((name) => name.includes(normalized) || normalized.includes(name));
  }) || fallback;
}

function extractPrefaceText(row) {
  return pickField(row, ["序跋中文", "中文序跋", "序跋", "序言", "前言", "跋", "内容", "文本", "text", "preface"]);
}

function ResearchInsights({ collections, children }) {
  const rolePublisher = useMemo(() => {
    const rows = collections.map((item) => ({
      role: item.editorRole || "未记录",
      publisher: (item.publisher || "未记录").split(":").pop().trim().slice(0, 42),
      count: item.declaredChildCount || item.matchedChildIds.length || 1
    }));
    return rows.slice(0, 14);
  }, [collections]);
  const motifLanguage = useMemo(() => {
    const grouped = new Map();
    children.forEach((item) => {
      if (!item.canonicalName || !item.language) return;
      const key = `${item.canonicalName}|${item.language}`;
      grouped.set(key, (grouped.get(key) || 0) + 1);
    });
    return [...grouped.entries()].sort((a, b) => b[1] - a[1]).slice(0, 16).map(([key, count]) => {
      const [motif, language] = key.split("|");
      return { motif, language, count };
    });
  }, [children]);
  const prefaceNetwork = useMemo(() => collections.filter((item) => item.prefaceAuthor && item.prefaceAuthor !== "/").slice(0, 10), [collections]);

  return (
    <div className="work-panel research-insight-panel">
      <div className="panel-title-row">
        <div><strong>研究关系可视化</strong><span>译者身份、出版社、母题、语种与序跋作者的关系。</span></div>
      </div>
      <svg viewBox="0 0 840 520" className="research-insight-svg" role="img" aria-label="研究关系可视化">
        <g transform="translate(34 52)">
          <text className="chart-title small-title" x="0" y="-18">译者身份 × 出版社</text>
          {rolePublisher.slice(0, 9).map((item, index) => {
            const y = index * 34;
            const width = Math.min(260, 46 + item.count * 0.36);
            return (
              <g key={`${item.role}-${index}`} transform={`translate(0 ${y})`}>
                <text className="chart-axis research-axis" x="0" y="18">{short(item.role, 10)}</text>
                <rect x="116" y="4" width={width} height="18" rx="4" fill="#15a884" />
                <text className="chart-axis research-axis" x={126 + width} y="18">{short(item.publisher, 22)}</text>
              </g>
            );
          })}
        </g>
        <g transform="translate(500 52)">
          <text className="chart-title small-title" x="0" y="-18">母题 × 语种变体</text>
          {motifLanguage.slice(0, 12).map((item, index) => {
            const x = (index % 4) * 82;
            const y = Math.floor(index / 4) * 86;
            return (
              <g key={`${item.motif}-${item.language}`} transform={`translate(${x} ${y})`}>
                <circle cx="32" cy="26" r={14 + Math.min(24, item.count * 1.05)} fill={["#0b66b2", "#15a884", "#f59e0b", "#7c3aed"][index % 4]} opacity="0.86" />
                <text className="chart-axis tiny-label" x="32" y="74" textAnchor="middle">{short(item.motif, 5)}</text>
                <text className="chart-value small" x="32" y="31" textAnchor="middle" fill="#fff">{item.count}</text>
              </g>
            );
          })}
        </g>
        <g transform="translate(34 420)">
          <text className="chart-title small-title" x="0" y="-18">序跋作者 × 故事集</text>
          {prefaceNetwork.map((item, index) => {
            const x = index * 78;
            return (
              <g key={item.id} transform={`translate(${x} 0)`}>
                <line x1="20" x2="20" y1="-4" y2="46" stroke="#9fb7d0" strokeWidth="1.5" />
                <circle cx="20" cy="0" r="10" fill="#0b66b2" />
                <circle cx="20" cy="46" r="12" fill="#f59e0b" />
                <text className="chart-axis tiny-label" x="20" y="78" textAnchor="middle">{item.year}</text>
              </g>
            );
          })}
        </g>
      </svg>
    </div>
  );
}

function PrefaceVisuals({ collections, prefaces, onUpload, onPreview }) {
  const uploaded = useMemo(() => Object.entries(prefaces).map(([collectionId, preface]) => {
    const collection = collections.find((item) => item.id === collectionId);
    return { collectionId, collection, ...preface };
  }).filter((item) => item.collection), [collections, prefaces]);
  const knownPrefaceRows = useMemo(() => collections.filter((item) => item.prefaceAuthor && item.prefaceAuthor !== "/"), [collections]);
  const authorTop = useMemo(() => countBy(knownPrefaceRows, (item) => item.prefaceAuthor, 8), [knownPrefaceRows]);
  const decadeTop = useMemo(() => countBy(knownPrefaceRows, (item) => decadeLabel(item.year), 8), [knownPrefaceRows]);
  const maxAuthor = Math.max(1, ...authorTop.map(([, count]) => count));
  const maxDecade = Math.max(1, ...decadeTop.map(([, count]) => count));

  return (
    <div className="preface-layout">
      <div className="work-panel preface-visual-panel">
        <div className="panel-title-row">
          <div>
            <strong>德译中国故事集序跋辑录</strong>
            <span>已上传 {uploaded.length} 份；总表中可识别序跋作者 {knownPrefaceRows.length} 条。</span>
          </div>
          <label className="upload-button compact-upload">上传序跋表
            <input type="file" accept=".txt,.md,.csv,.tsv,.json,.xlsx,.xls" onChange={onUpload} />
          </label>
        </div>
        <svg viewBox="0 0 1040 420" className="preface-svg" role="img" aria-label="德译中国故事集序跋辑录">
          <rect width="1040" height="420" fill="#fff" />
          <g transform="translate(48 58)">
            <text className="chart-title" x="0" y="-20">序跋作者分布</text>
            {authorTop.map(([name, count], index) => (
              <g key={name} transform={`translate(0 ${index * 38})`}>
                <text className="chart-axis" x="0" y="18">{short(name, 16)}</text>
                <rect x="172" y="4" width="300" height="18" rx="4" fill="#eaf2fb" />
                <rect x="172" y="4" width={(count / maxAuthor) * 300} height="18" rx="4" fill={index % 2 ? "#15a884" : "#0b66b2"} />
                <text className="chart-value small" x={182 + (count / maxAuthor) * 300} y="18">{count}</text>
              </g>
            ))}
          </g>
          <g transform="translate(610 58)">
            <text className="chart-title" x="0" y="-20">序跋时间分布</text>
            {decadeTop.map(([name, count], index) => {
              const h = (count / maxDecade) * 210;
              const x = index * 48;
              return (
                <g key={name} transform={`translate(${x} 230)`}>
                  <rect className="chart-bar" x="6" y={-h} width="26" height={h} />
                  <text className="chart-value small" x="19" y={-h - 8} textAnchor="middle">{count}</text>
                  <text className="chart-axis rotated-axis" x="19" y="30" textAnchor="end" transform="rotate(-45 19 30)">{name}</text>
                </g>
              );
            })}
          </g>
        </svg>
      </div>
      <div className="work-panel preface-list-panel">
        <div className="panel-title-row">
          <div><strong>序跋预览</strong><span>上传后可点击打开独立预览窗口。</span></div>
        </div>
        <div className="preface-upload-list">
          {uploaded.length ? uploaded.slice(0, 12).map((item) => (
            <button key={item.collectionId} type="button" onClick={() => onPreview(item.collection)}>
              <span>{item.collection.name}</span>
              <small>{item.filename || "本地序跋"} · {item.updatedAt}</small>
            </button>
          )) : <p>当前还没有本地序跋文本。可以在右侧当前样本或这里批量上传。</p>}
        </div>
      </div>
    </div>
  );
}

function ChildStoryVisuals({ children }) {
  const motifTop = useMemo(() => countBy(children, (item) => item.canonicalName, 10), [children]);
  const translatorTop = useMemo(() => countBy(children, (item) => item.translator, 8), [children]);
  const countryTop = useMemo(() => countBy(children, (item) => item.country || item.nationality, 8), [children]);
  const maxMotif = Math.max(1, ...motifTop.map(([, count]) => count));
  const maxTranslator = Math.max(1, ...translatorTop.map(([, count]) => count));

  return (
    <div className="work-panel child-visual-panel">
      <div className="panel-title-row">
        <div>
          <strong>子故事知识图谱</strong>
          <span>基于 {children.length} 条子故事，展示母题、译者与出版地区关系。</span>
        </div>
      </div>
      <svg viewBox="0 0 1120 500" className="child-research-svg" role="img" aria-label="子故事知识图谱">
        <rect width="1120" height="500" fill="#fff" />
        <g transform="translate(56 66)">
          <text className="chart-title" x="0" y="-24">故事母题高频</text>
          {motifTop.slice(0, 10).map(([name, count], index) => {
            const x = (index % 5) * 122;
            const y = Math.floor(index / 5) * 150;
            return (
              <g key={name} transform={`translate(${x} ${y})`}>
                <circle cx="46" cy="44" r={18 + (count / maxMotif) * 32} fill={["#0b66b2", "#15a884", "#f59e0b", "#7c3aed", "#ef4444"][index % 5]} opacity="0.84" />
                <text className="chart-value" x="46" y="51" textAnchor="middle" fill="#fff">{count}</text>
                <text className="chart-axis" x="46" y="112" textAnchor="middle">{short(name, 7)}</text>
              </g>
            );
          })}
        </g>
        <g transform="translate(700 66)">
          <text className="chart-title" x="0" y="-24">译者 / 编者贡献</text>
          {translatorTop.slice(0, 7).map(([name, count], index) => (
            <g key={name} transform={`translate(0 ${index * 46})`}>
              <text className="chart-axis" x="0" y="18">{short(name, 18)}</text>
              <rect x="210" y="3" width="250" height="18" rx="4" fill="#eaf2fb" />
              <rect x="210" y="3" width={(count / maxTranslator) * 250} height="18" rx="4" fill={index % 2 ? "#15a884" : "#0b66b2"} />
              <text className="chart-value small" x={220 + (count / maxTranslator) * 250} y="18">{count}</text>
            </g>
          ))}
        </g>
        <g transform="translate(700 420)">
          {countryTop.slice(0, 6).map(([name, count], index) => (
            <g key={name} transform={`translate(${index * 66} 0)`}>
              <circle cx="22" cy="0" r={9 + count * 0.012} fill={["#0b66b2", "#15a884", "#f59e0b", "#7c3aed", "#ef4444", "#0891b2"][index % 6]} />
              <text className="chart-axis tiny-label" x="22" y="34" textAnchor="middle">{short(name, 4)}</text>
            </g>
          ))}
        </g>
      </svg>
    </div>
  );
}

export default function StoryCollectionResearch() {
  const [query, setQuery] = useState("");
  const [selectedId, setSelectedId] = useState(storyData.collections[0]?.id || "");
  const [childLimit, setChildLimit] = useState(24);
  const [activeMode, setActiveMode] = useState("collections");
  const [prefaces, setPrefaces] = useState(() => ({ ...builtInPrefaces(), ...loadPrefaces() }));
  const [prefacePreview, setPrefacePreview] = useState(null);
  const [notice, setNotice] = useState("");
  const childById = useMemo(() => new Map(storyData.childStories.map((item) => [item.id, item])), []);
  const filtered = useMemo(() => storyData.collections.filter((item) => includesText(item, query)), [query]);
  const selected = storyData.collections.find((item) => item.id === selectedId) || filtered[0] || storyData.collections[0];
  const childStories = useMemo(() => (selected?.matchedChildIds || []).map((id) => childById.get(id)).filter(Boolean), [childById, selected]);
  const statsItems = useMemo(() => storyData.childStories.map((item) => ({
    ...item,
    country: item.country || item.nationality,
    translator: item.translator || item.editor
  })), []);

  async function handlePrefaceUpload(event, target = selected) {
    const file = event.target.files?.[0];
    if (!file) return;
    const ext = file.name.split(".").pop()?.toLowerCase() || "";
    try {
      const next = { ...prefaces };
      if (["csv", "tsv", "json", "xlsx", "xls"].includes(ext)) {
        const rows = await parseTableFile(file);
        let matched = 0;
        rows.forEach((row, index) => {
          const collection = matchCollection(row, storyData.collections, rows.length === 1 ? target : null);
          const text = extractPrefaceText(row);
          if (!collection || !text) return;
          next[collection.id] = {
            text,
            filename: file.name,
            author: pickField(row, ["序跋作者", "作者", "author"], collection.prefaceAuthor),
            updatedAt: new Date().toLocaleString("zh-CN"),
            sourceTitle: pickField(row, ["故事集名称", "图书/期刊名", "书名", "题名"], collection.name),
            rowIndex: index + 1
          };
          matched += 1;
        });
        if (!matched && target) {
          next[target.id] = {
            text: JSON.stringify(rows[0] || {}, null, 2),
            filename: file.name,
            author: target.prefaceAuthor,
            updatedAt: new Date().toLocaleString("zh-CN"),
            sourceTitle: target.name
          };
          matched = 1;
        }
        setNotice(`已导入 ${matched} 条序跋。`);
      } else {
        next[target.id] = {
          text: await file.text(),
          filename: file.name,
          author: target.prefaceAuthor,
          updatedAt: new Date().toLocaleString("zh-CN"),
          sourceTitle: target.name
        };
        setNotice(`已为当前样本保存序跋：${file.name}`);
      }
      setPrefaces(next);
      savePrefaces(next);
    } catch (error) {
      setNotice(`序跋上传失败：${error.message}`);
    } finally {
      event.target.value = "";
    }
  }

  function openPreface(collection) {
    const preface = prefaces[collection.id];
    if (!preface) return;
    setPrefacePreview({ collection, preface });
  }

  const functionCards = [
    { id: "collections", target: "visual-atlas-identity-process", title: "百部德译故事集图谱", meta: "译者身份流变 / 出版地图 / 取材来源" },
    { id: "prefaces", target: "visual-atlas-preface-cluster", title: "德译中国故事集序跋辑录", meta: "主题聚类 / 词云 / 序跋文本" },
    { id: "children", target: "visual-atlas-child-co", title: "子故事知识图谱", meta: `${storyData.stats.childCount} 条子故事 / 主题共现` }
  ];

  function focusVisual(card) {
    setActiveMode(card.id);
    window.requestAnimationFrame(() => {
      document.getElementById(card.target)?.scrollIntoView({ behavior: "smooth", block: "start" });
    });
  }

  return (
    <div className="story-research">
      <div className="story-hero-band">
        <div>
          <strong>多语种中国故事集数据库</strong>
          <span>故事集 / 民间故事 / 主题流变</span>
        </div>
        <button type="button" onClick={downloadJson}>导出全库 JSON</button>
      </div>

      <div className="story-kpis">
        <div><b>{storyData.stats.collectionCount}</b><span>故事集条目</span></div>
        <div><b>{storyData.stats.childCount}</b><span>子故事条目</span></div>
        <div><b>{storyData.stats.matchedChildCount}</b><span>已建立嵌套关系</span></div>
        <div><b>{storyData.stats.languages.length}</b><span>主要语种</span></div>
      </div>

      <div className="research-function-grid">
        {functionCards.map((card) => (
          <button className={activeMode === card.id ? "active" : ""} key={card.id} type="button" onClick={() => focusVisual(card)}>
            <strong>{card.title}</strong>
            <span>{card.meta}</span>
          </button>
        ))}
        <button className="wilhelm-entry-card" type="button" onClick={() => { window.location.hash = "wilhelm"; }}>
          <strong>卫礼贤《中国民间童话》</strong>
          <span>进入独立专题库</span>
        </button>
      </div>

      <div className="story-grid-main equal-height-grid">
        <div className="work-panel story-table-panel">
          <div className="panel-title-row">
            <div>
              <strong>故事集总表</strong>
              <span>点击故事集，下方嵌套显示“图书/期刊名”匹配到的子故事；序跋列可预览本地上传文本。</span>
            </div>
            <label className="story-search">检索
              <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="题名、译者/编者、出版社、序跋作者" />
            </label>
          </div>
          <div className="kb-table-wrap nested-table-wrap collection-table-wrap">
            <table className="kb-table story-table">
              <thead>
                <tr>
                  <th>故事集名称</th>
                  <th>年份</th>
                  <th>译者/编者</th>
                  <th>身份</th>
                  <th>序跋作者</th>
                  <th>出版社</th>
                  <th>子故事</th>
                  <th>序跋</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((item) => {
                  const hasPreface = Boolean(prefaces[item.id]);
                  return (
                    <tr className={selected?.id === item.id ? "selected" : ""} key={item.id} onClick={() => { setSelectedId(item.id); setChildLimit(24); }}>
                      <td><strong>{item.name}</strong><small>{item.foreignTitle}</small></td>
                      <td>{item.yearText}</td>
                      <td>{value(item.editor)}</td>
                      <td>{value(item.editorRole)}</td>
                      <td>{value(item.prefaceAuthor)}</td>
                      <td>{value(item.publisher)}</td>
                      <td><b>{item.declaredChildCount}</b><small>匹配 {item.matchedChildIds.length}</small></td>
                      <td>
                        <button className={`inline-status ${hasPreface ? "ready" : ""}`} type="button" disabled={!hasPreface} onClick={(event) => { event.stopPropagation(); openPreface(item); }}>
                          {hasPreface ? "预览" : "待上传"}
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>

        <aside className="work-panel story-detail-panel compact-detail">
          <strong>当前样本</strong>
          <h3>{selected?.name}</h3>
          <dl>
            <dt>年份</dt><dd>{selected?.yearText}</dd>
            <dt>译者/编者</dt><dd>{value(selected?.editor)}</dd>
            <dt>身份</dt><dd>{value(selected?.editorRole)}</dd>
            <dt>序跋作者</dt><dd>{value(selected?.prefaceAuthor)}</dd>
            <dt>出版社</dt><dd>{value(selected?.publisher)}</dd>
            <dt>子故事关系</dt><dd>总表声明 {selected?.declaredChildCount} 条，当前按书名匹配 {childStories.length} 条。</dd>
          </dl>
          <div className="detail-action-row">
            <label className="upload-button compact-upload">上传序跋
              <input type="file" accept=".txt,.md,.csv,.tsv,.json,.xlsx,.xls" onChange={(event) => handlePrefaceUpload(event, selected)} />
            </label>
            <button type="button" disabled={!prefaces[selected?.id]} onClick={() => openPreface(selected)}>预览序跋</button>
          </div>
          {notice && <p className="local-save-notice">{notice}</p>}
        </aside>
      </div>

      <div className="work-panel child-story-panel">
        <div className="panel-title-row">
          <div>
            <strong>嵌套子故事表</strong>
            <span>{selected?.name} · 已匹配 {childStories.length} 条，同时保留总表声明数量 {selected?.declaredChildCount}。</span>
          </div>
          {childStories.length > childLimit && <button type="button" onClick={() => setChildLimit((value) => value + 24)}>显示更多</button>}
        </div>
        <div className="kb-table-wrap nested-table-wrap child-table-wrap">
          <table className="kb-table story-table">
            <thead>
              <tr>
                <th>规范故事名</th>
                <th>变异故事名</th>
                <th>出版时间</th>
                <th>译者</th>
                <th>语种</th>
                <th>文献载体</th>
                <th>图书/期刊名</th>
                <th>国家 / 出版地 / 出版社</th>
                <th>其他</th>
              </tr>
            </thead>
            <tbody>
              {childStories.slice(0, childLimit).map((item) => (
                <tr key={item.id}>
                  <td>{value(item.canonicalName)}</td>
                  <td>{value(item.variantName)}</td>
                  <td>{value(item.yearText)}</td>
                  <td>{value(item.translator)}</td>
                  <td>{value(item.language)}</td>
                  <td>{value(item.carrier)}</td>
                  <td><strong>{value(item.bookName)}</strong><small>{item.subtitle}</small></td>
                  <td>{[item.country, item.place, item.publisher].filter(Boolean).join(" / ") || "未记录"}</td>
                  <td>{value(item.notes)}</td>
                </tr>
              ))}
              {!childStories.length && (
                <tr><td colSpan="9">当前故事集尚未通过“图书/期刊名”匹配到子故事，但总表数据已完整保留。</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <StoryVisualAtlas mode={activeMode} prefaces={prefaces} />

      <StatisticsPanel items={statsItems} title="多语种中国故事集全库统计可视化" />

      {prefacePreview && (
        <div className="preface-modal-backdrop" role="presentation" onClick={() => setPrefacePreview(null)}>
          <section className="preface-modal" role="dialog" aria-modal="true" aria-label="序跋预览" onClick={(event) => event.stopPropagation()}>
            <div className="panel-title-row">
              <div>
                <strong>序跋预览</strong>
                <span>{prefacePreview.collection.name}</span>
              </div>
              <button type="button" onClick={() => setPrefacePreview(null)}>关闭</button>
            </div>
            <p>{prefacePreview.preface.filename || "本地文本"} · {prefacePreview.preface.updatedAt}</p>
            <pre>{prefacePreview.preface.text}</pre>
          </section>
        </div>
      )}
    </div>
  );
}
