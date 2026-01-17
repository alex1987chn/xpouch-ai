import { useState } from 'react'
import { X, Clock, FileText, Code, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'

interface WorkflowStep {
  id: string
  title: string
  description: string
  duration: string
  status: 'pending' | 'running' | 'completed'
}

interface ExpertDrawerProps {
  isOpen: boolean
  onClose: () => void
  expertName: string
}

const mockWorkflows: Record<string, WorkflowStep[]> = {
  search: [
    {
      id: '1',
      title: '接收任务',
      description: '解析用户输入的任务描述',
      duration: '2s',
      status: 'completed'
    },
    {
      id: '2',
      title: '构建查询',
      description: '根据关键词构建搜索查询',
      duration: '3s',
      status: 'completed'
    },
    {
      id: '3',
      title: '执行搜索',
      description: '调用搜索 API 执行查询',
      duration: '5s',
      status: 'running'
    }
  ],
  analyzer: [
    {
      id: '1',
      title: '分析数据',
      description: '处理搜索结果，提取关键信息',
      duration: '8s',
      status: 'pending'
    },
    {
      id: '2',
      title: '生成报告',
      description: '汇总分析结果，输出结构化数据',
      duration: '5s',
      status: 'pending'
    }
  ],
  frontend: [
    {
      id: '1',
      title: '设计 UI 组件',
      description: '基于 Figma 设计稿实现 React 组件',
      duration: '15s',
      status: 'pending'
    }
  ]
}

export default function ExpertDrawer({ isOpen, onClose, expertName }: ExpertDrawerProps) {
  const [selectedWorkflow, setSelectedWorkflow] = useState<keyof typeof mockWorkflows>('search')

  const workflowSteps = mockWorkflows[selectedWorkflow] || []

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const statusBadge = (status: WorkflowStep['status']) => {
    const styles = {
      pending: 'bg-gray-100 text-gray-600 dark:bg-gray-800 dark:text-gray-400',
      running: 'bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400',
      completed: 'bg-green-100 text-green-600 dark:bg-green-900/30 dark:text-green-400'
    }
    return (
      <span className={cn('px-2 py-0.5 rounded-full text-xs font-medium', styles[status])}>
        {status === 'running' ? '进行中' : status === 'completed' ? '完成' : '等待'}
      </span>
    )
  }

  if (!isOpen) return null

  return (
    <>
      {/* 背景遮罩 */}
      <div
        className={cn(
          'fixed inset-0 bg-black/50 backdrop-blur-sm z-40 transition-opacity duration-300',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={handleOverlayClick}
      />

      {/* 抽屉内容 */}
      <div
        className={cn(
          'fixed right-0 top-0 h-full w-[30%] bg-white dark:bg-gray-900 shadow-2xl z-50 transition-transform duration-300 flex flex-col',
          isOpen ? 'translate-x-0' : 'translate-x-full'
        )}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
          <div>
            <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">
              {expertName}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              专家工作流详情
            </p>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
          >
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* 专家选择标签 */}
        <div className="flex gap-2 p-4 border-b border-gray-200 dark:border-gray-800 overflow-x-auto">
          {Object.keys(mockWorkflows).map(key => (
            <button
              key={key}
              onClick={() => setSelectedWorkflow(key as keyof typeof mockWorkflows)}
              className={cn(
                'px-4 py-2 rounded-lg font-medium transition-colors whitespace-nowrap',
                selectedWorkflow === key
                  ? 'bg-indigo-600 text-white'
                  : 'bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-gray-800 dark:text-gray-300 dark:hover:bg-gray-700'
              )}
            >
              {key === 'search' && '🔍 搜索专家'}
              {key === 'analyzer' && '📊 分析专家'}
              {key === 'frontend' && '🎨 前端专家'}
            </button>
          ))}
        </div>

        {/* 工作流时间线 */}
        <div className="flex-1 overflow-auto p-6">
          <div className="relative">
            {/* 连接线 */}
            <div className="absolute left-4 top-0 bottom-0 w-0.5 bg-gray-300 dark:bg-gray-700" />

            {/* 步骤列表 */}
            <div className="space-y-6 ml-10">
              {workflowSteps.map((step, index) => (
                <div key={step.id} className="relative">
                  {/* 步骤节点 */}
                  <div className="relative z-10 bg-white dark:bg-gray-900 rounded-lg border-2 border-gray-200 dark:border-gray-700 p-4 hover:shadow-lg transition-shadow">
                    <div className="flex items-start gap-3">
                      <div className="flex-shrink-0">
                        {step.status === 'pending' && (
                          <div className="w-8 h-8 rounded-full bg-gray-100 dark:bg-gray-800 flex items-center justify-center text-gray-400">
                            <Clock className="w-4 h-4" />
                          </div>
                        )}
                        {step.status === 'running' && (
                          <div className="w-8 h-8 rounded-full bg-blue-500 flex items-center justify-center text-white animate-pulse">
                            <Zap className="w-4 h-4" />
                          </div>
                        )}
                        {step.status === 'completed' && (
                          <div className="w-8 h-8 rounded-full bg-green-500 flex items-center justify-center text-white">
                            <FileText className="w-4 h-4" />
                          </div>
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between mb-2">
                          <h4 className="font-semibold text-gray-800 dark:text-gray-100">
                            {step.title}
                          </h4>
                          {statusBadge(step.status)}
                        </div>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {step.description}
                        </p>
                        <div className="flex items-center gap-2 mt-2 text-xs text-gray-500">
                          <Clock className="w-3 h-3" />
                          <span>{step.duration}</span>
                        </div>
                      </div>
                    </div>

                    {/* 连接线到下一步 */}
                    {index < workflowSteps.length - 1 && (
                      <div className="absolute left-[1.375rem] bottom-0 w-0.5 h-6 bg-gray-300 dark:bg-gray-700 transform -translate-y-full" />
                    )}
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
