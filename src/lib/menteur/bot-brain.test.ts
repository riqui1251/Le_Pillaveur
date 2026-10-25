import { describe, expect, it } from 'vitest'
import { BOT_PERSONAS, DEFAULT_BOT_TRAITS, botTraitsFor, pickBotPersonas, type BotTraits } from '@/lib/online/bot-personas'
import { createRng, type SeededRng } from '@/lib/petit-buveur/rng'
import {
  createMenteurState,
  currentMenteurActorId,
  isLegalRaise,
  reduceMenteur,
  toMenteurClientView,
  MENTEUR_START_DICE,
  type MenteurAction,
  type MenteurBid,
  type MenteurClientView,
  type MenteurDuel,
  type MenteurPlayer,
  type MenteurRules,
  type MenteurState,
} from './engine'
import { applyMenteurBotAction } from './server-adapter'
import {
  menteurBluffIndex,
  menteurBotDecide,
  menteurDrankFrom,
  menteurFaceOdds,
  menteurMatchDist,
  menteurOdds,
  menteurRaiseOptions,
  menteurReadCredit,
  menteurReader,
  menteurStyle,
  MENTEUR_FALLBACK_CALL,
  type MenteurBotDecision,
} from './bot-brain'

/**
 * Cerveau des bots du Menteur : probabilités exactes, coups légaux, et un
 * caractère par persona — sur la VUE CLIENT du bot, rien d'autre.
 */

const T0 = 1_000_000
/** Les tests qui balaient des milliers de vues : larges, la suite complète tourne en parallèle. */
const SLOW = 30_000
const traits = (name: string): BotTraits => botTraitsFor(name)
const PRUDENTS = BOT_PERSONAS.filter((p) => p.trait === 'prudent').map((p) => p.name)
const SPITEFUL = BOT_PERSONAS.filter((p) => p.rancune >= 0.6).map((p) => p.name)

const P = (id: string, dice: number[], extra: Partial<MenteurPlayer> = {}): MenteurPlayer => ({
  id,
  name: id,
  isBot: false,
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
  ...over,
})

/** Le coup du cerveau, rejoué par le moteur : il doit l'accepter tel quel. */
function toAction(d: MenteurBotDecision, playerId: string): MenteurAction {
  return d.action.type === 'BID'
    ? { type: 'BID', playerId, qty: d.action.qty, face: d.action.face }
    : { type: d.action.type, playerId, now: T0 }
}

/**
 * États d'enchères, bot au tour, tirés de vraies parties de bots à persona
 * (2 à 6 joueurs, avec et sans Palifico + Calza) : la matière des tests de
 * caractère et d'invariance.
 */
function biddingStates(games: number): MenteurState[] {
  const RULES: MenteurRules[] = [{}, { calza: true }, { palifico: true, calza: true }]
  const out: MenteurState[] = []
  for (let g = 0; g < games; g += 1) {
    const count = 2 + (g % 5)
    const names = pickBotPersonas(count, createRng(`etats-table-${g}`).next).map((p) => p.name)
    let s = createMenteurState(
      names.map((name, i) => ({ id: `b${i}`, name, isBot: true })),
      `etats-${g}`,
      RULES[g % RULES.length]
    )
    const rand = createRng(`etats-coups-${g}`).next
    for (let step = 0; step < 400 && s.phase !== 'finished'; step += 1) {
      if (s.phase === 'bidding') out.push(s)
      const r = applyMenteurBotAction(s, rand, T0 + step * 6_000)
      if (!r.ok) throw new Error(r.error)
      s = r.state
    }
  }
  return out
}

const STATES = biddingStates(60)
const RESPONSES = STATES.filter((s) => s.currentBid !== null)

/** Vue du bot au tour, et son id. */
const seat = (s: MenteurState) => {
  const id = currentMenteurActorId(s)!
  return { id, view: toMenteurClientView(s, id) }
}

const decide = (view: MenteurClientView, id: string, who: BotTraits, seed: string) =>
  menteurBotDecide(view, id, who, createRng(seed).next)

