"""
Library 默认模板
"""

TEMPLATE_DEFAULTS = [
    {
        "template_key": "travel-route-brief",
        "name": "出行路线简报",
        "description": "适合距离、路线、出发建议与注意事项的复杂查询。",
        "category": "travel",
        "starter_prompt": "请帮我规划从当前位置到目标地点的出行路线，比较地铁、打车和步行方案，并给出时间与建议。",
        "system_hint": "优先整理为路线对比、时间、注意事项三段输出。",
        "recommended_mode": "complex",
        "suggested_tags": ["travel", "route", "real-time"],
        "tool_hints": ["search_web", "read_webpage"],
        "is_active": True,
        "is_builtin": True,
    },
    {
        "template_key": "research-report",
        "name": "研究结论报告",
        "description": "适合多来源调研、竞品分析和结构化结论输出。",
        "category": "research",
        "starter_prompt": "请围绕这个主题做一份结构化研究报告，包含背景、关键事实、对比、风险和结论建议。",
        "system_hint": "优先产出摘要、事实、对比、建议四段结构。",
        "recommended_mode": "complex",
        "suggested_tags": ["research", "analysis", "report"],
        "tool_hints": ["search_web", "read_webpage"],
        "is_active": True,
        "is_builtin": True,
    },
    {
        "template_key": "writing-outline",
        "name": "写作大纲启动器",
        "description": "适合小说、文章、长文策划与章节拆解。",
        "category": "writing",
        "starter_prompt": "请先给我一个完整的大纲，再写一个高质量开头，并说明后续章节推进思路。",
        "system_hint": "优先给出结构化章节大纲，再写开篇样章。",
        "recommended_mode": "complex",
        "suggested_tags": ["writing", "outline", "creative"],
        "tool_hints": ["calculator"],
        "is_active": True,
        "is_builtin": True,
    },
]
