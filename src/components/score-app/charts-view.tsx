'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Label } from '@/components/ui/label'
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
  RadarChart, PolarGrid, PolarAngleAxis, PolarRadiusAxis, Radar,
  BarChart, Bar, Cell, ReferenceLine,
} from 'recharts'
import {
  Exam, calcTotalRawScore, calcTotalAssignedScore, formatDateCN, getEffectiveScore,
} from './types'
import { SUBJECTS, EXAM_TYPES, SubjectKey } from '@/lib/constants'

interface ChartsViewProps {
  exams: Exam[]
}

export function ChartsView({ exams }: ChartsViewProps) {
  const sorted = useMemo(() => [...exams].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()), [exams])

  const allSubjects = useMemo(() => {
    const set = new Set<SubjectKey>()
    sorted.forEach(e => e.scores.forEach(s => set.add(s.subject as SubjectKey)))
    return Array.from(set)
  }, [sorted])

  const [selectedSubject, setSelectedSubject] = useState<SubjectKey>('math')
  const [selectedExamIdx, setSelectedExamIdx] = useState<number>(Math.max(0, sorted.length - 1))
  const [showAssigned, setShowAssigned] = useState(false)

  const heatmapData = useMemo(() => {
    const rows: Array<{ exam: string; data: Record<string, number | null> }> = []
    for (let i = 1; i < sorted.length; i++) {
      const prev = sorted[i - 1]
      const curr = sorted[i]
      const row: Record<string, number | null> = {}
      allSubjects.forEach(sub => {
        const p = prev.scores.find(s => s.subject === sub)
        const c = curr.scores.find(s => s.subject === sub)
        const pScore = p ? getEffectiveScore(p) : null
        const cScore = c ? getEffectiveScore(c) : null
        if (pScore != null && cScore != null) {
          row[sub] = cScore - pScore
        } else {
          row[sub] = null
        }
      })
      rows.push({ exam: `${prev.name} → ${curr.name}`, data: row })
    }
    return rows
  }, [sorted, allSubjects])

  if (sorted.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="text-center py-20">
          <div className="text-6xl mb-4">📊</div>
          <h2 className="text-xl font-bold mb-2">还没有数据可分析</h2>
          <p className="text-muted-foreground">录入至少一场考试后再来看图表</p>
        </div>
      </div>
    )
  }

  // 1. 单科趋势
  const subjectTrendData = sorted.map(exam => {
    const s = exam.scores.find(sc => sc.subject === selectedSubject)
    return {
      name: exam.name,
      date: formatDateCN(exam.date),
      rawScore: s?.rawScore ?? null,
      assignedScore: s?.assignedScore ?? null,
      effective: s ? getEffectiveScore(s) : null,
      classRank: s?.classRank ?? null,
      gradeRank: s?.gradeRank ?? null,
    }
  })

  // 2. 总分趋势
  const totalTrendData = sorted.map(exam => ({
    name: exam.name,
    date: formatDateCN(exam.date),
    raw: calcTotalRawScore(exam.scores),
    assigned: calcTotalAssignedScore(exam.scores),
  }))

  // 3. 雷达图 - 小三门按原始分算得分率（按用户要求）
  const radarExam = sorted[selectedExamIdx] || sorted[sorted.length - 1]
  const radarData = radarExam.scores.map(s => {
    const subject = SUBJECTS[s.subject as SubjectKey]
    // 始终用原始分算得分率
    const rate = s.rawScore != null && s.fullScore ? (s.rawScore / s.fullScore * 100) : 0
    return { subject: subject.name, value: rate, color: subject.color }
  })

  // 4. 柱状图 - 同样按原始分
  const barData = radarExam.scores.map(s => {
    const subject = SUBJECTS[s.subject as SubjectKey]
    return {
      name: subject.name,
      score: s.rawScore ?? 0,
      full: s.fullScore ?? subject.defaultFullScore,
      color: subject.color,
      rate: s.rawScore != null && s.fullScore ? (s.rawScore / s.fullScore * 100) : 0,
    }
  })

  // 5. 分科前后对比
  const last10Exam = [...sorted].reverse().find(e => e.examType === 'midterm10' || e.examType === 'final10')
  const first6Exam = sorted.find(e => e.examType === 'monthly6' || e.examType === 'midterm6' || e.examType === 'final6')
  const compareBeforeAfter = last10Exam && first6Exam ? {
    before: last10Exam,
    after: first6Exam,
    commonSubjects: ['chinese', 'math', 'english', 'physics', 'chemistry'] as SubjectKey[],
  } : null

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">图表分析</h2>
          <p className="text-sm text-muted-foreground">共 {sorted.length} 场考试</p>
        </div>
        <Select value={showAssigned ? 'assigned' : 'raw'} onValueChange={(v) => setShowAssigned(v === 'assigned')}>
          <SelectTrigger className="w-32"><SelectValue /></SelectTrigger>
          <SelectContent>
            <SelectItem value="raw">显示原始分</SelectItem>
            <SelectItem value="assigned">显示赋分</SelectItem>
          </SelectContent>
        </Select>
      </div>

      <Tabs defaultValue="subject" className="space-y-4">
        <TabsList className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-9 gap-1 h-auto">
          <TabsTrigger value="subject">单科趋势</TabsTrigger>
          <TabsTrigger value="total">总分趋势</TabsTrigger>
          <TabsTrigger value="rank">排名变化</TabsTrigger>
          <TabsTrigger value="radar">学科雷达</TabsTrigger>
          <TabsTrigger value="compare">学科对比</TabsTrigger>
          <TabsTrigger value="heatmap">进退步</TabsTrigger>
          <TabsTrigger value="transition">分科前后</TabsTrigger>
          <TabsTrigger value="period">时间段对比</TabsTrigger>
          <TabsTrigger value="subjectProgress">科目进步榜</TabsTrigger>
        </TabsList>

        {/* 1. 单科趋势 */}
        <TabsContent value="subject">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>单科分数趋势</CardTitle>
                  <CardDescription>
                    {showAssigned && SUBJECTS[selectedSubject].assigned
                      ? '显示赋分（小三门）；切换上方选项看原始分'
                      : '显示原始分'}
                  </CardDescription>
                </div>
                <div className="w-32">
                  <Select value={selectedSubject} onValueChange={(v) => setSelectedSubject(v as SubjectKey)}>
                    <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {allSubjects.map(s => (
                        <SelectItem key={s} value={s}>{SUBJECTS[s].name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={subjectTrendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} />
                    <YAxis stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6 }}
                      labelStyle={{ color: 'var(--foreground)' }}
                    />
                    {showAssigned && SUBJECTS[selectedSubject].assigned ? (
                      <Line
                        type="monotone"
                        dataKey="assignedScore"
                        name="赋分"
                        stroke={SUBJECTS[selectedSubject].color}
                        strokeWidth={2}
                        dot={{ r: 4, fill: SUBJECTS[selectedSubject].color }}
                        connectNulls
                      />
                    ) : (
                      <Line
                        type="monotone"
                        dataKey="rawScore"
                        name="原始分"
                        stroke={SUBJECTS[selectedSubject].color}
                        strokeWidth={2}
                        dot={{ r: 4, fill: SUBJECTS[selectedSubject].color }}
                        connectNulls
                      />
                    )}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 2. 总分趋势（双线） */}
        <TabsContent value="total">
          <Card>
            <CardHeader>
              <CardTitle>总分趋势</CardTitle>
              <CardDescription>蓝线=原始分总分，青线=赋分后总分（小三门按赋分计）</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={totalTrendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} />
                    <YAxis stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6 }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="raw" name="原始分总分" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} connectNulls />
                    <Line type="monotone" dataKey="assigned" name="赋分总分" stroke="#06b6d4" strokeWidth={2} dot={{ r: 4 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 3. 排名变化 */}
        <TabsContent value="rank">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>排名变化</CardTitle>
                  <CardDescription>Y 轴反向（越上越好）</CardDescription>
                </div>
                <div className="w-32">
                  <Select value={selectedSubject} onValueChange={(v) => setSelectedSubject(v as SubjectKey)}>
                    <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {allSubjects.map(s => (
                        <SelectItem key={s} value={s}>{SUBJECTS[s].name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={subjectTrendData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} />
                    <YAxis reversed stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6 }}
                    />
                    <Legend />
                    <Line type="monotone" dataKey="classRank" name="班级排名" stroke="#3b82f6" strokeWidth={2} dot={{ r: 4 }} connectNulls />
                    <Line type="monotone" dataKey="gradeRank" name="年级排名" stroke="#ef4444" strokeWidth={2} dot={{ r: 4 }} connectNulls />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 4. 学科雷达 */}
        <TabsContent value="radar">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>学科雷达图</CardTitle>
                  <CardDescription>各科得分率对比（按原始分计算）</CardDescription>
                </div>
                <div className="w-48">
                  <Select value={String(selectedExamIdx)} onValueChange={(v) => setSelectedExamIdx(Number(v))}>
                    <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {sorted.map((e, i) => (
                        <SelectItem key={e.id} value={String(i)}>{e.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-96">
                <ResponsiveContainer width="100%" height="100%">
                  <RadarChart data={radarData}>
                    <PolarGrid stroke="var(--border)" />
                    <PolarAngleAxis dataKey="subject" tick={{ fill: 'var(--foreground)', fontSize: 12 }} />
                    <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fill: 'var(--muted-foreground)', fontSize: 10 }} />
                    <Radar name="得分率%" dataKey="value" stroke="var(--primary)" fill="var(--primary)" fillOpacity={0.3} strokeWidth={2} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6 }}
                      formatter={(v: number) => [`${v.toFixed(1)}%`, '得分率']}
                    />
                  </RadarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 5. 学科对比 */}
        <TabsContent value="compare">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle>学科得分率对比</CardTitle>
                  <CardDescription>按原始分计算得分率</CardDescription>
                </div>
                <div className="w-48">
                  <Select value={String(selectedExamIdx)} onValueChange={(v) => setSelectedExamIdx(Number(v))}>
                    <SelectTrigger size="sm"><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {sorted.map((e, i) => (
                        <SelectItem key={e.id} value={String(i)}>{e.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <div className="h-80">
                <ResponsiveContainer width="100%" height="100%">
                  <BarChart data={barData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                    <XAxis dataKey="name" stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} />
                    <YAxis domain={[0, 100]} stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} />
                    <Tooltip
                      contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6 }}
                      formatter={(v: number) => [`${v.toFixed(1)}%`, '得分率']}
                    />
                    <Bar dataKey="rate" name="得分率" radius={[4, 4, 0, 0]}>
                      {barData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Bar>
                    <ReferenceLine y={60} stroke="#10b981" strokeDasharray="3 3" label={{ value: '及格 60%', fontSize: 10, fill: '#10b981' }} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 6. 进退步热力图 */}
        <TabsContent value="heatmap">
          <Card>
            <CardHeader>
              <CardTitle>进退步热力图</CardTitle>
              <CardDescription>相邻两次考试各科分数变化（{showAssigned ? '赋分' : '原始分'}对比；绿=进步，红=退步）</CardDescription>
            </CardHeader>
            <CardContent>
              {heatmapData.length === 0 ? (
                <div className="text-center py-12 text-muted-foreground text-sm">至少需要 2 场考试才能看进退步</div>
              ) : (
                <div className="space-y-2 overflow-x-auto">
                  {heatmapData.map((row, i) => (
                    <div key={i} className="space-y-1">
                      <div className="text-xs text-muted-foreground font-medium">{row.exam}</div>
                      <div className="flex gap-1 flex-wrap">
                        {allSubjects.map(sub => {
                          const val = row.data[sub]
                          const subject = SUBJECTS[sub]
                          let bg = 'var(--muted)'
                          let text = 'var(--muted-foreground)'
                          if (val != null) {
                            if (val > 0) {
                              const intensity = Math.min(0.8, Math.abs(val) / 20)
                              bg = `rgba(16, 185, 129, ${0.15 + intensity})`
                              text = '#10b981'
                            } else if (val < 0) {
                              const intensity = Math.min(0.8, Math.abs(val) / 20)
                              bg = `rgba(239, 68, 68, ${0.15 + intensity})`
                              text = '#ef4444'
                            } else {
                              bg = 'var(--muted)'
                              text = 'var(--muted-foreground)'
                            }
                          }
                          return (
                            <div
                              key={sub}
                              className="rounded-md px-2 py-1 text-xs min-w-[80px] text-center"
                              style={{ background: bg, color: text, border: `1px solid ${subject.color}40` }}
                              title={`${subject.name}：${val != null ? (val > 0 ? '+' : '') + val : '无数据'}`}
                            >
                              <div className="text-[10px] opacity-70">{subject.shortName}</div>
                              <div className="font-bold">
                                {val != null ? (val > 0 ? '+' : '') + val : '—'}
                              </div>
                            </div>
                          )
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 7. 分科前后对比 */}
        <TabsContent value="transition">
          <Card>
            <CardHeader>
              <CardTitle>分科前后对比</CardTitle>
              <CardDescription>对比最后一次 10 门考试和第一次分科后 6 门考试（共用 5 门：语数英物化）</CardDescription>
            </CardHeader>
            <CardContent>
              {!compareBeforeAfter ? (
                <div className="text-center py-12 text-muted-foreground text-sm">
                  需要至少 1 场 10 门考试 + 1 场 6 门考试才能对比
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="font-medium text-muted-foreground">科目</div>
                    <div className="font-medium text-muted-foreground">分科前<br/><span className="text-xs">{compareBeforeAfter.before.name}</span></div>
                    <div className="font-medium text-muted-foreground">分科后<br/><span className="text-xs">{compareBeforeAfter.after.name}</span></div>
                  </div>
                  {compareBeforeAfter.commonSubjects.map(sub => {
                    const before = compareBeforeAfter.before.scores.find(s => s.subject === sub)
                    const after = compareBeforeAfter.after.scores.find(s => s.subject === sub)
                    const subject = SUBJECTS[sub]
                    const bScore = before ? getEffectiveScore(before) : null
                    const aScore = after ? getEffectiveScore(after) : null
                    const bRate = bScore != null && before?.fullScore ? (bScore / before.fullScore * 100) : null
                    const aRate = aScore != null && after?.fullScore ? (aScore / after.fullScore * 100) : null
                    const diff = bRate != null && aRate != null ? aRate - bRate : null
                    return (
                      <div key={sub} className="grid grid-cols-3 gap-3 items-center py-2 border-b border-border last:border-0">
                        <div className="flex items-center gap-2">
                          <span className="w-2 h-2 rounded-full" style={{ background: subject.color }} />
                          <span className="font-medium">{subject.name}</span>
                        </div>
                        <div className="text-sm">
                          {bScore != null ? `${bScore} / ${before?.fullScore ?? '-'}` : '—'}
                          {bRate != null && <span className="text-xs text-muted-foreground ml-1">({bRate.toFixed(1)}%)</span>}
                        </div>
                        <div className="text-sm">
                          {aScore != null ? `${aScore} / ${after?.fullScore ?? '-'}` : '—'}
                          {aRate != null && <span className="text-xs text-muted-foreground ml-1">({aRate.toFixed(1)}%)</span>}
                          {diff != null && (
                            <span className={`ml-2 text-xs font-medium ${diff > 0 ? 'text-emerald-500' : diff < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                              {diff > 0 ? '↑' : diff < 0 ? '↓' : '—'} {Math.abs(diff).toFixed(1)}%
                            </span>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 8. 时间段对比（两个考试对比） */}
        <TabsContent value="period">
          <Card>
            <CardHeader>
              <CardTitle>时间段对比</CardTitle>
              <CardDescription>选择两个考试，对比每科得分率变化</CardDescription>
            </CardHeader>
            <CardContent>
              {sorted.length < 2 ? (
                <div className="text-center py-8 text-sm text-muted-foreground">至少需要 2 场考试</div>
              ) : (
                <PeriodCompare exams={sorted} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 9. 科目进步榜 */}
        <TabsContent value="subjectProgress">
          <Card>
            <CardHeader>
              <CardTitle>科目进步榜</CardTitle>
              <CardDescription>各科目在所有考试中的进步分（首场→末场）</CardDescription>
            </CardHeader>
            <CardContent>
              <SubjectProgressBoard exams={sorted} allSubjects={allSubjects} />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  )
}

// 时间段对比子组件
function PeriodCompare({ exams }: { exams: Exam[] }) {
  const [fromIdx, setFromIdx] = useState(0)
  const [toIdx, setToIdx] = useState(Math.max(1, exams.length - 1))

  const fromExam = exams[fromIdx]
  const toExam = exams[toIdx]

  const allSubjects = Array.from(new Set([
    ...fromExam.scores.map(s => s.subject as SubjectKey),
    ...toExam.scores.map(s => s.subject as SubjectKey),
  ]))

  const chartData = allSubjects.map(sub => {
    const subject = SUBJECTS[sub]
    const from = fromExam.scores.find(s => s.subject === sub)
    const to = toExam.scores.find(s => s.subject === sub)
    const fromRate = from?.rawScore != null && from?.fullScore ? Number((from.rawScore / from.fullScore * 100).toFixed(1)) : 0
    const toRate = to?.rawScore != null && to?.fullScore ? Number((to.rawScore / to.fullScore * 100).toFixed(1)) : 0
    return {
      subject: subject?.name ?? sub,
      [fromExam.name]: fromRate,
      [toExam.name]: toRate,
      diff: Number((toRate - fromRate).toFixed(1)),
    }
  })

  return (
    <div className="space-y-4">
      <div className="flex gap-3 flex-wrap">
        <div className="space-y-1">
          <Label className="text-xs">从考试</Label>
          <Select value={String(fromIdx)} onValueChange={(v) => setFromIdx(Number(v))}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {exams.map((e, i) => <SelectItem key={e.id} value={String(i)}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1">
          <Label className="text-xs">到考试</Label>
          <Select value={String(toIdx)} onValueChange={(v) => setToIdx(Number(v))}>
            <SelectTrigger className="w-48"><SelectValue /></SelectTrigger>
            <SelectContent>
              {exams.map((e, i) => <SelectItem key={e.id} value={String(i)}>{e.name}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData}>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="subject" stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} />
            <YAxis domain={[0, 100]} stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} />
            <Tooltip contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6 }} formatter={(v: number) => [`${v}%`, '']} />
            <Legend />
            <Bar dataKey={fromExam.name} fill="#94a3b8" radius={[4, 4, 0, 0]} />
            <Bar dataKey={toExam.name} fill="#3b82f6" radius={[4, 4, 0, 0]} />
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-5 gap-2">
        {chartData.map(d => (
          <div key={d.subject} className="rounded-md border border-border p-2 text-center">
            <div className="text-xs text-muted-foreground">{d.subject}</div>
            <div className={`text-sm font-bold ${d.diff > 0 ? 'text-emerald-500' : d.diff < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
              {d.diff > 0 ? '↑ +' : d.diff < 0 ? '↓ ' : '— '}{Math.abs(d.diff)}%
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

// 科目进步榜子组件
function SubjectProgressBoard({ exams, allSubjects }: { exams: Exam[]; allSubjects: SubjectKey[] }) {
  if (exams.length < 2) {
    return <div className="text-center py-8 text-sm text-muted-foreground">至少需要 2 场考试</div>
  }
  const sorted = [...exams].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const first = sorted[0]
  const last = sorted[sorted.length - 1]

  const board = allSubjects.map(sub => {
    const subject = SUBJECTS[sub]
    const firstScore = first.scores.find(s => s.subject === sub)
    const lastScore = last.scores.find(s => s.subject === sub)
    const firstRate = firstScore?.rawScore != null && firstScore?.fullScore ? firstScore.rawScore / firstScore.fullScore * 100 : null
    const lastRate = lastScore?.rawScore != null && lastScore?.fullScore ? lastScore.rawScore / lastScore.fullScore * 100 : null
    const diff = firstRate != null && lastRate != null ? Number((lastRate - firstRate).toFixed(1)) : null
    return {
      subject: subject?.name ?? sub,
      color: subject?.color ?? '#888',
      firstRate: firstRate != null ? Number(firstRate.toFixed(1)) : null,
      lastRate: lastRate != null ? Number(lastRate.toFixed(1)) : null,
      diff,
    }
  }).filter(b => b.diff != null).sort((a, b) => (b.diff ?? 0) - (a.diff ?? 0))

  if (board.length === 0) {
    return <div className="text-center py-8 text-sm text-muted-foreground">无足够数据</div>
  }

  const chartData = board.map(b => ({
    subject: b.subject,
    color: b.color,
    [first.name]: b.firstRate,
    [last.name]: b.lastRate,
    进步: b.diff,
  }))

  return (
    <div className="space-y-4">
      <div className="h-80">
        <ResponsiveContainer width="100%" height="100%">
          <BarChart data={chartData} layout="vertical">
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis type="number" stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} />
            <YAxis type="category" dataKey="subject" stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} width={40} />
            <Tooltip contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6 }} formatter={(v: number) => [`${v}%`, '']} />
            <Bar dataKey="进步" name="进步分(%)" radius={[0, 4, 4, 0]}>
              {chartData.map((entry, i) => (
                <Cell key={i} fill={Number(entry.进步) > 0 ? '#10b981' : Number(entry.进步) < 0 ? '#ef4444' : '#94a3b8'} />
              ))}
            </Bar>
          </BarChart>
        </ResponsiveContainer>
      </div>
      <div className="space-y-2">
        {board.map((b, i) => (
          <div key={b.subject} className="flex items-center gap-3 p-2 rounded-md border border-border" style={{ borderLeft: `3px solid ${b.color}` }}>
            <span className="font-bold w-8 text-center" style={{
              color: i === 0 ? '#f59e0b' : i === 1 ? '#9ca3af' : i === 2 ? '#cd7f32' : 'var(--muted-foreground)'
            }}>#{i + 1}</span>
            <div className="flex-1">
              <div className="text-sm font-medium">{b.subject}</div>
              <div className="text-xs text-muted-foreground">
                {b.firstRate != null ? `${b.firstRate}%` : '—'} → {b.lastRate != null ? `${b.lastRate}%` : '—'}
              </div>
            </div>
            <div className={`text-lg font-bold ${(b.diff ?? 0) > 0 ? 'text-emerald-500' : (b.diff ?? 0) < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
              {(b.diff ?? 0) > 0 ? '+' : ''}{b.diff}%
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
