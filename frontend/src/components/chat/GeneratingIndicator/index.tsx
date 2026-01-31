/**
 * 生成中指示器
 * 显示AI正在处理请求的动画状态
 */

export default function GeneratingIndicator() {
  return (
    <div className="flex flex-col items-start w-full max-w-3xl ml-4 pl-4 border-l-2 border-dashed border-border/40 pb-4">
      <div className="bg-card dark:bg-card/95 border border-border border-dashed p-3 w-fit flex items-center gap-2 text-xs font-mono text-primary dark:text-primary/95 animate-pulse">
        <span className="w-3 h-3 border-2 border-border dark:border-border/80 border-t-transparent rounded-full animate-spin" />
        <span>Processing: Analyzing request stream...</span>
      </div>
    </div>
  )
}
