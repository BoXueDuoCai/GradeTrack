'use client'

import { useState } from 'react'
import { Card, CardContent } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Badge } from '@/components/ui/badge'
import { Checkbox } from '@/components/ui/checkbox'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { Megaphone, Plus, Trash2, Pencil, BarChart3, Users, Users2 } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { fetchGroups, fetchUsers, AdminUser } from './types'
import { useConfirm } from './confirm-dialog'
import { toast } from 'sonner'
import { formatDateCN } from './types'
import { cn } from '@/lib/utils'

interface AnnouncementTarget { id: string; targetType: string; targetId: string; targetName: string | null }
interface Announcement {
  id: string; title: string; content: string; scope: string; authorId: string | null; authorName: string
  targets: AnnouncementTarget[]; readCount: number; createdAt: string; updatedAt: string; isRead: boolean
}

export function AnnouncementsView({ isSuperAdmin }: { isSuperAdmin: boolean }) {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const { data: groups = [] } = useQuery({ queryKey: ['groups'], queryFn: fetchGroups })
  const { data: users = [] } = useQuery({ queryKey: ['users'], queryFn: fetchUsers })
  const { data: announcements = [], isLoading } = useQuery({
    queryKey: ['announcements'],
    queryFn: async () => { const res = await fetch('/api/announcements'); const j = await res.json(); if (!j.success) throw new Error(j.error); return j.data as Announcement[] },
  })

  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<Announcement | null>(null)
  const [title, setTitle] = useState('')
  const [content, setContent] = useState('')
  const [scope, setScope] = useState<'all' | 'groups' | 'users'>('all')
  const [selectedGroupIds, setSelectedGroupIds] = useState<string[]>([])
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])
  const [statsTarget, setStatsTarget] = useState<Announcement | null>(null)
  const [saving, setSaving] = useState(false)

  const openCreate = () => { setEditing(null); setTitle(''); setContent(''); setScope(isSuperAdmin ? 'all' : 'groups'); setSelectedGroupIds([]); setSelectedUserIds([]); setShowCreate(true) }
  const openEdit = (a: Announcement) => {
    if (a.authorName === 'system' && !isSuperAdmin) { toast.error('不能编辑 system 公告'); return }
    setEditing(a); setTitle(a.title); setContent(a.content); setScope(a.scope as 'all' | 'groups' | 'users')
    setSelectedGroupIds(a.targets.filter(t => t.targetType === 'group').map(t => t.targetId))
    setSelectedUserIds(a.targets.filter(t => t.targetType === 'user').map(t => t.targetId))
    setShowCreate(true)
  }
  const toggleGroup = (gid: string) => setSelectedGroupIds(prev => prev.includes(gid) ? prev.filter(x => x !== gid) : [...prev, gid])
  const toggleUser = (uid: string) => setSelectedUserIds(prev => prev.includes(uid) ? prev.filter(x => x !== uid) : [...prev, uid])
  const importGroupMembers = async (gid: string) => {
    try { const res = await fetch(`/api/groups/${gid}`); const j = await res.json(); if (!j.success) throw new Error(j.error)
      const memberIds = j.data.members.map((m: { userId: string }) => m.userId)
      setSelectedUserIds(prev => Array.from(new Set([...prev, ...memberIds]))); toast.success(`已导入 ${memberIds.length} 个成员`)
    } catch (e) { toast.error((e as Error).message) }
  }

  const handleSave = async () => {
    if (!title.trim() || !content.trim()) { toast.error('标题和内容必填'); return }
    if (scope !== 'all') {
      const targets = scope === 'groups'
        ? selectedGroupIds.map(gid => ({ targetType: 'group' as const, targetId: gid, targetName: groups.find(g => g.id === gid)?.name }))
        : selectedUserIds.map(uid => ({ targetType: 'user' as const, targetId: uid, targetName: users.find(u => u.id === uid)?.displayName || users.find(u => u.id === uid)?.username }))
      if (targets.length === 0) { toast.error('请至少选择一个目标'); return }
      setSaving(true)
      try {
        if (editing) { const res = await fetch(`/api/announcements/${editing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, content, scope, targets }) }); const j = await res.json(); if (!j.success) throw new Error(j.error); toast.success('已更新') }
        else { const res = await fetch('/api/announcements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, content, scope, targets }) }); const j = await res.json(); if (!j.success) throw new Error(j.error); toast.success('已发布') }
        setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['announcements'] }); queryClient.invalidateQueries({ queryKey: ['notifications'] })
      } catch (e) { toast.error((e as Error).message) } finally { setSaving(false) }
      return
    }
    setSaving(true)
    try {
      if (editing) { const res = await fetch(`/api/announcements/${editing.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, content, scope }) }); const j = await res.json(); if (!j.success) throw new Error(j.error); toast.success('已更新') }
      else { const res = await fetch('/api/announcements', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ title, content, scope }) }); const j = await res.json(); if (!j.success) throw new Error(j.error); toast.success('已发布') }
      setShowCreate(false); queryClient.invalidateQueries({ queryKey: ['announcements'] }); queryClient.invalidateQueries({ queryKey: ['notifications'] })
    } catch (e) { toast.error((e as Error).message) } finally { setSaving(false) }
  }

  const handleDelete = async (a: Announcement) => {
    if (a.authorName === 'system' && !isSuperAdmin) { toast.error('不能删除 system 公告'); return }
    const ok = await confirm({ title: '确认删除公告', description: `将删除公告「${a.title}」`, variant: 'destructive', confirmText: '删除' })
    if (!ok) return
    try { const res = await fetch(`/api/announcements/${a.id}`, { method: 'DELETE' }); const j = await res.json(); if (!j.success) throw new Error(j.error); toast.success('已删除'); queryClient.invalidateQueries({ queryKey: ['announcements'] }); queryClient.invalidateQueries({ queryKey: ['notifications'] }) } catch (e) { toast.error((e as Error).message) }
  }

  const availableScopes: ('all' | 'groups' | 'users')[] = isSuperAdmin ? ['all', 'groups', 'users'] : ['groups', 'users']
  const availableGroups = groups
  const availableUsers = isSuperAdmin ? users : users.filter((u: AdminUser) => u.role !== 'super_admin' && u.role !== 'test_user')

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between">
        <div><h2 className="text-2xl font-bold flex items-center gap-2"><Megaphone className="h-6 w-6" /> 公告管理</h2><p className="text-sm text-muted-foreground">{isSuperAdmin ? '可发布全体/小组/个人公告（system 名义）' : '可发布小组/个人公告'}</p></div>
        <Button onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> 发布公告</Button>
      </div>
      {isLoading ? <div className="text-center py-8 text-muted-foreground">加载中...</div> : announcements.length === 0 ? (
        <Card><CardContent className="text-center py-12"><Megaphone className="h-12 w-12 mx-auto text-muted-foreground mb-3" /><p className="text-muted-foreground">还没有公告</p></CardContent></Card>
      ) : (
        <div className="space-y-3">
          {announcements.map(a => {
            const isSystem = a.authorName === 'system'
            const canEdit = !isSystem || isSuperAdmin
            return (
              <Card key={a.id}>
                <CardContent className="p-4 space-y-2">
                  <div className="flex items-start justify-between gap-2">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <h3 className="font-bold text-base">{a.title}</h3>
                        <Badge variant="outline" className="text-xs">{a.scope === 'all' ? '全体' : a.scope === 'groups' ? <><Users2 className="h-3 w-3 inline mr-1" />{a.targets.length}个组</> : <><Users className="h-3 w-3 inline mr-1" />{a.targets.length}人</>}</Badge>
                        <Badge variant="secondary" className="text-xs">{a.authorName}</Badge>
                        {isSystem && <Badge className="bg-amber-500 text-xs">系统</Badge>}
                      </div>
                      <p className="text-sm text-muted-foreground mt-2 whitespace-pre-wrap line-clamp-3">{a.content}</p>
                      <div className="flex items-center gap-3 mt-2 text-xs text-muted-foreground">
                        <span>{formatDateCN(a.createdAt)}</span>
                        <button className="text-blue-500 hover:underline flex items-center gap-1" onClick={() => setStatsTarget(a)}><BarChart3 className="h-3 w-3" /> 已读 {a.readCount}</button>
                      </div>
                    </div>
                    <div className="flex gap-1">
                      {canEdit && <Button variant="ghost" size="icon" className="h-7 w-7" title="编辑" onClick={() => openEdit(a)}><Pencil className="h-3.5 w-3.5" /></Button>}
                      {canEdit && <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="删除" onClick={() => handleDelete(a)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                    </div>
                  </div>
                </CardContent>
              </Card>
            )
          })}
        </div>
      )}

      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? '编辑公告' : '发布公告'}</DialogTitle><DialogDescription>{isSuperAdmin ? '超管公告将以「system」名义发布' : '公告将以你的名字发布'}</DialogDescription></DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5"><Label>标题 *</Label><Input value={title} onChange={e => setTitle(e.target.value)} placeholder="公告标题" /></div>
            <div className="space-y-1.5"><Label>内容 *</Label><Textarea value={content} onChange={e => setContent(e.target.value)} placeholder="公告详细内容" rows={4} /></div>
            <div className="space-y-1.5"><Label>接收范围</Label>
              <div className="flex gap-2">{availableScopes.map(s => <button key={s} type="button" onClick={() => setScope(s)} className={cn('px-3 py-1.5 rounded-md text-sm border transition-colors', scope === s ? 'bg-primary text-primary-foreground border-primary' : 'bg-muted text-muted-foreground border-border')}>{s === 'all' ? '全体' : s === 'groups' ? '多小组' : '多用户'}</button>)}</div>
            </div>
            {scope === 'groups' && <div className="space-y-2 p-3 rounded-md border border-border bg-muted/30"><Label className="text-xs">选择小组（可多选）</Label><div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-60 overflow-y-auto">{availableGroups.map(g => <label key={g.id} className="flex items-center gap-2 p-2 rounded hover:bg-accent cursor-pointer"><Checkbox checked={selectedGroupIds.includes(g.id)} onCheckedChange={() => toggleGroup(g.id)} /><span className="text-sm">{g.name}</span></label>)}</div></div>}
            {scope === 'users' && <div className="space-y-2 p-3 rounded-md border border-border bg-muted/30">
              <div className="flex items-center justify-between"><Label className="text-xs">选择用户（可多选）</Label><Select onValueChange={(gid) => gid && importGroupMembers(gid)}><SelectTrigger className="h-7 w-44 text-xs"><SelectValue placeholder="按小组导入" /></SelectTrigger><SelectContent>{availableGroups.map(g => <SelectItem key={g.id} value={g.id}>{g.name}</SelectItem>)}</SelectContent></Select></div>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 max-h-60 overflow-y-auto">{availableUsers.map((u: AdminUser) => <label key={u.id} className="flex items-center gap-2 p-2 rounded hover:bg-accent cursor-pointer"><Checkbox checked={selectedUserIds.includes(u.id)} onCheckedChange={() => toggleUser(u.id)} /><span className="text-sm">{u.displayName || u.username}</span></label>)}</div>
              {selectedUserIds.length > 0 && <div className="text-xs text-muted-foreground">已选 {selectedUserIds.length} 个用户</div>}
            </div>}
          </div>
          <DialogFooter><Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button><Button onClick={handleSave} disabled={saving}>{saving ? '保存中...' : '保存'}</Button></DialogFooter>
        </DialogContent>
      </Dialog>

      <ReadStatsDialog announcement={statsTarget} onClose={() => setStatsTarget(null)} />
    </div>
  )
}

