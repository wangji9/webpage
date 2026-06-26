from __future__ import annotations

import os
import smtplib
import ssl
from email.header import Header
from email.message import EmailMessage
from email.utils import formataddr
from pathlib import Path


ROOT = Path(__file__).resolve().parents[3]
ENV_PATH = ROOT / ".env"


class EmailServiceError(RuntimeError):
    pass


_DOTENV_CACHE: dict[str, str] | None = None


def _dotenv() -> dict[str, str]:
    global _DOTENV_CACHE
    if _DOTENV_CACHE is not None:
        return _DOTENV_CACHE
    if not ENV_PATH.exists():
        _DOTENV_CACHE = {}
        return {}
    values: dict[str, str] = {}
    for raw_line in ENV_PATH.read_text(encoding="utf-8").splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, value = line.split("=", 1)
        values[key.strip()] = value.strip().strip('"').strip("'")
    _DOTENV_CACHE = values
    return values


def _env(*names: str, default: str = "") -> str:
    dotenv = _dotenv()
    for name in names:
        value = os.getenv(name)
        if value:
            return value
        if dotenv.get(name):
            return dotenv[name]
    return default


def _flag(*names: str, default: bool = False) -> bool:
    value = _env(*names)
    if not value:
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


def _require_ascii(value: str, field_name: str) -> None:
    try:
        value.encode("ascii")
    except UnicodeEncodeError as error:
        raise EmailServiceError(
            f"{field_name} 只能填写 SMTP 登录账号或授权码，不能填写中文显示名；"
            "中文发件人名称请放在 SMTP_FROM_NAME。"
        ) from error


def _smtp_config() -> dict[str, object]:
    use_ssl = _flag("SMTP_USE_SSL", "EMAIL_SMTP_SSL", "spring.mail.properties.mail.smtp.ssl.enable", default=False)
    port_default = "465" if use_ssl else "587"
    host = _env("SMTP_HOST", "EMAIL_SMTP_HOST", "MAIL_HOST", "spring.mail.host")
    try:
        port = int(_env("SMTP_PORT", "EMAIL_SMTP_PORT", "MAIL_PORT", "spring.mail.port", default=port_default))
    except ValueError as error:
        raise EmailServiceError("邮件服务端口配置无效，请检查 SMTP_PORT。") from error
    username = _env("SMTP_USERNAME", "SMTP_USER", "EMAIL_SMTP_USERNAME", "MAIL_USERNAME", "MAIL_USER", "spring.mail.username")
    password = _env("SMTP_PASSWORD", "SMTP_PASS", "EMAIL_SMTP_PASSWORD", "MAIL_PASSWORD", "MAIL_PASS", "spring.mail.password")
    from_addr = _env("SMTP_FROM", "EMAIL_FROM", "MAIL_FROM", "spring.mail.from", default=username)
    from_name = _env("SMTP_FROM_NAME", "EMAIL_FROM_NAME", default="中国叙事知识平台")
    use_tls = _flag(
        "SMTP_USE_TLS",
        "EMAIL_SMTP_TLS",
        "MAIL_USE_TLS",
        "spring.mail.properties.mail.smtp.starttls.enable",
        default=not use_ssl,
    )
    if not host or not username or not password or not from_addr:
        raise EmailServiceError(
            "邮件服务未配置。请设置 SMTP_HOST、SMTP_PORT、SMTP_USERNAME、SMTP_PASSWORD、SMTP_FROM，"
            "或在项目根目录 .env 中配置同名变量；也兼容 MAIL_* 与 spring.mail.* 写法。"
        )
    _require_ascii(username, "SMTP_USERNAME")
    _require_ascii(password, "SMTP_PASSWORD")
    return {
        "host": host,
        "port": port,
        "username": username,
        "password": password,
        "from_addr": from_addr,
        "from_name": from_name,
        "use_ssl": use_ssl,
        "use_tls": use_tls,
    }


def send_verification_email(to_email: str, code: str, expires_minutes: int = 10) -> None:
    config = _smtp_config()
    subject = "中国叙事知识平台邮箱验证码"
    text = (
        f"您的验证码是：{code}\n\n"
        f"验证码将在 {expires_minutes} 分钟后失效。"
        "如果不是您本人操作，请忽略本邮件。"
    )
    html = f"""
    <div style="font-family:Arial,'Microsoft YaHei',sans-serif;line-height:1.7;color:#0f172a">
      <h2 style="margin:0 0 12px">中国叙事知识平台</h2>
      <p>您的邮箱验证码为：</p>
      <div style="display:inline-block;padding:12px 18px;border-radius:8px;background:#eff6ff;color:#1e40af;font-size:28px;font-weight:800;letter-spacing:4px">{code}</div>
      <p>验证码将在 {expires_minutes} 分钟后失效。</p>
      <p style="color:#64748b">如果不是您本人操作，请忽略本邮件。</p>
    </div>
    """
    message = EmailMessage()
    message["Subject"] = Header(subject, "utf-8").encode()
    message["From"] = formataddr((Header(str(config["from_name"]), "utf-8").encode(), str(config["from_addr"])))
    message["To"] = to_email
    message.set_content(text, charset="utf-8", cte="quoted-printable")
    message.add_alternative(html, subtype="html", charset="utf-8", cte="quoted-printable")

    try:
        if config["use_ssl"]:
            with smtplib.SMTP_SSL(str(config["host"]), int(config["port"]), context=ssl.create_default_context(), timeout=20) as server:
                if config["username"] and config["password"]:
                    server.login(str(config["username"]), str(config["password"]))
                server.send_message(message)
        else:
            with smtplib.SMTP(str(config["host"]), int(config["port"]), timeout=20) as server:
                if config["use_tls"]:
                    server.starttls(context=ssl.create_default_context())
                if config["username"] and config["password"]:
                    server.login(str(config["username"]), str(config["password"]))
                server.send_message(message)
    except Exception as error:
        raise EmailServiceError(f"验证码邮件发送失败：{error}") from error
