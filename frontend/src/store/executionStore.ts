/**
 * 执行状态管理 Store (Execution Store)
 * 
 * [职责]
 * 管理 Complex 模式下的执行过程状态：
 * - 工作流状态 (planning/reviewing/executing/completed)
 * - 当前执行的专家
 * - 思考过程追踪
 * - 任务计划
 * 
 * [设计原则]
 * - 极简主义：只做状态存储，不做派生计算
 * - 不持久化：页面刷新后通过 API 恢复
 * - 直接映射：后端事件数据直接存储，不转换
 * 
 * [与 ChatStore 的关系]
 * - ChatStore: 存储用户对话和最终回复
 * - ExecutionStore: 存储执行过程状态
 * - 两者独立，通过事件同步
 */

import { create } from 'zustand'

// ============================================================================
// 类型定义
// ============================================================================

export type ExecutionStatus = 
  | 'idle'      // 空闲状态
  | 'planning'  // 正在生成计划
  | 'reviewing' // 等待用户确认计划
  | 'executing' // 正在执行专家任务
  | 'completed' // 执行完成

export interface Expert {
  id: string
  name: string
  type: string
  avatar?: string
}

export interface Task {
  id: string
  expertType: string
  description: string
  status: 'pending' | 'running' | 'completed' | 'failed'
  dependencies?: string[]
}

// ============================================================================
// Store 状态定义
// ============================================================================

interface ExecutionState {
  // 工作流状态
  status: ExecutionStatus
  
  // 当前执行的专家
  currentExpert: Expert | null
  
  // 思考过程追踪
  thinkingTrace: string[]
  
  // 任务计划
  plan: Task[]
  
  // 进度信息 (后端直接推送)
  progress: {
    current: number
    total: number
  } | null
}

interface ExecutionActions {
  // 设置工作流状态
  setStatus: (status: ExecutionStatus) => void
  
  // 设置当前专家
  setExpert: (expert: Expert | null) => void
  
  // 追加思考内容
  appendThinking: (content: string) => void
  
  // 清空思考内容
  clearThinking: () => void
  
  // 设置任务计划
  setPlan: (plan: Task[]) => void
  
  // 更新任务状态
  updateTaskStatus: (taskId: string, status: Task['status']) => void
  
  // 设置进度
  setProgress: (progress: { current: number; total: number } | null) => void
  
  // 重置所有状态
  reset: () => void
}

type ExecutionStore = ExecutionState & ExecutionActions

// ============================================================================
// 初始状态
// ============================================================================

const initialState: ExecutionState = {
  status: 'idle',
  currentExpert: null,
  thinkingTrace: [],
  plan: [],
  progress: null,
}

// ============================================================================
// Store 实现 (极简主义，不使用 Slice 模式)
// ============================================================================

export const useExecutionStore = create<ExecutionStore>()((set, get) => ({
  ...initialState,

  // 设置工作流状态
  setStatus: (status) => {
    set({ status })
  },

  // 设置当前专家
  setExpert: (expert) => {
    set({ currentExpert: expert })
  },

  // 追加思考内容
  appendThinking: (content) => {
    set((state) => ({
      thinkingTrace: [...state.thinkingTrace, content]
    }))
  },

  // 清空思考内容
  clearThinking: () => {
    set({ thinkingTrace: [] })
  },

  // 设置任务计划
  setPlan: (plan) => {
    set({ plan })
  },

  // 更新任务状态
  updateTaskStatus: (taskId, status) => {
    set((state) => ({
      plan: state.plan.map((task) =>
        task.id === taskId ? { ...task, status } : task
      )
    }))
  },

  // 设置进度
  setProgress: (progress) => {
    set({ progress })
  },

  // 重置所有状态
  reset: () => {
    set(initialState)
  },
}))

// ============================================================================
// 便捷 Hooks (遵循 React 最佳实践)
// ============================================================================

export const useExecutionStatus = () => 
  useExecutionStore((state) => state.status)

export const useCurrentExpert = () => 
  useExecutionStore((state) => state.currentExpert)

export const useThinkingTrace = () => 
  useExecutionStore((state) => state.thinkingTrace)

export const useExecutionPlan = () => 
  useExecutionStore((state) => state.plan)

export const useExecutionProgress = () => 
  useExecutionStore((state) => state.progress)

export const useExecutionActions = () => {
  const store = useExecutionStore()
  return {
    setStatus: store.setStatus,
    setExpert: store.setExpert,
    appendThinking: store.appendThinking,
    clearThinking: store.clearThinking,
    setPlan: store.setPlan,
    updateTaskStatus: store.updateTaskStatus,
    setProgress: store.setProgress,
    reset: store.reset,
  }
}

// 默认导出
export default useExecutionStore
