import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { SUBJECTS, SubjectKey } from '@/lib/constants'
import * as XLSX from 'xlsx'

const STANDARD_ORDER: SubjectKey[] = [
  'chinese', 'math', 'english', 'physics', 'chemistry', 'biology',
  'history', 'geography', 'politics', 'it',
]

export async function GET(_req: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })
    if (user.role !== 'admin' && user.role !== 'super_admin') {
      return NextResponse.json({ success: false, error: '无权限' }, { status: 403 })
    }

    const group = await db.group.findUnique({
      where: { id },
      include: {
        members: { include: { user: { select: { username: true, displayName: true } } }, orderBy: { studentNo: 'asc' } },
      },
    })
    if (!group) return NextResponse.json({ success: false, error: '小组不存在' }, { status: 404 })

    const isSuperAdmin = user.role === 'super_admin'
    const isCreator = group.creatorId === user.id
    const isViewer = await db.groupViewer.findUnique({ where: { groupId_userId: { groupId: id, userId: user.id } } })
    if (!isSuperAdmin && !isCreator && !isViewer) {
      return NextResponse.json({ success: false, error: '无权访问' }, { status: 403 })
    }

    // 收集成员数据
    const membersData = await Promise.all(group.members.map(async m => {
      const exams = await db.exam.findMany({
        where: { userId: m.userId },
        orderBy: { date: 'asc' },
        include: { scores: true },
      })
      return {
        studentNo: m.studentNo,
        username: m.user.username,
        displayName: m.user.displayName || m.user.username,
        exams: exams.map(e => ({
          name: e.name,
          date: e.date.toISOString().slice(0, 10),
          totalRaw: e.scores.reduce((s, x) => s + (x.rawScore ?? 0), 0),
          totalAssigned: e.scores.reduce((s, x) => s + (x.assignedScore ?? x.rawScore ?? 0), 0),
          scores: e.scores,
        })),
      }
    }))

    const allExamNames = Array.from(new Set(membersData.flatMap(m => m.exams.map(e => e.name))))

    const wb = XLSX.utils.book_new()

    // Sheet1: 成员总分对比
    const header1 = ['学号', '姓名', ...allExamNames.flatMap(n => [`${n}(原始)`, `${n}(赋分)`]), '原始均分', '赋分均分']
    const rows1 = membersData.map(m => {
      const row: (string | number)[] = [m.studentNo, m.displayName]
      allExamNames.forEach(n => {
        const exam = m.exams.find(e => e.name === n)
        row.push(exam?.totalRaw ?? '-', exam?.totalAssigned ?? '-')
      })
      const raws = m.exams.map(e => e.totalRaw).filter(x => x > 0)
      const asgs = m.exams.map(e => e.totalAssigned).filter(x => x > 0)
      row.push(raws.length ? Math.round(raws.reduce((a, b) => a + b, 0) / raws.length) : '-')
      row.push(asgs.length ? Math.round(asgs.reduce((a, b) => a + b, 0) / asgs.length) : '-')
      return row
    })
    const ws1 = XLSX.utils.aoa_to_sheet([header1, ...rows1])
    ws1['!cols'] = [{ wch: 10 }, { wch: 12 }, ...allExamNames.map(() => ({ wch: 10 })), ...allExamNames.map(() => ({ wch: 10 })), { wch: 10 }, { wch: 10 }]
    XLSX.utils.book_append_sheet(wb, ws1, '成员成绩对比')

    // Sheet2: 小组均分趋势
    const trendHeader = ['考试', '原始均分', '赋分均分', '最高分', '最低分']
    const trendRows = allExamNames.map(name => {
      const raws: number[] = []
      const asgs: number[] = []
      membersData.forEach(m => {
        const exam = m.exams.find(e => e.name === name)
        if (exam) {
          if (exam.totalRaw > 0) raws.push(exam.totalRaw)
          if (exam.totalAssigned > 0) asgs.push(exam.totalAssigned)
        }
      })
      return [
        name,
        raws.length ? Math.round(raws.reduce((a, b) => a + b, 0) / raws.length) : '-',
        asgs.length ? Math.round(asgs.reduce((a, b) => a + b, 0) / asgs.length) : '-',
        asgs.length ? Math.max(...asgs) : '-',
        asgs.length ? Math.min(...asgs) : '-',
      ]
    })
    const ws2 = XLSX.utils.aoa_to_sheet([trendHeader, ...trendRows])
    ws2['!cols'] = [{ wch: 18 }, { wch: 10 }, { wch: 10 }, { wch: 10 }, { wch: 10 }]
    XLSX.utils.book_append_sheet(wb, ws2, '均分趋势')

    // Sheet3: 单科均分对比
    const subjectHeader = ['科目', ...membersData.map(m => m.studentNo), '小组均分', '小组得分率']
    const subjectRows = STANDARD_ORDER.map(sub => {
      const subject = SUBJECTS[sub]
      const memberScores: number[] = []
      const memberCells = membersData.map(m => {
        // 取最近一次考试该科目的有效分
        const exam = m.exams[m.exams.length - 1]
        const sc = exam?.scores.find(s => s.subject === sub)
        const eff = sc ? (sc.assignedScore ?? sc.rawScore) : null
        if (eff != null) memberScores.push(eff)
        return eff ?? '-'
      })
      const avg = memberScores.length ? Math.round(memberScores.reduce((a, b) => a + b, 0) / memberScores.length) : 0
      const fullScore = ASSIGNED_HAS(sub) ? 70 : 150
      const rate = memberScores.length ? (avg / fullScore * 100).toFixed(1) + '%' : '-'
      return [subject?.name ?? sub, ...memberCells, avg, rate]
    })
    const ws3 = XLSX.utils.aoa_to_sheet([subjectHeader, ...subjectRows])
    ws3['!cols'] = [{ wch: 10 }, ...membersData.map(() => ({ wch: 8 })), { wch: 10 }, { wch: 10 }]
    XLSX.utils.book_append_sheet(wb, ws3, '单科对比')

    // Sheet4: 学科薄弱点预警
    const weakHeader = ['科目', '小组均分率', '小组均分', '满分', '状态', '建议']
    const weakRows = STANDARD_ORDER.filter(sub => membersData.some(m => {
      const exam = m.exams[m.exams.length - 1]
      return exam?.scores.some(s => s.subject === sub)
    })).map(sub => {
      const subject = SUBJECTS[sub]
      const rates: number[] = []
      membersData.forEach(m => {
        const exam = m.exams[m.exams.length - 1]
        const sc = exam?.scores.find(s => s.subject === sub)
        if (sc) {
          const eff = sc.assignedScore ?? sc.rawScore
          const full = ASSIGNED_HAS(sub) ? 70 : (sc.fullScore ?? 150)
          if (eff != null && full) rates.push(eff / full * 100)
        }
      })
      const avgRate = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0
      const avgScore = rates.length ? Math.round(avgRate * (ASSIGNED_HAS(sub) ? 70 : 150) / 100) : 0
      const fullScore = ASSIGNED_HAS(sub) ? 70 : 150
      const status = avgRate < 50 ? '严重薄弱' : avgRate < 60 ? '薄弱' : avgRate < 75 ? '一般' : '良好'
      const suggestion = avgRate < 50 ? '需重点突破，建议组织专项练习' : avgRate < 60 ? '需要加强，多练习基础题' : avgRate < 75 ? '保持稳定，争取提升' : '保持优势'
      return [subject?.name ?? sub, avgRate.toFixed(1) + '%', avgScore, fullScore, status, suggestion]
    })
    const ws4 = XLSX.utils.aoa_to_sheet([weakHeader, ...weakRows])
    ws4['!cols'] = [{ wch: 10 }, { wch: 12 }, { wch: 10 }, { wch: 8 }, { wch: 10 }, { wch: 30 }]
    XLSX.utils.book_append_sheet(wb, ws4, '薄弱点预警')

    const buf = XLSX.write(wb, { type: 'buffer', bookType: 'xlsx' })
    const fileName = `${group.name}_小组分析_${Date.now()}.xlsx`
    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    })
  } catch (e) {
    console.error('Group analysis excel export error:', e)
    return NextResponse.json({ success: false, error: '导出失败' }, { status: 500 })
  }
}

function ASSIGNED_HAS(sub: SubjectKey): boolean {
  return ['physics', 'chemistry', 'biology', 'history', 'geography', 'politics'].includes(sub)
}
