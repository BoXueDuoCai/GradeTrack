'use client'

import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Bell, Check, CheckCheck, Trash2, Megaphone, Calendar } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import {
  Popover, PopoverContent, PopoverTrigger,
} from '@/components/ui/popover'
import { ScrollArea } from '@/components/ui/scroll-area'
import { formatDateCN } from './types'
import { toast } from 'sonner'
import { cn } from '@/lib/utils'

interface NotificationItem {
  id: string
  kind: 'notification' | 'announcement'
  type: string
  title: string
  content: string | null
  link?: string | null
  authorName?: string
  scope?: string
  targetName?: string | null
  isRead: boolean
  createdAt: string
}

interface NotificationCenterProps {
  onNavigate?: (view: string) => void
}

export function NotificationCenter({ onNavigate }: NotificationCenterProps) {
  const queryClient = useQueryClient()
  const [open, setOpen] = useState(false)

  const { data } = useQuery({
    queryKey: ['notifications'],
    queryFn: async () => {
      const res = await fetch('/api/notifications')
      const j = await res.json()
      if (!j.success) throw new Error(j.error)
      return j.data as { notifications: NotificationItem[]; unreadCount: number }
    },
    refetchInterval: 30000, // 30秒刷新一次
  })

  const unreadCount = data?.unreadCount ?? 0
  const notifications = data?.notifications ?? []

  const markAllRead = async () => {
    try {
      await fetch('/api/notifications', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'read_all' }),
      })
      queryClient.invalidateQueries({ queryKey: ['notifications'] })
      toast.success('已全部标为已读')
    } catch (e) {
      toast.error((e as Error).message)
    }
  }

  const markOneRead = async (n: NotificationItem) => {
    if (n.isRead) return
    await fetch('/api/notifications', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ action: 'read_one', id: n.id, kind: n.kind }),
    })
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }

  const deleteOne = async (n: NotificationItem) => {
    if (n.kind !== 'notification') return // 公告不能删
    await fetch(`/api/notifications/${n.id}`, { method: 'DELETE' })
    queryClient.invalidateQueries({ queryKey: ['notifications'] })
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative">
          <Bell className="h-4 w-4" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 bg-red-500 text-white text-[10px] font-bold rounded-full min-w-[16px] h-[16px] flex items-center justify-center px-1">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-96 p-0" align="end">
        <div className="flex items-center justify-between p-3 border-b border-border">
          <div className="flex items-center gap-2">
            <Bell className="h-4 w-4" />
            <span className="font-semibold text-sm">通知中心</span>
            {unreadCount > 0 && <Badge variant="destructive" className="text-xs">{unreadCount} 未读</Badge>}
          </div>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" onClick={markAllRead} className="h-7 text-xs">
              <CheckCheck className="h-3.5 w-3.5 mr-1" /> 全部已读
            </Button>
          )}
        </div>
        <ScrollArea className="h-[400px]">
          {notifications.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">暂无通知</div>
          ) : (
            <div className="divide-y divide-border">
              {notifications.map(n => (
                <div
                  key={`${n.kind}-${n.id}`}
                  className={cn(
                    'p-3 hover:bg-accent/30 cursor-pointer transition-colors',
                    !n.isRead && 'bg-primary/5'
                  )}
                  onClick={() => markOneRead(n)}
                >
                  <div className="flex items-start gap-2">
                    <div className="mt-0.5">
                      {n.kind === 'announcement' ? (
                        <Megaphone className="h-4 w-4 text-amber-500" />
                      ) : n.type === 'goal_due_soon' ? (
                        <Calendar className="h-4 w-4 text-blue-500" />
                      ) : (
                        <Bell className="h-4 w-4 text-muted-foreground" />
                      )}
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2">
                        <span className={cn('text-sm font-medium truncate', !n.isRead && 'font-bold')}>
                          {n.title}
                        </span>
                        {!n.isRead && <span className="w-1.5 h-1.5 rounded-full bg-blue-500 flex-shrink-0" />}
                      </div>
                      {n.content && (
                        <p className="text-xs text-muted-foreground mt-1 line-clamp-2 whitespace-pre-wrap">{n.content}</p>
                      )}
                      <div className="flex items-center justify-between mt-1">
                        <div className="flex items-center gap-1 text-[10px] text-muted-foreground">
                          {n.authorName && <Badge variant="outline" className="text-[10px] h-4">{n.authorName}</Badge>}
                          {n.scope === 'group' && n.targetName && <span className="text-[10px]">→ {n.targetName}</span>}
                          {n.scope === 'user' && n.targetName && <span className="text-[10px]">→ 你</span>}
                          <span>{formatDateCN(n.createdAt)}</span>
                        </div>
                        {n.kind === 'notification' && (
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-5 w-5 opacity-50 hover:opacity-100"
                            onClick={(e) => { e.stopPropagation(); deleteOne(n) }}
                          >
                            <Trash2 className="h-3 w-3" />
                          </Button>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </PopoverContent>
    </Popover>
  )
}
