import { afterEach, describe, expect, it, vi } from 'vitest'
import { phaseKey } from '@/lib/online/phase-clock'
import { createRng } from '@/lib/petit-buveur/rng'
import { BOT_PERSONAS, personaForBotName } from '@/lib/online/bot-personas'
import {
  createSFState,
  reduceSF,
  sfActive,
  toSFClientView,
  toSFSpectatorView,
  SF_COUNTDOWN_MS,
  SF_SPEECH_CAP,
  type SFSpeech,
  type SFState,
} from './engine'
import { sfRevealReactions, SF_REVEAL_REACTIONS_MAX, type SFReactionView } from './reveal-reactions'

/**
 * Réactions au couronnement de Sans Filtre : dérivées de la vue publique,
 * les mêmes sur chaque téléphone et la TV, deux au plus, d'un bot à persona,
 * dans son plafond, priorité à celles qui visent un humain — et chacune dit
 * vrai sur le couronnement.
 */

const T0 = 1_000_000
const BLACKS = ['Trou n°1 : ___.', 'Trou n°2 : ___.']
const WHITES = Array.from({ length: 200 }, (_, i) => `réponse ${i}`)

type Seat = { id: string; name: string; isBot?: boolean }
const human = (id: string, name = id): Seat => ({ id, name })
const bot = (id: string, name: string): Seat => ({ id, name, isBot: true })

/** Manche 1 : tout le monde abat (sauf `skip`), le juge couronne la carte de `winner`. */
function crowned(seats: Seat[], winner: string, { seed = 'seed', skip = [] as string[] } = {}): SFState {
  const raw = createSFState(seats, BLACKS, WHITES, seed, T0 - SF_COUNTDOWN_MS, 2)
  let s = reduceSF(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
  for (const p of sfActive(s)) {
    if (p.id === s.judgeId || skip.includes(p.id) || s.phase !== 'submit') continue
    s = reduceSF(s, { type: 'PLAY_CARD', playerId: p.id, card: p.hand[0], now: T0 })
  }
  if (s.phase === 'submit') s = reduceSF(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: s.phaseEndsAt! + 1 })
  const card = s.submissions.find((x) => x.playerId === winner)!.card
  return reduceSF(s, { type: 'JUDGE_PICK', playerId: s.judgeId!, card, now: T0 })
}

/** Le juge de la manche 1 : le premier humain à 2 humains et plus, le premier joueur en table solo. */
function judgeOf(seats: Seat[]): string {
  const raw = createSFState(seats, BLACKS, WHITES, 'juge', T0, 2)
  return reduceSF(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: raw.phaseEndsAt! }).judgeId!
}

const reactions = (s: SFState) => sfRevealReactions(toSFSpectatorView(s))
const said = (playerId: string, kind: SFSpeech['kind'], targetId: string): SFSpeech => ({ playerId, kind, targetId, round: 0 })

afterEach(() => vi.restoreAllMocks())

