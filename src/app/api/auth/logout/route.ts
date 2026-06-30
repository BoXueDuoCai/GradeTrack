import { NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { clearSessionCookie, SESSION_COOKIE } from '@/lib/auth'
import { cookies } from 'next/headers'

export async function POST() {
  try {
    const cookieStore = await cookies()
    const token = cookieStore.get(SESSION_COOKIE)?.value
    if (token) {
      await db.session.deleteMany({ where: { token } })
    }
    await clearSessionCookie()
    return NextResponse.json({ success: true })
  } catch (e) {
    console.error('POST /api/auth/logout error:', e)
    return NextResponse.json({ success: false, error: '登出失败' }, { status: 500 })
  }
}
