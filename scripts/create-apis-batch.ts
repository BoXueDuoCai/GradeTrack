// 批量创建/更新所有 API 路由
import { writeFileSync, mkdirSync, existsSync } from 'fs'
import { join } from 'path'

const API_DIR = join(process.cwd(), 'src/app/api')

function writeApi(path: string, content: string) {
  const fullPath = join(API_DIR, path)
  mkdirSync(fullPath, { recursive: true })
  writeFileSync(join(fullPath, 'route.ts'), content)
  console.log('✓', path)
}

// === #8: auth/register - 用新的 isUsernameForbidden ===
writeApi('auth/register', `import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { hashPassword, createSession, setSessionCookie, getClientIp, recordLogin, isUsernameForbidden, isPasswordValid } from '@/lib/auth'
import { DEFAULT_ELECTIVE_SUBJECTS } from '@/lib/constants'

export async function POST(req: NextRequest) {
  try {
    const { username, password, displayName } = await req.json()
    if (!username || !password) return NextResponse.json({ success: false, error: '用户名和密码必填' }, { status: 400 })
    if (username.length < 3) return NextResponse.json({ success: false, error: '用户名至少 3 个字符' }, { status: 400 })
    const unameCheck = isUsernameForbidden(username)
    if (unameCheck.forbidden) return NextResponse.json({ success: false, error: unameCheck.reason }, { status: 400 })
    const pwdCheck = isPasswordValid(password)
    if (!pwdCheck.ok) return NextResponse.json({ success: false, error: pwdCheck.reason }, { status: 400 })
    const existing = await db.user.findUnique({ where: { username: username.trim() } })
    if (existing) return NextResponse.json({ success: false, error: '用户名已存在' }, { status: 409 })
    const user = await db.user.create({ data: { username: username.trim(), password: await hashPassword(password), displayName: displayName?.trim() || null, role: 'user', electiveSubjects: JSON.stringify(DEFAULT_ELECTIVE_SUBJECTS) } })
    const ip = getClientIp(req)
    const token = await createSession(user.id)
    await setSessionCookie(token)
    await recordLogin(user.id, ip)
    return NextResponse.json({ success: true, data: { id: user.id, username: user.username, role: user.role, displayName: user.displayName, electiveSubjects: DEFAULT_ELECTIVE_SUBJECTS, customExamTypes: null, mustChangePassword: false } })
  } catch (e) { console.error('register:', e); return NextResponse.json({ success: false, error: '注册失败' }, { status: 500 }) }
}
`)

// === #1: announcements - 多目标 + 编辑 ===
writeApi('announcements', `import { NextRequest, NextResponse } from 'next/server'
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
`)

// === #1 + #7: announcements/[id] - 编辑 + 删除（system 保护） ===
writeApi('announcements/[id]', `import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) return NextResponse.json({ success: false, error: '无权限' }, { status: 403 })
    const a = await db.announcement.findUnique({ where: { id } })
    if (!a) return NextResponse.json({ success: false, error: '公告不存在' }, { status: 404 })
    if (a.authorName === 'system' && user.role !== 'super_admin') return NextResponse.json({ success: false, error: '不能编辑 system 公告' }, { status: 403 })
    if (user.role === 'admin' && a.authorId !== user.id) return NextResponse.json({ success: false, error: '只能编辑自己发布的公告' }, { status: 403 })
    const body = await req.json() as { title?: string; content?: string; scope?: 'all' | 'groups' | 'users'; targets?: Array<{ targetType: 'group' | 'user'; targetId: string; targetName?: string }> }
    const data: any = {}
    if (body.title !== undefined) data.title = body.title.trim()
    if (body.content !== undefined) data.content = body.content.trim()
    if (body.scope !== undefined) data.scope = body.scope
    if (body.scope !== undefined && body.scope !== 'all' && body.targets) {
      await db.announcementTarget.deleteMany({ where: { announcementId: id } })
      data.targets = { create: body.targets.map(t => ({ targetType: t.targetType, targetId: t.targetId, targetName: t.targetName ?? null })) }
    } else if (body.scope === 'all') {
      await db.announcementTarget.deleteMany({ where: { announcementId: id } })
    }
    await db.announcement.update({ where: { id }, data })
    return NextResponse.json({ success: true })
  } catch { return NextResponse.json({ success: false, error: '更新失败' }, { status: 500 }) }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) return NextResponse.json({ success: false, error: '无权限' }, { status: 403 })
    const a = await db.announcement.findUnique({ where: { id } })
    if (!a) return NextResponse.json({ success: false, error: '公告不存在' }, { status: 404 })
    if (a.authorName === 'system' && user.role !== 'super_admin') return NextResponse.json({ success: false, error: '不能删除 system 公告' }, { status: 403 })
    if (user.role === 'admin' && a.authorId !== user.id) return NextResponse.json({ success: false, error: '只能删除自己发布的公告' }, { status: 403 })
    await db.announcement.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch { return NextResponse.json({ success: false, error: '删除失败' }, { status: 500 }) }
}
`)

