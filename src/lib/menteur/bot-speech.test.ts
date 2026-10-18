import { afterEach, describe, expect, it, vi } from 'vitest'
import { BOT_PERSONAS, DEFAULT_BOT_TRAITS, botTraitsFor, pickBotPersonas, type BotTraits } from '@/lib/online/bot-personas'
import { createRng } from '@/lib/petit-buveur/rng'
import {
  createMenteurState,
  currentMenteurActorId,
  reduceMenteur,
  toMenteurClientView,
  MENTEUR_SPEECH_CAP,
  MENTEUR_START_DICE,
  type MenteurClientView,
  type MenteurDuel,
  type MenteurPlayer,
  type MenteurRules,
  type MenteurSpeech,
  type MenteurState,
} from './engine'
import { applyMenteurBotAction } from './server-adapter'
import { menteurBotDecide, type MenteurBotAction, type MenteurBotWhy } from './bot-brain'
import {
  menteurBluffedBefore,
  menteurBotSay,
  menteurGrudgeTarget,
  MENTEUR_SURE_AT,
  MENTEUR_TELL_SPLIT,
  MENTEUR_UNSURE_AT,
  type MenteurSayMove,
} from './bot-speech'

/**
 * Paroles des bots du Menteur : un tell LISIBLE et honnête selon le trait
 * (la prudente n'est sûre que si c'est vrai, le farceur ment au gré de son
 * audace, l'agressif crâne toujours), des cibles que le moteur accepte, un
 * plafond tenu, et rien que la vue du bot.
 */

const T0 = 1_000_000
const SLOW = 30_000

const P = (id: string, dice: number[], extra: Partial<MenteurPlayer> = {}): MenteurPlayer => ({
  id,
  name: id,
  isBot: true,
  leftAt: null,
  dice,
  lostCount: MENTEUR_START_DICE - dice.length,
  ...extra,
})

const craft = (players: MenteurPlayer[], over: Partial<MenteurState> = {}): MenteurState => ({
  version: 1,
  phase: 'bidding',
  players,
  turnIdx: 0,
  currentBid: null,
  lastReveal: null,
  round: 1,
  winnerId: null,
  rematchVotes: [],
  rngState: 12345,
  rulePalifico: false,
  ruleCalza: false,
  revealAt: null,
  palifico: false,
  bids: [],
  duels: [],
  speech: [],
  ...over,
})

/** Le bot `name` (id `me`) au tour, Riqui (humain) répond, Suzette a enchéri juste avant. */
const seated = (name: string, over: Partial<MenteurState> = {}) =>
  craft(
    [
      P('me', [2, 3, 3, 5, 6], { name }),
      P('h', [1, 2, 4, 4, 6], { name: 'Riqui', isBot: false }),
      P('s', [2, 2, 5, 6, 6], { name: 'Suzette' }),
    ],
    over
  )
const raised = (name: string, over: Partial<MenteurState> = {}) =>
  seated(name, { currentBid: { qty: 3, face: 4, by: 's' }, bids: [{ qty: 3, face: 4, by: 's' }], ...over })

const why = (pOwn: number | null, extra: Partial<MenteurBotWhy> = {}): MenteurBotWhy => ({
  pOwn,
  pCur: null,
  bluffing: false,
  forced: false,
  ...extra,
})
const BID = (qty: number, face: number): MenteurBotAction => ({ type: 'BID', qty, face })

const sayOf = (
  state: MenteurState,
  action: MenteurBotAction,
  w: MenteurBotWhy,
  rand: () => number,
  traits: BotTraits = botTraitsFor(state.players[0].name),
  honesty?: number | null
): MenteurSayMove | null =>
  menteurBotSay(toMenteurClientView(state, 'me'), 'me', action, w, traits, rand, honesty)

