from pathlib import Path

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from fastapi.staticfiles import StaticFiles

from backend.app.api.routes import router
from backend.app.core.platform_store import start_backup_scheduler
from backend.app.core.security import get_session
from backend.app.core.user_store import public_user_by_id

ROOT = Path(__file__).resolve().parents[2]
DIST_DIR = ROOT / "frontend" / "dist"

app = FastAPI(title="中国文学海外译介与中国叙事知识平台 API")

app.add_middleware(GZipMiddleware, minimum_size=1000)

app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://127.0.0.1:8002",
        "http://localhost:8002",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router)

PUBLIC_API_PATHS = {
    "/api/session",
    "/api/login",
    "/api/auth/login",
    "/api/auth/refresh",
    "/api/auth/send-code",
    "/api/register",
    "/api/auth/register",
    "/api/auth/reset-password",
    "/api/reset-password",
    "/api/logout",
}


@app.middleware("http")
async def require_login_for_private_api(request: Request, call_next):
    path = request.url.path.rstrip("/") or "/"
    if request.method == "OPTIONS" or not path.startswith("/api/") or path in PUBLIC_API_PATHS:
        return await call_next(request)

    session = get_session(request.cookies.get("sid"))
    session_user_id = (session or {}).get("user", {}).get("id")
    user = public_user_by_id(session_user_id) if session_user_id else None
    if not user or user.get("status") != "active":
        return JSONResponse(
            status_code=401,
            content={"detail": "请先登录。没有账号请联系管理员分配。"},
        )
    return await call_next(request)


@app.on_event("startup")
def start_platform_background_jobs():
    start_backup_scheduler()

if DIST_DIR.exists():
    app.mount("/", StaticFiles(directory=DIST_DIR, html=True), name="frontend")
