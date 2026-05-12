# AI 填写流程优化 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [`) syntax for tracking.

**Goal:** 将 AI 自动填写从一次性阻塞调用改为 SSE 流式进度 + chunk 级断点续传 + 取消/继续 + 结果校验，切换 deepseek-v4-flash 模型提速。

> **注意：** 本计划基于 ai-bidding-assistant 的 doc-service。如当前方向为独立的 docfill 通用工具（参见 `2026-05-12-docfill-plan.md`），则本计划的 SSE 流式 + chunk 续传 + 取消/继续机制应整合进 Plan 3 的 `ai_filler.py`，而非在本计划中独立实现。

**Architecture:** 后端新增 SSE 流式端点，按 chunk 粒度推送进度并保存中间结果到 `fill_progress`/`partial_fields`；前端用 `fetch + ReadableStream` 消费 SSE，按钮状态机驱动取消/继续；LLM 返回值做占位符过滤。

**Tech Stack:** FastAPI StreamingResponse, SQLAlchemy JSON columns, fetch ReadableStream, React state machine

---

## 文件变更总览

| 文件 | 操作 | 说明 |
|------|------|------|
| `doc-service/app/models/document.py` | 修改 | 新增 `fill_progress`、`partial_fields` 列；status 加 `ai_paused` |
| `doc-service/app/schemas/document.py` | 修改 | `AiFillRequest` 加 `resume` 字段 |
| `doc-service/app/services/llm_service.py` | 修改 | `match_fields` 加 `on_chunk_done` 回调；新增 `_validate_value` 校验 |
| `doc-service/app/api/v1/documents.py` | 修改 | 重写 `ai-fill-stream` 支持 chunk 进度/取消/续传；新增 `ai-fill-cancel` 端点 |
| `doc-service/app/core/config.py` | 修改 | `llm_model` 默认值改 `deepseek-v4-flash` |
| `frontend/src/types/businessDoc.ts` | 修改 | `AiFillStreamEvent` 加 `step` 枚举完善 |
| `frontend/src/services/businessDoc.ts` | 修改 | `triggerAiFillStream` 加 `resume` 参数；新增 `cancelAiFill` |
| `frontend/src/pages/bidding/businessDoc/index.tsx` | 修改 | 按钮状态机、SSE 调用、OnlyOffice 预览切换 |
| `frontend/src/pages/bidding/businessDoc/components/AiFieldPanel/index.tsx` | 修改 | 按钮支持取消/继续状态文案 |

---

## Task 1: 数据模型 — 新增 fill_progress、partial_fields

**Files:**
- Modify: `doc-service/app/models/document.py:32-53`

- [ ] **Step 1: 添加数据库列**

在 `Document` 类的 `fields` 列之后添加两列。注意：SQLAlchemy 普通 `JSON`
不会跟踪 dict 原地修改；若当前模型没有使用 mutable JSON，需要先引入
`from sqlalchemy.ext.mutable import MutableDict`，否则取消/续传标志可能不会入库。

```python
    fill_progress = Column(MutableDict.as_mutable(JSON), nullable=True, comment="AI 填写进度：{chunk_index, total_chunks, cancelled: bool}")
    partial_fields = Column(MutableDict.as_mutable(JSON), nullable=True, comment="已填写的部分字段结果，续传时合并")
```

同时修改 `status` 列的 comment，添加 `ai_paused`：

```python
    status = Column(
        String(32),
        nullable=False,
        default="uploaded",
        comment="状态：uploaded | parsing | ai_filling | ai_paused | ready | error",
    )
```

- [ ] **Step 2: 生成数据库迁移**

```bash
cd doc-service
alembic revision --autogenerate -m "add fill_progress and partial_fields to documents"
alembic upgrade head
```

- [ ] **Step 3: 验证迁移成功**

```bash
alembic current
```

确认输出包含新 revision。

- [ ] **Step 4: Commit**

```bash
git add doc-service/app/models/document.py doc-service/alembic/versions/
git commit -m "feat: add fill_progress and partial_fields to Document model"
```

---

