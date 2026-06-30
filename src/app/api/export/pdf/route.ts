import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { SUBJECTS, EXAM_TYPES, SubjectKey } from '@/lib/constants'

// PDF 导出改为返回 HTML 报告（用户可在浏览器中打印为 PDF）
// 因为 jsPDF 默认不支持中文字体，嵌入字体文件太大（5MB+）
// 用 HTML + 浏览器原生打印功能更可靠

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
      include: {
        scores: {
          orderBy: { subject: 'asc' },
          include: { subScores: true },
        },
      },
    })

    const html = generateHTML(user.username, exams)

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(examId ? '成绩报告' : '全部成绩报告')}.html`,
      },
    })
  } catch (e) {
    console.error('PDF export error:', e)
    return NextResponse.json({ success: false, error: '导出失败' }, { status: 500 })
  }
}

function generateHTML(username: string, exams: Array<{
  name: string
  examType: string
  grade: string
  date: Date
  scores: Array<{
    subject: string
    rawScore: number | null
    fullScore: number | null
    assignedScore: number | null
    grade: string | null
    classRank: number | null
    gradeRank: number | null
    note: string | null
    subScores: Array<{ questionNo: string; score: number | null; fullScore: number | null }>
  }>
}>): string {
  const ASSIGNED = new Set(['physics', 'chemistry', 'biology', 'history', 'geography', 'politics'])

  const examSections = exams.map(exam => {
    const examType = EXAM_TYPES[exam.examType as keyof typeof EXAM_TYPES]
    const examTypeName = exam.examType === 'custom' ? '自定义' : (examType?.name ?? exam.examType)
    const dateStr = exam.date.toISOString().slice(0, 10)

    // 计算总分
    const totalRaw = exam.scores.reduce((s, x) => s + (x.rawScore ?? 0), 0)
    const totalAssigned = exam.scores.reduce((s, x) => s + (x.assignedScore ?? x.rawScore ?? 0), 0)
    const hasAssigned = exam.scores.some(s => ASSIGNED.has(s.subject) && s.assignedScore != null)

    // 表头
    const headers = ['科目', '原始分']
    if (hasAssigned) headers.push('赋分', '等级')
    headers.push('满分', '得分率', '班排', '年排', '备注')

    // 表行
    const rows = exam.scores.map(s => {
      const subject = SUBJECTS[s.subject as SubjectKey]
      const score = s.assignedScore ?? s.rawScore
      const rate = score != null && s.fullScore ? (score / s.fullScore * 100).toFixed(1) + '%' : '-'
      const cells = [subject?.name ?? s.subject]
      cells.push(s.rawScore != null ? String(s.rawScore) : '-')
      if (hasAssigned) {
        cells.push(s.assignedScore != null ? String(s.assignedScore) : '-')
        cells.push(s.grade ?? '-')
      }
      cells.push(s.fullScore != null ? String(s.fullScore) : '-')
      cells.push(rate)
      cells.push(s.classRank != null ? String(s.classRank) : '-')
      cells.push(s.gradeRank != null ? String(s.gradeRank) : '-')
      cells.push(s.note ?? '')
      return `<tr>${cells.map(c => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`
    }).join('')

    // 小分明细
    const subScoresSections = exam.scores.filter(s => s.subScores.length > 0).map(s => {
      const subject = SUBJECTS[s.subject as SubjectKey]
      const subRows = s.subScores.map(ss => `
        <tr>
          <td>${escapeHtml(ss.questionNo)}</td>
          <td>${ss.score != null ? ss.score : '-'}</td>
          <td>${ss.fullScore != null ? ss.fullScore : '-'}</td>
        </tr>
      `).join('')
      return `
        <div class="subscore-block">
          <h4>${subject?.name ?? s.subject} - 小分明细</h4>
          <table class="subscore-table">
            <thead><tr><th>题号</th><th>得分</th><th>满分</th></tr></thead>
            <tbody>${subRows}</tbody>
          </table>
        </div>
      `
    }).join('')

    return `
      <div class="exam-section">
        <h2>${escapeHtml(exam.name)}</h2>
        <div class="exam-meta">
          类型：${escapeHtml(examTypeName)} ｜ 年级：${escapeHtml(exam.grade)} ｜ 日期：${dateStr}
        </div>
        <div class="total">
          原始分总分：<strong>${totalRaw}</strong>
          ${hasAssigned ? ` ｜ 赋分总分：<strong>${totalAssigned}</strong>` : ''}
        </div>
        <table class="score-table">
          <thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead>
          <tbody>${rows}</tbody>
        </table>
        ${subScoresSections}
      </div>
    `
  }).join('')

  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<title>成绩报告 - ${escapeHtml(username)}</title>
<style>
  @page { size: A4; margin: 15mm; }
  body {
    font-family: "Noto Sans SC", "Microsoft YaHei", "PingFang SC", sans-serif;
    color: #1a1a1a;
    line-height: 1.5;
    margin: 0;
    padding: 20px;
  }
  h1 { font-size: 22px; text-align: center; margin: 0 0 5px; }
  h2 { font-size: 16px; margin: 20px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #3b82f6; }
  h4 { font-size: 13px; margin: 12px 0 4px; color: #555; }
  .meta { text-align: center; color: #666; font-size: 12px; margin-bottom: 20px; }
  .exam-section { page-break-inside: avoid; margin-bottom: 20px; }
  .exam-meta { font-size: 12px; color: #666; margin-bottom: 6px; }
  .total { font-size: 13px; margin-bottom: 8px; padding: 6px 10px; background: #f0f7ff; border-left: 3px solid #3b82f6; }
  table { width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 10px; }
  th, td { border: 1px solid #ddd; padding: 5px 8px; text-align: center; }
  th { background: #f5f5f5; font-weight: 600; }
  tr:nth-child(even) td { background: #fafafa; }
  .subscore-table { font-size: 11px; }
  .subscore-block { margin-top: 10px; }
  @media print {
    body { padding: 0; }
    .exam-section { page-break-inside: avoid; }
  }
  .print-btn {
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 10px 20px;
    background: #3b82f6;
    color: white;
    border: none;
    border-radius: 6px;
    font-size: 14px;
    cursor: pointer;
    box-shadow: 0 2px 8px rgba(0,0,0,0.2);
  }
  @media print { .print-btn { display: none; } }
</style>
</head>
<body>
  <button class="print-btn" onclick="window.print()">🖨️ 打印 / 保存为 PDF</button>
  <h1>高中成绩报告</h1>
  <div class="meta">用户：${escapeHtml(username)} ｜ 生成时间：${new Date().toLocaleString('zh-CN')} ｜ 共 ${exams.length} 场考试</div>
  ${examSections}
  <script>
    // 自动打开打印对话框（可选）
    // window.onload = () => setTimeout(() => window.print(), 500);
  </script>
</body>
</html>`
}

function escapeHtml(s: string): string {
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
