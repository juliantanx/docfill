import uuid
from datetime import datetime

from sqlalchemy import Column, DateTime, JSON, String, Text, func
from sqlalchemy.ext.mutable import MutableDict, MutableList

from app.core.database import Base


class Document(Base):
    __tablename__ = "documents"

    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    original_filename = Column(String(512), nullable=False)
    file_path = Column(String(1024), nullable=False)
    # parsing | ready | filling | paused | filled | error
    status = Column(String(32), nullable=False, default="parsing")
    fields = Column(MutableList.as_mutable(JSON), nullable=True)
    outline = Column(MutableList.as_mutable(JSON), nullable=True)
    references = Column(MutableList.as_mutable(JSON), nullable=True)
    fill_progress = Column(MutableDict.as_mutable(JSON), nullable=True)
    partial_fields = Column(MutableDict.as_mutable(JSON), nullable=True)
    error_message = Column(Text, nullable=True)
    onlyoffice_doc_key = Column(String(255), nullable=True, index=True)
    created_at = Column(DateTime, nullable=False, server_default=func.now())
    updated_at = Column(DateTime, nullable=False, server_default=func.now(), onupdate=func.now())
