import requests
from langchain_core.tools import tool


@tool
def read_webpage(url: str) -> str:
    """
    读取指定网页的【完整】内容。
    
    当搜索结果信息不足，或者用户提供具体链接要求总结/分析时，使用此工具。
    该工具会将网页转换为 Markdown 格式，方便阅读。

    Args:
        url: 目标网页的链接 (必须以 http 或 https 开头)

    Returns:
        网页的 Markdown 内容 (截取前 15000 字符以防超长)
    """
    if not url.startswith("http"):
        return "❌ 错误: URL 必须以 http 或 https 开头"

    print(f"--- [Tool] 正在深度阅读网页: {url} ---")
    
    # 🔥 魔法：在 URL 前加 r.jina.ai，直接获取 Markdown
    jina_url = f"https://r.jina.ai/{url}"
    
    # 告诉 Jina 我们是开发者，有些网站会放行
    headers = {
        "User-Agent": "XPouch-Agent/1.0",
        "X-Return-Format": "markdown"
    }

    try:
        # 设置 15秒 超时，防止卡死
        response = requests.get(jina_url, headers=headers, timeout=15)
        
        if response.status_code != 200:
            return f"❌ 读取失败 (状态码 {response.status_code}): 可能是网站反爬或链接无效。"
        
        content = response.text
        
        # 简单的清理：如果内容太短，可能没读到
        if len(content) < 100:
            return f"⚠️ 警告: 读取内容过短，可能是因为该网站需要登录或有强反爬。\n原始内容: {content}"
            
        # 截断保护：防止一本小说直接把 Token 撑爆
        # 15000 字符大约对应 3k-5k token，足够覆盖绝大多数技术文章
        truncated_content = content[:15000]
        
        if len(content) > 15000:
            truncated_content += "\n\n...(内容过长，已截断)..."
            
        return f"【网页内容 (URL: {url})】:\n{truncated_content}"

    except Exception as e:
        return f"❌ 读取发生错误: {str(e)}"
