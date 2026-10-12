import { describe, expect, it } from 'vitest'
// Le moteur ICU de next-intl (next-intl → use-intl → intl-messageformat) : les
// select speaker/target du catalogue sont rendus ici comme en production.
import { IntlMessageFormat } from 'intl-messageformat'
import type { LGDebateSpeech } from '@/lib/loup-garou/engine'
import { BOT_PERSONAS, DEFAULT_BOT_EMOJI, type BotTrait } from '@/lib/online/bot-personas'
import fr from '../../../../messages/fr.json'
import en from '../../../../messages/en.json'
import es from '../../../../messages/es.json'
import it_ from '../../../../messages/it.json'
import {
  LG_SAY_VARIANTS_MAX,
  LG_TV_FEED_SIZE,
  lgBotLine,
  lgBotSayKey,
  lgBotTic,
  lgDebateFeedItems,
  lgGenreOf,
  lgPlayerIcon,
  lgSayVariantKey,
  type LGLineTranslator,
} from './debate-feed'

const sp = (playerId: string, kind: LGDebateSpeech['kind'], targetId: string | null, round: number): LGDebateSpeech => ({
  playerId,
  kind,
  targetId,
  round,
})

describe('lgDebateFeedItems', () => {
  const speeches: LGDebateSpeech[] = [
    sp('b1', 'suspect', 'h1', 1),
    sp('b2', 'ally', 'b1', 1),
    sp('b1', 'toldYou', 'b3', 2),
    sp('b2', 'suspect', 'h1', 2),
    sp('h1', 'defend', 'b2', 2),
    sp('b3', 'rally', 'h1', 2),
    sp('b1', 'ask', 'h1', 2),
  ]

  it('ne garde que la manche demandée, dans l’ordre du fil', () => {
    const items = lgDebateFeedItems(speeches, 2, 'h1')
    expect(items.map((i) => i.speech.kind)).toEqual(['toldYou', 'suspect', 'defend', 'rally', 'ask'])
    expect(lgDebateFeedItems(speeches, 1, 'h1').map((i) => i.speech.playerId)).toEqual(['b1', 'b2'])
    expect(lgDebateFeedItems(speeches, 3, 'h1')).toEqual([])
  })

  it('surligne les paroles qui visent le spectateur local, jamais sans identité (TV)', () => {
    const items = lgDebateFeedItems(speeches, 2, 'h1')
    expect(items.map((i) => i.aimsAtMe)).toEqual([false, true, false, true, true])
    expect(lgDebateFeedItems(speeches, 2, null).every((i) => !i.aimsAtMe)).toBe(true)
    expect(lgDebateFeedItems(speeches, 2, undefined).every((i) => !i.aimsAtMe)).toBe(true)
  })

  it('TV : fenêtre des dernières paroles aux clés STABLES quand elle glisse', () => {
    const before = lgDebateFeedItems(speeches.slice(0, 6), 2, null, LG_TV_FEED_SIZE)
    const after = lgDebateFeedItems(speeches, 2, null, LG_TV_FEED_SIZE)
    expect(before).toHaveLength(LG_TV_FEED_SIZE)
    expect(after).toHaveLength(LG_TV_FEED_SIZE)
    // Les trois bulles encore à l'écran gardent leur clé ; une seule est neuve.
    expect(after.slice(0, 3).map((i) => i.key)).toEqual(before.slice(1).map((i) => i.key))
    expect(before.map((i) => i.key)).not.toContain(after[3].key)
    // Sous la limite, rien n'est coupé.
    expect(lgDebateFeedItems(speeches, 1, null, LG_TV_FEED_SIZE)).toHaveLength(2)
  })

  it('deux paroles du même auteur ont des clés distinctes', () => {
    const keys = lgDebateFeedItems(speeches, 2, null).map((i) => i.key)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('la clé d’un item (graine de sa variante) est la même sur le fil entier et dans la fenêtre TV', () => {
    const full = lgDebateFeedItems(speeches, 2, 'h1')
    const windowed = lgDebateFeedItems(speeches, 2, null, LG_TV_FEED_SIZE)
    expect(windowed.map((i) => i.key)).toEqual(full.slice(full.length - LG_TV_FEED_SIZE).map((i) => i.key))
  })

  it('firstOfAuthor : la première parole de chacun dans la manche, et elle seule', () => {
    expect(lgDebateFeedItems(speeches, 2, null).map((i) => i.firstOfAuthor)).toEqual([true, true, true, true, false])
    // Manche 1 : b1 a déjà parlé en manche 1 mais c'est sa première en manche 2 (toldYou ci-dessus).
    expect(lgDebateFeedItems(speeches, 1, null).map((i) => i.firstOfAuthor)).toEqual([true, true])
  })

  it('firstOfAuthor est posé sur le fil entier : stable quand la fenêtre TV glisse', () => {
    const windowed = lgDebateFeedItems(speeches, 2, null, LG_TV_FEED_SIZE)
    // b1 ouvre la fenêtre par sa seconde parole (ask) : la première est sortie du champ, le drapeau reste faux.
    expect(windowed.map((i) => i.speech.playerId)).toEqual(['b2', 'h1', 'b3', 'b1'])
    expect(windowed.map((i) => i.firstOfAuthor)).toEqual([true, true, true, false])
  })
})

const bot = (name: string) => ({ name, isBot: true })
const human = (name: string) => ({ name, isBot: false })
const RAOUL = bot('Raoul 🦊')
const RIQUI = human('Riqui')

/** Un catalogue plat → ce que lgBotLine attend de next-intl, {name} seul interpolé (sans ICU : tests du tic). */
function translator(catalogue: Record<string, string>): LGLineTranslator {
  return {
    has: (key) => key in catalogue,
    format: (key, values) => catalogue[key].replace('{name}', values?.name ?? ''),
  }
}

/** Le même catalogue plat, rendu par le vrai moteur ICU : select speaker/target compris. */
function icuTranslator(catalogue: Record<string, string>, locale = 'fr'): LGLineTranslator {
  const formats = new Map<string, IntlMessageFormat>()
  return {
    has: (key) => key in catalogue,
    format: (key, values) => {
      let format = formats.get(key)
      if (!format) {
        format = new IntlMessageFormat(catalogue[key], locale)
        formats.set(key, format)
      }
      return String(format.format(values))
    },
  }
}

type Game = {
  botSay: Record<string, string>
  botSayTrait: Record<string, Record<string, string>>
  botTic: Record<string, string>
}

const LOCALES: Record<string, Game> = {
  fr: fr.games['loup-garou'].game,
  en: en.games['loup-garou'].game,
  es: es.games['loup-garou'].game,
  it: it_.games['loup-garou'].game,
}

/** Le catalogue d'une langue à plat, relatif au namespace du jeu (`botSay.suspect_2`, `botTic.raoul`…). */
function flatten(game: Game): Record<string, string> {
  const flat: Record<string, string> = {}
  for (const [kind, text] of Object.entries(game.botSay)) flat[`botSay.${kind}`] = text
  for (const [trait, kinds] of Object.entries(game.botSayTrait)) {
    for (const [kind, text] of Object.entries(kinds)) flat[`botSayTrait.${trait}.${kind}`] = text
  }
  for (const [key, text] of Object.entries(game.botTic)) flat[`botTic.${key}`] = text
  return flat
}

/** Les clés de phrases (base et variantes `_n`), sans les tics. */
function sayKeys(game: Game): string[] {
  return Object.keys(flatten(game)).filter((key) => !key.startsWith('botTic.'))
}

const baseOf = (key: string) => key.replace(/_\d+$/, '')
const BASE_KINDS = ['ally', 'ask', 'defend', 'doubt', 'rally', 'suspect', 'toldYou', 'wrong']
const GENRES = ['f', 'm', 'other'] as const
const SEEDS = Array.from({ length: 40 }, (_, i) => `p-${i}`)

describe('lgBotTic : le tic du persona, jamais pour un humain ou un converti', () => {
  const has = (key: string) => key.startsWith('botTic.')

  it('persona → clé relative au namespace et position', () => {
    expect(lgBotTic(RAOUL, has)).toEqual({ key: 'botTic.raoul', position: 'prefix' })
    expect(lgBotTic(bot('Gépéto 🤠'), has)).toEqual({ key: 'botTic.gepeto', position: 'suffix' })
  })

  it('converti sans persona, humain au pseudo d’un persona, auteur inconnu → null', () => {
    expect(lgBotTic(bot('Riqui'), has)).toBeNull()
    expect(lgBotTic(human('Raoul 🦊'), has)).toBeNull()
    expect(lgBotTic(undefined, has)).toBeNull()
  })

  it('clé absente du catalogue (onglet d’avant le déploiement) → null', () => {
    expect(lgBotTic(RAOUL, () => false)).toBeNull()
  })
})

describe('lgGenreOf : le genre du persona, neutre pour tout le monde d’autre', () => {
  it('bot de naissance → f ou m ; humain (même au pseudo d’un persona), converti, absent → other', () => {
    expect(lgGenreOf(bot('Suzette'))).toBe('f')
    expect(lgGenreOf(RAOUL)).toBe('m')
    expect(lgGenreOf(human('Suzette'))).toBe('other')
    expect(lgGenreOf(bot('Riqui'))).toBe('other')
    expect(lgGenreOf(undefined)).toBe('other')
  })
})

describe('lgSayVariantKey : tirage déterministe parmi les variantes du catalogue', () => {
  const three = (key: string) => ['botSay.suspect', 'botSay.suspect_2', 'botSay.suspect_3'].includes(key)

  it('même graine → même clé, toujours une clé présente', () => {
    for (const seed of ['b1-0', 'b2-7', 'h1-3']) {
      const picked = lgSayVariantKey('botSay.suspect', seed, three)
      expect(lgSayVariantKey('botSay.suspect', seed, three)).toBe(picked)
      expect(three(picked)).toBe(true)
    }
  })

  it('sur une quarantaine de graines, les trois variantes sortent', () => {
    const picked = new Set(SEEDS.map((seed) => lgSayVariantKey('botSay.suspect', seed, three)))
    expect([...picked].sort()).toEqual(['botSay.suspect', 'botSay.suspect_2', 'botSay.suspect_3'])
  })

  it('sans graine, ou sans variante au catalogue → la base', () => {
    expect(lgSayVariantKey('botSay.suspect', undefined, three)).toBe('botSay.suspect')
    for (const seed of SEEDS) expect(lgSayVariantKey('botSay.ask', seed, (key) => key === 'botSay.ask')).toBe('botSay.ask')
  })

  it('les variantes se suivent : `_3` sans `_2` (onglet d’avant un déploiement) est ignoré', () => {
    const gap = (key: string) => key === 'botSay.suspect' || key === 'botSay.suspect_3'
    for (const seed of SEEDS) expect(lgSayVariantKey('botSay.suspect', seed, gap)).toBe('botSay.suspect')
  })

  it('ne cherche pas au-delà de LG_SAY_VARIANTS_MAX', () => {
    const picked = new Set(Array.from({ length: 300 }, (_, i) => lgSayVariantKey('x', `s-${i}`, () => true)))
    expect(picked.size).toBe(LG_SAY_VARIANTS_MAX)
    expect(picked.has(`x_${LG_SAY_VARIANTS_MAX + 1}`)).toBe(false)
  })
})

describe('lgBotSayKey : le ton du persona, sinon la phrase de base', () => {
  const catalogue = new Set(['botSay.suspect', 'botSay.defend', 'botSayTrait.agressif.suspect'])
  const has = (key: string) => catalogue.has(key)

  it('trait présent dans le catalogue → la variante', () => {
    expect(lgBotSayKey('suspect', RAOUL, has)).toBe('botSayTrait.agressif.suspect')
  })

  it('variante absente (kind sans ton, onglet d’avant le déploiement) → repli sur la base', () => {
    expect(lgBotSayKey('defend', RAOUL, has)).toBe('botSay.defend')
    expect(lgBotSayKey('suspect', RAOUL, (key) => key.startsWith('botSay.'))).toBe('botSay.suspect')
  })

  it('converti sans persona, humain (même au pseudo d’un persona), auteur inconnu → la base', () => {
    expect(lgBotSayKey('suspect', bot('Riqui'), has)).toBe('botSay.suspect')
    expect(lgBotSayKey('suspect', human('Raoul 🦊'), has)).toBe('botSay.suspect')
    expect(lgBotSayKey('suspect', undefined, has)).toBe('botSay.suspect')
  })

  it('ni variante ni base → null, la bulle est masquée', () => {
    expect(lgBotSayKey('rally', RAOUL, has)).toBeNull()
  })

  it('avec graine : l’une des variantes du ton du persona, ou de la base pour un humain', () => {
    const rich = new Set([
      'botSay.suspect',
      'botSay.suspect_2',
      'botSayTrait.agressif.suspect',
      'botSayTrait.agressif.suspect_2',
      'botSayTrait.agressif.suspect_3',
    ])
    const hasRich = (key: string) => rich.has(key)
    const raoul = new Set(SEEDS.map((seed) => lgBotSayKey('suspect', RAOUL, hasRich, seed)))
    const riqui = new Set(SEEDS.map((seed) => lgBotSayKey('suspect', RIQUI, hasRich, seed)))
    expect([...raoul].sort()).toEqual([
      'botSayTrait.agressif.suspect',
      'botSayTrait.agressif.suspect_2',
      'botSayTrait.agressif.suspect_3',
    ])
    expect([...riqui].sort()).toEqual(['botSay.suspect', 'botSay.suspect_2'])
    expect(lgBotSayKey('suspect', RAOUL, hasRich, 'b1-4')).toBe(lgBotSayKey('suspect', RAOUL, hasRich, 'b1-4'))
  })
})

describe('lgBotLine : phrase + tic selon la position', () => {
  const tr = translator({
    'botSay.suspect': 'Je trouve {name} louche',
    'botSay.ask': '{name}, et toi, tu votes qui ?',
    'botSay.wrong': 'Bon… je me suis planté sur {name}.',
    'botSayTrait.suiveur.suspect': 'Je ne sais pas trop… mais {name}, tu es louche quand même.',
    'botSayTrait.agressif.suspect': '{name}, c’est toi le loup !',
    'botTic.norbert': 'Statistiquement,',
    'botTic.dede': 'Banco !',
    'botTic.gepeto': '…véridique !',
  })
  const NORBERT = bot('Norbert 🤓')
  const DEDE = bot('Dédé 🎲')
  const GEPETO = bot('Gépéto 🤠')

  it('préfixe à virgule : enchaîne, la phrase perd sa majuscule', () => {
    expect(lgBotLine('suspect', NORBERT, RIQUI, tr)).toBe(
      'Statistiquement, je ne sais pas trop… mais Riqui, tu es louche quand même.'
    )
  })

  it('préfixe à virgule devant le nom visé : le nom garde sa majuscule', () => {
    expect(lgBotLine('ask', NORBERT, RIQUI, tr)).toBe('Statistiquement, Riqui, et toi, tu votes qui ?')
  })

  it('préfixe qui fait phrase (« Banco ! ») : la majuscule suivante reste', () => {
    expect(lgBotLine('wrong', DEDE, RIQUI, tr)).toBe('Banco ! Bon… je me suis planté sur Riqui.')
    expect(lgBotLine('suspect', DEDE, RIQUI, tr)).toBe('Banco ! Riqui, c’est toi le loup !')
  })

  it('le « I » anglais survit à l’enchaînement', () => {
    const en = translator({ 'botSay.wrong': 'Well… I was wrong about {name}.', 'botSay.suspect': 'I find {name} shady', 'botTic.norbert': 'Statistically,' })
    expect(lgBotLine('suspect', NORBERT, RIQUI, en)).toBe('Statistically, I find Riqui shady')
    expect(lgBotLine('wrong', NORBERT, RIQUI, en)).toBe('Statistically, well… I was wrong about Riqui.')
  })

  it('suffixe : collé après la phrase', () => {
    expect(lgBotLine('suspect', GEPETO, RIQUI, tr)).toBe('Je trouve Riqui louche …véridique !')
  })

  it('withTic=false (pas sa première parole de la manche) : phrase seule', () => {
    expect(lgBotLine('suspect', GEPETO, RIQUI, tr, { withTic: false })).toBe('Je trouve Riqui louche')
    expect(lgBotLine('suspect', NORBERT, RIQUI, tr, { withTic: false })).toBe('Je ne sais pas trop… mais Riqui, tu es louche quand même.')
  })

  it('converti sans persona, humain (même au pseudo d’un persona), auteur inconnu : phrase seule', () => {
    expect(lgBotLine('suspect', bot('Riqui'), bot('Raoul'), tr)).toBe('Je trouve Raoul louche')
    expect(lgBotLine('suspect', human('Raoul 🦊'), RIQUI, tr)).toBe('Je trouve Riqui louche')
    expect(lgBotLine('suspect', undefined, RIQUI, tr)).toBe('Je trouve Riqui louche')
  })

  it('cible absente de la table : un tiret, jamais une bulle vide', () => {
    expect(lgBotLine('suspect', GEPETO, undefined, tr, { withTic: false })).toBe('Je trouve — louche')
  })

  it('clé du tic absente du catalogue : phrase seule, jamais de clé brute', () => {
    expect(lgBotLine('suspect', RAOUL, RIQUI, tr)).toBe('Riqui, c’est toi le loup !')
  })

  it('ni variante ni base → null, la bulle est masquée', () => {
    expect(lgBotLine('rally', GEPETO, RIQUI, tr)).toBeNull()
  })
})

describe('lgBotLine : accord en genre de l’auteur et de la cible (select ICU)', () => {
  const tr = icuTranslator({
    'botSay.wrong': 'Bon… {speaker, select, f {je me suis plantée} m {je me suis planté} other {j’ai eu tout faux}} sur {name}.',
    'botSay.suspect': 'Je trouve {name} louche… {target, select, f {elle nous cache un truc} m {il nous cache un truc} other {y a un truc qui cloche}}',
    'botSay.ask': '{name}, tu votes qui ?',
  })
  const SUZETTE = bot('Suzette')

  it('speaker : le genre du persona de l’auteur, neutre pour un humain ou un converti', () => {
    expect(lgBotLine('wrong', SUZETTE, RIQUI, tr)).toBe('Bon… je me suis plantée sur Riqui.')
    expect(lgBotLine('wrong', RAOUL, RIQUI, tr)).toBe('Bon… je me suis planté sur Riqui.')
    expect(lgBotLine('wrong', human('Suzette'), RIQUI, tr)).toBe('Bon… j’ai eu tout faux sur Riqui.')
    expect(lgBotLine('wrong', bot('Riqui'), RIQUI, tr)).toBe('Bon… j’ai eu tout faux sur Riqui.')
  })

  it('target : le genre du persona visé, neutre pour un humain, un converti ou une cible absente', () => {
    expect(lgBotLine('suspect', RIQUI, SUZETTE, tr)).toBe('Je trouve Suzette louche… elle nous cache un truc')
    expect(lgBotLine('suspect', RIQUI, bot('Raoul'), tr)).toBe('Je trouve Raoul louche… il nous cache un truc')
    expect(lgBotLine('suspect', RIQUI, human('Suzette'), tr)).toBe('Je trouve Suzette louche… y a un truc qui cloche')
    expect(lgBotLine('suspect', RIQUI, bot('Kevin'), tr)).toBe('Je trouve Kevin louche… y a un truc qui cloche')
    expect(lgBotLine('suspect', RIQUI, undefined, tr)).toBe('Je trouve — louche… y a un truc qui cloche')
  })

  it('les trois valeurs sont toujours transmises, même à un gabarit qui n’en lit qu’une', () => {
    const seen: (Record<string, string> | undefined)[] = []
    const spy: LGLineTranslator = {
      has: tr.has,
      format: (key, values) => {
        seen.push(values)
        return tr.format(key, values)
      },
    }
    expect(lgBotLine('ask', SUZETTE, bot('Raoul'), spy)).toBe('Raoul, tu votes qui ?')
    expect(seen).toEqual([{ name: 'Raoul', speaker: 'f', target: 'm' }])
  })

  it('variante tirée + tic à virgule : l’enchaînement s’applique au rendu de la variante', () => {
    const cat = icuTranslator({
      'botSay.suspect': 'Je trouve {name} louche',
      'botSay.suspect_2': '{speaker, select, f {Convaincue} m {Convaincu} other {Sûr de moi}}, je vise {name}.',
      'botTic.norbert': 'Statistiquement,',
    })
    const seed = SEEDS.find((s) => lgSayVariantKey('botSay.suspect', s, cat.has) === 'botSay.suspect_2')
    expect(seed).toBeDefined()
    expect(lgBotLine('suspect', bot('Norbert'), RIQUI, cat, { seed })).toBe('Statistiquement, convaincu, je vise Riqui.')
    expect(lgBotLine('suspect', bot('Norbert'), RIQUI, cat, { seed, withTic: false })).toBe('Convaincu, je vise Riqui.')
  })
})

describe('catalogue des phrases du débat (fr, en, es, it)', () => {
  const NAME = 'Mauricette'

  it('clés : 8 kinds de base, 4 traits × suspect/defend, variantes contiguës (`_2` avant `_3`), au moins 2 par phrase', () => {
    const traits = [...new Set<BotTrait>(BOT_PERSONAS.map((p) => p.trait))].sort()
    expect(traits).toEqual(['agressif', 'farceur', 'prudent', 'suiveur'])
    for (const [locale, game] of Object.entries(LOCALES)) {
      expect([...new Set(Object.keys(game.botSay).map(baseOf))].sort(), locale).toEqual(BASE_KINDS)
      expect(Object.keys(game.botSayTrait).sort(), locale).toEqual(traits)
      for (const trait of traits) {
        expect([...new Set(Object.keys(game.botSayTrait[trait]).map(baseOf))].sort(), `${locale}.${trait}`).toEqual(['defend', 'suspect'])
      }
      const keys = sayKeys(game)
      for (const key of keys) {
        const variant = key.match(/^(.*)_(\d+)$/)
        if (!variant) {
          expect(keys, `${locale}.${key} : sans variante _2`).toContain(`${key}_2`)
          continue
        }
        const n = Number(variant[2])
        expect(n, `${locale}.${key}`).toBeGreaterThanOrEqual(2)
        expect(keys, `${locale}.${key} : précédente absente`).toContain(n === 2 ? variant[1] : `${variant[1]}_${n - 1}`)
      }
    }
  })

  it('rendu ICU, chaque clé × (speaker, target) ∈ {f, m, other}² : ≤ 70 caractères, nom présent, aucune accolade, pas d’espace parasite', () => {
    for (const [locale, game] of Object.entries(LOCALES)) {
      const flat = flatten(game)
      for (const key of sayKeys(game)) {
        const format = new IntlMessageFormat(flat[key], locale)
        for (const speaker of GENRES) {
          for (const target of GENRES) {
            const line = String(format.format({ name: NAME, speaker, target }))
            const label = `${locale}.${key} ${speaker}/${target} : ${line}`
            expect([...line].length, label).toBeLessThanOrEqual(70)
            expect(line, label).toContain(NAME)
            expect(line, label).not.toMatch(/[{}]/)
            expect(line.trim(), label).toBe(line)
            expect(line, label).not.toMatch(/\s{2}/)
          }
        }
      }
    }
  })

  it('les variantes d’une même phrase sont toutes différentes ; apostrophe typographique seulement (l’ASCII est un quote ICU)', () => {
    for (const [locale, game] of Object.entries(LOCALES)) {
      const flat = flatten(game)
      const byBase = new Map<string, string[]>()
      for (const key of sayKeys(game)) {
        expect(flat[key], `${locale}.${key}`).not.toContain("'")
        byBase.set(baseOf(key), [...(byBase.get(baseOf(key)) ?? []), flat[key]])
      }
      for (const [base, texts] of byBase) expect(new Set(texts).size, `${locale}.${base}`).toBe(texts.length)
    }
  })

  it('chaque persona compose une ligne réelle dans les 4 langues (tic + nom visé présents)', () => {
    for (const [locale, game] of Object.entries(LOCALES)) {
      const real = icuTranslator(flatten(game), locale)
      for (const persona of BOT_PERSONAS) {
        const line = lgBotLine('suspect', bot(persona.name), RIQUI, real)
        const tic = game.botTic[persona.ticKey]
        expect(line, `${locale}.${persona.name}`).toContain('Riqui')
        expect(line, `${locale}.${persona.name}`).toContain(tic)
        if (persona.ticPosition === 'prefix') expect(line!.startsWith(tic), `${locale}.${persona.name} : ${line}`).toBe(true)
        else expect(line!.endsWith(tic), `${locale}.${persona.name} : ${line}`).toBe(true)
      }
    }
  })

  it('20 tics distincts par langue, exactement ceux des personas, sans argument ICU, ≤ 30 caractères', () => {
    const ticKeys = BOT_PERSONAS.map((p) => p.ticKey).sort()
    for (const [locale, game] of Object.entries(LOCALES)) {
      const tics = game.botTic
      expect(Object.keys(tics).sort(), locale).toEqual(ticKeys)
      expect(new Set(Object.values(tics)).size, `${locale} : tics identiques`).toBe(ticKeys.length)
      for (const [key, text] of Object.entries(tics)) {
        expect(text, `${locale}.${key}`).not.toContain('{')
        expect([...text].length, `${locale}.${key} : ${text}`).toBeLessThanOrEqual(30)
        expect(text.trim(), `${locale}.${key}`).toBe(text)
      }
    }
  })

  it('un préfixe à virgule ne redouble jamais le premier mot de la phrase (« Moi pareil, pareil… »), quelle que soit la variante ou la cible', () => {
    const word = (s: string | undefined) => (s ?? '').toLowerCase().replace(/[^a-zà-ÿ]/g, '')
    const targets = [bot('Suzette'), bot('Raoul'), RIQUI]
    for (const [locale, game] of Object.entries(LOCALES)) {
      const real = icuTranslator(flatten(game), locale)
      for (const persona of BOT_PERSONAS) {
        const tic = game.botTic[persona.ticKey]
        if (persona.ticPosition !== 'prefix' || !tic.endsWith(',')) continue
        const last = word(tic.split(' ').pop())
        for (const kind of BASE_KINDS as LGDebateSpeech['kind'][]) {
          for (const target of targets) {
            for (const seed of SEEDS) {
              const line = lgBotLine(kind, bot(persona.name), target, real, { seed })
              expect(line, `${locale}.${persona.name}.${kind}`).not.toBeNull()
              const first = word(line!.slice(tic.length).trim().split(' ')[0])
              expect(first, `${locale}.${persona.name}.${kind} : ${line}`).not.toBe(last)
            }
          }
        }
      }
    }
  })
})

describe('lgPlayerIcon', () => {
  const members = [
    { userId: 'h1', preferences: { icon: 'chope' } },
    { userId: 'h2', preferences: {} },
  ]

  it('bot de naissance : le portrait de son persona, nom nu ou ancien format « Raoul 🦊 »', () => {
    expect(lgPlayerIcon({ id: 'b1', name: 'Raoul', isBot: true }, members)).toBe('bot-raoul')
    expect(lgPlayerIcon({ id: 'b1', name: 'Raoul 🦊', isBot: true }, members)).toBe('bot-raoul')
  })

  it('déserteur converti en bot : garde l’icône de son compte tant qu’il est membre', () => {
    expect(lgPlayerIcon({ id: 'h1', name: 'Riqui', isBot: true }, members)).toBe('chope')
  })

  it('converti parti de la salle, ou sans icône : le 🤖 générique', () => {
    expect(lgPlayerIcon({ id: 'gone', name: 'Parti', isBot: true }, members)).toBe(DEFAULT_BOT_EMOJI)
    expect(lgPlayerIcon({ id: 'h2', name: 'Sans icône', isBot: true }, members)).toBe(DEFAULT_BOT_EMOJI)
  })

  it('humain : l’icône du compte, sinon la silhouette', () => {
    expect(lgPlayerIcon({ id: 'h1', name: 'Riqui', isBot: false }, members)).toBe('chope')
    expect(lgPlayerIcon({ id: 'h2', name: 'Nu', isBot: false }, members)).toBe('👤')
    expect(lgPlayerIcon({ id: 'h3', name: 'Inconnu', isBot: false }, members)).toBe('👤')
  })

  it('un humain dont le pseudo est celui d’un persona ne prend pas son portrait', () => {
    expect(lgPlayerIcon({ id: 'h1', name: 'Raoul 🦊', isBot: false }, members)).toBe('chope')
    expect(lgPlayerIcon({ id: 'h2', name: 'Raoul', isBot: false }, members)).toBe('👤')
  })
})
