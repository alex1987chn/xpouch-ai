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
      chatStore: {} as any,
      debug: false
    }
  })

  describe('handleArtifactGenerated', () => {
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
