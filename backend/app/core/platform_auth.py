from __future__ import annotations

import base64
import hashlib
import hmac
import json
import os
import time
from typing import Any


JWT_SECRET = os.environ.get("JWT_SECRET") or os.environ.get("SECRET_KEY") or "local-development-secret-change-me"
ACCESS_TOKEN_SECONDS = 2 * 60 * 60
REFRESH_TOKEN_SECONDS = 7 * 24 * 60 * 60


def _b64url(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).decode("ascii").rstrip("=")


def _b64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode((data + padding).encode("ascii"))


def create_token(payload: dict[str, Any], expires_in: int, token_type: str) -> str:
    now = int(time.time())
    body = {**payload, "type": token_type, "iat": now, "exp": now + expires_in}
    header = {"alg": "HS256", "typ": "JWT"}
    signing_input = f"{_b64url(json.dumps(header, separators=(',', ':')).encode())}.{_b64url(json.dumps(body, separators=(',', ':'), ensure_ascii=False).encode())}"
    signature = hmac.new(JWT_SECRET.encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256).digest()
    return f"{signing_input}.{_b64url(signature)}"


def verify_token(token: str, expected_type: str = "access") -> dict[str, Any]:
    try:
        header_b64, body_b64, signature_b64 = token.split(".")
    except ValueError as error:
        raise ValueError("Invalid token format.") from error
    signing_input = f"{header_b64}.{body_b64}"
    expected = _b64url(hmac.new(JWT_SECRET.encode("utf-8"), signing_input.encode("ascii"), hashlib.sha256).digest())
    if not hmac.compare_digest(expected, signature_b64):
        raise ValueError("Invalid token signature.")
    payload = json.loads(_b64url_decode(body_b64).decode("utf-8"))
    if payload.get("exp", 0) < int(time.time()):
        raise ValueError("Token expired.")
    if payload.get("type") != expected_type:
        raise ValueError("Invalid token type.")
    return payload


def token_pair(user: dict[str, Any]) -> dict[str, Any]:
    payload = {"sub": str(user.get("id")), "username": user.get("username"), "role": user.get("role")}
    return {
        "access_token": create_token(payload, ACCESS_TOKEN_SECONDS, "access"),
        "refresh_token": create_token(payload, REFRESH_TOKEN_SECONDS, "refresh"),
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_SECONDS,
        "refresh_expires_in": REFRESH_TOKEN_SECONDS,
    }

