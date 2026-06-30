'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Plus, Trash2, CheckCircle2, Circle, XCircle, Clock, History } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchGoals, createGoal, updateGoal, deleteGoal, Exam, Goal } from './types'
import { GOAL_STATUS_CONFIG, ALL_GOAL_STATUSES, GoalStatus } from '@/lib/grade-system'
import { EXAM_TYPES } from '@/lib/constants'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { formatDateCN } from './types'
import { useConfirm } from './confirm-dialog'

interface GoalsViewProps {
  exams: Exam[]
}

export function GoalsView({ exams }: GoalsViewProps) {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const [showForm, setShowForm] = useState(false)
  const [showHistory, setShowHistory] = useState(false)
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [status, setStatus] = useState<GoalStatus>('active')
  const [examId, setExamId] = useState<string>('__none__')
  const [creating, setCreating] = useState(false)

  const { data: goals = [] } = useQuery({ queryKey: ['goals'], queryFn: fetchGoals })

  const sorted = [...exams].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())

  const activeGoals = goals.filter(g => g.status === 'active' || g.status === 'pending')
  const historyGoals = goals.filter(g => g.status === 'completed' || g.status === 'abandoned')

  const handleCreate = async () => {
    if (!title.trim()) {
      toast.error('请填写目标标题')
      return
    }
    setCreating(true)
    try {
      await createGoal({
        title: title.trim(),
        description: description.trim() || undefined,
        status,
        examId: examId === '__none__' ? undefined : examId,
      })
      toast.success('已创建目标')
      setTitle('')
      setDescription('')
      setStatus('active')
      setExamId('__none__')
      setShowForm(false)
      queryClient.invalidateQueries({ queryKey: ['goals'] })
    } catch (e) {
      toast.error('创建失败：' + (e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  const handleStatusChange = async (goal: Goal, newStatus: GoalStatus) => {
    try {
      await updateGoal(goal.id, { status: newStatus })
      toast.success(`已标记为「${GOAL_STATUS_CONFIG[newStatus].label}」`)
      queryClient.invalidateQueries({ queryKey: ['goals'] })
    } catch (e) {
      toast.error('更新失败：' + (e as Error).message)
    }
  }

  const handleDelete = async (goal: Goal) => {
    const ok = await confirm({
      title: '确认删除',
      description: `删除目标「${goal.title}」？`,
      variant: 'destructive',
      confirmText: '删除',
    })
    if (!ok) return
    try {
      await deleteGoal(goal.id)
      toast.success('已删除')
      queryClient.invalidateQueries({ queryKey: ['goals'] })
    } catch (e) {
      toast.error('删除失败：' + (e as Error).message)
    }
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold">目标管理</h2>
          <p className="text-sm text-muted-foreground">支持多个目标 · 可标记状态 · 历史保留</p>
        </div>
        <Button onClick={() => setShowForm(!showForm)}>
          <Plus className="h-4 w-4 mr-1" /> 新目标
        </Button>
      </div>

      {/* 新建目标表单 */}
      {showForm && (
        <Card>
          <CardHeader>
            <CardTitle>新建目标</CardTitle>
            <CardDescription>可以是分数目标、排名目标，或者纯文字目标</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="space-y-1.5">
              <Label>标题 *</Label>
              <Input
                value={title}
                onChange={e => setTitle(e.target.value)}
                placeholder="如：期末数学上 130 / 班排进前 10 / 每天背 30 个单词"
                onKeyDown={e => e.key === 'Enter' && handleCreate()}
              />
            </div>
            <div className="space-y-1.5">
              <Label>详细描述（可选）</Label>
              <Textarea
                value={description}
                onChange={e => setDescription(e.target.value)}
                placeholder="补充说明、具体计划等"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div className="space-y-1.5">
                <Label>初始状态</Label>
                <Select value={status} onValueChange={(v) => setStatus(v as GoalStatus)}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {ALL_GOAL_STATUSES.map(s => (
                      <SelectItem key={s} value={s}>{GOAL_STATUS_CONFIG[s].label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label>关联考试（可选）</Label>
                <Select value={examId} onValueChange={setExamId}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="__none__">— 不关联 —</SelectItem>
                    {sorted.map(e => (
                      <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="flex justify-end gap-2 pt-2">
              <Button variant="outline" onClick={() => setShowForm(false)}>取消</Button>
              <Button onClick={handleCreate} disabled={creating}>
                {creating ? '创建中...' : '创建'}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 进行中目标 */}
      <Card>
        <CardHeader>
          <CardTitle>进行中目标（{activeGoals.length}）</CardTitle>
        </CardHeader>
        <CardContent>
          {activeGoals.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">
              暂无进行中目标，点击右上角"新目标"创建
            </div>
          ) : (
            <div className="space-y-2">
              {activeGoals.map(g => (
                <GoalCard
                  key={g.id}
                  goal={g}
                  examName={sorted.find(e => e.id === g.examId)?.name}
                  onStatusChange={handleStatusChange}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 历史目标 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>历史目标</CardTitle>
              <CardDescription>{historyGoals.length} 个已完成 / 放弃</CardDescription>
            </div>
            {historyGoals.length > 0 && (
              <Button variant="ghost" size="sm" onClick={() => setShowHistory(!showHistory)}>
                <History className="h-4 w-4 mr-1" /> {showHistory ? '收起' : '展开'}
              </Button>
            )}
          </div>
        </CardHeader>
        {showHistory && historyGoals.length > 0 && (
          <CardContent>
            <div className="space-y-2">
              {historyGoals.map(g => (
                <GoalCard
                  key={g.id}
                  goal={g}
                  examName={sorted.find(e => e.id === g.examId)?.name}
                  onStatusChange={handleStatusChange}
                  onDelete={handleDelete}
                />
              ))}
            </div>
          </CardContent>
        )}
      </Card>
    </div>
  )
}

function GoalCard({
  goal, examName, onStatusChange, onDelete,
}: {
  goal: Goal
  examName?: string
  onStatusChange: (g: Goal, s: GoalStatus) => void
  onDelete: (g: Goal) => void
}) {
  const cfg = GOAL_STATUS_CONFIG[goal.status as GoalStatus]
  const Icon = goal.status === 'completed' ? CheckCircle2
    : goal.status === 'abandoned' ? XCircle
    : goal.status === 'pending' ? Clock
    : Circle

  return (
    <div className="rounded-lg border border-border p-3 space-y-2 hover:bg-accent/30 transition-colors">
      <div className="flex items-start gap-3">
        <div className="mt-0.5" style={{ color: cfg.color }}>
          <Icon className="h-5 w-5" />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="font-medium text-sm">{goal.title}</span>
            <span
              className="text-[10px] px-1.5 py-0.5 rounded font-medium"
              style={{ background: `${cfg.color}20`, color: cfg.color }}
            >
              {cfg.label}
            </span>
            {examName && <Badge variant="outline" className="text-[10px]">📎 {examName}</Badge>}
          </div>
          {goal.description && (
            <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{goal.description}</p>
          )}
          <p className="text-[10px] text-muted-foreground mt-1">
            创建于 {formatDateCN(goal.createdAt)}
            {goal.updatedAt !== goal.createdAt && ` · 更新于 ${formatDateCN(goal.updatedAt)}`}
          </p>
        </div>
        <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => onDelete(goal)}>
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* 状态切换 */}
      <div className="flex gap-1 pl-8 pt-1 flex-wrap">
        {ALL_GOAL_STATUSES.map(s => {
          const sc = GOAL_STATUS_CONFIG[s]
          const isActive = goal.status === s
          return (
            <button
              key={s}
              onClick={() => onStatusChange(goal, s)}
              className={cn(
                'text-[10px] px-2 py-0.5 rounded border transition-colors',
                isActive
                  ? 'text-white border-transparent'
                  : 'text-muted-foreground border-border hover:bg-accent'
              )}
              style={isActive ? { background: sc.color } : {}}
            >
              {sc.label}
            </button>
          )
        })}
      </div>
    </div>
  )
}
