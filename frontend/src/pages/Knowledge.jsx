import { useEffect, useMemo, useRef, useState } from "react";
import PlatformVisualization from "../components/PlatformVisualizations.jsx";
import { AcademicCorpusSearchButton } from "../components/AcademicCorpusSearchPanel.jsx";
import GermanStoryAtlasWorkbench from "../components/GermanStoryAtlasWorkbench.jsx";
import { GlobalFilterProvider, filterParamsFromState, useGlobalFilter } from "../context/GlobalFilterContext.jsx";
import { api } from "../services/api.js";
import { echarts } from "../utils/echartsCore.js";

const fallbackRegistry = { domains: [], components: [] };
const tableStateKey = "knowledge-page:data-table-state:v2";
const submoduleAlias = {
  "stories-prefaces": "stories-preface-atlas",
  "stories-child-knowledge": "stories-child-story-atlas",
};
const builtinTableSubmodules = new Set([
  "stories-preface-atlas",
  "stories-child-story-atlas",
  "stories-wilhelm",
]);

const commonColumns = [
  { key: "__select", label: "选择", width: 52, locked: true, required: true, system: true },
  { key: "__index", label: "序号", width: 72, locked: true, required: true, system: true },
  { key: "__actions", label: "操作", width: 132, locked: true, required: true, system: true },
  { key: "title", label: "文献标题", width: 240, aliases: ["title", "文献标题", "题名", "书名", "标题", "name"] },
  { key: "translator", label: "译者", width: 160, aliases: ["translator", "译者", "编者", "editor"] },
  { key: "publisher", label: "出版社", width: 180, aliases: ["publisher", "出版社", "出版机构"] },
  { key: "publish_year", label: "出版年份", width: 120, type: "number", aliases: ["publish_year", "year", "出版年份", "年份", "出版时间"] },
  { key: "country", label: "国家 / 地区", width: 150, aliases: ["country", "国家", "国家/地区", "出版国家", "地区"] },
  { key: "language", label: "语种", width: 120, enum: true, aliases: ["language", "语种", "译本语言"] },
  { key: "document_type", label: "文献类型", width: 150, enum: true, aliases: ["document_type", "文献类型", "类型", "resourceType"] },
];

const domainColumns = {
  classics: [
    { key: "original_author", label: "原著作者", width: 150, aliases: ["原著作者", "author", "作者"] },
    { key: "dynasty", label: "原著朝代", width: 120, aliases: ["原著朝代", "朝代"] },
    { key: "classic_category", label: "典籍分类", width: 140, enum: true, aliases: ["典籍分类", "分类", "theme"] },
    { key: "first_year", label: "首译年份", width: 120, type: "number", aliases: ["首译年份"] },
    { key: "first_country", label: "首译国家", width: 140, aliases: ["首译国家"] },
    { key: "volume_count", label: "译本卷数", width: 120, type: "number", aliases: ["译本卷数"] },
  ],
  shanghai: [
    { key: "original_year", label: "原著发表年份", width: 130, type: "number", aliases: ["原著发表年份", "作品发表年份"] },
    { key: "journal", label: "发表刊物", width: 170, aliases: ["发表刊物", "刊物"] },
    { key: "adaptation", label: "海外改编形式", width: 160, enum: true, aliases: ["海外改编形式", "改编形式"] },
    { key: "translator_identity", label: "海外译者身份", width: 160, enum: true, aliases: ["海外译者身份", "译者身份"] },
    { key: "spread_country", label: "传播国家", width: 140, aliases: ["传播国家"] },
    { key: "comment_count", label: "评论数量", width: 120, type: "number", aliases: ["评论数量", "评论数"] },
  ],
  stories: [
    { key: "motif_type", label: "母题类型", width: 150, enum: true, aliases: ["母题类型", "canonicalName", "故事母题"] },
    { key: "source_place", label: "故事来源地", width: 160, aliases: ["故事来源地", "来源地", "province", "source"] },
    { key: "collection", label: "收录故事集", width: 180, aliases: ["收录故事集", "bookName", "collectionTitle", "故事集名称"] },
    { key: "reprint_count", label: "再版次数", width: 120, type: "number", aliases: ["再版次数", "edition"] },
    { key: "preface_author", label: "序跋作者", width: 150, aliases: ["序跋作者", "prefaceAuthor"] },
    { key: "keywords", label: "核心关键词", width: 180, aliases: ["核心关键词", "关键词", "theme", "keywords"] },
  ],
  world: [
    { key: "author_nationality", label: "原作者国籍", width: 150, aliases: ["原作者国籍", "国籍"] },
    { key: "work_year", label: "作品发表年份", width: 130, type: "number", aliases: ["作品发表年份"] },
    { key: "china_element", label: "中国元素类型", width: 160, enum: true, aliases: ["中国元素类型", "中国元素"] },
    { key: "cultural_position", label: "文化立场", width: 140, enum: true, aliases: ["文化立场"] },
    { key: "citation_count", label: "引用次数", width: 120, type: "number", aliases: ["引用次数"] },
    { key: "original_language", label: "原著语言", width: 130, enum: true, aliases: ["原著语言"] },
  ],
  repository: [],
};

function hashSelection() {
  const [, query = ""] = (window.location.hash || "").split("?");
  const params = new URLSearchParams(query);
  return {
    domainId: params.get("domain"),
    submoduleId: submoduleAlias[params.get("submodule")] || params.get("submodule"),
  };
}

function loadTableState() {
  try {
    return JSON.parse(window.localStorage.getItem(tableStateKey) || "{}");
  } catch {
    return {};
  }
}

function saveTableState(next) {
  window.localStorage.setItem(tableStateKey, JSON.stringify(next));
}

