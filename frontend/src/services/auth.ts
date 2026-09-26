/**
 * 认证相关 API 服务
 * 
 * P0 修复: Token 改为 HttpOnly Cookie，不再从响应中读取
 */

import { authenticatedFetch, buildUrl, handleResponse } from './common'
import type { components } from '@/types/api.generated'

// ============================================================================
// 类型定义
// ============================================================================

// 请求 DTO：生成物别名（wire 形状由后端 auth/schemas.py 单一真相源决定；
// 此前手写版已漂移——缺 purpose 字段，正是锚点要消灭的病）
export type SendCodeRequest = components['schemas']['SendCodeRequest']

export interface SendCodeResponse {
  message: string
  expires_in: number
  phone_masked: string
  _debug_code?: string // 开发环境返回验证码
  user_id?: string
}

export type VerifyCodeRequest = components['schemas']['VerifyCodeRequest']
export type PasswordLoginRequest = components['schemas']['PasswordLoginRequest']
export type ResetPasswordRequest = components['schemas']['ResetPasswordRequest']
export type SetPasswordRequest = components['schemas']['SetPasswordRequest']

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
 * @param purpose 用途：login=登录/注册，password_reset=忘记密码（不自动建号）
 */
export async function sendVerificationCode(
  phoneNumber: string,
  purpose: 'login' | 'password_reset' = 'login'
): Promise<SendCodeResponse> {
  const response = await fetch(buildUrl('/auth/send-code'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone_number: phoneNumber, purpose } satisfies SendCodeRequest)
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
    body: JSON.stringify({ phone_number: phoneNumber, code } satisfies VerifyCodeRequest)
  })
  return handleResponse<LoginResponse>(response, '验证失败')
}

/**
 * P0 修复: 刷新 access token
 * 从 Cookie 自动读取 refresh token
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

/**
 * 密码登录（identifier 支持手机号或邮箱）
 * Token 通过 HttpOnly Cookie 自动管理
 */
export async function loginWithPasswordApi(
  identifier: string,
  password: string
): Promise<LoginResponse> {
  const response = await fetch(buildUrl('/auth/login-password'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify({ identifier, password } satisfies PasswordLoginRequest)
  })
  return handleResponse<LoginResponse>(response, '登录失败')
}

/**
 * 忘记密码：手机验证码验证通过后重置密码（不自动登录）
 */
export async function resetPasswordApi(
  phoneNumber: string,
  code: string,
  password: string
): Promise<{ message: string }> {
  const response = await fetch(buildUrl('/auth/reset-password'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phone_number: phoneNumber, code, password } satisfies ResetPasswordRequest)
  })
  return handleResponse<{ message: string }>(response, '重置密码失败')
}

export interface SetPasswordResponse {
  id: string
  username: string
}

/**
 * 设置/修改密码（已登录用户；已有密码时必须提供旧密码）
 */
export async function setPasswordApi(
  password: string,
  oldPassword?: string
): Promise<SetPasswordResponse> {
  const response = await authenticatedFetch(buildUrl('/auth/set-password'), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ password, old_password: oldPassword } satisfies SetPasswordRequest)
  })
  return handleResponse<SetPasswordResponse>(response, '设置密码失败')
}