// === #1: announcements/[id]/read-stats ===
mkdirSync(join(API_DIR, 'announcements/[id]/read-stats'), { recursive: true })
writeFileSync(join(API_DIR, 'announcements/[id]/read-stats/route.ts'), `import { NextResponse } from 'next/server'
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
`)
console.log('✓ announcements/[id]/read-stats')

// === #2 + #5: notifications - 学习计划提醒 + 修复 read_all ===
writeApi('notifications', `import { NextRequest, NextResponse } from 'next/server'
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
`)

// === #6: users - 管理员看到自己 + 同组 admin ===
writeApi('users', `import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser, hashPassword, parsePermissions, Role, ALL_ADMIN_PERMISSIONS } from '@/lib/auth'

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })
    if (user.role !== 'admin' && user.role !== 'super_admin') return NextResponse.json({ success: false, error: '无权限' }, { status: 403 })
    let users
    if (user.role === 'super_admin') {
      users = await db.user.findMany({ orderBy: { createdAt: 'desc' }, select: { id: true, username: true, role: true, displayName: true, electiveSubjects: true, permissions: true, mustChangePassword: true, lastLoginAt: true, lastLoginIp: true, createdAt: true } })
    } else {
      const ownedGroups = await db.group.findMany({ where: { creatorId: user.id }, select: { id: true } })
      const viewerGroups = await db.groupViewer.findMany({ where: { userId: user.id }, select: { groupId: true } })
      const groupIds = [...ownedGroups.map(g => g.id), ...viewerGroups.map(v => v.groupId)]
      const visibleUserIds = new Set<string>([user.id])
      if (groupIds.length > 0) {
        const memberships = await db.groupMember.findMany({ where: { groupId: { in: groupIds } }, select: { userId: true } })
        memberships.forEach(m => visibleUserIds.add(m.userId))
        const coViewers = await db.groupViewer.findMany({ where: { groupId: { in: groupIds } }, select: { userId: true } })
        coViewers.forEach(v => visibleUserIds.add(v.userId))
        const coCreators = await db.group.findMany({ where: { id: { in: groupIds } }, select: { creatorId: true } })
        coCreators.forEach(c => visibleUserIds.add(c.creatorId))
      }
      users = await db.user.findMany({ where: { id: { in: Array.from(visibleUserIds) }, role: { in: ['admin', 'user'] } }, orderBy: { createdAt: 'desc' }, select: { id: true, username: true, role: true, displayName: true, electiveSubjects: true, permissions: true, mustChangePassword: true, lastLoginAt: true, lastLoginIp: true, createdAt: true } })
    }
    const enriched = await Promise.all(users.map(async u => {
      const [examCount, goalCount, groupCount] = await Promise.all([db.exam.count({ where: { userId: u.id } }), db.goal.count({ where: { userId: u.id } }), db.groupMember.count({ where: { userId: u.id } })])
      return { ...u, electiveSubjects: u.electiveSubjects ? JSON.parse(u.electiveSubjects) : null, permissions: parsePermissions(u.permissions, u.role as Role), examCount, goalCount, groupCount }
    }))
    return NextResponse.json({ success: true, data: enriched })
  } catch (e) { console.error('GET users:', e); return NextResponse.json({ success: false, error: '获取失败' }, { status: 500 }) }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user || (user.role !== 'admin' && user.role !== 'super_admin')) return NextResponse.json({ success: false, error: '无权限' }, { status: 403 })
    const body = await req.json() as { username: string; password: string; displayName?: string; role?: Role }
    if (!body.username || !body.password) return NextResponse.json({ success: false, error: '用户名和密码必填' }, { status: 400 })
    if (body.username.length < 3) return NextResponse.json({ success: false, error: '用户名至少 3 个字符' }, { status: 400 })
    if (body.password.length < 6) return NextResponse.json({ success: false, error: '密码至少 6 个字符' }, { status: 400 })
    let targetRole: Role = 'user'
    if (body.role) {
      if (body.role === 'super_admin') return NextResponse.json({ success: false, error: '不能创建超级管理员' }, { status: 400 })
      if (body.role === 'admin' && user.role !== 'super_admin') return NextResponse.json({ success: false, error: '只有超级管理员能创建管理员' }, { status: 403 })
      targetRole = body.role
    }
    const existing = await db.user.findUnique({ where: { username: body.username.trim() } })
    if (existing) return NextResponse.json({ success: false, error: '用户名已存在' }, { status: 409 })
    let permissionsJson: string | null = null
    if (targetRole === 'admin') permissionsJson = JSON.stringify(ALL_ADMIN_PERMISSIONS)
    const newUser = await db.user.create({ data: { username: body.username.trim(), password: await hashPassword(body.password), displayName: body.displayName?.trim() || null, role: targetRole, permissions: permissionsJson, mustChangePassword: body.password === '123456' } })
    return NextResponse.json({ success: true, data: { id: newUser.id, username: newUser.username, role: newUser.role, displayName: newUser.displayName } })
  } catch (e) { console.error('POST users:', e); return NextResponse.json({ success: false, error: '创建失败' }, { status: 500 }) }
}
`)

