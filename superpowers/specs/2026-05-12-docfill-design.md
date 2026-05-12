# docfill — 通用 AI 文档填写工具 设计规格

**日期**：2026-05-12
**状态**：已确认
**项目目录**：`~/WebstormProjects/docfill/`

---

## 1. 项目背景与目标

从 `ai-bidding-assistant(refactor)` 中的 `doc-service` 和 `frontend/src/pages/bidding/businessDoc` 全栈重写，剥离所有招投标专有逻辑，构建一个**通用 AI 文档填写工具**。

核心价值：用户上传任意 Word 文档（合同、表单、试卷、报告……），AI 自动识别可填写字段并完成填写，支持参考文档辅助填写和无参考文档自填两种模式。

---

## 2. 技术栈

| 层 | 技术选型 |
|----|---------|
| 前端 | Next.js 14 (App Router) + TypeScript + Tailwind CSS + shadcn/ui + Framer Motion |
| 后端 | FastAPI + PostgreSQL + SQLAlchemy 2.0 + Alembic |
| 文档预览 | OnlyOffice Document Server 8.x（Docker） |
| AI | OpenAI-compatible API（可配置 base_url / model） |
| 文档处理 | python-docx + lxml |
| 实时通信 | SSE（Server-Sent Events）流式 AI 填写进度 |

---

## 3. 整体架构

```
~/WebstormProjects/docfill/
├── backend/
│   ├── app/
│   │   ├── api/v1/
│   │   │   ├── documents.py      # 文档 CRUD + AI 触发
│   │   │   ├── onlyoffice.py     # OnlyOffice 回调
│   │   │   └── router.py
│   │   ├── services/
│   │   │   ├── word_parser.py        # 文档大纲提取（复用）
│   │   │   ├── template_analyzer.py  # 字段识别（复用 + 通用化）
│   │   │   ├── template_filler.py    # 字段写回（复用）
│   │   │   ├── ai_filler.py          # 通用 AI 填写（重写）
│   │   │   ├── llm_service.py        # LLM 客户端（复用）
│   │   │   └── onlyoffice_service.py # OnlyOffice 集成（复用）
│   │   ├── models/
│   │   │   └── document.py       # Document ORM 模型
│   │   └── core/
│   │       ├── config.py
│   │       ├── database.py
│   │       └── deps.py
│   ├── alembic/
│   ├── tests/
│   ├── requirements.txt
│   └── .env.example
│
├── frontend/
│   ├── app/
│   │   ├── page.tsx                  # 首页（上传入口）
│   │   ├── workspace/
│   │   │   └── [id]/
│   │   │       └── page.tsx          # 文档工作区
│   │   └── api/                      # BFF 代理（转发到 backend）
│   │       └── [...proxy]/route.ts
│   ├── components/
│   │   ├── upload/
│   │   │   ├── DropZone.tsx
│   │   │   └── UploadProgress.tsx
│   │   ├── workspace/
│   │   │   ├── OutlineSidebar.tsx
│   │   │   ├── OnlyOfficeEditor.tsx
│   │   │   ├── AiPanel.tsx
│   │   │   ├── AiProgressStream.tsx
│   │   │   └── PersonalInfoModal.tsx
│   │   └── ui/                       # shadcn/ui 组件
│   ├── lib/
│   │   ├── api.ts                    # API 请求封装
│   │   └── sse.ts                    # SSE 客户端
│   ├── types/
│   │   └── document.ts
│   └── ...
│
└── docker-compose.yml    # OnlyOffice + PostgreSQL + backend + frontend
```

---

## 4. 数据模型

```python
# Document
id: str (UUID)
original_filename: str
file_path: str
status: enum(parsing | ready | filling | filled | error)
fields: JSON[]          # 识别出的字段列表
outline: JSON[]         # 文档大纲树
references: JSON[]      # 参考文档列表（doc_id + filename + file_path + extracted_text）
                       # 注意：开发阶段使用 JSON 列存储提取文本（单篇限 10000 字符）；
                       # 生产环境应迁移为独立 references 表 + 全文搜索
created_at: datetime
updated_at: datetime
```

**Field 结构：**
```json
{
  "id": "f1",
  "label": "投标人名称",
  "value": "",
  "status": "empty",
  "field_type": "bracket | blank | table_cell | inline_paren",
  "requires_input": false
}
```

`requires_input: true` 表示 AI 判断该字段为个人信息，需前端弹窗向用户收集。

