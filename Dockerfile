FROM node:20-alpine AS frontend-build
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci
COPY frontend/ ./frontend/
RUN cd frontend && npm run build

FROM python:3.12-slim
WORKDIR /app

# ✅ 修复：直接覆盖Debian 13 deb822格式源文件，彻底解决sed替换导致的路径重复问题
RUN cat > /etc/apt/sources.list.d/debian.sources <<EOF
Types: deb
URIs: https://mirrors.aliyun.com/debian
Suites: trixie trixie-updates
Components: main contrib non-free non-free-firmware
Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg

Types: deb
URIs: https://mirrors.aliyun.com/debian-security
Suites: trixie-security
Components: main contrib non-free non-free-firmware
Signed-By: /usr/share/keyrings/debian-archive-keyring.gpg
EOF

ENV PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    PLATFORM_DATA_ROOT=/app/data \
    USER_DB_PATH=/app/data/runtime/users.db \
    USER_SECRET_PATH=/app/data/runtime/user_secret.key \
    LLM_CONFIG_PATH=/app/data/runtime/llm_config.json \
    DATASET_MANIFEST_PATH=/app/data/runtime/dataset_uploads.json \
    # pip 阿里云镜像配置（保留不变，原配置正确）
    PIP_INDEX_URL=https://mirrors.aliyun.com/pypi/simple/ \
    PIP_TRUSTED_HOST=mirrors.aliyun.com

RUN apt-get update \
    && apt-get install -y --no-install-recommends curl libgomp1 postgresql-client \
    && rm -rf /var/lib/apt/lists/*

COPY requirements.txt ./
RUN pip install --no-cache-dir --upgrade pip \
    && pip install --no-cache-dir -r requirements.txt

COPY backend ./backend
COPY scripts ./scripts
COPY basemap_data ./basemap_data
COPY data ./data
COPY frontend ./frontend
COPY --from=frontend-build /src/frontend/dist ./frontend/dist

RUN mkdir -p /app/data/runtime /app/data/uploads /app/data/backups /app/data/exports

EXPOSE 8002

# 健康检查配置（保留不变，原配置正确）
HEALTHCHECK --interval=30s --timeout=5s --start-period=30s --retries=3 \
    CMD curl -fsS http://127.0.0.1:8002/api/session || exit 1

CMD ["python", "-m", "uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "8002"]