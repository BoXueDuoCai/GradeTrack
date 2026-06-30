import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })
    let announcements
    if (user.role === 'super_admin') {
      announcements = await db.announcement.findMany({ orderBy: { createdAt: 'desc' }, include: { targets: true, reads: { select: { userId: true } } }, take: 100 })
    } else if (user.role === 'admin') {
      announcements = await db.announcement.findMany({ where: { OR: [{ authorId: user.id }, { authorName: 'system' }] }, orderBy: { createdAt: 'desc' }, include: { targets: true, reads: { select: { userId: true } } }, take: 100 })
    } else {
      const groupIds = (await db.groupMember.findMany({ where: { userId: user.id }, select: { groupId: true } })).map(g => g.groupId)
      const all = await db.announcement.findMany({ orderBy: { createdAt: 'desc' }, include: { targets: true, reads: { select: { userId: true } } }, take: 50 })
      announcements = all.filter(a => {
        if (a.scope === 'all') return true
        if (a.scope === 'groups') return a.targets.some(t => t.targetType === 'group' && groupIds.includes(t.targetId))
        if (a.scope === 'users') return a.targets.some(t => t.targetType === 'user' && t.targetId === user.id)
        return false
      })
    }
    return NextResponse.json({ success: true, data: announcements.map(a => ({ id: a.id, title: a.title, content: a.content, scope: a.scope, authorId: a.authorId, authorName: a.authorName, targets: a.targets, readCount: a.reads.length, createdAt: a.createdAt.toISOString(), updatedAt: a.updatedAt.toISOString(), isRead: a.reads.some(r => r.userId === user.id) })) })
  } catch { return NextResponse.json({ success: false, error: '获取失败' }, { status: 500 }) }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) return NextResponse.json({ success: false, error: '无权限' }, { status: 403 })
    const body = await req.json() as { title: string; content: string; scope: 'all' | 'groups' | 'users'; targets?: Array<{ targetType: 'group' | 'user'; targetId: string; targetName?: string }> }
    if (!body.title?.trim() || !body.content?.trim()) return NextResponse.json({ success: false, error: '标题和内容必填' }, { status: 400 })
    if (body.scope !== 'all' && (!body.targets?.length)) return NextResponse.json({ success: false, error: '请选择目标' }, { status: 400 })
    if (body.scope === 'all' && user.role === 'admin') return NextResponse.json({ success: false, error: '管理员不能发布全体公告' }, { status: 403 })
    const announcement = await db.announcement.create({ data: { title: body.title.trim(), content: body.content.trim(), scope: body.scope, authorId: user.role === 'super_admin' ? null : user.id, authorName: user.role === 'super_admin' ? 'system' : (user.displayName || user.username), targets: body.scope !== 'all' && body.targets ? { create: body.targets.map(t => ({ targetType: t.targetType, targetId: t.targetId, targetName: t.targetName ?? null })) } : undefined } })
    return NextResponse.json({ success: true, data: { id: announcement.id } })
  } catch { return NextResponse.json({ success: false, error: '发布失败' }, { status: 500 }) }
}
