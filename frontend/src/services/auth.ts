/**
 * 认证相关 API 服务
 * 
 * P0 修复: Token 改为 HttpOnly Cookie，不再从响应中读取
 */

import { buildUrl, handleResponse } from './common'
import { logger } from '@/utils/logger'

// ============================================================================
// 类型定义
// ============================================================================

export interface SendCodeRequest {
  phone_number: string
}

export interface SendCodeResponse {
  message: string
  expires_in: number
  phone_masked: string
  _debug_code?: string // 开发环境返回验证码
  user_id?: string
}

export interface VerifyCodeRequest {
  phone_number: string
  code: string
}

// P0 修复: 新的登录响应（不包含 Token）
export interface LoginResponse {
  message: string
  user_id: string
  username: string
  role: 'user' | 'admin'
  expires_in: number
}

// P0 修复: 刷新响应
export interface RefreshResponse {
  message: string
  expires_in: number
}

// P0 修复: 保留旧类型用于向后兼容（某些地方可能还在用）
export interface TokenResponse {
  access_token: string
  refresh_token: string
  token_type: string
  expires_in: number
  user_id: string
  username: string
  role: 'user' | 'admin'
}

// ============================================================================
// API 函数
// ============================================================================

/**
 * 发送验证码
 */
export async function sendVerificationCode(phoneNumber: string): Promise<SendCodeResponse> {
  const response = await fetch(buildUrl('/auth/send-code'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone_number: phoneNumber })
  })
  return handleResponse<SendCodeResponse>(response, '发送验证码失败')
}

/**
 * P0 修复: 验证码登录
 * Token 现在通过 HttpOnly Cookie 自动管理
 */
export async function verifyCodeAndLogin(
  phoneNumber: string,
  code: string
): Promise<LoginResponse> {
  const response = await fetch(buildUrl('/auth/verify-code'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // P0 修复: 允许携带 Cookie
    credentials: 'include',
    body: JSON.stringify({ phone_number: phoneNumber, code })
  })
  return handleResponse<LoginResponse>(response, '验证失败')
}

/**
 * P0 修复: 刷新 access token
 * 从 Cookie 自动读取 refresh token
 */
export async function refreshTokenApi(): Promise<RefreshResponse> {
  const response = await fetch(buildUrl('/auth/refresh-token'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // P0 修复: 允许携带 Cookie
    credentials: 'include'
  })
  return handleResponse<RefreshResponse>(response, '刷新 token 失败')
}

/**
 * P0 修复: 用户登出
 * 调用后端清除 Cookie
 */
export async function logoutApi(): Promise<{ message: string }> {
  const response = await fetch(buildUrl('/auth/logout'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    // P0 修复: 允许携带 Cookie
    credentials: 'include'
  })
  return handleResponse<{ message: string }>(response, '登出失败')
}
