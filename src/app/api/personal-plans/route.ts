import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

// 个人学习计划（所有登录用户可用）
async function requireLoggedIn() {
  const user = await getCurrentUser()
  if (!user) throw new Error('UNAUTHORIZED')
  return user
}

// 获取个人计划
export async function GET() {
  try {
    const user = await requireLoggedIn()
    const plans = await db.personalPlan.findMany({
      where: { userId: user.id },
      orderBy: [{ status: 'asc' }, { dueDate: 'asc' }, { createdAt: 'desc' }],
    })
    return NextResponse.json({
      success: true,
      data: plans.map(p => ({
        id: p.id,
        title: p.title,
        content: p.content,
        dueDate: p.dueDate?.toISOString() ?? null,
        status: p.status,
        createdAt: p.createdAt.toISOString(),
      })),
    })
  } catch (e) {
    console.error('GET /api/personal-plans error:', e)
    return NextResponse.json({ success: false, error: '获取失败' }, { status: 500 })
  }
}

// 创建
export async function POST(req: NextRequest) {
  try {
    const user = await requireLoggedIn()
    const body = await req.json() as { title: string; content?: string; dueDate?: string }
    if (!body.title?.trim()) {
      return NextResponse.json({ success: false, error: '标题必填' }, { status: 400 })
    }
    const plan = await db.personalPlan.create({
      data: {
        userId: user.id,
        title: body.title.trim(),
        content: body.content?.trim() || null,
        dueDate: body.dueDate ? new Date(body.dueDate) : null,
      },
    })
    return NextResponse.json({ success: true, data: { id: plan.id } })
  } catch (e) {
    console.error('POST /api/personal-plans error:', e)
    return NextResponse.json({ success: false, error: '创建失败' }, { status: 500 })
  }
}
