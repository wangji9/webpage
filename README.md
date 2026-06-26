# 中国文学海外译介与中国叙事知识平台

本项目是一个基于 **React + FastAPI** 的前后端分离 Web 平台原型，面向中国典籍海外译介、上海文学海外传播、多语种中国故事集和世界文学中的中国叙事研究。

## 技术栈

- 前端：React 18、Vite
- 后端：FastAPI、Uvicorn
- 数据：使用 `frontend/src/data/storyCollections.json` 中由真实表格生成的多语种中国故事集数据
- 资源：水墨山水首页背景、上海外国语大学 logo、研究中心 logo

## 目录结构

```text
.
├── backend/                    # FastAPI 后端
│   └── app/
│       ├── api/                # API 路由
│       │   └── routes.py
│       ├── core/               # 数据与会话逻辑
│       │   ├── data.py
│       │   └── security.py
│       ├── models/             # Pydantic 请求模型
│       │   └── schemas.py
│       └── main.py             # FastAPI 应用入口
├── frontend/                   # React 前端
│   ├── public/
│   │   ├── _redirects          # Netlify SPA 回退规则
│   │   └── assets/             # 图片与 logo 静态资源
│   ├── src/
│   │   ├── components/         # Header、Footer、图谱等组件
│   │   ├── data/               # 真实故事集数据与离线兜底适配
│   │   ├── pages/              # 首页、知识库、图谱、上传、登录等页面
│   │   ├── services/           # API 请求封装
│   │   ├── App.jsx
│   │   ├── main.jsx
│   │   └── styles.css
│   ├── package.json
│   └── vite.config.js
├── requirements.txt            # Python 依赖
├── netlify.toml                # Netlify 构建与发布配置
├── package.json                # 根目录脚本
└── README.md
```

## 已实现功能

- 首页：水墨山水主视觉、平台介绍、平台动态、知识库分区、知识服务模块
- 顶部/底部 logo：按“上海外国语大学 → 中国话语与世界文学研究中心”顺序展示
- 知识库：多语种中国故事集真实数据、子故事、序跋、传播地图与智能问答
- 知识图谱：Canvas 节点关系图、分区筛选、放大缩小、路径追踪、节点详情
- 数据上传：PDF、Word、Excel 上传与解析流程占位
- 用户登录：访客拦截、研究者/管理员演示登录
- 管理控制台：管理员权限入口占位

## 地图与智能问答迁移说明

本项目已接入 `packaged_story_maps_slim` 精简交付版中的地图与智能问答代码。`packaged_story_maps_slim` 仅作为临时来源目录，运行时使用当前项目内的文件。

已迁移的前端能力：

- 德译中国故事集出版地图：`frontend/src/components/StoryMapAtlas.jsx`、`frontend/src/components/StoryVisualAtlas.jsx`
- 德译中国故事集取材来源地图：`frontend/src/components/StoryMapAtlas.jsx`、`frontend/src/components/StoryVisualAtlas.jsx`
- 德译中国故事集故事来源及出版地参照图：`frontend/src/components/WilhelmSplitMap.jsx`
- 《卫礼贤中国民间故事》再版出版地图：`frontend/src/components/StoryVisualAtlas.jsx`
- 智能问答地图调用：`frontend/src/pages/SmartChat.jsx`、`frontend/src/components/SplitFlowMap.jsx`、`frontend/src/components/GraphCanvas.jsx`、`frontend/src/components/StatisticsPanel.jsx`

已迁移的数据与底图：

- 后端底图数据：`basemap_data/`（当前地图统一由后端读取该目录下的 Shapefile）
- 地图与问答 JSON：`frontend/src/data/wilhelmPublicationSourceMap.json`
- 源 xlsx 备份：根目录及 `data/`

已接入的后端 API：

- `GET /api/story/visual-atlas`
- `POST /api/story/wilhelm-visuals`
- `POST /api/chat`
- `POST /api/chat/stream`
- `GET /api/basemap/boundary`
- `GET /api/basemap/germany-adm02`
- `GET /api/session`
- `GET|POST /api/admin/llm-config`
- `POST /api/admin/llm-test`

如需从 `地图_中国故事集_出版地和故事来源地.xlsx` 重新生成出版地与来源地参照 JSON：

```bash
python scripts/generate_wilhelm_publication_source_map.py
```

## 安装依赖

后端：

```bash
python -m pip install -r requirements.txt --index-url https://pypi.org/simple
```

