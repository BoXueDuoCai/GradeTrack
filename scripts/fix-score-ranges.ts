// 一次性脚本：修正数据库中超过满分的数据
// - rawScore > fullScore 的，clamp 到 fullScore
// - assignedScore > 70 的，clamp 到 70
// - assignedScore < 40 的，clamp 到 40

import { db } from '@/lib/db'

async function main() {
  console.log('开始清理数据...')

  const scores = await db.subjectScore.findMany()
  let fixed = 0

  for (const s of scores) {
    const patch: Record<string, number | null> = {}
    if (s.rawScore != null && s.fullScore != null && s.rawScore > s.fullScore) {
      patch.rawScore = s.fullScore
    }
    if (s.rawScore != null && s.rawScore < 0) {
      patch.rawScore = 0
    }
    if (s.assignedScore != null && s.assignedScore > 70) {
      patch.assignedScore = 70
    }
    if (s.assignedScore != null && s.assignedScore < 40) {
      patch.assignedScore = 40
    }
    if (Object.keys(patch).length > 0) {
      await db.subjectScore.update({ where: { id: s.id }, data: patch })
      fixed++
      console.log(`  Fixed score ${s.id}: ${JSON.stringify(patch)}`)
    }
  }

  // 修正小分超满分
  const subScores = await db.subScore.findMany()
  let subFixed = 0
  for (const ss of subScores) {
    const patch: Record<string, number | null> = {}
    if (ss.score != null && ss.fullScore != null && ss.score > ss.fullScore) {
      patch.score = ss.fullScore
    }
    if (ss.score != null && ss.score < 0) {
      patch.score = 0
    }
    if (Object.keys(patch).length > 0) {
      await db.subScore.update({ where: { id: ss.id }, data: patch })
      subFixed++
    }
  }

  console.log(`✓ 已修正 ${fixed} 条科目成绩`)
  console.log(`✓ 已修正 ${subFixed} 条小分`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await db.$disconnect() })
