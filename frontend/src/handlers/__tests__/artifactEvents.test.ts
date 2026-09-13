import { describe, it, expect, vi, beforeEach } from 'vitest'
import { handleArtifactGenerated } from '../artifactEvents'
import type { HandlerContext } from '../types'

// Mock logger
vi.mock('@/utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    info: vi.fn()
  }
}))

describe('Artifact Events', () => {
  let mockContext: HandlerContext

  beforeEach(() => {
    mockContext = {
      // 2026-09-13 清理后，artifact 处理器**不写本地 store**：产物真相在服务端
      // （ArtifactCanvas 走 /artifacts 查询），这里只把它挂到思考步骤上。
      // 因此 taskStore 桩是空的——留着它只是为了满足 HandlerContext 的形状。
      taskStore: {} as any,
      chatStore: {
        // 现被 handleArtifactGenerated 使用（把产物挂到对应思考步骤上）；
        // 桩必须给出 messages / updateMessageMetadata，否则读 messages.length 抛错
        messages: [],
        updateMessageMetadata: vi.fn()
      } as any,
      debug: false
    }
  })

  describe('handleArtifactGenerated', () => {
    it('应该把产物挂到对应任务的思考步骤上（内联卡片数据源）', () => {
      const updateMessageMetadata = vi.fn()
      mockContext.chatStore = {
        messages: [
          {
            id: 'msg-1',
            role: 'assistant',
            metadata: {
              thinking: [
                { id: 'task-1', content: '', status: 'running' },
                { id: 'task-2', content: '', status: 'completed' }
              ]
            }
          }
        ],
        updateMessageMetadata
      } as any

      handleArtifactGenerated(
        {
          id: 'evt-attach',
          type: 'artifact.generated' as const,
          data: {
            task_id: 'task-1',
            artifact: { id: 'art-1', type: 'markdown', content: '# x', title: '报告' }
          }
        } as any,
        mockContext
      )

      expect(updateMessageMetadata).toHaveBeenCalledTimes(1)
      const passed = updateMessageMetadata.mock.calls[0][1].thinking
      expect(passed[0].artifacts).toEqual([
        { id: 'art-1', type: 'markdown', title: '报告' }
      ])
      expect(passed[1].artifacts).toBeUndefined() // 其它步骤不受影响
    })

    it('重复的 artifact.generated 不应重复挂卡（幂等）', () => {
      const updateMessageMetadata = vi.fn()
      mockContext.chatStore = {
        messages: [
          {
            id: 'msg-1',
            role: 'assistant',
            metadata: {
              thinking: [
                {
                  id: 'task-1',
                  content: '',
                  status: 'completed',
                  artifacts: [{ id: 'art-1', type: 'markdown', title: '报告' }]
                }
              ]
            }
          }
        ],
        updateMessageMetadata
      } as any

      handleArtifactGenerated(
        {
          id: 'evt-dup',
          type: 'artifact.generated' as const,
          data: {
            task_id: 'task-1',
            artifact: { id: 'art-1', type: 'markdown', content: '# x', title: '报告' }
          }
        } as any,
        mockContext
      )

      expect(updateMessageMetadata).not.toHaveBeenCalled()
    })

    it('不再写本地任务副本（产物真相在服务端）', () => {
      const event = {
        id: 'evt-1',
        type: 'artifact.generated' as const,
        data: {
          task_id: 'task-1',
          artifact: { id: 'art-1', type: 'code', content: 'test' }
        }
      }

      // 处理器只碰 chatStore（挂思考步骤）——taskStore 上一片死数据都不写。
      // 曾经的 addArtifact / selectTask（智能选中）连同 tasks Map 一起删除：
      // 它们只写不读，且「选中」没有任何 UI 消费者。
      expect(() => handleArtifactGenerated(event, mockContext)).not.toThrow()
      expect(Object.keys(mockContext.taskStore)).toEqual([])
    })
  })
})
