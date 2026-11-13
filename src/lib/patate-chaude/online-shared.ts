import { phaseKey } from '@/lib/online/phase-clock'
import {
  PC_MIN_PLAYERS,
  activePlayerIds,
  contestThreshold,
  isPcPlayerActive,
  nextHolderId,
  pcFuseRangeMs,
  ranking,
  toPcPublicView,
  type PcPhase,
  type PcPublicState,
  type PcRankingEntry,
  type PcState,
} from './engine'
import type { PcLang } from './load'

/**
 * Enveloppe EN LIGNE de Patate Chaude, partagée par le serveur, l'écran du téléphone et la TV.
 * Module sans contenu : le téléphone et la TV l'importent sans embarquer les banques de défis
 * (elles restent à server-bank.ts, lu par le seul serveur).
 *
 * La mèche est SECRÈTE : `game.explodeAt` ne quitte jamais le serveur et `phaseEndsAt` reste
 * nul pendant `burning`. Seules les phases publiques ont une échéance visible : le compte à
 * rebours avant l'allumage (`ready`) et l'écran du BOUM (`boom`).
 */

export const PC_ONLINE_MIN_PLAYERS = 2
export const PC_ONLINE_MAX_PLAYERS = 12
/** Avant la première mèche : le temps de voir qui tient la bombe en sortant du briefing. */
export const PC_ONLINE_FIRST_READY_MS = 5_000
/** Avant chaque mèche suivante : la table vient de lire le BOUM. */
export const PC_ONLINE_READY_MS = 3_000
/** Écran du BOUM, puis manche suivante (ou classement). */
export const PC_ONLINE_BOOM_MS = 6_000

/** Joueur de la table : id humain = userId brut. Aucun bot ne joue à Patate Chaude. */
export type PcOnlinePlayer = { id: string; name: string; isBot: boolean; leftAt: number | null }

export type PcOnlineState = {
  /** +1 à chaque écriture acceptée. */
  version: number
  /** Recopiée de `game.phase` à chaque transition. */
  phase: PcPhase
  phaseSeq: number
  /** Échéance PUBLIQUE (ready, boom) ; toujours nulle pendant la mèche et à la fin. */
  phaseEndsAt: number | null
  players: PcOnlinePlayer[]
  rematchVotes: string[]
  /** Langue de la salle : les défis (et la lettre ou la syllabe à vérifier) sont tirés dedans. */
  lang: PcLang
  /** État du moteur partagé avec le jeu local ; ses joueurs = players[].id. */
  game: PcState
}

/** Vue unique (joueur et TV) : aucun secret, aucun champ propre à un joueur. */
export type PcClientView = {
  version: number
  phase: PcPhase
  phaseSeq: number
  phaseEndsAt: number | null
  phaseKey: string
  players: PcOnlinePlayer[]
  rematchVotes: string[]
  game: PcPublicState
  /** Borne HAUTE de la mèche (ms) : le tic-tac s'y rapporte, jamais à l'échéance tirée. */
  maxFuseMs: number
  /** Qui recevra la bombe si le porteur passe maintenant (mèche allumée seulement). */
  nextHolderId: string | null
  /**
   * Contestations qui rayent le mot ouvert, quel que soit le défi ; null sans mot ouvert ou quand
   * la table est trop petite pour trancher (moins de quatre joueurs actifs).
   */
  contestThreshold: number | null
}

type PcTableView = { players: readonly PcOnlinePlayer[]; game: Pick<PcPublicState, 'playerIds' | 'absent'> }

/**
 * Mis de côté pour inactivité : sauté par la bombe sans avoir quitté la table (deux explosions
 * sans rien jouer). « Je suis là » (action `resume`) le remet dans l'ordre de passe.
 */
export function isPcSetAside(state: PcTableView, playerId: string): boolean {
  const player = state.players.find((p) => p.id === playerId)
  return Boolean(player && !player.isBot && !player.leftAt && state.game.absent.includes(playerId))
}

/** Ligne du classement de fin : `left`, joueur parti, listé après les classés, sans rang ni victoire. */
export type PcEndRow = PcRankingEntry & { left: boolean }

/**
 * Classement de fin (téléphone et TV) : rangs et victoire entre les joueurs encore à la table — un
 * mis de côté y reste. Un parti garde ses explosions mais ne gagne jamais : sorti tôt avec zéro
 * explosion, il passerait devant toute la table. Les partis suivent, du moins exposé au plus exposé.
 */
export function pcEndStandings(state: {
  players: readonly PcOnlinePlayer[]
  game: Pick<PcPublicState, 'playerIds' | 'explosions' | 'penalties'>
}): PcEndRow[] {
  const left = new Set(state.players.filter((p) => p.leftAt).map((p) => p.id))
  const among = (keep: (id: string) => boolean) =>
    ranking({ ...state.game, playerIds: state.game.playerIds.filter(keep) })
  return [
    ...among((id) => !left.has(id)).map((row) => ({ ...row, left: false })),
    ...among((id) => left.has(id)).map((row) => ({ ...row, won: false, left: true })),
  ]
}

/** Moins de deux joueurs actifs : la partie s'arrête à la prochaine échéance, sans nouvelle mèche. */
export function isPcTableTooSmall(state: PcTableView): boolean {
  return activePlayerIds(state.game).length < PC_MIN_PLAYERS
}

/** Durée de la phase publique qui s'ouvre (null : mèche secrète, ou fin). */
export function pcPhaseDurationMs(game: Pick<PcState, 'phase' | 'roundIndex'>): number | null {
  if (game.phase === 'ready') return game.roundIndex === 0 ? PC_ONLINE_FIRST_READY_MS : PC_ONLINE_READY_MS
  if (game.phase === 'boom') return PC_ONLINE_BOOM_MS
  return null
}

/** Le porteur pendant la mèche ; personne d'autre n'est « au tour ». */
export function currentPcActorId(state: PcOnlineState): string | null {
  if (state.phase !== 'burning') return null
  return isPcPlayerActive(state.game, state.game.holder) ? state.game.holder : null
}

export function toPcClientView(state: PcOnlineState): PcClientView {
  const game = state.game
  const burning = state.phase === 'burning'
  const contestable = burning && game.openWord !== null
  return {
    version: state.version,
    phase: state.phase,
    phaseSeq: state.phaseSeq,
    phaseEndsAt: burning ? null : state.phaseEndsAt,
    phaseKey: phaseKey(state),
    players: state.players.map((p) => ({ id: p.id, name: p.name, isBot: p.isBot, leftAt: p.leftAt })),
    rematchVotes: [...state.rematchVotes],
    game: toPcPublicView(game),
    maxFuseMs: pcFuseRangeMs(game.settings.fuse).max,
    nextHolderId: burning ? nextHolderId(game) : null,
    contestThreshold: contestable ? contestThreshold(game) : null,
  }
}
