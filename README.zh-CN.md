# docfill

通用 AI 文档填写工具。上传任意 Word 文档，AI 自动识别并填写字段。

[English](./README.md)

## 功能特性

- **智能字段识别** — 支持下划线、方括号、全角括号、表格单元格等占位符
- **AI 自动填写** — 支持参考文档提取或 AI 直接作答（知识性内容）
- **实时流式进度** — 基于 SSE 的进度推送，支持暂停/继续
- **个人信息处理** — AI 无法确定的字段（姓名、单位等）弹窗手动输入
- **文档预览** — 集成 OnlyOffice 编辑器实时预览
- **下载导出** — 将填写后的文档导出为新 Word 文件

## 技术栈

| 层级 | 技术 |
|------|------|
| 前端 | Next.js 14 App Router + Tailwind CSS + shadcn/ui + Framer Motion |
| 后端 | FastAPI + PostgreSQL + SQLAlchemy 2.0 |
| 文档预览 | OnlyOffice Document Server 8.x |
| AI | OpenAI 兼容接口（可配置 base_url / model） |

## 快速启动（开发模式）

```bash
# 1. 启动 OnlyOffice + PostgreSQL
docker compose up -d postgres onlyoffice

# 2. 后端
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env        # 填入 LLM_API_KEY
uvicorn app.main:app --reload --port 8002

# 3. 前端
cd frontend
npm install
npm run dev -- --port 3001
```

访问 http://localhost:3001

## 生产部署

```bash
# 1. 配置 LLM（根目录 .env）
cp .env.example .env
# 编辑 .env，填入 LLM_API_KEY、LLM_BASE_URL、LLM_MODEL

# 2. 启动所有服务
docker compose up -d
```

## 配置说明

所有设置通过根目录 `.env` 文件的环境变量配置：

### LLM

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `LLM_BASE_URL` | OpenAI 兼容 API 地址 | `https://api.openai.com/v1` |
| `LLM_API_KEY` | API 密钥 | （必填） |
| `LLM_MODEL` | 模型名称 | `gpt-4o-mini` |

兼容服务商：OpenAI、DeepSeek、通义千问、本地 Ollama 等。

### 端口

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `FRONTEND_PORT` | 前端界面 | `3001` |
| `BACKEND_PORT` | 后端 API | `8002` |
| `ONLYOFFICE_PORT` | OnlyOffice 编辑器 | `8080` |
| `POSTGRES_PORT` | PostgreSQL 数据库 | `5433` |

## 项目结构

```
docfill/
├── backend/                 # FastAPI 后端
│   ├── app/
│   │   ├── api/v1/          # API 端点
│   │   ├── core/            # 配置、数据库、依赖注入
│   │   ├── models/          # SQLAlchemy 模型
│   │   ├── schemas/         # Pydantic 数据模式
│   │   └── services/        # 业务逻辑（AI、模板、解析器）
│   └── tests/               # 后端测试
├── frontend/                # Next.js 前端
│   ├── app/                 # 页面（App Router）
│   ├── components/          # React 组件
│   ├── lib/                 # API 客户端、SSE、工具函数
│   └── types/               # TypeScript 类型定义
├── docker-compose.yml       # 生产编排配置
└── .env.example             # 根目录环境变量模板
```
