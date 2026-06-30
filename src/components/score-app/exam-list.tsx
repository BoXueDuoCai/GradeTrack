'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Edit, Trash2, ChevronDown, ChevronUp } from 'lucide-react'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import {
  Exam, calcTotalRawScore, calcTotalAssignedScore, calcTotalFullScore, calcTotalRawFullScore,
  formatDateCN, deleteExam, getEffectiveScore,
} from './types'
import { SUBJECTS, EXAM_TYPES, SubjectKey } from '@/lib/constants'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface ExamListProps {
  exams: Exam[]
  onEdit: (e: Exam) => void
  onRefresh: () => void
}

export function ExamList({ exams, onEdit, onRefresh }: ExamListProps) {
  const [confirmDelete, setConfirmDelete] = useState<Exam | null>(null)
  const [expanded, setExpanded] = useState<Record<string, boolean>>({})
  const sorted = [...exams].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const handleDelete = async () => {
    if (!confirmDelete) return
    try {
      await deleteExam(confirmDelete.id)
      toast.success('已删除')
      onRefresh()
    } catch (e) {
      toast.error('删除失败：' + (e as Error).message)
    } finally {
      setConfirmDelete(null)
    }
  }

  const toggleExpand = (id: string) => {
    setExpanded(prev => ({ ...prev, [id]: !prev[id] }))
  }

  if (sorted.length === 0) {
    return (
      <div className="max-w-4xl mx-auto p-6">
        <div className="text-center py-20">
          <div className="text-6xl mb-4">📝</div>
          <h2 className="text-xl font-bold mb-2">还没有任何考试</h2>
          <p className="text-muted-foreground">开始录入第一场考试吧</p>
        </div>
      </div>
    )
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">历史成绩</h2>
          <p className="text-sm text-muted-foreground">共 {exams.length} 场考试，按时间倒序</p>
        </div>
      </div>

      {sorted.map(exam => {
        const examType = EXAM_TYPES[exam.examType]
        const examTypeName = exam.examType === 'custom' ? '自定义' : (examType?.name ?? exam.examType)
        const totalRaw = calcTotalRawScore(exam.scores)
        const totalAssigned = calcTotalAssignedScore(exam.scores)
        const totalFull = calcTotalFullScore(exam.scores)
        const totalRawFull = calcTotalRawFullScore(exam.scores)
        // 得分率按原始分算
        const rate = totalRaw != null && totalRawFull ? (totalRaw / totalRawFull * 100).toFixed(1) : null
        const isExpanded = expanded[exam.id] ?? false

        return (
          <Card key={exam.id}>
            <CardHeader className="pb-3">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <CardTitle className="text-base">{exam.name}</CardTitle>
                    <Badge variant="outline" className="text-xs">{examTypeName}</Badge>
                    <Badge variant="secondary" className="text-xs">{exam.grade}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground mt-1">{formatDateCN(exam.date)}</p>
                </div>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" onClick={() => onEdit(exam)} title="编辑">
                    <Edit className="h-4 w-4" />
                  </Button>
                  <Button variant="ghost" size="icon" onClick={() => setConfirmDelete(exam)} title="删除" className="text-destructive">
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              {/* 总分大数字 */}
              <div className="flex items-end gap-4 mb-3 flex-wrap">
                <div>
                  <div className="text-xs text-muted-foreground">原始分总分</div>
                  <div className="text-2xl font-bold">
                    {totalRaw != null ? totalRaw : '-'}
                    {totalRawFull != null && <span className="text-sm text-muted-foreground ml-1">/ {totalRawFull}</span>}
                  </div>
                </div>
                {totalAssigned != null && totalAssigned !== totalRaw && (
                  <div>
                    <div className="text-xs text-muted-foreground">赋分总分</div>
                    <div className="text-2xl font-bold text-cyan-500">
                      {totalAssigned}
                      {totalFull != null && <span className="text-sm text-muted-foreground ml-1">/ {totalFull}</span>}
                    </div>
                  </div>
                )}
                {rate != null && (
                  <div className="ml-auto">
                    <div className="text-xs text-muted-foreground text-right">得分率</div>
                    <div className="text-xl font-semibold text-primary">{rate}%</div>
                  </div>
                )}
                <Button variant="ghost" size="sm" onClick={() => toggleExpand(exam.id)} className="ml-2">
                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                  详情
                </Button>
              </div>

              {/* 科目行 */}
              <div className={cn('grid gap-2', isExpanded ? 'grid-cols-2 md:grid-cols-5' : 'grid-cols-3 md:grid-cols-5')}>
                {exam.scores.map(s => {
                  const subject = SUBJECTS[s.subject as SubjectKey]
                  const effScore = getEffectiveScore(s)
                  return (
                    <div key={s.subject} className="rounded-md border border-border p-2 text-sm" style={{ borderLeft: `2px solid ${subject.color}` }}>
                      <div className="text-xs text-muted-foreground mb-0.5 flex items-center justify-between">
                        <span style={{ color: subject.color }}>{subject.name}</span>
                        {s.grade && <span className="text-[10px] px-1 rounded bg-muted">{s.grade}</span>}
                      </div>
                      <div className="font-semibold">
                        {effScore != null ? effScore : '-'}
                        {isExpanded && (() => {
                          const ASSIGNED = ['physics', 'chemistry', 'biology', 'history', 'geography', 'politics']
                          const full = ASSIGNED.includes(s.subject) && s.assignedScore != null ? 70 : s.fullScore
                          return full != null && <span className="text-xs text-muted-foreground"> / {full}</span>
                        })()}
                      </div>
                      {isExpanded && (
                        <div className="text-[10px] text-muted-foreground mt-1 space-y-0.5">
                          {s.rawScore != null && s.assignedScore != null && s.rawScore !== s.assignedScore && (
                            <div>原始 {s.rawScore} → 赋 {s.assignedScore}</div>
                          )}
                          {s.classRank != null && <div>班 #{s.classRank}</div>}
                          {s.gradeRank != null && <div>年 #{s.gradeRank}</div>}
                          {s.note && <div className="italic truncate" title={s.note}>📝 {s.note}</div>}
                          {s.subScores.length > 0 && <div>共 {s.subScores.length} 题小分</div>}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            </CardContent>
          </Card>
        )
      })}

      {/* 删除确认 */}
      <Dialog open={!!confirmDelete} onOpenChange={(open) => !open && setConfirmDelete(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认删除？</DialogTitle>
            <DialogDescription>
              将永久删除「{confirmDelete?.name}」及其全部成绩和小分，此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmDelete(null)}>取消</Button>
            <Button variant="destructive" onClick={handleDelete}>删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
