from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import re
import secrets
import sqlite3
import time
from pathlib import Path
from typing import Any, Optional

from cryptography.fernet import Fernet

from backend.app.core.email_service import EmailServiceError, send_verification_email


ROOT = Path(__file__).resolve().parents[3]
DB_PATH = Path(os.environ.get("USER_DB_PATH") or (ROOT / "backend" / "app" / "users.db")).resolve()
SECRET_PATH = Path(os.environ.get("USER_SECRET_PATH") or (ROOT / "backend" / "app" / "user_secret.key")).resolve()

ROLES = {"registered", "researcher", "sub_admin", "admin"}
STATUSES = {"active", "pending", "disabled"}
MASTER_ADMIN_ID = "u-9001"
PBKDF2_ITERATIONS = 210_000
CODE_TTL_SECONDS = 10 * 60
CODE_SEND_INTERVAL_SECONDS = 60
CODE_LOOKUP_LIMIT = 8
CODE_PURPOSES = {"register", "reset_password"}
USERNAME_PATTERN = re.compile(r"^[A-Za-z0-9]{6,}$")
PASSWORD_HAS_UPPER = re.compile(r"[A-Z]")
PASSWORD_HAS_LOWER = re.compile(r"[a-z]")
PASSWORD_HAS_DIGIT = re.compile(r"\d")

PROFILE_TEXT_COLUMNS = {
    "title": "title_encrypted",
    "phone": "phone_encrypted",
    "website": "website_encrypted",
    "city": "city_encrypted",
    "country": "country_encrypted",
    "bio": "bio_encrypted",
}
PROFILE_JSON_COLUMNS = {
    "topics": "topics_json",
    "languageFocus": "language_focus_json",
    "savedModules": "saved_modules_json",
    "notificationSettings": "notification_settings_json",
    "uiSettings": "ui_settings_json",
    "privacySettings": "privacy_settings_json",
    "featurePreferences": "feature_preferences_json",
}
PASSWORD_PLAIN_COLUMN = "password_plain_encrypted"

PROFILE_JSON_DEFAULTS = {
    "topics": [],
    "languageFocus": [],
    "savedModules": ["knowledge", "graph"],
    "notificationSettings": {"emailDigest": True, "securityNotice": True, "researchUpdates": True},
    "uiSettings": {"defaultModule": "knowledge", "density": "comfortable", "visualTheme": "scholarly"},
    "privacySettings": {"showEmail": False, "showInstitution": True, "saveActivity": True},
    "featurePreferences": {"chatModel": "general", "retrievalMode": "graph-rag", "mapFocus": "world"},
}


DEMO_USERS = [
    {
        "id": "u-1001",
        "username": "user",
        "password": "user123",
        "email": "user@example.local",
        "name": "注册用户",
        "role": "registered",
        "institution": "示例机构",
        "research_field": "基础浏览",
    },
    {
        "id": "u-2001",
        "username": "researcher",
        "password": "research123",
        "email": "researcher@example.local",
        "name": "研究者用户",
        "role": "researcher",
        "institution": "研究团队",
        "research_field": "跨文化传播",
    },
    {
        "id": "u-9001",
        "username": "admin",
        "password": "admin123",
        "email": "admin@example.local",
        "name": "管理员",
        "role": "admin",
        "institution": "系统管理",
        "research_field": "平台维护",
    },
]


def _load_key() -> bytes:
    env_key = os.getenv("USER_DATA_FERNET_KEY")
    if env_key:
        return env_key.encode("utf-8")
    if SECRET_PATH.exists():
        return SECRET_PATH.read_bytes().strip()
    key = Fernet.generate_key()
    SECRET_PATH.parent.mkdir(parents=True, exist_ok=True)
    SECRET_PATH.write_bytes(key)
    return key


FERNET = Fernet(_load_key())
HMAC_KEY = hashlib.sha256(_load_key()).digest()


def _connect() -> sqlite3.Connection:
    DB_PATH.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA foreign_keys = ON")
    return conn


def _encrypt(value: Any) -> str:
    text = "" if value is None else str(value)
    if not text:
        return ""
    return FERNET.encrypt(text.encode("utf-8")).decode("utf-8")


def _decrypt(value: Any) -> str:
    text = str(value or "")
    if not text:
        return ""
    try:
        return FERNET.decrypt(text.encode("utf-8")).decode("utf-8")
    except Exception:
        return ""


