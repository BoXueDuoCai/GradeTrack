import { NextRequest, NextResponse } from 'next/server'
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
