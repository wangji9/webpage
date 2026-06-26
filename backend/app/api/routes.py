from __future__ import annotations

from pathlib import Path
from typing import Any, Optional
import re
import time

from fastapi import APIRouter, Cookie, HTTPException, Query, Request, Response
from fastapi.responses import FileResponse, StreamingResponse

from backend.app.core.data import (
    GRAPH_DATA,
    KNOWLEDGE_ITEMS,
    KNOWLEDGE_SECTIONS,
    MAP_FLOWS,
    MODEL_PROVIDERS,
    REPRESENTATIVE_RESULTS,
)
from backend.app.core.llm_client import DEFAULT_MODEL, chat_completion, configured, public_config, save_config, test_connection, stream_chat_completion
import json
from backend.app.core.dataset_store import create_dataset, custom_knowledge_items, dataset_manifest, dataset_preview, delete_dataset, module_dataset_packages, rebuild_for, upload_dataset
from backend.app.core.map_renderer import render_map_svg
from backend.app.core.nlp_analyzer import analyze_items
from backend.app.core.qa_workflow import run_workflow
from backend.app.core.security import create_session, delete_session, get_session
from backend.app.core.story_visuals import collection_graph, preface_visuals, stats_visual, story_data, visual_atlas, wilhelm_keyword_categories, wilhelm_keyword_network, wilhelm_llm_knowledge_graph, wilhelm_story_analysis, wilhelm_visuals
from backend.app.core.user_store import (
    authenticate,
    change_user_password,
    create_user,
    delete_user,
    get_user_profile_bundle,
    list_users,
    public_user_by_id,
    record_user_activity,
    update_own_profile,
    update_user,
)
from backend.app.core.basemap_geojson import (
    boundary_geojson,
    germany_adm02_geojson,
    jiuduanxian_geojson,
    land_geojson,
    nanhaizhudao_geojson,
    province_geojson,
    world_cities_geojson,
)
from backend.app.core.knowledge_indexes import (
    graph_for_scope,
    ingest_text_graph,
    index_summary,
    rebuild_index,
    search_index,
)
from backend.app.core.global_literary_architecture import (
    architecture_payload,
    compare_terms,
    distance_search,
    documents_payload,
    frequency_stats,
    geography_stats,
    graph_payload,
    register_submodule,
    remove_submodule,
    search_fulltext,
    timeline_stats,
    visualization_layer_payload,
)
from backend.app.core.german_story_corpus import german_story_corpus_payload, german_story_reader_payload, warm_german_story_corpus_visuals
from backend.app.core.academic_search import academic_search
from backend.app.core.local_ai_runtime import local_ai_status
from backend.app.core import platform_store
from backend.app.core import site_content
from backend.app.core import platform_db
from backend.app.core.platform_auth import token_pair, verify_token
from backend.app.models.schemas import (
    ActivityLogRequest,
    AdminUserCreateRequest,
    AdminUserUpdateRequest,
    AcademicSearchRequest,
    AdvancedTextVisualizationRequest,
    BackupRequest,
    ComparisonRequest,
    DatasetCreateRequest,
    ChatRequest,
    DocumentTextAnalysisRequest,
    DatasetUploadRequest,
    ExportRequest,
    FullTextSearchRequest,
    LlmConfigRequest,
    LlmTestRequest,
    LoginRequest,
    MapRenderRequest,
    NlpAnalyzeRequest,
    PasswordChangeRequest,
    ProfileUpdateRequest,
    RestoreRequest,
    SubModuleManageRequest,
    SystemConfigRequest,
    TopicClusteringRequest,
    RegisterRequest,
    ResetPasswordRequest,
    VerificationCodeRequest,
    WordDistanceRequest,
    WordFrequencyRequest,
    WordTrendRequest,
)

router = APIRouter(prefix="/api")


def decode_multipart_filename(value: str) -> str:
    try:
        return value.encode("latin-1").decode("utf-8")
    except Exception:
        return value


async def parse_multipart_compat(request: Request) -> tuple[dict[str, str], dict[str, dict[str, Any]]]:
    content_type = request.headers.get("content-type", "")
    match = re.search(r"boundary=(?P<boundary>[^;]+)", content_type)
    if not match:
        raise ValueError("multipart boundary is missing.")
    boundary = match.group("boundary").strip().strip('"').encode("utf-8")
    body = await request.body()
    fields: dict[str, str] = {}
    files: dict[str, dict[str, Any]] = {}
    for raw_part in body.split(b"--" + boundary):
        part = raw_part.strip(b"\r\n")
        if not part or part == b"--":
            continue
        if b"\r\n\r\n" not in part:
            continue
        header_blob, content = part.split(b"\r\n\r\n", 1)
        content = content.rstrip(b"\r\n")
        if content.endswith(b"--"):
            content = content[:-2].rstrip(b"\r\n")
        headers = header_blob.decode("latin-1", errors="ignore")
        name_match = re.search(r'name="([^"]+)"', headers)
        if not name_match:
            continue
        name = name_match.group(1)
        file_match = re.search(r'filename="([^"]*)"', headers)
        if file_match:
            files[name] = {"filename": decode_multipart_filename(file_match.group(1) or "upload.bin"), "content": content}
        else:
            fields[name] = content.decode("utf-8", errors="replace")
    return fields, files


