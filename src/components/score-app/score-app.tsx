'use client'

import { useState, useEffect } from 'react'
import { LayoutDashboard, FilePlus, ListChecks, BarChart3, Target, Download, Settings, Shield, LogOut, Calendar, Users, Users2, BookOpen, Megaphone, LineChart } from 'lucide-react'
import { cn } from '@/lib/utils'
import { ThemeToggle } from './theme-toggle'
import { NotificationCenter } from './notification-center'
import { Dashboard } from './dashboard'
import { ExamEntry } from './exam-entry'
import { ExamList } from './exam-list'
import { ChartsView } from './charts-view'
import { GoalsView } from './goals-view'
import { ExportView } from './export-view'
import { SettingsView } from './settings-view'
import { AdminView } from './admin-view'
import { GroupsView } from './groups-view'
import { GroupAnalysisView } from './group-analysis-view'
import { StudyPlansView } from './study-plans-view'
import { CalendarView } from './calendar-view'
import { AnnouncementsView } from './announcements-view'
import { DashboardView } from './dashboard-view'
import { AuthScreen } from './auth-screen'
import { useSwipeNavigation } from './use-swipe'
import { Exam, AuthUser, fetchMe, fetchExams, logout } from './types'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Button } from '@/components/ui/button'
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from '@/components/ui/dialog'
import { toast } from 'sonner'

export type View =
  | 'dashboard' | 'entry' | 'list' | 'charts' | 'goals'
  | 'export' | 'settings' | 'admin'
  | 'groups' | 'group-analysis' | 'study-plans' | 'calendar'
  | 'announcements' | 'big-dashboard'

