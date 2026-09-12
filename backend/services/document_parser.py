"""
附件文档解析（轻量版 v3.5）

PDF/Word/Excel/纯文本类附件 → 纯文本，注入当前对话上下文。
不做持久化存储；知识库化是后续独立功能。

限制：
- 单文件 ≤ MAX_UPLOAD_SIZE_MB（config.settings，默认 10MB，base64 解码后）
- 单文档注入上限 40k 字符（超长截断并标注）
"""

import base64
import io

from config import settings
from utils.logger import logger

MAX_DOC_TEXT_CHARS = 40_000


def _max_doc_bytes() -> int:
    """单文件字节上限，消费 config.settings（MAX_UPLOAD_SIZE_MB，默认 10MB）。"""
    return settings.max_upload_size_mb * 1024 * 1024


TEXT_EXTENSIONS = {
    "txt",
    "md",
    "markdown",
    "csv",
    "json",
    "log",
    "py",
    "js",
    "ts",
    "tsx",
    "jsx",
    "html",
    "css",
    "sql",
    "yml",
    "yaml",
}


class DocumentParseError(Exception):
    """附件解析失败（消息可直接展示给用户）"""


def parse_document(*, filename: str, content_base64: str) -> str:
    """按扩展名解析文档为纯文本。失败抛 DocumentParseError。"""
    try:
        raw = base64.b64decode(content_base64, validate=True)
    except Exception as exc:
        raise DocumentParseError(f"附件 {filename} 不是有效的文件内容") from exc

    max_bytes = _max_doc_bytes()
    if len(raw) > max_bytes:
        raise DocumentParseError(f"附件 {filename} 超过 {settings.max_upload_size_mb}MB 上限")
    if not raw:
        raise DocumentParseError(f"附件 {filename} 是空文件")

    ext = filename.rsplit(".", 1)[-1].lower() if "." in filename else ""
    try:
        if ext == "pdf":
            text = _parse_pdf(raw)
        elif ext == "docx":
            text = _parse_docx(raw)
        elif ext in ("xlsx", "xlsm"):
            text = _parse_xlsx(raw)
        elif ext in TEXT_EXTENSIONS:
            text = raw.decode("utf-8")
        else:
            raise DocumentParseError(
                f"暂不支持的文档格式：{filename}（支持 pdf / docx / xlsx / txt / md / csv 等）"
            )
    except DocumentParseError:
        raise
    except UnicodeDecodeError as exc:
        raise DocumentParseError(f"附件 {filename} 无法按文本解析（可能是二进制文件）") from exc
    except Exception as exc:
        logger.warning(f"[DOC_PARSE] {filename} 解析失败: {exc}")
        raise DocumentParseError(f"附件 {filename} 解析失败") from exc

    text = text.strip()
    if not text:
        raise DocumentParseError(f"附件 {filename} 未解析出文本内容（可能是扫描件/纯图片 PDF）")
    text = _normalize_extracted_text(text)
    if len(text) > MAX_DOC_TEXT_CHARS:
        text = text[:MAX_DOC_TEXT_CHARS] + "\n\n…（内容过长，已截断）"
    return text


# CJK 字符集（含中文标点/全角/省略号/破折号）：设计类 PDF 常逐字断行，
# 相邻行两侧都是 CJK 时换行几乎必然是提取伪影（CJK 行内不需要换行分隔）
_CJK_CLASS = (
    "\\u4e00-\\u9fff\\u3400-\\u4dbf"
    "\\u3000-\\u303f\\uff00-\\uffef"
    "\\u2014\\u2018\\u2019\\u201c\\u201d\\u2026"
)


def _normalize_extracted_text(text: str) -> str:
    """规整提取文本。

    规则：
    1. 换行两侧任一为 CJK → 直接相连（CJK 行内不需要换行分隔，
       对规整 CJK 文本同样安全——段内换行即提取伪影）；
    2. 断行检测：剩余行的中位长度过短（设计类 PDF 逐字/逐词断行）
       → 判定为坏提取，剩余换行并入空格；否则保留段落结构，
       仅压缩 3 个以上连续空行。
    """
    import re

    cjk = _CJK_CLASS
    # 换行两侧任一为 CJK → 直接相连
    text = re.sub(rf"(?<=[{cjk}])[ \t]*\r?\n[ \t]*(?=[{cjk}])", "", text)
    # 设计类 PDF 逐字绘制会被提取成"CJK 空格 CJK"（"公 司 介 绍"）——
    # 中文行内本就不使用空格分隔，单个空格夹在两个 CJK 字符之间即提取伪影
    text = re.sub(rf"(?<=[{cjk}]) (?=[{cjk}])", "", text)

    non_empty = [line for line in text.split("\n") if line.strip()]
    if non_empty:
        lengths = sorted(len(line.strip()) for line in non_empty)
        median_length = lengths[len(lengths) // 2]
        if median_length < 6:
            # 坏提取：逐字/逐词断行，全部并入连续文本
            text = re.sub(r"[ \t]*\r?\n[ \t]*", " ", text)
        else:
            text = re.sub(r"\n{3,}", "\n\n", text)

    text = re.sub(r"[ \t]{2,}", " ", text)
    return text.strip()


def _parse_pdf(raw: bytes) -> str:
    from pypdf import PdfReader

    reader = PdfReader(io.BytesIO(raw))
    pages = [page.extract_text() or "" for page in reader.pages]
    return "\n\n".join(f"【第 {i} 页】\n{t}" for i, t in enumerate(pages, 1) if t.strip())


def _parse_docx(raw: bytes) -> str:
    from docx import Document

    document = Document(io.BytesIO(raw))
    lines = [p.text for p in document.paragraphs if p.text.strip()]
    for table in document.tables:
        for row in table.rows:
            cells = [cell.text.strip() for cell in row.cells]
            if any(cells):
                lines.append(" | ".join(cells))
    return "\n".join(lines)


def _parse_xlsx(raw: bytes) -> str:
    from openpyxl import load_workbook

    workbook = load_workbook(io.BytesIO(raw), read_only=True, data_only=True)
    blocks = []
    for sheet in workbook.worksheets:
        lines = [f"=== Sheet: {sheet.title} ==="]
        for row in sheet.iter_rows(values_only=True):
            cells = ["" if v is None else str(v) for v in row]
            if any(cells):
                lines.append(" | ".join(cells))
        blocks.append("\n".join(lines))
    return "\n\n".join(blocks)
