import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

// 删除单条通知
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id } = await params
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })

    await db.notification.deleteMany({ where: { id, userId: user.id } })
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('DELETE /api/notifications/[id] error:', e)
    return NextResponse.json({ success: false, error: '删除失败' }, { status: 500 })
  }
}
