/**
 * 专家显示名解析顺序（2026-09-13 收敛为「服务端名册优先」）。
 *
 * 为什么值得测：这条顺序是"界面上显示谁在干活"的唯一依据，而它此前散在三处
 * （死掉的 translateExpertName、写死的词条、界面直接渲染 expert_type 原串）。
 * 顺序错了的表现很隐蔽——名字看着像对的，只是改名不生效、或自定义专家显示成一串 id。
 */

import { describe, expect, it, vi } from 'vitest'
import { resolveExpertLabel, expertLabel, EXPERT_TYPE_LABEL_KEY } from '../expertIdentity'

// t 桩：直接回词条 key，方便断言"走的是哪条分支"
const t = vi.fn((key: string) => `t:${key}`)

describe('resolveExpertLabel 的解析顺序', () => {
  it('名册优先——管理员改名即时生效，压过静态词条', () => {
    const catalogNames = new Map([['aggregator', '汇总专家']])
    expect(resolveExpertLabel('aggregator', { catalogNames }, t)).toBe('汇总专家')
    expect(t).not.toHaveBeenCalled()
  })

  it('名册没有时落静态词条（离线兜底，界面不退化成 slug）', () => {
    expect(resolveExpertLabel('search', {}, t)).toBe('t:searchExpert')
  })

  it('完全未知的类型原样返回（宁可不漂亮，也不要显示空白）', () => {
    expect(resolveExpertLabel('my-custom-expert', {}, t)).toBe('my-custom-expert')
  })

  it('名册里的空名字不算命中（不覆盖兜底）', () => {
    const catalogNames = new Map([['search', '']])
    expect(resolveExpertLabel('search', { catalogNames }, t)).toBe('t:searchExpert')
  })
})

describe('静态词条表', () => {
  it('覆盖编排链上的系统角色（计划最后一步真会落到 aggregator）', () => {
    expect(EXPERT_TYPE_LABEL_KEY.aggregator).toBe('aggregatorExpert')
    expect(EXPERT_TYPE_LABEL_KEY.planner).toBe('planningExpert')
  })

  it('expertLabel 对表外的 key 原样返回', () => {
    expect(expertLabel('unknown-x', t)).toBe('unknown-x')
  })
})
