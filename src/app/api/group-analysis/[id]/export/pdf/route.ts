import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { SUBJECTS, SubjectKey } from '@/lib/constants'

// 小组分析 PDF 导出（HTML 格式）
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

    const STANDARD_ORDER: SubjectKey[] = ['chinese', 'math', 'english', 'physics', 'chemistry', 'biology', 'history', 'geography', 'politics', 'it']
    const ASSIGNED = new Set(['physics', 'chemistry', 'biology', 'history', 'geography', 'politics'])

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

    // 表1: 成员总分对比
    const header1 = ['学号', '姓名', ...allExamNames.map(n => `${n}<br>原始/赋分`), '原始均分', '赋分均分']
    const rows1 = membersData.map(m => {
      const cells = [m.studentNo, m.displayName]
      allExamNames.forEach(n => {
        const exam = m.exams.find(e => e.name === n)
        cells.push(exam ? `${exam.totalRaw} / ${exam.totalAssigned}` : '-')
      })
      const raws = m.exams.map(e => e.totalRaw).filter(x => x > 0)
      const asgs = m.exams.map(e => e.totalAssigned).filter(x => x > 0)
      cells.push(raws.length ? Math.round(raws.reduce((a, b) => a + b, 0) / raws.length) : '-')
      cells.push(asgs.length ? Math.round(asgs.reduce((a, b) => a + b, 0) / asgs.length) : '-')
      return `<tr>${cells.map(c => `<td>${c}</td>`).join('')}</tr>`
    }).join('')

    // 表2: 单科对比
    const header2 = ['科目', ...membersData.map(m => m.studentNo), '小组均分', '得分率']
    const rows2 = STANDARD_ORDER.filter(sub => membersData.some(m => {
      const exam = m.exams[m.exams.length - 1]
      return exam?.scores.some(s => s.subject === sub)
    })).map(sub => {
      const subject = SUBJECTS[sub]
      const memberScores: number[] = []
      const memberCells = membersData.map(m => {
        const exam = m.exams[m.exams.length - 1]
        const sc = exam?.scores.find(s => s.subject === sub)
        const eff = sc ? (sc.assignedScore ?? sc.rawScore) : null
        if (eff != null) memberScores.push(eff)
        return eff ?? '-'
      })
      const avg = memberScores.length ? Math.round(memberScores.reduce((a, b) => a + b, 0) / memberScores.length) : 0
      const full = ASSIGNED.has(sub) ? 70 : 150
      const rate = memberScores.length ? (avg / full * 100).toFixed(1) + '%' : '-'
      return `<tr><td>${subject?.name ?? sub}</td>${memberCells.map(c => `<td>${c}</td>`).join('')}<td>${avg}</td><td>${rate}</td></tr>`
    }).join('')

    // 表3: 学科薄弱点预警
    const header3 = ['科目', '小组得分率', '小组均分', '满分', '状态', '建议']
    const rows3 = STANDARD_ORDER.filter(sub => membersData.some(m => {
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
      const status = avgRate < 50 ? '<span style="color:#dc2626;font-weight:bold">严重薄弱</span>' : avgRate < 60 ? '<span style="color:#ef4444">薄弱</span>' : avgRate < 75 ? '<span style="color:#f59e0b">一般</span>' : '<span style="color:#10b981">良好</span>'
      const suggestion = avgRate < 50 ? '需重点突破，建议组织专项练习' : avgRate < 60 ? '需要加强，多练习基础题' : avgRate < 75 ? '保持稳定，争取提升' : '保持优势'
      return `<tr><td>${subject?.name ?? sub}</td><td>${avgRate.toFixed(1)}%</td><td>${avgScore}</td><td>${full}</td><td>${status}</td><td>${suggestion}</td></tr>`
    }).join('')

    // 进步榜
    const progressList = membersData.map(m => {
      const sorted = [...m.exams].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      const first = sorted[0]
      const last = sorted[sorted.length - 1]
      const diff = (last?.totalAssigned ?? 0) - (first?.totalAssigned ?? 0)
      return { studentNo: m.studentNo, displayName: m.displayName, first: first?.totalAssigned ?? 0, last: last?.totalAssigned ?? 0, diff }
    }).sort((a, b) => b.diff - a.diff)

    const progressHtml = progressList.map((p, i) => {
      const color = i === 0 ? '#f59e0b' : i === 1 ? '#9ca3af' : i === 2 ? '#cd7f32' : '#666'
      return `<tr><td style="color:${color};font-weight:bold">#${i + 1}</td><td>${p.studentNo}</td><td>${p.displayName}</td><td>${p.first}</td><td>${p.last}</td><td style="color:${p.diff > 0 ? '#10b981' : p.diff < 0 ? '#ef4444' : '#666'};font-weight:bold">${p.diff > 0 ? '+' : ''}${p.diff}</td></tr>`
    }).join('')

    const html = `<!DOCTYPE html>
<html lang="zh-CN"><head><meta charset="UTF-8"><title>${escapeHtml(group.name)} - 小组分析报告</title>
<style>
@page { size: A4 landscape; margin: 12mm; }
body { font-family: "Noto Sans SC", "Microsoft YaHei", sans-serif; color: #1a1a1a; line-height: 1.5; margin: 0; padding: 20px; }
h1 { font-size: 22px; text-align: center; margin: 0 0 5px; }
h2 { font-size: 16px; margin: 25px 0 10px; padding-bottom: 4px; border-bottom: 2px solid #3b82f6; }
.meta { text-align: center; color: #666; font-size: 12px; margin-bottom: 20px; }
table { width: 100%; border-collapse: collapse; font-size: 11px; margin-bottom: 10px; }
th, td { border: 1px solid #ddd; padding: 4px 6px; text-align: center; }
th { background: #f5f5f5; font-weight: 600; }
tr:nth-child(even) td { background: #fafafa; }
@media print { body { padding: 0; } }
.print-btn { position: fixed; top: 20px; right: 20px; padding: 10px 20px; background: #3b82f6; color: white; border: none; border-radius: 6px; font-size: 14px; cursor: pointer; }
@media print { .print-btn { display: none; } }
</style></head><body>
<button class="print-btn" onclick="window.print()">🖨️ 打印 / 保存为 PDF</button>
<h1>${escapeHtml(group.name)} - 小组分析报告</h1>
<div class="meta">成员 ${membersData.length} 人 ｜ 生成时间：${new Date().toLocaleString('zh-CN')}</div>

<h2>1. 成员成绩对比</h2>
<table><thead><tr>${header1.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows1}</tbody></table>

<h2>2. 单科成绩对比（最近一次考试）</h2>
<table><thead><tr>${header2.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows2}</tbody></table>

<h2>3. 学科薄弱点预警</h2>
<table><thead><tr>${header3.map(h => `<th>${h}</th>`).join('')}</tr></thead><tbody>${rows3}</tbody></table>

<h2>4. 进步榜（首场 vs 末场，赋分）</h2>
<table><thead><tr><th>排名</th><th>学号</th><th>姓名</th><th>首场</th><th>末场</th><th>进步分</th></tr></thead><tbody>${progressHtml}</tbody></table>
</body></html>`

    return new NextResponse(html, {
      headers: {
        'Content-Type': 'text/html; charset=utf-8',
        'Content-Disposition': `inline; filename*=UTF-8''${encodeURIComponent(`${group.name}_小组分析`)}.html`,
      },
    })
  } catch (e) {
    console.error('Group analysis PDF export error:', e)
    return NextResponse.json({ success: false, error: '导出失败' }, { status: 500 })
  }
}

function escapeHtml(s: string): string {
  return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;')
}
