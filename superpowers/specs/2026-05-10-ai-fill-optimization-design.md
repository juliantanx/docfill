# AI 填写流程优化设计

## 背景

当前 AI 自动填写存在以下问题：
1. **等待时间过长** — glm-5 模型单次 chunk（30000 字符）调用需 121 秒，3 个 chunk 合计 6+ 分钟
2. **LLM 返回空值** — API Key 未配置时静默返回空结果，用户无感知
3. **填写质量差** — 无结果校验，"无"、"N/A" 等占位符被当作有效值
4. **无法中断** — 点击后无法取消，只能等超时或刷新
5. **结果展示不便** — 填写后在新标签页打开文档，无法在当前页面预览

## 目标

1. 切换到 deepseek-v4-flash 模型，根据初步测试预计速度有显著提升（具体倍数需基准测试验证）
2. SSE 实时推送进度（提取 → 分析 → LLM chunk 进度 → 填充 → 完成）
3. 支持取消和断点续传（chunk 级粒度）
4. 填写结果在当前页面 OnlyOffice 预览
5. LLM 空值和低质量结果给出明确提示

## 设计

### 1. 模型切换

| 配置项 | 旧值 | 新值 |
|--------|------|------|
| LLM_MODEL | glm-5 | deepseek-v4-flash |

配置在 `doc-service/.env`，无需代码变更。

### 2. 数据模型变更

Document 模型新增字段（`doc-service/app/models/document.py`）：

| 字段 | 类型 | 说明 |
|------|------|------|
| fill_progress | JSON | `{chunk_index, total_chunks, filled_field_ids, cancelled: bool}` |
| partial_fields | JSON | 已填写的部分字段结果，续传时合并 |

status 新增值：`ai_paused`（用户取消暂停）

**续传逻辑**：
- LLM 匹配按 chunk 处理，每个 chunk 完成后：
  1. 将新填写的字段合并到 `partial_fields`
  2. 更新 `fill_progress.chunk_index`
  3. 提交数据库
- 取消时：status 设为 `ai_paused`，保存当前进度
- 续传时：从 `fill_progress.chunk_index` 继续，跳过已完成 chunk

### 3. SSE 端点

**流式端点**：`POST /{doc_id}/ai-fill-stream`

请求体新增参数：
```json
{
  "job_id": "xxx",
  "resume": false  // true = 断点续传
}
```

- `resume=false`：从头开始，清除可能存在的 `ai_paused` 中间结果
- `resume=true`：读取 `fill_progress`，从 `chunk_index` 继续

**取消端点**：`POST /{doc_id}/ai-fill-cancel`

- 设置文档的 `fill_progress.cancelled = True`（数据库标志，多 worker 安全）
- SSE 流在下一个 chunk 完成后查询数据库检查标志，停止处理并保存进度
- 返回 `{step: "cancelled", message: "已暂停", percent: 当前进度}`

> **注意**：不可使用内存字典（如 `_cancel_flags`）存储取消标志，因为多 worker 部署（gunicorn/uvicorn multi-worker）下不同进程间不共享内存。

**SSE 事件格式**：
```
data: {"step": "extract", "message": "正在提取招标文件文本...", "percent": 10}
data: {"step": "analyze", "message": "正在分析商务模板字段...", "percent": 30}
data: {"step": "llm_chunk", "message": "AI 匹配中 (3/9)...", "percent": 50}
data: {"step": "fill", "message": "正在生成填写后的文档...", "percent": 80}
data: {"step": "done", "message": "完成", "percent": 100, "filled_doc_id": "...", "fields": [...]}
data: {"step": "cancelled", "message": "已暂停", "percent": 50}
data: {"step": "error", "message": "...", "percent": 100}
```

### 4. 前端交互

**按钮状态机**：

| 状态 | 按钮文案 | 行为 |
|------|---------|------|
| 待填写 | AI 自动填写 | 点击开始（resume=false） |
| 填写中 | 取消 | 点击调用 cancel 端点 |
| 已暂停 | 继续填写 | 点击开始（resume=true） |
| 完成 | AI 自动填写 | 可重新填写 |

**SSE 客户端**（`services/businessDoc.ts`）：
- `triggerAiFillStream(docId, jobId, resume, onProgress)` — 使用 fetch + ReadableStream 读取 SSE
- `cancelAiFill(docId)` — 调用取消端点

**进度展示**：
- UploadProgress 组件显示 SSE 推送的实时进度和文案
- 取消后进度条消失

**填写结果**：
- SSE 返回 done 事件后，用 `filled_doc_id` 切换 OnlyOffice 预览到填写后的文档
- 右侧字段面板同步更新
- `filled_count=0` 时显示："AI 未能从招标文件中匹配到任何字段值，请检查招标文件内容"

### 5. LLM 结果校验

后端对 LLM 返回的值做基本质量校验（`doc-service/app/services/llm_service.py`）：

- 非空
- 长度 > 1
- 不包含占位符：`["无", "N/A", "暂无", "待定", "-", "null", "undefined", "xxx"]`
- 占位符列表应可通过环境变量 `LLM_PLACEHOLDER_VALUES` 配置（逗号分隔），默认值覆盖常见场景
- 校验逻辑抽取为 `LLMService._validate_value()` 静态方法，便于单独测试
- 校验不通过的字段标记为 `empty`

### 6. 错误处理

| 场景 | 处理 |
|------|------|
| LLM API Key 未配置 | SSE 返回 error 事件："LLM 未配置，请联系管理员" |
| LLM 调用超时（单次 > 60s） | 标记该 chunk 为空，继续下一 chunk |
| LLM 返回非 JSON | 重试 1 次，仍失败则标记该 chunk 为空 |
| 招标文件为空 | SSE 返回 error："招标文件中未提取到有效文本" |
| 模板无待填字段 | SSE 返回 error："商务文件中未识别到待填字段" |
| 网络中断 | 前端检测 fetch 异常，提示"网络中断，可点击继续填写" |

### 7. SSE 断连处理

| 场景 | 服务端行为 | 客户端行为 |
|------|-----------|-----------|
| 客户端网络中断 | 继续处理当前 chunk，完成后检查数据库中 `fill_progress`；若客户端未重连，服务端在所有 chunk 完成后正常保存结果 | 检测到 fetch 异常后提示"网络中断，可点击继续填写" |
| 客户端主动取消 | 调用 cancel 端点设置 DB 标志 | 显示暂停状态 |
| 服务端处理超时 | 单 chunk > 60s 超时后标记该 chunk 为空，继续下一 chunk | 正常接收 SSE 事件 |

## 文件变更清单

### 后端（doc-service）
- `app/models/document.py` — 新增 fill_progress、partial_fields 字段
- `app/api/v1/documents.py` — 重写 ai-fill-stream 端点，新增 ai-fill-cancel 端点
- `app/services/llm_service.py` — 新增结果校验逻辑
- `app/core/config.py` — LLM_MODEL 默认值改为 deepseek-v4-flash
  - 新增环境变量 `LLM_PLACEHOLDER_VALUES=无,N/A,暂无,待定,-,null,undefined,xxx`
- `.env` — 更新 LLM_MODEL

### 前端
- `types/businessDoc.ts` — 新增 AiFillStreamEvent 类型（已有）
- `services/businessDoc.ts` — 新增 triggerAiFillStream、cancelAiFill 函数
- `pages/bidding/businessDoc/index.tsx` — 按钮状态机、SSE 客户端调用、OnlyOffice 切换
- `pages/bidding/businessDoc/components/AiFieldPanel/index.tsx` — 按钮支持取消/继续状态
