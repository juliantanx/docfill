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
{text}

待填字段列表（JSON 数组，每项含 id 和 label）：
{fields_json}

请逐字段返回，每行一个 JSON，格式：
{{"id": "f1", "value": "填写内容"}}

如无法从参考文档中确定该字段值，返回：{{"id": "f1", "value": ""}}
只返回 JSON 行，不要其他文字。"""

_NO_REF_SYSTEM = "你是一个智能文档填写助手，能够分析文档内容并自动填写字段。"

_NO_REF_USER = """文档全文：
{text}

待填字段列表（JSON 数组，每项含 id 和 label）：
{fields_json}

请分析并填写每个字段：
- 知识性内容（题目、问答、填空题）：直接给出答案
- 个人信息字段（姓名、单位、公司、地址、电话、日期、联系方式等）：
  返回 {{"id": "...", "value": "", "requires_input": true}}

每行返回一个 JSON：
{{"id": "f1", "value": "答案"}}
只返回 JSON 行，不要其他文字。"""

PLACEHOLDER_VALUES = {"无", "n/a", "暂无", "待定", "-", "null", "undefined", "xxx", "不适用", "不存在", "tbd", "暂无信息"}


class AiFiller:
    """通用 AI 文档字段填写器。

    支持 chunk 级分块调用 LLM + "last non-empty validated wins" 合并策略。
    """

    def __init__(self, client: OpenAI | None = None):
        self.client = client or OpenAI(
            api_key=settings.llm_api_key,
            base_url=settings.llm_base_url,
        )
        self.model = settings.llm_model

    @staticmethod
    def _split_text(text: str, max_chars: int = 8000) -> list[str]:
        """将长文本按段落边界分块。"""
        if len(text) <= max_chars:
            return [text]
        paragraphs = text.split("\n\n")
        chunks: list[str] = []
        current = ""
        for p in paragraphs:
            if len(current) + len(p) + 2 > max_chars and current:
                chunks.append(current)
                current = p
            else:
                current = f"{current}\n\n{p}" if current else p
        if current:
            chunks.append(current)
        return chunks

    @staticmethod
    def _validate_value(value: str) -> str:
        """校验 LLM 返回值，过滤空值和占位符。"""
        if not value or len(value.strip()) <= 1:
            return ""
        stripped = value.strip()
        if stripped.lower() in {v.lower() for v in PLACEHOLDER_VALUES}:
            return ""
        return stripped

    def _call_llm_for_chunk(self, system: str, user: str, chunk_text: str, fields_json: str) -> list[dict]:
        """对单个 chunk 调用 LLM，解析返回的 JSON 行列表。"""
        user_filled = user.format(text=chunk_text, fields_json=fields_json)
        stream = self.client.chat.completions.create(
            model=self.model,
            messages=[
                {"role": "system", "content": system},
                {"role": "user", "content": user_filled},
            ],
            temperature=0.1,
            stream=True,
        )

        results = []
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
                    results.append(item)
                except json.JSONDecodeError:
                    logger.debug("跳过无效 JSON 行: %s", line)
        tail = buffer.strip()
        if tail:
            try:
                results.append(json.loads(tail))
            except json.JSONDecodeError:
                logger.debug("跳过无效 JSON 尾行: %s", tail)
        return results

    def fill_stream(
        self,
        fields: list[dict],
        document_text: str,
        reference_text: str | None = None,
        start_chunk: int = 0,
        partial_result: dict[str, str] | None = None,
    ) -> Generator[str, None, None]:
        """流式填写字段，yield SSE 格式字符串。"""
        total = len(fields)
        fields_json = json.dumps(
            [{"id": f["id"], "label": f["label"]} for f in fields],
            ensure_ascii=False,
            indent=None,
        )

        if reference_text:
            system = _WITH_REF_SYSTEM
            text_source = reference_text
        else:
            system = _NO_REF_SYSTEM
            text_source = document_text

        chunks = self._split_text(text_source)
        total_chunks = len(chunks)

        merged_result: dict[str, str] = partial_result.copy() if partial_result else {f["id"]: "" for f in fields}
        emitted_fields: set[str] = set(merged_result.keys() if partial_result else set())
        filled_count = 0

        try:
            for chunk_idx in range(start_chunk, total_chunks):
                chunk_text = chunks[chunk_idx]
                chunk_results = self._call_llm_for_chunk(
                    system, _WITH_REF_USER if reference_text else _NO_REF_USER, chunk_text, fields_json
                )

                for item in chunk_results:
                    field_id = item.get("id", "")
                    value = item.get("value", "")
                    requires_input = bool(item.get("requires_input", False))
                    validated = self._validate_value(value)

                    if field_id not in merged_result:
                        continue

                    if requires_input:
                        if field_id not in emitted_fields:
                            label = next((f["label"] for f in fields if f["id"] == field_id), field_id)
                            payload = json.dumps(
                                {"id": field_id, "label": label, "requires_input": True},
                                ensure_ascii=False,
                            )
                            yield f"event: field_requires_input\ndata: {payload}\n\n"
                            emitted_fields.add(field_id)
                    elif validated:
                        old_value = merged_result[field_id]
                        merged_result[field_id] = validated
                        if field_id not in emitted_fields or old_value != validated:
                            label = next((f["label"] for f in fields if f["id"] == field_id), field_id)
                            payload = json.dumps(
                                {"id": field_id, "label": label, "value": validated, "requires_input": False},
                                ensure_ascii=False,
                            )
                            yield f"event: field_filled\ndata: {payload}\n\n"
                            emitted_fields.add(field_id)

                filled_count = sum(1 for v in merged_result.values() if self._validate_value(v))
                pct = int(filled_count / total * 100) if total > 0 else 0
                progress = json.dumps({
                    "filled": filled_count,
                    "total": total,
                    "percentage": pct,
                    "chunk": chunk_idx + 1,
                    "chunk_index": chunk_idx + 1,
                    "total_chunks": total_chunks,
                })
                yield f"event: progress\ndata: {progress}\n\n"

        except Exception as e:
            logger.error("AI 填写失败: %s", e)
            err = json.dumps({"message": str(e)}, ensure_ascii=False)
            yield f"event: error\ndata: {err}\n\n"
            return

        done = json.dumps({"filled_count": filled_count, "empty_count": total - filled_count})
        yield f"event: done\ndata: {done}\n\n"
