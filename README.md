# docfill

通用 AI 文档填写工具。上传任意 Word 文档，AI 自动识别并填写字段。

## 快速启动（开发模式）

```powershell
# 1. 启动 OnlyOffice + PostgreSQL
docker compose up -d postgres onlyoffice

# 2. 后端
cd backend
python -m venv .venv
.\.venv\Scripts\Activate.ps1
pip install -r requirements.txt
Copy-Item .env.example .env  # 填入 LLM_API_KEY
uvicorn app.main:app --reload --port 8002

# 3. 前端
cd frontend
npm install
npm run dev -- --port 3001
```

访问 http://localhost:3001

## 生产部署

```powershell
docker compose up -d
```

## 技术栈

- 前端：Next.js 14 App Router + Tailwind CSS + shadcn/ui + Framer Motion
- 后端：FastAPI + PostgreSQL + SQLAlchemy 2.0
- 文档预览：OnlyOffice Document Server 8.x
- AI：OpenAI-compatible API（可配置 base_url / model）

## 端口

| 服务 | 端口 |
|------|------|
| 前端 | 3001 |
| 后端 API | 8002 |
| OnlyOffice | 8080 |
| PostgreSQL | 5433 |
