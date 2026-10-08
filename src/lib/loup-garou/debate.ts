/**
 * Durée du débat du Loup-Garou — module à part, SANS dépendance : le lobby
 * commun (GameOnlineLobby, chargé par toutes les pages de jeu en ligne) en a
 * besoin pour surligner la bonne durée, et importer le moteur entier pour
 * cette seule règle l'alourdirait d'autant. Le moteur réexporte les
 * constantes.
 */

/** Durées proposées à l'hôte au lobby, en minutes (réglage `lgDebateMin`). */
export const LG_DEBATE_CHOICES_MIN = [1, 2, 3, 4, 5] as const
export const LG_DEBATE_DEFAULT_MS = 180_000

/**
 * Débat d'une table SOLO (un seul humain, le reste en bots) : 1 min. Les
 * bots débattent par phrases toutes faites ; seul face à eux, les 3 min par
 * défaut sont un tunnel à attendre. En prod (07/10/2026), une partie solo
 * durait 6,8 min avec 3 abandons sur 9 — c'est ce temps mort qu'on coupe.
 */
export const LG_SOLO_DEBATE_MIN = 1

/**
 * Durée du débat retenue au lancement, en minutes. Le choix EXPLICITE de
 * l'hôte (lgDebateMin, posé seulement quand il touche le réglage) prime
 * toujours ; sans choix, 1 min pour un humain seul face aux bots, 3 min
 * sinon. `humanCount` : les membres humains de la salle au lancement — les
 * bots n'en sont jamais membres. Le lobby l'appelle avec les mêmes entrées
 * pour surligner la durée qui sera réellement jouée.
 */
export function lgDebateMinutes(chosen: unknown, humanCount: number): number {
  if (
    typeof chosen === 'number' &&
    (LG_DEBATE_CHOICES_MIN as readonly number[]).includes(chosen)
  ) {
    return chosen
  }
  return humanCount === 1 ? LG_SOLO_DEBATE_MIN : LG_DEBATE_DEFAULT_MS / 60_000
}