## Task 2: Schema 变更 — AiFillRequest 加 resume

**Files:**
- Modify: `doc-service/app/schemas/document.py:70-71`

- [ ] **Step 1: 修改 AiFillRequest**

```python
class AiFillRequest(BaseModel):
    job_id: str = Field(description="关联的 job_id，用于查找知识库文件")
    resume: bool = Field(default=False, description="是否断点续传")
```

- [ ] **Step 2: Commit**

```bash
git add doc-service/app/schemas/document.py
git commit -m "feat: add resume flag to AiFillRequest schema"
```

---

## Task 3: LLM 结果校验 — 过滤占位符

**Files:**
- Modify: `doc-service/app/services/llm_service.py`

- [ ] **Step 1: 添加校验函数和修改 match_fields**

在 `LLMService` 类中添加 `_validate_value` 静态方法，并修改 `match_fields` 的合并逻辑使用校验：

```python
# 文件顶部常量区，USER_PROMPT_TEMPLATE 之后添加：
PLACEHOLDER_VALUES = {"无", "n/a", "暂无", "待定", "-", "null", "undefined", "xxx", "n/a", "暂无信息"}


class LLMCallError(Exception):
    """LLM 调用失败（API/网络错误）。"""
    pass

class LLMResponseError(Exception):
    """LLM 返回内容异常（非 JSON / 字段 ID 不匹配）。"""
    pass


class LLMService:
    # ... 现有 __init__ 不变 ...

    def _call_llm(self, fields_json: str, chunk: str) -> dict[str, str]:
        """调用 LLM 并返回字段结果。

        Raises:
            LLMCallError: API/网络调用失败。
            LLMResponseError: 返回内容非 JSON 或字段 ID 不匹配。
        """
        # ... 现有实现 ...
        pass

    @staticmethod
    def _validate_value(value: str) -> str:
        """校验 LLM 返回值，过滤空值和占位符。"""
        if not value or len(value.strip()) <= 1:
            return ""
        stripped = value.strip()
        if stripped.lower() in {v.lower() for v in PLACEHOLDER_VALUES}:
            return ""
        return stripped

    def match_fields(
        self,
        fields: list[TemplateField],
        knowledge_text: str,
        on_chunk_done: callable | None = None,
    ) -> dict[str, str]:
        """从知识库文本中匹配字段值。

        Args:
            fields: 待填充的模板字段列表。
            knowledge_text: 合并后的知识库文本。
            on_chunk_done: 可选回调，每个 chunk 完成后调用 (chunk_index, total_chunks, current_result)。
        """
        if not fields:
            return {}

        fields_json = json.dumps(
            [{"id": f.id, "label": f.label, "context": f.original_text} for f in fields],
            ensure_ascii=False,
            indent=2,
        )

        chunks = self._split_text(knowledge_text)
        merged_result: dict[str, str] = {f.id: "" for f in fields}

        for i, chunk in enumerate(chunks):
            chunk_result = self._call_llm(fields_json, chunk)
            for field_id, value in chunk_result.items():
                validated = self._validate_value(value)
                if validated and field_id in merged_result:
                    merged_result[field_id] = validated
            if on_chunk_done:
                on_chunk_done(i, len(chunks), dict(merged_result))

        return merged_result
```

> **重要**：本旧计划仅作为代码复用参考。若在旧 `doc-service` 中实施，应优先扩展 `match_fields`
> 让它返回可迭代的 chunk 结果或暴露明确的 public chunk API；不要在端点层直接调用 `_call_llm`
> 私有方法。若采用 Plan 3 的独立 `docfill` 方向，则以 `ai_filler.py` 的 public `fill_stream`
> 为准。

- [ ] **Step 2: Commit**

```bash
git add doc-service/app/services/llm_service.py
git commit -m "feat: add LLM result validation and chunk callback"
```

---

## Task 4: SSE 流式端点 + 取消端点

**Files:**
- Modify: `doc-service/app/api/v1/documents.py`

