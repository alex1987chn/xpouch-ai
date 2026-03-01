"use client"

import * as React from "react"
import * as DialogPrimitive from "@radix-ui/react-dialog"
import { X } from "lucide-react"
import { cn } from "@/lib/utils"

const Dialog = DialogPrimitive.Root
const DialogTrigger = DialogPrimitive.Trigger
const DialogPortal = DialogPrimitive.Portal
const DialogClose = DialogPrimitive.Close

/**
 * 遮罩层
 */
const DialogOverlay = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Overlay>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Overlay>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Overlay
    ref={ref}
    className={cn(
      "fixed inset-0 z-50 bg-surface-overlay/80",
      "data-[state=open]:animate-in data-[state=closed]:animate-out",
      "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
      className
    )}
    {...props}
  />
))
DialogOverlay.displayName = DialogPrimitive.Overlay.displayName

/**
 * 基础关闭按钮样式
 */
const dialogCloseButtonClass = cn(
  "absolute right-4 top-4 rounded-sm opacity-70",
  "ring-offset-surface-card",
  "transition-opacity hover:opacity-100",
  "focus:outline-none focus:ring-2 focus:ring-border-focus focus:ring-offset-2",
  "disabled:pointer-events-none",
  "data-[state=open]:bg-surface-elevated data-[state=open]:text-content-muted"
)

/**
 * Dialog 内容（基础版）
 */
const DialogContent = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        // 定位和尺寸
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg",
        "translate-x-[-50%] translate-y-[-50%]",
        // 样式
        "gap-4 border-2 border-border-default bg-surface-card p-6",
        // 阴影（使用主题变量）
        "shadow-hard-lg",
        // 动画
        "duration-fast",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        "data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]",
        "data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
        // 圆角（使用主题变量，Bauhaus为0）
        "sm:rounded-lg",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className={dialogCloseButtonClass}>
        <X className="h-4 w-4 text-content-primary" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContent.displayName = DialogPrimitive.Content.displayName

/**
 * Dialog 内容（居中版 - 考虑侧边栏）
 */
const DialogContentCentered = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed top-[50%] z-50 grid w-full max-w-lg translate-y-[-50%]",
        "gap-4 border-2 border-border-default bg-surface-card p-6 shadow-hard-lg",
        "duration-fast",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        "data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]",
        "data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
        "sm:rounded-lg",
        // PC端考虑侧边栏偏移
        "md:left-[calc(50%+var(--sidebar-center-offset,0px))] md:translate-x-[-50%]",
        "left-[50%] translate-x-[-50%]",
        className
      )}
      {...props}
    >
      {children}
      <DialogPrimitive.Close className={dialogCloseButtonClass}>
        <X className="h-4 w-4 text-content-primary" />
        <span className="sr-only">Close</span>
      </DialogPrimitive.Close>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContentCentered.displayName = DialogPrimitive.Content.displayName

/**
 * Dialog 内容（全屏版）
 */
const DialogContentFullscreen = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed inset-0 z-50 grid w-full h-full max-w-full",
        "gap-4 border-0 bg-surface-card p-0",
        "duration-fast",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        className
      )}
      {...props}
    >
      <div className="absolute right-4 top-4 z-10">
        <DialogPrimitive.Close className={dialogCloseButtonClass}>
          <X className="h-4 w-4 text-content-primary" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </div>
      <div className="h-full overflow-auto bauhaus-scrollbar">
        {children}
      </div>
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContentFullscreen.displayName = DialogPrimitive.Content.displayName

/**
 * 可配置位置的 DialogContent
 */
interface DialogContentPositionedProps extends React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content> {
  position?: 'center' | 'top' | 'bottom' | 'left' | 'right' | 'top-left' | 'top-right' | 'bottom-left' | 'bottom-right';
}

