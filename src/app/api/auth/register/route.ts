import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, createSession, setSessionCookie, getClientIp, recordLogin, isUsernameForbidden, isPasswordValid } from '@/lib/auth'
import { DEFAULT_ELECTIVE_SUBJECTS } from '@/lib/constants'

export async function POST(req: NextRequest) {
  try {
    const { username, password, displayName } = await req.json()
    if (!username || !password) return NextResponse.json({ success: false, error: '用户名和密码必填' }, { status: 400 })
    if (username.length < 3) return NextResponse.json({ success: false, error: '用户名至少 3 个字符' }, { status: 400 })
    const unameCheck = isUsernameForbidden(username)
    if (unameCheck.forbidden) return NextResponse.json({ success: false, error: unameCheck.reason }, { status: 400 })
    const pwdCheck = isPasswordValid(password)
    if (!pwdCheck.ok) return NextResponse.json({ success: false, error: pwdCheck.reason }, { status: 400 })
    const existing = await db.user.findUnique({ where: { username: username.trim() } })
    if (existing) return NextResponse.json({ success: false, error: '用户名已存在' }, { status: 409 })
    const user = await db.user.create({ data: { username: username.trim(), password: await hashPassword(password), displayName: displayName?.trim() || null, role: 'user', electiveSubjects: JSON.stringify(DEFAULT_ELECTIVE_SUBJECTS) } })
    const ip = getClientIp(req)
    const token = await createSession(user.id)
    await setSessionCookie(token)
    await recordLogin(user.id, ip)
    return NextResponse.json({ success: true, data: { id: user.id, username: user.username, role: user.role, displayName: user.displayName, electiveSubjects: DEFAULT_ELECTIVE_SUBJECTS, customExamTypes: null, mustChangePassword: false } })
  } catch (e) { console.error('register:', e); return NextResponse.json({ success: false, error: '注册失败' }, { status: 500 }) }
}
