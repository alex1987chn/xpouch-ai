<!-- 标题建议格式：type(scope): 摘要，如 feat(artifacts): 支持产物重命名 -->

## 变更说明

<!-- 做了什么、为什么（关联 issue 请写 Fixes #xxx） -->

## 变更类型

- [ ] 新功能
- [ ] Bug 修复
- [ ] 重构（不改行为）
- [ ] 文档
- [ ] 其他

## 自查清单

- [ ] 后端：`uv run ruff check .` 与 `uv run pytest tests/ -q` 通过
- [ ] 前端：`pnpm run lint`、`npx tsc --noEmit`、`pnpm run build` 通过
- [ ] 涉及 UI：遵循 [DESIGN.md](./DESIGN.md)（语义 token、i18n 三语、骨架屏/空态）
- [ ] 涉及接口：鉴权与权限守卫已考虑，schema 进 `schemas/`
