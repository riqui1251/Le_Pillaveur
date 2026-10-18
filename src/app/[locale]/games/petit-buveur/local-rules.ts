import { CASES_NO_TARGET, type Case, type CaseType } from './case-config'
import type { GamePlayer } from './case-types'

/** Règles communes au jeu local (contrat de règles, identique au moteur en ligne). */

export type Rng = () => number

/** Gorgée réellement bue, pour les statistiques (totalDrinks). */
export type DrinkEntry = { playerId: string; count: number }

/** Protection active pendant un tour de table complet. */
export function isProtected(player: GamePlayer): boolean {
  return player.protected && (player.protectionTurnsLeft ?? 0) > 0
}

/** La protection ne couvre que ce qu'impose la case d'un AUTRE joueur. */
export function isShielded(target: GamePlayer, actorId: string): boolean {
  return target.id !== actorId && isProtected(target)
}

/** `sourceId` : joueur dont la case fait boire (absent : lien ou malédiction, toujours bloqués). */
export type DrinkOptions = { sourceId?: string; skipMirror?: boolean; skipChain?: boolean }

/**
 * Fait boire un joueur (mutation de `list`) avec propagation miroir inversé
 * (acteur → cible, sens unique) et défi en chaîne (dans les deux sens).
 * Chaque gorgée bue est ajoutée à `log`. Retourne true si la protection a bloqué.
 */
export function addDrinks(
  list: GamePlayer[],
  playerId: string,
  count: number,
  opts: DrinkOptions = {},
  log: DrinkEntry[] = []
): boolean {
  if (count <= 0) return false
  const player = list.find(p => p.id === playerId)
  if (!player) return false
  if (isProtected(player) && player.id !== opts.sourceId) return true
  player.drinks += count
  log.push({ playerId: player.id, count })

  if (!opts.skipMirror && (player.mirrorDrinkTurns ?? 0) > 0 && player.mirrorDrinkTargetId) {
    addDrinks(list, player.mirrorDrinkTargetId, count, { skipMirror: true, skipChain: opts.skipChain }, log)
  }

  if (!opts.skipChain) {
    for (const initiator of list) {
      if (!initiator.linkedTo || initiator.linkedTurns <= 0) continue
      if (player.id === initiator.id) {
        addDrinks(list, initiator.linkedTo, count, { skipChain: true, skipMirror: opts.skipMirror }, log)
        break
      }
      if (player.id === initiator.linkedTo) {
        addDrinks(list, initiator.id, count, { skipChain: true, skipMirror: opts.skipMirror }, log)
        break
      }
    }
  }
  return false
}

/** Fisher-Yates : chaque permutation a la même probabilité. */
export function shuffle<T>(items: readonly T[], rng: Rng = Math.random): T[] {
  const out = [...items]
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1))
    ;[out[i], out[j]] = [out[j], out[i]]
  }
  return out
}

/** Liens posés pendant le tour en cours : ce tour ne les décompte pas. */
export type FreshLinks = { mirror: boolean; chain: boolean }

/**
 * Fin du tour de l'initiateur : décrémente miroir inversé et défi en chaîne.
 * Un lien posé pendant ce tour n'est pas décompté : la chaîne dure ses N tours
 * d'initiateur, le miroir court jusqu'à la fin de son prochain tour.
 */
export function tickInitiatorLinks(player: GamePlayer, fresh: FreshLinks = { mirror: false, chain: false }): void {
  if (!fresh.mirror && (player.mirrorDrinkTurns ?? 0) > 0) {
    player.mirrorDrinkTurns = (player.mirrorDrinkTurns ?? 1) - 1
    if ((player.mirrorDrinkTurns ?? 0) <= 0) player.mirrorDrinkTargetId = undefined
  }
  if (!fresh.chain && player.linkedTo && player.linkedTurns > 0) {
    player.linkedTurns -= 1
    if (player.linkedTurns <= 0) player.linkedTo = undefined
  }
}

/** Protection : un tour de moins pour chaque joueur protégé (un tour de table = autant de tours que de joueurs). */
export function tickProtection(players: GamePlayer[]): void {
  for (const p of players) {
    if (!p.protected || p.protectionTurnsLeft == null) continue
    p.protectionTurnsLeft -= 1
    if (p.protectionTurnsLeft <= 0) {
      p.protected = false
      p.protectionTurnsLeft = undefined
    }
  }
}

/**
 * Fin d'un tour (mutation de `players`). Comme en ligne, un tour sauté par
 * Passe-ton-tour ne décompte ni la protection ni les liens de l'initiateur :
 * seule la malédiction y est prélevée (au début du tour).
 */
