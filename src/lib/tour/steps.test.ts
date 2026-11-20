import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  DEMO_STEPS,
  LOCAL_STEPS,
  TOUR_CHAPTERS,
  chapterProgress,
  hasLaterScreen,
  resolveBackward,
  resolveForward,
  screenOfPath,
  type TourEnv,
  type TourScreen,
} from './steps'

const index = (id: string) => LOCAL_STEPS.findIndex((step) => step.id === id)

function env(screen: TourScreen | null, anchors: string[], locale = 'fr'): TourEnv {
  return { screen, locale, has: (anchor) => anchors.includes(anchor) }
}

const PLAYERS = ['players-add', 'players-grid', 'players-start', 'nav-burger']
const HUB = ['party-bar', 'hub-local-head', 'hub-local-grid', 'nav-burger']

describe('screenOfPath', () => {
  it('reconnaît les trois écrans du parcours, et eux seuls', () => {
    expect(screenOfPath('/joueurs')).toBe('players')
    expect(screenOfPath('/joueurs/')).toBe('players')
    expect(screenOfPath('/jeux')).toBe('hub')
    expect(screenOfPath('/games/petit-buveur')).toBe('game')
    // Une page de collection n'est pas le hub ; la landing et le compte non plus.
    expect(screenOfPath('/jeux/sans-alcool')).toBeNull()
    expect(screenOfPath('/')).toBeNull()
    expect(screenOfPath('/compte')).toBeNull()
    expect(screenOfPath('/games/purple/extra')).toBeNull()
  })
})

describe('resolveForward', () => {
  it('reste sur l’étape en cours tant que son élément est là', () => {
    expect(resolveForward(index('cards'), env('players', PLAYERS), false)).toBe(index('cards'))
  })

  it('passe au premier repère du nouvel écran quand la route change', () => {
    // « Commencer la partie » vient d'ouvrir le hub : l'étape en cours est encore sur « Joueurs ».
    expect(resolveForward(index('start'), env('hub', HUB), false)).toBe(index('partyBar'))
    // Une carte de jeu vient d'ouvrir un pré-lobby.
    expect(resolveForward(index('pickGame'), env('game', ['prelobby-rules', 'prelobby-start']), false)).toBe(
      index('rules')
    )
  })

  it('attend une étape obligatoire dont l’élément n’est pas encore monté', () => {
    expect(resolveForward(index('start'), env('hub', []), true)).toBe(index('partyBar'))
  })

  it('ne saute une étape facultative absente que sur demande', () => {
    const sansVolet = env('game', ['prelobby-start', 'nav-burger'])
    // Page en train de se monter : on garde l'étape des règles.
    expect(resolveForward(index('rules'), sansVolet, false)).toBe(index('rules'))
    // Page montée, pas de volet de règles (Purple) : on passe au bouton de lancement.
    expect(resolveForward(index('rules'), sansVolet, true)).toBe(index('launch'))
  })

  it('montre la table bulle seule quand la partie est déjà lancée', () => {
    expect(resolveForward(index('rules'), env('game', ['nav-burger']), true)).toBe(index('table'))
  })

  it('saute les étapes du menu « Règles » hors français, et finit', () => {
    const table = env('game', ['game-action', 'nav-burger', 'nav-rules'], 'en')
    expect(resolveForward(index('table') + 1, table, true)).toBeNull()
    expect(hasLaterScreen(index('table') + 1, table)).toBe(false)
    // En français, le menu suit.
    expect(resolveForward(index('table') + 1, env('game', ['nav-burger', 'nav-rules']), true)).toBe(index('menu'))
  })

  it('ne trouve rien hors du parcours', () => {
    expect(resolveForward(0, env(null, PLAYERS), true)).toBeNull()
  })

  it('signale qu’un écran reste à venir tant que le joueur n’a pas navigué', () => {
    // Dernière étape de « Joueurs » dépassée, toujours sur « Joueurs » : le hub et le jeu restent à voir.
    expect(resolveForward(index('start') + 1, env('players', PLAYERS), true)).toBeNull()
    expect(hasLaterScreen(index('start') + 1, env('players', PLAYERS))).toBe(true)
  })
})

describe('resolveBackward', () => {
  it('revient à l’étape précédente du même écran', () => {
    expect(resolveBackward(index('start'), env('players', PLAYERS))).toBe(index('cards'))
    expect(resolveBackward(index('pickGame'), env('hub', HUB))).toBe(index('localSection'))
  })

  it('saute une étape dont l’élément a disparu', () => {
    // Hub en ligne : pas d'intertitre « Sur ce téléphone ».
    expect(resolveBackward(index('pickGame'), env('hub', ['party-bar', 'hub-local-grid']))).toBe(index('partyBar'))
  })

  it('ne franchit pas un changement d’écran', () => {
    expect(resolveBackward(index('addRow'), env('players', PLAYERS))).toBeNull()
    expect(resolveBackward(index('partyBar'), env('hub', HUB))).toBeNull()
    // Partie lancée : ni volet de règles ni bouton de lancement derrière soi.
    expect(resolveBackward(index('table'), env('game', ['game-action', 'nav-burger']))).toBeNull()
  })
})

describe('chapterProgress', () => {
  it('compte les étapes dans leur chapitre', () => {
    expect(chapterProgress(LOCAL_STEPS, index('addRow'))).toEqual({ chapter: 0, step: 1, steps: 3 })
    expect(chapterProgress(LOCAL_STEPS, index('pickGame'))).toEqual({ chapter: 1, step: 3, steps: 3 })
    expect(chapterProgress(DEMO_STEPS, 0)).toEqual({ chapter: 3, step: 1, steps: 6 })
    expect(chapterProgress(DEMO_STEPS, DEMO_STEPS.length - 1)).toEqual({ chapter: 6, step: 9, steps: 9 })
  })

  it('les deux temps couvrent les sept chapitres, dans l’ordre', () => {
    const seen = [...LOCAL_STEPS, ...DEMO_STEPS].map((step) => TOUR_CHAPTERS.indexOf(step.chapter))
    expect([...seen].sort((a, b) => a - b)).toEqual(seen)
    expect(new Set(seen).size).toBe(TOUR_CHAPTERS.length)
  })
})

describe('textes du tuto', () => {
  const read = (locale: string) =>
    JSON.parse(readFileSync(fileURLToPath(new URL(`../../../messages/${locale}.json`, import.meta.url)), 'utf8')).tour

  it.each(['fr', 'en', 'es', 'it'])('chaque étape et chaque chapitre a son texte (%s)', (locale) => {
    const tour = read(locale)
    for (const chapter of TOUR_CHAPTERS) expect(tour.chapters[chapter], chapter).toBeTruthy()
    for (const step of LOCAL_STEPS) {
      expect(tour.local[step.id]?.title, `local.${step.id}`).toBeTruthy()
      expect(tour.local[step.id]?.body, `local.${step.id}`).toBeTruthy()
      if (step.nudge) expect(tour.nudge[step.nudge], `nudge.${step.nudge}`).toBeTruthy()
    }
    for (const step of DEMO_STEPS) {
      expect(tour.demo[step.id]?.title, `demo.${step.id}`).toBeTruthy()
      expect(tour.demo[step.id]?.body, `demo.${step.id}`).toBeTruthy()
    }
    // Aucun texte orphelin : une étape retirée du parcours retire aussi ses textes.
    expect(Object.keys(tour.demo).sort()).toEqual(DEMO_STEPS.map((step) => step.id).sort())
    expect(Object.keys(tour.local).sort()).toEqual([...LOCAL_STEPS.map((step) => step.id), 'again'].sort())
  })
})