def session_user(sid: Optional[str]) -> Optional[dict]:
    session = get_session(sid)
    if not session:
        return None
    user_id = session.get("user", {}).get("id")
    user = public_user_by_id(user_id) if user_id else session.get("user")
    if not user or user.get("status") != "active":
        return None
    return user


def require_admin(sid: Optional[str]) -> dict:
    user = session_user(sid)
    if not user or user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="仅管理员可配置大模型接口。")
    return user


def require_user(sid: Optional[str]) -> dict:
    user = session_user(sid)
    if not user:
        raise HTTPException(status_code=401, detail="请先登录后再访问个人中心。")
    return user


def require_dataset_admin(sid: Optional[str]) -> dict:
    user = session_user(sid)
    if not user or user.get("role") not in {"admin", "sub_admin"}:
        raise HTTPException(status_code=403, detail="仅管理员或子管理员可维护表格数据。")
    return user


def require_master_admin(sid: Optional[str]) -> dict:
    user = require_admin(sid)
    if not user.get("isMasterAdmin"):
        raise HTTPException(status_code=403, detail="仅主管理员可维护用户权限和模型接口。")
    return user


def all_knowledge_items() -> list[dict]:
    return [*KNOWLEDGE_ITEMS, *custom_knowledge_items()]


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

    items = all_knowledge_items()
    section_items = [item for item in items if item["sectionId"] == section["id"]]
    selected = next((item for item in items if item["id"] == payload.recordId), None)
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


def indexed_chat_context(payload: ChatRequest, section: dict, fallback_items: list[dict]) -> dict:
    try:
        return search_index(
            question=payload.question,
            section=section,
            retrieval_mode=payload.retrievalMode,
            record_id=payload.recordId,
            payload=payload,
            limit=10,
        )
    except Exception:
        return {
            "items": fallback_items,
            "context_lines": [],
            "citations": [],
            "database": section.get("title") or section.get("id"),
            "flows": [],
            "evidence": [],
            "subgraph": {"scope": {"id": section.get("id"), "name": section.get("title")}, "nodes": [], "edges": []},
        }


@router.get("/session")
def read_session(sid: Optional[str] = Cookie(default=None)):
    user = session_user(sid)
    return {"loggedIn": bool(user), "user": user}


@router.get("/me/profile")
def me_profile(sid: Optional[str] = Cookie(default=None)):
    user = require_user(sid)
    try:
        return get_user_profile_bundle(user["id"])
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.patch("/me/profile")
def me_update_profile(payload: ProfileUpdateRequest, sid: Optional[str] = Cookie(default=None)):
    user = require_user(sid)
    try:
        return update_own_profile(user["id"], payload.model_dump(exclude_unset=True))
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/me/password")
def me_change_password(payload: PasswordChangeRequest, sid: Optional[str] = Cookie(default=None)):
    user = require_user(sid)
    try:
        return change_user_password(user["id"], payload.currentPassword, payload.newPassword)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/me/activity")
def me_activity(sid: Optional[str] = Cookie(default=None)):
    user = require_user(sid)
    return {"activity": get_user_profile_bundle(user["id"]).get("activity", [])}


@router.post("/me/activity")
def me_record_activity(payload: ActivityLogRequest, sid: Optional[str] = Cookie(default=None)):
    user = require_user(sid)
    try:
        return record_user_activity(user["id"], payload.model_dump())
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.post("/login")
def login(payload: LoginRequest, response: Response):
    user = authenticate(payload.username, payload.password)
    if not user:
        raise HTTPException(status_code=401, detail="用户名或密码不正确")

    sid = create_session(user)
    response.set_cookie("sid", sid, httponly=True, samesite="lax", max_age=86400)
    return {"user": user}


@router.post("/auth/send-code")
def send_code(payload: VerificationCodeRequest):
    raise HTTPException(status_code=403, detail="注册与邮箱验证码已关闭，请联系管理员分配账号。")


@router.post("/register")
def register(payload: RegisterRequest):
    raise HTTPException(status_code=403, detail="注册已关闭，请联系管理员分配账号。")


@router.post("/auth/register")
def auth_register(payload: RegisterRequest):
    return register(payload)


@router.post("/auth/login")
def auth_login(payload: LoginRequest, response: Response):
    user = authenticate(payload.username, payload.password)
    if not user:
        raise HTTPException(status_code=401, detail="用户名/邮箱或密码不正确。")
    sid = create_session(user)
    response.set_cookie("sid", sid, httponly=True, samesite="lax", max_age=86400)
    return {"user": user, **token_pair(user)}


@router.post("/auth/refresh")
async def auth_refresh(request: Request):
    payload = await request.json()
    token = str(payload.get("refresh_token") or payload.get("refreshToken") or "")
    try:
        claims = verify_token(token, expected_type="refresh")
    except ValueError as error:
        raise HTTPException(status_code=401, detail=str(error)) from error
    user = public_user_by_id(str(claims.get("sub")))
    if not user:
        raise HTTPException(status_code=401, detail="User no longer exists.")
    return token_pair(user)


