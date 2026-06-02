# 前端构建
FROM node:20-alpine AS frontend-build
WORKDIR /src
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci
COPY frontend/ ./frontend/
RUN cd frontend && npm run build

# 最终运行
FROM python:3.12-alpine
WORKDIR /app

# 安装依赖
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt

# 复制代码
COPY backend ./backend
COPY --from=frontend-build /src/frontend/dist ./frontend/dist

# 关键：必须用 $PORT，且绑定 0.0.0.0
CMD python -m uvicorn backend.app.main:app --host 0.0.0.0 --port ${PORT:-8000}