def _json_dump(value: Any) -> str:
    return json.dumps(value, ensure_ascii=False, separators=(",", ":"))


def _json_load(value: Any, default: Any) -> Any:
    if value in (None, ""):
        return default
    try:
        return json.loads(str(value))
    except Exception:
        return default


def _row_value(row: sqlite3.Row, column: str, default: Any = "") -> Any:
    return row[column] if column in row.keys() else default


def _email_hash(email: str) -> str:
    normalized = str(email or "").strip().lower()
    return hmac.new(HMAC_KEY, normalized.encode("utf-8"), hashlib.sha256).hexdigest()


def _normalize_email(email: str) -> str:
    normalized = str(email or "").strip().lower()
    if "@" not in normalized or "." not in normalized.split("@")[-1]:
        raise ValueError("请输入有效邮箱地址。")
    return normalized


def _account_email(username: str, email: str = "") -> str:
    value = str(email or "").strip().lower()
    if value:
        return _normalize_email(value)
    safe_username = re.sub(r"[^A-Za-z0-9._-]+", "", str(username or "").strip().lower()) or secrets.token_hex(4)
    return f"{safe_username}@account.local"


def _display_email(email: str) -> str:
    value = str(email or "")
    return "" if value.endswith("@account.local") else value


def _validate_username(username: str) -> str:
    normalized = str(username or "").strip()
    if not USERNAME_PATTERN.fullmatch(normalized):
        raise ValueError("用户名至少 6 位，仅支持英文字母或数字。")
    return normalized


def _validate_password(password: str) -> str:
    value = str(password or "")
    if (
        len(value) < 8
        or not PASSWORD_HAS_UPPER.search(value)
        or not PASSWORD_HAS_LOWER.search(value)
        or not PASSWORD_HAS_DIGIT.search(value)
    ):
        raise ValueError("密码至少 8 位，且必须包含大写字母、小写字母和数字。")
    return value


def _hash_secret(value: str, salt: Optional[bytes] = None) -> tuple[str, str]:
    salt = salt or secrets.token_bytes(16)
    digest = hashlib.pbkdf2_hmac("sha256", str(value).encode("utf-8"), salt, PBKDF2_ITERATIONS)
    return base64.b64encode(salt).decode("ascii"), base64.b64encode(digest).decode("ascii")


def _verify_secret(value: str, salt_b64: str, hash_b64: str) -> bool:
    try:
        salt = base64.b64decode(salt_b64.encode("ascii"))
        _, digest = _hash_secret(value, salt)
        return hmac.compare_digest(digest, hash_b64)
    except Exception:
        return False


