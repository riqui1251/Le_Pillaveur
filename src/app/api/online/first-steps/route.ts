import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { apiError, withApiRoute } from '@/lib/api-route'
import { computeFirstSteps } from '@/lib/online/first-steps'

export const dynamic = 'force-dynamic'

/**
 * « Premiers pas » du compte connecté (carte de la page Compte) — voir
 * src/lib/online/first-steps.ts pour le pourquoi et les règles.
 *
 * XP, préférences et statut d'invité viennent déjà de la session : seules
 * deux questions partent en base, chacune bornée à UNE ligne (`select: id`),
 * et seulement quand la réponse n'est pas déjà connue.
 */
export const GET = withApiRoute('online/first-steps GET', async () => {
  const user = await getCurrentUser()
  if (!user) return apiError('auth_required', 401)

  const [hasFirstGame, playedWithHumans] = await Promise.all([
    // Avec de l'XP, l'étape « jouer » est déjà faite : inutile de demander le succès.
    user.onlineXp > 0
      ? Promise.resolve(false)
      : prisma.achievement
          .findUnique({
            where: { userId_type: { userId: user.id, type: 'first_game' } },
            select: { id: true },
          })
          .then((row) => row !== null),
    hasPlayedWithHumans(user.id),
  ])

  return NextResponse.json(
    computeFirstSteps({
      xp: user.onlineXp,
      prefs: user.onlinePreferences,
      isGuest: user.isGuest === true,
      hasFirstGame,
      playedWithHumans,
    })
  )
})

/**
 * Le compte a-t-il déjà partagé une table avec au moins un autre humain ?
 *
 * Deux sources, la plus complète d'abord :
 *  - le JOURNAL des parties (OnlineGameSession, depuis le 10/09/2026) : une
 *    ligne par partie LANCÉE, tous jeux confondus — y compris ceux sans
 *    classement (Dilemmes, Téléphone dessiné…) et les parties abandonnées ;
 *    `humanCount` y compte les sièges qui ne sont pas des bots ;
 *  - à défaut, les RÉSULTATS classés (OnlineMatchResult) : écrits seulement
 *    pour une partie terminée à deux comptes ou plus, mais plus anciens que
 *    le journal — un habitué d'août n'a sinon aucune trace.
 * La seconde requête ne part que si la première ne trouve rien.
 */
async function hasPlayedWithHumans(userId: string): Promise<boolean> {
  const session = await prisma.onlineGameSessionPlayer.findFirst({
    where: { userId, session: { humanCount: { gte: 2 } } },
    select: { id: true },
  })
  if (session) return true
  const match = await prisma.onlineMatchResult.findFirst({
    where: { userId, humanCount: { gte: 2 } },
    select: { id: true },
  })
  return match !== null
}