---

## 5. API 端点

```
POST   /api/v1/documents/upload              # 上传目标文档
POST   /api/v1/documents/{id}/references     # 上传参考文档（可多次调用）
GET    /api/v1/documents/{id}                # 获取文档状态 + 字段列表
GET    /api/v1/documents/{id}/editor-token   # OnlyOffice 编辑器配置
GET    /api/v1/documents/{id}/raw-file       # OnlyOffice 原文件下载
POST   /api/v1/documents/{id}/ai-fill        # 触发 AI 填写（SSE 流响应）
DELETE /api/v1/documents/{id}/ai-fill        # 取消 AI 填写
PATCH  /api/v1/documents/{id}/fields/{fid}   # 手动更新单个字段值
POST   /api/v1/documents/{id}/confirm        # 写回字段到文档，生成新文件（不覆盖原文件）
GET    /api/v1/documents/{id}/download       # 下载填充后文档
POST   /api/v1/onlyoffice/callback           # OnlyOffice 保存回调
```

## 5.1 取消与续传设计

AI 填写支持取消和断点续传：

- **取消**：`DELETE /api/v1/documents/{id}/ai-fill`，服务端设置 `status = "ready"` 并保留 `partial_fields`。
  正在执行的 SSE 流在下一个字段完成后检查状态并停止。
- **续传**：`POST /api/v1/documents/{id}/ai-fill` 检测到 `partial_fields` 非空时，仅对未填写字段调用 LLM。
- **SSE 断连**：服务端继续处理当前 chunk 并保存结果，客户端重连后可获取已填字段。

### Document 模型新增字段

| 字段 | 类型 | 说明 |
|------|------|------|
| partial_fields | JSON | 已填写的部分字段结果，格式 `{field_id: value}` |
| error_message | Text | 错误信息 |

### LLM 结果校验

后端对 LLM 返回值做基本质量校验：
- 非空且长度 > 1
- 不包含占位符（`无`、`N/A`、`暂无`、`待定`、`-`、`null`、`undefined`、`xxx`）
- 占位符列表可通过 `LLM_PLACEHOLDER_VALUES` 环境变量配置
- 校验不通过的字段标记为 `empty`

---

## 6. AI 填写策略（核心设计）

### 有参考文档模式
```
system: 你是一个文档填写助手。
user:   根据以下参考文档内容，填写目标文档中识别到的所有字段。
        参考文档内容：{reference_text}
        待填字段列表（JSON）：{fields_json}

        请逐字段返回，格式：{"id": "f1", "value": "填写内容"}
        如无法确定某字段值，返回 {"id": "f1", "value": ""}
```

### 无参考文档模式
```
system: 你是一个智能文档填写助手。
user:   分析以下文档内容并完成所有可填写字段。
        - 对于知识性内容（数学题、填空题、专业问答）：直接给出答案
        - 对于个人信息字段（姓名、单位、日期、联系方式等）：
          返回 {"id": "f1", "value": "", "requires_input": true}

        文档全文（含表格文本）：{document_text}
        待填字段列表（JSON）：{fields_json}
```

### SSE 流式事件格式
```
event: field_filled
data: {"id": "f1", "label": "投标人", "value": "张三", "requires_input": false}

event: field_requires_input
data: {"id": "f2", "label": "姓名", "requires_input": true}

event: progress
data: {"filled": 5, "total": 12, "percentage": 42}

event: done
data: {"filled_count": 12, "empty_count": 0}

event: error
data: {"message": "AI 服务暂时不可用"}
```

> **注意**：`document_text` 提取必须包含表格内容（遍历 `doc.tables` 中每个 cell 的文本），
> 否则无参考模式下 AI 无法获取表格上下文。

> **为什么用 POST 返回 SSE？** AI 填写需要请求体（字段列表、参考文档标识），
> GET 不适合携带复杂请求体。SSE 相比 WebSocket 实现更简单、兼容性更好，
> 且 AI 填写是单向推送场景，不需要双向通信。如果代理/CDN 不兼容 POST+SSE，
> 可降级为 POST 返回完整 JSON（轮询模式）。

---

## 7. 前端页面设计

### 7.1 首页 `/`

- 全屏深色渐变背景（深蓝 `#0f0c29` → 深紫 `#302b63`）
- 居中大标题："上传文档，AI 智能填写"
- 副标题："支持合同、表单、试卷等任意 Word 文档"
- 超大拖拽上传区（虚线圆角卡片，hover 有光晕动效，Framer Motion）
- 上传目标文档后，出现"+ 添加参考文档（可选）"次级入口
- "开始填写"按钮（渐变色 CTA）跳转工作区

