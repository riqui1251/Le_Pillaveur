import { describe, expect, it } from 'vitest'
import {
  containsProfanity,
  validateAccountDisplayName,
  validateLocalPlayerName,
} from './index'
import { PROFANITY_BY_LOCALE } from './terms'

describe('containsProfanity — français', () => {
  it('détecte les insultes directes', () => {
    expect(containsProfanity('connard')).toBe(true)
    expect(containsProfanity('Putain')).toBe(true)
    expect(containsProfanity('MERDE')).toBe(true)
  })

  it('détecte le leet speak', () => {
    expect(containsProfanity('c0nn4rd')).toBe(true)
    expect(containsProfanity('put4in')).toBe(true)
    expect(containsProfanity('m3rd3')).toBe(true)
    expect(containsProfanity('niketamere')).toBe(true)
    expect(containsProfanity('f1lsdepute')).toBe(true)
  })

  it('détecte les racines courtes composées', () => {
    expect(containsProfanity('enculeur')).toBe(true)
    expect(containsProfanity('konass')).toBe(true)
    expect(containsProfanity('ntm')).toBe(true)
    expect(containsProfanity('fdp')).toBe(true)
  })

  it('détecte les espaces / séparateurs insérés', () => {
    expect(containsProfanity('c o n n a r d')).toBe(true)
    expect(containsProfanity('p.u.t.a.i.n')).toBe(true)
    expect(containsProfanity('m_e_r_d_e')).toBe(true)
  })

  it('détecte le québécois', () => {
    expect(containsProfanity('tabarnak')).toBe(true)
    expect(containsProfanity('câlice')).toBe(true)
    expect(containsProfanity('t4b4rn4k')).toBe(true)
  })

  it('accepte des noms innocents', () => {
    expect(containsProfanity('Marie')).toBe(false)
    expect(containsProfanity('Jean-Pierre')).toBe(false)
    expect(containsProfanity('Content')).toBe(false)
    expect(containsProfanity('Scorpion')).toBe(false)
  })
})

describe('containsProfanity — anglais', () => {
  it('détecte les insultes directes', () => {
    expect(containsProfanity('fuck')).toBe(true)
    expect(containsProfanity('asshole')).toBe(true)
    expect(containsProfanity('bitch')).toBe(true)
  })

  it('détecte le leet speak', () => {
    expect(containsProfanity('f_u_c_k')).toBe(true)
    expect(containsProfanity('sh1t')).toBe(true)
    expect(containsProfanity('b1tch')).toBe(true)
    expect(containsProfanity('4sshole')).toBe(true)
    expect(containsProfanity('muthafucka')).toBe(true)
    expect(containsProfanity('d1ckhead')).toBe(true)
  })

  it('accepte des noms innocents', () => {
    expect(containsProfanity('Alex')).toBe(false)
    expect(containsProfanity('Sussex')).toBe(false)
    expect(containsProfanity('Classic')).toBe(false)
  })
})

describe('containsProfanity — espagnol', () => {
  it('détecte les insultes directes', () => {
    expect(containsProfanity('mierda')).toBe(true)
    expect(containsProfanity('cabron')).toBe(true)
    expect(containsProfanity('gilipollas')).toBe(true)
  })

  it('détecte le leet speak et contournements', () => {
    expect(containsProfanity('m13rd4')).toBe(true)
    expect(containsProfanity('p u t a')).toBe(true)
    expect(containsProfanity('pendej0')).toBe(true)
    expect(containsProfanity('h1j0deputa')).toBe(true)
    expect(containsProfanity('vete a la mierda')).toBe(true)
    expect(containsProfanity('tontodelculo')).toBe(true)
  })

  it('accepte des noms innocents', () => {
    expect(containsProfanity('Carlos')).toBe(false)
    expect(containsProfanity('María')).toBe(false)
  })
})

describe('containsProfanity — italien', () => {
  it('détecte les insultes directes', () => {
    expect(containsProfanity('cazzo')).toBe(true)
    expect(containsProfanity('stronzo')).toBe(true)
    expect(containsProfanity('vaffanculo')).toBe(true)
  })

  it('détecte le leet speak', () => {
    expect(containsProfanity('c4zz0')).toBe(true)
    expect(containsProfanity('str0nz0')).toBe(true)
    expect(containsProfanity('v4ff4ncul0')).toBe(true)
    expect(containsProfanity('pezzodimerda')).toBe(true)
    expect(containsProfanity('rompicoglioni')).toBe(true)
  })

  it('accepte des noms innocents', () => {
    expect(containsProfanity('Marco')).toBe(false)
    expect(containsProfanity('Giulia')).toBe(false)
  })
})

describe('validateAccountDisplayName', () => {
  it('accepte lettres accentuées, chiffres et espaces', () => {
    expect(validateAccountDisplayName('Élodie 42')).toEqual({
      ok: true,
      value: 'Élodie 42',
    })
  })

  it('rejette les caractères spéciaux', () => {
    expect(validateAccountDisplayName('User@mail')).toMatchObject({
      ok: false,
      reason: 'invalid_characters',
    })
    expect(validateAccountDisplayName('Jean-Pierre')).toMatchObject({
      ok: false,
      reason: 'invalid_characters',
    })
    expect(validateAccountDisplayName('player_1')).toMatchObject({
      ok: false,
      reason: 'invalid_characters',
    })
  })

  it('rejette les insultes', () => {
    expect(validateAccountDisplayName('SuperConnard')).toMatchObject({
      ok: false,
      reason: 'profanity',
    })
  })

  it('respecte la longueur max', () => {
    expect(validateAccountDisplayName('a'.repeat(31))).toMatchObject({
      ok: false,
      reason: 'too_long',
    })
  })
})

describe('validateLocalPlayerName', () => {
  it('autorise tiret et apostrophe', () => {
    expect(validateLocalPlayerName("Jean-Pierre")).toEqual({
      ok: true,
      value: "Jean-Pierre",
    })
    expect(validateLocalPlayerName("O'Brien")).toEqual({
      ok: true,
      value: "O'Brien",
    })
  })

  it('rejette les insultes avec contournement', () => {
    expect(validateLocalPlayerName('f u c k')).toMatchObject({
      ok: false,
      reason: 'profanity',
    })
  })
})

describe('couverture des listes par langue', () => {
  it('chaque entrée de liste est détectable en forme directe', () => {
    for (const [locale, terms] of Object.entries(PROFANITY_BY_LOCALE)) {
      for (const term of terms) {
        if (term.length <= 3) continue
        const sample = term.replace(/\s+/g, '')
        expect(
          containsProfanity(sample),
          `terme ${locale}:${term} devrait être bloqué`
        ).toBe(true)
      }
    }
  })
})