// === #11: users/[id] - 超管不可重置自己密码 ===
writeApi('users/[id]', `import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser, hashPassword, Role, ALL_ADMIN_PERMISSIONS, AdminPermission } from '@/lib/auth'

export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    if (!user || user.role !== 'super_admin') return NextResponse.json({ success: false, error: '只有超级管理员能修改用户' }, { status: 403 })
    const target = await db.user.findUnique({ where: { id } })
    if (!target) return NextResponse.json({ success: false, error: '用户不存在' }, { status: 404 })
    if (target.role === 'super_admin' && target.id !== user.id) return NextResponse.json({ success: false, error: '不能修改其他超级管理员' }, { status: 400 })
    const body = await req.json() as { password?: string; role?: Role; displayName?: string; permissions?: AdminPermission[] }
    // #11: 超管不可重置自己的密码
    if (body.password !== undefined && target.id === user.id) {
      return NextResponse.json({ success: false, error: '不能重置自己的密码，请到设置页修改' }, { status: 400 })
    }
    const data: any = {}
    if (body.password !== undefined) {
      if (body.password.length < 6) return NextResponse.json({ success: false, error: '密码至少 6 个字符' }, { status: 400 })
      data.password = await hashPassword(body.password)
      if (body.password === '123456') data.mustChangePassword = true
    }
    if (body.role !== undefined) {
      if (body.role === 'super_admin') return NextResponse.json({ success: false, error: '不能将用户提升为超级管理员' }, { status: 400 })
      if (target.role === 'super_admin') return NextResponse.json({ success: false, error: '超级管理员不能被降级' }, { status: 400 })
      data.role = body.role
      if (body.role === 'user' || body.role === 'test_user') data.permissions = null
    }
    if (body.permissions !== undefined) {
      if (target.role !== 'admin' && body.role !== 'admin') return NextResponse.json({ success: false, error: '只能为管理员设置权限' }, { status: 400 })
      data.permissions = JSON.stringify(body.permissions.filter(p => ALL_ADMIN_PERMISSIONS.includes(p)))
    }
    if (body.displayName !== undefined) data.displayName = body.displayName.trim() || null
    const updated = await db.user.update({ where: { id }, data })
    return NextResponse.json({ success: true, data: { id: updated.id, username: updated.username, role: updated.role, displayName: updated.displayName, mustChangePassword: updated.mustChangePassword } })
  } catch (e) { console.error('PUT users/[id]:', e); return NextResponse.json({ success: false, error: '更新失败' }, { status: 500 }) }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    if (!user || user.role !== 'super_admin') return NextResponse.json({ success: false, error: '只有超级管理员能删除用户' }, { status: 403 })
    const target = await db.user.findUnique({ where: { id } })
    if (!target) return NextResponse.json({ success: false, error: '用户不存在' }, { status: 404 })
    if (target.role === 'super_admin') return NextResponse.json({ success: false, error: '不能删除超级管理员' }, { status: 400 })
    if (target.id === user.id) return NextResponse.json({ success: false, error: '不能删除自己' }, { status: 400 })
    await db.user.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch { return NextResponse.json({ success: false, error: '删除失败' }, { status: 500 }) }
}
`)

