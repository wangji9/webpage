const navItems = [
  ["home", "首页", "guest"],
  ["knowledge", "知识库", "registered"],
  ["graph", "知识图谱", "researcher"],
  ["chat", "智能问答", "researcher"],
  ["upload", "数据上传", "researcher"],
  ["about", "关于我们", "guest"],
  ["login", "用户登录", "guest"]
];

const roleName = {
  guest: "访客",
  registered: "注册用户",
  researcher: "研究者用户",
  admin: "管理员"
};

const roleRank = {
  guest: 0,
  registered: 1,
  researcher: 2,
  admin: 3
};

function currentRole(session) {
  return session.loggedIn ? session.user?.role || "registered" : "guest";
}

export default function Header({ route, session }) {
  const role = currentRole(session);
  return (
    <header className="site-header">
      <div className="header-brand-row">
        <a className="logo-stack" href="#home" aria-label="返回首页">
          <img src="/assets/sisu-logo-cropped.png" alt="上海外国语大学" />
          <img src="/assets/research-center-logo-cropped.png" alt="中国话语与世界文学研究中心" />
        </a>
        <div className="user-badge">
          {session.loggedIn ? (
            <>
              <strong>{session.user.name}</strong>
              <span>{roleName[session.user.role]}</span>
            </>
          ) : (
            <span>{roleName.guest}</span>
          )}
        </div>
      </div>
      <nav className="main-nav" aria-label="主导航">
        {navItems.filter(([, , minRole]) => roleRank[role] >= roleRank[minRole]).map(([key, label]) => (
          <a key={key} className={route === key || (key === "about" && route.startsWith("about/")) ? "active" : ""} href={`#${key}`}>{label}</a>
        ))}
        {session.user?.role === "admin" && <a className={route === "admin" ? "active" : ""} href="#admin">管理控制台</a>}
      </nav>
    </header>
  );
}
