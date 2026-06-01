# 中国文学海外译介与中国叙事知识平台

本项目是一个基于 **React + FastAPI** 的前后端分离 Web 平台原型，面向中国典籍海外译介、上海文学海外传播、多语种中国故事集和世界文学中的中国叙事研究。

## 技术栈

- 前端：React 18、Vite
- 后端：FastAPI、Uvicorn
- 数据：当前使用后端内置示例数据，后续可替换为数据库
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
│   │   ├── data/               # 静态部署演示数据
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
- 知识库：四大分区切换、子库标签展示、模型切换、模拟问答
- 知识图谱：Canvas 节点关系图、分区筛选、放大缩小、路径追踪、节点详情
- 数据上传：PDF、Word、Excel 上传与解析流程占位
- 用户登录：访客拦截、研究者/管理员演示登录
- 管理控制台：管理员权限入口占位

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

启动 FastAPI 后端。当前本机 `8000` 可能被占用，项目已使用 `8001`：

```bash
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8001
```

启动 React 前端：

```bash
cd frontend
npm.cmd run dev -- --host 127.0.0.1 --port 3000
```

访问：

```text
http://127.0.0.1:3000
```

FastAPI 接口：

```text
http://127.0.0.1:8001/api/session
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
- 如果不调用外部模型，可以使用默认内置示例数据，后端将返回演示内容。

1. 启动后端服务

```cmd
python -m uvicorn backend.app.main:app --host 127.0.0.1 --port 8001
```

说明：如果端口 8001 被占用，可改用其他端口（例如 8002），并在前端启动时将 API 地址通过环境变量传入（见第 6 步）。

1. 安装前端依赖

```cmd
cd frontend
npm.cmd install
```

1. 启动前端开发服务器

（默认启动在 127.0.0.1:3000）

```cmd
npm.cmd run dev -- --host 127.0.0.1 --port 3000
```

1. 如需让前端调用本地后端或自定义后端地址

- 在开发时可以设置环境变量 `VITE_API_BASE_URL`。在 Windows cmd 中，启动前端前设置方式为：

```cmd
set VITE_API_BASE_URL=http://127.0.0.1:8001
cd frontend
npm.cmd run dev -- --host 127.0.0.1 --port 3000
```

注意：Vite 开发服务器在读取环境变量时会将以 VITE_ 前缀的变量注入到客户端代码中。

1. 访问与验证

- 在浏览器打开：

```text
http://127.0.0.1:3000
```

- 验证后端接口（示例）：

```text
http://127.0.0.1:8001/api/session
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

这可以解决刷新页面或打开详情页时出现 Netlify `Page not found` 的问题。当前 Netlify 只部署前端静态页面；如果没有单独部署 FastAPI，前端会自动使用内置演示数据。后续若将 FastAPI 部署到服务器，可在 Netlify 环境变量中设置：

```text
VITE_API_BASE_URL=https://your-api-domain.com
```

## 后续扩展方向

- 接入真实数据库，如 PostgreSQL 或 MongoDB
- 接入真实文件上传、解析、人工校对和管理员审核流程
- 接入大语言模型问答接口
- 将知识图谱数据改为后端查询生成
- 增加用户角色权限中间件和后台管理页面
