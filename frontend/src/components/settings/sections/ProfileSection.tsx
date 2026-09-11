/**
 * 个人资料分区（设置中心）。
 *
 * [设计] 头像即上传入口（hover 相机角标），右侧并排用户名编辑；
 * 下方「账号信息」只读区：UUID（可复制）/ 角色 / 套餐 / 注册时间 / 资料更新时间。
 * 显式保存（用户名+头像），账号信息为服务端只读数据。
 */

import { useState, useEffect } from 'react'
import { Save, Camera, X, Copy, Check } from 'lucide-react'
import { fileToBase64 } from '@/utils/userSettings'
import { useUserStore } from '@/store/userStore'
import { logger } from '@/utils/logger'
import { pushToast } from '@/components/ui/use-toast'
import { useTranslation } from '@/i18n'

interface ProfileSectionProps {
  onClose: () => void
}

/** 信息行（只读账号信息）：label + value + 可选复制 */
function InfoRow({ label, value, mono, copyable }: { label: string; value: string; mono?: boolean; copyable?: boolean }) {
  const { t } = useTranslation()
  const [copied, setCopied] = useState(false)

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(value)
      setCopied(true)
      setTimeout(() => setCopied(false), 1500)
    } catch { /* 忽略 */ }
  }

  return (
    <div className="flex items-center gap-3 border-b border-border-divider py-2.5 last:border-b-0">
      <span className="w-24 shrink-0 text-[11.5px] font-medium text-content-muted">{label}</span>
      <span className={`min-w-0 flex-1 truncate text-[13px] text-content-primary ${mono ? 'font-mono text-xs' : ''}`}>
        {value}
      </span>
      {copyable && (
        <button
          onClick={handleCopy}
          title={t('copy')}
          className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md text-content-muted transition-colors hover:bg-surface-tint hover:text-content-primary"
        >
          {copied ? <Check className="h-3.5 w-3.5 text-accent-success" /> : <Copy className="h-3.5 w-3.5" />}
        </button>
      )}
    </div>
  )
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

  // 处理头像上传（点击头像即触发）
  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      if (!file.type.startsWith('image/')) {
        pushToast({ title: t('uploadImageFile') })
        return
      }
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

  const formatDate = (iso?: string) => {
    if (!iso) return '—'
    try {
      return new Date(iso).toLocaleString()
    } catch {
      return iso
    }
  }

  return (
    <>
      <div className="flex-1 space-y-6 overflow-y-auto px-6 py-5">
        {/* 身份区：头像（可点上传）+ 用户名编辑并排 */}
        <section>
          <div className="flex items-center gap-5">
            <label className="group relative shrink-0 cursor-pointer" title={t('uploadAvatar')}>
              <div className="flex h-20 w-20 items-center justify-center overflow-hidden rounded-full border border-border-divider bg-surface-page">
                {avatarPreview ? (
                  <img src={avatarPreview} alt="Avatar" className="h-full w-full object-cover" />
                ) : (
                  <span className="text-2xl font-bold text-content-primary">
                    {username.substring(0, 2).toUpperCase()}
                  </span>
                )}
              </div>
              <span className="absolute -bottom-0.5 -right-0.5 flex h-7 w-7 items-center justify-center rounded-full border border-border-divider bg-accent-brand text-accent-ink transition-transform group-hover:scale-105">
                <Camera className="h-3.5 w-3.5" />
              </span>
              <input
                type="file"
                accept="image/*"
                onChange={handleAvatarUpload}
                className="hidden"
              />
            </label>

            <div className="min-w-0 flex-1">
              <label className="mb-1.5 block text-xs font-bold text-content-secondary">
                {t('username')}
              </label>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={t('usernamePlaceholder')}
                maxLength={20}
                className="w-full rounded-md border-theme-input border-border-default bg-surface-page px-3 py-2 text-sm transition-colors focus:border-border-focus focus:outline-none"
              />
              <div className="mt-1.5 flex items-center gap-3">
                <p className="text-[11.5px] text-content-muted">{t('usernameHint')}</p>
                {avatarPreview && (
                  <button
                    onClick={handleRemoveAvatar}
                    className="flex shrink-0 items-center gap-1 text-[11.5px] text-content-muted transition-colors hover:text-accent-destructive"
                  >
                    <X className="h-3 w-3" />
                    {t('removeAvatar')}
                  </button>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* 账号信息（只读） */}
        <section className="rounded-md border border-border-divider bg-surface-card px-4 py-1.5">
          <InfoRow label={t('uuid') || 'UUID'} value={user?.id || '—'} mono copyable />
          <InfoRow label={t('userRole') || '角色'} value={user?.role === 'admin' ? 'Admin' : 'User'} />
          <InfoRow label={t('plan') || '套餐'} value={user?.plan || '—'} />
          <InfoRow label={t('registeredAt') || '注册时间'} value={formatDate(user?.created_at)} />
          <InfoRow label={t('lastUpdated')} value={formatDate(user?.updated_at)} />
        </section>
      </div>

      {/* 底部按钮 */}
      <div className="flex shrink-0 justify-end gap-2 border-t border-border-divider px-6 py-3.5">
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
          className="flex items-center gap-2 rounded-full border border-border-divider bg-accent-brand px-5 py-2 text-[13px] font-bold text-accent-ink transition-all hover:-translate-y-px hover:shadow-theme-card disabled:translate-y-0 disabled:opacity-50 disabled:shadow-none"
        >
          {isSaving ? (
            <span className="flex items-center gap-2">
              <span className="h-4 w-4 animate-spin rounded-full border-2 border-accent-ink/30 border-t-accent-ink" />
              {t('savingUserSettings')}
            </span>
          ) : (
            <>
              <Save className="h-4 w-4" />
              {t('save')}
            </>
          )}
        </button>
      </div>
    </>
  )
}
