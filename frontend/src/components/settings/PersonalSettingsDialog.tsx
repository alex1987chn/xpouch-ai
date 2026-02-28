import { useState, useEffect } from 'react'
import { createPortal } from 'react-dom'
import { Save, User, Camera, Upload, X } from 'lucide-react'
import { fileToBase64 } from '@/utils/userSettings'
import { useUserStore } from '@/store/userStore'
import { logger } from '@/utils/logger'
import { useTranslation } from '@/i18n'

interface PersonalSettingsDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function PersonalSettingsDialog({ isOpen, onClose }: PersonalSettingsDialogProps) {
  const { t } = useTranslation()
  const { user, updateUser } = useUserStore()

  const [username, setUsername] = useState('')
  const [avatar, setAvatar] = useState('')
  const [avatarPreview, setAvatarPreview] = useState('')
  const [isSaving, setIsSaving] = useState(false)

  // 加载用户设置
  useEffect(() => {
    if (isOpen && user) {
      setUsername(user.username)
      setAvatar(user.avatar || '')
      setAvatarPreview(user.avatar || '')
    }
  }, [isOpen, user])

  // 处理头像上传
  const handleAvatarUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (file) {
      // 验证文件类型
      if (!file.type.startsWith('image/')) {
        alert(t('uploadImage') || '请上传图片文件')
        return
      }

      // 验证文件大小（最大 2MB）
      if (file.size > 2 * 1024 * 1024) {
        alert(t('avatarHint') || '图片大小不能超过 2MB')
        return
      }

      try {
        const base64 = await fileToBase64(file)
        setAvatar(base64)
        setAvatarPreview(base64)
      } catch (error) {
        logger.error('Failed to process image:', error)
        alert(t('operationFailed') || '图片处理失败，请重试')
      }
    }
  }

  // 移除头像
  const handleRemoveAvatar = () => {
    setAvatar('')
    setAvatarPreview('')
  }

  // 保存设置
  const handleSave = async () => {
    // 验证用户名
    if (!username.trim()) {
      alert(t('required') || '用户名不能为空')
      return
    }

    if (username.length < 2) {
      alert(t('usernameHint') || '用户名至少需要2个字符')
      return
    }

    if (username.length > 20) {
      alert(t('usernameHint') || '用户名不能超过20个字符')
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
      logger.error('[PersonalSettingsDialog] Failed to save settings:', error)
      alert(t('saveFailed') || '保存失败，请重试')
    } finally {
      setIsSaving(false)
    }
  }

  const handleClose = () => {
    if (!isSaving) {
      onClose()
    }
  }

  if (!isOpen) return null

  return createPortal(
    <div
      className="fixed inset-0 bg-black/50 z-[300] flex items-center justify-center"
      onClick={handleClose}
    >
      <div
        className="relative bg-surface-card border-2 border-border-default shadow-[rgb(var(--shadow-color))_8px_8px_0_0] w-[420px] max-w-[90vw] max-h-[85vh] flex flex-col animate-in fade-in zoom-in-95 duration-200"
        onClick={(e) => e.stopPropagation()}
      >
        {/* 弹窗头部 - Bauhaus风格 */}
        <div className="flex items-center justify-between px-4 py-3 border-b-2 border-border-default shrink-0">
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 bg-[rgb(var(--accent-hover))]"></div>
            <span className="font-mono text-xs font-bold uppercase tracking-widest text-content-secondary">
              /// {t('userConfig')}
            </span>
          </div>
          <button
            onClick={handleClose}
            disabled={isSaving}
            className="w-6 h-6 flex items-center justify-center border border-border-default hover:bg-[rgb(var(--accent-hover))] transition-colors disabled:opacity-50"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-y-auto bauhaus-scrollbar px-5 py-5 space-y-6">
          {/* 头像设置 */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 bg-[var(--text-secondary)]"></div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-content-secondary">
                {t('avatarSetup')}
              </span>
            </div>

            <div className="flex items-start gap-4">
              {/* 头像预览 */}
              <div className="relative shrink-0">
                <div className="w-20 h-20 border-2 border-border-default bg-surface-page flex items-center justify-center overflow-hidden">
                  {avatarPreview ? (
                    <img src={avatarPreview} alt="Avatar" className="w-full h-full object-cover" />
                  ) : (
                    <span className="text-2xl font-black text-content-primary">
                      {username.substring(0, 2).toUpperCase()}
                    </span>
                  )}
                </div>

                {/* 上传按钮 */}
                <label className="absolute -bottom-1 -right-1 w-7 h-7 bg-[rgb(var(--accent-hover))] border-2 border-border-default flex items-center justify-center cursor-pointer hover:brightness-95 transition-all">
                  <Camera className="w-3.5 h-3.5 text-black" />
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
                <label className="flex items-center justify-center gap-2 px-3 py-2 border-2 border-border-default bg-surface-page cursor-pointer hover:bg-surface-card transition-colors">
                  <Upload className="w-4 h-4" />
                  <span className="font-mono text-xs font-bold uppercase">{t('uploadAvatar')}</span>
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
                    className="flex items-center justify-center gap-2 px-3 py-2 border-2 border-red-500/50 text-red-500 hover:bg-red-500/10 transition-colors"
                  >
                    <X className="w-4 h-4" />
                    <span className="font-mono text-xs font-bold uppercase">{t('removeAvatar')}</span>
                  </button>
                )}
              </div>
            </div>
            <p className="font-mono text-[10px] text-content-secondary mt-2 opacity-60">
              {t('avatarHint')}
            </p>
          </section>

          {/* 分隔线 */}
          <div className="border-t-2 border-border-default"></div>

          {/* 用户名设置 */}
          <section>
            <div className="flex items-center gap-2 mb-3">
              <div className="w-1.5 h-1.5 bg-[var(--text-secondary)]"></div>
              <span className="font-mono text-[10px] font-bold uppercase tracking-widest text-content-secondary">
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
                className="w-full pl-10 pr-3 py-2.5 border-2 border-border-default bg-surface-page font-mono text-sm focus:outline-none focus:border-[var(--accent-hover)] transition-colors"
              />
            </div>
            <p className="font-mono text-[10px] text-content-secondary mt-2 opacity-60">
              {t('usernameHint')}
            </p>
          </section>
        </div>

        {/* 底部按钮 */}
        <div className="flex gap-0 border-t-2 border-border-default shrink-0">
          <button
            onClick={handleClose}
            disabled={isSaving}
            className="flex-1 py-3 font-mono text-sm font-bold uppercase border-r-2 border-border-default hover:bg-surface-page transition-colors disabled:opacity-50"
          >
            {t('cancel')}
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex-1 py-3 bg-[rgb(var(--accent-hover))] text-black font-mono text-sm font-bold uppercase hover:brightness-95 transition-colors disabled:opacity-50"
          >
            {isSaving ? (
              <span className="flex items-center justify-center gap-2">
                <span className="w-4 h-4 border-2 border-black/30 border-t-black animate-spin"></span>
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
      </div>
    </div>,
    document.body
  )
}
