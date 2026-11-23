/**
 * Qui peut ouvrir la page d'un jeu que l'équipe a caché depuis la Supervision.
 * Décision pure : le layout des jeux lui passe ce qu'il sait (catalogue lu,
 * rôle, salle en ligne, soirée) et affiche en conséquence.
 *
 * - 'open'  : la page s'affiche comme d'habitude ;
 * - 'staff' : la page s'affiche, sous le bandeau « jeu caché » — l'équipe
 *   doit pouvoir le tester avant de le remettre ;
 * - 'blocked' : l'écran « jeu indisponible » remplace la page.
 */
export type GameAccess = 'open' | 'staff' | 'blocked'

export type GameAccessInput = {
  /** Jeu de la page (`gameIdOf(pathname)`), null hors d'une page de jeu. */
  gameId: string | null
  /** Jeux cachés par l'équipe (useGameCatalog). */
  hiddenIds: readonly string[]
  /** L'état du catalogue a été lu (copie de l'appareil ou serveur) : sans lui, on ne bloque rien. */
  catalogKnown: boolean
  /** Session lue ET rôle d'équipe (modérateur et au-dessus). */
  isStaff: boolean
  /** Session pas encore lue : on ne sait pas encore si c'est l'équipe. */
  authLoading: boolean
  /** Jeu de la salle en ligne où le joueur est assis, s'il y en a une. */
  roomGameId: string | null | undefined
  /**
   * La salle en ligne a été relue (ou n'a pas à l'être : hors mode en ligne).
   * Au rechargement la salle est null le temps du premier aller-retour : sans
   * ce repère, un joueur assis passerait pour un joueur sans table.
   */
  roomResolved: boolean
  /** Une manche du Mode Soirée est lancée sur ce jeu. */
  soireeRoundPlaying: boolean
  /** La soirée enregistrée a été relue (elle ne l'est qu'après le premier rendu). */
  soireeReady: boolean
}

export function decideGameAccess(input: GameAccessInput): GameAccess {
  const { gameId } = input
  if (!gameId || !input.catalogKnown || !input.hiddenIds.includes(gameId)) return 'open'
  // Tant qu'une des informations manque, on laisse passer : mieux vaut un jeu
  // ouvert une demi-seconde de trop qu'un écran « indisponible » qui clignote
  // devant l'équipe ou une table déjà ouverte.
  if (input.authLoading || !input.soireeReady) return 'open'
  if (input.isStaff) return 'staff'
  if (!input.roomResolved) return 'open'
  if (input.roomGameId === gameId) return 'open'
  if (input.soireeRoundPlaying) return 'open'
  return 'blocked'
}