> **重构提醒**：当前 `generate()` 函数超 200 行，混合了业务逻辑、数据库操作和 SSE 格式化。
> 实现时应拆分为：
> - `_sse_event()` — SSE 格式化辅助函数
> - `_do_extract()` — 提取知识库文本阶段
> - `_do_analyze()` — 分析字段阶段
> - `_do_llm_chunks()` — LLM chunk 处理循环
> - `_do_fill_and_save()` — 填充模板 + 保存记录
> 主 `generate()` 函数仅编排阶段调用和 yield SSE 事件。

- [ ] **Step 1: 修改 AiFillRequest import（已在 Task 2 完成 schema 修改）**

在文件顶部已有的 import 中确认 `AiFillRequest` 包含 `resume` 字段。

- [ ] **Step 2: 取消标志使用数据库（多 worker 安全）**

不使用内存字典存储取消标志。取消端点直接更新 `Document.fill_progress.cancelled = True`，
SSE 流在每次 chunk 完成后查询数据库检查 `cancelled` 标志。

```python
# 不使用内存 _cancel_flags，改为查询数据库
```

- [ ] **Step 3: 添加取消端点**

在 `ai-fill-stream` 端点之前添加：

```python
@router.post(
    "/{doc_id}/ai-fill-cancel",
    summary="取消 AI 填写",
    description="设置取消标志，SSE 流在下一个 chunk 完成后停止",
)
async def cancel_ai_fill(
    doc_id: str,
    db: Session = Depends(get_db),
):
    """取消 AI 填写"""
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"文档不存在: {doc_id}")

    doc.fill_progress = {**(doc.fill_progress or {}), "cancelled": True}
    db.commit()
    return {"message": "取消请求已提交，AI 将在当前步骤完成后暂停"}
```

- [ ] **Step 4: 重写 ai-fill-stream 端点**

替换现有的 `trigger_ai_fill_stream` 函数：

