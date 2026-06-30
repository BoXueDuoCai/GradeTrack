import { NextRequest, NextResponse } from 'next/server'
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
