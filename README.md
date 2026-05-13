# docfill

Universal AI-powered document filling tool. Upload any Word document, and AI automatically identifies and fills in the fields.

[中文文档](./README.zh-CN.md)

## Features

- **Smart Field Detection** — Recognizes blanks, brackets, parentheses, and table cells in Word documents
- **AI Auto-Fill** — Supports reference documents or direct AI answering for knowledge-based content
- **Real-time Streaming** — SSE-based progress with pause/resume support
- **Personal Info Handling** — Prompts for manual input when AI cannot determine values (name, company, etc.)
- **Document Preview** — Integrated OnlyOffice editor for live preview
- **Download** — Export the filled document as a new Word file

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Frontend | Next.js 14 App Router + Tailwind CSS + shadcn/ui + Framer Motion |
| Backend | FastAPI + PostgreSQL + SQLAlchemy 2.0 |
| Document Preview | OnlyOffice Document Server 8.x |
| AI | OpenAI-compatible API (configurable base_url / model) |

## Quick Start (Development)

```bash
# 1. Start OnlyOffice + PostgreSQL
docker compose up -d postgres onlyoffice

# 2. Backend
cd backend
python -m venv .venv
source .venv/bin/activate   # Windows: .venv\Scripts\Activate.ps1
pip install -r requirements.txt
cp .env.example .env        # Fill in LLM_API_KEY
uvicorn app.main:app --reload --port 8002

# 3. Frontend
cd frontend
npm install
npm run dev -- --port 3001
```

Visit http://localhost:3001

## Production Deployment

```bash
# 1. Configure LLM (root .env)
cp .env.example .env
# Edit .env: fill in LLM_API_KEY, LLM_BASE_URL, LLM_MODEL

# 2. Start all services
docker compose up -d
```

## Configuration

All settings are configured via environment variables in the root `.env` file:

### LLM

| Variable | Description | Default |
|----------|-------------|---------|
| `LLM_BASE_URL` | OpenAI-compatible API endpoint | `https://api.openai.com/v1` |
| `LLM_API_KEY` | API key | (required) |
| `LLM_MODEL` | Model name | `gpt-4o-mini` |

Compatible providers: OpenAI, DeepSeek, Qwen, local Ollama, etc.

### Ports

| Variable | Description | Default |
|----------|-------------|---------|
| `FRONTEND_PORT` | Frontend web UI | `3001` |
| `BACKEND_PORT` | Backend API | `8002` |
| `ONLYOFFICE_PORT` | OnlyOffice editor | `8080` |
| `POSTGRES_PORT` | PostgreSQL database | `5433` |

## Project Structure

```
docfill/
├── backend/                 # FastAPI backend
│   ├── app/
│   │   ├── api/v1/          # API endpoints
│   │   ├── core/            # Config, database, dependencies
│   │   ├── models/          # SQLAlchemy models
│   │   ├── schemas/         # Pydantic schemas
│   │   └── services/        # Business logic (AI, template, parser)
│   └── tests/               # Backend tests
├── frontend/                # Next.js frontend
│   ├── app/                 # Pages (App Router)
│   ├── components/          # React components
│   ├── lib/                 # API client, SSE, utilities
│   └── types/               # TypeScript types
├── docker-compose.yml       # Production orchestration
└── .env.example             # Root environment config
```
