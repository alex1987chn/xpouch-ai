"""
通用 LLM JSON 响应解析器
支持多模型兼容性，处理各种 JSON 格式边缘情况
"""
import json
import re
from typing import TypeVar

from pydantic import BaseModel, ValidationError

from utils.logger import logger

T = TypeVar('T', bound=BaseModel)


def parse_llm_json(
    content: str,
    response_model: type[T],
    strict: bool = False,
    clean_markdown: bool = True
) -> T:
    """
    解析 LLM 返回的 JSON 响应，支持多种格式和边缘情况

    功能：
    1. 移除 Markdown 代码块标记（```json ... ```）
    2. 使用状态机修复字符串内部的未转义字符
    3. 验证 JSON 格式是否符合 Pydantic 模型

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
    """
    try:
        # 步骤 1: 清理 Markdown 代码块标记
        json_content = content
        if clean_markdown:
            json_content = _clean_markdown_blocks(json_content)

        # 步骤 2: 提取 JSON 内容
        json_str = _extract_json(json_content)

        # 步骤 3: 第一次尝试 - 直接解析（运气好的时候）
        try:
            json_data = json.loads(json_str, strict=False)
        except json.JSONDecodeError:
            # 🔥 步骤 4: 使用状态机修复字符串内部的未转义字符
            logger.warning("[JSON Parser] 直接解析失败，使用状态机修复...")
            repaired_str = _repair_json_string(json_str)
            try:
                json_data = json.loads(repaired_str, strict=False)
            except json.JSONDecodeError:
                # 步骤 5: 如果还是失败，尝试最后的暴力清理
                logger.warning("[JSON Parser] 状态机修复失败，尝试暴力清理...")
                final_str = _aggressive_clean(repaired_str)
                try:
                    json_data = json.loads(final_str, strict=False)
                except json.JSONDecodeError as e2:
                    error_pos = getattr(e2, 'pos', 0)
                    start = max(0, error_pos - 50)
                    end = min(len(final_str), error_pos + 50)
                    raise ValueError(
                        f"JSON 解析彻底失败: {e2}\n"
                        f"错误位置: {error_pos}, 附近内容: ...{final_str[start:end]}..."
                    )

        # 步骤 6: 验证并转换为 Pydantic 对象
        try:
            return response_model(**json_data)
        except ValidationError:
            if strict:
                raise
            # 非严格模式：尝试修复常见错误
            return _fix_and_parse(json_data, response_model)

    except Exception as e:
        if strict:
            raise
        raise ValueError(f"解析失败: {e}\n原始内容: {content[:500]}...")


def _repair_json_string(s: str) -> str:
    """
    🔥 使用状态机修复 JSON 字符串：
    1. 将字符串值内部的物理换行(\n)替换为 \\n
    2. 将字符串值内部的 Tab(\t)替换为 \\t
    3. 移除无效的控制字符
    
    这比正则更安全，因为它只在双引号内部进行替换
    """
    result = []
    in_string = False
    escape = False

    for char in s:
        # 1. 处理转义符 (比如 \")
        if char == '\\':
            escape = not escape  # 翻转转义状态
            result.append(char)
            continue

        # 2. 处理双引号 (切换字符串状态)
        if char == '"' and not escape:
            in_string = not in_string
            result.append(char)
            continue

        # 3. 处理字符串内部的特殊字符
        if in_string:
            if char == '\n':
                result.append('\\n')  # 强制转义换行
            elif char == '\t':
                result.append('\\t')  # 强制转义 Tab
            elif char == '\r':
                pass  # 忽略回车符
            elif ord(char) < 32:
                pass  # 忽略其他控制字符
            else:
                result.append(char)
        else:
            # 字符串外部：保留结构字符
            result.append(char)

        # 重置转义状态 (如果当前不是转义符)
        if escape:
            escape = False

    return "".join(result)


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
    # 尝试 1: 整个内容就是 JSON (使用宽容模式)
    try:
        json.loads(content, strict=False)
        return content
    except json.JSONDecodeError:
        pass

    # 尝试 2: 查找 {...} 大括号包裹的 JSON
    pattern = r'\{[\s\S]*\}'
    matches = re.findall(pattern, content)

    for match in matches:
        try:
            json.loads(match, strict=False)
            return match
        except json.JSONDecodeError:
            continue

    # 尝试 3: 查找 [...] 数组包裹的 JSON
    pattern = r'\[[\s\S]*\]'
    matches = re.findall(pattern, content)

    for match in matches:
        try:
            json.loads(match, strict=False)
            return match
        except json.JSONDecodeError:
            continue

    raise ValueError("未找到有效的 JSON 内容")


def _aggressive_clean(json_str: str) -> str:
    """
    暴力清理 - 当所有方法都失败时使用
    """
    # 1. 移除所有 ASCII 控制字符 (除了 \n \r \t)
    json_str = ''.join(c for c in json_str if ord(c) >= 32 or c in '\n\r\t')

    # 2. 替换 Unicode 特殊字符
    json_str = json_str.replace('\u00A0', ' ').replace('\uFEFF', '')

    # 3. 移除尾部逗号 (如 {"a": 1,})
    json_str = re.sub(r',(\s*[}\]])', r'\1', json_str)

    return json_str


def _fix_and_parse(json_data: dict, response_model: type[T]) -> T:
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
        json.loads(content, strict=False)
        return True
    except (json.JSONDecodeError, TypeError):
        return False
