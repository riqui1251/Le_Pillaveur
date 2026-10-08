import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { afterEach, describe, expect, it } from 'vitest'
import {
  containsProfanity,
  containsProfanityAcrossWords,
  validateAccountDisplayName,
  validateLocalPlayerName,
} from './index'
import { getPreparedTerms, rebuildPreparedTerms, termKind } from './prepared-terms'
import { splitModerationWords, tokenizeForModeration } from './normalize'
import { allowedSpanInWord, allowedSpansInWord, isAllowedWord } from './allowed-words'
import { normalizeTermForMatching } from './terms'

/**
 * Faux positifs relevés en production (pseudos refusés, joueurs locaux
 * impossibles à créer) et vrais positifs qui doivent survivre au correctif.
 * Les deux listes avancent ensemble : relâcher le filtre pour « Dominique »
 * ne doit jamais rouvrir la porte à « niquer ».
 */

describe('prénoms refusés à tort — doivent passer', () => {
  // Pseudos de compte : lettres, chiffres, espaces uniquement.
  const accountNames = [
    'Dominique',
    'Monique',
    'Veronique',
    'Véronique',
    'Celestine',
    'Célestine',
    'Ernestine',
    'Modestine',
    'Tamer',
    'Tamer Ali',
    'Conor',
    'Nazim',
    'Nazir',
    'Figaro',
    'Peder',
    'Dickson',
    'Vergara',
    'Estelle',
    'Sebastien',
  ]

  for (const name of accountNames) {
    it(`pseudo de compte « ${name} »`, () => {
      expect(containsProfanity(name)).toBe(false)
      expect(validateAccountDisplayName(name)).toEqual({ ok: true, value: name })
    })
  }

  // Joueurs locaux : tiret et apostrophe en plus.
  const localNames = ['Jean-Dominique', 'Marie-Monique', "Dominique O'Neil", 'Anne-Célestine']

  for (const name of localNames) {
    it(`joueur local « ${name} »`, () => {
      expect(validateLocalPlayerName(name)).toEqual({ ok: true, value: name })
    })
  }
})

describe('mots courants qui contiennent une racine — doivent passer', () => {
  const words = [
    // racine en milieu ou fin de mot
    'question',
    'unique',
    'technique',
    'clinique',
    'panique',
    'depute',
    'député',
    'dispute',
    'destin',
    'postier',
    'gestion',
    'questi',
    'ebranler',
    'grape',
    'centipede',
    'peacock',
    'significa',
    'disputa',
    // racine en tête de mot : liste blanche
    'cocktail',
    'cocktails',
    'cockpit',
    'salopette',
    'râpé',
    'râpe',
    'râper',
    'therapist',
    'estime',
    'estimation',
    'estival',
    'estilo',
    'pédestre',
    'conocer',
    'conosco',
    'nazionale',
    'branlant',
    'crissement',
    'putatif',
    // racine de 4-5 lettres DANS le mot : liste blanche
    'habite',
    "j'habite",
    'habiter',
    'cohabiter',
    'inhabité',
    'orbite',
    'exorbités',
    'subitement',
    'débiter',
    'bibite',
    'frostbite',
    'computer',
    'réputé',
    'amputé',
    'supputer',
    'undisputed',
    'computadora',
    'diputado',
    'reputación',
    'deputato',
    'sputare',
    'risaputo',
    'combinazione',
    'destinazione',
    'internazionale',
    'Ignazio',
    'Benazir',
    'bipède',
    'quadrupède',
    'stampede',
    'Riddick',
    'Hitchcock',
    'poppycock',
    'attraper',
    'rattrapé',
    'drapeau',
    'trapèze',
    'déraper',
    'crapette',
    'thérapeute',
    'skyscraper',
    // « retard » (français : en retard) n'est plus un terme
    'retard',
    'en retard',
    'retardé',
  ]

  for (const word of words) {
    it(`« ${word} »`, () => {
      expect(containsProfanity(word)).toBe(false)
    })
  }
})

