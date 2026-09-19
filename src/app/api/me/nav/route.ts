import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { countChatUnread } from '@/lib/chat-unread-server'
import { listFriends } from '@/lib/friends'
import { progressForXp } from '@/lib/online/cosmetics'
import { GET as getPresenceCount } from '@/app/api/presence/count/route'
import type { NavBadges } from '@/hooks/useNavBadges'

export const dynamic = 'force-dynamic'

/**
 * Tout ce que la barre de navigation affiche pour un compte connecté, en UNE
 * requête. Elle en faisait cinq à chaque chargement de page (non-lus,
 * progression, amis, demandes, joueurs actifs) — sur un téléphone en soirée,
 * chacune coûte de la batterie, et toutes tombent sur le même serveur.
 *
 * Chaque champ garde le calcul de la route d'origine, sans en recopier la
 * logique : non-lus par `countChatUnread` (/api/chat/unread), amis en ligne
 * par `listFriends` (/api/friends, définition partagée de presence.ts),
 * joueurs actifs par la route publique elle-même (son cache de 15 s inclus).
 *
 * Rien d'autrui hors des nombres, à une exception près : les clés de
 * `unread.friends` sont les userId des amis ACCEPTÉS de l'appelant (contrat
 * de /api/chat/unread, nécessaire au badge par conversation du panneau) —
 * jamais de pseudo, d'e-mail ni d'IP. La liste d'amis, elle, ne se charge
 * qu'à l'ouverture du panneau.
 */
export async function GET() {
  const user = await getCurrentUser()
  // Code stable, jamais affiché : le client ignore toute réponse en erreur.
  if (!user) return NextResponse.json({ error: 'auth_required' }, { status: 401 })

  const [unread, friends, pendingRequests, presence] = await Promise.all([
    countChatUnread(user.id),
    listFriends(user.id),
    // Même filtre que `listPendingRequests().incoming` (friends.ts) — on ne
    // veut que le nombre, pas les demandeurs.
    prisma.friendship.count({ where: { addresseeId: user.id, status: 'pending' } }),
    getPresenceCount().then((res) => res.json() as Promise<{ count?: number }>),
  ])

  const body: NavBadges = {
    unread,
    pendingRequests,
    friendsOnline: friends.filter((f) => f.isOnline).length,
    // La barre n'affiche que le niveau : pur calcul sur l'XP déjà en session,
    // aucune lecture de plus (cosmétiques et série restent à /api/online/progression).
    progression: { level: progressForXp(user.onlineXp).level },
    presenceCount: typeof presence.count === 'number' ? presence.count : null,
  }
  return NextResponse.json(body, { headers: { 'Cache-Control': 'no-store' } })
}