describe('menteurOdds : la probabilité exacte qu’une enchère tienne', () => {
  /**
   * Énumération exhaustive : chaque crédit tenu ou non (un dé de la face
   * pris dans l'inconnu), puis toutes les faces des autres dés inconnus.
   */
  function enumerate(mine: number, unknown: number, face: number, palifico: boolean, credits: number[], qty: number) {
    let total = 0
    for (let mask = 0; mask < 2 ** credits.length; mask += 1) {
      let weight = 1
      let held = 0
      credits.forEach((w, i) => {
        if ((mask >> i) & 1) {
          weight *= w
          held += 1
        } else {
          weight *= 1 - w
        }
      })
      const free = unknown - held
      let hits = 0
      for (let code = 0; code < 6 ** free; code += 1) {
        let c = code
        let match = 0
        for (let j = 0; j < free; j += 1) {
          const d = (c % 6) + 1
          c = Math.floor(c / 6)
          if (d === face || (!palifico && face !== 1 && d === 1)) match += 1
        }
        if (mine + held + match >= qty) hits += 1
      }
      total += (weight * hits) / 6 ** free
    }
    return total
  }

  it('égale l’énumération exhaustive (u ≤ 6, 0 à 2 crédits, jokers, aux 1, Palifico)', () => {
    let checked = 0
    for (let unknown = 0; unknown <= 6; unknown += 1) {
      for (const credits of [[], [0.3], [0.15, 0.8]]) {
        if (credits.length > unknown) continue
        for (const [face, palifico] of [[4, false], [1, false], [4, true]] as const) {
          for (const mine of [0, 2]) {
            for (let qty = 0; qty <= mine + unknown + 1; qty += 1) {
              const exact = enumerate(mine, unknown, face, palifico, credits, qty)
              expect(menteurOdds(mine, unknown, menteurFaceOdds(face, palifico), credits, qty)).toBeCloseTo(exact, 12)
              checked += 1
            }
          }
        }
      }
    }
    expect(checked).toBeGreaterThan(300)
  }, SLOW)

  it('la loi des dés inconnus somme à 1, et un crédit la décale vers le haut', () => {
    const bare = menteurMatchDist(10, 1 / 3, [])
    const read = menteurMatchDist(10, 1 / 3, [0.5, 0.5])
    expect(bare.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12)
    expect(read.reduce((a, b) => a + b, 0)).toBeCloseTo(1, 12)
    for (let need = 1; need <= 10; need += 1) {
      expect(menteurOdds(0, 10, 1 / 3, [0.5, 0.5], need)).toBeGreaterThan(menteurOdds(0, 10, 1 / 3, [], need))
    }
  })
})

describe('mémoire publique : réputation et rancune dérivées de `duels`', () => {
  const duel = (over: Partial<MenteurDuel>): MenteurDuel => ({
    round: 1,
    bidderId: 'x',
    challengerId: 'me',
    mode: 'dudo',
    held: false,
    loserId: 'x',
    bids: [],
    ...over,
  })

  it('indice de bluff : prior 1/4, puis (bluffs + 1) / (enchères + 4)', () => {
    expect(menteurBluffIndex([], 'x')).toBe(0.25)
    const duels = [
      duel({ bids: [{ by: 'x', qty: 2, face: 3, bluff: true }, { by: 'y', qty: 3, face: 3, bluff: false }] }),
      duel({ bids: [{ by: 'x', qty: 4, face: 5, bluff: false }] }),
    ]
    expect(menteurBluffIndex(duels, 'x')).toBeCloseTo(2 / 6, 12)
    expect(menteurBluffIndex(duels, 'y')).toBeCloseTo(1 / 5, 12)
  })

  it('crédit de lecture : nul pour un bluffeur démasqué, plus fort pour un honnête', () => {
    const read = menteurStyle(traits('Bernadette')).read
    expect(menteurReadCredit(read, 0.5)).toBe(0)
    expect(menteurReadCredit(read, 1 / 7)).toBeGreaterThan(menteurReadCredit(read, 0.25))
  })

  it('« qui m’a fait boire » : l’autre partie de chaque défi perdu, Calza réussi exclu', () => {
    const duels = [
      duel({ bidderId: 'me', challengerId: 'a', held: false, loserId: 'me' }),
      duel({ bidderId: 'b', challengerId: 'me', held: true, loserId: 'me' }),
      duel({ bidderId: 'c', challengerId: 'me', mode: 'calza', held: true, loserId: null }),
      duel({ bidderId: 'd', challengerId: 'me', held: false, loserId: 'd' }),
    ]
    expect([...menteurDrankFrom(duels, 'me')].sort()).toEqual(['a', 'b'])
  })
})