describe('insultes — doivent rester détectées', () => {
  const insults = [
    // français
    'niquer',
    'nique',
    'nique ta mere',
    'nique ta mère',
    'niquetamere',
    'ntm',
    'pute',
    'putain',
    'salope',
    'salop',
    'encule',
    'enculé',
    'enculer',
    'connard',
    'batard',
    'bâtard',
    'fdp',
    'fils de pute',
    'merde',
    'pédé',
    'nègre',
    'tamerelapute',
    'tamerlapute',
    'Tamer La Pute',
    'ta mere',
    'esti',
    'estie',
    'ostie',
    'câlice',
    'SuperConnard',
    'Pute Dominique',
    // racines en milieu de mot qui n'apparaissent dans aucun mot innocent
    'vatefaireenculer',
    'emmerdeur',
    'clusterfuck',
    'sonofabitch',
    'jtenique',
    'salepute',
    'grossepute',
    'tetedebite',
    'facedepute',
    // leet, séparateurs, lettres martelées
    'n1qu3r',
    'p.u.t.e',
    'p u t e',
    'puuuute',
    'puuuuutain',
    'coooonnard',
    'c000nnard',
    'saaaalope',
    'c0nn4rd',
    // anglais
    'fuck',
    'f_u_c_k',
    'motherfucker',
    'bitch',
    'shit',
    'cock',
    'rape',
    'rapist',
    'retarded',
    'nigger',
    'nazi',
    // espagnol
    'puta',
    'hijo de puta',
    'cabrón',
    'coño',
    'cono',
    'gilipollas',
    // italien
    'cazzo',
    'c4zz0',
    'stronzo',
    'vaffanculo',
    'porco dio',
  ]

  for (const insult of insults) {
    it(`« ${insult} »`, () => {
      expect(containsProfanity(insult)).toBe(true)
    })
  }

  it('une liste blanche ne protège que le mot innocent, pas ce qui y est collé', () => {
    expect(containsProfanity('cocktailconnard')).toBe(true)
    expect(containsProfanity('Cocktail Connard')).toBe(true)
    expect(containsProfanity('salopetteputain')).toBe(true)
    expect(containsProfanity('Tamere')).toBe(true)
  })

  it('les accents distinguent « râpé » de l’insulte anglaise', () => {
    expect(containsProfanity('râpé')).toBe(false)
    expect(containsProfanity('rape')).toBe(true)
    expect(containsProfanity('r4pe')).toBe(true)
  })

  it('refuse les pseudos et joueurs insultants', () => {
    expect(validateAccountDisplayName('Niquer')).toMatchObject({ ok: false, reason: 'profanity' })
    expect(validateAccountDisplayName('Puuuute')).toMatchObject({ ok: false, reason: 'profanity' })
    expect(validateLocalPlayerName('Ta-Mere-La-Pute')).toMatchObject({
      ok: false,
      reason: 'profanity',
    })
  })
})

describe('cas limites', () => {
  it('« retard » et les futurs en -culer ne sont pas des insultes', () => {
    expect(containsProfanity('calculera')).toBe(false)
    expect(containsProfanity('reculera')).toBe(false)
    expect(containsProfanity('calculeront')).toBe(false)
    expect(containsProfanity('culero')).toBe(true)
  })

  it('« sacrément » accentué passe, le sacre québécois tapé sans accent reste bloqué', () => {
    expect(containsProfanity('sacrément')).toBe(false)
    expect(containsProfanity('sacrement')).toBe(true)
    expect(containsProfanity('sacrament')).toBe(true)
  })

  it('un mot de la liste blanche martelé ou ponctué reste protégé', () => {
    expect(containsProfanity('cocktaiiiil')).toBe(false)
    expect(containsProfanity('Cocktail!')).toBe(false)
    expect(containsProfanity('Tamer!')).toBe(false)
  })

  it('la liste blanche ne vaut que pour le mot entier protégé', () => {
    expect(containsProfanity('therapist')).toBe(false)
    expect(containsProfanity('the rapist')).toBe(true)
    expect(containsProfanity('Nazi R')).toBe(true)
  })

  it('« fils2pute » : les termes passent par le même leet que les textes', () => {
    expect(normalizeTermForMatching('fils2pute')).toBe('filszpute')
    expect(containsProfanity('fils2pute')).toBe(true)
  })

  it('une racine courte reste détectée quand elle ouvre un mot éclaté', () => {
    expect(containsProfanity('Le p.u.t.e')).toBe(true)
    expect(containsProfanity('gros n i q u e u r')).toBe(true)
  })
})

