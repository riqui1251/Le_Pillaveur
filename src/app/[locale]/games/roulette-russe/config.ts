type RouletteRusseTranslator = {
  (key: 'title'): string
  raw(key: 'config.rules'): string[]
}

type CatalogTranslator = (key: 'roulette-russe.description') => string

export function createGameConfig(t: RouletteRusseTranslator, tCatalog: CatalogTranslator) {
  return {
    name: t('title'),
    description: tCatalog('roulette-russe.description'),
    minPlayers: 2,
    maxPlayers: 8,
    icon: '🎲',
    category: 'alcool',
    rules: t.raw('config.rules'),
  }
}