def handle_password_reset(payload: ResetPasswordRequest):
    raise HTTPException(status_code=403, detail="自助重置密码已关闭，请联系管理员修改密码。")


@router.post("/auth/reset-password")
def auth_reset_password(payload: ResetPasswordRequest):
    return handle_password_reset(payload)


@router.post("/reset-password")
def reset_password_alias(payload: ResetPasswordRequest):
    return handle_password_reset(payload)


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
    return {"items": all_knowledge_items()}


@router.get("/kb/module-datasets")
def knowledge_module_datasets(module_id: str = "", submodule_id: str = "", summary: bool = False):
    return module_dataset_packages(module_id or None, submodule_id or None, summary=summary)


@router.get("/architecture")
def literary_architecture():
    return architecture_payload()


@router.get("/modules")
def literary_modules():
    return {"modules": architecture_payload().get("modules", [])}


@router.get("/modules/{module_id}/submodules")
def literary_submodules(module_id: str):
    module = next((item for item in architecture_payload().get("modules", []) if item.get("id") == module_id), None)
    if not module:
        raise HTTPException(status_code=404, detail="模块不存在。")
    return {"module": module, "submodules": module.get("submodules", [])}


@router.get("/documents")
def literary_documents(module_id: str = "", submodule_id: str = "", q: str = "", limit: int = 80):
    return documents_payload(module_id, submodule_id, q, limit)


@router.get("/documents/{document_id}")
def literary_document(document_id: str):
    payload = documents_payload(limit=500)
    document = next((item for item in payload.get("documents", []) if item.get("id") == document_id), None)
    if not document:
        raise HTTPException(status_code=404, detail="文献不存在。")
    return document


@router.post("/modules")
def literary_register_module(payload: dict, sid: Optional[str] = Cookie(default=None)):
    require_dataset_admin(sid)
    try:
        return {"submodule": register_submodule(payload)}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.delete("/modules/{module_id}")
def literary_remove_module(module_id: str, sid: Optional[str] = Cookie(default=None)):
    require_dataset_admin(sid)
    if not remove_submodule(module_id):
        raise HTTPException(status_code=404, detail="仅动态注册子模块可删除，或该子模块不存在。")
    return {"ok": True}


@router.get("/graph/global")
def literary_global_graph():
    return graph_payload("global")


@router.get("/graph/module/{module_id}")
def literary_module_graph(module_id: str):
    return graph_payload(module_id)


@router.get("/graph/entity/{entity_id}")
def literary_entity_graph(entity_id: str):
    graph_data = graph_payload("global")
    node_ids = {entity_id}
    for edge in graph_data.get("edges", []):
        if edge.get("from") == entity_id:
            node_ids.add(edge.get("to"))
        if edge.get("to") == entity_id:
            node_ids.add(edge.get("from"))
    return {
        "nodes": [node for node in graph_data.get("nodes", []) if node.get("id") in node_ids],
        "edges": [edge for edge in graph_data.get("edges", []) if edge.get("from") in node_ids and edge.get("to") in node_ids],
    }


@router.get("/stats/frequency")
def literary_frequency_stats(module_id: str = "", limit: int = 20):
    return frequency_stats(module_id, limit)


@router.get("/stats/timeline")
def literary_timeline_stats(module_id: str = ""):
    return timeline_stats(module_id)


@router.get("/stats/geography")
def literary_geography_stats(module_id: str = ""):
    return geography_stats(module_id)


@router.get("/visualization/layer")
def literary_visualization_layer(module_id: str = "", submodule_id: str = ""):
    return visualization_layer_payload(module_id, submodule_id)


@router.get("/search/fulltext")
def literary_fulltext_search(q: str = "", module_id: str = "", limit: int = 40):
    return search_fulltext(q, module_id, limit)


@router.get("/search/distance")
def literary_distance_search(q1: str = "", q2: str = "", range: int = 10, module_id: str = ""):
    return distance_search(q1, q2, range, module_id)


@router.get("/search/compare")
def literary_compare_search(terms: str = "", module_id: str = ""):
    return compare_terms(terms, module_id)


@router.get("/results")
def results():
    return {"results": REPRESENTATIVE_RESULTS}


@router.get("/graph")
def graph():
    return GRAPH_DATA


@router.get("/index/status")
def knowledge_index_status():
    return index_summary()


@router.post("/index/rebuild")
def knowledge_index_rebuild(sid: Optional[str] = Cookie(default=None)):
    require_dataset_admin(sid)
    return rebuild_index(sync_external=True)


@router.get("/index/graph/{scope_id:path}")
def knowledge_index_graph(scope_id: str = "global", q: str = "", limit: int = 80):
    return graph_for_scope(scope_id or "global", query=q, limit=limit)


@router.post("/index/extract-graph")
def knowledge_index_extract_graph(payload: dict, sid: Optional[str] = Cookie(default=None)):
    require_user(sid)
    return ingest_text_graph(
        text=str(payload.get("text") or ""),
        scope_id=str(payload.get("scopeId") or "upload"),
        title=str(payload.get("title") or "上传文本"),
        text_kind=str(payload.get("textKind") or "upload"),
        sync_external=True,
    )


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
    return wilhelm_story_analysis(payload.get("stories", []), payload.get("records", []))


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