describe('menteurBotDecide : toujours un coup légal', () => {
  /** Une table au hasard : 2 à 6 joueurs, mains, Palifico, Calza, enchère (aux 1 parfois), chaîne et duels. */
  function randomState(rng: SeededRng): { state: MenteurState; botId: string; who: BotTraits } {
    const count = rng.int(2, 6)
    const players = Array.from({ length: count }, (_, i) =>
      P(`p${i}`, Array.from({ length: rng.int(1, 5) }, () => rng.int(1, 6)))
    )
    const turnIdx = rng.pickIndex(count)
    const persona = rng.chance(0.15) ? null : rng.pick(BOT_PERSONAS)
    players[turnIdx] = { ...players[turnIdx], isBot: true, name: persona?.name ?? 'Converti' }
    const total = players.reduce((n, p) => n + p.dice.length, 0)
    const palifico = rng.chance(0.25)
    const others = players.filter((_, i) => i !== turnIdx).map((p) => p.id)
    let currentBid: MenteurBid | null = null
    const bids: MenteurBid[] = []
    if (rng.chance(0.85)) {
      const face = rng.chance(0.25) ? 1 : rng.int(2, 6)
      for (let k = rng.int(0, 3); k > 0; k -= 1) bids.push({ qty: rng.int(1, total), face: palifico ? face : rng.int(1, 6), by: rng.pick(others) })
      currentBid = { qty: rng.int(1, total), face, by: rng.pick(others) }
      bids.push(currentBid)
    }
    const ids = players.map((p) => p.id)
    const duels: MenteurDuel[] = Array.from({ length: rng.int(0, 4) }, (_, round) => {
      const bidderId = rng.pick(ids)
      const challengerId = rng.pick(ids.filter((id) => id !== bidderId))
      const held = rng.chance(0.5)
      return {
        round: round + 1,
        bidderId,
        challengerId,
        mode: 'dudo',
        held,
        loserId: held ? challengerId : bidderId,
        bids: [{ by: bidderId, qty: rng.int(1, 6), face: rng.int(1, 6), bluff: rng.chance(0.3) }],
      }
    })
    const state = craft(players, {
      turnIdx,
      currentBid,
      bids,
      duels,
      palifico,
      rulePalifico: palifico,
      ruleCalza: rng.chance(0.5),
    })
    return { state, botId: players[turnIdx].id, who: traits(players[turnIdx].name) }
  }

  it('2 000 vues au hasard : le moteur accepte chaque coup (Palifico, aux 1, Calza activé ou non)', () => {
    const rng = createRng('vues-au-hasard')
    const seen = new Set<string>()
    for (let i = 0; i < 2_000; i += 1) {
      const { state, botId, who } = randomState(rng)
      const d = decide(toMenteurClientView(state, botId), botId, who, `coup-${i}`)
      const total = state.players.reduce((n, p) => n + p.dice.length, 0)
      if (d.action.type === 'BID') {
        expect(isLegalRaise(state.currentBid, d.action.qty, d.action.face, total, state.palifico), `vue ${i}`).toBe(true)
      } else {
        expect(state.currentBid, `vue ${i}`).not.toBeNull()
        if (d.action.type === 'CALZA') expect(state.ruleCalza, `vue ${i}`).toBe(true)
      }
      expect(() => reduceMenteur(state, toAction(d, botId)), `vue ${i}`).not.toThrow()
      seen.add(`${d.action.type}${state.palifico ? '-pal' : ''}${state.currentBid?.face === 1 ? '-1' : ''}`)
    }
    // Le test mord : enchère, défi et Calza, en Palifico et aux 1.
    for (const k of ['BID', 'DUDO', 'CALZA', 'BID-pal', 'DUDO-pal', 'BID-1', 'DUDO-1']) expect(seen.has(k), k).toBe(true)
  }, SLOW)

  it('un converti (sans persona) joue en DEFAULT_BOT_TRAITS, sans erreur jusqu’à la fin', () => {
    expect(botTraitsFor('Kevin')).toEqual(DEFAULT_BOT_TRAITS)
    for (let seed = 0; seed < 10; seed += 1) {
      let s = createMenteurState(
        [
          { id: 'k', name: 'Kevin', isBot: true },
          { id: 'b', name: 'Raoul', isBot: true },
          { id: 'j', name: 'Jade', isBot: true },
        ],
        `converti-${seed}`,
        seed % 2 ? { palifico: true, calza: true } : {}
      )
      const rand = createRng(`converti-coups-${seed}`).next
      for (let step = 0; step < 800 && s.phase !== 'finished'; step += 1) {
        const r = applyMenteurBotAction(s, rand, T0 + step * 6_000)
        if (!r.ok) throw new Error(r.error)
        s = r.state
      }
      expect(s.phase).toBe('finished')
    }
  }, SLOW)

  it('le pourquoi du coup ne sort jamais : l’état joué ne porte ni `why` ni ses probabilités', () => {
    const r = applyMenteurBotAction(RESPONSES[0], createRng('why').next, T0)
    if (!r.ok) throw new Error(r.error)
    expect(JSON.stringify(r.state)).not.toMatch(/why|pOwn|pCur|bluffing|forced/)
  })
})

