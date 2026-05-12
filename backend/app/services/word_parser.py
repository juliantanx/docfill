"""Word 文档解析器 — 提取大纲和书签。"""
import re
from docx import Document as DocxDocument


class WordParser:
    def __init__(self, file_path: str):
        self.file_path = file_path
        self.doc = DocxDocument(file_path)

    def extract_outline(self) -> list[dict]:
        """提取文档大纲（标题层级 + 书签名称）。"""
        outline = []
        seen = set()
        for i, paragraph in enumerate(self.doc.paragraphs):
            if paragraph.style.name.startswith("Heading"):
                level_str = paragraph.style.name.replace("Heading", "").strip()
                level = int(level_str) if level_str.isdigit() else 1
                title = paragraph.text.strip()
                if not title:
                    continue
                bookmark_name = f"heading_{i}"
                # Assign bookmark to first run if exists
                if paragraph.runs:
                    self._add_bookmark(paragraph, bookmark_name)
                node = {
                    "id": f"outline_{i}",
                    "title": title,
                    "level": level,
                    "bookmarkName": bookmark_name,
                    "children": [],
                }
                if title not in seen:
                    outline.append(node)
                    seen.add(title)
        return self._build_tree(outline)

    def _add_bookmark(self, paragraph, bookmark_name: str):
        """在段落的第一个 run 前插入书签。"""
        from docx.oxml.ns import qn
        from lxml import etree

        run = paragraph.runs[0] if paragraph.runs else None
        if run is None:
            return
        elem = run._element
        parent = elem.getparent()
        idx = list(parent).index(elem)
        bookmark_start = etree.SubElement(parent, qn("w:bookmarkStart"))
        bookmark_start.set(qn("w:id"), "0")
        bookmark_start.set(qn("w:name"), bookmark_name)
        bookmark_end = etree.SubElement(parent, qn("w:bookmarkEnd"))
        bookmark_end.set(qn("w:id"), "0")
        # Reorder so bookmarkStart is before the run
        parent.remove(bookmark_start)
        parent.insert(idx, bookmark_start)

    def _build_tree(self, flat_nodes: list[dict]) -> list[dict]:
        """将扁平标题列表构建为树结构。"""
        if not flat_nodes:
            return []
        root: list[dict] = []
        stack: list[dict] = []
        for node in flat_nodes:
            while stack and stack[-1]["level"] >= node["level"]:
                stack.pop()
            if stack:
                stack[-1]["children"].append(node)
            else:
                root.append(node)
            stack.append(node)
        return root
