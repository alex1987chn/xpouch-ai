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
      taskStore: {
        addArtifact: vi.fn(),
        selectTask: vi.fn(),
        selectedTaskId: null,
        tasks: new Map()
      } as any,
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

    it('应该添加产物到任务', () => {
      const event = {
        id: 'evt-1',
        type: 'artifact.generated' as const,
        data: {
          task_id: 'task-1',
          artifact: {
            id: 'art-1',
            type: 'code',
            content: 'console.log("hello")',
            title: 'test.js'
          }
        }
      }

      mockContext.taskStore.tasks.set('task-1', {
        id: 'task-1',
        artifacts: []
      })

      handleArtifactGenerated(event, mockContext)

      expect(mockContext.taskStore.addArtifact).toHaveBeenCalledWith(event.data)
    })

    it('当用户未选中任务时应该自动选中', () => {
      const event = {
        id: 'evt-1',
        type: 'artifact.generated' as const,
        data: {
          task_id: 'task-1',
          artifact: { id: 'art-1', type: 'code', content: 'test' }
        }
      }

      mockContext.taskStore.selectedTaskId = null
      mockContext.taskStore.tasks.set('task-1', {
        id: 'task-1',
        artifacts: [{ id: 'existing' }]
      })

      handleArtifactGenerated(event, mockContext)

      expect(mockContext.taskStore.selectTask).toHaveBeenCalledWith('task-1')
    })

    it('当用户已手动选中任务时不应该自动切换', () => {
      const event = {
        id: 'evt-1',
        type: 'artifact.generated' as const,
        data: {
          task_id: 'task-1',
          artifact: { id: 'art-1', type: 'code', content: 'test' }
        }
      }

      mockContext.taskStore.selectedTaskId = 'task-2'
      mockContext.taskStore.tasks.set('task-2', {
        id: 'task-2',
        artifacts: [{ id: 'existing' }]
      })

      handleArtifactGenerated(event, mockContext)

      expect(mockContext.taskStore.selectTask).not.toHaveBeenCalled()
    })

    it('当用户选中的任务无产物时应该自动切换', () => {
      const event = {
        id: 'evt-1',
        type: 'artifact.generated' as const,
        data: {
          task_id: 'task-1',
          artifact: { id: 'art-1', type: 'code', content: 'test' }
        }
      }

      mockContext.taskStore.selectedTaskId = 'task-2'
      mockContext.taskStore.tasks.set('task-2', {
        id: 'task-2',
        artifacts: []
      })

      handleArtifactGenerated(event, mockContext)

      expect(mockContext.taskStore.selectTask).toHaveBeenCalledWith('task-1')
    })
  })
})
