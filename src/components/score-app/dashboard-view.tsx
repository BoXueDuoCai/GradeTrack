'use client'

import { useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { BarChart3, TrendingUp, Users, Target, BookOpen, Award } from 'lucide-react'
import { useQuery } from '@tanstack/react-query'
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, Legend,
  ResponsiveContainer, PieChart, Pie, Cell, AreaChart, Area,
} from 'recharts'
import { fetchGroups } from './types'
import { SUBJECTS, SubjectKey } from '@/lib/constants'

const SUBJECT_ORDER: SubjectKey[] = ['chinese', 'math', 'english', 'physics', 'chemistry', 'biology', 'history', 'geography', 'politics']
const ASSIGNED = new Set(['physics', 'chemistry', 'biology', 'history', 'geography', 'politics'])

export function DashboardView() {
  const { data: groups = [] } = useQuery({ queryKey: ['groups'], queryFn: fetchGroups })

  // 拉取所有小组的数据
  const allGroupsData = useQuery({
    queryKey: ['dashboard-all-groups'],
    queryFn: async () => {
      const results = await Promise.all(groups.map(async g => {
        const res = await fetch(`/api/group-analysis/${g.id}`)
        const j = await res.json()
        if (!j.success) return null
        return j.data
      }))
      return results.filter(Boolean) as Array<{
        group: { id: string; name: string }
        members: Array<{
          studentNo: string
          displayName: string
          exams: Array<{
            name: string
            date: string
            totalRaw: number
            totalAssigned: number
            scores: Array<{ subject: string; rawScore: number | null; fullScore: number | null }>
          }>
        }>
      }>
    },
    enabled: groups.length > 0,
  })

  // 综合统计
  const stats = useMemo(() => {
    if (!allGroupsData.data) return null
    const allMembers: Array<{
      groupName: string
      studentNo: string
      displayName: string
      examCount: number
      avgAssigned: number
      lastAssigned: number
      firstAssigned: number
      progress: number
    }> = []
    const examTrendMap = new Map<string, { sum: number; count: number }>()
    const subjectRateMap = new Map<string, number[]>() // 各科目的得分率数组

    allGroupsData.data.forEach(groupData => {
      groupData.members.forEach(m => {
        const sorted = [...m.exams].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
        const validExams = sorted.filter(e => e.totalAssigned > 0)
        const avgAssigned = validExams.length
          ? validExams.reduce((s, e) => s + e.totalAssigned, 0) / validExams.length
          : 0
        const lastAssigned = validExams[validExams.length - 1]?.totalAssigned ?? 0
        const firstAssigned = validExams[0]?.totalAssigned ?? 0
        allMembers.push({
          groupName: groupData.group.name,
          studentNo: m.studentNo,
          displayName: m.displayName,
          examCount: m.exams.length,
          avgAssigned: Math.round(avgAssigned),
          lastAssigned,
          firstAssigned,
          progress: lastAssigned - firstAssigned,
        })

        // 按考试名称聚合
        m.exams.forEach(e => {
          if (e.totalAssigned > 0) {
            const cur = examTrendMap.get(e.name) ?? { sum: 0, count: 0 }
            cur.sum += e.totalAssigned
            cur.count++
            examTrendMap.set(e.name, cur)
          }
        })

        // 收集每个科目的得分率（用原始分）
        m.exams.forEach(e => {
          e.scores.forEach(s => {
            if (s.rawScore != null && s.fullScore) {
              const arr = subjectRateMap.get(s.subject) ?? []
              arr.push(s.rawScore / s.fullScore * 100)
              subjectRateMap.set(s.subject, arr)
            }
          })
        })
      })
    })

    const examTrend = Array.from(examTrendMap.entries()).map(([name, v]) => ({
      name,
      avg: v.count > 0 ? Math.round(v.sum / v.count) : 0,
    }))

    const subjectRates = SUBJECT_ORDER.filter(s => subjectRateMap.has(s)).map(s => {
      const rates = subjectRateMap.get(s)!
      const subject = SUBJECTS[s]
      return {
        subject: subject.name,
        rate: Number((rates.reduce((a, b) => a + b, 0) / rates.length).toFixed(1)),
        color: subject.color,
      }
    })

    // 小组分布
    const groupDistribution = allGroupsData.data.map(g => ({
      name: g.group.name,
      value: g.members.length,
    }))

    // Top 5 进步最大
    const topProgress = [...allMembers].sort((a, b) => b.progress - a.progress).slice(0, 5)
    // Top 5 均分最高
    const topAvg = [...allMembers].sort((a, b) => b.avgAssigned - a.avgAssigned).slice(0, 5)

    return {
      totalMembers: allMembers.length,
      totalGroups: allGroupsData.data.length,
      totalExams: examTrend.length,
      avgScore: allMembers.length ? Math.round(allMembers.reduce((s, m) => s + m.avgAssigned, 0) / allMembers.length) : 0,
      examTrend,
      subjectRates,
      groupDistribution,
      topProgress,
      topAvg,
    }
  }, [allGroupsData.data])

  if (allGroupsData.isLoading) {
    return <div className="p-6 text-center text-muted-foreground">加载大屏数据中...</div>
  }

  if (!stats || stats.totalMembers === 0) {
    return (
      <div className="max-w-6xl mx-auto p-4 md:p-6">
        <Card>
          <CardContent className="text-center py-12">
            <BarChart3 className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">还没有小组或成员数据，无法生成大屏</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
      <div>
        <h2 className="text-2xl font-bold flex items-center gap-2"><BarChart3 className="h-6 w-6" /> 数据可视化大屏</h2>
        <p className="text-sm text-muted-foreground">所有小组整体趋势概览</p>
      </div>

      {/* 顶部 KPI */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <KpiCard icon={Users} label="总人数" value={stats.totalMembers} color="#3b82f6" />
        <KpiCard icon={Target} label="小组数" value={stats.totalGroups} color="#10b981" />
        <KpiCard icon={BookOpen} label="考试场次" value={stats.totalExams} color="#f59e0b" />
        <KpiCard icon={TrendingUp} label="平均分" value={stats.avgScore} color="#06b6d4" />
        <KpiCard icon={Award} label="最高均分" value={stats.topAvg[0]?.avgAssigned ?? 0} color="#a855f7" />
      </div>

      {/* 考试均分趋势 */}
      <Card>
        <CardHeader>
          <CardTitle>考试均分趋势</CardTitle>
          <CardDescription>所有小组所有成员的均分变化</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="h-72">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={stats.examTrend}>
                <defs>
                  <linearGradient id="colorAvg" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                    <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="name" stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} />
                <YAxis stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} />
                <Tooltip contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6 }} />
                <Area type="monotone" dataKey="avg" name="均分" stroke="#3b82f6" fill="url(#colorAvg)" strokeWidth={2} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* 各科平均得分率 */}
        <Card>
          <CardHeader>
            <CardTitle>各科平均得分率</CardTitle>
            <CardDescription>按原始分计算</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={stats.subjectRates} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                  <XAxis type="number" domain={[0, 100]} stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} />
                  <YAxis type="category" dataKey="subject" stroke="var(--muted-foreground)" tick={{ fontSize: 11 }} width={40} />
                  <Tooltip contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6 }} formatter={(v: number) => [`${v}%`, '得分率']} />
                  <Bar dataKey="rate" name="得分率" radius={[0, 4, 4, 0]}>
                    {stats.subjectRates.map((entry, i) => (
                      <Cell key={i} fill={entry.color} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>

        {/* 小组人数分布 */}
        <Card>
          <CardHeader>
            <CardTitle>小组人数分布</CardTitle>
            <CardDescription>各小组的成员数量</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="h-72">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={stats.groupDistribution}
                    dataKey="value"
                    nameKey="name"
                    cx="50%"
                    cy="50%"
                    outerRadius={80}
                    label={(entry) => `${entry.name}: ${entry.value}`}
                  >
                    {stats.groupDistribution.map((_, i) => (
                      <Cell key={i} fill={['#3b82f6', '#10b981', '#f59e0b', '#a855f7', '#06b6d4', '#ef4444'][i % 6]} />
                    ))}
                  </Pie>
                  <Tooltip contentStyle={{ backgroundColor: 'var(--card)', border: '1px solid var(--border)', borderRadius: 6 }} />
                </PieChart>
              </ResponsiveContainer>
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Top 5 均分 */}
        <Card>
          <CardHeader>
            <CardTitle>均分 Top 5</CardTitle>
            <CardDescription>所有成员的平均分排名</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.topAvg.map((m, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/30">
                  <span className="font-bold w-8 text-center" style={{
                    color: i === 0 ? '#f59e0b' : i === 1 ? '#9ca3af' : i === 2 ? '#cd7f32' : 'var(--muted-foreground)'
                  }}>#{i + 1}</span>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{m.displayName}</div>
                    <div className="text-xs text-muted-foreground">{m.groupName} · 学号 {m.studentNo}</div>
                  </div>
                  <div className="text-lg font-bold text-cyan-500">{m.avgAssigned}</div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>

        {/* Top 5 进步 */}
        <Card>
          <CardHeader>
            <CardTitle>进步榜 Top 5</CardTitle>
            <CardDescription>首场 vs 末场，按进步分排序</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {stats.topProgress.map((m, i) => (
                <div key={i} className="flex items-center gap-3 p-2 rounded-md hover:bg-accent/30">
                  <span className="font-bold w-8 text-center" style={{
                    color: i === 0 ? '#f59e0b' : i === 1 ? '#9ca3af' : i === 2 ? '#cd7f32' : 'var(--muted-foreground)'
                  }}>#{i + 1}</span>
                  <div className="flex-1">
                    <div className="text-sm font-medium">{m.displayName}</div>
                    <div className="text-xs text-muted-foreground">{m.groupName} · {m.firstAssigned} → {m.lastAssigned}</div>
                  </div>
                  <div className={`text-lg font-bold ${m.progress > 0 ? 'text-emerald-500' : m.progress < 0 ? 'text-red-500' : 'text-muted-foreground'}`}>
                    {m.progress > 0 ? '+' : ''}{m.progress}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}

function KpiCard({ icon: Icon, label, value, color }: { icon: React.ElementType; label: string; value: number; color: string }) {
  return (
    <Card>
      <CardContent className="p-4">
        <div className="flex items-center justify-between">
          <div>
            <div className="text-xs text-muted-foreground">{label}</div>
            <div className="text-2xl font-bold" style={{ color }}>{value}</div>
          </div>
          <div className="p-2 rounded-md" style={{ background: `${color}20`, color }}>
            <Icon className="h-5 w-5" />
          </div>
        </div>
      </CardContent>
    </Card>
  )
}