```python
@router.post(
    "/{doc_id}/ai-fill-stream",
    summary="AI 填写（SSE 流式进度）",
    description="返回 Server-Sent Events 流，实时推送 AI 填写各阶段进度，支持断点续传",
)
async def trigger_ai_fill_stream(
    doc_id: str,
    body: AiFillRequest = Body(...),
    db: Session = Depends(get_db),
):
    """AI 填写 SSE 流式接口"""
    # 预检验证
    doc = db.query(Document).filter(Document.id == doc_id).first()
    if not doc:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"文档不存在: {doc_id}")
    if doc.doc_type != "business_template":
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="只能对商务文件执行 AI 填写")

    job_id = body.job_id
    bid_sources = (
        db.query(Document)
        .filter(Document.job_id == job_id, Document.doc_type == "bid_source")
        .all()
    )
    if not bid_sources:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="请先上传招标文件")

    valid_paths = [b.file_path for b in bid_sources if b.file_path and os.path.exists(b.file_path)]
    if not valid_paths:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="招标文件路径无效，请重新上传")

    template_file_path = doc.file_path
    template_outline = doc.outline
    template_filename = doc.original_filename
    resume = body.resume

    # 清除之前的取消标志（数据库中）
    doc.fill_progress = None if not resume else doc.fill_progress
    if doc.fill_progress:
        doc.fill_progress = {**doc.fill_progress, "cancelled": False}

    def generate():
        gen_db = SessionLocal()
        # 注意：在 SSE generator 中无法使用 FastAPI 依赖注入（get_db() 是 generator，
        # next() 只执行到第一个 yield，finally 块不会执行），必须用 SessionLocal() 手动创建会话。
        try:
            # === 续传逻辑：读取已有进度 ===
            start_chunk = 0
            merged_result: dict[str, str] = {}
            template_fields = None

            if resume and doc.fill_progress:
                progress = doc.fill_progress
                start_chunk = progress.get("chunk_index", 0)
                merged_result = doc.partial_fields or {}
                # 清除取消标志（续传时清除，不在 SSE 流中清除，避免连续取消请求丢失）
                if doc.fill_progress:
                    doc.fill_progress = {**doc.fill_progress, "cancelled": False}
                    gen_db.commit()
                # 重新分析字段（必须与之前一致）
                # 风险：续传时重新分析字段依赖字段 ID 稳定性。如果 OnlyOffice 回调
                # 在 ai_filling 期间修改了模板文件，字段 ID 可能变化导致 partial_fields
                # 无法匹配。缓解：在 ai_filling 状态下 OnlyOffice 应设为只读模式，
                # 防止回调覆盖模板文件。
                analyzer = TemplateAnalyzer()
                template_fields = analyzer.analyze(template_file_path)
                yield _sse_event({
                    "step": "resume",
                    "message": f"从 chunk {start_chunk + 1} 继续...",
                    "percent": progress.get("percent", 30),
                })
            else:
                # 清除旧进度
                doc.fill_progress = None
                doc.partial_fields = None
                doc.status = "ai_filling"
                gen_db.merge(doc)
                gen_db.commit()

            # 阶段 1: 提取招标文件文本（续传时跳过）
            if not resume:
                yield _sse_event({"step": "extract", "message": "正在提取招标文件文本...", "percent": 10})

                knowledge_extractor = KnowledgeExtractor()
                knowledge_text = knowledge_extractor.extract_text(valid_paths)

                if not knowledge_text.strip():
                    yield _sse_event({"step": "error", "message": "招标文件中未提取到有效文本", "percent": 100})
                    return

                char_count = len(knowledge_text)
                yield _sse_event({
                    "step": "extract_done",
                    "message": f"文本提取完成（{char_count} 字符）",
                    "percent": 25,
                })

                # 阶段 2: 分析商务模板字段
                yield _sse_event({"step": "analyze", "message": "正在分析商务模板字段...", "percent": 30})

                analyzer = TemplateAnalyzer()
                template_fields = analyzer.analyze(template_file_path)

                if not template_fields:
                    yield _sse_event({"step": "error", "message": "商务文件中未识别到待填字段", "percent": 100})
                    return

                yield _sse_event({
                    "step": "analyze_done",
                    "message": f"识别到 {len(template_fields)} 个待填字段",
                    "percent": 40,
                })
            else:
                # 续传时仍需提取文本（供 LLM 使用）
                knowledge_extractor = KnowledgeExtractor()
                knowledge_text = knowledge_extractor.extract_text(valid_paths)

            # 阶段 3: LLM 匹配字段值（chunk 级进度）
            llm_service = LLMService()
            chunks = llm_service._split_text(knowledge_text)
            total_chunks = len(chunks)

            # 初始化 merged_result（新流程时）
            if not resume:
                merged_result = {f.id: "" for f in template_fields}

            llm_start_percent = 45
            llm_end_percent = 75
            llm_range = llm_end_percent - llm_start_percent

            # 逐 chunk 调用 LLM，手动控制循环以支持取消
            # 注意：不要直接调用 _call_llm 私有方法。这里应先将 llm_service 扩展出
            # public iter_chunk_matches(...)，由它负责 chunk 调用、校验和合并；端点只负责
            # SSE 输出、取消检查和持久化进度。
            for chunk_idx in range(start_chunk, total_chunks):
                # 检查取消标志
                # 查询数据库检查取消标志
                _check_doc = gen_db.query(Document).filter(Document.id == doc_id).first()
                if _check_doc and _check_doc.fill_progress and _check_doc.fill_progress.get("cancelled"):
                    # 保存当前进度
                    paused_doc = gen_db.query(Document).filter(Document.id == doc_id).first()
                    if paused_doc:
                        paused_doc.status = "ai_paused"
                        paused_doc.fill_progress = {
                            "chunk_index": chunk_idx,
                            "total_chunks": total_chunks,
                            "percent": llm_start_percent + int(chunk_idx / total_chunks * llm_range),
                        }
                        paused_doc.partial_fields = merged_result
                        gen_db.commit()
                    # 不清除 cancelled 标志——续传请求到达时才清除，避免连续取消请求丢失
                    yield _sse_event({
                        "step": "cancelled",
                        "message": "AI 填写已暂停",
                        "percent": llm_start_percent + int(chunk_idx / total_chunks * llm_range),
                    })
                    return

                yield _sse_event({
                    "step": "llm_chunk",
                    "message": f"AI 匹配中 ({chunk_idx + 1}/{total_chunks})...",
                    "percent": llm_start_percent + int(chunk_idx / total_chunks * llm_range),
                })

                chunk_result = llm_service._call_llm(
                    json.dumps(
                        [{"id": f.id, "label": f.label, "context": f.original_text} for f in template_fields],
                        ensure_ascii=False,
                        indent=2,
                    ),
                    chunks[chunk_idx],
                )
                for field_id, value in chunk_result.items():
                    validated = LLMService._validate_value(value)
                    if validated and field_id in merged_result:
                        merged_result[field_id] = validated

                # 保存中间结果
                save_doc = gen_db.query(Document).filter(Document.id == doc_id).first()
                if save_doc:
                    save_doc.fill_progress = {
                        "chunk_index": chunk_idx + 1,
                        "total_chunks": total_chunks,
                        "percent": llm_start_percent + int((chunk_idx + 1) / total_chunks * llm_range),
                    }
                    save_doc.partial_fields = merged_result
                    gen_db.commit()

            filled_count = sum(1 for v in merged_result.values() if v)
            yield _sse_event({
                "step": "llm_done",
                "message": f"AI 匹配完成，成功填写 {filled_count}/{len(template_fields)} 个字段",
                "percent": llm_end_percent,
            })

            # 阶段 4: 填充模板
            yield _sse_event({"step": "fill", "message": "正在生成填写后的文档...", "percent": 80})

            filler = TemplateFiller()
            field_registry = {f.id: f for f in template_fields}
            try:
                filled_path = filler.fill(
                    template_path=template_file_path,
                    field_values=merged_result,
                    field_registry=field_registry,
                    output_dir=str(settings.processed_dir),
                )
            except Exception as e:
                yield _sse_event({"step": "error", "message": f"文档填充失败: {e}", "percent": 100})
                return

            # 阶段 5: 保存记录
            yield _sse_event({"step": "save", "message": "正在保存...", "percent": 90})

            new_filled_doc_id = str(uuid.uuid4())
            response_fields = []
            for tf in template_fields:
                value = merged_result.get(tf.id, "")
                response_fields.append({
                    "id": tf.id,
                    "label": tf.label,
                    "value": value,
                    "status": "filled" if value else "empty",
                })

            filled_doc = Document(
                id=new_filled_doc_id,
                job_id=job_id,
                doc_type="filled_template",
                original_filename=f"filled_{template_filename}",
                file_path=filled_path,
                status="ready",
                parent_doc_id=doc_id,
            )

            try:
                parsed = word_parser.parse_word_document(filled_path)
                filled_doc.outline = parsed["outline"]
            except Exception:
                filled_doc.outline = template_outline

            filled_doc.fields = response_fields
            gen_db.add(filled_doc)

            # 清除原始模板的进度数据
            original_doc = gen_db.query(Document).filter(Document.id == doc_id).first()
            if original_doc:
                original_doc.status = "ready"
                original_doc.fill_progress = None
                original_doc.partial_fields = None
            gen_db.commit()

            # 完成
            yield _sse_event({
                "step": "done",
                "message": f"AI 填写完成，共填写 {filled_count} 个字段",
                "percent": 100,
                "filled_doc_id": new_filled_doc_id,
                "fields": response_fields,
            })

        except LLMCallError as e:
            logger.error("AI 填写 LLM 调用失败: %s", e)
            yield _sse_event({"step": "error", "message": f"AI 服务调用失败: {e}", "percent": 100})
        except json.JSONDecodeError as e:
            logger.error("AI 填写 LLM 返回解析失败: %s", e)
            yield _sse_event({"step": "error", "message": "AI 返回格式异常", "percent": 100})
        except Exception as e:
            logger.exception("AI 填写未知异常")
            yield _sse_event({"step": "error", "message": f"AI 填写异常: {e}", "percent": 100})
        finally:
            gen_db.close()
            # 确保数据库会话始终关闭，避免连接泄露

    return StreamingResponse(
        generate(),
        media_type="text/event-stream",
        headers={"Cache-Control": "no-cache", "Connection": "keep-alive", "X-Accel-Buffering": "no"},
    )
```

