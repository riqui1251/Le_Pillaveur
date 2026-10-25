/**
 * Calcule User.displayNameKey et User.onlineDisplayNameKey (clé d'unicité des
 * pseudos : src/lib/name-moderation/confusables.ts) de chaque compte dont la
 * clé manque ou diffère. La migration 20261025120000_display_name_keys ne
 * remplit que les pseudos en ASCII ; ce script fait les autres (accents,
 * autres alphabets) et rattrape une clé laissée périmée par l'ancien code
 * (retour arrière sur le-pillaveur:previous). Relançable sans risque.
 * Signale aussi, sans y toucher, les comptes actifs qui partagent une clé :
 * des homonymes acceptés avant le correctif.
 *
 * Usage : node scripts/backfill-display-name-keys.mjs
 * (Node 22.18 ou plus ; dès 22.6 avec --experimental-strip-types : la clé
 * vient d'un module TypeScript, chargé tel quel)
 */
/* eslint-disable no-console -- script d'exploitation : sa sortie s'adresse à l'opérateur */
import { pathToFileURL } from 'node:url'
import { PrismaClient } from '@prisma/client'
import { displayNameKey } from '../src/lib/name-moderation/confusables.ts'

const BATCH_SIZE = 100

function onlineKeyOf(name) {
  return name === null ? null : displayNameKey(name)
}

/** Écritures à faire : `{ id, data }` pour chaque compte dont une clé manque ou diffère. */
export function planDisplayNameKeyUpdates(users) {
  const updates = []
  for (const user of users) {
    const data = {}
    const key = displayNameKey(user.displayName)
    if (user.displayNameKey !== key) data.displayNameKey = key
    const onlineKey = onlineKeyOf(user.name)
    if (user.onlineDisplayNameKey !== onlineKey) data.onlineDisplayNameKey = onlineKey
    if (Object.keys(data).length > 0) updates.push({ id: user.id, data })
  }
  return updates
}

/** Clés portées par plusieurs comptes de `activeIds` : `[clé, ids]`. */
export function findSharedDisplayNameKeys(users, activeIds) {
  const owners = new Map()
  for (const user of users) {
    if (!activeIds.has(user.id)) continue
    for (const key of new Set([displayNameKey(user.displayName), onlineKeyOf(user.name)])) {
      if (!key) continue
      const ids = owners.get(key) ?? new Set()
      ids.add(user.id)
      owners.set(key, ids)
    }
  }
  return [...owners]
    .filter(([, ids]) => ids.size > 1)
    .map(([key, ids]) => [key, [...ids]])
}

async function main() {
  const prisma = new PrismaClient()
  try {
    const users = await prisma.user.findMany({
      select: { id: true, displayName: true, name: true, displayNameKey: true, onlineDisplayNameKey: true },
    })
    const updates = planDisplayNameKeyUpdates(users)
    for (let i = 0; i < updates.length; i += BATCH_SIZE) {
      await prisma.$transaction(
        updates
          .slice(i, i + BATCH_SIZE)
          .map(({ id, data }) => prisma.user.update({ where: { id }, data }))
      )
    }
    console.log(`Clés de pseudo : ${updates.length} compte(s) mis à jour sur ${users.length}.`)

    // Même définition d'un compte actif que isDisplayNameTaken (src/lib/display-name.ts).
    const active = await prisma.user.findMany({
      where: { OR: [{ passwordHash: { not: '' } }, { email: { not: null } }, { isGuest: true }] },
      select: { id: true },
    })
    const shared = findSharedDisplayNameKeys(users, new Set(active.map((user) => user.id)))
    if (shared.length === 0) {
      console.log('Aucun homonyme parmi les comptes actifs.')
      return
    }
    console.log(`${shared.length} pseudo(s) partagé(s) par plusieurs comptes actifs (laissés tels quels) :`)
    for (const [key, ids] of shared) console.log(`  « ${key} » : ${ids.join(', ')}`)
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