describe('anti-triche : le cerveau ne lit que la vue du bot', () => {
  it('500 états : dés cachés des autres et RNG du moteur brouillés ⇒ même décision, même pourquoi', () => {
    const states = STATES.filter((_, i) => i % Math.max(1, Math.floor(STATES.length / 500)) === 0).slice(0, 500)
    expect(states).toHaveLength(500)
    let moved = 0
    const kinds = new Set<string>()
    states.forEach((s, i) => {
      const { id } = seat(s)
      const rng = createRng(`brouille-${i}`)
      const other: MenteurState = {
        ...s,
        rngState: createRng(`brouille-rng-${i}`).getState(),
        players: s.players.map((p) => (p.id === id ? p : { ...p, dice: p.dice.map(() => rng.int(1, 6)) })),
      }
      if (JSON.stringify(other.players) !== JSON.stringify(s.players)) moved += 1
      const who = traits(s.players.find((p) => p.id === id)!.name)
      const a = decide(toMenteurClientView(s, id), id, who, `meme-${i}`)
      const b = decide(toMenteurClientView(other, id), id, who, `meme-${i}`)
      expect(b, `état ${i}`).toEqual(a)
      kinds.add(a.action.type)
    })
    expect(moved).toBeGreaterThan(450)
    expect([...kinds].sort()).toEqual(['BID', 'CALZA', 'DUDO'])
  }, SLOW)
})

describe('caractère : un cerveau, des joueurs différents', () => {
  /** Taux d'un événement sur les mêmes vues, pour un caractère donné, au même tirage. */
  function rateOn(states: MenteurState[], who: BotTraits, pick: (d: MenteurBotDecision) => boolean | null) {
    let hits = 0
    let total = 0
    states.forEach((s, i) => {
      const { id, view } = seat(s)
      const verdict = pick(decide(view, id, who, `caractere-${i}`))
      if (verdict === null) return
      total += 1
      if (verdict) hits += 1
    })
    return hits / total
  }
  const bluffs = (d: MenteurBotDecision) => (d.action.type === 'BID' ? d.why.bluffing : null)
  const calls = (d: MenteurBotDecision) => d.action.type === 'DUDO'

  it('le farceur bluffe au moins 3 fois plus que le prudent', () => {
    for (const farceur of ['Gépéto', 'Bricole']) {
      for (const prudent of ['Bernadette', 'Barnabé']) {
        const f = rateOn(STATES, traits(farceur), bluffs)
        const p = rateOn(STATES, traits(prudent), bluffs)
        expect(f, `${farceur} / ${prudent}`).toBeGreaterThanOrEqual(3 * p)
        expect(f).toBeGreaterThan(0.05)
      }
    }
  }, SLOW)

  it('l’agressif crie « Menteur ! » plus souvent que le prudent', () => {
    for (const agressif of ['Raoul', 'Ginette']) {
      for (const prudent of ['Bernadette', 'Firmin']) {
        expect(rateOn(RESPONSES, traits(agressif), calls), `${agressif} / ${prudent}`).toBeGreaterThan(
          rateOn(RESPONSES, traits(prudent), calls) + 0.03
        )
      }
    }
  }, SLOW)

  it('une relance de la prudente tient au moins à raiseMin, hors bluff voulu et hors relance forcée', () => {
    let raises = 0
    let forced = 0
    for (const name of PRUDENTS) {
      const who = traits(name)
      const style = menteurStyle(who)
      RESPONSES.forEach((s, i) => {
        const { id, view } = seat(s)
        const d = decide(view, id, who, `prudente-${i}`)
        if (d.action.type !== 'BID' || d.why.bluffing) return
        raises += 1
        if (!d.why.forced) {
          expect(d.why.pOwn!, `${name} état ${i}`).toBeGreaterThanOrEqual(style.raiseMin)
          return
        }
        // Forcée : l'enchère tenait trop pour crier, aucune relance n'était sûre.
        forced += 1
        expect(d.why.pCur!).toBeGreaterThanOrEqual(MENTEUR_FALLBACK_CALL)
        const reader = menteurReader(view, id, style.read)
        for (const o of menteurRaiseOptions(view)) expect(reader.odds(o.qty, o.face)).toBeLessThan(style.raiseMin)
      })
    }
    expect(raises).toBeGreaterThan(1_000)
    expect(forced).toBeGreaterThan(0)
  }, SLOW)

  it('relances que le bot défierait lui-même : 10 % au plus, hors bluff voulu (31 % pour l’ancien bot)', () => {
    let raises = 0
    let selfCallable = 0
    for (const persona of BOT_PERSONAS) {
      const who = traits(persona.name)
      RESPONSES.forEach((s, i) => {
        if (i % 4 !== BOT_PERSONAS.indexOf(persona) % 4) return
        const { id, view } = seat(s)
        const d = decide(view, id, who, `auto-${persona.name}-${i}`)
        if (d.action.type !== 'BID' || d.why.bluffing) return
        raises += 1
        if (d.why.pOwn! < menteurStyle(who).callAt) selfCallable += 1
      })
    }
    expect(raises).toBeGreaterThan(2_000)
    expect(selfCallable / raises).toBeLessThanOrEqual(0.1)
  }, SLOW)
})

