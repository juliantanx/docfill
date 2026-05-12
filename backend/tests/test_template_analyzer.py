import pytest
from docx import Document as DocxDocument
from pathlib import Path
from app.services.template_analyzer import TemplateAnalyzer


def _make_doc(tmp_path: Path, text: str) -> str:
    doc = DocxDocument()
    doc.add_paragraph(text)
    path = str(tmp_path / "test.docx")
    doc.save(path)
    return path


def test_bracket_pattern(tmp_path):
    path = _make_doc(tmp_path, "甲方：【XX 公司[姓名]】")
    fields = TemplateAnalyzer().analyze(path)
    assert len(fields) == 1
    assert fields[0].label == "姓名"
    assert fields[0].field_type == "bracket"


def test_blank_pattern(tmp_path):
    path = _make_doc(tmp_path, "联系人：________")
    fields = TemplateAnalyzer().analyze(path)
    assert len(fields) == 1
    assert fields[0].label == "联系人"
    assert fields[0].field_type == "blank"


def test_inline_paren_pattern(tmp_path):
    path = _make_doc(tmp_path, "（投标人名称）")
    fields = TemplateAnalyzer().analyze(path)
    assert len(fields) == 1
    assert fields[0].label == "投标人名称"
    assert fields[0].field_type == "inline_paren"


def test_dedup(tmp_path):
    path = _make_doc(tmp_path, "甲方：【A[姓名]】\n乙方：【B[姓名]】")
    fields = TemplateAnalyzer().analyze(path)
    assert len(fields) == 1
