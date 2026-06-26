import { useEffect, useMemo, useRef, useState } from "react";
import { api } from "../services/api.js";

const DOCUMENT_ACCEPT = ".pdf,.docx,.png,.jpg,.jpeg,.webp,.bmp,.tif,.tiff";
const PARSE_MODES = [
  { id: "direct", title: "PDF 直接解析", note: "优先读取 PDF / Word 内嵌文本，速度快，适合可复制文字的文档。" },
  { id: "ocr", title: "大模型 OCR 识别", note: "面向扫描版 PDF、图片和版面复杂资料，调用智能问答同源模型识别。" }
];
const PROGRESS_STEPS = ["上传文件", "抽取文本", "分块建模", "统计分析", "写入知识库"];

function knowledgeLink(domainId, submoduleId) {
  const params = new URLSearchParams({ domain: domainId || "", submodule: submoduleId || "" });
  return `#knowledge?${params.toString()}`;
}

function statusLabel(document) {
  if (document.status === "pending_ocr") return "等待 OCR";
  if (document.status === "failed") return "解析失败";
  if (document.text_kind === "pdf-ocr" || document.text_kind === "ocr") return "OCR 已完成";
  if (document.status === "completed") return "解析完成";
  return document.status || "处理中";
}

function formatNumber(value) {
  return Number(value || 0).toLocaleString("zh-CN");
}

