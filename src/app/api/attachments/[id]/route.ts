import { NextRequest, NextResponse } from 'next/server'
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
    return new NextResponse(buf, { headers: { 'Content-Type': att.mimeType, 'Content-Disposition': 'attachment; filename*=UTF-8\'\'' + encodeURIComponent(att.filename), 'Content-Length': String(att.size) } })
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
