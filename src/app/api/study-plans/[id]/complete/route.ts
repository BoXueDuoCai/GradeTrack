import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

// 学生标记学习计划完成 / 取消完成
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: planId } = await params
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })

    const body = await req.json() as { action: 'complete' | 'uncomplete'; note?: string }

    // 验证学生是计划所在小组的成员
    const plan = await db.studyPlan.findUnique({
      where: { id: planId },
      include: { group: { include: { members: true } } },
    })
    if (!plan) return NextResponse.json({ success: false, error: '计划不存在' }, { status: 404 })

    const isMember = plan.group.members.some(m => m.userId === user.id)
    const isSuperAdmin = user.role === 'super_admin'
    if (!isMember && !isSuperAdmin) {
      return NextResponse.json({ success: false, error: '只能标记自己所在小组的计划' }, { status: 403 })
    }

    if (body.action === 'complete') {
      await db.studyPlanCompletion.upsert({
        where: { studyPlanId_userId: { studyPlanId: planId, userId: user.id } },
        update: { completedAt: new Date(), note: body.note ?? null },
        create: { studyPlanId: planId, userId: user.id, note: body.note ?? null },
      })
      return NextResponse.json({ success: true, data: { completed: true } })
    } else {
      await db.studyPlanCompletion.deleteMany({ where: { studyPlanId: planId, userId: user.id } })
      return NextResponse.json({ success: true, data: { completed: false } })
    }
  } catch (e) {
    console.error('POST /api/study-plans/[id]/complete error:', e)
    return NextResponse.json({ success: false, error: '操作失败' }, { status: 500 })
  }
}

// 获取完成情况（管理员看：所有成员的完成情况；学生看：自己是否完成）
export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: planId } = await params
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })

    const plan = await db.studyPlan.findUnique({
      where: { id: planId },
      include: {
        group: { include: { members: { include: { user: { select: { username: true, displayName: true } } }, orderBy: { studentNo: 'asc' } } } },
        completions: true,
      },
    })
    if (!plan) return NextResponse.json({ success: false, error: '计划不存在' }, { status: 404 })

    const completionsMap = new Map(plan.completions.map(c => [c.userId, c]))

    return NextResponse.json({
      success: true,
      data: {
        planTitle: plan.title,
        groupId: plan.groupId,
        groupName: plan.group.name,
        total: plan.group.members.length,
        completed: plan.completions.length,
        completionRate: plan.group.members.length === 0 ? 0 : Math.round(plan.completions.length / plan.group.members.length * 100),
        members: plan.group.members.map(m => {
          const c = completionsMap.get(m.userId)
          return {
            userId: m.userId,
            studentNo: m.studentNo,
            displayName: m.user.displayName || m.user.username,
            username: m.user.username,
            completed: !!c,
            completedAt: c?.completedAt.toISOString() ?? null,
            note: c?.note ?? null,
          }
        }),
        // 当前用户是否完成
        myCompleted: !!completionsMap.get(user.id),
      },
    })
  } catch (e) {
    console.error('GET /api/study-plans/[id]/complete error:', e)
    return NextResponse.json({ success: false, error: '获取失败' }, { status: 500 })
  }
}
