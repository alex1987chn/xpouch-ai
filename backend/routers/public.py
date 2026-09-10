"""
公开路由（无认证）

- GET /s/{token}: 产物分享页（服务端渲染 HTML，带 OG 卡片）

为什么 SSR 而非 SPA 路由：nginx 的 SPA fallback 只回 index.html，
社交平台爬虫不执行 JS，拿不到动态 meta；服务端直接出完整 HTML 才能保证
分享卡片可见。内容全部转义 / markdown 安全渲染（html=False），无 XSS 面。
"""

import asyncio
from datetime import datetime
from html import escape

from fastapi import APIRouter, Depends, Request
from fastapi.responses import HTMLResponse
from sqlmodel import Session

from database import get_session
from services.chat.share_service import ShareService, share_rate_limiter
from utils.exceptions import NotFoundError

router = APIRouter()

# 单页渲染的内容上限（防超大产物拖垮公开页）
_MAX_CONTENT_CHARS = 200_000


def _preview_text(content: str, limit: int = 160) -> str:
    """提取纯文本预览（og:description 用）"""
    text = " ".join(content.split())
    return text[:limit]


def _render_body(artifact_type: str, content: str) -> str:
    """按产物类型渲染正文（安全优先：除 markdown 外全部转义）"""
    if artifact_type == "markdown":
        from markdown_it import MarkdownIt

        # html=False：原始 HTML 标签被转义，杜绝存储型 XSS
        md = MarkdownIt("commonmark", {"html": False, "linkify": True})
        return md.render(content)

    escaped = escape(content)

    if artifact_type in ("code", "html"):
        label = "完整页面请在 XPOUCH 中打开体验" if artifact_type == "html" else ""
        note = f'<p class="note">{escape(label)}</p>' if label else ""
        return f'{note}<pre class="code"><code>{escaped}</code></pre>'

    if artifact_type in ("image", "video", "media"):
        # 内容是 URL 或 markdown 链接，提取首个 http(s) 地址
        url = ""
        for token in content.replace(")", " ").split():
            if token.startswith("http://") or token.startswith("https://"):
                url = token
                break
        if url:
            safe = escape(url, quote=True)
            return f'<img class="media" src="{safe}" alt="artifact" />'
        return f'<pre class="code"><code>{escaped}</code></pre>'

    return f'<pre class="text">{escaped}</pre>'


def _render_share_html(artifact_type: str, title: str, content: str, og_url: str) -> str:
    """产物分享页（内联 Bauhaus 风格样式 + OG 卡片）"""
    body = _render_body(artifact_type, content[:_MAX_CONTENT_CHARS])
    safe_title = escape(title)
    desc = escape(_preview_text(content))

    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>{safe_title} · XPOUCH</title>
