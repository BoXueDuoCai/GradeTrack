import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

// 获取小组详情（含成员和查看者）
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })

    const group = await db.group.findUnique({
      where: { id },
      include: {
        creator: { select: { username: true, displayName: true } },
        members: {
          include: { user: { select: { username: true, displayName: true } } },
          orderBy: { studentNo: 'asc' },
        },
        viewers: {
          include: { user: { select: { username: true, displayName: true } } },
        },
      },
    })
    if (!group) return NextResponse.json({ success: false, error: '小组不存在' }, { status: 404 })

    // 权限检查
    const isSuperAdmin = user.role === 'super_admin'
    const isCreator = group.creatorId === user.id
    const isViewer = group.viewers.some(v => v.userId === user.id)
    const isMember = group.members.some(m => m.userId === user.id)
    if (!isSuperAdmin && !isCreator && !isViewer && !isMember) {
      return NextResponse.json({ success: false, error: '无权访问此小组' }, { status: 403 })
    }

    // 成员的考试数
    const membersWithStats = await Promise.all(
      group.members.map(async m => ({
        id: m.id,
        userId: m.userId,
        username: m.user.username,
        displayName: m.user.displayName,
        studentNo: m.studentNo,
        examCount: await db.exam.count({ where: { userId: m.userId } }),
      }))
    )

    return NextResponse.json({
      success: true,
      data: {
        group: {
          id: group.id,
          name: group.name,
          creatorId: group.creatorId,
          creatorName: group.creator.displayName || group.creator.username,
          createdAt: group.createdAt.toISOString(),
          isCreator,
          isViewer,
          isSuperAdmin,
        },
        members: membersWithStats,
        viewers: group.viewers.map(v => ({
          id: v.id,
          userId: v.userId,
          username: v.user.username,
          displayName: v.user.displayName,
        })),
      },
    })
  } catch (e) {
    console.error('GET /api/groups/[id] error:', e)
    return NextResponse.json({ success: false, error: '获取小组详情失败' }, { status: 500 })
  }
}

// 删除小组（仅创建者或超级管理员）
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })

    const group = await db.group.findUnique({ where: { id } })
    if (!group) return NextResponse.json({ success: false, error: '小组不存在' }, { status: 404 })

    if (group.creatorId !== user.id && user.role !== 'super_admin') {
      return NextResponse.json({ success: false, error: '只有创建者或超级管理员能删除' }, { status: 403 })
    }

    await db.group.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('DELETE /api/groups/[id] error:', e)
    return NextResponse.json({ success: false, error: '删除小组失败' }, { status: 500 })
  }
}
