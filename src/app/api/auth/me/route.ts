import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'

export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) {
      return NextResponse.json({ success: true, data: null })
    }
    return NextResponse.json({ success: true, data: user })
  } catch (e) {
    console.error('GET /api/auth/me error:', e)
    return NextResponse.json({ success: false, error: '获取用户信息失败' }, { status: 500 })
  }
}
