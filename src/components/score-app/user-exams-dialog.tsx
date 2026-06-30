'use client'

import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent } from '@/components/ui/card'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'
import { Loader2, Download, FileSpreadsheet, FileText } from 'lucide-react'
import { AdminUser } from './types'
import { SUBJECTS, SubjectKey, EXAM_TYPES } from '@/lib/constants'
import { GOAL_STATUS_CONFIG, GoalStatus } from '@/lib/grade-system'
import {
  calcTotalRawScore, calcTotalAssignedScore, calcTotalFullScore, calcTotalRawFullScore,
  formatDateCN, getEffectiveScore,
} from './types'
import { toast } from 'sonner'

interface UserDetailDialogProps {
  user: AdminUser | null
  open: boolean
  onOpenChange: (open: boolean) => void
  isSuperAdmin?: boolean
}

export function UserDetailDialog({ user, open, onOpenChange, isSuperAdmin = false }: UserDetailDialogProps) {
  const { data, isLoading } = useQuery({
    queryKey: ['user-detail', user?.id],
    queryFn: async () => {
      const res = await fetch(`/api/users/${user!.id}/all`)
      const j = await res.json()
      if (!j.success) throw new Error(j.error)
      return j.data as {
        user: { id: string; username: string; displayName: string | null; role: string; electiveSubjects: string[] | null; createdAt: string }
        exams: Array<{
          id: string; name: string; examType: string; grade: string; date: string
          scores: Array<{
            subject: string; rawScore: number | null; fullScore: number | null
            assignedScore: number | null; grade: string | null
            classRank: number | null; gradeRank: number | null; note: string | null
            subScores: Array<{ questionNo: string; score: number | null; fullScore: number | null }>
          }>
        }>
        goals: Array<{
          id: string; title: string; description: string | null; status: string
          dueDate: string | null; createdAt: string
        }>
      }
    },
    enabled: !!user && open,
  })

  const exportUser = (type: 'excel' | 'pdf') => {
    if (!user) return
    if (type === 'pdf') {
      window.open(`/api/users/${user.id}/export/pdf`, '_blank')
      toast.success('已打开成绩报告')
    } else {
      const a = document.createElement('a')
      a.href = `/api/users/${user.id}/export/excel`
      a.download = ''
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      toast.success('Excel 导出中...')
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-5xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2 flex-wrap">
            {user?.displayName || user?.username} 的{isSuperAdmin ? '完整信息' : '基本信息'}
            {data && isSuperAdmin && (
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button variant="outline" size="sm">
                    <Download className="h-4 w-4 mr-1" /> 导出成绩
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end">
                  <DropdownMenuItem onClick={() => exportUser('excel')}>
                    <FileSpreadsheet className="h-4 w-4 mr-2" /> Excel
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportUser('pdf')}>
                    <FileText className="h-4 w-4 mr-2" /> PDF（打印）
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            )}
          </DialogTitle>
          <DialogDescription>
            @{user?.username} · {data ? `${data.exams.length} 场考试 · ${data.goals.length} 个目标` : '加载中'}
            {!isSuperAdmin && ' · 仅展示基本信息'}
          </DialogDescription>
        </DialogHeader>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          </div>
        ) : !data ? (
          <div className="text-center py-12 text-muted-foreground">无数据</div>
        ) : (
          <Tabs defaultValue="exams">
            <TabsList className={`grid w-full ${isSuperAdmin ? 'grid-cols-3' : 'grid-cols-2'}`}>
              <TabsTrigger value="exams">成绩概览（{data.exams.length}）</TabsTrigger>
              {isSuperAdmin && <TabsTrigger value="goals">目标（{data.goals.length}）</TabsTrigger>}
              <TabsTrigger value="info">基本信息</TabsTrigger>
            </TabsList>

            {/* 成绩 Tab */}
            <TabsContent value="exams" className="space-y-3 mt-3">
              {data.exams.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">还没有任何成绩</div>
              ) : (
                data.exams.map(exam => {
                  const examType = EXAM_TYPES[exam.examType as keyof typeof EXAM_TYPES]
                  const totalRaw = calcTotalRawScore(exam.scores)
                  const totalAssigned = calcTotalAssignedScore(exam.scores)
                  const totalFull = calcTotalFullScore(exam.scores)
                  const totalRawFull = calcTotalRawFullScore(exam.scores)
                  return (
                    <Card key={exam.id}>
                      <CardContent className="p-3 space-y-2">
                        <div className="flex items-center justify-between flex-wrap gap-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-semibold text-sm">{exam.name}</span>
                            <Badge variant="outline" className="text-xs">{examType?.shortName ?? exam.examType}</Badge>
                            <Badge variant="secondary" className="text-xs">{exam.grade}</Badge>
                          </div>
                          <span className="text-xs text-muted-foreground">{formatDateCN(exam.date)}</span>
                        </div>
                        <div className="flex items-center gap-4 text-xs">
                          <span>
                            原始分 <span className="font-bold text-sm">{totalRaw ?? '-'}</span>
                            {totalRawFull != null && <span className="text-muted-foreground"> / {totalRawFull}</span>}
                          </span>
                          {totalAssigned != null && totalAssigned !== totalRaw && (
                            <span>
                              赋分 <span className="font-bold text-sm text-cyan-500">{totalAssigned}</span>
                              {totalFull != null && <span className="text-muted-foreground"> / {totalFull}</span>}
                            </span>
                          )}
                        </div>
                        <div className="grid grid-cols-3 md:grid-cols-5 lg:grid-cols-10 gap-1">
                          {exam.scores.map(s => {
                            const subject = SUBJECTS[s.subject as SubjectKey]
                            const eff = getEffectiveScore(s)
                            const ASSIGNED = ['physics', 'chemistry', 'biology', 'history', 'geography', 'politics']
                            const full = ASSIGNED.includes(s.subject) && s.assignedScore != null ? 70 : s.fullScore
                            return (
                              <div
                                key={s.subject}
                                className="rounded p-1.5 text-xs"
                                style={{ borderLeft: `2px solid ${subject.color}`, background: 'var(--muted)' }}
                                title={s.note || ''}
                              >
                                <div className="text-muted-foreground" style={{ color: subject.color }}>{subject.shortName}</div>
                                <div className="font-semibold">{eff ?? '-'}</div>
                                {full != null && <div className="text-[10px] text-muted-foreground">/ {full}</div>}
                                {s.grade && <div className="text-[10px] text-muted-foreground">{s.grade}</div>}
                                {s.subScores.length > 0 && (
                                  <div className="text-[9px] text-muted-foreground mt-0.5">{s.subScores.length} 题小分</div>
                                )}
                              </div>
                            )
                          })}
                        </div>

                        {/* 小分明细（每个科目展开） */}
                        {exam.scores.some(s => s.subScores.length > 0) && (
                          <details className="mt-2 group">
                            <summary className="cursor-pointer text-xs text-muted-foreground hover:text-foreground select-none">
                              查看小分明细 ▼
                            </summary>
                            <div className="mt-2 space-y-2">
                              {exam.scores.filter(s => s.subScores.length > 0).map(s => {
                                const subject = SUBJECTS[s.subject as SubjectKey]
                                const total = s.subScores.reduce((sum, ss) => sum + (ss.score ?? 0), 0)
                                const fullTotal = s.subScores.reduce((sum, ss) => sum + (ss.fullScore ?? 0), 0)
                                return (
                                  <div key={s.subject} className="rounded border border-border p-2" style={{ borderLeft: `2px solid ${subject.color}` }}>
                                    <div className="text-xs font-medium mb-1" style={{ color: subject.color }}>
                                      {subject.name} — 小计 {total} / {fullTotal}
                                    </div>
                                    <div className="grid grid-cols-5 md:grid-cols-10 gap-1">
                                      {s.subScores.map((ss, i) => (
                                        <div key={i} className="rounded p-1 text-[10px] text-center bg-muted/50">
                                          <div className="text-muted-foreground">题{ss.questionNo}</div>
                                          <div className="font-semibold">{ss.score ?? '-'}</div>
                                          <div className="text-muted-foreground">/ {ss.fullScore ?? '-'}</div>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )
                              })}
                            </div>
                          </details>
                        )}
                      </CardContent>
                    </Card>
                  )
                })
              )}
            </TabsContent>

            {/* 目标 Tab - 仅超管可见 */}
            {isSuperAdmin && (
            <TabsContent value="goals" className="space-y-2 mt-3">
              {data.goals.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground text-sm">还没有任何目标</div>
              ) : (
                data.goals.map(g => {
                  const cfg = GOAL_STATUS_CONFIG[g.status as GoalStatus]
                  return (
                    <div key={g.id} className="rounded-md border border-border p-3 flex items-start gap-2">
                      <div className="flex-1">
                        <div className="flex items-center gap-2">
                          <span className="font-medium text-sm">{g.title}</span>
                          <span
                            className="text-[10px] px-1.5 py-0.5 rounded font-medium"
                            style={{ background: `${cfg.color}20`, color: cfg.color }}
                          >
                            {cfg.label}
                          </span>
                        </div>
                        {g.description && <p className="text-xs text-muted-foreground mt-1">{g.description}</p>}
                        <p className="text-[10px] text-muted-foreground mt-1">{formatDateCN(g.createdAt)}</p>
                      </div>
                    </div>
                  )
                })
              )}
            </TabsContent>
            )}

            {/* 基本信息 Tab */}
            <TabsContent value="info" className="space-y-3 mt-3">
              <Card>
                <CardContent className="p-4 space-y-2 text-sm">
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">用户名</span>
                    <span className="font-mono">{data.user.username}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">显示名</span>
                    <span>{data.user.displayName || '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">角色</span>
                    <Badge variant="outline">{data.user.role}</Badge>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">小三门选科</span>
                    <div className="flex gap-1">
                      {(data.user.electiveSubjects || []).map(s => (
                        <span
                          key={s}
                          className="px-1.5 py-0.5 rounded text-white text-xs"
                          style={{ background: SUBJECTS[s as SubjectKey]?.color ?? '#888' }}
                        >
                          {SUBJECTS[s as SubjectKey]?.shortName ?? s}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">注册时间</span>
                    <span>{formatDateCN(data.user.createdAt)}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">最近登录 IP</span>
                    <span className="font-mono text-xs">{user?.lastLoginIp ?? '—'}</span>
                  </div>
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">最近登录时间</span>
                    <span className="text-xs">{user?.lastLoginAt ? formatDateCN(user.lastLoginAt) : '—'}</span>
                  </div>
                </CardContent>
              </Card>
            </TabsContent>
          </Tabs>
        )}
      </DialogContent>
    </Dialog>
  )
}
