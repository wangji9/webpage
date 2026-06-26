export const routeAccess = {
  home: "guest",
  about: "registered",
  detail: "registered",
  login: "guest",
  profile: "registered",
  knowledge: "registered",
  graph: "registered",
  chat: "researcher",
  upload: "researcher",
  admin: "sub_admin",
  wilhelm: "registered"
};

export const roleRank = {
  guest: 0,
  registered: 1,
  researcher: 2,
  sub_admin: 3,
  admin: 4
};

export const roleLabel = {
  guest: "访客",
  registered: "普通用户",
  researcher: "研究者用户",
  sub_admin: "子管理员",
  admin: "管理员"
};

export function accessKey(route) {
  return route.startsWith("about")
    ? "about"
    : route.startsWith("detail/")
      ? "detail"
      : route.startsWith("profile")
        ? "profile"
        : route;
}

export function userRole(session) {
  return session?.loggedIn ? session.user?.role || "registered" : "guest";
}

export function canAccess(requiredRole = "guest", session) {
  return (roleRank[userRole(session)] || 0) >= (roleRank[requiredRole] || 0);
}

export function canAccessRoute(route, session) {
  return canAccess(routeAccess[accessKey(route)] || "guest", session);
}

export function loginHash(requiredRole = "registered", message = "") {
  const params = new URLSearchParams();
  params.set("required", requiredRole);
  if (message) params.set("notice", message);
  return `login?${params.toString()}`;
}

export function permissionNotice(requiredRole, currentRole = "guest", moduleName = "该功能") {
  if (currentRole === "guest") {
    return `${moduleName}需要登录后访问。没有账号请联系管理员分配。`;
  }
  return `当前身份为${roleLabel[currentRole] || currentRole}，${moduleName}需要${roleLabel[requiredRole] || requiredRole}权限。请联系管理员调整账号权限。`;
}
