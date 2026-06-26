import { useEffect, useMemo, useState } from "react";
import { api } from "../services/api.js";

const roleName = {
  guest: "访客",
  registered: "注册用户",
  researcher: "研究者用户",
  sub_admin: "子管理员",
  admin: "主管理员"
};

const roleRank = {
  registered: 1,
  researcher: 2,
  sub_admin: 3,
  admin: 4
};

const moduleCatalog = [
  { id: "knowledge", title: "知识库", route: "knowledge", minRole: "registered", text: "检索中国文学海外译介、故事集与跨文化研究条目。" },
  { id: "graph", title: "知识图谱", route: "graph", minRole: "registered", text: "查看译介关系、人物机构网络和传播路径。" },
  { id: "chat", title: "智能问答", route: "chat", minRole: "researcher", text: "结合知识库和图谱进行研究型问答。" },
  { id: "upload", title: "数据上传", route: "upload", minRole: "researcher", text: "提交资料、表格和待审核研究数据。" },
  { id: "wilhelm", title: "卫礼贤专题", route: "wilhelm", minRole: "researcher", text: "浏览卫礼贤译本、故事图谱与专题地图。" },
  { id: "admin", title: "管理控制台", route: "admin", minRole: "sub_admin", text: "维护用户、数据集和模型接口配置。" }
];

const tabs = [
  ["overview", "概览", "profile"],
  ["identity", "基本资料", "profile/identity"],
  ["research", "研究偏好", "profile/research"],
  ["settings", "通知与界面", "profile/settings"],
  ["activity", "浏览记录", "profile/activity"],
  ["security", "账号安全", "profile/security"]
];

const tabDescriptions = {
  overview: "账户状态与工作台",
  identity: "姓名、机构与联系方式",
  research: "主题、语种与入口偏好",
  settings: "通知、界面与隐私",
  activity: "最近访问记录",
  security: "密码与安全状态"
};

const emptyForm = {
  name: "",
  email: "",
  institution: "",
  researchField: "",
  title: "",
  phone: "",
  website: "",
  city: "",
  country: "",
  bio: "",
  topicsText: "",
  languageFocusText: "",
  savedModules: ["knowledge", "graph"],
  notificationSettings: { emailDigest: true, securityNotice: true, researchUpdates: true },
  uiSettings: { defaultModule: "knowledge", density: "comfortable", visualTheme: "scholarly" },
  privacySettings: { showEmail: false, showInstitution: true, saveActivity: true },
  featurePreferences: { chatModel: "general", retrievalMode: "graph-rag", mapFocus: "world" }
};

const passwordPattern = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d).{8,}$/;

function listToText(value) {
  return Array.isArray(value) ? value.join("\n") : "";
}

function textToList(value) {
  return String(value || "")
    .split(/[\n,，;；]+/)
    .map((item) => item.trim())
    .filter(Boolean)
    .filter((item, index, array) => array.indexOf(item) === index);
}

function mergeForm(user = {}) {
  const profile = user.profile || {};
  return {
    ...emptyForm,
    name: user.name || "",
    email: user.email || "",
    institution: user.institution || "",
    researchField: user.researchField || "",
    title: profile.title || "",
    phone: profile.phone || "",
    website: profile.website || "",
    city: profile.city || "",
    country: profile.country || "",
    bio: profile.bio || "",
    topicsText: listToText(profile.topics),
    languageFocusText: listToText(profile.languageFocus),
    savedModules: profile.savedModules?.length ? profile.savedModules : emptyForm.savedModules,
    notificationSettings: { ...emptyForm.notificationSettings, ...(profile.notificationSettings || {}) },
    uiSettings: { ...emptyForm.uiSettings, ...(profile.uiSettings || {}) },
    privacySettings: { ...emptyForm.privacySettings, ...(profile.privacySettings || {}) },
    featurePreferences: { ...emptyForm.featurePreferences, ...(profile.featurePreferences || {}) }
  };
}