// === #7: groups/[id]/viewers - 不能授权 super_admin ===
writeApi('groups/[id]/viewers', `import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })
    const group = await db.group.findUnique({ where: { id } })
    if (!group) return NextResponse.json({ success: false, error: '小组不存在' }, { status: 404 })
    if (group.creatorId !== user.id && user.role !== 'super_admin') return NextResponse.json({ success: false, error: '只有创建者或超管能添加查看者' }, { status: 403 })
    const { username } = await req.json()
    if (!username?.trim()) return NextResponse.json({ success: false, error: '请输入用户名' }, { status: 400 })
    const targetUser = await db.user.findUnique({ where: { username: username.trim() } })
    if (!targetUser) return NextResponse.json({ success: false, error: '用户不存在' }, { status: 404 })
    if (targetUser.role === 'super_admin') return NextResponse.json({ success: false, error: '不能授权超级管理员（超管默认可查看所有小组）' }, { status: 400 })
    if (targetUser.role !== 'admin') return NextResponse.json({ success: false, error: '只能授权给管理员' }, { status: 400 })
    if (targetUser.id === group.creatorId) return NextResponse.json({ success: false, error: '创建者本身就有权限' }, { status: 400 })
    await db.groupViewer.upsert({ where: { groupId_userId: { groupId: id, userId: targetUser.id } }, update: {}, create: { groupId: id, userId: targetUser.id } })
    return NextResponse.json({ success: true })
  } catch { return NextResponse.json({ success: false, error: '添加失败' }, { status: 500 }) }
}
`)

// === #4: next-exam API ===
mkdirSync(join(API_DIR, 'next-exam'), { recursive: true })
writeFileSync(join(API_DIR, 'next-exam/route.ts'), `import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })
    const sp = req.nextUrl.searchParams
    const qUserId = sp.get('userId')
    const qGroupId = sp.get('groupId')
    let result = null
    if (qGroupId) {
      const s = await db.nextExamSetting.findFirst({ where: { groupId: qGroupId } })
      if (s) result = { scope: 'group', examDate: s.examDate.toISOString(), examName: s.examName, source: 'group' }
    } else if (qUserId) {
      const s = await db.nextExamSetting.findFirst({ where: { userId: qUserId } })
      if (s) result = { scope: 'user', examDate: s.examDate.toISOString(), examName: s.examName, source: 'user' }
    } else {
      const mySetting = await db.nextExamSetting.findFirst({ where: { userId: user.id } })
      if (mySetting) result = { scope: 'user', examDate: mySetting.examDate.toISOString(), examName: mySetting.examName, source: 'user' }
      else {
        const groupIds = (await db.groupMember.findMany({ where: { userId: user.id }, select: { groupId: true } })).map(g => g.groupId)
        if (groupIds.length > 0) {
          const gs = await db.nextExamSetting.findFirst({ where: { groupId: { in: groupIds } } })
          if (gs) result = { scope: 'group', examDate: gs.examDate.toISOString(), examName: gs.examName, source: 'group' }
        }
      }
    }
    return NextResponse.json({ success: true, data: result })
  } catch { return NextResponse.json({ success: false, error: '获取失败' }, { status: 500 }) }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })
    const body = await req.json() as { scope: 'user' | 'group'; userId?: string; groupId?: string; examDate: string; examName?: string }
    if (!body.examDate) return NextResponse.json({ success: false, error: '请填写考试日期' }, { status: 400 })
    if (body.scope === 'user') {
      const targetUserId = (user.role === 'admin' || user.role === 'super_admin') ? body.userId : user.id
      if (!targetUserId) return NextResponse.json({ success: false, error: '缺少 userId' }, { status: 400 })
      const existing = await db.nextExamSetting.findFirst({ where: { userId: targetUserId } })
      if (existing) await db.nextExamSetting.update({ where: { id: existing.id }, data: { examDate: new Date(body.examDate), examName: body.examName ?? null } })
      else await db.nextExamSetting.create({ data: { scope: 'user', userId: targetUserId, examDate: new Date(body.examDate), examName: body.examName ?? null } })
    } else if (body.scope === 'group') {
      if (user.role !== 'admin' && user.role !== 'super_admin') return NextResponse.json({ success: false, error: '无权限' }, { status: 403 })
      if (!body.groupId) return NextResponse.json({ success: false, error: '缺少 groupId' }, { status: 400 })
      if (user.role === 'admin') {
        const owned = await db.group.findFirst({ where: { id: body.groupId, creatorId: user.id } })
        const viewer = await db.groupViewer.findUnique({ where: { groupId_userId: { groupId: body.groupId, userId: user.id } } })
        if (!owned && !viewer) return NextResponse.json({ success: false, error: '只能给自己管理的小组设置' }, { status: 403 })
      }
      const existing = await db.nextExamSetting.findFirst({ where: { groupId: body.groupId } })
      if (existing) await db.nextExamSetting.update({ where: { id: existing.id }, data: { examDate: new Date(body.examDate), examName: body.examName ?? null } })
      else await db.nextExamSetting.create({ data: { scope: 'group', groupId: body.groupId, examDate: new Date(body.examDate), examName: body.examName ?? null } })
    }
    return NextResponse.json({ success: true })
  } catch { return NextResponse.json({ success: false, error: '保存失败' }, { status: 500 }) }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })
    const sp = req.nextUrl.searchParams
    const scope = sp.get('scope') as 'user' | 'group' | null
    const targetId = sp.get('targetId')
    if (!scope || !targetId) return NextResponse.json({ success: false, error: '缺少参数' }, { status: 400 })
    if (scope === 'user') {
      const targetUserId = (user.role === 'admin' || user.role === 'super_admin') ? targetId : user.id
      await db.nextExamSetting.deleteMany({ where: { userId: targetUserId } })
    } else if (scope === 'group') {
      if (user.role !== 'admin' && user.role !== 'super_admin') return NextResponse.json({ success: false, error: '无权限' }, { status: 403 })
      await db.nextExamSetting.deleteMany({ where: { groupId: targetId } })
    }
    return NextResponse.json({ success: true })
  } catch { return NextResponse.json({ success: false, error: '删除失败' }, { status: 500 }) }
}
`)
console.log('✓ next-exam')