function normalizeCell(value) {
  if (value === undefined || value === null) return "";
  if (Array.isArray(value)) return value.join("、");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function rowSource(row) {
  return { ...(row?.system || {}), ...(row || {}) };
}

function pickValue(row, column) {
  if (column.system) return "";
  const source = rowSource(row);
  const keys = [column.key, ...(column.aliases || [])];
  for (const key of keys) {
    const value = source[key];
    if (value !== undefined && value !== null && String(value).trim() !== "") return normalizeCell(value);
  }
  return "";
}

function highlight(text, keyword) {
  const value = normalizeCell(text);
  const needle = keyword.trim();
  if (!needle) return value;
  const lower = value.toLowerCase();
  const index = lower.indexOf(needle.toLowerCase());
  if (index < 0) return value;
  return (
    <>
      {value.slice(0, index)}
      <mark className="knowledge-search-mark">{value.slice(index, index + needle.length)}</mark>
      {value.slice(index + needle.length)}
    </>
  );
}

function csvEscape(value) {
  return `"${normalizeCell(value).replace(/"/g, '""')}"`;
}

function downloadBlob(filename, text, type) {
  const blob = new Blob([text], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

const documentTextKinds = new Set(["pdf", "docx", "pdf-ocr", "ocr", "image"]);
const lexicalStopwords = new Set([
  "the", "and", "that", "with", "this", "from", "have", "were", "their", "which", "into",
  "一个", "一种", "以及", "因为", "所以", "但是", "关于", "进行", "通过", "可以", "没有", "我们",
]);
const readerFullTextPageSize = 18;
const modalFullTextPageSize = 28;
const documentLanguageScopes = [
  { value: "all", label: "全文所有语种" },
  { value: "zh", label: "中文/汉字" },
  { value: "latin", label: "拉丁语系" },
  { value: "cyrillic", label: "西里尔" },
  { value: "greek", label: "希腊" },
  { value: "kana", label: "日文假名" },
  { value: "hangul", label: "韩文" },
  { value: "arabic", label: "阿拉伯" },
];

const documentCloudPalette = ["#0f766e", "#1d4ed8", "#9333ea", "#b45309", "#be123c", "#475569", "#0369a1"];

function pageFromParagraphIndex(index, pageSize) {
  if (!Number.isFinite(index) || index < 0) return 0;
  return Math.floor(index / pageSize);
}

function clampPage(page, pageCount) {
  return Math.min(Math.max(0, page), Math.max(0, pageCount - 1));
}

function isDocumentRecord(row) {
  const dataset = row?.dataset || {};
  const textKind = row?.text_kind || dataset.text_kind || row?.system?.text_kind;
  return row?.dataset_kind === "document" || dataset.dataset_kind === "document" || documentTextKinds.has(String(textKind || "").toLowerCase());
}

function isBuiltinRecord(row) {
  const datasetId = String(row?.dataset_id || row?.dataset?.id || "");
  return datasetId.startsWith("builtin-") || row?.is_builtin || row?.dataset?.is_builtin;
}

function documentRecordId(row, index = 0) {
  return String(row?.id || row?.record_id || `${row?.dataset_id || row?.dataset?.id || "document"}-${index}`);
}

function documentDatasetId(row) {
  return String(row?.dataset_id || row?.dataset?.id || "document");
}

function compactText(value, length = 90) {
  const text = stripPageMarkers(normalizeCell(value)).replace(/\s+/g, " ").trim();
  return text.length > length ? `${text.slice(0, length)}...` : text;
}

function stripPageMarkers(value) {
  return String(value || "")
    .split(/\r?\n/)
    .filter((line) => {
      const text = line.replace(/\s+/g, " ").trim();
      if (!text) return true;
      return !/^[=\-_*#\s]*(?:page|seite|p\.?|第)\s*[\d一二三四五六七八九十百千万]+(?:\s*(?:页|page|seite))?\s*[=\-_*#\s]*$/i.test(text);
    })
    .join("\n");
}

function documentModeLabel(kind) {
  if (kind === "pdf") return "PDF 直接解析";
  if (kind === "docx") return "Word 直接解析";
  if (kind === "pdf-ocr" || kind === "ocr") return "大模型 OCR";
  if (kind === "image") return "图片 OCR";
  return kind || "文档解析";
}

function documentEntry(row, index) {
  const source = rowSource(row);
  const dataset = row.dataset || {};
  const content = stripPageMarkers(normalizeCell(source.content || row.content || source.fullText || row.fullText || source.text || row.preview_text || ""));
  const title = normalizeCell(source.title || row.title || dataset.name || dataset.file_name || `文本片段 ${index + 1}`);
  return {
    id: documentRecordId(row, index),
    row,
    dataset,
    datasetId: documentDatasetId(row),
    title,
    content,
    source: normalizeCell(source.source || dataset.file_name || dataset.name || "上传文档"),
    notes: normalizeCell(source.notes || row.notes || ""),
    textKind: row.text_kind || dataset.text_kind || "",
    charCount: content.length,
    index: index + 1,
  };
}

function splitReadableParagraphs(text) {
  return stripPageMarkers(text)
    .split(/\n{2,}|\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function rowStableId(row, index = 0) {
  return String(row?.id || row?.record_id || row?.system?.id || `row-${index + 1}`);
}

function valueByKey(row, key) {
  const source = rowSource(row);
  return normalizeCell(source[key] || row?.[key] || "");
}

function recordToReaderRecord(row, index, columns, domain, submodule) {
  const id = rowStableId(row, index);
  const source = rowSource(row);
  const dataset = row.dataset || {};
  const title = normalizeCell(
    valueByKey(row, "title")
    || source.name
    || dataset.name
    || dataset.file_name
    || `文献条目 ${index + 1}`
  );
  const sourceName = normalizeCell(valueByKey(row, "source") || dataset.file_name || dataset.name || submodule?.name || "知识库记录");
  const metaFields = [
    ["作者", valueByKey(row, "author")],
    ["译者/编者", valueByKey(row, "translator")],
    ["出版社", valueByKey(row, "publisher")],
    ["出版年份", valueByKey(row, "publish_year")],
    ["国家/地区", valueByKey(row, "country")],
    ["城市", valueByKey(row, "city")],
    ["语种", valueByKey(row, "language")],
    ["文献类型", valueByKey(row, "document_type")],
    ["主题/关键词", valueByKey(row, "theme") || valueByKey(row, "keywords")],
  ].filter(([, value]) => value);
  const bodyFields = [
    ["正文", valueByKey(row, "content") || source.text || row.preview_text],
    ["序跋", valueByKey(row, "preface")],
    ["摘要/说明", source.summary || source.description || valueByKey(row, "notes")],
  ].filter(([, value]) => value);
  const visiblePairs = (columns || [])
    .filter((column) => !column.system && column.visible !== false)
    .map((column) => [column.label, pickValue(row, column)])
    .filter(([, value]) => value)
    .slice(0, 18);
  const content = stripPageMarkers([
    `题名：${title}`,
    metaFields.map(([label, value]) => `${label}：${value}`).join("\n"),
    bodyFields.map(([label, value]) => `${label}：\n${value}`).join("\n\n"),
    visiblePairs.length ? `字段索引：\n${visiblePairs.map(([label, value]) => `${label}：${value}`).join("\n")}` : "",
  ].filter(Boolean).join("\n\n"));
  const readerDatasetId = id;
  return {
    ...row,
    id: `reader-record-${id}`,
    record_id: row.record_id || id,
    dataset_id: readerDatasetId,
    dataset_kind: "document",
    text_kind: row.text_kind || dataset.text_kind || "record",
    content,
    system: {
      ...(row.system || {}),
      title,
      content,
      source: sourceName,
      notes: valueByKey(row, "notes") || sourceName,
    },
    dataset: {
      id: readerDatasetId,
      name: title,
      file_name: sourceName,
      dataset_kind: "document",
      text_kind: "record",
      description: `${domain?.name || "知识库"} / ${submodule?.name || "子模块"}`,
      analysis: dataset.analysis || {},
    },
  };
}

function germanCorpusToReaderRecords(payload) {
  const documents = Array.isArray(payload?.documents) ? payload.documents : [];
  const selected = payload?.selectedDocument || documents[0] || null;
  const selectedId = String(selected?.id || "");
  return documents.map((document, index) => {
    const isSelected = selectedId && String(document.id) === selectedId;
    const fullText = isSelected ? (selected.fullText || selected.content || selected.preview || document.preview || "") : (document.preview || "");
    const chunks = isSelected && Array.isArray(selected.chunks) ? selected.chunks : [];
    const chunkText = chunks
      .map((chunk) => chunk?.content || chunk?.text || "")
      .filter(Boolean)
      .join("\n\n");
    const content = fullText || chunkText || document.preview || "";
    const title = normalizeCell(document.title || document.filename || `百部德译故事集文档 ${index + 1}`);
    const datasetId = `german-corpus-${document.id || index + 1}`;
    const analysis = {
      top_keywords: document.topKeywords || selected?.topKeywords || [],
      char_count: document.charCount || content.length,
      chunk_count: document.chunkCount || chunks.length,
      reading_minutes: document.readingMinutes,
    };
    return {
      id: document.id || datasetId,
      record_id: document.id || datasetId,
      dataset_id: datasetId,
      dataset_kind: "document",
      text_kind: "txt",
      source_kind: "german-corpus-txt",
      title,
      content,
      fullText: content,
      author: document.author || "",
      translator: document.translator || "",
      publish_year: document.year || "",
      language: document.language || "German / Chinese",
      document_type: "TXT 文档",
      source: document.filename || document.source || title,
      system: {
        title,
        content,
        author: document.author || "",
        translator: document.translator || "",
        publish_year: document.year || "",
        language: document.language || "German / Chinese",
        document_type: "TXT 文档",
        source: document.filename || document.source || title,
        notes: isSelected ? "当前全文已载入阅读工作台" : "文档索引预览，点击文档后加载全文",
      },
      dataset: {
        id: datasetId,
        name: title,
        file_name: document.filename || document.source || title,
        dataset_kind: "document",
        text_kind: "txt",
        description: payload?.corpusTitle || "百部德译故事集",
        analysis,
      },
    };
  });
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function countTerm(text, term) {
  if (!term) return 0;
  const matches = String(text || "").match(new RegExp(escapeRegExp(term), "gi"));
  return matches ? matches.length : 0;
}

function tokenizeAcademicTerms(text) {
  const matches = String(text || "").match(/[\u4e00-\u9fff]{2,6}|[A-Za-z][A-Za-z'-]{2,}/g) || [];
  return matches
    .map((item) => item.toLowerCase())
    .filter((item) => item.length > 1 && !lexicalStopwords.has(item));
}

function fallbackKeywords(text, limit = 36) {
  const counts = new Map();
  tokenizeAcademicTerms(text).forEach((term) => counts.set(term, (counts.get(term) || 0) + 1));
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, limit)
    .map(([word, count]) => ({ word, count, score: count }));
}

function buildFallbackCooccurrence(entries, terms) {
  const important = terms.slice(0, 18);
  const links = new Map();
  entries.forEach((entry) => {
    const present = important.filter((term) => countTerm(entry.content, term) > 0);
    present.forEach((left, leftIndex) => {
      present.slice(leftIndex + 1, leftIndex + 5).forEach((right) => {
        const key = [left, right].sort().join("::");
        links.set(key, (links.get(key) || 0) + 1);
      });
    });
  });
  return [...links.entries()].map(([key, count]) => {
    const [source, target] = key.split("::");
    return { source, target, count };
  }).sort((a, b) => b.count - a.count).slice(0, 40);
}

function copyToClipboard(text) {
  navigator.clipboard?.writeText(text).catch(() => {});
}

function safeFilename(value, fallback = "文档全文") {
  return normalizeCell(value || fallback).replace(/[\\/:*?"<>|]+/g, "_").replace(/\s+/g, " ").trim().slice(0, 90) || fallback;
}

function downloadTextFile(filename, text) {
  downloadBlob(`${safeFilename(filename)}.txt`, `\uFEFF${text || ""}`, "text/plain;charset=utf-8");
}

function downloadDocFile(filename, title, text) {
  const escaped = normalizeCell(text).replace(/[&<>]/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;" }[char]));
  const body = escaped.split(/\n{2,}|\r?\n/).filter(Boolean).map((paragraph) => `<p>${paragraph}</p>`).join("");
  const html = `<!doctype html><html><head><meta charset="utf-8"><title>${safeFilename(title)}</title><style>body{font-family:SimSun,serif;line-height:1.9;padding:32px;color:#111827}h1{font-size:22px}p{text-indent:2em;margin:0 0 12px}</style></head><body><h1>${safeFilename(title)}</h1>${body}</body></html>`;
  downloadBlob(`${safeFilename(filename)}.doc`, `\uFEFF${html}`, "application/msword;charset=utf-8");
}

function tokenizeMultilingual(text) {
  const value = String(text || "").normalize("NFKC");
  let matches = [];
  try {
    const unicodeWordPattern = new RegExp("[\\p{Script=Han}]{2,6}|[\\p{L}][\\p{L}\\p{M}'’-]{2,}", "gu");
    matches = value.match(unicodeWordPattern) || [];
  } catch {
    matches = value.match(/[\u4e00-\u9fff]{2,6}|[A-Za-zÀ-ž][A-Za-zÀ-ž'’-]{2,}/g) || [];
  }
  return matches
    .map((item) => item.toLowerCase())
    .filter((item) => item.length > 1 && !lexicalStopwords.has(item));
}

function scriptProfile(text) {
  const value = String(text || "");
  const count = (pattern) => (value.match(pattern) || []).length;
  const profile = [
    { key: "Han", label: "汉字", count: count(/[\u4e00-\u9fff]/g) },
    { key: "Latin", label: "拉丁", count: count(/[A-Za-zÀ-ž]/g) },
    { key: "Cyrillic", label: "西里尔", count: count(/[\u0400-\u04ff]/g) },
    { key: "Greek", label: "希腊", count: count(/[\u0370-\u03ff]/g) },
    { key: "Kana", label: "假名", count: count(/[\u3040-\u30ff]/g) },
    { key: "Hangul", label: "韩文", count: count(/[\uac00-\ud7af]/g) },
    { key: "Arabic", label: "阿拉伯", count: count(/[\u0600-\u06ff]/g) },
  ];
  const total = Math.max(1, profile.reduce((sum, item) => sum + item.count, 0));
  const dominant = [...profile].sort((a, b) => b.count - a.count)[0];
  return {
    total,
    dominant: dominant?.count ? dominant.label : "未识别",
    mixIndex: Number((profile.filter((item) => item.count / total > 0.08).length / Math.max(1, profile.length)).toFixed(2)),
    profile: profile.map((item) => ({ ...item, ratio: Number((item.count / total).toFixed(4)) })),
  };
}

function academicTextMetrics(text, entries = []) {
  const paragraphs = splitReadableParagraphs(text);
  const sentences = String(text || "")
    .split(/[。！？.!?；;]+|\n+/)
    .map((item) => item.trim())
    .filter((item) => item.length > 8);
  const tokens = tokenizeMultilingual(text);
  const unique = new Set(tokens);
  const scripts = scriptProfile(text);
  const avgSentence = sentences.length ? Math.round(tokens.length / sentences.length) : 0;
  const avgChunk = entries.length ? Math.round(entries.reduce((sum, entry) => sum + entry.charCount, 0) / entries.length) : 0;
  return {
    chars: String(text || "").length,
    paragraphs: paragraphs.length,
    sentences: sentences.length,
    tokens: tokens.length,
    uniqueTerms: unique.size,
    lexicalDiversity: tokens.length ? Number((unique.size / tokens.length).toFixed(3)) : 0,
    avgSentence,
    avgChunk,
    scripts,
  };
}

function groupDocumentEntries(entries) {
  const map = new Map();
  entries.forEach((entry) => {
    if (!map.has(entry.datasetId)) {
      map.set(entry.datasetId, {
        id: entry.datasetId,
        dataset: entry.dataset,
        entries: [],
        title: entry.dataset.name || entry.dataset.file_name || entry.source || "上传文档",
      });
    }
    map.get(entry.datasetId).entries.push(entry);
  });
  return [...map.values()].map((group, index) => {
    const fullText = group.entries.map((entry) => entry.content).filter(Boolean).join("\n\n");
    const analysis = group.dataset.analysis || {};
    const fallback = fallbackKeywords(fullText, 48);
    const keywords = Array.isArray(analysis.top_keywords) && analysis.top_keywords.length ? analysis.top_keywords : fallback;
    return {
      ...group,
      order: index + 1,
      fullText,
      analysis,
      keywords,
      metrics: academicTextMetrics(fullText, group.entries),
    };
  });
}

function paragraphRowsFromEntries(entries) {
  return entries.flatMap((entry) => splitReadableParagraphs(entry.content).map((paragraph, index) => ({
    id: `${entry.id}-p-${index}`,
    entryId: entry.id,
    datasetId: entry.datasetId,
    title: entry.title,
    text: paragraph,
  })));
}

function highlightMulti(text, terms = []) {
  const value = normalizeCell(text);
  const needles = [...new Set(terms.map((item) => normalizeCell(item).trim()).filter(Boolean))]
    .sort((a, b) => b.length - a.length)
    .slice(0, 8);
  if (!needles.length) return value;
  const pattern = new RegExp(`(${needles.map(escapeRegExp).join("|")})`, "gi");
  return value.split(pattern).map((part, index) => {
    const matched = needles.find((term) => term.toLowerCase() === part.toLowerCase());
    return matched ? <mark className="knowledge-search-mark document-hit-mark" key={`${part}-${index}`}>{part}</mark> : part;
  });
}

function DomainNav({ domains }) {
  const { state, dispatch } = useGlobalFilter();
  const visibleDomains = domains.filter((domain) => domain.is_active !== false);
  return (
    <nav className="platform-domain-nav" aria-label="知识域选择">
      {visibleDomains.map((domain) => (
        <button
          className={state.selectedDomainId === domain.id ? "active" : ""}
          key={domain.id}
          type="button"
          onClick={() => dispatch({ type: "selectDomain", domainId: domain.id })}
        >
          <strong>{domain.name}</strong>
          <span>{(domain.submodules || []).filter((item) => item.is_active !== false).length} 个子模块</span>
        </button>
      ))}
    </nav>
  );
}

function SubmoduleNav({ domain }) {
  const { state, dispatch } = useGlobalFilter();
  const submodules = (domain?.submodules || []).filter((submodule) => submodule.is_active !== false);
  useEffect(() => {
    if (!submodules.length) return;
    if (!state.selectedSubmoduleId || !submodules.some((item) => item.id === state.selectedSubmoduleId)) {
      dispatch({ type: "selectSubmodule", submoduleId: submodules[0].id });
    }
  }, [dispatch, state.selectedSubmoduleId, submodules]);
  return (
    <div className="platform-submodule-row">
      <div className="platform-submodule-scroll">
        {submodules.map((submodule) => (
          <button
            className={state.selectedSubmoduleId === submodule.id ? "active" : ""}
            key={submodule.id}
            type="button"
            onClick={() => dispatch({ type: "selectSubmodule", submoduleId: submodule.id })}
          >
            <span>{submodule.type === "language" ? "语种专题" : submodule.type === "general" ? "总集" : "专题"}</span>
            <strong>{submodule.name}</strong>
          </button>
        ))}
      </div>
    </div>
  );
}

function FilterPanel({ column, values, filter, onApply, onClose }) {
  const [draft, setDraft] = useState(filter || { op: column.type === "number" ? "gt" : "contains", value: "", values: [] });
  const enumValues = values.filter(Boolean).slice(0, 80);
  return (
    <div className="knowledge-column-filter" role="dialog" aria-label={`${column.label}筛选`}>
      {column.enum ? (
        <div className="knowledge-filter-options">
          {enumValues.map((value) => (
            <label key={value}>
              <input
                type="checkbox"
                checked={(draft.values || []).includes(value)}
                onChange={(event) => {
                  const next = event.target.checked
                    ? [...(draft.values || []), value]
                    : (draft.values || []).filter((item) => item !== value);
                  setDraft({ op: "in", values: next });
                }}
              />
              <span>{value}</span>
            </label>
          ))}
        </div>
      ) : (
        <>
          <select value={draft.op} onChange={(event) => setDraft({ ...draft, op: event.target.value })}>
            {column.type === "number" ? (
              <>
                <option value="gt">大于</option>
                <option value="lt">小于</option>
                <option value="eq">等于</option>
                <option value="between">介于</option>
              </>
            ) : (
              <>
                <option value="contains">包含</option>
                <option value="not_contains">不包含</option>
                <option value="eq">等于</option>
                <option value="neq">不等于</option>
              </>
            )}
          </select>
          <input
            value={draft.value || ""}
            onChange={(event) => setDraft({ ...draft, value: event.target.value })}
            placeholder={draft.op === "between" ? "起始值,结束值" : "输入筛选值"}
          />
        </>
      )}
      <footer>
        <button type="button" onClick={() => { onApply(null); onClose(); }}>清除</button>
        <button type="button" onClick={onClose}>取消</button>
        <button type="button" onClick={() => { onApply(draft); onClose(); }}>确定</button>
      </footer>
    </div>
  );
}

function PreviewModal({ row, columns, keyword, onClose }) {
  const [scale, setScale] = useState(1);
  const [insideKeyword, setInsideKeyword] = useState(keyword || "");
  if (!row) return null;
  const title = pickValue(row, columns.find((item) => item.key === "title") || {}) || "未命名文献";
  const source = rowSource(row);
  const content = normalizeCell(source.content || source.preface || source.text || source.notes || "当前记录暂无全文内容，可在管理控制台补充全文、序跋或 OCR 识别原文。");
  const info = [
    `译者：${pickValue(row, columns.find((item) => item.key === "translator") || {}) || "未记录"}`,
    `出版社：${pickValue(row, columns.find((item) => item.key === "publisher") || {}) || "未记录"}`,
    `出版年份：${pickValue(row, columns.find((item) => item.key === "publish_year") || {}) || "未记录"}`,
    `文献类型：${pickValue(row, columns.find((item) => item.key === "document_type") || {}) || "未记录"}`,
  ];
  function copy(text) {
    navigator.clipboard?.writeText(text).catch(() => {});
  }
  function printPreview() {
    window.print();
  }
  return (
    <div className="knowledge-preview-backdrop" role="presentation" onClick={onClose}>
      <section className="knowledge-preview-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <header>
          <strong>文献预览・{title}</strong>
          <button type="button" onClick={onClose}>×</button>
        </header>
        <div className="knowledge-preview-tools">
          <button type="button" onClick={() => setScale((value) => Math.max(0.5, Number((value - 0.1).toFixed(1))))}>缩小 (-)</button>
          <button type="button" onClick={() => setScale(1)}>重置 ({Math.round(scale * 100)}%)</button>
          <button type="button" onClick={() => setScale((value) => Math.min(2, Number((value + 0.1).toFixed(1))))}>放大 (+)</button>
          <button type="button" onClick={() => copy(content)}>复制全文</button>
          <button type="button" onClick={() => copy(window.getSelection?.().toString() || "")}>复制选中内容</button>
          <button type="button" onClick={printPreview}>导出 PDF</button>
          <button type="button" onClick={printPreview}>打印</button>
          <input value={insideKeyword} onChange={(event) => setInsideKeyword(event.target.value)} placeholder="在当前文献内搜索" />
        </div>
        <div className="knowledge-preview-tabs">
          <button className="active" type="button">译文全文</button>
          <button type="button">序跋原文</button>
          <button type="button">OCR 识别原文</button>
        </div>
        <main className="knowledge-preview-content" style={{ fontSize: `${16 * scale}px` }}>
          {content.split(/\n{2,}|\r?\n/).filter(Boolean).map((paragraph, index) => (
            <p key={`${index}-${paragraph.slice(0, 8)}`}>{highlight(paragraph, insideKeyword)}</p>
          ))}
        </main>
        <footer>{info.join(" | ")}</footer>
      </section>
    </div>
  );
}

function DocumentChart({ option, height = 320, onEvents, chartKey }) {
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
    if (!chartKey) return undefined;
    window.__knowledgeCharts = window.__knowledgeCharts || {};
    window.__knowledgeCharts[chartKey] = chartRef;
    return () => {
      if (window.__knowledgeCharts) delete window.__knowledgeCharts[chartKey];
    };
  }, [chartKey]);

  useEffect(() => {
    if (!chartRef.current || !onEvents) return undefined;
    const chart = chartRef.current;
    Object.entries(onEvents).forEach(([name, handler]) => chart.on(name, handler));
    return () => Object.entries(onEvents).forEach(([name, handler]) => chart.off(name, handler));
  }, [onEvents]);

  useEffect(() => {
    const resize = () => chartRef.current?.resize();
    window.addEventListener("resize", resize);
    const observer = typeof ResizeObserver !== "undefined" && ref.current ? new ResizeObserver(resize) : null;
    if (observer && ref.current) observer.observe(ref.current);
    return () => {
      window.removeEventListener("resize", resize);
      observer?.disconnect();
    };
  }, []);

  return <div className="knowledge-document-chart-canvas" ref={ref} style={{ height }} />;
}

function AcademicChartPanel({ title, note, option, height, wide = false, onEvents, chartKey }) {
  return (
    <section className={`knowledge-document-chart-panel ${wide ? "wide" : ""}`}>
      <header>
        <div>
          <strong>{title}</strong>
          <span>{note}</span>
        </div>
      </header>
      <DocumentChart option={option} height={height} onEvents={onEvents} chartKey={chartKey} />
    </section>
  );
}

function DocumentWordCloudPanel({ title, note, words = [], wide = false, focusTerm = "", onSelect }) {
  const [selected, setSelected] = useState("");
  const placedWords = useMemo(() => {
    const source = (words || [])
      .map((item) => ({
        ...item,
        rawText: item.text || item.word || item.name || "",
        value: Number(item.value || item.score || item.count || 0),
        count: Number(item.count || 1),
      }))
      .filter((item) => item.rawText && item.value > 0)
      .slice(0, 180);
    const seen = new Set();
    const normalized = source.filter((item) => {
      const key = item.rawText.toLowerCase();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    const maxValue = Math.max(1, ...normalized.map((item) => Math.max(item.value, item.count)));
    const widthOf = (text, size) => {
      const chars = [...String(text || "")];
      const cjk = chars.filter((char) => /[\u4e00-\u9fff]/.test(char)).length;
      return Math.max(16, cjk * size * 0.92 + (chars.length - cjk) * size * 0.54);
    };
    const cloudWidth = 1180;
    const cloudHeight = 520;
    const pad = 18;
    const gap = 10;
    const rows = [];
    let current = [];
    let rowWidth = 0;
    let rowHeight = 0;
    normalized.forEach((word, rank) => {
      const ratio = Math.max(word.value, word.count) / maxValue;
      const lengthFactor = word.rawText.length > 12 ? 0.68 : word.rawText.length > 7 ? 0.82 : 1;
      const rankFactor = rank < 8 ? 1.36 : rank < 26 ? 1.16 : rank < 70 ? 0.96 : 0.82;
      const size = Math.max(12, Math.min(56, (12 + Math.pow(ratio, 0.42) * 44) * lengthFactor * rankFactor));
      const measured = { ...word, rank, size, width: widthOf(word.rawText, size), height: size * 1.12 };
      const nextWidth = rowWidth + (current.length ? gap : 0) + measured.width;
      if (current.length && nextWidth > cloudWidth - pad * 2) {
        rows.push({ words: current, width: rowWidth, height: rowHeight });
        current = [];
        rowWidth = 0;
        rowHeight = 0;
      }
      current.push(measured);
      rowWidth += (current.length > 1 ? gap : 0) + measured.width;
      rowHeight = Math.max(rowHeight, measured.height);
    });
    if (current.length) rows.push({ words: current, width: rowWidth, height: rowHeight });
    const trimmedRows = rows.slice(0, 9);
    const totalHeight = trimmedRows.reduce((sum, row) => sum + row.height, 0);
    const rowGap = trimmedRows.length > 1 ? Math.max(12, (cloudHeight - pad * 2 - totalHeight) / (trimmedRows.length - 1)) : 12;
    let y = pad + (cloudHeight - pad * 2 - totalHeight - rowGap * Math.max(0, trimmedRows.length - 1)) / 2;
    return trimmedRows.flatMap((row, rowIndex) => {
      const justify = row.words.length > 1
        ? Math.max(gap, (cloudWidth - pad * 2 - row.width) / (row.words.length - 1) + gap)
        : 0;
      let x = pad + (rowIndex % 2 ? Math.max(0, cloudWidth - pad * 2 - row.width) * 0.35 : 0);
      const baseline = y + row.height * 0.62;
      const placed = row.words.map((word) => {
        const item = { ...word, x: x + word.width / 2, y: baseline };
        x += word.width + justify;
        return item;
      });
      y += row.height + rowGap;
      return placed;
    });
  }, [words]);
  const activeWord = selected || focusTerm;
  return (
    <section className={`knowledge-document-chart-panel knowledge-document-word-cloud-panel ${wide ? "wide" : ""}`}>
      <header>
        <div>
          <strong>{title}</strong>
          <span>{note}</span>
        </div>
        {activeWord && <button type="button" onClick={() => { setSelected(""); onSelect?.(""); }}>清除聚焦</button>}
      </header>
      <svg viewBox="0 0 1180 520" className="knowledge-document-word-cloud" role="img">
        <rect width="1180" height="520" fill="#fff" />
        <g opacity="0.96">
          {placedWords.map((word, index) => {
            const isActive = !activeWord || activeWord === word.rawText;
            const topicIndex = Math.abs(String(word.topic || "").split("").reduce((sum, char) => sum + char.charCodeAt(0), 0)) % documentCloudPalette.length;
            return (
              <text
                className="knowledge-document-cloud-word"
                key={`${word.rawText}-${index}`}
                x={word.x}
                y={word.y}
                textAnchor="middle"
                style={{
                  fill: documentCloudPalette[topicIndex || index % documentCloudPalette.length],
                  fontSize: `${word.size}px`,
                  fontWeight: word.rank < 20 ? 900 : word.rank < 90 ? 800 : 700,
                  opacity: isActive ? 0.96 : 0.18,
                }}
                onClick={() => {
                  const next = selected === word.rawText ? "" : word.rawText;
                  setSelected(next);
                  onSelect?.(next);
                }}
              >
                {word.rawText}
              </text>
            );
          })}
        </g>
        {!placedWords.length && <text x="590" y="260" textAnchor="middle" fill="#64748b" fontSize="28" fontWeight="800">暂无可分析词项</text>}
      </svg>
    </section>
  );
}

function DocumentFullWindowModal({
  open,
  group,
  entry,
  paragraphs,
  page,
  pageCount,
  pageStart,
  visibleParagraphs,
  textMetrics,
  insights,
  keywords,
  focusTerm,
  query,
  textScale,
  onClose,
  onCopy,
  onSaveTxt,
  onSaveDoc,
  onPageChange,
  onSelectParagraph,
  onSetFocusTerm,
}) {
  if (!open || !group) return null;
  const activeTerms = [query, focusTerm].filter(Boolean);
  const totalParagraphs = paragraphs.length;
  const currentStart = totalParagraphs ? pageStart + 1 : 0;
  const currentEnd = Math.min(totalParagraphs, pageStart + visibleParagraphs.length);
  return (
    <div className="knowledge-document-modal-backdrop" role="presentation" onClick={onClose}>
      <section className="knowledge-document-modal" role="dialog" aria-modal="true" onClick={(event) => event.stopPropagation()}>
        <header className="knowledge-document-modal-header">
          <div>
            <span>{documentModeLabel(group.dataset?.text_kind || entry?.textKind)}</span>
            <strong>{group.title}</strong>
            <small>{group.dataset?.file_name || group.dataset?.description || group.title}</small>
          </div>
          <div className="knowledge-document-reader-tools">
            <button type="button" onClick={onCopy}>复制全文</button>
            <button type="button" onClick={onSaveTxt}>保存 TXT</button>
            <button type="button" onClick={onSaveDoc}>保存 DOC</button>
            <button type="button" onClick={onClose}>关闭</button>
          </div>
        </header>
        <div className="knowledge-document-pagination modal">
          <button type="button" disabled={page <= 0} onClick={() => onPageChange(page - 1)}>上一页</button>
          <span>第 {page + 1} / {pageCount} 页 · 段落 {currentStart}-{currentEnd} / {totalParagraphs}</span>
          <button type="button" disabled={page >= pageCount - 1} onClick={() => onPageChange(page + 1)}>下一页</button>
        </div>
        <div className="knowledge-document-modal-body">
          <article className="knowledge-document-modal-text" style={{ fontSize: `${16 * textScale}px` }}>
            {visibleParagraphs.map((paragraph, index) => {
              const absoluteIndex = pageStart + index;
              const matchEntry = group.entries.find((item) => item.content.includes(paragraph)) || entry;
              const selected = matchEntry?.id === entry?.id || (focusTerm && paragraph.toLowerCase().includes(focusTerm.toLowerCase()));
              return (
                <p
                  className={selected ? "selected-source" : ""}
                  key={`${absoluteIndex}-${paragraph.slice(0, 12)}`}
                  onClick={() => onSelectParagraph(absoluteIndex, matchEntry?.id || entry?.id)}
                >
                  {highlightMulti(paragraph, activeTerms)}
                </p>
              );
            })}
            {!visibleParagraphs.length && <p>暂无可展示的全文内容。</p>}
          </article>
          <aside className="knowledge-document-modal-side">
            <section className="knowledge-document-modal-card">
              <strong>全文概览</strong>
              <dl>
                {textMetrics.map(([label, value]) => (
                  <div key={label}>
                    <dt>{label}</dt>
                    <dd>{typeof value === "number" ? value.toLocaleString("zh-CN") : value}</dd>
                  </div>
                ))}
              </dl>
            </section>
            <section className="knowledge-document-modal-card">
              <strong>结构诊断</strong>
              <div className="knowledge-document-modal-insights">
                {insights.map((item) => (
                  <div key={item.title}>
                    <span>{item.title}</span>
                    <p>{item.text}</p>
                  </div>
                ))}
              </div>
            </section>
            <section className="knowledge-document-modal-card">
              <strong>核心术语</strong>
              <div className="knowledge-document-keyword-strip modal">
                {keywords.slice(0, 20).map((item) => (
                  <button key={item.word} type="button" onClick={() => onSetFocusTerm(item.word)}>
                    {item.word}<span>{item.count}</span>
                  </button>
                ))}
              </div>
            </section>
          </aside>
        </div>
      </section>
    </div>
  );
}

function DocumentKnowledgeWorkspace({ domain, submodule, records, total, loading, error, keyword, setKeyword, onDocumentSelect = null }) {
  const { state, dispatch } = useGlobalFilter();
  const [selectedGroupId, setSelectedGroupId] = useState("");
  const [selectedEntryId, setSelectedEntryId] = useState("");
  const [expandedGroupIds, setExpandedGroupIds] = useState(() => new Set());
  const [comparisonGroupIds, setComparisonGroupIds] = useState(() => new Set());
  const [focusTerm, setFocusTerm] = useState("");
  const [showFullWindow, setShowFullWindow] = useState(false);
  const [readerPage, setReaderPage] = useState(0);
  const [modalPage, setModalPage] = useState(0);
  const [languageScope, setLanguageScope] = useState("all");
  const entryRefs = useRef(new Map());
  const pendingParagraphRef = useRef(null);
  const query = keyword.trim();
  const searchFilters = useMemo(() => filterParamsFromState(state), [state.filters]);

  const entries = useMemo(() => records.map((row, index) => documentEntry(row, index)), [records]);
  const groups = useMemo(() => groupDocumentEntries(entries), [entries]);
  const visibleGroups = useMemo(() => {
    const needle = query.toLowerCase();
    if (!needle) return groups;
    return groups
      .map((group) => {
        const groupMatch = [group.title, group.dataset?.file_name, group.dataset?.description, group.fullText].join("\n").toLowerCase().includes(needle);
        const entries = group.entries.filter((entry) => [entry.title, entry.content, entry.source, entry.notes].join("\n").toLowerCase().includes(needle));
        if (!groupMatch && !entries.length) return null;
        return { ...group, entries: groupMatch ? group.entries : entries };
      })
      .filter(Boolean);
  }, [groups, query]);
  const selectedGroup = useMemo(() => groups.find((group) => group.id === selectedGroupId) || visibleGroups[0] || groups[0] || null, [groups, visibleGroups, selectedGroupId]);
  const selectedEntry = useMemo(() => {
    if (!selectedGroup) return null;
    return selectedGroup.entries.find((entry) => entry.id === selectedEntryId) || selectedGroup.entries[0] || null;
  }, [selectedEntryId, selectedGroup]);
  const selectedEntryIndex = useMemo(() => selectedGroup?.entries.findIndex((entry) => entry.id === selectedEntry?.id) ?? -1, [selectedEntry, selectedGroup]);
  const selectedEntryParagraphs = useMemo(() => splitReadableParagraphs(selectedEntry?.content || ""), [selectedEntry?.content]);
  const fullParagraphs = useMemo(() => splitReadableParagraphs(selectedGroup?.fullText || ""), [selectedGroup?.fullText]);
  const readerPageCount = Math.max(1, Math.ceil(fullParagraphs.length / readerFullTextPageSize));
  const modalPageCount = Math.max(1, Math.ceil(fullParagraphs.length / modalFullTextPageSize));
  const currentReaderPage = clampPage(readerPage, readerPageCount);
  const currentModalPage = clampPage(modalPage, modalPageCount);
  const readerPageStart = currentReaderPage * readerFullTextPageSize;
  const modalPageStart = currentModalPage * modalFullTextPageSize;
  const visibleReaderParagraphs = useMemo(() => fullParagraphs.slice(readerPageStart, readerPageStart + readerFullTextPageSize), [fullParagraphs, readerPageStart]);
  const visibleModalParagraphs = useMemo(() => fullParagraphs.slice(modalPageStart, modalPageStart + modalFullTextPageSize), [fullParagraphs, modalPageStart]);
  const activeParagraphIndex = useMemo(() => {
    if (!selectedEntryParagraphs.length || !fullParagraphs.length) return -1;
    const target = selectedEntryParagraphs[0];
    return fullParagraphs.findIndex((paragraph) => paragraph.includes(target.slice(0, 30)) || target.includes(paragraph.slice(0, 30)));
  }, [fullParagraphs, selectedEntryParagraphs]);
  const focusParagraphIndex = useMemo(() => {
    const needle = focusTerm.trim().toLowerCase();
    if (!needle || !fullParagraphs.length) return -1;
    return fullParagraphs.findIndex((paragraph) => paragraph.toLowerCase().includes(needle));
  }, [focusTerm, fullParagraphs]);
  const scrollParagraphIndex = focusParagraphIndex >= 0 ? focusParagraphIndex : activeParagraphIndex;
  const activeTerms = useMemo(() => [query, focusTerm].filter(Boolean), [focusTerm, query]);
  const currentMetrics = selectedGroup?.metrics || academicTextMetrics(selectedGroup?.fullText || "", selectedGroup?.entries || []);
  const currentAnalysis = selectedGroup?.analysis || {};
  const currentKeywords = useMemo(() => {
    const backend = Array.isArray(currentAnalysis.top_keywords) ? currentAnalysis.top_keywords : [];
    return backend.length ? backend.slice(0, 48) : selectedGroup?.keywords || [];
  }, [currentAnalysis.top_keywords, selectedGroup?.keywords]);

  const comparisonGroups = useMemo(() => {
    const selected = visibleGroups.filter((group) => comparisonGroupIds.has(group.id));
    return selected.length ? selected : visibleGroups;
  }, [comparisonGroupIds, visibleGroups]);
  const languageOptions = useMemo(() => {
    const availableScripts = currentMetrics.scripts?.profile || [];
    const values = new Set(availableScripts.filter((item) => item.count > 0).map((item) => {
      if (item.key === "Han") return "zh";
      if (item.key === "Latin") return "latin";
      return String(item.key || "").toLowerCase();
    }));
    return documentLanguageScopes.filter((item) => item.value === "all" || values.has(item.value) || item.value === languageScope);
  }, [currentMetrics.scripts, languageScope]);

  const currentMetricCards = [
    ["字符总量", currentAnalysis.char_count || selectedGroup?.fullText.length || 0],
    ["片段数", currentAnalysis.chunk_count || (selectedGroup?.entries.length || 0)],
    ["段落数", currentMetrics.paragraphs],
    ["核心术语", currentMetrics.uniqueTerms],
    ["词汇多样性", currentMetrics.lexicalDiversity],
    ["预计阅读", `${currentAnalysis.reading_minutes || Math.max(1, Math.round((selectedGroup?.fullText.length || 0) / 420))} 分钟`],
  ];

  const insights = useMemo(() => [
    {
      title: "语言结构",
      text: `${currentMetrics.scripts.dominant} 为主，混合指数 ${currentMetrics.scripts.mixIndex}；脚本分布显示 ${currentMetrics.scripts.profile.filter((item) => item.count > 0).map((item) => `${item.label}${Math.round(item.ratio * 100)}%`).join(" / ") || "单一脚本文本"}.`,
    },
    {
      title: "词汇层次",
      text: `核心术语 ${currentMetrics.uniqueTerms} 个，词汇多样性 ${currentMetrics.lexicalDiversity}，平均句长约 ${currentMetrics.avgSentence || 0} 词元，适合做跨语言术语对齐与主题识别。`,
    },
    {
      title: "篇章组织",
      text: `共 ${currentMetrics.paragraphs} 段、${currentMetrics.sentences} 句，平均片段 ${currentMetrics.avgChunk || 0} 字符，显示出 ${currentMetrics.avgChunk > 1600 ? "长篇章节" : "分段密集"} 的结构特征。`,
    },
  ], [currentMetrics]);

  useEffect(() => {
    if (!groups.length) return;
    setSelectedGroupId((current) => (groups.some((group) => group.id === current) ? current : groups[0].id));
  }, [groups]);

  useEffect(() => {
    if (!selectedGroup) return;
    setSelectedEntryId((current) => (selectedGroup.entries.some((entry) => entry.id === current) ? current : selectedGroup.entries[0]?.id || ""));
    setExpandedGroupIds((current) => {
      if (current.has(selectedGroup.id)) return current;
      const next = new Set(current);
      next.add(selectedGroup.id);
      return next;
    });
  }, [selectedGroup]);

  useEffect(() => {
    if (!selectedGroup) return;
    const activeRows = comparisonGroupIds.size
      ? comparisonGroups.flatMap((group) => group.entries).map((entry) => entry.row)
      : selectedGroup.entries.map((entry) => entry.row);
    dispatch({ type: "setAnalysisRecordIds", ids: activeRows.map((row, index) => documentRecordId(row, index)) });
    dispatch({ type: "setAnalysisRecords", records: activeRows });
  }, [comparisonGroupIds.size, comparisonGroups, dispatch, selectedGroup]);

  useEffect(() => () => {
    dispatch({ type: "setAnalysisRecordIds", ids: [] });
    dispatch({ type: "setAnalysisRecords", records: [] });
  }, [dispatch]);

  useEffect(() => {
    if (scrollParagraphIndex < 0) return;
    setReaderPage(pageFromParagraphIndex(scrollParagraphIndex, readerFullTextPageSize));
    pendingParagraphRef.current = { groupId: selectedGroup?.id, index: scrollParagraphIndex };
    const node = entryRefs.current.get(scrollParagraphIndex);
    node?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [scrollParagraphIndex, selectedGroup?.id]);

  useEffect(() => {
    if (!showFullWindow) return;
    setModalPage(pageFromParagraphIndex(Math.max(scrollParagraphIndex, 0), modalFullTextPageSize));
  }, [scrollParagraphIndex, showFullWindow, selectedGroup?.id]);

  useEffect(() => {
    const pending = pendingParagraphRef.current;
    if (!pending || pending.groupId !== selectedGroup?.id || pending.index < 0) return;
    const node = entryRefs.current.get(pending.index);
    if (!node) return;
    pendingParagraphRef.current = null;
    window.requestAnimationFrame(() => node.scrollIntoView({ behavior: "smooth", block: "center" }));
  }, [currentReaderPage, fullParagraphs, selectedGroup?.id, selectedEntryId]);

  function selectGroup(groupId, entryId) {
    const nextGroup = groups.find((group) => group.id === groupId);
    const nextEntry = nextGroup?.entries.find((entry) => entry.id === entryId) || nextGroup?.entries[0];
    if (nextEntry?.row) onDocumentSelect?.(nextEntry.row);
    setSelectedGroupId(groupId);
    if (entryId) setSelectedEntryId(entryId);
    setExpandedGroupIds((current) => {
      const next = new Set(current);
      next.add(groupId);
      return next;
    });
  }

  function selectEntry(groupId, entryId) {
    selectGroup(groupId, entryId);
  }

  function selectParagraphByIndex(index, entryId) {
    const paragraph = fullParagraphs[index];
    if (!paragraph) return;
    const owner = selectedGroup?.entries.find((entry) => entry.content.includes(paragraph));
    if (owner) selectGroup(selectedGroup.id, owner.id);
    else if (entryId) selectGroup(selectedGroup.id, entryId);
    setReaderPage(pageFromParagraphIndex(index, readerFullTextPageSize));
    setModalPage(pageFromParagraphIndex(index, modalFullTextPageSize));
    const term = activeTerms.find(Boolean);
    if (term) setFocusTerm(term);
  }

  function toggleComparison(groupId) {
    setComparisonGroupIds((current) => {
      const next = new Set(current);
      if (next.has(groupId)) next.delete(groupId);
      else next.add(groupId);
      return next;
    });
  }

  function clearComparison() {
    setComparisonGroupIds(new Set());
  }

  function exportGroup(group, format = "txt") {
    if (!group) return;
    if (format === "doc") downloadDocFile(group.title, group.title, group.fullText);
    else downloadTextFile(group.title, group.fullText);
  }

  function exportEntry(entry, format = "txt") {
    if (!entry) return;
    if (format === "doc") downloadDocFile(entry.title, entry.title, entry.content);
    else downloadTextFile(entry.title, entry.content);
  }

  function copyFullText() {
    copyToClipboard(selectedGroup?.fullText || "");
  }

  function openFullWindow(pageIndex = currentReaderPage) {
    setModalPage(clampPage(pageIndex, modalPageCount));
    setShowFullWindow(true);
  }

  function chooseTerm(term, groupOverride = selectedGroup, entryOverride = null) {
    const next = term || "";
    setFocusTerm(next);
    const group = groupOverride;
    if (!next || !group) return;
    const paragraphs = group.id === selectedGroup?.id ? fullParagraphs : splitReadableParagraphs(group.fullText || "");
    const paragraphIndex = paragraphs.findIndex((paragraph) => paragraph.toLowerCase().includes(next.toLowerCase()));
    if (paragraphIndex >= 0) {
      const paragraph = paragraphs[paragraphIndex];
      const owner = group.entries.find((entry) => entry.content.includes(paragraph)) || entryOverride;
      if (group.id !== selectedGroup?.id) selectGroup(group.id, owner?.id || group.entries[0]?.id);
      else if (owner) setSelectedEntryId(owner.id);
      setReaderPage(pageFromParagraphIndex(paragraphIndex, readerFullTextPageSize));
      setModalPage(pageFromParagraphIndex(paragraphIndex, modalFullTextPageSize));
      pendingParagraphRef.current = { groupId: group.id, index: paragraphIndex };
      if (group.id === selectedGroup?.id) {
        window.requestAnimationFrame(() => entryRefs.current.get(paragraphIndex)?.scrollIntoView({ behavior: "smooth", block: "center" }));
      }
    } else if (group.id !== selectedGroup?.id) {
      selectGroup(group.id, entryOverride?.id || group.entries[0]?.id);
    } else if (entryOverride) {
      setSelectedEntryId(entryOverride.id);
    }
  }

  if (loading && !groups.length) {
    return <section className="knowledge-document-workspace"><div className="platform-skeleton" style={{ minHeight: 420 }} /></section>;
  }

  if (!selectedGroup) {
    return (
      <section className="knowledge-document-workspace">
        <div className="platform-page-error">{error || "当前子模块没有可解析的文档。"}</div>
      </section>
    );
  }

  return (
    <section className="knowledge-document-workspace">
      <header className="knowledge-document-heading">
        <div>
          <strong>文档解析阅读工作台</strong>
          <span>{domain?.name} / {submodule?.name}：左侧为文档树，右侧为全文、统计与图谱分析。</span>
        </div>
        <div className="knowledge-document-heading-controls">
          <label>
            <span>全文检索</span>
            <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="检索片段、术语、段落内容" />
          </label>
          <label>
            <span>语种范围</span>
            <select value={languageScope} onChange={(event) => setLanguageScope(event.target.value)}>
              {languageOptions.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
            </select>
          </label>
        </div>
        <div className="knowledge-document-heading-actions">
          <AcademicCorpusSearchButton
            label="语料库检索"
            title={`${submodule?.name || "当前子模块"}语料库检索`}
            description="检索文档解析阅读工作台与当前知识库语料，返回来源文档、片段位置、全文分布、检索词共现关系和高亮上下文。"
            defaultQuery={focusTerm || query}
            source="submodule"
            submoduleId={submodule?.id || ""}
            filters={searchFilters}
          />
          {query && <button type="button" onClick={() => setKeyword("")}>清除检索</button>}
          <button type="button" onClick={() => openFullWindow()}>全文窗口</button>
        </div>
      </header>

      {error && <div className="platform-page-error">{error}</div>}

      <div className="knowledge-document-main">
        <section className="knowledge-document-entry-panel">
          <header>
            <div>
              <strong>解析文本条目</strong>
              <span>{visibleGroups.length} 份文档 · {selectedGroup.entries.length} 个片段</span>
            </div>
            <div className="knowledge-document-entry-actions">
              <button type="button" onClick={() => setExpandedGroupIds(new Set(visibleGroups.map((group) => group.id)))}>全部展开</button>
              <button type="button" onClick={() => setExpandedGroupIds(new Set([selectedGroup.id]))}>只看当前</button>
              <button type="button" onClick={clearComparison}>清空比较</button>
            </div>
          </header>
          <div className="knowledge-document-entry-scroll">
            {visibleGroups.map((group) => {
              const expanded = expandedGroupIds.has(group.id);
              const groupSelected = group.id === selectedGroup.id;
              return (
                <div className={`knowledge-document-group ${groupSelected ? "active" : ""}`} key={group.id}>
                  <div className="knowledge-document-group-header">
                    <button className="knowledge-document-group-toggle" type="button" onClick={() => {
                      setExpandedGroupIds((current) => {
                        const next = new Set(current);
                        if (next.has(group.id)) next.delete(group.id);
                        else next.add(group.id);
                        return next;
                      });
                      selectGroup(group.id, group.entries[0]?.id);
                    }}>
                      <span className={`document-group-caret ${expanded ? "open" : ""}`}>⌄</span>
                      <div className="knowledge-document-group-main">
                        <strong>{group.order}. {group.title}</strong>
                        <small>{group.dataset?.file_name || group.dataset?.description || "上传文档"} · {group.entries.length} 片段 · {group.metrics.paragraphs} 段落 · {group.metrics.scripts.dominant}</small>
                      </div>
                    </button>
                    <div className="knowledge-document-group-actions">
                      <label className="knowledge-document-compare">
                        <input type="checkbox" checked={comparisonGroupIds.has(group.id)} onChange={() => toggleComparison(group.id)} />
                        <span>比较</span>
                      </label>
                      <button type="button" onClick={() => { selectGroup(group.id, group.entries[0]?.id); openFullWindow(0); }}>预览</button>
                      <button type="button" onClick={() => exportGroup(group, "txt")}>TXT</button>
                      <button type="button" onClick={() => exportGroup(group, "doc")}>DOC</button>
                    </div>
                  </div>
                  {expanded && (
                    <table className="knowledge-document-child-table">
                      <thead>
                        <tr>
                          <th>序</th>
                          <th>文段</th>
                          <th>出处</th>
                          <th>字数</th>
                          <th>操作</th>
                        </tr>
                      </thead>
                      <tbody>
                        {group.entries.map((entry, index) => (
                          <tr className={entry.id === selectedEntry?.id ? "active" : ""} key={entry.id}>
                            <td>{index + 1}</td>
                            <td>
                              <button className="document-child-select" type="button" onClick={() => selectEntry(group.id, entry.id)}>
                                <strong>{highlightMulti(entry.title, activeTerms)}</strong>
                                <span>{compactText(entry.content, 120)}</span>
                              </button>
                            </td>
                            <td>{entry.notes || documentModeLabel(entry.textKind)}</td>
                            <td>{entry.charCount.toLocaleString("zh-CN")}</td>
                            <td>
                              <div className="knowledge-document-row-actions">
                                <button type="button" onClick={() => selectEntry(group.id, entry.id)}>定位</button>
                                <button type="button" onClick={() => { selectEntry(group.id, entry.id); openFullWindow(); }}>预览</button>
                                <button type="button" onClick={() => exportEntry(entry, "txt")}>TXT</button>
                                <button type="button" onClick={() => exportEntry(entry, "doc")}>DOC</button>
                              </div>
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )}
                </div>
              );
            })}
            {!visibleGroups.length && <div className="document-empty">没有匹配的文本条目。</div>}
          </div>
        </section>

        <section className="knowledge-document-reader-panel">
          <header>
            <div>
              <span>{documentModeLabel(selectedGroup.dataset?.text_kind || selectedEntry?.textKind)}</span>
              <strong>{selectedGroup.title}</strong>
              <small>{selectedGroup.dataset?.file_name || selectedGroup.dataset?.description || selectedEntry?.source}</small>
            </div>
            <div className="knowledge-document-reader-tools">
              <button type="button" onClick={copyFullText}>复制全文</button>
              <button type="button" onClick={() => exportGroup(selectedGroup, "txt")}>TXT</button>
              <button type="button" onClick={() => exportGroup(selectedGroup, "doc")}>DOC</button>
              <button type="button" onClick={() => openFullWindow()}>全文窗口</button>
            </div>
          </header>

          <dl className="knowledge-document-keyfacts">
            {currentMetricCards.map(([label, value]) => (
              <div key={label}>
                <dt>{label}</dt>
                <dd>{typeof value === "number" ? value.toLocaleString("zh-CN") : value}</dd>
              </div>
            ))}
          </dl>

          <div className="knowledge-document-insights">
            {insights.map((item) => (
              <section key={item.title}>
                <strong>{item.title}</strong>
                <p>{item.text}</p>
              </section>
            ))}
          </div>

          <div className="knowledge-document-keyword-strip">
            {currentKeywords.slice(0, 18).map((item) => (
              <button key={item.word} type="button" onClick={() => chooseTerm(item.word)}>
                {item.word}<span>{item.count}</span>
              </button>
            ))}
          </div>

          <div className="knowledge-document-current-fragment">
            <header>
              <div>
                <strong>当前片段</strong>
                <span>{selectedEntry?.title || "未选择片段"}</span>
              </div>
              <div className="knowledge-document-row-actions">
                <button type="button" onClick={() => exportEntry(selectedEntry, "txt")}>保存</button>
                <button type="button" onClick={() => copyToClipboard(selectedEntry?.content || "")}>复制</button>
              </div>
            </header>
            <p>{highlightMulti(selectedEntry?.content || "暂无片段内容", activeTerms)}</p>
          </div>

          <div className="knowledge-document-pagination">
            <button type="button" disabled={currentReaderPage <= 0} onClick={() => setReaderPage((page) => clampPage(page - 1, readerPageCount))}>上一页</button>
            <span>
              第 {currentReaderPage + 1} / {readerPageCount} 页 · 段落 {fullParagraphs.length ? readerPageStart + 1 : 0}-{Math.min(fullParagraphs.length, readerPageStart + visibleReaderParagraphs.length)} / {fullParagraphs.length}
            </span>
            <button type="button" disabled={currentReaderPage >= readerPageCount - 1} onClick={() => setReaderPage((page) => clampPage(page + 1, readerPageCount))}>下一页</button>
          </div>

          <article className="knowledge-document-fulltext" style={{ fontSize: `${16 * state.textScale}px` }}>
            {visibleReaderParagraphs.map((paragraph, offset) => {
              const index = readerPageStart + offset;
              const matchedEntry = selectedGroup.entries.find((entry) => entry.content.includes(paragraph));
              const isActive = index === activeParagraphIndex || index === focusParagraphIndex || (matchedEntry && matchedEntry.id === selectedEntry?.id);
              return (
                <p
                  className={isActive ? "selected-source" : ""}
                  key={`${index}-${paragraph.slice(0, 12)}`}
                  ref={(node) => {
                    if (node) entryRefs.current.set(index, node);
                    else entryRefs.current.delete(index);
                  }}
                  onClick={() => selectParagraphByIndex(index, matchedEntry?.id)}
                >
                  {highlightMulti(paragraph, activeTerms)}
                </p>
              );
            })}
            {!visibleReaderParagraphs.length && <p>暂无可展示的全文内容。</p>}
          </article>
        </section>
      </div>

      <DocumentFullWindowModal
        open={showFullWindow}
        group={selectedGroup}
        entry={selectedEntry}
        paragraphs={fullParagraphs}
        page={currentModalPage}
        pageCount={modalPageCount}
        pageStart={modalPageStart}
        visibleParagraphs={visibleModalParagraphs}
        textMetrics={currentMetricCards}
        insights={insights}
        keywords={currentKeywords}
        focusTerm={focusTerm}
        query={query}
        textScale={state.textScale}
        onClose={() => setShowFullWindow(false)}
        onCopy={copyFullText}
        onSaveTxt={() => exportGroup(selectedGroup, "txt")}
        onSaveDoc={() => exportGroup(selectedGroup, "doc")}
        onPageChange={(page) => setModalPage(clampPage(page, modalPageCount))}
        onSelectParagraph={selectParagraphByIndex}
        onSetFocusTerm={chooseTerm}
      />
    </section>
  );
}

function KnowledgeDataWorkspace({ registry, domain, submodule, tableHeight, onTableHeightChange }) {
  const { state, dispatch } = useGlobalFilter();
  const saved = useMemo(loadTableState, []);
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState(saved.keyword || "");
  const [page, setPage] = useState(saved.page || 1);
  const [pageSize, setPageSize] = useState(saved.pageSize || 20);
  const [sorts, setSorts] = useState(saved.sorts || []);
  const [columnFilters, setColumnFilters] = useState(saved.columnFilters || {});
  const [visibleMap, setVisibleMap] = useState(saved.visibleMap || {});
  const [widthMap, setWidthMap] = useState(saved.widthMap || {});
  const [selectedIds, setSelectedIds] = useState(new Set());
  const [previewRow, setPreviewRow] = useState(null);
  const [openColumnFilter, setOpenColumnFilter] = useState("");
  const [showColumns, setShowColumns] = useState(false);
  const [showExport, setShowExport] = useState(false);
  const [exporting, setExporting] = useState(false);
  const resizingRef = useRef(null);
  const dragRef = useRef(null);

  const columns = useMemo(() => {
    const merged = [...commonColumns, ...(domainColumns[domain?.id] || [])];
    return merged.map((column) => ({
      ...column,
      width: widthMap[column.key] || column.width || 140,
      visible: column.required || visibleMap[column.key] !== false,
    }));
  }, [domain?.id, visibleMap, widthMap]);
  const visibleColumns = columns.filter((column) => column.visible);
  const dataColumns = columns.filter((column) => !column.system);
  const isGermanStoryAtlas = submodule?.id === "stories-german-story-atlas";

  useEffect(() => {
    saveTableState({ keyword, page, pageSize, sorts, columnFilters, visibleMap, widthMap });
  }, [keyword, page, pageSize, sorts, columnFilters, visibleMap, widthMap]);

  useEffect(() => {
    setPage(1);
    setSelectedIds(new Set());
  }, [domain?.id, submodule?.id, keyword, JSON.stringify(columnFilters), pageSize]);

  useEffect(() => {
    if (!submodule?.id) return;
    let canceled = false;
    setLoading(true);
    setError("");
    api.submoduleRecords(submodule.id, { page: 1, page_size: 10000 })
      .then((data) => {
        if (canceled) return;
        setRecords(data.records || []);
        setTotal(data.total || data.records?.length || 0);
      })
      .catch((err) => {
        if (!canceled) setError(err.message || String(err));
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => { canceled = true; };
  }, [submodule?.id]);

  function matchFilter(row, column, filter) {
    if (!filter) return true;
    const value = pickValue(row, column);
    if (filter.op === "in") return !filter.values?.length || filter.values.includes(value);
    if (column.type === "number") {
      const number = Number(String(value).match(/-?\d+(\.\d+)?/)?.[0] || NaN);
      if (Number.isNaN(number)) return false;
      if (filter.op === "gt") return number > Number(filter.value);
      if (filter.op === "lt") return number < Number(filter.value);
      if (filter.op === "eq") return number === Number(filter.value);
      if (filter.op === "between") {
        const [a, b] = String(filter.value || "").split(/[,，-]/).map(Number);
        return number >= Math.min(a, b) && number <= Math.max(a, b);
      }
      return true;
    }
    const text = value.toLowerCase();
    const needle = String(filter.value || "").toLowerCase();
    if (!needle) return true;
    if (filter.op === "contains") return text.includes(needle);
    if (filter.op === "not_contains") return !text.includes(needle);
    if (filter.op === "eq") return text === needle;
    if (filter.op === "neq") return text !== needle;
    return true;
  }

  const tableRecords = useMemo(() => records.filter((row) => {
    if (isDocumentRecord(row)) return false;
    if (!isBuiltinRecord(row)) return true;
    return builtinTableSubmodules.has(submodule?.id);
  }), [records, submodule?.id]);
  const filteredRecords = useMemo(() => {
    const globalNeedle = keyword.trim().toLowerCase();
    const filtered = tableRecords.filter((row) => {
      const visibleText = dataColumns.filter((column) => column.visible !== false).map((column) => pickValue(row, column)).join(" ").toLowerCase();
      if (globalNeedle && !visibleText.includes(globalNeedle)) return false;
      const globalFilterOk = state.filters.every((filter) => {
        const column = columns.find((item) => item.key === filter.field || item.aliases?.includes(filter.field));
        if (!column) return true;
        return pickValue(row, column).toLowerCase().includes(String(filter.value || "").toLowerCase());
      });
      if (!globalFilterOk) return false;
      return Object.entries(columnFilters).every(([key, filter]) => {
        const column = columns.find((item) => item.key === key);
        return !column || matchFilter(row, column, filter);
      });
    });
    const sorted = [...filtered];
    if (sorts.length) {
      sorted.sort((a, b) => {
        for (const sort of sorts) {
          const column = columns.find((item) => item.key === sort.key);
          if (!column) continue;
          const av = pickValue(a, column);
          const bv = pickValue(b, column);
          const result = column.type === "number"
            ? (Number(av.match(/\d+/)?.[0] || 0) - Number(bv.match(/\d+/)?.[0] || 0))
            : av.localeCompare(bv, "zh-Hans-CN");
          if (result) return sort.dir === "asc" ? result : -result;
        }
        return 0;
      });
    }
    return sorted;
  }, [tableRecords, keyword, dataColumns, columnFilters, columns, sorts, state.filters]);

  const selectedRows = useMemo(() => filteredRecords.filter((row) => selectedIds.has(rowId(row))), [filteredRecords, selectedIds]);
  const analysisRows = selectedRows.length ? selectedRows : filteredRecords;
  const localFilterActive = Boolean(keyword.trim()) || Object.keys(columnFilters).length > 0;
  const pageCount = Math.max(1, Math.ceil(filteredRecords.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const pagedRows = filteredRecords.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  useEffect(() => {
    if (!tableRecords.length) return;
    const rowsForCharts = selectedRows.length ? selectedRows : filteredRecords;
    const ids = localFilterActive && !rowsForCharts.length ? ["__no_matching_records__"] : rowsForCharts.map((row) => rowId(row));
    dispatch({ type: "setAnalysisRecordIds", ids });
    dispatch({ type: "setAnalysisRecords", records: rowsForCharts });
  }, [dispatch, selectedRows, filteredRecords, localFilterActive, tableRecords.length]);

  useEffect(() => () => {
    dispatch({ type: "setAnalysisRecordIds", ids: [] });
    dispatch({ type: "setAnalysisRecords", records: [] });
  }, [dispatch]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [state.selectionResetToken]);

  const metrics = useMemo(() => {
    const translator = columns.find((item) => item.key === "translator");
    const publisher = columns.find((item) => item.key === "publisher");
    const country = columns.find((item) => item.key === "country");
    return [
      ["总文献数", filteredRecords.length],
      ["总译者数", new Set(filteredRecords.map((row) => pickValue(row, translator)).filter(Boolean)).size],
      ["总出版社数", new Set(filteredRecords.map((row) => pickValue(row, publisher)).filter(Boolean)).size],
      ["覆盖国家数", new Set(filteredRecords.map((row) => pickValue(row, country)).filter(Boolean)).size],
    ];
  }, [filteredRecords, columns]);

  const filterOptions = useMemo(() => ({
    language: [...new Set(tableRecords.map((row) => pickValue(row, columns.find((item) => item.key === "language") || {})).filter(Boolean))],
    type: [...new Set(tableRecords.map((row) => pickValue(row, columns.find((item) => item.key === "document_type") || {})).filter(Boolean))],
  }), [tableRecords, columns]);

  function applyGlobalFilter(field, value) {
    const next = state.filters.filter((item) => item.field !== field);
    if (value) next.push({ field, op: "contains", value, label: value });
    dispatch({ type: "clearFilters" });
    next.forEach((filter) => dispatch({ type: "addFilter", filter }));
  }

  function toggleSort(column, event) {
    if (column.system) return;
    setSorts((current) => {
      const existing = current.find((item) => item.key === column.key);
      const nextDir = !existing ? "asc" : existing.dir === "asc" ? "desc" : "";
      const rest = event.shiftKey ? current.filter((item) => item.key !== column.key) : [];
      return nextDir ? [...rest, { key: column.key, dir: nextDir }] : rest;
    });
  }

  function rowId(row) {
    return String(row.id || row.record_id || JSON.stringify(row).slice(0, 80));
  }

  function toggleRow(row) {
    const id = rowId(row);
    setSelectedIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function selectCurrentPage() {
    setSelectedIds((current) => {
      const next = new Set(current);
      const allSelected = pagedRows.length > 0 && pagedRows.every((row) => next.has(rowId(row)));
      pagedRows.forEach((row) => {
        if (allSelected) next.delete(rowId(row));
        else next.add(rowId(row));
      });
      return next;
    });
  }

  function startResize(column, event) {
    resizingRef.current = { key: column.key, startX: event.clientX, startWidth: column.width };
    document.body.classList.add("knowledge-resizing");
  }

  useEffect(() => {
    const onMove = (event) => {
      if (resizingRef.current) {
        const { key, startX, startWidth } = resizingRef.current;
        setWidthMap((current) => ({ ...current, [key]: Math.max(80, startWidth + event.clientX - startX) }));
      }
      if (dragRef.current) {
        const next = Math.max(280, Math.min(window.innerHeight - 260, event.clientY - dragRef.current.top));
        onTableHeightChange(next);
      }
    };
    const onUp = () => {
      resizingRef.current = null;
      dragRef.current = null;
      document.body.classList.remove("knowledge-resizing");
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [onTableHeightChange]);

  function exportRows(range, format) {
    const rows = range === "selected" ? selectedRows : range === "page" ? pagedRows : filteredRecords;
    const exportColumns = dataColumns.filter((column) => column.visible !== false);
    const filename = `${submodule?.name || "知识库数据"}-${range === "selected" ? "选中行" : range === "page" ? "当前页" : "全部数据"}`;
    setExporting(true);
    setTimeout(() => {
      if (format === "csv") {
        const csv = "\uFEFF" + [[...exportColumns.map((column) => column.label)], ...rows.map((row) => exportColumns.map((column) => pickValue(row, column)))]
          .map((line) => line.map(csvEscape).join(",")).join("\n");
        downloadBlob(`${filename}.csv`, csv, "text/csv;charset=utf-8");
      } else if (format === "xlsx") {
        const html = `<table>${[exportColumns.map((column) => `<th>${column.label}</th>`).join(""), ...rows.map((row) => `<tr>${exportColumns.map((column) => `<td>${pickValue(row, column)}</td>`).join("")}</tr>`)].join("")}</table>`;
        downloadBlob(`${filename}.xls`, `\uFEFF${html}`, "application/vnd.ms-excel;charset=utf-8");
      } else {
        const html = `<!doctype html><title>${filename}</title><style>body{font-family:SimSun,serif;padding:24px}h1{font-size:18px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ddd;padding:6px;font-size:12px}footer{margin-top:18px;color:#666}</style><h1>中国文学海外译介与中国叙事知识平台</h1><p>筛选条件：${keyword || "无"}</p><table><thead><tr>${exportColumns.map((column) => `<th>${column.label}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${exportColumns.map((column) => `<td>${pickValue(row, column)}</td>`).join("")}</tr>`).join("")}</tbody></table><footer>导出时间：${new Date().toLocaleString("zh-CN")}</footer>`;
        const win = window.open("", "_blank");
        if (win) {
          win.document.write(html);
          win.document.close();
          win.print();
        }
      }
      setExporting(false);
      setShowExport(false);
    }, 300);
  }

  function exportSingleRow(row) {
    const exportColumns = dataColumns.filter((column) => column.visible !== false);
    const csv = "\uFEFF" + [exportColumns.map((column) => column.label), exportColumns.map((column) => pickValue(row, column))]
      .map((line) => line.map(csvEscape).join(",")).join("\n");
    downloadBlob(`${pickValue(row, columns.find((item) => item.key === "title") || {}) || "单条记录"}.csv`, csv, "text/csv;charset=utf-8");
  }

  const activeTags = [
    keyword && { key: "keyword", label: `检索：${keyword}`, clear: () => setKeyword("") },
    ...state.filters.map((filter, index) => ({
      key: `global-${index}`,
      label: filter.label || `${filter.field}：${filter.value}`,
      clear: () => dispatch({ type: "removeFilter", index }),
    })),
    ...Object.entries(columnFilters).map(([key]) => {
      const column = columns.find((item) => item.key === key);
      return { key, label: `${column?.label || key} 已筛选`, clear: () => setColumnFilters((current) => { const next = { ...current }; delete next[key]; return next; }) };
    }),
  ].filter(Boolean);

  if (isGermanStoryAtlas) {
    const uploadedTableRecords = tableRecords.filter((row) => !isBuiltinRecord(row));
    return (
      <section className="knowledge-region knowledge-region-table">
        <header className="knowledge-region-heading"><strong>表格区域</strong></header>
        <div className="knowledge-data-workspace german-story-table-workspace">
          <GermanStoryAtlasWorkbench component={{ id: "german-story-atlas", span: 24 }} region="table" />
          {uploadedTableRecords.length > 0 && (
            <section className="knowledge-table-panel german-story-uploaded-table" style={{ height: tableHeight }}>
              <header className="knowledge-table-toolbar">
                <div>
                  <strong>用户上传表格</strong>
                  <span>共 {uploadedTableRecords.length} 条记录</span>
                </div>
              </header>
              <div className="knowledge-table-scroll">
                <table className="knowledge-data-table">
                  <thead>
                    <tr>{visibleColumns.map((column) => <th key={column.key} style={{ width: column.width, minWidth: column.width }}>{column.label}</th>)}</tr>
                  </thead>
                  <tbody>
                    {uploadedTableRecords.slice(0, pageSize).map((row, index) => (
                      <tr key={rowId(row)}>
                        {visibleColumns.map((column) => (
                          <td key={column.key} style={{ width: column.width, minWidth: column.width }}>
                            {column.key === "__index" ? index + 1 : column.key === "__select" ? "" : column.key === "__actions" ? "" : pickValue(row, column)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          )}
        </div>
      </section>
    );
  }

  if (loading && !records.length) {
    return (
      <section className="knowledge-region knowledge-region-table">
        <header className="knowledge-region-heading"><strong>表格区域</strong></header>
        <div className="platform-skeleton" style={{ minHeight: 360 }} />
      </section>
    );
  }

  if (!tableRecords.length) return null;

  return (
    <section className="knowledge-region knowledge-region-table">
      <header className="knowledge-region-heading"><strong>表格区域</strong></header>
      <div className="knowledge-data-workspace">
      <div className="knowledge-global-filters">
        <label>知识域<input value={domain?.name || ""} readOnly /></label>
        <label>语种<select onChange={(event) => applyGlobalFilter("language", event.target.value)} defaultValue=""><option value="">全部语种</option>{filterOptions.language.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
        <label>出版年份范围<input placeholder="例如 1900-1950" onBlur={(event) => event.target.value && setColumnFilters((current) => ({ ...current, publish_year: { op: "between", value: event.target.value } }))} /></label>
        <label>文献类型<select onChange={(event) => applyGlobalFilter("document_type", event.target.value)} defaultValue=""><option value="">全部类型</option>{filterOptions.type.map((item) => <option key={item} value={item}>{item}</option>)}</select></label>
      </div>

      <div className="knowledge-filter-tags">
        {activeTags.map((tag) => <span key={tag.key}>{tag.label}<button type="button" onClick={tag.clear}>×</button></span>)}
        {activeTags.length > 0 && <button type="button" onClick={() => { setKeyword(""); setColumnFilters({}); dispatch({ type: "clearFilters" }); }}>清除全部筛选</button>}
      </div>

      <section className="knowledge-table-panel" style={{ height: tableHeight }}>
        <header className="knowledge-table-toolbar">
          <div>
            <strong>数据表格</strong>
            <span>共 {filteredRecords.length} 条记录，第 {currentPage} 页 / 共 {pageCount} 页</span>
          </div>
          <input value={keyword} onChange={(event) => setKeyword(event.target.value)} placeholder="搜索标题、译者、出版社、关键词..." />
          <button type="button" onClick={() => setShowColumns((value) => !value)}>列设置</button>
          <button type="button" onClick={() => setShowExport((value) => !value)}>导出</button>
          {showColumns && (
            <div className="knowledge-column-menu">
              {dataColumns.map((column) => (
                <label key={column.key}>
                  <input type="checkbox" checked={column.visible !== false} onChange={(event) => setVisibleMap((current) => ({ ...current, [column.key]: event.target.checked }))} />
                  <span>{column.label}</span>
                </label>
              ))}
            </div>
          )}
          {showExport && (
            <div className="knowledge-export-menu">
              {["page", "selected", "all"].map((range) => (
                <div key={range}>
                  <strong>{range === "page" ? "当前页" : range === "selected" ? "选中行" : "全部数据"}</strong>
                  <button type="button" onClick={() => exportRows(range, "xlsx")}>Excel</button>
                  <button type="button" onClick={() => exportRows(range, "csv")}>CSV</button>
                  <button type="button" onClick={() => exportRows(range, "pdf")}>PDF</button>
                </div>
              ))}
              {exporting && <progress />}
            </div>
          )}
        </header>

        <div className="knowledge-table-scroll">
          <table className="knowledge-data-table">
            <thead>
              <tr>
                {visibleColumns.map((column) => {
                  const sort = sorts.find((item) => item.key === column.key);
                  const values = [...new Set(records.map((row) => pickValue(row, column)).filter(Boolean))];
                  return (
                    <th key={column.key} className={column.locked ? `locked ${column.key.replace("__", "")}` : ""} style={{ width: column.width, minWidth: column.width }}>
                      <button type="button" onClick={(event) => toggleSort(column, event)}>
                        {column.key === "__select" ? <input type="checkbox" checked={pagedRows.length > 0 && pagedRows.every((row) => selectedIds.has(rowId(row)))} onChange={selectCurrentPage} onClick={(event) => event.stopPropagation()} /> : column.label}
                        {sort && <span className="sort-mark">{sort.dir === "asc" ? "↑" : "↓"}</span>}
                      </button>
                      {!column.system && <button className="filter-button" type="button" onClick={(event) => { event.stopPropagation(); setOpenColumnFilter(openColumnFilter === column.key ? "" : column.key); }}>筛选</button>}
                      <span className="column-resizer" onMouseDown={(event) => startResize(column, event)} />
                      {openColumnFilter === column.key && (
                        <FilterPanel
                          column={column}
                          values={values}
                          filter={columnFilters[column.key]}
                          onApply={(filter) => setColumnFilters((current) => {
                            const next = { ...current };
                            if (filter) next[column.key] = filter;
                            else delete next[column.key];
                            return next;
                          })}
                          onClose={() => setOpenColumnFilter("")}
                        />
                      )}
                    </th>
                  );
                })}
              </tr>
            </thead>
            <tbody>
              {loading && Array.from({ length: 8 }, (_, index) => (
                <tr className="knowledge-skeleton-row" key={index}>{visibleColumns.map((column) => <td key={column.key}><span /></td>)}</tr>
              ))}
              {!loading && pagedRows.map((row, index) => {
                const id = rowId(row);
                const selected = selectedIds.has(id);
                return (
                  <tr className={selected ? "selected selectable-row" : "selectable-row"} key={id} onClick={() => toggleRow(row)}>
                    {visibleColumns.map((column) => (
                      <td key={column.key} className={column.locked ? `locked ${column.key.replace("__", "")}` : ""} style={{ width: column.width, minWidth: column.width }}>
                        {column.key === "__select" ? <input type="checkbox" checked={selected} onChange={() => toggleRow(row)} onClick={(event) => event.stopPropagation()} /> :
                          column.key === "__index" ? ((currentPage - 1) * pageSize + index + 1) :
                          column.key === "__actions" ? <span className="knowledge-row-actions" onClick={(event) => event.stopPropagation()}><button type="button" onClick={() => setPreviewRow(row)}>预览</button><button type="button" onClick={() => exportSingleRow(row)}>导出</button></span> :
                          highlight(pickValue(row, column), keyword)}
                      </td>
                    ))}
                  </tr>
                );
              })}
              {!loading && !pagedRows.length && (
                <tr className="knowledge-empty-row">
                  <td colSpan={visibleColumns.length}>
                    <strong>{error || "暂无符合条件的数据，请调整筛选条件"}</strong>
                    <button type="button" onClick={() => { setKeyword(""); setColumnFilters({}); dispatch({ type: "clearFilters" }); }}>重置所有筛选</button>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>

        <footer className="knowledge-pagination">
          <span>共 {filteredRecords.length || total} 条记录，第 {currentPage} 页 / 共 {pageCount} 页</span>
          <select value={pageSize} onChange={(event) => setPageSize(Number(event.target.value))}>
            {[10, 20, 50, 100].map((value) => <option key={value} value={value}>{value} 条</option>)}
          </select>
          <button type="button" disabled={currentPage <= 1} onClick={() => setPage((value) => Math.max(1, value - 1))}>上一页</button>
          <button type="button" disabled={currentPage >= pageCount} onClick={() => setPage((value) => Math.min(pageCount, value + 1))}>下一页</button>
          <input
            aria-label="跳转页码"
            placeholder="页码"
            onKeyDown={(event) => {
              if (event.key === "Enter") setPage(Math.min(pageCount, Math.max(1, Number(event.currentTarget.value) || 1)));
            }}
          />
        </footer>
      </section>

      <div
        className="knowledge-resize-bar"
        role="separator"
        onMouseDown={(event) => {
          dragRef.current = { top: document.querySelector(".knowledge-data-workspace")?.getBoundingClientRect().top || 0 };
          event.preventDefault();
        }}
      >
      </div>

      <div className="knowledge-analysis-status">
        <span>当前显示：{analysisRows.length} 条{selectedRows.length ? "选中记录" : "筛选记录"}</span>
        {selectedRows.length > 0 && <button type="button" onClick={() => dispatch({ type: "clearAnalysisSelection" })}>清除选择</button>}
      </div>

      <PreviewModal row={previewRow} columns={columns} keyword={keyword} onClose={() => setPreviewRow(null)} />
      </div>
    </section>
  );
}

function KnowledgeTextWorkspace({ registry, domain, submodule }) {
  const componentMap = useMemo(() => new Map((registry.components || []).map((component) => [component.id, component])), [registry.components]);
  const [records, setRecords] = useState([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [keyword, setKeyword] = useState("");
  const [germanDocumentId, setGermanDocumentId] = useState("");
  const textAnalysisComponent = componentMap.get("advanced-text-visuals") || { id: "advanced-text-visuals", name: "文本分析", span: 24 };
  const documentRecords = useMemo(() => records.filter(isDocumentRecord), [records]);
  const hasTextArea = submodule?.id === "stories-german-story-atlas" || documentRecords.length > 0;

  useEffect(() => {
    if (!submodule?.id) return undefined;
    let canceled = false;
    setLoading(true);
    setError("");
    const loader = submodule.id === "stories-german-story-atlas"
      ? Promise.all([
        api.germanStoryCorpus({ scope: "single", documentId: germanDocumentId }),
        api.submoduleRecords(submodule.id, { page: 1, page_size: 10000 }).catch(() => ({ records: [] })),
      ])
      : api.submoduleRecords(submodule.id, { page: 1, page_size: 10000 });
    loader
      .then((data) => {
        if (canceled) return;
        const nextRecords = submodule.id === "stories-german-story-atlas"
          ? [
            ...germanCorpusToReaderRecords(data[0]),
            ...((data[1]?.records || []).filter(isDocumentRecord)),
          ]
          : (data.records || []);
        setRecords(nextRecords);
        setTotal((Array.isArray(data) ? (data[0]?.documents?.length || 0) + (data[1]?.records || []).filter(isDocumentRecord).length : data.total) || data.documents?.length || data.records?.length || nextRecords.length || 0);
      })
      .catch((err) => {
        if (!canceled) setError(err.message || String(err));
      })
      .finally(() => {
        if (!canceled) setLoading(false);
      });
    return () => { canceled = true; };
  }, [submodule?.id, submodule?.id === "stories-german-story-atlas" ? germanDocumentId : ""]);

  useEffect(() => {
    setGermanDocumentId("");
  }, [submodule?.id]);

  if (!submodule?.id) return null;

  if (loading && !records.length) {
    return (
      <section className="knowledge-region knowledge-region-text">
        <header className="knowledge-region-heading"><strong>文本区域</strong></header>
        <div className="platform-skeleton" style={{ minHeight: 420 }} />
      </section>
    );
  }

  if (!hasTextArea) return null;

  return (
    <section className="knowledge-region knowledge-region-text">
      <header className="knowledge-region-heading"><strong>文本区域</strong></header>
      {documentRecords.length > 0 && (
        <DocumentKnowledgeWorkspace
          domain={domain}
          submodule={submodule}
          records={documentRecords}
          total={total}
          loading={loading}
          error={error}
          keyword={keyword}
          setKeyword={setKeyword}
          onDocumentSelect={submodule.id === "stories-german-story-atlas" ? (row) => {
            if (row?.source_kind !== "german-corpus-txt") return;
            const nextId = String(row?.id || row?.record_id || "");
            if (nextId && nextId !== germanDocumentId) setGermanDocumentId(nextId);
          } : null}
        />
      )}
      {submodule.id === "stories-german-story-atlas" ? (
        <GermanStoryAtlasWorkbench component={{ id: "german-story-atlas", span: 24 }} region="text" documentId={germanDocumentId} />
      ) : (
        <PlatformVisualization component={textAnalysisComponent} submoduleId={submodule.id} />
      )}
    </section>
  );
}

function KnowledgeGrid({ registry }) {
  const { state } = useGlobalFilter();
  const componentMap = useMemo(() => new Map((registry.components || []).map((component) => [component.id, component])), [registry.components]);
  const domain = (registry.domains || []).find((item) => item.id === state.selectedDomainId) || registry.domains?.[0];
  const submodule = domain?.submodules?.find((item) => item.id === state.selectedSubmoduleId) || domain?.submodules?.[0];
  const enabled = [...(submodule?.enabled_components || [])];
  const hiddenComponents = submodule?.id === "stories-german-story-atlas"
    ? ["metrics", "data-table", "full-text", "advanced-text-visuals", "german-story-atlas"]
    : ["metrics", "data-table", "full-text", "advanced-text-visuals"];
  const components = enabled
    .filter((id) => !hiddenComponents.includes(id))
    .map((id) => componentMap.get(id))
    .filter(Boolean);
  if (!components.length && submodule?.id !== "stories-german-story-atlas") return null;
  return (
    <section className="knowledge-region knowledge-region-visual knowledge-visual-section">
      <header className="knowledge-region-heading"><strong>可视化区域</strong></header>
      <main className="platform-visual-grid" aria-label="可视化区域">
        {submodule?.id === "stories-german-story-atlas" && (
          <GermanStoryAtlasWorkbench component={{ id: "german-story-atlas", span: 24 }} region="visual" />
        )}
        {components.map((component) => <PlatformVisualization component={component} key={component.id} submoduleId={submodule?.id} />)}
      </main>
    </section>
  );
}

function KnowledgeShell({ session }) {
  const { state, dispatch } = useGlobalFilter();
  const [registry, setRegistry] = useState(fallbackRegistry);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [tableHeight, setTableHeight] = useState(() => Math.max(360, window.innerHeight - 300));
  const domains = registry.domains || [];
  const visibleDomains = domains.filter((domain) => domain.is_active !== false);
  const selectedDomain = visibleDomains.find((item) => item.id === state.selectedDomainId) || visibleDomains[0];
  const visibleSubmodules = (selectedDomain?.submodules || []).filter((submodule) => submodule.is_active !== false);
  const selectedSubmodule = visibleSubmodules.find((item) => item.id === state.selectedSubmoduleId) || visibleSubmodules[0];
  const totalSubmodules = visibleDomains.reduce((sum, domain) => sum + (domain.submodules || []).filter((submodule) => submodule.is_active !== false).length, 0);
  const activeComponents = (selectedSubmodule?.enabled_components || []).filter((id) => !["metrics", "data-table", "full-text"].includes(id));

  function applyHashSelection(data = registry) {
    const requested = hashSelection();
    if (!requested.domainId && !requested.submoduleId) return false;
    const requestedDomain = data?.domains?.filter((item) => item.is_active !== false).find((item) => item.id === requested.domainId)
      || data?.domains?.find((item) => item.submodules?.some((submodule) => submodule.id === requested.submoduleId));
    const requestedSubmodule = requestedDomain?.submodules?.find((item) => item.id === requested.submoduleId && item.is_active !== false);
    if (!requestedDomain) return false;
    dispatch({ type: "selectDomain", domainId: requestedDomain.id });
    if (requestedSubmodule) dispatch({ type: "selectSubmodule", submoduleId: requestedSubmodule.id });
    return true;
  }

  function loadRegistry() {
    setLoading(true);
    setError("");
    api.platformRegistry()
      .then((data) => {
        setRegistry(data || fallbackRegistry);
        if (applyHashSelection(data || fallbackRegistry)) return;
        const first = data?.domains?.find((item) => item.is_active !== false);
        if (first && !data.domains.some((item) => item.id === state.selectedDomainId)) {
          dispatch({ type: "selectDomain", domainId: first.id });
        }
      })
      .catch((err) => setError(err.message || String(err)))
      .finally(() => setLoading(false));
  }

  useEffect(() => {
    loadRegistry();
  }, []);

  useEffect(() => {
    const onHashChange = () => applyHashSelection();
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, [registry]);

  useEffect(() => {
    const onStorage = (event) => {
      if (event.key?.includes("platform") || event.key?.includes("dataset")) loadRegistry();
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  return (
    <section className="platform-knowledge-page knowledge-data-first-page">
      <header className="knowledge-page-title">
        <div className="knowledge-title-main">
          <strong>知识库</strong>
          <p>面向中国文学海外译介、世界文学与中国叙事研究的数据治理工作台，支持数据查看、筛选检索、文献预览、全文解析、可视化分析与成果导出。</p>
          <div className="knowledge-title-context" aria-label="当前知识库上下文">
            <span><b>当前知识域</b>{selectedDomain?.name || "待选择"}</span>
            <span><b>当前子模块</b>{selectedSubmodule?.name || "待选择"}</span>
          </div>
        </div>
        <dl className="knowledge-title-metrics">
          <div><dt>知识域</dt><dd>{visibleDomains.length}</dd></div>
          <div><dt>子模块总数</dt><dd>{totalSubmodules}</dd></div>
          <div><dt>当前域模块</dt><dd>{visibleSubmodules.length}</dd></div>
          <div><dt>启用分析组件</dt><dd>{activeComponents.length}</dd></div>
        </dl>
      </header>
      <DomainNav domains={visibleDomains} />
      <SubmoduleNav domain={selectedDomain} />
      {loading && <div className="platform-page-loading">正在加载知识库目录...</div>}
      {error && <div className="platform-page-error">{error}<button type="button" onClick={loadRegistry}>重新加载</button></div>}
      {!loading && !error && selectedSubmodule && (
        <>
          <KnowledgeDataWorkspace
            registry={registry}
            domain={selectedDomain}
            submodule={selectedSubmodule}
            tableHeight={tableHeight}
            onTableHeightChange={setTableHeight}
          />
          <KnowledgeTextWorkspace registry={registry} domain={selectedDomain} submodule={selectedSubmodule} />
          <KnowledgeGrid registry={registry} />
        </>
      )}
    </section>
  );
}

export default function Knowledge({ session }) {
  return (
    <GlobalFilterProvider>
      <KnowledgeShell session={session} />
    </GlobalFilterProvider>
  );
}
