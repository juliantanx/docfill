# docfill 实现计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 `~/WebstormProjects/docfill/` 构建通用 AI 文档填写工具，用户上传任意 Word 文档，AI 自动识别并填写字段，支持参考文档辅助和无参考自填两种模式。

**Architecture:** 全栈重写，后端 FastAPI（复用 doc-service 的 word_parser / template_analyzer / template_filler / onlyoffice_service，重写 ai_filler 为通用版本），前端 Next.js 14 App Router（完全新设计，消费级 UI）。两者通过 REST + SSE 通信，OnlyOffice Docker 提供文档预览。

**Tech Stack:** Python 3.11+ / FastAPI / PostgreSQL / SQLAlchemy 2.0 / python-docx，Next.js 14 / TypeScript / Tailwind CSS / shadcn/ui / Framer Motion，OnlyOffice Document Server 8.x (Docker)

---

## 文件结构

```
~/WebstormProjects/docfill/
├── backend/
│   ├── app/
│   │   ├── api/v1/documents.py       # 全部文档端点
│   │   ├── api/v1/onlyoffice.py      # OnlyOffice 回调
│   │   ├── api/v1/router.py
│   │   ├── core/config.py
│   │   ├── core/database.py
│   │   ├── core/deps.py
│   │   ├── models/document.py
│   │   ├── schemas/document.py
│   │   ├── services/word_parser.py       # 复用
│   │   ├── services/template_analyzer.py # 复用（去除招投标特化）
│   │   ├── services/template_filler.py   # 复用
│   │   ├── services/ai_filler.py         # 重写（通用化）
│   │   └── services/onlyoffice_service.py # 复用
│   │   └── main.py
│   ├── tests/
│   │   ├── conftest.py
│   │   ├── test_template_analyzer.py
│   │   ├── test_template_filler.py
│   │   ├── test_ai_filler.py
│   │   └── test_documents_api.py
│   ├── alembic/
│   ├── alembic.ini
│   ├── requirements.txt
│   └── .env.example
├── frontend/
│   ├── app/
│   │   ├── layout.tsx
│   │   ├── globals.css
│   │   ├── page.tsx                      # 首页
│   │   ├── workspace/[id]/page.tsx       # 工作区
│   │   └── api/[...proxy]/route.ts       # BFF 代理
│   ├── components/
│   │   ├── upload/DropZone.tsx
│   │   ├── upload/UploadProgress.tsx
│   │   ├── workspace/OutlineSidebar.tsx
│   │   ├── workspace/OnlyOfficeEditor.tsx
│   │   ├── workspace/AiPanel.tsx
│   │   ├── workspace/AiProgressStream.tsx
│   │   └── workspace/PersonalInfoModal.tsx
│   ├── lib/api.ts
│   ├── lib/sse.ts
│   ├── types/document.ts
│   ├── __tests__/
│   │   ├── DropZone.test.tsx
│   │   ├── AiPanel.test.tsx
│   │   └── PersonalInfoModal.test.tsx
│   ├── next.config.ts
│   ├── tailwind.config.ts
│   └── package.json
└── docker-compose.yml
```

---

## Task 1: 项目脚手架

**Files:**
- Create: `~/WebstormProjects/docfill/` (整个目录)

- [ ] **Step 1: 创建目录并初始化 git**

```bash
mkdir -p ~/WebstormProjects/docfill
cd ~/WebstormProjects/docfill
git init
```

- [ ] **Step 2: 创建后端目录结构**

```bash
cd ~/WebstormProjects/docfill
mkdir -p backend/app/{api/v1,core,models,schemas,services}
mkdir -p backend/tests
touch backend/app/__init__.py
touch backend/app/api/__init__.py
touch backend/app/api/v1/__init__.py
touch backend/app/core/__init__.py
touch backend/app/models/__init__.py
touch backend/app/schemas/__init__.py
touch backend/app/services/__init__.py
touch backend/tests/__init__.py
```

- [ ] **Step 3: 创建前端目录结构（使用 create-next-app）**

```bash
cd ~/WebstormProjects/docfill
npx create-next-app@14 frontend \
  --typescript \
  --tailwind \
  --eslint \
  --app \
  --no-src-dir \
  --import-alias "@/*"
```

预期输出：`Success! Created frontend at .../docfill/frontend`

- [ ] **Step 4: 安装前端额外依赖**

```bash
cd ~/WebstormProjects/docfill/frontend
npm install framer-motion
npx shadcn@latest init --defaults
npx shadcn@latest add button dialog progress badge scroll-area separator
npm install --save-dev @testing-library/react @testing-library/jest-dom jest jest-environment-jsdom @types/jest
```

- [ ] **Step 5: 创建根 .gitignore**

```bash
cat > ~/WebstormProjects/docfill/.gitignore << 'EOF'
# Python
backend/.venv/
backend/__pycache__/
backend/*.pyc
backend/.env
backend/uploads/
backend/processed/
backend/*.db

# Node
frontend/node_modules/
frontend/.next/
frontend/.env.local

# General
.DS_Store
*.log
EOF
```

- [ ] **Step 6: 初始提交**

```bash
cd ~/WebstormProjects/docfill
git add .gitignore
git commit -m "chore: 初始化 docfill 项目"
```

---

## Task 2: 后端核心基础设施

**Files:**
- Create: `backend/requirements.txt`
- Create: `backend/.env.example`
- Create: `backend/app/core/config.py`
- Create: `backend/app/core/database.py`
- Create: `backend/app/core/deps.py`
- Create: `backend/app/main.py`

- [ ] **Step 1: 创建 requirements.txt**

```bash
cat > ~/WebstormProjects/docfill/backend/requirements.txt << 'EOF'
fastapi==0.115.6
uvicorn[standard]==0.34.0
sqlalchemy==2.0.48
alembic==1.14.0
pydantic-settings==2.7.1
python-multipart==0.0.20
python-docx>=1.1.0
pdfplumber>=0.11.0
openai>=1.54.0
PyJWT>=2.8.0
aiofiles>=23.0
httpx>=0.28.0
psycopg[binary]>=3.1
pytest>=8.0
pytest-asyncio>=0.23
httpx>=0.28.0
EOF
```

- [ ] **Step 2: 创建 .env.example**

```bash
cat > ~/WebstormProjects/docfill/backend/.env.example << 'EOF'
# 数据库（开发用 SQLite，生产换 postgresql+psycopg://）
DATABASE_URL=sqlite:///./docfill.db

# OnlyOffice
ONLYOFFICE_URL=http://localhost:8080
JWT_SECRET=onlyoffice-jwt-secret
JWT_ENABLED=false

# LLM（OpenAI 兼容接口）
LLM_BASE_URL=https://api.openai.com/v1
LLM_API_KEY=your-api-key-here
LLM_MODEL=gpt-4o-mini

# 服务配置
HOST_URL=http://host.docker.internal:8002
EOF
cp ~/WebstormProjects/docfill/backend/.env.example ~/WebstormProjects/docfill/backend/.env
```

- [ ] **Step 3: 创建 config.py**

```python
# backend/app/core/config.py
from pathlib import Path
from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8")

    database_url: str = "sqlite:///./docfill.db"
    host_url: str = "http://host.docker.internal:8002"

    onlyoffice_url: str = "http://localhost:8080"
    jwt_secret: str = "onlyoffice-jwt-secret"
    jwt_enabled: bool = False

    llm_base_url: str = "https://api.openai.com/v1"
    llm_api_key: str = ""
    llm_model: str = "gpt-4o-mini"

    @property
    def upload_dir(self) -> Path:
        return Path(__file__).parent.parent.parent / "uploads"

    @property
    def processed_dir(self) -> Path:
        return Path(__file__).parent.parent.parent / "processed"


settings = Settings()
```

- [ ] **Step 4: 创建 database.py**

```python
# backend/app/core/database.py
from sqlalchemy import create_engine
from sqlalchemy.orm import DeclarativeBase, sessionmaker
from app.core.config import settings

engine = create_engine(
    settings.database_url,
    connect_args={"check_same_thread": False} if "sqlite" in settings.database_url else {},
)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass
```

- [ ] **Step 5: 创建 deps.py**

```python
# backend/app/core/deps.py
from collections.abc import Generator
from sqlalchemy.orm import Session
from app.core.database import SessionLocal


def get_db() -> Generator[Session, None, None]:
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
```

- [ ] **Step 6: 创建 main.py**

```python
# backend/app/main.py
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from app.api.v1.router import router
from app.core.config import settings
from app.core.database import Base, engine

Base.metadata.create_all(bind=engine)

app = FastAPI(title="docfill API", version="1.0.0")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:3001", "http://localhost:3000"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(router, prefix="/api/v1")
```

- [ ] **Step 7: 创建 router.py**

```python
# backend/app/api/v1/router.py
from fastapi import APIRouter
from app.api.v1 import documents, onlyoffice

router = APIRouter()
router.include_router(documents.router, prefix="/documents", tags=["documents"])
router.include_router(onlyoffice.router, prefix="/onlyoffice", tags=["onlyoffice"])
```

- [ ] **Step 8: 安装依赖并验证启动**

```bash
cd ~/WebstormProjects/docfill/backend
python -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
# 先创建空的 documents.py 和 onlyoffice.py 占位
touch app/api/v1/documents.py app/api/v1/onlyoffice.py
# documents.py 最小内容
echo 'from fastapi import APIRouter
router = APIRouter()' > app/api/v1/documents.py
echo 'from fastapi import APIRouter
router = APIRouter()' > app/api/v1/onlyoffice.py
uvicorn app.main:app --port 8002 --reload
```

预期：`Application startup complete.`，访问 http://localhost:8002/docs 有 Swagger UI

- [ ] **Step 9: 提交**

```bash
cd ~/WebstormProjects/docfill
git add backend/
git commit -m "feat: 后端核心基础设施（config、database、main）"
```

---

## Task 3: Document 数据模型 + Schema

**Files:**
- Create: `backend/app/models/document.py`
- Create: `backend/app/schemas/document.py`

- [ ] **Step 1: 创建 Document ORM 模型**

```python
# backend/app/models/document.py
import uuid
from datetime import datetime
from sqlalchemy import Column, DateTime, JSON, String, Text, func
from app.core.database import Base


class Document(Base):
    __tablename__ = "documents"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    original_filename = Column(String(512), nullable=False)
    file_path = Column(String(1024), nullable=False)
    # parsing | ready | filling | filled | error
    status = Column(String(32), nullable=False, default="parsing")
    fields = Column(JSON, nullable=True)        # list[FieldDict]
    outline = Column(JSON, nullable=True)       # list[OutlineNode]
    references = Column(JSON, nullable=True)    # list[{doc_id, filename, file_path, text}]
    partial_fields = Column(JSON, nullable=True) # 续传时的已填字段
    error_message = Column(Text, nullable=True)
    onlyoffice_doc_key = Column(String(255), nullable=True, unique=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
```

