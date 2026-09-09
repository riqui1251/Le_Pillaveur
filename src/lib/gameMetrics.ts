import { Player, PlayerStats } from './players'

export type MetricDescriptor = {
  id: string
  title: string
  icon?: string // emoji simple pour l’UI rapide
  getValue: (player: Player) => number
  format?: (value: number) => string
}

const defaultFormat = (v: number) => `${v}`

// Définitions de base valables pour tous les jeux
export const BASE_METRICS: Record<string, MetricDescriptor> = {
  wins: {
    id: 'wins',
    title: 'Victoires',
    icon: '🏆',
    getValue: (p) => p.stats.wins || 0,
    format: defaultFormat,
  },
  gamesPlayed: {
    id: 'gamesPlayed',
    title: 'Parties jouées',
    icon: '⭐',
    getValue: (p) => p.stats.gamesPlayed || 0,
    format: defaultFormat,
  },
}

// Métriques spécifiques par jeu (utilise gameStats[gameId])
const gameSpecific: Record<string, MetricDescriptor[]> = {
  // Petit Buveur
  'petit-buveur': [
    { id: 'totalDrinks', title: 'Gorgées bues', icon: '🍺', getValue: (p) => p.stats.gameStats?.['petit-buveur']?.totalDrinks || 0, format: defaultFormat },
    { id: 'wins@petit-buveur', title: 'Victoires Petit Buveur', icon: '🏆', getValue: (p) => p.stats.gameStats?.['petit-buveur']?.wins || 0, format: defaultFormat },
    { id: 'games@petit-buveur', title: 'Parties Petit Buveur', icon: '🎮', getValue: (p) => p.stats.gameStats?.['petit-buveur']?.gamesPlayed || 0, format: defaultFormat },
  ],
  // Hi-Lo
  'hi-lo': [
    { id: 'totalDrinks', title: 'Gorgées bues', icon: '🍺', getValue: (p) => p.stats.gameStats?.['hi-lo']?.totalDrinks || 0, format: defaultFormat },
    { id: 'wins@hi-lo', title: 'Victoires Hi/Lo', icon: '🏆', getValue: (p) => p.stats.gameStats?.['hi-lo']?.wins || 0, format: defaultFormat },
    { id: 'games@hi-lo', title: 'Parties Hi/Lo', icon: '🎮', getValue: (p) => p.stats.gameStats?.['hi-lo']?.gamesPlayed || 0, format: defaultFormat },
  ],
  // PMU
  'pmu': [
    { id: 'wins@pmu', title: 'Victoires PMU', icon: '🏆', getValue: (p) => p.stats.gameStats?.['pmu']?.wins || 0, format: defaultFormat },
    { id: 'games@pmu', title: 'Parties PMU', icon: '🎮', getValue: (p) => p.stats.gameStats?.['pmu']?.gamesPlayed || 0, format: defaultFormat },
  ],
  // Pyramide
  'pyramide': [
    { id: 'wins@pyramide', title: 'Victoires Pyramide', icon: '🏆', getValue: (p) => p.stats.gameStats?.['pyramide']?.wins || 0, format: defaultFormat },
    { id: 'games@pyramide', title: 'Parties Pyramide', icon: '🎮', getValue: (p) => p.stats.gameStats?.['pyramide']?.gamesPlayed || 0, format: defaultFormat },
  ],
  // Plinko
  'plinko': [
    { id: 'wins@plinko', title: 'Victoires Plinko', icon: '🏆', getValue: (p) => p.stats.gameStats?.['plinko']?.wins || 0, format: defaultFormat },
    { id: 'games@plinko', title: 'Parties Plinko', icon: '🎮', getValue: (p) => p.stats.gameStats?.['plinko']?.gamesPlayed || 0, format: defaultFormat },
  ],
  // Monsieur 3
  'monsieur-3': [
    { id: 'wins@monsieur-3', title: 'Victoires Monsieur 3', icon: '🏆', getValue: (p) => p.stats.gameStats?.['monsieur-3']?.wins || 0, format: defaultFormat },
    { id: 'games@monsieur-3', title: 'Parties Monsieur 3', icon: '🎮', getValue: (p) => p.stats.gameStats?.['monsieur-3']?.gamesPlayed || 0, format: defaultFormat },
  ],
  // Ballon Surprise
  'ballon-surprise': [
    { id: 'wins@ballon-surprise', title: 'Victoires Ballon Surprise', icon: '🏆', getValue: (p) => p.stats.gameStats?.['ballon-surprise']?.wins || 0, format: defaultFormat },
    { id: 'games@ballon-surprise', title: 'Parties Ballon Surprise', icon: '🎮', getValue: (p) => p.stats.gameStats?.['ballon-surprise']?.gamesPlayed || 0, format: defaultFormat },
  ],
  // Petits Points
  'petits-points': [
    { id: 'wins@petits-points', title: 'Victoires Petits Points', icon: '🏆', getValue: (p) => p.stats.gameStats?.['petits-points']?.wins || 0, format: defaultFormat },
    { id: 'games@petits-points', title: 'Parties Petits Points', icon: '🎮', getValue: (p) => p.stats.gameStats?.['petits-points']?.gamesPlayed || 0, format: defaultFormat },
  ],
}

