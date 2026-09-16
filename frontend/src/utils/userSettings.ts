// 用户设置数据结构
export interface UserSettings {
  username: string
  password: string
  avatar: string // Base64 编码的头像图片
}


// 默认用户设置

export function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.readAsDataURL(file)
    reader.onload = () => resolve(reader.result as string)
    reader.onerror = error => reject(error)
  })
}

// 获取头像显示内容（如果有自定义头像显示自定义头像，否则显示默认）

