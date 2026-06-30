import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { ALL_GOAL_STATUSES, GoalStatus } from '@/lib/grade-system'

// 更新单个目标
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })

    const existing = await db.goal.findUnique({ where: { id } })
    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ success: false, error: '目标不存在或无权限' }, { status: 404 })
    }

    const body = await req.json() as {
      title?: string
      description?: string
      status?: GoalStatus
      examId?: string | null
      dueDate?: string | null
    }

    const data: Record<string, unknown> = {}
    if (body.title !== undefined) data.title = body.title
    if (body.description !== undefined) data.description = body.description || null
    if (body.status !== undefined && ALL_GOAL_STATUSES.includes(body.status)) data.status = body.status
    if (body.examId !== undefined) data.examId = body.examId || null
    if (body.dueDate !== undefined) data.dueDate = body.dueDate ? new Date(body.dueDate) : null

    const goal = await db.goal.update({ where: { id }, data })
    return NextResponse.json({ success: true, data: goal })
  } catch (e) {
    console.error('PUT /api/goals/[id] error:', e)
    return NextResponse.json({ success: false, error: '更新目标失败' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })

    const existing = await db.goal.findUnique({ where: { id } })
    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ success: false, error: '目标不存在或无权限' }, { status: 404 })
    }

    await db.goal.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('DELETE /api/goals/[id] error:', e)
    return NextResponse.json({ success: false, error: '删除目标失败' }, { status: 500 })
  }
}