export function getMetricsForGame(gameId: string): MetricDescriptor[] {
  const perGame = gameSpecific[gameId] ?? []
  // Toujours inclure des métriques de base contextualisées au jeu sélectionné
  const winsForGame: MetricDescriptor = {
    id: 'wins@' + gameId,
    title: 'Victoires (' + gameId + ')',
    icon: '🏆',
    getValue: (p) => p.stats.gameStats?.[gameId]?.wins || 0,
    format: defaultFormat,
  }
  const gamesPlayedForGame: MetricDescriptor = {
    id: 'gamesPlayed@' + gameId,
    title: 'Parties (' + gameId + ')',
    icon: '🎮',
    getValue: (p) => p.stats.gameStats?.[gameId]?.gamesPlayed || 0,
    format: defaultFormat,
  }
  return [winsForGame, gamesPlayedForGame, ...perGame]
}


// ─── Records de la table, DEPUIS TOUJOURS (mode LOCAL) ───────────────────────
// Pourquoi : le mode local ne laissait aucune trace. Les compteurs par joueur
// existaient déjà (parties, victoires, gorgées) mais n'étaient affichés nulle
// part, donc rien ne donnait envie de relancer une partie. On en tire quelques
// lignes qui font parler autour de la table — surtout pas un tableau de bord :
// un titre par catégorie, trois au maximum, et rien du tout tant que la table
// n'a rien joué.
//
// PÉRIMÈTRE — À LIRE AVANT DE TOUCHER AUX LIBELLÉS : ces chiffres sont les
// compteurs À VIE de `Player.stats`, cumulés depuis la création de chaque
// joueur. Ce ne sont PAS ceux de la soirée en cours. Mesurer la soirée
// supposerait un début de soirée, or il n'en existe aucun en local : rien ne
// dit si le groupe rouvre l'app pour la même soirée ou pour la suivante, et
// il faudrait photographier les stats de chaque joueur, invalider la photo à
// chaque changement de table et décider d'une règle de remise à zéro — une
// machinerie disproportionnée pour un panneau replié de trois lignes. On
// assume donc le cumul, mais l'affichage doit le DIRE (« records », « depuis
// le début »), jamais se faire passer pour le bilan de la soirée. Les libellés
// vivent dans `hub.nightAwards` (cf. gameMetrics-i18n) : s'ils reparlent de
// « soirée », c'est un mensonge d'intitulé, pas un détail de rédaction.

export type NightAwardId = 'champion' | 'thirsty' | 'unlucky' | 'sober'

export type NightAward = {
  id: NightAwardId
  /** Plusieurs noms en cas d'égalité : personne ne se fait voler son titre. */
  names: string[]
  value: number
}

export type NightSummary = {
  /**
   * Parties vues par la table DEPUIS TOUJOURS : le MAXIMUM des joueurs, pas la
   * somme — une partie à six compte pour une, pas pour six.
   */
  gamesPlayed: number
  /** Gorgées de toute la vie des joueurs présents (là, la somme a du sens). */
  totalDrinks: number
  /** Jeu le plus joué par cette table, null si personne n'a encore joué. */
  topGameId: string | null
  /** Au plus trois titres, dans l'ordre où on veut les lire. */
  awards: NightAward[]
}

type Ranked = { names: string[]; value: number }

/**
 * Un titre partagé par plus de deux personnes n'est plus un titre : au-delà,
 * la ligne ne distingue plus personne et on préfère ne rien afficher.
 */
const MAX_TIED_WINNERS = 2