- [ ] **Step 2: 创建 Pydantic Schemas**

```python
# backend/app/schemas/document.py
from pydantic import BaseModel
from typing import Any


class FieldDict(BaseModel):
    id: str
    label: str
    value: str = ""
    status: str = "empty"   # empty | filled
    field_type: str         # bracket | blank | table_cell | inline_paren
    requires_input: bool = False


class DocumentUploadResponse(BaseModel):
    doc_id: str
    status: str
    message: str


class DocumentStatusResponse(BaseModel):
    doc_id: str
    original_filename: str
    status: str
    fields: list[dict] | None = None
    outline: list[dict] | None = None
    references: list[dict] | None = None
    error_message: str | None = None


class FieldUpdateRequest(BaseModel):
    value: str


class ConfirmResponse(BaseModel):
    success: bool
    download_url: str
    message: str


class EditorTokenResponse(BaseModel):
    doc_url: str
    doc_key: str
    config: dict[str, Any]
```

- [ ] **Step 3: 建表（SQLite 开发环境）**

```bash
cd ~/WebstormProjects/docfill/backend
source .venv/bin/activate
python -c "
from app.core.database import Base, engine
from app.models.document import Document
Base.metadata.create_all(bind=engine)
print('表已创建')
"
```

预期输出：`表已创建`

- [ ] **Step 4: 提交**

```bash
cd ~/WebstormProjects/docfill
git add backend/app/models/ backend/app/schemas/
git commit -m "feat: Document 数据模型和 Pydantic schemas"
```

---

## Task 4: 后端服务层（word_parser + template_analyzer + template_filler）

**Files:**
- Create: `backend/app/services/word_parser.py`
- Create: `backend/app/services/template_analyzer.py`
- Create: `backend/app/services/template_filler.py`

这三个服务从 doc-service 复制，word_parser 和 template_filler 直接复用，template_analyzer 去除招投标特化关键词。

- [ ] **Step 1: 复制 word_parser.py**

```bash
cp ~/WebstormProjects/ai-bidding-assistant\(refactor\)/doc-service/app/services/word_parser.py \
   ~/WebstormProjects/docfill/backend/app/services/word_parser.py
```

- [ ] **Step 2: 复制并通用化 template_analyzer.py**

```bash
cp ~/WebstormProjects/ai-bidding-assistant\(refactor\)/doc-service/app/services/template_analyzer.py \
   ~/WebstormProjects/docfill/backend/app/services/template_analyzer.py
```

打开 `backend/app/services/template_analyzer.py`，将 `INLINE_PAREN_PATTERN` 替换为更通用的模式（原版只匹配特定招投标词汇）：

```python
# 替换第 16-18 行的 INLINE_PAREN_PATTERN
INLINE_PAREN_PATTERN = re.compile(
    r'（([^）]{2,30})）'  # 匹配所有 2-30 字的全角括号内容
)
```

- [ ] **Step 3: 复制 template_filler.py**

```bash
cp ~/WebstormProjects/ai-bidding-assistant\(refactor\)/doc-service/app/services/template_filler.py \
   ~/WebstormProjects/docfill/backend/app/services/template_filler.py
```

- [ ] **Step 4: 写测试 — template_analyzer**

```python
# backend/tests/test_template_analyzer.py
import pytest
from docx import Document as DocxDocument
from pathlib import Path
from app.services.template_analyzer import TemplateAnalyzer


def _make_doc(tmp_path: Path, text: str) -> str:
    """创建包含指定文本的临时 docx 文件。"""
    doc = DocxDocument()
    doc.add_paragraph(text)
    path = str(tmp_path / "test.docx")
    doc.save(path)
    return path


def test_bracket_pattern(tmp_path):
    """识别方括号占位符：【XX 公司[姓名]】"""
    path = _make_doc(tmp_path, "甲方：【XX 公司[姓名]】")
    fields = TemplateAnalyzer().analyze(path)
    assert len(fields) == 1
    assert fields[0].label == "姓名"
    assert fields[0].field_type == "bracket"


def test_blank_pattern(tmp_path):
    """识别下划线空白：联系人：________"""
    path = _make_doc(tmp_path, "联系人：________")
    fields = TemplateAnalyzer().analyze(path)
    assert len(fields) == 1
    assert fields[0].label == "联系人"
    assert fields[0].field_type == "blank"


def test_inline_paren_pattern(tmp_path):
    """识别全角括号：（投标人名称）"""
    path = _make_doc(tmp_path, "（投标人名称）")
    fields = TemplateAnalyzer().analyze(path)
    assert len(fields) == 1
    assert fields[0].label == "投标人名称"
    assert fields[0].field_type == "inline_paren"


def test_dedup(tmp_path):
    """相同标签不重复识别。"""
    path = _make_doc(tmp_path, "甲方：【A[姓名]】\n乙方：【B[姓名]】")
    fields = TemplateAnalyzer().analyze(path)
    assert len(fields) == 1
```

- [ ] **Step 5: 运行测试，确认通过**

```bash
cd ~/WebstormProjects/docfill/backend
source .venv/bin/activate
pytest tests/test_template_analyzer.py -v
```

预期：4 tests passed

- [ ] **Step 6: 写测试 — template_filler**

```python
# backend/tests/test_template_filler.py
from docx import Document as DocxDocument
from pathlib import Path
from app.services.template_analyzer import TemplateAnalyzer, TemplateField
from app.services.template_filler import TemplateFiller


def test_fill_bracket(tmp_path):
    """填充方括号占位符，值应出现在文档中。"""
    # 准备模板
    doc = DocxDocument()
    doc.add_paragraph("甲方：【XX 公司[姓名]】")
    template_path = str(tmp_path / "template.docx")
    doc.save(template_path)

    # 分析字段
    fields = TemplateAnalyzer().analyze(template_path)
    assert len(fields) == 1
    field = fields[0]

    # 填充
    filler = TemplateFiller()
    output_path = filler.fill(
        template_path=template_path,
        field_values={field.id: "张三"},
        field_registry={field.id: field},
        output_dir=str(tmp_path),
    )

    # 验证
    result_doc = DocxDocument(output_path)
    text = " ".join(p.text for p in result_doc.paragraphs)
    assert "张三" in text


def test_empty_value_skipped(tmp_path):
    """空值字段不写入文档。"""
    doc = DocxDocument()
    doc.add_paragraph("联系人：________")
    template_path = str(tmp_path / "template.docx")
    doc.save(template_path)

    fields = TemplateAnalyzer().analyze(template_path)
    filler = TemplateFiller()
    output_path = filler.fill(
        template_path=template_path,
        field_values={fields[0].id: ""},
        field_registry={fields[0].id: fields[0]},
        output_dir=str(tmp_path),
    )
    result_doc = DocxDocument(output_path)
    text = " ".join(p.text for p in result_doc.paragraphs)
    # 原始下划线仍在，没有被空值覆盖
    assert "________" in text
```

- [ ] **Step 7: 运行测试**

```bash
pytest tests/test_template_filler.py -v
```

预期：2 tests passed

- [ ] **Step 8: 提交**

```bash
cd ~/WebstormProjects/docfill
git add backend/app/services/word_parser.py \
        backend/app/services/template_analyzer.py \
        backend/app/services/template_filler.py \
        backend/tests/
git commit -m "feat: 复用并通用化 word_parser / template_analyzer / template_filler"
```

---

## Task 5: ai_filler 服务（核心新逻辑）

**Files:**
- Create: `backend/app/services/ai_filler.py`
- Create: `backend/tests/test_ai_filler.py`

- [ ] **Step 1: 写失败测试**

```python
# backend/tests/test_ai_filler.py
import json
from unittest.mock import MagicMock, patch
import pytest
from app.services.ai_filler import AiFiller


def _make_stream_chunk(text: str):
    chunk = MagicMock()
    chunk.choices[0].delta.content = text
    return chunk


def _collect_events(gen) -> list[dict]:
    events = []
    for line in gen:
        if line.startswith("event:"):
            parts = line.strip().split("\n")
            event_type = parts[0].replace("event: ", "")
            data = json.loads(parts[1].replace("data: ", ""))
            events.append({"type": event_type, "data": data})
    return events


def test_fill_with_reference():
    """有参考文档：从参考内容中提取字段值。"""
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = iter([
        _make_stream_chunk('{"id": "f1", "value": "张三"}\n'),
        _make_stream_chunk('{"id": "f2", "value": "2026-01-01"}\n'),
    ])

    filler = AiFiller(client=mock_client)
    events = _collect_events(filler.fill_stream(
        fields=[{"id": "f1", "label": "姓名"}, {"id": "f2", "label": "日期"}],
        document_text="合同内容",
        reference_text="参考：姓名张三，日期2026-01-01",
    ))

    filled = [e for e in events if e["type"] == "field_filled"]
    assert len(filled) == 2
    assert filled[0]["data"]["value"] == "张三"
    assert filled[1]["data"]["value"] == "2026-01-01"

    done = [e for e in events if e["type"] == "done"]
    assert done[0]["data"]["filled_count"] == 2


def test_fill_no_reference_requires_input():
    """无参考文档：个人信息字段应标记 requires_input。"""
    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = iter([
        _make_stream_chunk('{"id": "f1", "value": "", "requires_input": true}\n'),
        _make_stream_chunk('{"id": "f2", "value": "答案A"}\n'),
    ])

    filler = AiFiller(client=mock_client)
    events = _collect_events(filler.fill_stream(
        fields=[{"id": "f1", "label": "姓名"}, {"id": "f2", "label": "第一题"}],
        document_text="1. 选择题答案是？（A/B/C/D）",
        reference_text=None,
    ))

    req_input = [e for e in events if e["type"] == "field_requires_input"]
    assert len(req_input) == 1
    assert req_input[0]["data"]["id"] == "f1"

    filled = [e for e in events if e["type"] == "field_filled"]
    assert filled[0]["data"]["value"] == "答案A"


def test_llm_error_emits_error_event():
    """LLM 异常时发出 error 事件。"""
    mock_client = MagicMock()
    mock_client.chat.completions.create.side_effect = RuntimeError("API timeout")

    filler = AiFiller(client=mock_client)
    events = _collect_events(filler.fill_stream(
        fields=[{"id": "f1", "label": "姓名"}],
        document_text="合同",
    ))

    error_events = [e for e in events if e["type"] == "error"]
    assert len(error_events) == 1
    assert "API timeout" in error_events[0]["data"]["message"]
```

- [ ] **Step 2: 运行测试，确认失败**

```bash
cd ~/WebstormProjects/docfill/backend
pytest tests/test_ai_filler.py -v
```

预期：ImportError（ai_filler 不存在）

- [ ] **Step 3: 实现 ai_filler.py**

