import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'

export async function GET(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })
    const sp = req.nextUrl.searchParams
    const qUserId = sp.get('userId')
    const qGroupId = sp.get('groupId')
    let result = null
    if (qGroupId) {
      const s = await db.nextExamSetting.findFirst({ where: { groupId: qGroupId } })
      if (s) result = { scope: 'group', examDate: s.examDate.toISOString(), examName: s.examName, source: 'group' }
    } else if (qUserId) {
      const s = await db.nextExamSetting.findFirst({ where: { userId: qUserId } })
      if (s) result = { scope: 'user', examDate: s.examDate.toISOString(), examName: s.examName, source: 'user' }
    } else {
      const mySetting = await db.nextExamSetting.findFirst({ where: { userId: user.id } })
      if (mySetting) result = { scope: 'user', examDate: mySetting.examDate.toISOString(), examName: mySetting.examName, source: 'user' }
      else {
        const groupIds = (await db.groupMember.findMany({ where: { userId: user.id }, select: { groupId: true } })).map(g => g.groupId)
        if (groupIds.length > 0) {
          const gs = await db.nextExamSetting.findFirst({ where: { groupId: { in: groupIds } } })
          if (gs) result = { scope: 'group', examDate: gs.examDate.toISOString(), examName: gs.examName, source: 'group' }
        }
      }
    }
    return NextResponse.json({ success: true, data: result })
  } catch { return NextResponse.json({ success: false, error: '获取失败' }, { status: 500 }) }
}

export async function POST(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })
    const body = await req.json() as { scope: 'user' | 'group'; userId?: string; groupId?: string; examDate: string; examName?: string }
    if (!body.examDate) return NextResponse.json({ success: false, error: '请填写考试日期' }, { status: 400 })
    if (body.scope === 'user') {
      const targetUserId = (user.role === 'admin' || user.role === 'super_admin') ? body.userId : user.id
      if (!targetUserId) return NextResponse.json({ success: false, error: '缺少 userId' }, { status: 400 })
      const existing = await db.nextExamSetting.findFirst({ where: { userId: targetUserId } })
      if (existing) await db.nextExamSetting.update({ where: { id: existing.id }, data: { examDate: new Date(body.examDate), examName: body.examName ?? null } })
      else await db.nextExamSetting.create({ data: { scope: 'user', userId: targetUserId, examDate: new Date(body.examDate), examName: body.examName ?? null } })
    } else if (body.scope === 'group') {
      if (user.role !== 'admin' && user.role !== 'super_admin') return NextResponse.json({ success: false, error: '无权限' }, { status: 403 })
      if (!body.groupId) return NextResponse.json({ success: false, error: '缺少 groupId' }, { status: 400 })
      if (user.role === 'admin') {
        const owned = await db.group.findFirst({ where: { id: body.groupId, creatorId: user.id } })
        const viewer = await db.groupViewer.findUnique({ where: { groupId_userId: { groupId: body.groupId, userId: user.id } } })
        if (!owned && !viewer) return NextResponse.json({ success: false, error: '只能给自己管理的小组设置' }, { status: 403 })
      }
      const existing = await db.nextExamSetting.findFirst({ where: { groupId: body.groupId } })
      if (existing) await db.nextExamSetting.update({ where: { id: existing.id }, data: { examDate: new Date(body.examDate), examName: body.examName ?? null } })
      else await db.nextExamSetting.create({ data: { scope: 'group', groupId: body.groupId, examDate: new Date(body.examDate), examName: body.examName ?? null } })
    }
    return NextResponse.json({ success: true })
  } catch { return NextResponse.json({ success: false, error: '保存失败' }, { status: 500 }) }
}

export async function DELETE(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })
    const sp = req.nextUrl.searchParams
    const scope = sp.get('scope') as 'user' | 'group' | null
    const targetId = sp.get('targetId')
    if (!scope || !targetId) return NextResponse.json({ success: false, error: '缺少参数' }, { status: 400 })
    if (scope === 'user') {
      const targetUserId = (user.role === 'admin' || user.role === 'super_admin') ? targetId : user.id
      await db.nextExamSetting.deleteMany({ where: { userId: targetUserId } })
    } else if (scope === 'group') {
      if (user.role !== 'admin' && user.role !== 'super_admin') return NextResponse.json({ success: false, error: '无权限' }, { status: 403 })
      await db.nextExamSetting.deleteMany({ where: { groupId: targetId } })
    }
    return NextResponse.json({ success: true })
  } catch { return NextResponse.json({ success: false, error: '删除失败' }, { status: 500 }) }
}
