import { describe, expect, it } from 'vitest'
import { decideGameAccess, type GameAccessInput } from './game-access'

const base: GameAccessInput = {
  gameId: 'hi-lo',
  hiddenIds: ['hi-lo'],
  catalogKnown: true,
  isStaff: false,
  authLoading: false,
  roomGameId: null,
  roomResolved: true,
  soireeRoundPlaying: false,
  soireeReady: true,
}

describe('accès à la page d’un jeu', () => {
  it('bloque un joueur ordinaire sur un jeu caché', () => {
    expect(decideGameAccess(base)).toBe('blocked')
  })

  it('ne change rien pour un jeu non caché ou hors page de jeu', () => {
    expect(decideGameAccess({ ...base, hiddenIds: [] })).toBe('open')
    expect(decideGameAccess({ ...base, hiddenIds: ['purple'] })).toBe('open')
    expect(decideGameAccess({ ...base, gameId: null })).toBe('open')
  })

  it('ne bloque rien tant que le catalogue n’a pas été lu', () => {
    expect(decideGameAccess({ ...base, catalogKnown: false })).toBe('open')
  })

  it('laisse l’équipe voir le jeu, avec le bandeau', () => {
    expect(decideGameAccess({ ...base, isStaff: true })).toBe('staff')
  })

  it('ne tranche pas avant d’avoir lu la session ou la soirée (pas de clignotement)', () => {
    expect(decideGameAccess({ ...base, authLoading: true })).toBe('open')
    expect(decideGameAccess({ ...base, soireeReady: false })).toBe('open')
  })

  it('une table en ligne déjà ouverte sur ce jeu va au bout', () => {
    expect(decideGameAccess({ ...base, roomGameId: 'hi-lo' })).toBe('open')
    expect(decideGameAccess({ ...base, roomGameId: 'purple' })).toBe('blocked')
  })

  it('ne bloque pas un joueur en ligne tant que sa salle n’a pas été relue (rechargement)', () => {
    expect(decideGameAccess({ ...base, roomResolved: false, roomGameId: null })).toBe('open')
    expect(decideGameAccess({ ...base, roomResolved: false, roomGameId: undefined })).toBe('open')
  })

  it('bloque une fois la lecture de la salle finie, même échouée, sans table sur ce jeu', () => {
    expect(decideGameAccess({ ...base, roomResolved: true, roomGameId: null })).toBe('blocked')
  })

  it('l’équipe n’attend pas la salle pour voir son bandeau', () => {
    expect(decideGameAccess({ ...base, roomResolved: false, isStaff: true })).toBe('staff')
  })

  it('une manche de soirée déjà lancée sur ce jeu va au bout', () => {
    expect(decideGameAccess({ ...base, soireeRoundPlaying: true })).toBe('open')
  })
})
