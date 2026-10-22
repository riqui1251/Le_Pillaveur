import { afterEach, describe, expect, it, vi } from 'vitest'
import { phaseKey } from '@/lib/online/phase-clock'
import { createRng } from '@/lib/petit-buveur/rng'
import { BOT_PERSONAS, personaForBotName } from '@/lib/online/bot-personas'
import {
  bluffActive,
  createBluffState,
  reduceBluff,
  toBluffClientView,
  toBluffSpectatorView,
  BLUFF_COUNTDOWN_MS,
  BLUFF_SPEECH_CAP,
  type BluffPrompt,
  type BluffSpeech,
  type BluffState,
} from './engine'
import { bluffRevealReactions, BLUFF_REVEAL_REACTIONS_MAX, type BluffReactionView } from './reveal-reactions'

/**
 * Réactions à la révélation du Grand Bluff : dérivées de la vue publique, les
 * mêmes sur chaque téléphone et la TV, deux au plus, d'un bot à persona, dans
 * son plafond, priorité à celles qui visent un humain — et chacune dit vrai
 * sur ce que la révélation vient de montrer.
 */

const PROMPTS: BluffPrompt[] = [
  { id: 'q1', q: 'Capitale du Japon ?', answer: 'Tokyo', decoys: ['Osaka', 'Kyoto', 'Nagoya', 'Kobe'] },
  { id: 'q2', q: 'Capitale de l’Italie ?', answer: 'Rome', decoys: ['Milan', 'Turin', 'Naples', 'Gênes'] },
]
const T0 = 1_000_000

type Seat = { id: string; name: string; isBot?: boolean }
const human = (id: string, name = id): Seat => ({ id, name })
const bot = (id: string, name: string): Seat => ({ id, name, isBot: true })

/** Tout le monde bluffe, puis chacun vote selon `votes` : id de l'auteur visé, ou 'real'. */
function revealOf(seats: Seat[], votes: Record<string, string>, seed = 'seed'): BluffState {
  const raw = createBluffState(seats, PROMPTS, seed, T0 - BLUFF_COUNTDOWN_MS, 2)
  let s = reduceBluff(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
  for (const p of bluffActive(s)) s = reduceBluff(s, { type: 'SUBMIT_FAKE', playerId: p.id, text: `bluff de ${p.id}`, now: T0 })
  for (const [voter, aim] of Object.entries(votes)) {
    const c = s.candidates.find((x) => (aim === 'real' ? x.isReal : x.authorId === aim))!
    s = reduceBluff(s, { type: 'VOTE', playerId: voter, candidateId: c.candidateId, now: T0 })
  }
  if (s.phase !== 'reveal') s = reduceBluff(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: s.phaseEndsAt! + 1 })
  return s
}

const reactions = (s: BluffState) => bluffRevealReactions(toBluffSpectatorView(s))
const said = (playerId: string, kind: BluffSpeech['kind'], targetId: string): BluffSpeech => ({
  playerId,
  kind,
  targetId,
  round: 0,
})

// Gépéto, Marcel et Josiane ont 3 de bavardage : leur tirage (3 × 1/3) réussit toujours.
const TALKERS = [human('h', 'Riqui'), bot('g', 'Gépéto'), bot('m', 'Marcel'), bot('j', 'Josiane')]
/**
 * Gépéto vote le bluff de Marcel (fooled → un bot), Marcel et Josiane celui de
 * Riqui (fooled → un humain), Riqui trouve la vraie. Le bluff de Riqui, deux
 * piégés, est le meilleur de la manche : Gépéto peut le saluer (bravo).
 */
const MIXED = { g: 'm', m: 'h', j: 'h', h: 'real' }

afterEach(() => vi.restoreAllMocks())

