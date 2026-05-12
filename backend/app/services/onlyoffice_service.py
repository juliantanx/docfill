"""OnlyOffice Document Server 集成服务。"""
import uuid
import jwt
from app.core.config import settings


class OnlyOfficeService:
    def generate_editor_config(
        self,
        doc_id: str,
        filename: str,
        host_url: str,
    ) -> dict:
        """生成 OnlyOffice 编辑器配置。"""
        doc_key = f"docfill_{doc_id}_{uuid.uuid4().hex[:8]}"
        doc_url = f"{host_url}/api/v1/documents/{doc_id}/raw-file"

        config = {
            "document": {
                "fileType": "docx",
                "key": doc_key,
                "title": filename,
                "url": doc_url,
                "permissions": {
                    "comment": True,
                    "download": True,
                    "edit": True,
                    "fillForms": True,
                    "print": True,
                    "review": True,
                },
            },
            "documentType": "word",
            "editorConfig": {
                "callbackUrl": f"{host_url}/api/v1/onlyoffice/callback",
                "lang": "zh",
                "mode": "edit",
                "customization": {
                    "forcesave": True,
                },
            },
        }

        if settings.jwt_enabled:
            token = jwt.encode(config, settings.jwt_secret, algorithm="HS256")
            config["token"] = token

        return {
            "doc_url": doc_url,
            "doc_key": doc_key,
            "config": config,
        }