const statOf = (p: Player): PlayerStats => p.stats ?? { gamesPlayed: 0, wins: 0, totalDrinks: 0 }

/** Tête de classement d'une métrique. null si personne ne se détache. */
function rankTop(players: Player[], getValue: (p: Player) => number): Ranked | null {
  if (players.length < 2) return null
  const values = players.map(getValue)
  const max = Math.max(...values)
  const min = Math.min(...values)
  // Zéro partout, ou tout le monde à égalité : rien à raconter.
  if (max <= 0 || max === min) return null
  const names = players.filter((_, i) => values[i] === max).map((p) => p.name)
  if (names.length > MAX_TIED_WINNERS) return null
  return { names, value: max }
}

/** La lanterne rouge : le plus de parties encaissées sans une seule victoire. */
function rankUnlucky(players: Player[]): Ranked | null {
  if (players.length < 2) return null
  // Si personne n'a gagné, il n'y a pas de lanterne rouge : juste une table
  // dont on ne compte pas les victoires (Petit Buveur, Roue des gorgées…).
  if (!players.some((p) => statOf(p).wins > 0)) return null
  const losers = players.filter((p) => statOf(p).gamesPlayed > 0 && statOf(p).wins === 0)
  if (losers.length === 0) return null
  const max = Math.max(...losers.map((p) => statOf(p).gamesPlayed))
  const names = losers.filter((p) => statOf(p).gamesPlayed === max).map((p) => p.name)
  if (names.length > MAX_TIED_WINNERS) return null
  return { names, value: max }
}

/** Le plus sage : le moins de gorgées, quand quelqu'un d'autre a bu. */
function rankSober(players: Player[]): Ranked | null {
  const active = players.filter((p) => statOf(p).gamesPlayed > 0)
  // À deux, « le plus sage » n'est que l'inverse du « gosier » : la ligne
  // répéterait la précédente. Il faut une vraie table pour que ça amuse.
  if (active.length < 3) return null
  const values = active.map((p) => statOf(p).totalDrinks)
  const max = Math.max(...values)
  const min = Math.min(...values)
  if (max <= 0 || max === min) return null
  const names = active.filter((_, i) => values[i] === min).map((p) => p.name)
  if (names.length > MAX_TIED_WINNERS) return null
  return { names, value: min }
}

/** Jeu le plus joué par la table, toutes parties cumulées. */
export function findTopGameId(players: Player[]): string | null {
  const totals = new Map<string, number>()
  for (const player of players) {
    const gameStats = statOf(player).gameStats ?? {}
    for (const [gameId, stats] of Object.entries(gameStats)) {
      totals.set(gameId, (totals.get(gameId) ?? 0) + (stats?.gamesPlayed || 0))
    }
  }
  let best: string | null = null
  let bestValue = 0
  for (const [gameId, value] of totals) {
    // Égalité : on garde le premier rencontré, l'ordre d'insertion étant stable.
    if (value > bestValue) {
      best = gameId
      bestValue = value
    }
  }
  return best
}

/**
 * Records CUMULÉS d'une table donnée (voir le périmètre en tête de section :
 * compteurs à vie, pas la soirée). Renvoie null tant qu'aucune partie n'a été
 * jouée : mieux vaut ne rien montrer qu'un palmarès vide.
 */
export function computeNightSummary(players: Player[]): NightSummary | null {
  const gamesPlayed = players.reduce((max, p) => Math.max(max, statOf(p).gamesPlayed || 0), 0)
  if (gamesPlayed <= 0) return null

  const totalDrinks = players.reduce((sum, p) => sum + (statOf(p).totalDrinks || 0), 0)

  const awards: NightAward[] = []
  const champion = rankTop(players, (p) => statOf(p).wins || 0)
  if (champion) awards.push({ id: 'champion', ...champion })
  const thirsty = rankTop(players, (p) => statOf(p).totalDrinks || 0)
  if (thirsty) awards.push({ id: 'thirsty', ...thirsty })
  // La ligne qui fait rire : la lanterne rouge si quelqu'un collectionne les
  // défaites, sinon le plus sage — jamais les deux, ça ferait une liste.
  const unlucky = rankUnlucky(players)
  if (unlucky) {
    awards.push({ id: 'unlucky', ...unlucky })
  } else {
    const sober = rankSober(players)
    if (sober) awards.push({ id: 'sober', ...sober })
  }

  return { gamesPlayed, totalDrinks, topGameId: findTopGameId(players), awards }
}
