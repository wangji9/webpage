import { useEffect, useState } from "react";
import { api } from "../services/api.js";

const roleName = {
  registered: "普通用户",
  researcher: "研究者用户",
  sub_admin: "子管理员",
  admin: "管理员"
};

export default function Login({ session, setSession, loginNotice, setLoginNotice }) {
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    const hash = window.location.hash || "";
    const query = hash.includes("?") ? hash.split("?")[1] : "";
    if (!query) return;
    const params = new URLSearchParams(query);
    const notice = params.get("notice");
    if (notice) setLoginNotice(notice);
  }, [setLoginNotice]);

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      const result = await api.login({ username, password });
      setSession({ loggedIn: true, user: result.user });
      setLoginNotice("");
      window.location.hash = result.user?.role === "admin" || result.user?.role === "sub_admin" ? "admin" : "knowledge";
    } catch (err) {
      setError(err.message);
    }
  }

  async function logout() {
    await api.logout();
    setSession({ loggedIn: false, user: null });
    window.location.hash = "home";
  }

  return (
    <section className="login-layout auth-layout auth-clean-page">
      <PlatformIntro />
      <div className="form-panel auth-panel auth-pro-panel auth-account-panel">
        <div className="auth-title">
          <span>Account Access</span>
          <strong>用户登录</strong>
        </div>

        {(loginNotice || error) && <div className="alert">{loginNotice || error}</div>}

        {session.loggedIn ? (
          <div className="signed-in-card">
            <span>当前账号</span>
            <strong>{session.user.name || session.user.username}</strong>
            <p>{roleName[session.user.role]} · {session.user.username}</p>
            <button type="button" onClick={logout}>退出登录</button>
          </div>
        ) : (
          <form onSubmit={submit}>
            <label>用户名
              <input value={username} onChange={(event) => setUsername(event.target.value)} autoComplete="username" required />
            </label>
            <label>密码
              <input type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" required />
            </label>
            <button type="submit">登录</button>
            <PermissionPanel />
          </form>
        )}
      </div>
    </section>
  );
}

function PlatformIntro() {
  return (
    <aside className="auth-platform-panel">
      <div className="auth-platform-collection" aria-hidden="true">
        <span className="collection-band band-a"></span>
        <span className="collection-band band-b"></span>
        <span className="collection-panel panel-a"></span>
        <span className="collection-panel panel-b"></span>
        <span className="collection-axis axis-a"></span>
        <span className="collection-axis axis-b"></span>
        <span className="collection-node node-a"></span>
        <span className="collection-node node-b"></span>
        <span className="collection-node node-c"></span>
        <span className="collection-node node-d"></span>
      </div>
      <div className="auth-platform-copy">
        <span>China Narrative Knowledge Platform</span>
        <h1>中国叙事知识平台</h1>
        <p>账号由管理员统一分配。请使用管理员提供的用户名和密码登录，未登录用户仅可访问首页和登录界面。</p>
      </div>
      <div className="auth-platform-system" aria-hidden="true">
        <div className="auth-system-line">
          <span></span>
          <b>Knowledge Base</b>
        </div>
        <div className="auth-system-line">
          <span></span>
          <b>Graph Engine</b>
        </div>
        <div className="auth-system-line">
          <span></span>
          <b>Research AI</b>
        </div>
      </div>
      <div className="auth-platform-metrics" aria-label="平台能力">
        <div>
          <strong>Admin</strong>
          <span>账号分配</span>
        </div>
        <div>
          <strong>Role</strong>
          <span>权限分级</span>
        </div>
        <div>
          <strong>AI</strong>
          <span>研究工具</span>
        </div>
      </div>
    </aside>
  );
}

function PermissionPanel() {
  const rows = [
    ["访客", "无需账号", "首页、登录"],
    ["普通用户", "管理员分配", "知识库、知识图谱、个人中心"],
    ["研究者用户", "管理员分配", "知识库、知识图谱、智能问答、数据上传"],
    ["子管理员", "管理员分配", "表格数据维护、文档维护"],
    ["管理员", "系统主管账号", "用户账号管理、权限管理、内容与系统配置"]
  ];
  return (
    <div className="preview-panel permission-panel auth-permission-panel">
      <div className="auth-title">
        <span>Access Matrix</span>
        <strong>权限规则</strong>
      </div>
      <table>
        <thead><tr><th>身份</th><th>开通方式</th><th>权限</th></tr></thead>
        <tbody>{rows.map(([type, method, access]) => <tr key={type}><td>{type}</td><td>{method}</td><td>{access}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
