"""OnlyOffice Document Server 回调端点。"""
import httpx
from fastapi import APIRouter, Body, Depends
from sqlalchemy.orm import Session
from app.core.deps import get_db
from app.models.document import Document

router = APIRouter()


@router.post("/callback")
async def onlyoffice_callback(
    event: dict = Body(...),
    db: Session = Depends(get_db),
):
    """OnlyOffice 保存回调。"""
    status = event.get("status", 0)
    doc_key = event.get("key", "")

    if status == 2:
        url = event.get("url")
        if url:
            doc = db.query(Document).filter(
                Document.onlyoffice_doc_key == doc_key
            ).first()
            if doc and doc.status not in ("filling", "paused"):
                async with httpx.AsyncClient() as client:
                    response = await client.get(url)
                with open(doc.file_path, "wb") as f:
                    f.write(response.content)
                db.commit()

    return {"error": 0}