@router.get("/story/german-corpus")
def story_german_corpus(document_id: str = "", scope: str = "single", q: str = ""):
    return german_story_reader_payload(document_id=document_id, query=q)


@router.get("/story/german-corpus/advanced")
def story_german_corpus_advanced(document_id: str = "", scope: str = "single", q: str = "", method_id: str = "", topic_count: int = 18):
    try:
        return german_story_corpus_payload(document_id=document_id, scope=scope, query=q, method_id=method_id, topic_count=topic_count)
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@router.post("/story/german-corpus/advanced/warmup")
def story_german_corpus_advanced_warmup(payload: dict):
    try:
        return warm_german_story_corpus_visuals(
            document_id=str(payload.get("document_id") or payload.get("documentId") or ""),
            scope=str(payload.get("scope") or "single"),
            topic_count=int(payload.get("topic_count") or payload.get("topicCount") or 18),
            method_ids=payload.get("method_ids") or payload.get("methodIds"),
            max_methods=payload.get("max_methods") or payload.get("maxMethods"),
        )
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


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
    return analyze_items(payload.items or all_knowledge_items())


@router.get("/admin/llm-config")
def get_llm_config(provider: str = "gpt", sid: Optional[str] = Cookie(default=None)):
    require_master_admin(sid)
    return public_config(provider=provider)


@router.post("/admin/llm-config")
def update_llm_config(payload: LlmConfigRequest, sid: Optional[str] = Cookie(default=None)):
    require_master_admin(sid)
    if not payload.url_base.strip():
        raise HTTPException(status_code=400, detail="url_base 不能为空。")
    return save_config(payload.url_base, payload.url_key, payload.default_model, provider=payload.provider)


@router.post("/admin/llm-test")
def llm_test(payload: LlmTestRequest, sid: Optional[str] = Cookie(default=None)):
    require_master_admin(sid)
    try:
        return test_connection(payload.url_base, payload.url_key, payload.model, provider=payload.provider)
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@router.get("/admin/llm-configs")
def list_llm_configs(sid: Optional[str] = Cookie(default=None)):
    require_master_admin(sid)
    config = public_config(provider="gpt")
    return {"configs": [{**config, "id": 1, "provider": "openai", "api_key": None, "is_default": True}]}


@router.post("/admin/llm-configs")
def create_llm_config(payload: LlmConfigRequest, sid: Optional[str] = Cookie(default=None)):
    require_master_admin(sid)
    data = save_config(payload.url_base, payload.url_key, payload.default_model, provider=payload.provider)
    return {"config": {**data, "id": 1, "provider": "openai", "api_key": None, "is_default": True}}


@router.put("/admin/llm-configs/{config_id}")
def update_llm_config_item(config_id: int, payload: LlmConfigRequest, sid: Optional[str] = Cookie(default=None)):
    require_master_admin(sid)
    data = save_config(payload.url_base, payload.url_key, payload.default_model, provider=payload.provider)
    return {"config": {**data, "id": config_id, "provider": "openai", "api_key": None, "is_default": True}}


@router.delete("/admin/llm-configs/{config_id}")
def delete_llm_config_item(config_id: int, sid: Optional[str] = Cookie(default=None)):
    require_master_admin(sid)
    return {"ok": True, "id": config_id}


@router.post("/admin/llm-configs/{config_id}/test")
def test_llm_config_item(config_id: int, payload: LlmTestRequest, sid: Optional[str] = Cookie(default=None)):
    require_master_admin(sid)
    try:
        return {"id": config_id, **test_connection(payload.url_base, payload.url_key, payload.model, provider=payload.provider)}
    except RuntimeError as error:
        raise HTTPException(status_code=502, detail=str(error)) from error


@router.get("/admin/database/health")
def admin_database_health(sid: Optional[str] = Cookie(default=None)):
    require_admin(sid)
    return platform_db.health()


@router.post("/admin/database/apply-schema")
def admin_database_apply_schema(sid: Optional[str] = Cookie(default=None)):
    require_admin(sid)
    try:
        return platform_db.apply_schema()
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error


@router.get("/admin/datasets")
def admin_datasets(sid: Optional[str] = Cookie(default=None)):
    require_dataset_admin(sid)
    return dataset_manifest()


@router.get("/admin/documents")
def admin_documents(sub_module_id: str = "", sid: Optional[str] = Cookie(default=None)):
    require_dataset_admin(sid)
    return {"documents": platform_store.list_documents(sub_module_id or None)}


@router.get("/admin/documents/{dataset_id}")
def admin_document_detail(dataset_id: str, sid: Optional[str] = Cookie(default=None)):
    require_dataset_admin(sid)
    try:
        return platform_store.document_detail(dataset_id)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/admin/documents/upload")
