import { useEffect, useRef, useState } from "react";
import { api } from "../services/api.js";
import { canAccess, roleLabel, userRole } from "../utils/permissions.js";

const navItems = [
  ["home", "首页", "guest"],
  ["knowledge", "知识库", "registered"],
  ["graph", "知识图谱", "registered"],
  ["chat", "智能问答", "researcher"],
  ["upload", "数据上传", "researcher"],
  ["about", "关于我们", "registered"],
  ["login", "用户登录", "guest"]
];

const roleName = {
  guest: "访客",
  registered: "普通用户",
  researcher: "研究者用户",
  sub_admin: "子管理员",
  admin: "管理员"
};

export default function Header({ route, session, setSession }) {
  const role = userRole(session);
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);
  const user = session.user || {};
  const initials = String(user.name || user.username || "访客").slice(0, 1).toUpperCase();

  useEffect(() => {
    document.body.classList.toggle("account-menu-open", open);
    return () => document.body.classList.remove("account-menu-open");
  }, [open]);

  useEffect(() => {
    if (!open) return undefined;
    function onPointerDown(event) {
      if (menuRef.current && !menuRef.current.contains(event.target)) setOpen(false);
    }
    function onKeyDown(event) {
      if (event.key === "Escape") setOpen(false);
    }
    document.addEventListener("mousedown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("mousedown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [open]);

  async function logout() {
    setOpen(false);
    await api.logout();
    setSession?.({ loggedIn: false, user: null });
    window.location.hash = "home";
  }

  function go(hash) {
    setOpen(false);
    window.location.hash = hash;
  }

  return (
    <header className="site-header">
      <div className="header-brand-row">
        <a className="logo-stack" href="#home" aria-label="返回首页">
          <img src="/assets/sisu-logo-cropped.png" alt="上海外国语大学" />
          <img src="/assets/research-center-logo-cropped.png" alt="中国话语与世界文学研究中心" />
        </a>
        {session.loggedIn ? (
          <div className="account-menu" ref={menuRef}>
            <button className="account-trigger" type="button" aria-expanded={open} aria-haspopup="menu" onClick={() => setOpen((current) => !current)}>
              <span className="account-avatar">{initials}</span>
              <span className="account-copy">
                <strong>{user.name || user.username}</strong>
                <small>{roleName[user.role] || roleName.registered}</small>
              </span>
              <span className="account-caret" aria-hidden="true">⌄</span>
            </button>
            {open && (
              <div className="account-dropdown" role="menu">
                <div className="account-dropdown-head">
                  <strong>{user.name || user.username}</strong>
                  <span>{user.email || user.username}</span>
                </div>
                <button type="button" role="menuitem" onClick={() => go("profile")}>个人中心</button>
                <button type="button" role="menuitem" onClick={() => go("profile/security")}>修改密码</button>
                <button type="button" role="menuitem" onClick={() => go("profile/settings")}>偏好设置</button>
                <button type="button" role="menuitem" onClick={() => go("profile/activity")}>浏览记录</button>
                <div className="account-dropdown-links">
                  <a href="#knowledge" onClick={() => setOpen(false)}>知识库</a>
                  <a href="#graph" onClick={() => setOpen(false)}>知识图谱</a>
                  <a href="#chat" onClick={() => setOpen(false)}>智能问答</a>
                </div>
                <button className="account-logout" type="button" role="menuitem" onClick={logout}>退出登录</button>
              </div>
            )}
          </div>
        ) : (
          <a className="user-badge user-badge-login" href="#login">
            <span>{roleName.guest}</span>
            <strong>登录</strong>
          </a>
        )}
      </div>
      <nav className="main-nav" aria-label="主导航">
        {navItems.filter(([key, , minRole]) => {
          if (key === "login") return !session.loggedIn;
          if (!session.loggedIn) return minRole === "guest";
          return true;
        }).map(([key, label, minRole]) => {
          const locked = !canAccess(minRole, session);
          const title = locked ? `权限不足：使用该功能需${roleLabel[minRole] || minRole}权限` : label;
          return (
            <a
              key={key}
              className={[
                route === key || (key === "about" && route.startsWith("about/")) ? "active" : "",
                locked ? "readonly-nav" : ""
              ].filter(Boolean).join(" ")}
              href={`#${key}`}
              title={title}
            >
              {label}
              {locked && <small>受限</small>}
            </a>
          );
        })}
        {["admin", "sub_admin"].includes(session.user?.role) && <a className={route === "admin" ? "active" : ""} href="#admin">管理控制台</a>}
      </nav>
    </header>
  );
}
