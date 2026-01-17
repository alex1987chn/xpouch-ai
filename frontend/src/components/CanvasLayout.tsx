import { useState } from 'react'
import { X, Sparkles } from 'lucide-react'
import { cn } from '@/lib/utils'
import TaskCanvas from './TaskCanvas'
import GlowingInput from './GlowingInput'
import ExpertDrawer from './ExpertDrawer'
import { useCanvasStore } from '@/store/canvasStore'

interface Message {
  id: string
  role: 'user' | 'assistant' | 'system'
  content: string
  timestamp: Date
}

export default function CanvasLayout() {
  const [inputValue, setInputValue] = useState('')
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'system',
      content: '我是 AI 任务拆解助手，可以将你的复杂任务拆解为可执行的子任务流程。请描述你想完成的任务。',
      timestamp: new Date()
    }
  ])
  const [isExpertDrawerOpen, setIsExpertDrawerOpen] = useState(false)
  const [selectedExpert, setSelectedExpert] = useState('')
  const { setMagicColor } = useCanvasStore()

  const handleSendMessage = () => {
    if (!inputValue.trim()) return

    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content: inputValue,
      timestamp: new Date()
    }

    setMessages(prev => [...prev, userMessage])
    setInputValue('')

    // 解析"魔法修改"指令
    const magicMatch = inputValue.match(/把(.*?)改成?(.*?)(?:色|颜色)?/i)
    if (magicMatch) {
      const color = magicMatch[2].trim()
      const colorMap: Record<string, string> = {
        '红': '#ef4444',
        '红色': '#ef4444',
        '蓝': '#3b82f6',
        '蓝色': '#3b82f6',
        '绿': '#22c55e',
        '绿色': '#22c55e',
        '黄': '#eab308',
        '黄色': '#eab308',
        '紫': '#8b5cf6',
        '紫色': '#8b5cf6',
        '粉': '#ec4899',
        '粉色': '#ec4899',
        '橙': '#f97316',
        '橙色': '#f97316'
      }
      
      if (colorMap[color]) {
        setMagicColor(colorMap[color])
        
        // 发送反馈
        setTimeout(() => {
          const feedback: Message = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: `✨ 已将左侧颜色改为 ${color}！`,
            timestamp: new Date()
          }
          setMessages(prev => [...prev, feedback])
        }, 500)
        return
      }
    }

    // 模拟 AI 响应
    setTimeout(() => {
      const aiResponse: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `收到任务：${inputValue}\\n\\n正在拆解任务中...`,
        timestamp: new Date()
      }
      setMessages(prev => [...prev, aiResponse])
    }, 500)
  }

  const handleExpertClick = (expertId: string) => {
    setSelectedExpert(expertId)
    setIsExpertDrawerOpen(true)
  }

  return (
    <div className="flex h-screen overflow-hidden bg-gray-50 dark:bg-gray-950">
      {/* 左侧画布区域 (70% 宽度） */}
      <div className="flex-[70%] h-full overflow-hidden relative">
        <TaskCanvas />
      </div>

      {/* 右侧对话区域 (30% 宽度） */}
      <div className="flex-[30%] h-full flex flex-col bg-white dark:bg-gray-900 border-l border-gray-200 dark:border-gray-800">
        {/* 对话头部 */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-800">
          <div>
            <h2 className="text-lg font-semibold text-gray-800 dark:text-gray-100">
              任务对话
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              与 AI 协同拆解任务
            </p>
          </div>
          <div className="flex items-center gap-2">
            {/* 魔法颜色快捷操作 */}
            <div className="flex items-center gap-1 bg-gradient-to-r from-purple-50 to-pink-50 dark:from-purple-900/30 dark:to-pink-900/30 px-2 py-1 rounded-lg">
              <Sparkles className="w-4 h-4 text-purple-600 dark:text-purple-400" />
              <span className="text-xs text-purple-600 dark:text-purple-400">
                魔法
              </span>
            </div>
            <button
              onClick={() => setIsExpertDrawerOpen(!isExpertDrawerOpen)}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors"
              title="查看专家详情"
            >
              <X className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        </div>

        {/* 消息列表 */}
        <div className="flex-1 overflow-y-auto p-4 space-y-4">
          {messages.map(msg => (
            <div
              key={msg.id}
              className={cn(
                'flex gap-3',
                msg.role === 'user' ? 'flex-row-reverse' : 'flex-row'
              )}
            >
              {/* 消息内容 */}
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl p-4',
                  msg.role === 'user'
                    ? 'bg-indigo-600 text-white'
                    : 'bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-100'
                )}
              >
                {msg.role === 'system' && (
                  <div className="text-xs text-gray-500 mb-2">
                    💡 {msg.content}
                  </div>
                )}
                {msg.role === 'assistant' && (
                  <div className="prose prose-sm dark:prose-invert max-w-none">
                    {msg.content.split('\\n').map((line, i) => (
                      <p key={i}>{line}</p>
                    ))}
                  </div>
                )}
                {msg.role === 'user' && (
                  <div className="whitespace-pre-wrap">{msg.content}</div>
                )}
              </div>
            </div>
          ))}
        </div>

        {/* 输入区域 */}
        <div className="p-4 border-t border-gray-200 dark:border-gray-800">
          <GlowingInput
            value={inputValue}
            onChange={setInputValue}
            onSubmit={handleSendMessage}
            placeholder="描述你的任务，AI 会帮你拆解..."
          />
        </div>
      </div>

      {/* 抽屉式专家详情 */}
      <ExpertDrawer
        isOpen={isExpertDrawerOpen}
        onClose={() => setIsExpertDrawerOpen(false)}
        expertName={selectedExpert || '专家'}
      />
    </div>
  )
}
