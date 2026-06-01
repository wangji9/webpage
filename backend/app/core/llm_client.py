from __future__ import annotations

import json
import re
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any
import typing
import json

CONFIG_PATH = Path(__file__).resolve().parents[2] / "llm_config.json"

_config: dict[str, str] = {
    "url_base": "",
    "url_key": "",
    "default_model": "gpt-4.1",
}


def _load_config() -> dict[str, str]:
    global _config
    if CONFIG_PATH.exists():
        try:
            data = json.loads(CONFIG_PATH.read_text(encoding="utf-8"))
            _config = {
                "url_base": str(data.get("url_base") or ""),
                "url_key": str(data.get("url_key") or ""),
                "default_model": str(data.get("default_model") or "gpt-4.1"),
            }
        except Exception:
            pass
    return _config


def public_config() -> dict[str, Any]:
    config = _load_config()
    return {
        "url_base": config["url_base"],
        "default_model": config["default_model"],
        "has_key": bool(config["url_key"]),
    }


def save_config(url_base: str, url_key: str, default_model: str) -> dict[str, Any]:
    global _config
    current = _load_config()
    _config = {
        "url_base": url_base.strip(),
        "url_key": url_key.strip() or current.get("url_key", ""),
        "default_model": default_model.strip() or "gpt-4.1",
    }
    CONFIG_PATH.write_text(json.dumps(_config, ensure_ascii=False, indent=2), encoding="utf-8")
    return public_config()


def configured() -> bool:
    config = _load_config()
    return bool(config.get("url_base") and config.get("url_key"))


def endpoint_for(url_base: str) -> str:
    base = url_base.strip().rstrip("/")
    if base.endswith("/chat/completions"):
        return base
    if base.endswith("/v1"):
        return f"{base}/chat/completions"
    return f"{base}/v1/chat/completions"


def responses_endpoint_for(url_base: str) -> str:
    base = url_base.strip().rstrip("/")
    if base.endswith("/chat/completions"):
        return base[: -len("/chat/completions")] + "/responses"
    if base.endswith("/responses"):
        return base
    if base.endswith("/v1"):
        return f"{base}/responses"
    return f"{base}/v1/responses"


def _parse_response_body(body: bytes, status: int, content_type: str) -> dict[str, Any]:
    text = body.decode("utf-8", errors="replace").strip()
    if not text:
        raise RuntimeError(f"大模型接口返回空响应，HTTP {status}，Content-Type: {content_type or 'unknown'}。")
    try:
        return json.loads(text)
    except json.JSONDecodeError as error:
        if text.startswith("data:"):
            chunks = []
            content_parts = []
            for line in text.splitlines():
                line = line.strip()
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if data == "[DONE]":
                    continue
                try:
                    chunk = json.loads(data)
                except json.JSONDecodeError:
                    continue
                chunks.append(chunk)
                for choice in chunk.get("choices") or []:
                    delta = choice.get("delta") or {}
                    message = choice.get("message") or {}
                    content = delta.get("content") or message.get("content") or choice.get("text")
                    if isinstance(content, str):
                        content_parts.append(content)
            if chunks:
                if content_parts:
                    return {"choices": [{"message": {"content": "".join(content_parts)}}], "stream": True}
                return chunks[-1]
        snippet = re.sub(r"\s+", " ", text[:500])
        raise RuntimeError(
            f"大模型接口未返回合法 JSON，HTTP {status}，Content-Type: {content_type or 'unknown'}，"
            f"响应片段：{snippet}"
        ) from error


def _request_json(endpoint: str, api_key: str, payload: dict[str, Any], timeout: float) -> dict[str, Any]:
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            return _parse_response_body(
                response.read(),
                status=response.status,
                content_type=response.headers.get("content-type", ""),
            )
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"大模型接口返回 {error.code}: {detail[:500]}") from error
    except Exception as error:
        raise RuntimeError(f"大模型接口连接失败: {type(error).__name__}: {error!r}") from error


def _stream_request(endpoint: str, api_key: str, payload: dict[str, Any], timeout: float):
    """向支持 SSE/data: 的 OpenAI-compatible 接口发起请求，并按数据块 yield 文本片段。"""
    request = urllib.request.Request(
        endpoint,
        data=json.dumps(payload).encode("utf-8"),
        headers={
            "Authorization": f"Bearer {api_key}",
            "Content-Type": "application/json",
            "Accept": "text/event-stream, application/json",
        },
        method="POST",
    )
    try:
        with urllib.request.urlopen(request, timeout=timeout) as response:
            # 按行读取 SSE 风格的 data: 行
            for raw in response:
                try:
                    line = raw.decode("utf-8", errors="replace").strip()
                except Exception:
                    continue
                if not line:
                    continue
                if not line.startswith("data:"):
                    continue
                data = line[5:].strip()
                if not data:
                    continue
                if data == "[DONE]":
                    break
                try:
                    chunk = json.loads(data)
                except Exception:
                    # 非 JSON，可尝试直接返回文本
                    yield data
                    continue
                # 从 chunk 中提取生成内容（兼容 choices[].delta 或 choices[].message）
                for choice in chunk.get("choices") or []:
                    delta = choice.get("delta") or {}
                    message = choice.get("message") or {}
                    content = delta.get("content") or message.get("content") or choice.get("text")
                    if isinstance(content, str) and content:
                        yield content
    except urllib.error.HTTPError as error:
        detail = error.read().decode("utf-8", errors="ignore")
        raise RuntimeError(f"大模型接口返回 {error.code}: {detail[:500]}") from error
    except Exception as error:
        raise RuntimeError(f"大模型接口连接失败: {type(error).__name__}: {error!r}") from error


