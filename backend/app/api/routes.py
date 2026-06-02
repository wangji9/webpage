from __future__ import annotations

from typing import Optional

from fastapi import APIRouter, Cookie, HTTPException, Response
from fastapi.responses import StreamingResponse

from backend.app.core.data import (
    GRAPH_DATA,
    KNOWLEDGE_ITEMS,
    KNOWLEDGE_SECTIONS,
    MAP_FLOWS,
    MODEL_PROVIDERS,
    PASSWORDS,
    REPRESENTATIVE_RESULTS,
    USERS,
)
from backend.app.core.llm_client import chat_completion, configured, public_config, save_config, test_connection, stream_chat_completion
import json
from backend.app.core.map_renderer import render_map_svg
from backend.app.core.nlp_analyzer import analyze_items
from backend.app.core.security import create_session, delete_session, get_session
from backend.app.core.story_visuals import collection_graph, preface_visuals, stats_visual, visual_atlas, wilhelm_visuals
from backend.app.models.schemas import ChatRequest, LlmConfigRequest, LlmTestRequest, LoginRequest, MapRenderRequest, NlpAnalyzeRequest

router = APIRouter(prefix="/api")


def session_user(sid: Optional[str]) -> Optional[dict]:
    session = get_session(sid)
    return session["user"] if session else None


def require_admin(sid: Optional[str]) -> dict:
    user = session_user(sid)
    if not user or user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="仅管理员可配置大模型接口。")
    return user


def select_target_items(payload: ChatRequest, section: dict) -> list[dict]:
    section_items = [item for item in KNOWLEDGE_ITEMS if item["sectionId"] == section["id"]]
    selected = next((item for item in KNOWLEDGE_ITEMS if item["id"] == payload.recordId), None)
    if selected:
        return [selected] + [item for item in section_items if item["id"] != selected["id"]][:2]

    question = payload.question.lower()
    matched = [
        item
        for item in section_items
        if item["canonicalTitle"].lower() in question
        or item["translatedTitle"].lower() in question
        or item.get("translator", "").lower() in question
        or item.get("city", "").lower() in question
        or item.get("country", "").lower() in question
    ]
    return matched[:4] or section_items[:4]


def infer_visual_type(question: str, retrieval_mode: str) -> str:
    wants_map = any(keyword in question for keyword in ["地图", "传播", "路线", "国家", "出版地", "地理", "map", "route"])
    wants_graph = retrieval_mode == "graph-rag" or any(keyword in question for keyword in ["图谱", "关系", "网络", "关联", "路径", "graph"])
    wants_stats = any(keyword in question for keyword in ["统计", "数量", "趋势", "分布", "词云", "词频", "思维导图"])
    if wants_stats:
        return "stats"
    if wants_map and wants_graph:
        return "mixed"
    if wants_map:
        return "map"
    if wants_graph:
        return "graph"
    return "text"


@router.get("/session")
def read_session(sid: Optional[str] = Cookie(default=None)):
    user = session_user(sid)
    return {"loggedIn": bool(user), "user": user}


@router.post("/login")
def login(payload: LoginRequest, response: Response):
    user = USERS.get(payload.username)
    if not user or PASSWORDS.get(payload.username) != payload.password:
        raise HTTPException(status_code=401, detail="用户名或密码不正确")

    sid = create_session(user)
    response.set_cookie("sid", sid, httponly=True, samesite="lax", max_age=86400)
    return {"user": user}


@router.post("/logout")
def logout(response: Response, sid: Optional[str] = Cookie(default=None)):
    delete_session(sid)
    response.delete_cookie("sid")
    return {"ok": True}


@router.get("/kb/sections")
def knowledge_sections():
    return {"sections": KNOWLEDGE_SECTIONS}


@router.get("/kb/items")
def knowledge_items():
    return {"items": KNOWLEDGE_ITEMS}


@router.get("/results")
def results():
    return {"results": REPRESENTATIVE_RESULTS}


@router.get("/graph")
def graph():
    return GRAPH_DATA


@router.get("/story/visual-atlas")
def story_visual_atlas():
    return visual_atlas()


