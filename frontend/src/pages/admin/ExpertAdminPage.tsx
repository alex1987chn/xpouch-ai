/**
 * ExpertAdminPage - 专家管理（卡片式）
 *
 * 蓝本 expert-grid 语法：auto-fill 卡片栅格（识别色头像 + 名称 + 描述 +
 * 模型 chip）+ 虚线「新建专家」卡。
 * 交互：点卡片进入编辑视图（复用 ExpertEditor，返回按钮回到栅格）；
 * ＋ 卡打开创建弹窗；动态专家 hover 出删除。
 */

import { useState, useCallback, useEffect } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from '@/i18n'
import { Skeleton } from '@/components/ui/skeleton'
import { PermissionLockCard } from '@/components/ui/lock-card'
import { cn } from '@/lib/utils'
import { useUserStore } from '@/store/userStore'
import { Plus, ArrowLeft, Trash2 } from 'lucide-react'
import { expertColor } from '@/lib/expertIdentity'
import { pushToast } from '@/components/ui/use-toast'

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

import ExpertEditor from '@/components/admin/ExpertEditor'
import ExpertFormDialog from '@/components/admin/ExpertFormDialog'
import { DeleteConfirmDialog } from '@/components/settings/DeleteConfirmDialog'

function isStatusError(error: unknown): error is { status?: number } {
  return typeof error === 'object' && error !== null && 'status' in error
}

