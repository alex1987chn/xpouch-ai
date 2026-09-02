"""
工具函数集合 - 时间查询和数学计算
"""

import ast
import math
import operator
from datetime import datetime

from langchain_core.tools import tool

# calculator 求值器：AST 节点 → 运算符映射（仅算术运算）
_BIN_OPS = {
    ast.Add: operator.add,
    ast.Sub: operator.sub,
    ast.Mult: operator.mul,
    ast.Div: operator.truediv,
    ast.FloorDiv: operator.floordiv,
    ast.Mod: operator.mod,
    ast.Pow: operator.pow,
}
_UNARY_OPS = {ast.UAdd: operator.pos, ast.USub: operator.neg}


class UnsafeExpressionError(ValueError):
    """数学表达式包含白名单之外的语法"""


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

    用于执行数学运算。输入必须是有效的数学表达式，如 "2 + 2"、"123 * 45"、"math.sqrt(16)" 等。

    ⚠️ 安全说明：表达式先经 AST 白名单校验、再由内置求值器逐节点计算（不使用 eval）。
    仅支持数字、算术运算、白名单内置函数（abs/round/min/max/sum/pow/int/float）
    和 math 模块函数，无法访问文件系统或执行任意代码。

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

    def compute(node: ast.AST):
        if isinstance(node, ast.Constant) and isinstance(node.value, int | float):
            return node.value
        if isinstance(node, ast.Name) and node.id in allowed_names:
            return allowed_names[node.id]
        if isinstance(node, ast.Attribute):
            # 仅允许 math 模块的成员（全是数学函数/常量，无属性逃逸面），
            # 阻断 math.sqrt.__globals__ 之类的受限沙箱逃逸链
            if not (isinstance(node.value, ast.Name) and node.value.id == "math"):
                raise UnsafeExpressionError("只允许访问 math 模块的成员")
            return getattr(math, node.attr)
        if isinstance(node, ast.Call):
            func = compute(node.func)
            if node.keywords or not callable(func):
                raise UnsafeExpressionError("不支持的调用形式")
            return func(*(compute(arg) for arg in node.args))
        if isinstance(node, ast.BinOp) and type(node.op) in _BIN_OPS:
            return _BIN_OPS[type(node.op)](compute(node.left), compute(node.right))
        if isinstance(node, ast.UnaryOp) and type(node.op) in _UNARY_OPS:
            return _UNARY_OPS[type(node.op)](compute(node.operand))
        raise UnsafeExpressionError(f"不允许的语法: {type(node).__name__}")

    try:
        tree = ast.parse(expression, mode="eval")
        result = compute(tree.body)

        # 格式化输出：如果是整数不显示小数点，否则保留合理精度
        if isinstance(result, float):
            # 去除不必要的小数点
            if result.is_integer():
                return str(int(result))
            else:
                # 最多保留 6 位小数
                return f"{result:.6f}".rstrip("0").rstrip(".")
        else:
            return str(result)

    except UnsafeExpressionError as e:
        return f"❌ 计算错误：{str(e)}"
    except ZeroDivisionError:
        return "❌ 计算错误：除数不能为零"
    except SyntaxError:
        return f"❌ 计算错误：表达式 '{expression}' 语法不正确"
    except (TypeError, ValueError) as e:
        return f"❌ 计算错误: {str(e)}"
    except Exception as e:
        return f"❌ 计算出错: {str(e)}"
