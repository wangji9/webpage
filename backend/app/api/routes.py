from __future__ import annotations

from typing import Optional
import time

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
from backend.app.core.llm_client import DEFAULT_MODEL, chat_completion, configured, public_config, save_config, test_connection, stream_chat_completion
import json
from backend.app.core.map_renderer import render_map_svg
from backend.app.core.nlp_analyzer import analyze_items
from backend.app.core.qa_workflow import run_workflow
from backend.app.core.security import create_session, delete_session, get_session
from backend.app.core.story_visuals import collection_graph, preface_visuals, stats_visual, story_data, visual_atlas, wilhelm_keyword_categories, wilhelm_keyword_network, wilhelm_llm_knowledge_graph, wilhelm_story_analysis, wilhelm_visuals
from backend.app.core.basemap_geojson import (
    boundary_geojson,
    germany_adm02_geojson,
    jiuduanxian_geojson,
    land_geojson,
    nanhaizhudao_geojson,
    province_geojson,
    world_cities_geojson,
)
from backend.app.core.chat_retrieval import retrieve_chat_context
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
    if section["id"] == "stories":
        data = story_data()
        collections = data.get("collections", [])
        collection_items = [
            {
                "id": item.get("id") or f"story-{index}",
                "sectionId": "stories",
                "canonicalTitle": item.get("chineseTitle") or item.get("name") or "未命名故事集",
                "translatedTitle": item.get("foreignTitle") or item.get("name") or item.get("chineseTitle") or "未命名故事集",
                "year": item.get("year"),
                "language": item.get("language") or "德语",
                "city": item.get("city") or "",
                "country": item.get("country") or "",
                "translator": item.get("editor") or item.get("prefaceAuthor") or "",
                "author": item.get("editor") or item.get("prefaceAuthor") or "",
                "resourceType": item.get("carrier") or "图书",
                "summary": "；".join(
                    part
                    for part in [
                        f"译者/编者：{item.get('editor')}" if item.get("editor") else "",
                        f"身份：{item.get('editorRole')}" if item.get("editorRole") else "",
                        f"出版社：{item.get('publisher')}" if item.get("publisher") else "",
                        f"来源省份：{item.get('province') or item.get('sourceProvince')}" if item.get("province") or item.get("sourceProvince") else "",
                        f"关联子故事数：{len(item.get('matchedChildIds') or [])}" if item.get("matchedChildIds") else "",
                    ]
                    if part
                ),
                "graphNodeIds": [f"story-collection:{item.get('id')}"] if item.get("id") else [],
            }
            for index, item in enumerate(collections)
        ]
        question = (payload.question or "").lower()
        matched = [
            item
            for item in collection_items
            if item["canonicalTitle"].lower() in question
            or item["translatedTitle"].lower() in question
            or item.get("translator", "").lower() in question
            or item.get("city", "").lower() in question
            or item.get("country", "").lower() in question
            or item.get("summary", "").lower() in question
        ]
        return matched or collection_items

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


@router.get("/basemap/province")
def basemap_province():
    return province_geojson()


@router.get("/basemap/boundary")
def basemap_boundary():
    return boundary_geojson()


@router.get("/basemap/world-cities")
def basemap_world_cities():
    return world_cities_geojson()


@router.get("/basemap/land")
def basemap_land():
    return land_geojson()


@router.get("/basemap/germany-adm02")
def basemap_germany_adm02():
    return germany_adm02_geojson()


@router.get("/basemap/nanhaizhudao")
def basemap_nanhaizhudao():
    return nanhaizhudao_geojson()


@router.get("/basemap/jiuduanxian")
def basemap_jiuduanxian():
    return jiuduanxian_geojson()


@router.get("/story/visual-atlas")
def story_visual_atlas(mode: str = "all"):
    return visual_atlas(mode)


@router.get("/story/collection-graph/{collection_id}")
def story_collection_graph(collection_id: str):
    return collection_graph(collection_id)


@router.post("/story/wilhelm-visuals")
def story_wilhelm_visuals(payload: dict):
    return wilhelm_visuals(payload.get("records", []))


