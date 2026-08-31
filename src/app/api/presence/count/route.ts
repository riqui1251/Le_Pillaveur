import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'

export const dynamic = 'force-dynamic'

/** Même fenêtre que le statut « en ligne » des amis (friends.ts) ; le ping client tourne toutes les 60 s. */
const ONLINE_WINDOW_MS = 2 * 60 * 1000
/** Cache mémoire : la navbar de chaque visiteur poll — on ne compte qu'une fois par 15 s. */
const CACHE_MS = 15 * 1000

let cached: { count: number; at: number } | null = null

/**
 * Nombre de joueurs actifs sur le site — public. Deux sources combinées,
 * sans double compte :
 *  - comptes connectés via User.lastSeenAt (mis à jour au ping même SANS
 *    consentement analytics — intérêt légitime) ;
 *  - visiteurs anonymes via SitePresence sans userId (écrit seulement avec
 *    consentement — les non-consentants anonymes ne sont pas comptés, RGPD).
 */
export async function GET() {
  const now = Date.now()
  if (cached && now - cached.at < CACHE_MS) {
    return NextResponse.json({ count: cached.count })
  }
  try {
    const cutoff = new Date(now - ONLINE_WINDOW_MS)
    const [accounts, anonymous] = await Promise.all([
      prisma.user.count({ where: { lastSeenAt: { gt: cutoff } } }),
      prisma.sitePresence.count({ where: { lastSeen: { gt: cutoff }, userId: null } }),
    ])
    const count = accounts + anonymous
    cached = { count, at: now }
    return NextResponse.json({ count })
  } catch {
    return NextResponse.json({ count: cached?.count ?? 0 })
  }
}