def init_db() -> None:
    with _connect() as conn:
        conn.executescript(
            """
            CREATE TABLE IF NOT EXISTS users (
              id TEXT PRIMARY KEY,
              username TEXT NOT NULL UNIQUE,
              email_hash TEXT NOT NULL UNIQUE,
              email_encrypted TEXT NOT NULL,
              name_encrypted TEXT NOT NULL,
              institution_encrypted TEXT NOT NULL DEFAULT '',
              research_field_encrypted TEXT NOT NULL DEFAULT '',
              role TEXT NOT NULL,
              status TEXT NOT NULL,
              password_salt TEXT NOT NULL,
              password_hash TEXT NOT NULL,
              password_plain_encrypted TEXT NOT NULL DEFAULT '',
              created_at INTEGER NOT NULL,
              updated_at INTEGER NOT NULL,
              last_login_at INTEGER
            );
            CREATE TABLE IF NOT EXISTS user_activity (
              id TEXT PRIMARY KEY,
              user_id TEXT NOT NULL,
              route TEXT NOT NULL,
              label TEXT NOT NULL,
              module TEXT NOT NULL,
              created_at INTEGER NOT NULL,
              FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
            );
            CREATE TABLE IF NOT EXISTS verification_codes (
              id TEXT PRIMARY KEY,
              email_hash TEXT NOT NULL,
              code_salt TEXT NOT NULL,
              code_hash TEXT NOT NULL,
              purpose TEXT NOT NULL,
              expires_at INTEGER NOT NULL,
              consumed_at INTEGER,
              created_at INTEGER NOT NULL
            );
            """
        )
        existing_columns = {row["name"] for row in conn.execute("PRAGMA table_info(users)").fetchall()}
        if PASSWORD_PLAIN_COLUMN not in existing_columns:
            conn.execute(f"ALTER TABLE users ADD COLUMN {PASSWORD_PLAIN_COLUMN} TEXT NOT NULL DEFAULT ''")
            existing_columns.add(PASSWORD_PLAIN_COLUMN)
        for column in PROFILE_TEXT_COLUMNS.values():
            if column not in existing_columns:
                conn.execute(f"ALTER TABLE users ADD COLUMN {column} TEXT NOT NULL DEFAULT ''")
                existing_columns.add(column)
        for key, column in PROFILE_JSON_COLUMNS.items():
            if column not in existing_columns:
                conn.execute(f"ALTER TABLE users ADD COLUMN {column} TEXT NOT NULL DEFAULT ''")
                existing_columns.add(column)
            conn.execute(
                f"UPDATE users SET {column} = ? WHERE {column} = ''",
                (_json_dump(PROFILE_JSON_DEFAULTS[key]),),
            )
        for demo in DEMO_USERS:
            existing = conn.execute("SELECT * FROM users WHERE username = ?", (demo["username"],)).fetchone()
            if existing:
                if not _row_value(existing, PASSWORD_PLAIN_COLUMN):
                    conn.execute(
                        f"UPDATE users SET {PASSWORD_PLAIN_COLUMN} = ? WHERE id = ?",
                        (_encrypt(demo["password"]), existing["id"]),
                    )
                continue
            _insert_user(conn, demo, password=demo["password"], user_id=demo["id"], status="active")