const DialogContentPositioned = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  DialogContentPositionedProps
>(({ className, children, position = 'center', ...props }, ref) => {
  const getPositionClasses = () => {
    switch (position) {
      case 'top':
        return 'top-0 left-[50%] translate-x-[-50%] md:top-4'
      case 'bottom':
        return 'bottom-0 left-[50%] translate-x-[-50%] md:bottom-4'
      case 'left':
        return 'left-0 top-[50%] translate-y-[-50%] md:left-4'
      case 'right':
        return 'right-0 top-[50%] translate-y-[-50%] md:right-4'
      case 'top-left':
        return 'top-0 left-0 md:top-4 md:left-4'
      case 'top-right':
        return 'top-0 right-0 md:top-4 md:right-4'
      case 'bottom-left':
        return 'bottom-0 left-0 md:bottom-4 md:left-4'
      case 'bottom-right':
        return 'bottom-0 right-0 md:bottom-4 md:right-4'
      case 'center':
      default:
        return 'left-[50%] top-[50%] translate-x-[-50%] translate-y-[-50%]'
    }
  }

  return (
    <DialogPortal>
      <DialogOverlay />
      <DialogPrimitive.Content
        ref={ref}
        className={cn(
          "fixed z-50 grid w-full max-w-lg gap-4",
          "border-2 border-border-default bg-surface-card p-6 shadow-hard-lg",
          "duration-fast",
          "data-[state=open]:animate-in data-[state=closed]:animate-out",
          "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
          "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
          position === 'center' 
            ? 'data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]' 
            : 'data-[state=closed]:slide-out-to-right data-[state=open]:slide-in-from-right',
          getPositionClasses(),
          className
        )}
        {...props}
      >
        {children}
        <DialogPrimitive.Close className={dialogCloseButtonClass}>
          <X className="h-4 w-4 text-content-primary" />
          <span className="sr-only">Close</span>
        </DialogPrimitive.Close>
      </DialogPrimitive.Content>
    </DialogPortal>
  )
})
DialogContentPositioned.displayName = DialogPrimitive.Content.displayName

/**
 * Bauhaus风格DialogContent（无默认关闭按钮）
 */
const DialogContentBauhaus = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Content>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Content>
>(({ className, children, ...props }, ref) => (
  <DialogPortal>
    <DialogOverlay />
    <DialogPrimitive.Content
      ref={ref}
      className={cn(
        "fixed left-[50%] top-[50%] z-50 grid w-full max-w-lg",
        "translate-x-[-50%] translate-y-[-50%]",
        "gap-4 border-2 border-border-default bg-surface-card p-6 shadow-hard-lg",
        "duration-fast",
        "data-[state=open]:animate-in data-[state=closed]:animate-out",
        "data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0",
        "data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95",
        "data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%]",
        "data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%]",
        "sm:rounded-lg",
        className
      )}
      {...props}
    >
      {children}
    </DialogPrimitive.Content>
  </DialogPortal>
))
DialogContentBauhaus.displayName = DialogPrimitive.Content.displayName

const DialogHeader = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col space-y-1.5 text-center sm:text-left",
      className
    )}
    {...props}
  />
)
DialogHeader.displayName = "DialogHeader"

const DialogFooter = ({
  className,
  ...props
}: React.HTMLAttributes<HTMLDivElement>) => (
  <div
    className={cn(
      "flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2",
      className
    )}
    {...props}
  />
)
DialogFooter.displayName = "DialogFooter"

const DialogTitle = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Title>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Title>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Title
    ref={ref}
    className={cn(
      "text-lg font-semibold leading-none tracking-tight text-content-primary",
      className
    )}
    {...props}
  />
))
DialogTitle.displayName = DialogPrimitive.Title.displayName

const DialogDescription = React.forwardRef<
  React.ElementRef<typeof DialogPrimitive.Description>,
  React.ComponentPropsWithoutRef<typeof DialogPrimitive.Description>
>(({ className, ...props }, ref) => (
  <DialogPrimitive.Description
    ref={ref}
    className={cn("text-sm text-content-secondary", className)}
    {...props}
  />
))
DialogDescription.displayName = DialogPrimitive.Description.displayName

export {
  Dialog,
  DialogPortal,
  DialogOverlay,
  DialogClose,
  DialogTrigger,
  DialogContent,
  DialogContentCentered,
  DialogContentFullscreen,
  DialogContentPositioned,
  DialogContentBauhaus,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
}