```python
# backend/app/services/ai_filler.py
"""通用 AI 文档填写服务。

支持两种模式：
- 有参考文档：从参考内容中提取字段值
- 无参考文档：AI 直接作答（知识性内容），个人信息字段标记 requires_input
"""
import json
import logging
from collections.abc import Generator
from openai import OpenAI
from app.core.config import settings

logger = logging.getLogger(__name__)

_WITH_REF_SYSTEM = "你是一个文档填写助手，根据参考文档内容准确填写目标文档字段。"

_WITH_REF_USER = """参考文档内容：
{reference_text}

待填字段列表（JSON 数组，每项含 id 和 label）：
{fields_json}

请逐字段返回，每行一个 JSON，格式：
{{"id": "f1", "value": "填写内容"}}

如无法从参考文档中确定该字段值，返回：{{"id": "f1", "value": ""}}
只返回 JSON 行，不要其他文字。"""

_NO_REF_SYSTEM = "你是一个智能文档填写助手，能够分析文档内容并自动填写字段。"

_NO_REF_USER = """文档全文：
{document_text}

待填字段列表（JSON 数组，每项含 id 和 label）：
{fields_json}

请分析并填写每个字段：
- 知识性内容（题目、问答、填空题）：直接给出答案
- 个人信息字段（姓名、单位、公司、地址、电话、日期、联系方式等）：
  返回 {{"id": "...", "value": "", "requires_input": true}}

每行返回一个 JSON：
{{"id": "f1", "value": "答案"}}
只返回 JSON 行，不要其他文字。"""


class AiFiller:
    """通用 AI 文档字段填写器。"""

    def __init__(self, client: OpenAI | None = None):
        self.client = client or OpenAI(
            api_key=settings.llm_api_key,
            base_url=settings.llm_base_url,
        )
        self.model = settings.llm_model

    def fill_stream(
        self,
        fields: list[dict],
        document_text: str,
        reference_text: str | None = None,
    ) -> Generator[str, None, None]:
        """流式填写字段，yield SSE 格式字符串。

        Args:
            fields: 字段列表，每项须含 id 和 label。
            document_text: 目标文档全文（用于无参考模式）。
            reference_text: 参考文档文本（有参考模式），None 表示无参考。

        Yields:
            SSE 事件字符串，格式为 "event: <type>\\ndata: <json>\\n\\n"
        """
        total = len(fields)
        filled_count = 0
        fields_json = json.dumps(
            [{"id": f["id"], "label": f["label"]} for f in fields],
            ensure_ascii=False,
            indent=None,
        )

        if reference_text:
            system = _WITH_REF_SYSTEM
            user = _WITH_REF_USER.format(
                reference_text=reference_text[:8000],
                fields_json=fields_json,
            )
        else:
            system = _NO_REF_SYSTEM
            user = _NO_REF_USER.format(
                document_text=document_text[:8000],
                fields_json=fields_json,
            )

        try:
            stream = self.client.chat.completions.create(
                model=self.model,
                messages=[
                    {"role": "system", "content": system},
                    {"role": "user", "content": user},
                ],
                temperature=0.1,
                stream=True,
            )

            buffer = ""
            for chunk in stream:
                delta = chunk.choices[0].delta.content or ""
                buffer += delta

                while "\n" in buffer:
                    line, buffer = buffer.split("\n", 1)
                    line = line.strip()
                    if not line:
                        continue
                    try:
                        item = json.loads(line)
                    except json.JSONDecodeError:
                        logger.debug("跳过无效 JSON 行: %s", line)
                        continue

                    field_id = item.get("id", "")
                    value = item.get("value", "")
                    requires_input = bool(item.get("requires_input", False))
                    label = next(
                        (f["label"] for f in fields if f["id"] == field_id),
                        field_id,
                    )

                    if requires_input:
                        payload = json.dumps(
                            {"id": field_id, "label": label, "requires_input": True},
                            ensure_ascii=False,
                        )
                        yield f"event: field_requires_input\ndata: {payload}\n\n"
                    else:
                        filled_count += 1
                        payload = json.dumps(
                            {"id": field_id, "label": label, "value": value, "requires_input": False},
                            ensure_ascii=False,
                        )
                        yield f"event: field_filled\ndata: {payload}\n\n"

                    pct = int(filled_count / total * 100) if total > 0 else 0
                    progress = json.dumps(
                        {"filled": filled_count, "total": total, "percentage": pct}
                    )
                    yield f"event: progress\ndata: {progress}\n\n"

        except Exception as e:
            logger.error("AI 填写失败: %s", e)
            err = json.dumps({"message": str(e)}, ensure_ascii=False)
            yield f"event: error\ndata: {err}\n\n"
            return

        done = json.dumps(
            {"filled_count": filled_count, "empty_count": total - filled_count}
        )
        yield f"event: done\ndata: {done}\n\n"
```

- [ ] **Step 4: 运行测试，确认通过**

```bash
pytest tests/test_ai_filler.py -v
```

预期：3 tests passed

- [ ] **Step 5: 提交**

```bash
cd ~/WebstormProjects/docfill
git add backend/app/services/ai_filler.py backend/tests/test_ai_filler.py
git commit -m "feat: 通用 AI 文档填写服务（有参考/无参考双模式 SSE 流）"
```

---

## Task 6: OnlyOffice 服务

**Files:**
- Create: `backend/app/services/onlyoffice_service.py`

- [ ] **Step 1: 复制并调整 onlyoffice_service.py**

```bash
cp ~/WebstormProjects/ai-bidding-assistant\(refactor\)/doc-service/app/services/onlyoffice_service.py \
   ~/WebstormProjects/docfill/backend/app/services/onlyoffice_service.py
```

打开文件，将所有 `from app.core.config import settings` 的导入保持不变（路径相同），检查无其他 `doc-service` 专有引用。

- [ ] **Step 2: 验证导入无错误**

```bash
cd ~/WebstormProjects/docfill/backend
source .venv/bin/activate
python -c "from app.services.onlyoffice_service import OnlyOfficeService; print('OK')"
```

预期：`OK`

- [ ] **Step 3: 提交**

```bash
cd ~/WebstormProjects/docfill
git add backend/app/services/onlyoffice_service.py
git commit -m "feat: 复用 OnlyOffice 服务"
```

---

## Task 7: Document API 端点

**Files:**
- Modify: `backend/app/api/v1/documents.py`
- Create: `backend/app/api/v1/onlyoffice.py`

- [ ] **Step 1: 实现 documents.py**

