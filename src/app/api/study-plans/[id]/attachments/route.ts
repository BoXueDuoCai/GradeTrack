import { NextRequest, NextResponse } from 'next/server'
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
