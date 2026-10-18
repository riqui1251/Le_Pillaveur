import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { getGameById, soloBotsCount } from '@/lib/games'
import {
  ESPION_DEFAULT_DISCUSSION_MS,
  ESPION_DISCUSSION_MINUTES_OPTIONS,
  ESPION_SOLO_DISCUSSION_MIN,
  espionDiscussionMinutes,
} from './discussion'
import * as engine from './engine'

describe('espionDiscussionMinutes', () => {
  it("le choix explicite de l'hôte (3, 5 ou 7 min) l'emporte, seul ou à plusieurs", () => {
    expect([...ESPION_DISCUSSION_MINUTES_OPTIONS]).toEqual([3, 5, 7])
    for (const choice of ESPION_DISCUSSION_MINUTES_OPTIONS) {
      expect(espionDiscussionMinutes(choice, 1), `${choice} min en solo`).toBe(choice)
      expect(espionDiscussionMinutes(choice, 2), `${choice} min à 2`).toBe(choice)
      expect(espionDiscussionMinutes(choice, 8), `${choice} min à 8`).toBe(choice)
    }
  })

  it('sans choix : 3 min pour un humain seul face aux bots, 5 min à plusieurs', () => {
    expect(ESPION_SOLO_DISCUSSION_MIN).toBe(3)
    expect(espionDiscussionMinutes(undefined, 1)).toBe(3)
    expect(espionDiscussionMinutes(undefined, 2)).toBe(ESPION_DEFAULT_DISCUSSION_MS / 60_000)
    expect(espionDiscussionMinutes(undefined, 2)).toBe(5)
    expect(espionDiscussionMinutes(undefined, 16)).toBe(5)
  })

  it('les valeurs hors des choix proposés sont ignorées, comme une absence de choix', () => {
    for (const invalid of [null, 0, 1, 4, 6, 8, -3, 3.5, Number.NaN, '3', '5', [3], { value: 3 }, true]) {
      expect(espionDiscussionMinutes(invalid, 1), `${String(invalid)} en solo`).toBe(3)
      expect(espionDiscussionMinutes(invalid, 4), `${String(invalid)} à 4`).toBe(5)
    }
  })

  it('le moteur réexporte les mêmes constantes (une seule source)', () => {
    expect(engine.ESPION_DISCUSSION_MINUTES_OPTIONS).toBe(ESPION_DISCUSSION_MINUTES_OPTIONS)
    expect(engine.ESPION_DEFAULT_DISCUSSION_MS).toBe(ESPION_DEFAULT_DISCUSSION_MS)
  })

  it("la table d'essai solo (1 humain + soloBots, chrono sans choix) est celle que la simulation mesure : 1 + 4 bots × 3 min", () => {
    expect(soloBotsCount(getGameById('espion')!)).toBe(4)
    expect(espionDiscussionMinutes(undefined, 1)).toBe(3)
  })

  it('reste sans dépendance : le lobby commun l’importe sans tirer le moteur', () => {
    const source = readFileSync(fileURLToPath(new URL('./discussion.ts', import.meta.url)), 'utf8')
    expect(source).not.toMatch(/^\s*import\s/m)
    expect(source).not.toMatch(/\brequire\(/)
  })
})
