# AI 商务文件自动填写 — 设计文档

> 日期：2026-05-09
> 状态：评审后修订

## 1. 概述

在 `ai-bidding-assistant` 项目中实现“AI 自动填写商务文件”功能，目标是让用户在现有商务文件页面内完成以下流程：

1. 上传商务文件，并通过 OnlyOffice 预览原始文件。
2. 上传一个或多个招标文件/企业资料作为知识库。
3. 点击“AI 自动填写”，系统基于知识库内容匹配字段值并生成新的已填写 docx。
4. 前端切换到新文档进行预览和继续编辑，同时展示本次 AI 填写结果。

本功能的 MVP 重点是：
- 保留原模板格式；
- 尽量复用现有 `doc-service` 上传、解析、OnlyOffice 能力；
- 先支持同步执行链路；
- 明确能力边界，避免对复杂模板做过度承诺。

---

## 2. 设计目标与非目标

### 2.1 目标

- 支持真实招投标模板中的常见占位形式，而不是自定义 `{{placeholder}}` 模板。
- 支持多个知识库文档联合参与匹配。
- 每次 AI 填写生成一个新的文档记录，不覆盖原模板。
- 填充完成后无缝切换 OnlyOffice 预览对象。
- 在接口和文档模型层面保留后续异步化能力。

### 2.2 非目标

以下内容不在本次 MVP 范围内：
- 不实现异步任务队列或后台作业系统。
- 不保证覆盖所有复杂表格、跨页特殊格式或极端招标模板写法。
- 不实现字段来源追溯、候选值对比或人工审核工作流。
- 不修改 `/backend` 目录中的任何代码。

---

## 3. 核心设计决策

| 决策项 | 选择 | 理由 |
|--------|------|------|
| 架构方案 | `doc-service` 内置 AI 填写链路 | 复用现有文档存储、解析与 OnlyOffice 集成能力 |
| 执行模式 | 同步接口 | 先以最小改动验证业务链路，后续再升级异步 |
| 结果产物 | 创建新文档记录 | 避免覆盖原模板，便于版本切换与问题回退 |
| 知识库关联 | 基于 `job_id` 关联模板与知识库 | 与现有前端页面会话模型兼容，便于多文件上传 |
| 字段发现 | 规则提取 | 字段发现要可控、可测试，避免完全交给 LLM |
| 字段赋值 | LLM 匹配 | 适合从多文档文本中抽取业务字段值 |
| 模板类型 | 真实招标格式 | 贴近业务场景 |

---

## 4. 业务约束与生命周期

### 4.1 `job_id` 约束

`job_id` 是模板与知识库文件的关联主键，MVP 采用以下规则：

- 页面首次进入时由前端生成 `job_id`。
- 上传商务文件和上传招标文件时，前端都必须传入同一个 `job_id`。
- 如果页面是通过已有 `doc_id` 进入，则前端应优先从文档详情中恢复其 `job_id`，而不是重新生成。
- 一个 `job_id` 在本次功能中只服务于一个商务文件上下文；如果用户重新开始新的填写任务，应生成新的 `job_id`。

### 4.2 文档版本约束

- 原始商务文件：`doc_type="business_template"`
- AI 填写生成的新文档：`doc_type="filled_template"`
- 新文档通过 `parent_doc_id` 关联原始商务文件。
- AI 填写不会覆盖原始商务文件，也不会修改原记录。

### 4.3 幂等与重复执行

MVP 允许同一个模板重复执行 AI 填写。

- 每次成功执行都创建一个新的 `filled_template` 文档记录。
- 不尝试复用旧结果，也不做版本去重。
- 前端默认展示本次返回的 `filled_doc_id`。

---

## 5. 整体数据流

```text
用户操作                         API 调用                                 doc-service 内部
─────────                       ───────                                  ────────────────
1. 上传商务文件               POST /upload-business-template            保存商务文件并记录 job_id
2. 预览原文件                 GET /{id}/editor-token                    返回原文件编辑配置
3. 上传招标文件（多个）       POST /upload-bid-source (x N)             保存知识库文件并记录 job_id
4. 点击 AI 自动填写           POST /{template_id}/ai-fill               触发 AI 填充主流程
5. 切换到新文档               GET /{filled_doc_id}/editor-token         获取新文档编辑配置
6. 用户继续编辑               OnlyOffice 原生编辑                        基于 filled_template 工作
```

### 5.1 AI 填写主流程

```text
POST /{template_id}/ai-fill
  1. 校验商务文件存在且类型为 business_template
  2. 根据请求体中的 job_id 查询同一会话下的 bid_source 文档
  3. 过滤无效文件路径，提取知识库文本
  4. 解析模板，识别可填字段
  5. 调用 LLM 匹配字段值
  6. 使用填充引擎生成新的 docx 文件
  7. 创建 filled_template 文档记录
  8. 生成新的 onlyoffice_doc_key
  9. 返回 filled_doc_id 与字段结果
```

---

## 6. API 设计

