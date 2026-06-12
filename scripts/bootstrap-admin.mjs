/**
 * Promouvoir le compte Riqui en fondateur et renommer Riqui1251 → Riqui.
 * Usage: node scripts/bootstrap-admin.mjs
 */
import { PrismaClient } from '@prisma/client'

const prisma = new PrismaClient()

async function main() {
  const candidates = await prisma.user.findMany({
    where: {
      OR: [
        { displayName: { equals: 'Riqui1251' } },
        { displayName: { equals: 'Riqui' } },
        { name: { equals: 'Riqui1251' } },
        { email: { contains: 'riqui' } },
      ],
      passwordHash: { not: '' },
    },
    orderBy: { createdAt: 'asc' },
  })

  if (candidates.length === 0) {
    console.error('Aucun compte trouvé (Riqui1251 / Riqui / email *riqui*).')
    console.error('Crée d\'abord ton compte sur /compte puis relance ce script.')
    process.exit(1)
  }

  const user = candidates.find((u) => u.displayName === 'Riqui1251') ?? candidates[0]

  await prisma.$executeRaw`
    UPDATE "User"
    SET "displayName" = 'Riqui', "name" = 'Riqui', "role" = 'fondateur', "updatedAt" = CURRENT_TIMESTAMP
    WHERE "id" = ${user.id}
  `

  const updated = await prisma.user.findUnique({ where: { id: user.id } })

  console.log('Compte fondateur configuré :')
  console.log(`  id:          ${updated?.id}`)
  console.log(`  email:       ${updated?.email}`)
  console.log(`  displayName: Riqui`)
  console.log(`  role:        fondateur`)
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
