import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api.js";
import storyData from "../data/storyCollections.json";
import ChinaStoryMap from "../components/ChinaStoryMap.jsx";
import StatisticsPanel from "../components/StatisticsPanel.jsx";
import { PublicationBubbleMap } from "../components/StoryVisualAtlas.jsx";
import { loadWilhelmRecords, parseTableFile, pickField, saveWilhelmRecords } from "../utils/localKnowledgeStore.js";

const provinceCoords = {
  北京: [116.4, 39.9],
  山东: [117.0, 36.7],
  江苏: [118.8, 32.1],
  浙江: [120.2, 30.3],
  上海: [121.47, 31.23],
  四川: [104.06, 30.67],
  广东: [113.27, 23.13],
  福建: [119.3, 26.08],
  湖北: [114.3, 30.6],
  湖南: [112.98, 28.2],
  河南: [113.62, 34.75],
  陕西: [108.94, 34.34],
  云南: [102.71, 25.04],
  新疆: [87.62, 43.82],
  西藏: [91.13, 29.65],
  内蒙古: [111.67, 40.82]
};

function isWilhelmText(text) {
  return /卫礼贤|Richard Wilhelm|Wilhelm|Chinesische Volksmärchen/i.test(String(text || ""));
}

function seedCollections() {
  const matched = storyData.collections.filter((item) => [item.name, item.foreignTitle, item.editor, item.prefaceAuthor, item.publisher].some(isWilhelmText));
  return matched.length ? matched : storyData.collections.filter((item) => item.year >= 1910 && item.year <= 1920).slice(0, 2);
}

function normalizeRecord(row, index, fileName = "本地上传表") {
  const title = pickField(row, ["题名", "书名", "故事集名称", "图书/期刊名", "title"], "《卫礼贤中国民间故事》");
  const yearText = pickField(row, ["年份", "出版时间", "再版时间", "year"], "");
  const year = Number(String(yearText).match(/\d{4}/)?.[0]) || 0;
  const province = pickField(row, ["来源地", "故事来源", "省份", "地区", "中国地区", "province"], "北京").replace(/省|市|自治区|特别行政区/g, "");
  return {
    id: `wilhelm-upload-${Date.now()}-${index}`,
    source: fileName,
    title,
    year,
    yearText: yearText || "未记录",
    edition: pickField(row, ["版次", "版本", "再版信息", "edition"], "未记录"),
    translator: pickField(row, ["译者", "编者", "作者", "translator", "editor"], "卫礼贤（Richard Wilhelm）"),
    publisher: pickField(row, ["出版社", "出版机构", "publisher"], "未记录"),
    city: pickField(row, ["出版地", "城市", "city"], "德国"),
    country: pickField(row, ["国家", "国家/地区", "country"], "德国"),
    province,
    language: pickField(row, ["语种", "language"], "德语"),
    note: pickField(row, ["说明", "备注", "传播信息", "note"], "")
  };
}

function collectionRecord(item) {
  return {
    id: item.id,
    sourceCollectionId: item.id,
    source: "故事集总表",
    title: item.name,
    year: item.year,
    yearText: item.yearText,
    edition: "总表条目",
    translator: item.editor || "卫礼贤（Richard Wilhelm）",
    publisher: item.publisher || "未记录",
    city: item.city || "德国",
    country: item.publisher?.includes("Jena") ? "德国" : "德国",
    province: "北京",
    language: "德语",
    note: `声明子故事 ${item.declaredChildCount} 条，当前匹配 ${item.matchedChildIds.length} 条。`
  };
}

function recordFlow(record) {
  const province = provinceCoords[record.province] ? record.province : "北京";
  return {
    id: record.id,
    title: record.title,
    sectionId: "stories",
    resourceType: "卫礼贤专题",
    language: record.language || "德语",
    year: record.year || 0,
    from: provinceCoords[province],
    to: [10.45, 51.16],
    fromLabel: province,
    toLabel: `${record.city || ""} · ${record.country || "德国"}`.replace(/^ · /, ""),
    province,
    country: record.country || "德国",
    weight: 0.85
  };
}

function tableRows(records) {
  return records.map((record) => ({
    ...record,
    canonicalName: record.title,
    country: record.country,
    carrier: record.edition,
    translationMode: record.source,
    translator: record.translator
  }));
}

