import { NextResponse } from 'next/server'
import { getCurrentUser } from '@/lib/auth'
import { readFileSync } from 'fs'
import { join } from 'path'

// 超管下载数据库文件（SQLite 整库备份）
export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })
    if (user.role !== 'super_admin') {
      return NextResponse.json({ success: false, error: '仅超级管理员可备份' }, { status: 403 })
    }

    const dbPath = join(process.cwd(), 'db', 'custom.db')
    let buf: Buffer
    try {
      buf = readFileSync(dbPath)
    } catch {
      return NextResponse.json({ success: false, error: '数据库文件不存在' }, { status: 404 })
    }

    const filename = `score_backup_${new Date().toISOString().slice(0, 10)}.db`
    return new NextResponse(buf, {
      headers: {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    })
  } catch (e) {
    console.error('GET /api/backup/download error:', e)
    return NextResponse.json({ success: false, error: '备份失败' }, { status: 500 })
  }
}