export function ScoreApp() {
  const [user, setUser] = useState<AuthUser | null | undefined>(undefined)
  const [view, setView] = useState<View>('dashboard')
  const [editExam, setEditExam] = useState<Exam | null>(null)
  const [logoutConfirm, setLogoutConfirm] = useState(false)
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null)
  const queryClient = useQueryClient()

  useEffect(() => {
    fetchMe().then(u => {
      setUser(u)
      // 管理员/超管默认进后台
      if (u && (u.role === 'admin' || u.role === 'super_admin')) setView('admin')
      // test_user 默认进日历
      if (u && u.role === 'test_user') setView('calendar')
    })
  }, [])

  const { data: exams = [], isLoading, error } = useQuery({
    queryKey: ['exams'],
    queryFn: fetchExams,
    enabled: !!user && user.role !== 'admin', // admin 不需要 exams
  })

  const handleEdit = (exam: Exam) => {
    setEditExam(exam)
    setView('entry')
  }

  const handleEntryDone = () => {
    setEditExam(null)
    queryClient.invalidateQueries({ queryKey: ['exams'] })
    setView('list')
  }

  const handleLogout = async () => {
    try {
      await logout()
      queryClient.clear()
      setUser(null)
      setView('dashboard')
      toast.success('已登出')
    } catch {
      toast.error('登出失败')
    } finally {
      setLogoutConfirm(false)
    }
  }

  if (user === undefined) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-muted-foreground">加载中...</div>
      </div>
    )
  }

  if (user === null) {
    return <AuthScreen onAuthed={() => { fetchMe().then(u => {
      setUser(u)
      if (u && (u.role === 'admin' || u.role === 'super_admin')) setView('admin')
      if (u && u.role === 'test_user') setView('calendar')
    }) }} />
  }

  // 角色决定可见菜单
  const isAdmin = user.role === 'admin' || user.role === 'super_admin'
  const isSuperAdmin = user.role === 'super_admin'
  const isTestUser = user.role === 'test_user'
  const isRegularUser = user.role === 'user' || isTestUser

  // 超管：只看后台 + 小组 + 学习计划 + 日历，不看成绩录入等
  // 管理员：看后台 + 小组 + 学习计划 + 日历
  // 普通用户/test_user：看完整主功能 + 日历
  const showMainFeatures = isRegularUser
  const showAdminFeatures = isAdmin
  // 日历开放给所有用户
  const showCalendar = true

  const navItems: { key: View; label: string; icon: React.ElementType; show: boolean }[] = [
    { key: 'dashboard', label: '看板首页', icon: LayoutDashboard, show: showMainFeatures },
    { key: 'entry',     label: '录入成绩', icon: FilePlus,        show: showMainFeatures },
    { key: 'list',      label: '历史成绩', icon: ListChecks,      show: showMainFeatures },
    { key: 'charts',    label: '图表分析', icon: BarChart3,       show: showMainFeatures },
    { key: 'goals',     label: '目标管理', icon: Target,          show: showMainFeatures },
    { key: 'export',    label: '导出数据', icon: Download,        show: showMainFeatures },
    { key: 'settings',  label: '设置',     icon: Settings,        show: showMainFeatures || isAdmin },
    // 小组功能：admin + super_admin
    { key: 'groups',    label: '小组管理', icon: Users2,          show: showAdminFeatures },
    { key: 'group-analysis', label: '小组分析', icon: BarChart3,  show: showAdminFeatures },
    { key: 'study-plans', label: '学习计划', icon: BookOpen,      show: showAdminFeatures },
    { key: 'announcements', label: '公告管理', icon: Megaphone,   show: showAdminFeatures },
    { key: 'big-dashboard', label: '数据大屏', icon: LineChart,   show: showAdminFeatures },
    // 日历：所有用户
    { key: 'calendar',  label: '学习日历', icon: Calendar,        show: showCalendar },
    // 后台：admin + super_admin
    { key: 'admin',     label: '后台管理', icon: Shield,          show: showAdminFeatures },
  ]
  const visibleNav = navItems.filter(n => n.show)

  // 移动端手势导航
  const goToPrev = () => {
    const idx = visibleNav.findIndex(n => n.key === view)
    if (idx > 0) { const p = visibleNav[idx - 1]; if (p.key === 'entry') setEditExam(null); setView(p.key) }
  }
  const goToNext = () => {
    const idx = visibleNav.findIndex(n => n.key === view)
    if (idx >= 0 && idx < visibleNav.length - 1) { const n = visibleNav[idx + 1]; if (n.key === 'entry') setEditExam(null); setView(n.key) }
  }

  return (
    <SwipeWrapper onSwipeLeft={goToNext} onSwipeRight={goToPrev}>
    <div className="min-h-screen flex flex-col md:flex-row bg-background">
      {/* 侧边栏 */}
      <aside className="hidden md:flex w-60 flex-col border-r border-border bg-sidebar/50 backdrop-blur-sm sticky top-0 h-screen">
        <div className="p-5 border-b border-border">
          <h1 className="text-lg font-bold tracking-tight">📊 成绩分析</h1>
          <p className="text-xs text-muted-foreground mt-1 truncate">
            {user.displayName || user.username}
            {isSuperAdmin && <span className="ml-1 text-amber-500">[超管]</span>}
            {user.role === 'admin' && <span className="ml-1 text-blue-500">[管理]</span>}
            {isTestUser && <span className="ml-1 text-cyan-500">[测试]</span>}
          </p>
        </div>
        <nav className="flex-1 p-3 space-y-1 overflow-y-auto">
          {visibleNav.map(item => {
            const Icon = item.icon
            return (
              <button
                key={item.key}
                onClick={() => {
                  if (item.key === 'entry') setEditExam(null)
                  setView(item.key)
                }}
                className={cn(
                  'w-full flex items-center gap-3 px-3 py-2 rounded-md text-sm font-medium transition-colors',
                  view === item.key
                    ? 'bg-primary text-primary-foreground'
                    : 'text-muted-foreground hover:bg-accent hover:text-accent-foreground'
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            )
          })}
        </nav>
        <div className="p-3 border-t border-border space-y-1">
          <div className="flex items-center justify-between px-3 py-1 text-xs text-muted-foreground">
            <span>通知 / 主题</span>
            <div className="flex items-center gap-1">
              <NotificationCenter />
              <ThemeToggle />
            </div>
          </div>
          <Button variant="ghost" size="sm" className="w-full justify-start text-muted-foreground" onClick={() => setLogoutConfirm(true)}>
            <LogOut className="h-4 w-4 mr-2" /> 退出登录
          </Button>
        </div>
      </aside>

      {/* 移动端顶部栏 */}
      <div className="md:hidden sticky top-0 z-30 flex items-center justify-between bg-sidebar/80 backdrop-blur-md border-b border-border px-4 py-3">
        <h1 className="text-base font-bold">📊 成绩分析</h1>
        <div className="flex items-center gap-2">
          <NotificationCenter />
          <ThemeToggle />
          <Button variant="ghost" size="icon" onClick={() => setLogoutConfirm(true)}>
            <LogOut className="h-4 w-4" />
          </Button>
        </div>
      </div>

      {/* 移动端底部导航 */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-sidebar/95 backdrop-blur-md border-t border-border grid overflow-x-auto" style={{ gridTemplateColumns: `repeat(${visibleNav.length}, minmax(56px, 1fr))` }}>
        {visibleNav.map(item => {
          const Icon = item.icon
          return (
            <button
              key={item.key}
              onClick={() => {
                if (item.key === 'entry') setEditExam(null)
                setView(item.key)
              }}
              className={cn(
                'flex flex-col items-center gap-0.5 py-2 text-[10px] font-medium min-w-[56px]',
                view === item.key ? 'text-primary' : 'text-muted-foreground'
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label.slice(0, 2)}
            </button>
          )
        })}
      </nav>

      {/* 主内容 */}
      <main className="flex-1 min-w-0 pb-20 md:pb-0">
        {isLoading && !isAdmin ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-muted-foreground">加载中...</div>
          </div>
        ) : error ? (
          <div className="flex items-center justify-center min-h-[60vh]">
            <div className="text-destructive">加载失败：{(error as Error).message}</div>
          </div>
        ) : (
          <>
            {view === 'dashboard' && showMainFeatures && <Dashboard exams={exams} user={user} onNavigate={setView} />}
            {view === 'entry' && showMainFeatures && <ExamEntry editExam={editExam} user={user} onDone={handleEntryDone} onCancel={() => setView('list')} />}
            {view === 'list' && showMainFeatures && <ExamList exams={exams} onEdit={handleEdit} onRefresh={() => queryClient.invalidateQueries({ queryKey: ['exams'] })} />}
            {view === 'charts' && showMainFeatures && <ChartsView exams={exams} />}
            {view === 'goals' && showMainFeatures && <GoalsView exams={exams} />}
            {view === 'export' && showMainFeatures && <ExportView exams={exams} />}
            {view === 'settings' && (showMainFeatures || isAdmin) && <SettingsView user={user} onUserUpdate={setUser} />}
            {view === 'groups' && isAdmin && <GroupsView onNavigate={(v, groupId) => { setSelectedGroupId(groupId); setView(v) }} />}
            {view === 'group-analysis' && isAdmin && <GroupAnalysisView selectedGroupId={selectedGroupId} />}
            {view === 'study-plans' && isAdmin && <StudyPlansView />}
            {view === 'announcements' && isAdmin && <AnnouncementsView isSuperAdmin={isSuperAdmin} />}
            {view === 'big-dashboard' && isAdmin && <DashboardView />}
            {view === 'calendar' && <CalendarView />}
            {view === 'admin' && isAdmin && <AdminView />}
          </>
        )}
      </main>

      {/* 登出确认 */}
      <Dialog open={logoutConfirm} onOpenChange={setLogoutConfirm}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>确认退出登录？</DialogTitle>
            <DialogDescription>退出后需要重新输入账号密码登录</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setLogoutConfirm(false)}>取消</Button>
            <Button variant="destructive" onClick={handleLogout}>退出登录</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
    </SwipeWrapper>
  )
}

// 手势导航包装组件（独立组件，避免 hooks 顺序问题）
function SwipeWrapper({ children, onSwipeLeft, onSwipeRight }: {
  children: React.ReactNode
  onSwipeLeft: () => void
  onSwipeRight: () => void
}) {
  const { showLeftIndicator, showRightIndicator } = useSwipeNavigation({ onSwipeLeft, onSwipeRight })
  return (
    <>
      <div className={`swipe-indicator right md:hidden ${showLeftIndicator ? 'show' : ''}`} />
      <div className={`swipe-indicator left md:hidden ${showRightIndicator ? 'show' : ''}`} />
      {children}
    </>
  )
}
