import type { PlayerStats } from '@/lib/players'

/** Signature de `usePlayers().updatePlayerStats` : elle CUMULE ce qu'on lui passe. */
export type UpdateLocalPlayerStats = (
  playerId: string,
  gameId: string,
  stats: Partial<PlayerStats>
) => unknown

/**
 * Victoire du Petit Buveur LOCAL : un seul endroit pour les quatre chemins qui
 * posent le pion sur la dernière case (dé, case « avance », chance « +2 »,
 * échange de places).
 *
 * updatePlayerStats CUMULE ce qu'on lui passe : on lui donne le delta de la
 * partie (une victoire), jamais un total. La partie jouée, elle, est comptée à
 * part, pour toute la table, quand l'écran de victoire apparaît.
 *
 * Une statistique ratée (stockage plein, navigation privée) ne doit jamais
 * bloquer l'écran de victoire : l'erreur est journalisée puis ignorée.
 */
export function recordWinnerStats(updatePlayerStats: UpdateLocalPlayerStats, winnerId: string): void {
  try {
    updatePlayerStats(winnerId, 'petit-buveur', { wins: 1 })
  } catch (error) {
    console.error('Erreur lors de la mise à jour des statistiques du gagnant:', error)
  }
}
