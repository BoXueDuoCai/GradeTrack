// 初始化超级管理员 + 测试用户

import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'

async function main() {
  // 1. 确保 administrator 是 super_admin
  const admin = await db.user.upsert({
    where: { username: 'administrator' },
    update: { role: 'super_admin' },
    create: {
      username: 'administrator',
      password: await hashPassword('admin@bxdc'),
      role: 'super_admin',
      displayName: '超级管理员',
    },
  })
  console.log('✓ Super admin ready:', admin.username)

  // 2. 创建/更新 test 用户（test_user 角色，密码 test123456）
  const testUser = await db.user.upsert({
    where: { username: 'test' },
    update: { role: 'test_user' },
    create: {
      username: 'test',
      password: await hashPassword('test123456'),
      role: 'test_user',
      displayName: '测试用户',
      mustChangePassword: false,
    },
  })
  console.log('✓ Test user ready:', testUser.username, '(password: test123456)')

  // 3. 清理过期 session
  await db.session.deleteMany({ where: { expiresAt: { lt: new Date() } } })
  console.log('✓ Expired sessions cleaned')
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(async () => {
    await db.$disconnect()
  })
