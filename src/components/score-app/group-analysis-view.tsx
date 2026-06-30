'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import { Button } from '@/components/ui/button'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { BarChart3, Download, FileSpreadsheet, FileText, FileType2 } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import { fetchGroups } from './types'
import { toast } from 'sonner'
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  LineChart, Line, RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
} from 'recharts'
import { SUBJECTS, SubjectKey } from '@/lib/constants'

interface GroupAnalysisViewProps {
  selectedGroupId: string | null
}

interface MemberExam {
  userId: string
  username: string
  displayName: string | null
  studentNo: string
  exams: Array<{
    id: string
    name: string
    date: string
    totalRaw: number
    totalAssigned: number
    scores: Array<{
      subject: string
      subjectName: string
      rawScore: number | null
      assignedScore: number | null
      effective: number | null
      fullScore: number | null
    }>
  }>
}

export function GroupAnalysisView({ selectedGroupId }: GroupAnalysisViewProps) {
  const { data: groups = [] } = useQuery({ queryKey: ['groups'], queryFn: fetchGroups })
  const [groupId, setGroupId] = useState<string>(selectedGroupId || '')
  const [selectedExamName, setSelectedExamName] = useState<string>('')
  const [selectedSubject, setSelectedSubject] = useState<string>('total')

  const effectiveGroupId = groupId || selectedGroupId || ''

  const { data, isLoading } = useQuery({
    queryKey: ['group-analysis', effectiveGroupId],
    queryFn: async () => {
      const res = await fetch(`/api/group-analysis/${effectiveGroupId}`)
      const j = await res.json()
      if (!j.success) throw new Error(j.error)
      return j.data as { group: { id: string; name: string }; members: MemberExam[]; allExamNames: string[] }
    },
    enabled: !!effectiveGroupId,
  })

  const examNames = data?.allExamNames ?? []
  const currentExamName = selectedExamName || examNames[0] || ''

  // 1. 总分对比柱状图（某场考试）
  const totalBarData = useMemo(() => {
    if (!data) return []
    return data.members.map(m => {
      const exam = m.exams.find(e => e.name === currentExamName)
      return {
        name: m.studentNo,
        displayName: m.displayName || m.username,
        原始分: exam?.totalRaw ?? 0,
        赋分: exam?.totalAssigned ?? 0,
      }
    })
  }, [data, currentExamName])

  // 2. 均分趋势
  const trendData = useMemo(() => {
    if (!data) return []
    return examNames.map(name => {
      const scores: number[] = []
      data.members.forEach(m => {
        const exam = m.exams.find(e => e.name === name)
        if (exam && exam.totalAssigned > 0) scores.push(exam.totalAssigned)
      })
      return {
        name,
        平均分: scores.length ? Math.round(scores.reduce((a, b) => a + b, 0) / scores.length) : 0,
        最高分: scores.length ? Math.max(...scores) : 0,
        最低分: scores.length ? Math.min(...scores) : 0,
      }
    })
  }, [data, examNames])

  // 3. 单科对比柱状图
  const subjectBarData = useMemo(() => {
    if (!data) return []
    return data.members.map(m => {
      const exam = m.exams.find(e => e.name === currentExamName)
      const score = exam?.scores.find(s => s.subject === selectedSubject)
      const subject = SUBJECTS[selectedSubject as SubjectKey]
      return {
        name: m.studentNo,
        displayName: m.displayName || m.username,
        [subject?.name ?? selectedSubject]: score?.effective ?? 0,
      }
    })
  }, [data, currentExamName, selectedSubject])

  // 4. 雷达图：某场考试所有成员各科平均得分率（按原始分）
  const radarData = useMemo(() => {
    if (!data) return []
    const subjects = new Set<string>()
    data.members.forEach(m => {
      const exam = m.exams.find(e => e.name === currentExamName)
      exam?.scores.forEach(s => subjects.add(s.subject))
    })
    return Array.from(subjects).map(sub => {
      const subject = SUBJECTS[sub as SubjectKey]
      const rates: number[] = []
      data.members.forEach(m => {
        const exam = m.exams.find(e => e.name === currentExamName)
        const sc = exam?.scores.find(s => s.subject === sub)
        // 始终用原始分算得分率
        if (sc?.rawScore != null && sc?.fullScore) {
          rates.push(sc.rawScore / sc.fullScore * 100)
        }
      })
      return {
        subject: subject?.name ?? sub,
        平均得分率: rates.length ? Number((rates.reduce((a, b) => a + b, 0) / rates.length).toFixed(1)) : 0,
      }
    })
  }, [data, currentExamName])

  // 5. 进步榜：每个成员首场 vs 末场
  const progressData = useMemo(() => {
    if (!data) return []
    return data.members.map(m => {
      const sorted = [...m.exams].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
      const first = sorted[0]
      const last = sorted[sorted.length - 1]
      const diff = (last?.totalAssigned ?? 0) - (first?.totalAssigned ?? 0)
      return {
        name: m.studentNo,
        displayName: m.displayName || m.username,
        首场: first?.totalAssigned ?? 0,
        末场: last?.totalAssigned ?? 0,
        进步: diff,
      }
    }).sort((a, b) => b.进步 - a.进步)
  }, [data])

  // 所有科目列表
  const allSubjects = useMemo(() => {
    if (!data) return []
    const set = new Set<string>()
    data.members.forEach(m => m.exams.forEach(e => e.scores.forEach(s => set.add(s.subject))))
    return Array.from(set)
  }, [data])

  // 导出
  const openExport = (type: 'excel' | 'pdf') => {
    if (!effectiveGroupId) return
    if (type === 'pdf') {
      window.open(`/api/group-analysis/${effectiveGroupId}/export/pdf`, '_blank')
      toast.success('已打开 PDF 报告')
    } else {
      // Excel 直接下载
      const a = document.createElement('a')
      a.href = `/api/group-analysis/${effectiveGroupId}/export/excel`
      a.download = ''
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      toast.success('Excel 导出中...')
    }
  }
  const downloadDocx = async () => {
    if (!effectiveGroupId) return
    try {
      const res = await fetch(`/api/group-analysis/${effectiveGroupId}/export/docx`)
      if (!res.ok) throw new Error('导出失败')
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      const a = document.createElement('a')
      a.href = url
      const cd = res.headers.get('Content-Disposition') || ''
      const match = cd.match(/filename\*=UTF-8''([^;]+)/i) || cd.match(/filename="?([^";]+)"?/i)
      a.download = match ? decodeURIComponent(match[1]) : `group_analysis.docx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
      toast.success('Word 文档已导出')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  // 6. 学科薄弱点预警
  const weaknessData = useMemo(() => {
    if (!data) return []
    const ASSIGNED = new Set(['physics', 'chemistry', 'biology', 'history', 'geography', 'politics'])
    return allSubjects.map(sub => {
      const subject = SUBJECTS[sub as SubjectKey]
      const rates: number[] = []
      data.members.forEach(m => {
        // 取最近一次考试该科目的原始分得分率
        const exam = m.exams[m.exams.length - 1]
        const sc = exam?.scores.find(s => s.subject === sub)
        if (sc?.rawScore != null && sc?.fullScore) {
          rates.push(sc.rawScore / sc.fullScore * 100)
        }
      })
      const avgRate = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : 0
      const full = ASSIGNED.has(sub) ? 70 : 150
      const avgScore = Math.round(avgRate * full / 100)
      const status: 'critical' | 'weak' | 'normal' | 'good' =
        avgRate < 50 ? 'critical' : avgRate < 60 ? 'weak' : avgRate < 75 ? 'normal' : 'good'
      const statusText = { critical: '严重薄弱', weak: '薄弱', normal: '一般', good: '良好' }[status]
      const statusColor = { critical: '#dc2626', weak: '#ef4444', normal: '#f59e0b', good: '#10b981' }[status]
      const suggestion = avgRate < 50
        ? '需重点突破，建议组织专项练习'
        : avgRate < 60
        ? '需要加强，多练习基础题'
        : avgRate < 75
        ? '保持稳定，争取提升'
        : '保持优势'
      return {
        subject: subject?.name ?? sub,
        subjectKey: sub,
        color: subject?.color ?? '#888',
        avgRate: avgRate.toFixed(1),
        avgScore,
        full,
        status,
        statusText,
        statusColor,
        suggestion,
      }
    }).sort((a, b) => parseFloat(a.avgRate) - parseFloat(b.avgRate)) // 按得分率升序，最弱的在前
  }, [data, allSubjects])

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><BarChart3 className="h-6 w-6" /> 小组成绩分析</h2>
          <p className="text-sm text-muted-foreground">对比小组成员的成绩变化</p>
        </div>
        {effectiveGroupId && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="outline" size="sm">
                <Download className="h-4 w-4 mr-1" /> 导出报告
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
              <DropdownMenuItem onClick={() => openExport('excel')}>
                <FileSpreadsheet className="h-4 w-4 mr-2" /> Excel 格式
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => openExport('pdf')}>
                <FileText className="h-4 w-4 mr-2" /> PDF 格式（打印）
              </DropdownMenuItem>
              <DropdownMenuItem onClick={() => downloadDocx()}>
                <FileType2 className="h-4 w-4 mr-2" /> Word (.docx)
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-3">
            <div className="flex-1 space-y-1.5">
              <Label>选择小组</Label>
              <Select value={effectiveGroupId} onValueChange={setGroupId}>
                <SelectTrigger><SelectValue placeholder="选择小组" /></SelectTrigger>
                <SelectContent>
                  {groups.map(g => (
                    <SelectItem key={g.id} value={g.id}>{g.name}（{g.memberCount}人）</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            {examNames.length > 0 && (
              <div className="flex-1 space-y-1.5">
                <Label>选择考试</Label>
                <Select value={currentExamName} onValueChange={setSelectedExamName}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {examNames.map(n => <SelectItem key={n} value={n}>{n}</SelectItem>)}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {!effectiveGroupId ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">请选择一个小组查看分析</CardContent>
        </Card>
      ) : isLoading ? (
        <div className="text-center py-12 text-muted-foreground">加载中...</div>
      ) : !data || data.members.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12 text-muted-foreground">小组还没有成员</CardContent>
        </Card>
      ) : (
        <>
          {/* 1. 总分对比 */}
          <Card>
            <CardHeader>
              <CardTitle>{currentExamName} - 总分对比</CardTitle>
              <CardDescription>蓝色=原始分，青色=赋分（小三门按赋分，语数英按原始分）</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={totalBarData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} />
                    <YAxis stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6 }}
                      labelFormatter={(label, payload) => {
                        const item = payload?.[0]?.payload
                        return item ? `${item.displayName}（学号 ${label}）` : label
                      }}
                    />
                    <Legend />
                    <Bar dataKey="原始分" fill="#3b82f6" radius={[4, 4, 0, 0]} />
                    <Bar dataKey="赋分" fill="#06b6d4" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* 2. 均分趋势 */}
          <Card>
            <CardHeader>
              <CardTitle>小组均分趋势</CardTitle>
              <CardDescription>每场考试的小组平均分、最高分、最低分</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-72">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={trendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} />
                    <YAxis stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} />
                    <Tooltip contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6 }} />
                    <Legend />
                    <Line type="monotone" dataKey="平均分" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} connectNulls />
                    <Line type="monotone" dataKey="最高分" stroke="#10b981" strokeWidth={1.5} strokeDasharray="3 3" dot={{ r: 3 }} connectNulls />
                    <Line type="monotone" dataKey="最低分" stroke="#ef4444" strokeWidth={1.5} strokeDasharray="3 3" dot={{ r: 3 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>

          {/* 3. 单科对比 */}
          {allSubjects.length > 0 && (
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between">
                  <div>
                    <CardTitle>{currentExamName} - 单科对比</CardTitle>
                    <CardDescription>切换科目查看组内单科成绩对比</CardDescription>
                  </div>
                  <div className="w-32">
                    <Select value={selectedSubject} onValueChange={setSelectedSubject}>
                      <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
                      <SelectContent>
                        <SelectItem value="total">总分</SelectItem>
                        {allSubjects.map(s => (
                          <SelectItem key={s} value={s}>{SUBJECTS[s as SubjectKey]?.name ?? s}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>
                </div>
              </CardHeader>
              <CardContent>
                <div className="h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={subjectBarData}>
                      <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                      <XAxis dataKey="name" stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} />
                      <YAxis stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6 }}
                        labelFormatter={(label, payload) => {
                          const item = payload?.[0]?.payload
                          return item ? `${item.displayName}（学号 ${label}）` : label
                        }}
                      />
                      <Bar dataKey={Object.keys(subjectBarData[0] ?? {}).filter(k => k !== 'name' && k !== 'displayName')[0]} fill="#8b5cf6" radius={[4, 4, 0, 0]} />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 4. 学科雷达图 */}
          {radarData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>{currentExamName} - 学科均分雷达</CardTitle>
                <CardDescription>小组各科平均得分率</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-80">
                  <ResponsiveContainer width="100%" height="100%">
                    <RadarChart data={radarData}>
                      <PolarGrid stroke="var(--border)" />
                      <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--foreground)', fontSize: 12 }} />
                      <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} />
                      <Radar name="平均得分率%" dataKey="平均得分率" stroke="#3b82f6" fill="#3b82f6" fillOpacity={0.3} strokeWidth={2} />
                      <Tooltip
                        contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6 }}
                        formatter={(v: number) => [`${v}%`, '平均得分率']}
                      />
                    </RadarChart>
                  </ResponsiveContainer>
                </div>
              </CardContent>
            </Card>
          )}

          {/* 5. 进步榜 */}
          {progressData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>进步榜（首场 vs 末场）</CardTitle>
                <CardDescription>按进步分排序，绿色=进步，红色=退步</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {progressData.map((p, i) => (
                    <div key={p.name} className="flex items-center gap-3 p-2 rounded-md border border-border">
                      <span className="font-bold text-lg w-8 text-center" style={{
                        color: i === 0 ? '#f59e0b' : i === 1 ? '#9ca3af' : i === 2 ? '#cd7f32' : 'var(--muted-foreground)'
                      }}>
                        #{i + 1}
                      </span>
                      <div className="flex-1">
                        <div className="text-sm font-medium">{p.displayName}</div>
                        <div className="text-xs text-muted-foreground">学号 {p.name}</div>
                      </div>
                      <div className="text-right text-sm">
                        <div className="text-muted-foreground">{p.首场} → {p.末场}</div>
                        <div className={`font-bold ${p.进步 > 0 ? 'text-emerald-500' : p.进步 < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                          {p.进步 > 0 ? '+' : ''}{p.进步}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 6. 学科薄弱点预警 */}
          {weaknessData.length > 0 && (
            <Card>
              <CardHeader>
                <CardTitle>学科薄弱点预警</CardTitle>
                <CardDescription>按最近一次考试的小组平均得分率（原始分），从弱到强排序</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-2">
                  {weaknessData.map(w => (
                    <div key={w.subjectKey} className="flex items-center gap-3 p-3 rounded-md border border-border" style={{ borderLeft: `3px solid ${w.color}` }}>
                      <div className="w-16">
                        <div className="font-medium text-sm">{w.subject}</div>
                        <div className="text-[10px] text-muted-foreground">满分 {w.full}</div>
                      </div>
                      <div className="flex-1">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="text-sm font-semibold" style={{ color: w.statusColor }}>
                            {w.avgRate}%
                          </span>
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded font-medium text-white"
                            style={{ background: w.statusColor }}
                          >
                            {w.statusText}
                          </span>
                          <span className="text-xs text-muted-foreground">小组均分 {w.avgScore}</span>
                        </div>
                        <div className="w-full h-1.5 bg-muted rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full transition-all"
                            style={{ width: `${Math.min(100, parseFloat(w.avgRate))}%`, background: w.statusColor }}
                          />
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-1">{w.suggestion}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}

          {/* 7. 详细表格 */}
          <Card>
            <CardHeader>
              <CardTitle>成员明细</CardTitle>
              <CardDescription>所有成员的所有考试（按学号排序，括号内为原始分）</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left p-2">学号</th>
                      <th className="text-left p-2">姓名</th>
                      {examNames.map(n => (
                        <th key={n} className="text-right p-2">{n}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.members.map(m => (
                      <tr key={m.userId} className="border-b border-border">
                        <td className="p-2 font-mono">{m.studentNo}</td>
                        <td className="p-2">{m.displayName || m.username}</td>
                        {examNames.map(n => {
                          const exam = m.exams.find(e => e.name === n)
                          return (
                            <td key={n} className="text-right p-2">
                              {exam ? (
                                <span>
                                  <span className="font-semibold text-cyan-600 dark:text-cyan-400">赋{exam.totalAssigned}</span>
                                  {exam.totalRaw !== exam.totalAssigned && (
                                    <span className="text-muted-foreground text-[10px] ml-1">原{exam.totalRaw}</span>
                                  )}
                                </span>
                              ) : (
                                <span className="text-muted-foreground">—</span>
                              )}
                            </td>
                          )
                        })}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </>
      )}
    </div>
  )
}