describe('splitModerationWords', () => {
  it('a les mêmes frontières et la même forme normalisée que tokenizeForModeration', () => {
    const samples = [
      'Jean-Pierre',
      "O'Brien",
      'p.u.t.e',
      'sh!t (ok)',
      'f_u_c_k',
      'C0nn4rd 42',
      'Râpé, Crème brûlée…',
      'a+b|c',
      '  espaces   multiples  ',
    ]
    for (const sample of samples) {
      expect(splitModerationWords(sample).map((word) => word.norm)).toEqual(
        tokenizeForModeration(sample)
      )
    }
  })

  it('garde les accents dans la forme brute', () => {
    expect(splitModerationWords('Râpé fromage')).toEqual([
      { raw: 'râpé', norm: 'rape' },
      { raw: 'fromage', norm: 'fromage' },
    ])
  })
})

describe('termKind — règle de longueur', () => {
  it('classe les termes par longueur compacte, racines ambiguës à part', () => {
    expect(termKind('fdp')).toBe('whole-word')
    expect(termKind('nique')).toBe('word-start')
    expect(termKind('esti')).toBe('word-start')
    expect(termKind('pute')).toBe('inside-word')
    expect(termKind('bite')).toBe('inside-word')
    expect(termKind('nazi')).toBe('inside-word')
    expect(termKind('negre')).toBe('inside-word')
    expect(termKind('fuck')).toBe('inside-word')
    expect(termKind('merde')).toBe('inside-word')
    expect(termKind('connard')).toBe('anywhere')
    expect(termKind('culero')).toBe('word-start')
  })

  it('les termes de base sont préparés avec leur classe et leur forme écrasée', () => {
    const connard = getPreparedTerms().find((term) => term.compact === 'connard')
    expect(connard).toMatchObject({ kind: 'anywhere', squashed: 'conard' })
  })
})

describe('allowedSpanInWord / isAllowedWord', () => {
  it('protège le mot entier ou seulement le préfixe déclaré', () => {
    expect(allowedSpanInWord({ raw: 'tamer', norm: 'tamer' })).toEqual({ start: 0, end: 5 })
    expect(allowedSpanInWord({ raw: 'tamerlapute', norm: 'tamerlapute' })).toBeNull()
    expect(allowedSpanInWord({ raw: 'cocktails', norm: 'cocktails' })).toEqual({
      start: 0,
      end: 8,
    })
  })

  it('exige les accents pour les entrées accentuées', () => {
    expect(isAllowedWord('râpe')).toBe(true)
    expect(isAllowedWord('rape')).toBe(false)
  })

  it('ignore la ponctuation collée en bordure', () => {
    expect(allowedSpanInWord({ raw: 'tamer!', norm: 'tameri' })).toEqual({ start: 0, end: 5 })
  })

  it('une portion `*mot*` est protégée où qu’elle tombe, et seulement elle', () => {
    expect(allowedSpansInWord({ raw: 'combinazione', norm: 'combinazione' })).toEqual([{ start: 5, end: 11 }])
    // Lettres martelées : la portion couvre les répétitions.
    expect(allowedSpansInWord({ raw: 'combinaazzione', norm: 'combinaazzione' })).toEqual([
      { start: 5, end: 13 },
    ])
    expect(allowedSpansInWord({ raw: 'neonazi', norm: 'neonazi' })).toEqual([])
  })
})

describe('containsProfanityAcrossWords — recollage de mots pour le chat', () => {
  it('trouve un terme long éclaté sur plusieurs mots', () => {
    expect(containsProfanityAcrossWords(['con', 'nard'], 5)).toBe(true)
  })

  it('ignore les termes plus courts que le minimum demandé', () => {
    expect(containsProfanityAcrossWords(['pu', 'te'], 5)).toBe(false)
  })

  it('exige qu’une racine courte ouvre l’un des mots recollés', () => {
    expect(containsProfanityAcrossWords(['ni', 'que'], 5)).toBe(true)
    expect(containsProfanityAcrossWords(['uni', 'que'], 5)).toBe(false)
  })
})

