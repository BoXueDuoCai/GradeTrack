import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { SUBJECTS, SubjectKey } from '@/lib/constants'
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, WidthType, AlignmentType, HeadingLevel, BorderStyle } from 'docx'

const STANDARD_ORDER: SubjectKey[] = ['chinese', 'math', 'english', 'physics', 'chemistry', 'biology', 'history', 'geography', 'politics', 'it']
const ASSIGNED = new Set(['physics', 'chemistry', 'biology', 'history', 'geography', 'politics'])

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
          totalRaw: e.scores.reduce((s, x) => s + (x.rawScore ?? 0), 0),
          totalAssigned: e.scores.reduce((s, x) => s + (x.assignedScore ?? x.rawScore ?? 0), 0),
          scores: e.scores,
        })),
      }
    }))

    const allExamNames = Array.from(new Set(membersData.flatMap(m => m.exams.map(e => e.name))))

    const children: (Paragraph | Table)[] = []

    // 标题
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_1,
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `${group.name} - 小组分析报告`, bold: true })],
    }))
    children.push(new Paragraph({
      alignment: AlignmentType.CENTER,
      children: [new TextRun({ text: `成员 ${membersData.length} 人 ｜ 生成时间：${new Date().toLocaleString('zh-CN')}`, size: 18, color: '666666' })],
    }))
    children.push(new Paragraph({ children: [] }))

    // 1. 成员成绩对比
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: '1. 成员成绩对比', bold: true })],
    }))
    const header1Cells = ['学号', '姓名', ...allExamNames.flatMap(n => [`${n}(原始)`, `${n}(赋分)`]), '原始均分', '赋分均分']
    const table1Rows = [
      new TableRow({
        children: header1Cells.map(h => new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
          width: { size: 100 / header1Cells.length, type: WidthType.PERCENTAGE },
        })),
        tableHeader: true,
      }),
      ...membersData.map(m => {
        const cells: (string | number)[] = [m.studentNo, m.displayName]
        allExamNames.forEach(n => {
          const exam = m.exams.find(e => e.name === n)
          cells.push(exam?.totalRaw ?? '-', exam?.totalAssigned ?? '-')
        })
        const raws = m.exams.map(e => e.totalRaw).filter(x => x > 0)
        const asgs = m.exams.map(e => e.totalAssigned).filter(x => x > 0)
        cells.push(raws.length ? Math.round(raws.reduce((a, b) => a + b, 0) / raws.length) : '-')
        cells.push(asgs.length ? Math.round(asgs.reduce((a, b) => a + b, 0) / asgs.length) : '-')
        return new TableRow({
          children: cells.map(c => new TableCell({
            children: [new Paragraph({ children: [new TextRun({ text: String(c) })] })],
            width: { size: 100 / cells.length, type: WidthType.PERCENTAGE },
          })),
        })
      }),
    ]
    children.push(new Table({
      rows: table1Rows,
      width: { size: 100, type: WidthType.PERCENTAGE },
    }))
    children.push(new Paragraph({ children: [] }))

    // 2. 学科薄弱点预警
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: '2. 学科薄弱点预警', bold: true })],
    }))
    const header3 = ['科目', '得分率', '均分', '满分', '状态', '建议']
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
          const full = ASSIGNED.has(sub) ? 70 : (sc.fullScore ?? 150)
          if (eff != null && full) rates.push(eff / full * 100)
        }
      })
      const avgRate = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0
      const full = ASSIGNED.has(sub) ? 70 : 150
      const avgScore = Math.round(avgRate * full / 100)
      const status = avgRate < 50 ? '严重薄弱' : avgRate < 60 ? '薄弱' : avgRate < 75 ? '一般' : '良好'
      const suggestion = avgRate < 50 ? '需重点突破' : avgRate < 60 ? '需要加强' : avgRate < 75 ? '保持稳定' : '保持优势'
      return [subject?.name ?? sub, avgRate.toFixed(1) + '%', String(avgScore), String(full), status, suggestion]
    })
    const table3Rows = [
      new TableRow({
        children: header3.map(h => new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
          width: { size: 100 / header3.length, type: WidthType.PERCENTAGE },
        })),
        tableHeader: true,
      }),
      ...weakRows.map(row => new TableRow({
        children: row.map(c => new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: c })] })],
          width: { size: 100 / row.length, type: WidthType.PERCENTAGE },
        })),
      })),
    ]
    children.push(new Table({
      rows: table3Rows,
      width: { size: 100, type: WidthType.PERCENTAGE },
    }))
    children.push(new Paragraph({ children: [] }))

    // 3. 进步榜
    children.push(new Paragraph({
      heading: HeadingLevel.HEADING_2,
      children: [new TextRun({ text: '3. 进步榜', bold: true })],
    }))
    const progressList = membersData.map(m => {
      const sorted = [...m.exams].sort((a, b) => a.name.localeCompare(b.name))
      const first = sorted[0]
      const last = sorted[sorted.length - 1]
      const diff = (last?.totalAssigned ?? 0) - (first?.totalAssigned ?? 0)
      return { studentNo: m.studentNo, displayName: m.displayName, first: first?.totalAssigned ?? 0, last: last?.totalAssigned ?? 0, diff }
    }).sort((a, b) => b.diff - a.diff)

    const header4 = ['排名', '学号', '姓名', '首场', '末场', '进步分']
    const table4Rows = [
      new TableRow({
        children: header4.map(h => new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: h, bold: true })] })],
          width: { size: 100 / header4.length, type: WidthType.PERCENTAGE },
        })),
        tableHeader: true,
      }),
      ...progressList.map((p, i) => new TableRow({
        children: [`#${i + 1}`, p.studentNo, p.displayName, String(p.first), String(p.last), `${p.diff > 0 ? '+' : ''}${p.diff}`].map(c => new TableCell({
          children: [new Paragraph({ children: [new TextRun({ text: c })] })],
          width: { size: 100 / 6, type: WidthType.PERCENTAGE },
        })),
      })),
    ]
    children.push(new Table({
      rows: table4Rows,
      width: { size: 100, type: WidthType.PERCENTAGE },
    }))

    const doc = new Document({
      sections: [{ children }],
    })

    const buf = await Packer.toBuffer(doc)
    const fileName = `${group.name}_小组分析_${Date.now()}.docx`
    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(fileName)}`,
      },
    })
  } catch (e) {
    console.error('Group analysis docx export error:', e)
    return NextResponse.json({ success: false, error: '导出失败' }, { status: 500 })
  }
}
