import { NextRequest, NextResponse } from 'next/server'
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
