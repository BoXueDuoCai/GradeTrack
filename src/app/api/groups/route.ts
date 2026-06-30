import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser, hasPermission } from '@/lib/auth'

// 获取当前用户可见的小组列表
// - super_admin: 所有小组
// - admin (有 create_group 权限): 自己创建的 + 被授权查看的
// - 普通用户/test_user: 自己所在的小组（成员视角）
export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })

    let groups
    if (user.role === 'super_admin') {
      // 超级管理员看所有
      groups = await db.group.findMany({
        orderBy: { createdAt: 'desc' },
        include: {
          creator: { select: { username: true, displayName: true } },
          _count: { select: { members: true, viewers: true, studyPlans: true } },
        },
      })
    } else if (user.role === 'admin') {
      // 管理员：自己创建的 + 被授权的
      groups = await db.group.findMany({
        where: {
          OR: [
            { creatorId: user.id },
            { viewers: { some: { userId: user.id } } },
          ],
        },
        orderBy: { createdAt: 'desc' },
        include: {
          creator: { select: { username: true, displayName: true } },
          _count: { select: { members: true, viewers: true, studyPlans: true } },
        },
      })
    } else {
      // 普通用户/test_user：作为成员所在的小组
      const memberships = await db.groupMember.findMany({
        where: { userId: user.id },
        include: {
          group: {
            include: {
              creator: { select: { username: true, displayName: true } },
              _count: { select: { members: true, viewers: true, studyPlans: true } },
            },
          },
        },
      })
      groups = memberships.map(m => m.group)
    }

    const result = groups.map(g => ({
      id: g.id,
      name: g.name,
      creatorId: g.creatorId,
      creatorName: g.creator.displayName || g.creator.username,
      memberCount: g._count.members,
      viewerCount: g._count.viewers,
      studyPlanCount: g._count.studyPlans,
      createdAt: g.createdAt.toISOString(),
      isCreator: g.creatorId === user.id,
      isViewer: user.role === 'admin' && g.creatorId !== user.id,
      isSuperAdmin: user.role === 'super_admin',
    }))

    return NextResponse.json({ success: true, data: result })
  } catch (e) {
    console.error('GET /api/groups error:', e)
    return NextResponse.json({ success: false, error: '获取小组失败' }, { status: 500 })
  }
}

// 创建小组
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })
    if (!hasPermission(user, 'create_group')) {
      return NextResponse.json({ success: false, error: '无创建小组权限' }, { status: 403 })
    }

    const { name } = await req.json() as { name: string }
    if (!name?.trim()) {
      return NextResponse.json({ success: false, error: '请填写小组名称' }, { status: 400 })
    }

    const group = await db.group.create({
      data: {
        name: name.trim(),
        creatorId: user.id,
      },
    })

    return NextResponse.json({
      success: true,
      data: {
        id: group.id,
        name: group.name,
        creatorId: group.creatorId,
        createdAt: group.createdAt.toISOString(),
      },
    })
  } catch (e) {
    console.error('POST /api/groups error:', e)
    return NextResponse.json({ success: false, error: '创建小组失败' }, { status: 500 })
  }
}