/** États d'enchères tirés de vraies parties de bots (personas mêlés), bot au tour. */
function biddingStates(games: number, rules: MenteurRules[] = [{}, { calza: true }, { palifico: true, calza: true }]) {
  const out: MenteurState[] = []
  for (const r of rules) {
    for (let g = 0; g < games; g += 1) {
      const names = pickBotPersonas(2 + (g % 4), createRng(`parole-table-${g}`).next).map((p) => p.name)
      let s = createMenteurState(
        names.map((name, i) => ({ id: `b${i + 1}`, name, isBot: true })),
        `parole-${g}`,
        r
      )
      const rand = createRng(`parole-coups-${g}`).next
      for (let step = 0; step < 300 && s.phase !== 'finished'; step += 1) {
        if (s.phase === 'bidding') out.push(s)
        const res = applyMenteurBotAction(s, rand, T0 + step * 3_000)
        if (!res.ok) throw new Error(res.error)
        s = res.state
      }
    }
  }
  return out
}

afterEach(() => {
  vi.restoreAllMocks()
})

describe('le tell d’une enchère selon le trait', () => {
  it('Bernadette (prudente) dit « sûre » si et seulement si pOwn ≥ 0,8, « pas sûre » si et seulement si pOwn ≤ 0,45', () => {
    const rand = createRng('bernadette').next
    for (let i = 0; i <= 100; i += 1) {
      const p = i / 100
      for (const state of [seated('Bernadette'), raised('Bernadette')]) {
        const said = sayOf(state, BID(4, 6), why(p), rand)
        expect(said?.kind === 'sure', `pOwn ${p}`).toBe(p >= MENTEUR_SURE_AT)
        expect(said?.kind === 'unsure', `pOwn ${p}`).toBe(p <= MENTEUR_UNSURE_AT)
      }
    }
  })

  it('sur ses vrais coups aussi : la prudente n’est sûre que quand le cerveau l’est', () => {
    const states = biddingStates(10)
    let seen = 0
    for (const [i, s] of states.entries()) {
      const botId = currentMenteurActorId(s)!
      const bot = s.players.find((p) => p.id === botId)!
      const traits = botTraitsFor(bot.name)
      if (traits.trait !== 'prudent') continue
      // Manche vierge de paroles : le plafond ne masque pas le tell.
      const view: MenteurClientView = { ...toMenteurClientView(s, botId), speech: [], duels: [] }
      const decision = menteurBotDecide(view, botId, traits, createRng(`vrai-${i}`).next)
      if (decision.action.type !== 'BID') continue
      const said = menteurBotSay(view, botId, decision.action, decision.why, traits, createRng(`dit-${i}`).next)
      const p = decision.why.pOwn!
      expect(said?.kind === 'sure', `${bot.name} pOwn ${p}`).toBe(p >= MENTEUR_SURE_AT)
      seen += 1
    }
    expect(seen).toBeGreaterThan(100)
  }, SLOW)

  it('Raoul (agressif) crâne toujours : chaque enchère dont il parle est « sûre », bluff ou pas', () => {
    const rand = createRng('raoul').next
    let spoken = 0
    for (let i = 0; i < 2000; i += 1) {
      const said = sayOf(raised('Raoul'), BID(4, 5), why(i / 2000, { bluffing: i % 3 === 0 }), rand)
      if (!said) continue
      spoken += 1
      expect(said.kind).toBe('sure')
    }
    // Il parle souvent, pas à chaque coup (bavardage 2 : une enchère sur trois).
    expect(spoken).toBeGreaterThan(550)
    expect(spoken).toBeLessThan(800)
  })

  it('Gépéto (farceur, audace 0,8) dit vrai avec une fréquence de 1 − audace, à 0,1 près sur 2000 tirages', () => {
    const { audace } = botTraitsFor('Gépéto')
    const rand = createRng('gepeto').next
    const pOwn = createRng('gepeto-p').next
    let truths = 0
    let tells = 0
    for (let i = 0; i < 2000; i += 1) {
      const p = pOwn()
      const said = sayOf(raised('Gépéto'), BID(4, 5), why(p), rand)
      if (!said) continue
      expect(['sure', 'unsure']).toContain(said.kind)
      tells += 1
      if (said.kind === (p >= MENTEUR_TELL_SPLIT ? 'sure' : 'unsure')) truths += 1
    }
    expect(tells).toBeGreaterThan(800)
    expect(Math.abs(truths / tells - (1 - audace))).toBeLessThanOrEqual(0.1)
  })

  it('le suiveur dit « je te suis » à qui il suit sur sa face, et n’est sûr qu’avec la table derrière lui', () => {
    const rand = createRng('suiveur').next
    const kinds = new Set<string>()
    for (let i = 0; i < 400; i += 1) {
      const follow = sayOf(raised('Mauricette'), BID(4, 4), why(0.6), rand)
      if (follow) {
        expect(follow).toEqual({ playerId: 'me', kind: 'ally', targetId: 's' })
        kinds.add('ally')
      }
      const other = sayOf(raised('Mauricette'), BID(3, 5), why(i % 2 ? 0.9 : 0.6), rand)
      if (other) {
        expect(other).toEqual({ playerId: 'me', kind: 'sure', targetId: 'h' })
        kinds.add('sure')
      }
      if (i % 2 === 0) expect(other).toBeNull()
    }
    expect([...kinds].sort()).toEqual(['ally', 'sure'])
  })

  it('à l’ouverture, le suiveur (et le converti, suiveur par défaut) ne se dit jamais sûr : personne ne l’a précédé', () => {
    const rand = createRng('suiveur-ouverture').next
    for (let i = 0; i < 400; i += 1) {
      expect(sayOf(seated('Mauricette'), BID(2, 6), why(0.95), rand)).toBeNull()
      expect(sayOf(seated('Riri'), BID(2, 6), why(0.95), rand, DEFAULT_BOT_TRAITS)).toBeNull()
    }
  })

  it('franchise fixée à 0,5 (repli « bruit pur ») : la prudente elle-même ne dit plus vrai qu’une fois sur deux', () => {
    const rand = createRng('bruit').next
    let truths = 0
    let tells = 0
    for (let i = 0; i < 2000; i += 1) {
      const p = i % 2 ? 0.9 : 0.2
      const said = sayOf(raised('Bernadette'), BID(4, 6), why(p), rand, undefined, 0.5)
      if (!said) continue
      tells += 1
      if (said.kind === (p >= MENTEUR_TELL_SPLIT ? 'sure' : 'unsure')) truths += 1
    }
    expect(tells).toBe(2000)
    expect(Math.abs(truths / tells - 0.5)).toBeLessThanOrEqual(0.05)
  })
})