export default function DocumentMaintenance({ registry, datasets, reload }) {
  const domains = (registry.domains || []).filter((domain) => domain.admin_upload_target);
  const [domainId, setDomainId] = useState(domains[0]?.id || "classics");
  const domain = domains.find((item) => item.id === domainId) || domains[0];
  const submodules = domain?.submodules || [];
  const [submoduleId, setSubmoduleId] = useState("");
  const [file, setFile] = useState(null);
  const [draft, setDraft] = useState({ name: "", description: "", parseMode: "direct" });
  const [notice, setNotice] = useState("");
  const [busy, setBusy] = useState(false);
  const [progress, setProgress] = useState({ active: false, percent: 0, stage: "", detail: "", mode: "direct" });
  const [selectedId, setSelectedId] = useState("");
  const [detail, setDetail] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const progressTimerRef = useRef(null);

  useEffect(() => {
    if (!submodules.some((item) => item.id === submoduleId)) setSubmoduleId(submodules[0]?.id || "");
  }, [domainId, submoduleId, submodules]);

  const documents = useMemo(
    () => datasets.filter((item) => item.dataset_kind === "document"),
    [datasets]
  );
  const currentDocuments = documents.filter((item) => String(item.subModuleId || item.sub_module_id) === String(submoduleId));

  useEffect(() => () => window.clearInterval(progressTimerRef.current), []);

  function clearProgressTimer() {
    window.clearInterval(progressTimerRef.current);
    progressTimerRef.current = null;
  }

  function beginProgress(forceOcr) {
    clearProgressTimer();
    const mode = forceOcr ? "ocr" : "direct";
    setProgress({
      active: true,
      percent: 4,
      stage: "上传文件",
      detail: forceOcr ? "正在准备图像化页面与 OCR 请求..." : "正在准备直接文本抽取任务...",
      mode
    });
    progressTimerRef.current = window.setInterval(() => {
      setProgress((current) => {
        const next = Math.min(92, current.percent + (current.percent < 35 ? 4 : current.percent < 72 ? 2 : 0.8));
        const stage = next < 28 ? "上传文件" : next < 52 ? "抽取文本" : next < 72 ? "分块建模" : next < 88 ? "统计分析" : "写入知识库";
        const detail = {
          上传文件: "文件正在进入解析队列，保持页面打开即可。",
          抽取文本: forceOcr ? "模型正在识别扫描页、图片块与版面文字。" : "正在读取 PDF / Word 文本层并校正段落。",
          分块建模: "正在生成文本片段、标题线索与检索索引。",
          统计分析: "正在计算词频、共现关系、篇章密度与阅读量。",
          写入知识库: "正在写入子模块，并刷新前端知识库展示。"
        }[stage];
        return { ...current, percent: next, stage, detail };
      });
    }, 650);
  }

  function updateUploadProgress(event) {
    if (event.phase !== "upload") return;
    setProgress((current) => ({
      ...current,
      active: true,
      percent: Math.max(current.percent, Math.min(32, Math.round(event.progress * 32))),
      stage: "上传文件",
      detail: `已上传 ${formatNumber(Math.round(event.loaded / 1024))} KB / ${formatNumber(Math.round(event.total / 1024))} KB`
    }));
  }

  function completeProgress() {
    clearProgressTimer();
    setProgress((current) => ({ ...current, active: true, percent: 100, stage: "写入知识库", detail: "解析完成，文本条目、全文预览与分析结果已更新。" }));
  }

  function failProgress(message) {
    clearProgressTimer();
    setProgress((current) => ({ ...current, active: true, percent: Math.max(8, current.percent), stage: "解析中断", detail: message || "解析失败，请检查文件或稍后重试。" }));
  }

  async function loadDetail(id) {
    setSelectedId(String(id));
    setDetailLoading(true);
    try {
      setDetail(await api.adminDocument(id));
    } catch (error) {
      setNotice(error.message);
    } finally {
      setDetailLoading(false);
    }
  }

  async function upload(event) {
    event.preventDefault();
    if (!file || !submoduleId) {
      setNotice("请选择目标子模块和文档。");
      return;
    }
    const forceOcr = draft.parseMode === "ocr";
    setBusy(true);
    beginProgress(forceOcr);
    setNotice(forceOcr ? "正在调用大模型 OCR 识别，长文档可能需要较长时间..." : "正在直接解析文档文本层并生成分析结果...");
    try {
      const result = await api.uploadDocumentWithProgress({
        subModuleId: submoduleId,
        file,
        name: draft.name,
        description: draft.description,
        forceOcr,
        onProgress: updateUploadProgress
      });
      completeProgress();
      setNotice("文档已解析、分析并持久化，内容已进入对应子模块。");
      setFile(null);
      setDraft({ name: "", description: "", parseMode: "direct" });
      await reload();
      if (result.document?.id) await loadDetail(result.document.id);
    } catch (error) {
      failProgress(error.message);
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function reparse(document, forceOcr) {
    setBusy(true);
    beginProgress(forceOcr);
    setNotice(forceOcr ? "正在重新 OCR 识别全文..." : "正在重新直接解析文档...");
    try {
      const result = await api.reparseDocument(document.id, forceOcr);
      completeProgress();
      setNotice("重新解析完成，知识库索引已刷新。");
      await reload();
      if (result.document?.id) await loadDetail(result.document.id);
    } catch (error) {
      failProgress(error.message);
      setNotice(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function remove(document) {
    if (!window.confirm(`确认删除文档「${document.name || document.file_name}」及其识别文本吗？`)) return;
    try {
      await api.deleteAdminDataset(document.id);
      setNotice("文档、识别文本与分析结果已删除。");
      if (String(selectedId) === String(document.id)) {
        setSelectedId("");
        setDetail(null);
      }
      await reload();
    } catch (error) {
      setNotice(error.message);
    }
  }

  const analysis = detail?.analysis || {};
  const selected = detail?.dataset;
  const selectedDomainId = selected?.domainId || selected?.domain_id || domainId;
  const selectedSubmoduleId = selected?.subModuleId || selected?.sub_module_id || submoduleId;
  return (
    <section className="platform-admin-section document-maintenance">
      <header className="admin-page-heading">
        <div>
          <strong>数据维护</strong>
          <span>上传 PDF、Word 与图片；优先直接提取文字，扫描件使用与智能问答一致的大模型 OCR，并将结果持久化到对应子模块。</span>
        </div>
        <a className="admin-open-knowledge" href={knowledgeLink(domainId, submoduleId)}>打开前端展示</a>
      </header>

      <div className="admin-domain-cards">
        {domains.map((item) => (
          <button className={item.id === domainId ? "active" : ""} key={item.id} type="button" onClick={() => setDomainId(item.id)}>
            <strong>{item.name}</strong>
            <span>{documents.filter((document) => document.domainId === item.id).length} 份解析文档</span>
          </button>
        ))}
      </div>

      <form className="document-upload-form" onSubmit={upload}>
        <div className="admin-panel-title wide">
          <div><strong>新增文档内容</strong><span>选择解析方式后上传；解析过程会显示上传、抽取、分块、统计和入库进度。</span></div>
          <span className="document-model-badge">OCR 模型：智能问答当前模型</span>
        </div>
        <label>目标子模块<select value={submoduleId} onChange={(event) => setSubmoduleId(event.target.value)}>{submodules.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
        <label>文档名称<input value={draft.name} onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))} placeholder="默认使用文件名" /></label>
        <label>内容说明<input value={draft.description} onChange={(event) => setDraft((current) => ({ ...current, description: event.target.value }))} placeholder="可填写版本、来源或用途" /></label>
        <label className="wide file-zone document-file-zone">
          上传文档
          <input type="file" accept={DOCUMENT_ACCEPT} onChange={(event) => setFile(event.target.files?.[0] || null)} />
          <span>{file ? `${file.name} · ${(file.size / 1024 / 1024).toFixed(2)} MB` : "选择 PDF / DOCX / 图片。支持数百页文档直接解析与分块分析。"}</span>
        </label>
        <div className="document-parse-mode">
          {PARSE_MODES.map((mode) => (
            <button
              className={draft.parseMode === mode.id ? "active" : ""}
              key={mode.id}
              type="button"
              onClick={() => setDraft((current) => ({ ...current, parseMode: mode.id }))}
            >
              <strong>{mode.title}</strong>
              <span>{mode.note}</span>
            </button>
          ))}
        </div>
        <button className="platform-primary-button document-upload-button" type="submit" disabled={busy}>{busy ? "正在处理..." : "解析并加入子模块"}</button>
        {progress.active && (
          <div className={`document-parse-progress wide ${progress.stage === "解析中断" ? "failed" : ""}`}>
            <header>
              <strong>{progress.stage}</strong>
              <span>{Math.round(progress.percent)}%</span>
            </header>
            <div className="document-progress-track"><i style={{ width: `${progress.percent}%` }} /></div>
            <ol>
              {PROGRESS_STEPS.map((step, index) => {
                const activeIndex = Math.max(0, PROGRESS_STEPS.indexOf(progress.stage));
                return <li className={index < activeIndex ? "done" : index === activeIndex ? "active" : ""} key={step}>{step}</li>;
              })}
            </ol>
            <p>{progress.detail}</p>
          </div>
        )}
      </form>

      {notice && <div className="platform-admin-notice">{notice}</div>}

      <div className="document-maintenance-grid">
        <section className="document-list-panel">
          <header><div><strong>已维护文档</strong><span>当前子模块共 {currentDocuments.length} 份</span></div></header>
          <div className="document-list">
            {currentDocuments.map((document) => (
              <button className={String(document.id) === selectedId ? "active" : ""} key={document.id} type="button" onClick={() => loadDetail(document.id)}>
                <span className={`document-status ${document.status}`}>{statusLabel(document)}</span>
                <strong>{document.name || document.file_name}</strong>
                <small>{document.file_name} · {formatNumber(document.analysis?.char_count)} 字符 · {formatNumber(document.analysis?.page_count)} 页</small>
              </button>
            ))}
            {!currentDocuments.length && <div className="document-empty">当前子模块还没有解析文档。</div>}
          </div>
        </section>

        <section className="document-detail-panel">
          {detailLoading && <div className="document-empty">正在读取文档内容...</div>}
          {!detailLoading && !selected && <div className="document-empty">选择左侧文档，查看识别文本与高级分析。</div>}
          {!detailLoading && selected && (
            <>
              <header className="document-detail-header">
                <div><span>{statusLabel(selected)}</span><strong>{selected.name || selected.file_name}</strong><small>{selected.description || selected.file_name}</small></div>
                <div>
                  <button type="button" disabled={busy} onClick={() => reparse(selected, false)}>直接解析</button>
                  <button type="button" disabled={busy} onClick={() => reparse(selected, true)}>大模型 OCR</button>
                  <a className="admin-table-link" href={knowledgeLink(selectedDomainId, selectedSubmoduleId)}>前端查看</a>
                  <button className="danger" type="button" onClick={() => remove(selected)}>删除</button>
                </div>
              </header>
              <div className="document-analysis-cards">
                {[["页数", analysis.page_count], ["字符数", analysis.char_count], ["文本片段", analysis.chunk_count], ["预计阅读", `${analysis.reading_minutes || 0} 分钟`]].map(([label, value]) => <div key={label}><span>{label}</span><strong>{typeof value === "number" ? formatNumber(value) : value}</strong></div>)}
              </div>
              <div className="document-analysis-split">
                <section><h3>高权重关键词</h3><div className="document-keywords">{(analysis.top_keywords || []).slice(0, 24).map((item) => <span key={item.word}>{item.word}<b>{item.count}</b></span>)}</div></section>
                <section><h3>章节与结构线索</h3><ol>{(analysis.headings || []).slice(0, 14).map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}</ol>{!analysis.headings?.length && <p>未检测到明确章节标题，仍可按文本片段阅读与检索。</p>}</section>
              </div>
              <section className="document-text-preview">
                <header><h3>识别文字内容</h3><span>{selected.text_kind === "pdf" ? "PDF 直接解析" : selected.text_kind?.includes("ocr") ? "大模型 OCR" : selected.text_kind}</span></header>
                <article>{String(detail.text || selected.preview_text || "暂无识别文本").split(/\n{2,}/).slice(0, 45).map((paragraph, index) => <p key={`${index}-${paragraph.slice(0, 12)}`}>{paragraph}</p>)}</article>
                {(detail.chunks || []).length > 45 && <footer>全文已分为 {detail.chunks.length} 个片段并写入知识库，可在前端查看、筛选和分析。</footer>}
              </section>
            </>
          )}
        </section>
      </div>
    </section>
  );
}
