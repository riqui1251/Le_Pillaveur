/**
 * Durée de la discussion de Qui est l'Espion ? — module à part, SANS
 * dépendance, calqué sur loup-garou/debate.ts : le lobby commun
 * (GameOnlineLobby, chargé par toutes les pages de jeu en ligne) en a besoin
 * pour surligner la bonne durée, et importer le moteur entier pour cette
 * seule règle l'alourdirait d'autant. Le moteur réexporte les constantes.
 */

/** Durées proposées à l'hôte au lobby, en minutes (réglage `espionDiscussionMin`). */
export const ESPION_DISCUSSION_MINUTES_OPTIONS = [3, 5, 7] as const
export const ESPION_DEFAULT_DISCUSSION_MS = 5 * 60_000

/**
 * Discussion d'une table SOLO (un seul humain, le reste en bots) : 3 min. Les
 * bots questionnent et répondent au rythme du fil par boutons ; seul face à
 * eux, 5 min laissent un tunnel en fin de manche, quand tout le monde a déjà
 * posé ses questions. La simulation (simulation.test.ts, configuration B)
 * mesure l'équilibre à 1 humain + 4 bots × 3 min.
 */
export const ESPION_SOLO_DISCUSSION_MIN = 3

/**
 * Durée de la discussion retenue au lancement, en minutes. Le choix EXPLICITE
 * de l'hôte (espionDiscussionMin, posé seulement quand il touche le réglage)
 * prime toujours ; sans choix, 3 min pour un humain seul face aux bots, 5 min
 * sinon. `humanCount` : les membres humains de la salle au lancement — les
 * bots n'en sont jamais membres. Le lobby l'appelle avec les mêmes entrées
 * pour surligner la durée qui sera réellement jouée.
 */
export function espionDiscussionMinutes(chosen: unknown, humanCount: number): number {
  if (
    typeof chosen === 'number' &&
    (ESPION_DISCUSSION_MINUTES_OPTIONS as readonly number[]).includes(chosen)
  ) {
    return chosen
  }
  return humanCount === 1 ? ESPION_SOLO_DISCUSSION_MIN : ESPION_DEFAULT_DISCUSSION_MS / 60_000
}