async def admin_document_upload(request: Request, sid: Optional[str] = Cookie(default=None)):
    user = require_dataset_admin(sid)
    try:
        form, files = await parse_multipart_compat(request)
        file = files.get("file")
        if file is None:
            raise ValueError("multipart request must include file.")
        sub_module_id = form.get("sub_module_id") or form.get("subModuleId") or form.get("submodule_id")
        if not sub_module_id:
            raise ValueError("sub_module_id is required.")
        force_ocr = str(form.get("force_ocr") or form.get("forceOcr") or "").strip().lower() in {"1", "true", "yes", "on"}
        filename = str(form.get("file_name") or form.get("filename") or file.get("filename") or "document")
        dataset = platform_store.upload_dataset_file(
            sub_module_id=sub_module_id,
            file_bytes=file.get("content") or b"",
            filename=filename,
            field_mappings={"title": "title", "content": "content", "source": "source", "notes": "notes"},
            dataset_name=str(form.get("name") or form.get("dataset_name") or ""),
            description=str(form.get("description") or ""),
            affected_pages=["知识库", "智能问答", "统计图表", "详情页"],
            key_fields=["title", "content", "source"],
            uploaded_by=user.get("id"),
            dataset_kind="document",
            force_ocr=force_ocr,
        )
        try:
            rebuild_index(sync_external=False)
        except Exception:
            pass
        return {"document": dataset, "progress": 1, "completed": True}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error


@router.post("/admin/documents/{dataset_id}/reparse")
async def admin_document_reparse(dataset_id: str, request: Request, sid: Optional[str] = Cookie(default=None)):
    require_dataset_admin(sid)
    try:
        payload = await request.json()
    except Exception:
        payload = {}
    try:
        current = platform_store.get_dataset(dataset_id)
        if current.get("dataset_kind") != "document":
            raise ValueError("The selected dataset is not a document.")
        platform_store.update_dataset(dataset_id, {"force_ocr": bool(payload.get("force_ocr") or payload.get("forceOcr"))})
        document = platform_store.reparse_dataset(dataset_id)
        try:
            rebuild_index(sync_external=False)
        except Exception:
            pass
        return {"document": document}
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except (ValueError, FileNotFoundError) as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/admin/datasets")
def admin_dataset_create(payload: DatasetCreateRequest, sid: Optional[str] = Cookie(default=None)):
    user = require_dataset_admin(sid)
    try:
        return {"dataset": create_dataset(payload.model_dump(), username=user.get("username") or user.get("name") or "admin")}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.get("/admin/datasets/{dataset_id}/preview")
def admin_dataset_preview(dataset_id: str, sid: Optional[str] = Cookie(default=None)):
    require_dataset_admin(sid)
    try:
        return dataset_preview(dataset_id)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.post("/admin/datasets/upload")
async def admin_dataset_upload(request: Request, sid: Optional[str] = Cookie(default=None)):
    user = require_dataset_admin(sid)
    content_type = request.headers.get("content-type", "")
    if "multipart/form-data" in content_type:
        try:
            form, files = await parse_multipart_compat(request)
            file = files.get("file")
            if file is None:
                raise ValueError("multipart request must include file.")
            sub_module_id = form.get("sub_module_id") or form.get("subModuleId") or form.get("submodule_id")
            if not sub_module_id:
                raise ValueError("sub_module_id is required.")
            field_mappings = form.get("field_mappings") or form.get("fieldMappings") or "{}"
            upload_id = str(form.get("upload_id") or form.get("uploadId") or "")
            chunk_index = form.get("chunk_index") or form.get("chunkIndex")
            total_chunks = form.get("total_chunks") or form.get("totalChunks")
            filename = str(form.get("file_name") or form.get("filename") or file.get("filename") or "dataset")
            content = file.get("content") or b""
            if upload_id and chunk_index is not None and total_chunks is not None:
                return platform_store.save_upload_chunk(
                    upload_id=upload_id,
                    index=int(chunk_index),
                    total=int(total_chunks),
                    chunk=content,
                    filename=filename,
                    sub_module_id=sub_module_id,
                    field_mappings=field_mappings,
                )
            dataset = platform_store.upload_dataset_file(
                sub_module_id=sub_module_id,
                file_bytes=content,
                filename=filename,
                field_mappings=field_mappings,
                dataset_name=str(form.get("name") or form.get("dataset_name") or ""),
                description=str(form.get("description") or ""),
                affected_pages=form.get("affected_pages") or form.get("affectedPages") or "[]",
                key_fields=form.get("key_fields") or form.get("keyFields") or "[]",
                uploaded_by=None,
                dataset_kind=str(form.get("dataset_kind") or form.get("datasetKind") or ""),
            )
            return {"dataset": dataset, "progress": 1, "completed": True}
        except ValueError as error:
            raise HTTPException(status_code=400, detail=str(error)) from error
        except Exception as error:
            raise HTTPException(status_code=500, detail=str(error)) from error

    try:
        payload = DatasetUploadRequest(**(await request.json()))
        return upload_dataset(payload.model_dump(), username=user.get("username") or user.get("name") or "admin")
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error


@router.post("/admin/datasets/{dataset_id}/rebuild")
def admin_dataset_rebuild(dataset_id: str, sid: Optional[str] = Cookie(default=None)):
    require_dataset_admin(sid)
    try:
        return rebuild_for(dataset_id)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except RuntimeError as error:
        raise HTTPException(status_code=500, detail=str(error)) from error


