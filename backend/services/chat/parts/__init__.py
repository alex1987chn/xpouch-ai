"""StreamService 拆分子模块（P3-2 增量拆分，2026-09-27 全异步化后重组）。

- event_builders: SSE 事件构建助手 mixin（心跳线、取消/超时守卫、进度同步）
- persistence: 落库与状态写路径 mixin（结果落库、任务/产物收集、计划与 run 状态）
- event_transform: LangGraph token → SSE 线格式纯转换 mixin
- stream_pipeline: 共享管道四件套（事件出口/producer 外壳/消费循环/断连语义）

组合方式：StreamService(EventBuildersMixin, PersistenceMixin, EventTransformMixin)。
测试可用 StreamService.__new__(StreamService) 直调 Mixin 方法（不触 db）。
"""
