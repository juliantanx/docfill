from typing import Any

from pydantic import BaseModel


class FieldDict(BaseModel):
    id: str
    label: str
    value: str = ""
    status: str = "empty"
    field_type: str
    requires_input: bool = False


class DocumentUploadResponse(BaseModel):
    doc_id: str
    status: str
    message: str


class DocumentStatusResponse(BaseModel):
    doc_id: str
    original_filename: str
    status: str
    fields: list[dict] | None = None
    outline: list[dict] | None = None
    references: list[dict] | None = None
    error_message: str | None = None


class FieldUpdateRequest(BaseModel):
    value: str


class ConfirmResponse(BaseModel):
    success: bool
    download_url: str
    message: str


class EditorTokenResponse(BaseModel):
    doc_url: str
    doc_key: str
    config: dict[str, Any]
