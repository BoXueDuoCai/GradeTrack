import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })
    const notifications = await db.notification.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'desc' }, take: 50 })
    const groupIds = (await db.groupMember.findMany({ where: { userId: user.id }, select: { groupId: true } })).map(g => g.groupId)
    const allAnnouncements = await db.announcement.findMany({ orderBy: { createdAt: 'desc' }, include: { targets: true }, take: 30 })
    const announcements = allAnnouncements.filter(a => {
      if (a.scope === 'all') return true
      if (a.scope === 'groups') return a.targets.some(t => t.targetType === 'group' && groupIds.includes(t.targetId))
      if (a.scope === 'users') return a.targets.some(t => t.targetType === 'user' && t.targetId === user.id)
      return false
    })
    const reads = await db.announcementRead.findMany({ where: { userId: user.id }, select: { announcementId: true } })
    const readIds = new Set(reads.map(r => r.announcementId))
    // 学习计划到期提醒
    const studyPlanReminders: any[] = []
    if ((user.role === 'user' || user.role === 'test_user') && groupIds.length > 0) {
      const plans = await db.studyPlan.findMany({ where: { groupId: { in: groupIds } }, include: { group: { select: { name: true } } } })
      const completions = await db.studyPlanCompletion.findMany({ where: { userId: user.id }, select: { studyPlanId: true } })
      const completedSet = new Set(completions.map(c => c.studyPlanId))
      const now = new Date()
      const inThreeDays = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000)
      for (const p of plans) {
        if (completedSet.has(p.id) || !p.dueDate) continue
        const due = new Date(p.dueDate)
        if (due < now) {
          const days = Math.floor((now.getTime() - due.getTime()) / (1000 * 60 * 60 * 24))
          studyPlanReminders.push({ id: 'plan_due_' + p.id, kind: 'study_plan_due', type: 'study_plan_overdue', title: '学习计划已逾期：' + p.title, content: '属于「' + p.group.name + '」小组，已逾期 ' + days + ' 天', isRead: false, createdAt: p.dueDate.toISOString(), link: null })
        } else if (due <= inThreeDays) {
          const days = Math.ceil((due.getTime() - now.getTime()) / (1000 * 60 * 60 * 24))
          studyPlanReminders.push({ id: 'plan_due_' + p.id, kind: 'study_plan_due', type: 'study_plan_due_soon', title: '学习计划即将到期：' + p.title, content: '属于「' + p.group.name + '」小组，' + days + ' 天后到期', isRead: false, createdAt: p.createdAt.toISOString(), link: null })
        }
      }
    }
    const allNotifications = [
      ...notifications.map(n => ({ id: n.id, kind: 'notification' as const, type: n.type, title: n.title, content: n.content, link: n.link, isRead: n.isRead, createdAt: n.createdAt.toISOString() })),
      ...announcements.map(a => ({ id: a.id, kind: 'announcement' as const, type: 'announcement', title: a.title, content: a.content, authorName: a.authorName, scope: a.scope, isRead: readIds.has(a.id), createdAt: a.createdAt.toISOString() })),
      ...studyPlanReminders,
    ].sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
    return NextResponse.json({ success: true, data: { notifications: allNotifications, unreadCount: allNotifications.filter(n => !n.isRead).length } })
  } catch (e) { console.error('GET notifications:', e); return NextResponse.json({ success: false, error: '获取失败' }, { status: 500 }) }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })
    const body = await req.json() as { action: 'read_all' | 'read_one'; id?: string; kind?: 'notification' | 'announcement' }
    if (body.action === 'read_all') {
      await db.notification.updateMany({ where: { userId: user.id, isRead: false }, data: { isRead: true } })
      const groupIds = (await db.groupMember.findMany({ where: { userId: user.id }, select: { groupId: true } })).map(g => g.groupId)
      const allAnnouncements = await db.announcement.findMany({ include: { targets: true }, take: 50 })
      const visible = allAnnouncements.filter(a => {
        if (a.scope === 'all') return true
        if (a.scope === 'groups') return a.targets.some(t => t.targetType === 'group' && groupIds.includes(t.targetId))
        if (a.scope === 'users') return a.targets.some(t => t.targetType === 'user' && t.targetId === user.id)
        return false
      })
      const existingReads = await db.announcementRead.findMany({ where: { userId: user.id }, select: { announcementId: true } })
      const readSet = new Set(existingReads.map(r => r.announcementId))
      const toAdd = visible.filter(a => !readSet.has(a.id)).map(a => ({ announcementId: a.id, userId: user.id }))
      if (toAdd.length > 0) await db.announcementRead.createMany({ data: toAdd, skipDuplicates: true })
      return NextResponse.json({ success: true, data: { marked: toAdd.length } })
    }
    if (body.action === 'read_one' && body.id && body.kind) {
      if (body.kind === 'notification') await db.notification.updateMany({ where: { id: body.id, userId: user.id }, data: { isRead: true } })
      else await db.announcementRead.upsert({ where: { announcementId_userId: { announcementId: body.id, userId: user.id } }, update: {}, create: { announcementId: body.id, userId: user.id } })
      return NextResponse.json({ success: true })
    }
    return NextResponse.json({ success: false, error: '未知操作' }, { status: 400 })
  } catch { return NextResponse.json({ success: false, error: '操作失败' }, { status: 500 }) }
}
