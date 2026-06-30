import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { SUBJECTS, EXAM_TYPES, SubjectKey } from '@/lib/constants'

// 管理员/超管导出某用户成绩 PDF（HTML 格式，含中文）
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

    const ASSIGNED = new Set(['physics', 'chemistry', 'biology', 'history', 'geography', 'politics'])
    const displayName = target.displayName || target.username

    const examSections = exams.map(exam => {
      const examType = EXAM_TYPES[exam.examType as keyof typeof EXAM_TYPES]
      const examTypeName = exam.examType === 'custom' ? '自定义' : (examType?.name ?? exam.examType)
      const dateStr = exam.date.toISOString().slice(0, 10)
      const totalRaw = exam.scores.reduce((s, x) => s + (x.rawScore ?? 0), 0)
      const totalAssigned = exam.scores.reduce((s, x) => s + (x.assignedScore ?? x.rawScore ?? 0), 0)
      const hasAssigned = exam.scores.some(s => ASSIGNED.has(s.subject) && s.assignedScore != null)

      const headers = ['科目', '原始分']
      if (hasAssigned) headers.push('赋分', '等级')
      headers.push('满分', '班排', '年排', '备注')

      const rows = exam.scores.map(s => {
        const subject = SUBJECTS[s.subject as SubjectKey]
        const cells = [subject?.name ?? s.subject]
        cells.push(s.rawScore != null ? String(s.rawScore) : '-')
        if (hasAssigned) {
          cells.push(s.assignedScore != null ? String(s.assignedScore) : '-')
          cells.push(s.grade ?? '-')
        }
        cells.push(s.fullScore != null ? String(s.fullScore) : '-')
        cells.push(s.classRank != null ? String(s.classRank) : '-')
        cells.push(s.gradeRank != null ? String(s.gradeRank) : '-')
        cells.push(s.note ?? '')
        return `<tr>${cells.map(c => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`
      }).join('')

      const subScoresSections = exam.scores.filter(s => s.subScores.length > 0).map(s => {
        const subject = SUBJECTS[s.subject as SubjectKey]
        const subRows = s.subScores.map(ss => `<tr><td>${escapeHtml(ss.questionNo)}</td><td>${ss.score != null ? ss.score : '-'}</td><td>${ss.fullScore != null ? ss.fullScore : '-'}</td></tr>`).join('')
        return `<div class="subscore-block"><h4>${subject?.name ?? s.subject} - 小分明细</h4><table class="subscore-table"><thead><tr><th>题号</th><th>得分</th><th>满分</th></tr></thead><tbody>${subRows}</tbody></table></div>`
      }).join('')

      return `<div class="exam-section"><h2>${escapeHtml(exam.name)}</h2><div class="exam-meta">类型：${escapeHtml(examTypeName)} ｜ 年级：${escapeHtml(exam.grade)} ｜ 日期：${dateStr}</div><div class="total">原始分总分：<strong>${totalRaw}</strong>${hasAssigned ? ` ｜ 赋分总分：<strong>${totalAssigned}</strong>` : ''}</div><table class="score-table"><thead><tr>${headers.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows}</tbody></table>${subScoresSections}</div>`
    }).join('')

    const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>成绩报告 - ${escapeHtml(displayName)}</title>
<style>
@page { size: A4; margin: 15mm; }
body { font-family: "Noto Sans SC", "Microsoft YaHei", sans-serif; color: #1a1a1a; line-height: 1.5; margin: 0; padding: 20px; }
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
@media print { body { padding: 0; } .exam-section { page-break-inside: avoid; } }
.print-btn { position: fixed; top: 20px; right: 20px; padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; box-shadow: 0 2px 8px rgba(0,0,0,0.2); }
@media print { .print-btn { display: none; } }
</style></head><body>
<button class="print-btn" onclick="window.print()">🖨️ 打印 / 保存为 PDF</button>
<h1>高中成绩报告</h1>
<div class="meta">用户：${escapeHtml(displayName)}（@${escapeHtml(target.username)}）｜ 生成时间：${new Date().toLocaleString('zh-CN')} ｜ 共 ${exams.length} 场考试</div>
${examSections}
</body></html>`

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(`${displayName}_成绩报告`)}.html`,
      },
    })
  } catch (e) {
    console.error('Export user pdf error:', e)
    return NextResponse.json({ success: false, error: '导出失败' }, { status: 500 })
  }
}

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