### 6.1 修改：`POST /{doc_id}/ai-fill`

请求体：

```json
{
  "job_id": "job-uuid"
}
```

约束：
- `doc_id` 必须是商务文件文档 ID。
- `job_id` 为必填，用于关联知识库文档。

响应示例：

```json
{
  "status": "done",
  "message": "AI 填写完成，共填写 18 个字段",
  "fields": [
    {"id": "f1", "label": "投标人名称", "value": "重庆信科通信工程有限公司", "status": "filled"},
    {"id": "f2", "label": "法定代表人", "value": "肖海秋", "status": "filled"},
    {"id": "f3", "label": "质保期", "value": "", "status": "empty"}
  ],
  "filled_doc_id": "uuid-of-new-doc"
}
```

### 6.2 修改：`POST /upload-business-template`

- 增加 `job_id` multipart form 字段。
- 前端应始终传入 `job_id`。
- 后端保存商务文件记录时写入 `job_id`，供页面恢复与后续校验使用。

### 6.3 修改：`POST /upload-bid-source`

- 增加 `job_id` multipart form 字段。
- 允许同一 `job_id` 下上传多个知识库文件。

### 6.4 兼容性说明

本次不新增资源路径，但会扩展已有接口的请求参数与返回字段。前后端需要同步上线。

---

## 7. 数据模型变更

### 7.1 `Document` 模型

新增字段：

- `parent_doc_id: Optional[str]`

用途：
- 仅用于 `filled_template` 记录反向关联原始商务文件。

### 7.2 AI 填写请求/响应

新增或调整：

- `AiFillRequest.job_id`
- `AiFillResponse.filled_doc_id`

### 7.3 字段结果结构

AI 返回的字段项沿用现有字段展示结构，最少包含：
- `id`
- `label`
- `value`
- `status`

是否直接复用现有 `DocField` 结构，必须以当前仓库中的 schema 为准；如果现有结构不兼容，应新增 AI 专用响应项类型，而不是强行复用。

---

## 8. 模板分析与字段识别

### 8.1 支持的模板格式（MVP）

| 格式类型 | 示例 | 说明 |
|---------|------|------|
| 方括号占位符 | `【XX 公司[投标人名称]】` | 明确的占位模式，优先支持 |
| 标签后空白 | `投标人名称：________` | 支持下划线、连续空格等形式 |
| 行内括号占位 | `（投标人名称）` | 作为启发式支持，不保证覆盖所有场景 |
| 表格空单元格 | 左侧标签、右侧空值单元格 | 先支持两列或近似两列结构 |
| 组合行 | `项目名称：____招标编号：____` | 允许一行多个字段 |

### 8.2 明确不承诺的场景

MVP 不保证正确识别以下复杂结构：
- 多级嵌套表头
- 大量合并单元格后的语义推断
- 依赖上下文理解才能判断标签含义的复杂空表格
- 跨页分裂的字段占位结构

### 8.3 `TemplateField` 结构

```python
@dataclass
class TemplateField:
    id: str
    label: str
    field_type: str      # bracket | blank | table_cell | inline_paren
    location: str        # 仅在本次分析-填充流程内有效
    original_text: str
```

说明：
- `location` 是本次流程内的临时定位信息，不作为长期稳定协议。
- `original_text` 用于 LLM 理解上下文，也用于填充引擎做局部替换。

### 8.4 分析策略

字段识别采用“两阶段”方案：

1. **规则提取**：`TemplateAnalyzer` 从商务文件中识别候选字段。
2. **值匹配**：`LLMService` 只负责从知识库文本中为这些字段找到值，不负责发现新字段。

这样可以把字段发现控制在可测试、可回归的规则内。

---

## 9. LLM 调用与知识库处理

### 9.1 接入方式

复用 OpenAI SDK 兼容调用方式，但实际 `base_url` 与模型名应以百度千帆当前可用的兼容接口为准，在实现前必须通过真实调用样例验证。

环境变量：

```env
LLM_BASE_URL=<qianfan-openai-compatible-base-url>
LLM_API_KEY=<your-api-key>
LLM_MODEL=glm-5
```

### 9.2 知识库提取

`KnowledgeExtractor` 负责从多个 docx 中提取文本：
- 提取非空段落文本；
- 提取表格文本，并保留基本的行列可读性；
- 提取结果中保留文件边界，便于 LLM 利用来源上下文。

### 9.3 分段策略

当知识库文本过长时：
- 先按文件边界分段；
- 单文件仍过长时再在文件内部切块；
- 每次都传入完整字段列表；
- 合并结果时优先保留第一个可信非空值，避免后续片段随意覆盖已匹配结果。

### 9.4 错误语义

需要区分：
- LLM 接口调用失败；
- LLM 返回为空；
- LLM 返回非 JSON；
- 返回了未知字段 ID。

这些异常不应被统一吞掉，否则不利于定位问题。

---

## 10. 文档填充引擎

### 10.1 设计原则

