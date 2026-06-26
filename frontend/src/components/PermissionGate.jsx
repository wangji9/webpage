import { canAccess, loginHash, permissionNotice, userRole } from "../utils/permissions.js";

export default function PermissionGate({
  session,
  requiredRole = "registered",
  moduleName = "该功能",
  children,
  className = "",
  showBanner = true,
}) {
  const allowed = canAccess(requiredRole, session);
  const currentRole = userRole(session);
  const notice = permissionNotice(requiredRole, currentRole, moduleName);

  if (!allowed) {
    return (
      <div className={[className, "permission-readonly-zone"].filter(Boolean).join(" ")} data-required-role={requiredRole}>
        {showBanner && (
          <div className="permission-readonly-banner">
            <strong>访问受限</strong>
            <span>{notice}</span>
            <button type="button" onClick={() => { window.location.hash = loginHash(requiredRole, notice); }}>
              去登录
            </button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div className={className} data-required-role={requiredRole}>
      {children}
    </div>
  );
}
