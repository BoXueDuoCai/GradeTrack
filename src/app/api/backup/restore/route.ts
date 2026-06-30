import { NextRequest, NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { writeFileSync, mkdirSync } from 'fs'
import { join, dirname } from 'path'

// 超管恢复数据库（上传 .db 文件覆盖）
export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })
    if (user.role !== 'super_admin') {
      return NextResponse.json({ success: false, error: '仅超级管理员可恢复' }, { status: 403 })
    }

    const formData = await req.formData()
    const file = formData.get('file') as File | null
    if (!file) {
      return NextResponse.json({ success: false, error: '未提供文件' }, { status: 400 })
    }

    // 简单校验：文件名后缀
    if (!file.name.toLowerCase().endsWith('.db')) {
      return NextResponse.json({ success: false, error: '请上传 .db 文件' }, { status: 400 })
    }

    const buf = Buffer.from(await file.arrayBuffer())
    const dbPath = join(process.cwd(), 'db', 'custom.db')
    mkdirSync(dirname(dbPath), { recursive: true })
    writeFileSync(dbPath, buf)

    return NextResponse.json({
      success: true,
      data: {
        size: buf.length,
        message: '数据库已恢复，建议刷新页面并重新登录',
      },
    })
  } catch (e) {
    console.error('POST /api/backup/restore error:', e)
    return NextResponse.json({ success: false, error: '恢复失败' }, { status: 500 })
  }
}
