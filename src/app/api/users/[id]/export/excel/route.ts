import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { SUBJECTS, EXAM_TYPES, SubjectKey } from '@/lib/constants'
import * as XLSX from 'xlsx'

const STANDARD_ORDER: SubjectKey[] = [
  'chinese', 'math', 'english',
  'physics', 'chemistry', 'biology',
  'history', 'geography', 'politics', 'it',
]
const ASSIGNED = new Set(['physics', 'chemistry', 'biology', 'history', 'geography', 'politics'])

// 管理员/超管导出某用户成绩 Excel
export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return NextResponse.json({ success: false, error: '无权限' }, { status: 403 })
    }

    const target = await db.user.findUnique({ where: { id }, select: { id: true, username: true, displayName: true } })
    if (!target) return NextResponse.json({ success: false, error: '用户不存在' }, { status: 404 })

    const exams = await db.exam.findMany({
      where: { userId: id },
      orderBy: { date: 'asc' },
      include: { scores: { include: { subScores: true } } },
    })

    const wb = XLSX.utils.book_new()

    // 总表：横向展开
    const summaryHeader: (string | number)[] = ['考试名称', '考试类型', '年级', '日期']
    STANDARD_ORDER.forEach(sub => {
      const subject = SUBJECTS[sub]
      summaryHeader.push(subject.name, '分数')
      if (ASSIGNED.has(sub)) summaryHeader.push('赋分', '等级')
      summaryHeader.push('班排', '年排')
    })
    const summaryRows: (string | number)[][] = [summaryHeader]
    for (const exam of exams) {
      const examType = EXAM_TYPES[exam.examType as keyof typeof EXAM_TYPES]
      const row: (string | number)[] = [
        exam.name,
        exam.examType === 'custom' ? '自定义' : (examType?.name ?? exam.examType),
        exam.grade,
        exam.date.toISOString().slice(0, 10),
      ]
      STANDARD_ORDER.forEach(sub => {
        const sc = exam.scores.find(s => s.subject === sub)
        if (sc) {
          row.push(sc.rawScore ?? '')
          if (ASSIGNED.has(sub)) row.push(sc.assignedScore ?? '', sc.grade ?? '')
          row.push(sc.classRank ?? '', sc.gradeRank ?? '')
        } else {
          // 缺该科目，填空
          row.push('')
          if (ASSIGNED.has(sub)) row.push('', '')
          row.push('', '')
        }
      })
      summaryRows.push(row)
    }
    const ws1 = XLSX.utils.aoa_to_sheet(summaryRows)
    const cols1: { wch: number }[] = [{ wch: 18 }, { wch: 12 }, { wch: 8 }, { wch: 12 }]
    STANDARD_ORDER.forEach(sub => {
      cols1.push({ wch: 8 }) // 分数
      if (ASSIGNED.has(sub)) { cols1.push({ wch: 8 }, { wch: 6 }) }
      cols1.push({ wch: 6 }, { wch: 6 })
    })
    ws1['!cols'] = cols1
    XLSX.utils.book_append_sheet(wb, ws1, '成绩总表')

    // 每场考试一页（横排 + 小分）
    for (const exam of exams) {
      const sheetName = `${exam.name}`.slice(0, 28).replace(/[\\/?*[\]:]/g, '_')
      const examSubjects = STANDARD_ORDER.filter(s => exam.scores.some(sc => sc.subject === s))
      const extras = exam.scores.filter(sc => !STANDARD_ORDER.includes(sc.subject as SubjectKey)).map(sc => sc.subject as SubjectKey)
      const orderedSubjects = [...examSubjects, ...extras]

      let maxSubCount = 0
      orderedSubjects.forEach(sub => {
        const sc = exam.scores.find(s => s.subject === sub)
        if (sc && sc.subScores.length > maxSubCount) maxSubCount = sc.subScores.length
      })

      const aoa: (string | number)[][] = []
      const header: (string | number)[] = ['科目', '成绩']
      const hasAssigned = orderedSubjects.some(s => ASSIGNED.has(s))
      if (hasAssigned) header.push('赋分')
      for (let i = 1; i <= maxSubCount; i++) header.push(String(i))
      aoa.push(header)

      for (const sub of orderedSubjects) {
        const sc = exam.scores.find(s => s.subject === sub)
        const isAssignedSubject = ASSIGNED.has(sub)
        const row: (string | number)[] = [SUBJECTS[sub]?.name ?? sub]
        row.push(sc?.rawScore != null ? sc.rawScore : '-')
        if (hasAssigned) {
          if (isAssignedSubject && sc && sc.grade && sc.assignedScore != null) {
            row.push(`${sc.grade}/${sc.assignedScore}`)
          } else if (isAssignedSubject && sc?.assignedScore != null) {
            row.push(sc.assignedScore)
          } else {
            row.push('-')
          }
        }
        if (sc && sc.subScores.length > 0) {
          for (const ss of sc.subScores) row.push(ss.score != null ? ss.score : '-')
          const diff = maxSubCount - sc.subScores.length
          for (let i = 0; i < diff; i++) row.push('-')
        } else {
          for (let i = 0; i < maxSubCount; i++) row.push('-')
        }
        aoa.push(row)
      }

      const ws = XLSX.utils.aoa_to_sheet(aoa)
      const cols: { wch: number }[] = [{ wch: 10 }, { wch: 8 }]
      if (hasAssigned) cols.push({ wch: 10 })
      for (let i = 0; i < maxSubCount; i++) cols.push({ wch: 6 })
      ws['!cols'] = cols
      XLSX.utils.book_append_sheet(wb, ws, sheetName)
    }

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    const fileName = `${target.username}_成绩_${Date.now()}.xlsx`
    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    })
  } catch (e) {
    console.error('Export user excel error:', e)
    return NextResponse.json({ success: false, error: '导出失败' }, { status: 500 })
  }
}