`TemplateFiller` 基于现有 `fill_template.py` 思路实现，核心原则：
- 尽量在 run 级别替换，保留原始格式；
- 不直接覆盖原模板文件；
- 对空值字段跳过填充；
- 对无法替换的单个字段允许记录 warning，但不直接破坏整份文档。

### 10.2 核心能力

| 函数 | 用途 |
|------|------|
| `replace_in_para()` | 跨 run 替换，占位文本保留格式 |
| `fill_blank_after_label_anywhere()` | 标签后空白填充 |
| `set_cell_text()` | 表格单元格填充 |
| `get_unique_cells()` | 合并单元格去重 |

### 10.3 范围说明

MVP 至少覆盖：
- 正文段落；
- 表格内段落；
- 必要时补充页眉页脚支持，但是否实现应基于现有模板样本验证后决定。

---

## 11. OnlyOffice 刷新机制

AI 填充完成后的切换规则：

1. 创建新 `filled_template` 文档记录。
2. 为新文档生成新的 `onlyoffice_doc_key`，不能复用原模板的 key。
3. 接口返回 `filled_doc_id`。
4. 前端将当前页面的 `docId` 切换到 `filled_doc_id`。
5. 前端重新拉取新文档的 editor token / 文档状态 / 字段信息。
6. 依赖 `docId` 或 `docKey` 的编辑器实例必须被销毁并重新创建。

注意：OnlyOffice 刷新不应只依赖本地字段状态更新，必须以新文档记录为核心切换对象。

---

## 12. 前端交互设计

### 12.1 上传阶段

- 上传商务文件时附带 `job_id`。
- 上传招标文件时允许多文件选择，并逐个上传到同一 `job_id`。

### 12.2 AI 填写阶段

- 点击“AI 自动填写”后进入 loading 状态。
- 成功后：
  - 更新当前 `docId`；
  - 刷新 OnlyOffice 商务文件；
  - 更新字段面板；
  - 提示成功信息。
- 失败后：
  - 保持当前预览商务文件不变；
  - 恢复到可继续操作的页面状态；
  - 显示错误提示。

### 12.3 状态约束

失败时不能把页面强制设为已填写态；应保留原有可恢复状态。

---

## 13. 错误处理

| 阶段 | 可能错误 | 处理方式 |
|------|---------|---------|
| 模板校验 | 文档不存在 / 类型错误 | 返回 404 / 400 |
| 知识库查询 | `job_id` 下无有效知识库 | 返回 400，提示先上传招标文件 |
| 知识库提取 | 单个文件损坏 | 多文件场景可跳过并记录 warning；若无任何有效文本则返回错误 |
| 模板分析 | 无可识别字段 | 返回 `fields=[]` 与提示信息，不创建新文档 |
| LLM 调用 | 超时 / 接口失败 | 明确返回 error，不伪装成空结果 |
| LLM 解析 | 非法 JSON / 字段 ID 异常 | 可重试 1 次，仍失败则返回 error |
| 文档填充 | 文件生成失败 | 不创建新文档记录，保留原模板 |
| DB 写入 | 创建 filled 文档失败 | 清理已生成文件，避免孤儿文件 |

---

## 14. 环境变量

提交到 git 的 `.env.example` 至少包含：

```env
# LLM
LLM_BASE_URL=<qianfan-openai-compatible-base-url>
LLM_API_KEY=
LLM_MODEL=glm-5

# OnlyOffice
ONLYOFFICE_URL=http://localhost:8080
ONLYOFFICE_JWT_SECRET=onlyoffice-jwt-secret

# Service
DOC_SERVICE_PORT=8001
DOC_SERVICE_HOST=0.0.0.0
HOST_URL=http://host.docker.internal:8001

# Database
DATABASE_URL=sqlite:///./doc_service.db
```

说明：
- `.env` 不提交到 git；
- 真实 API Key 仅存在本地环境；
- 变量名统一使用 `ONLYOFFICE_JWT_SECRET`，避免与旧命名混用。

---

## 15. 文件变更范围

### 15.1 `doc-service` 新增

```text
doc-service/
  .env.example
  app/services/
    template_analyzer.py
    knowledge_extractor.py
    llm_service.py
    template_filler.py
  docs/
    fill-template-workflow.md
  tests/
    ...
```

### 15.2 `doc-service` 修改

```text
doc-service/
  app/core/config.py
  app/models/document.py
  app/schemas/document.py
  app/api/v1/documents.py
```

### 15.3 前端修改

```text
frontend/
  src/types/businessDoc.ts
  src/services/businessDoc.ts
  src/pages/bidding/businessDoc/index.tsx
```

---

## 16. 实施约束

- `/Users/tjh/WebstormProjects/ai-bidding-assistant/backend` 目录不可修改。
- 所有开发应在新分支上进行。
- 填充引擎参考 `fill_template.py` 的工作流，但文档中不写死个人机器绝对路径。
- 测试必须满足项目规范中的 TDD 流程与覆盖率要求。
- 测试夹具不得通过运行测试污染仓库内现有二进制文件。
