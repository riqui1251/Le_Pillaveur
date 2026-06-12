import { randomBytes } from 'crypto'
import { prisma } from '@/lib/prisma'

const CODE_CHARS = '23456789ABCDEFGHJKMNPQRSTUVWXYZ'
const CODE_LENGTH = 6
const CODE_PREFIX = 'LP-'

export function formatAccountCode(raw: string): string {
  const normalized = raw.replace(/^LP-?/i, '').toUpperCase().replace(/[^A-Z0-9]/g, '')
  if (!normalized) return ''
  return `${CODE_PREFIX}${normalized.slice(0, CODE_LENGTH)}`
}

function randomCodeBody(): string {
  const bytes = randomBytes(CODE_LENGTH)
  let out = ''
  for (let i = 0; i < CODE_LENGTH; i++) {
    out += CODE_CHARS[bytes[i] % CODE_CHARS.length]
  }
  return out
}

export function generateAccountCode(): string {
  return `${CODE_PREFIX}${randomCodeBody()}`
}

export async function createUniqueAccountCode(): Promise<string> {
  for (let attempt = 0; attempt < 12; attempt++) {
    const code = generateAccountCode()
    const existing = await prisma.user.findUnique({
      where: { accountCode: code },
      select: { id: true },
    })
    if (!existing) return code
  }
  throw new Error('Impossible de générer un code compte unique')
}

export async function ensureUserAccountCode(userId: string): Promise<string> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { accountCode: true },
  })
  if (user?.accountCode) return user.accountCode

  const accountCode = await createUniqueAccountCode()
  await prisma.user.update({
    where: { id: userId },
    data: { accountCode },
  })
  return accountCode
}
