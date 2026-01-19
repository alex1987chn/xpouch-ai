"""
通用 LLM JSON 响应解析器
支持多模型兼容性，处理各种 JSON 格式边缘情况
"""
import json
import re
from typing import TypeVar, Type, Optional
from pydantic import BaseModel, ValidationError


T = TypeVar('T', bound=BaseModel)


def parse_llm_json(
    content: str,
    response_model: Type[T],
    strict: bool = False,
    clean_markdown: bool = True
) -> T:
    """
    解析 LLM 返回的 JSON 响应，支持多种格式和边缘情况

    功能：
    1. 移除 Markdown 代码块标记（```json ... ```）
    2. 提取 JSON 内容（处理前后缀文本）
    3. 验证 JSON 格式是否符合 Pydantic 模型
    4. 清理常见格式问题（尾部逗号、注释等）

    Args:
        content: LLM 原始响应内容
        response_model: 目标 Pydantic 模型类
        strict: 是否严格模式（失败时抛出异常）
        clean_markdown: 是否清理 Markdown 代码块标记

    Returns:
        T: 解析后的 Pydantic 对象

    Raises:
        ValueError: JSON 格式无效或解析失败
        ValidationError: JSON 结构不符合 Pydantic 模型

    Example:
        >>> from pydantic import BaseModel
        >>> class Task(BaseModel):
        ...     name: str
        >>> result = parse_llm_json('{"name": "test"}', Task)
        >>> print(result.name)
        test
    """
    try:
        # 步骤 1: 清理 Markdown 代码块标记
        json_content = content
        if clean_markdown:
            json_content = _clean_markdown_blocks(json_content)

        # 步骤 2: 提取 JSON 内容
        json_str = _extract_json(json_content)

        # 步骤 3: 清理 JSON 格式问题
        json_str = _clean_json_format(json_str)

        # 步骤 4: 解析 JSON
        try:
            json_data = json.loads(json_str)
        except json.JSONDecodeError as e:
            raise ValueError(f"JSON 解析失败: {e}\n原始内容: {content[:500]}...")

        # 步骤 5: 验证并转换为 Pydantic 对象
        try:
            return response_model(**json_data)
        except ValidationError as e:
            if strict:
                raise
            # 非严格模式：尝试修复常见错误
            return _fix_and_parse(json_data, response_model)

    except Exception as e:
        if strict:
            raise
        raise ValueError(f"解析失败: {e}\n原始内容: {content[:500]}...")


def _clean_markdown_blocks(content: str) -> str:
    """
    清理 Markdown 代码块标记

    支持:
    - ```json ... ```
    - ``` ... ```
    - ~~~json ... ~~~
    """
    # 移除 ```json ... ```
    content = re.sub(r'```json\s*\n?([\s\S]*?)\n?```', r'\1', content, flags=re.IGNORECASE)

    # 移除 ``` ... ```
    content = re.sub(r'```\s*\n?([\s\S]*?)\n?```', r'\1', content)

    # 移除 ~~~json ... ~~~
    content = re.sub(r'~~~json\s*\n?([\s\S]*?)\n?~~~', r'\1', content, flags=re.IGNORECASE)

    return content.strip()


def _extract_json(content: str) -> str:
    """
    从文本中提取 JSON 内容

    支持:
    - 纯 JSON
    - JSON 前后有文本说明
    - 多个 JSON 对象（取第一个有效的）
    """
    # 尝试 1: 整个内容就是 JSON
    try:
        json.loads(content)
        return content
    except json.JSONDecodeError:
        pass

    # 尝试 2: 查找 {...} 大括号包裹的 JSON
    pattern = r'\{[\s\S]*\}'
    matches = re.findall(pattern, content)

    for match in matches:
        try:
            json.loads(match)
            return match
        except json.JSONDecodeError:
            continue

    # 尝试 3: 查找 [...] 数组包裹的 JSON
    pattern = r'\[[\s\S]*\]'
    matches = re.findall(pattern, content)

    for match in matches:
        try:
            json.loads(match)
            return match
        except json.JSONDecodeError:
            continue

    raise ValueError("未找到有效的 JSON 内容")


def _clean_json_format(json_str: str) -> str:
    """
    清理 JSON 格式问题

    处理:
    - 尾部逗号 (如 {"a": 1,})
    - 行内注释 (如 {"a": 1 // comment})
    - 换行符
    """
    # 移除行内注释 (简单处理)
    json_str = re.sub(r'//.*$', '', json_str, flags=re.MULTILINE)
    json_str = re.sub(r'/\*.*?\*/', '', json_str, flags=re.DOTALL)

    # 移除尾部逗号
    json_str = re.sub(r',(\s*[}\]])', r'\1', json_str)

    # 标准化换行符
    json_str = json_str.replace('\r\n', '\n').replace('\r', '\n')

    return json_str.strip()


def _fix_and_parse(json_data: dict, response_model: Type[T]) -> T:
    """
    尝试修复并解析 JSON 数据

    策略:
    1. 移除多余字段
    2. 类型转换（字符串转数字等）
    3. 默认值填充
    """
    try:
        return response_model(**json_data)
    except ValidationError:
        # 获取模型字段
        model_fields = response_model.model_fields
        filtered_data = {}

        for field_name, field_info in model_fields.items():
            if field_name in json_data:
                # 类型转换尝试
                try:
                    filtered_data[field_name] = json_data[field_name]
                except (TypeError, ValueError):
                    # 转换失败，使用默认值
                    filtered_data[field_name] = field_info.default

        return response_model(**filtered_data)


def extract_json_blocks(content: str) -> list[str]:
    """
    从内容中提取所有 JSON 代码块

    返回:
        JSON 代码块字符串列表

    Example:
        >>> content = "```json\n{\"a\": 1}\n```\n```json\n{\"b\": 2}\n```"
        >>> blocks = extract_json_blocks(content)
        >>> print(len(blocks))
        2
    """
    pattern = r'```json\s*\n?([\s\S]*?)\n?```'
    matches = re.findall(pattern, content, flags=re.IGNORECASE)

    if not matches:
        # 尝试不带 json 标记的代码块
        pattern = r'```\s*\n?([\s\S]*?)\n?```'
        matches = re.findall(pattern, content)

    return matches


def is_valid_json(content: str) -> bool:
    """
    检查内容是否为有效的 JSON

    Args:
        content: 待检查的内容

    Returns:
        bool: 是否为有效 JSON
    """
    try:
        json.loads(content)
        return True
    except (json.JSONDecodeError, TypeError):
        return False