```python
# backend/app/api/v1/documents.py
"""文档 CRUD + AI 填写触发端点。"""
import logging
import uuid
from pathlib import Path

import aiofiles
from docx import Document as DocxDocument
from fastapi import APIRouter, Depends, HTTPException, UploadFile, File
from fastapi.responses import FileResponse, StreamingResponse
from sqlalchemy.orm import Session

from app.core.config import settings
from app.core.deps import get_db
from app.models.document import Document
from app.schemas.document import (
    ConfirmResponse,
    DocumentStatusResponse,
    DocumentUploadResponse,
    EditorTokenResponse,
    FieldUpdateRequest,
)
from app.services.ai_filler import AiFiller
from app.services.onlyoffice_service import OnlyOfficeService
from app.services.template_analyzer import TemplateAnalyzer
from app.services.template_filler import TemplateFiller
from app.services.word_parser import WordParser

router = APIRouter()
logger = logging.getLogger(__name__)
onlyoffice_service = OnlyOfficeService()
ai_filler = AiFiller()

ALLOWED_EXTENSIONS = {".docx", ".doc"}


def _extract_text(file_path: str) -> str:
    """从 docx 文件提取纯文本。"""
    try:
        doc = DocxDocument(file_path)
        return "\n".join(p.text for p in doc.paragraphs if p.text.strip())
    except Exception:
        return ""


@router.post("/upload", response_model=DocumentUploadResponse)
async def upload_document(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """上传目标文档（待填写的 Word 文件）。"""
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"不支持的文件类型: {suffix}，请上传 .docx 或 .doc 文件")

    doc_id = str(uuid.uuid4())
    upload_dir = settings.upload_dir / "target"
    upload_dir.mkdir(parents=True, exist_ok=True)
    file_path = upload_dir / f"{doc_id}{suffix}"

    async with aiofiles.open(file_path, "wb") as f:
        content = await file.read()
        await f.write(content)

    # 解析字段和大纲
    try:
        analyzer = TemplateAnalyzer()
        fields_raw = analyzer.analyze(str(file_path))
        fields = [
            {
                "id": f.id,
                "label": f.label,
                "value": "",
                "status": "empty",
                "field_type": f.field_type,
                "requires_input": False,
                "original_text": f.original_text,
                "location": f.location,
            }
            for f in fields_raw
        ]

        parser = WordParser(str(file_path))
        outline = parser.extract_outline()
        parser.doc.save(str(file_path))  # 保存书签

        status = "ready" if fields else "error"
        error_message = None if fields else "未识别到可填写字段"
    except Exception as e:
        logger.error("解析文档失败: %s", e)
        fields = []
        outline = []
        status = "error"
        error_message = str(e)

    doc = Document(
        id=doc_id,
        original_filename=file.filename or "document.docx",
        file_path=str(file_path),
        status=status,
        fields=fields,
        outline=outline,
        references=[],
        error_message=error_message,
    )
    db.add(doc)
    db.commit()

    return DocumentUploadResponse(
        doc_id=doc_id,
        status=status,
        message="文档上传成功，字段解析完成" if fields else "文档上传成功，但未识别到可填写字段",
    )


@router.post("/{doc_id}/references", response_model=DocumentUploadResponse)
async def upload_reference(
    doc_id: str,
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
):
    """上传参考文档（AI 填写时参考的来源）。"""
    doc = db.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "文档不存在")

    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(400, f"不支持的文件类型: {suffix}")

    ref_id = str(uuid.uuid4())
    ref_dir = settings.upload_dir / "references" / doc_id
    ref_dir.mkdir(parents=True, exist_ok=True)
    ref_path = ref_dir / f"{ref_id}{suffix}"

    async with aiofiles.open(ref_path, "wb") as f:
        content = await file.read()
        await f.write(content)

    ref_text = _extract_text(str(ref_path))
    refs = list(doc.references or [])
    refs.append({
        "doc_id": ref_id,
        "filename": file.filename,
        "file_path": str(ref_path),
        "text": ref_text[:10000],
    })
    doc.references = refs
    db.commit()

    return DocumentUploadResponse(
        doc_id=ref_id,
        status="ready",
        message="参考文档上传成功",
    )


@router.get("/{doc_id}", response_model=DocumentStatusResponse)
def get_document(doc_id: str, db: Session = Depends(get_db)):
    doc = db.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "文档不存在")
    return DocumentStatusResponse(
        doc_id=doc.id,
        original_filename=doc.original_filename,
        status=doc.status,
        fields=doc.fields,
        outline=doc.outline,
        references=[
            {"doc_id": r["doc_id"], "filename": r["filename"]}
            for r in (doc.references or [])
        ],
        error_message=doc.error_message,
    )


@router.get("/{doc_id}/editor-token", response_model=EditorTokenResponse)
def get_editor_token(doc_id: str, db: Session = Depends(get_db)):
    doc = db.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "文档不存在")
    result = onlyoffice_service.generate_editor_config(
        doc_id=doc_id,
        filename=doc.original_filename,
        host_url=settings.host_url,
    )
    doc.onlyoffice_doc_key = result["doc_key"]
    db.commit()
    return EditorTokenResponse(**result)


@router.get("/{doc_id}/raw-file")
def get_raw_file(doc_id: str, db: Session = Depends(get_db)):
    doc = db.get(Document, doc_id)
    if not doc or not Path(doc.file_path).exists():
        raise HTTPException(404, "文件不存在")
    return FileResponse(
        doc.file_path,
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )


@router.post("/{doc_id}/ai-fill")
def trigger_ai_fill(doc_id: str, db: Session = Depends(get_db)):
    """触发 AI 填写，返回 SSE 流。"""
    doc = db.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "文档不存在")
    if not doc.fields:
        raise HTTPException(400, "文档无可填写字段")

    # 合并已有字段（续传：保留已填值）
    fields = list(doc.fields)
    partial = doc.partial_fields or {}
    for f in fields:
        if f["id"] in partial:
            f["value"] = partial[f["id"]]

    # 只填写还没有值的字段
    pending_fields = [f for f in fields if not f.get("value")]

    document_text = _extract_text(doc.file_path)
    reference_text = None
    if doc.references:
        reference_text = "\n\n---\n\n".join(
            r["text"] for r in doc.references if r.get("text")
        )

    doc.status = "filling"
    db.commit()

    def event_stream():
        partial_update: dict[str, str] = dict(partial)
        try:
            for sse_line in ai_filler.fill_stream(
                fields=pending_fields,
                document_text=document_text,
                reference_text=reference_text or None,
            ):
                # 更新 partial_fields 以便续传
                if sse_line.startswith("event: field_filled"):
                    import json as _json
                    data_line = sse_line.split("\ndata: ", 1)[1].strip()
                    item = _json.loads(data_line.split("\n\n")[0])
                    partial_update[item["id"]] = item["value"]
                yield sse_line
        finally:
            # 无论是否中断，持久化已填字段
            _db = next(get_db())
            _doc = _db.get(Document, doc_id)
            if _doc:
                _doc.partial_fields = partial_update
                _doc.status = "ready"
                _db.commit()
            _db.close()

    return StreamingResponse(event_stream(), media_type="text/event-stream")


@router.delete("/{doc_id}/ai-fill")
def cancel_ai_fill(doc_id: str, db: Session = Depends(get_db)):
    doc = db.get(Document, doc_id)
    if not doc:
        raise HTTPException(404, "文档不存在")
    doc.status = "ready"
    db.commit()
    return {"success": True}


@router.patch("/{doc_id}/fields/{field_id}")
def update_field(
    doc_id: str,
    field_id: str,
    body: FieldUpdateRequest,
    db: Session = Depends(get_db),
):
    doc = db.get(Document, doc_id)
    if not doc or not doc.fields:
        raise HTTPException(404, "文档或字段不存在")

    fields = list(doc.fields)
    found = False
    for f in fields:
        if f["id"] == field_id:
            f["value"] = body.value
            f["status"] = "filled" if body.value else "empty"
            found = True
            break

    if not found:
        raise HTTPException(404, f"字段 {field_id} 不存在")

    doc.fields = fields
    db.commit()
    return {"success": True, "field_id": field_id, "value": body.value}


@router.post("/{doc_id}/confirm", response_model=ConfirmResponse)
def confirm_fields(doc_id: str, db: Session = Depends(get_db)):
    """将字段值写回 Word 文档，生成可下载版本。"""
    doc = db.get(Document, doc_id)
    if not doc or not doc.fields:
        raise HTTPException(400, "文档或字段不存在")

    analyzer = TemplateAnalyzer()
    fields_raw = analyzer.analyze(doc.file_path)
    field_registry = {f.id: f for f in fields_raw}

    field_values = {
        f["id"]: f["value"]
        for f in doc.fields
        if f.get("value")
    }

    output_dir = str(settings.processed_dir / doc_id)
    filler = TemplateFiller()
    output_path = filler.fill(
        template_path=doc.file_path,
        field_values=field_values,
        field_registry=field_registry,
        output_dir=output_dir,
    )

    doc.status = "filled"
    doc.file_path = output_path  # 指向填充后的文件
    db.commit()

    download_url = f"{settings.host_url}/api/v1/documents/{doc_id}/download"
    return ConfirmResponse(
        success=True,
        download_url=download_url,
        message="字段已写入文档，可以下载",
    )


@router.get("/{doc_id}/download")
def download_document(doc_id: str, db: Session = Depends(get_db)):
    doc = db.get(Document, doc_id)
    if not doc or not Path(doc.file_path).exists():
        raise HTTPException(404, "文件不存在，请先确认字段")
    return FileResponse(
        doc.file_path,
        filename=f"filled_{doc.original_filename}",
        media_type="application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    )
```

- [ ] **Step 2: 实现 onlyoffice.py**

```python
# backend/app/api/v1/onlyoffice.py
import httpx
from fastapi import APIRouter, Body, Depends
from sqlalchemy.orm import Session
from app.core.deps import get_db
from app.models.document import Document

router = APIRouter()


@router.post("/callback")
async def onlyoffice_callback(
    event: dict = Body(...),
    db: Session = Depends(get_db),
):
    """OnlyOffice Document Server 保存回调。"""
    status = event.get("status", 0)
    doc_key = event.get("key", "")

    # status=2 表示用户主动保存
    if status == 2:
        url = event.get("url")
        if url:
            doc = db.query(Document).filter(
                Document.onlyoffice_doc_key == doc_key
            ).first()
            if doc:
                async with httpx.AsyncClient() as client:
                    response = await client.get(url)
                with open(doc.file_path, "wb") as f:
                    f.write(response.content)
                doc.updated_at = None  # 触发 onupdate
                db.commit()

    return {"error": 0}
```

- [ ] **Step 3: 验证 API 文档可访问**

```bash
cd ~/WebstormProjects/docfill/backend
source .venv/bin/activate
uvicorn app.main:app --port 8002 --reload
# 新终端
curl http://localhost:8002/docs
```

预期：返回 HTML（Swagger UI）

- [ ] **Step 4: 提交**

```bash
cd ~/WebstormProjects/docfill
git add backend/app/api/
git commit -m "feat: 文档 API 端点（上传、解析、AI 填写 SSE、确认、下载）"
```

---

## Task 8: 后端集成测试

**Files:**
- Create: `backend/tests/conftest.py`
- Create: `backend/tests/test_documents_api.py`

- [ ] **Step 1: 创建 conftest.py**

```python
# backend/tests/conftest.py
import pytest
from fastapi.testclient import TestClient
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker
from app.core.database import Base
from app.core.deps import get_db
from app.main import app

SQLALCHEMY_TEST_URL = "sqlite:///./test.db"

engine = create_engine(
    SQLALCHEMY_TEST_URL,
    connect_args={"check_same_thread": False},
)
TestingSessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


@pytest.fixture(autouse=True)
def setup_db():
    Base.metadata.create_all(bind=engine)
    yield
    Base.metadata.drop_all(bind=engine)


@pytest.fixture
def db():
    session = TestingSessionLocal()
    try:
        yield session
    finally:
        session.close()


@pytest.fixture
def client(db):
    def override_get_db():
        try:
            yield db
        finally:
            pass

    app.dependency_overrides[get_db] = override_get_db
    with TestClient(app) as c:
        yield c
    app.dependency_overrides.clear()
```

- [ ] **Step 2: 创建集成测试**

```python
# backend/tests/test_documents_api.py
import io
from docx import Document as DocxDocument
from pathlib import Path
import pytest


def _make_docx_bytes(text: str) -> bytes:
    """创建含指定文本的 docx 文件字节。"""
    doc = DocxDocument()
    doc.add_paragraph(text)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def test_upload_and_get(client, tmp_path, monkeypatch):
    """上传文档后可获取状态和字段。"""
    monkeypatch.setattr("app.core.config.settings.upload_dir", tmp_path)

    docx_bytes = _make_docx_bytes("甲方：【XX 公司[投标人]】")
    response = client.post(
        "/api/v1/documents/upload",
        files={"file": ("test.docx", docx_bytes, "application/octet-stream")},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ready"
    doc_id = data["doc_id"]

    # 获取文档
    response2 = client.get(f"/api/v1/documents/{doc_id}")
    assert response2.status_code == 200
    doc_data = response2.json()
    assert doc_data["status"] == "ready"
    assert len(doc_data["fields"]) == 1
    assert doc_data["fields"][0]["label"] == "投标人"


def test_upload_invalid_type(client):
    """上传非 Word 文件应返回 400。"""
    response = client.post(
        "/api/v1/documents/upload",
        files={"file": ("test.pdf", b"fake pdf", "application/pdf")},
    )
    assert response.status_code == 400
    assert "不支持的文件类型" in response.json()["detail"]


def test_update_field(client, tmp_path, monkeypatch):
    """手动更新字段值。"""
    monkeypatch.setattr("app.core.config.settings.upload_dir", tmp_path)

    docx_bytes = _make_docx_bytes("联系人：________")
    upload_resp = client.post(
        "/api/v1/documents/upload",
        files={"file": ("test.docx", docx_bytes, "application/octet-stream")},
    )
    doc_id = upload_resp.json()["doc_id"]
    fields = client.get(f"/api/v1/documents/{doc_id}").json()["fields"]
    field_id = fields[0]["id"]

    resp = client.patch(
        f"/api/v1/documents/{doc_id}/fields/{field_id}",
        json={"value": "张三"},
    )
    assert resp.status_code == 200
    assert resp.json()["value"] == "张三"
```

- [ ] **Step 3: 运行全部后端测试**

```bash
cd ~/WebstormProjects/docfill/backend
source .venv/bin/activate
pytest tests/ -v
```

预期：所有测试通过（至少 9 个）

- [ ] **Step 4: 提交**

```bash
cd ~/WebstormProjects/docfill
git add backend/tests/
git commit -m "test: 后端集成测试（上传、字段更新、类型校验）"
```

---

## Task 9: 前端基础（类型定义 + API 客户端 + SSE 客户端）

**Files:**
- Create: `frontend/types/document.ts`
- Create: `frontend/lib/api.ts`
- Create: `frontend/lib/sse.ts`
- Create: `frontend/app/api/[...proxy]/route.ts`

- [ ] **Step 1: 创建 types/document.ts**

