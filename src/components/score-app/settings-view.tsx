'use client'

import { useState, useEffect } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Save, Plus, Trash2, Pencil } from 'lucide-react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  fetchSettings, saveSettings, AuthUser, CustomExamType, UserSettings,
} from './types'
import { SUBJECTS, SubjectKey, ELECTIVE_OPTIONS, DEFAULT_ELECTIVE_SUBJECTS, EXAM_TYPES } from '@/lib/constants'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'
import { useConfirm } from './confirm-dialog'

interface SettingsViewProps {
  user: AuthUser
  onUserUpdate: (u: AuthUser) => void
}

export function SettingsView({ user, onUserUpdate }: SettingsViewProps) {
  const queryClient = useQueryClient()
  const confirm = useConfirm()
  const { data: settings, isLoading } = useQuery({ queryKey: ['settings'], queryFn: fetchSettings })

  const [elective, setElective] = useState<SubjectKey[]>(DEFAULT_ELECTIVE_SUBJECTS)
  const [customExamTypes, setCustomExamTypes] = useState<CustomExamType[]>([])
  const [displayName, setDisplayName] = useState('')
  const [savingElective, setSavingElective] = useState(false)
  const [savingName, setSavingName] = useState(false)

  // 自定义类型编辑
  const [editingCustom, setEditingCustom] = useState<CustomExamType | null>(null)
  const [customName, setCustomName] = useState('')
  const [customSubjects, setCustomSubjects] = useState<SubjectKey[]>([])

  useEffect(() => {
    if (settings) {
      setElective(settings.electiveSubjects)
      setCustomExamTypes(settings.customExamTypes)
      setDisplayName(settings.displayName || '')
    }
  }, [settings])

  const toggleElective = (sub: SubjectKey) => {
    setElective(prev => {
      if (prev.includes(sub)) return prev.filter(s => s !== sub)
      if (prev.length >= 3) {
        toast.error('小三门只能选 3 门')
        return prev
      }
      return [...prev, sub]
    })
  }

  const handleSaveElective = async () => {
    if (elective.length !== 3) {
      toast.error('小三门必须选 3 门')
      return
    }
    setSavingElective(true)
    try {
      const updated = await saveSettings({ electiveSubjects: elective })
      setElective(updated.electiveSubjects)
      // 同步 user state
      onUserUpdate({ ...user, electiveSubjects: updated.electiveSubjects })
      queryClient.invalidateQueries({ queryKey: ['exams'] })
      toast.success('选科已保存（不影响已录入的成绩）')
    } catch (e) {
      toast.error('保存失败：' + (e as Error).message)
    } finally {
      setSavingElective(false)
    }
  }

  const handleSaveName = async () => {
    setSavingName(true)
    try {
      const updated = await saveSettings({ displayName })
      onUserUpdate({ ...user, displayName: updated.displayName })
      toast.success('显示名已更新')
    } catch (e) {
      toast.error('保存失败：' + (e as Error).message)
    } finally {
      setSavingName(false)
    }
  }

  const startNewCustom = () => {
    setEditingCustom({ type: `custom_${Date.now()}`, name: '', subjects: [] })
    setCustomName('')
    setCustomSubjects([])
  }

  const startEditCustom = (c: CustomExamType) => {
    setEditingCustom({ ...c })
    setCustomName(c.name)
    setCustomSubjects([...c.subjects])
  }

  const toggleCustomSubject = (sub: SubjectKey) => {
    setCustomSubjects(prev => prev.includes(sub) ? prev.filter(s => s !== sub) : [...prev, sub])
  }

  const saveCustomType = async () => {
    if (!customName.trim()) {
      toast.error('请填写类型名称')
      return
    }
    if (customSubjects.length === 0) {
      toast.error('至少选 1 个科目')
      return
    }
    const newType: CustomExamType = {
      type: editingCustom?.type || `custom_${Date.now()}`,
      name: customName.trim(),
      subjects: customSubjects,
    }
    const exists = customExamTypes.find(c => c.type === newType.type)
    const newTypes = exists
      ? customExamTypes.map(c => c.type === newType.type ? newType : c)
      : [...customExamTypes, newType]
    setCustomExamTypes(newTypes)
    setEditingCustom(null)
    try {
      const updated = await saveSettings({ customExamTypes: newTypes })
      setCustomExamTypes(updated.customExamTypes)
      onUserUpdate({ ...user, customExamTypes: updated.customExamTypes })
      toast.success(exists ? '已更新自定义类型' : '已添加自定义类型')
    } catch (e) {
      toast.error('保存失败：' + (e as Error).message)
    }
  }

  const deleteCustomType = async (c: CustomExamType) => {
    const ok = await confirm({
      title: '确认删除',
      description: `删除自定义类型「${c.name}」？`,
      variant: 'destructive',
      confirmText: '删除',
    })
    if (!ok) return
    const newTypes = customExamTypes.filter(t => t.type !== c.type)
    setCustomExamTypes(newTypes)
    try {
      const updated = await saveSettings({ customExamTypes: newTypes })
      onUserUpdate({ ...user, customExamTypes: updated.customExamTypes })
      toast.success('已删除')
    } catch (e) {
      toast.error('删除失败：' + (e as Error).message)
    }
  }

  if (isLoading) return <div className="p-6 text-center text-muted-foreground">加载中...</div>

  // 超管/管理员不需要选科和自定义类型（不录入成绩），只显示账号信息
  const isManager = user.role === 'admin' || user.role === 'super_admin'

  return (
    <div className="max-w-3xl mx-auto p-4 md:p-6 space-y-4">
      <div>
        <h2 className="text-2xl font-bold">设置</h2>
        <p className="text-sm text-muted-foreground">{isManager ? '账号信息' : '账号信息 · 选科 · 自定义考试类型'}</p>
      </div>

      {/* 账号信息 */}
      <Card>
        <CardHeader>
          <CardTitle>账号信息</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">用户名（不可改）</Label>
              <Input value={user.username} disabled />
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs text-muted-foreground">显示名</Label>
              <Input value={displayName} onChange={e => setDisplayName(e.target.value)} placeholder="如：小明" />
            </div>
          </div>
          <div className="flex justify-end">
            <Button size="sm" onClick={handleSaveName} disabled={savingName}>
              <Save className="h-4 w-4 mr-1" /> {savingName ? '保存中...' : '保存'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 小三门选科（仅普通用户/test_user） */}
      {!isManager && (
        <Card>
          <CardHeader>
            <CardTitle>小三门选科</CardTitle>
          <CardDescription>
            从物化生史地政 6 选 3。修改后只影响新录入的 6 门考试，已录入的成绩不变
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
            {ELECTIVE_OPTIONS.map(sub => {
              const selected = elective.includes(sub)
              const subject = SUBJECTS[sub]
              return (
                <button
                  key={sub}
                  onClick={() => toggleElective(sub)}
                  className={cn(
                    'p-3 rounded-lg border text-center transition-all',
                    selected
                      ? 'text-white border-transparent shadow-md'
                      : 'bg-muted text-muted-foreground border-border hover:bg-accent'
                  )}
                  style={selected ? { background: subject.color } : {}}
                >
                  <div className="text-2xl font-bold">{subject.shortName}</div>
                  <div className="text-xs mt-1">{subject.name}</div>
                </button>
              )
            })}
          </div>
          <div className="flex items-center justify-between pt-2 border-t border-border">
            <div className="text-sm">
              已选 <span className="font-bold text-primary">{elective.length}</span> / 3
              {elective.length === 3 && (
                <span className="ml-2 text-muted-foreground">
                  ({elective.map(s => SUBJECTS[s].name).join(' · ')})
                </span>
              )}
            </div>
            <Button size="sm" onClick={handleSaveElective} disabled={savingElective || elective.length !== 3}>
              <Save className="h-4 w-4 mr-1" /> {savingElective ? '保存中...' : '保存选科'}
            </Button>
          </div>
        </CardContent>
      </Card>
      )}

      {/* 自定义考试类型（仅普通用户/test_user） */}
      {!isManager && (
        <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle>自定义考试类型</CardTitle>
              <CardDescription>用于周测、模拟考等非常规类型</CardDescription>
            </div>
            <Button size="sm" variant="outline" onClick={startNewCustom}>
              <Plus className="h-4 w-4 mr-1" /> 新增类型
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-3">
          {customExamTypes.length === 0 && !editingCustom && (
            <div className="text-center py-6 text-sm text-muted-foreground">
              还没有自定义类型，点击"新增类型"创建
            </div>
          )}

          {customExamTypes.map(c => (
            <div key={c.type} className="flex items-center justify-between p-2 rounded-md border border-border">
              <div className="min-w-0">
                <div className="text-sm font-medium">{c.name}</div>
                <div className="flex flex-wrap gap-1 mt-1">
                  {c.subjects.map(s => (
                    <span
                      key={s}
                      className="text-[10px] px-1.5 py-0.5 rounded text-white"
                      style={{ background: SUBJECTS[s].color }}
                    >
                      {SUBJECTS[s].shortName}
                    </span>
                  ))}
                </div>
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEditCustom(c)}>
                  <Pencil className="h-3.5 w-3.5" />
                </Button>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteCustomType(c)}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            </div>
          ))}

          {/* 编辑/新建表单 */}
          {editingCustom && (
            <div className="p-3 rounded-md border border-primary/30 bg-primary/5 space-y-3">
              <div className="space-y-1.5">
                <Label className="text-xs">类型名称</Label>
                <Input
                  value={customName}
                  onChange={e => setCustomName(e.target.value)}
                  placeholder="如：周测 / 一模 / 模拟考"
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs">科目（点击选择）</Label>
                <div className="flex flex-wrap gap-1.5">
                  {(Object.keys(SUBJECTS) as SubjectKey[]).map(sub => {
                    const selected = customSubjects.includes(sub)
                    const subject = SUBJECTS[sub]
                    return (
                      <button
                        key={sub}
                        type="button"
                        onClick={() => toggleCustomSubject(sub)}
                        className={cn(
                          'px-2.5 py-1 rounded text-xs font-medium border transition-colors',
                          selected ? 'text-white border-transparent' : 'bg-muted text-muted-foreground border-border hover:bg-accent'
                        )}
                        style={selected ? { background: subject.color } : {}}
                      >
                        {subject.name}
                      </button>
                    )
                  })}
                </div>
              </div>
              <div className="flex justify-end gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditingCustom(null)}>取消</Button>
                <Button size="sm" onClick={saveCustomType}>保存</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
      )}

      {/* 当前选科对考试类型的影响说明（仅普通用户/test_user） */}
      {!isManager && (
      <Card>
        <CardHeader>
          <CardTitle>选科如何影响考试类型</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2 text-sm">
            <div className="flex items-center gap-2">
              <Badge variant="outline">月考5</Badge>
              <span className="text-muted-foreground">固定 语数英物化，不受选科影响</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">月考6 / 期中6 / 期末6</Badge>
              <span className="text-muted-foreground">语数英 + 你的小三门（{elective.map(s => SUBJECTS[s].name).join('、')}）</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">期中10 / 期末10</Badge>
              <span className="text-muted-foreground">固定 10 门，不受选科影响</span>
            </div>
            <div className="flex items-center gap-2">
              <Badge variant="outline">自定义</Badge>
              <span className="text-muted-foreground">录入时手动选科目</span>
            </div>
          </div>
        </CardContent>
      </Card>
      )}
    </div>
  )
}
