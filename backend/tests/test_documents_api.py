import io
from docx import Document as DocxDocument
from pathlib import Path
import pytest

from app.core.config import Settings


def _make_docx_bytes(text: str) -> bytes:
    doc = DocxDocument()
    doc.add_paragraph(text)
    buf = io.BytesIO()
    doc.save(buf)
    return buf.getvalue()


def test_upload_and_get(client, tmp_path, monkeypatch):
    monkeypatch.setattr(Settings, "upload_dir", property(lambda self: tmp_path))

    docx_bytes = _make_docx_bytes("甲方：【XX 公司[投标人]】")
    response = client.post(
        "/api/v1/documents/upload",
        files={"file": ("test.docx", docx_bytes, "application/octet-stream")},
    )
    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "ready"
    doc_id = data["doc_id"]

    response2 = client.get(f"/api/v1/documents/{doc_id}")
    assert response2.status_code == 200
    doc_data = response2.json()
    assert doc_data["status"] == "ready"
    assert len(doc_data["fields"]) == 1
    assert doc_data["fields"][0]["label"] == "投标人"


def test_upload_invalid_type(client):
    response = client.post(
        "/api/v1/documents/upload",
        files={"file": ("test.pdf", b"fake pdf", "application/pdf")},
    )
    assert response.status_code == 400
    assert "不支持的文件类型" in response.json()["detail"]


def test_update_field(client, tmp_path, monkeypatch):
    monkeypatch.setattr(Settings, "upload_dir", property(lambda self: tmp_path))

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
