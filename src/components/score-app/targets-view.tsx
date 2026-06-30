'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Save, Target, TrendingUp, TrendingDown } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchExams, fetchTargets, saveTargets, Target, calcTotalScore } from './types'
import { SUBJECTS, SubjectKey } from '@/lib/constants'
import { toast } from 'sonner'

const ALL_SUBJECTS: SubjectKey[] = [
  'chinese', 'math', 'english', 'physics', 'chemistry', 'biology',
  'history', 'geography', 'politics', 'it',
]

export function TargetsView() {
  const queryClient = useQueryClient()
  const [targets, setTargets] = useState<Record<SubjectKey, Target>>({} as Record<SubjectKey, Target>)
  const [saving, setSaving] = useState(false)

  const { data: existing = [] } = useQuery({ queryKey: ['targets'], queryFn: fetchTargets })
  const { data: exams = [] } = useQuery({ queryKey: ['exams'], queryFn: fetchExams })

  useEffect(() => {
    const map = {} as Record<SubjectKey, Target>
    ALL_SUBJECTS.forEach(s => {
      const t = existing.find(e => e.subject === s)
      map[s] = t ?? { subject: s, targetScore: null, targetClassRank: null, targetGradeRank: null }
    })
    setTargets(map)
  }, [existing])

  // 取每科最近一次的成绩
  const latestBySubject: Record<SubjectKey, { score?: number | null; classRank?: number | null; gradeRank?: number | null; date?: string }> = {}
  const sorted = [...exams].sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime())
  sorted.forEach(exam => {
    exam.scores.forEach(s => {
      latestBySubject[s.subject as SubjectKey] = {
        score: s.score,
        classRank: s.classRank,
        gradeRank: s.gradeRank,
        date: exam.date,
      }
    })
  })

  const updateTarget = (sub: SubjectKey, patch: Partial<Target>) => {
    setTargets(prev => ({ ...prev, [sub]: { ...prev[sub], ...patch } }))
  }

  const handleSave = async () => {
    setSaving(true)
    try {
      await saveTargets(Object.values(targets))
      queryClient.invalidateQueries({ queryKey: ['targets'] })
      toast.success('已保存目标')
    } catch (e) {
      toast.error('保存失败：' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // 综合分析：实际 vs 目标
  const analyzeRow = (sub: SubjectKey) => {
    const t = targets[sub]
    if (!t) return { scoreDiff: null, classDiff: null, gradeDiff: null }
    const latest = latestBySubject[sub]
    const scoreDiff = t.targetScore != null && latest?.score != null ? latest.score - t.targetScore : null
    const classDiff = t.targetClassRank != null && latest?.classRank != null ? t.targetClassRank - latest.classRank : null
    const gradeDiff = t.targetGradeRank != null && latest?.gradeRank != null ? t.targetGradeRank - latest.gradeRank : null
    return { scoreDiff, classDiff, gradeDiff }
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">目标管理</h2>
          <p className="text-sm text-muted-foreground">为每科设定目标分数与排名，对比实际表现</p>
        </div>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-1" /> {saving ? '保存中...' : '保存目标'}
        </Button>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>各科目标设定</CardTitle>
          <CardDescription>留空表示该字段无目标</CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {/* 表头 */}
          <div className="hidden md:grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-2 pb-2 border-b border-border">
            <div className="col-span-2">科目</div>
            <div className="col-span-2">目标分数</div>
            <div className="col-span-2">目标班排</div>
            <div className="col-span-2">目标年排</div>
            <div className="col-span-1">最近分数</div>
            <div className="col-span-1">最近班排</div>
            <div className="col-span-1">最近年排</div>
            <div className="col-span-1">差距</div>
          </div>

          {ALL_SUBJECTS.map(sub => {
            const subject = SUBJECTS[sub]
            const t = targets[sub] ?? { subject: sub, targetScore: null, targetClassRank: null, targetGradeRank: null }
            const latest = latestBySubject[sub]
            const { scoreDiff } = analyzeRow(sub)
            return (
              <div
                key={sub}
                className="grid grid-cols-2 md:grid-cols-12 gap-2 items-center px-2 py-2 rounded-md hover:bg-accent/50"
                style={{ borderLeft: `3px solid ${subject.color}` }}
              >
                <div className="col-span-2 md:col-span-2 flex items-center gap-2">
                  <span className="w-2 h-2 rounded-full" style={{ background: subject.color }} />
                  <span className="font-medium text-sm">{subject.name}</span>
                </div>
                <div>
                  <Input
                    type="number"
                    value={t.targetScore ?? ''}
                    onChange={e => updateTarget(sub, { targetScore: e.target.value === '' ? null : Number(e.target.value) })}
                    placeholder="—"
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Input
                    type="number"
                    value={t.targetClassRank ?? ''}
                    onChange={e => updateTarget(sub, { targetClassRank: e.target.value === '' ? null : Number(e.target.value) })}
                    placeholder="—"
                    className="h-8 text-sm"
                  />
                </div>
                <div>
                  <Input
                    type="number"
                    value={t.targetGradeRank ?? ''}
                    onChange={e => updateTarget(sub, { targetGradeRank: e.target.value === '' ? null : Number(e.target.value) })}
                    placeholder="—"
                    className="h-8 text-sm"
                  />
                </div>
                <div className="text-sm text-muted-foreground text-center">
                  {latest?.score != null ? latest.score : '—'}
                </div>
                <div className="text-sm text-muted-foreground text-center">
                  {latest?.classRank != null ? `#${latest.classRank}` : '—'}
                </div>
                <div className="text-sm text-muted-foreground text-center">
                  {latest?.gradeRank != null ? `#${latest.gradeRank}` : '—'}
                </div>
                <div className="text-center">
                  {scoreDiff != null ? (
                    <Badge variant={scoreDiff >= 0 ? 'default' : 'destructive'} className="text-xs">
                      {scoreDiff >= 0 ? <TrendingUp className="h-3 w-3 mr-0.5" /> : <TrendingDown className="h-3 w-3 mr-0.5" />}
                      {scoreDiff > 0 ? '+' : ''}{scoreDiff}
                    </Badge>
                  ) : (
                    <span className="text-xs text-muted-foreground">—</span>
                  )}
                </div>
              </div>
            )
          })}
        </CardContent>
      </Card>

      {/* 综合分析卡片 */}
      <Card>
        <CardHeader>
          <CardTitle>达成情况总览</CardTitle>
          <CardDescription>基于最近一次成绩对比目标</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
            {ALL_SUBJECTS.filter(sub => {
              const t = targets[sub]
              if (!t) return false
              const latest = latestBySubject[sub]
              return t.targetScore != null && latest?.score != null
            }).map(sub => {
              const subject = SUBJECTS[sub]
              const { scoreDiff } = analyzeRow(sub)
              const achieved = (scoreDiff ?? 0) >= 0
              return (
                <div
                  key={sub}
                  className="rounded-lg border border-border p-3 space-y-1"
                  style={{ borderLeft: `3px solid ${subject.color}` }}
                >
                  <div className="text-xs text-muted-foreground">{subject.name}</div>
                  <div className={`text-xl font-bold ${achieved ? 'text-emerald-500' : 'text-red-500'}`}>
                    {achieved ? '✓' : '✗'}
                  </div>
                  <div className="text-xs">
                    {scoreDiff! > 0 ? `超 ${scoreDiff} 分` : scoreDiff! < 0 ? `差 ${Math.abs(scoreDiff!)} 分` : '刚好达标'}
                  </div>
                </div>
              )
            })}
            {ALL_SUBJECTS.filter(sub => {
              const t = targets[sub]
              if (!t) return false
              const latest = latestBySubject[sub]
              return t.targetScore != null && latest?.score != null
            }).length === 0 && (
              <div className="col-span-5 text-center py-6 text-sm text-muted-foreground">
                还没有可对比的数据，先录入成绩并设定目标吧
              </div>
            )}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