@router.delete("/admin/datasets/{dataset_id}")
def admin_dataset_delete(dataset_id: str, sid: Optional[str] = Cookie(default=None)):
    require_dataset_admin(sid)
    if str(dataset_id).isdigit():
        try:
            platform_store.delete_platform_dataset(dataset_id)
            return {"ok": True}
        except KeyError:
            pass
    try:
        delete_dataset(dataset_id)
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    return {"ok": True}


@router.get("/admin/users")
def admin_users(sid: Optional[str] = Cookie(default=None)):
    require_master_admin(sid)
    return {"users": list_users()}


@router.post("/admin/users")
def admin_create_user(payload: AdminUserCreateRequest, sid: Optional[str] = Cookie(default=None)):
    require_master_admin(sid)
    try:
        return {"user": create_user(payload.model_dump())}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.patch("/admin/users/{user_id}")
def admin_update_user(user_id: str, payload: AdminUserUpdateRequest, sid: Optional[str] = Cookie(default=None)):
    current = require_master_admin(sid)
    if user_id == current.get("id") and payload.status == "disabled":
        raise HTTPException(status_code=400, detail="不能禁用当前登录的管理员账号。")
    try:
        return {"user": update_user(user_id, payload.model_dump(exclude_unset=True))}
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.put("/admin/users/{user_id}")
def admin_put_user(user_id: str, payload: AdminUserUpdateRequest, sid: Optional[str] = Cookie(default=None)):
    return admin_update_user(user_id, payload, sid)


@router.delete("/admin/users/{user_id}")
def admin_delete_user(user_id: str, sid: Optional[str] = Cookie(default=None)):
    current = require_master_admin(sid)
    if user_id == current.get("id"):
        raise HTTPException(status_code=400, detail="不能删除当前登录的管理员账号。")
    try:
        delete_user(user_id)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return {"ok": True}


@router.get("/platform/registry")
def get_platform_registry():
    return platform_store.platform_registry()


@router.get("/local-ai/status")
def get_local_ai_status():
    return local_ai_status()


@router.get("/datasets/{dataset_id}/records")
def get_dataset_records(
    dataset_id: str,
    page: int = 1,
    page_size: int = 20,
    sort_by: str = "",
    sort_order: str = "asc",
    filters: str = "",
):
    try:
        return platform_store.dataset_records(dataset_id, page=page, page_size=page_size, sort_by=sort_by, sort_order=sort_order, filters=filters)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.get("/sub-modules/{sub_module_id}/all-records")
def get_submodule_all_records(
    sub_module_id: str,
    page: int = 1,
    page_size: int = 20,
    sort_by: str = "",
    sort_order: str = "asc",
    filters: str = "",
):
    return platform_store.submodule_records(sub_module_id, page=page, page_size=page_size, sort_by=sort_by, sort_order=sort_order, filters=filters)


@router.get("/visualizations/metrics/{sub_module_id}")
def visualization_metrics(sub_module_id: str, filter_params: str = ""):
    return platform_store.metrics_for_submodule(sub_module_id, filter_params)


@router.get("/visualizations/knowledge-graph/{sub_module_id}")
def visualization_knowledge_graph(sub_module_id: str, filter_params: str = ""):
    return platform_store.knowledge_graph(sub_module_id, filter_params)


@router.get("/visualizations/map/{sub_module_id}")
def visualization_map(sub_module_id: str, map_type: str = "publication", filter_params: str = ""):
    return platform_store.map_data(sub_module_id, map_type, filter_params)


@router.post("/visualizations/word-frequency/{sub_module_id}")
def visualization_word_frequency(sub_module_id: str, payload: WordFrequencyRequest):
    return platform_store.word_frequency(sub_module_id, payload.text_fields, payload.top_n, payload.filter_params)


@router.post("/visualizations/document-text-analysis/{sub_module_id}")
def visualization_document_text_analysis(sub_module_id: str, payload: DocumentTextAnalysisRequest):
    return platform_store.document_text_analysis(
        sub_module_id,
        payload.scope,
        payload.language_scope,
        payload.document_ids,
        payload.top_n,
        payload.filter_params,
    )


@router.post("/visualizations/advanced-text/{sub_module_id}")
def visualization_advanced_text(sub_module_id: str, payload: AdvancedTextVisualizationRequest):
    try:
        return platform_store.advanced_text_visuals(
            sub_module_id,
            scope=payload.scope,
            document_id=payload.document_id,
            query=payload.query,
            method_id=payload.method_id,
            topic_count=payload.topic_count,
            filters=payload.filter_params,
        )
    except RuntimeError as error:
        raise HTTPException(status_code=503, detail=str(error)) from error


@router.get("/visualizations/time-evolution/{sub_module_id}")
def visualization_time_evolution(sub_module_id: str, time_field: str = "publish_year", aggregation: str = "year", filter_params: str = ""):
    return platform_store.time_evolution(sub_module_id, time_field, aggregation, filter_params)


@router.post("/visualizations/topic-clustering/{sub_module_id}")
def visualization_topic_clustering(sub_module_id: str, payload: TopicClusteringRequest):
    return platform_store.topic_clustering(sub_module_id, payload.text_field, payload.n_topics, payload.filter_params)


@router.post("/visualizations/comparison/{sub_module_id}")
def visualization_comparison(sub_module_id: str, payload: ComparisonRequest):
    return platform_store.comparison(sub_module_id, payload.dimensions, payload.filter_params)