### 7.2 工作区 `/workspace/[id]`

三列布局：
```
┌──────────────┬──────────────────────────┬────────────────┐
│ 左侧 240px   │  中间（flex-1）           │  右侧 320px    │
│              │                           │                │
│ 文档大纲树   │  OnlyOffice 编辑器        │  AI 填写面板   │
│ 参考文档列表 │  （嵌入 iframe）           │  字段列表      │
│ 下载按钮     │                           │  AI 进度流     │
└──────────────┴──────────────────────────┴────────────────┘
```

- 顶部导航：Logo 左 + 文件名居中 + 下载按钮右（渐变色）
- 左侧：浅灰背景，文档大纲可点击导航
- 中间：OnlyOffice iframe，白色工作区
- 右侧：磨砂玻璃效果面板，字段卡片，AI 流式进度动画

### 7.3 个人信息弹窗

当 AI 返回 `requires_input: true` 时，右侧面板弹出 Modal 收集个人信息：

- 一次性收集所有需要用户输入的字段（而非逐个弹窗）
- 弹窗内以表单形式列出所有 `requires_input` 字段，每行一个输入框
- 用户填写后统一提交，继续填写流程
- 可跳过任意字段，跳过的字段保留 `empty` 状态

---

## 8. 错误处理

| 场景 | 处理方式 |
|------|---------|
| 上传非 Word 文件 | 前端拦截（accept=".docx,.doc"）+ 后端 400 |
| 文档无可识别字段 | status=error，前端提示"未识别到可填写内容" |
| AI 填写中断 | SSE 断连保留已填字段，支持续传 |
| OnlyOffice 无法连接 | 降级：隐藏编辑器，仅显示字段面板，仍可下载 |
| confirm 写回失败 | 不修改原 file_path，返回错误信息，原始模板仍可访问 |
| 个人信息字段 | `requires_input: true`，前端弹窗收集后继续 |
| LLM API 失败 | SSE error 事件，前端显示重试按钮 |

---

## 9. 测试策略

### 后端（pytest）
- `test_template_analyzer.py`：各种占位符格式识别（bracket / blank / table / inline_paren）
- `test_template_filler.py`：字段写回后格式保留验证
- `test_ai_filler.py`：mock LLM，验证有参考/无参考两种 prompt 构建
- `test_documents_api.py`：完整上传→解析→填写→下载流程（SQLite 内存库）

### 前端（Jest + Testing Library）
- 上传流程状态机（空 → 上传中 → 就绪）
- SSE 事件处理与字段更新
- 个人信息字段弹窗触发与提交
- OnlyOffice 降级渲染逻辑

---

## 9.1 安全与认证（MVP 限制）

MVP 阶段不实现用户认证与授权。任何知道 `doc_id` 的人都可以访问文档。
此限制在以下条件下可接受：
- 单用户本地部署场景
- 内网部署且网络隔离

生产部署前必须补充：
- 用户认证（JWT / Session）
- 文档访问权限校验
- API rate limiting
- AI fill 调用次数限制（防止 LLM 费用失控）

---

## 10. 与 doc-service 的关键差异

| 维度 | doc-service（原） | docfill（新） |
|------|-----------------|--------------|
| 场景 | 招投标专用 | 任意文档类型 |
| AI 字段映射 | 硬编码招投标字段 | 动态识别，无预设 |
| 无参考模式 | 不支持 | 支持（直接作答/补全） |
| 个人信息询问 | 无 | 前端弹窗收集 |
| 前端框架 | UmiJS/Max | Next.js 14 App Router |
| UI 风格 | 企业级 SaaS | 消费级（深色渐变首页） |
| 部署 | 独立 doc-service | 独立 docfill 项目 |

---

## 11. 启动方式

```bash
cd ~/WebstormProjects/docfill

# 启动所有服务
docker compose up -d

# 仅开发模式
cd backend && uvicorn app.main:app --reload --port 8002
cd frontend && npm run dev  # 端口 3001
```

端口规划：
| 服务 | 端口 |
|------|------|
| frontend (Next.js) | 3001 |
| backend (FastAPI) | 8002 |
| OnlyOffice | 8080 |
| PostgreSQL | 5433 |
