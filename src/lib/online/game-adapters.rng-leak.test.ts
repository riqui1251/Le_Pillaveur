import { describe, expect, it } from 'vitest'
import { GAME_ADAPTERS } from './game-adapters'
import { randomSeed } from '@/lib/petit-buveur/rng'
import { buildPetitBuveurEngineState } from '@/lib/petit-buveur/server-adapter'
import { buildTCState } from '@/lib/toucher-coule/server-adapter'
import { buildMenteurState } from '@/lib/menteur/server-adapter'
import { buildImposteurState } from '@/lib/imposteur/server-adapter'
import { buildQuizState } from '@/lib/quiz/server-adapter'
import { buildLGState } from '@/lib/loup-garou/server-adapter'
import { buildGame1220State } from '@/lib/1220/server-adapter'
import { buildPurpleState } from '@/lib/purple/server-adapter'
import { buildBluffState } from '@/lib/bluff/server-adapter'
import { buildEspionState } from '@/lib/espion/server-adapter'
import { buildTabouState } from '@/lib/tabou/server-adapter'
import { buildCrobardState } from '@/lib/crobard/server-adapter'
import { buildTelephoneState } from '@/lib/telephone-dessine/server-adapter'
import { buildSFState } from '@/lib/sans-filtre/server-adapter'
import { buildMCState } from '@/lib/mots-codes/server-adapter'
import { buildDilState } from '@/lib/dilemmes/server-adapter'
import { buildPbcState } from '@/lib/petit-bac/server-adapter'
import { buildPreState } from '@/lib/president/server-adapter'

/**
 * L'état du générateur (`rngState`) permet de rejouer tous les tirages à venir
 * d'une partie : dés cachés, mains, paquet, espion, flotte des bots… Il ne
 * doit JAMAIS sortir du serveur, ni par la vue joueur ni par la vue
 * spectateur (TV), et ce pour CHAQUE jeu du registre. Toute partie créée
 * aujourd'hui part d'une graine de 256 bits (ChaCha20) : l'état est une
 * string hexadécimale, jamais plus un entier de 32 bits.
 */

const MEMBERS = ['u1', 'u2', 'u3', 'u4', 'u5', 'u6'].map((userId) => ({
  userId,
  displayName: `Joueur ${userId}`,
  user: { displayName: `Joueur ${userId}` },
}))
const table = (n: number) => MEMBERS.slice(0, n)

type Built = { state: unknown; viewers: string[] }
const build = (state: unknown, n: number): Built => ({ state, viewers: table(n).map((m) => m.userId) })

/** Une partie par adaptateur, avec la graine aléatoire de production (randomSeed). */
const GAMES: Record<string, () => Built> = {
  'petit-buveur': () => build(buildPetitBuveurEngineState(table(3), 'normal', randomSeed()), 3),
  'toucher-coule': () => build(buildTCState(table(2), '1v1', {}, randomSeed()), 2),
  menteur: () => build(buildMenteurState(table(3), 0), 3),
  imposteur: () => build(buildImposteurState(table(4), 'fr', 0), 4),
  quiz: () => build(buildQuizState(table(3), 'fr', 10, 0), 3),
  'loup-garou': () => build(buildLGState(table(6), undefined, 0), 6),
  '1220': () => build(buildGame1220State(table(3), 0), 3),
  purple: () => build(buildPurpleState(table(3), 0), 3),
  bluff: () => build(buildBluffState(table(4), 'fr', 0), 4),
  espion: () => build(buildEspionState(table(4), 'fr', 0), 4),
  tabou: () => build(buildTabouState(table(4), {}, 'fr', 0), 4),
  crobard: () => build(buildCrobardState(table(4), 'fr', 0), 4),
  'telephone-dessine': () => build(buildTelephoneState(table(4)), 4),
  'sans-filtre': () => build(buildSFState(table(4), 'alcool', 0), 4),
  'mots-codes': () => build(buildMCState(table(4), {}, 'fr'), 4),
  dilemmes: () => build(buildDilState(table(4), 'alcool', 0), 4),
  'petit-bac': () => build(buildPbcState(table(4)), 4),
  president: () => build(buildPreState(table(4), 0), 4),
}

const rngStateOf = (state: unknown): unknown => (state as { rngState?: unknown }).rngState

describe('rngState ne sort jamais du serveur', () => {
  it('chaque adaptateur du registre a une partie de test', () => {
    expect(Object.keys(GAMES).sort()).toEqual(Object.keys(GAME_ADAPTERS).sort())
  })

  describe.each(Object.keys(GAME_ADAPTERS))('%s', (gameId) => {
    const adapter = GAME_ADAPTERS[gameId]
    const { state, viewers } = GAMES[gameId]()
    const rngState = rngStateOf(state)

    it("l'état complet porte un rngState ChaCha20 (string hexadécimale, clé 256 bits + compteur)", () => {
      expect(typeof rngState).toBe('string')
      expect(rngState).toMatch(/^[0-9a-f]{80}$/)
      expect(adapter.serialize(state)).toContain('"rngState"')
    })

    it('la vue de chaque joueur ne contient ni la clé « rngState » ni sa valeur', () => {
      const key = (rngState as string).slice(0, 64)
      for (const viewerId of viewers) {
        const json = adapter.clientViewJson(state, viewerId)
        const view = JSON.parse(json) as Record<string, unknown>
        expect('rngState' in view, `${viewerId} : clé rngState`).toBe(false)
        expect(json, `${viewerId} : mot rngState`).not.toContain('rngState')
        expect(json, `${viewerId} : valeur de l'état`).not.toContain(rngState as string)
        expect(json, `${viewerId} : clé du générateur`).not.toContain(key)
      }
    })

    it('la vue spectateur (TV) ne contient ni la clé « rngState » ni sa valeur', () => {
      const json = adapter.spectatorViewJson(state)
      const view = JSON.parse(json) as Record<string, unknown>
      expect('rngState' in view).toBe(false)
      expect(json).not.toContain('rngState')
      expect(json).not.toContain(rngState as string)
      expect(json).not.toContain((rngState as string).slice(0, 64))
    })
  })
})
