import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { onlineSince } from '@/lib/presence'

export const dynamic = 'force-dynamic'

/** Cache mémoire : la navbar de chaque visiteur poll — on ne compte qu'une fois par 15 s. */
const CACHE_MS = 15 * 1000

let cached: { count: number; at: number } | null = null

/**
 * Nombre de joueurs actifs sur le site — public. Deux sources combinées,
 * sur la fenêtre « en ligne » partagée (presence.ts) :
 *  - comptes connectés via User.lastSeenAt (mis à jour au ping même SANS
 *    consentement analytics — intérêt légitime) ;
 *  - navigateurs actifs dont le dernier compte vu (SitePresence.userId) n'est
 *    pas lui-même dans la fenêtre (SitePresence, écrite seulement avec
 *    consentement — les non-consentants anonymes ne sont pas comptés, RGPD).
 * Chaque navigateur actif est compté UNE fois : par son compte s'il est en
 * ligne, sinon comme anonyme. Un navigateur resté ouvert après la perte de sa
 * session redevient anonyme dès que son compte sort de la fenêtre (il n'était
 * compté nulle part), et un onglet déconnecté d'un compte actif ailleurs ne
 * compte pas une deuxième fois ce joueur. Borne basse assumée : un tiers sur
 * ce navigateur partagé n'est pas compté pendant ce temps.
 */
export async function GET() {
  const now = Date.now()
  if (cached && now - cached.at < CACHE_MS) {
    return NextResponse.json({ count: cached.count })
  }
  try {
    const cutoff = onlineSince(now)
    const [onlineAccounts, recentBrowsers] = await Promise.all([
      prisma.user.findMany({ where: { lastSeenAt: { gte: cutoff } }, select: { id: true } }),
      // Rapprochement fait en JS, sur les seuls navigateurs de la fenêtre
      // (quelques lignes).
      prisma.sitePresence.findMany({
        where: { lastSeen: { gte: cutoff } },
        select: { userId: true },
      }),
    ])
    const onlineIds = new Set(onlineAccounts.map((u) => u.id))
    const anonymous = recentBrowsers.filter((p) => !(p.userId && onlineIds.has(p.userId))).length
    const count = onlineIds.size + anonymous
    cached = { count, at: now }
    return NextResponse.json({ count })
  } catch {
    // Le cache est alimenté MÊME en échec : la vitrine rend ce compteur à
    // chaque visite, et sans ça une base indisponible ferait retenter deux
    // requêtes à chaque rendu — le pic de trafic qui accompagne une panne.
    cached = { count: cached?.count ?? 0, at: now }
    return NextResponse.json({ count: cached.count })
  }
}
