import { createRng } from '@/lib/petit-buveur/rng'
import type { VdnTheme } from './data/types'
import { VDN_POINTS, ranking, type VdnPhase, type VdnRankingRow, type VdnResultRow, type VdnTally } from './engine'

/**
 * À Vue de Nez EN LIGNE : ce qu'un téléphone ou la TV reçoit, et les durées
 * que le serveur (server-adapter, online-adapter) et les écrans
 * (VueDeNezOnline, TvVueDeNez) doivent partager. Module SANS banque de
 * questions : les écrans l'importent, les réponses restent au serveur
 * (garde d'imports dans online-imports.test.ts).
 */

export const VDN_ONLINE_MAX_PLAYERS = 16
/** Temps pour estimer ; la révélation tombe plus tôt dès que toute la table présente a répondu. */
export const VDN_ANSWER_MS = 60_000
/** Révélation : la question suivante arrive d'elle-même au bout de ce temps… */
export const VDN_REVEAL_MS = 30_000
/** …ou plus tôt à la demande du meneur (vdnRevealLeader), une fois la règle posée et la réponse tombée (≈ 4,5 s d'animation). */
export const VDN_REVEAL_MIN_MS = 6_000

export type VdnOnlinePlayer = { id: string; name: string; isBot: boolean; leftAt: number | null }

export type VdnOnlinePlayerView = VdnOnlinePlayer & {
  hasAnswered: boolean
  score: number
  tally: VdnTally
}

/** La question en cours, sans sa réponse ni sa source. */
export type VdnOnlineQuestionView = {
  id: string
  theme: VdnTheme
  text: string
  /** Unité affichée derrière un nombre (vdnShownUnit) : vide pour une année de notre ère. */
  unit: string
  /** Plus petite estimation admise (négative pour une température). */
  min: number
}

export type VdnOnlineRevealView = {
  questionId: string
  answer: number
  source: string
  /** Seuls les joueurs qui ont répondu, du plus proche au plus loin. */
  results: VdnResultRow[]
}

export type VdnClientView = {
  version: number
  phase: VdnPhase
  phaseSeq: number
  phaseEndsAt: number | null
  phaseKey: string
  /** Instant serveur à partir duquel « Question suivante » est acceptée du meneur. */
  continueAt: number | null
  players: VdnOnlinePlayerView[]
  rematchVotes: string[]
  /** Numéro (base 1) de la question en cours et nombre de questions de la partie. */
  questionNumber: number
  questionCount: number
  question: VdnOnlineQuestionView | null
  /** L'estimation du téléphone qui regarde ; toujours null pour la TV. */
  myEstimate: number | null
  /** Public en phase `reveal` seulement. */
  reveal: VdnOnlineRevealView | null
  ranking: VdnRankingRow[]
}

type PendingCandidate = { isBot: boolean; leftAt: number | null; hasAnswered: boolean }

/**
 * Le bot qui estime au prochain tick : un seul par tick, dans l'ordre de la
 * table. Même calcul chez le client arbitre (useBotReferee) et au serveur
 * (serviceTick), sinon l'un devance l'autre.
 */
export function vdnPendingBot<P extends PendingCandidate>(phase: VdnPhase, players: readonly P[]): P | undefined {
  if (phase !== 'answering') return undefined
  return players.find((p) => p.isBot && !p.leftAt && !p.hasAnswered)
}

/**
 * Instant (horloge serveur) où le bot en attente estime : le DÉBUT de la
 * question (`phaseEndsAt − VDN_ANSWER_MS`) plus son tempo, jamais avant
 * `now`. Ancré sur la dernière écriture, chaque estimation ou correction
 * humaine et chaque coup de bot remettait le compte à zéro : les tempos
 * s'additionnaient, et sans téléphone d'arbitre éveillé 8 à 15 bots ne
 * tenaient plus dans la minute. Ancré ainsi, un bot en retard part aussitôt.
 * Même formule au serveur (borne haute du tempo) et chez le client (tirage
 * figé par vdnBotTempoRand).
 */
export function vdnBotDueAt(phaseEndsAt: number | null, tempoMs: number, now: number): number {
  if (phaseEndsAt === null) return now + tempoMs
  return Math.max(now, phaseEndsAt - VDN_ANSWER_MS + tempoMs)
}

/**
 * Tirage du tempo d'un bot chez le client, FIGÉ pour une question : le même
 * à chaque rendu, à chaque réarmement (une écriture par estimation) et sur
 * chaque téléphone. Retiré à chaque version, il redonnait sa chance au bot à
 * chaque écriture et les bots partaient de plus en plus tôt.
 */
export function vdnBotTempoRand(botId: string, phaseKey: string): () => number {
  const value = createRng(`${phaseKey}#${botId}`).next()
  return () => value
}

/**
 * Le meneur de la révélation : le premier humain encore à table, dans
 * l'ordre de la table (l'ordre d'arrivée dans la salle : l'hôte en pratique,
 * puis son successeur s'il s'en va). Lui seul lance « Question suivante »,
 * sinon la suite arrive d'elle-même au bout de VDN_REVEAL_MS : un autre
 * joueur ne coupe plus la révélation à toute la table, TV comprise. Même
 * calcul au serveur et sur chaque téléphone.
 */
export function vdnRevealLeader<P extends { isBot: boolean; leftAt: number | null }>(players: readonly P[]): P | undefined {
  return players.find((p) => !p.isBot && !p.leftAt)
}

/**
 * Le classement d'AVANT la question révélée : la vue porte déjà les points de
 * ses verdicts, la TV les retire tant que la réponse n'est pas tombée (sinon la
 * salle lit qui vient de prendre +6 en plein suspense). Même tri que `ranking`,
 * dans l'ordre de la table (celui de `players`). Hors révélation : `ranking`.
 */
export function vdnRankingBeforeReveal(view: Pick<VdnClientView, 'players' | 'reveal' | 'ranking'>): VdnRankingRow[] {
  if (!view.reveal) return view.ranking
  const scores: Record<string, number> = {}
  const tallies: Record<string, VdnTally> = {}
  for (const p of view.players) {
    scores[p.id] = p.score
    tallies[p.id] = p.tally
  }
  for (const row of view.reveal.results) {
    const tally = tallies[row.playerId]
    if (!row.tag || !tally) continue
    scores[row.playerId] -= VDN_POINTS[row.tag]
    tallies[row.playerId] = { ...tally, [row.tag]: tally[row.tag] - 1 }
  }
  return ranking({ playerIds: view.players.map((p) => p.id), scores, tallies })
}

/** Joueurs encore à table (les partis sont exclus du décompte et du calcul). */
export function vdnActivePlayers<P extends { leftAt: number | null }>(players: readonly P[]): P[] {
  return players.filter((p) => !p.leftAt)
}
