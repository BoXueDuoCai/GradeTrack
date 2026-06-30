import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

async function requireLoggedIn() {
  const user = await getCurrentUser()
  if (!user) throw new Error('UNAUTHORIZED')
  return user
}

// 更新
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireLoggedIn()
    const { id } = await params
    const body = await req.json() as {
      title?: string
      content?: string
      dueDate?: string | null
      status?: 'pending' | 'done'
    }

    const existing = await db.personalPlan.findUnique({ where: { id } })
    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ success: false, error: '计划不存在或无权限' }, { status: 404 })
    }

    const data: Record<string, unknown> = {}
    if (body.title !== undefined) data.title = body.title
    if (body.content !== undefined) data.content = body.content || null
    if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null
    if (body.status !== undefined) data.status = body.status

    await db.personalPlan.update({ where: { id }, data })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('PUT /api/personal-plans/[id] error:', e)
    return NextResponse.json({ success: false, error: '更新失败' }, { status: 500 })
  }
}

// 删除
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const user = await requireLoggedIn()
    const { id } = await params

    const existing = await db.personalPlan.findUnique({ where: { id } })
    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ success: false, error: '计划不存在或无权限' }, { status: 404 })
    }

    await db.personalPlan.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('DELETE /api/personal-plans/[id] error:', e)
    return NextResponse.json({ success: false, error: '删除失败' }, { status: 500 })
  }
}