describe('sfRevealReactions', () => {
  it('même vue, joueur ou TV ⇒ mêmes bulles ; sans Math.random ni Date.now', () => {
    const random = vi.spyOn(Math, 'random')
    const clock = vi.spyOn(Date, 'now')
    const rng = createRng('vues-sf')
    let spoken = 0
    for (let n = 0; n < 120; n += 1) {
      const humans = n % 2 ? [human('h', 'Riqui')] : [human('h', 'Riqui'), human('l', 'Léa')]
      const seats = rng.shuffle([...humans, ...rng.shuffle(BOT_PERSONAS).slice(0, 3).map((p, i) => bot(`b${i}`, p.name))])
      const judge = judgeOf(seats)
      const winner = rng.pick(seats.filter((p) => p.id !== judge)).id
      const s = crowned(seats, winner, { seed: `vues-${n}` })
      const tv = reactions(s)
      for (const p of s.players) expect(sfRevealReactions(toSFClientView(s, p.id)), `${n}/${p.id}`).toEqual(tv)
      spoken += tv.length
    }
    expect(spoken).toBeGreaterThan(60)
    expect(random).not.toHaveBeenCalled()
    expect(clock).not.toHaveBeenCalled()
  })

  it('rien hors couronnement, ni sans humain encore à table', () => {
    const s = crowned([human('h', 'Riqui'), human('l', 'Léa'), bot('g', 'Gépéto'), bot('m', 'Marcel')], 'l')
    expect(reactions(s).length).toBeGreaterThan(0)
    const view = toSFSpectatorView(s)
    expect(sfRevealReactions({ ...view, phase: 'judging' })).toEqual([])
    expect(sfRevealReactions({ ...view, crowned: null })).toEqual([])
    let gone = s
    for (const id of ['h', 'l']) gone = reduceSF(gone, { type: 'LEAVE', playerId: id, at: T0 })
    expect(reactions(gone)).toEqual([])
  })

  it('juge humain, humain couronné : le farceur râle d’abord contre le juge, le suiveur félicite d’abord', () => {
    // Riqui juge, Léa est couronnée ; Gépéto (farceur) et Mauricette (suiveuse) ont 3 de bavardage.
    const s = crowned([human('h', 'Riqui'), human('l', 'Léa'), bot('g', 'Gépéto'), bot('m', 'Mauricette')], 'l')
    expect(s.judgeId).toBe('h')
    const out = reactions(s)
    expect(out).toHaveLength(2)
    expect(out).toContainEqual(said('g', 'robbed', 'h'))
    expect(out).toContainEqual(said('m', 'bravo', 'l'))
  })

  it('un bot couronné remercie le juge humain ; couronné par un juge bot, il nargue un humain de la manche', () => {
    const thanks = crowned([human('h', 'Riqui'), human('l', 'Léa'), bot('g', 'Gépéto'), bot('m', 'Marcel')], 'g')
    expect(reactions(thanks)).toContainEqual(said('g', 'thanks', 'h'))
    // Table solo : Josiane juge (premier joueur), couronne Gépéto ; Riqui a joué.
    const solo = crowned([bot('j', 'Josiane'), human('h', 'Riqui'), bot('g', 'Gépéto'), bot('k', 'Kéké')], 'g')
    expect(solo.judgeId).toBe('j')
    const out = reactions(solo)
    expect(out).toContainEqual(said('g', 'won', 'h'))
    // Le juge bot salue l'auteur couronné, un bot : il passe après la réaction qui vise Riqui.
    expect(out.map((sp) => sp.kind)).toEqual(['won', 'crown'])
  })

  it('le juge bot salue l’humain qu’il a couronné', () => {
    // Gépéto et Kéké n'ont rien abattu : seul le juge a de quoi réagir.
    const solo = crowned([bot('j', 'Josiane'), human('h', 'Riqui'), bot('g', 'Gépéto'), bot('k', 'Kéké')], 'h', {
      skip: ['g', 'k'],
    })
    expect(reactions(solo)).toEqual([said('j', 'crown', 'h')])
  })

  it('un bot au bout de son plafond se tait ; un converti ne réagit jamais', () => {
    const s = crowned([human('h', 'Riqui'), human('l', 'Léa'), bot('g', 'Gépéto'), bot('m', 'Mauricette')], 'l')
    const view = toSFSpectatorView(s)
    expect(SF_SPEECH_CAP).toBe(2)
    const full: SFReactionView = { ...view, speech: [said('g', 'pitch', 'h'), said('g', 'bribe', 'h')] }
    expect(sfRevealReactions(full)).toEqual([said('m', 'bravo', 'l')])
    const converted: SFReactionView = { ...view, players: view.players.map((p) => (p.id === 'g' ? { ...p, name: 'Riqui2' } : p)) }
    expect(sfRevealReactions(converted)).toEqual([said('m', 'bravo', 'l')])
  })

  it('chaque réaction dit vrai sur le couronnement, deux au plus, un bot ne parle qu’une fois', () => {
    const rng = createRng('vrai-sf')
    let checked = 0
    for (let n = 0; n < 300; n += 1) {
      const humans = rng.chance(0.5) ? [human('h', 'Riqui')] : [human('h', 'Riqui'), human('l', 'Léa')]
      const seats = rng.shuffle([...humans, ...rng.shuffle(BOT_PERSONAS).slice(0, 3 + rng.int(0, 3)).map((p, i) => bot(`b${i}`, p.name))])
      const judge = judgeOf(seats)
      const others = seats.filter((p) => p.id !== judge)
      const skip = others.filter(() => rng.chance(0.2)).map((p) => p.id)
      const players = others.filter((p) => !skip.includes(p.id))
      if (players.length === 0) continue
      const s = crowned(seats, rng.pick(players).id, { seed: `vrai-${n}`, skip })
      const out = reactions(s)
      expect(out.length).toBeLessThanOrEqual(SF_REVEAL_REACTIONS_MAX)
      expect(new Set(out.map((sp) => sp.playerId)).size).toBe(out.length)
      const crownedId = s.crowned!.playerId
      const played = (id: string) => s.submissions.some((x) => x.playerId === id)
      for (const sp of out) {
        const author = s.players.find((p) => p.id === sp.playerId)!
        const target = s.players.find((p) => p.id === sp.targetId)!
        expect(author.isBot && personaForBotName(author.name)).toBeTruthy()
        expect(target.id).not.toBe(author.id)
        if (sp.kind === 'crown') {
          expect(author.id).toBe(s.judgeId)
          expect(target.id).toBe(crownedId)
        }
        if (sp.kind === 'thanks') {
          expect(author.id).toBe(crownedId)
          expect(target.id).toBe(s.judgeId)
          expect(target.isBot).toBe(false)
        }
        if (sp.kind === 'won') {
          expect(author.id).toBe(crownedId)
          expect(s.players.find((p) => p.id === s.judgeId)?.isBot).toBe(true)
          expect(target.isBot || !played(target.id)).toBe(false)
        }
        if (sp.kind === 'bravo' || sp.kind === 'robbed') {
          expect(played(author.id)).toBe(true)
          expect(author.id).not.toBe(crownedId)
          expect(target.isBot).toBe(false)
          expect(target.id).toBe(sp.kind === 'bravo' ? crownedId : s.judgeId)
        }
        checked += 1
      }
    }
    expect(checked).toBeGreaterThan(150)
  })
})
