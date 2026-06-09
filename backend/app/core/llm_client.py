from __future__ import annotations

import json
import os
from pathlib import Path
from typing import Any
import typing

import requests

CONFIG_PATH = Path(__file__).resolve().parents[2] / "llm_config.json"
DEFAULT_API_URL = "https://api.aigogo.pro/v1/chat/completions"
DEFAULT_MODEL = "gpt-5.4"
DEFAULT_MAX_TOKENS = 4096
DEFAULT_TIMEOUT = 180
DEEPSEEK_API_URL = "https://platform.deepseek.com"
DEEPSEEK_API_KEY = "sk-46bb1b65de71400e8f06d0aca8fd6ecd"
DEEPSEEK_MODEL = "deepseek-v4-pro"
DEEPSEEK_PROVIDER = "deepseek"

_config: dict[str, str] = {
    "url_base": DEFAULT_API_URL,
    "url_key": "",
    "default_model": DEFAULT_MODEL,
}


class EmptyModelOutputError(RuntimeError):
    """Raised when the provider responds successfully but generates no text."""


def normalize_api_url(api_url: str) -> str:
    url = api_url.strip()
    url = url.replace("/en/", "/")
    if url.endswith("/en"):
        url = url[:-3]
    return url


def _load_config() -> dict[str, str]:
    global _config
    if CONFIG_PATH.exists():
        try:
            data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
            _config = {
                "url_base": str(data.get("url_base") or DEFAULT_API_URL),
                "url_key": str(data.get("url_key") or ""),
                "default_model": str(data.get("default_model") or DEFAULT_MODEL),
            }
        except Exception:
            pass

    env_url_base = os.environ.get("LLM_URL_BASE", "").strip()
    env_url_key = os.environ.get("LLM_URL_KEY", "").strip()
    env_default_model = os.environ.get("LLM_DEFAULT_MODEL", "").strip()
    if env_url_base:
        _config["url_base"] = env_url_base
    if env_url_key:
        _config["url_key"] = env_url_key
    if env_default_model:
        _config["default_model"] = env_default_model
    return _config


def public_config(provider: str = "gpt") -> dict[str, Any]:
    if _is_deepseek(provider):
        return {
            "provider": DEEPSEEK_PROVIDER,
            "url_base": DEEPSEEK_API_URL,
            "default_model": DEEPSEEK_MODEL,
            "has_key": bool(DEEPSEEK_API_KEY),
        }
    config = _load_config()
    return {
        "provider": provider or "gpt",
        "url_base": config["url_base"],
        "default_model": config["default_model"],
        "has_key": bool(config["url_key"]),
    }


def save_config(url_base: str, url_key: str, default_model: str, provider: str = "gpt") -> dict[str, Any]:
    global _config
    if _is_deepseek(provider, default_model):
        return public_config(provider=DEEPSEEK_PROVIDER)
    current = _load_config()
    _config = {
        "url_base": normalize_api_url(url_base) or DEFAULT_API_URL,
        "url_key": url_key.strip() or current.get("url_key", ""),
        "default_model": default_model.strip() or DEFAULT_MODEL,
    }
    CONFIG_PATH.write_text(json.dumps(_config, ensure_ascii=False, indent=2), encoding="utf-8")
    return public_config(provider=provider)


def _is_deepseek(provider: str = "", model: str = "") -> bool:
    provider_id = (provider or "").strip().lower()
    model_id = (model or "").strip().lower().replace("_", "-")
    return (
        provider_id == DEEPSEEK_PROVIDER
        or model_id in {DEEPSEEK_MODEL, "deepseek v4 pro"}
        or model_id.startswith("deepseek-")
    )


def _config_for_provider(provider: str, model: str, override_config: dict[str, str] | None = None) -> dict[str, str]:
    if _is_deepseek(provider, model):
        return {
            "url_base": DEEPSEEK_API_URL,
            "url_key": DEEPSEEK_API_KEY,
            "default_model": DEEPSEEK_MODEL,
            "provider": DEEPSEEK_PROVIDER,
        }
    return override_config or _load_config()


def configured(provider: str = "", model: str = "") -> bool:
    if _is_deepseek(provider, model):
        return bool(DEEPSEEK_API_URL and DEEPSEEK_API_KEY)
    config = _load_config()
    return bool(config.get("url_base") and config.get("url_key"))


def endpoint_for(url_base: str) -> str:
    base = normalize_api_url(url_base).rstrip("/")
    if base.endswith("/chat/completions"):
        return base
    if base.endswith("/v1"):
        return f"{base}/chat/completions"
    return f"{base}/v1/chat/completions"


