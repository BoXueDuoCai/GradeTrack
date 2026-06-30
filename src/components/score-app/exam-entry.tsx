'use client'

import { useState, useEffect, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Plus, Trash2, Save, X, ChevronDown, ChevronUp, ListPlus } from 'lucide-react'
import {
  SUBJECTS, EXAM_TYPES, GRADE_LEVELS, SubjectKey, ExamType, resolveExamSubjects,
} from '@/lib/constants'
import { ALL_GRADES, GradeLevel, GRADE_TO_SCORE, isAssignedSubject } from '@/lib/grade-system'
import { Exam, SubjectScore, SubScore, AuthUser, saveExam, fetchSettings } from './types'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface ExamEntryProps {
  editExam: Exam | null
  user: AuthUser
  onDone: () => void
  onCancel: () => void
}

export function ExamEntry({ editExam, user, onDone, onCancel }: ExamEntryProps) {
  const [name, setName] = useState('')
  const [examType, setExamType] = useState<ExamType>('monthly5')
  const [customSubjects, setCustomSubjects] = useState<SubjectKey[]>(['chinese', 'math'])
  const [customTypeName, setCustomTypeName] = useState('')
  const [grade, setGrade] = useState<string>('高一上')
  const [date, setDate] = useState<string>(new Date().toISOString().slice(0, 10))
  const [scores, setScores] = useState<SubjectScore[]>([])
  const [saving, setSaving] = useState(false)

  // 加载用户选科（编辑模式下从 exam 取，否则从 user 取）—— 必须用 useMemo 避免每次渲染新数组导致 useEffect 死循环
  const electiveSubjects: SubjectKey[] = useMemo(() => {
    if (editExam) {
      if (editExam.examType === 'monthly6' || editExam.examType === 'midterm6' || editExam.examType === 'final6') {
        const fromExam = editExam.scores
          .map(s => s.subject)
          .filter(s => ['physics','chemistry','biology','history','geography','politics'].includes(s)) as SubjectKey[]
        if (fromExam.length === 3) return fromExam
      }
    }
    return user.electiveSubjects ?? ['physics','chemistry','biology']
  }, [editExam, user.electiveSubjects])

  // 初始化
  useEffect(() => {
    if (editExam) {
      setName(editExam.name)
      setExamType(editExam.examType)
      setGrade(editExam.grade)
      setDate(editExam.date.slice(0, 10))
      if (editExam.customSubjects) setCustomSubjects(editExam.customSubjects)
      setScores(editExam.scores.map(s => ({
        id: s.id,
        subject: s.subject,
        rawScore: s.rawScore,
        fullScore: s.fullScore,
        assignedScore: s.assignedScore,
        grade: s.grade,
        classRank: s.classRank,
        gradeRank: s.gradeRank,
        note: s.note,
        subScores: s.subScores.map(ss => ({ id: ss.id, questionNo: ss.questionNo, score: ss.score, fullScore: ss.fullScore })),
      })))
    }
  }, [editExam])

  // examType 变化时（仅新建模式）自动调整科目
  useEffect(() => {
    if (editExam) return
    const subjects = resolveExamSubjects(examType, electiveSubjects, customSubjects)
    setScores(prev => {
      const newScores = subjects.map(subject => {
        const existing = prev.find(p => p.subject === subject)
        if (existing) return existing
        return {
          subject,
          fullScore: SUBJECTS[subject].defaultFullScore,
          rawScore: null,
          assignedScore: null,
          grade: null,
          classRank: null,
          gradeRank: null,
          note: null,
          subScores: [],
        }
      })
      return newScores
    })
  }, [examType, editExam, electiveSubjects, customSubjects])

  // 更新某科成绩（含分数范围校验）
  const updateScore = (subject: SubjectKey, patch: Partial<SubjectScore>) => {
    setScores(prev => prev.map(s => {
      if (s.subject !== subject) return s
      const merged = { ...s, ...patch }
      // 分数范围校验：rawScore 不能超过 fullScore，assignedScore 不能超过 70
      if (merged.rawScore != null && merged.fullScore != null && merged.rawScore > merged.fullScore) {
        toast.error(`${SUBJECTS[subject].name} 原始分 ${merged.rawScore} 超过满分 ${merged.fullScore}，已自动修正`)
        merged.rawScore = merged.fullScore
      }
      if (merged.rawScore != null && merged.rawScore < 0) {
        merged.rawScore = 0
      }
      if (merged.assignedScore != null && merged.assignedScore > 70) {
        toast.error(`${SUBJECTS[subject].name} 赋分不能超过 70，已自动修正`)
        merged.assignedScore = 70
      }
      if (merged.assignedScore != null && merged.assignedScore < 40) {
        toast.error(`${SUBJECTS[subject].name} 赋分不能低于 40（E 等级），已自动修正`)
        merged.assignedScore = 40
      }
      return merged
    }))
  }

  // 等级变化时自动算赋分
  const updateGrade = (subject: SubjectKey, grade: string | null) => {
    const assignedScore = grade ? GRADE_TO_SCORE[grade as GradeLevel] ?? null : null
    updateScore(subject, { grade, assignedScore })
  }

  // 小分操作
  const addSubScore = (subject: SubjectKey) => {
    setScores(prev => prev.map(s => {
      if (s.subject !== subject) return s
      const nextNo = s.subScores.length + 1
      return { ...s, subScores: [...s.subScores, { questionNo: String(nextNo), score: null, fullScore: null }] }
    }))
  }

  const updateSubScore = (subject: SubjectKey, idx: number, patch: Partial<SubScore>) => {
    setScores(prev => prev.map(s => {
      if (s.subject !== subject) return s
      const newSubs = s.subScores.map((ss, i) => i === idx ? { ...ss, ...patch } : ss)
      return { ...s, subScores: newSubs }
    }))
  }

  const removeSubScore = (subject: SubjectKey, idx: number) => {
    setScores(prev => prev.map(s => {
      if (s.subject !== subject) return s
      return { ...s, subScores: s.subScores.filter((_, i) => i !== idx) }
    }))
  }

  // 数学固定 21 题
  useEffect(() => {
    setScores(prev => prev.map(s => {
      if (s.subject !== 'math') return s
      const fixed = SUBJECTS.math.fixedQuestionCount!
      const newSubs = [...s.subScores]
      while (newSubs.length < fixed) {
        newSubs.push({ questionNo: String(newSubs.length + 1), score: null, fullScore: null })
      }
      return { ...s, subScores: newSubs }
    }))
  }, [scores.length])

  // 保存
  const handleSave = async () => {
    if (!name.trim()) {
      toast.error('请填写考试名称')
      return
    }
    if (examType === 'custom' && customSubjects.length === 0) {
      toast.error('自定义类型至少选 1 个科目')
      return
    }
    setSaving(true)
    try {
      const cleanedScores = scores.map(s => ({
        ...s,
        rawScore: s.rawScore == null || isNaN(s.rawScore as number) ? null : Number(s.rawScore),
        fullScore: s.fullScore == null || isNaN(s.fullScore as number) ? null : Number(s.fullScore),
        assignedScore: s.assignedScore == null || isNaN(s.assignedScore as number) ? null : Number(s.assignedScore),
        classRank: s.classRank == null || isNaN(s.classRank as number) ? null : Number(s.classRank),
        gradeRank: s.gradeRank == null || isNaN(s.gradeRank as number) ? null : Number(s.gradeRank),
        subScores: s.subScores
          .filter(ss => ss.questionNo.trim() !== '' || ss.score != null || ss.fullScore != null)
          .map(ss => ({
            ...ss,
            score: ss.score == null || isNaN(ss.score as number) ? null : Number(ss.score),
            fullScore: ss.fullScore == null || isNaN(ss.fullScore as number) ? null : Number(ss.fullScore),
          })),
      }))

      await saveExam({
        id: editExam?.id,
        name: name.trim(),
        examType,
        customSubjects: examType === 'custom' ? customSubjects : undefined,
        grade,
        date,
        scores: cleanedScores,
      })
      toast.success(editExam ? '已更新' : '已录入')
      onDone()
    } catch (e) {
      toast.error('保存失败：' + (e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  // 自定义类型的科目多选
  const toggleCustomSubject = (sub: SubjectKey) => {
    setCustomSubjects(prev => prev.includes(sub) ? prev.filter(s => s !== sub) : [...prev, sub])
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">{editExam ? '编辑考试' : '录入新成绩'}</h2>
          <p className="text-sm text-muted-foreground">没记录的字段留空即可，不做必填校验</p>
        </div>
        <Button variant="ghost" size="sm" onClick={onCancel}>
          <X className="h-4 w-4 mr-1" /> 取消
        </Button>
      </div>

      {/* 考试基本信息 */}
      <Card>
        <CardHeader>
          <CardTitle>考试信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <div className="space-y-1.5">
              <Label>考试名称 *</Label>
              <Input value={name} onChange={e => setName(e.target.value)} placeholder="如：高一上10月月考" />
            </div>
            <div className="space-y-1.5">
              <Label>考试类型</Label>
              <Select value={examType} onValueChange={(v) => setExamType(v as ExamType)} disabled={!!editExam}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {Object.values(EXAM_TYPES).map(t => (
                    <SelectItem key={t.type} value={t.type}>
                      {t.type === 'monthly6' || t.type === 'midterm6' || t.type === 'final6'
                        ? `${t.name}（语数英+${electiveSubjects.map(s => SUBJECTS[s].shortName).join('')}）`
                        : t.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>年级学期</Label>
              <Select value={grade} onValueChange={setGrade}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {GRADE_LEVELS.map(g => <SelectItem key={g} value={g}>{g}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>考试日期</Label>
              <Input type="date" value={date} onChange={e => setDate(e.target.value)} />
            </div>
          </div>

          {/* 自定义类型：科目多选 */}
          {examType === 'custom' && (
            <div className="space-y-2 pt-3 border-t border-border">
              <Label>自定义科目（点击选择）</Label>
              <div className="flex flex-wrap gap-2">
                {(Object.keys(SUBJECTS) as SubjectKey[]).map(sub => {
                  const selected = customSubjects.includes(sub)
                  const subject = SUBJECTS[sub]
                  return (
                    <button
                      key={sub}
                      type="button"
                      onClick={() => toggleCustomSubject(sub)}
                      className={cn(
                        'px-3 py-1.5 rounded-md text-sm font-medium border transition-colors',
                        selected
                          ? 'text-white'
                          : 'bg-muted text-muted-foreground border-border hover:bg-accent'
                      )}
                      style={selected ? { background: subject.color, borderColor: subject.color } : {}}
                    >
                      {subject.name}
                    </button>
                  )
                })}
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 各科成绩 */}
      <div className="space-y-3">
        {scores.map(s => {
          const subject = SUBJECTS[s.subject as SubjectKey]
          return (
            <SubjectEntryCard
              key={s.subject}
              subjectKey={s.subject as SubjectKey}
              score={s}
              onUpdate={(patch) => updateScore(s.subject as SubjectKey, patch)}
              onUpdateGrade={(g) => updateGrade(s.subject as SubjectKey, g)}
              onAddSub={() => addSubScore(s.subject as SubjectKey)}
              onUpdateSub={(i, patch) => updateSubScore(s.subject as SubjectKey, i, patch)}
              onRemoveSub={(i) => removeSubScore(s.subject as SubjectKey, i)}
            />
          )
        })}
      </div>

      {/* 底部操作 */}
      <div className="flex justify-end gap-2 pb-6">
        <Button variant="outline" onClick={onCancel}>取消</Button>
        <Button onClick={handleSave} disabled={saving}>
          <Save className="h-4 w-4 mr-1" /> {saving ? '保存中...' : '保存'}
        </Button>
      </div>
    </div>
  )
}

// 单科录入卡片
function SubjectEntryCard({
  subjectKey, score, onUpdate, onUpdateGrade, onAddSub, onUpdateSub, onRemoveSub,
}: {
  subjectKey: SubjectKey
  score: SubjectScore
  onUpdate: (patch: Partial<SubjectScore>) => void
  onUpdateGrade: (grade: string | null) => void
  onAddSub: () => void
  onUpdateSub: (idx: number, patch: Partial<SubScore>) => void
  onRemoveSub: (idx: number) => void
}) {
  const subject = SUBJECTS[subjectKey]
  const [expanded, setExpanded] = useState(false)
  const isMath = subjectKey === 'math'
  const isAssigned = isAssignedSubject(subjectKey)

  const parseNum = (v: string): number | null => {
    if (v === '') return null
    const n = parseFloat(v)
    return isNaN(n) ? null : n
  }

  return (
    <Card style={{ borderLeft: `3px solid ${subject.color}` }}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-semibold" style={{ color: subject.color }}>{subject.name}</span>
            {isMath && <Badge variant="secondary" className="text-xs">固定 21 题</Badge>}
            {isAssigned && <Badge variant="outline" className="text-xs">赋分</Badge>}
            {score.subScores.length > 0 && (
              <Badge variant="outline" className="text-xs">{score.subScores.length} 道小分</Badge>
            )}
          </div>
          <Button variant="ghost" size="sm" onClick={() => setExpanded(!expanded)}>
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            小分
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {/* 主分数行 */}
        <div className={cn('grid gap-2', isAssigned ? 'grid-cols-2 md:grid-cols-7' : 'grid-cols-2 md:grid-cols-5')}>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">原始分</Label>
            <Input
              type="number"
              value={score.rawScore ?? ''}
              onChange={e => onUpdate({ rawScore: parseNum(e.target.value) })}
              placeholder="—"
            />
          </div>
          {isAssigned && (
            <>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">等级</Label>
                <Select
                  value={(score.grade as string) ?? '__none__'}
                  onValueChange={(v) => onUpdateGrade(v === '__none__' ? null : v)}
                >
                  <SelectTrigger><SelectValue placeholder="—" /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— 清除 —</SelectItem>
                    {ALL_GRADES.map(g => (
                      <SelectItem key={g} value={g}>{g} ({GRADE_TO_SCORE[g]}分)</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1">
                <Label className="text-xs text-muted-foreground">赋分</Label>
                <Input
                  type="number"
                  value={score.assignedScore ?? ''}
                  onChange={e => onUpdate({ assignedScore: parseNum(e.target.value) })}
                  placeholder="自动"
                  className="bg-muted/30"
                />
              </div>
            </>
          )}
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">满分</Label>
            <Input
              type="number"
              value={score.fullScore ?? ''}
              onChange={e => onUpdate({ fullScore: parseNum(e.target.value) })}
              placeholder="—"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">班级排名</Label>
            <Input
              type="number"
              value={score.classRank ?? ''}
              onChange={e => onUpdate({ classRank: parseNum(e.target.value) })}
              placeholder="—"
            />
          </div>
          <div className="space-y-1">
            <Label className="text-xs text-muted-foreground">年级排名</Label>
            <Input
              type="number"
              value={score.gradeRank ?? ''}
              onChange={e => onUpdate({ gradeRank: parseNum(e.target.value) })}
              placeholder="—"
            />
          </div>
          <div className="space-y-1 md:col-span-1 col-span-2">
            <Label className="text-xs text-muted-foreground">备注</Label>
            <Input
              value={score.note ?? ''}
              onChange={e => onUpdate({ note: e.target.value || null })}
              placeholder="如：最后一题没时间"
            />
          </div>
        </div>

        {isAssigned && score.grade && (
          <div className="text-xs text-muted-foreground bg-muted/30 rounded px-2 py-1">
            等级 <span className="font-semibold text-foreground">{score.grade}</span>
            {' → '}赋分 <span className="font-semibold text-primary">{GRADE_TO_SCORE[score.grade as GradeLevel]}</span> 分
            （原始分 {score.rawScore ?? '—'}）
          </div>
        )}

        {/* 小分区域 */}
        {expanded && (
          <div className="mt-2 pt-3 border-t border-border space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-muted-foreground">
                小分明细{isMath ? '（数学固定 21 题）' : ''}
              </span>
              {!isMath && (
                <Button variant="outline" size="sm" onClick={onAddSub}>
                  <ListPlus className="h-3.5 w-3.5 mr-1" /> 添加一题
                </Button>
              )}
            </div>
            {score.subScores.length === 0 ? (
              <div className="text-xs text-muted-foreground py-3 text-center">
                {isMath ? '加载中...' : '还没有小分，点击"添加一题"开始记录'}
              </div>
            ) : (
              <div className="grid grid-cols-3 md:grid-cols-6 lg:grid-cols-8 gap-2">
                {score.subScores.map((ss, i) => (
                  <div key={i} className="rounded-md border border-border p-2 space-y-1.5 bg-muted/30">
                    <Input
                      value={ss.questionNo}
                      onChange={e => onUpdateSub(i, { questionNo: e.target.value })}
                      placeholder="题号"
                      className="h-7 text-xs"
                      disabled={isMath}
                    />
                    <Input
                      type="number"
                      value={ss.score ?? ''}
                      onChange={e => onUpdateSub(i, { score: parseNum(e.target.value) })}
                      placeholder="得分"
                      className="h-7 text-xs"
                    />
                    <Input
                      type="number"
                      value={ss.fullScore ?? ''}
                      onChange={e => onUpdateSub(i, { fullScore: parseNum(e.target.value) })}
                      placeholder="满分"
                      className="h-7 text-xs"
                    />
                    {!isMath && (
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-6 w-full text-xs text-destructive"
                        onClick={() => onRemoveSub(i)}
                      >
                        <Trash2 className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                ))}
              </div>
            )}
            {isMath && (
              <div className="text-xs text-muted-foreground">
                共 {score.subScores.length} 题（数学固定 21 题，不可删除）
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  )
}