// === #9: study-plans/[id]/attachments API ===
mkdirSync(join(API_DIR, 'study-plans/[id]/attachments'), { recursive: true })
writeFileSync(join(API_DIR, 'study-plans/[id]/attachments/route.ts'), `import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { writeFileSync, mkdirSync } from 'fs'
import { join } from 'path'
import { randomBytes } from 'crypto'

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'study-plans')
const MAX_SIZE = 20 * 1024 * 1024

export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: planId } = await params
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })
    const plan = await db.studyPlan.findUnique({ where: { id: planId } })
    if (!plan) return NextResponse.json({ success: false, error: '计划不存在' }, { status: 404 })
    if (plan.createdBy !== user.id && user.role !== 'super_admin') return NextResponse.json({ success: false, error: '无权上传' }, { status: 403 })
    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ success: false, error: '未提供文件' }, { status: 400 })
    if (file.size > MAX_SIZE) return NextResponse.json({ success: false, error: '文件不能超过 20MB' }, { status: 400 })
    mkdirSync(UPLOAD_DIR, { recursive: true })
    const ext = file.name.includes('.') ? file.name.split('.').pop() : 'bin'
    const safeName = randomBytes(8).toString('hex') + '.' + ext
    writeFileSync(join(UPLOAD_DIR, safeName), Buffer.from(await file.arrayBuffer()))
    const attachment = await db.studyPlanAttachment.create({ data: { studyPlanId: planId, filename: file.name, storagePath: safeName, mimeType: file.type || 'application/octet-stream', size: file.size } })
    return NextResponse.json({ success: true, data: { id: attachment.id, filename: attachment.filename } })
  } catch { return NextResponse.json({ success: false, error: '上传失败' }, { status: 500 }) }
}

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: planId } = await params
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })
    const plan = await db.studyPlan.findUnique({ where: { id: planId }, include: { group: { include: { members: true } } } })
    if (!plan) return NextResponse.json({ success: false, error: '计划不存在' }, { status: 404 })
    const isCreator = plan.createdBy === user.id
    const isSuperAdmin = user.role === 'super_admin'
    const isMember = plan.group.members.some(m => m.userId === user.id)
    if (!isCreator && !isSuperAdmin && !isMember) return NextResponse.json({ success: false, error: '无权访问' }, { status: 403 })
    const attachments = await db.studyPlanAttachment.findMany({ where: { studyPlanId: planId }, orderBy: { uploadedAt: 'desc' } })
    return NextResponse.json({ success: true, data: attachments.map(a => ({ id: a.id, filename: a.filename, mimeType: a.mimeType, size: a.size, uploadedAt: a.uploadedAt.toISOString(), canDelete: isCreator || isSuperAdmin })) })
  } catch { return NextResponse.json({ success: false, error: '获取失败' }, { status: 500 }) }
}
`)
console.log('✓ study-plans/[id]/attachments')

