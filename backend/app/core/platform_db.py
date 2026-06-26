from __future__ import annotations

import os
from contextlib import contextmanager
from pathlib import Path
from typing import Any, Iterator

from backend.app.core.platform_registry import registry_payload


ROOT = Path(__file__).resolve().parents[3]
SCHEMA_PATH = ROOT / "backend" / "app" / "models" / "platform_schema.sql"


class DatabaseUnavailable(RuntimeError):
    pass


def database_urls() -> dict[str, str]:
    return {
        "write": os.environ.get("DATABASE_URL", "").strip(),
        "read": os.environ.get("READ_DATABASE_URL", "").strip() or os.environ.get("DATABASE_URL", "").strip(),
    }


def _connect(readonly: bool = False):
    urls = database_urls()
    url = urls["read" if readonly else "write"]
    if not url:
        raise DatabaseUnavailable("DATABASE_URL is not configured.")
    try:
        import psycopg  # type: ignore
    except Exception as error:
        raise DatabaseUnavailable("psycopg is not installed.") from error
    return psycopg.connect(url)


@contextmanager
def connection(readonly: bool = False) -> Iterator[Any]:
    conn = _connect(readonly=readonly)
    try:
        yield conn
        if not readonly:
            conn.commit()
    except Exception:
        if not readonly:
            conn.rollback()
        raise
    finally:
        conn.close()


def health() -> dict[str, Any]:
    urls = database_urls()
    result = {
        "configured": bool(urls["write"]),
        "write_url_configured": bool(urls["write"]),
        "read_url_configured": bool(os.environ.get("READ_DATABASE_URL", "").strip()),
        "schema_path": str(SCHEMA_PATH),
        "write": {"ok": False, "message": "not checked"},
        "read": {"ok": False, "message": "not checked"},
    }
    for mode, readonly in [("write", False), ("read", True)]:
        try:
            with connection(readonly=readonly) as conn:
                with conn.cursor() as cur:
                    cur.execute("SELECT 1")
                    cur.fetchone()
            result[mode] = {"ok": True, "message": "ok"}
        except Exception as error:
            result[mode] = {"ok": False, "message": str(error)}
    return result


def apply_schema() -> dict[str, Any]:
    if not SCHEMA_PATH.exists():
        raise FileNotFoundError(str(SCHEMA_PATH))
    sql = SCHEMA_PATH.read_text(encoding="utf-8")
    with connection(readonly=False) as conn:
        with conn.cursor() as cur:
            cur.execute(sql)
            registry = registry_payload()
            for domain in registry["domains"]:
                cur.execute("SELECT id FROM knowledge_domains WHERE name = %s", (domain["name"],))
                row = cur.fetchone()
                if not row:
                    continue
                domain_id = row[0]
                for submodule in domain.get("submodules", []):
                    cur.execute(
                        """
                        INSERT INTO sub_modules (
                          knowledge_domain_id, name, description, type, language,
                          enabled_components, sort_order, is_active
                        ) VALUES (%s, %s, %s, %s, %s, %s::jsonb, %s, %s)
                        ON CONFLICT (knowledge_domain_id, name) DO UPDATE SET
                          description = EXCLUDED.description,
                          type = EXCLUDED.type,
                          language = EXCLUDED.language,
                          enabled_components = EXCLUDED.enabled_components,
                          sort_order = EXCLUDED.sort_order,
                          is_active = EXCLUDED.is_active
                        """,
                        (
                            domain_id,
                            submodule["name"],
                            submodule["description"],
                            submodule["type"],
                            submodule.get("language"),
                            __import__("json").dumps(submodule.get("enabled_components") or [], ensure_ascii=False),
                            submodule["sort_order"],
                            bool(submodule.get("is_active", True)),
                        ),
                    )
    return {"ok": True, "schema_path": str(SCHEMA_PATH)}
