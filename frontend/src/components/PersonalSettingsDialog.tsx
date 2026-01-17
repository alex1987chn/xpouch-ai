import { useState, useEffect } from 'react'
import { X, Save, User, Camera, Upload } from 'lucide-react'
import { fileToBase64 } from '@/utils/userSettings'
import { useUserStore } from '@/store/userStore'

interface PersonalSettingsDialogProps {
  isOpen: boolean
  onClose: () => void
}

export function PersonalSettingsDialog({ isOpen, onClose }: PersonalSettingsDialogProps) {
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
        alert('请上传图片文件')
        return
      }

      // 验证文件大小（最大 2MB）
      if (file.size > 2 * 1024 * 1024) {
        alert('图片大小不能超过 2MB')
        return
      }

      try {
        const base64 = await fileToBase64(file)
        setAvatar(base64)
        setAvatarPreview(base64)
      } catch (error) {
        console.error('Failed to process image:', error)
        alert('图片处理失败，请重试')
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
      alert('用户名不能为空')
      return
    }

    if (username.length < 2) {
      alert('用户名至少需要2个字符')
      return
    }

    if (username.length > 20) {
      alert('用户名不能超过20个字符')
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
      console.error('Failed to save settings:', error)
      alert('保存失败，请重试')
    } finally {
      setIsSaving(false)
    }
  }

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* 遮罩 */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* 对话框 */}
      <div className="relative bg-card rounded-2xl shadow-2xl max-w-md w-full mx-4 max-h-[85vh] overflow-hidden flex flex-col">
        {/* 头部 */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-border">
          <h2 className="text-xl font-semibold text-foreground">
            个人设置
          </h2>
          <button
            onClick={onClose}
            className="p-2 rounded-lg hover:bg-secondary transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        {/* 内容区域 */}
        <div className="flex-1 overflow-auto smooth-scroll px-6 py-4 space-y-6">
          {/* 头像设置 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              头像设置
            </h3>
            <div className="flex items-center gap-4">
              {/* 头像预览 */}
              <div className="relative">
                <div
                  className="w-20 h-20 rounded-full bg-gradient-to-br from-purple-500 to-blue-500 flex items-center justify-center text-white text-2xl font-bold overflow-hidden border-4 border-white dark:border-gray-800 shadow-lg"
                >
                  {avatarPreview ? (
                    <img
                      src={avatarPreview}
                      alt="Avatar"
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    username.substring(0, 2).toUpperCase()
                  )}
                </div>

                {/* 上传按钮 */}
                <label className="absolute bottom-0 right-0 w-8 h-8 bg-white dark:bg-gray-700 rounded-full flex items-center justify-center shadow-lg cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-600 transition-colors border-2 border-white dark:border-gray-800">
                  <Camera className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                  <input
                    type="file"
                    accept="image/*"
                    onChange={handleAvatarUpload}
                    className="hidden"
                  />
                </label>
              </div>

              {/* 头像操作按钮 */}
              <div className="flex flex-col gap-2">
                <label className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-foreground bg-secondary hover:bg-secondary/70 cursor-pointer transition-colors">
                  <Upload className="w-4 h-4" />
                  上传头像
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
                    className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                  >
                    <X className="w-4 h-4" />
                    移除头像
                  </button>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              支持 JPG、PNG 格式，最大 2MB
            </p>
          </section>

          {/* 用户名设置 */}
          <section>
            <h3 className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3">
              用户名
            </h3>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入用户名"
                maxLength={20}
                className="w-full pl-10 pr-4 py-3 rounded-xl border border-input bg-background text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-transparent"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              2-20 个字符
            </p>
          </section>
        </div>

        {/* 底部按钮 */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-border bg-secondary/30">
          <button
            onClick={onClose}
            disabled={isSaving}
            className="px-4 py-2 rounded-lg text-sm font-medium text-foreground hover:bg-secondary transition-colors disabled:opacity-50"
          >
            取消
          </button>
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium bg-indigo-600 text-white hover:bg-indigo-700 transition-colors disabled:opacity-50"
          >
            {isSaving ? (
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
                <Save className="w-4 h-4" />
            )}
            {isSaving ? '保存中...' : '保存'}
          </button>
        </div>
      </div>
    </div>
  )
}
