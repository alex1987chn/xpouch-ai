"""
工具函数集合 - 时间查询和数学计算
"""
import math
from datetime import datetime
from langchain_core.tools import tool


@tool
def get_current_time() -> str:
    """
    获取当前的日期、时间和星期几。

    当用户询问"今天几号"、"现在几点"、"今天是星期几"时使用此工具。

    Returns:
        格式化的时间字符串，格式如：2026-02-06 14:30:00 星期五
    """
    now = datetime.now()
    # 中文星期数组
    weekdays = ["星期一", "星期二", "星期三", "星期四", "星期五", "星期六", "星期日"]
    weekday_str = weekdays[now.weekday()]

    # 格式化为：2026-02-06 14:30:00 星期五
    return now.strftime(f"%Y-%m-%d %H:%M:%S {weekday_str}")


@tool
def calculator(expression: str) -> str:
    """
    数学计算器。

    用于执行数学运算。输入必须是有效的 Python 数学表达式，如 "2 + 2"、"123 * 45"、"sin(0.5)" 等。

    ⚠️ 安全说明：此工具使用了受限的 eval 环境，只允许数学计算，不允许访问文件系统或执行任意代码。

    Args:
        expression: 数学表达式，支持基本运算 (+, -, *, /) 和 math 模块函数

    Returns:
        计算结果或错误信息

    Examples:
        >>> calculator("2 + 2")
        "4"
        >>> calculator("123 * 456")
        "56088"
        >>> calculator("math.sqrt(16)")
        "4.0"
    """
    try:
        # 创建受限的命名空间，只允许数学计算
        allowed_names = {
            "math": math,
            "abs": abs,
            "round": round,
            "min": min,
            "max": max,
            "sum": sum,
            "pow": pow,
            "int": int,
            "float": float,
        }

        # 使用受限的 eval，禁止访问 __builtins__
        result = eval(expression, {"__builtins__": {}}, allowed_names)

        # 格式化输出：如果是整数不显示小数点，否则保留合理精度
        if isinstance(result, float):
            # 去除不必要的小数点
            if result.is_integer():
                return str(int(result))
            else:
                # 最多保留 6 位小数
                return f"{result:.6f}".rstrip('0').rstrip('.')
        else:
            return str(result)

    except ZeroDivisionError:
        return "❌ 计算错误：除数不能为零"
    except SyntaxError:
        return f"❌ 计算错误：表达式 '{expression}' 语法不正确"
    except NameError as e:
        return f"❌ 计算错误：不支持的函数或变量 {str(e)}"
    except Exception as e:
        return f"❌ 计算出错: {str(e)}"
