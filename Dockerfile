# 第一阶段：前端打包(纯node alpine，独立环境)
FROM node:20-alpine AS frontend-build
WORKDIR /src
# 只拷贝前端目录
COPY frontend/package.json frontend/package-lock.json ./frontend/
RUN cd frontend && npm ci
COPY frontend/ ./frontend/
RUN cd frontend && npm run build

# 第二阶段：最终运行镜像(python alpine)
FROM python:3.12-alpine
WORKDIR /app
# 安装python依赖
COPY requirements.txt ./
RUN pip install --no-cache-dir -r requirements.txt
# 拷贝后端源码
COPY backend ./backend
# 从前端构建阶段复制dist产物
COPY --from=frontend-build /src/frontend/dist ./frontend/dist

# 启动命令，使用Railway环境变量PORT
CMD ["python", "-m", "uvicorn", "backend.app.main:app", "--host", "0.0.0.0", "--port", "${PORT:-8002}"]