/**
 * Compteur de flux SSE OUVERTS, par compte (mono-instance).
 *
 * Pourquoi pas checkRateLimit : le quota classique compte des OUVERTURES dans
 * une fenêtre de temps. Ici ce serait un contresens — un EventSource se
 * reconnecte tout seul toutes les ~3 s dès que le Wi-Fi de la cuisine tousse,
 * et un joueur parfaitement honnête brûlerait son quota en une minute. Ce qui
 * coûte, ce n'est pas l'ouverture : c'est la requête qui RESTE ouverte (un
 * intervalle de ping + deux abonnements au bus, pour toute sa durée de vie).
 * On compte donc les flux VIVANTS : +1 à l'ouverture, −1 au nettoyage.
 *
 * Même vie que le bus temps réel (room-bus.ts) : une Map unique par processus,
 * gardée sur globalThis pour survivre au HMR de dev. En multi-instances, chaque
 * conteneur ne compterait que les siens — le plafond deviendrait « par
 * instance », à revoir en même temps que le bus (Redis/PG LISTEN).
 */

const globalForStreams = globalThis as unknown as {
  __lpStreamCounts?: Map<string, number>
}

const counts = globalForStreams.__lpStreamCounts ?? new Map<string, number>()

if (!globalForStreams.__lpStreamCounts) {
  globalForStreams.__lpStreamCounts = counts
}

/**
 * Flux simultanés tolérés pour UN compte.
 *
 * Le budget réel d'un onglet est de DEUX flux, pas un : useOnlineRoom ouvre
 * celui de la salle, et useVoiceChat en ouvre un SECOND sur la même route —
 * dédié à la signalisation WebRTC, et tenu ouvert TOUT le temps que le vocal
 * est actif (pas seulement pendant une renégociation). À six, un joueur avec
 * son téléphone et sa tablette en vocal n'avait déjà plus qu'une place de
 * marge, et une reconnexion le mettait au plafond : le compteur ne redescend
 * qu'à la MORT d'une connexion, et un client parti en silence n'est ramassé
 * qu'au ping suivant (STREAM_HEARTBEAT_MS, 25 s).
 *
 * Douze, soit trois onglets en vocal plus la marge de reconnexion. C'est
 * toujours un plafond : il arrête la boucle d'un client cassé (ou d'un script)
 * qui empilerait les connexions jusqu'à la mémoire du conteneur, ce qui est le
 * seul but de ce compteur. Le flux TV n'y entre pas : il est public, sans
 * compte associé, et garde son propre quota par IP.
 */
export const MAX_STREAMS_PER_USER = 12

/**
 * Réserve une place de flux pour ce compte.
 * Retourne la fonction de libération (idempotente : le nettoyage d'un flux
 * peut partir de l'abort, d'un enqueue qui échoue ou du cancel du
 * ReadableStream), ou `null` si le compte est déjà au plafond.
 */
export function acquireStream(userId: string): (() => void) | null {
  const current = counts.get(userId) ?? 0
  if (current >= MAX_STREAMS_PER_USER) return null
  counts.set(userId, current + 1)

  let released = false
  return () => {
    if (released) return
    released = true
    const open = counts.get(userId) ?? 0
    // La clé disparaît à zéro : la Map ne doit pas garder une ligne par
    // compte ayant joué depuis le démarrage du conteneur.
    if (open <= 1) counts.delete(userId)
    else counts.set(userId, open - 1)
  }
}

/**
 * Photo du registre pour une sonde (santé, supervision) : des NOMBRES, jamais
 * un identifiant de compte — cette mesure n'a pas à dire qui est connecté.
 */
export function streamCounts(): { total: number; accounts: number; maxPerAccount: number } {
  let total = 0
  let maxPerAccount = 0
  for (const open of counts.values()) {
    total += open
    if (open > maxPerAccount) maxPerAccount = open
  }
  return { total, accounts: counts.size, maxPerAccount }
}

/** Remise à zéro — réservée aux tests (le registre vit dans le processus). */
export function resetStreamRegistry(): void {
  counts.clear()
}