- [ ] **Step 5: 验证端点可访问**

```bash
cd doc-service
python -c "from app.api.v1.documents import router; print('OK')"
```

- [ ] **Step 6: Commit**

```bash
git add doc-service/app/api/v1/documents.py
git commit -m "feat: SSE streaming with chunk progress, cancel, and resume support"
```

---

## Task 5: 配置默认模型

**Files:**
- Modify: `doc-service/app/core/config.py:31`

- [ ] **Step 1: 确认默认值**

`llm_model` 默认值已经是 `deepseek-v4-flash`（当前已设置）。`.env` 中也已配置。无需变更。

验证：
```bash
cd doc-service
python -c "from app.core.config import settings; print(settings.llm_model)"
```

预期输出：`deepseek-v4-flash`

---

## Task 6: 前端类型更新

**Files:**
- Modify: `frontend/src/types/businessDoc.ts:106-112`

- [ ] **Step 1: 扩展 AiFillStreamEvent 的 step 类型**

```typescript
export type AiFillStep =
  | 'extract' | 'extract_done'
  | 'analyze' | 'analyze_done'
  | 'llm' | 'llm_chunk' | 'llm_done'
  | 'fill' | 'save'
  | 'done' | 'error'
  | 'cancelled' | 'resume';

export interface AiFillStreamEvent {
  step: AiFillStep;
  message: string;
  percent: number;
  filled_doc_id?: string;
  fields?: DocField[];
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/types/businessDoc.ts
git commit -m "feat: add AiFillStep type union for SSE events"
```