def _insert_user(
    conn: sqlite3.Connection,
    payload: dict[str, Any],
    *,
    password: str,
    user_id: Optional[str] = None,
    status: str = "active",
) -> dict[str, Any]:
    username = str(payload.get("username") or "").strip()
    email = _account_email(username, str(payload.get("email") or ""))
    role = str(payload.get("role") or payload.get("accountType") or "registered")
    if role not in ROLES:
        role = "registered"
    if role == "admin" and user_id != MASTER_ADMIN_ID:
        raise ValueError("主管理员账号只能保留一个；请创建子管理员账号。")
    if status not in STATUSES:
        status = "pending"
    if not username or not password:
        raise ValueError("用户名和密码不能为空。")
    now = int(time.time())
    salt, password_hash = _hash_secret(password)
    row_id = user_id or f"u-{secrets.token_hex(8)}"
    conn.execute(
        """
        INSERT INTO users (
          id, username, email_hash, email_encrypted, name_encrypted,
          institution_encrypted, research_field_encrypted, role, status,
          password_salt, password_hash, password_plain_encrypted, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        (
            row_id,
            username,
            _email_hash(email),
            _encrypt(email),
            _encrypt(payload.get("name") or username),
            _encrypt(payload.get("institution") or ""),
            _encrypt(payload.get("researchField") or payload.get("research_field") or ""),
            role,
            status,
            salt,
            password_hash,
            _encrypt(password),
            now,
            now,
        ),
    )
    row = conn.execute("SELECT * FROM users WHERE id = ?", (row_id,)).fetchone()
    return _public_user(row)


def _public_user(row: sqlite3.Row) -> dict[str, Any]:
    profile = {
        "title": _decrypt(_row_value(row, "title_encrypted")),
        "phone": _decrypt(_row_value(row, "phone_encrypted")),
        "website": _decrypt(_row_value(row, "website_encrypted")),
        "city": _decrypt(_row_value(row, "city_encrypted")),
        "country": _decrypt(_row_value(row, "country_encrypted")),
        "bio": _decrypt(_row_value(row, "bio_encrypted")),
    }
    for key, column in PROFILE_JSON_COLUMNS.items():
        profile[key] = _json_load(_row_value(row, column), PROFILE_JSON_DEFAULTS[key])
    return {
        "id": row["id"],
        "username": row["username"],
        "email": _display_email(_decrypt(row["email_encrypted"])),
        "name": _decrypt(row["name_encrypted"]) or row["username"],
        "institution": _decrypt(row["institution_encrypted"]),
        "researchField": _decrypt(row["research_field_encrypted"]),
        "role": row["role"],
        "status": row["status"],
        "createdAt": row["created_at"],
        "updatedAt": row["updated_at"],
        "lastLoginAt": row["last_login_at"],
        "isMasterAdmin": row["id"] == MASTER_ADMIN_ID and row["role"] == "admin",
        "profile": profile,
    }


def _admin_user(row: sqlite3.Row) -> dict[str, Any]:
    user = _public_user(row)
    user["assignedPassword"] = _decrypt(_row_value(row, PASSWORD_PLAIN_COLUMN))
    return user


def public_user_by_id(user_id: str) -> Optional[dict[str, Any]]:
    init_db()
    with _connect() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return _public_user(row) if row else None


def list_users() -> list[dict[str, Any]]:
    init_db()
    with _connect() as conn:
        rows = conn.execute("SELECT * FROM users ORDER BY created_at DESC").fetchall()
    return [_admin_user(row) for row in rows]


def _user_exists(conn: sqlite3.Connection, *, username: str = "", email: str = "") -> bool:
    if username and conn.execute("SELECT 1 FROM users WHERE username = ?", (username.strip(),)).fetchone():
        return True
    if email and conn.execute("SELECT 1 FROM users WHERE email_hash = ?", (_email_hash(email),)).fetchone():
        return True
    return False


def authenticate(identifier: str, password: str) -> Optional[dict[str, Any]]:
    init_db()
    ident = str(identifier or "").strip()
    with _connect() as conn:
        row = conn.execute("SELECT * FROM users WHERE username = ?", (ident,)).fetchone()
        if not row:
            return None
        if row["status"] != "active":
            return None
        if not _verify_secret(password, row["password_salt"], row["password_hash"]):
            return None
        conn.execute("UPDATE users SET last_login_at = ? WHERE id = ?", (int(time.time()), row["id"]))
        conn.commit()
        refreshed = conn.execute("SELECT * FROM users WHERE id = ?", (row["id"],)).fetchone()
    return _public_user(refreshed)


def issue_verification_code(email: str, purpose: str = "register") -> dict[str, Any]:
    init_db()
    purpose = str(purpose or "register").strip()
    if purpose not in CODE_PURPOSES:
        raise ValueError("无效验证码用途。")
    normalized = _normalize_email(email)
    now = int(time.time())
    with _connect() as conn:
        if purpose == "register" and _user_exists(conn, email=normalized):
            raise ValueError("该邮箱已被注册，请直接登录或更换邮箱。")
        if purpose == "reset_password" and not _user_exists(conn, email=normalized):
            raise ValueError("该邮箱尚未注册，请先创建账号。")
        recent = conn.execute(
            """
            SELECT created_at FROM verification_codes
            WHERE email_hash = ? AND purpose = ? AND consumed_at IS NULL
            ORDER BY created_at DESC LIMIT 1
            """,
            (_email_hash(normalized), purpose),
        ).fetchone()
        if recent and now - int(recent["created_at"]) < CODE_SEND_INTERVAL_SECONDS:
            wait = CODE_SEND_INTERVAL_SECONDS - (now - int(recent["created_at"]))
            raise ValueError(f"验证码发送过于频繁，请 {wait} 秒后再试。")
        conn.execute(
            "DELETE FROM verification_codes WHERE expires_at < ? OR consumed_at IS NOT NULL",
            (now,),
        )

    code = f"{secrets.randbelow(1_000_000):06d}"
    salt, code_hash = _hash_secret(code)
    row_id = f"vc-{secrets.token_hex(8)}"
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO verification_codes (
              id, email_hash, code_salt, code_hash, purpose, expires_at, created_at
            ) VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                row_id,
                _email_hash(normalized),
                salt,
                code_hash,
                purpose,
                now + CODE_TTL_SECONDS,
                now,
            ),
        )

    try:
        send_verification_email(normalized, code, expires_minutes=CODE_TTL_SECONDS // 60)
    except EmailServiceError:
        with _connect() as conn:
            conn.execute("DELETE FROM verification_codes WHERE id = ?", (row_id,))
        raise
    return {
        "ok": True,
        "expiresIn": CODE_TTL_SECONDS,
        "cooldown": CODE_SEND_INTERVAL_SECONDS,
        "message": "验证码已发送至邮箱，请在 10 分钟内完成验证。",
    }


def verify_code(email: str, code: str, purpose: str = "register") -> bool:
    init_db()
    now = int(time.time())
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT * FROM verification_codes
            WHERE email_hash = ? AND purpose = ? AND consumed_at IS NULL
            ORDER BY created_at DESC LIMIT ?
            """,
            (_email_hash(email), purpose, CODE_LOOKUP_LIMIT),
        ).fetchall()
        for row in rows:
            if row["expires_at"] < now:
                continue
            if _verify_secret(code, row["code_salt"], row["code_hash"]):
                conn.execute("UPDATE verification_codes SET consumed_at = ? WHERE id = ?", (now, row["id"]))
                conn.commit()
                return True
    return False


