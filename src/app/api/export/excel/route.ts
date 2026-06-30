import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { SUBJECTS, EXAM_TYPES, SubjectKey } from '@/lib/constants'
import * as XLSX from 'xlsx'
import ExcelJS from 'exceljs'

const STANDARD_ORDER: SubjectKey[] = [
  'chinese', 'math', 'english',
  'physics', 'chemistry', 'biology',
  'history', 'geography', 'politics', 'it',
]
const ASSIGNED = new Set(['physics', 'chemistry', 'biology', 'history', 'geography', 'politics'])

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })

    const searchParams = req.nextUrl.searchParams
    const examId = searchParams.get('examId')

    const where = examId ? { id: examId, userId: user.id } : { userId: user.id }
    const exams = await db.exam.findMany({
      where,
      orderBy: { date: 'asc' },
      include: { scores: { include: { subScores: true } } },
    })

    // 用 exceljs 生成（支持冻结首行）
    const wb = new ExcelJS.Workbook()
    const ws1 = wb.addWorksheet('成绩总表', {
      views: [{ state: 'frozen', ySplit: 1 }], // 冻结首行
      autoFilter: { from: 'A1' },
    })

    // 表头
    const header: string[] = ['考试名称', '考试类型', '年级', '日期']
    STANDARD_ORDER.forEach(sub => {
      const subject = SUBJECTS[sub]
      header.push(subject.name)
      if (ASSIGNED.has(sub)) {
        header.push('原始分', '赋分', '等级')
      } else {
        header.push('分数')
      }
      header.push('班级排名', '年级排名')
    })
    ws1.addRow(header)
    // 表头样式
    ws1.getRow(1).font = { bold: true }
    ws1.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }

    // 数据行
    for (const exam of exams) {
      const examType = EXAM_TYPES[exam.examType as keyof typeof EXAM_TYPES]
      const examTypeName = exam.examType === 'custom' ? '自定义' : (examType?.name ?? exam.examType)
      const row: (string | number)[] = [
        exam.name,
        examTypeName,
        exam.grade,
        exam.date.toISOString().slice(0, 10),
      ]
      STANDARD_ORDER.forEach(sub => {
        const sc = exam.scores.find(s => s.subject === sub)
        if (sc) {
          if (ASSIGNED.has(sub)) {
            row.push(sc.rawScore ?? '')
            row.push(sc.assignedScore ?? '')
            row.push(sc.grade ?? '')
          } else {
            row.push(sc.rawScore ?? '')
          }
          row.push(sc.classRank ?? '')
          row.push(sc.gradeRank ?? '')
        } else {
          if (ASSIGNED.has(sub)) {
            row.push('', '', '')
          } else {
            row.push('')
          }
          row.push('', '')
        }
      })
      ws1.addRow(row)
    }

    // 列宽
    ws1.columns.forEach((col, i) => {
      if (i < 4) col.width = i === 0 ? 22 : i === 3 ? 12 : 10
      else col.width = 8
    })

    // 启用筛选
    ws1.autoFilter = {
      from: { row: 1, column: 1 },
      to: { row: 1, column: header.length },
    }

    // Sheet 2-N: 每场考试横排（用 xlsx 库保留原逻辑）
    // 但 exceljs 也支持，统一用 exceljs
    for (const exam of exams) {
      const sheetName = `${exam.name}`.slice(0, 28).replace(/[\\/?*[\]:]/g, '_')
      const ws = wb.addWorksheet(sheetName)

      const examSubjects = STANDARD_ORDER.filter(s => exam.scores.some(sc => sc.subject === s))
      const extras = exam.scores.filter(sc => !STANDARD_ORDER.includes(sc.subject as SubjectKey)).map(sc => sc.subject as SubjectKey)
      const orderedSubjects = [...examSubjects, ...extras]

      let maxSubCount = 0
      orderedSubjects.forEach(sub => {
        const sc = exam.scores.find(s => s.subject === sub)
        if (sc && sc.subScores.length > maxSubCount) maxSubCount = sc.subScores.length
      })

      const hdr: string[] = ['科目', '成绩']
      const hasAssigned = orderedSubjects.some(s => ASSIGNED.has(s))
      if (hasAssigned) hdr.push('赋分')
      for (let i = 1; i <= maxSubCount; i++) hdr.push(String(i))
      ws.addRow(hdr)
      ws.getRow(1).font = { bold: true }
      ws.getRow(1).fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFE5E7EB' } }

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
        ws.addRow(row)
      }

      ws.columns.forEach((col, i) => {
        col.width = i === 0 ? 10 : i === 1 ? 8 : i === 2 && hasAssigned ? 10 : 6
      })
    }

    const buf = await wb.xlsx.writeBuffer()
    const fileName = examId ? `成绩明细_${Date.now()}.xlsx` : `全部成绩_${Date.now()}.xlsx`

    return new NextResponse(buf as Buffer, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    })
  } catch (e) {
    console.error('Excel export error:', e)
    return NextResponse.json({ success: false, error: 'Excel 导出失败' }, { status: 500 })
  }
}
