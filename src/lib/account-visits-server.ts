import { prisma } from '@/lib/prisma'
import type { DeviceKind } from '@/lib/device-from-user-agent'

/**
 * VISITES D'UN COMPTE (lot 6) — écriture, à chaque battement.
 *
 * Une visite est la « session » de l'exploitant : une suite de battements
 * (page visible et utilisée, voir src/lib/heartbeat.ts) séparés de moins de
 * 30 min, rattachée au COMPTE, tous onglets et appareils confondus. Ce n'est
 * pas une Session (jeton d'authentification de 30 jours, sans mesure d'usage).
 *
 * Appelée par POST /api/analytics/ping seulement quand planPing le prévoit :
 * battement, session valide, consentement aux statistiques de visite ('2') et
 * rôle 'user' — le staff n'est jamais suivi.
 *
 * Anti double comptage : chaque battement ne crédite que l'écart RÉEL depuis
 * le dernier battement crédité de la visite (lastBeatAt), quel que soit
 * l'onglet ou l'appareil qui l'a émis. Deux onglets décalés de 30 s
 * créditent donc 30 + 30 = 60 s par minute, et non 120 s comme l'ancien
 * incrément fixe de totalPresenceSeconds.
 *
 * Aucune donnée ici au-delà du modèle : ni IP, ni URL, ni jeu, ni pseudo, ni
 * visitorId — deux booléens (actif, en partie) et une catégorie d'appareil.
 */

/** Au-delà de 30 min sans battement crédité, le battement suivant ouvre une nouvelle visite. */
export const VISIT_IDLE_GAP_MS = 30 * 60_000

/**
 * Écart maximal crédité entre deux battements : la cadence de 60 s plus un
 * battement perdu, avec une marge pour la gigue réseau et les onglets en
 * arrière-plan dont le minuteur est ralenti. Au-delà (pause de quelques
 * minutes), la visite continue mais la pause n'est pas créditée : c'est une
 * reprise, pas de la présence.
 */
export const MAX_BEAT_CREDIT_MS = 150_000

/** Visite ouverte du compte, telle que lue avant le crédit (référence du compare-and-swap). */
export type OpenVisit = { id: string; lastBeatAt: Date }

export type BeatDecision =
  /** Aucune visite ouverte : nouvelle visite, crédit nul (le premier battement ne mesure rien). */
  | { kind: 'create' }
  /** Visite ouverte prolongée ; `seconds` peut valoir 0 (pause trop longue pour être créditée). */
  | { kind: 'credit'; seconds: number }

/**
 * Décision PURE pour un battement reçu à `now`, face à la visite ouverte la
 * plus récente du compte (ou null).
 * - aucune visite, ou dernier battement il y a plus de 30 min → création ;
 * - sinon Δ = now − lastBeatAt : crédit de Δ arrondi à la seconde si
 *   0 < Δ ≤ 150 s, 0 au-delà (pause) ou en deçà (un battement concurrent a
 *   déjà avancé lastBeatAt).
 */
export function decideBeat(open: OpenVisit | null, now: Date): BeatDecision {
  if (!open) return { kind: 'create' }
  const delta = now.getTime() - open.lastBeatAt.getTime()
  // Date illisible : rien à prolonger de façon fiable, on repart d'une visite neuve.
  if (!Number.isFinite(delta) || delta > VISIT_IDLE_GAP_MS) return { kind: 'create' }
  const seconds = delta > 0 && delta <= MAX_BEAT_CREDIT_MS ? Math.round(delta / 1000) : 0
  return { kind: 'credit', seconds }
}

export type AccountBeat = {
  /** Interaction réelle depuis 10 min au plus (client). */
  active: boolean
  /** Écran de jeu, local ou en ligne (estimation du client). */
  inGame: boolean
  /** Catégorie d'appareil de la requête ; écrite à la création seulement. */
  device?: DeviceKind | null
  /** Horloge injectable (tests) ; par défaut, l'instant de l'appel. */
  now?: Date
}

/**
 * Enregistre un battement dans la visite ouverte du compte, ou en ouvre une.
 *
 * Crédit par compare-and-swap : l'updateMany ne passe que si lastBeatAt vaut
 * encore la valeur lue. Si deux battements (deux onglets, deux appareils) ont
 * lu la même visite, le premier écrit et le second trouve count = 0 : son
 * intervalle est déjà crédité, il n'y a rien à faire. SQLite sérialise les
 * écritures, aucun verrou n'est nécessaire.
 *
 * Deux créations simultanées (premiers battements de deux onglets à la même
 * milliseconde) donnent deux visites qui se chevauchent : fusionnées à la
 * lecture (account-activity-server), sans verrou ici.
 *
 * Ne lève JAMAIS : une mesure d'usage ne doit pas faire échouer le ping (ni
 * priver le compte du renouvellement de sa session).
 */
export async function recordAccountBeat(userId: string, beat: AccountBeat): Promise<void> {
  const now = beat.now ?? new Date()
  try {
    const open = await prisma.accountVisit.findFirst({
      where: { userId, lastBeatAt: { gte: new Date(now.getTime() - VISIT_IDLE_GAP_MS) } },
      orderBy: { lastBeatAt: 'desc' },
      select: { id: true, lastBeatAt: true },
    })
    const decision = decideBeat(open, now)

    if (decision.kind === 'create' || !open) {
      const device = beat.device && beat.device !== 'unknown' ? beat.device : null
      await prisma.accountVisit.create({
        data: { userId, startedAt: now, lastBeatAt: now, device },
      })
      return
    }

    // lastBeatAt déjà à cet instant ou après : un battement concurrent, lu
    // plus tard, a écrit le premier. Rien à créditer, et réécrire `now`
    // ferait RECULER la référence (l'écart serait crédité deux fois au
    // battement suivant).
    if (now.getTime() <= open.lastBeatAt.getTime()) return

    const seconds = decision.seconds
    // count = 0 : un battement concurrent a crédité cet intervalle entre la
    // lecture et l'écriture. Rien à faire.
    await prisma.accountVisit.updateMany({
      where: { id: open.id, lastBeatAt: open.lastBeatAt },
      data: {
        lastBeatAt: now,
        visibleSeconds: { increment: seconds },
        activeSeconds: { increment: beat.active ? seconds : 0 },
        gameSeconds: { increment: beat.inGame ? seconds : 0 },
      },
    })
  } catch (error) {
    // Compte supprimé entre la lecture de la session et l'écriture (clé
    // étrangère), base verrouillée… : la visite perd un battement, rien de plus.
    console.error('account visit beat error:', error)
  }
}