describe('défi, Calza et pique d’ouverture', () => {
  const bluffDuel = (by: string, bluff: boolean): MenteurDuel => ({
    round: 0,
    bidderId: by,
    challengerId: 'me',
    mode: 'dudo',
    held: !bluff,
    loserId: bluff ? by : 'me',
    bids: [{ qty: 2, face: 3, by, bluff }],
  })

  it('« Menteur ! » : again contre un bluffeur déjà démasqué, suspect sinon ; jamais systématique', () => {
    const rand = createRng('defi').next
    const counts = { again: 0, suspect: 0, silent: 0 }
    for (let i = 0; i < 1000; i += 1) {
      const caught = raised('Kéké', { duels: [bluffDuel('s', true)] })
      const clean = raised('Kéké', { duels: [bluffDuel('s', false)] })
      const a = sayOf(caught, { type: 'DUDO' }, why(null), rand)
      const b = sayOf(clean, { type: 'DUDO' }, why(null), rand)
      if (a) expect(a).toEqual({ playerId: 'me', kind: 'again', targetId: 's' })
      if (b) expect(b).toEqual({ playerId: 'me', kind: 'suspect', targetId: 's' })
      counts.again += a ? 1 : 0
      counts.suspect += b ? 1 : 0
      counts.silent += (a ? 0 : 1) + (b ? 0 : 1)
    }
    // Kéké, agressif et bavard (3), le plus prompt de tous : il se tait encore parfois.
    expect(counts.again).toBeGreaterThan(800)
    expect(counts.suspect).toBeGreaterThan(800)
    expect(counts.silent).toBeGreaterThan(100)
    expect(menteurBluffedBefore([bluffDuel('s', true)], 's')).toBe(true)
    expect(menteurBluffedBefore([bluffDuel('s', false)], 's')).toBe(false)
  })

  it('le défi d’une taiseuse est plus rare que celui d’un bavard : bavardage / 4, + 0,25 pour l’agressif', () => {
    const rate = (name: string) => {
      const rand = createRng(`taux-${name}`).next
      let n = 0
      for (let i = 0; i < 4000; i += 1) if (sayOf(raised(name), { type: 'DUDO' }, why(null), rand)) n += 1
      return n / 4000
    }
    expect(rate('Bernadette')).toBeCloseTo(0.25, 1)
    expect(rate('Josiane')).toBeCloseTo(0.75, 1)
    expect(rate('Germaine')).toBeCloseTo(0.5, 1)
  })

  it('Calza : exact, visant l’enchérisseur, avec une probabilité de bavardage / 3', () => {
    const rand = createRng('calza').next
    let n = 0
    for (let i = 0; i < 3000; i += 1) {
      const said = sayOf(raised('Barnabé', { ruleCalza: true }), { type: 'CALZA' }, why(null), rand)
      if (!said) continue
      n += 1
      expect(said).toEqual({ playerId: 'me', kind: 'exact', targetId: 's' })
    }
    expect(n / 3000).toBeCloseTo(2 / 3, 1)
  })

  it('pique d’ouverture : le rancunier qui vient de perdre un dé au défi vise celui qui le lui a pris', () => {
    const lost: MenteurDuel = {
      round: 1,
      bidderId: 'me',
      challengerId: 'h',
      mode: 'dudo',
      held: false,
      loserId: 'me',
      bids: [{ qty: 4, face: 2, by: 'me', bluff: true }],
    }
    const opening = (name: string, duel: MenteurDuel, over: Partial<MenteurState> = {}) =>
      seated(name, { round: 2, duels: [duel], ...over })
    const rand = createRng('pique').next
    // Germaine (rancune 1) pique à chaque fois ; Raoul (0,9) presque toujours.
    let raoul = 0
    for (let i = 0; i < 1000; i += 1) {
      expect(sayOf(opening('Germaine', lost), BID(2, 3), why(0.9), rand)).toEqual({ playerId: 'me', kind: 'grudge', targetId: 'h' })
      if (sayOf(opening('Raoul', lost), BID(2, 3), why(0.9), rand)?.kind === 'grudge') raoul += 1
    }
    expect(raoul / 1000).toBeCloseTo(botTraitsFor('Raoul').rancune, 1)
    // Lucien n'en veut à personne (rancune 0) : jamais de pique.
    for (let i = 0; i < 200; i += 1) {
      expect(sayOf(opening('Lucien', lost), BID(2, 3), why(i / 200), rand)?.kind).not.toBe('grudge')
    }
    // Pas à l'ouverture, pas après un Calza raté (il s'est fait perdre lui-même), ni contre un éliminé.
    expect(sayOf(opening('Germaine', lost, { currentBid: { qty: 3, face: 4, by: 's' } }), BID(4, 4), why(0.9), rand)?.kind).not.toBe('grudge')
    const calza = { ...lost, mode: 'calza' as const, challengerId: 'me', bidderId: 'h' }
    expect(sayOf(opening('Germaine', calza), BID(2, 3), why(0.9), rand)?.kind).not.toBe('grudge')
    const gone = opening('Raoul', lost)
    gone.players[1] = { ...gone.players[1], dice: [] }
    expect(menteurGrudgeTarget(toMenteurClientView(gone, 'me'), 'me', 0.9)).toBeNull()
    // Un duel d'une manche plus ancienne ne compte plus.
    expect(menteurGrudgeTarget(toMenteurClientView(opening('Raoul', { ...lost, round: 0 }), 'me'), 'me', 0.9)).toBeNull()
  })

  it('face à sa propre enchère (le répondant est parti), le bot se tait plutôt que de se viser : le coup passe', () => {
    const own = raised('Kéké', { currentBid: { qty: 3, face: 4, by: 'me' }, bids: [{ qty: 3, face: 4, by: 'me' }] })
    const rand = createRng('soi').next
    for (let i = 0; i < 200; i += 1) {
      expect(sayOf(own, { type: 'DUDO' }, why(null), rand)).toBeNull()
      expect(sayOf({ ...own, ruleCalza: true }, { type: 'CALZA' }, why(null), rand)).toBeNull()
      expect(sayOf(raised('Mauricette', { currentBid: own.currentBid, bids: own.bids }), BID(4, 4), why(0.6), rand)).toBeNull()
    }
    // De bout en bout : Riqui part au moment de répondre, la main revient au bot.
    for (let g = 0; g < 300; g += 1) {
      let s: MenteurState = {
        ...createMenteurState([{ id: 'b', name: 'Kéké', isBot: true }, { id: 'h', name: 'Riqui' }], `soi-${g}`),
        turnIdx: 0,
      }
      const coups = createRng(`soi-coups-${g}`).next
      const first = applyMenteurBotAction(s, coups, T0)
      if (!first.ok) throw new Error(first.error)
      s = reduceMenteur(first.state, { type: 'LEAVE', playerId: 'h', at: T0 + 1_000 })
      expect(s.currentBid?.by).toBe('b')
      expect(currentMenteurActorId(s)).toBe('b')
      const r = applyMenteurBotAction(s, coups, T0 + 3_000)
      expect(r, `partie ${g}`).toMatchObject({ ok: true })
    }
  })

  it('chaque parole est valide pour le moteur, qui l’accepte dans la même réduction', () => {
    const states = biddingStates(6)
    let checked = 0
    for (const [i, s] of states.entries()) {
      const botId = currentMenteurActorId(s)!
      const bot = s.players.find((p) => p.id === botId)!
      const traits = botTraitsFor(bot.name)
      const view = toMenteurClientView(s, botId)
      const d = menteurBotDecide(view, botId, traits, createRng(`valide-${i}`).next)
      const said = menteurBotSay(view, botId, d.action, d.why, traits, createRng(`valide-dit-${i}`).next)
      if (!said) continue
      const say = { kind: said.kind, targetId: said.targetId! }
      const next =
        d.action.type === 'BID'
          ? reduceMenteur(s, { type: 'BID', playerId: botId, qty: d.action.qty, face: d.action.face, say })
          : reduceMenteur(s, { type: d.action.type, playerId: botId, now: T0, say })
      expect(next.speech?.at(-1)).toEqual({ ...said, round: s.round })
      expect(next.version).toBe(s.version + 1)
      checked += 1
    }
    expect(checked).toBeGreaterThan(200)
  }, SLOW)
})