<meta property="og:type" content="article" />
<meta property="og:title" content="{safe_title}" />
<meta property="og:description" content="{desc}" />
<meta property="og:site_name" content="XPOUCH" />
<meta property="og:url" content="{escape(og_url, quote=True)}" />
<meta name="twitter:card" content="summary" />
<style>
  * {{ box-sizing: border-box; margin: 0; padding: 0; }}
  body {{
    font-family: 'Space Grotesk', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif;
    background: #f4f2ec; color: #111827; padding: 24px; line-height: 1.65;
  }}
  .card {{
    max-width: 780px; margin: 0 auto; background: #ffffff;
    border: 2px solid #111827; box-shadow: 8px 8px 0 0 #111827;
  }}
  header {{
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 20px; border-bottom: 2px solid #111827; background: #facc15;
  }}
  header .brand {{ font-weight: 900; letter-spacing: 2px; }}
  header .type {{
    font-family: ui-monospace, monospace; font-size: 12px; font-weight: 700;
    background: #111827; color: #fff; padding: 2px 8px; text-transform: uppercase;
  }}
  main {{ padding: 28px 24px 36px; overflow-wrap: break-word; }}
  h1, h2, h3 {{ margin: 1.2em 0 .5em; border-bottom: 2px solid #111827; padding-bottom: 4px; }}
  p, ul, ol {{ margin: .7em 0; }}
  code {{ font-family: ui-monospace, 'Cascadia Code', Consolas, monospace; font-size: .92em; }}
  :not(pre) > code {{ background: #f4f2ec; border: 1px solid #d4d0c8; padding: 1px 5px; }}
  pre {{
    background: #111827; color: #f9fafb; padding: 16px; overflow: auto;
    border: 2px solid #111827; margin: 1em 0; font-size: 13px;
  }}
  pre.text, pre.code {{ white-space: pre-wrap; }}
  .media {{ max-width: 100%; border: 2px solid #111827; margin: 1em 0; }}
  .note {{ font-size: 13px; color: #6b7280; margin-bottom: 12px; }}
  table {{ border-collapse: collapse; margin: 1em 0; }}
  th, td {{ border: 1px solid #111827; padding: 6px 10px; }}
  a {{ color: #111827; }}
  footer {{
    display: flex; justify-content: space-between; align-items: center;
    padding: 12px 20px; border-top: 2px solid #111827; font-size: 13px;
  }}
  footer .ctime {{ color: #6b7280; font-family: ui-monospace, monospace; font-size: 12px; }}
  footer a.cta {{
    display: inline-block; background: #111827; color: #fff; text-decoration: none;
    padding: 8px 18px; font-weight: 700; border: 2px solid #111827;
    box-shadow: 4px 4px 0 0 #facc15; transition: transform .15s ease;
  }}
  footer a.cta:hover {{ transform: translate(-2px, -2px); }}
</style>
</head>
<body>
  <div class="card">
    <header>
      <span class="brand">XPOUCH</span>
      <span class="type">{escape(artifact_type)}</span>
    </header>
    <main>{body}</main>
    <footer>
      <span class="ctime">{escape(datetime.now().strftime("%Y-%m-%d %H:%M"))}</span>
      <a class="cta" href="/">在 XPOUSH 中打开 →</a>
    </footer>
  </div>
</body>
</html>"""


_NOT_FOUND_HTML = """<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8" />
<title>Not Found · XPOUCH</title>
<style>body{font-family:system-ui;background:#f4f2ec;display:flex;align-items:center;
justify-content:center;min-height:100vh}div{border:2px solid #111827;background:#fff;
box-shadow:8px 8px 0 0 #111827;padding:40px 60px;font-weight:700}</style></head>
<body><div>链接不存在或已被撤销</div></body></html>"""

_TOO_MANY_HTML = """<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8" />
<title>Too Many Requests · XPOUCH</title>
<style>body{font-family:system-ui;background:#f4f2ec;display:flex;align-items:center;
justify-content:center;min-height:100vh}div{border:2px solid #111827;background:#fff;
box-shadow:8px 8px 0 0 #111827;padding:40px 60px;font-weight:700}</style></head>
<body><div>请求过于频繁，请稍后再试</div></body></html>"""


@router.get("/s/{token}", response_class=HTMLResponse)
async def share_page(token: str, request: Request, session: Session = Depends(get_session)):
    """产物分享页（公开，限流）"""
    client_ip = request.client.host if request.client else "unknown"
    if not share_rate_limiter.allow(client_ip):
        return HTMLResponse(_TOO_MANY_HTML, status_code=429)

    service = ShareService(session)
    artifact = await asyncio.to_thread(service.resolve, token)
    if not artifact:
        return HTMLResponse(_NOT_FOUND_HTML, status_code=404)

    title = artifact.title or "Shared Artifact"
    og_url = str(request.url)
    return HTMLResponse(_render_share_html(artifact.type, title, artifact.content, og_url))


@router.get("/api/public/templates/shared/{token}")
async def get_shared_template(token: str, session: Session = Depends(get_session)):
    """模板分享链接的公开只读导出（无认证；token 不可枚举，撤销即失效）"""
    from routers.library import build_template_export
    from services.chat.share_service import ShareService

    template = ShareService(session).resolve_template(token)
    if template is None:
        raise NotFoundError("分享链接")

    return build_template_export(template)
