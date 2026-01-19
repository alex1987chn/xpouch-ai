import { cn } from '@/lib/utils'

interface TextArtifactProps {
  content: string
  className?: string
}

export default function TextArtifact({ content, className }: TextArtifactProps) {
  return (
    <div className={cn('p-6 whitespace-pre-wrap break-words text-sm leading-relaxed text-slate-800 dark:text-slate-200 w-full h-full', className)}>
      {content}
    </div>
  )
}

