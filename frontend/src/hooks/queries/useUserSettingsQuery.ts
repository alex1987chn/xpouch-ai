/**
 * =============================
 * User Settings Query Hook
 * =============================
 *
 * 用户模型偏好（simple 模式模型 + 思考模式开关），存储于后端 user_settings 表
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query'
import { useTranslation } from '@/i18n'
import { useToast } from '@/components/ui/use-toast'
import { getUserSettings, updateUserSettings, type UserPreferences } from '@/services/models'
import { CACHE_TIMES } from '@/config/query'

// Query Key 工厂函数
export const userSettingsKeys = {
  all: ['userSettings'] as const,
  current: () => [...userSettingsKeys.all, 'current'] as const,
}

// 获取当前用户偏好的 Query Hook
export function useUserSettingsQuery(enabled = true) {
  return useQuery({
    queryKey: userSettingsKeys.current(),
    queryFn: getUserSettings,
    enabled,
    staleTime: CACHE_TIMES.USER.staleTime,
    gcTime: CACHE_TIMES.USER.gcTime,
    retry: 1,
  })
}

// 更新用户偏好的 Mutation Hook（成功后失效缓存）
// 成功/失败都必须有 toast：此前两头全静默——成功只见按钮文字闪一下"保存中"，
// 失败（如 400 校验错）完全无反应，用户分不清存没存上
export function useUpdateUserSettings() {
  const queryClient = useQueryClient()
  const { t } = useTranslation()
  const { toast } = useToast()

  return useMutation({
    mutationFn: (preferences: UserPreferences) => updateUserSettings(preferences),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: userSettingsKeys.all })
      toast({ title: t('modelPrefsSaved') })
    },
    onError: () => {
      toast({ title: t('saveFailedLater'), variant: 'destructive' })
    },
  })
}
