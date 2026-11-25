import { getGameById } from '@/lib/games'
import { setSelectedPlayerIds } from '@/lib/selectedPlayers'
import type { SoireeHeat } from './catalog'
import { buildProgram, SOIREE_LENGTH_ROUNDS } from './program'
import { closeRound, createSoiree, finishSoiree, startRound, type Soiree } from './state'
import { soireeSummary, toHistoryEntry, type SoireeHistoryEntry } from './summary'
import { newSoireeId, pushHistory, readBandes, readHistory, saveBande } from './storage'

/**
 * Les gestes de la soirée qui touchent à l'appareil (sélection de joueurs,
 * historique, bandes) — la logique, elle, reste pure dans state.ts.
 */

/** Joueurs de la manche en cours dont le jeu n'a remonté aucune fin de partie. */
export function unreportedPlayers(soiree: Soiree): string[] {
  const round = soiree.rounds[soiree.current]
  if (!round || round.status !== 'playing') return []
  return round.playerIds.filter((id) => (round.results[id]?.played ?? 0) === 0)
}

/**
 * Clôt la manche en cours. Ceux dont le jeu n'a rien remonté (Doigt du
 * Destin n'a pas d'écran de fin) étaient bien à la table : ils comptent une
 * partie jouée, leurs gorgées se saisissent à l'entracte.
 */
export function closeCurrentRound(soiree: Soiree, now: number): Soiree {
  const round = soiree.rounds[soiree.current]
  if (!round || round.status !== 'playing') return soiree
  const results = { ...round.results }
  for (const id of round.playerIds) {
    const tally = results[id] ?? { drinks: 0, wins: 0, played: 0 }
    results[id] = { ...tally, played: Math.max(1, tally.played) }
  }
  const withPlayers: Soiree = { ...soiree, rounds: soiree.rounds.map((r, i) => (i === soiree.current ? { ...round, results } : r)) }
  return closeRound(withPlayers, now)
}

/**
 * Lance la manche courante : ses joueurs deviennent la sélection de
 * l'appareil (lue par la page du jeu), puis renvoie le chemin du jeu.
 */
export function launchCurrentRound(soiree: Soiree, now: number): { soiree: Soiree; path: string | null } {
  const started = startRound(soiree, now)
  const round = started.rounds[started.current]
  if (!round) return { soiree, path: null }
  setSelectedPlayerIds(round.playerIds)
  return { soiree: started, path: getGameById(round.gameId)?.path ?? null }
}

/** Ferme la soirée, la range dans l'historique et date la bande. */
export function finishWithHistory(soiree: Soiree, now: number): { soiree: Soiree; entry: SoireeHistoryEntry } {
  const finished = finishSoiree(soiree, now)
  const entry = toHistoryEntry(finished, soireeSummary(finished), now)
  pushHistory(entry)
  if (finished.bandeId) {
    const bande = readBandes().find((b) => b.id === finished.bandeId)
    if (bande) saveBande({ ...bande, playerIds: finished.playerIds.slice(), lastPlayedAt: now })
  }
  return { soiree: finished, entry }
}

/** Garde la bande de cette soirée (nom choisi à l'addition) et rattache la soirée à son historique. */
export function keepBande(soiree: Soiree, name: string, now: number): Soiree {
  const id = soiree.bandeId ?? `b-${newSoireeId(now)}`
  saveBande({ id, name, playerIds: soiree.playerIds.slice(), createdAt: now, lastPlayedAt: now })
  const kept: Soiree = { ...soiree, bandeId: id, bandeName: name }
  if (kept.phase === 'finished') pushHistory(toHistoryEntry(kept, soireeSummary(kept), now))
  return kept
}

/** Numéro de la prochaine soirée d'une bande (1 pour une nouvelle). */
export function nextNightNumber(bandeId: string | null, history: readonly SoireeHistoryEntry[] = readHistory()): number {
  if (!bandeId) return 1
  return history.filter((entry) => entry.bandeId === bandeId).length + 1
}

/**
 * La revanche : même bande, même ambiance, nouveau programme. Les jeux cachés
 * par l'équipe n'y entrent pas (la carte recopiée les écarte, le tirage les évite) ;
 * `heatOf` : le barème « Fait boire » réglé par l'équipe, pour le tirage.
 */
export function revancheOf(soiree: Soiree, now: number, hiddenIds: readonly string[] = [], heatOf?: (gameId: string) => SoireeHeat): Soiree {
  const kept = soiree.rounds.map((r) => r.gameId).filter((id) => !hiddenIds.includes(id))
  const rounds = soiree.length === 'carte' ? Math.max(1, soiree.rounds.length) : SOIREE_LENGTH_ROUNDS[soiree.length]
  const program =
    soiree.length === 'carte'
      ? kept
      : buildProgram({ rounds, vibe: soiree.vibe, playerCount: soiree.playerIds.length, hiddenIds, heatOf })
  return createSoiree({
    id: newSoireeId(now),
    now,
    bandeId: soiree.bandeId,
    bandeName: soiree.bandeName,
    players: soiree.playerIds.map((id) => ({ id, name: soiree.playerNames[id] ?? '?' })),
    vibe: soiree.vibe,
    soft: soiree.soft,
    length: soiree.length,
    program,
  })
}
