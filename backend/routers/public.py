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
    """产物分享页（内联柔和风格样式 + OG 卡片；色值对齐 docs/design token）"""
    body = _render_body(artifact_type, content[:_MAX_CONTENT_CHARS])
    safe_title = escape(title)
    desc = escape(_preview_text(content))

    return f"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Geist:wght@400;500;600;700&family=Space+Grotesk:wght@500;700&display=swap" rel="stylesheet" />
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
    font-family: 'Geist', 'PingFang SC', 'Microsoft YaHei', system-ui, sans-serif;
    background: #faf7f2; color: #2d2a26; padding: 32px 20px; line-height: 1.75;
  }}
  .card {{
    max-width: 800px; margin: 0 auto; background: #fffefb;
    border: 1px solid #e8e4e0; border-radius: 14px;
    box-shadow: 0 2px 4px rgba(45,42,38,.05), 0 8px 24px rgba(45,42,38,.07);
    overflow: hidden;
  }}
  header {{
    display: flex; align-items: center; justify-content: space-between;
    padding: 14px 22px; border-bottom: 1px solid #ecebe8;
  }}
  header .brand {{
    font-family: 'Space Grotesk', 'Geist', sans-serif; font-weight: 700;
    font-size: 15px; letter-spacing: .02em; color: #2d2a26;
  }}
  header .brand .x {{ color: #f2c00f; }}
  header .type {{
    font-size: 11px; font-weight: 500; color: #6f6a62;
    background: #f1ece2; border-radius: 999px; padding: 3px 10px;
  }}
  main {{ padding: 26px 26px 34px; overflow-wrap: break-word; font-size: 14px; }}
  h1, h2, h3 {{ margin: 1.3em 0 .55em; font-weight: 700; line-height: 1.4; }}
  h1 {{ font-size: 1.45em; }} h2 {{ font-size: 1.2em; }} h3 {{ font-size: 1.05em; }}
  main > h1:first-child {{ margin-top: 0; }}
  p, ul, ol {{ margin: .7em 0; }} li {{ margin: .25em 0; }}
  a {{ color: #2d2a26; text-decoration: underline; text-underline-offset: 3px;
      text-decoration-color: rgba(45,42,38,.35); }}
  a:hover {{ text-decoration-color: #2d2a26; }}
  code {{ font-family: ui-monospace, 'Space Mono', Consolas, monospace; font-size: .9em; }}
  :not(pre) > code {{ background: #f1ece2; border-radius: 5px; padding: 2px 6px; }}
  pre {{
    background: #faf7f2; border: 1px solid #ecebe8; border-radius: 10px;
    padding: 14px 16px; overflow: auto; margin: 1em 0;
    font-size: 12.5px; line-height: 1.7;
  }}
  pre.text, pre.code {{ white-space: pre-wrap; }}
  .media {{ max-width: 100%; border: 1px solid #e8e4e0; border-radius: 10px; margin: 1em 0; }}
  .note {{ font-size: 12px; color: #a49d90; margin-bottom: 12px; }}
  table {{ border-collapse: collapse; margin: 1em 0; width: 100%; font-size: 13px; }}
  th, td {{ border: 1px solid #e8e4e0; padding: 7px 11px; }}
  th {{ background: #faf7f2; font-weight: 600; }}
  blockquote {{ border-left: 3px solid #e8e4e0; margin: 1em 0; padding: 2px 0 2px 14px; color: #6f6a62; }}
  hr {{ border: none; border-top: 1px solid #ecebe8; margin: 1.6em 0; }}
  footer {{
    display: flex; justify-content: space-between; align-items: center;
    padding: 13px 22px; border-top: 1px solid #ecebe8; font-size: 12.5px;
  }}
  footer .ctime {{ color: #a49d90; }}
  footer a.cta {{
    display: inline-flex; align-items: center; gap: 6px; background: #f2c00f;
    color: #3f3200; text-decoration: none; padding: 8px 18px; font-weight: 700;
    font-size: 13px; border: 1px solid rgba(45,42,38,.12); border-radius: 999px;
    transition: transform .15s ease, box-shadow .15s ease;
  }}
  footer a.cta:hover {{
    transform: translateY(-1px);
    box-shadow: 0 2px 4px rgba(45,42,38,.08), 0 8px 24px rgba(45,42,38,.12);
  }}
  @media (max-width: 560px) {{
    body {{ padding: 16px 10px; }}
    main {{ padding: 20px 16px 26px; }}
    footer {{ padding: 12px 16px; flex-wrap: wrap; gap: 10px; }}
  }}
</style>
</head>
<body>
  <div class="card">
    <header>
      <span class="brand">[<span class="x">X</span>POUCH]</span>
      <span class="type">{escape(artifact_type)}</span>
    </header>
    <main>{body}</main>
    <footer>
      <span class="ctime">{escape(datetime.now().strftime("%Y-%m-%d %H:%M"))}</span>
      <a class="cta" href="/">在 XPOUCH 中打开 →</a>
    </footer>
  </div>
</body>
</html>"""


_NOT_FOUND_HTML = """<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Not Found · XPOUCH</title>
<style>body{font-family:'Geist','PingFang SC','Microsoft YaHei',system-ui,sans-serif;
background:#faf7f2;color:#2d2a26;display:flex;align-items:center;justify-content:center;
min-height:100vh}div{border:1px solid #e8e4e0;background:#fffefb;border-radius:14px;
box-shadow:0 2px 4px rgba(45,42,38,.05),0 8px 24px rgba(45,42,38,.07);
padding:36px 52px;font-weight:600;font-size:14px}</style></head>
<body><div>链接不存在或已被撤销</div></body></html>"""

_TOO_MANY_HTML = """<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Too Many Requests · XPOUCH</title>
<style>body{font-family:'Geist','PingFang SC','Microsoft YaHei',system-ui,sans-serif;
background:#faf7f2;color:#2d2a26;display:flex;align-items:center;justify-content:center;
min-height:100vh}div{border:1px solid #e8e4e0;background:#fffefb;border-radius:14px;
box-shadow:0 2px 4px rgba(45,42,38,.05),0 8px 24px rgba(45,42,38,.07);
padding:36px 52px;font-weight:600;font-size:14px}</style></head>
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