describe('bluffRevealReactions', () => {
  it('même vue, joueur ou TV ⇒ mêmes bulles ; sans Math.random ni Date.now', () => {
    const random = vi.spyOn(Math, 'random')
    const clock = vi.spyOn(Date, 'now')
    const rng = createRng('vues')
    let spoken = 0
    for (let n = 0; n < 120; n += 1) {
      const seats = [human('h', 'Riqui'), human('l', 'Léa'), ...rng.shuffle(BOT_PERSONAS).slice(0, 3).map((p, i) => bot(`b${i}`, p.name))]
      const ids = seats.map((p) => p.id)
      const votes = Object.fromEntries(ids.map((id) => [id, rng.chance(0.3) ? 'real' : rng.pick(ids.filter((x) => x !== id))]))
      const s = revealOf(seats, votes, `vues-${n}`)
      const tv = reactions(s)
      for (const p of s.players) expect(bluffRevealReactions(toBluffClientView(s, p.id)), `${n}/${p.id}`).toEqual(tv)
      spoken += tv.length
    }
    expect(spoken).toBeGreaterThan(60)
    expect(random).not.toHaveBeenCalled()
    expect(clock).not.toHaveBeenCalled()
  })

  it('rien avant la révélation, rien sans humain encore à table', () => {
    const s = revealOf(TALKERS, MIXED)
    expect(reactions(s).length).toBeGreaterThan(0)
    const view = toBluffSpectatorView(s)
    expect(bluffRevealReactions({ ...view, phase: 'vote' })).toEqual([])
    expect(bluffRevealReactions({ ...view, lastReveal: null })).toEqual([])
    const gone = reduceBluff(s, { type: 'LEAVE', playerId: 'h', at: T0 })
    expect(reactions(gone)).toEqual([])
  })

  it('priorité aux réactions qui visent un humain, deux au plus, dans l’ordre de la table', () => {
    expect(BLUFF_REVEAL_REACTIONS_MAX).toBe(2)
    // Gépéto salue Riqui plutôt que de répondre à Marcel ; Marcel répond à
    // Riqui, pas à Gépéto qu'il a piégé ; Josiane arrive après le plafond.
    expect(reactions(revealOf(TALKERS, MIXED))).toEqual([said('g', 'bravo', 'h'), said('m', 'fooled', 'h')])
  })

  it('un bot dont la manche a épuisé le plafond se tait ; un converti ne réagit jamais', () => {
    const s = revealOf(TALKERS, MIXED)
    const view = toBluffSpectatorView(s)
    const full: BluffReactionView = { ...view, speech: [said('m', 'proud', 'h'), said('m', 'sure', 'h')] }
    expect(BLUFF_SPEECH_CAP).toBe(2)
    expect(bluffRevealReactions(full)).toEqual([said('g', 'bravo', 'h'), said('j', 'fooled', 'h')])
    // Une parole de la manche précédente ne compte pas.
    const past: BluffReactionView = { ...view, speech: full.speech!.map((sp) => ({ ...sp, round: -1 })) }
    expect(bluffRevealReactions(past)).toEqual(reactions(s))
    const converted: BluffReactionView = {
      ...view,
      players: view.players.map((p) => (p.id === 'm' ? { ...p, name: 'Riqui2' } : p)),
    }
    expect(bluffRevealReactions(converted).map((sp) => sp.playerId)).toEqual(['g', 'j'])
  })

  it('chaque réaction dit vrai sur la révélation, vise un autre joueur encore là, un bot ne parle qu’une fois', () => {
    const rng = createRng('vrai')
    let checked = 0
    for (let n = 0; n < 300; n += 1) {
      const seats = [
        human('h', 'Riqui'),
        ...(rng.chance(0.5) ? [human('l', 'Léa')] : []),
        ...rng.shuffle(BOT_PERSONAS).slice(0, 2 + rng.int(0, 4)).map((p, i) => bot(`b${i}`, p.name)),
      ]
      const ids = seats.map((p) => p.id)
      const votes = Object.fromEntries(
        ids.filter(() => rng.chance(0.9)).map((id) => [id, rng.chance(0.3) ? 'real' : rng.pick(ids.filter((x) => x !== id))])
      )
      const s = revealOf(seats, votes, `vrai-${n}`)
      const lr = s.lastReveal!
      const votedBy = (id: string) => lr.candidates.find((c) => c.votes.includes(id))
      const fakeOf = (id: string) => lr.candidates.find((c) => c.authorId === id)
      const out = reactions(s)
      expect(out.length).toBeLessThanOrEqual(BLUFF_REVEAL_REACTIONS_MAX)
      expect(new Set(out.map((sp) => sp.playerId)).size).toBe(out.length)
      for (const sp of out) {
        const author = s.players.find((p) => p.id === sp.playerId)!
        const target = s.players.find((p) => p.id === sp.targetId)!
        expect(author.isBot && personaForBotName(author.name)).toBeTruthy()
        expect(target.id).not.toBe(author.id)
        expect(sp.round).toBe(s.promptIdx)
        if (sp.kind === 'gotYou') expect(fakeOf(author.id)?.votes).toContain(target.id)
        if (sp.kind === 'fooled') expect(votedBy(author.id)?.authorId).toBe(target.id)
        if (sp.kind === 'found') {
          expect(votedBy(author.id)?.isReal).toBe(true)
          expect(target.isBot).toBe(false)
          expect(votedBy(target.id)?.isReal).toBe(false)
        }
        if (sp.kind === 'bravo') {
          const star = fakeOf(target.id)!
          expect(target.isBot).toBe(false)
          expect(star.votes.length).toBeGreaterThanOrEqual(2)
          expect(lr.candidates.filter((c) => !c.isReal && c.votes.length >= star.votes.length)).toHaveLength(1)
          expect(star.votes).not.toContain(author.id)
        }
        checked += 1
      }
    }
    expect(checked).toBeGreaterThan(150)
  })

  it('la chance de réagir suit le bavardage : Bernadette (1) une fois sur trois environ', () => {
    // Bernadette a voté le bluff de Riqui : seule réaction possible, fooled.
    const s = revealOf([human('h', 'Riqui'), bot('b', 'Bernadette'), human('l', 'Léa')], { b: 'h', h: 'real', l: 'real' })
    const view = toBluffSpectatorView(s)
    let spoke = 0
    for (let n = 0; n < 600; n += 1) {
      const out = bluffRevealReactions({ ...view, lastReveal: { ...view.lastReveal!, prompt: `Question ${n}` } })
      spoke += out.length
    }
    expect(spoke / 600).toBeGreaterThan(0.25)
    expect(spoke / 600).toBeLessThan(0.42)
  })
})
