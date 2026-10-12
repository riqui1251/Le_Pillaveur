import { describe, expect, it } from 'vitest'
import { GAMES } from '@/lib/games'
import {
  HUB_PATH,
  OFFLINE_PAGE_PATH,
  PLAYERS_PATH,
  isOfflineLoadableKey,
  isOfflinePlayableGame,
  localeOfPath,
  offlineCacheablePaths,
  offlinePlayableGames,
  offlinePrecachePages,
  offlineRouteManifestKeys,
} from './offline-routes'

describe('jeux jouables hors ligne', () => {
  it('retient les jeux publiés jouables en local, et seulement eux', () => {
    const ids = offlinePlayableGames().map((g) => g.id)
    expect(ids).toEqual(['monsieur-3', 'pmu', 'petit-buveur', 'hi-lo', 'purple', 'pyramide', 'plinko', '1220'])
  })

  it('écarte les jeux masqués et les jeux en ligne uniquement', () => {
    expect(isOfflinePlayableGame({ hidden: true })).toBe(false)
    expect(isOfflinePlayableGame({ onlineOnly: true })).toBe(false)
    expect(isOfflinePlayableGame({})).toBe(true)
    for (const game of GAMES) {
      if (game.onlineOnly || game.hidden) expect(offlinePlayableGames().map((g) => g.id)).not.toContain(game.id)
    }
  })
})

describe('chemins à mettre en cache', () => {
  it('hub, joueurs, repli et pages des jeux locaux, sans langue', () => {
    const paths = offlineCacheablePaths()
    expect(paths.slice(0, 3)).toEqual([HUB_PATH, PLAYERS_PATH, OFFLINE_PAGE_PATH])
    expect(paths).toContain('/games/purple')
    expect(paths).not.toContain('/games/loup-garou')
    expect(paths.every((p) => p.startsWith('/') && !/^\/(fr|en|es|it)\//.test(p))).toBe(true)
  })

  it('précharge les pages publiques de la langue demandée, jamais la page des joueurs (protégée)', () => {
    const pages = offlinePrecachePages('en')
    expect(pages[0]).toBe('/en/jeux')
    expect(pages).toContain('/en/hors-ligne')
    expect(pages).toContain('/en/games/petit-buveur')
    expect(pages).not.toContain('/en/joueurs')
    expect(pages.every((p) => p.startsWith('/en/'))).toBe(true)
  })

  it('nomme les segments de manifeste des layouts, pages et squelettes concernés', () => {
    const keys = offlineRouteManifestKeys()
    expect(keys).toContain('/layout')
    expect(keys).toContain('/global-error')
    expect(keys).toContain('/[locale]/page')
    expect(keys).toContain('/[locale]/layout')
    expect(keys).toContain('/[locale]/jeux/page')
    expect(keys).toContain('/[locale]/joueurs/page')
    expect(keys).toContain('/[locale]/hors-ligne/page')
    expect(keys).toContain('/[locale]/games/layout')
    expect(keys).toContain('/[locale]/games/loading')
    expect(keys).toContain('/[locale]/games/purple/layout')
    expect(keys).toContain('/[locale]/games/purple/page')
    expect(keys).not.toContain('/[locale]/games/quiz/page')
  })
})

describe('morceaux chargés à la demande (react-loadable)', () => {
  it('garde le jeu local d’une page de jeu locale et écarte son jumeau en ligne', () => {
    expect(isOfflineLoadableKey('app/[locale]/games/purple/page.tsx -> ./components/game')).toBe(true)
    expect(isOfflineLoadableKey('app/[locale]/games/purple/page.tsx -> @/components/online/PurpleOnline')).toBe(false)
  })

  it('lit aussi les clés écrites avec des séparateurs Windows', () => {
    expect(isOfflineLoadableKey('app\\[locale]\\games\\petit-buveur\\page.tsx -> ./components/game')).toBe(true)
    expect(isOfflineLoadableKey('app\\[locale]\\games\\petit-buveur\\page.tsx -> @/components/online/PetitBuveurOnline')).toBe(false)
  })

  it('écarte les jeux en ligne uniquement, le vocal et les pages Next internes', () => {
    expect(isOfflineLoadableKey('app/[locale]/games/quiz/page.tsx -> @/components/online/QuizOnline')).toBe(false)
    expect(isOfflineLoadableKey('app/[locale]/games/layout.tsx -> @/components/voice/VoiceDock')).toBe(false)
    expect(isOfflineLoadableKey('../node_modules/next/dist/client/index.js -> ../pages/_app')).toBe(false)
    expect(isOfflineLoadableKey('sans fleche')).toBe(false)
  })

  it('garde les confettis de fin de partie et les panneaux de la barre de navigation', () => {
    expect(isOfflineLoadableKey('components/online/EndConfetti.tsx -> canvas-confetti')).toBe(true)
    expect(isOfflineLoadableKey('components/layout/Navbar.tsx -> @/components/feedback/FeedbackDialog')).toBe(true)
    expect(isOfflineLoadableKey('components/layout/Navbar.tsx -> @/components/chat/ChatPanel')).toBe(false)
    expect(isOfflineLoadableKey('components/online/OnlineEndScreen.tsx -> ./RematchNightCard')).toBe(false)
  })
})

describe('langue d’un chemin', () => {
  it('reconnaît un préfixe de langue du site, et rien d’autre', () => {
    expect(localeOfPath('/fr/jeux')).toBe('fr')
    expect(localeOfPath('/it')).toBe('it')
    expect(localeOfPath('/jeux')).toBeNull()
    expect(localeOfPath('/')).toBeNull()
    expect(localeOfPath('/de/jeux')).toBeNull()
  })
})
