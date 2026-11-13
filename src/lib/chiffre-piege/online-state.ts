import { botTickDelayMs } from '@/lib/online/bot-personas'
import {
  CHIFFRE_PIEGE_MIN_PLAYERS,
  currentChiffrePiegePlayerId,
  type ChiffrePiegePhase,
  type ChiffrePiegePublicView,
  type ChiffrePiegeState,
} from './engine'

/**
 * Le Chiffre Piégé EN LIGNE : l'enveloppe serveur autour du moteur partagé
 * avec la partie locale (src/lib/chiffre-piege/engine.ts).
 *
 * Le moteur ne connaît que des ids et des événements neutres ; le socle des
 * jeux en ligne lui ajoute ce que le reste du site lit génériquement : la
 * `version` et la `phase` (parseOnlineGameState, vote « Rejouer »), l'horloge
 * de phase (`phaseSeq`, `phaseEndsAt` : échéance du BOUM), la table
 * `players` (bots, départs, journal, XP), les votes « Rejouer » et le hasard
 * du serveur (`rngState`, coups des bots).
 *
 * Module NEUTRE : types et lectures communs au serveur, au téléphone et à la
 * TV. Rien n'y tire au sort pour la partie, rien n'y lit un secret.
 */

export const CHIFFRE_PIEGE_ONLINE_MIN_PLAYERS = CHIFFRE_PIEGE_MIN_PLAYERS
export const CHIFFRE_PIEGE_ONLINE_MAX_PLAYERS = 16
/**
 * Lecture minimale du BOUM avant « Manche suivante » : le téléphone qui
 * appuie l'a reçu avant les autres, la table doit avoir vu qui boit.
 */
export const CHIFFRE_PIEGE_ONLINE_READ_MS = 3_000
/** Le BOUM laisse la place à la manche suivante d'office passé ce délai. */
export const CHIFFRE_PIEGE_ONLINE_BOOM_MS = 10_000

export type ChiffrePiegeOnlinePlayer = {
  /** Humain : userId brut ; bot : `bot-1`, `bot-2`… (FILLER_BOT_RE). */
  id: string
  name: string
  isBot: boolean
  leftAt: number | null
}

export type ChiffrePiegeOnlineState = {
  /** +1 à chaque écriture acceptée. */
  version: number
  /** Recopiée de `game.phase` après chaque coup, `finished` compris. */
  phase: ChiffrePiegePhase
  /** +1 à chaque changement de phase : la clé `phase#seq` désigne UN BOUM. */
  phaseSeq: number
  /** BOUM : la manche suivante part d'office à cette heure ; null ailleurs. */
  phaseEndsAt: number | null
  /** Ordre de la table (l'ordre de `game.playerIds`). */
  players: ChiffrePiegeOnlinePlayer[]
  rematchVotes: string[]
  /** SECRET : hasard du serveur (coups des bots et des partis). */
  rngState: number
  /** État du moteur partagé ; ses ids sont ceux de `players`. Piège et graine SECRETS. */
  game: ChiffrePiegeState
}

/** Vue envoyée aux téléphones ET à la TV : aucun secret, rien de personnel. */
export type ChiffrePiegeClientView = Omit<ChiffrePiegeOnlineState, 'rngState' | 'game'> & {
  game: ChiffrePiegePublicView
  phaseKey: string
  /** BOUM : instant à partir duquel un joueur peut lancer la manche suivante. */
  continueAt: number | null
}

/** Ce que lisent les helpers communs : l'état serveur comme sa vue. */
type OnlineTable = {
  phase: ChiffrePiegePhase
  players: readonly ChiffrePiegeOnlinePlayer[]
  game: ChiffrePiegePublicView
}

/** Joueur qui doit proposer un nombre ; null pendant le BOUM et après la partie. */
export function currentChiffrePiegeActorId(table: OnlineTable): string | null {
  return table.phase === 'playing' ? currentChiffrePiegePlayerId(table.game) : null
}

/**
 * Siège joué par la machine : un bot, ou un joueur parti. Le parti garde sa
 * place et ses tours se jouent au hasard en attendant son retour : si la main
 * le sautait, partir puis revenir esquiverait le dernier nombre.
 */
export function chiffrePiegePlaysAuto(player: Pick<ChiffrePiegeOnlinePlayer, 'isBot' | 'leftAt'>): boolean {
  return player.isBot || Boolean(player.leftAt)
}

/**
 * Délai du coup d'un siège automatique au tour (bot ou parti), ou null si un
 * présent a la main. UNE seule formule pour le téléphone arbitre (tirage au
 * hasard) et le filet du serveur (borne haute : `rand = () => 1`).
 */
export function chiffrePiegeBotTickDelayMs(table: OnlineTable, rand: () => number = Math.random): number | null {
  const actorId = currentChiffrePiegeActorId(table)
  const actor = actorId === null ? undefined : table.players.find((p) => p.id === actorId)
  return actor && chiffrePiegePlaysAuto(actor) ? botTickDelayMs(actor.name, rand) : null
}

/** BOUM : instant à partir duquel « Manche suivante » est accepté ; null hors BOUM. */
export function chiffrePiegeContinueAt(table: { phase: ChiffrePiegePhase; game: Pick<ChiffrePiegePublicView, 'lastBoom'> }): number | null {
  if (table.phase !== 'boom' || !table.game.lastBoom) return null
  return table.game.lastBoom.at + CHIFFRE_PIEGE_ONLINE_READ_MS
}

/** Vue reçue du serveur (DTO de la salle), ou null si elle n'a pas la forme attendue. */
export function parseChiffrePiegeClientView(json: string | null | undefined): ChiffrePiegeClientView | null {
  if (!json) return null
  try {
    const raw = JSON.parse(json) as Partial<ChiffrePiegeClientView> | null
    if (!raw || typeof raw !== 'object' || typeof raw.phase !== 'string' || !Array.isArray(raw.players)) return null
    if (!raw.game || typeof raw.game !== 'object' || !Array.isArray(raw.game.playerIds)) return null
    return {
      ...(raw as ChiffrePiegeClientView),
      rematchVotes: Array.isArray(raw.rematchVotes) ? raw.rematchVotes : [],
    }
  } catch {
    return null
  }
}