@router.post("/visualizations/word-distance/{sub_module_id}")
def visualization_word_distance(sub_module_id: str, payload: WordDistanceRequest):
    return platform_store.word_distance(sub_module_id, payload.word_a, payload.word_b, payload.max_distance, payload.text_field, payload.filter_params)


@router.post("/visualizations/word-trend/{sub_module_id}")
def visualization_word_trend(sub_module_id: str, payload: WordTrendRequest):
    return platform_store.word_trend(sub_module_id, payload.words, payload.time_field, payload.filter_params)


@router.post("/search/full-text")
def platform_full_text_search(payload: FullTextSearchRequest):
    return platform_store.full_text_search(payload.keyword, payload.filter_params)


@router.post("/search/academic")
def platform_academic_search(payload: AcademicSearchRequest):
    return academic_search(
        payload.query,
        mode=payload.mode,
        source=payload.source,
        submodule_id=payload.submodule_id,
        limit=payload.limit,
        filters=payload.filter_params,
    )


@router.get("/search/academic")
def platform_academic_search_get(
    q: str = "",
    query: str = "",
    mode: str = "hybrid",
    source: str = "all",
    submodule_id: str = "",
    limit: int = 30,
):
    return academic_search(
        query or q,
        mode=mode,
        source=source,
        submodule_id=submodule_id,
        limit=limit,
        filters=None,
    )


@router.get("/site-content")
def public_site_content():
    return site_content.public_content()


@router.get("/admin/site-content")
def admin_site_content(sid: Optional[str] = Cookie(default=None)):
    require_admin(sid)
    return site_content.admin_content()


@router.post("/admin/site-content/{kind}")
def admin_create_site_content(kind: str, payload: dict[str, Any], sid: Optional[str] = Cookie(default=None)):
    user = require_admin(sid)
    try:
        return {"item": site_content.create_item(kind, payload, user_id=user.get("id"))}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.put("/admin/site-content/{kind}/{item_id}")
def admin_update_site_content(kind: str, item_id: str, payload: dict[str, Any], sid: Optional[str] = Cookie(default=None)):
    user = require_admin(sid)
    try:
        return {"item": site_content.update_item(kind, item_id, payload, user_id=user.get("id"))}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.delete("/admin/site-content/{kind}/{item_id}")
def admin_delete_site_content(kind: str, item_id: str, sid: Optional[str] = Cookie(default=None)):
    user = require_admin(sid)
    try:
        site_content.delete_item(kind, item_id, user_id=user.get("id"))
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return {"ok": True}


@router.post("/admin/sub-modules")
def admin_create_submodule(payload: SubModuleManageRequest, sid: Optional[str] = Cookie(default=None)):
    require_admin(sid)
    try:
        return {"submodule": platform_store.create_submodule(payload.model_dump())}
    except ValueError as error:
        raise HTTPException(status_code=400, detail=str(error)) from error


@router.put("/admin/sub-modules/{submodule_id}")
def admin_update_submodule(submodule_id: str, payload: SubModuleManageRequest, sid: Optional[str] = Cookie(default=None)):
    require_admin(sid)
    try:
        return {"submodule": platform_store.update_submodule(submodule_id, payload.model_dump(exclude_unset=True))}
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.delete("/admin/sub-modules/{submodule_id}")
def admin_delete_submodule(submodule_id: str, sid: Optional[str] = Cookie(default=None)):
    require_admin(sid)
    try:
        platform_store.delete_submodule(submodule_id)
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error
    return {"ok": True}


@router.put("/admin/datasets/{dataset_id}")
def admin_dataset_update_platform(dataset_id: str, payload: dict[str, Any], sid: Optional[str] = Cookie(default=None)):
    require_dataset_admin(sid)
    try:
        return {"dataset": platform_store.update_dataset(dataset_id, payload)}
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.post("/admin/datasets/{dataset_id}/reparse")
def admin_dataset_reparse(dataset_id: str, sid: Optional[str] = Cookie(default=None)):
    require_dataset_admin(sid)
    try:
        return {"dataset": platform_store.reparse_dataset(dataset_id)}
    except (KeyError, FileNotFoundError) as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.get("/admin/platform-datasets")
def admin_platform_datasets(sid: Optional[str] = Cookie(default=None)):
    require_dataset_admin(sid)
    return {"datasets": platform_store.list_platform_datasets(), "registry": platform_store.platform_registry()}


@router.delete("/admin/cache/all")
def admin_clear_all_cache(sid: Optional[str] = Cookie(default=None)):
    require_admin(sid)
    return platform_store.clear_cache("all")


@router.delete("/admin/cache/{sub_module_id}")
def admin_clear_submodule_cache(sub_module_id: str, sid: Optional[str] = Cookie(default=None)):
    require_admin(sid)
    return platform_store.clear_cache(sub_module_id)


@router.get("/admin/system-config")
def admin_get_system_config(sid: Optional[str] = Cookie(default=None)):
    require_admin(sid)
    return platform_store.system_config()


@router.put("/admin/system-config")
def admin_update_system_config(payload: SystemConfigRequest, sid: Optional[str] = Cookie(default=None)):
    require_admin(sid)
    return platform_store.update_system_config(payload.model_dump())


