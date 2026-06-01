from __future__ import annotations

from typing import Optional
from uuid import uuid4

_sessions: dict[str, dict] = {}


def create_session(user: dict) -> str:
    sid = str(uuid4())
    _sessions[sid] = {"user": user}
    return sid


def get_session(sid: Optional[str]) -> Optional[dict]:
    if not sid:
        return None
    return _sessions.get(sid)


def delete_session(sid: Optional[str]) -> None:
    if sid:
        _sessions.pop(sid, None)
