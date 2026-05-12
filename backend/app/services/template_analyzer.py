"""模板字段分析器 — 识别文档中的待填字段。"""
import re
import uuid
from dataclasses import dataclass, field
from docx import Document as DocxDocument


@dataclass
class TemplateField:
    id: str
    label: str
    field_type: str  # bracket | blank | table_cell | inline_paren
    original_text: str
    location: str = ""


# Patterns
BRACKET_PATTERN = re.compile(r'【[^【】]*\[([^\]]+)\][^【】]*】')
BLANK_PATTERN = re.compile(r'([^：:]+)[：:]\s*(_{4,}|—{4,}|-{4,})')
INLINE_PAREN_PATTERN = re.compile(r'（([^）]{2,30})）')


class TemplateAnalyzer:
    def analyze(self, file_path: str) -> list[TemplateField]:
        """分析文档，返回去重后的待填字段列表。"""
        doc = DocxDocument(file_path)
        fields: list[TemplateField] = []
        seen_labels: set[str] = set()

        # Paragraphs
        for i, para in enumerate(doc.paragraphs):
            text = para.text.strip()
            if not text:
                continue
            for f in self._extract_from_text(text, f"paragraph_{i}"):
                if f.label not in seen_labels:
                    fields.append(f)
                    seen_labels.add(f.label)

        # Tables
        for t_idx, table in enumerate(doc.tables):
            for r_idx, row in enumerate(table.rows):
                for c_idx, cell in enumerate(row.cells):
                    text = cell.text.strip()
                    if not text:
                        continue
                    loc = f"table_{t_idx}_row{r_idx}_col{c_idx}"
                    for f in self._extract_from_text(text, loc):
                        if f.label not in seen_labels:
                            fields.append(f)
                            seen_labels.add(f.label)

        return fields

    def _extract_from_text(self, text: str, location: str) -> list[TemplateField]:
        """从单段文本中提取所有字段。"""
        results: list[TemplateField] = []

        # Bracket: 【XX[姓名]】
        for m in BRACKET_PATTERN.finditer(text):
            label = m.group(1).strip()
            if label:
                results.append(TemplateField(
                    id=str(uuid.uuid4()),
                    label=label,
                    field_type="bracket",
                    original_text=m.group(0),
                    location=location,
                ))

        # Blank: 标签：________
        for m in BLANK_PATTERN.finditer(text):
            label = m.group(1).strip()
            if label:
                results.append(TemplateField(
                    id=str(uuid.uuid4()),
                    label=label,
                    field_type="blank",
                    original_text=m.group(0),
                    location=location,
                ))

        # Inline paren: （投标人名称）
        for m in INLINE_PAREN_PATTERN.finditer(text):
            label = m.group(1).strip()
            if label and not any(r.label == label for r in results):
                results.append(TemplateField(
                    id=str(uuid.uuid4()),
                    label=label,
                    field_type="inline_paren",
                    original_text=m.group(0),
                    location=location,
                ))

        return results
