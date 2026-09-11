/**
 * 个人资料分区（设置中心）。
 * 原 PersonalSettingsDialog 正文：头像 + 用户名，显式保存。
 */

import { useState, useEffect } from 'react'
import { Save, User, Camera, Upload, X } from 'lucide-react'
import { fileToBase64 } from '@/utils/userSettings'
import { useUserStore } from '@/store/userStore'
import { logger } from '@/utils/logger'
import { pushToast } from '@/components/ui/use-toast'
import { useTranslation } from '@/i18n'

interface ProfileSectionProps {
  onClose: () => void
}

export function ProfileSection({ onClose }: ProfileSectionProps) {
  const { t } = useTranslation()
  const { user, updateUser } = useUserStore()

  const [username, setUsername] = useState('')
  const [avatar, setAvatar] = useState('')
  const [avatarPreview, setAvatarPreview] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // 分区挂载即视为打开，回填当前用户资料（密码管理在「账号与安全」分区）
  useEffect(() => {
    if (user) {
      setUsername(user.username)
      setAvatar(user.avatar || '')
      setAvatarPreview(user.avatar || '')
    }
  }, [user])

  // 处理头像上传
  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      // 验证文件类型
      if (!file.type.startsWith('image/')) {
        pushToast({ title: t('uploadImageFile') })
        return
      }

      // 验证文件大小（最大 2MB）
      if (file.size > 2 * 1024 * 1024) {
        pushToast({ title: t('imageSizeExceeded') })
        return
      }

      try {
        const base64 = await fileToBase64(file)
        setAvatar(base64)
        setAvatarPreview(base64)
      } catch (error) {
        logger.error('Failed to process image:', error)
        pushToast({ title: t('imageProcessFailed') })
      }
    }
  }

  // 移除头像
  const handleRemoveAvatar = () => {
    setAvatar('')
    setAvatarPreview('')
  }

  const handleSave = async () => {
    // 验证用户名
    if (!username.trim()) {
      pushToast({ title: t('usernameRequired') })
      return
    }

    if (username.length < 2) {
      pushToast({ title: t('usernameMinLength') })
      return
    }

    if (username.length > 20) {
      pushToast({ title: t('usernameMaxLength') })
      return
    }

    setIsSaving(true)
    try {
      await updateUser({
        username: username.trim(),
        avatar
      })
      onClose()
    } catch (error) {
      logger.error('[ProfileSection] Failed to save settings:', error)
      pushToast({ title: t('saveFailedLater') })
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <>
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
        {/* 头像设置 */}
        <section>
          <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs font-bold text-content-secondary">
              {t('avatarSetup')}
            </span>
          </div>

          <div className="flex items-start gap-4">
            {/* 头像预览 */}
            <div className="relative shrink-0">
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-border-divider bg-surface-page">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                ) : (
                  <span className="text-2xl font-black text-content-primary">
                    {username.substring(0, 2).toUpperCase()}
                  </span>
                )}
              </div>

              {/* 上传按钮 */}
              <label className="absolute -bottom-1 -right-1 flex h-7 w-7 items-center justify-center rounded-full border border-border-divider bg-accent-brand text-accent-ink cursor-pointer transition-all hover:-translate-y-px hover:shadow-theme-card">
                <Camera className="w-3.5 h-3.5 text-content-primary" />
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
              </label>
            </div>

            {/* 头像操作按钮 */}
            <div className="flex flex-col gap-2 flex-1">
              <label className="flex cursor-pointer items-center justify-center gap-2 rounded-full border border-border-divider bg-surface-page px-4 py-2 transition-colors hover:border-border-hover hover:text-content-primary">
                <Upload className="w-4 h-4" />
                <span className="text-xs font-bold">{t('uploadAvatar')}</span>
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleAvatarUpload}
                  className="hidden"
                />
              </label>
              {avatarPreview && (
                <button
                  onClick={handleRemoveAvatar}
                  className="flex items-center justify-center gap-2 rounded-full border border-accent-destructive/30 px-4 py-2 text-accent-destructive transition-colors hover:bg-accent-destructive/10"
                >
                  <X className="w-4 h-4" />
                  <span className="text-xs font-bold">{t('removeAvatar')}</span>
                </button>
              )}
            </div>
          </div>
          <p className="mt-2 text-[11.5px] text-content-muted">
            {t('avatarHint')}
          </p>
        </section>

        {/* 分隔线 */}
        <div className="border-t border-border-divider"></div>

        {/* 用户名设置 */}
        <section>
          <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs font-bold text-content-secondary">
              {t('username')}
            </span>
          </div>

          <div className="relative">
            <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-content-secondary" />
            <input
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder={t('usernamePlaceholder')}
              maxLength={20}
              className="w-full rounded-md border-theme-input border-border-default bg-surface-page py-2.5 pl-10 pr-3 text-sm transition-colors focus:border-border-focus focus:outline-none"
            />
          </div>
          <p className="mt-2 text-[11.5px] text-content-muted">
            {t('usernameHint')}
          </p>
        </section>
      </div>

      {/* 底部按钮 */}
      <div className="flex justify-end gap-2 border-t border-border-divider px-6 py-3.5 shrink-0">
        <button
          onClick={onClose}
          disabled={isSaving}
          className="rounded-full border border-border-divider bg-surface-page px-4 py-2 text-[13px] font-bold text-content-secondary transition-colors hover:border-border-hover hover:text-content-primary disabled:opacity-50"
        >
          {t('cancel')}
        </button>
        <button
          onClick={handleSave}
          disabled={isSaving}
          className="rounded-full border border-border-divider bg-accent-brand px-5 py-2 text-[13px] font-bold text-accent-ink transition-all hover:-translate-y-px hover:shadow-theme-card disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none"
        >
          {isSaving ? (
            <span className="flex items-center justify-center gap-2">
              <span className="w-4 h-4 border-2 border-content-primary/30 border-t-content-primary animate-spin"></span>
              {t('savingUserSettings')}
            </span>
          ) : (
            <span className="flex items-center justify-center gap-2">
              <Save className="w-4 h-4" />
              {t('save')}
            </span>
          )}
        </button>
      </div>
    </>
  )
}
