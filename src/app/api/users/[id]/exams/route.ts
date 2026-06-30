import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

// 超管查看某用户的所有考试
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })
    if (user.role !== 'super_admin') {
      return NextResponse.json({ success: false, error: '仅超级管理员可查看其他用户成绩' }, { status: 403 })
    }

    const target = await db.user.findUnique({ where: { id }, select: { id: true, username: true, displayName: true, role: true } })
    if (!target) return NextResponse.json({ success: false, error: '用户不存在' }, { status: 404 })

    const exams = await db.exam.findMany({
      where: { userId: id },
      orderBy: { date: 'asc' },
      include: {
        scores: {
          orderBy: { subject: 'asc' },
          include: { subScores: true },
        },
      },
    })

    return NextResponse.json({ success: true, data: { user: target, exams } })
  } catch (e) {
    console.error('GET /api/users/[id]/exams error:', e)
    return NextResponse.json({ success: false, error: '获取失败' }, { status: 500 })
  }
}
