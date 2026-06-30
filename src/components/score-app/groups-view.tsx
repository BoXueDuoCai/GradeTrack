'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { Plus, Trash2, UserPlus, Users2, Eye, EyeOff, X, BarChart3, BookOpen } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchGroups, fetchGroup, createGroup, deleteGroup,
  addGroupMember, removeGroupMember, addGroupViewer, removeGroupViewer,
  GroupInfo,
} from './types'
import { toast } from 'sonner'
import { formatDateCN } from './types'
import type { View } from './score-app'
import { useConfirm } from './confirm-dialog'

interface GroupsViewProps {
  onNavigate: (v: View, groupId?: string) => void
}

export function GroupsView({ onNavigate }: GroupsViewProps) {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const { data: groups = [], isLoading } = useQuery({ queryKey: ['groups'], queryFn: fetchGroups })

  const [showCreate, setShowCreate] = useState(false)
  const [newName, setNewName] = useState('')
  const [creating, setCreating] = useState(false)

  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)

  const handleCreate = async () => {
    if (!newName.trim()) {
      toast.error('请填写小组名称')
      return
    }
    setCreating(true)
    try {
      await createGroup(newName.trim())
      toast.success('小组已创建')
      setNewName('')
      setShowCreate(false)
      queryClient.invalidateQueries({ queryKey: ['groups'] })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (g: GroupInfo) => {
    const ok = await confirm({
      title: '确认删除小组',
      description: `将删除小组「${g.name}」及所有成员关系（用户本身不受影响）`,
      variant: 'destructive',
      confirmText: '删除',
    })
    if (!ok) return
    try {
      await deleteGroup(g.id)
      toast.success('已删除')
      queryClient.invalidateQueries({ queryKey: ['groups'] })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (selectedGroupId) {
    return <GroupDetail groupId={selectedGroupId} onBack={() => setSelectedGroupId(null)} onNavigate={onNavigate} />
  }

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2"><Users2 className="h-6 w-6" /> 小组管理</h2>
          <p className="text-sm text-muted-foreground">创建者管理；其他管理员需被授权才能查看</p>
        </div>
        <Button onClick={() => setShowCreate(true)}>
          <Plus className="h-4 w-4 mr-1" /> 新建小组
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">加载中...</div>
      ) : groups.length === 0 ? (
        <Card>
          <CardContent className="text-center py-12">
            <Users2 className="h-12 w-12 mx-auto text-muted-foreground mb-3" />
            <p className="text-muted-foreground">还没有小组，点击右上角创建</p>
          </CardContent>
        </Card>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {groups.map(g => (
            <Card key={g.id} className="cursor-pointer hover:border-primary/50 transition-colors">
              <CardContent className="p-4 space-y-2">
                <div className="flex items-start justify-between">
                  <div onClick={() => setSelectedGroupId(g.id)} className="flex-1">
                    <div className="flex items-center gap-2 flex-wrap">
                      <h3 className="font-bold text-base">{g.name}</h3>
                      {g.isCreator && <Badge variant="secondary" className="text-xs">我创建的</Badge>}
                      {g.isViewer && <Badge variant="outline" className="text-xs">被授权</Badge>}
                      {g.isSuperAdmin && !g.isCreator && <Badge className="bg-amber-500 text-xs">超管视角</Badge>}
                    </div>
                    <p className="text-xs text-muted-foreground mt-1">
                      创建者：{g.creatorName} · {formatDateCN(g.createdAt)}
                    </p>
                    <div className="flex gap-3 mt-2 text-xs">
                      <span className="text-muted-foreground">成员 <span className="text-foreground font-semibold">{g.memberCount}</span></span>
                      <span className="text-muted-foreground">查看者 <span className="text-foreground font-semibold">{g.viewerCount}</span></span>
                      <span className="text-muted-foreground">计划 <span className="text-foreground font-semibold">{g.studyPlanCount}</span></span>
                    </div>
                  </div>
                  <div className="flex flex-col gap-1">
                    {(g.isCreator || g.isSuperAdmin) && (
                      <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => handleDelete(g)}>
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    )}
                  </div>
                </div>
                <div className="flex gap-2 pt-2 border-t border-border">
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => onNavigate('group-analysis', g.id)}>
                    <BarChart3 className="h-3.5 w-3.5 mr-1" /> 成绩分析
                  </Button>
                  <Button size="sm" variant="outline" className="flex-1" onClick={() => onNavigate('study-plans', g.id)}>
                    <BookOpen className="h-3.5 w-3.5 mr-1" /> 学习计划
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建小组</DialogTitle>
            <DialogDescription>你将作为创建者管理这个小组</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>小组名称 *</Label>
              <Input value={newName} onChange={e => setNewName(e.target.value)} placeholder="如：3班1组" />
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

// 小组详情
function GroupDetail({ groupId, onBack, onNavigate }: { groupId: string; onBack: () => void; onNavigate: (v: View, groupId?: string) => void }) {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const { data, isLoading } = useQuery({
    queryKey: ['group', groupId],
    queryFn: () => fetchGroup(groupId),
  })

  const [memberUsername, setMemberUsername] = useState('')
  const [memberStudentNo, setMemberStudentNo] = useState('')
  const [memberDisplayName, setMemberDisplayName] = useState('')
  const [autoCreate, setAutoCreate] = useState(false)
  const [viewerUsername, setViewerUsername] = useState('')
  const [adding, setAdding] = useState(false)

  const handleAddMember = async () => {
    if (!memberUsername.trim()) {
      toast.error('请输入用户名')
      return
    }
    setAdding(true)
    try {
      await addGroupMember(groupId, memberUsername.trim(), memberStudentNo.trim() || memberUsername.trim(), memberDisplayName.trim() || undefined)
      toast.success('已添加')
      setMemberUsername(''); setMemberStudentNo(''); setMemberDisplayName('')
      queryClient.invalidateQueries({ queryKey: ['group', groupId] })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setAdding(false)
    }
  }

  const handleAddViewer = async () => {
    if (!viewerUsername.trim()) {
      toast.error('请输入用户名')
      return
    }
    try {
      await addGroupViewer(groupId, viewerUsername.trim())
      toast.success('已授权')
      setViewerUsername('')
      queryClient.invalidateQueries({ queryKey: ['group', groupId] })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  if (isLoading || !data) return <div className="p-6 text-center text-muted-foreground">加载中...</div>

  const { group, members, viewers } = data
  const canManage = group.isCreator || group.isSuperAdmin

  return (
    <div className="max-w-4xl mx-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <Button variant="ghost" size="sm" onClick={onBack} className="mb-1">← 返回</Button>
          <h2 className="text-2xl font-bold">{group.name}</h2>
          <p className="text-sm text-muted-foreground">创建者：{group.creatorName}</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => onNavigate('group-analysis', groupId)}>
            <BarChart3 className="h-4 w-4 mr-1" /> 成绩分析
          </Button>
          <Button variant="outline" size="sm" onClick={() => onNavigate('study-plans', groupId)}>
            <BookOpen className="h-4 w-4 mr-1" /> 学习计划
          </Button>
        </div>
      </div>

      {/* 成员列表 */}
      <Card>
        <CardHeader>
          <CardTitle>成员（{members.length}）</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {canManage && (
            <div className="p-3 rounded-md border border-border bg-muted/30 space-y-2">
              <div className="text-xs text-muted-foreground">添加成员（输入用户名，可勾选自动创建）</div>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                <Input value={memberStudentNo} onChange={e => setMemberStudentNo(e.target.value)} placeholder="学号" />
                <Input value={memberUsername} onChange={e => setMemberUsername(e.target.value)} placeholder="用户名 *" />
                <Input value={memberDisplayName} onChange={e => setMemberDisplayName(e.target.value)} placeholder="显示名（可选）" />
                <Button onClick={handleAddMember} disabled={adding}>
                  <UserPlus className="h-4 w-4 mr-1" /> {adding ? '添加中' : '添加'}
                </Button>
              </div>
              <label className="flex items-center gap-2 text-xs">
                <input type="checkbox" checked={autoCreate} onChange={e => setAutoCreate(e.target.checked)} />
                <span>用户不存在时自动创建（默认密码 123456，需首次登录改）</span>
              </label>
            </div>
          )}
          <div className="space-y-1">
            {members.length === 0 ? (
              <div className="text-center py-6 text-sm text-muted-foreground">还没有成员</div>
            ) : (
              members.map(m => (
                <div key={m.id} className="flex items-center justify-between p-2 rounded-md hover:bg-accent/30 border border-border">
                  <div className="flex items-center gap-3">
                    <Badge variant="outline" className="font-mono">{m.studentNo}</Badge>
                    <div>
                      <div className="text-sm font-medium">{m.displayName || m.username}</div>
                      <div className="text-xs text-muted-foreground">@{m.username} · {m.examCount} 场考试</div>
                    </div>
                  </div>
                  {canManage && (
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={async () => {
                      const ok = await confirm({
                        title: '确认移除',
                        description: `从小组移除「${m.username}」？`,
                        variant: 'destructive',
                        confirmText: '移除',
                      })
                      if (!ok) return
                      await removeGroupMember(groupId, m.userId)
                      toast.success('已移除')
                      queryClient.invalidateQueries({ queryKey: ['group', groupId] })
                    }}>
                      <X className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* 查看者列表（仅创建者/超管可见） */}
      {canManage && (
        <Card>
          <CardHeader>
            <CardTitle>授权查看者（{viewers.length}）</CardTitle>
            <CardDescription>授权其他管理员查看此小组（输入对方用户名）</CardDescription>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Input value={viewerUsername} onChange={e => setViewerUsername(e.target.value)} placeholder="输入管理员用户名" />
              <Button onClick={handleAddViewer}><Eye className="h-4 w-4 mr-1" /> 授权</Button>
            </div>
            <div className="space-y-1">
              {viewers.length === 0 ? (
                <div className="text-center py-4 text-sm text-muted-foreground">还没有授权其他管理员</div>
              ) : (
                viewers.map(v => (
                  <div key={v.id} className="flex items-center justify-between p-2 rounded-md hover:bg-accent/30 border border-border">
                    <div className="text-sm">
                      <span className="font-medium">{v.displayName || v.username}</span>
                      <span className="text-xs text-muted-foreground ml-2">@{v.username}</span>
                    </div>
                    <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={async () => {
                      await removeGroupViewer(groupId, v.userId)
                      toast.success('已撤销')
                      queryClient.invalidateQueries({ queryKey: ['group', groupId] })
                    }}>
                      <EyeOff className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  )
}
