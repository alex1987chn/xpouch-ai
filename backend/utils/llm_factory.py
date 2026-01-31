"""
LLM 工厂模块
统一管理和创建 LLM 实例，消除重复初始化逻辑
"""

import os
from typing import Optional
from langchain_openai import ChatOpenAI


def get_llm_instance(
    streaming: bool = False,
    temperature: Optional[float] = None,
    model: Optional[str] = None,
    api_key: Optional[str] = None,
    base_url: Optional[str] = None
) -> ChatOpenAI:
    """
    获取 LLM 实例的工厂函数
    
    Args:
        streaming: 是否启用流式输出
        temperature: 温度参数，默认从环境变量读取或 0.7
        model: 模型名称，默认从环境变量读取
        api_key: API Key，默认从环境变量读取
        base_url: API Base URL，默认从环境变量读取
    
    Returns:
        ChatOpenAI: 配置好的 LLM 实例
    
    环境变量优先级：
        - OPENAI_API_KEY / OPENAI_BASE_URL
        - DEEPSEEK_API_KEY / DEEPSEEK_BASE_URL (fallback)
        - MODEL_NAME (默认: deepseek-chat)
    """
    # 读取 API 配置（带 fallback 逻辑）
    _api_key = api_key or os.getenv("OPENAI_API_KEY") or os.getenv("DEEPSEEK_API_KEY")
    _base_url = base_url or os.getenv("OPENAI_BASE_URL") or os.getenv(
        "DEEPSEEK_BASE_URL", "https://api.deepseek.com/v1"
    )
    _model = model or os.getenv("MODEL_NAME", "deepseek-chat")
    _temperature = temperature if temperature is not None else float(os.getenv("LLM_TEMPERATURE", "0.7"))
    
    if not _api_key:
        raise ValueError("未找到 API Key，请设置 OPENAI_API_KEY 或 DEEPSEEK_API_KEY 环境变量")
    
    return ChatOpenAI(
        model=_model,
        temperature=_temperature,
        api_key=_api_key,
        base_url=_base_url,
        streaming=streaming
    )


def get_router_llm() -> ChatOpenAI:
    """
    获取 Router 节点专用的 LLM 实例
    使用较低温度以获得更确定的输出
    """
    return get_llm_instance(
        streaming=True,
        temperature=0.3
    )


def get_planner_llm() -> ChatOpenAI:
    """
    获取 Planner 节点专用的 LLM 实例
    """
    return get_llm_instance(
        streaming=True,
        temperature=0.5
    )


def get_expert_llm(temperature: Optional[float] = None) -> ChatOpenAI:
    """
    获取 Expert 节点专用的 LLM 实例
    
    Args:
        temperature: 专家节点可自定义温度
    """
    return get_llm_instance(
        streaming=True,
        temperature=temperature
    )