def _request_json(endpoint: str, api_key: str, payload: dict[str, Any], timeout: float) -> dict[str, Any]:
    session = requests.Session()
    session.headers.update({
        "Content-Type": "application/json",
        "Authorization": f"Bearer {api_key}",
    })
    try:
        response = session.post(endpoint, json=payload, timeout=timeout)
        response.raise_for_status()
        text = response.text.strip()
        if not text:
            raise RuntimeError(
                f"大模型接口返回空响应，HTTP {response.status_code}，"
                f"Content-Type: {response.headers.get('content-type') or 'unknown'}。"
            )
        try:
            return json.loads(text)
        except json.JSONDecodeError as error:
            if "text/event-stream" in (response.headers.get("content-type") or "") or text.startswith("data:"):
                return _parse_sse_response(text, response.status_code, response.headers.get("content-type") or "unknown")
            snippet = " ".join(text[:500].split())
            raise RuntimeError(
                f"大模型接口未返回合法 JSON，HTTP {response.status_code}，"
                f"Content-Type: {response.headers.get('content-type') or 'unknown'}，"
                f"响应片段：{snippet or '[empty]'}"
            ) from error
    except requests.HTTPError as error:
        response = error.response
        detail = response.text[:500] if response is not None else str(error)
        status = response.status_code if response is not None else "unknown"
        raise RuntimeError(f"大模型接口返回 {status}: {detail}") from error
    except RuntimeError:
        raise
    except requests.RequestException as error:
        raise RuntimeError(f"大模型接口连接失败: {type(error).__name__}: {error}") from error
    finally:
        session.close()


def _text_from_chunk_value(value: Any) -> str:
    if isinstance(value, str):
        return value
    if isinstance(value, list):
        parts = []
        for item in value:
            if isinstance(item, dict):
                parts.append(str(item.get("text") or item.get("content") or ""))
            else:
                parts.append(str(item))
        return "".join(parts)
    return ""


def _parse_sse_response(text: str, status: int, content_type: str) -> dict[str, Any]:
    chunks: list[dict[str, Any]] = []
    content_parts: list[str] = []
    usage: dict[str, Any] | None = None

    for raw_line in text.splitlines():
        line = raw_line.strip()
        if not line.startswith("data:"):
            continue
        data = line[5:].strip()
        if not data or data == "[DONE]":
            continue
        try:
            chunk = json.loads(data)
        except json.JSONDecodeError:
            continue
        chunks.append(chunk)
        if isinstance(chunk.get("usage"), dict):
            usage = chunk["usage"]
        error = chunk.get("error")
        if error:
            raise RuntimeError(f"大模型接口返回错误：{error}")

        # OpenAI-compatible chat completion stream.
        for choice in chunk.get("choices") or []:
            if not isinstance(choice, dict):
                continue
            delta = choice.get("delta") or {}
            message = choice.get("message") or {}
            content = None
            if isinstance(delta, dict):
                content = delta.get("content")
            if content is None and isinstance(message, dict):
                content = message.get("content")
            if content is None:
                content = choice.get("text")
            piece = _text_from_chunk_value(content)
            if piece:
                content_parts.append(piece)

        # A little extra tolerance for providers that stream response-style events.
        event_type = str(chunk.get("type") or "")
        if event_type.endswith(".delta") and isinstance(chunk.get("delta"), str):
            content_parts.append(chunk["delta"])

    if content_parts:
        return {
            "choices": [{"message": {"content": "".join(content_parts)}}],
            "usage": usage or {},
            "stream": True,
        }

    if chunks:
        raise EmptyModelOutputError(
            "大模型接口返回了 SSE 流，但没有生成文本；"
            f"HTTP {status}，Content-Type: {content_type}，usage={usage or chunks[-1].get('usage')}"
        )

    snippet = " ".join(text[:500].split())
    raise RuntimeError(
        f"大模型接口未返回合法 JSON/SSE，HTTP {status}，Content-Type: {content_type}，"
        f"响应片段：{snippet or '[empty]'}"
    )


def _content_from_chat_completion(result: dict[str, Any]) -> str:
    try:
        content = result["choices"][0]["message"]["content"]
    except (KeyError, IndexError, TypeError) as error:
        raise EmptyModelOutputError(f"Chat Completions API 未返回可用文本：{result}") from error

    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict):
                parts.append(str(item.get("text") or item.get("content") or ""))
            else:
                parts.append(str(item))
        content = "\n".join(part for part in parts if part)

    full_answer = str(content or "").strip()
    if not full_answer:
        raise EmptyModelOutputError("接口返回空内容")
    return full_answer


