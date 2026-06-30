'use client'

import { useState } from 'react'
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { GraduationCap, Loader2, KeyRound } from 'lucide-react'
import { login, register } from './types'
import { toast } from 'sonner'
import { ThemeToggle } from './theme-toggle'

interface AuthScreenProps {
  onAuthed: () => void
}

export function AuthScreen({ onAuthed }: AuthScreenProps) {
  const [tab, setTab] = useState<'login' | 'register'>('login')
  const [loading, setLoading] = useState(false)

  // 登录
  const [loginUsername, setLoginUsername] = useState('')
  const [loginPassword, setLoginPassword] = useState('')

  // 注册
  const [regUsername, setRegUsername] = useState('')
  const [regPassword, setRegPassword] = useState('')
  const [regDisplayName, setRegDisplayName] = useState('')

  // 强制改密码（批量导入/超管重置后）
  const [needChangePwd, setNeedChangePwd] = useState(false)
  const [changePwdUser, setChangePwdUser] = useState<{ username: string; oldPassword: string } | null>(null)
  const [newPassword, setNewPassword] = useState('')

  const handleLogin = async () => {
    if (!loginUsername || !loginPassword) {
      toast.error('请填写用户名和密码')
      return
    }
    setLoading(true)
    try {
      const u = await login(loginUsername, loginPassword)
      if (u.mustChangePassword) {
        // 强制改密码
        setChangePwdUser({ username: loginUsername, oldPassword: loginPassword })
        setNeedChangePwd(true)
        setNewPassword('')
        toast.info('首次登录或密码被重置，请修改密码')
      } else {
        toast.success('登录成功')
        onAuthed()
      }
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleRegister = async () => {
    if (!regUsername || !regPassword) {
      toast.error('请填写用户名和密码')
      return
    }
    setLoading(true)
    try {
      await register(regUsername, regPassword, regDisplayName)
      toast.success('注册成功，已自动登录')
      onAuthed()
    } catch (e) {
      toast.error((e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  const handleChangePwd = async () => {
    if (!newPassword) {
      toast.error('请输入新密码')
      return
    }
    if (newPassword === '123456') {
      toast.error('新密码不能是 123456')
      return
    }
    if (newPassword.length < 6) {
      toast.error('密码至少 6 个字符')
      return
    }
    setLoading(true)
    try {
      const res = await fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ oldPassword: changePwdUser?.oldPassword, newPassword }),
      })
      const json = await res.json()
      if (!json.success) {
        toast.error(json.error)
        return
      }
      toast.success('密码已修改，请重新登录')
      setNeedChangePwd(false)
      setChangePwdUser(null)
      setNewPassword('')
      setLoginUsername('')
      setLoginPassword('')
      setTab('login')
    } catch (e) {
      toast.error('修改失败：' + (e as Error).message)
    } finally {
      setLoading(false)
    }
  }

  // 强制改密码界面
  if (needChangePwd) {
    return (
      <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-muted/30">
        <div className="absolute top-4 right-4">
          <ThemeToggle />
        </div>
        <div className="w-full max-w-md space-y-6">
          <div className="text-center space-y-2">
            <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-amber-500/10 text-amber-500">
              <KeyRound className="h-8 w-8" />
            </div>
            <h1 className="text-2xl font-bold">需要修改密码</h1>
            <p className="text-sm text-muted-foreground">
              账号 <span className="font-semibold text-foreground">{changePwdUser?.username}</span> 当前使用默认密码，必须修改后才能继续使用
            </p>
          </div>
          <Card>
            <CardContent className="pt-6 space-y-3">
              <div className="space-y-1.5">
                <Label>新密码 *</Label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={e => setNewPassword(e.target.value)}
                  placeholder="至少 6 个字符，不能是 123456"
                  onKeyDown={e => e.key === 'Enter' && handleChangePwd()}
                />
              </div>
              <Button className="w-full" onClick={handleChangePwd} disabled={loading}>
                {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                确认修改
              </Button>
              <p className="text-xs text-muted-foreground text-center pt-2">
                修改成功后请使用新密码重新登录
              </p>
            </CardContent>
          </Card>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex items-center justify-center p-4 bg-gradient-to-br from-background via-background to-muted/30">
      <div className="absolute top-4 right-4">
        <ThemeToggle />
      </div>

      <div className="w-full max-w-md space-y-6">
        {/* Logo */}
        <div className="text-center space-y-2">
          <div className="inline-flex items-center justify-center w-16 h-16 rounded-2xl bg-primary/10 text-primary">
            <GraduationCap className="h-8 w-8" />
          </div>
          <h1 className="text-2xl font-bold">高中成绩分析系统</h1>
          <p className="text-sm text-muted-foreground">上海赋分制 · 多用户隔离 · 个人专属</p>
        </div>

        <Card>
          <CardHeader>
            <Tabs value={tab} onValueChange={(v) => setTab(v as 'login' | 'register')}>
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="login">登录</TabsTrigger>
                <TabsTrigger value="register">注册</TabsTrigger>
              </TabsList>
              <TabsContent value="login" className="mt-4">
                <CardTitle className="text-base">欢迎回来</CardTitle>
                <CardDescription className="mt-1">输入账号密码继续</CardDescription>
              </TabsContent>
              <TabsContent value="register" className="mt-4">
                <CardTitle className="text-base">创建新账号</CardTitle>
                <CardDescription className="mt-1">每人独立空间，互不可见</CardDescription>
              </TabsContent>
            </Tabs>
          </CardHeader>
          <CardContent>
            <Tabs value={tab} onValueChange={(v) => setTab(v as 'login' | 'register')}>
              <TabsContent value="login" className="space-y-3">
                <div className="space-y-1.5">
                  <Label>用户名</Label>
                  <Input
                    value={loginUsername}
                    onChange={e => setLoginUsername(e.target.value)}
                    placeholder="输入用户名"
                    onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>密码</Label>
                  <Input
                    type="password"
                    value={loginPassword}
                    onChange={e => setLoginPassword(e.target.value)}
                    placeholder="输入密码"
                    onKeyDown={e => e.key === 'Enter' && handleLogin()}
                  />
                </div>
                <Button className="w-full" onClick={handleLogin} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  登录
                </Button>
                <p className="text-xs text-muted-foreground text-center pt-2">
                  会话有效期 2 小时，超过后需重新登录
                </p>
              </TabsContent>

              <TabsContent value="register" className="space-y-3">
                <div className="space-y-1.5">
                  <Label>用户名 *</Label>
                  <Input
                    value={regUsername}
                    onChange={e => setRegUsername(e.target.value)}
                    placeholder="至少 3 个字符，不能以 test 开头/结尾"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>密码 *</Label>
                  <Input
                    type="password"
                    value={regPassword}
                    onChange={e => setRegPassword(e.target.value)}
                    placeholder="至少 6 个字符，不能用 123456"
                  />
                </div>
                <div className="space-y-1.5">
                  <Label>显示名（可选）</Label>
                  <Input
                    value={regDisplayName}
                    onChange={e => setRegDisplayName(e.target.value)}
                    placeholder="如：小明"
                  />
                </div>
                <Button className="w-full" onClick={handleRegister} disabled={loading}>
                  {loading ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : null}
                  注册并登录
                </Button>
                <p className="text-xs text-muted-foreground text-center pt-2">
                  注册后默认选科物化生，可在设置中修改
                </p>
              </TabsContent>
            </Tabs>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