```typescript
// frontend/types/document.ts
export type DocumentStatus = 'parsing' | 'ready' | 'filling' | 'filled' | 'error'
export type FieldStatus = 'empty' | 'filled'
export type FieldType = 'bracket' | 'blank' | 'table_cell' | 'inline_paren'
export type AiFillState = 'idle' | 'filling' | 'paused' | 'done'

export interface DocField {
  id: string
  label: string
  value: string
  status: FieldStatus
  field_type: FieldType
  requires_input: boolean
}

export interface OutlineNode {
  id: string
  title: string
  level: number
  bookmarkName: string
  children: OutlineNode[]
}

export interface Reference {
  doc_id: string
  filename: string
}

export interface DocumentInfo {
  doc_id: string
  original_filename: string
  status: DocumentStatus
  fields: DocField[] | null
  outline: OutlineNode[] | null
  references: Reference[] | null
  error_message: string | null
}

export interface UploadResponse {
  doc_id: string
  status: string
  message: string
}

// SSE 事件
export interface FieldFilledEvent {
  type: 'field_filled'
  id: string
  label: string
  value: string
  requires_input: false
}

export interface FieldRequiresInputEvent {
  type: 'field_requires_input'
  id: string
  label: string
  requires_input: true
}

export interface ProgressEvent {
  type: 'progress'
  filled: number
  total: number
  percentage: number
}

export interface DoneEvent {
  type: 'done'
  filled_count: number
  empty_count: number
}

export interface ErrorEvent {
  type: 'error'
  message: string
}

export type AiFillEvent =
  | FieldFilledEvent
  | FieldRequiresInputEvent
  | ProgressEvent
  | DoneEvent
  | ErrorEvent
```

- [ ] **Step 2: 创建 lib/api.ts**

```typescript
// frontend/lib/api.ts
const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8002'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE_URL}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...init?.headers,
    },
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export async function uploadDocument(file: File) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE_URL}/api/v1/documents/upload`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export async function uploadReference(docId: string, file: File) {
  const form = new FormData()
  form.append('file', file)
  const res = await fetch(`${BASE_URL}/api/v1/documents/${docId}/references`, {
    method: 'POST',
    body: form,
  })
  if (!res.ok) {
    const err = await res.json().catch(() => ({ detail: res.statusText }))
    throw new Error(err.detail ?? `HTTP ${res.status}`)
  }
  return res.json()
}

export const getDocument = (docId: string) =>
  request(`/api/v1/documents/${docId}`)

export const getEditorToken = (docId: string) =>
  request(`/api/v1/documents/${docId}/editor-token`)

export const updateField = (docId: string, fieldId: string, value: string) =>
  request(`/api/v1/documents/${docId}/fields/${fieldId}`, {
    method: 'PATCH',
    body: JSON.stringify({ value }),
  })

export const confirmFields = (docId: string) =>
  request(`/api/v1/documents/${docId}/confirm`, { method: 'POST' })

export const cancelAiFill = (docId: string) =>
  request(`/api/v1/documents/${docId}/ai-fill`, { method: 'DELETE' })

export const getDownloadUrl = (docId: string) =>
  `${BASE_URL}/api/v1/documents/${docId}/download`
```

- [ ] **Step 3: 创建 lib/sse.ts**

```typescript
// frontend/lib/sse.ts
import type { AiFillEvent } from '@/types/document'

const BASE_URL = process.env.NEXT_PUBLIC_API_URL ?? 'http://localhost:8002'

/**
 * 连接 AI 填写 SSE 流。
 * 返回 abort 函数，调用后断开连接。
 */
export function connectAiFillStream(
  docId: string,
  onEvent: (event: AiFillEvent) => void,
  onDone: () => void,
  onError: (message: string) => void,
): () => void {
  const controller = new AbortController()

  fetch(`${BASE_URL}/api/v1/documents/${docId}/ai-fill`, {
    method: 'POST',
    signal: controller.signal,
  }).then(async (res) => {
    if (!res.ok || !res.body) {
      onError(`HTTP ${res.status}`)
      return
    }

    const reader = res.body.getReader()
    const decoder = new TextDecoder()
    let buffer = ''

    while (true) {
      const { done, value } = await reader.read()
      if (done) break

      buffer += decoder.decode(value, { stream: true })
      const blocks = buffer.split('\n\n')
      buffer = blocks.pop() ?? ''

      for (const block of blocks) {
        const lines = block.trim().split('\n')
        if (lines.length < 2) continue

        const eventType = lines[0].replace('event: ', '').trim()
        const dataLine = lines[1].replace('data: ', '').trim()

        try {
          const data = JSON.parse(dataLine)
          const event = { type: eventType, ...data } as AiFillEvent
          if (eventType === 'done') {
            onEvent(event)
            onDone()
          } else if (eventType === 'error') {
            onError(data.message)
          } else {
            onEvent(event)
          }
        } catch {
          // 忽略解析失败的行
        }
      }
    }
  }).catch((err) => {
    if (err.name !== 'AbortError') {
      onError(err.message)
    }
  })

  return () => controller.abort()
}
```

- [ ] **Step 4: 创建 BFF 代理路由**

```typescript
// frontend/app/api/[...proxy]/route.ts
import { type NextRequest, NextResponse } from 'next/server'

const BACKEND = process.env.BACKEND_URL ?? 'http://localhost:8002'

async function proxy(req: NextRequest, path: string) {
  const url = `${BACKEND}${path}`
  const headers = new Headers(req.headers)
  headers.delete('host')

  const res = await fetch(url, {
    method: req.method,
    headers,
    body: req.method !== 'GET' && req.method !== 'HEAD' ? req.body : undefined,
    // @ts-expect-error Node fetch duplex
    duplex: 'half',
  })

  // 对于 SSE 流，直接透传
  if (res.headers.get('content-type')?.includes('text/event-stream')) {
    return new NextResponse(res.body, {
      status: res.status,
      headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
    })
  }

  const data = await res.arrayBuffer()
  return new NextResponse(data, {
    status: res.status,
    headers: res.headers,
  })
}

export async function GET(req: NextRequest, { params }: { params: { proxy: string[] } }) {
  return proxy(req, '/' + params.proxy.join('/'))
}
export async function POST(req: NextRequest, { params }: { params: { proxy: string[] } }) {
  return proxy(req, '/' + params.proxy.join('/'))
}
export async function PATCH(req: NextRequest, { params }: { params: { proxy: string[] } }) {
  return proxy(req, '/' + params.proxy.join('/'))
}
export async function DELETE(req: NextRequest, { params }: { params: { proxy: string[] } }) {
  return proxy(req, '/' + params.proxy.join('/'))
}
```

- [ ] **Step 5: 配置环境变量**

```bash
cat > ~/WebstormProjects/docfill/frontend/.env.local << 'EOF'
NEXT_PUBLIC_API_URL=http://localhost:8002
BACKEND_URL=http://localhost:8002
EOF
```

- [ ] **Step 6: 提交**

```bash
cd ~/WebstormProjects/docfill
git add frontend/types/ frontend/lib/ frontend/app/api/
git commit -m "feat: 前端类型定义、API 客户端、SSE 客户端、BFF 代理"
```

---

## Task 10: 首页（上传入口）

**Files:**
- Modify: `frontend/app/layout.tsx`
- Modify: `frontend/app/globals.css`
- Modify: `frontend/app/page.tsx`
- Create: `frontend/components/upload/DropZone.tsx`
- Create: `frontend/components/upload/UploadProgress.tsx`

- [ ] **Step 1: 更新 layout.tsx 和 globals.css**

```tsx
// frontend/app/layout.tsx
import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'docfill — AI 文档填写',
  description: '上传任意 Word 文档，AI 智能填写',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className={inter.className}>{children}</body>
    </html>
  )
}
```

```css
/* frontend/app/globals.css */
@tailwind base;
@tailwind components;
@tailwind utilities;

:root {
  --bg-from: #0f0c29;
  --bg-via: #302b63;
  --bg-to: #24243e;
}

body {
  background: #0f0c29;
  color: #fff;
  min-height: 100vh;
}
```

- [ ] **Step 2: 创建 DropZone 组件**

```tsx
// frontend/components/upload/DropZone.tsx
'use client'
import { useCallback, useState } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

interface DropZoneProps {
  onFileSelect: (file: File) => void
  label?: string
  accept?: string
  className?: string
}

export default function DropZone({
  onFileSelect,
  label = '拖拽或点击上传 Word 文档',
  accept = '.docx,.doc',
  className = '',
}: DropZoneProps) {
  const [isDragging, setIsDragging] = useState(false)

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault()
      setIsDragging(false)
      const file = e.dataTransfer.files[0]
      if (file) onFileSelect(file)
    },
    [onFileSelect],
  )

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0]
      if (file) onFileSelect(file)
    },
    [onFileSelect],
  )

  return (
    <motion.label
      className={`relative flex flex-col items-center justify-center
        cursor-pointer rounded-2xl border-2 border-dashed transition-all
        ${isDragging
          ? 'border-violet-400 bg-violet-500/10 shadow-[0_0_40px_rgba(139,92,246,0.3)]'
          : 'border-white/20 bg-white/5 hover:border-white/40 hover:bg-white/10'
        } ${className}`}
      onDragOver={(e) => { e.preventDefault(); setIsDragging(true) }}
      onDragLeave={() => setIsDragging(false)}
      onDrop={handleDrop}
      whileHover={{ scale: 1.01 }}
      whileTap={{ scale: 0.99 }}
    >
      <input type="file" accept={accept} className="sr-only" onChange={handleChange} />

      <div className="flex flex-col items-center gap-4 p-12 text-center">
        <motion.div
          className="text-5xl"
          animate={isDragging ? { scale: 1.2, rotate: 5 } : { scale: 1, rotate: 0 }}
          transition={{ type: 'spring', stiffness: 300 }}
        >
          📄
        </motion.div>
        <p className="text-lg font-medium text-white/80">{label}</p>
        <p className="text-sm text-white/40">支持 .docx、.doc 格式</p>
      </div>

      <AnimatePresence>
        {isDragging && (
          <motion.div
            className="absolute inset-0 rounded-2xl bg-violet-500/5"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
          />
        )}
      </AnimatePresence>
    </motion.label>
  )
}
```

- [ ] **Step 3: 创建 UploadProgress 组件**

```tsx
// frontend/components/upload/UploadProgress.tsx
'use client'
import { motion } from 'framer-motion'

interface UploadProgressProps {
  filename: string
  state: 'uploading' | 'parsing' | 'ready' | 'error'
  message?: string
}

const STATE_LABELS: Record<UploadProgressProps['state'], string> = {
  uploading: '正在上传...',
  parsing: '正在解析字段...',
  ready: '解析完成',
  error: '解析失败',
}

