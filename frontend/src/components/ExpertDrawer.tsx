import { useState } from 'react'
import { X, Clock, FileText, Code, Zap } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useTranslation } from '@/i18n'
import { Badge } from '@/components/ui/badge'
import { ScrollArea } from '@/components/ui/scroll-area'

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

export default function ExpertDrawer({ isOpen, onClose, expertName }: ExpertDrawerProps) {
  const { t } = useTranslation()

  const getMockWorkflows = (): Record<string, WorkflowStep[]> => ({
    search: [
      {
        id: '1',
        title: t('receiveTask'),
        description: t('receiveTaskDesc'),
        duration: '2s',
        status: 'completed'
      },
      {
        id: '2',
        title: t('buildQuery'),
        description: t('buildQueryDesc'),
        duration: '3s',
        status: 'completed'
      },
      {
        id: '3',
        title: t('executeSearch'),
        description: t('executeSearchDesc'),
        duration: '5s',
        status: 'running'
      }
    ],
    analyzer: [
      {
        id: '1',
        title: t('analyzeData'),
        description: t('analyzeDataDesc'),
        duration: '8s',
        status: 'pending'
      },
      {
        id: '2',
        title: t('generateReport'),
        description: t('generateReportDesc'),
        duration: '5s',
        status: 'pending'
      }
    ],
    frontend: [
      {
        id: '1',
        title: t('designUI'),
        description: t('designUIDesc'),
        duration: '15s',
        status: 'pending'
      }
    ]
  })

  const [selectedWorkflow, setSelectedWorkflow] = useState<keyof ReturnType<typeof getMockWorkflows>>('search')
  const mockWorkflows = getMockWorkflows()

  const workflowSteps = mockWorkflows[selectedWorkflow] || []

  const handleOverlayClick = (e: React.MouseEvent) => {
    if (e.target === e.currentTarget) {
      onClose()
    }
  }

  const statusBadge = (status: WorkflowStep['status']) => {
    const variant = {
      pending: 'secondary' as const,
      running: 'default' as const,
      completed: 'default' as const
    }
    const statusText = {
      pending: t('pending'),
      running: t('running'),
      completed: t('completed')
    }
    const colors = {
      pending: '',
      running: 'bg-blue-500 hover:bg-blue-600',
      completed: 'bg-green-500 hover:bg-green-600'
    }
    return (
      <Badge
        variant={status === 'pending' ? 'secondary' : 'default'}
        className={cn(
          'text-xs font-medium',
          status !== 'pending' && colors[status]
        )}
      >
        {statusText[status]}
      </Badge>
    )
  }

  if (!isOpen) return null

  return (
    <>
      {/* 背景遮罩 */}
      <div
        className={cn(
          'fixed inset-0 bg-black/50 backdrop-blur-sm z-[300] transition-opacity duration-300',
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        )}
        onClick={handleOverlayClick}
      />

      {/* 抽屉内容 - PC端：在窗口宽度减去侧边栏的区域内居中（使用calc动态计算） */}
      <div
        className={cn(
          'fixed h-full w-[30%] max-w-[30%] bg-white dark:bg-gray-900 shadow-2xl z-[300] transition-all duration-300 flex flex-col',
          isOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-full',
          // PC端：使用left/right居中，考虑侧边栏宽度
          'hidden md:flex md:left-1/2 md:right-auto md:top-0 md:bottom-0 md:translate-x-0',
          // 移动端：全屏，固定right
          'fixed right-0 top-0'
        )}
      >
        {/* 头部 */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-800">
          <div>
            <h3 className="text-xl font-bold text-gray-800 dark:text-gray-100">
              {expertName}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
              {t('expertWorkflowDetails')}
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
              {key === 'search' && `🔍 ${t('searchExpert')}`}
              {key === 'analyzer' && `📊 ${t('analyzerExpert')}`}
              {key === 'frontend' && `🎨 ${t('frontendExpert')}`}
            </button>
          ))}
        </div>

        {/* 工作流时间线 */}
        <ScrollArea className="flex-1 p-6">
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
        </ScrollArea>
      </div>
    </>
  )
}
