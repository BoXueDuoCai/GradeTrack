import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { DEFAULT_ELECTIVE_SUBJECTS } from '@/lib/constants'

// 添加成员到小组（创建者/超管）
// 如果用户不存在，自动创建（默认密码 123456 + 强制改）
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })

    const group = await db.group.findUnique({ where: { id } })
    if (!group) return NextResponse.json({ success: false, error: '小组不存在' }, { status: 404 })

    if (group.creatorId !== user.id && user.role !== 'super_admin') {
      return NextResponse.json({ success: false, error: '只有创建者或超管能添加成员' }, { status: 403 })
    }

    const body = await req.json() as {
      username: string
      studentNo: string
      displayName?: string
      autoCreate?: boolean
    }

    if (!body.username?.trim()) {
      return NextResponse.json({ success: false, error: '请输入用户名' }, { status: 400 })
    }

    let dbUser = await db.user.findUnique({ where: { username: body.username.trim() } })
    if (!dbUser) {
      if (!body.autoCreate) {
        return NextResponse.json({ success: false, error: '用户不存在，请勾选"自动创建"' }, { status: 400 })
      }
      // 自动创建用户
      const { hashPassword } = await import('@/lib/auth')
      dbUser = await db.user.create({
        data: {
          username: body.username.trim(),
          password: await hashPassword('123456'),
          displayName: body.displayName?.trim() || body.username.trim(),
          role: 'user',
          mustChangePassword: true,
          electiveSubjects: JSON.stringify(DEFAULT_ELECTIVE_SUBJECTS),
        },
      })
    }

    // upsert 成员关系
    await db.groupMember.upsert({
      where: { groupId_userId: { groupId: id, userId: dbUser.id } },
      update: { studentNo: body.studentNo.trim() || body.username.trim() },
      create: {
        groupId: id,
        userId: dbUser.id,
        studentNo: body.studentNo.trim() || body.username.trim(),
      },
    })

    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('POST /api/groups/[id]/members error:', e)
    return NextResponse.json({ success: false, error: '添加成员失败' }, { status: 500 })
  }
}
