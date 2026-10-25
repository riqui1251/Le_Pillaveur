/**
 * Promeut au rôle « fondateur » UN compte désigné exactement : son e-mail
 * (comparé sans casse) ou son id. Jamais par pseudo : un pseudo se choisit à
 * l'inscription, n'importe qui pouvait prendre « Riqui1251 », libéré par le
 * renommage du fondateur, et se faire nommer fondateur à la relance suivante.
 * Ne renomme plus rien : le pseudo se change depuis le site, qui en vérifie
 * l'unicité.
 *
 * Usage : node scripts/bootstrap-admin.mjs <email|id> [--force]
 *   --force : promouvoir même si un autre fondateur existe déjà.
 */
import { pathToFileURL } from 'node:url'
import { PrismaClient } from '@prisma/client'

const USAGE = 'Usage : node scripts/bootstrap-admin.mjs <email|id> [--force]'

/** Arguments de la ligne de commande, ou null s'ils sont invalides. */
export function parseBootstrapArgs(argv) {
  const flags = argv.filter((arg) => arg.startsWith('-'))
  const positional = argv.filter((arg) => !arg.startsWith('-'))
  if (flags.some((flag) => flag !== '--force') || positional.length !== 1) return null
  const target = positional[0].trim()
  if (!target) return null
  return { target, force: flags.includes('--force') }
}

/**
 * Promotion elle-même, sur le client Prisma reçu. Renvoie le résultat sans
 * rien afficher : `{ status: 'promoted' | 'already', user }`, ou un refus
 * `{ status: 'not_found' | 'ambiguous' | 'guest' | 'founder_exists' }`.
 */
export async function bootstrapFounder(prisma, { target, force }) {
  const matches = target.includes('@')
    ? await prisma.$queryRaw`SELECT "id" FROM "User" WHERE lower("email") = lower(${target})`
    : await prisma.user.findMany({ where: { id: target }, select: { id: true } })

  if (matches.length === 0) return { status: 'not_found' }
  if (matches.length > 1) return { status: 'ambiguous', count: matches.length }

  const user = await prisma.user.findUnique({
    where: { id: matches[0].id },
    select: { id: true, email: true, displayName: true, role: true, isGuest: true },
  })
  if (!user) return { status: 'not_found' }
  if (user.isGuest) return { status: 'guest' }
  if (user.role === 'fondateur') return { status: 'already', user }

  const otherFounders = await prisma.user.count({
    where: { role: 'fondateur', id: { not: user.id } },
  })
  if (otherFounders > 0 && !force) return { status: 'founder_exists', count: otherFounders }

  const updated = await prisma.user.update({
    where: { id: user.id },
    data: { role: 'fondateur' },
    select: { id: true, email: true, displayName: true, role: true },
  })
  return { status: 'promoted', user: updated }
}

const REFUSALS = {
  not_found: 'Aucun compte pour cet e-mail ou cet id. Crée d\'abord ton compte sur /compte.',
  ambiguous: 'Plusieurs comptes répondent à cette adresse : rien n\'est fait, désigne le compte par son id.',
  guest: 'Ce compte est un invité : il ne peut pas devenir fondateur.',
  founder_exists: 'Un fondateur existe déjà : rien n\'est fait (--force pour en nommer un autre).',
}

async function main() {
  const args = parseBootstrapArgs(process.argv.slice(2))
  if (!args) {
    console.error(USAGE)
    process.exit(2)
  }

  const prisma = new PrismaClient()
  try {
    const result = await bootstrapFounder(prisma, args)
    if (result.status !== 'promoted' && result.status !== 'already') {
      console.error(REFUSALS[result.status])
      process.exitCode = 1
      return
    }
    console.log(result.status === 'already' ? 'Compte déjà fondateur :' : 'Compte fondateur configuré :')
    console.log(`  id:          ${result.user.id}`)
    console.log(`  email:       ${result.user.email}`)
    console.log(`  displayName: ${result.user.displayName}`)
    console.log(`  role:        ${result.user.role}`)
  } finally {
    await prisma.$disconnect()
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((e) => {
    console.error(e)
    process.exit(1)
  })
}
