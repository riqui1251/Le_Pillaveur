/**
 * « Lancer sans les retardataires » : logique pure du lobby, testée sans
 * React ni réseau (cf. lobby-launch.test.ts).
 *
 * Un samedi soir, il suffit d'UN téléphone posé sur la table (batterie vide,
 * ami parti fumer, appli en arrière-plan) pour bloquer toute la tablée : le
 * serveur exige tous prêts au lancement. L'hôte doit toujours pouvoir
 * débloquer la table — mais jamais au prix d'une partie qui démarre sous le
 * minimum du jeu. Cette fonction dit quand PROPOSER le raccourci et quand
 * l'AUTORISER ; le composant, lui, ne fait que l'afficher.
 */

export type ForceLaunchSeat = {
  isReady: boolean
  /**
   * L'hôte reste à table quoi qu'il arrive : le bouton le met prêt avant de
   * lancer, il ne compte donc jamais parmi les retardataires.
   */
  isHost: boolean
  /** Équipe choisie au lobby (Mots Codés) — absent ou null : répartie au lancement. */
  team?: 'A' | 'B' | null
}

export type ForceLaunchInput = {
  /** Sièges humains de la table (bots exclus). */
  members: ForceLaunchSeat[]
  /** Bots réglés par l'hôte — 0 si le jeu ne les accepte pas. */
  botCount: number
  /** Minimum du jeu, humains + bots (GameMeta.minPlayers). */
  minPlayers: number
  /**
   * Minimum PAR ÉQUIPE une fois les retardataires retirés (Mots Codés : 2,
   * cf. team_min_players dans la route launch). Sans lui, le raccourci
   * promettait un lancement que le serveur refusait ensuite.
   */
  teamMinPlayers?: number
}

/** Minimum par équipe de Mots Codés — la même borne que la route launch. */
export const MC_TEAM_MIN_PLAYERS = 2

/**
 * Prêts qu'il manquerait pour que chaque équipe atteigne `teamMin`, sur les
 * sièges conservés. Les non-assignés vont à la plus petite équipe (A à
 * égalité) : même règle d'équilibrage que le serveur (mcTeamCounts).
 */
function teamShortfall(staying: ForceLaunchSeat[], teamMin: number): number {
  const counts = { A: 0, B: 0 }
  let unassigned = 0
  for (const seat of staying) {
    if (seat.team === 'A' || seat.team === 'B') counts[seat.team] += 1
    else unassigned += 1
  }
  for (let i = 0; i < unassigned; i += 1) counts[counts.A <= counts.B ? 'A' : 'B'] += 1
  return Math.max(0, teamMin - counts.A) + Math.max(0, teamMin - counts.B)
}

export type ForceLaunchDecision = {
  /** Au moins un retardataire (pas prêt, pas l'hôte) : le raccourci a un sens. */
  offered: boolean
  /** Ceux qui restent (+ bots) atteignent le minimum : le raccourci est actionnable. */
  allowed: boolean
  /** Sièges conservés au lancement (prêts + hôte). */
  staying: number
  /** Sièges qui seraient retirés. */
  late: number
  /** Prêts qu'il manquerait encore pour lancer (0 dès que `allowed`). */
  missing: number
}

export function forceLaunchDecision({
  members,
  botCount,
  minPlayers,
  teamMinPlayers,
}: ForceLaunchInput): ForceLaunchDecision {
  const bots = Math.max(0, botCount)
  const stayingSeats = members.filter((m) => m.isReady || m.isHost)
  const staying = stayingSeats.length
  const late = members.length - staying
  // Le manque le plus grand fait foi : total du jeu, ou équipes (Mots Codés
  // n'a pas de bots de complément, le manque d'équipe se compte en humains).
  const missing = Math.max(
    0,
    minPlayers - staying - bots,
    teamMinPlayers ? teamShortfall(stayingSeats, teamMinPlayers) : 0
  )
  const offered = late > 0
  return { offered, allowed: offered && missing === 0, staying, late, missing }
}
