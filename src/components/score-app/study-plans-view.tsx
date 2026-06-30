'use client'

import { useState, useMemo } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { BookOpen, Plus, Trash2, Pencil, Search, BarChart3 } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchStudyPlans, createStudyPlan, deleteStudyPlan, updateStudyPlan, fetchGroups, StudyPlan,
} from './types'
import { useConfirm } from './confirm-dialog'
import { toast } from 'sonner'
import { formatDateCN } from './types'

export function StudyPlansView() {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const { data: plans = [], isLoading } = useQuery({ queryKey: ['study-plans'], queryFn: fetchStudyPlans })
  const { data: groups = [] } = useQuery({ queryKey: ['groups'], queryFn: fetchGroups })

  // 完成度查看
  const [completionTarget, setCompletionTarget] = useState<StudyPlan | null>(null)
  const { data: completionData, isLoading: completionLoading } = useQuery({
    queryKey: ['study-plan-completion', completionTarget?.id],
    queryFn: async () => {
      const res = await fetch(`/api/study-plans/${completionTarget!.id}/complete`)
      const j = await res.json()
      if (!j.success) throw new Error(j.error)
      return j.data as {
        planTitle: string
        groupName: string
        total: number
        completed: number
        completionRate: number
        members: Array<{
          userId: string
          studentNo: string
          displayName: string
          completed: boolean
          completedAt: string | null
          note: string | null
        }>
      }
    },
    enabled: !!completionTarget,
  })

  const [showCreate, setShowCreate] = useState(false)
  const [editingPlan, setEditingPlan] = useState<StudyPlan | null>(null)
  const [formGroupId, setFormGroupId] = useState('')
  const [formTitle, setFormTitle] = useState('')
  const [formContent, setFormContent] = useState('')
  const [formDueDate, setFormDueDate] = useState('')
  const [saving, setSaving] = useState(false)

  // 筛选
  const [searchTitle, setSearchTitle] = useState('')
  const [filterGroup, setFilterGroup] = useState<string>('all')
  const [filterCreator, setFilterCreator] = useState<string>('all')

  // 列表筛选
  const filtered = useMemo(() => {
    let r = plans
    if (searchTitle.trim()) {
      const q = searchTitle.trim().toLowerCase()
      r = r.filter(p =>
        p.title.toLowerCase().includes(q) ||
        (p.content?.toLowerCase().includes(q) ?? false)
      )
    }
    if (filterGroup !== 'all') {
      r = r.filter(p => p.groupId === filterGroup)
    }
    if (filterCreator !== 'all') {
      r = r.filter(p => p.createdBy === filterCreator)
    }
    return r
  }, [plans, searchTitle, filterGroup, filterCreator])

  // 提取创建者列表（去重）
  const creators = useMemo(() => {
    const map = new Map<string, string>()
    plans.forEach(p => map.set(p.createdBy, p.creatorName))
    return Array.from(map.entries()).map(([id, name]) => ({ id, name }))
  }, [plans])

  const openCreate = () => {
    setEditingPlan(null)
    setFormGroupId('')
    setFormTitle('')
    setFormContent('')
    setFormDueDate('')
    setShowCreate(true)
  }

  const openEdit = (p: StudyPlan) => {
    setEditingPlan(p)
    setFormGroupId(p.groupId)
    setFormTitle(p.title)
    setFormContent(p.content || '')
    setFormDueDate(p.dueDate ? p.dueDate.slice(0, 10) : '')
    setShowCreate(true)
  }

  const handleSave = async () => {
    if (!formTitle.trim()) {
      toast.error('请填写标题')
      return
    }
    if (!editingPlan && !formGroupId) {
      toast.error('请选择小组')
      return
    }
    setSaving(true)
    try {
      if (editingPlan) {
        await updateStudyPlan(editingPlan.id, {
          title: formTitle.trim(),
          content: formContent.trim() || undefined,
          dueDate: formDueDate || undefined,
        })
        toast.success('已更新')
      } else {
        await createStudyPlan({
          groupId: formGroupId,
          title: formTitle.trim(),
          content: formContent.trim() || undefined,
          dueDate: formDueDate || undefined,
        })
        toast.success('已发布')
      }
      setShowCreate(false)
      queryClient.invalidateQueries({ queryKey: ['study-plans'] })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id: string, title: string) => {
    const ok = await confirm({
      title: '确认删除',
      description: `将删除学习计划「${title}」`,
      variant: 'destructive',
      confirmText: '删除',
    })
    if (!ok) return
    try {
      await deleteStudyPlan(id)
      toast.success('已删除')
      queryClient.invalidateQueries({ queryKey: ['study-plans'] })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><BookOpen className="h-6 w-6" /> 学习计划</h2>
          <p className="text-sm text-muted-foreground">发布给小组成员的学习计划</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> 新建计划
        </Button>
      </div>

      {/* 筛选 */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-col md:flex-row gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索标题或内容"
                value={searchTitle}
                onChange={e => setSearchTitle(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={filterGroup} onValueChange={setFilterGroup}>
              <SelectTrigger className="w-full md:w-40"><SelectValue placeholder="按小组筛选" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有小组</SelectItem>
                {groups.map(g => (
                  <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={filterCreator} onValueChange={setFilterCreator}>
              <SelectTrigger className="w-full md:w-40"><SelectValue placeholder="按发布者筛选" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有发布者</SelectItem>
                {creators.map(c => (
                  <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">加载中...</div>
      ) : filtered.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <BookOpen className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">
              {plans.length === 0 ? '还没有学习计划' : '没有符合条件的计划'}
            </p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {filtered.map(p => (
            <Card key={p.id}>
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between gap-2">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-base">{p.title}</h3>
                      <Badge variant="outline" className="text-xs">{p.groupName}</Badge>
                      <Badge variant="secondary" className="text-xs">发布者：{p.creatorName}</Badge>
                      {p.dueDate && (
                        <Badge variant="secondary" className="text-xs">截止 {formatDateCN(p.dueDate)}</Badge>
                      )}
                    </div>
                    {p.content && (
                      <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap">{p.content}</p>
                    )}
                    <p className="text-xs text-muted-foreground mt-2">
                      {formatDateCN(p.createdAt)}
                    </p>
                  </div>
                  <div className="flex gap-1">
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="完成度" onClick={() => setCompletionTarget(p)}>
                      <BarChart3 className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7" title="编辑" onClick={() => openEdit(p)}>
                      <Pencil className="h-3.5 w-3.5" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="删除" onClick={() => handleDelete(p.id, p.title)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingPlan ? '编辑学习计划' : '新建学习计划'}</DialogTitle>
            <DialogDescription>{editingPlan ? '修改计划内容' : '发布给小组成员'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>发布到小组 {!editingPlan && '*'}</Label>
              <Select value={formGroupId} onValueChange={setFormGroupId} disabled={!!editingPlan}>
                <SelectTrigger><SelectValue placeholder="选择小组" /></SelectTrigger>
                <SelectContent>
                  {groups.map(g => (
                    <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1.5">
              <Label>标题 *</Label>
              <Input value={formTitle} onChange={e => setFormTitle(e.target.value)} placeholder="如：本月重点 - 数学函数与导数" />
            </div>
            <div className="space-y-1.5">
              <Label>详细内容</Label>
              <Textarea value={formContent} onChange={e => setFormContent(e.target.value)} placeholder="学习目标、参考资料、作业等" rows={4} />
            </div>
            <div className="space-y-1.5">
              <Label>截止日期（可选）</Label>
              <Input type="date" value={formDueDate} onChange={e => setFormDueDate(e.target.value)} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
            <Button onClick={handleSave} disabled={saving}>{saving ? '保存中...' : '保存'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 完成度查看对话框 */}
      <Dialog open={!!completionTarget} onOpenChange={(open) => !open && setCompletionTarget(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>完成度追踪 - {completionTarget?.title}</DialogTitle>
            <DialogDescription>
              小组：{completionData?.groupName} ｜ 完成率：{completionData?.completionRate ?? 0}%
              （{completionData?.completed ?? 0}/{completionData?.total ?? 0}）
            </DialogDescription>
          </DialogHeader>
          {completionLoading ? (
            <div className="text-center py-6 text-sm text-muted-foreground">加载中...</div>
          ) : completionData && completionData.members.length > 0 ? (
            <>
              {/* 进度条 */}
              <div className="space-y-2">
                <div className="w-full h-3 bg-muted rounded-full overflow-hidden">
                  <div
                    className="h-full bg-emerald-500 rounded-full transition-all"
                    style={{ width: `${completionData.completionRate}%` }}
                  />
                </div>
              </div>
              {/* 成员列表 */}
              <div className="space-y-1 max-h-80 overflow-y-auto">
                {completionData.members.map(m => (
                  <div key={m.userId} className="flex items-center gap-2 p-2 rounded-md border border-border">
                    <Badge variant="outline" className="font-mono text-xs">{m.studentNo}</Badge>
                    <div className="flex-1">
                      <div className="text-sm font-medium">{m.displayName}</div>
                      {m.note && <div className="text-xs text-muted-foreground">{m.note}</div>}
                    </div>
                    {m.completed ? (
                      <div className="text-right">
                        <Badge className="bg-emerald-500 text-xs">✓ 已完成</Badge>
                        <div className="text-[10px] text-muted-foreground mt-0.5">
                          {m.completedAt ? formatDateCN(m.completedAt) : ''}
                        </div>
                      </div>
                    ) : (
                      <Badge variant="outline" className="text-xs text-muted-foreground">未完成</Badge>
                    )}
                  </div>
                ))}
              </div>
            </>
          ) : (
            <div className="text-center py-6 text-sm text-muted-foreground">小组没有成员</div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  )
}
