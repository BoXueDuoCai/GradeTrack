// 认证工具：session 管理、密码校验、权限检查

import { db } from '@/lib/db'
import bcrypt from 'bcryptjs'
import { cookies } from 'next/headers'
import { randomBytes } from 'crypto'
import { NextRequest } from 'next/server'

export const SESSION_COOKIE = 'score_session'
// 2 小时 TTL（用户要求：每两次登录相隔超过 2 小时需重新登录）
const SESSION_TTL_MS = 1000 * 60 * 60 * 2

export type Role = 'super_admin' | 'admin' | 'user' | 'test_user'

export type AdminPermission = 'batch_import' | 'create_group' | 'publish_plan' | 'manage_users'

export const ALL_ADMIN_PERMISSIONS: AdminPermission[] = [
  'batch_import', 'create_group', 'publish_plan', 'manage_users',
]

export interface AuthUser {
  id: string
  username: string
  role: Role
  displayName: string | null
  electiveSubjects: string[] | null
  customExamTypes: Array<{ type: string; name: string; subjects: string[] }> | null
  mustChangePassword: boolean
  permissions: AdminPermission[]
  lastLoginAt: string | null
  lastLoginIp: string | null
}

// Hash 密码
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, 10)
}

// 校验密码
export async function verifyPassword(password: string, hash: string): Promise<boolean> {
  return bcrypt.compare(password, hash)
}

// 创建 session（2 小时 TTL）
export async function createSession(userId: string): Promise<string> {
  const token = randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + SESSION_TTL_MS)
  await db.session.create({
    data: { userId, token, expiresAt },
  })
  return token
}

// 设置 cookie
export async function setSessionCookie(token: string) {
  const expires = new Date(Date.now() + SESSION_TTL_MS)
  const cookieStore = await cookies()
  cookieStore.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: 'lax',
    expires,
    path: '/',
  })
}

// 清除 cookie
export async function clearSessionCookie() {
  const cookieStore = await cookies()
  cookieStore.delete(SESSION_COOKIE)
}

// 从请求中获取客户端 IP
// 优先级：X-Forwarded-For（链式取第一个）> X-Real-IP > CF-Connecting-IP > 直连
export function getClientIp(req?: NextRequest): string {
  if (req) {
    // X-Forwarded-For 可能是逗号分隔的链：client, proxy1, proxy2
    const forwarded = req.headers.get('x-forwarded-for')
    if (forwarded) {
      const first = forwarded.split(',')[0].trim()
      if (first && first !== '::1' && first !== '127.0.0.1') return first
    }
    const real = req.headers.get('x-real-ip')
    if (real && real !== '::1' && real !== '127.0.0.1') return real
    const cf = req.headers.get('cf-connecting-ip')
    if (cf) return cf
  }
  return 'unknown'
}

// 解析管理员权限
export function parsePermissions(permissionsJson: string | null, role: Role): AdminPermission[] {
  if (role === 'super_admin') return ALL_ADMIN_PERMISSIONS
  if (role !== 'admin') return []
  if (!permissionsJson) return []
  try {
    return JSON.parse(permissionsJson) as AdminPermission[]
  } catch {
    return []
  }
}

// 从 cookie 获取当前用户
export async function getCurrentUser(): Promise<AuthUser | null> {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE)?.value
    if (!token) return null

    const session = await db.session.findUnique({
      where: { token },
      include: { user: true },
    })
    if (!session) return null

    // 2 小时过期检查
    if (session.expiresAt < new Date()) {
      await db.session.delete({ where: { id: session.id } })
      return null
    }

    const role = session.user.role as Role
    return {
      id: session.user.id,
      username: session.user.username,
      role,
      displayName: session.user.displayName,
      electiveSubjects: session.user.electiveSubjects ? JSON.parse(session.user.electiveSubjects) : null,
      customExamTypes: session.user.customExamTypes ? JSON.parse(session.user.customExamTypes) : null,
      mustChangePassword: session.user.mustChangePassword,
      permissions: parsePermissions(session.user.permissions, role),
      lastLoginAt: session.user.lastLoginAt?.toISOString() ?? null,
      lastLoginIp: session.user.lastLoginIp,
    }
  } catch (e) {
    console.error('getCurrentUser error:', e)
    return null
  }
}

// 要求登录
export async function requireUser(): Promise<AuthUser> {
  const user = await getCurrentUser()
  if (!user) throw new Error('UNAUTHORIZED')
  return user
}

// 要求管理员（含 super_admin）
export async function requireAdmin(): Promise<AuthUser> {
  const user = await requireUser()
  if (user.role !== 'admin' && user.role !== 'super_admin') {
    throw new Error('FORBIDDEN')
  }
  return user
}

// 要求超级管理员
export async function requireSuperAdmin(): Promise<AuthUser> {
  const user = await requireUser()
  if (user.role !== 'super_admin') {
    throw new Error('FORBIDDEN')
  }
  return user
}

// 检查管理员是否有特定权限
export function hasPermission(user: AuthUser, permission: AdminPermission): boolean {
  if (user.role === 'super_admin') return true
  if (user.role !== 'admin') return false
  return user.permissions.includes(permission)
}

// 记录登录信息
export async function recordLogin(userId: string, ip: string) {
  await db.user.update({
    where: { id: userId },
    data: {
      lastLoginAt: new Date(),
      lastLoginIp: ip,
    },
  })
}

// 用户名是否被禁止注册（test 开头/结尾、或名为 system）
export function isUsernameForbidden(username: string): { forbidden: boolean; reason?: string } {
  const lower = username.toLowerCase()
  if (lower === 'system') return { forbidden: true, reason: '用户名 system 为系统保留' }
  if (lower.startsWith('test') || lower.endsWith('test')) return { forbidden: true, reason: '用户名不能以 test 开头或结尾' }
  return { forbidden: false }
}

// 密码是否符合规则（不允许 123456）
export function isPasswordValid(password: string): { ok: boolean; reason?: string } {
  if (password.length < 6) return { ok: false, reason: '密码至少 6 个字符' }
  if (password === '123456') return { ok: false, reason: '密码不能是 123456' }
  return { ok: true }
}
