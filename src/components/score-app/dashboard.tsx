'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { TrendingUp, TrendingDown, Minus, Target, Plus, Calendar, CheckCircle2, Circle, XCircle, Clock, Settings2 } from 'lucide-react'
import {
  Exam, AuthUser, calcTotalRawScore, calcTotalAssignedScore, calcTotalFullScore, calcTotalRawFullScore,
  formatDateCN, calcRate, getEffectiveScore, fetchGoals, Goal,
} from './types'
import { SUBJECTS, EXAM_TYPES, SubjectKey } from '@/lib/constants'
import { GOAL_STATUS_CONFIG, GoalStatus } from '@/lib/grade-system'
import type { View } from './score-app'
import { cn } from '@/lib/utils'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useConfirm } from './confirm-dialog'
import { toast } from 'sonner'

interface DashboardProps {
  exams: Exam[]
  user: AuthUser
  onNavigate: (v: View) => void
}

export function Dashboard({ exams, user, onNavigate }: DashboardProps) {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const sortedExams = [...exams].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  const latestExam = sortedExams[sortedExams.length - 1]
  const prevExam = sortedExams[sortedExams.length - 2]

  const { data: goals = [] } = useQuery({ queryKey: ['goals'], queryFn: fetchGoals })
  const activeGoals = goals.filter(g => g.status === 'active' || g.status === 'pending')

  // #4: 距下次考试可设置（hooks 必须在 early return 之前）
  const { data: nextExamData } = useQuery({
    queryKey: ['next-exam'],
    queryFn: async () => {
      const res = await fetch('/api/next-exam')
      const j = await res.json()
      if (!j.success) return null
      return j.data as { scope: string; examDate: string; examName: string | null; source: string } | null
    },
  })
  const [showNextExamSet, setShowNextExamSet] = useState(false)
  const [nextExamDate, setNextExamDate] = useState('')
  const [nextExamName, setNextExamName] = useState('')
  const [savingNextExam, setSavingNextExam] = useState(false)

  const handleSaveNextExam = async () => {
    if (!nextExamDate) { toast.error('请选择日期'); return }
    setSavingNextExam(true)
    try {
      const res = await fetch('/api/next-exam', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ scope: 'user', examDate: nextExamDate, examName: nextExamName || undefined }) })
      const j = await res.json()
      if (!j.success) throw new Error(j.error)
      toast.success('已设置'); setShowNextExamSet(false); queryClient.invalidateQueries({ queryKey: ['next-exam'] })
    } catch (e) { toast.error((e as Error).message) } finally { setSavingNextExam(false) }
  }
  const handleClearNextExam = async () => {
    const ok = await confirm({ title: '清除下次考试日期？', description: '清除后将不再显示倒计时', variant: 'destructive', confirmText: '清除' })
    if (!ok) return
    try { await fetch(`/api/next-exam?scope=user&targetId=${user.id}`, { method: 'DELETE' }); toast.success('已清除'); queryClient.invalidateQueries({ queryKey: ['next-exam'] }) } catch (e) { toast.error((e as Error).message) }
  }

  if (!latestExam) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="text-center py-16">
          <div className="text-6xl mb-4">📚</div>
          <h2 className="text-2xl font-bold mb-2">欢迎，{user.displayName || user.username}！</h2>
          <p className="text-muted-foreground mb-6">还没有任何成绩，点击下方按钮录入第一场考试</p>
          <Button onClick={() => onNavigate('entry')}>
            <Plus className="h-4 w-4 mr-1" /> 录入成绩
          </Button>
        </div>
      </div>
    )
  }

  const totalRaw = calcTotalRawScore(latestExam.scores)
  const totalAssigned = calcTotalAssignedScore(latestExam.scores)
  const totalFull = calcTotalFullScore(latestExam.scores)
  const totalRawFull = calcTotalRawFullScore(latestExam.scores)
  const prevTotalRaw = prevExam ? calcTotalRawScore(prevExam.scores) : null
  const diff = totalRaw != null && prevTotalRaw != null ? totalRaw - prevTotalRaw : null

  const now = new Date()

  let daysToNext: number | null = null
  let nextExamSource = ''
  if (nextExamData?.examDate) {
    const target = new Date(nextExamData.examDate)
    daysToNext = Math.max(0, Math.ceil((target.getTime() - now.getTime()) / (1000 * 60 * 60 * 24)))
    nextExamSource = nextExamData.source === 'group' ? '（小组设置）' : '（自己设置）'
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-6">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center md:justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold">看板首页</h2>
          <p className="text-sm text-muted-foreground">
            {user.displayName || user.username} · 最近一次：{latestExam.name} · {formatDateCN(latestExam.date)}
          </p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onNavigate('entry')}>
            <Plus className="h-4 w-4 mr-1" /> 录入
          </Button>
          <Button variant="outline" size="sm" onClick={() => onNavigate('charts')}>图表</Button>
          <Button variant="outline" size="sm" onClick={() => onNavigate('goals')}>目标</Button>
        </div>
      </div>

      {/* 大数字卡片 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3 md:gap-4">
        <BigStat
          label="本次总分（原始）"
          value={totalRaw != null ? String(totalRaw) : '-'}
          sub={totalRawFull != null ? `/ ${totalRawFull}` : ''}
          color="primary"
        />
        <BigStat
          label="本次总分（赋分）"
          value={totalAssigned != null ? String(totalAssigned) : '-'}
          sub={totalFull != null ? `/ ${totalFull}` : ''}
          color="info"
        />
        <BigStat
          label="vs 上次"
          value={diff != null ? (diff >= 0 ? `+${diff}` : `${diff}`) : '-'}
          sub={diff != null ? (diff > 0 ? '进步' : diff < 0 ? '退步' : '持平') : '无上次数据'}
          color={diff == null ? 'muted' : diff > 0 ? 'success' : diff < 0 ? 'destructive' : 'muted'}
          icon={diff == null ? Minus : diff > 0 ? TrendingUp : diff < 0 ? TrendingDown : Minus}
        />
        <Card>
          <CardContent className="p-4 md:p-5">
            <div className="flex items-center justify-between">
              <div className="text-xs text-muted-foreground mb-1">距下次考试</div>
              <Button variant="ghost" size="icon" className="h-6 w-6" title="设置考试日期" onClick={() => { setNextExamDate(nextExamData?.examDate ? nextExamData.examDate.slice(0, 10) : ''); setNextExamName(nextExamData?.examName || ''); setShowNextExamSet(true) }}>
                <Settings2 className="h-3.5 w-3.5" />
              </Button>
            </div>
            <div className="flex items-end gap-1">
              <span className={cn('text-2xl md:text-3xl font-bold text-amber-500')}>{daysToNext != null ? daysToNext : '-'}</span>
              <span className="text-xs text-muted-foreground mb-1">天{nextExamSource ? ` ${nextExamSource}` : '（未设置）'}</span>
              <Calendar className="h-4 w-4 ml-auto mb-1 text-amber-500" />
            </div>
            {nextExamData?.examName && <div className="text-xs text-muted-foreground mt-1">{nextExamData.examName}</div>}
          </CardContent>
        </Card>
      </div>

      {/* 设置下次考试对话框 */}
      <Dialog open={showNextExamSet} onOpenChange={setShowNextExamSet}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>设置下次考试日期</DialogTitle>
            <DialogDescription>优先使用你的个人设置；如未设置则使用所在小组的管理员设置</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>考试日期 *</Label><Input type="date" value={nextExamDate} onChange={e => setNextExamDate(e.target.value)} /></div>
            <div className="space-y-1.5"><Label>考试名称（可选）</Label><Input value={nextExamName} onChange={e => setNextExamName(e.target.value)} placeholder="如：高一下3月月考" /></div>
          </div>
          <DialogFooter className="flex justify-between sm:justify-between">
            <Button variant="outline" onClick={handleClearNextExam}>清除</Button>
            <div className="flex gap-2">
              <Button variant="outline" onClick={() => setShowNextExamSet(false)}>取消</Button>
              <Button onClick={handleSaveNextExam} disabled={savingNextExam}>{savingNextExam ? '保存中...' : '保存'}</Button>
            </div>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 最近一次考试详情 */}
      <Card>
        <CardHeader>
          <CardTitle>最近一次考试详情</CardTitle>
          <CardDescription>
            {latestExam.name} · {EXAM_TYPES[latestExam.examType]?.name ?? latestExam.examType} · {latestExam.grade}
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {latestExam.scores.map(s => {
              const subject = SUBJECTS[s.subject as SubjectKey]
              const effScore = getEffectiveScore(s)
              const rate = calcRate(s.rawScore, s.fullScore)
              return (
                <div
                  key={s.subject}
                  className="rounded-lg border border-border p-3 space-y-1.5"
                  style={{ borderLeft: `3px solid ${subject.color}` }}
                >
                  <div className="flex items-center justify-between">
                    <span className="text-sm font-medium" style={{ color: subject.color }}>{subject.name}</span>
                    {s.grade && <span className="text-xs px-1.5 py-0.5 rounded bg-muted">{s.grade}</span>}
                  </div>
                  <div className="text-xl font-bold">
                    {effScore != null ? effScore : '-'}
                    {(() => {
                      // 赋分科目用 70 作为满分，否则用 fullScore
                      const ASSIGNED = ['physics', 'chemistry', 'biology', 'history', 'geography', 'politics']
                      const full = ASSIGNED.includes(s.subject) && s.assignedScore != null ? 70 : s.fullScore
                      return full != null && <span className="text-xs text-muted-foreground ml-1">/ {full}</span>
                    })()}
                  </div>
                  {s.assignedScore != null && s.rawScore != null && (
                    <div className="text-xs text-muted-foreground">
                      原始 {s.rawScore} → 赋分 {s.assignedScore}
                    </div>
                  )}
                  {rate != null && (
                    <div className="text-xs text-muted-foreground">
                      得分率 {(rate * 100).toFixed(1)}%
                    </div>
                  )}
                  <div className="flex gap-2 text-xs text-muted-foreground">
                    {s.classRank != null && <span>班#{s.classRank}</span>}
                    {s.gradeRank != null && <span>年#{s.gradeRank}</span>}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* 目标展示 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>当前目标</CardTitle>
              <CardDescription>{activeGoals.length} 个进行中 / 待开始</CardDescription>
            </div>
            <Button variant="outline" size="sm" onClick={() => onNavigate('goals')}>管理目标</Button>
          </div>
        </CardHeader>
        <CardContent>
          {activeGoals.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              还没有目标，去设置一个吧 →
            </div>
          ) : (
            <div className="space-y-2">
              {activeGoals.slice(0, 5).map(g => {
                const cfg = GOAL_STATUS_CONFIG[g.status as GoalStatus]
                return (
                  <div key={g.id} className="flex items-start gap-3 p-2 rounded-md hover:bg-accent/50">
                    <div className="mt-0.5" style={{ color: cfg.color }}>
                      {g.status === 'completed' ? <CheckCircle2 className="h-4 w-4" />
                        : g.status === 'abandoned' ? <XCircle className="h-4 w-4" />
                        : g.status === 'pending' ? <Clock className="h-4 w-4" />
                        : <Circle className="h-4 w-4" />}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="text-sm font-medium">{g.title}</div>
                      {g.description && <div className="text-xs text-muted-foreground mt-0.5">{g.description}</div>}
                    </div>
                    <span className="text-xs px-2 py-0.5 rounded" style={{ background: `${cfg.color}20`, color: cfg.color }}>
                      {cfg.label}
                    </span>
                  </div>
                )
              })}
              {activeGoals.length > 5 && (
                <div className="text-center text-xs text-muted-foreground pt-1">
                  还有 {activeGoals.length - 5} 个目标...
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 进步/退步科目 */}
      {prevExam && (
        <Card>
          <CardHeader>
            <CardTitle>科目进退步</CardTitle>
            <CardDescription>对比上一次：{prevExam.name}（原始分对比）</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {latestExam.scores.map(s => {
                const prev = prevExam.scores.find(p => p.subject === s.subject)
                if (!prev || prev.rawScore == null || s.rawScore == null) return null
                const d = s.rawScore - prev.rawScore
                return (
                  <div key={s.subject} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                    <div className="flex items-center gap-2">
                      <span className="w-2 h-2 rounded-full" style={{ background: SUBJECTS[s.subject as SubjectKey].color }} />
                      <span className="text-sm">{SUBJECTS[s.subject as SubjectKey].name}</span>
                    </div>
                    <div className="flex items-center gap-3 text-sm">
                      <span className="text-muted-foreground">{prev.rawScore} → {s.rawScore}</span>
                      <span className={cn(
                        'font-medium px-2 py-0.5 rounded',
                        d > 0 ? 'text-emerald-500 bg-emerald-500/10' : d < 0 ? 'text-red-500 bg-red-500/10' : 'text-muted-foreground bg-muted'
                      )}>
                        {d > 0 ? '+' : ''}{d}
                      </span>
                    </div>
                  </div>
                )
              })}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 快捷入口 */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <QuickCard title="录入新成绩" desc="记录每场考试" onClick={() => onNavigate('entry')} icon={Plus} />
        <QuickCard title="历史成绩" desc={`${exams.length} 场考试`} onClick={() => onNavigate('list')} icon={Target} />
        <QuickCard title="图表分析" desc="趋势·雷达·对比" onClick={() => onNavigate('charts')} icon={TrendingUp} />
        <QuickCard title="目标管理" desc={`${activeGoals.length} 个进行中`} onClick={() => onNavigate('goals')} icon={CheckCircle2} />
      </div>
    </div>
  )
}

function BigStat({
  label, value, sub, color, icon: Icon,
}: {
  label: string
  value: string
  sub?: string
  color: 'primary' | 'success' | 'destructive' | 'warning' | 'info' | 'muted'
  icon?: React.ElementType
}) {
  const colorClass = {
    primary: 'text-primary',
    success: 'text-emerald-500',
    destructive: 'text-red-500',
    warning: 'text-amber-500',
    info: 'text-cyan-500',
    muted: 'text-muted-foreground',
  }[color]

  return (
    <Card>
      <CardContent className="p-4 md:p-5">
        <div className="text-xs text-muted-foreground mb-1">{label}</div>
        <div className="flex items-end gap-1">
          <span className={cn('text-2xl md:text-3xl font-bold', colorClass)}>{value}</span>
          {sub && <span className="text-xs text-muted-foreground mb-1">{sub}</span>}
          {Icon && <Icon className={cn('h-4 w-4 ml-auto mb-1', colorClass)} />}
        </div>
      </CardContent>
    </Card>
  )
}

function QuickCard({ title, desc, onClick, icon: Icon }: { title: string; desc: string; onClick: () => void; icon: React.ElementType }) {
  return (
    <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={onClick}>
      <CardContent className="p-4 flex items-center gap-3">
        <div className="p-2 rounded-md bg-primary/10 text-primary">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <div className="font-medium text-sm">{title}</div>
          <div className="text-xs text-muted-foreground">{desc}</div>
        </div>
      </CardContent>
    </Card>
  )
}
