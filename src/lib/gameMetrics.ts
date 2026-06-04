import { Player } from './players'

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
  // Roulette Russe
  'roulette-russe': [
    { id: 'wins@roulette-russe', title: 'Victoires Roulette Russe', icon: '🏆', getValue: (p) => p.stats.gameStats?.['roulette-russe']?.wins || 0, format: defaultFormat },
    { id: 'games@roulette-russe', title: 'Parties Roulette Russe', icon: '🎮', getValue: (p) => p.stats.gameStats?.['roulette-russe']?.gamesPlayed || 0, format: defaultFormat },
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


