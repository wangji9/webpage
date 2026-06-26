# Docker 部署方案

本项目采用单容器部署：Vite 构建 React 前端，FastAPI 在 `8002` 端口同时提供页面和 `/api/*` 接口。运行数据、上传文件、备份、用户库和大模型配置统一持久化到宿主机 `./data`。

## 1. 准备环境

确认 Docker 可用：

```bash
docker version
docker compose version
```

复制模板并编辑项目根目录 `.env`。生产环境至少建议设置：

```bash
cp .env.example .env
```

```env
APP_PORT=8002
JWT_SECRET=replace-with-a-long-random-secret
BACKUP_RETENTION_DAYS=30

SMTP_HOST=smtp.example.com
SMTP_PORT=465
SMTP_USERNAME=notice@example.com
SMTP_PASSWORD=your_smtp_authorization_code
SMTP_FROM=notice@example.com
SMTP_FROM_NAME=中国叙事知识平台
SMTP_USE_SSL=true
SMTP_USE_TLS=false
```

注意：不要把真实邮箱授权码、API Key、`JWT_SECRET` 提交到 Git。

## 2. 首次启动

在项目根目录执行：

```bash
docker compose up -d --build
```

访问：

```text
http://127.0.0.1:8002
http://127.0.0.1:8002/api/session
```

查看状态：

```bash
docker compose ps
docker compose logs -f app
```

演示账号：

```text
user / user123
researcher / research123
admin / admin123
```

## 3. 日常启动和停止

启动：

```bash
docker compose up -d
```

停止：

```bash
docker compose down
```

重启：

```bash
docker compose restart app
```

查看日志：

```bash
docker compose logs -f app
```

进入容器排查：

```bash
docker compose exec app bash
```

## 4. 更新部署

拉取或替换新代码后执行：

```bash
docker compose build --no-cache app
docker compose up -d
```

如果只是改了 `.env`：

```bash
docker compose up -d --force-recreate app
```

如果只是重启服务：

```bash
docker compose restart app
```

## 5. 数据持久化和备份

宿主机 `./data` 会挂载到容器 `/app/data`，包括：

- `data/platform_store.json`：平台数据 JSON 存储。
- `data/uploads/`：上传文件。
- `data/backups/`：系统生成的备份。
- `data/exports/`：导出文件。
- `data/runtime/users.db`：用户数据库。
- `data/runtime/user_secret.key`：用户敏感信息加密密钥。
- `data/runtime/llm_config.json`：管理台保存的大模型配置。
- `data/runtime/dataset_uploads.json`：数据集上传清单。

手动备份整个运行数据：

```bash
tar -czf platform-data-backup.tar.gz data
```

恢复时先停服务，再替换 `data` 目录：

```bash
docker compose down
tar -xzf platform-data-backup.tar.gz
docker compose up -d
```

## 6. 镜像导出和服务器部署

在构建机打包镜像：

```bash
docker compose build app
docker save china-narrative-knowledge-platform:latest -o china-narrative-platform.tar
```

把 `china-narrative-platform.tar`、`docker-compose.yml`、`.env` 和 `data/` 上传到服务器同一目录后：

```bash
docker load -i china-narrative-platform.tar
docker compose up -d
```

服务器需要开放 `APP_PORT`，默认 `8002`。

## 7. 可选外部服务

代码支持这些可选环境变量，不配置也能用本地 JSON/SQLite 模式运行：

```env
DATABASE_URL=postgresql://user:password@host:5432/dbname
READ_DATABASE_URL=postgresql://user:password@host:5432/dbname
NEO4J_URI=bolt://host:7687
NEO4J_USER=neo4j
NEO4J_PASSWORD=password
MILVUS_HOST=host
MILVUS_PORT=19530
MILVUS_COLLECTION=china_narrative_text_vectors
LLM_URL_BASE=https://your-provider/v1/chat/completions
LLM_URL_KEY=your-api-key
LLM_DEFAULT_MODEL=your-model
```

PostgreSQL schema 可在容器内执行：

```bash
docker compose exec app python - <<'PY'
from backend.app.core.platform_db import apply_schema
print(apply_schema())
PY
```

## 8. 常见问题

端口被占用：修改 `.env` 中 `APP_PORT=8003`，然后执行 `docker compose up -d --force-recreate app`。

页面能打开但接口异常：运行 `docker compose logs -f app` 查看后端报错。

更新后用户或配置丢失：检查 `./data/runtime` 是否被删除，尤其是 `users.db` 和 `user_secret.key`。

健康检查不通过：先访问 `http://127.0.0.1:8002/api/session`，再查看 `docker compose logs app --tail=200`。