export default function WilhelmStories() {
  const seed = useMemo(() => seedCollections().map(collectionRecord), []);
  const [uploaded, setUploaded] = useState(() => loadWilhelmRecords());
  const [selectedId, setSelectedId] = useState(seed[0]?.id || "");
  const [notice, setNotice] = useState("");
  const [backendVisuals, setBackendVisuals] = useState(null);
  const [visualNotice, setVisualNotice] = useState("");
  const records = useMemo(() => [...seed, ...uploaded], [seed, uploaded]);
  const selected = records.find((item) => item.id === selectedId) || records[0];
  const seedFlowIds = new Set(seed.map((item) => item.sourceCollectionId).filter(Boolean));
  const fallbackFlows = useMemo(() => [
    ...storyData.flows.filter((flow) => seedFlowIds.has(flow.id)),
    ...uploaded.map(recordFlow)
  ], [seedFlowIds, uploaded]);
  const flows = backendVisuals?.flows?.length ? backendVisuals.flows : fallbackFlows;

  useEffect(() => {
    let canceled = false;
    setVisualNotice("");
    api.wilhelmVisuals(records)
      .then((data) => { if (!canceled) setBackendVisuals(data); })
      .catch((error) => {
        if (!canceled) {
          setBackendVisuals(null);
          setVisualNotice(`后端专题图谱生成失败，暂用本地已保存数据预览：${error.message}`);
        }
      });
    return () => { canceled = true; };
  }, [records]);

  async function handleUpload(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const rows = await parseTableFile(file);
      const next = [...uploaded, ...rows.map((row, index) => normalizeRecord(row, index, file.name))];
      setUploaded(next);
      saveWilhelmRecords(next);
      setNotice(`已保存 ${rows.length} 条卫礼贤专题表格记录，下次启动会自动加载。`);
      if (!selectedId && next[0]) setSelectedId(next[0].id);
    } catch (error) {
      setNotice(`上传失败：${error.message}`);
    } finally {
      event.target.value = "";
    }
  }

  function clearUploads() {
    setUploaded([]);
    saveWilhelmRecords([]);
    setNotice("已清空本地上传的卫礼贤专题记录，原始故事集知识库仍保留。");
  }

  return (
    <section className="wilhelm-page">
      <div className="wilhelm-hero">
        <div>
          <strong>《卫礼贤中国民间故事》专题库</strong>
          <span>再版信息 / 传播路径 / 子故事关系 / 本地知识库</span>
        </div>
        <button type="button" onClick={() => { window.location.hash = "knowledge"; }}>返回多语种中国故事集</button>
      </div>

      <div className="story-kpis">
        <div><b>{records.length}</b><span>专题记录</span></div>
        <div><b>{uploaded.length}</b><span>本地上传</span></div>
        <div><b>{flows.length}</b><span>传播路径</span></div>
        <div><b>{new Set(records.map((item) => item.province)).size}</b><span>中国来源地区</span></div>
      </div>

      <div className="wilhelm-map-wide">
        {visualNotice && <p className="local-save-notice">{visualNotice}</p>}
        <ChinaStoryMap flows={flows.length ? flows : storyData.flows.slice(0, 1)} onSelect={setSelectedId} title="《卫礼贤中国民间故事》再版及传播地图" timeline expandable className="wilhelm-china-map" />
      </div>

      <div className="wilhelm-layout wilhelm-detail-layout">
        <aside className="work-panel wilhelm-record-card">
          <div className="panel-title-row">
            <div><strong>当前专题条目</strong><span>{selected?.source}</span></div>
          </div>
          <h3>{selected?.title}</h3>
          <dl>
            <dt>年份</dt><dd>{selected?.yearText}</dd>
            <dt>译者/编者</dt><dd>{selected?.translator}</dd>
            <dt>版本</dt><dd>{selected?.edition}</dd>
            <dt>出版</dt><dd>{selected?.city} · {selected?.publisher}</dd>
            <dt>来源地区</dt><dd>{selected?.province}</dd>
          </dl>
          <p>{selected?.note || "暂无说明。"}</p>
        </aside>
        <PublicationBubbleMap chart={backendVisuals?.publicationMap} items={records} title="《卫礼贤中国民间故事》再版出版地图" id="visual-atlas-wilhelm-publication" />
      </div>

      <div className="work-panel wilhelm-upload-panel">
        <div className="panel-title-row">
          <div><strong>上传再版及传播表格</strong><span>支持 xlsx、xls、csv、tsv、json，保存到浏览器本地知识库。</span></div>
          <div className="upload-actions">
            <label className="upload-button compact-upload">上传表格
              <input type="file" accept=".xlsx,.xls,.csv,.tsv,.json" onChange={handleUpload} />
            </label>
            {uploaded.length > 0 && <button type="button" onClick={clearUploads}>清空本地上传</button>}
          </div>
        </div>
        {notice && <p className="local-save-notice">{notice}</p>}
        <div className="kb-table-wrap nested-table-wrap wilhelm-table-wrap">
          <table className="kb-table story-table">
            <thead>
              <tr>
                <th>题名</th>
                <th>年份</th>
                <th>版本/再版</th>
                <th>译者/编者</th>
                <th>出版社</th>
                <th>出版地</th>
                <th>中国来源地区</th>
                <th>说明</th>
              </tr>
            </thead>
            <tbody>
              {records.map((record) => (
                <tr className={selected?.id === record.id ? "selected" : ""} key={record.id} onClick={() => setSelectedId(record.id)}>
                  <td><strong>{record.title}</strong><small>{record.source}</small></td>
                  <td>{record.yearText}</td>
                  <td>{record.edition}</td>
                  <td>{record.translator}</td>
                  <td>{record.publisher}</td>
                  <td>{record.city} · {record.country}</td>
                  <td>{record.province}</td>
                  <td>{record.note || "未记录"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <StatisticsPanel items={tableRows(records)} title="卫礼贤中国民间故事专题统计可视化" />
    </section>
  );
}
