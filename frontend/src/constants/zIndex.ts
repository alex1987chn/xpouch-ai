/**
 * 全局 Z-Index 层级管理
 * 使用规范：避免魔法数字，统一从这里导入
 */
export const Z_INDEX = {
  /** 背景层：网格、噪点等装饰性元素 */
  BACKGROUND: -10,
  /** 基础层：普通内容 */
  BASE: 0,
  /** 内容层：主内容区域 */
  CONTENT: 10,
  /** 遮罩层：弹窗遮罩、侧边栏遮罩 */
  OVERLAY: 40,
  /** 侧边栏：桌面端侧边栏 */
  SIDEBAR: 50,
  /** 移动端侧边栏 */
  MOBILE_SIDEBAR: 60,
  /** 头部：顶部导航、状态栏 */
  HEADER: 70,
  /** 下拉菜单 */
  DROPDOWN: 100,
  /** 弹窗 */
  MODAL: 200,
  /** 通知 */
  TOAST: 300,
  /** 提示 */
  TOOLTIP: 400,
} as const;

export type ZIndexKey = keyof typeof Z_INDEX;
