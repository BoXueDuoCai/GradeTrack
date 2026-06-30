import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

// 更新考试
export async function PUT(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })

    // 校验所有权
    const existing = await db.exam.findUnique({ where: { id } })
    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ success: false, error: '考试不存在或无权限' }, { status: 404 })
    }

    const body = await req.json()
    const { name, examType, grade, date, scores, customSubjects } = body as {
      name?: string
      examType?: string
      grade?: string
      date?: string
      customSubjects?: string[]
      scores?: Array<{
        subject: string
        rawScore?: number | null
        fullScore?: number | null
        assignedScore?: number | null
        grade?: string | null
        classRank?: number | null
        gradeRank?: number | null
        note?: string | null
        subScores?: Array<{ questionNo: string; score?: number | null; fullScore?: number | null }>
      }>
    }

    const data: Record<string, unknown> = {}
    if (name !== undefined) data.name = name
    if (examType !== undefined) data.examType = examType
    if (grade !== undefined) data.grade = grade
    if (date !== undefined) data.date = new Date(date)
    if (customSubjects !== undefined) data.customSubjects = JSON.stringify(customSubjects)

    // 先删除原有成绩，再重新创建
    if (scores !== undefined) {
      await db.subjectScore.deleteMany({ where: { examId: id } })
      const exam = await db.exam.update({
        where: { id },
        data: {
          ...data,
          scores: {
            create: scores.map(s => ({
              subject: s.subject,
              rawScore: s.rawScore ?? null,
              fullScore: s.fullScore ?? null,
              assignedScore: s.assignedScore ?? null,
              grade: s.grade ?? null,
              classRank: s.classRank ?? null,
              gradeRank: s.gradeRank ?? null,
              note: s.note ?? null,
              subScores: s.subScores && s.subScores.length > 0 ? {
                create: s.subScores.map(ss => ({
                  questionNo: ss.questionNo,
                  score: ss.score ?? null,
                  fullScore: ss.fullScore ?? null,
                }))
              } : undefined,
            })),
          },
        },
        include: { scores: { include: { subScores: true } } },
      })
      return NextResponse.json({ success: true, data: exam })
    } else {
      const exam = await db.exam.update({ where: { id }, data })
      return NextResponse.json({ success: true, data: exam })
    }
  } catch (e) {
    console.error('PUT /api/exams/[id] error:', e)
    return NextResponse.json({ success: false, error: '更新考试失败' }, { status: 500 })
  }
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })

    const existing = await db.exam.findUnique({ where: { id } })
    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ success: false, error: '考试不存在或无权限' }, { status: 404 })
    }

    await db.exam.delete({ where: { id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('DELETE /api/exams/[id] error:', e)
    return NextResponse.json({ success: false, error: '删除考试失败' }, { status: 500 })
  }
}
