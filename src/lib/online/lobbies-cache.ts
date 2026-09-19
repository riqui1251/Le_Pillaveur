import type { LobbyOverview } from '@/lib/online-room'
import type { RecentLaunchItem } from '@/lib/online/game-sessions'

/**
 * CACHE MÉMOIRE DU GUICHET (mono-instance).
 *
 * GET /api/online/lobbies renvoie la MÊME réponse à tout le monde (aucun
 * paramètre utilisateur), et chaque visiteur du guichet la sonde toutes les
 * 4 s (chaque lobby de jeu, toutes les 15 s). Sans cache, chaque sondage
 * relançait la purge des tables abandonnées (sous-requête corrélée) plus
 * trois lectures : un samedi soir, c'est le poste le plus lourd de SQLite
 * pour un résultat identique.
 *
 * Trois règles :
 * - TTL court (3 s, sous la cadence de sondage) : un seul chargement sert
 *   tous les sondages qui tombent dans la fenêtre ;
 * - une seule promesse en vol : les sondages qui arrivent PENDANT un
 *   chargement l'attendent au lieu d'en lancer un autre ;
 * - invalidation explicite (invalidateLobbiesCache) partout où une salle est
 *   créée, rejointe, quittée, lancée ou change de visibilité : le joueur qui
 *   vient de créer sa table ne doit pas attendre 3 s pour la voir listée.
 *
 * L'état vit sur globalThis, comme le bus de salle et le client Prisma : Next
 * peut recopier un petit module dans plusieurs bundles de routes, et une
 * invalidation depuis /rooms doit atteindre le cache que lit /lobbies. En
 * multi-instances, remplacer par un cache partagé (Redis) ou supprimer.
 */

/** Ce que le guichet affiche — dans l'ordre historique de la réponse JSON. */
export type LobbiesResponse = LobbyOverview & { recentLaunches: RecentLaunchItem[] }

/** Sous la cadence de sondage la plus serrée (4 s, le guichet) : chaque sondage voit au pire une réponse vieille de 3 s. */
export const LOBBIES_CACHE_TTL_MS = 3_000

type LobbiesCacheState = {
  value: LobbiesResponse | null
  /** Instant (ms) à partir duquel `value` ne vaut plus ; 0 quand rien n'est retenu. */
  freshUntil: number
  /** Chargement en cours, partagé par tous les lecteurs qui arrivent entre-temps. */
  inFlight: Promise<LobbiesResponse> | null
  /**
   * Compteur d'invalidations : un chargement parti AVANT une invalidation a pu
   * lire la base avant la mutation, son résultat n'est donc jamais retenu.
   */
  generation: number
}

const globalForCache = globalThis as unknown as { __lpLobbiesCache?: LobbiesCacheState }

const state: LobbiesCacheState = globalForCache.__lpLobbiesCache ?? {
  value: null,
  freshUntil: 0,
  inFlight: null,
  generation: 0,
}

if (!globalForCache.__lpLobbiesCache) {
  globalForCache.__lpLobbiesCache = state
}

/**
 * Sert la réponse du guichet depuis le cache, ou la (re)charge via `load` —
 * une seule fois même sous les sondages concurrents. Un chargement qui échoue
 * n'est pas retenu : tous ses lecteurs reçoivent l'erreur, le suivant relance.
 */
export async function readLobbiesCached(load: () => Promise<LobbiesResponse>): Promise<LobbiesResponse> {
  if (state.value && Date.now() < state.freshUntil) return state.value
  if (state.inFlight) return state.inFlight

  const generation = state.generation
  const pending = load()
    .then((value) => {
      if (state.generation === generation) {
        state.value = value
        state.freshUntil = Date.now() + LOBBIES_CACHE_TTL_MS
      }
      return value
    })
    .finally(() => {
      // Une invalidation a pu remplacer la promesse en vol par la sienne :
      // on ne libère que la nôtre.
      if (state.inFlight === pending) state.inFlight = null
    })
  state.inFlight = pending
  return pending
}

/**
 * À appeler après toute écriture qui change ce que le guichet montre :
 * création, jointure, départ, lancement, retour au lobby, changement de
 * visibilité, purge. Le prochain lecteur recharge ; un chargement déjà en
 * vol n'est plus retenu ni partagé, puisqu'il a pu lire l'état d'avant.
 */
export function invalidateLobbiesCache(): void {
  state.value = null
  state.freshUntil = 0
  state.inFlight = null
  state.generation += 1
}
