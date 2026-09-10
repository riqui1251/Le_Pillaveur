import { describe, expect, it } from 'vitest'
import { censorChatMessage, maskContactDetails } from './chat-moderation'

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

  it('masque une insulte éclatée lettre par lettre', () => {
    const result = censorChatMessage('va te faire e n c u l e r')
    expect(result.flags.profanity).toBe(true)
    expect(result.text).not.toMatch(/e n c u l e/)
  })

  it('masque une insulte aux lettres martelées', () => {
    const result = censorChatMessage('puuuuutain de partie')
    expect(result.flags.profanity).toBe(true)
    expect(result.text).not.toContain('puuuuutain')
    expect(result.text).toContain('de partie')
  })

  it('masque une insulte coupée par un caractère invisible', () => {
    const result = censorChatMessage('sal​ope')
    expect(result.flags.profanity).toBe(true)
    expect(result.text).toMatch(/^\*+$/)
  })

  it('masque une insulte séparée par des points', () => {
    const result = censorChatMessage('c.o.n.n.a.r.d')
    expect(result.flags.profanity).toBe(true)
  })
})

describe('censorChatMessage — ce qui NE doit PAS être filtré', () => {
  const innocents = [
    'On se refait une partie ?',
    'La mer était belle ce matin',
    'tu as pu te voir jouer, c’était drôle',
    "j'ai bonnard comme surnom depuis le lycée",
    'il y a un an on avait fait mieux',
    'Score final : 100 200 300',
    'On a eu du bol sur ce coup',
    'Assez de blabla, on lance',
    'Coucou, ça va ?',
    'Passe-moi le dé stp',
    'Bien vu, joli coup !',
  ]

  for (const message of innocents) {
    it(`laisse intact : « ${message} »`, () => {
      const result = censorChatMessage(message)
      expect(result.text).toBe(message)
      expect(result.censored).toBe(false)
    })
  }
})

describe('maskContactDetails — coordonnées personnelles', () => {
  it('masque une adresse e-mail', () => {
    const result = maskContactDetails('écris-moi sur jean.dupont@example.com stp')
    expect(result.masked).toBe(true)
    expect(result.text).not.toContain('@example.com')
    expect(result.text).toContain('écris-moi sur')
  })

  it('masque un numéro de téléphone, même espacé', () => {
    const result = maskContactDetails('mon 06 12 34 56 78 si tu veux')
    expect(result.masked).toBe(true)
    expect(result.text).not.toContain('06 12 34 56 78')
  })

  it("ne masque pas un score ou une année", () => {
    const result = maskContactDetails('en 2024 il avait 1250 points')
    expect(result.masked).toBe(false)
    expect(result.text).toBe('en 2024 il avait 1250 points')
  })

  it('remonte le masquage via censorChatMessage', () => {
    const result = censorChatMessage('appelle-moi au 0612345678')
    expect(result.flags.contact).toBe(true)
    expect(result.flags.profanity).toBe(false)
    expect(result.censored).toBe(true)
  })
})