describe('lecture : les bots lisent les enchères et les bluffs démasqués', () => {
  /**
   * Vues où l'enchère en cours vient d'un autre joueur X, à 3 joueurs au
   * moins (un tiers Y défie X dans les révélations fabriquées : aucune
   * rancune du bot n'entre en jeu).
   */
  const CASES = RESPONSES.filter((s) => s.players.filter((p) => p.dice.length > 0).length >= 3).map((s) => {
    const { id, view } = seat(s)
    const x = s.currentBid!.by
    const y = s.players.find((p) => p.dice.length > 0 && p.id !== id && p.id !== x)!.id
    return { id, view, x, y }
  })

  /** Trois révélations passées où X a enchéri sur la face défiée — bluff ou non. */
  const withReveals = (view: MenteurClientView, x: string, y: string, bluff: boolean | null): MenteurClientView => ({
    ...view,
    duels:
      bluff === null
        ? []
        : [1, 2, 3].map((round) => ({
            round,
            bidderId: x,
            challengerId: y,
            mode: 'dudo' as const,
            held: !bluff,
            loserId: bluff ? x : y,
            bids: [{ by: x, qty: 3, face: 4, bluff }],
          })),
  })

  function callRate(who: BotTraits, bluff: boolean | null) {
    let calls = 0
    CASES.forEach(({ id, view, x, y }, i) => {
      if (decide(withReveals(view, x, y, bluff), id, who, `lecture-${i}`).action.type === 'DUDO') calls += 1
    })
    return calls / CASES.length
  }

  it('qui bluffe toujours est plus défié après 3 révélations qu’avant ; à main égale, l’honnête l’est moins', () => {
    expect(CASES.length).toBeGreaterThan(1_000)
    for (const name of ['Bernadette', 'Suzette', 'Raoul']) {
      const who = traits(name)
      const before = callRate(who, null)
      const bluffer = callRate(who, true)
      const honest = callRate(who, false)
      expect(bluffer, name).toBeGreaterThan(before)
      expect(honest, name).toBeLessThan(bluffer)
      expect(honest, name).toBeLessThan(before)
    }
  }, SLOW)
})

describe('rancune : on défie plus volontiers qui nous a fait boire', () => {
  it('rancune ≥ 0,6 : au moins 5 points de défi en plus contre qui l’a fait boire', () => {
    let pairs = 0
    let plain = 0
    let spited = 0
    for (const name of SPITEFUL) {
      const who = traits(name)
      RESPONSES.forEach((s, i) => {
        const { id, view } = seat(s)
        const by = s.currentBid!.by
        if (menteurDrankFrom(view.duels ?? [], id).has(by)) return
        const grudge: MenteurClientView = {
          ...view,
          duels: [
            ...(view.duels ?? []),
            { round: 0, bidderId: id, challengerId: by, mode: 'dudo', held: false, loserId: id, bids: [] },
          ],
        }
        pairs += 1
        if (decide(view, id, who, `rancune-${i}`).action.type === 'DUDO') plain += 1
        if (decide(grudge, id, who, `rancune-${i}`).action.type === 'DUDO') spited += 1
      })
    }
    expect(SPITEFUL.length).toBeGreaterThanOrEqual(5)
    expect(pairs).toBeGreaterThan(2_000)
    expect((spited - plain) / pairs).toBeGreaterThanOrEqual(0.05)
  }, SLOW)

  it('Lucien (rancune 0) ne change rien', () => {
    const who = traits('Lucien')
    RESPONSES.slice(0, 300).forEach((s, i) => {
      const { id, view } = seat(s)
      const grudge: MenteurClientView = {
        ...view,
        duels: [
          ...(view.duels ?? []),
          { round: 0, bidderId: id, challengerId: s.currentBid!.by, mode: 'dudo', held: false, loserId: id, bids: [] },
        ],
      }
      expect(decide(grudge, id, who, `lucien-${i}`)).toEqual(decide(view, id, who, `lucien-${i}`))
    })
  })
})
