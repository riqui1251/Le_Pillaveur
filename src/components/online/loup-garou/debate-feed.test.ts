import { describe, expect, it } from 'vitest'
import type { LGDebateSpeech } from '@/lib/loup-garou/engine'
import { BOT_PERSONAS, DEFAULT_BOT_EMOJI, type BotTrait } from '@/lib/online/bot-personas'
import fr from '../../../../messages/fr.json'
import en from '../../../../messages/en.json'
import es from '../../../../messages/es.json'
import it_ from '../../../../messages/it.json'
import {
  LG_TV_FEED_SIZE,
  lgBotLine,
  lgBotSayKey,
  lgBotTic,
  lgDebateFeedItems,
  lgPlayerIcon,
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

const RAOUL = { name: 'Raoul 🦊', isBot: true }

/** Un catalogue plat → ce que lgBotLine attend de next-intl ({name} seul interpolé). */
function translator(catalogue: Record<string, string>): LGLineTranslator {
  return {
    has: (key) => key in catalogue,
    format: (key, values) => catalogue[key].replace('{name}', values?.name ?? ''),
  }
}

describe('lgBotTic : le tic du persona, jamais pour un humain ou un converti', () => {
  const has = (key: string) => key.startsWith('botTic.')

  it('persona → clé relative au namespace et position', () => {
    expect(lgBotTic(RAOUL, has)).toEqual({ key: 'botTic.raoul', position: 'prefix' })
    expect(lgBotTic({ name: 'Gépéto 🤠', isBot: true }, has)).toEqual({ key: 'botTic.gepeto', position: 'suffix' })
  })

  it('converti sans persona, humain au pseudo d’un persona, auteur inconnu → null', () => {
    expect(lgBotTic({ name: 'Riqui', isBot: true }, has)).toBeNull()
    expect(lgBotTic({ name: 'Raoul 🦊', isBot: false }, has)).toBeNull()
    expect(lgBotTic(undefined, has)).toBeNull()
  })

  it('clé absente du catalogue (onglet d’avant le déploiement) → null', () => {
    expect(lgBotTic(RAOUL, () => false)).toBeNull()
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
  const NORBERT = { name: 'Norbert 🤓', isBot: true }
  const DEDE = { name: 'Dédé 🎲', isBot: true }
  const GEPETO = { name: 'Gépéto 🤠', isBot: true }

  it('préfixe à virgule : enchaîne, la phrase perd sa majuscule', () => {
    expect(lgBotLine('suspect', NORBERT, 'Riqui', tr)).toBe(
      'Statistiquement, je ne sais pas trop… mais Riqui, tu es louche quand même.'
    )
  })

  it('préfixe à virgule devant le nom visé : le nom garde sa majuscule', () => {
    expect(lgBotLine('ask', NORBERT, 'Riqui', tr)).toBe('Statistiquement, Riqui, et toi, tu votes qui ?')
  })

  it('préfixe qui fait phrase (« Banco ! ») : la majuscule suivante reste', () => {
    expect(lgBotLine('wrong', DEDE, 'Riqui', tr)).toBe('Banco ! Bon… je me suis planté sur Riqui.')
    expect(lgBotLine('suspect', DEDE, 'Riqui', tr)).toBe('Banco ! Riqui, c’est toi le loup !')
  })

  it('le « I » anglais survit à l’enchaînement', () => {
    const en = translator({ 'botSay.wrong': 'Well… I was wrong about {name}.', 'botSay.suspect': 'I find {name} shady', 'botTic.norbert': 'Statistically,' })
    expect(lgBotLine('suspect', NORBERT, 'Riqui', en)).toBe('Statistically, I find Riqui shady')
    expect(lgBotLine('wrong', NORBERT, 'Riqui', en)).toBe('Statistically, well… I was wrong about Riqui.')
  })

  it('suffixe : collé après la phrase', () => {
    expect(lgBotLine('suspect', GEPETO, 'Riqui', tr)).toBe('Je trouve Riqui louche …véridique !')
  })

  it('withTic=false (pas sa première parole de la manche) : phrase seule', () => {
    expect(lgBotLine('suspect', GEPETO, 'Riqui', tr, false)).toBe('Je trouve Riqui louche')
    expect(lgBotLine('suspect', NORBERT, 'Riqui', tr, false)).toBe('Je ne sais pas trop… mais Riqui, tu es louche quand même.')
  })

  it('converti sans persona, humain (même au pseudo d’un persona), auteur inconnu : phrase seule', () => {
    expect(lgBotLine('suspect', { name: 'Riqui', isBot: true }, 'Raoul', tr)).toBe('Je trouve Raoul louche')
    expect(lgBotLine('suspect', { name: 'Raoul 🦊', isBot: false }, 'Riqui', tr)).toBe('Je trouve Riqui louche')
    expect(lgBotLine('suspect', undefined, 'Riqui', tr)).toBe('Je trouve Riqui louche')
  })

  it('clé du tic absente du catalogue : phrase seule, jamais de clé brute', () => {
    expect(lgBotLine('suspect', RAOUL, 'Riqui', tr)).toBe('Riqui, c’est toi le loup !')
  })

  it('ni variante ni base → null, la bulle est masquée', () => {
    expect(lgBotLine('rally', GEPETO, 'Riqui', tr)).toBeNull()
  })

  it('catalogue : chaque persona compose une ligne réelle dans les 4 langues (tic + nom visé présents)', () => {
    for (const [locale, messages] of Object.entries({ fr, en, es, it: it_ })) {
      const game = messages.games['loup-garou'].game as { botSay: Record<string, string>; botSayTrait: Record<string, Record<string, string>>; botTic: Record<string, string> }
      const flat: Record<string, string> = {}
      for (const [kind, text] of Object.entries(game.botSay)) flat[`botSay.${kind}`] = text
      for (const [trait, kinds] of Object.entries(game.botSayTrait)) {
        for (const [kind, text] of Object.entries(kinds)) flat[`botSayTrait.${trait}.${kind}`] = text
      }
      for (const [key, text] of Object.entries(game.botTic)) flat[`botTic.${key}`] = text
      const real = translator(flat)
      for (const persona of BOT_PERSONAS) {
        const line = lgBotLine('suspect', { name: persona.name, isBot: true }, 'Riqui', real)
        const tic = game.botTic[persona.ticKey]
        expect(line, `${locale}.${persona.name}`).toContain('Riqui')
        expect(line, `${locale}.${persona.name}`).toContain(tic)
        if (persona.ticPosition === 'prefix') expect(line!.startsWith(tic), `${locale}.${persona.name} : ${line}`).toBe(true)
        else expect(line!.endsWith(tic), `${locale}.${persona.name} : ${line}`).toBe(true)
      }
    }
  })

  it('catalogue : 20 tics distincts par langue, exactement ceux des personas, sans argument ICU, ≤ 30 caractères', () => {
    const ticKeys = BOT_PERSONAS.map((p) => p.ticKey).sort()
    for (const [locale, messages] of Object.entries({ fr, en, es, it: it_ })) {
      const tics = messages.games['loup-garou'].game.botTic as Record<string, string>
      expect(Object.keys(tics).sort(), locale).toEqual(ticKeys)
      expect(new Set(Object.values(tics)).size, `${locale} : tics identiques`).toBe(ticKeys.length)
      for (const [key, text] of Object.entries(tics)) {
        expect(text, `${locale}.${key}`).not.toContain('{')
        expect([...text].length, `${locale}.${key} : ${text}`).toBeLessThanOrEqual(30)
        expect(text.trim(), `${locale}.${key}`).toBe(text)
      }
    }
  })
  it('catalogue : un préfixe à virgule ne redouble jamais le premier mot de la phrase (« Moi pareil, pareil… »)', () => {
    const word = (s: string | undefined) => (s ?? '').toLowerCase().replace(/[^a-zà-ÿ]/g, '')
    for (const [locale, messages] of Object.entries({ fr, en, es, it: it_ })) {
      const game = messages.games['loup-garou'].game as { botSay: Record<string, string>; botSayTrait: Record<string, Record<string, string>>; botTic: Record<string, string> }
      const flat: Record<string, string> = {}
      for (const [kind, text] of Object.entries(game.botSay)) flat[`botSay.${kind}`] = text
      for (const [trait, kinds] of Object.entries(game.botSayTrait)) {
        for (const [kind, text] of Object.entries(kinds)) flat[`botSayTrait.${trait}.${kind}`] = text
      }
      for (const [key, text] of Object.entries(game.botTic)) flat[`botTic.${key}`] = text
      const real = translator(flat)
      for (const persona of BOT_PERSONAS) {
        const tic = game.botTic[persona.ticKey]
        if (persona.ticPosition !== 'prefix' || !tic.endsWith(',')) continue
        const last = word(tic.split(' ').pop())
        for (const kind of Object.keys(game.botSay) as LGDebateSpeech['kind'][]) {
          const line = lgBotLine(kind, { name: persona.name, isBot: true }, 'Riqui', real)
          expect(line, `${locale}.${persona.name}.${kind}`).not.toBeNull()
          const first = word(line!.slice(tic.length).trim().split(' ')[0])
          expect(first, `${locale}.${persona.name}.${kind} : ${line}`).not.toBe(last)
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
    expect(lgBotSayKey('suspect', { name: 'Riqui', isBot: true }, has)).toBe('botSay.suspect')
    expect(lgBotSayKey('suspect', { name: 'Raoul 🦊', isBot: false }, has)).toBe('botSay.suspect')
    expect(lgBotSayKey('suspect', undefined, has)).toBe('botSay.suspect')
  })

  it('ni variante ni base → null, la bulle est masquée', () => {
    expect(lgBotSayKey('rally', RAOUL, has)).toBeNull()
  })

  it('catalogue : les 4 traits ont leurs 2 variantes dans les 4 langues, {name} seul, ≤ 70 caractères (bulle de téléphone)', () => {
    const traits = [...new Set<BotTrait>(BOT_PERSONAS.map((p) => p.trait))].sort()
    expect(traits).toEqual(['agressif', 'farceur', 'prudent', 'suiveur'])
    for (const [locale, messages] of Object.entries({ fr, en, es, it: it_ })) {
      const variants = messages.games['loup-garou'].game.botSayTrait as Record<string, Record<string, string>>
      expect(Object.keys(variants).sort(), locale).toEqual(traits)
      for (const trait of traits) {
        expect(Object.keys(variants[trait]).sort(), `${locale}.${trait}`).toEqual(['defend', 'suspect'])
        for (const kind of ['suspect', 'defend']) {
          const text = variants[trait][kind]
          expect(text, `${locale}.${trait}.${kind}`).toContain('{name}')
          expect(text.length, `${locale}.${trait}.${kind} : ${text}`).toBeLessThanOrEqual(70)
        }
      }
    }
  })
})
