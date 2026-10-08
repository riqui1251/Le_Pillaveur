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

describe('censorChatMessage — mots courants masqués à tort (relevé de prod)', () => {
  // Une racine courte (« nique », « esti », « pute », « cock »…) cherchée
  // n'importe où dans le mot censurait des phrases banales.
  const innocents = [
    "C'est une bonne question !",
    'Ta technique est unique',
    'Désolé, je suis en retard',
    'Le député a perdu la dispute',
    'Un Cocktail sans alcool ?',
    'Quel destin, le postier gagne encore',
    'Bonne gestion de la partie',
    'Dominique et Monique arrivent',
    'Célestine, Ernestine et Tamer sont là',
    'Salut Tamer!',
    'Bravo Dominique!!',
    "J'ai de l'estime pour toi",
    "C'est l'unique fois",
    'Du fromage râpé sur les pâtes',
    'Il est dans le cockpit',
    'Ma salopette est tachée',
    'Panique pas, on gère',
    'My therapist would love this game',
    'No lo conozco',
    'Conosco questa canzone',
    'Partita della nazionale stasera',
    'Questi giochi sono belli',
    'On calculera les points après',
    "C'est sacrément bien joué",
    'Il reculera pas',
    // Racines cherchées dans le mot : leurs mots innocents passent.
    "J'habite à Lyon, pas loin de la gare",
    'Mon computer rame',
    'La combinazione vincente',
    'Le drapeau, on va le rattraper',
    'Bibite fresche per tutti',
    'On joue à la crapette ?',
  ]

  for (const message of innocents) {
    it(`laisse intact : « ${message} »`, () => {
      const result = censorChatMessage(message)
      expect(result.text).toBe(message)
      expect(result.censored).toBe(false)
    })
  }
})

describe('censorChatMessage — insultes toujours masquées', () => {
  const cases: Array<[message: string, hidden: string]> = [
    ['nique ta mère', 'nique'],
    ['va niquer ailleurs', 'niquer'],
    ['ntm', 'ntm'],
    ['sale pute', 'pute'],
    ['putain de partie', 'putain'],
    ['espèce de salope', 'salope'],
    ['enculé va', 'enculé'],
    ['quel connard', 'connard'],
    ['petit bâtard', 'bâtard'],
    ['fdp', 'fdp'],
    ['n1qu3r', 'n1qu3r'],
    ['p.u.t.e', 'p.u.t.e'],
    ['puuuute', 'puuuute'],
    ['tamerelapute', 'tamerelapute'],
    ['fuck you', 'fuck'],
    ['clusterfuck total', 'clusterfuck'],
    ['quel emmerdeur', 'emmerdeur'],
    ['hijo de puta', 'puta'],
    ['che cazzo fai', 'cazzo'],
    ['stronzo', 'stronzo'],
    ['Cocktail de connard', 'connard'],
    ['Dominique est une pute', 'pute'],
    // Racines de 4-5 lettres collées (régression du 08/10/2026) : un mot
    // d'un bloc, cherché DANS le mot, martelé ou non.
    ['t es qu une salenegre', 'salenegre'],
    ['grossebite va', 'grossebite'],
    ['jsuisnazi', 'jsuisnazi'],
    ['ta gueule lapute', 'lapute'],
    ['mypussy', 'mypussy'],
    ['tapuuute', 'tapuuute'],
  ]

  for (const [message, hidden] of cases) {
    it(`masque « ${hidden} » dans « ${message} »`, () => {
      const result = censorChatMessage(message)
      expect(result.flags.profanity).toBe(true)
      expect(result.text).not.toContain(hidden)
    })
  }

  it('ne masque que le mot fautif, pas le prénom voisin', () => {
    const result = censorChatMessage('Dominique est une pute')
    expect(result.text).toContain('Dominique est une')
  })
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
