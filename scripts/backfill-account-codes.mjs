/**
 * Attribue un code LP-XXXXXX à chaque compte qui n'en a pas encore.
 * Usage: node scripts/backfill-account-codes.mjs
 */
import { PrismaClient } from '@prisma/client'
import { randomBytes } from 'crypto'

const prisma = new PrismaClient()
const CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'

function randomCode() {
  const bytes = randomBytes(6)
  let body = ''
  for (let i = 0; i < 6; i++) body += CODE_CHARS[bytes[i] % CODE_CHARS.length]
  return `LP-${body}`
}

async function main() {
  const users = await prisma.user.findMany({
    where: {
      passwordHash: { not: '' },
      email: { not: null },
      accountCode: null,
    },
    select: { id: true, displayName: true, email: true },
  })

  if (users.length === 0) {
    console.log('Tous les comptes ont déjà un code.')
    return
  }

  for (const user of users) {
    let code = null
    for (let i = 0; i < 12; i++) {
      const candidate = randomCode()
      const clash = await prisma.user.findUnique({ where: { accountCode: candidate } })
      if (!clash) {
        code = candidate
        break
      }
    }
    if (!code) {
      console.error(`Échec pour ${user.email}`)
      continue
    }
    await prisma.user.update({ where: { id: user.id }, data: { accountCode: code } })
    console.log(`${user.displayName} (${user.email}) → ${code}`)
  }
}

main()
  .catch((e) => {
    console.error(e)
    process.exit(1)
  })
  .finally(() => prisma.$disconnect())
