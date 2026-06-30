import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import {
  hashPassword, verifyPassword, createSession, setSessionCookie,
  getClientIp, recordLogin,
} from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const { username, password } = await req.json() as { username: string; password: string }
    if (!username || !password) {
      return NextResponse.json({ success: false, error: '用户名和密码必填' }, { status: 400 })
    }

    const user = await db.user.findUnique({ where: { username: username.trim() } })
    if (!user) {
      return NextResponse.json({ success: false, error: '用户名或密码错误' }, { status: 401 })
    }

    const ok = await verifyPassword(password, user.password)
    if (!ok) {
      return NextResponse.json({ success: false, error: '用户名或密码错误' }, { status: 401 })
    }

    const ip = getClientIp(req)
    const token = await createSession(user.id)
    await setSessionCookie(token)
    await recordLogin(user.id, ip)

    return NextResponse.json({
      success: true,
      data: {
        id: user.id,
        username: user.username,
        role: user.role,
        displayName: user.displayName,
        electiveSubjects: user.electiveSubjects ? JSON.parse(user.electiveSubjects) : null,
        customExamTypes: user.customExamTypes ? JSON.parse(user.customExamTypes) : null,
        mustChangePassword: user.mustChangePassword,
      },
    })
  } catch (e) {
    console.error('POST /api/auth/login error:', e)
    return NextResponse.json({ success: false, error: '登录失败' }, { status: 500 })
  }
}