describe('plafond, sobriété et anti-triche', () => {
  const spoke = (count: number, round = 1): MenteurSpeech[] =>
    Array.from({ length: count }, () => ({ playerId: 'me', kind: 'sure' as const, targetId: 'h', round }))

  it(`plafond min(${MENTEUR_SPEECH_CAP}, bavardage) par manche : Bernadette une fois, Gépéto deux, jamais trois`, () => {
    const rand = createRng('plafond').next
    for (let i = 0; i < 200; i += 1) {
      expect(sayOf(raised('Bernadette', { speech: spoke(1) }), BID(4, 6), why(0.95), rand)).toBeNull()
      expect(sayOf(raised('Gépéto', { speech: spoke(2) }), BID(4, 6), why(0.95), rand)).toBeNull()
      expect(sayOf(raised('Gépéto', { speech: spoke(2) }), { type: 'DUDO' }, why(null), rand)).toBeNull()
    }
    // Les paroles d'une manche passée ne comptent pas : Bernadette reparle.
    expect(sayOf(raised('Bernadette', { round: 2, speech: spoke(1, 1) }), BID(4, 6), why(0.95), rand)?.kind).toBe('sure')
    // Le plafond suit les traits passés par l'adaptateur (un converti : ceux par défaut).
    expect(sayOf(raised('Bernadette', { speech: spoke(1) }), BID(4, 6), why(0.95), rand, { ...DEFAULT_BOT_TRAITS, trait: 'prudent' })?.kind).toBe('sure')
  })

  it('ni humain, ni éliminé, ni révélation : personne ne parle à leur place', () => {
    const rand = createRng('muets').next
    const s = raised('Raoul')
    const view = toMenteurClientView(s, 'h')
    expect(menteurBotSay(view, 'h', BID(4, 5), why(0.95), botTraitsFor('Raoul'), rand)).toBeNull()
    expect(sayOf(raised('Raoul', { phase: 'reveal' }), BID(4, 5), why(0.95), rand)).toBeNull()
  })

  it('un converti (sans persona) parle au ton par défaut, sans erreur', () => {
    const rand = createRng('converti').next
    let n = 0
    for (let i = 0; i < 400; i += 1) {
      const said = sayOf(raised('Riri'), BID(4, 4), why(0.9), rand, DEFAULT_BOT_TRAITS)
      if (said) {
        n += 1
        expect(said.kind).toBe('ally')
      }
    }
    expect(n).toBeGreaterThan(100)
  })

  it('invariance : dés cachés des autres et RNG du moteur brouillés ⇒ mêmes coups, mêmes bulles', () => {
    const states = biddingStates(8)
    let compared = 0
    let spoken = 0
    for (const [i, s] of states.entries()) {
      const botId = currentMenteurActorId(s)!
      const rng = createRng(`brouille-${i}`)
      const other: MenteurState = {
        ...s,
        rngState: (s.rngState ^ 0x5bd1e995) >>> 0,
        players: s.players.map((p) => (p.id === botId ? p : { ...p, dice: p.dice.map(() => rng.int(1, 6)) })),
      }
      const a = applyMenteurBotAction(s, createRng(`c-${i}`).next, T0, createRng(`d-${i}`).next)
      const b = applyMenteurBotAction(other, createRng(`c-${i}`).next, T0, createRng(`d-${i}`).next)
      if (!a.ok || !b.ok) throw new Error('refus')
      expect(b.state.speech, `état ${i}`).toEqual(a.state.speech)
      expect(b.state.currentBid ?? b.state.lastReveal?.mode).toEqual(a.state.currentBid ?? a.state.lastReveal?.mode)
      compared += 1
      if ((a.state.speech?.length ?? 0) > (s.speech?.length ?? 0)) spoken += 1
    }
    expect(compared).toBeGreaterThan(300)
    expect(spoken).toBeGreaterThan(50)
  }, SLOW)

  it('pur : ni Math.random ni Date.now, même suite ⇒ même bulle', () => {
    const random = vi.spyOn(Math, 'random')
    const clock = vi.spyOn(Date, 'now')
    const one = () => sayOf(raised('Paulette'), BID(4, 5), why(0.7), createRng('pur').next)
    expect(one()).toEqual(one())
    expect(random).not.toHaveBeenCalled()
    expect(clock).not.toHaveBeenCalled()
  })

  it('sur des tables de bots, les personas prennent la parole avec leurs coups, bien plus de huit d’entre elles', () => {
    const talkers = new Set<string>()
    for (const s of biddingStates(12, [{}])) {
      for (const sp of s.speech ?? []) talkers.add(s.players.find((p) => p.id === sp.playerId)!.name)
    }
    expect(talkers.size).toBeGreaterThan(8)
    for (const name of talkers) expect(BOT_PERSONAS.map((p) => p.name)).toContain(name)
  }, SLOW)
})
