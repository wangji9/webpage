import { useEffect, useMemo, useRef, useState } from "react";
import DocumentMaintenance from "../components/DocumentMaintenance.jsx";
import { api } from "../services/api.js";

const AFFECTED_PAGES = ["知识库", "知识图谱", "智能问答", "统计图表", "出版地地图", "来源地地图", "详情页"];
const SYSTEM_FIELDS = ["title", "author", "translator", "publisher", "publish_year", "country", "city", "theme", "content", "source", "preface", "notes"];
const DEFAULT_COMPONENT_IDS = ["metrics", "knowledge-graph", "global-map", "time-evolution", "word-frequency", "topic-clustering", "comparison", "data-table", "full-text"];
const ROLE_LABELS = { registered: "普通用户", user: "普通用户", researcher: "研究者用户", sub_admin: "子管理员", admin: "管理员" };
const STATUS_LABELS = { active: "启用", pending: "待审核", disabled: "禁用" };

function guessSystemField(header) {
  const value = String(header || "").toLowerCase();
  if (/title|题名|标题|书名|故事/.test(value)) return "title";
  if (/author|作者|作家/.test(value)) return "author";
  if (/translator|译者|翻译|editor|编者/.test(value)) return "translator";
  if (/publisher|出版社|出版机构/.test(value)) return "publisher";
  if (/year|date|年份|年代|出版时间/.test(value)) return "publish_year";
  if (/country|国家/.test(value)) return "country";
  if (/city|城市|出版地/.test(value)) return "city";
  if (/theme|topic|关键词|主题/.test(value)) return "theme";
  if (/source|来源|province|省/.test(value)) return "source";
  if (/preface|序|跋/.test(value)) return "preface";
  if (/note|备注|说明/.test(value)) return "notes";
  return "content";
}

async function detectHeaders(file) {
  if (!file) return [];
  const ext = file.name.split(".").pop().toLowerCase();
  if (["pdf", "docx", "png", "jpg", "jpeg", "webp", "bmp", "tif", "tiff"].includes(ext)) {
    return ["content"];
  }
  if (ext === "json") {
    const data = JSON.parse(await file.text());
    const rows = Array.isArray(data) ? data : data.items || data.rows || data.data || [];
    return rows[0] && typeof rows[0] === "object" && !Array.isArray(rows[0]) ? Object.keys(rows[0]) : [];
  }
  if (ext === "xlsx" || ext === "xls") {
    const XLSX = await import("xlsx");
    const workbook = XLSX.read(await file.arrayBuffer(), { type: "array" });
    const sheet = workbook.Sheets[workbook.SheetNames[0]];
    const rows = XLSX.utils.sheet_to_json(sheet, { header: 1, defval: "" });
    return (rows[0] || []).map((item, index) => String(item || `字段${index + 1}`));
  }
  const first = (await file.text()).replace(/^\uFEFF/, "").split(/\r?\n/).find(Boolean) || "";
  const delimiter = first.includes("\t") ? "\t" : ",";
  return first.split(delimiter).map((item, index) => item.trim() || `字段${index + 1}`);
}

function AdminNotice({ value }) {
  if (!value) return null;
  return <div className="platform-admin-notice">{value}</div>;
}

function knowledgeLink(domainId, submoduleId = "") {
  const params = new URLSearchParams();
  if (domainId) params.set("domain", domainId);
  if (submoduleId) params.set("submodule", submoduleId);
  return `#knowledge${params.toString() ? `?${params.toString()}` : ""}`;
}

function decodeMojibake(value) {
  const text = String(value || "");
  if (!/[ÃÂåæäçèé]/.test(text)) return text;
  try {
    const decoded = decodeURIComponent(escape(text));
    return decoded && decoded !== text ? decoded : text;
  } catch {
    return text;
  }
}

function displayFilename(dataset) {
  return decodeMojibake(dataset.file_name || dataset.filename || dataset.name || "未命名文件");
}

function displayDatasetName(dataset) {
  return decodeMojibake(dataset.name || displayFilename(dataset).replace(/\.[^.]+$/, ""));
}