function tabFromRoute(route) {
  const section = String(route || "").split("/")[1];
  return tabs.some(([id]) => id === section) ? section : "overview";
}

function formatTime(value) {
  if (!value) return "未记录";
  return new Date(Number(value) * 1000).toLocaleString("zh-CN", { hour12: false });
}

function canUseModule(module, role) {
  return (roleRank[role] || 1) >= (roleRank[module.minRole] || 1);
}

function profileMissingItems(form) {
  return [
    ["姓名", form.name],
    ["机构", form.institution],
    ["研究方向", form.researchField],
    ["常驻地区", form.city || form.country],
    ["研究主题", textToList(form.topicsText).length],
    ["关注语种", textToList(form.languageFocusText).length],
    ["个人简介", form.bio]
  ]
    .filter(([, value]) => !value)
    .map(([label]) => label);
}

export default function Profile({ session, setSession, route = "profile" }) {
  const [activeTab, setActiveTab] = useState(tabFromRoute(route));
  const [form, setForm] = useState(() => mergeForm(session.user));
  const [stats, setStats] = useState({ profileCompletion: 0, activityCount: 0, topicCount: 0, savedModuleCount: 0 });
  const [activity, setActivity] = useState([]);
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState("");
  const [passwordForm, setPasswordForm] = useState({ currentPassword: "", newPassword: "", confirmPassword: "" });

  const userRole = session.user?.role || "registered";
  const accessibleModules = useMemo(() => moduleCatalog.filter((item) => canUseModule(item, userRole)), [userRole]);
  const savedModules = useMemo(
    () => accessibleModules.filter((item) => form.savedModules.includes(item.id)),
    [accessibleModules, form.savedModules]
  );

  useEffect(() => {
    setActiveTab(tabFromRoute(route));
  }, [route]);

  useEffect(() => {
    if (!session.loggedIn) {
      setLoading(false);
      return undefined;
    }
    let cancelled = false;
    setLoading(true);
    setError("");
    api.profile()
      .then((data) => {
        if (cancelled) return;
        setForm(mergeForm(data.user));
        setStats(data.stats || {});
        setActivity(data.activity || []);
      })
      .catch((err) => {
        if (!cancelled) setError(err.message);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [session.loggedIn, session.user?.id]);

  function updateField(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function updateGroup(group, key, value) {
    setForm((current) => ({ ...current, [group]: { ...current[group], [key]: value } }));
  }

  function toggleModule(moduleId) {
    setForm((current) => {
      const exists = current.savedModules.includes(moduleId);
      return {
        ...current,
        savedModules: exists
          ? current.savedModules.filter((id) => id !== moduleId)
          : [...current.savedModules, moduleId]
      };
    });
  }

  function profilePayload() {
    return {
      name: form.name,
      email: form.email,
      institution: form.institution,
      researchField: form.researchField,
      title: form.title,
      phone: form.phone,
      website: form.website,
      city: form.city,
      country: form.country,
      bio: form.bio,
      topics: textToList(form.topicsText),
      languageFocus: textToList(form.languageFocusText),
      savedModules: form.savedModules,
      notificationSettings: form.notificationSettings,
      uiSettings: form.uiSettings,
      privacySettings: form.privacySettings,
      featurePreferences: form.featurePreferences
    };
  }

  async function saveProfile(event, scope = "profile") {
    event?.preventDefault();
    setSaving(scope);
    setNotice("正在保存个人中心信息...");
    setError("");
    try {
      const result = await api.updateProfile(profilePayload());
      setForm(mergeForm(result.user));
      setStats(result.stats || {});
      setActivity(result.activity || []);
      setSession({ loggedIn: true, user: result.user });
      setNotice("个人中心信息已保存到数据库。");
    } catch (err) {
      setError(err.message);
      setNotice("");
    } finally {
      setSaving("");
    }
  }

  async function changePassword(event) {
    event.preventDefault();
    setError("");
    setNotice("");
    if (!passwordPattern.test(passwordForm.newPassword)) {
      setError("新密码至少 8 位，且必须包含大写字母、小写字母和数字。");
      return;
    }
    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setError("两次输入的新密码不一致。");
      return;
    }
    setSaving("security");
    try {
      const result = await api.changePassword({
        currentPassword: passwordForm.currentPassword,
        newPassword: passwordForm.newPassword
      });
      setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" });
      setNotice(result.message || "密码已更新。");
    } catch (err) {
      setError(err.message);
    } finally {
      setSaving("");
    }
  }

  function openTab(tabId) {
    const tab = tabs.find(([id]) => id === tabId) || tabs[0];
    window.location.hash = tab[2];
  }

  function profileCardText() {
    return [
      `姓名：${form.name || session.user?.username || "未填写"}`,
      `账号角色：${roleName[userRole] || roleName.registered}`,
      `所在机构：${form.institution || "未填写"}`,
      `研究方向：${form.researchField || "未填写"}`,
      `关注主题：${textToList(form.topicsText).join("、") || "未设置"}`,
      `关注语种：${textToList(form.languageFocusText).join("、") || "未设置"}`,
      `个人主页：${form.website || "未填写"}`
    ].join("\n");
  }

  async function copyProfileCard() {
    const text = profileCardText();
    try {
      await navigator.clipboard.writeText(text);
      setError("");
      setNotice("研究名片已复制。");
    } catch {
      setError("当前浏览器未允许复制，请稍后重试。");
      setNotice("");
    }
  }

  function exportProfile() {
    const payload = {
      exportedAt: new Date().toISOString(),
      user: {
        id: session.user?.id,
        username: session.user?.username,
        role: userRole
      },
      stats,
      profile: profilePayload(),
      recentActivity: activity.slice(0, 20)
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `profile-${session.user?.username || "account"}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setError("");
    setNotice("个人档案摘要已导出。");
  }

  return (
    <section className="profile-page">
      <div className="profile-hero">
        <div>
          <span>Account Center</span>
          <h1>个人中心</h1>
          <p>管理账号资料、研究偏好、平台浏览记录与安全设置，并将个人信息保存到平台数据库。</p>
        </div>
        <div className="profile-identity-card">
          <span className="profile-avatar">{String(session.user?.name || session.user?.username || "用").slice(0, 1)}</span>
          <div>
            <strong>{form.name || session.user?.username || "访客预览"}</strong>
            <small>{roleName[userRole] || roleName.registered} · {form.institution || "未填写机构"}</small>
          </div>
        </div>
      </div>

      {(notice || error) && <div className={error ? "profile-notice profile-notice-error" : "profile-notice"}>{error || notice}</div>}

      <div className="profile-shell">
        <aside className="profile-sidebar">
          <div className="profile-mini">
            <strong>{stats.profileCompletion || 0}%</strong>
            <span>资料完整度</span>
            <small>{profileMissingItems(form).length ? `仍需补充 ${profileMissingItems(form).length} 项资料` : "核心资料已完整"}</small>
            <div className="profile-progress"><i style={{ width: `${Math.min(100, Number(stats.profileCompletion || 0))}%` }} /></div>
          </div>
          <nav className="profile-tabs" aria-label="个人中心导航">
            {tabs.map(([id, label], index) => (
              <button key={id} className={activeTab === id ? "active" : ""} type="button" onClick={() => openTab(id)}>
                <span>{String(index + 1).padStart(2, "0")}</span>
                <strong>{label}</strong>
                <small>{tabDescriptions[id]}</small>
              </button>
            ))}
          </nav>
          <div className="profile-sidebar-actions">
            <button type="button" onClick={copyProfileCard}>复制研究名片</button>
            <button type="button" onClick={exportProfile}>导出档案摘要</button>
          </div>
        </aside>

        <div className="profile-content">
          {loading ? (
            <div className="profile-panel"><strong>正在加载个人中心信息...</strong></div>
          ) : activeTab === "overview" ? (
            <OverviewPanel
              activity={activity}
              accessibleModules={accessibleModules}
              form={form}
              savedModules={savedModules}
              stats={stats}
              userRole={userRole}
              onCopy={copyProfileCard}
              onExport={exportProfile}
              onTab={openTab}
            />
          ) : activeTab === "identity" ? (
            <IdentityPanel form={form} saving={saving} onField={updateField} onSave={saveProfile} />
          ) : activeTab === "research" ? (
            <ResearchPanel
              accessibleModules={accessibleModules}
              form={form}
              saving={saving}
              onField={updateField}
              onGroup={updateGroup}
              onSave={saveProfile}
              onToggleModule={toggleModule}
            />
          ) : activeTab === "settings" ? (
            <SettingsPanel form={form} saving={saving} onGroup={updateGroup} onSave={saveProfile} />
          ) : activeTab === "activity" ? (
            <ActivityPanel activity={activity} />
          ) : (
            <SecurityPanel form={passwordForm} saving={saving} onChange={setPasswordForm} onSubmit={changePassword} />
          )}
        </div>
      </div>
    </section>
  );
}

function OverviewPanel({ activity, accessibleModules, form, savedModules, stats, userRole, onCopy, onExport, onTab }) {
  const recent = activity.slice(0, 5);
  const missingItems = profileMissingItems(form);
  const defaultModule = moduleCatalog.find((item) => item.id === form.uiSettings.defaultModule);
  const quickActions = [
    { label: "编辑资料", detail: "补充机构、地区与联系方式", tab: "identity" },
    { label: "维护偏好", detail: "调整研究主题和常用入口", tab: "research" },
    { label: "通知设置", detail: "管理邮件、隐私与界面密度", tab: "settings" },
    { label: "账号安全", detail: "更新密码并检查安全提醒", tab: "security" }
  ];
  return (
    <div className="profile-stack">
      <div className="profile-kpis">
        <article><strong>{stats.profileCompletion || 0}%</strong><span>资料完整度</span></article>
        <article><strong>{stats.topicCount || 0}</strong><span>研究主题</span></article>
        <article><strong>{stats.savedModuleCount || 0}</strong><span>常用模块</span></article>
        <article><strong>{stats.activityCount || activity.length}</strong><span>近期浏览</span></article>
        <article><strong>{missingItems.length}</strong><span>待补资料</span></article>
      </div>

      <div className="profile-panel profile-overview-grid">
        <div>
          <span className="profile-section-kicker">Profile</span>
          <h2>{form.name || "未填写姓名"}</h2>
          <p>{form.bio || "可在基本资料中补充个人简介、研究方向、机构和联系方式，便于平台根据角色与偏好组织工作台入口。"}</p>
          <dl className="profile-definition">
            <dt>账号角色</dt><dd>{roleName[userRole] || roleName.registered}</dd>
            <dt>研究方向</dt><dd>{form.researchField || "未填写"}</dd>
            <dt>所在机构</dt><dd>{form.institution || "未填写"}</dd>
            <dt>常驻地区</dt><dd>{[form.city, form.country].filter(Boolean).join(" / ") || "未填写"}</dd>
          </dl>
          <button className="profile-primary-action" type="button" onClick={() => onTab("identity")}>完善基本资料</button>
        </div>
        <div className="profile-topic-card">
          <strong>研究标签</strong>
          <div className="profile-chip-list">
            {textToList(form.topicsText).length ? textToList(form.topicsText).map((item) => <span key={item}>{item}</span>) : <span>尚未设置</span>}
          </div>
          <strong>关注语种</strong>
          <div className="profile-chip-list">
            {textToList(form.languageFocusText).length ? textToList(form.languageFocusText).map((item) => <span key={item}>{item}</span>) : <span>尚未设置</span>}
          </div>
        </div>
      </div>

      <div className="profile-panel profile-utility-panel">
        <div className="profile-panel-title">
          <div><span className="profile-section-kicker">Account Status</span><h2>账户状态与资料清单</h2></div>
          <div className="profile-title-actions">
            <button type="button" onClick={onCopy}>复制名片</button>
            <button type="button" onClick={onExport}>导出摘要</button>
          </div>
        </div>
        <div className="profile-utility-grid">
          <article>
            <strong>待补资料</strong>
            <div className="profile-chip-list">
              {missingItems.length ? missingItems.map((item) => <span key={item}>{item}</span>) : <span>核心资料已完整</span>}
            </div>
            <button type="button" onClick={() => onTab("identity")}>继续完善</button>
          </article>
          <article>
            <strong>工作台偏好</strong>
            <dl className="profile-mini-definition">
              <dt>默认模块</dt><dd>{defaultModule?.title || "知识库"}</dd>
              <dt>检索模式</dt><dd>{form.featurePreferences.retrievalMode === "graph-rag" ? "图谱增强检索" : form.featurePreferences.retrievalMode === "semantic" ? "语义检索" : "表格优先"}</dd>
              <dt>信息密度</dt><dd>{form.uiSettings.density === "compact" ? "紧凑" : "舒展"}</dd>
            </dl>
          </article>
          <article>
            <strong>隐私与记录</strong>
            <dl className="profile-mini-definition">
              <dt>公开邮箱</dt><dd>{form.privacySettings.showEmail ? "已开启" : "未公开"}</dd>
              <dt>公开机构</dt><dd>{form.privacySettings.showInstitution ? "已开启" : "未公开"}</dd>
              <dt>浏览记录</dt><dd>{form.privacySettings.saveActivity ? "保存中" : "不保存"}</dd>
            </dl>
          </article>
        </div>
      </div>

      <div className="profile-panel">
        <div className="profile-panel-title">
          <div><span className="profile-section-kicker">Quick Actions</span><h2>个人中心快捷操作</h2></div>
        </div>
        <div className="profile-action-grid">
          {quickActions.map((item) => (
            <button key={item.tab} type="button" onClick={() => onTab(item.tab)}>
              <strong>{item.label}</strong>
              <span>{item.detail}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="profile-panel">
        <div className="profile-panel-title">
          <div><span className="profile-section-kicker">Workspace</span><h2>常用平台入口</h2></div>
          <button type="button" onClick={() => onTab("research")}>调整偏好</button>
        </div>
        <div className="profile-module-links">
          {(savedModules.length ? savedModules : accessibleModules.slice(0, 4)).map((item) => (
            <a key={item.id} href={`#${item.route}`}>
              <strong>{item.title}</strong>
              <span>{item.text}</span>
            </a>
          ))}
        </div>
      </div>

      <div className="profile-panel">
        <div className="profile-panel-title">
          <div><span className="profile-section-kicker">Activity</span><h2>近期浏览</h2></div>
          <button type="button" onClick={() => onTab("activity")}>查看全部</button>
        </div>
        <ActivityList activity={recent} />
      </div>
    </div>
  );
}

function IdentityPanel({ form, saving, onField, onSave }) {
  return (
    <form className="profile-panel profile-form" onSubmit={(event) => onSave(event, "identity")}>
      <div className="profile-panel-title">
        <div><span className="profile-section-kicker">Information</span><h2>基本资料</h2></div>
        <button type="submit" disabled={saving === "identity"}>{saving === "identity" ? "保存中" : "保存资料"}</button>
      </div>
      <div className="profile-form-grid">
        <label>姓名<input value={form.name} onChange={(event) => onField("name", event.target.value)} /></label>
        <label>邮箱<input type="email" value={form.email} onChange={(event) => onField("email", event.target.value)} /></label>
        <label>机构<input value={form.institution} onChange={(event) => onField("institution", event.target.value)} /></label>
        <label>研究方向<input value={form.researchField} onChange={(event) => onField("researchField", event.target.value)} /></label>
        <label>职称 / 身份<input value={form.title} onChange={(event) => onField("title", event.target.value)} /></label>
        <label>联系电话<input value={form.phone} onChange={(event) => onField("phone", event.target.value)} /></label>
        <label>所在城市<input value={form.city} onChange={(event) => onField("city", event.target.value)} /></label>
        <label>国家 / 地区<input value={form.country} onChange={(event) => onField("country", event.target.value)} /></label>
        <label className="profile-wide">个人主页<input type="url" value={form.website} onChange={(event) => onField("website", event.target.value)} placeholder="https://example.org" /></label>
        <label className="profile-wide">个人简介<textarea value={form.bio} onChange={(event) => onField("bio", event.target.value)} placeholder="可填写研究领域、项目角色、资料使用场景等。" /></label>
      </div>
    </form>
  );
}

function ResearchPanel({ accessibleModules, form, saving, onField, onGroup, onSave, onToggleModule }) {
  return (
    <form className="profile-panel profile-form" onSubmit={(event) => onSave(event, "research")}>
      <div className="profile-panel-title">
        <div><span className="profile-section-kicker">Research</span><h2>研究偏好与平台联动</h2></div>
        <button type="submit" disabled={saving === "research"}>{saving === "research" ? "保存中" : "保存偏好"}</button>
      </div>
      <div className="profile-form-grid">
        <label className="profile-wide">研究主题<textarea value={form.topicsText} onChange={(event) => onField("topicsText", event.target.value)} placeholder="每行一个主题，例如：民间故事译介、海外汉学、跨文化传播。" /></label>
        <label className="profile-wide">关注语种<textarea value={form.languageFocusText} onChange={(event) => onField("languageFocusText", event.target.value)} placeholder="每行一个语种，例如：德语、英语、法语。" /></label>
        <label>智能问答模型
          <select value={form.featurePreferences.chatModel} onChange={(event) => onGroup("featurePreferences", "chatModel", event.target.value)}>
            <option value="general">综合问答</option>
            <option value="translation">译介研究</option>
            <option value="story">故事学专题</option>
          </select>
        </label>
        <label>检索模式
          <select value={form.featurePreferences.retrievalMode} onChange={(event) => onGroup("featurePreferences", "retrievalMode", event.target.value)}>
            <option value="graph-rag">图谱增强检索</option>
            <option value="semantic">语义检索</option>
            <option value="table-first">表格优先</option>
          </select>
        </label>
        <label>地图关注范围
          <select value={form.featurePreferences.mapFocus} onChange={(event) => onGroup("featurePreferences", "mapFocus", event.target.value)}>
            <option value="world">世界传播</option>
            <option value="china">中国来源地</option>
            <option value="europe">欧洲出版网络</option>
          </select>
        </label>
      </div>
      <div className="profile-module-picker">
        {accessibleModules.map((item) => (
          <button className={form.savedModules.includes(item.id) ? "active" : ""} key={item.id} type="button" onClick={() => onToggleModule(item.id)}>
            <strong>{item.title}</strong>
            <span>{item.text}</span>
          </button>
        ))}
      </div>
    </form>
  );
}

function SettingsPanel({ form, saving, onGroup, onSave }) {
  return (
    <form className="profile-panel profile-form" onSubmit={(event) => onSave(event, "settings")}>
      <div className="profile-panel-title">
        <div><span className="profile-section-kicker">Settings</span><h2>通知、界面与隐私</h2></div>
        <button type="submit" disabled={saving === "settings"}>{saving === "settings" ? "保存中" : "保存设置"}</button>
      </div>
      <div className="profile-settings-grid">
        <article>
          <strong>通知设置</strong>
          <Toggle label="邮件摘要" checked={form.notificationSettings.emailDigest} onChange={(value) => onGroup("notificationSettings", "emailDigest", value)} />
          <Toggle label="安全提醒" checked={form.notificationSettings.securityNotice} onChange={(value) => onGroup("notificationSettings", "securityNotice", value)} />
          <Toggle label="研究动态" checked={form.notificationSettings.researchUpdates} onChange={(value) => onGroup("notificationSettings", "researchUpdates", value)} />
        </article>
        <article>
          <strong>界面设置</strong>
          <label>默认模块
            <select value={form.uiSettings.defaultModule} onChange={(event) => onGroup("uiSettings", "defaultModule", event.target.value)}>
              <option value="knowledge">知识库</option>
              <option value="graph">知识图谱</option>
              <option value="chat">智能问答</option>
              <option value="wilhelm">卫礼贤专题</option>
            </select>
          </label>
          <label>信息密度
            <select value={form.uiSettings.density} onChange={(event) => onGroup("uiSettings", "density", event.target.value)}>
              <option value="comfortable">舒展</option>
              <option value="compact">紧凑</option>
            </select>
          </label>
          <label>视觉主题
            <select value={form.uiSettings.visualTheme} onChange={(event) => onGroup("uiSettings", "visualTheme", event.target.value)}>
              <option value="scholarly">学术蓝绿</option>
              <option value="paper">纸本文献</option>
              <option value="contrast">高对比</option>
            </select>
          </label>
        </article>
        <article>
          <strong>隐私设置</strong>
          <Toggle label="公开邮箱" checked={form.privacySettings.showEmail} onChange={(value) => onGroup("privacySettings", "showEmail", value)} />
          <Toggle label="公开机构" checked={form.privacySettings.showInstitution} onChange={(value) => onGroup("privacySettings", "showInstitution", value)} />
          <Toggle label="保存浏览记录" checked={form.privacySettings.saveActivity} onChange={(value) => onGroup("privacySettings", "saveActivity", value)} />
        </article>
      </div>
    </form>
  );
}

function ActivityPanel({ activity }) {
  return (
    <div className="profile-panel">
      <div className="profile-panel-title">
        <div><span className="profile-section-kicker">History</span><h2>浏览记录</h2></div>
      </div>
      <ActivityList activity={activity} />
    </div>
  );
}

function SecurityPanel({ form, saving, onChange, onSubmit }) {
  return (
    <form className="profile-panel profile-form profile-security" onSubmit={onSubmit}>
      <div className="profile-panel-title">
        <div><span className="profile-section-kicker">Security</span><h2>修改密码</h2></div>
        <button type="submit" disabled={saving === "security"}>{saving === "security" ? "更新中" : "更新密码"}</button>
      </div>
      <p>密码至少 8 位，且必须包含大写字母、小写字母和数字。</p>
      <div className="profile-form-grid">
        <label>当前密码<input type="password" autoComplete="current-password" value={form.currentPassword} onChange={(event) => onChange((current) => ({ ...current, currentPassword: event.target.value }))} /></label>
        <label>新密码<input type="password" autoComplete="new-password" value={form.newPassword} onChange={(event) => onChange((current) => ({ ...current, newPassword: event.target.value }))} /></label>
        <label>确认新密码<input type="password" autoComplete="new-password" value={form.confirmPassword} onChange={(event) => onChange((current) => ({ ...current, confirmPassword: event.target.value }))} /></label>
      </div>
    </form>
  );
}

function Toggle({ checked, label, onChange }) {
  return (
    <label className="profile-toggle">
      <input type="checkbox" checked={checked} onChange={(event) => onChange(event.target.checked)} />
      <span>{label}</span>
    </label>
  );
}

function ActivityList({ activity }) {
  if (!activity.length) {
    return <div className="profile-empty">暂无浏览记录。访问知识库、知识图谱或智能问答后会在这里显示。</div>;
  }
  return (
    <div className="profile-activity-list">
      {activity.map((item) => (
        <a key={item.id} href={`#${item.route}`}>
          <span>{item.label || item.route}</span>
          <small>{item.module} · {formatTime(item.createdAt)}</small>
        </a>
      ))}
    </div>
  );
}