function ReadStatsDialog({ announcement, onClose }: { announcement: Announcement | null; onClose: () => void }) {
  const { data, isLoading } = useQuery({
    queryKey: ['announcement-read-stats', announcement?.id],
    queryFn: async () => { const res = await fetch(`/api/announcements/${announcement!.id}/read-stats`); const j = await res.json(); if (!j.success) throw new Error(j.error); return j.data as { title: string; total: number; readCount: number; unreadCount: number; users: Array<{ userId: string; username: string; displayName: string; isRead: boolean; readAt: string | null }> } },
    enabled: !!announcement,
  })
  return (
    <Dialog open={!!announcement} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-2xl">
        <DialogHeader><DialogTitle>已读统计 - {announcement?.title}</DialogTitle><DialogDescription>共 {data?.total ?? 0} 人 ｜ 已读 {data?.readCount ?? 0} ｜ 未读 {data?.unreadCount ?? 0}</DialogDescription></DialogHeader>
        {isLoading ? <div className="text-center py-6 text-sm text-muted-foreground">加载中...</div> : data ? (
          <>
            <div className="w-full h-2 bg-muted rounded-full overflow-hidden"><div className="h-full bg-emerald-500 rounded-full transition-all" style={{ width: `${data.total > 0 ? (data.readCount / data.total * 100) : 0}%` }} /></div>
            <div className="space-y-1 max-h-80 overflow-y-auto">{data.users.map(u => <div key={u.userId} className="flex items-center gap-2 p-2 rounded-md border border-border"><div className="flex-1"><div className="text-sm font-medium">{u.displayName}</div><div className="text-xs text-muted-foreground">@{u.username}</div></div>{u.isRead ? <Badge className="bg-emerald-500 text-xs">✓ 已读</Badge> : <Badge variant="outline" className="text-xs text-muted-foreground">未读</Badge>}{u.isRead && u.readAt && <span className="text-[10px] text-muted-foreground">{formatDateCN(u.readAt)}</span>}</div>)}</div>
          </>
        ) : <div className="text-center py-6 text-sm text-muted-foreground">无数据</div>}
      </DialogContent>
    </Dialog>
  )
}
