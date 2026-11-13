/**
 * Garde des gestes de la barre du bas. Chaque action y fait apparaître un
 * autre bouton SOUS LE DOIGT : « Binôme : X », « Ajouter la règle » ou
 * « Passer » laissent place à « Tirer une carte », un Valet tiré met
 * « Passer » sous le tiers gauche du tirage, une nouvelle partie remet
 * « Tirer une carte » là où était « Commencer ». Le second toucher d'un
 * double toucher (~150 ms plus tard) ne doit rien déclencher.
 *
 * Horloge : celle de la page (`performance.now()`), qui est aussi celle de
 * `event.timeStamp` dans les navigateurs actuels.
 */

/** Écart minimal entre deux actions de la barre (ou entre la création de la partie et la première). */
export const COUPE_TAP_LOCK_MS = 700

/**
 * Lecture minimale de l'écran de fin : le quatrième roi l'affiche dans le
 * clic même du tirage, et « Quitter » tombe pile sous « Tirer une carte ».
 */
export const COUPE_END_READ_MS = 1_500

/**
 * Instant d'un geste sur l'horloge de la page. Un `timeStamp` absent, nul ou
 * en avance sur `now` (heure murale des vieux moteurs) ne se compare pas à
 * cette horloge : on prend `now`.
 */
export function coupeGestureAt(timeStamp: number | undefined, now: number): number {
  return typeof timeStamp === 'number' && timeStamp > 0 && timeStamp <= now ? timeStamp : now
}

/** Vrai si un geste à `at` tombe hors du verrou posé par l'action précédente (`lastAt`). */
export function coupeTapAllowed(at: number, lastAt: number, lockMs: number = COUPE_TAP_LOCK_MS): boolean {
  return at - lastAt >= lockMs
}
