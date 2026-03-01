import { describe, it, expect, vi } from 'vitest'

// Mock dependencies
vi.mock('@/utils/logger', () => ({
  logger: {
    error: vi.fn(),
    warn: vi.fn(),
    debug: vi.fn(),
    info: vi.fn()
  }
}))

describe('Router Hooks Exports', () => {
  it('should export useRequireAuth hook', async () => {
    const { useRequireAuth } = await import('../hooks/useRequireAuth')
    expect(typeof useRequireAuth).toBe('function')
  })

  it('should export useCreateAgent hook', async () => {
    const { useCreateAgent } = await import('../hooks/useCreateAgent')
    expect(typeof useCreateAgent).toBe('function')
  })

  it('should export useEditAgent hook', async () => {
    const { useEditAgent } = await import('../hooks/useEditAgent')
    expect(typeof useEditAgent).toBe('function')
  })
})

describe('Router Wrappers Exports', () => {
  it('should export LoadingFallback', async () => {
    const { LoadingFallback } = await import('../components/LoadingFallback')
    expect(typeof LoadingFallback).toBe('function')
  })
})
