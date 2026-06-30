import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { ALL_GOAL_STATUSES, GoalStatus } from '@/lib/grade-system'

// 获取当前用户的所有目标
export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })

    const goals = await db.goal.findMany({
      where: { userId: user.id },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
    })
    return NextResponse.json({ success: true, data: goals })
  } catch (e) {
    console.error('GET /api/goals error:', e)
    return NextResponse.json({ success: false, error: '获取目标失败' }, { status: 500 })
  }
}

// 新建目标
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })

    const body = await req.json() as {
      title: string
      description?: string
      status?: GoalStatus
      examId?: string
      dueDate?: string
    }

    if (!body.title || !body.title.trim()) {
      return NextResponse.json({ success: false, error: '标题必填' }, { status: 400 })
    }

    const status = body.status && ALL_GOAL_STATUSES.includes(body.status) ? body.status : 'active'

    const goal = await db.goal.create({
      data: {
        userId: user.id,
        title: body.title.trim(),
        description: body.description?.trim() || null,
        status,
        examId: body.examId || null,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
      },
    })
    return NextResponse.json({ success: true, data: goal })
  } catch (e) {
    console.error('POST /api/goals error:', e)
    return NextResponse.json({ success: false, error: '创建目标失败' }, { status: 500 })
  }
}

// 批量更新（保留接口）
export async function PUT(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })

    const body = await req.json() as Array<{
      id: string
      title?: string
      description?: string
      status?: GoalStatus
      examId?: string | null
      dueDate?: string | null
    }>

    const results = []
    for (const g of body) {
      const existing = await db.goal.findUnique({ where: { id: g.id } })
      if (!existing || existing.userId !== user.id) continue

      const data: Record<string, unknown> = {}
      if (g.title !== undefined) data.title = g.title
      if (g.description !== undefined) data.description = g.description || null
      if (g.status !== undefined && ALL_GOAL_STATUSES.includes(g.status)) data.status = g.status
      if (g.examId !== undefined) data.examId = g.examId || null
      if (g.dueDate !== undefined) data.dueDate = g.dueDate ? new Date(g.dueDate) : null

      const r = await db.goal.update({ where: { id: g.id }, data })
      results.push(r)
    }
    return NextResponse.json({ success: true, data: results })
  } catch (e) {
    console.error('PUT /api/goals error:', e)
    return NextResponse.json({ success: false, error: '更新目标失败' }, { status: 500 })
  }
}
