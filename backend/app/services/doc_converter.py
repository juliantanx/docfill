"""文档格式转换工具 — .doc 转 .docx。"""
import subprocess
import logging
from pathlib import Path

logger = logging.getLogger(__name__)


def convert_doc_to_docx(doc_path: str, output_dir: str | None = None) -> str:
    """将 .doc 文件转换为 .docx，返回新文件路径。如果已是 .docx 则直接返回原路径。"""
    path = Path(doc_path)
    if path.suffix.lower() == ".docx":
        return doc_path

    if output_dir is None:
        output_dir = str(path.parent)

    try:
        subprocess.run(
            [
                "libreoffice",
                "--headless",
                "--convert-to", "docx",
                "--outdir", output_dir,
                str(path),
            ],
            check=True,
            capture_output=True,
            timeout=30,
        )
        docx_path = Path(output_dir) / f"{path.stem}.docx"
        if docx_path.exists():
            logger.info("转换成功: %s → %s", path.name, docx_path.name)
            return str(docx_path)
        raise FileNotFoundError(f"转换后文件未找到: {docx_path}")
    except subprocess.TimeoutExpired:
        raise RuntimeError("文档转换超时，请尝试将 .doc 另存为 .docx 后重新上传")
    except subprocess.CalledProcessError as e:
        logger.error("LibreOffice 转换失败: %s", e.stderr.decode())
        raise RuntimeError("文档转换失败，请尝试将 .doc 另存为 .docx 后重新上传")
