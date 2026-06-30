// 一次性脚本：更新 test 用户密码为 test123456

import { db } from '@/lib/db'
import { hashPassword } from '@/lib/auth'

async function main() {
  const updated = await db.user.update({
    where: { username: 'test' },
    data: {
      password: await hashPassword('test123456'),
      role: 'test_user',
      mustChangePassword: false,
    },
  })
  console.log('✓ test user password updated to test123456')
  console.log('  id:', updated.id)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(async () => { await db.$disconnect() })
