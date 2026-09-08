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
import { Skeleton } from '@/components/ui/skeleton'
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
import { DeleteConfirmDialog } from '@/components/settings/DeleteConfirmDialog'

// Toast 组件
function BauhausToast({
  message,
  type,
}: {
  message: string
  type: 'success' | 'error' | 'warning'
}) {
  return (
    <div
      className={cn(
        'fixed bottom-4 right-4 z-50 px-4 py-3 border-2 shadow-theme-card font-mono text-xs font-bold uppercase',
        type === 'success'
          ? 'border-status-online bg-status-online/10 text-content-primary'
          : 'border-status-offline bg-status-offline/10 text-content-primary'
      )}
    >
      {message}
    </div>
  )
}

function isStatusError(error: unknown): error is { status?: number } {
  return typeof error === 'object' && error !== null && 'status' in error
}

export default function ExpertAdminPage() {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // Toast 状态
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'error' | 'warning' } | null>(null)

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

  // 获取登录状态和管理员权限
  const isAuthenticated = useUserStore(state => state.isAuthenticated)
  const user = useUserStore(state => state.user)
  const isAdmin = user?.role === 'admin'

  // 查询专家列表（只有登录后才发起请求）
  const { data: experts = [], isLoading: isLoadingExperts, error: expertsError } = useQuery({
    queryKey: ['experts'],
    queryFn: getAllExperts,
    enabled: isAuthenticated,
    retry: (failureCount, error: unknown) => {
      // 401 未授权不 retry
      if (isStatusError(error) && error.status === 401) return false
      return failureCount < 2
    },
  })

  // 处理查询错误
  useEffect(() => {
    if (expertsError) {
      logger.error('Failed to load experts:', expertsError)
      setToast({ message: t('loadExpertsFailed'), type: 'error' })
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
      setToast({ message: t('descriptionGenerated'), type: 'success' })
      return result.description
    } catch (error) {
      logger.error('Failed to generate description:', error)
      setToast({ message: t('generateDescriptionFailed'), type: 'error' })
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
      // 🔥 乐观锁：传入当前版本号
      const dataWithVersion = {
        ...data,
        expected_version: selectedExpert.config_version
      }
      await updateExpert(selectedExpert.expert_key, dataWithVersion)
      queryClient.invalidateQueries({ queryKey: ['experts'] })
      queryClient.invalidateQueries({ queryKey: ['expert', selectedExpert.expert_key] })
      setToast({ message: t('saveSuccess'), type: 'success' })
    } catch (error: any) {
      logger.error('Failed to update expert:', error)
      
      // 🔥 乐观锁冲突：配置已被他人修改
      if (error.status === 409) {
        // 自动刷新获取最新数据
        await queryClient.invalidateQueries({ queryKey: ['experts'] })
        await queryClient.invalidateQueries({ queryKey: ['expert', selectedExpert.expert_key] })
        setToast({ 
          message: '配置已被他人修改，已为您刷新最新数据，请确认后重试', 
          type: 'warning' 
        })
      } else {
        setToast({ message: t('saveFailed'), type: 'error' })
      }
    } finally {
      setIsSaving(false)
    }
  }, [selectedExpert, queryClient, t])

  // 创建专家
  const handleCreateExpert = useCallback(
    async (data: CreateExpertRequest | UpdateExpertRequest) => {
      // 创建模式需要 CreateExpertRequest
      if (!('expert_key' in data)) return
      const createData = data
      
      setIsCreating(true)
      try {
        await createExpert(createData)
        setToast({ message: t('createSuccess'), type: 'success' })
        setIsCreateDialogOpen(false)
        
        // 等待列表刷新完成后再选中新专家
        await queryClient.invalidateQueries({ queryKey: ['experts'] })
        
        // 选中新创建的专家（新专家会在列表底部）
        setSelectedExpertKey(createData.expert_key)
      } catch (error) {
        logger.error('Failed to create expert:', error)
        setToast({ message: t('createFailed'), type: 'error' })
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
        setToast({ message: t('cannotDeleteSystemExpert'), type: 'error' })
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
      setToast({ message: t('deleteSuccess'), type: 'success' })
      setIsDeleteDialogOpen(false)
    } catch (error) {
      logger.error('Failed to delete expert:', error)
      setToast({ message: t('deleteFailed'), type: 'error' })
    } finally {
      setIsDeleting(false)
      setExpertToDelete(null)
    }
  }, [expertToDelete, selectedExpertKey, queryClient, t])

  // 刷新列表
  const handleRefresh = useCallback(async () => {
    await queryClient.invalidateQueries({ queryKey: ['experts'] })
    setToast({ message: t('refreshSuccess'), type: 'success' })
  }, [queryClient, t])

  if (isLoadingExperts) {
    // 与下方两栏布局同构：左侧专家列表 + 右侧详情/编辑区
    return (
      <div className="flex flex-col lg:flex-row gap-4 h-[100dvh] p-4 bg-surface-page">
        <div className="lg:w-[320px] border-2 border-border-default bg-surface-card p-3 space-y-2">
          <Skeleton className="h-3.5 w-24" />
          {Array.from({ length: 6 }, (_, i) => (
            <Skeleton key={i} className="h-12 w-full" />
          ))}
        </div>
        <div className="flex-1 border-2 border-border-default bg-surface-card p-4 space-y-3">
          <Skeleton className="h-5 w-1/4" />
          <Skeleton className="h-3 w-2/3" />
          <Skeleton className="h-32 w-full" />
          <Skeleton className="h-3 w-1/2" />
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-col lg:flex-row gap-4 h-[100dvh] p-4 bg-surface-page overflow-y-auto lg:overflow-hidden">
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
        onClose={() => {
          setIsDeleteDialogOpen(false)
          setExpertToDelete(null)
        }}
        onConfirm={handleDeleteExpert}
        title={t('confirmDeleteExpert')}
        description={t('deleteExpertWarning').replace('{name}', expertToDelete?.name || '')}
        itemName={expertToDelete?.name}
        confirmText={t('delete')}
        isDeleting={isDeleting}
      />

      {/* 左侧：专家列表 */}
      <ExpertListTable
        experts={experts}
        selectedExpertKey={selectedExpertKey}
        searchQuery={searchQuery}
        isLoading={isLoadingExperts}
        isAdmin={isAdmin}
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
        isAdmin={isAdmin}
        isSaving={isSaving}
        isGeneratingDescription={isGeneratingDescription}
        onSave={handleSave}
        onGenerateDescription={handleGenerateDescription}
        onShowToast={(message, type) => setToast({ message, type })}
      />
    </div>
  )
}