export default function ExpertAdminPage({ embedded = false }: { embedded?: boolean } = {}) {
  const { t } = useTranslation()
  const queryClient = useQueryClient()

  // 选中即进入编辑视图（null = 栅格视图）
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

  // 获取登录状态与角色分档（产品决策「可见但锁」：页面全员可达，数据/操作按角色）
  const isAuthenticated = useUserStore(state => state.isAuthenticated)
  const user = useUserStore(state => state.user)
  const role = user?.role ?? ''
  const canViewExperts = role === 'admin'
  const canEditExperts = role === 'admin'

  // 查询专家列表（登录 + 有查看权限才发起，避免无权限的注定 403 请求）
  const { data: experts = [], isLoading: isLoadingExperts, error: expertsError } = useQuery({
    queryKey: ['experts'],
    queryFn: getAllExperts,
    enabled: isAuthenticated && canViewExperts,
    retry: (failureCount, error: unknown) => {
      if (isStatusError(error) && error.status === 401) return false
      return failureCount < 2
    },
  })

  // 处理查询错误
  useEffect(() => {
    if (expertsError) {
      logger.error('Failed to load experts:', expertsError)
      pushToast({ title: t('loadExpertsFailed'), variant: 'destructive' })
    }
  }, [expertsError, t])

  // 从列表中获取选中的专家详情（避免重复查询）
  const selectedExpert = selectedExpertKey
    ? experts.find((e) => e.expert_key === selectedExpertKey) || null
    : null

  // 自动生成描述
  const handleGenerateDescription = useCallback(async (systemPrompt: string): Promise<string> => {
    if (!systemPrompt || systemPrompt.length < 10) {
      throw new Error('System prompt too short')
    }

    setIsGeneratingDescription(true)
    try {
      const result = await generateExpertDescription({ system_prompt: systemPrompt })
      pushToast({ title: t('descriptionGenerated') })
      return result.description
    } catch (error) {
      logger.error('Failed to generate description:', error)
      pushToast({ title: t('generateDescriptionFailed'), variant: 'destructive' })
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
      // 乐观锁：传入当前版本号
      const dataWithVersion = { ...data, expected_version: selectedExpert.config_version }
      await updateExpert(selectedExpert.expert_key, dataWithVersion)
      queryClient.invalidateQueries({ queryKey: ['experts'] })
      queryClient.invalidateQueries({ queryKey: ['expert', selectedExpert.expert_key] })
      pushToast({ title: t('saveSuccess') })
    } catch (error: any) {
      logger.error('Failed to update expert:', error)

      if (error.status === 409) {
        // 乐观锁冲突：配置已被他人修改
        await queryClient.invalidateQueries({ queryKey: ['experts'] })
        await queryClient.invalidateQueries({ queryKey: ['expert', selectedExpert.expert_key] })
        pushToast({ title: '配置已被他人修改，已为您刷新最新数据，请确认后重试', variant: 'destructive' })
      } else {
        pushToast({ title: t('saveFailed'), variant: 'destructive' })
      }
    } finally {
      setIsSaving(false)
    }
  }, [selectedExpert, queryClient, t])

  // 创建专家
  const handleCreateExpert = useCallback(
    async (data: CreateExpertRequest | UpdateExpertRequest) => {
      if (!('expert_key' in data)) return
      const createData = data

      setIsCreating(true)
      try {
        await createExpert(createData)
        pushToast({ title: t('createSuccess') })
        setIsCreateDialogOpen(false)

        await queryClient.invalidateQueries({ queryKey: ['experts'] })
        // 创建后直接进入新专家的编辑视图
        setSelectedExpertKey(createData.expert_key)
      } catch (error) {
        logger.error('Failed to create expert:', error)
        pushToast({ title: t('createFailed'), variant: 'destructive' })
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
        pushToast({ title: t('cannotDeleteSystemExpert'), variant: 'destructive' })
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
      pushToast({ title: t('deleteSuccess') })
      setIsDeleteDialogOpen(false)
    } catch (error) {
      logger.error('Failed to delete expert:', error)
      pushToast({ title: t('deleteFailed'), variant: 'destructive' })
    } finally {
      setIsDeleting(false)
      setExpertToDelete(null)
    }
  }, [expertToDelete, selectedExpertKey, queryClient, t])

  if (isLoadingExperts) {
    return (
      <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
        {Array.from({ length: 6 }, (_, i) => (
          <Skeleton key={i} className="h-[148px] w-full rounded-md" />
        ))}
      </div>
    )
  }

  // 无查看权限：渲染锁卡片（可见但锁）
  if (isAuthenticated && !canViewExperts) {
    return (
      <div className="flex h-full items-center justify-center p-4">
        <div className="w-full max-w-xl">
          <PermissionLockCard description={t('expertsLockedDesc')} />
        </div>
      </div>
    )
  }

  return (
    <div className={cn(!embedded && 'min-h-full bg-surface-page')}>
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

      {selectedExpert ? (
        /* ===== 编辑视图：点进专家卡片 ===== */
        <div className="flex h-full min-h-0 flex-col">
          <button
            onClick={() => setSelectedExpertKey(null)}
            className="mb-3 flex w-fit items-center gap-1.5 rounded-full border border-border-divider bg-surface-card px-3 py-1.5 text-xs font-medium text-content-secondary transition-colors hover:border-border-hover hover:text-content-primary"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            {t('navExperts')}
          </button>
          <div className="min-h-0 flex-1">
            <ExpertEditor
              key={selectedExpert.expert_key}
              expert={selectedExpert}
              isAdmin={canEditExperts}
              isSaving={isSaving}
              isGeneratingDescription={isGeneratingDescription}
              onSave={handleSave}
              onGenerateDescription={handleGenerateDescription}
              onShowToast={(message) => pushToast({ title: message })}
            />
          </div>
        </div>
      ) : (
        /* ===== 栅格视图：专家卡片 + 新建卡 ===== */
        <div className="grid gap-3.5 [grid-template-columns:repeat(auto-fill,minmax(240px,1fr))]">
          {experts.map(expert => (
            <div
              key={expert.expert_key}
              onClick={() => setSelectedExpertKey(expert.expert_key)}
              className="group relative cursor-pointer rounded-md border border-border-divider bg-surface-card p-4 transition-all hover:-translate-y-px hover:shadow-theme-card"
            >
              {/* 动态专家删除（hover 出现） */}
              {expert.is_dynamic && (
                <button
                  onClick={(e) => handleOpenDeleteDialog(expert, e)}
                  className="absolute right-2.5 top-2.5 flex h-7 w-7 items-center justify-center rounded-md text-content-muted opacity-0 transition-all hover:bg-accent-destructive/10 hover:text-accent-destructive group-hover:opacity-100"
                  title={t('delete')}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              )}

              <div className="mb-2.5 flex items-center gap-2.5">
                <span
                  className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-sm font-bold text-white"
                  style={{ backgroundColor: expertColor(expert.expert_key) }}
                >
                  {expert.name.charAt(0)}
                </span>
                <span className="truncate text-[13.5px] font-bold text-content-primary">
                  {expert.name}
                </span>
              </div>

              <p className="mb-2.5 line-clamp-2 min-h-[38px] text-xs leading-relaxed text-content-secondary">
                {expert.description || t('templateNoDescription') || '—'}
              </p>

              <div className="flex items-center gap-1.5 text-[11px] text-content-muted">
                <span className="rounded-full bg-surface-tint px-2 py-0.5 font-medium text-content-secondary">
                  {expert.model}
                </span>
                <span className="ml-auto">
                  {expert.is_dynamic ? t('dynamicExpert') : t('builtinExpert')}
                </span>
              </div>
            </div>
          ))}

          {/* 新建专家卡（蓝本 ex-new：虚线卡） */}
          <button
            onClick={() => setIsCreateDialogOpen(true)}
            className="flex min-h-[150px] flex-col items-center justify-center gap-2 rounded-md border-[1.5px] border-dashed border-border-hover text-[13px] text-content-muted transition-all hover:bg-surface-tint/60 hover:text-content-primary"
          >
            <Plus className="h-5 w-5" />
            {t('createExpert')}
          </button>
        </div>
      )}
    </div>
  )
}