@router.post("/story/wilhelm-story-analysis")
def story_wilhelm_story_analysis(payload: dict):
    return wilhelm_story_analysis(payload.get("stories", []))


@router.post("/story/wilhelm-keyword-network")
def story_wilhelm_keyword_network(payload: dict):
    try:
        return wilhelm_keyword_network(
            stories=payload.get("stories", []),
            force=bool(payload.get("force")),
            model=str(payload.get("model") or ""),
            method=str(payload.get("method") or "algorithm"),
        )
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@router.api_route("/story/wilhelm-knowledge-graph", methods=["GET", "POST"])
def story_wilhelm_knowledge_graph(payload: Optional[dict] = None):
    payload = payload or {}
    try:
        return wilhelm_llm_knowledge_graph(
            scope_id=str(payload.get("scopeId") or ""),
            title=str(payload.get("title") or "卫礼贤《中国民间童话》知识图谱"),
            text=str(payload.get("text") or ""),
            force=bool(payload.get("force")),
            model=str(payload.get("model") or ""),
            method=str(payload.get("method") or "algorithm"),
        )
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@router.post("/story/wilhelm-keyword-categories")
def story_wilhelm_keyword_categories(payload: dict):
    try:
        return wilhelm_keyword_categories(
            terms=payload.get("terms", []),
            force=bool(payload.get("force")),
            model=str(payload.get("model") or ""),
        )
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


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
def get_llm_config(provider: str = "gpt", sid: Optional[str] = Cookie(default=None)):
    require_admin(sid)
    return public_config(provider=provider)


@router.post("/admin/llm-config")
def update_llm_config(payload: LlmConfigRequest, sid: Optional[str] = Cookie(default=None)):
    require_admin(sid)
    if not payload.url_base.strip():
        raise HTTPException(status_code=400, detail="url_base 不能为空。")
    return save_config(payload.url_base, payload.url_key, payload.default_model, provider=payload.provider)


@router.post("/admin/llm-test")
def llm_test(payload: LlmTestRequest, sid: Optional[str] = Cookie(default=None)):
    require_admin(sid)
    try:
        return test_connection(payload.url_base, payload.url_key, payload.model, provider=payload.provider)
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@router.post("/chat")
def chat(payload: ChatRequest, sid: Optional[str] = Cookie(default=None)):
    if not configured(payload.provider, payload.model):
        cfg = public_config(provider=payload.provider)
        raise HTTPException(
            status_code=400,
            detail=(
                "尚未配置真实大模型 API。"
                f"provider={payload.provider}，url_base={'已设置' if cfg.get('url_base') else '未设置'}，url_key={'已设置' if cfg.get('has_key') else '未设置'}。"
                "请先使用管理员账号进入管理控制台配置 url_base 和 url_key。"
            ),
        )

    section = next((item for item in KNOWLEDGE_SECTIONS if item["id"] == payload.sectionId), KNOWLEDGE_SECTIONS[0])
    target_items = [] if payload.retrievalMode == "none" else select_target_items(payload, section)
    provider_value = MODEL_PROVIDERS.get(payload.provider)
    provider_name = provider_value.get("name") if isinstance(provider_value, dict) else provider_value or "OpenAI GPT"
    if payload.retrievalMode == "none":
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
            f"你是当前被调用的大模型，模型标识为 {payload.model or 'default'}。"
            "请直接回答用户问题，不要检索知识库，不要添加平台说明。"
            "如果用户询问你是什么模型，请按当前模型标识回答。回答使用 Markdown。"
        )
        user_prompt = payload.question or ""
        if attachment_lines:
            user_prompt += "\n附件摘要：\n" + "\n".join(attachment_lines)
        user_content = [{"type": "text", "text": user_prompt}, *image_parts] if image_parts else user_prompt
        try:
            answer_text = chat_completion(
                [{"role": "system", "content": system_prompt}, {"role": "user", "content": user_content}],
                model=payload.model,
                timeout=120,
                provider=payload.provider,
            )
        except RuntimeError as error:
            raise HTTPException(status_code=502, detail=str(error)) from error
        return {
            "answer": answer_text,
            "citations": [],
            "retrieval": {
                "provider": payload.provider,
                "providerName": provider_name,
                "model": payload.model,
                "mode": payload.retrievalMode,
                "database": "无（直接调用大模型）",
                "confidence": 1,
                "steps": ["直接调用真实大模型生成"],
            },
            "visuals": {"type": "text", "chartKeys": [], "records": [], "graph": {"focusNodeIds": []}, "map": {"flows": []}, "charts": {}},
            "workflow": {
                "provider": payload.provider,
                "model": payload.model,
                "sectionId": section.get("id"),
                "plan": {"visual_type": "text", "keywords": [], "chart_keys": [], "retrieval_needed": False},
                "steps": ["直接调用真实大模型生成"],
            },
            "llm": {"configured": True, "source": "api"},
        }

    try:
        result = run_workflow(
            question=payload.question,
            retrieval_mode=payload.retrievalMode,
            model=payload.model,
            provider=payload.provider,
            section=section,
            target_items=target_items,
            map_flows=MAP_FLOWS,
            knowledge_sections=KNOWLEDGE_SECTIONS,
        )
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error

    return {
        **result,
        "retrieval": {
            "provider": payload.provider,
            "providerName": provider_name,
            "model": payload.model,
            "mode": payload.retrievalMode,
            "database": "无（直接调用大模型）" if payload.retrievalMode == "none" else section["title"],
            "confidence": 0.86 if result.get("visuals", {}).get("type") in {"graph", "mixed"} else 0.78,
            "steps": result.get("workflow", {}).get("steps", []),
        },
        "llm": {"configured": True, "source": "api"},
    }