def _text_from_message_content(content: Any) -> str:
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        parts = []
        for item in content:
            if isinstance(item, dict):
                parts.append(str(item.get("text") or item.get("content") or ""))
            else:
                parts.append(str(item))
        return "\n".join(part for part in parts if part)
    return str(content or "")


def _messages_to_responses_payload(messages: list[dict[str, Any]], model: str, temperature: float) -> dict[str, Any]:
    instructions = "\n".join(
        _text_from_message_content(message.get("content"))
        for message in messages
        if message.get("role") == "system"
    ).strip()
    input_text = "\n\n".join(
        f"{message.get('role', 'user')}: {_text_from_message_content(message.get('content'))}"
        for message in messages
        if message.get("role") != "system"
    ).strip()
    payload: dict[str, Any] = {
        "model": model,
        "input": input_text or "Hello",
        "max_output_tokens": 1600,
        "store": False,
    }
    if instructions:
        payload["instructions"] = instructions
    if temperature is not None:
        payload["temperature"] = temperature
    return payload


def _content_from_responses(result: dict[str, Any]) -> str:
    if isinstance(result.get("output_text"), str) and result["output_text"].strip():
        return result["output_text"].strip()
    parts = []
    for output in result.get("output") or []:
        for content in output.get("content") or []:
            text = content.get("text")
            if isinstance(text, str):
                parts.append(text)
    if parts:
        return "\n".join(parts).strip()
    error = result.get("error")
    if error:
        raise RuntimeError(f"Responses API 返回错误：{error}")
    raise RuntimeError(f"Responses API 未返回可用文本，status={result.get('status')}，usage={result.get('usage')}")


def _responses_completion(config: dict[str, str], messages: list[dict[str, Any]], model: str, temperature: float, timeout: float) -> str:
    result = _request_json(
        responses_endpoint_for(config["url_base"]),
        config["url_key"],
        _messages_to_responses_payload(messages, model, temperature),
        timeout,
    )
    return _content_from_responses(result)


def stream_chat_completion(
    messages: list[dict[str, Any]],
    model: str,
    temperature: float = 0.35,
    override_config: dict[str, str] | None = None,
    timeout: float = 45,
) -> typing.Generator[str, None, None]:
    """以 generator 形式按块返回模型生成的文本（兼容 SSE/data: 流）。"""
    config = override_config or _load_config()
    if not config.get("url_base") or not config.get("url_key"):
        raise RuntimeError("请先在管理员界面配置大模型 url_base 和 url_key。")

    payload = {
        "model": model or config.get("default_model") or "gpt-4.1",
        "messages": messages,
        "temperature": temperature,
        "stream": True,
        "max_tokens": 1600,
    }
    # 使用 _stream_request 来逐块读取 SSE
    for piece in _stream_request(endpoint_for(config["url_base"]), config["url_key"], payload, timeout):
        yield piece


def chat_completion(
    messages: list[dict[str, Any]],
    model: str,
    temperature: float = 0.35,
    override_config: dict[str, str] | None = None,
    timeout: float = 45,
) -> str:
    config = override_config or _load_config()
    if not config.get("url_base") or not config.get("url_key"):
        raise RuntimeError("请先在管理员界面配置大模型 url_base 和 url_key。")

    payload = {
        "model": model or config.get("default_model") or "gpt-4.1",
        "messages": messages,
        "temperature": temperature,
        "stream": False,
        "max_tokens": 1600,
    }
    active_model = payload["model"]
    result = _request_json(endpoint_for(config["url_base"]), config["url_key"], payload, timeout)

    choices = result.get("choices") or []
    if not choices:
        return _responses_completion(config, messages, active_model, temperature, timeout)
    message = choices[0].get("message") or {}
    if not message and isinstance(choices[0], dict):
        message = choices[0].get("delta") or {}
    content = message.get("content")
    if isinstance(content, str):
        return content
    if isinstance(content, list):
        return "\n".join(str(item.get("text") or item) for item in content)
    return str(content or "")


def test_connection(url_base: str, url_key: str, model: str) -> dict[str, Any]:
    current = _load_config()
    test_config = {
        "url_base": url_base.strip() or current.get("url_base", ""),
        "url_key": url_key.strip() or current.get("url_key", ""),
        "default_model": model.strip() or current.get("default_model", "gpt-4.1"),
    }
    if not test_config["url_base"] or not test_config["url_key"]:
        raise RuntimeError("请填写 url_base 和 url_key，或先保存一组可用配置。")

    answer = chat_completion(
        [
            {"role": "system", "content": "You are a connectivity test assistant. Reply with OK."},
            {"role": "user", "content": "只回复 OK。"},
        ],
        model=test_config["default_model"],
        override_config=test_config,
        timeout=20,
    )
    return {"ok": True, "message": answer[:200]}
