import { useState } from "react";
import { api } from "../services/api.js";
import PageHero from "../components/PageHero.jsx";

const roleName = {
  registered: "注册用户",
  researcher: "研究者用户",
  admin: "管理员"
};

export default function Login({ session, setSession, loginNotice, setLoginNotice }) {
  const [username, setUsername] = useState("researcher");
  const [password, setPassword] = useState("research123");
  const [error, setError] = useState("");

  async function submit(event) {
    event.preventDefault();
    setError("");
    try {
      const result = await api.login({ username, password });
      setSession({ loggedIn: true, user: result.user });
      setLoginNotice("");
      window.location.hash = "knowledge";
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
    <>
      <PageHero eyebrow="权限体系" title="用户登录">
        <p>知识库、知识图谱和数据上传均需登录后使用；管理员可进入权限设置和人员管理页面。</p>
      </PageHero>
      <section className="login-layout">
        <div className="form-panel">
          <h2>用户登录</h2>
          {(loginNotice || error) && <div className="alert">{loginNotice || error}</div>}
          {session.loggedIn ? (
            <>
              <p>当前已登录：<strong>{session.user.name}</strong>（{roleName[session.user.role]}）</p>
              <button type="button" onClick={logout}>退出登录</button>
            </>
          ) : (
            <form onSubmit={submit}>
              <label>用户名<input value={username} onChange={(event) => setUsername(event.target.value)} /></label>
              <label>密码<input type="password" value={password} onChange={(event) => setPassword(event.target.value)} /></label>
              <button type="submit">登录</button>
              <small>演示账号：user/user123，researcher/research123，admin/admin123</small>
            </form>
          )}
        </div>
        <PermissionTable />
      </section>
    </>
  );
}

function PermissionTable() {
  const rows = [
    ["访客", "只能查看首页、平台简介和公开动态"],
    ["注册用户", "可查看知识库基础条目"],
    ["研究者用户", "可使用高级检索、知识图谱、数据上传、智能问答"],
    ["管理员", "可审核数据、管理用户、设置权限、维护知识库"]
  ];
  return (
    <div className="preview-panel">
      <h2>权限设置</h2>
      <table>
        <thead><tr><th>用户类型</th><th>权限</th></tr></thead>
        <tbody>{rows.map(([type, access]) => <tr key={type}><td>{type}</td><td>{access}</td></tr>)}</tbody>
      </table>
    </div>
  );
}
