import { afterEach, describe, expect, it, vi } from 'vitest'
import { phaseKey } from '@/lib/online/phase-clock'
import { createRng } from '@/lib/petit-buveur/rng'
import { BOT_PERSONAS, personaForBotName } from '@/lib/online/bot-personas'
import {
  createDilState,
  reduceDil,
  toDilClientView,
  toDilSpectatorView,
  DIL_COUNTDOWN_MS,
  type DilCard,
  type DilSpeech,
  type DilState,
} from './engine'
import { dilMinorityChoice, dilWhoTally } from './reveal'
import { dilRevealReactions, DIL_REVEAL_REACTIONS_MAX, type DilReactionView } from './reveal-reactions'

/**
 * Réactions à la révélation de Dilemmes : dérivées de la vue publique, les
 * mêmes sur chaque téléphone et la TV, une seule, d'un bot à persona, dans
 * son plafond, vers un humain encore à table — et chacune dit vrai sur les
 * votes qui viennent de tomber.
 */

const T0 = 1_000_000
const PREFER: DilCard = { kind: 'prefer', a: 'option A', b: 'option B' }
const NEVER: DilCard = { kind: 'never', text: 'dormi au travail' }
const WHO: DilCard = { kind: 'who', text: 'finirait en garde à vue en premier ?' }

type Seat = { id: string; name: string; isBot?: boolean }
const human = (id: string, name = id): Seat => ({ id, name })
const bot = (id: string, name: string): Seat => ({ id, name, isBot: true })

/** Révélation de `card` après les votes donnés (`A`, `B` ou l'id visé). */
function revealOf(seats: Seat[], card: DilCard, votes: Record<string, string>, seed = 'seed'): DilState {
  const raw = { ...createDilState(seats, [card], seed, T0 - DIL_COUNTDOWN_MS, 1), cards: [card] }
  let s = reduceDil(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
  for (const [playerId, choice] of Object.entries(votes)) s = reduceDil(s, { type: 'VOTE', playerId, choice, now: T0 })
  if (s.phase === 'vote') s = reduceDil(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: s.phaseEndsAt! + 1 })
  return s
}

const reactions = (s: DilState) => dilRevealReactions(toDilSpectatorView(s))
const said = (playerId: string, kind: DilSpeech['kind'], targetId: string): DilSpeech => ({ playerId, kind, targetId, round: 0 })

// Gépéto (farceur), Mauricette (suiveuse) et Kéké (agressif) ont 3 de bavardage : leur tirage réussit toujours.
afterEach(() => vi.restoreAllMocks())

