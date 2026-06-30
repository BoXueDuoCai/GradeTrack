import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { ExamType, SubjectKey, resolveExamSubjects } from '@/lib/constants'

// 获取当前用户的所有考试
export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })

    const exams = await db.exam.findMany({
      where: { userId: user.id },
      orderBy: { date: 'asc' },
      include: {
        scores: {
          orderBy: { subject: 'asc' },
          include: { subScores: true },
        },
      },
    })
    return NextResponse.json({ success: true, data: exams })
  } catch (e) {
    console.error('GET /api/exams error:', e)
    return NextResponse.json({ success: false, error: '获取考试列表失败' }, { status: 500 })
  }
}

// 新建考试
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })

    const body = await req.json()
    const { name, examType, grade, date, scores, customSubjects, customTypeName } = body as {
      name: string
      examType: ExamType
      grade: string
      date: string
      customSubjects?: SubjectKey[]
      customTypeName?: string
      scores: Array<{
        subject: SubjectKey
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

    if (!name || !examType || !grade || !date) {
      return NextResponse.json({ success: false, error: '缺少必填字段' }, { status: 400 })
    }

    const exam = await db.exam.create({
      data: {
        userId: user.id,
        name,
        examType,
        customSubjects: customSubjects ? JSON.stringify(customSubjects) : null,
        grade,
        date: new Date(date),
        scores: {
          create: (scores ?? []).map(s => ({
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
  } catch (e) {
    console.error('POST /api/exams error:', e)
    return NextResponse.json({ success: false, error: '创建考试失败' }, { status: 500 })
  }
}
