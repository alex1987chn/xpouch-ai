"""RunStreamHub 测试：seq 注入 / 重放 / 广播 / 关闭 / LRU 淘汰。"""

import asyncio

from services.chat.stream_hub import RunStreamHub


def test_publish_assigns_ordered_seq_ids():
    hub = RunStreamHub()
    w1 = hub.publish("run-1", "event: message.delta\ndata: {}\n\n")
    w2 = hub.publish("run-1", "event: message.delta\ndata: {}\n\n")
    assert w1.startswith("id: 1\n")
    assert w2.startswith("id: 2\n")


def test_publish_replaces_existing_id():
    hub = RunStreamHub()
    wire = hub.publish("run-1", "id: old-uuid\nevent: message.delta\ndata: {}\n\n")
    assert wire.startswith("id: 1\nevent: message.delta")


def test_subscribe_replays_backlog_and_follows_live():
    hub = RunStreamHub()
    hub.publish("run-1", "event: a\ndata: {}\n\n")
    hub.publish("run-1", "event: b\ndata: {}\n\n")

    sub = hub.subscribe("run-1", after_seq=1)
    assert sub is not None
    backlog, queue, closed = sub
    assert [w for _s, w in backlog] == ["id: 2\nevent: b\ndata: {}\n\n"]
    assert closed is False

    hub.publish("run-1", "event: c\ndata: {}\n\n")
    item = queue.get_nowait()
    assert item is not None and item[0] == 3


def test_close_sends_sentinel_and_marks_closed():
    hub = RunStreamHub()
    hub.publish("run-1", "event: a\ndata: {}\n\n")
    sub = hub.subscribe("run-1", after_seq=0)
    assert sub is not None
    _backlog, queue, _closed = sub

    hub.close("run-1")
    assert queue.get_nowait() is None

    # 关闭后再 subscribe：closed=True，无新订阅者
    sub2 = hub.subscribe("run-1", after_seq=0)
    assert sub2 is not None and sub2[2] is True


def test_subscribe_unknown_run_returns_none():
    assert RunStreamHub().subscribe("ghost", 0) is None


def test_lru_eviction():
    hub = RunStreamHub(max_runs=2)
    hub.publish("run-a", "event: x\ndata: {}\n\n")
    hub.publish("run-b", "event: x\ndata: {}\n\n")
    hub.publish("run-c", "event: x\ndata: {}\n\n")
    # run-a 最旧且未被访问，被淘汰
    assert hub.subscribe("run-a", 0) is None
    assert hub.subscribe("run-b", 0) is not None


def test_backlog_window_drops_old_events():
    hub = RunStreamHub()
    for i in range(5):
        hub.publish("run-1", f"event: e{i}\ndata: {{}}\n\n")
    sub = hub.subscribe("run-1", after_seq=3)
    assert sub is not None
    backlog, _q, _closed = sub
    assert [seq for seq, _w in backlog] == [4, 5]


def test_asyncio_queue_wait():
    async def _flow():
        hub = RunStreamHub()
        hub.publish("run-1", "event: a\ndata: {}\n\n")
        sub = hub.subscribe("run-1", after_seq=0)
        assert sub is not None
        _backlog, queue, _closed = sub
        await asyncio.sleep(0)
        hub.publish("run-1", "event: b\ndata: {}\n\n")
        item = await asyncio.wait_for(queue.get(), timeout=1)
        assert item[0] == 2

    asyncio.run(_flow())