---

## Task 7: 前端 SSE 服务 + 取消接口

**Files:**
- Modify: `frontend/src/services/businessDoc.ts`

- [ ] **Step 1: 修改 triggerAiFillStream 支持 resume 参数**

将 `triggerAiFillStream` 的签名改为：

```typescript
export async function triggerAiFillStream(
  docId: string,
  jobId: string,
  onProgress: (event: AiFillStreamEvent) => void,
  resume = false,
): Promise<AiFillStreamEvent> {
```

在 fetch 的 body 中添加 `resume`：

```typescript
    body: JSON.stringify({ job_id: jobId, resume }),
```

- [ ] **Step 2: 添加 cancelAiFill 函数**

```typescript
/**
 * 取消 AI 填写
 * 后端：POST /doc-api/documents/{doc_id}/ai-fill-cancel
 */
export async function cancelAiFill(docId: string): Promise<{ message: string }> {
  return request(`${BASE}/${docId}/ai-fill-cancel`, { method: 'POST' });
}
```

- [ ] **Step 3: 更新导出**

在文件顶部的 import 中确认 `AiFillStreamEvent` 已导入。在文件底部的函数导出中确认 `cancelAiFill` 可被导入。

- [ ] **Step 4: Commit**

```bash
git add frontend/src/services/businessDoc.ts
git commit -m "feat: add resume param to SSE stream and cancelAiFill API"
```

---

## Task 8: 前端页面 — 按钮状态机 + SSE 调用 + OnlyOffice 切换

**Files:**
- Modify: `frontend/src/pages/bidding/businessDoc/index.tsx`

- [ ] **Step 1: 添加 aiFillState 状态**

在现有 state 区域替换 `aiFilling` 为状态机：

```typescript
  // AI 填写状态机: idle → filling → paused → done
  const [aiFillState, setAiFillState] = useState<'idle' | 'filling' | 'paused' | 'done'>('idle');
```

- [ ] **Step 2: 修改 import — 替换 triggerAiFill 为 triggerAiFillStream + cancelAiFill**

```typescript
import {
  USE_MOCK,
  confirmFields,
  getDocumentStatus,
  triggerAiFillStream,
  cancelAiFill,
  uploadBidDoc,
  uploadBusinessTemplate,
  updateField,
  listDocuments,
  deleteDocument,
} from '@/services/businessDoc';
```

