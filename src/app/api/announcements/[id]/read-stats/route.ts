import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) return NextResponse.json({ success: false, error: '无权限' }, { status: 403 })
    const a = await db.announcement.findUnique({ where: { id }, include: { targets: true, reads: { include: { user: { select: { username: true, displayName: true } } } } } })
    if (!a) return NextResponse.json({ success: false, error: '公告不存在' }, { status: 404 })
    let targetUserIds: string[] = []
    if (a.scope === 'all') {
      const allUsers = await db.user.findMany({ where: { role: { in: ['user', 'test_user', 'admin'] } }, select: { id: true } })
      targetUserIds = allUsers.map(u => u.id)
    } else if (a.scope === 'groups') {
      const groupIds = a.targets.filter(t => t.targetType === 'group').map(t => t.targetId)
      const members = await db.groupMember.findMany({ where: { groupId: { in: groupIds } }, select: { userId: true } })
      targetUserIds = Array.from(new Set(members.map(m => m.userId)))
    } else {
      targetUserIds = a.targets.filter(t => t.targetType === 'user').map(t => t.targetId)
    }
    const targetUsers = await db.user.findMany({ where: { id: { in: targetUserIds } }, select: { id: true, username: true, displayName: true } })
    const readMap = new Map(a.reads.map(r => [r.userId, r]))
    return NextResponse.json({ success: true, data: { title: a.title, scope: a.scope, targets: a.targets, total: targetUsers.length, readCount: a.reads.length, unreadCount: targetUsers.length - a.reads.length, users: targetUsers.map(u => { const read = readMap.get(u.id); return { userId: u.id, username: u.username, displayName: u.displayName || u.username, isRead: !!read, readAt: read?.readAt.toISOString() ?? null } }) } })
  } catch { return NextResponse.json({ success: false, error: '获取失败' }, { status: 500 }) }
}