describe('termes ajoutés par la supervision — même règle de longueur', () => {
  afterEach(() => {
    rebuildPreparedTerms([])
  })

  it('un terme court (4-5 lettres) compte dans un mot, jamais à cheval sur deux', () => {
    // « teub » ajouté par un modérateur doit arrêter « grosseteub ».
    rebuildPreparedTerms(['zorg'])
    expect(containsProfanity('zorg')).toBe(true)
    expect(containsProfanity('zorglub')).toBe(true)
    expect(containsProfanity('Le Zorg')).toBe(true)
    expect(containsProfanity('bizorg')).toBe(true)
    expect(containsProfanity('biz org')).toBe(false)
  })

  it('un terme long (≥ 6 lettres) compte n’importe où', () => {
    rebuildPreparedTerms(['bidule'])
    expect(containsProfanity('superbidule')).toBe(true)
  })

  it('un terme de 3 lettres ou moins reste un mot entier', () => {
    rebuildPreparedTerms(['zz'])
    expect(containsProfanity('zz')).toBe(true)
    expect(containsProfanity('pizza')).toBe(false)
  })

  it('un terme saisi avec ponctuation est normalisé comme les textes', () => {
    rebuildPreparedTerms(['b*rk'])
    expect(containsProfanity('brk')).toBe(true)
    expect(containsProfanity('b.r.k')).toBe(true)
  })
})

/**
 * Non-régression du 08/10/2026 : la règle « racine courte = début de mot »
 * laissait passer TOUTE racine de 4-5 lettres collée derrière un préfixe —
 * un pseudo s'écrit d'un bloc. Ces pseudos étaient refusés par le filtre
 * d'avant (commit 2f2090e) et doivent le rester ; seuls les prénoms refusés
 * à tort (Dominique, Monique, Véronique, Célestine) ont changé de camp.
 */
describe('pseudos collés refusés avant la règle des débuts de mot — toujours refusés', () => {
  const pseudos = [
    'SaleNegre',
    'NeoNazi',
    'TeamNazi',
    'JeSuisNazi',
    'MaBite',
    'LaPute',
    'JeSuisPute',
    'TaGrosseBite',
    'GrosseBite',
    'SuceMaBite',
    'Kikoopute',
    'Tapuuute',
    'MyPussy',
    'BigDick',
    'BigCock',
    'GrosPede',
    'SalePuta',
    'Gro55eB1te',
    'GangRape',
    'CazzoDuro',
    'GrosseMerde',
    'SaleZorra',
  ]

  for (const name of pseudos) {
    it(`« ${name} »`, () => {
      expect(validateAccountDisplayName(name)).toMatchObject({ ok: false, reason: 'profanity' })
    })
  }

  it('« Retard » passe désormais : perte acceptée et documentée (terms.ts)', () => {
    expect(validateAccountDisplayName('Retard')).toEqual({ ok: true, value: 'Retard' })
  })
})

/**
 * Corpus de contrôle des faux positifs : chaque mot de 4 lettres ou plus des
 * textes du site, dans les quatre langues (≈ 13 000 mots). Le filtre d'avant
 * en refusait plus de deux cents (question, unique, combinazione, computer,
 * économie…). Un mot qui casse ce test se règle par la liste blanche
 * (allowed-words.ts) ou TERMS_AT_WORD_START (terms.ts), jamais en retirant
 * une insulte.
 */
describe('textes du site — aucun mot refusé', () => {
  it('ne refuse aucun mot des catalogues fr, en, es, it', () => {
    const words = new Set<string>()
    const collect = (value: unknown): void => {
      if (typeof value === 'string') {
        for (const word of value.split(/[^\p{L}]+/u)) if (word.length >= 4) words.add(word.toLowerCase())
      } else if (value && typeof value === 'object') {
        for (const child of Object.values(value)) collect(child)
      }
    }
    for (const locale of ['fr', 'en', 'es', 'it']) {
      collect(JSON.parse(readFileSync(join(process.cwd(), 'messages', `${locale}.json`), 'utf8')))
    }
    expect(words.size).toBeGreaterThan(5000)
    expect([...words].filter((word) => containsProfanity(word))).toEqual([])
  })
})
