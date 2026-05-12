import json
from unittest.mock import MagicMock
import pytest
from app.services.ai_filler import AiFiller


def _make_stream_chunk(text: str):
    chunk = MagicMock()
    chunk.choices[0].delta.content = text
    chunk.choices[0].finish_reason = None
    return chunk


def _make_stream_chunks_across_boundary(json_text: str, split_at: int) -> list:
    part1 = json_text[:split_at]
    part2 = json_text[split_at:]
    chunks = []
    if part1:
        chunks.append(_make_stream_chunk(part1))
    if part2:
        chunks.append(_make_stream_chunk(part2))
    final = MagicMock()
    final.choices[0].delta.content = ""
    final.choices[0].finish_reason = "stop"
    chunks.append(final)
    return chunks


def _collect_events(gen) -> list[dict]:
    events = []
    buffer = ""
    for chunk in gen:
        buffer += chunk
        while "\n\n" in buffer:
            block, buffer = buffer.split("\n\n", 1)
            lines = block.strip().split("\n")
            event_type = None
            data_line = None
            for line in lines:
                if line.startswith("event: "):
                    event_type = line[7:].strip()
                elif line.startswith("data: "):
                    data_line = line[6:].strip()
            if event_type and data_line:
                data = json.loads(data_line)
                events.append({"type": event_type, "data": data})
    return events


def test_fill_with_reference():
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

    done = [e for e in events if e["type"] == "done"]
    assert done[0]["data"]["filled_count"] == 2


def test_fill_no_reference_requires_input():
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


def test_fill_cross_chunk_json():
    json_line = '{"id": "f1", "value": "测试值"}\n'
    chunks = _make_stream_chunks_across_boundary(json_line, split_at=15)

    mock_client = MagicMock()
    mock_client.chat.completions.create.return_value = iter(chunks)

    filler = AiFiller(client=mock_client)
    events = _collect_events(filler.fill_stream(
        fields=[{"id": "f1", "label": "名称"}],
        document_text="文档内容",
    ))

    filled = [e for e in events if e["type"] == "field_filled"]
    assert len(filled) == 1
    assert filled[0]["data"]["value"] == "测试值"


def test_chunk_merge_last_nonempty_wins():
    mock_client = MagicMock()
    call1 = iter([
        _make_stream_chunk('{"id": "f1", "value": "李四"}\n'),
        _make_stream_chunk('{"id": "f2", "value": "答案A"}\n'),
    ])
    call2 = iter([_make_stream_chunk('{"id": "f1", "value": "张三"}\n')])
    mock_client.chat.completions.create.side_effect = [call1, call2]

    filler = AiFiller(client=mock_client)
    filler._split_text = lambda text, max_chars=10: [text[:10], text[10:]] if len(text) > 10 else [text]
    events = _collect_events(filler.fill_stream(
        fields=[{"id": "f1", "label": "姓名"}, {"id": "f2", "label": "第一题"}],
        document_text="这是一个足够长的文档文本，用于强制分块处理以测试合并逻辑",
        reference_text=None,
    ))

    filled = [e for e in events if e["type"] == "field_filled"]
    f1_events = [e for e in filled if e["data"]["id"] == "f1"]
    assert len(f1_events) >= 1
    assert f1_events[-1]["data"]["value"] == "张三"


def test_validate_value_filters_placeholders():
    assert AiFiller._validate_value("") == ""
    assert AiFiller._validate_value("无") == ""
    assert AiFiller._validate_value("N/A") == ""
    assert AiFiller._validate_value("暂无") == ""
    assert AiFiller._validate_value("-") == ""
    assert AiFiller._validate_value("null") == ""
    assert AiFiller._validate_value("张三") == "张三"
    assert AiFiller._validate_value("  有效值  ") == "有效值"
