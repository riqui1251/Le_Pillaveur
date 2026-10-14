import { describe, expect, it } from 'vitest'
import { genreOfId } from './bot-speech-feed'

const TABLE = [
  { id: 'h', name: 'Riqui', isBot: false },
  { id: 'h2', name: 'Bernadette', isBot: false },
  { id: 'b1', name: 'Bernadette', isBot: true },
  { id: 'b2', name: 'Raoul', isBot: true },
  { id: 'b3', name: 'Gépéto 🤠', isBot: true },
  { id: 'c', name: 'Kevin_du_93', isBot: true },
]

describe('genreOfId : le genre du joueur nommé par une annonce', () => {
  it('un bot de naissance prend le genre de son persona (ancien format « Nom 🤠 » compris)', () => {
    expect(genreOfId(TABLE, 'b1')).toBe('f')
    expect(genreOfId(TABLE, 'b2')).toBe('m')
    expect(genreOfId(TABLE, 'b3')).toBe('m')
  })

  it('other pour un humain, même au pseudo d’un persona, et pour un converti', () => {
    expect(genreOfId(TABLE, 'h')).toBe('other')
    expect(genreOfId(TABLE, 'h2')).toBe('other')
    expect(genreOfId(TABLE, 'c')).toBe('other')
  })

  it('other pour un id absent de la table ou nul : l’annonce reste épicène', () => {
    expect(genreOfId(TABLE, 'parti')).toBe('other')
    expect(genreOfId(TABLE, null)).toBe('other')
    expect(genreOfId(TABLE, undefined)).toBe('other')
    expect(genreOfId([], 'b1')).toBe('other')
  })
})
