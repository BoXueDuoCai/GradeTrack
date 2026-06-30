import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })
    // 超管和管理员都可以查看（管理员只能看自己有权限的用户）
    if (user.role !== 'super_admin' && user.role !== 'admin') return NextResponse.json({ success: false, error: '无权限' }, { status: 403 })
    const target = await db.user.findUnique({ where: { id }, select: { id: true, username: true, displayName: true, role: true, electiveSubjects: true, customExamTypes: true, createdAt: true, lastLoginAt: true, lastLoginIp: true } })
    if (!target) return NextResponse.json({ success: false, error: '用户不存在' }, { status: 404 })
    const [exams, goals] = await Promise.all([
      db.exam.findMany({ where: { userId: id }, orderBy: { date: 'asc' }, include: { scores: { orderBy: { subject: 'asc' }, include: { subScores: true } } } }),
      db.goal.findMany({ where: { userId: id }, orderBy: [{ status: 'asc' }, { createdAt: 'desc' }] }),
    ])
    return NextResponse.json({ success: true, data: { user: { ...target, electiveSubjects: target.electiveSubjects ? JSON.parse(target.electiveSubjects) : null, customExamTypes: target.customExamTypes ? JSON.parse(target.customExamTypes) : null }, exams, goals } })
  } catch { return NextResponse.json({ success: false, error: '获取失败' }, { status: 500 }) }
}