export default function UploadProgress({ filename, state, message }: UploadProgressProps) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-white/10 bg-white/5 p-6">
      <div className="flex items-center gap-3">
        <span className="text-2xl">{state === 'error' ? '❌' : '📄'}</span>
        <span className="truncate text-sm font-medium text-white/80">{filename}</span>
      </div>

      {state !== 'ready' && state !== 'error' && (
        <div className="h-1 overflow-hidden rounded-full bg-white/10">
          <motion.div
            className="h-full rounded-full bg-gradient-to-r from-violet-500 to-blue-500"
            initial={{ width: '0%' }}
            animate={{ width: state === 'parsing' ? '70%' : '30%' }}
            transition={{ duration: 1, ease: 'easeInOut' }}
          />
        </div>
      )}

      <p className={`text-xs ${state === 'error' ? 'text-red-400' : 'text-white/50'}`}>
        {message ?? STATE_LABELS[state]}
      </p>
    </div>
  )
}
```

- [ ] **Step 4: 创建首页 page.tsx**

```tsx
// frontend/app/page.tsx
'use client'
import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import { motion, AnimatePresence } from 'framer-motion'
import DropZone from '@/components/upload/DropZone'
import UploadProgress from '@/components/upload/UploadProgress'
import { uploadDocument, uploadReference } from '@/lib/api'

type Stage = 'idle' | 'uploading' | 'parsing' | 'ready' | 'error'

export default function HomePage() {
  const router = useRouter()
  const [docId, setDocId] = useState<string | null>(null)
  const [filename, setFilename] = useState('')
  const [stage, setStage] = useState<Stage>('idle')
  const [errorMsg, setErrorMsg] = useState('')
  const [refs, setRefs] = useState<string[]>([])

  const handleDocUpload = useCallback(async (file: File) => {
    setFilename(file.name)
    setStage('uploading')
    setErrorMsg('')
    try {
      const res = await uploadDocument(file)
      setDocId(res.doc_id)
      setStage(res.status === 'ready' ? 'ready' : 'error')
      if (res.status !== 'ready') setErrorMsg(res.message)
    } catch (e: unknown) {
      setStage('error')
      setErrorMsg(e instanceof Error ? e.message : '上传失败')
    }
  }, [])

  const handleRefUpload = useCallback(async (file: File) => {
    if (!docId) return
    try {
      await uploadReference(docId, file)
      setRefs((prev) => [...prev, file.name])
    } catch {
      // 参考文档失败不阻断主流程
    }
  }, [docId])

  const handleStart = () => {
    if (docId) router.push(`/workspace/${docId}`)
  }

  return (
    <main className="flex min-h-screen flex-col items-center justify-center bg-gradient-to-br from-[#0f0c29] via-[#302b63] to-[#24243e] px-4">
      {/* 标题 */}
      <motion.div
        className="mb-12 text-center"
        initial={{ opacity: 0, y: -20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6 }}
      >
        <h1 className="text-5xl font-bold tracking-tight">
          <span className="bg-gradient-to-r from-violet-400 to-blue-400 bg-clip-text text-transparent">
            docfill
          </span>
        </h1>
        <p className="mt-3 text-lg text-white/60">上传文档，AI 智能填写</p>
        <p className="mt-1 text-sm text-white/30">支持合同、表单、试卷等任意 Word 文档</p>
      </motion.div>

      {/* 上传区域 */}
      <motion.div
        className="w-full max-w-xl"
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.6, delay: 0.2 }}
      >
        {stage === 'idle' ? (
          <DropZone onFileSelect={handleDocUpload} className="h-64 w-full" />
        ) : (
          <UploadProgress
            filename={filename}
            state={stage === 'uploading' ? 'uploading' : stage === 'parsing' ? 'parsing' : stage === 'ready' ? 'ready' : 'error'}
            message={errorMsg || undefined}
          />
        )}

        {/* 参考文档（就绪后显示） */}
        <AnimatePresence>
          {stage === 'ready' && (
            <motion.div
              initial={{ opacity: 0, height: 0 }}
              animate={{ opacity: 1, height: 'auto' }}
              exit={{ opacity: 0, height: 0 }}
              className="mt-4"
            >
              <DropZone
                onFileSelect={handleRefUpload}
                label="+ 添加参考文档（可选）"
                className="h-24 w-full"
              />
              {refs.length > 0 && (
                <ul className="mt-2 space-y-1">
                  {refs.map((r) => (
                    <li key={r} className="text-xs text-white/40">✓ {r}</li>
                  ))}
                </ul>
              )}

              <motion.button
                className="mt-6 w-full rounded-xl bg-gradient-to-r from-violet-600 to-blue-600
                           py-4 text-base font-semibold text-white shadow-lg
                           hover:from-violet-500 hover:to-blue-500 active:scale-95"
                onClick={handleStart}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
              >
                开始 AI 填写 →
              </motion.button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </main>
  )
}
```

- [ ] **Step 5: 验证首页渲染**

```bash
cd ~/WebstormProjects/docfill/frontend
npm run dev -- --port 3001
# 浏览器访问 http://localhost:3001
```

预期：深色渐变背景，居中 docfill 标题，拖拽上传区域

- [ ] **Step 6: 提交**

```bash
cd ~/WebstormProjects/docfill
git add frontend/app/ frontend/components/upload/
git commit -m "feat: 首页上传入口（深色渐变 UI、拖拽、参考文档、Framer Motion）"
```

---

## Task 11: 工作区页面（三列布局）

**Files:**
- Create: `frontend/app/workspace/[id]/page.tsx`
- Create: `frontend/components/workspace/OutlineSidebar.tsx`
- Create: `frontend/components/workspace/OnlyOfficeEditor.tsx`
- Create: `frontend/components/workspace/AiPanel.tsx`
- Create: `frontend/components/workspace/AiProgressStream.tsx`
- Create: `frontend/components/workspace/PersonalInfoModal.tsx`

- [ ] **Step 1: 创建工作区页面主框架**

```tsx
// frontend/app/workspace/[id]/page.tsx
'use client'
import { useEffect, useState, useCallback, use } from 'react'
import { useRouter } from 'next/navigation'
import type { DocumentInfo, DocField, AiFillEvent } from '@/types/document'
import { getDocument, updateField, confirmFields, cancelAiFill, getDownloadUrl } from '@/lib/api'
import { connectAiFillStream } from '@/lib/sse'
import OutlineSidebar from '@/components/workspace/OutlineSidebar'
import OnlyOfficeEditor from '@/components/workspace/OnlyOfficeEditor'
import AiPanel from '@/components/workspace/AiPanel'
import PersonalInfoModal from '@/components/workspace/PersonalInfoModal'

interface Props {
  params: Promise<{ id: string }>
}

export default function WorkspacePage({ params }: Props) {
  const { id: docId } = use(params)
  const router = useRouter()
  const [doc, setDoc] = useState<DocumentInfo | null>(null)
  const [fields, setFields] = useState<DocField[]>([])
  const [aiFillState, setAiFillState] = useState<'idle' | 'filling' | 'done'>('idle')
  const [progress, setProgress] = useState(0)
  const [pendingInputField, setPendingInputField] = useState<DocField | null>(null)
  const [abortFill, setAbortFill] = useState<(() => void) | null>(null)

  // 加载文档信息
  useEffect(() => {
    getDocument(docId).then((data: DocumentInfo) => {
      setDoc(data)
      setFields(data.fields ?? [])
    }).catch(() => router.push('/'))
  }, [docId, router])

  // 处理 SSE 事件
  const handleAiEvent = useCallback((event: AiFillEvent) => {
    if (event.type === 'field_filled') {
      setFields((prev) =>
        prev.map((f) =>
          f.id === event.id
            ? { ...f, value: event.value, status: 'filled' }
            : f,
        ),
      )
    } else if (event.type === 'field_requires_input') {
      // 找到对应字段，弹窗询问
      setFields((prev) => {
        const field = prev.find((f) => f.id === event.id)
        if (field) setPendingInputField(field)
        return prev
      })
    } else if (event.type === 'progress') {
      setProgress(event.percentage)
    } else if (event.type === 'done') {
      setAiFillState('done')
      setProgress(100)
    }
  }, [])

  const startAiFill = useCallback(() => {
    setAiFillState('filling')
    setProgress(0)
    const abort = connectAiFillStream(
      docId,
      handleAiEvent,
      () => setAiFillState('done'),
      () => setAiFillState('idle'),
    )
    setAbortFill(() => abort)
  }, [docId, handleAiEvent])

  const stopAiFill = useCallback(async () => {
    abortFill?.()
    await cancelAiFill(docId)
    setAiFillState('idle')
  }, [abortFill, docId])

  const handleFieldChange = useCallback(async (fieldId: string, value: string) => {
    await updateField(docId, fieldId, value)
    setFields((prev) =>
      prev.map((f) =>
        f.id === fieldId ? { ...f, value, status: value ? 'filled' : 'empty' } : f,
      ),
    )
  }, [docId])

  const handlePersonalInfoSubmit = useCallback(async (fieldId: string, value: string) => {
    await handleFieldChange(fieldId, value)
    setPendingInputField(null)
  }, [handleFieldChange])

  const handleConfirmAndDownload = useCallback(async () => {
    const result = await confirmFields(docId) as { download_url: string }
    window.open(result.download_url, '_blank')
  }, [docId])

  if (!doc) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-950 text-white/50">
        加载中...
      </div>
    )
  }

  return (
    <div className="flex h-screen flex-col bg-gray-950 text-white">
      {/* 顶部导航 */}
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4">
        <button
          onClick={() => router.push('/')}
          className="text-sm font-bold tracking-tight text-white/80 hover:text-white"
        >
          docfill
        </button>
        <span className="text-sm text-white/50 truncate max-w-xs">{doc.original_filename}</span>
        <button
          onClick={handleConfirmAndDownload}
          className="rounded-lg bg-gradient-to-r from-violet-600 to-blue-600 px-4 py-1.5 text-sm font-medium hover:opacity-90"
        >
          确认并下载
        </button>
      </header>

      {/* 三列主体 */}
      <div className="flex flex-1 overflow-hidden">
        {/* 左侧大纲 */}
        <OutlineSidebar
          outline={doc.outline ?? []}
          references={doc.references ?? []}
        />

        {/* 中间编辑器 */}
        <main className="flex-1 overflow-hidden bg-white">
          <OnlyOfficeEditor docId={docId} />
        </main>

        {/* 右侧 AI 面板 */}
        <AiPanel
          fields={fields}
          aiFillState={aiFillState}
          progress={progress}
          onStartFill={startAiFill}
          onStopFill={stopAiFill}
          onFieldChange={handleFieldChange}
        />
      </div>

      {/* 个人信息弹窗 */}
      {pendingInputField && (
        <PersonalInfoModal
          field={pendingInputField}
          onSubmit={handlePersonalInfoSubmit}
          onSkip={() => setPendingInputField(null)}
        />
      )}
    </div>
  )
}
```

- [ ] **Step 2: 创建 OutlineSidebar**

```tsx
// frontend/components/workspace/OutlineSidebar.tsx
import type { OutlineNode, Reference } from '@/types/document'

