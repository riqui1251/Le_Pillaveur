import { describe, expect, it } from 'vitest'
import { GAMES } from '@/lib/games'
import { gameSubtitleKey } from '@/lib/nav-meta'

const byId = (id: string) => {
  const game = GAMES.find((g) => g.id === id)
  if (!game) throw new Error(`jeu inconnu : ${id}`)
  return game
}

/**
 * Le sous-titre de la navbar d'une page de jeu dit OÙ le jeu se joue — vrai
 * sur la vitrine, au pré-lobby comme en pleine partie —, plus « Partie en
 * cours » avant même que le premier joueur soit choisi.
 */
describe('gameSubtitleKey', () => {
  it('un jeu en ligne seulement se joue « un téléphone chacun », quel que soit le mode', () => {
    const loupGarou = byId('loup-garou')
    expect(loupGarou.onlineOnly).toBe(true)
    expect(gameSubtitleKey(loupGarou, undefined)).toBe('game.online')
    expect(gameSubtitleKey(loupGarou, 'local')).toBe('game.online')
    expect(gameSubtitleKey(loupGarou, 'online')).toBe('game.online')
  })

  it('un jeu local qui a sa salle suit le mode du joueur', () => {
    const petitBuveur = byId('petit-buveur')
    expect(petitBuveur.onlineOnly).toBeFalsy()
    expect(petitBuveur.onlineReady).toBe(true)
    expect(gameSubtitleKey(petitBuveur, undefined)).toBe('game.local')
    expect(gameSubtitleKey(petitBuveur, 'local')).toBe('game.local')
    expect(gameSubtitleKey(petitBuveur, 'online')).toBe('game.online')
  })

  it('un jeu sans salle en ligne reste « sur un seul téléphone », même en mode en ligne', () => {
    const local = GAMES.find((g) => !g.onlineOnly && !g.onlineReady && !g.hidden)
    expect(local).toBeDefined()
    expect(gameSubtitleKey(local!, 'online')).toBe('game.local')
  })
})