def register_user(payload: dict[str, Any]) -> dict[str, Any]:
    init_db()
    email = _normalize_email(str(payload.get("email") or ""))
    username = _validate_username(str(payload.get("username") or ""))
    password = _validate_password(str(payload.get("password") or ""))
    account_type = str(payload.get("accountType") or payload.get("role") or "registered")
    if account_type not in {"registered", "researcher"}:
        account_type = "registered"
    if account_type == "researcher" and not email.endswith(".edu"):
        raise ValueError("研究者用户仅支持 edu 邮箱注册，并需要管理员审核。")
    with _connect() as conn:
        if _user_exists(conn, username=username, email=email):
            raise ValueError("用户名或邮箱已被注册。")
    if not verify_code(email, str(payload.get("code") or ""), "register"):
        raise ValueError("邮箱验证码无效或已过期。")
    with _connect() as conn:
        try:
            return _insert_user(
                conn,
                {
                    **payload,
                    "role": account_type,
                },
                password=password,
                status="pending" if account_type == "researcher" else "active",
            )
        except sqlite3.IntegrityError as error:
            raise ValueError("用户名或邮箱已被注册。") from error


def reset_password(email: str, code: str, password: str) -> dict[str, Any]:
    init_db()
    normalized = _normalize_email(email)
    new_password = _validate_password(password)
    if not verify_code(normalized, str(code or ""), "reset_password"):
        raise ValueError("邮箱验证码无效或已过期。")
    salt, password_hash = _hash_secret(new_password)
    with _connect() as conn:
        cursor = conn.execute(
            """
            UPDATE users
            SET password_salt = ?, password_hash = ?, updated_at = ?
            WHERE email_hash = ?
            """,
            (salt, password_hash, int(time.time()), _email_hash(normalized)),
        )
        if cursor.rowcount == 0:
            raise ValueError("该邮箱尚未注册，请先创建账号。")
    return {"ok": True, "message": "密码已更新，请使用新密码登录。"}


def create_user(payload: dict[str, Any]) -> dict[str, Any]:
    init_db()
    role = str(payload.get("role") or "registered")
    if role == "admin":
        raise ValueError("主管理员账号只有一个，不能在控制台新增。请创建子管理员账号。")
    password = str(payload.get("password") or "")
    if not password:
        raise ValueError("请为用户分配初始密码。")
    with _connect() as conn:
        try:
            user = _insert_user(conn, payload, password=password, status=str(payload.get("status") or "active"))
            row = conn.execute("SELECT * FROM users WHERE id = ?", (user["id"],)).fetchone()
            return _admin_user(row)
        except sqlite3.IntegrityError as error:
            raise ValueError("用户名已存在。") from error


