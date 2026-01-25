import { useState, useEffect } from 'react'
import { Save, User, Camera, Upload } from 'lucide-react'
import { fileToBase64 } from '@/utils/userSettings'
import { useUserStore } from '@/store/userStore'
import { Dialog, DialogContentCentered, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog'
import { Button } from '@/components/ui/button'
import { Label } from '@/components/ui/label'
import { Input } from '@/components/ui/input'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'

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
      console.error('[PersonalSettingsDialog] Failed to save settings:', error)
      alert('保存失败，请重试')
    } finally {
      setIsSaving(false)
    }
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContentCentered className="max-w-md max-h-[85vh] overflow-hidden flex flex-col">
        <DialogHeader>
          <DialogTitle>个人设置</DialogTitle>
        </DialogHeader>

        {/* 内容区域 */}
        <div className="flex-1 overflow-auto smooth-scroll px-1 py-4 space-y-6">
          {/* 头像设置 */}
          <section>
            <Label className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 block">
              头像设置
            </Label>
            <div className="flex items-center gap-4">
              {/* 头像预览 */}
              <div className="relative">
                <Avatar className="w-20 h-20 border-4 border-white dark:border-gray-800 shadow-lg">
                  <AvatarImage src={avatarPreview} alt="Avatar" />
                  <AvatarFallback className="bg-gradient-to-br from-purple-500 to-blue-500 text-white text-2xl font-bold">
                    {username.substring(0, 2).toUpperCase()}
                  </AvatarFallback>
                </Avatar>

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
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleRemoveAvatar}
                    className="text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20"
                  >
                    <Camera className="w-4 h-4 mr-2" />
                    移除头像
                  </Button>
                )}
              </div>
            </div>
            <p className="text-xs text-muted-foreground mt-2">
              支持 JPG、PNG 格式，最大 2MB
            </p>
          </section>

          {/* 用户名设置 */}
          <section>
            <Label htmlFor="username" className="text-sm font-semibold text-gray-700 dark:text-gray-300 mb-3 block">
              用户名
            </Label>
            <div className="relative">
              <User className="absolute left-3 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                id="username"
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder="请输入用户名"
                maxLength={20}
                className="pl-10"
              />
            </div>
            <p className="text-xs text-muted-foreground mt-1">
              2-20 个字符
            </p>
          </section>
        </div>

        {/* 底部按钮 */}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSaving}>
            取消
          </Button>
          <Button onClick={handleSave} disabled={isSaving}>
            {isSaving ? (
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            {isSaving ? '保存中...' : '保存'}
          </Button>
        </DialogFooter>
      </DialogContentCentered>
    </Dialog>
  )
}