interface Props {
  outline: OutlineNode[]
  references: Reference[]
}

function OutlineItem({ node, depth = 0 }: { node: OutlineNode; depth?: number }) {
  return (
    <li>
      <button
        className={`w-full truncate rounded px-2 py-1 text-left text-sm hover:bg-white/10
          ${depth === 0 ? 'font-medium text-white/80' : 'text-white/50'}`}
        style={{ paddingLeft: `${(depth + 1) * 12}px` }}
        title={node.title}
      >
        {node.title}
      </button>
      {node.children?.length > 0 && (
        <ul>
          {node.children.map((child) => (
            <OutlineItem key={child.id} node={child} depth={depth + 1} />
          ))}
        </ul>
      )}
    </li>
  )
}

export default function OutlineSidebar({ outline, references }: Props) {
  return (
    <aside className="flex w-60 shrink-0 flex-col border-r border-white/10 bg-gray-900 overflow-y-auto">
      <div className="p-3">
        <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/30">
          文档大纲
        </p>
        {outline.length === 0 ? (
          <p className="text-xs text-white/20">暂无大纲</p>
        ) : (
          <ul className="space-y-0.5">
            {outline.map((node) => (
              <OutlineItem key={node.id} node={node} />
            ))}
          </ul>
        )}
      </div>

      {references.length > 0 && (
        <div className="border-t border-white/10 p-3">
          <p className="mb-2 text-xs font-semibold uppercase tracking-wider text-white/30">
            参考文档
          </p>
          <ul className="space-y-1">
            {references.map((ref) => (
              <li key={ref.doc_id} className="truncate text-xs text-white/40" title={ref.filename}>
                📎 {ref.filename}
              </li>
            ))}
          </ul>
        </div>
      )}
    </aside>
  )
}
```

- [ ] **Step 3: 创建 OnlyOfficeEditor**

```tsx
// frontend/components/workspace/OnlyOfficeEditor.tsx
'use client'
import { useEffect, useRef, useState } from 'react'
import { getEditorToken } from '@/lib/api'

interface Props {
  docId: string
}

declare global {
  interface Window {
    DocsAPI?: { DocEditor: new (id: string, config: object) => object }
  }
}

export default function OnlyOfficeEditor({ docId }: Props) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [error, setError] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let editorInstance: object | null = null

    const ONLYOFFICE_URL = process.env.NEXT_PUBLIC_ONLYOFFICE_URL ?? 'http://localhost:8080'

    async function init() {
      try {
        const tokenData = await getEditorToken(docId) as { config: object }

        const script = document.createElement('script')
        script.src = `${ONLYOFFICE_URL}/web-apps/apps/api/documents/api.js`
        script.onload = () => {
          if (!window.DocsAPI || !containerRef.current) return
          editorInstance = new window.DocsAPI.DocEditor('onlyoffice-editor', {
            ...tokenData.config,
            events: {
              onDocumentReady: () => setLoading(false),
              onError: (e: unknown) => setError(String(e)),
            },
          })
        }
        script.onerror = () => {
          setError('OnlyOffice 服务不可用，仅显示字段面板')
          setLoading(false)
        }
        document.head.appendChild(script)
      } catch (e) {
        setError('无法获取编辑器配置')
        setLoading(false)
      }
    }

    init()
    return () => {
      // 清理
    }
  }, [docId])

  if (error) {
    return (
      <div className="flex h-full items-center justify-center bg-gray-100 text-gray-400 text-sm">
        {error}
      </div>
    )
  }

  return (
    <div className="relative h-full w-full">
      {loading && (
        <div className="absolute inset-0 flex items-center justify-center bg-white text-gray-400 text-sm z-10">
          加载编辑器...
        </div>
      )}
      <div ref={containerRef} id="onlyoffice-editor" className="h-full w-full" />
    </div>
  )
}
```

- [ ] **Step 4: 创建 AiProgressStream**

```tsx
// frontend/components/workspace/AiProgressStream.tsx
import { motion } from 'framer-motion'

interface Props {
  progress: number
  state: 'filling' | 'done' | 'idle'
}

export default function AiProgressStream({ progress, state }: Props) {
  if (state === 'idle') return null

  return (
    <div className="space-y-2 rounded-xl border border-white/10 bg-white/5 p-4">
      <div className="flex items-center justify-between text-xs text-white/50">
        <span>{state === 'done' ? '✅ AI 填写完成' : '⚡ AI 正在填写...'}</span>
        <span>{progress}%</span>
      </div>
      <div className="h-1.5 overflow-hidden rounded-full bg-white/10">
        <motion.div
          className="h-full rounded-full bg-gradient-to-r from-violet-500 to-blue-500"
          animate={{ width: `${progress}%` }}
          transition={{ duration: 0.4, ease: 'easeOut' }}
        />
      </div>
    </div>
  )
}
```

- [ ] **Step 5: 创建 AiPanel**

```tsx
// frontend/components/workspace/AiPanel.tsx
'use client'
import type { DocField } from '@/types/document'
import AiProgressStream from './AiProgressStream'

interface Props {
  fields: DocField[]
  aiFillState: 'idle' | 'filling' | 'done'
  progress: number
  onStartFill: () => void
  onStopFill: () => void
  onFieldChange: (fieldId: string, value: string) => void
}

export default function AiPanel({
  fields,
  aiFillState,
  progress,
  onStartFill,
  onStopFill,
  onFieldChange,
}: Props) {
  const filledCount = fields.filter((f) => f.value).length
  const totalCount = fields.length

  return (
    <aside className="flex w-80 shrink-0 flex-col border-l border-white/10 bg-gray-900/80 backdrop-blur">
      {/* 标题 + 统计 */}
      <div className="border-b border-white/10 p-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-white/80">AI 填写面板</h2>
          <span className="text-xs text-white/40">
            {filledCount}/{totalCount}
          </span>
        </div>

        {/* AI 填写按钮 */}
        <div className="mt-3">
          {aiFillState === 'idle' || aiFillState === 'done' ? (
            <button
              onClick={onStartFill}
              className="w-full rounded-lg bg-gradient-to-r from-violet-600 to-blue-600
                         py-2 text-sm font-medium text-white hover:opacity-90 active:scale-95"
            >
              {aiFillState === 'done' ? '重新 AI 填写' : '⚡ AI 自动填写'}
            </button>
          ) : (
            <button
              onClick={onStopFill}
              className="w-full rounded-lg border border-red-500/50 bg-red-500/10
                         py-2 text-sm font-medium text-red-400 hover:bg-red-500/20"
            >
              停止填写
            </button>
          )}
        </div>

        <AiProgressStream progress={progress} state={aiFillState} />
      </div>

      {/* 字段列表 */}
      <div className="flex-1 overflow-y-auto p-4 space-y-3">
        {fields.length === 0 && (
          <p className="text-xs text-white/30 text-center mt-8">未识别到可填写字段</p>
        )}
        {fields.map((field) => (
          <div
            key={field.id}
            className={`rounded-xl border p-3 transition-all
              ${field.value
                ? 'border-green-500/20 bg-green-500/5'
                : 'border-white/10 bg-white/5'
              }`}
          >
            <label className="mb-1 block text-xs font-medium text-white/50">
              {field.label}
              {field.requires_input && (
                <span className="ml-1 text-violet-400">需要输入</span>
              )}
            </label>
            <input
              type="text"
              value={field.value}
              onChange={(e) => onFieldChange(field.id, e.target.value)}
              placeholder="等待填写..."
              className="w-full bg-transparent text-sm text-white/80 placeholder-white/20
                         outline-none focus:placeholder-white/30"
            />
          </div>
        ))}
      </div>
    </aside>
  )
}
```

- [ ] **Step 6: 创建 PersonalInfoModal**

```tsx
// frontend/components/workspace/PersonalInfoModal.tsx
'use client'
import { useState } from 'react'
import type { DocField } from '@/types/document'

interface Props {
  field: DocField
  onSubmit: (fieldId: string, value: string) => void
  onSkip: () => void
}

export default function PersonalInfoModal({ field, onSubmit, onSkip }: Props) {
  const [value, setValue] = useState('')

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="w-full max-w-sm rounded-2xl border border-white/10 bg-gray-900 p-6 shadow-2xl">
        <h3 className="text-base font-semibold text-white">补充信息</h3>
        <p className="mt-1 text-sm text-white/50">AI 无法自动填写此字段，请手动输入</p>

        <div className="mt-4">
          <label className="mb-1.5 block text-sm font-medium text-white/70">
            {field.label}
          </label>
          <input
            type="text"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder={`请输入${field.label}`}
            autoFocus
            className="w-full rounded-xl border border-white/20 bg-white/5 px-3 py-2
                       text-sm text-white placeholder-white/30 outline-none
                       focus:border-violet-500 focus:ring-1 focus:ring-violet-500"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && value.trim()) onSubmit(field.id, value.trim())
            }}
          />
        </div>

        <div className="mt-5 flex gap-3">
          <button
            onClick={onSkip}
            className="flex-1 rounded-xl border border-white/20 py-2 text-sm text-white/60
                       hover:bg-white/5"
          >
            跳过
          </button>
          <button
            onClick={() => value.trim() && onSubmit(field.id, value.trim())}
            disabled={!value.trim()}
            className="flex-1 rounded-xl bg-gradient-to-r from-violet-600 to-blue-600
                       py-2 text-sm font-medium text-white disabled:opacity-40"
          >
            确认
          </button>
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 7: 验证工作区页面**

```bash
cd ~/WebstormProjects/docfill/frontend
npm run dev -- --port 3001
# 同时启动后端
cd ~/WebstormProjects/docfill/backend && uvicorn app.main:app --port 8002 --reload
# 上传一个 .docx 文件，跳转到工作区 /workspace/<id>
```

预期：三列布局正常显示，字段面板展示字段列表

- [ ] **Step 8: 提交**

```bash
cd ~/WebstormProjects/docfill
git add frontend/app/workspace/ frontend/components/workspace/
git commit -m "feat: 工作区页面（三列布局、AI 面板、OnlyOffice 编辑器、个人信息弹窗）"
```

---

## Task 12: 前端测试

**Files:**
- Create: `frontend/jest.config.ts`
- Create: `frontend/jest.setup.ts`
- Create: `frontend/__tests__/DropZone.test.tsx`
- Create: `frontend/__tests__/PersonalInfoModal.test.tsx`
- Create: `frontend/__tests__/AiPanel.test.tsx`

- [ ] **Step 1: 配置 Jest**

