import { NextRequest, NextResponse } from 'next/server'
import { db } from '@/lib/db'
import { getCurrentUser } from '@/lib/auth'
import { SubjectKey, ELECTIVE_OPTIONS, DEFAULT_ELECTIVE_SUBJECTS } from '@/lib/constants'

// 获取设置
export async function GET() {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })

    const dbUser = await db.user.findUnique({ where: { id: user.id } })
    if (!dbUser) return NextResponse.json({ success: false, error: '用户不存在' }, { status: 404 })

    return NextResponse.json({
      success: true,
      data: {
        electiveSubjects: dbUser.electiveSubjects ? JSON.parse(dbUser.electiveSubjects) : DEFAULT_ELECTIVE_SUBJECTS,
        customExamTypes: dbUser.customExamTypes ? JSON.parse(dbUser.customExamTypes) : [],
        displayName: dbUser.displayName,
      },
    })
  } catch (e) {
    console.error('GET /api/settings error:', e)
    return NextResponse.json({ success: false, error: '获取设置失败' }, { status: 500 })
  }
}

// 更新设置
export async function PUT(req: NextRequest) {
  try {
    const user = await getCurrentUser()
    if (!user) return NextResponse.json({ success: false, error: '未登录' }, { status: 401 })

    const body = await req.json() as {
      electiveSubjects?: SubjectKey[]
      customExamTypes?: Array<{ type: string; name: string; subjects: SubjectKey[] }>
      displayName?: string
    }

    const data: Record<string, unknown> = {}
    if (body.electiveSubjects !== undefined) {
      // 校验：必须是 ELECTIVE_OPTIONS 中的 3 个不同科目
      const valid = body.electiveSubjects.filter(s => ELECTIVE_OPTIONS.includes(s))
      const unique = Array.from(new Set(valid))
      if (unique.length !== 3) {
        return NextResponse.json({ success: false, error: '小三门必须选 3 门（物化生史地政 6 选 3）' }, { status: 400 })
      }
      data.electiveSubjects = JSON.stringify(unique)
    }
    if (body.customExamTypes !== undefined) {
      data.customExamTypes = JSON.stringify(body.customExamTypes)
    }
    if (body.displayName !== undefined) {
      data.displayName = body.displayName.trim() || null
    }

    const updated = await db.user.update({ where: { id: user.id }, data })
    return NextResponse.json({
      success: true,
      data: {
        electiveSubjects: updated.electiveSubjects ? JSON.parse(updated.electiveSubjects) : DEFAULT_ELECTIVE_SUBJECTS,
        customExamTypes: updated.customExamTypes ? JSON.parse(updated.customExamTypes) : [],
        displayName: updated.displayName,
      },
    })
  } catch (e) {
    console.error('PUT /api/settings error:', e)
    return NextResponse.json({ success: false, error: '保存设置失败' }, { status: 500 })
  }
}
