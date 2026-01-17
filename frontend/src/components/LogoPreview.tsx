import PixelLogo from './PixelLogo'

/**
 * Logo 预览页面 - 用于测试三种变体效果
 * 临时组件，可删除
 */
export default function LogoPreview() {
  return (
    <div className="min-h-screen bg-slate-50 dark:bg-[#020617] flex items-center justify-center p-8">
      <div className="max-w-4xl w-full">
        <h1 className="text-3xl font-bold text-center mb-12 text-slate-900 dark:text-white">
          XPouch AI Logo 变体预览
        </h1>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
          {/* 方案1：口袋形状 */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-lg">
            <div className="flex justify-center mb-6">
              <PixelLogo size={64} variant="pouch" />
            </div>
            <h3 className="text-lg font-semibold text-center mb-2 text-slate-900 dark:text-white">
              Pouch (口袋)
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 text-center">
              上开口的袋子造型<br/>
              直观传达"收纳/储存"概念
            </p>
            <div className="mt-4 p-3 bg-slate-100 dark:bg-slate-700 rounded-lg">
              <code className="text-xs text-slate-700 dark:text-slate-300">
                variant="pouch"
              </code>
            </div>
          </div>

          {/* 方案2：字母 P */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-lg">
            <div className="flex justify-center mb-6">
              <PixelLogo size={64} variant="p-letter" />
            </div>
            <h3 className="text-lg font-semibold text-center mb-2 text-slate-900 dark:text-white">
              P Letter (首字母)
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 text-center">
              品牌首字母 P<br/>
              简洁明确的品牌标识
            </p>
            <div className="mt-4 p-3 bg-slate-100 dark:bg-slate-700 rounded-lg">
              <code className="text-xs text-slate-700 dark:text-slate-300">
                variant="p-letter"
              </code>
            </div>
          </div>

          {/* 方案3：魔方/宝箱 */}
          <div className="bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-lg">
            <div className="flex justify-center mb-6">
              <PixelLogo size={64} variant="box" />
            </div>
            <h3 className="text-lg font-semibold text-center mb-2 text-slate-900 dark:text-white">
              Box (宝箱)
            </h3>
            <p className="text-sm text-slate-600 dark:text-slate-400 text-center">
              魔方/宝箱造型<br/>
              神秘感 + 科技感
            </p>
            <div className="mt-4 p-3 bg-slate-100 dark:bg-slate-700 rounded-lg">
              <code className="text-xs text-slate-700 dark:text-slate-300">
                variant="box"
              </code>
            </div>
          </div>
        </div>

        {/* 尺寸演示 */}
        <div className="mt-12 bg-white dark:bg-slate-800 rounded-2xl p-8 shadow-lg">
          <h3 className="text-xl font-semibold mb-6 text-slate-900 dark:text-white">
            尺寸适配测试
          </h3>
          <div className="flex items-center justify-around flex-wrap gap-8">
            <div className="text-center">
              <PixelLogo size={24} variant="pouch" />
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">24px</p>
            </div>
            <div className="text-center">
              <PixelLogo size={32} variant="pouch" />
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">32px (侧边栏)</p>
            </div>
            <div className="text-center">
              <PixelLogo size={48} variant="pouch" />
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">48px</p>
            </div>
            <div className="text-center">
              <PixelLogo size={64} variant="pouch" />
              <p className="text-xs text-slate-600 dark:text-slate-400 mt-2">64px</p>
            </div>
          </div>
        </div>

        {/* 交互说明 */}
        <div className="mt-8 text-center text-slate-600 dark:text-slate-400">
          <p className="text-sm">
            💡 <strong>悬停试试</strong>：将鼠标悬停在 Logo 上，观察像素重组和流光动画效果
          </p>
        </div>
      </div>
    </div>
  )
}
