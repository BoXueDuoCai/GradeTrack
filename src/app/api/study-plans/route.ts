import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser, hasPermission } from '@/lib/auth'

// 获取学习计划
// - admin/super_admin: 获取自己创建的（管理员视角）
// - user/test_user: 获取自己所在小组的（学生视角）
export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })

    let plans
    if (user.role === 'admin' || user.role === 'super_admin') {
      // 管理员视角：自己创建的 + （超管看所有）
      plans = await db.studyPlan.findMany({
        where: user.role === 'super_admin' ? {} : { createdBy: user.id },
        orderBy: { createdAt: 'desc' },
        include: {
          group: { select: { name: true } },
          creator: { select: { username: true, displayName: true } },
        },
      })
    } else {
      // 学生视角：自己所在小组的
      const memberships = await db.groupMember.findMany({
        where: { userId: user.id },
        select: { groupId: true },
      })
      const groupIds = memberships.map(m => m.groupId)
      plans = await db.studyPlan.findMany({
        where: { groupId: { in: groupIds } },
        orderBy: { createdAt: 'desc' },
        include: {
          group: { select: { name: true } },
          creator: { select: { username: true, displayName: true } },
        },
      })
    }

    return NextResponse.json({
      success: true,
      data: plans.map(p => ({
        id: p.id,
        groupId: p.groupId,
        groupName: p.group.name,
        title: p.title,
        content: p.content,
        dueDate: p.dueDate?.toISOString() ?? null,
        createdBy: p.createdBy,
        creatorName: p.creator.displayName || p.creator.username,
        createdAt: p.createdAt.toISOString(),
      })),
    })
  } catch (e) {
    console.error('GET /api/study-plans error:', e)
    return NextResponse.json({ success: false, error: '获取学习计划失败' }, { status: 500 })
  }
}

// 创建学习计划（需 publish_plan 权限）
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })
    if (!hasPermission(user, 'publish_plan')) {
      return NextResponse.json({ success: false, error: '无发布计划权限' }, { status: 403 })
    }

    const body = await req.json() as {
      groupId: string
      title: string
      content?: string
      dueDate?: string
    }

    if (!body.groupId || !body.title?.trim()) {
      return NextResponse.json({ success: false, error: '小组和标题必填' }, { status: 400 })
    }

    // 校验对小组的权限
    const group = await db.group.findUnique({ where: { id: body.groupId } })
    if (!group) return NextResponse.json({ success: false, error: '小组不存在' }, { status: 404 })
    if (group.creatorId !== user.id && user.role !== 'super_admin') {
      return NextResponse.json({ success: false, error: '只能给自己创建的小组发布计划' }, { status: 403 })
    }

    const plan = await db.studyPlan.create({
      data: {
        groupId: body.groupId,
        title: body.title.trim(),
        content: body.content?.trim() || null,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
        createdBy: user.id,
      },
    })

    return NextResponse.json({ success: true, data: { id: plan.id } })
  } catch (e) {
    console.error('POST /api/study-plans error:', e)
    return NextResponse.json({ success: false, error: '创建学习计划失败' }, { status: 500 })
  }
}
