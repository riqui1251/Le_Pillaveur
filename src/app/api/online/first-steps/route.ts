import { NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getCurrentUser } from '@/lib/auth-server'
import { apiError, withApiRoute } from '@/lib/api-route'
import { PIONEER_FRAME_KEY } from '@/lib/online/cosmetics'
import {
  computeFirstSteps,
  earnsPioneerFrame,
  pioneerReward,
  type FirstStepsResponse,
} from '@/lib/online/first-steps'

export const dynamic = 'force-dynamic'

/**
 * « Premiers pas » du compte connecté (carte de la page Compte) — voir
 * src/lib/online/first-steps.ts pour le pourquoi et les règles.
 *
 * XP, préférences et statut d'invité viennent déjà de la session : seules
 * trois questions partent en base, chacune bornée à UNE ligne (`select: id`),
 * et seulement quand la réponse n'est pas déjà connue.
 *
 * Récompense : la route ACCORDE elle-même le cadre Pionnier quand la liste
 * est bouclée avant PIONEER_DEADLINE. Ici plutôt qu'au fil de chaque étape
 * (fin de partie, Collection, sauvegarde, montée de niveau) : c'est le seul
 * endroit où la liste entière est connue, et la carte qui l'annonce est
 * celle qui la demande. Une écriture au plus par compte, à vie : une fois la
 * ligne posée, la lecture préalable la trouve.
 */
export const GET = withApiRoute('online/first-steps GET', async () => {
  const user = await getCurrentUser()
  if (!user) return apiError('auth_required', 401)

  const [hasFirstGame, playedWithHumans, alreadyGranted] = await Promise.all([
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
    hasPioneerFrame(user.id),
  ])

  const steps = computeFirstSteps({
    xp: user.onlineXp,
    prefs: user.onlinePreferences,
    isGuest: user.isGuest === true,
    hasFirstGame,
    playedWithHumans,
  })

  // Déjà là : rendu tel quel, même après la date limite et même si une étape
  // s'est défaite depuis (effet retiré) — un cadre gagné ne se reprend pas.
  const granted = alreadyGranted || (earnsPioneerFrame(steps, new Date()) && (await grantPioneerFrame(user.id)))

  const body: FirstStepsResponse = { ...steps, reward: pioneerReward(granted) }
  return NextResponse.json(body)
})

/**
 * Le compte a-t-il déjà la ligne CosmeticGrant du cadre Pionnier ? Lecture
 * par la clé unique (userId, cosmeticKey) — qu'elle vienne de cette route ou
 * d'un octroi Fondateur, le cadre est à lui.
 */
async function hasPioneerFrame(userId: string): Promise<boolean> {
  const row = await prisma.cosmeticGrant.findUnique({
    where: { userId_cosmeticKey: { userId, cosmeticKey: PIONEER_FRAME_KEY } },
    select: { id: true },
  })
  return row !== null
}

/**
 * Pose la ligne du cadre Pionnier. `grantedById: null` : personne ne l'a
 * offert, le joueur l'a gagné (la Supervision le distingue ainsi d'un
 * octroi Fondateur). Deux onglets ouverts sur la fiche compte peuvent
 * arriver ici ensemble : le second bute sur la contrainte unique (P2002),
 * et c'est une réussite — le cadre est bien accordé.
 */
async function grantPioneerFrame(userId: string): Promise<boolean> {
  try {
    await prisma.cosmeticGrant.create({
      data: { userId, cosmeticKey: PIONEER_FRAME_KEY, grantedById: null },
      select: { id: true },
    })
  } catch (error) {
    if (!isUniqueViolation(error)) throw error
  }
  return true
}

/** Violation d'unicité Prisma : la ligne existe déjà. */
function isUniqueViolation(error: unknown): boolean {
  return Boolean(error) && typeof error === 'object' && (error as { code?: unknown }).code === 'P2002'
}

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