describe('dilRevealReactions', () => {
  it('même vue, joueur ou TV ⇒ même bulle ; sans Math.random ni Date.now', () => {
    const random = vi.spyOn(Math, 'random')
    const clock = vi.spyOn(Date, 'now')
    const rng = createRng('vues-dil')
    let spoken = 0
    for (let n = 0; n < 150; n += 1) {
      const seats = rng.shuffle([human('h', 'Riqui'), human('l', 'Léa'), ...rng.shuffle(BOT_PERSONAS).slice(0, 3).map((p, i) => bot(`b${i}`, p.name))])
      const card = [PREFER, NEVER, WHO][n % 3]
      const ids = seats.map((p) => p.id)
      const votes = Object.fromEntries(ids.map((id) => [id, card.kind === 'who' ? rng.pick(ids.filter((x) => x !== id)) : rng.pick(['A', 'B'])]))
      const s = revealOf(seats, card, votes, `vues-${n}`)
      const tv = reactions(s)
      for (const p of s.players) expect(dilRevealReactions(toDilClientView(s, p.id)), `${n}/${p.id}`).toEqual(tv)
      spoken += tv.length
    }
    expect(spoken).toBeGreaterThan(80)
    expect(random).not.toHaveBeenCalled()
    expect(clock).not.toHaveBeenCalled()
  })

  it('rien hors révélation, rien sans humain encore à table', () => {
    const s = revealOf([human('h', 'Riqui'), bot('k', 'Kéké'), bot('g', 'Gépéto')], PREFER, { h: 'A', k: 'B', g: 'B' })
    expect(reactions(s)).toHaveLength(1)
    const view = toDilSpectatorView(s)
    expect(dilRevealReactions({ ...view, phase: 'vote' })).toEqual([])
    expect(dilRevealReactions({ ...view, lastReveal: null })).toEqual([])
    expect(reactions(reduceDil(s, { type: 'LEAVE', playerId: 'h', at: T0 }))).toEqual([])
  })

  it('« Tu préfères » : l’agressif dans la majorité taquine l’humain minoritaire, le suiveur cherche d’abord son jumeau', () => {
    // Riqui seul en A : Kéké (B, majorité) le taquine plutôt que de saluer Léa.
    // Germaine n'a pas voté : rien à dire.
    const tease = revealOf([human('h', 'Riqui'), human('l', 'Léa'), bot('k', 'Kéké'), bot('x', 'Germaine')], PREFER, {
      h: 'A',
      l: 'B',
      k: 'B',
    })
    expect(reactions(tease)).toEqual([said('k', 'teaseMinority', 'h')])
    // Mauricette (suiveuse) a voté comme Léa : twin passe avant la taquinerie.
    const twin = revealOf([human('h', 'Riqui'), human('l', 'Léa'), bot('m', 'Mauricette'), bot('x', 'Huguette')], PREFER, {
      h: 'A',
      l: 'B',
      m: 'B',
    })
    expect(reactions(twin)).toEqual([said('m', 'twin', 'l')])
  })

  it('« Je n’ai jamais » : le bot qui ne l’a jamais fait réclame les détails à l’humain qui l’a fait', () => {
    const s = revealOf([human('h', 'Riqui'), bot('g', 'Gépéto'), human('l', 'Léa')], NEVER, { h: 'A', g: 'B', l: 'B' })
    expect(reactions(s)).toEqual([said('g', 'spill', 'h')])
  })

  it('« Qui de la table » : le bot le plus désigné répond à qui l’a désigné ; sinon on rit de l’humain désigné', () => {
    const botTop = revealOf([human('h', 'Riqui'), human('l', 'Léa'), bot('g', 'Gépéto')], WHO, { h: 'g', l: 'g', g: 'h' })
    expect(reactions(botTop)).toEqual([said('g', 'designated', 'h')])
    const humanTop = revealOf([human('h', 'Riqui'), human('l', 'Léa'), bot('g', 'Gépéto')], WHO, { h: 'l', l: 'g', g: 'l' })
    expect(reactions(humanTop)).toEqual([said('g', 'called', 'l')])
  })

  it('un bot au bout de son plafond se tait ; un converti ne réagit jamais', () => {
    const s = revealOf([human('h', 'Riqui'), bot('g', 'Gépéto'), human('l', 'Léa')], NEVER, { h: 'A', g: 'B', l: 'B' })
    const view = toDilSpectatorView(s)
    const full: DilReactionView = { ...view, speech: [said('g', 'easy', 'h'), said('g', 'tough', 'l')] }
    expect(dilRevealReactions(full)).toEqual([])
    const converted: DilReactionView = { ...view, players: view.players.map((p) => (p.id === 'g' ? { ...p, name: 'Riqui2' } : p)) }
    expect(dilRevealReactions(converted)).toEqual([])
  })

  it('chaque réaction dit vrai sur les votes, vise un humain encore là, une au plus', () => {
    const rng = createRng('vrai-dil')
    let checked = 0
    for (let n = 0; n < 400; n += 1) {
      const humans = rng.chance(0.5) ? [human('h', 'Riqui')] : [human('h', 'Riqui'), human('l', 'Léa')]
      const seats = rng.shuffle([...humans, ...rng.shuffle(BOT_PERSONAS).slice(0, 2 + rng.int(0, 3)).map((p, i) => bot(`b${i}`, p.name))])
      const card = rng.pick([PREFER, NEVER, WHO])
      const ids = seats.map((p) => p.id)
      const votes = Object.fromEntries(
        ids
          .filter(() => rng.chance(0.9))
          .map((id) => [id, card.kind === 'who' ? rng.pick(ids.filter((x) => x !== id)) : rng.pick(['A', 'B'])])
      )
      const s = revealOf(seats, card, votes, `vrai-${n}`)
      const out = reactions(s)
      expect(out.length).toBeLessThanOrEqual(DIL_REVEAL_REACTIONS_MAX)
      const entries = s.lastReveal ?? []
      const choice = (id: string) => entries.find((r) => r.voterId === id)?.choice
      const minority = dilMinorityChoice(entries)
      for (const sp of out) {
        const author = s.players.find((p) => p.id === sp.playerId)!
        const target = s.players.find((p) => p.id === sp.targetId)!
        expect(author.isBot && personaForBotName(author.name)).toBeTruthy()
        expect(target.isBot).toBe(false)
        expect(target.leftAt).toBeNull()
        if (sp.kind === 'twin') expect(choice(target.id)).toBe(choice(author.id))
        if (sp.kind === 'spill') expect([choice(author.id), choice(target.id), card.kind]).toEqual(['B', 'A', 'never'])
        if (sp.kind === 'outvoted') {
          expect(choice(author.id)).toBe(minority)
          expect(choice(target.id)).not.toBe(minority)
        }
        if (sp.kind === 'teaseMinority') {
          expect(choice(target.id)).toBe(minority)
          expect(choice(author.id)).not.toBe(minority)
        }
        if (sp.kind === 'designated' || sp.kind === 'called') {
          const tally = dilWhoTally(s.players, entries)
          if (sp.kind === 'designated') {
            expect(tally.topIds).toContain(author.id)
            expect(choice(target.id)).toBe(author.id)
          } else {
            expect(tally.topIds).toContain(target.id)
          }
        }
        checked += 1
      }
    }
    expect(checked).toBeGreaterThan(150)
  })
})
