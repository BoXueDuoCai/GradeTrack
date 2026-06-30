'use client'

import { useState, useMemo, useRef } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Checkbox } from '@/components/ui/checkbox'
import { Textarea } from '@/components/ui/textarea'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { UserPlus, Trash2, KeyRound, Shield, RefreshCw, Upload, Crown, Settings2, Search, Eye, Download, FileSpreadsheet, FileText } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchUsers, adminCreateUser, adminUpdateUser, adminDeleteUser, adminBatchImport,
  AdminUser, fetchGroups, AdminPermission,
} from './types'
import { SUBJECTS, SubjectKey } from '@/lib/constants'
import { toast } from 'sonner'
import { formatDateCN } from './types'
import { useConfirm } from './confirm-dialog'
import { UserDetailDialog } from './user-exams-dialog'
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu'

const ALL_PERMISSIONS: { key: AdminPermission; label: string }[] = [
  { key: 'batch_import', label: '批量导入用户' },
  { key: 'create_group', label: '创建小组' },
  { key: 'publish_plan', label: '发布学习计划' },
  { key: 'manage_users', label: '管理用户' },
]

export function AdminView() {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const { data: users = [], isLoading } = useQuery({ queryKey: ['users'], queryFn: fetchUsers })
  const { data: groups = [] } = useQuery({ queryKey: ['groups'], queryFn: fetchGroups })

  const [search, setSearch] = useState('')
  const [groupFilter, setGroupFilter] = useState<string>('all')

  // 新建用户
  const [showCreate, setShowCreate] = useState(false)
  const [newUsername, setNewUsername] = useState('')
  const [newPassword, setNewPassword] = useState('')
  const [newDisplayName, setNewDisplayName] = useState('')
  const [newRole, setNewRole] = useState<'admin' | 'user' | 'test_user'>('user')
  const [creating, setCreating] = useState(false)

  // 改密码
  const [resetTarget, setResetTarget] = useState<AdminUser | null>(null)
  const [resetPassword, setResetPassword] = useState('')
  const [resetting, setResetting] = useState(false)

  // 设权限
  const [permTarget, setPermTarget] = useState<AdminUser | null>(null)
  const [permSet, setPermSet] = useState<AdminPermission[]>([])

  // CSV 导入
  const [showImport, setShowImport] = useState(false)
  const [importGroupName, setImportGroupName] = useState('')
  const [importCsv, setImportCsv] = useState('')
  const [importing, setImporting] = useState(false)

  // 查看用户成绩（仅超管）
  const [viewExamsTarget, setViewExamsTarget] = useState<AdminUser | null>(null)

  // 导出用户成绩（admin + super_admin 都可）
  const exportUser = (u: AdminUser, type: 'excel' | 'pdf') => {
    if (type === 'pdf') {
      window.open(`/api/users/${u.id}/export/pdf`, '_blank')
      toast.success(`已打开 ${u.username} 的成绩报告`)
    } else {
      const a = document.createElement('a')
      a.href = `/api/users/${u.id}/export/excel`
      a.download = ''
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      toast.success(`正在导出 ${u.username} 的 Excel...`)
    }
  }

  // 数据备份/恢复（仅超管）
  const backupInputRef = useRef<HTMLInputElement>(null)
  const downloadBackup = () => {
    const a = document.createElement('a')
    a.href = '/api/backup/download'
    a.download = ''
    document.body.appendChild(a)
    a.click()
    document.body.removeChild(a)
    toast.success('数据库备份下载中...')
  }
  const handleRestore = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    const ok = await confirm({
      title: '确认恢复数据？',
      description: `将从文件「${file.name}」恢复数据库，当前所有数据将被覆盖！建议先备份。`,
      variant: 'destructive',
      confirmText: '确认恢复',
    })
    if (!ok) {
      e.target.value = ''
      return
    }
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/backup/restore', { method: 'POST', body: fd })
      const j = await res.json()
      if (!j.success) throw new Error(j.error)
      toast.success('数据库已恢复，建议刷新页面重新登录')
      setTimeout(() => window.location.reload(), 1500)
    } catch (err) {
      toast.error((err as Error).message)
    } finally {
      e.target.value = ''
    }
  }

  const isSuperAdmin = (users.find(u => u.role === 'super_admin') && true) || false
  // 当前用户从 me 推断（admin-view 不能直接拿，用 users 中标记 isSuperAdmin 是其他用户的判断不合适）
  // 简化：通过查询 /api/auth/me 拿当前用户。但 admin-view 已经知道只有 admin/super_admin 能进入
  // 用 users 列表中 role==='super_admin' 的存在来判断是否 super_admin 视角不准确
  // 改为通过 query client 拿当前 user
  const meQuery = useQuery({ queryKey: ['me'], queryFn: async () => {
    const res = await fetch('/api/auth/me')
    const j = await res.json()
    return j.data
  }})
  const isCurrentSuperAdmin = meQuery.data?.role === 'super_admin'

  // 过滤
  const filtered = useMemo(() => {
    let r = users
    if (search.trim()) {
      const q = search.trim().toLowerCase()
      r = r.filter(u =>
        u.username.toLowerCase().includes(q) ||
        (u.displayName?.toLowerCase().includes(q) ?? false)
      )
    }
    if (groupFilter !== 'all') {
      // groupFilter 是 group id 或 'none'
      if (groupFilter === 'none') {
        // 没在任何组的用户
        r = r.filter(u => u.groupCount === 0)
      } else {
        // 通过 fetchGroup 比对太慢，这里简化：用 groupCount > 0 时再查
        // 实际上后端应该返回 user.groupIds[]，但当前简化为按 groupCount 过滤
        // 真正按某组筛选：用 groups 列表里没成员详情，需要单独 API
        // 暂时显示所有有组的用户
        r = r.filter(u => u.groupCount > 0)
      }
    }
    return r
  }, [users, search, groupFilter])

  const handleCreate = async () => {
    if (!newUsername || !newPassword) {
      toast.error('用户名和密码必填')
      return
    }
    setCreating(true)
    try {
      await adminCreateUser({
        username: newUsername,
        password: newPassword,
        displayName: newDisplayName || undefined,
        role: newRole,
      })
      toast.success(`用户 ${newUsername} 已创建`)
      setNewUsername(''); setNewPassword(''); setNewDisplayName(''); setNewRole('user')
      setShowCreate(false)
      queryClient.invalidateQueries({ queryKey: ['users'] })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setCreating(false)
    }
  }

  const handleResetPassword = async () => {
    if (!resetTarget) return
    // #11: 超管不可重置自己的密码
    if (isCurrentSuperAdmin && resetTarget.id === meQuery.data?.id) {
      toast.error('不能重置自己的密码，请到设置页修改')
      return
    }
    if (resetPassword.length < 6) {
      toast.error('密码至少 6 个字符')
      return
    }
    setResetting(true)
    try {
      await adminUpdateUser(resetTarget.id, { password: resetPassword })
      toast.success(`已重置 ${resetTarget.username} 的密码` + (resetPassword === '123456' ? '（用户下次登录需修改）' : ''))
      setResetTarget(null)
      setResetPassword('')
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setResetting(false)
    }
  }

  const handleToggleRole = async (u: AdminUser) => {
    if (u.role === 'super_admin') {
      toast.error('超级管理员不能被降级')
      return
    }
    const newRole = u.role === 'admin' ? 'user' : 'admin'
    const ok = await confirm({
      title: '确认修改角色',
      description: `将「${u.username}」设为${newRole === 'admin' ? '管理员' : '普通用户'}？`,
      confirmText: '确认',
    })
    if (!ok) return
    try {
      await adminUpdateUser(u.id, { role: newRole })
      toast.success('已更新角色')
      queryClient.invalidateQueries({ queryKey: ['users'] })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const handleSavePermissions = async () => {
    if (!permTarget) return
    try {
      await adminUpdateUser(permTarget.id, { permissions: permSet })
      toast.success('权限已保存')
      setPermTarget(null)
      queryClient.invalidateQueries({ queryKey: ['users'] })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const handleDelete = async (u: AdminUser) => {
    if (u.role === 'super_admin') {
      toast.error('不能删除超级管理员')
      return
    }
    const ok = await confirm({
      title: '确认删除用户',
      description: `将删除「${u.username}」及其所有成绩、目标、个人计划，此操作不可撤销！`,
      variant: 'destructive',
      confirmText: '删除',
    })
    if (!ok) return
    try {
      await adminDeleteUser(u.id)
      toast.success(`已删除用户 ${u.username}`)
      queryClient.invalidateQueries({ queryKey: ['users'] })
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const parseCsv = (csv: string): Array<{ studentNo: string; username: string; displayName?: string }> => {
    const lines = csv.trim().split(/\r?\n/).filter(l => l.trim())
    const result: Array<{ studentNo: string; username: string; displayName?: string }> = []
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim()
      if (!line) continue
      // 跳过表头（如果第一列是"学号"或类似）
      if (i === 0 && /学号|编号|no/i.test(line)) continue
      const parts = line.split(',').map(p => p.trim())
      if (parts.length < 2) continue
      const [studentNo, username, displayName] = parts
      if (!username) continue
      result.push({ studentNo: studentNo || username, username, displayName: displayName || undefined })
    }
    return result
  }

  const handleImport = async () => {
    if (!importGroupName.trim()) {
      toast.error('请填写小组名称')
      return
    }
    const members = parseCsv(importCsv)
    if (members.length === 0) {
      toast.error('CSV 解析失败或为空，请检查格式：每行 学号,名字')
      return
    }
    setImporting(true)
    try {
      const result = await adminBatchImport({ groupName: importGroupName.trim(), members })
      toast.success(`导入成功：新建 ${result.created} 人，已存在 ${result.existing} 人`)
      setShowImport(false)
      setImportGroupName('')
      setImportCsv('')
      queryClient.invalidateQueries({ queryKey: ['users'] })
      queryClient.invalidateQueries({ queryKey: ['groups'] })
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setImporting(false)
    }
  }

  const openPermDialog = (u: AdminUser) => {
    setPermTarget(u)
    setPermSet(u.permissions || [])
  }

  return (
    <div className="max-w-5xl mx-auto p-4 md:p-6 space-y-4">
      <div className="flex items-center justify-between flex-wrap gap-2">
        <div>
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Shield className="h-6 w-6 text-primary" /> 后台管理
            {isCurrentSuperAdmin && <Badge className="bg-amber-500"><Crown className="h-3 w-3 mr-1" />超级管理员</Badge>}
          </h2>
          <p className="text-sm text-muted-foreground">管理所有用户账号 · 小组 · 权限</p>
        </div>
        <div className="flex gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => queryClient.invalidateQueries({ queryKey: ['users'] })}>
            <RefreshCw className="h-4 w-4 mr-1" /> 刷新
          </Button>
          {isCurrentSuperAdmin && (
            <>
              <Button variant="outline" size="sm" onClick={() => downloadBackup()}>
                <Download className="h-4 w-4 mr-1" /> 数据备份
              </Button>
              <Button variant="outline" size="sm" onClick={() => backupInputRef.current?.click()}>
                <Upload className="h-4 w-4 mr-1" /> 数据恢复
              </Button>
              <input
                ref={backupInputRef}
                type="file"
                accept=".db"
                className="hidden"
                onChange={handleRestore}
              />
              <Button variant="outline" size="sm" onClick={() => setShowImport(true)}>
                <Upload className="h-4 w-4 mr-1" /> CSV 导入
              </Button>
            </>
          )}
          <Button size="sm" onClick={() => setShowCreate(true)}>
            <UserPlus className="h-4 w-4 mr-1" /> 新建用户
          </Button>
        </div>
      </div>

      {/* 统计 */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">总用户</div>
            <div className="text-2xl font-bold">{users.length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">管理员</div>
            <div className="text-2xl font-bold text-blue-500">{users.filter(u => u.role === 'admin').length}</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="text-xs text-muted-foreground">小组数</div>
            <div className="text-2xl font-bold text-cyan-500">{groups.length}</div>
          </CardContent>
        </Card>
      </div>

      {/* 筛选 */}
      <Card>
        <CardContent className="p-3">
          <div className="flex flex-col md:flex-row gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
              <Input
                placeholder="搜索用户名或显示名"
                value={search}
                onChange={e => setSearch(e.target.value)}
                className="pl-8"
              />
            </div>
            <Select value={groupFilter} onValueChange={setGroupFilter}>
              <SelectTrigger className="w-full md:w-48"><SelectValue placeholder="按小组筛选" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有用户</SelectItem>
                <SelectItem value="none">无组用户</SelectItem>
                {groups.map(g => (
                  <SelectItem key={g.id} value={g.id}>{g.name}（{g.memberCount}）</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardContent>
      </Card>

      {/* 用户列表 */}
      <Card>
        <CardHeader>
          <CardTitle>用户列表（{filtered.length} / {users.length}）</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-muted-foreground">加载中...</div>
          ) : (
            <div className="space-y-2">
              <div className="hidden md:grid grid-cols-12 gap-2 text-xs font-medium text-muted-foreground px-3 pb-2 border-b border-border">
                <div className="col-span-2">用户名</div>
                <div className="col-span-2">显示名</div>
                <div className="col-span-1">角色</div>
                <div className="col-span-2">最近登录</div>
                <div className="col-span-1">考试</div>
                <div className="col-span-1">组</div>
                <div className="col-span-3">操作</div>
              </div>

              {filtered.map(u => {
                const roleBadge = u.role === 'super_admin' ? { txt: '超管', cls: 'bg-amber-500' }
                  : u.role === 'admin' ? { txt: '管理', cls: 'bg-blue-500' }
                  : u.role === 'test_user' ? { txt: '测试', cls: 'bg-cyan-500' }
                  : { txt: '用户', cls: 'bg-muted text-foreground' }
                return (
                  <div key={u.id} className="grid grid-cols-2 md:grid-cols-12 gap-2 items-center px-3 py-2 rounded-md hover:bg-accent/30 border border-border">
                    <div className="col-span-2 md:col-span-2">
                      <div className="font-medium text-sm flex items-center gap-1">
                        {u.username}
                        {u.mustChangePassword && <span title="需改密码" className="text-amber-500 text-xs">⚠</span>}
                      </div>
                      <div className="text-xs text-muted-foreground">{formatDateCN(u.createdAt)}</div>
                    </div>
                    <div className="md:col-span-2 text-sm">{u.displayName || '—'}</div>
                    <div className="md:col-span-1">
                      <span className={`text-[10px] px-1.5 py-0.5 rounded text-white font-medium ${roleBadge.cls}`}>
                        {roleBadge.txt}
                      </span>
                    </div>
                    <div className="md:col-span-2 text-xs text-muted-foreground">
                      {u.lastLoginAt ? formatDateCN(u.lastLoginAt) : '—'}
                      {u.lastLoginIp && <div className="text-[10px]">{u.lastLoginIp}</div>}
                    </div>
                    <div className="md:col-span-1 text-sm text-muted-foreground">{u.examCount} 场</div>
                    <div className="md:col-span-1 text-sm text-muted-foreground">{u.groupCount}</div>
                    <div className="col-span-2 md:col-span-3 flex gap-1 flex-wrap">
                      {/* 导出（admin + super_admin 都可见） */}
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="导出成绩">
                            <Download className="h-3.5 w-3.5" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => exportUser(u, 'excel')}>
                            <FileSpreadsheet className="h-3.5 w-3.5 mr-2" /> Excel
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => exportUser(u, 'pdf')}>
                            <FileText className="h-3.5 w-3.5 mr-2" /> PDF（打印）
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      {/* #11: 超管和管理员都能查看成绩 */}
                      {u.role !== 'super_admin' && (
                        <Button variant="ghost" size="icon" className="h-7 w-7" title="查看成绩" onClick={() => setViewExamsTarget(u)}>
                          <Eye className="h-3.5 w-3.5" />
                        </Button>
                      )}
                      {isCurrentSuperAdmin && u.id !== meQuery.data?.id && (
                        <>
                          <Button variant="ghost" size="icon" className="h-7 w-7" title="重置密码" onClick={() => { setResetTarget(u); setResetPassword('') }}>
                            <KeyRound className="h-3.5 w-3.5" />
                          </Button>
                          {u.role !== 'super_admin' && u.role !== 'test_user' && (
                            <Button variant="ghost" size="sm" className="h-7 text-xs" onClick={() => handleToggleRole(u)}>
                              {u.role === 'admin' ? '降为用户' : '升为管理'}
                            </Button>
                          )}
                          {u.role === 'admin' && (
                            <Button variant="ghost" size="icon" className="h-7 w-7" title="设置权限" onClick={() => openPermDialog(u)}>
                              <Settings2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                          {u.role !== 'super_admin' && (
                            <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" title="删除" onClick={() => handleDelete(u)}>
                              <Trash2 className="h-3.5 w-3.5" />
                            </Button>
                          )}
                        </>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* 新建用户对话框 */}
      <Dialog open={showCreate} onOpenChange={setShowCreate}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>新建用户</DialogTitle>
            <DialogDescription>{isCurrentSuperAdmin ? '超级管理员创建新账号' : '管理员创建新账号（仅普通用户）'}</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>用户名 *</Label>
              <Input value={newUsername} onChange={e => setNewUsername(e.target.value)} placeholder="至少 3 个字符" />
            </div>
            <div className="space-y-1.5">
              <Label>密码 *</Label>
              <Input type="password" value={newPassword} onChange={e => setNewPassword(e.target.value)} placeholder="至少 6 个字符" />
            </div>
            <div className="space-y-1.5">
              <Label>显示名（可选）</Label>
              <Input value={newDisplayName} onChange={e => setNewDisplayName(e.target.value)} placeholder="如：小明" />
            </div>
            <div className="space-y-1.5">
              <Label>角色</Label>
              <Select value={newRole} onValueChange={(v) => setNewRole(v as 'admin' | 'user' | 'test_user')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="user">普通用户</SelectItem>
                  {isCurrentSuperAdmin && <SelectItem value="admin">管理员</SelectItem>}
                  {isCurrentSuperAdmin && <SelectItem value="test_user">测试用户</SelectItem>}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowCreate(false)}>取消</Button>
            <Button onClick={handleCreate} disabled={creating}>{creating ? '创建中...' : '创建'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 重置密码对话框 */}
      <Dialog open={!!resetTarget} onOpenChange={(open) => !open && setResetTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>重置密码</DialogTitle>
            <DialogDescription>为用户 {resetTarget?.username} 设置新密码</DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>新密码 *</Label>
              <Input
                type="password"
                value={resetPassword}
                onChange={e => setResetPassword(e.target.value)}
                placeholder="可填 123456 强制用户改"
                onKeyDown={e => e.key === 'Enter' && handleResetPassword()}
              />
              <p className="text-xs text-muted-foreground">
                提示：设为 123456 时用户下次登录会被强制修改密码
              </p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResetTarget(null)}>取消</Button>
            <Button onClick={handleResetPassword} disabled={resetting}>{resetting ? '重置中...' : '重置密码'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 权限设置对话框 */}
      <Dialog open={!!permTarget} onOpenChange={(open) => !open && setPermTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>设置管理员权限</DialogTitle>
            <DialogDescription>为 {permTarget?.username} 设置管理员权限</DialogDescription>
          </DialogHeader>
          <div className="space-y-2 py-2">
            {ALL_PERMISSIONS.map(p => (
              <label key={p.key} className="flex items-center gap-2 p-2 rounded-md hover:bg-accent cursor-pointer">
                <Checkbox
                  checked={permSet.includes(p.key)}
                  onCheckedChange={(checked) => {
                    if (checked) setPermSet([...permSet, p.key])
                    else setPermSet(permSet.filter(x => x !== p.key))
                  }}
                />
                <span className="text-sm">{p.label}</span>
              </label>
            ))}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPermTarget(null)}>取消</Button>
            <Button onClick={handleSavePermissions}>保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* CSV 批量导入对话框 */}
      <Dialog open={showImport} onOpenChange={setShowImport}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>CSV 批量导入用户</DialogTitle>
            <DialogDescription>
              格式：每行 学号,名字（名字是用户名，必须唯一）<br/>
              导入后用户默认密码 123456，首次登录强制改密码
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            <div className="space-y-1.5">
              <Label>小组名称 *</Label>
              <Input value={importGroupName} onChange={e => setImportGroupName(e.target.value)} placeholder="如：3班1组" />
            </div>
            <div className="space-y-1.5">
              <Label>CSV 内容 *</Label>
              <Textarea
                value={importCsv}
                onChange={e => setImportCsv(e.target.value)}
                placeholder={`学号,名字\n1,zhangsan\n2,lisi\n3,wangwu`}
                rows={10}
                className="font-mono text-xs"
              />
            </div>
            <div className="text-xs text-muted-foreground bg-muted/30 p-2 rounded">
              <p>• 第一列：学号（在小组中显示用，可填任意内容）</p>
              <p>• 第二列：名字（用户名，必须唯一，作为登录账号）</p>
              <p>• 第三列（可选）：显示名</p>
              <p>• 表头行可省略，若第一行包含"学号"字样会自动跳过</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowImport(false)}>取消</Button>
            <Button onClick={handleImport} disabled={importing}>
              {importing ? '导入中...' : '确认导入'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 查看用户信息（超管看完整，管理员看基本） */}
      <UserDetailDialog
        user={viewExamsTarget}
        open={!!viewExamsTarget}
        onOpenChange={(open) => !open && setViewExamsTarget(null)}
        isSuperAdmin={isCurrentSuperAdmin}
      />
    </div>
  )
}
