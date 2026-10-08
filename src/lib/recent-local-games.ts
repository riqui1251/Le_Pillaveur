import { useEffect, useRef } from 'react'

import { GAMES, getGameById, type GameMeta } from '@/lib/games'
import { measuredLocalGameIdFromPath, reportLocalGame } from '@/lib/local-game-beacon'
import { getSafeStorage } from '@/lib/storage'

// ─── Derniers jeux LOCAUX ────────────────────────────────────────────────────
// Pourquoi : le groupe qui revient le lendemain retrouve /jeux et sa table de
// joueurs, mais rien ne lui rappelle à quoi il jouait — la rangée « Rejouer »
// n'existait qu'en ligne (historique serveur). En local, pas de serveur : on
// garde sur l'APPAREIL la liste des 3 derniers jeux ouverts avec une table.
// Des identifiants de jeu, rien d'autre : aucun pseudo, aucun score.

/** Clé localStorage de la liste (tableau JSON d'identifiants, le plus récent en tête). */
export const RECENT_LOCAL_GAMES_KEY = 'lp-recent-local-games'

/** Trois cartes tiennent sur une ligne à 375 px : au-delà, la rangée défile pour rien. */
export const RECENT_LOCAL_GAMES_MAX = 3

/**
 * Un jeu qui se joue sur le téléphone de la table ET qui est publié : un jeu
 * « en ligne uniquement » n'a pas de partie locale à relancer, et un jeu masqué
 * (`hidden`) ne doit pas réapparaître au hub par la bande.
 */
export function isRecentLocalCandidate(game: GameMeta | undefined): game is GameMeta {
  return Boolean(game && !game.hidden && !game.onlineOnly)
}

/**
 * Le jeu local dont `pathname` est la page, ou null. Chemin EXACT du catalogue
 * (sans préfixe de langue, tel que le rend usePathname de next-intl) : une
 * sous-page, une requête ou un slash final ne comptent pas.
 */
export function localGameIdFromPath(pathname: string | null | undefined): string | null {
  if (!pathname) return null
  const game = GAMES.find((g) => g.path === pathname)
  return isRecentLocalCandidate(game) ? game.id : null
}

/**
 * Relit la liste stockée : JSON illisible, entrées inconnues, doublons ou jeux
 * devenus masqués / en ligne uniquement sont écartés sans bruit — la rangée
 * ne doit jamais proposer un lien mort.
 */
export function parseRecentLocalGames(raw: string | null): string[] {
  if (!raw) return []
  let parsed: unknown
  try {
    parsed = JSON.parse(raw)
  } catch {
    return []
  }
  if (!Array.isArray(parsed)) return []
  const ids: string[] = []
  for (const value of parsed) {
    if (typeof value !== 'string' || ids.includes(value)) continue
    if (!isRecentLocalCandidate(getGameById(value))) continue
    ids.push(value)
    if (ids.length === RECENT_LOCAL_GAMES_MAX) break
  }
  return ids
}

/** Remonte `gameId` en tête (sans doublon) et borne la liste. Un jeu non éligible la laisse telle quelle. */
export function pushRecentLocalGame(list: readonly string[], gameId: string): string[] {
  if (!isRecentLocalCandidate(getGameById(gameId))) return list.slice(0, RECENT_LOCAL_GAMES_MAX)
  return [gameId, ...list.filter((id) => id !== gameId)].slice(0, RECENT_LOCAL_GAMES_MAX)
}

/** Liste de l'appareil ; vide côté serveur, en navigation privée ou si le stockage refuse. */
export function readRecentLocalGames(): string[] {
  const storage = getSafeStorage()
  if (!storage) return []
  try {
    return parseRecentLocalGames(storage.getItem(RECENT_LOCAL_GAMES_KEY))
  } catch {
    return []
  }
}

/** Note l'ouverture d'un jeu local. Jamais bloquant : un stockage plein n'empêche pas de jouer. */
export function recordRecentLocalGame(gameId: string): void {
  const storage = getSafeStorage()
  if (!storage) return
  try {
    const current = parseRecentLocalGames(storage.getItem(RECENT_LOCAL_GAMES_KEY))
    // Déjà en tête : rien à réécrire (chaque navigation dans le jeu repasse ici).
    if (current[0] === gameId) return
    const next = pushRecentLocalGame(current, gameId)
    if (next[0] !== gameId) return
    storage.setItem(RECENT_LOCAL_GAMES_KEY, JSON.stringify(next))
  } catch {
    // stockage indisponible : la rangée restera simplement vide
  }
}

/**
 * Enregistreur, à appeler UNE fois depuis le layout des pages de jeu
 * (src/app/[locale]/games/layout.tsx) : le seul point commun à tous les jeux
 * locaux, sans toucher à leurs composants — l'ouverture de la page tient lieu
 * de lancement. `localTable` dit que c'est bien une partie LOCALE qui se
 * prépare : session connue, mode local, et une table de joueurs choisie (sans
 * table, le layout renvoie vers /joueurs, qui ramène ici une fois la table
 * faite). Le contexte vient de l'appelant, qui a déjà session et table sous
 * la main : ce module reste léger pour le morceau commun à toutes les pages
 * de jeu, et testable sans fournisseur.
 *
 * Même point pour le 'start' de la mesure anonyme des parties locales
 * (local-game-beacon.ts) : c'est le seul endroit commun aux 13 jeux locaux où
 * l'on sait à la fois QUEL jeu s'ouvre et qu'il se joue EN LOCAL avec une
 * table. « Lancée » veut donc dire « page du jeu ouverte avec une table » —
 * un groupe qui repart de l'écran de réglages compte comme un abandon, ce
 * qu'on veut voir ; une revanche sur la même page n'est pas un relancement.
 * Les jeux masqués sont mesurés (pas la rangée) : leurs écrans de fin le sont.
 *
 * Un lancement par page OUVERTE : le verrou en ref retient le chemin déjà
 * compté, si bien que ni le double effet du mode strict ni une table qui
 * clignote (`localTable` vrai → faux → vrai pendant une resynchronisation des
 * joueurs) ne recomptent la même ouverture. Passer d'un jeu à l'autre, ou
 * revenir après être sorti des pages de jeu (layout remonté), en est une
 * nouvelle.
 */
export function useRecordRecentLocalGame(pathname: string | null | undefined, localTable: boolean): void {
  const reportedPathRef = useRef<string | null>(null)
  useEffect(() => {
    if (!localTable) return
    const gameId = localGameIdFromPath(pathname)
    if (gameId) recordRecentLocalGame(gameId)
    const measuredId = measuredLocalGameIdFromPath(pathname)
    if (measuredId && reportedPathRef.current !== pathname) {
      reportedPathRef.current = pathname ?? null
      reportLocalGame(measuredId, 'start')
    }
  }, [pathname, localTable])
}