@router.post("/chat/stream")
def chat_stream(payload: ChatRequest, sid: Optional[str] = Cookie(default=None)):
    """Stream chat responses as Server-Sent Events."""
    if not configured(payload.provider, payload.model):
        cfg = public_config(provider=payload.provider)
        raise HTTPException(
            status_code=400,
            detail=(
                "尚未配置真实大模型 API。"
                f"provider={payload.provider}，url_base={'已设置' if cfg.get('url_base') else '未设置'}，url_key={'已设置' if cfg.get('has_key') else '未设置'}。"
                "请先使用管理员账号进入管理控制台配置 url_base 和 url_key。"
            ),
        )

    started_at = time.perf_counter()
    section = next((item for item in KNOWLEDGE_SECTIONS if item["id"] == payload.sectionId), KNOWLEDGE_SECTIONS[0])
    target_items = [] if payload.retrievalMode == "none" else select_target_items(payload, section)
    provider_value = MODEL_PROVIDERS.get(payload.provider)
    provider_name = provider_value.get("name") if isinstance(provider_value, dict) else provider_value or "OpenAI GPT"
    direct_mode = payload.retrievalMode == "none"
    direct_messages = []
    if direct_mode:
        attachment_lines = []
        for attachment in payload.attachments[:8]:
            text = str(attachment.get("text") or "")
            attachment_lines.append(
                f"- {attachment.get('name')} ({attachment.get('type')}, {attachment.get('size')} bytes): {text[:1600] if text else '无可提取文本，仅作为附件元数据参考。'}"
            )
        system_prompt = (
            f"你是当前被调用的大模型，模型标识为 {payload.model or 'default'}。"
            "请直接回答用户问题，不要检索知识库，不要添加平台说明。"
            "如果用户询问你是什么模型，请按当前模型标识回答。回答使用 Markdown。"
        )
        user_prompt = payload.question or ""
        if attachment_lines:
            user_prompt += "\n附件摘要：\n" + "\n".join(attachment_lines)
        direct_messages = [
            {"role": "system", "content": system_prompt},
            {"role": "user", "content": user_prompt},
        ]

    def event_stream():
        try:
            if direct_mode:
                meta = {
                    "retrieval_needed": False,
                    "retrieval_mode": payload.retrievalMode,
                    "database": "无（直接调用大模型）",
                    "evidence": [],
                    "records": [],
                    "flows": [],
                    "provider": payload.provider,
                    "providerName": provider_name,
                    "model": payload.model or DEFAULT_MODEL,
                    "visuals": {"type": "text", "chartKeys": [], "records": [], "graph": {"focusNodeIds": []}, "map": {"flows": []}, "charts": {}},
                    "chartKeys": [],
                    "charts": {},
                    "wilhelm": {},
                    "workflow": {
                        "provider": payload.provider,
                        "model": payload.model,
                        "sectionId": section.get("id"),
                        "plan": {"visual_type": "text", "keywords": [], "chart_keys": [], "retrieval_needed": False},
                        "steps": ["直接调用真实大模型生成"],
                    },
                }
                yield f"data: {json.dumps({'meta': meta}, ensure_ascii=False)}\n\n"
                answer_text = ""
                for chunk in stream_chat_completion(direct_messages, model=payload.model or DEFAULT_MODEL, provider=payload.provider, timeout=120):
                    answer_text += chunk
                    yield f"data: {json.dumps({'text': chunk}, ensure_ascii=False)}\n\n"
                elapsed_ms = int((time.perf_counter() - started_at) * 1000)
                approx_tokens = max(1, round(len(answer_text) / 1.8))
                yield f"data: {json.dumps({'meta': {**meta, 'elapsed_ms': elapsed_ms, 'tokens': approx_tokens, 'token_estimated': True}}, ensure_ascii=False)}\n\n"
                yield "data: [DONE]\n\n"
                return

            result = run_workflow(
                question=payload.question,
                retrieval_mode=payload.retrievalMode,
                model=payload.model,
                provider=payload.provider,
                section=section,
                target_items=target_items,
                map_flows=MAP_FLOWS,
                knowledge_sections=KNOWLEDGE_SECTIONS,
            )
            visuals = result.get("visuals", {})
            meta = {
                "retrieval_needed": payload.retrievalMode != "none",
                "retrieval_mode": payload.retrievalMode,
                "database": "无（直接调用大模型）" if payload.retrievalMode == "none" else section["title"],
                "evidence": result.get("citations", []),
                "records": visuals.get("records", []),
                "flows": visuals.get("map", {}).get("flows", []),
                "provider": payload.provider,
                "providerName": provider_name,
                "model": payload.model or DEFAULT_MODEL,
                "visuals": visuals,
                "chartKeys": visuals.get("chartKeys", []),
                "charts": visuals.get("charts", {}),
                "wilhelm": visuals.get("wilhelm", {}),
                "workflow": result.get("workflow", {}),
            }
            yield f"data: {json.dumps({'meta': meta}, ensure_ascii=False)}\n\n"
            answer_text = str(result.get("answer") or "")
            for start in range(0, len(answer_text), 80):
                yield f"data: {json.dumps({'text': answer_text[start:start + 80]}, ensure_ascii=False)}\n\n"
            elapsed_ms = int((time.perf_counter() - started_at) * 1000)
            approx_tokens = max(1, round(len(answer_text) / 1.8))
            yield f"data: {json.dumps({'meta': {**meta, 'elapsed_ms': elapsed_ms, 'tokens': approx_tokens, 'token_estimated': True}}, ensure_ascii=False)}\n\n"
            yield "data: [DONE]\n\n"
        except RuntimeError as error:
            elapsed_ms = int((time.perf_counter() - started_at) * 1000)
            yield f"data: {json.dumps({'meta': {'elapsed_ms': elapsed_ms, 'tokens': 0, 'token_estimated': True}}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'error': str(error)}, ensure_ascii=False)}\n\n"
        except Exception as error:
            elapsed_ms = int((time.perf_counter() - started_at) * 1000)
            yield f"data: {json.dumps({'meta': {'elapsed_ms': elapsed_ms, 'tokens': 0, 'token_estimated': True}}, ensure_ascii=False)}\n\n"
            yield f"data: {json.dumps({'error': f'智能问答服务异常：{type(error).__name__}: {error}'}, ensure_ascii=False)}\n\n"

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={"X-Accel-Buffering": "no"},
    )
