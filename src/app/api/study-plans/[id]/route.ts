import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

// 更新学习计划（创建者或超管）
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })

    const plan = await db.studyPlan.findUnique({ where: { id } })
    if (!plan) return NextResponse.json({ success: false, error: '计划不存在' }, { status: 404 })

    if (plan.createdBy !== user.id && user.role !== 'super_admin') {
      return NextResponse.json({ success: false, error: '无权编辑' }, { status: 403 })
    }

    const body = await req.json() as {
      title?: string
      content?: string
      dueDate?: string | null
    }

    const data: Record<string, unknown> = {}
    if (body.title !== undefined) data.title = body.title
    if (body.content !== undefined) data.content = body.content || null
    if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null

    await db.studyPlan.update({ where: { id }, data })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('PUT /api/study-plans/[id] error:', e)
    return NextResponse.json({ success: false, error: '更新失败' }, { status: 500 })
  }
}

// 删除学习计划（创建者或超管）
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })

    const plan = await db.studyPlan.findUnique({ where: { id } })
    if (!plan) return NextResponse.json({ success: false, error: '计划不存在' }, { status: 404 })

    if (plan.createdBy !== user.id && user.role !== 'super_admin') {
      return NextResponse.json({ success: false, error: '无权删除' }, { status: 403 })
    }

    await db.studyPlan.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('DELETE /api/study-plans/[id] error:', e)
    return NextResponse.json({ success: false, error: '删除失败' }, { status: 500 })
  }
}
