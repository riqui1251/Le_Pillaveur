import { describe, expect, it } from 'vitest'
import { GAMES } from '@/lib/games'
import { homeGameCounts, initialHomeChoice, parseHomePick } from './home-choice'

describe('initialHomeChoice', () => {
  it('un compte en mode en ligne arrive sur Jeu libre, en ligne, quel que soit le choix gardé', () => {
    expect(initialHomeChoice({ playMode: 'online', stored: 'soiree' })).toEqual({ pick: 'libre', where: 'online' })
    expect(initialHomeChoice({ playMode: 'online', stored: null })).toEqual({ pick: 'libre', where: 'online' })
  })

  it('sinon le dernier choix de l’appareil, sur ce téléphone', () => {
    expect(initialHomeChoice({ playMode: 'local', stored: 'soiree' })).toEqual({ pick: 'soiree', where: 'local' })
    expect(initialHomeChoice({ playMode: null, stored: 'libre' })).toEqual({ pick: 'libre', where: 'local' })
  })

  it('sans choix gardé, aucune carte n’est choisie', () => {
    expect(initialHomeChoice({ playMode: null, stored: null })).toEqual({ pick: null, where: 'local' })
    expect(initialHomeChoice({ playMode: 'local', stored: null })).toEqual({ pick: null, where: 'local' })
  })
})

describe('parseHomePick', () => {
  it('ne garde que les deux modes connus', () => {
    expect(parseHomePick('soiree')).toBe('soiree')
    expect(parseHomePick('libre')).toBe('libre')
    expect(parseHomePick('online')).toBeNull()
    expect(parseHomePick(null)).toBeNull()
  })
})

describe('homeGameCounts', () => {
  const games = [
    { id: 'a' },
    { id: 'b', onlineReady: true },
    { id: 'c', onlineReady: true, onlineOnly: true, softModeReady: true },
    { id: 'd', hidden: true, onlineReady: true },
    { id: 'e', onlineReady: true, onlineOnly: true },
  ]

  it('compte les jeux listés, ceux d’un seul téléphone et ceux d’une table en ligne', () => {
    expect(homeGameCounts(games, [], false)).toEqual({ all: 4, local: 2, online: 3 })
  })

  it('retire les jeux cachés par l’équipe', () => {
    expect(homeGameCounts(games, ['b', 'e'], false)).toEqual({ all: 2, local: 1, online: 1 })
  })

  it('sans alcool, en ligne, seuls les jeux qui ont leur variante comptent', () => {
    expect(homeGameCounts(games, [], true)).toEqual({ all: 4, local: 2, online: 1 })
  })

  it('reste cohérent avec le catalogue réel', () => {
    const counts = homeGameCounts(GAMES, [], false)
    expect(counts.all).toBe(GAMES.filter((g) => !g.hidden).length)
    expect(counts.local + GAMES.filter((g) => !g.hidden && g.onlineOnly).length).toBe(counts.all)
    expect(counts.online).toBeGreaterThan(0)
  })
})