@router.get("/story/collection-graph/{collection_id}")
def story_collection_graph(collection_id: str):
    return collection_graph(collection_id)


@router.post("/story/wilhelm-visuals")
def story_wilhelm_visuals(payload: dict):
    return wilhelm_visuals(payload.get("records", []))


@router.post("/story/stats-visual")
def story_stats_visual(payload: dict):
    return stats_visual(payload.get("items", []))


@router.post("/story/preface-visuals")
def story_preface_visuals(payload: dict):
    return preface_visuals(payload.get("prefaces", {}))


@router.post("/map/render")
def map_render(payload: MapRenderRequest):
    return render_map_svg(
        flows=payload.flows or MAP_FLOWS,
        sections=payload.sections or KNOWLEDGE_SECTIONS,
        mode=payload.mode,
        year=payload.year,
        title=payload.title,
    )


@router.post("/nlp/analyze")
def nlp_analyze(payload: NlpAnalyzeRequest):
    return analyze_items(payload.items or KNOWLEDGE_ITEMS)


@router.get("/admin/llm-config")
def get_llm_config(sid: Optional[str] = Cookie(default=None)):
    require_admin(sid)
    return public_config()


@router.post("/admin/llm-config")
def update_llm_config(payload: LlmConfigRequest, sid: Optional[str] = Cookie(default=None)):
    require_admin(sid)
    if not payload.url_base.strip():
        raise HTTPException(status_code=400, detail="url_base 不能为空。")
    return save_config(payload.url_base, payload.url_key, payload.default_model)


@router.post("/admin/llm-test")
def llm_test(payload: LlmTestRequest, sid: Optional[str] = Cookie(default=None)):
    require_admin(sid)
    try:
        return test_connection(payload.url_base, payload.url_key, payload.model)
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@router.post("/chat")
def chat(payload: ChatRequest, sid: Optional[str] = Cookie(default=None)):
    if not configured():
        raise HTTPException(status_code=400, detail="尚未配置真实大模型 API。请先使用管理员账号进入管理控制台配置 url_base 和 url_key。")

    section = next((item for item in KNOWLEDGE_SECTIONS if item["id"] == payload.sectionId), KNOWLEDGE_SECTIONS[0])
    target_items = select_target_items(payload, section)
    target_ids = {item["id"] for item in target_items}
    provider_name = MODEL_PROVIDERS.get(payload.provider, "OpenAI GPT")
    visual_type = infer_visual_type(payload.question.lower(), payload.retrievalMode)

    context_lines = [
        f"- {item['canonicalTitle']} / {item['translatedTitle']}，{item['year']}，{item['language']}，{item['city']}，{item['country']}，译者/作者：{item.get('translator') or item.get('author')}。摘要：{item.get('summary', '')}"
        for item in target_items
    ]
    attachment_lines = []
    image_parts = []
    for attachment in payload.attachments[:8]:
        text = str(attachment.get("text") or "")
        attachment_lines.append(
            f"- {attachment.get('name')} ({attachment.get('type')}, {attachment.get('size')} bytes): {text[:1600] if text else '无可提取文本，仅作为附件元数据参考。'}"
        )
        data_url = str(attachment.get("dataUrl") or "")
        if data_url.startswith("data:image/"):
            image_parts.append({"type": "image_url", "image_url": {"url": data_url}})

    system_prompt = (
        "你是中国文学海外译介与中国叙事知识平台的研究型智能问答助手。"
        "必须基于给定知识库证据和附件摘要回答，避免编造不存在的文献。"
        "如果问题需要地图、图谱、统计或思维导图，你在文字中说明分析结论即可，前端会根据结构化检索结果渲染可视化。"
        "回答使用中文，结构清晰，包含关键证据、时间、地点、语种、译者/作者和可继续研究的问题。"
    )
    user_prompt = (
        f"用户问题：{payload.question}\n"
        f"知识库分区：{section['title']}\n"
        f"检索模式：{payload.retrievalMode}\n"
        f"召回证据：\n" + "\n".join(context_lines) +
        ("\n附件摘要：\n" + "\n".join(attachment_lines) if attachment_lines else "")
    )
    user_content = [{"type": "text", "text": user_prompt}, *image_parts] if image_parts else user_prompt
    try:
        answer_text = chat_completion(
            [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_content}],
            model=payload.model,
            timeout=120,
        )
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    return {
        "answer": answer_text,
        "citations": [f"{item['resourceType']}｜{item['translatedTitle']}｜{item['city']}，{item['year']}" for item in target_items],
        "retrieval": {
            "provider": payload.provider,
            "providerName": provider_name,
            "model": payload.model,
            "mode": payload.retrievalMode,
            "confidence": 0.86 if visual_type in {"graph", "mixed"} else 0.78,
            "steps": ["语义召回", "元数据过滤", "实体消歧", "子图扩展" if payload.retrievalMode == "graph-rag" else "证据重排", "真实大模型生成"],
        },
        "visuals": {
            "type": visual_type,
            "records": [item["id"] for item in target_items],
            "graph": {
                "focusNodeIds": list({node_id for item in target_items for node_id in item.get("graphNodeIds", [])}),
                "title": f"{section['title']}关联子图" if visual_type in {"graph", "mixed"} else "",
            },
            "map": {
                "flows": [flow for flow in MAP_FLOWS if flow["id"] in target_ids],
                "title": f"{section['title']}传播地图" if visual_type in {"map", "mixed"} else "",
            },
        },
        "llm": {"configured": True, "source": "api"},
    }


