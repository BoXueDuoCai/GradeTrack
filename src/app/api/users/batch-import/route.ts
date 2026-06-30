import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser, hashPassword, hasPermission } from '@/lib/auth'
import { DEFAULT_ELECTIVE_SUBJECTS } from '@/lib/constants'

// 批量导入用户：CSV 格式 "学号,名字"（名字作为用户名；学号在小组中显示）
// 默认密码 123456，强制首次登录改密码
// 自动创建/复用一个小组，把所有导入的用户加进去
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })
    if (!hasPermission(user, 'batch_import')) {
      return NextResponse.json({ success: false, error: '无批量导入权限' }, { status: 403 })
    }

    const body = await req.json() as {
      groupName: string
      members: Array<{ studentNo: string; username: string; displayName?: string }>
    }

    if (!body.groupName?.trim()) {
      return NextResponse.json({ success: false, error: '请填写小组名称' }, { status: 400 })
    }
    if (!body.members || body.members.length === 0) {
      return NextResponse.json({ success: false, error: '没有要导入的成员' }, { status: 400 })
    }

    // 创建小组
    const group = await db.group.create({
      data: {
        name: body.groupName.trim(),
        creatorId: user.id,
      },
    })

    const defaultPwd = await hashPassword('123456')
    let created = 0
    let existing = 0

    for (const m of body.members) {
      const username = m.username.trim()
      if (!username) continue

      // 查找或创建用户
      let dbUser = await db.user.findUnique({ where: { username } })
      if (!dbUser) {
        dbUser = await db.user.create({
          data: {
            username,
            password: defaultPwd,
            displayName: m.displayName?.trim() || username,
            role: 'user',
            mustChangePassword: true, // 强制首次登录改密码
            electiveSubjects: JSON.stringify(DEFAULT_ELECTIVE_SUBJECTS),
          },
        })
        created++
      } else {
        existing++
      }

      // 加入小组（学号）
      await db.groupMember.upsert({
        where: { groupId_userId: { groupId: group.id, userId: dbUser.id } },
        update: { studentNo: m.studentNo.trim() || username },
        create: {
          groupId: group.id,
          userId: dbUser.id,
          studentNo: m.studentNo.trim() || username,
        },
      })
    }

    return NextResponse.json({
      success: true,
      data: {
        groupId: group.id,
        groupName: group.name,
        created,
        existing,
      },
    })
  } catch (e) {
    console.error('POST /api/users/batch-import error:', e)
    return NextResponse.json({ success: false, error: '批量导入失败' }, { status: 500 })
  }
}
