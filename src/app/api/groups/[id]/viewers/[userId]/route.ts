import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

// 移除查看者
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string; userId: string }> }) {
  try {
    const { id, userId } = await params
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })

    const group = await db.group.findUnique({ where: { id } })
    if (!group) return NextResponse.json({ success: false, error: '小组不存在' }, { status: 404 })

    if (group.creatorId !== user.id && user.role !== 'super_admin') {
      return NextResponse.json({ success: false, error: '只有创建者或超管能移除查看者' }, { status: 403 })
    }

    await db.groupViewer.deleteMany({ where: { groupId: id, userId } })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('DELETE /api/groups/[id]/viewers/[userId] error:', e)
    return NextResponse.json({ success: false, error: '移除查看者失败' }, { status: 500 })
  }
}
