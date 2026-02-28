/**
 * ExpertAdminPage - 专家管理页面
 * 
 * [职责]
 * 容器组件，仅负责：
 * - 数据获取（useQuery）
 * - 状态管理（selectedId, dialog状态）
 * - 布局组合（ExpertListTable + ExpertEditor）
 * 
 * [极致拆分原则]
 * 所有展示逻辑下沉到子组件，本文件控制在 150 行以内
 */

import { useState, useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from '@/i18n'
import { cn } from '@/lib/utils'
import { useUserStore } from '@/store/userStore'

import {
  getAllExperts,
  updateExpert,
  createExpert,
  deleteExpert,
  generateExpertDescription,
  type SystemExpert,
  type CreateExpertRequest,
  type UpdateExpertRequest,
} from '@/services/admin'
import { logger } from '@/utils/logger'

// 子组件
import ExpertListTable from '@/components/admin/ExpertListTable'
import ExpertEditor from '@/components/admin/ExpertEditor'
import ExpertFormDialog from '@/components/admin/ExpertFormDialog'
import DeleteConfirmDialog from '@/components/admin/DeleteConfirmDialog'

// Toast 组件
function BauhausToast({
  message,
  type,
}: {
  message: string
  type: 'success' | 'error'
}) {
  return (
    <div
      className={cn(
        'fixed bottom-4 right-4 z-50 px-4 py-3 border-2 shadow-[rgb(var(--shadow-color))_4px_4px_0_0] font-mono text-xs font-bold uppercase',
        type === 'success'
          ? 'border-green-500 bg-green-50 text-green-700'
          : 'border-red-500 bg-red-50 text-red-700'
      )}
    >
      {message}
    </div>
  )
}

export default function ExpertAdminPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // Toast 状态
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' } | null>(null)

  // 搜索和选中状态
  const [searchQuery, setSearchQuery] = useState('')
  const [selectedExpertKey, setSelectedExpertKey] = useState<string | null>(null)

  // 对话框状态
  const [isCreateDialogOpen, setIsCreateDialogOpen] = useState(false)
  const [isDeleteDialogOpen, setIsDeleteDialogOpen] = useState(false)
  const [expertToDelete, setExpertToDelete] = useState<SystemExpert | null>(null)

  // 操作状态
  const [isSaving, setIsSaving] = useState(false)
  const [isCreating, setIsCreating] = useState(false)
  const [isGeneratingDescription, setIsGeneratingDescription] = useState(false)
  const [isDeleting, setIsDeleting] = useState(false)

  // 获取登录状态
  const isAuthenticated = useUserStore(state => state.isAuthenticated)

  // 查询专家列表（只有登录后才发起请求）
  const { data: experts = [], isLoading: isLoadingExperts, error: expertsError } = useQuery({
    queryKey: ['experts'],
    queryFn: getAllExperts,
    enabled: isAuthenticated,
    retry: (failureCount, error: any) => {
      // 401 未授权不 retry
      if (error?.status === 401) return false
      return failureCount < 2
    },
  })

  // 处理查询错误
  useEffect(() => {
    if (expertsError) {
      logger.error('Failed to load experts:', expertsError)
      setToast({ message: (t as any)('loadExpertsFailed'), type: 'error' })
    }
  }, [expertsError, t])

  // 从列表中获取选中的专家详情（避免重复查询）
  const selectedExpert = selectedExpertKey
    ? experts.find((e) => e.expert_key === selectedExpertKey) || null
    : null

  // 选择专家
  const handleSelectExpert = useCallback((expertKey: string) => {
    setSelectedExpertKey(expertKey)
  }, [])

  // 自动生成描述
  const handleGenerateDescription = useCallback(async (systemPrompt: string): Promise<string> => {
    if (!systemPrompt || systemPrompt.length < 10) {
      throw new Error('System prompt too short')
    }

    setIsGeneratingDescription(true)
    try {
      const result = await generateExpertDescription({
        system_prompt: systemPrompt,
      })
      setToast({ message: (t as any)('descriptionGenerated'), type: 'success' })
      return result.description
    } catch (error) {
      logger.error('Failed to generate description:', error)
      setToast({ message: (t as any)('generateDescriptionFailed'), type: 'error' })
      throw error
    } finally {
      setIsGeneratingDescription(false)
    }
  }, [t])

  // 保存配置
  const handleSave = useCallback(async (data: UpdateExpertRequest) => {
    if (!selectedExpert) return

    setIsSaving(true)
    try {
      await updateExpert(selectedExpert.expert_key, data)
      queryClient.invalidateQueries({ queryKey: ['experts'] })
      queryClient.invalidateQueries({ queryKey: ['expert', selectedExpert.expert_key] })
      setToast({ message: (t as any)('saveSuccess'), type: 'success' })
    } catch (error) {
      logger.error('Failed to update expert:', error)
      setToast({ message: (t as any)('saveFailed'), type: 'error' })
    } finally {
      setIsSaving(false)
    }
  }, [selectedExpert, queryClient, t])

  // 创建专家
  const handleCreateExpert = useCallback(
    async (data: CreateExpertRequest | UpdateExpertRequest) => {
      // 创建模式需要 CreateExpertRequest
      if (!('expert_key' in data)) return
      const createData = data as CreateExpertRequest
      
      setIsCreating(true)
      try {
        await createExpert(createData)
        queryClient.invalidateQueries({ queryKey: ['experts'] })
        setToast({ message: (t as any)('createSuccess'), type: 'success' })
        setIsCreateDialogOpen(false)
        setSelectedExpertKey(createData.expert_key)
      } catch (error) {
        logger.error('Failed to create expert:', error)
        setToast({ message: (t as any)('createFailed'), type: 'error' })
      } finally {
        setIsCreating(false)
      }
    },
    [queryClient, t]
  )

  // 打开删除对话框
  const handleOpenDeleteDialog = useCallback(
    (expert: SystemExpert, e: React.MouseEvent) => {
      e.stopPropagation()
      if (!expert.is_dynamic) {
        setToast({ message: (t as any)('cannotDeleteSystemExpert'), type: 'error' })
        return
      }
      setExpertToDelete(expert)
      setIsDeleteDialogOpen(true)
    },
    [t]
  )

  // 删除专家
  const handleDeleteExpert = useCallback(async () => {
    if (!expertToDelete) return

    setIsDeleting(true)
    try {
      await deleteExpert(expertToDelete.expert_key)
      queryClient.invalidateQueries({ queryKey: ['experts'] })
      if (selectedExpertKey === expertToDelete.expert_key) {
        setSelectedExpertKey(null)
      }
      setToast({ message: (t as any)('deleteSuccess'), type: 'success' })
      setIsDeleteDialogOpen(false)
    } catch (error) {
      logger.error('Failed to delete expert:', error)
      setToast({ message: (t as any)('deleteFailed'), type: 'error' })
    } finally {
      setIsDeleting(false)
      setExpertToDelete(null)
    }
  }, [expertToDelete, selectedExpertKey, queryClient, t])

  // 刷新列表
  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['experts'] })
    setToast({ message: (t as any)('refreshSuccess'), type: 'success' })
  }, [queryClient, t])

  if (isLoadingExperts) {
    return (
      <div className="flex items-center justify-center h-96">
        <div className="w-8 h-8 border-2 border-border-default border-t-[var(--accent-hover)] animate-spin" />
        <span className="ml-3 font-mono text-sm text-content-secondary">{(t as any)('loading')}</span>
      </div>
    )
  }

  return (
    <div className="flex gap-4 h-[100dvh] p-4 bg-surface-page">
      {/* Toast */}
      {toast && (
        <BauhausToast
          message={toast.message}
          type={toast.type}
        />
      )}

      {/* 创建专家对话框 */}
      <ExpertFormDialog
        mode="create"
        isOpen={isCreateDialogOpen}
        isSubmitting={isCreating}
        onSubmit={handleCreateExpert}
        onClose={() => setIsCreateDialogOpen(false)}
      />

      {/* 删除确认对话框 */}
      <DeleteConfirmDialog
        isOpen={isDeleteDialogOpen}
        expert={expertToDelete}
        isDeleting={isDeleting}
        onConfirm={handleDeleteExpert}
        onClose={() => setIsDeleteDialogOpen(false)}
      />

      {/* 左侧：专家列表 */}
      <ExpertListTable
        experts={experts}
        selectedExpertKey={selectedExpertKey}
        searchQuery={searchQuery}
        isLoading={isLoadingExperts}
        onSelectExpert={handleSelectExpert}
        onDeleteExpert={handleOpenDeleteDialog}
        onSearchChange={setSearchQuery}
        onRefresh={handleRefresh}
        onCreateClick={() => setIsCreateDialogOpen(true)}
      />

      {/* 右侧：编辑器 - 使用 key 模式重置表单 */}
      <ExpertEditor
        key={selectedExpert?.expert_key || 'empty'}
        expert={selectedExpert || null}
        isSaving={isSaving}
        isGeneratingDescription={isGeneratingDescription}
        onSave={handleSave}
        onGenerateDescription={handleGenerateDescription}
        onShowToast={(message, type) => setToast({ message, type })}
      />
    </div>
  )
}
