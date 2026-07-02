import { describe, expect, it } from 'vitest'
import { censorChatMessage } from './chat-moderation'

describe('censorChatMessage — filtre anti-insultes du chat', () => {
  it('laisse passer un message propre tel quel', () => {
    const result = censorChatMessage('Bien joué, on gagne la prochaine !')
    expect(result.censored).toBe(false)
    expect(result.text).toBe('Bien joué, on gagne la prochaine !')
  })

  it('masque une insulte au milieu du message', () => {
    const result = censorChatMessage('espèce de salope tu vas voir')
    expect(result.censored).toBe(true)
    expect(result.text).not.toContain('salope')
    expect(result.text).toContain('espèce de')
    expect(result.text).toContain('tu vas voir')
    expect(result.text).toMatch(/\*{3,}/)
  })

  it('masque les variantes avec accents et majuscules', () => {
    const result = censorChatMessage('SALOPE')
    expect(result.censored).toBe(true)
    expect(result.text).toMatch(/^\*+$/)
  })

  it('masque une insulte coupée en deux mots adjacents', () => {
    const result = censorChatMessage('gros con nard va')
    expect(result.censored).toBe(true)
    expect(result.text).not.toMatch(/con nard/)
  })

  it('ne compacte pas toute la phrase (pas de faux positif inter-mots)', () => {
    // « materas se » compacté donnerait un faux positif si on collait la phrase.
    const result = censorChatMessage('tu me materas se soir au jeu')
    expect(result.text).toContain('materas')
  })
})