- [ ] **Step 3: 重写 handleAiFill 使用 SSE**

替换现有的 `handleAiFill` 函数：

```typescript
  // AI 填写：SSE 流式 + 取消/继续
  const handleAiFill = async (resume = false) => {
    if (!bizDocId || !jobId) {
      message.warning('请先上传商务文件和招标文件');
      return;
    }
    if (bidFiles.length === 0) {
      message.warning('请先上传招标文件');
      return;
    }
    if (aiFillState === 'filling') return;

    setAiFillState('filling');
    setUploadProgress({ filename: fileName, percent: resume ? 30 : 10, statusText: resume ? '继续 AI 填写...' : 'AI 正在分析...' });

    try {
      const lastEvent = await triggerAiFillStream(
        bizDocId,
        jobId,
        (event) => {
          // 实时更新进度
          setUploadProgress({
            filename: fileName,
            percent: event.percent,
            statusText: event.message,
          });

          if (event.step === 'done') {
            setFields(event.fields ?? []);
            if (event.filled_doc_id) {
              // 更新 docId 为填写后的文档，OnlyOffice 自动切换
              setDocId(event.filled_doc_id);
              updateUrlWithDocId(event.filled_doc_id);
            }
            setAiFillState('done');
            setUploadProgress(null);
            message.success(event.message || 'AI 填写完成');
          } else if (event.step === 'cancelled') {
            setAiFillState('paused');
            setUploadProgress(null);
            message.info('AI 填写已暂停，可点击继续');
          } else if (event.step === 'error') {
            setAiFillState('idle');
            setUploadProgress(null);
            message.error(event.message || 'AI 填写失败');
          }
        },
        resume,
      );

      // 兜底：如果流结束但没有收到 done/cancelled/error
      if (lastEvent && !['done', 'cancelled', 'error'].includes(lastEvent.step)) {
        setAiFillState('idle');
        setUploadProgress(null);
      }
    } catch (error: any) {
      console.error('AI fill stream failed:', error);
      setAiFillState('idle');
      setUploadProgress(null);
      message.error(error?.message || 'AI 填写失败');
    }
  };

  // 取消 AI 填写
  const handleAiFillCancel = async () => {
    if (!bizDocId) return;
    try {
      await cancelAiFill(bizDocId);
      message.info('取消请求已提交...');
    } catch (error: any) {
      message.error(error?.message || '取消失败');
    }
  };
```

- [ ] **Step 4: 更新 AiFieldPanel 的 props**

替换 `<AiFieldPanel` 的 `onConfirm` 和 `confirmLoading`：

```typescript
              <AiFieldPanel
                fields={fields}
                filter={fieldFilter}
                onFilterChange={setFieldFilter}
                editingFieldId={editingFieldId}
                editingValue={editingValue}
                onEditStart={handleEditStart}
                onEditChange={setEditingValue}
                onEditSave={handleEditSave}
                onAiFill={() => handleAiFill(false)}
                onAiFillCancel={handleAiFillCancel}
                onAiFillResume={() => handleAiFill(true)}
                aiFillState={aiFillState}
              />
```

- [ ] **Step 5: Commit**

```bash
git add frontend/src/pages/bidding/businessDoc/index.tsx
git commit -m "feat: SSE streaming AI fill with cancel/resume state machine"
```

---

## Task 9: AiFieldPanel — 按钮状态文案

**Files:**
- Modify: `frontend/src/pages/bidding/businessDoc/components/AiFieldPanel/index.tsx`

- [ ] **Step 1: 更新 props 接口**

```typescript
interface AiFieldPanelProps {
  fields: DocField[];
  filter: 'all' | 'filled' | 'empty';
  onFilterChange: (filter: 'all' | 'filled' | 'empty') => void;
  editingFieldId?: string;
  editingValue?: string;
  onEditStart: (field: DocField) => void;
  onEditChange: (value: string) => void;
  onEditSave: (fieldId: string) => void;
  onAiFill: () => void;
  onAiFillCancel: () => void;
  onAiFillResume: () => void;
  aiFillState: 'idle' | 'filling' | 'paused' | 'done';
}
```