// === #9: attachments/[id] - 下载/删除 ===
mkdirSync(join(API_DIR, 'attachments/[id]'), { recursive: true })
writeFileSync(join(API_DIR, 'attachments/[id]/route.ts'), `import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { readFileSync } from 'fs'
import { join } from 'path'

const UPLOAD_DIR = join(process.cwd(), 'uploads', 'study-plans')

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })
    const att = await db.studyPlanAttachment.findUnique({ where: { id }, include: { studyPlan: { include: { group: { include: { members: true } } } } } })
    if (!att) return NextResponse.json({ success: false, error: '附件不存在' }, { status: 404 })
    const plan = att.studyPlan
    const isCreator = plan.createdBy === user.id
    const isSuperAdmin = user.role === 'super_admin'
    const isMember = plan.group.members.some(m => m.userId === user.id)
    if (!isCreator && !isSuperAdmin && !isMember) return NextResponse.json({ success: false, error: '无权下载' }, { status: 403 })
    let buf: Buffer
    try { buf = readFileSync(join(UPLOAD_DIR, att.storagePath)) } catch { return NextResponse.json({ success: false, error: '文件丢失' }, { status: 404 }) }
    return new NextResponse(buf, { headers: { 'Content-Type': att.mimeType, 'Content-Disposition': 'attachment; filename*=UTF-8\\'\\'' + encodeURIComponent(att.filename), 'Content-Length': String(att.size) } })
  } catch { return NextResponse.json({ success: false, error: '下载失败' }, { status: 500 }) }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })
    const att = await db.studyPlanAttachment.findUnique({ where: { id }, include: { studyPlan: true } })
    if (!att) return NextResponse.json({ success: false, error: '附件不存在' }, { status: 404 })
    if (att.studyPlan.createdBy !== user.id && user.role !== 'super_admin') return NextResponse.json({ success: false, error: '无权删除' }, { status: 403 })
    try { const { unlinkSync } = await import('fs'); unlinkSync(join(UPLOAD_DIR, att.storagePath)) } catch {}
    await db.studyPlanAttachment.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch { return NextResponse.json({ success: false, error: '删除失败' }, { status: 500 }) }
}
`)
console.log('✓ attachments/[id]')

// === #11: users/[id]/all - 超管查看用户完整信息 ===
mkdirSync(join(API_DIR, 'users/[id]/all'), { recursive: true })
writeFileSync(join(API_DIR, 'users/[id]/all/route.ts'), `import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })
    // 超管和管理员都可以查看（管理员只能看自己有权限的用户）
    if (user.role !== 'super_admin' && user.role !== 'admin') return NextResponse.json({ success: false, error: '无权限' }, { status: 403 })
    const target = await db.user.findUnique({ where: { id }, select: { id: true, username: true, displayName: true, role: true, electiveSubjects: true, customExamTypes: true, createdAt: true, lastLoginAt: true, lastLoginIp: true } })
    if (!target) return NextResponse.json({ success: false, error: '用户不存在' }, { status: 404 })
    const [exams, goals] = await Promise.all([
      db.exam.findMany({ where: { userId: id }, orderBy: { date: 'asc' }, include: { scores: { orderBy: { subject: 'asc' }, include: { subScores: true } } } }),
      db.goal.findMany({ where: { userId: id }, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }] }),
    ])
    return NextResponse.json({ success: true, data: { user: { ...target, electiveSubjects: target.electiveSubjects ? JSON.parse(target.electiveSubjects) : null, customExamTypes: target.customExamTypes ? JSON.parse(target.customExamTypes) : null }, exams, goals } })
  } catch { return NextResponse.json({ success: false, error: '获取失败' }, { status: 500 }) }
}
`)
console.log('✓ users/[id]/all')

console.log('\\nAll APIs created!')