```typescript
// frontend/jest.config.ts
import type { Config } from 'jest'
import nextJest from 'next/jest.js'

const createJestConfig = nextJest({ dir: './' })

const config: Config = {
  coverageProvider: 'v8',
  testEnvironment: 'jsdom',
  setupFilesAfterFramework: ['<rootDir>/jest.setup.ts'],
}

export default createJestConfig(config)
```

```typescript
// frontend/jest.setup.ts
import '@testing-library/jest-dom'
```

package.json 的 scripts 中添加：

```json
"test": "jest",
"test:coverage": "jest --coverage"
```

- [ ] **Step 2: DropZone 测试**

```tsx
// frontend/__tests__/DropZone.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import DropZone from '@/components/upload/DropZone'

// Mock framer-motion
jest.mock('framer-motion', () => ({
  motion: {
    label: ({ children, ...props }: React.ComponentProps<'label'>) => <label {...props}>{children}</label>,
    div: ({ children, ...props }: React.ComponentProps<'div'>) => <div {...props}>{children}</div>,
  },
  AnimatePresence: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}))

test('calls onFileSelect with .docx file', () => {
  const onSelect = jest.fn()
  render(<DropZone onFileSelect={onSelect} />)

  const input = document.querySelector('input[type="file"]') as HTMLInputElement
  const file = new File(['content'], 'test.docx', {
    type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  })
  fireEvent.change(input, { target: { files: [file] } })

  expect(onSelect).toHaveBeenCalledWith(file)
})

test('shows default label text', () => {
  render(<DropZone onFileSelect={jest.fn()} />)
  expect(screen.getByText('拖拽或点击上传 Word 文档')).toBeInTheDocument()
})

test('shows custom label', () => {
  render(<DropZone onFileSelect={jest.fn()} label="自定义标签" />)
  expect(screen.getByText('自定义标签')).toBeInTheDocument()
})
```

- [ ] **Step 3: PersonalInfoModal 测试**

```tsx
// frontend/__tests__/PersonalInfoModal.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import PersonalInfoModal from '@/components/workspace/PersonalInfoModal'
import type { DocField } from '@/types/document'

const mockField: DocField = {
  id: 'f1',
  label: '姓名',
  value: '',
  status: 'empty',
  field_type: 'blank',
  requires_input: true,
}

test('shows field label in modal', () => {
  render(
    <PersonalInfoModal field={mockField} onSubmit={jest.fn()} onSkip={jest.fn()} />,
  )
  expect(screen.getAllByText('姓名').length).toBeGreaterThan(0)
})

test('calls onSubmit with entered value on button click', () => {
  const onSubmit = jest.fn()
  render(<PersonalInfoModal field={mockField} onSubmit={onSubmit} onSkip={jest.fn()} />)

  const input = screen.getByPlaceholderText('请输入姓名')
  fireEvent.change(input, { target: { value: '张三' } })
  fireEvent.click(screen.getByText('确认'))

  expect(onSubmit).toHaveBeenCalledWith('f1', '张三')
})

test('calls onSkip when skip button clicked', () => {
  const onSkip = jest.fn()
  render(<PersonalInfoModal field={mockField} onSubmit={jest.fn()} onSkip={onSkip} />)
  fireEvent.click(screen.getByText('跳过'))
  expect(onSkip).toHaveBeenCalled()
})

test('confirm button disabled when input empty', () => {
  render(<PersonalInfoModal field={mockField} onSubmit={jest.fn()} onSkip={jest.fn()} />)
  expect(screen.getByText('确认')).toBeDisabled()
})
```

- [ ] **Step 4: AiPanel 测试**

```tsx
// frontend/__tests__/AiPanel.test.tsx
import { render, screen, fireEvent } from '@testing-library/react'
import AiPanel from '@/components/workspace/AiPanel'
import type { DocField } from '@/types/document'

// Mock AiProgressStream (has framer-motion)
jest.mock('@/components/workspace/AiProgressStream', () => () => null)

const fields: DocField[] = [
  { id: 'f1', label: '姓名', value: '', status: 'empty', field_type: 'blank', requires_input: false },
  { id: 'f2', label: '日期', value: '2026-01-01', status: 'filled', field_type: 'blank', requires_input: false },
]

test('shows field count', () => {
  render(
    <AiPanel
      fields={fields}
      aiFillState="idle"
      progress={0}
      onStartFill={jest.fn()}
      onStopFill={jest.fn()}
      onFieldChange={jest.fn()}
    />,
  )
  expect(screen.getByText('1/2')).toBeInTheDocument()
})

test('calls onStartFill when AI button clicked', () => {
  const onStart = jest.fn()
  render(
    <AiPanel
      fields={fields}
      aiFillState="idle"
      progress={0}
      onStartFill={onStart}
      onStopFill={jest.fn()}
      onFieldChange={jest.fn()}
    />,
  )
  fireEvent.click(screen.getByText('⚡ AI 自动填写'))
  expect(onStart).toHaveBeenCalled()
})

test('shows stop button when filling', () => {
  render(
    <AiPanel
      fields={fields}
      aiFillState="filling"
      progress={50}
      onStartFill={jest.fn()}
      onStopFill={jest.fn()}
      onFieldChange={jest.fn()}
    />,
  )
  expect(screen.getByText('停止填写')).toBeInTheDocument()
})
```

- [ ] **Step 5: 运行前端测试**

```bash
cd ~/WebstormProjects/docfill/frontend
npm test
```

预期：9+ tests passed

- [ ] **Step 6: 提交**

```bash
cd ~/WebstormProjects/docfill
git add frontend/__tests__/ frontend/jest.config.ts frontend/jest.setup.ts
git commit -m "test: 前端组件测试（DropZone、PersonalInfoModal、AiPanel）"
```

---

## Task 13: Docker Compose

**Files:**
- Create: `docker-compose.yml`

- [ ] **Step 1: 创建 docker-compose.yml**

```yaml
# docker-compose.yml
services:
  postgres:
    image: postgres:16-alpine
    environment:
      POSTGRES_DB: docfill
      POSTGRES_USER: docfill
      POSTGRES_PASSWORD: docfill_dev
    ports:
      - "5433:5432"
    volumes:
      - postgres_data:/var/lib/postgresql/data
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U docfill"]
      interval: 5s
      timeout: 5s
      retries: 5

  onlyoffice:
    image: onlyoffice/documentserver:8.2
    ports:
      - "8080:80"
    environment:
      ALLOW_PRIVATE_IP_ADDRESS: "true"
      ALLOW_META_IP_ADDRESS: "true"
    volumes:
      - onlyoffice_data:/var/www/onlyoffice/Data
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost/healthcheck"]
      interval: 30s
      timeout: 10s
      retries: 3

  backend:
    build:
      context: ./backend
      dockerfile: Dockerfile
    ports:
      - "8002:8002"
    environment:
      DATABASE_URL: "postgresql+psycopg://docfill:docfill_dev@postgres:5432/docfill"
      HOST_URL: "http://backend:8002"
      ONLYOFFICE_URL: "http://onlyoffice:80"
    depends_on:
      postgres:
        condition: service_healthy
    volumes:
      - ./backend/uploads:/app/uploads
      - ./backend/processed:/app/processed

  frontend:
    build:
      context: ./frontend
      dockerfile: Dockerfile
    ports:
      - "3001:3001"
    environment:
      NEXT_PUBLIC_API_URL: "http://localhost:8002"
      BACKEND_URL: "http://backend:8002"
      NEXT_PUBLIC_ONLYOFFICE_URL: "http://localhost:8080"
    depends_on:
      - backend

volumes:
  postgres_data:
  onlyoffice_data:
```

- [ ] **Step 2: 创建 backend/Dockerfile**

```dockerfile
# backend/Dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
RUN mkdir -p uploads processed
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8002"]
```

- [ ] **Step 3: 创建 frontend/Dockerfile**

```dockerfile
# frontend/Dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package*.json .
RUN npm ci
COPY . .
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/.next/standalone .
COPY --from=builder /app/.next/static ./.next/static
COPY --from=builder /app/public ./public
ENV PORT=3001
CMD ["node", "server.js"]
```

- [ ] **Step 4: 更新 next.config.ts 开启 standalone 输出**

```typescript
// frontend/next.config.ts
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
}

export default nextConfig
```

- [ ] **Step 5: 提交**

```bash
cd ~/WebstormProjects/docfill
git add docker-compose.yml backend/Dockerfile frontend/Dockerfile frontend/next.config.ts
git commit -m "feat: Docker Compose（PostgreSQL + OnlyOffice + backend + frontend）"
```

---

## Task 14: 收尾 README

**Files:**
- Create: `README.md`

- [ ] **Step 1: 创建 README**

```bash
cat > ~/WebstormProjects/docfill/README.md << 'EOF'
# docfill

通用 AI 文档填写工具。上传任意 Word 文档，AI 自动识别并填写字段。

## 快速启动（开发模式）

```bash
# 1. 启动 OnlyOffice + PostgreSQL
docker compose up -d postgres onlyoffice

# 2. 后端
cd backend
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
cp .env.example .env  # 填入 LLM_API_KEY
uvicorn app.main:app --reload --port 8002

# 3. 前端
cd frontend
npm install
npm run dev -- --port 3001
```

访问 http://localhost:3001

## 生产部署

```bash
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
EOF
```

- [ ] **Step 2: 最终提交**

```bash
cd ~/WebstormProjects/docfill
git add README.md
git commit -m "docs: 项目 README"
```

---

## 自审检查

**Spec 覆盖：**
- ✅ 上传目标文档 → Task 7 (POST /upload)
- ✅ 上传参考文档 → Task 7 (POST /{id}/references)
- ✅ 字段识别 → Task 4 (template_analyzer)
- ✅ 有参考文档 AI 填写 → Task 5 (ai_filler WITH_REF 模式)
- ✅ 无参考文档自填 → Task 5 (ai_filler NO_REF 模式)
- ✅ 个人信息字段弹窗 → Task 11 (PersonalInfoModal)
- ✅ SSE 流式进度 → Task 5 + Task 9 (sse.ts)
- ✅ OnlyOffice 预览 → Task 11 (OnlyOfficeEditor)
- ✅ 字段写回下载 → Task 7 (confirm + download)
- ✅ 降级处理（OnlyOffice 不可用）→ Task 11 OnlyOfficeEditor error state
- ✅ 续传 → Task 7 (partial_fields)
- ✅ Docker 部署 → Task 13
- ✅ 消费级 UI（深色渐变首页）→ Task 10
- ✅ 测试覆盖 → Tasks 4/5/8/12

**类型一致性：**
- `DocField.id` / `DocField.label` / `DocField.value` 在 types/document.ts 定义，AiPanel / PersonalInfoModal / sse.ts 均引用同一类型
- SSE 事件格式在 `ai_filler.py` 和 `sse.ts` 双侧对齐（`field_filled` / `field_requires_input` / `progress` / `done` / `error`）