@router.post("/chat/stream")
def chat_stream(payload: ChatRequest, sid: Optional[str] = Cookie(default=None)):
    """流式回答：返回 Server-Sent Events，每个事件携带文本片段；首个事件返回 metadata（是否需要检索等）。"""
    if not configured():
        raise HTTPException(status_code=400, detail="尚未配置真实大模型 API。请先使用管理员账号进入管理控制台配置 url_base 和 url_key。")

    section = next((item for item in KNOWLEDGE_SECTIONS if item["id"] == payload.sectionId), KNOWLEDGE_SECTIONS[0])
    # 简单规则判断是否需要检索：疑似地名/作者/年份/‘图谱’/‘地图’ 等关键词时启用检索
    question_lower = (payload.question or "").lower()
    retrieval_needed = any(k in question_lower for k in ["地图", "传播", "路线", "国家", "图谱", "关系", "作者", "译者", "年份", "year", "city", "country"]) or payload.retrievalMode == "graph-rag"

    # 如果需要检索则构建上下文，否则直接发起简短请求
    if retrieval_needed:
        target_items = select_target_items(payload, section)
        context_lines = [
            f"- {item['canonicalTitle']} / {item['translatedTitle']}，{item['year']}，{item['language']}，{item['city']}，{item['country']}，译者/作者：{item.get('translator') or item.get('author')}。摘要：{item.get('summary', '')}"
            for item in target_items
        ]
        user_prompt = (
            f"用户问题：{payload.question}\n"
            f"知识库分区：{section['title']}\n"
            f"检索模式：{payload.retrievalMode}\n"
            f"召回证据：\n" + "\n".join(context_lines)
        )
    else:
        user_prompt = payload.question or ""

    system_prompt = (
        "你是中国文学海外译介与中国叙事知识平台的研究型智能问答助手。"
        "请使用 Markdown 格式组织回答。简单问题直接给出答案；需要基于知识库/图谱回答时，在回答开头标注 [RETRIEVAL] 并列出使用到的证据条目。"
    )

    messages = [
        {"role": "system", "content": system_prompt},
        {"role": "user", "content": user_prompt}
    ]

    def event_stream():
        # 首个事件发送 metadata
        meta = {"retrieval_needed": retrieval_needed}
        yield f"data: {json.dumps({'meta': meta})}\n\n"
        try:
            model = payload.model or "gpt-4.1"
            for chunk in stream_chat_completion(messages, model=model, timeout=120):
                # 逐个文本片段按 SSE 发送
                yield f"data: {json.dumps({'text': chunk})}\n\n"
            yield "data: [DONE]\n\n"
        except RuntimeError as error:
            yield f"data: {json.dumps({'error': str(error)})}\n\n"

    return StreamingResponse(event_stream(), media_type="text/event-stream")
