from __future__ import annotations

from typing import Any, Optional

from pydantic import BaseModel


class LoginRequest(BaseModel):
    username: str
    password: str


class ChatRequest(BaseModel):
    question: str
    sectionId: str
    model: str = "general"
    provider: str = "gpt"
    retrievalMode: str = "graph-rag"
    recordId: str = ""
    attachments: list[dict[str, Any]] = []
    localRecords: list[dict[str, Any]] = []
    localStoryDrafts: dict[str, Any] = {}
    localGraphs: dict[str, Any] = {}


class MapRenderRequest(BaseModel):
    flows: list[dict[str, Any]] = []
    sections: list[dict[str, Any]] = []
    mode: str = "flow"
    year: Optional[int] = None
    title: str = "传播地图"


class NlpAnalyzeRequest(BaseModel):
    items: list[dict[str, Any]] = []


class LlmConfigRequest(BaseModel):
    provider: str = "gpt"
    url_base: str = ""
    url_key: str = ""
    default_model: str = "gpt-5.4"


class LlmTestRequest(BaseModel):
    provider: str = "gpt"
    url_base: str = ""
    url_key: str = ""
    model: str = "gpt-5.4"
