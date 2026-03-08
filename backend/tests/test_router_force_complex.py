from agents.nodes.router import _get_forced_complex_reason


def test_force_complex_for_travel_route_query():
    reason = _get_forced_complex_reason(
        "看下杭州钱塘区金沙天街离着我现在的江滨地铁站有多远，我得怎么过去"
    )

    assert reason == "deterministic_travel_planning"


def test_force_complex_for_realtime_query():
    reason = _get_forced_complex_reason("帮我查一下今天杭州天气和最新空气质量")

    assert reason == "deterministic_complex_keyword"


def test_non_complex_smalltalk_not_forced():
    reason = _get_forced_complex_reason("你好，今天心情怎么样？")

    assert reason is None
