"""
Library 默认模板

每个模板定义包含：
- starter_prompt: 用户点击使用后注入聊天框的默认提示
- system_hint: 系统提示，指导 Agent 行为
- expected_artifact_types: 预期产出物类型列表
- artifact_schema_hint: 产出物结构提示，指导 Agent 如何组织产出
"""

TEMPLATE_DEFAULTS = [
    {
        "template_key": "travel-route-brief",
        "name": "出行路线简报",
        "description": "规划出行路线，比较多种交通方案，生成可视化路线报告。",
        "category": "travel",
        "starter_prompt": "请帮我规划从【起点】到【终点】的出行路线，比较地铁、公交、打车和步行方案，给出时间、费用对比和推荐建议。",
        "system_hint": "作为出行规划专家，你需要：1) 搜索实时路况和交通信息；2) 对比多种方案的时间和费用；3) 给出明确推荐和注意事项。",
        "recommended_mode": "complex",
        "suggested_tags": ["travel", "route", "real-time"],
        "tool_hints": ["search_web", "read_webpage"],
        "expected_artifact_types": ["markdown", "html"],
        "artifact_schema_hint": """产出物应包含：
# 出行路线报告

## 方案对比
| 方案 | 预计时间 | 预计费用 | 便捷度 | 推荐指数 |
|------|----------|----------|--------|----------|
| 地铁 | XX分钟 | XX元 | ⭐⭐⭐⭐ | ⭐⭐⭐⭐⭐ |
| 打车 | XX分钟 | XX元 | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ |
| ... | ... | ... | ... | ... |

## 推荐方案
明确推荐一种方案，并说明理由

## 注意事项
- 高峰期建议
- 换乘提示
- 备选方案""",
        "is_active": True,
        "is_builtin": True,
    },
    {
        "template_key": "research-report",
        "name": "研究结论报告",
        "description": "围绕主题进行深度研究，输出结构化研究报告。",
        "category": "research",
        "starter_prompt": "请围绕【研究主题】做一份结构化研究报告，包含背景、关键发现、对比分析、风险提示和结论建议。",
        "system_hint": "作为研究分析专家，你需要：1) 搜索相关资料和数据；2) 提取关键事实和观点；3) 进行对比分析；4) 给出有依据的结论。",
        "recommended_mode": "complex",
        "suggested_tags": ["research", "analysis", "report"],
        "tool_hints": ["search_web", "read_webpage"],
        "expected_artifact_types": ["markdown"],
        "artifact_schema_hint": """产出物应包含：
# 研究报告：【主题】

## 摘要
一句话概括核心发现

## 背景介绍
研究背景和问题定义

## 关键发现
- 发现1：...
- 发现2：...
- 发现3：...

## 对比分析
| 维度 | A | B | 结论 |
|------|---|---|------|
| ... | ... | ... | ... |

## 风险提示
潜在风险和不确定性

## 结论与建议
可执行的建议

## 参考来源
- [来源1](url)
- [来源2](url)""",
        "is_active": True,
        "is_builtin": True,
    },
    {
        "template_key": "writing-outline",
        "name": "写作大纲启动器",
        "description": "生成长文/小说的结构化大纲和开篇样章。",
        "category": "writing",
        "starter_prompt": "请为【写作主题/类型】创建一个完整的写作大纲，包含章节结构、核心冲突和人物关系，并撰写开篇样章。",
        "system_hint": "作为写作策划专家，你需要：1) 理解写作主题和目标读者；2) 设计章节结构和剧情走向；3) 创建人物设定；4) 撰写高质量开篇。",
        "recommended_mode": "complex",
        "suggested_tags": ["writing", "outline", "creative"],
        "tool_hints": [],
        "expected_artifact_types": ["markdown"],
        "artifact_schema_hint": """产出物应包含：
# 写作大纲：【主题】

## 核心设定
- 主题/核心冲突：...
- 目标读者：...
- 风格基调：...

## 人物设定
| 角色 | 定位 | 特点 | 关系 |
|------|------|------|------|
| ... | ... | ... | ... |

## 章节大纲
### 第一章：标题
- 剧情概要
- 关键事件
- 人物出场

### 第二章：标题
...

## 开篇样章
（800-1500字的开篇正文）""",
        "is_active": True,
        "is_builtin": True,
    },
    {
        "template_key": "code-generator",
        "name": "代码生成器",
        "description": "根据需求描述生成完整可运行的代码，包含注释和测试用例。",
        "category": "development",
        "starter_prompt": "请用【编程语言】实现以下功能：\n【功能描述】\n\n要求：代码结构清晰、注释完整、包含基本测试用例。",
        "system_hint": "作为代码生成专家，你需要：1) 理解功能需求和技术约束；2) 设计清晰的代码结构；3) 编写完整可运行的代码；4) 添加必要的注释和测试用例。",
        "recommended_mode": "complex",
        "suggested_tags": ["code", "development", "programming"],
        "tool_hints": [],
        "expected_artifact_types": ["code"],
        "artifact_schema_hint": """产出物应包含：
```【language】
# 【功能名称】
#
# 功能描述：...
# 作者：AI Assistant
# 日期：YYYY-MM-DD

# ============================================
# 依赖导入
# ============================================
import ...

# ============================================
# 核心实现
# ============================================
class/function ...

# ============================================
# 测试用例
# ============================================
def test_...():
    ...

if __name__ == "__main__":
    # 使用示例
    ...
```""",
        "is_active": True,
        "is_builtin": True,
    },
]