def update_user(user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    init_db()
    allowed = {"username", "role", "status", "name", "email", "institution", "researchField", "password"}
    changes = {key: value for key, value in payload.items() if key in allowed and value is not None}
    if not changes:
        current = public_user_by_id(user_id)
        if not current:
            raise KeyError("用户不存在。")
        return current
    assignments: list[str] = []
    values: list[Any] = []
    if "username" in changes:
        username = str(changes["username"] or "").strip()
        if not username:
            raise ValueError("用户名不能为空。")
        assignments.append("username = ?")
        values.append(username)
    if "role" in changes:
        role = str(changes["role"])
        if role not in ROLES:
            raise ValueError("无效用户角色。")
        if role == "admin" and user_id != MASTER_ADMIN_ID:
            raise ValueError("不能将其他账号设置为主管理员。")
        assignments.append("role = ?")
        values.append(role)
    if "status" in changes:
        status = str(changes["status"])
        if status not in STATUSES:
            raise ValueError("无效账号状态。")
        assignments.append("status = ?")
        values.append(status)
    encrypted_map = {
        "name": "name_encrypted",
        "institution": "institution_encrypted",
        "researchField": "research_field_encrypted",
    }
    for key, column in encrypted_map.items():
        if key in changes:
            assignments.append(f"{column} = ?")
            values.append(_encrypt(changes[key]))
    if "email" in changes:
        email_username = str(changes.get("username") or "")
        if not email_username:
            with _connect() as conn:
                row = conn.execute("SELECT username FROM users WHERE id = ?", (user_id,)).fetchone()
            email_username = row["username"] if row else ""
        email = _account_email(email_username, str(changes["email"]))
        assignments.extend(["email_hash = ?", "email_encrypted = ?"])
        values.extend([_email_hash(email), _encrypt(email)])
    if "password" in changes and str(changes["password"]):
        password = str(changes["password"])
        salt, password_hash = _hash_secret(password)
        assignments.extend(["password_salt = ?", "password_hash = ?", f"{PASSWORD_PLAIN_COLUMN} = ?"])
        values.extend([salt, password_hash, _encrypt(password)])
    assignments.append("updated_at = ?")
    values.append(int(time.time()))
    values.append(user_id)
    with _connect() as conn:
        try:
            cursor = conn.execute(f"UPDATE users SET {', '.join(assignments)} WHERE id = ?", values)
            if cursor.rowcount == 0:
                raise KeyError("用户不存在。")
        except sqlite3.IntegrityError as error:
            raise ValueError("用户名或邮箱已被其他用户使用。") from error
    with _connect() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
    return _admin_user(row) if row else {}


def _clean_list(value: Any, limit: int = 12) -> list[str]:
    raw_items = value if isinstance(value, list) else re.split(r"[,，;\n]+", str(value or ""))
    items: list[str] = []
    for item in raw_items:
        text = str(item or "").strip()
        if text and text not in items:
            items.append(text[:80])
        if len(items) >= limit:
            break
    return items


def _clean_settings(value: Any, default: dict[str, Any]) -> dict[str, Any]:
    if not isinstance(value, dict):
        return default
    cleaned = {**default}
    for key, current in default.items():
        if key not in value:
            continue
        incoming = value[key]
        if isinstance(current, bool):
            cleaned[key] = bool(incoming)
        else:
            cleaned[key] = str(incoming or "").strip()[:80] or current
    return cleaned


def _profile_completion(user: dict[str, Any]) -> int:
    profile = user.get("profile") or {}
    checks = [
        user.get("name"),
        user.get("email"),
        user.get("institution"),
        user.get("researchField"),
        profile.get("title"),
        profile.get("city"),
        profile.get("bio"),
        profile.get("topics"),
        profile.get("languageFocus"),
        profile.get("savedModules"),
    ]
    filled = sum(1 for item in checks if bool(item))
    return round(filled / len(checks) * 100)


def list_user_activity(user_id: str, limit: int = 16) -> list[dict[str, Any]]:
    init_db()
    safe_limit = max(1, min(int(limit or 16), 60))
    with _connect() as conn:
        rows = conn.execute(
            """
            SELECT id, route, label, module, created_at
            FROM user_activity
            WHERE user_id = ?
            ORDER BY created_at DESC
            LIMIT ?
            """,
            (user_id, safe_limit),
        ).fetchall()
    return [
        {
            "id": row["id"],
            "route": row["route"],
            "label": row["label"],
            "module": row["module"],
            "createdAt": row["created_at"],
        }
        for row in rows
    ]


def get_user_profile_bundle(user_id: str) -> dict[str, Any]:
    user = public_user_by_id(user_id)
    if not user:
        raise KeyError("用户不存在。")
    activity = list_user_activity(user_id)
    profile = user.get("profile") or {}
    stats = {
        "profileCompletion": _profile_completion(user),
        "activityCount": len(activity),
        "topicCount": len(profile.get("topics") or []),
        "savedModuleCount": len(profile.get("savedModules") or []),
    }
    return {"user": user, "activity": activity, "stats": stats}


def update_own_profile(user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    init_db()
    allowed_base = {"name", "email", "institution", "researchField"}
    assignments: list[str] = []
    values: list[Any] = []

    if "email" in payload and payload.get("email") is not None:
        email = _normalize_email(str(payload.get("email") or ""))
        assignments.extend(["email_hash = ?", "email_encrypted = ?"])
        values.extend([_email_hash(email), _encrypt(email)])

    encrypted_base = {
        "name": "name_encrypted",
        "institution": "institution_encrypted",
        "researchField": "research_field_encrypted",
    }
    for key, column in encrypted_base.items():
        if key in payload and key in allowed_base:
            assignments.append(f"{column} = ?")
            values.append(_encrypt(str(payload.get(key) or "").strip()[:200]))

    for key, column in PROFILE_TEXT_COLUMNS.items():
        if key in payload:
            assignments.append(f"{column} = ?")
            values.append(_encrypt(str(payload.get(key) or "").strip()[:1200]))

    for key, column in PROFILE_JSON_COLUMNS.items():
        if key not in payload:
            continue
        default = PROFILE_JSON_DEFAULTS[key]
        if isinstance(default, list):
            cleaned = _clean_list(payload.get(key), limit=16)
        else:
            cleaned = _clean_settings(payload.get(key), default)
        assignments.append(f"{column} = ?")
        values.append(_json_dump(cleaned))

    if not assignments:
        return get_user_profile_bundle(user_id)

    assignments.append("updated_at = ?")
    values.append(int(time.time()))
    values.append(user_id)
    with _connect() as conn:
        try:
            cursor = conn.execute(f"UPDATE users SET {', '.join(assignments)} WHERE id = ?", values)
            if cursor.rowcount == 0:
                raise KeyError("用户不存在。")
        except sqlite3.IntegrityError as error:
            raise ValueError("邮箱已被其他用户使用。") from error
    return get_user_profile_bundle(user_id)


def change_user_password(user_id: str, current_password: str, new_password: str) -> dict[str, Any]:
    init_db()
    new_value = _validate_password(new_password)
    with _connect() as conn:
        row = conn.execute("SELECT * FROM users WHERE id = ?", (user_id,)).fetchone()
        if not row:
            raise KeyError("用户不存在。")
        if not _verify_secret(str(current_password or ""), row["password_salt"], row["password_hash"]):
            raise ValueError("当前密码不正确。")
        if _verify_secret(new_value, row["password_salt"], row["password_hash"]):
            raise ValueError("新密码不能与当前密码相同。")
        salt, password_hash = _hash_secret(new_value)
        conn.execute(
            f"UPDATE users SET password_salt = ?, password_hash = ?, {PASSWORD_PLAIN_COLUMN} = ?, updated_at = ? WHERE id = ?",
            (salt, password_hash, _encrypt(new_value), int(time.time()), user_id),
        )
    return {"ok": True, "message": "密码已更新，请使用新密码继续登录。"}


def record_user_activity(user_id: str, payload: dict[str, Any]) -> dict[str, Any]:
    init_db()
    user = public_user_by_id(user_id)
    if not user:
        raise KeyError("用户不存在。")
    privacy = (user.get("profile") or {}).get("privacySettings") or {}
    if privacy.get("saveActivity") is False:
        return {"ok": True, "activity": list_user_activity(user_id)}

    route = str(payload.get("route") or "profile").strip().replace("#", "")[:120] or "profile"
    label = str(payload.get("label") or route).strip()[:160] or route
    module = str(payload.get("module") or route.split("/")[0] or "platform").strip()[:80]
    now = int(time.time())
    with _connect() as conn:
        conn.execute(
            """
            INSERT INTO user_activity (id, user_id, route, label, module, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            """,
            (f"ua-{secrets.token_hex(8)}", user_id, route, label, module, now),
        )
        conn.execute(
            """
            DELETE FROM user_activity
            WHERE user_id = ?
              AND id NOT IN (
                SELECT id FROM user_activity
                WHERE user_id = ?
                ORDER BY created_at DESC
                LIMIT 60
              )
            """,
            (user_id, user_id),
        )
    return {"ok": True, "activity": list_user_activity(user_id)}


def delete_user(user_id: str) -> None:
    init_db()
    with _connect() as conn:
        cursor = conn.execute("DELETE FROM users WHERE id = ?", (user_id,))
        if cursor.rowcount == 0:
            raise KeyError("用户不存在。")


init_db()
