'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Calendar as CalendarIcon, Plus, Trash2, CheckCircle2, Circle, ChevronLeft, ChevronRight, BookOpen } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchPersonalPlans, createPersonalPlan, updatePersonalPlan, deletePersonalPlan,
  fetchStudyPlans, PersonalPlan,
} from './types'
import { toast } from 'sonner'
import { formatDateCN } from './types'
import { cn } from '@/lib/utils'
import { useConfirm } from './confirm-dialog'

export function CalendarView() {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const { data: plans = [] } = useQuery({ queryKey: ['personal-plans'], queryFn: fetchPersonalPlans })
  const { data: groupPlans = [] } = useQuery({ queryKey: ['study-plans'], queryFn: fetchStudyPlans })

  const [currentMonth, setCurrentMonth] = useState(() => {
    const d = new Date()
    return new Date(d.getFullYear(), d.getMonth(), 1)
  })

  const [showCreate, setShowCreate] = useState(false)
  const [createDate, setCreateDate] = useState<string>('')
  const [newTitle, setNewTitle] = useState('')
  const [newContent, setNewContent] = useState('')
  const [creating, setCreating] = useState(false)

  // 月份导航
  const prevMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() - 1, 1))
  const nextMonth = () => setCurrentMonth(new Date(currentMonth.getFullYear(), currentMonth.getMonth() + 1, 1))
  const today = new Date()
  const isCurrentMonth = currentMonth.getFullYear() === today.getFullYear() && currentMonth.getMonth() === today.getMonth()

  // 日历数据
  const calendarDays = useMemo(() => {
    const year = currentMonth.getFullYear()
    const month = currentMonth.getMonth()
    const firstDay = new Date(year, month, 1)
    const lastDay = new Date(year, month + 1, 0)
    const startWeekday = firstDay.getDay() // 0=周日
    const daysInMonth = lastDay.getDate()

    const days: Array<{ date: Date | null; iso: string | null }> = []
    // 前面的空白
    for (let i = 0; i < startWeekday; i++) days.push({ date: null, iso: null })
    for (let d = 1; d <= daysInMonth; d++) {
      const date = new Date(year, month, d)
      days.push({ date, iso: date.toISOString().slice(0, 10) })
    }
    // 补齐到 42 格（6 周）
    while (days.length < 42) days.push({ date: null, iso: null })
    return days
  }, [currentMonth])

  // 按日期索引计划
  const plansByDate = useMemo(() => {
    const map: Record<string, { personal: PersonalPlan[]; group: typeof groupPlans }> = {}
    plans.forEach(p => {
      if (p.dueDate) {
        const d = p.dueDate.slice(0, 10)
        if (!map[d]) map[d] = { personal: [], group: [] }
        map[d].personal.push(p)
      }
    })
    groupPlans.forEach(p => {
      if (p.dueDate) {
        const d = p.dueDate.slice(0, 10)
        if (!map[d]) map[d] = { personal: [], group: [] }
        map[d].group.push(p)
      }
    })
    return map
  }, [plans, groupPlans])

  const handleCreate = async () => {
    if (!createDate) {
      toast.error('请选择日期')
      return
    }
    if (!newTitle.trim()) {
      toast.error('请填写标题')
      return
    }
    setCreating(true)
    try {
      await createPersonalPlan({
        title: newTitle.trim(),
        content: newContent.trim() || undefined,
        dueDate: createDate,
      })
      toast.success('已创建')
      setNewTitle(''); setNewContent('')
      setShowCreate(false)
      queryClient.invalidateQueries({ queryKey: ['personal-plans'] })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  const toggleStatus = async (p: PersonalPlan) => {
    try {
      await updatePersonalPlan(p.id, { status: p.status === 'done' ? 'pending' : 'done' })
      queryClient.invalidateQueries({ queryKey: ['personal-plans'] })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const handleDelete = async (p: PersonalPlan) => {
    const ok = await confirm({
      title: '确认删除',
      description: `删除个人计划「${p.title}」？`,
      variant: 'destructive',
      confirmText: '删除',
    })
    if (!ok) return
    try {
      await deletePersonalPlan(p.id)
      queryClient.invalidateQueries({ queryKey: ['personal-plans'] })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="max-w-6xl mx-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><CalendarIcon className="h-6 w-6" /> 学习日历</h2>
          <p className="text-sm text-muted-foreground">个人计划 + 小组计划</p>
        </div>
        <Button onClick={() => { setCreateDate(new Date().toISOString().slice(0, 10)); setShowCreate(true) }}>
          <Plus className="h-4 w-4 mr-1" /> 新建个人计划
        </Button>
      </div>

      {/* 日历视图 */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle>
              {currentMonth.getFullYear()}年 {currentMonth.getMonth() + 1}月
            </CardTitle>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" onClick={prevMonth}><ChevronLeft className="h-4 w-4" /></Button>
              {!isCurrentMonth && (
                <Button variant="outline" size="sm" onClick={() => setCurrentMonth(new Date(today.getFullYear(), today.getMonth(), 1))}>
                  今天
                </Button>
              )}
              <Button variant="outline" size="sm" onClick={nextMonth}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-7 gap-1 text-center text-xs font-medium text-muted-foreground mb-2">
            <div>日</div><div>一</div><div>二</div><div>三</div><div>四</div><div>五</div><div>六</div>
          </div>
          <div className="grid grid-cols-7 gap-1">
            {calendarDays.map((d, i) => {
              if (!d.date) return <div key={i} className="aspect-square min-h-[60px] md:min-h-[100px] rounded-md bg-muted/20" />
              const dayPlans = plansByDate[d.iso!] || { personal: [], group: [] }
              const totalPlans = dayPlans.personal.length + dayPlans.group.length
              const isToday = d.iso === today.toISOString().slice(0, 10)
              return (
                <div
                  key={i}
                  className={cn(
                    'aspect-square min-h-[60px] md:min-h-[100px] rounded-md border p-1 flex flex-col gap-0.5 cursor-pointer hover:border-primary/50 transition-colors',
                    isToday ? 'border-primary bg-primary/5' : 'border-border',
                    totalPlans > 0 && !isToday && 'bg-muted/30'
                  )}
                  onClick={() => { setCreateDate(d.iso!); setShowCreate(true) }}
                >
                  <div className="text-xs text-right text-muted-foreground">{d.date.getDate()}</div>
                  <div className="flex-1 space-y-0.5 overflow-hidden">
                    {dayPlans.group.slice(0, 2).map(p => (
                      <div key={p.id} className="text-[10px] px-1 py-0.5 rounded bg-blue-500/20 text-blue-600 dark:text-blue-300 truncate" title={p.title}>
                        📌 {p.title}
                      </div>
                    ))}
                    {dayPlans.personal.slice(0, 2).map(p => (
                      <div
                        key={p.id}
                        className={cn(
                          'text-[10px] px-1 py-0.5 rounded truncate',
                          p.status === 'done' ? 'bg-emerald-500/20 text-emerald-600 dark:text-emerald-300 line-through' : 'bg-amber-500/20 text-amber-600 dark:text-amber-300'
                        )}
                        title={p.title}
                        onClick={(e) => { e.stopPropagation(); toggleStatus(p) }}
                      >
                        {p.status === 'done' ? '✓' : '○'} {p.title}
                      </div>
                    ))}
                    {totalPlans > 4 && (
                      <div className="text-[10px] text-muted-foreground">+{totalPlans - 4}</div>
                    )}
                  </div>
                </div>
              )
            })}
          </div>
        </CardContent>
      </Card>

      {/* 待办列表 */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">个人计划</CardTitle>
            <CardDescription>{plans.filter(p => p.status === 'pending').length} 个待办 · {plans.filter(p => p.status === 'done').length} 个已完成</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {plans.length === 0 ? (
                <div className="text-center py-6 text-sm text-muted-foreground">还没有个人计划</div>
              ) : (
                plans.map(p => (
                  <div key={p.id} className="flex items-start gap-2 p-2 rounded-md border border-border">
                    <button onClick={() => toggleStatus(p)} className="mt-0.5">
                      {p.status === 'done'
                        ? <CheckCircle2 className="h-4 w-4 text-emerald-500" />
                        : <Circle className="h-4 w-4 text-muted-foreground" />}
                    </button>
                    <div className="flex-1 min-w-0">
                      <div className={cn('text-sm font-medium', p.status === 'done' && 'line-through text-muted-foreground')}>{p.title}</div>
                      {p.content && <div className="text-xs text-muted-foreground mt-0.5 whitespace-pre-wrap">{p.content}</div>}
                      {p.dueDate && <div className="text-[10px] text-muted-foreground mt-1">截止 {formatDateCN(p.dueDate)}</div>}
                    </div>
                    <Button variant="ghost" size="icon" className="h-6 w-6 text-destructive" onClick={() => handleDelete(p)}>
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2"><BookOpen className="h-4 w-4" /> 小组计划</CardTitle>
            <CardDescription>来自管理员发布</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-96 overflow-y-auto">
              {groupPlans.length === 0 ? (
                <div className="text-center py-6 text-sm text-muted-foreground">还没有小组计划</div>
              ) : (
                groupPlans.map(p => (
                  <div key={p.id} className="p-2 rounded-md border border-border">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-sm font-medium">{p.title}</span>
                      <Badge variant="outline" className="text-[10px]">{p.groupName}</Badge>
                      {p.dueDate && <Badge variant="secondary" className="text-[10px]">{formatDateCN(p.dueDate)}</Badge>}
                      <PlanCompleteButton planId={p.id} />
                    </div>
                    {p.content && <p className="text-xs text-muted-foreground mt-1 whitespace-pre-wrap">{p.content}</p>}
                    <p className="text-[10px] text-muted-foreground mt-1">{p.creatorName} · {formatDateCN(p.createdAt)}</p>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 新建个人计划 */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建个人计划 · {createDate}</DialogTitle>
            <DialogDescription>点击日期格也可快速创建</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>截止日期 *</Label>
              <Input type="date" value={createDate} onChange={e => setCreateDate(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>标题 *</Label>
              <Input value={newTitle} onChange={e => setNewTitle(e.target.value)} placeholder="如：完成数学压轴题 5 道" />
            </div>
            <div className="space-y-1.5">
              <Label>详细内容</Label>
              <Textarea value={newContent} onChange={e => setNewContent(e.target.value)} rows={3} placeholder="可选" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
            <Button onClick={handleCreate} disabled={creating}>{creating ? '创建中...' : '创建'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}

// 学习计划完成按钮（学生用）
function PlanCompleteButton({ planId }: { planId: string }) {
  const { data, isLoading, refetch } = useQuery({
    queryKey: ['plan-completion', planId],
    queryFn: async () => {
      const res = await fetch(`/api/study-plans/${planId}/complete`)
      const j = await res.json()
      if (!j.success) return null
      return j.data as { myCompleted: boolean }
    },
  })
  const [pending, setPending] = useState(false)

  const toggle = async () => {
    setPending(true)
    try {
      const action = data?.myCompleted ? 'uncomplete' : 'complete'
      await fetch(`/api/study-plans/${planId}/complete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      })
      refetch()
      toast.success(action === 'complete' ? '已标记完成' : '已取消完成')
    } catch {
      toast.error('操作失败')
    } finally {
      setPending(false)
    }
  }

  if (isLoading) return null
  return (
    <Button
      size="sm"
      variant={data?.myCompleted ? 'default' : 'outline'}
      className="h-5 text-[10px] py-0"
      disabled={pending}
      onClick={(e) => { e.stopPropagation(); toggle() }}
    >
      {data?.myCompleted ? '✓ 已完成' : '标记完成'}
    </Button>
  )
}
