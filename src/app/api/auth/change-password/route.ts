import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser, hashPassword, verifyPassword, isPasswordValid } from '@/lib/auth'

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })

    const { oldPassword, newPassword } = await req.json() as {
      oldPassword?: string; newPassword?: string
    }

    if (!newPassword) {
      return NextResponse.json({ success: false, error: '请输入新密码' }, { status: 400 })
    }

    const pwdCheck = isPasswordValid(newPassword)
    if (!pwdCheck.ok) {
      return NextResponse.json({ success: false, error: pwdCheck.reason }, { status: 400 })
    }

    // 验证旧密码（除非是 mustChangePassword 状态且旧密码是默认 123456）
    const dbUser = await db.user.findUnique({ where: { id: user.id } })
    if (!dbUser) return NextResponse.json({ success: false, error: '用户不存在' }, { status: 404 })

    if (oldPassword) {
      const ok = await verifyPassword(oldPassword, dbUser.password)
      if (!ok) {
        return NextResponse.json({ success: false, error: '旧密码错误' }, { status: 401 })
      }
    } else if (!dbUser.mustChangePassword) {
      return NextResponse.json({ success: false, error: '请输入旧密码' }, { status: 400 })
    }

    await db.user.update({
      where: { id: user.id },
      data: {
        password: await hashPassword(newPassword),
        mustChangePassword: false,
      },
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('POST /api/auth/change-password error:', e)
    return NextResponse.json({ success: false, error: '修改密码失败' }, { status: 500 })
  }
}