@router.post("/admin/backups")
def admin_backup(payload: BackupRequest, sid: Optional[str] = Cookie(default=None)):
    require_admin(sid)
    if payload.kind == "database":
        return platform_store.database_backup()
    if payload.kind == "files":
        return platform_store.files_backup()
    return platform_store.full_backup()


@router.get("/admin/backups")
def admin_list_backups(sid: Optional[str] = Cookie(default=None)):
    require_admin(sid)
    return platform_store.list_backups()


@router.post("/admin/backups/scheduler/run")
def admin_run_backup_scheduler(sid: Optional[str] = Cookie(default=None)):
    require_admin(sid)
    return platform_store.scheduler_tick()


@router.post("/admin/restore")
def admin_restore_backup(payload: RestoreRequest, sid: Optional[str] = Cookie(default=None)):
    require_admin(sid)
    try:
        return platform_store.restore_backup(payload.path)
    except FileNotFoundError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.post("/admin/export")
def admin_export_data(payload: ExportRequest, sid: Optional[str] = Cookie(default=None)):
    require_dataset_admin(sid)
    result = platform_store.export_records(payload.scope, payload.scope_id, payload.file_type)
    return result


@router.get("/admin/export/download")
def admin_download_export(path: str = Query(...), sid: Optional[str] = Cookie(default=None)):
    require_dataset_admin(sid)
    target = Path(path)
    try:
        target.resolve().relative_to(platform_store.EXPORT_ROOT.resolve())
    except Exception:
        raise HTTPException(status_code=403, detail="Export file must be under the export directory.")
    if not target.exists() or not target.is_file():
        raise HTTPException(status_code=404, detail="Export file not found.")
    return FileResponse(target, filename=target.name)


@router.get("/admin/operation-logs")
def admin_operation_logs(user_id: str = "", operation_type: str = "", start: str = "", end: str = "", sid: Optional[str] = Cookie(default=None)):
    require_admin(sid)
    return platform_store.operation_logs(user_id, operation_type, start, end)


@router.put("/admin/data-records/{record_id}")
def admin_update_record(record_id: str, payload: dict[str, Any], sid: Optional[str] = Cookie(default=None)):
    require_dataset_admin(sid)
    try:
        return {"record": platform_store.update_record(record_id, payload)}
    except KeyError as error:
        raise HTTPException(status_code=404, detail=str(error)) from error


@router.post("/admin/import")
async def admin_import_data(request: Request, sid: Optional[str] = Cookie(default=None)):
    require_dataset_admin(sid)
    content_type = request.headers.get("content-type", "")
    if "multipart/form-data" not in content_type:
        raise HTTPException(status_code=400, detail="Use multipart/form-data with one or more file fields.")
    try:
        fields, files = await parse_multipart_compat(request)
        sub_module_id = fields.get("sub_module_id") or fields.get("subModuleId") or "repository-all-literature-search"
        results = []
        for file in files.values():
            results.append(platform_store.import_backup_file(file.get("content") or b"", file.get("filename") or "import.bin", sub_module_id))
        return {"items": results}
    except Exception as error:
        raise HTTPException(status_code=500, detail=str(error)) from error


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
    retrieval_context = {}
    if payload.retrievalMode != "none":
        retrieval_context = indexed_chat_context(payload, section, target_items)
        target_items = retrieval_context.get("items") or target_items
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
        "citations": retrieval_context.get("citations") or result.get("citations", []),
        "visuals": {
            **(result.get("visuals") or {}),
            "subgraph": retrieval_context.get("subgraph") or {},
        },
        "retrieval": {
            "provider": payload.provider,
            "providerName": provider_name,
            "model": payload.model,
            "mode": payload.retrievalMode,
            "database": "无（直接调用大模型）" if payload.retrievalMode == "none" else retrieval_context.get("database") or section["title"],
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
    retrieval_context = {}
    if payload.retrievalMode != "none":
        retrieval_context = indexed_chat_context(payload, section, target_items)
        target_items = retrieval_context.get("items") or target_items
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
            visuals = {
                **(result.get("visuals", {}) or {}),
                "subgraph": retrieval_context.get("subgraph") or {},
            }
            meta = {
                "retrieval_needed": payload.retrievalMode != "none",
                "retrieval_mode": payload.retrievalMode,
                "database": "无（直接调用大模型）" if payload.retrievalMode == "none" else retrieval_context.get("database") or section["title"],
                "evidence": retrieval_context.get("citations") or result.get("citations", []),
                "records": visuals.get("records", []),
                "flows": visuals.get("map", {}).get("flows", []),
                "provider": payload.provider,
                "providerName": provider_name,
                "model": payload.model or DEFAULT_MODEL,
                "visuals": visuals,
                "chartKeys": visuals.get("chartKeys", []),
                "charts": visuals.get("charts", {}),
                "wilhelm": visuals.get("wilhelm", {}),
                "subgraph": visuals.get("subgraph", {}),
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


@router.api_route("/{path:path}", methods=["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"])
def api_not_found(path: str):
    raise HTTPException(status_code=404, detail=f"API 地址不存在：/api/{path}")