function TableMaintenance({ registry, datasets, reload }) {
  const domains = (registry.domains || []).filter((domain) => domain.admin_upload_target);
  const [domainId, setDomainId] = useState(domains[0]?.id || "classics");
  const selectedDomain = domains.find((item) => item.id === domainId) || domains[0];
  const [submoduleId, setSubmoduleId] = useState("");
  const [notice, setNotice] = useState("");
  const [file, setFile] = useState(null);
  const [headers, setHeaders] = useState([]);
  const [editingDatasetId, setEditingDatasetId] = useState(null);
  const [datasetEdit, setDatasetEdit] = useState({});
  const [editingSubmoduleId, setEditingSubmoduleId] = useState("");
  const [submoduleDraft, setSubmoduleDraft] = useState({ name: "", description: "", type: "topic", language: "", is_active: true, enabled_components: DEFAULT_COMPONENT_IDS });
  const [draft, setDraft] = useState({ name: "", fileName: "", description: "", affectedPages: AFFECTED_PAGES, keyFields: [] });
  const submoduleNameRef = useRef(null);
  const submodules = selectedDomain?.submodules || [];
  const submoduleKey = submodules.map((item) => item.id).join("|");

  useEffect(() => {
    if (!submodules.length) {
      setSubmoduleId("");
      return;
    }
    if (!submodules.some((item) => item.id === submoduleId)) {
      setSubmoduleId(submodules[0].id);
    }
  }, [selectedDomain?.id, submoduleKey, submoduleId]);

  const selectedSubmodule = submodules.find((item) => item.id === submoduleId);
  const moduleDatasets = datasets.filter((dataset) => dataset.dataset_kind !== "document" && String(dataset.subModuleId || dataset.sub_module_id) === String(submoduleId));

  function startEditSubmodule(submodule) {
    setEditingSubmoduleId(submodule.id);
    setSubmoduleDraft({
      name: submodule.name || "",
      description: submodule.description || "",
      type: submodule.type || "topic",
      language: submodule.language || "",
      is_active: submodule.is_active !== false,
      enabled_components: submodule.enabled_components || DEFAULT_COMPONENT_IDS
    });
  }

  function resetSubmoduleDraft() {
    setEditingSubmoduleId("");
    setSubmoduleDraft({ name: "", description: "", type: "topic", language: "", is_active: true, enabled_components: DEFAULT_COMPONENT_IDS });
  }

  function startCreateSubmodule() {
    resetSubmoduleDraft();
    window.requestAnimationFrame(() => submoduleNameRef.current?.focus());
  }

  async function saveSubmodule(event) {
    event.preventDefault();
    if (!selectedDomain?.id) return;
    try {
      const payload = { ...submoduleDraft, domainId: selectedDomain.id, knowledge_domain_id: selectedDomain.id };
      const result = editingSubmoduleId
        ? await api.updateSubmodule(editingSubmoduleId, payload)
        : await api.createSubmodule(payload);
      const nextId = result.submodule?.id || editingSubmoduleId;
      setNotice(editingSubmoduleId ? "子模块已更新，知识库展示已同步。" : "子模块已新增，知识库展示已同步。");
      resetSubmoduleDraft();
      await reload();
      if (nextId) setSubmoduleId(nextId);
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function toggleSubmodule(submodule) {
    try {
      await api.updateSubmodule(submodule.id, { ...submodule, is_active: submodule.is_active === false });
      setNotice("子模块状态已更新。");
      await reload();
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function deleteSubmodule(submodule) {
    if (!window.confirm(`确认删除子模块「${submodule.name}」？关联数据表不会自动删除。`)) return;
    try {
      const currentIndex = submodules.findIndex((item) => item.id === submodule.id);
      const nextSubmodule = submodules[currentIndex + 1] || submodules[currentIndex - 1] || null;
      await api.deleteSubmodule(submodule.id);
      setNotice("子模块已删除，知识库展示已同步。");
      resetSubmoduleDraft();
      await reload();
      setSubmoduleId(nextSubmodule?.id || "");
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function deleteDataset(dataset) {
    if (!window.confirm(`确认删除 ${dataset.name || dataset.file_name}？`)) return;
    try {
      await api.deleteAdminDataset(dataset.id);
      setNotice("数据集已删除。");
      reload();
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function uploadUpdate(dataset, nextFile) {
    if (!nextFile) return;
    try {
      const detected = await detectHeaders(nextFile);
      const fieldMappings = {};
      detected.slice(0, 12).forEach((header) => {
        fieldMappings[header] = guessSystemField(header);
      });
      await api.uploadPlatformDataset({ subModuleId: dataset.subModuleId || dataset.sub_module_id || submoduleId, file: nextFile, fieldMappings, name: displayDatasetName(dataset), description: dataset.description || "", affectedPages: dataset.affected_pages || AFFECTED_PAGES, keyFields: dataset.key_fields || [] });
      setNotice("更新文件已上传。");
      reload();
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function onFile(nextFile) {
    setFile(nextFile || null);
    if (!nextFile) return;
    try {
      const detected = await detectHeaders(nextFile);
      setHeaders(detected);
      setDraft((current) => ({
        ...current,
        name: current.name || nextFile.name.replace(/\.[^.]+$/, ""),
        fileName: current.fileName || nextFile.name,
        keyFields: detected.slice(0, 8)
      }));
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function upload(event) {
    event.preventDefault();
    if (!file || !submoduleId) {
      setNotice("请选择子模块和数据文件。");
      return;
    }
    const fieldMappings = {};
    draft.keyFields.forEach((header) => {
      fieldMappings[header] = guessSystemField(header);
    });
    try {
      setNotice("正在上传并解析...");
      await api.uploadPlatformDataset({ subModuleId: submoduleId, file, fieldMappings, name: draft.name, description: draft.description, affectedPages: draft.affectedPages, keyFields: draft.keyFields });
      setNotice("上传完成。");
      setFile(null);
      setHeaders([]);
      setDraft({ name: "", fileName: "", description: "", affectedPages: AFFECTED_PAGES, keyFields: [] });
      reload();
    } catch (error) {
      setNotice(error.message);
    }
  }

  function startEditDataset(dataset) {
    setEditingDatasetId(dataset.id);
    setDatasetEdit({
      name: displayDatasetName(dataset),
      file_name: displayFilename(dataset),
      description: dataset.description || "",
      affected_pages: dataset.affected_pages || AFFECTED_PAGES,
      key_fields: dataset.key_fields || []
    });
  }

  async function saveDatasetEdit(datasetId) {
    try {
      await api.updateAdminDataset(datasetId, datasetEdit);
      setNotice("表格配置已保存，知识库展示已同步。");
      setEditingDatasetId(null);
      reload();
    } catch (error) {
      setNotice(error.message);
    }
  }

  return (
    <section className="platform-admin-section">
      <header className="admin-page-heading">
        <div>
          <strong>表格数据维护</strong>
          <span>维护知识域、子模块与表格数据。这里的配置会直接驱动知识库导航、表格和可视化展示。</span>
        </div>
        <a className="admin-open-knowledge" href={knowledgeLink(domainId, submoduleId)}>打开对应知识库</a>
      </header>
      <div className="admin-domain-cards">
        {domains.map((domain) => (
          <button className={domain.id === domainId ? "active" : ""} key={domain.id} type="button" onClick={() => setDomainId(domain.id)}>
            <strong>{domain.name}</strong>
            <span>{domain.submodules?.length || 0} 个子模块</span>
          </button>
        ))}
      </div>
      <section className="admin-submodule-manager">
        <div className="admin-panel-title">
          <div>
            <strong>子模块维护</strong>
            <span>{selectedDomain?.name || "知识域"} 下共 {submodules.length} 个子模块</span>
          </div>
          <button className="platform-primary-button admin-add-submodule" type="button" onClick={startCreateSubmodule}>新增子模块</button>
        </div>
        <div className="admin-submodule-tabs">
          {submodules.map((submodule) => (
            <button className={submodule.id === submoduleId ? "active" : ""} key={submodule.id} type="button" onClick={() => setSubmoduleId(submodule.id)}>
              <span>{submodule.is_active === false ? "停用" : "启用"}</span>
              <strong>{submodule.name}</strong>
            </button>
          ))}
          {!submodules.length && <div className="admin-submodule-empty">当前知识域暂无子模块，请点击右上角新增。</div>}
        </div>
        <form className="admin-submodule-form" onSubmit={saveSubmodule}>
          <div className="admin-form-mode wide">
            <strong>{editingSubmoduleId ? "正在编辑子模块" : "正在新增子模块"}</strong>
            <span>{editingSubmoduleId ? "保存后会同步更新知识库导航与展示组件。" : "填写名称、类型和展示组件后，新子模块会立即出现在知识库中。"}</span>
          </div>
          <label>子模块名称<input ref={submoduleNameRef} value={submoduleDraft.name} onChange={(event) => setSubmoduleDraft((cur) => ({ ...cur, name: event.target.value }))} required /></label>
          <label>类型<select value={submoduleDraft.type} onChange={(event) => setSubmoduleDraft((cur) => ({ ...cur, type: event.target.value }))}><option value="topic">专题</option><option value="language">语种</option><option value="general">总集</option></select></label>
          <label>语种<input value={submoduleDraft.language} onChange={(event) => setSubmoduleDraft((cur) => ({ ...cur, language: event.target.value }))} placeholder="如 German / English" /></label>
          <label className="wide">说明<input value={submoduleDraft.description} onChange={(event) => setSubmoduleDraft((cur) => ({ ...cur, description: event.target.value }))} /></label>
          <fieldset className="wide compact">
            <legend>展示组件</legend>
            {(registry.components || []).map((component) => (
              <label key={component.id}>
                <input checked={submoduleDraft.enabled_components.includes(component.id)} type="checkbox" onChange={(event) => setSubmoduleDraft((cur) => ({ ...cur, enabled_components: event.target.checked ? [...cur.enabled_components, component.id] : cur.enabled_components.filter((id) => id !== component.id) }))} />
                {component.name}
              </label>
            ))}
          </fieldset>
          <div className="admin-form-actions wide">
            <label className="admin-toggle"><input checked={submoduleDraft.is_active} type="checkbox" onChange={(event) => setSubmoduleDraft((cur) => ({ ...cur, is_active: event.target.checked }))} />在知识库中启用</label>
            <button className="platform-primary-button" type="submit">{editingSubmoduleId ? "保存子模块" : "新增子模块"}</button>
            {editingSubmoduleId && <button type="button" onClick={resetSubmoduleDraft}>取消编辑</button>}
            {selectedSubmodule && <button type="button" onClick={() => startEditSubmodule(selectedSubmodule)}>编辑当前</button>}
            {selectedSubmodule && <button type="button" onClick={() => toggleSubmodule(selectedSubmodule)}>{selectedSubmodule.is_active === false ? "启用当前" : "停用当前"}</button>}
            {selectedSubmodule && <button className="danger" type="button" onClick={() => deleteSubmodule(selectedSubmodule)}>删除当前</button>}
          </div>
        </form>
      </section>
      <form className="admin-maintenance-form" onSubmit={upload}>
        <div className="admin-panel-title wide">
          <strong>数据表维护</strong>
          <span>当前子模块：{selectedSubmodule?.name || "未选择"}</span>
        </div>
        <label>新增表格名称<input value={draft.name} onChange={(event) => setDraft((cur) => ({ ...cur, name: event.target.value, fileName: cur.fileName || event.target.value }))} required /></label>
        <label>文件名<input value={draft.fileName} onChange={(event) => setDraft((cur) => ({ ...cur, fileName: event.target.value }))} placeholder="默认使用表格名称" /></label>
        <label className="wide">表格说明<input value={draft.description} onChange={(event) => setDraft((cur) => ({ ...cur, description: event.target.value }))} /></label>
        <label className="wide file-zone">文件上传区域<input type="file" accept=".xlsx,.xls,.csv,.tsv,.json" onChange={(event) => onFile(event.target.files?.[0])} /><span>{file ? `${file.name}，识别 ${headers.length} 个表头` : "支持 xlsx / xls / csv / tsv / json，自动识别字段并写入对应子模块"}</span></label>
        <fieldset>
          <legend>影响页面</legend>
          {AFFECTED_PAGES.map((page) => <label key={page}><input checked={draft.affectedPages.includes(page)} type="checkbox" onChange={(event) => setDraft((cur) => ({ ...cur, affectedPages: event.target.checked ? [...cur.affectedPages, page] : cur.affectedPages.filter((item) => item !== page) }))} />{page}</label>)}
        </fieldset>
        <fieldset>
          <legend>关键字段</legend>
          {(headers.length ? headers : SYSTEM_FIELDS).map((field) => <label key={field}><input checked={draft.keyFields.includes(field)} type="checkbox" onChange={(event) => setDraft((cur) => ({ ...cur, keyFields: event.target.checked ? [...cur.keyFields, field] : cur.keyFields.filter((item) => item !== field) }))} />{field}</label>)}
        </fieldset>
        <button className="platform-primary-button" type="submit">新增维护表</button>
      </form>
      <AdminNotice value={notice} />
      <div className="platform-admin-table-wrap">
        <table className="platform-admin-table">
          <thead><tr><th>表格名称</th><th>说明</th><th>影响页面</th><th>关键字段</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            {moduleDatasets.map((dataset) => (
              <tr key={dataset.id}>
                <td><strong>{displayDatasetName(dataset)}</strong><span>{displayFilename(dataset)}</span></td>
                <td>{dataset.error_message || dataset.description || "已接入平台数据层"}</td>
                <td>{(dataset.affected_pages?.length ? dataset.affected_pages : AFFECTED_PAGES.slice(0, 4)).join("、")}</td>
                <td>{dataset.key_fields?.length ? dataset.key_fields.join("、") : `${dataset.field_count || 0} 个字段`}</td>
                <td><span className={`admin-status ${dataset.status}`}>{dataset.status}</span></td>
                <td>
                  <label className="admin-inline-upload">上传更新<input type="file" accept=".xlsx,.xls,.csv,.tsv,.json" onChange={(event) => uploadUpdate(dataset, event.target.files?.[0])} /></label>
                  <button type="button" onClick={() => api.reparseAdminDataset(dataset.id).then(() => { setNotice("重建完成。"); reload(); }).catch((error) => setNotice(error.message))}>重建</button>
                  <button type="button" onClick={() => startEditDataset(dataset)}>编辑</button>
                  <a className="admin-table-link" href={knowledgeLink(dataset.domainId || domainId, dataset.subModuleId || submoduleId)}>查看</a>
                  <button type="button" className="danger" onClick={() => deleteDataset(dataset)}>删除</button>
                </td>
              </tr>
            ))}
            {editingDatasetId && (
              <tr className="admin-edit-row">
                <td colSpan="6">
                  <div className="admin-dataset-edit">
                    <label>表格名称<input value={datasetEdit.name || ""} onChange={(event) => setDatasetEdit((cur) => ({ ...cur, name: event.target.value }))} /></label>
                    <label>文件名<input value={datasetEdit.file_name || ""} onChange={(event) => setDatasetEdit((cur) => ({ ...cur, file_name: event.target.value }))} /></label>
                    <label className="wide">说明<input value={datasetEdit.description || ""} onChange={(event) => setDatasetEdit((cur) => ({ ...cur, description: event.target.value }))} /></label>
                    <fieldset className="wide">
                      <legend>影响页面</legend>
                      {AFFECTED_PAGES.map((page) => (
                        <label key={page}>
                          <input checked={(datasetEdit.affected_pages || []).includes(page)} type="checkbox" onChange={(event) => setDatasetEdit((cur) => ({ ...cur, affected_pages: event.target.checked ? [...(cur.affected_pages || []), page] : (cur.affected_pages || []).filter((item) => item !== page) }))} />
                          {page}
                        </label>
                      ))}
                    </fieldset>
                    <fieldset className="wide">
                      <legend>关键字段</legend>
                      {SYSTEM_FIELDS.map((field) => (
                        <label key={field}>
                          <input checked={(datasetEdit.key_fields || []).includes(field)} type="checkbox" onChange={(event) => setDatasetEdit((cur) => ({ ...cur, key_fields: event.target.checked ? [...(cur.key_fields || []), field] : (cur.key_fields || []).filter((item) => item !== field) }))} />
                          {field}
                        </label>
                      ))}
                    </fieldset>
                    <div className="admin-form-actions wide">
                      <button className="platform-primary-button" type="button" onClick={() => saveDatasetEdit(editingDatasetId)}>保存表格</button>
                      <button type="button" onClick={() => setEditingDatasetId(null)}>取消</button>
                    </div>
                  </div>
                </td>
              </tr>
            )}
            {!moduleDatasets.length && <tr><td colSpan="6">当前子模块暂无维护表。</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function UserManagement() {
  const [users, setUsers] = useState([]);
  const [filter, setFilter] = useState({ role: "all", status: "all", keyword: "" });
  const [notice, setNotice] = useState("");
  const emptyDraft = { username: "", name: "", email: "", password: "", role: "registered", status: "active", institution: "", researchField: "" };
  const [draft, setDraft] = useState(emptyDraft);
  const [editing, setEditing] = useState({});
  function load() {
    api.adminUsers()
      .then((data) => {
        const nextUsers = data.users || [];
        setUsers(nextUsers);
        setEditing(Object.fromEntries(nextUsers.map((user) => [user.id, rowDraft(user)])));
      })
      .catch((error) => setNotice(error.message));
  }
  useEffect(load, []);
  const filtered = users.filter((user) => {
    const keyword = filter.keyword.toLowerCase();
    if (filter.role !== "all" && user.role !== filter.role) return false;
    if (filter.status !== "all" && user.status !== filter.status) return false;
    return !keyword || [user.username, user.name, user.email, user.institution, user.researchField].some((value) => String(value || "").toLowerCase().includes(keyword));
  });

  function rowDraft(user) {
    return {
      username: user.username || "",
      name: user.name || "",
      email: user.email || "",
      password: user.assignedPassword || "",
      role: user.role || "registered",
      status: user.status || "active",
      institution: user.institution || "",
      researchField: user.researchField || user.research_area || ""
    };
  }

  function updateEdit(userId, key, value) {
    setEditing((current) => ({
      ...current,
      [userId]: {
        ...(current[userId] || {}),
        [key]: value
      }
    }));
  }

  async function create(event) {
    event.preventDefault();
    if (!draft.username || !draft.password) {
      setNotice("请填写用户名和初始密码。");
      return;
    }
    try {
      await api.createAdminUser(draft);
      setNotice("用户已创建。");
      setDraft(emptyDraft);
      load();
    } catch (error) {
      setNotice(error.message);
    }
  }
  async function save(user) {
    const payload = editing[user.id] || rowDraft(user);
    try {
      await api.updateAdminUser(user.id, payload);
      setNotice("用户信息已更新。");
      load();
    } catch (error) {
      setNotice(error.message);
    }
  }
  async function remove(user) {
    if (!window.confirm(`确认删除用户「${user.username}」？`)) return;
    try {
      await api.deleteAdminUser(user.id);
      setNotice("用户已删除。");
      load();
    } catch (error) {
      setNotice(error.message);
    }
  }
  return (
    <section className="platform-admin-section">
      <div className="admin-stat-row">
        <div><strong>{users.length}</strong><span>全部账号</span></div>
        <div><strong>{users.filter((user) => user.status === "active").length}</strong><span>已启用</span></div>
        <div><strong>{users.filter((user) => user.role === "sub_admin").length}</strong><span>子管理员</span></div>
      </div>
      <form className="admin-user-form" onSubmit={create}>
        <input placeholder="用户名" value={draft.username} onChange={(event) => setDraft((cur) => ({ ...cur, username: event.target.value }))} required />
        <input placeholder="显示姓名" value={draft.name} onChange={(event) => setDraft((cur) => ({ ...cur, name: event.target.value }))} />
        <input placeholder="邮箱（可选）" type="email" value={draft.email} onChange={(event) => setDraft((cur) => ({ ...cur, email: event.target.value }))} />
        <input placeholder="初始密码" value={draft.password} onChange={(event) => setDraft((cur) => ({ ...cur, password: event.target.value }))} required />
        <select value={draft.role} onChange={(event) => setDraft((cur) => ({ ...cur, role: event.target.value }))}><option value="registered">普通用户</option><option value="researcher">研究者用户</option><option value="sub_admin">子管理员</option></select>
        <select value={draft.status} onChange={(event) => setDraft((cur) => ({ ...cur, status: event.target.value }))}><option value="active">启用</option><option value="disabled">禁用</option><option value="pending">待审核</option></select>
        <input placeholder="机构" value={draft.institution} onChange={(event) => setDraft((cur) => ({ ...cur, institution: event.target.value }))} />
        <input placeholder="研究方向" value={draft.researchField} onChange={(event) => setDraft((cur) => ({ ...cur, researchField: event.target.value }))} />
        <button className="platform-primary-button" type="submit">分配账号</button>
      </form>
      <AdminNotice value={notice} />
      <div className="admin-filter-row">
        <select value={filter.role} onChange={(event) => setFilter((cur) => ({ ...cur, role: event.target.value }))}><option value="all">全部角色</option>{Object.entries(ROLE_LABELS).filter(([key]) => key !== "user").map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select>
        <select value={filter.status} onChange={(event) => setFilter((cur) => ({ ...cur, status: event.target.value }))}><option value="all">全部状态</option>{Object.entries(STATUS_LABELS).map(([key, value]) => <option key={key} value={key}>{value}</option>)}</select>
        <input placeholder="搜索用户名、姓名、邮箱、机构、研究方向" value={filter.keyword} onChange={(event) => setFilter((cur) => ({ ...cur, keyword: event.target.value }))} />
      </div>
      <div className="platform-admin-table-wrap">
        <table className="platform-admin-table">
          <thead><tr><th>用户名</th><th>密码</th><th>姓名 / 邮箱</th><th>角色</th><th>状态</th><th>机构 / 研究方向</th><th>最近登录</th><th>操作</th></tr></thead>
          <tbody>{filtered.map((user) => {
            const row = editing[user.id] || rowDraft(user);
            return (
              <tr key={user.id}>
                <td><input value={row.username} disabled={user.isMasterAdmin} onChange={(event) => updateEdit(user.id, "username", event.target.value)} /></td>
                <td><input value={row.password} onChange={(event) => updateEdit(user.id, "password", event.target.value)} /></td>
                <td>
                  <input placeholder="姓名" value={row.name} onChange={(event) => updateEdit(user.id, "name", event.target.value)} />
                  <input placeholder="邮箱（可选）" type="email" value={row.email} onChange={(event) => updateEdit(user.id, "email", event.target.value)} />
                </td>
                <td><select value={row.role} disabled={user.isMasterAdmin} onChange={(event) => updateEdit(user.id, "role", event.target.value)}><option value="registered">普通用户</option><option value="researcher">研究者用户</option><option value="sub_admin">子管理员</option>{user.isMasterAdmin && <option value="admin">管理员</option>}</select></td>
                <td><select value={row.status} disabled={user.isMasterAdmin} onChange={(event) => updateEdit(user.id, "status", event.target.value)}><option value="active">启用</option><option value="pending">待审核</option><option value="disabled">禁用</option></select></td>
                <td>
                  <input placeholder="机构" value={row.institution} onChange={(event) => updateEdit(user.id, "institution", event.target.value)} />
                  <input placeholder="研究方向" value={row.researchField} onChange={(event) => updateEdit(user.id, "researchField", event.target.value)} />
                </td>
                <td>{user.lastLoginAt || user.last_login_at || "-"}</td>
                <td className="admin-row-actions">
                  <button type="button" onClick={() => save(user)}>保存</button>
                  <button type="button" onClick={() => setEditing((cur) => ({ ...cur, [user.id]: rowDraft(user) }))}>还原</button>
                  {user.isMasterAdmin ? <span>主管理员</span> : <button className="danger" type="button" onClick={() => remove(user)}>删除</button>}
                </td>
              </tr>
            );
          })}</tbody>
        </table>
      </div>
    </section>
  );
}

const SITE_CONTENT_TABS = [
  ["team", "团队成员"],
  ["committee", "学术委员会"],
  ["publications", "学术成果"],
  ["activities", "学术活动"],
  ["dynamics", "平台动态"]
];

const SITE_CONTENT_FIELDS = {
  team: [
    ["name", "姓名", "input", true],
    ["category", "分类", "select", false, ["本院学者", "特聘专家", "双聘研究员", "兼职研究员"]],
    ["role", "职称/身份", "input", false],
    ["organization", "机构", "input", false],
    ["focus", "研究方向", "input", false],
    ["image", "图片文件", "image", false],
    ["intro", "简介", "textarea", false, "wide"]
  ],
  committee: [
    ["name", "姓名", "input", true],
    ["role", "委员身份", "input", false],
    ["org", "机构", "input", false],
    ["image", "图片文件", "image", false]
  ],
  publications: [
    ["title", "成果标题", "input", true],
    ["type", "成果类型", "input", false],
    ["date", "时间", "input", false],
    ["meta", "来源/说明", "input", false],
    ["image", "图片文件", "image", false],
    ["summary", "摘要", "textarea", false, "wide"]
  ],
  activities: [
    ["title", "活动标题", "input", true],
    ["type", "活动类型", "input", false],
    ["date", "时间", "input", false],
    ["image", "图片文件", "image", false],
    ["summary", "摘要", "textarea", false, "wide"]
  ],
  dynamics: [
    ["title", "动态标题", "input", true],
    ["type", "动态类型", "input", false],
    ["topic", "栏目", "select", false, [["focus", "专题聚焦"], ["research", "综合研究"], ["media", "媒体关注"]]],
    ["date", "时间", "input", false],
    ["image", "图片文件", "image", false],
    ["summary", "摘要", "textarea", false, "wide"],
    ["content", "正文", "textarea", false, "wide"]
  ]
};

function emptySiteContentDraft(kind) {
  const base = { visible: true, order: 999 };
  SITE_CONTENT_FIELDS[kind].forEach(([key, , type]) => {
    if (key === "topic") base[key] = "focus";
    else if (key === "focus") base[key] = "";
    else if (type === "select") base[key] = "";
    else base[key] = "";
  });
  if (kind === "team") {
    base.category = "本院学者";
  }
  return base;
}

function siteContentTitle(kind, item) {
  if (kind === "team" || kind === "committee") return item.name || "-";
  return item.title || "-";
}

function siteContentMeta(kind, item) {
  if (kind === "team") return [item.category, item.role, item.organization].filter(Boolean).join(" / ");
  if (kind === "committee") return [item.role, item.org].filter(Boolean).join(" / ");
  return [item.type, item.date, item.meta].filter(Boolean).join(" / ");
}

function SiteContentManagement() {
  const [activeKind, setActiveKind] = useState("team");
  const [content, setContent] = useState({});
  const [assets, setAssets] = useState({ images: [] });
  const [draft, setDraft] = useState(emptySiteContentDraft("team"));
  const [editingId, setEditingId] = useState("");
  const [notice, setNotice] = useState("");

  function load() {
    api.adminSiteContent()
      .then((data) => {
        setContent(data.content || {});
        setAssets(data.assets || { images: [] });
      })
      .catch((error) => setNotice(error.message));
  }

  useEffect(load, []);

  function switchKind(kind) {
    setActiveKind(kind);
    setDraft(emptySiteContentDraft(kind));
    setEditingId("");
    setNotice("");
  }

  function startEdit(item) {
    setEditingId(item.id);
    setDraft({
      ...emptySiteContentDraft(activeKind),
      ...item,
      focus: Array.isArray(item.focus) ? item.focus.join("、") : item.focus || "",
      visible: item.visible !== false
    });
    window.requestAnimationFrame(() => document.querySelector(".admin-content-form input")?.focus());
  }

  function resetDraft() {
    setEditingId("");
    setDraft(emptySiteContentDraft(activeKind));
  }

  async function save(event) {
    event.preventDefault();
    const payload = {
      ...draft,
      order: Number(draft.order || 999),
      visible: draft.visible !== false
    };
    try {
      if (editingId) {
        await api.updateSiteContent(activeKind, editingId, payload);
        setNotice("内容已更新，前端展示已同步。");
      } else {
        await api.createSiteContent(activeKind, payload);
        setNotice("内容已新增，前端展示已同步。");
      }
      resetDraft();
      load();
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function remove(item) {
    if (!window.confirm(`确认删除「${siteContentTitle(activeKind, item)}」？`)) return;
    try {
      await api.deleteSiteContent(activeKind, item.id);
      setNotice("内容已删除，前端展示已同步。");
      if (editingId === item.id) resetDraft();
      load();
    } catch (error) {
      setNotice(error.message);
    }
  }

  async function toggleVisible(item) {
    try {
      await api.updateSiteContent(activeKind, item.id, { ...item, visible: item.visible === false });
      setNotice("显示状态已更新。");
      load();
    } catch (error) {
      setNotice(error.message);
    }
  }

  const rows = content[activeKind] || [];

  return (
    <section className="platform-admin-section admin-content-manager">
      <header className="admin-page-heading">
        <div>
          <strong>内容管理</strong>
          <span>统一维护团队成员、学术成果、学术活动与平台动态，保存后自动同步到前台页面。</span>
        </div>
        <a className="admin-open-knowledge" href="#about" target="_blank" rel="noreferrer">查看前台</a>
      </header>
      <div className="admin-submodule-tabs admin-content-tabs">
        {SITE_CONTENT_TABS.map(([key, label]) => (
          <button key={key} className={activeKind === key ? "active" : ""} type="button" onClick={() => switchKind(key)}>{label}</button>
        ))}
      </div>
      <form className="admin-maintenance-form admin-content-form" onSubmit={save}>
        <div className="admin-form-mode wide">
          <strong>{editingId ? "编辑内容" : "新增内容"}</strong>
          <span>当前模块：{SITE_CONTENT_TABS.find(([key]) => key === activeKind)?.[1]}，仅管理员可维护。</span>
        </div>
        {SITE_CONTENT_FIELDS[activeKind].map(([key, label, type, required, extra]) => (
          <label key={key} className={extra === "wide" ? "wide" : ""}>
            {label}
            {type === "textarea" ? (
              <textarea value={draft[key] || ""} required={required} onChange={(event) => setDraft((cur) => ({ ...cur, [key]: event.target.value }))} />
            ) : type === "select" ? (
              <select value={draft[key] || ""} required={required} onChange={(event) => setDraft((cur) => ({ ...cur, [key]: event.target.value }))}>
                {(extra || []).map((option) => {
                  const value = Array.isArray(option) ? option[0] : option;
                  const text = Array.isArray(option) ? option[1] : option;
                  return <option key={value} value={value}>{text}</option>;
                })}
              </select>
            ) : type === "image" ? (
              <>
                <input list="site-content-images" value={draft[key] || ""} onChange={(event) => setDraft((cur) => ({ ...cur, [key]: event.target.value }))} placeholder="可输入图片文件名或 URL" />
                <datalist id="site-content-images">
                  {(assets.images || []).map((image) => <option key={image} value={image} />)}
                </datalist>
              </>
            ) : (
              <input value={draft[key] || ""} required={required} onChange={(event) => setDraft((cur) => ({ ...cur, [key]: event.target.value }))} />
            )}
          </label>
        ))}
        <label>排序<input type="number" value={draft.order || 999} onChange={(event) => setDraft((cur) => ({ ...cur, order: event.target.value }))} /></label>
        <label className="admin-toggle"><input checked={draft.visible !== false} type="checkbox" onChange={(event) => setDraft((cur) => ({ ...cur, visible: event.target.checked }))} />前台显示</label>
        <div className="admin-form-actions wide">
          <button className="platform-primary-button" type="submit">{editingId ? "保存修改" : "新增内容"}</button>
          {editingId && <button type="button" onClick={resetDraft}>取消编辑</button>}
        </div>
      </form>
      <AdminNotice value={notice} />
      <div className="platform-admin-table-wrap">
        <table className="platform-admin-table admin-content-table">
          <thead><tr><th>标题/姓名</th><th>分类信息</th><th>图片</th><th>排序</th><th>状态</th><th>操作</th></tr></thead>
          <tbody>
            {rows.map((item) => (
              <tr key={item.id}>
                <td><strong>{siteContentTitle(activeKind, item)}</strong><span>{item.summary || item.intro || item.content || ""}</span></td>
                <td>{siteContentMeta(activeKind, item) || "-"}</td>
                <td>{item.image ? <span>{item.image}</span> : "-"}</td>
                <td>{item.order ?? "-"}</td>
                <td><span className={`admin-status ${item.visible === false ? "disabled" : "completed"}`}>{item.visible === false ? "隐藏" : "显示"}</span></td>
                <td>
                  <button type="button" onClick={() => startEdit(item)}>编辑</button>
                  <button type="button" onClick={() => toggleVisible(item)}>{item.visible === false ? "显示" : "隐藏"}</button>
                  <button className="danger" type="button" onClick={() => remove(item)}>删除</button>
                </td>
              </tr>
            ))}
            {!rows.length && <tr><td colSpan="6">当前栏目暂无内容。</td></tr>}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function ModelConfig() {
  const [config, setConfig] = useState({ provider: "gpt", url_base: "", url_key: "", default_model: "gpt-5.4" });
  const [notice, setNotice] = useState("");
  useEffect(() => {
    api.llmConfig("gpt").then((data) => setConfig((cur) => ({ ...cur, url_base: data.url_base || "", default_model: data.default_model || cur.default_model, url_key: "" }))).catch((error) => setNotice(error.message));
  }, []);
  async function save(event) {
    event.preventDefault();
    try {
      await api.saveLlmConfig(config);
      setConfig((cur) => ({ ...cur, url_key: "" }));
      setNotice("保存成功。");
    } catch (error) {
      setNotice(error.message);
    }
  }
  async function test() {
    try {
      const data = await api.testLlmConfig({ ...config, model: config.default_model });
      setNotice(data.ok ? "测试连通成功。" : data.message || "测试失败。");
    } catch (error) {
      setNotice(error.message);
    }
  }
  return (
    <form className="platform-admin-section admin-model-form" onSubmit={save}>
      <label>url_base<input value={config.url_base} onChange={(event) => setConfig((cur) => ({ ...cur, url_base: event.target.value }))} /></label>
      <label>url_key<input type="password" value={config.url_key} onChange={(event) => setConfig((cur) => ({ ...cur, url_key: event.target.value }))} placeholder="保存后不回显" /></label>
      <label>默认模型<input value={config.default_model} onChange={(event) => setConfig((cur) => ({ ...cur, default_model: event.target.value }))} /></label>
      <div><button className="platform-primary-button" type="submit">保存配置</button><button type="button" onClick={test}>测试连通</button></div>
      <AdminNotice value={notice} />
    </form>
  );
}

function SystemConfig() {
  const [active, setActive] = useState("email");
  const [config, setConfig] = useState({ email: {}, cache: {}, backup: {} });
  const [backups, setBackups] = useState({ jobs: [] });
  const [dbHealth, setDbHealth] = useState(null);
  const [notice, setNotice] = useState("");
  function load() {
    api.systemConfig().then((data) => setConfig(data || {})).catch((error) => setNotice(error.message));
    api.backups().then(setBackups).catch(() => {});
  }
  useEffect(load, []);
  async function save() {
    try {
      await api.updateSystemConfig(config);
      setNotice("系统配置已保存。");
    } catch (error) {
      setNotice(error.message);
    }
  }
  async function backup(kind) {
    try {
      setNotice("备份任务执行中...");
      await api.runBackup(kind);
      setNotice("备份完成。");
      load();
    } catch (error) {
      setNotice(error.message);
    }
  }
  async function checkDatabase() {
    try {
      setDbHealth(await api.databaseHealth());
      setNotice("数据库主从状态已刷新。");
    } catch (error) {
      setNotice(error.message);
    }
  }
  return (
    <section className="platform-admin-section">
      <div className="admin-submodule-tabs">{["email", "cache", "backup"].map((key) => <button className={active === key ? "active" : ""} key={key} type="button" onClick={() => setActive(key)}>{key === "email" ? "邮箱配置" : key === "cache" ? "缓存配置" : "备份配置"}</button>)}</div>
      <div className="admin-config-panel">
        {Object.entries(config[active] || {}).map(([key, value]) => <label key={key}>{key}<input value={String(value ?? "")} onChange={(event) => setConfig((cur) => ({ ...cur, [active]: { ...(cur[active] || {}), [key]: event.target.value } }))} /></label>)}
        {!Object.keys(config[active] || {}).length && <span>暂无配置项，可保存后由后端生成默认值。</span>}
      </div>
      <div className="admin-backup-actions"><button className="platform-primary-button" type="button" onClick={save}>保存配置</button><button type="button" onClick={() => backup("database")}>手动数据库备份</button><button type="button" onClick={() => backup("files")}>手动文件备份</button><button type="button" onClick={() => backup("full")}>全量备份</button><button type="button" onClick={() => api.runBackupScheduler().then(() => { setNotice("调度器检查完成。"); load(); }).catch((error) => setNotice(error.message))}>执行调度检查</button><button type="button" onClick={checkDatabase}>主从数据库状态</button></div>
      {dbHealth && <pre className="admin-db-health">{JSON.stringify(dbHealth, null, 2)}</pre>}
      <AdminNotice value={notice} />
      <div className="platform-admin-table-wrap">
        <table className="platform-admin-table"><thead><tr><th>类型</th><th>状态</th><th>路径</th><th>时间</th><th>恢复</th></tr></thead><tbody>{(backups.jobs || []).slice().reverse().map((job) => <tr key={job.id}><td>{job.kind}</td><td>{job.status}</td><td>{job.path}</td><td>{job.created_at}</td><td><button type="button" onClick={() => api.restoreBackup(job.path).then(() => setNotice("恢复完成。")).catch((error) => setNotice(error.message))}>恢复</button></td></tr>)}</tbody></table>
      </div>
    </section>
  );
}

function OperationLogs() {
  const [logs, setLogs] = useState([]);
  const [filter, setFilter] = useState({ user_id: "", operation_type: "", start: "", end: "" });
  function load() {
    api.operationLogs(filter).then((data) => setLogs(data.logs || [])).catch(() => setLogs([]));
  }
  useEffect(load, []);
  return (
    <section className="platform-admin-section">
      <div className="admin-filter-row"><input placeholder="用户 ID" value={filter.user_id} onChange={(event) => setFilter((cur) => ({ ...cur, user_id: event.target.value }))} /><input placeholder="操作类型" value={filter.operation_type} onChange={(event) => setFilter((cur) => ({ ...cur, operation_type: event.target.value }))} /><input type="date" value={filter.start} onChange={(event) => setFilter((cur) => ({ ...cur, start: event.target.value }))} /><input type="date" value={filter.end} onChange={(event) => setFilter((cur) => ({ ...cur, end: event.target.value }))} /><button type="button" onClick={load}>筛选</button><button type="button" onClick={() => api.exportData({ scope: "logs", file_type: "csv" })}>导出操作日志</button></div>
      <div className="platform-admin-table-wrap"><table className="platform-admin-table"><thead><tr><th>操作人</th><th>操作时间</th><th>操作类型</th><th>操作内容</th><th>IP 地址</th></tr></thead><tbody>{logs.map((log) => <tr key={log.id}><td>{log.user_id || "-"}</td><td>{log.created_at}</td><td>{log.operation_type}</td><td>{log.operation_content}</td><td>{log.ip_address || "-"}</td></tr>)}</tbody></table></div>
    </section>
  );
}

export default function Admin({ session }) {
  const isAdmin = ["admin", "sub_admin"].includes(session?.user?.role);
  const master = session?.user?.role === "admin" || session?.user?.isMasterAdmin;
  const [active, setActive] = useState("tables");
  const [registry, setRegistry] = useState({ domains: [], components: [] });
  const [datasets, setDatasets] = useState([]);
  const menu = [
    ["tables", "表格数据维护", true],
    ["documents", "数据维护", true],
    ["content", "内容管理", master],
    ["users", "用户管理", master],
    ["model", "模型接口", master],
    ["system", "系统配置", master],
    ["logs", "操作日志", master]
  ].filter((item) => item[2]);

  function reload() {
    return Promise.all([
      api.platformRegistry().then(setRegistry).catch(() => {}),
      api.platformDatasets().then((data) => setDatasets(data.datasets || [])).catch(() => setDatasets([]))
    ]);
  }

  useEffect(() => {
    reload();
  }, []);

  if (!isAdmin) {
    return <section className="platform-admin-denied">仅管理员可访问后台。</section>;
  }

  return (
    <section className="platform-admin-layout">
      <header className="platform-admin-topbar"><strong>知识平台管理后台</strong><span>{session?.user?.username || "admin"}</span></header>
      <aside className="platform-admin-sidebar">{menu.map(([key, label]) => <button className={active === key ? "active" : ""} key={key} type="button" onClick={() => setActive(key)}>{label}</button>)}</aside>
      <main className="platform-admin-main">
        {active === "tables" && <TableMaintenance registry={registry} datasets={datasets} reload={reload} />}
        {active === "documents" && <DocumentMaintenance registry={registry} datasets={datasets} reload={reload} />}
        {active === "content" && master && <SiteContentManagement />}
        {active === "users" && master && <UserManagement />}
        {active === "model" && master && <ModelConfig />}
        {active === "system" && master && <SystemConfig />}
        {active === "logs" && master && <OperationLogs />}
      </main>
    </section>
  );
}