前端：

```bash
cd frontend
npm.cmd install
```

## 启动开发环境

项目只使用 `8002` 作为本地访问端口。先构建前端，再由 FastAPI 在同一个端口提供页面和接口：

```bash
npm.cmd run build --prefix frontend
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8002
```

也可以直接使用根目录脚本：

```bash
npm.cmd run dev
```

## 账号与权限

平台不开放自助注册，账号由管理员在后台创建、修改和分配权限。用户登录只需要用户名和密码；未登录访问者只能查看首页和登录页，其他页面和接口会按登录状态及权限拦截。

访问：

```text
http://127.0.0.1:8002
```

FastAPI 接口：

```text
http://127.0.0.1:8002/api/session
```
 
## 在 Windows (cmd.exe) 上启用前后端服务（详细步骤）

下面列出在 Windows (cmd.exe) 环境中，从零开始安装依赖并分别启动后端（FastAPI）和前端（Vite + React）的详细步骤。所有命令均适用于项目根目录（即包含 `backend/` 和 `frontend/` 的文件夹）。

1. 安装后端依赖

```cmd
python -m pip install -r requirements.txt --index-url https://pypi.org/simple
```

说明：如果你使用虚拟环境，建议先创建并激活：

```cmd
python -m venv .venv
.\.venv\Scripts\activate
```

1. 配置后端（可选）

- 检查 `backend/llm_config.json`（如果要调用真实大模型或管理员已配置的模型），确认 API key、端点和供应商配置是否正确。
- 如果不调用外部模型，检索和可视化仍只使用真实故事集数据；智能问答文本生成需要配置真实大模型接口。

1. 构建前端并启动单端口服务

```cmd
npm.cmd run build --prefix frontend
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8002
```

说明：本项目当前只使用 `8002`，页面和 `/api/*` 接口都由 FastAPI 在同一端口提供。

1. 安装前端依赖

```cmd
cd frontend
npm.cmd install
```

1. 如需前端源码热构建

```cmd
npm.cmd run dev --prefix frontend
```

注意：前端开发脚本只负责持续构建 `frontend/dist`，浏览器仍访问 `http://127.0.0.1:8002`。

1. 访问与验证

- 在浏览器打开：

```text
http://127.0.0.1:8002
```

- 验证后端接口（示例）：

```text
http://127.0.0.1:8002/api/session
```

1. 构建生产版

- 前端构建：

```cmd
cd frontend
npm.cmd run build
```

- 若要在生产环境中单独部署后端，使用常见的 ASGI 服务器（如 uvicorn 或 gunicorn + uvicorn workers），并在服务器上配置反向代理（nginx 等）。

常见问题提示

- 如果遇到依赖安装失败，先确认 Python 与 pip 版本，或使用国内镜像源（根据组织策略）。
- 若要使用真实大模型，请确认 `backend/llm_config.json` 中的凭证已正确填写，并且后端有访问外部网络权限。

```

## 演示账号

```text
user / user123
researcher / research123
admin / admin123
```

## 构建检查

前端构建：

```bash
cd frontend
npm.cmd run build
```

后端语法检查：

```bash
python -m py_compile backend/app/main.py backend/app/api/routes.py backend/app/core/data.py backend/app/core/security.py backend/app/models/schemas.py
```

根目录脚本：

```bash
npm.cmd run check:backend
```

## Netlify 部署

仓库根目录已提供 `netlify.toml`。连接 Git 仓库后，Netlify 会自动执行：

```bash
cd frontend && npm ci && npm run build
```

发布目录为：

```text
frontend/dist
```

`frontend/public/_redirects` 中已配置 SPA 回退：

```text
/* /index.html 200
```

这可以解决刷新页面或打开详情页时出现 Netlify `Page not found` 的问题。当前 Netlify 只部署前端静态页面；如果没有单独部署 FastAPI，前端会自动使用同一份真实故事集数据作为离线兜底。后续若将 FastAPI 部署到服务器，可在 Netlify 环境变量中设置：

```text
VITE_API_BASE_URL=https://your-api-domain.com
```

## 后续扩展方向

- 接入真实数据库，如 PostgreSQL 或 MongoDB
- 接入真实文件上传、解析、人工校对和管理员审核流程
- 接入大语言模型问答接口
- 将知识图谱数据改为后端查询生成
- 增加用户角色权限中间件和后台管理页面