export function tickTurnEnd(
  players: GamePlayer[],
  leavingIndex: number,
  opts: { fresh?: FreshLinks; skipped?: boolean } = {}
): void {
  if (opts.skipped) return
  tickProtection(players)
  const leaving = players[leavingIndex]
  if (leaving) tickInitiatorLinks(leaving, opts.fresh)
}

/** Méta-cases : elles rejouent (Répétition, Rewind) ou enchaînent (Double case) d'autres cases. */
export const META_CASE_TYPES = new Set<CaseType>(['repetition', 'rewind', 'double-case'])

/** Cases à modale dédiée (choix de l'acteur ou d'un joueur désigné par la modale). */
export const MODAL_CASE_TYPES = new Set<CaseType>([
  'roue',
  'roue-defis',
  'de-honte',
  'pile-face',
  'teleport',
  'vote',
  'chance',
  'echange',
  'defi-chaine',
])

/** Case résolue d'office, sans cible (Normale comprise). */
export function isNoTargetCase(type: CaseType): boolean {
  return type === 'normal' || CASES_NO_TARGET.has(type)
}

/** La case demande de choisir une cible avant de s'appliquer. */
export function caseNeedsTarget(type: CaseType): boolean {
  return !isNoTargetCase(type) && !MODAL_CASE_TYPES.has(type) && !META_CASE_TYPES.has(type)
}

/** Dernière case EFFECTIVE : ce que Répétition / Rewind rejouent (ni méta-case, ni Normale). */
export function isReplayableCase(c: Case | null | undefined): c is Case {
  return c != null && !META_CASE_TYPES.has(c.type) && c.type !== 'normal'
}

/** Case applicable dans une Double case : sans modale, sans arbitrage, ni méta, ni Normale. */
export function isSimpleCase(c: Case): boolean {
  return isReplayableCase(c) && !MODAL_CASE_TYPES.has(c.type) && c.type !== 'defi' && c.type !== 'question'
}

/** Types jamais tirés pour une Double case (passés en exclusion au générateur). */
export const NON_SIMPLE_CASE_TYPES: CaseType[] = [
  'normal',
  'defi',
  'question',
  ...Array.from(META_CASE_TYPES),
  ...Array.from(MODAL_CASE_TYPES),
]

/** Deux cases simples pour une Double case. */
export function drawSimpleCases(draw: () => Case): [Case, Case] {
  const out: Case[] = []
  for (let guard = 0; out.length < 2 && guard < 200; guard++) {
    const c = draw()
    if (isSimpleCase(c)) out.push(c)
  }
  while (out.length < 2) out.push({ type: 'solo', effect: 1 })
  return [out[0], out[1]]
}

/** Duel sur case partagée : le perdant recule d'une case, sauf s'il est protégé. */
export function applyDuelResult(
  players: GamePlayer[],
  challengerId: string,
  opponentId: string,
  challengerWins: boolean
): { players: GamePlayer[]; loserId: string; winnerId: string; loserProtected: boolean } {
  const loserId = challengerWins ? opponentId : challengerId
  const winnerId = challengerWins ? challengerId : opponentId
  const next = players.map(p => ({ ...p }))
  const loser = next.find(p => p.id === loserId)
  const loserProtected = loser ? isProtected(loser) : false
  if (loser && !loserProtected) loser.position = Math.max(0, loser.position - 1)
  return { players: next, loserId, winnerId, loserProtected }
}

/** Joueurs remis au départ pour une nouvelle partie (mêmes joueurs, aucun effet). */
export function resetPlayersForNewGame(players: GamePlayer[]): GamePlayer[] {
  return players.map(p => ({
    ...p,
    position: 0,
    drinks: 0,
    protected: false,
    protectionTurnsLeft: undefined,
    cursed: 0,
    linkedTo: undefined,
    linkedTurns: 0,
    skipNextTurn: false,
    anchored: false,
    mirrorDrinkTargetId: undefined,
    mirrorDrinkTurns: 0,
  }))
}

export type DefiWheelSegmentKind = 'drink' | 'safe' | 'challenge'

/**
 * Roue des défis : le segment se lit à sa POSITION, jamais à son libellé
 * traduit (« Tu bois », « bebes », « Bevi », version Soft…).
 */
export function classifyDefiWheelSegment(
  index: number,
  label: string,
  safeLabel: string,
  drinkIndex: number
): DefiWheelSegmentKind {
  if (index === drinkIndex) return 'drink'
  if (label === safeLabel || label === 'SAFE') return 'safe'
  return 'challenge'
}