- [ ] **Step 2: 更新组件解构和按钮渲染**

```typescript
const AiFieldPanel: React.FC<AiFieldPanelProps> = ({
  fields: propFields,
  filter,
  onFilterChange,
  editingFieldId,
  editingValue = '',
  onEditStart,
  onEditChange,
  onEditSave,
  onAiFill,
  onAiFillCancel,
  onAiFillResume,
  aiFillState,
}) => {
  const fields = propFields.length > 0 ? propFields : MOCK_FIELDS;
  const visibleFields = filter === 'all' ? fields : fields.filter((item) => item.status === filter);

  // 按钮状态机
  const renderAiButton = () => {
    switch (aiFillState) {
      case 'filling':
        return (
          <Button danger size="small" className={styles.confirmButton} onClick={onAiFillCancel}>
            取消填写
          </Button>
        );
      case 'paused':
        return (
          <Button type="primary" size="small" className={styles.confirmButton} onClick={onAiFillResume}>
            继续填写
          </Button>
        );
      case 'idle':
      case 'done':
      default:
        return (
          <Button type="primary" size="small" className={styles.confirmButton} onClick={onAiFill}>
            AI 自动填写 <EditOutlined />
          </Button>
        );
    }
  };

  return (
    <aside className={styles.panel}>
      <div className={styles.header}>
        {filterOptions.map((option) => (
          <button
            key={option.key}
            type="button"
            className={`${styles.filterButton} ${option.key === filter ? styles.filterButtonActive : ''}`}
            onClick={() => onFilterChange(option.key)}
          >
            {option.label}
          </button>
        ))}
        {renderAiButton()}
      </div>

      <div className={styles.list}>
        {/* 字段列表保持不变 */}
        {visibleFields.map((field) => {
          const isEditing = editingFieldId === field.id;
          return (
            <article key={field.id} className={styles.fieldCard}>
              <div className={styles.fieldHead}>
                <span className={styles.fieldLabel}>{field.label}</span>
                <span className={`${styles.statusTag} ${field.status === 'filled' ? styles.statusFilled : styles.statusEmpty}`}>
                  {field.status === 'filled' ? '已填写' : '待填写'}
                </span>
              </div>
              {isEditing ? (
                <div className={styles.editRow}>
                  <input
                    value={editingValue}
                    onChange={(e) => onEditChange(e.target.value)}
                    className={styles.input}
                  />
                  <button type="button" className={styles.saveButton} onClick={() => onEditSave(field.id)}>
                    保存
                  </button>
                </div>
              ) : (
                <button type="button" className={styles.valueButton} onClick={() => onEditStart(field)}>
                  {field.value || '点击填写内容'}
                </button>
              )}
            </article>
          );
        })}
      </div>
    </aside>
  );
};
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/pages/bidding/businessDoc/components/AiFieldPanel/index.tsx
git commit -m "feat: AiFieldPanel button state machine for fill/cancel/resume"
```

---

## Task 10: 端到端验证

- [ ] **Step 1: 启动后端**

```bash
cd doc-service
uvicorn app.main:app --reload --port 8001
```

- [ ] **Step 2: 启动前端**

```bash
cd frontend
npm run dev
```

- [ ] **Step 3: 验证流程**

1. 上传商务模板 → OnlyOffice 预览正常
2. 上传招标文件 → 列表显示
3. 点击「AI 自动填写」→ 进度条实时更新，显示 chunk 进度
4. 等待完成 → OnlyOffice 切换到填写后的文档
5. 刷新页面 → 状态恢复
6. 重新填写 → 再次点击正常工作

- [ ] **Step 4: 验证取消/续传**

1. 点击「AI 自动填写」→ 立即点击「取消填写」
2. 进度条消失，按钮变为「继续填写」
3. 点击「继续填写」→ 从上次 chunk 继续

- [ ] **Step 5: 最终 Commit**

```bash
git add -A
git commit -m "feat: complete AI fill optimization with SSE, cancel/resume, validation"
```
