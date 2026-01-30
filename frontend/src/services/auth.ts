/**
 * 认证相关 API 服务
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
 * 验证码登录
 */
export async function verifyCodeAndLogin(
  phoneNumber: string,
  code: string
): Promise<TokenResponse> {
  const response = await fetch(buildUrl('/auth/verify-code'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone_number: phoneNumber, code })
  })
  return handleResponse<TokenResponse>(response, '验证失败')
}

/**
 * 刷新 access token
 */
export async function refreshTokenApi(refreshToken: string): Promise<TokenResponse> {
  const response = await fetch(buildUrl('/auth/refresh-token'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken })
  })
  return handleResponse<TokenResponse>(response, '刷新 token 失败')
}