def _normalize_model(model: str, default_model: str) -> str:
    clean = (model or "").strip()
    if not clean or clean == "general":
        return default_model
    return clean


def _normalize_provider_model(provider: str, model: str, default_model: str) -> str:
    clean = _normalize_model(model, default_model)
    if not _is_deepseek(provider, clean):
        return clean

    model_id = clean.strip().lower().replace("_", "-")
    if model_id in {"deepseek v4 pro", "general", ""}:
        return DEEPSEEK_MODEL
    return model_id if model_id.startswith("deepseek-") else DEEPSEEK_MODEL


def _gpt_compatible_fallback_payload(payload: dict[str, Any]) -> dict[str, Any]:
    fallback = {
        "model": payload["model"],
        "messages": payload["messages"],
        "stream": False,
        "max_completion_tokens": payload.get("max_tokens") or DEFAULT_MAX_TOKENS,
    }
    if "reasoning_effort" in payload:
        fallback["reasoning_effort"] = payload["reasoning_effort"]
    if "thinking" in payload:
        fallback["thinking"] = payload["thinking"]
    return fallback


def chat_completion(
    messages: list[dict[str, Any]],
    model: str,
    temperature: float = 0.35,
    override_config: dict[str, str] | None = None,
    timeout: float = DEFAULT_TIMEOUT,
    provider: str = "",
) -> str:
    config = _config_for_provider(provider, model, override_config)
    if not config.get("url_base") or not config.get("url_key"):
        raise RuntimeError("请先在管理员界面配置大模型 url_base 和 url_key。")

    provider_id = str(config.get("provider") or provider or "")
    active_model = _normalize_provider_model(provider_id, model, config.get("default_model") or DEFAULT_MODEL)
    payload = {
        "model": active_model,
        "messages": messages,
        "stream": False,
        "temperature": 0,
        "max_tokens": DEFAULT_MAX_TOKENS,
    }
    if _is_deepseek(provider_id, active_model):
        payload.pop("temperature", None)
        payload.pop("max_tokens", None)
        payload["reasoning_effort"] = "high"
        payload["thinking"] = {"type": "enabled"}

    endpoint = endpoint_for(config["url_base"])
    try:
        result = _request_json(endpoint, config["url_key"], payload, timeout)
        return _content_from_chat_completion(result)
    except EmptyModelOutputError as first_error:
        fallback_payload = _gpt_compatible_fallback_payload(payload)
        try:
            result = _request_json(endpoint, config["url_key"], fallback_payload, timeout)
            return _content_from_chat_completion(result)
        except EmptyModelOutputError as second_error:
            raise EmptyModelOutputError(
                f"{second_error}；已使用 gpt-5.4 兼容参数重试一次"
                "（max_completion_tokens，省略 temperature），仍未生成文本。"
                f"首次响应：{first_error}"
            ) from second_error


def stream_chat_completion(
    messages: list[dict[str, Any]],
    model: str,
    temperature: float = 0.35,
    override_config: dict[str, str] | None = None,
    timeout: float = DEFAULT_TIMEOUT,
    provider: str = "",
) -> typing.Generator[str, None, None]:
    yield chat_completion(
        messages=messages,
        model=model,
        temperature=temperature,
        override_config=override_config,
        timeout=timeout,
        provider=provider,
    )


def test_connection(url_base: str, url_key: str, model: str, provider: str = "gpt") -> dict[str, Any]:
    current = _load_config()
    test_config = {
        "url_base": normalize_api_url(url_base) or current.get("url_base", DEFAULT_API_URL),
        "url_key": url_key.strip() or current.get("url_key", ""),
        "default_model": model.strip() or current.get("default_model", DEFAULT_MODEL),
    }
    if not _is_deepseek(provider, model) and (not test_config["url_base"] or not test_config["url_key"]):
        raise RuntimeError("请填写 url_base 和 url_key，或先保存一组可用配置。")

    answer = chat_completion(
        [
            {"role": "system", "content": "你是一名OCR文本校对专家。"},
            {"role": "user", "content": "Reply exactly with OK."},
        ],
        model=test_config["default_model"],
        override_config=test_config,
        timeout=DEFAULT_TIMEOUT,
        provider=provider,
    )
    return {"ok": True, "message": answer[:200]}
