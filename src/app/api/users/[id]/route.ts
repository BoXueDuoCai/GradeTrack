import { NextRequest, NextResponse } from 'next/server'
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
