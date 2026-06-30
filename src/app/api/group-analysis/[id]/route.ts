import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { SUBJECTS, SubjectKey } from '@/lib/constants'

// 获取小组成员的成绩分析
export async function GET(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })

    const group = await db.group.findUnique({
      where: { id },
      include: {
        members: {
          include: { user: { select: { username: true, displayName: true } } },
          orderBy: { studentNo: 'asc' },
        },
      },
    })
    if (!group) return NextResponse.json({ success: false, error: '小组不存在' }, { status: 404 })

    const isSuperAdmin = user.role === 'super_admin'
    const isCreator = group.creatorId === user.id
    const isViewer = await db.groupViewer.findUnique({
      where: { groupId_userId: { groupId: id, userId: user.id } },
    })
    const isMember = group.members.some(m => m.userId === user.id)
    if (!isSuperAdmin && !isCreator && !isViewer && !isMember) {
      return NextResponse.json({ success: false, error: '无权访问' }, { status: 403 })
    }

    const membersData = await Promise.all(group.members.map(async m => {
      const exams = await db.exam.findMany({
        where: { userId: m.userId },
        orderBy: { date: 'asc' },
        include: { scores: true },
      })
      return {
        userId: m.userId,
        username: m.user.username,
        displayName: m.user.displayName,
        studentNo: m.studentNo,
        exams: exams.map(e => ({
          id: e.id,
          name: e.name,
          examType: e.examType,
          grade: e.grade,
          date: e.date.toISOString(),
          scores: e.scores.map(s => {
            const subject = SUBJECTS[s.subject as SubjectKey]
            return {
              subject: s.subject,
              subjectName: subject?.name ?? s.subject,
              rawScore: s.rawScore,
              assignedScore: s.assignedScore,
              effective: s.assignedScore ?? s.rawScore,
              fullScore: s.fullScore,
              classRank: s.classRank,
              gradeRank: s.gradeRank,
            }
          }),
          totalRaw: e.scores.reduce((sum, s) => sum + (s.rawScore ?? 0), 0),
          totalAssigned: e.scores.reduce((sum, s) => sum + (s.assignedScore ?? s.rawScore ?? 0), 0),
        })),
      }
    }))

    const allExamNames = Array.from(new Set(membersData.flatMap(m => m.exams.map(e => e.name))))

    return NextResponse.json({
      success: true,
      data: {
        group: { id: group.id, name: group.name },
        members: membersData,
        allExamNames,
      },
    })
  } catch (e) {
    console.error('GET /api/group-analysis/[id] error:', e)
    return NextResponse.json({ success: false, error: '获取小组分析失败' }, { status: 500 })
  }
}
