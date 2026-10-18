import { readFileSync } from 'node:fs'
import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  countMatches,
  reduceMenteur,
  toMenteurClientView,
  toMenteurSpectatorView,
  MENTEUR_START_DICE,
  type MenteurPlayer,
  type MenteurSay,
  type MenteurSpeech,
  type MenteurState,
} from './engine'
import { menteurRevealReactions } from './reveal-reactions'

/**
 * Réactions à la révélation : dérivées de la vue publique, les mêmes sur
 * chaque téléphone et la TV, une au plus, d'un bot à persona seulement, avec
 * la priorité à la réaction qui vise un humain, le bavardage et le plafond
 * de la manche, et rien après un Calza.
 */

const T0 = 1_000_000

const seat = (id: string, name: string, isBot = true, extra: Partial<MenteurPlayer> = {}): MenteurPlayer => ({
  id,
  name,
  isBot,
  leftAt: null,
  // Un 4 chacun, aucun 1 : le compte des 4 vaut le nombre de joueurs.
  dice: [2, 3, 4, 5, 6],
  lostCount: 0,
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
  ruleCalza: true,
  revealAt: null,
  palifico: false,
  bids: [],
  duels: [],
  speech: [],
  ...over,
})

type DuelOptions = {
  /** L'enchère défiée tenait (sinon il manquait un dé). */
  held?: boolean
  round?: number
  /** Le fil de la manche avant le défi. */
  speech?: MenteurSpeech[]
  /** La parole jointe au « Menteur ! ». */
  say?: MenteurSay
  calza?: boolean
}

/** `bidderId` a enchéri sur les 4, `challengerId` (au tour) crie « Menteur ! » — ou Calza. */
function revealOf(
  players: MenteurPlayer[],
  bidderId: string,
  challengerId: string,
  { held = true, round = 1, speech = [], say, calza = false }: DuelOptions = {}
): MenteurState {
  const fours = countMatches(players, 4)
  const bid = { qty: held ? fours : fours + 1, face: 4, by: bidderId }
  const state = craft(players, {
    round,
    currentBid: bid,
    bids: [bid],
    speech,
    turnIdx: players.findIndex((p) => p.id === challengerId),
  })
  return reduceMenteur(
    state,
    calza ? { type: 'CALZA', playerId: challengerId, now: T0 } : { type: 'DUDO', playerId: challengerId, now: T0, say }
  )
}

const said = (playerId: string, kind: MenteurSpeech['kind'], targetId: string, round = 1): MenteurSpeech => ({
  playerId,
  kind,
  targetId,
  round,
})

/** Ce que voit la TV ; les mêmes réactions doivent sortir de chaque vue de joueur. */
const reactions = (state: MenteurState) => menteurRevealReactions(toMenteurSpectatorView(state))

const ROUNDS = Array.from({ length: 300 }, (_, i) => i + 1)

afterEach(() => vi.restoreAllMocks())

describe('menteurRevealReactions', () => {
  it('même vue, joueur ou TV ⇒ même bulle ; sans Math.random ni Date.now, sans lire un seul dé de la vue', () => {
    const random = vi.spyOn(Math, 'random')
    const clock = vi.spyOn(Date, 'now')
    const players = [seat('h', 'Riqui', false), seat('b1', 'Raoul'), seat('b2', 'Suzette'), seat('b3', 'Gépéto')]
    let spoken = 0
    for (const round of ROUNDS) {
      for (const [bidder, challenger] of [['b1', 'h'], ['h', 'b2'], ['b3', 'b1'], ['b2', 'b3']]) {
        const state = revealOf(players, bidder, challenger, { held: round % 2 === 0, round })
        const tv = reactions(state)
        for (const p of state.players) {
          expect(menteurRevealReactions(toMenteurClientView(state, p.id)), `${round} ${p.id}`).toEqual(tv)
          // Les dés que la vue montre à son spectateur ne comptent pour rien.
          const view = toMenteurClientView(state, p.id)
          const scrambled = { ...view, players: view.players.map((q) => ({ ...q, dice: q.dice.map((d) => (d % 6) + 1) })) }
          expect(menteurRevealReactions(scrambled)).toEqual(tv)
        }
        spoken += tv.length
      }
    }
    expect(spoken).toBeGreaterThan(300)
    expect(random).not.toHaveBeenCalled()
    expect(clock).not.toHaveBeenCalled()
  })

  it('les 4 réactions : challenger gotcha / wrongCall vers l’enchérisseur, enchérisseur caught / held vers le challenger', () => {
    // Kéké et Gépéto ont un bavardage de 3 : ils parlent à coup sûr.
    const players = [seat('h', 'Riqui', false), seat('k', 'Kéké'), seat('g', 'Gépéto')]
    expect(reactions(revealOf(players, 'h', 'k', { held: false }))).toEqual([said('k', 'gotcha', 'h')])
    expect(reactions(revealOf(players, 'h', 'k', { held: true }))).toEqual([said('k', 'wrongCall', 'h')])
    expect(reactions(revealOf(players, 'g', 'h', { held: false }))).toEqual([said('g', 'caught', 'h')])
    expect(reactions(revealOf(players, 'g', 'h', { held: true }))).toEqual([said('g', 'held', 'h')])
  })

  it('au plus une réaction, jamais d’un humain ni d’un converti', () => {
    // « Kevin » est un déserteur converti : bot, mais sans persona.
    const kevin = seat('c', 'Kevin', true)
    const tables: [MenteurPlayer[], string, string][] = [
      [[seat('h', 'Riqui', false), seat('k', 'Kéké')], 'h', 'k'],
      [[seat('h', 'Riqui', false), seat('k', 'Kéké')], 'k', 'h'],
      [[seat('h', 'Riqui', false), kevin], 'h', 'c'],
      [[seat('h', 'Riqui', false), kevin], 'c', 'h'],
      [[seat('h', 'Riqui', false), seat('h2', 'Léa', false)], 'h', 'h2'],
      [[kevin, seat('j', 'Josiane')], 'c', 'j'],
      [[kevin, seat('j', 'Josiane')], 'j', 'c'],
      [[seat('g', 'Gépéto'), seat('j', 'Josiane')], 'g', 'j'],
    ]
    const authors = new Set<string>()
    for (const [players, bidder, challenger] of tables) {
      for (const round of ROUNDS.slice(0, 60)) {
        const out = reactions(revealOf(players, bidder, challenger, { held: round % 3 === 0, round }))
        expect(out.length).toBeLessThanOrEqual(1)
        for (const r of out) authors.add(r.playerId)
      }
    }
    expect([...authors].sort()).toEqual(['j', 'k'])
  })

  it('priorité à l’humain visé : le challenger qui a déjà crié « Tu bluffes ! » à un humain réagit quand même', () => {
    const players = [seat('h', 'Riqui', false), seat('k', 'Kéké'), seat('g', 'Gépéto')]
    const state = revealOf(players, 'h', 'k', { held: false, say: { kind: 'suspect', targetId: 'h' } })
    expect(reactions(state)).toEqual([said('k', 'gotcha', 'h')])
    // Parti en pleine révélation, il reste un humain : la réaction le vise toujours.
    const left = revealOf([seat('h', 'Riqui', false, { leftAt: T0 }), seat('g', 'Gépéto')], 'g', 'h', { held: true })
    expect(reactions(left)).toEqual([said('g', 'held', 'h')])
  })

  it('entre deux bots, l’auteur resté muet au défi passe d’abord ; à égalité, le challenger', () => {
    // Gépéto et Josiane parlent à coup sûr (bavardage 3, plafond 2).
    const players = [seat('h', 'Riqui', false), seat('g', 'Gépéto'), seat('j', 'Josiane')]
    const loud = revealOf(players, 'g', 'j', { held: false, say: { kind: 'suspect', targetId: 'g' } })
    expect(reactions(loud)).toEqual([said('g', 'caught', 'j')])
    const again = revealOf(players, 'g', 'j', { held: true, say: { kind: 'again', targetId: 'g' } })
    expect(reactions(again)).toEqual([said('g', 'held', 'j')])
    // Une parole d'enchère n'est pas une parole au défi.
    const quiet = revealOf(players, 'g', 'j', { held: false, speech: [said('j', 'sure', 'h')] })
    expect(reactions(quiet)).toEqual([said('j', 'gotcha', 'g')])
  })

  it('Calza ⇒ aucune réaction, réussi ou raté', () => {
    const players = [seat('h', 'Riqui', false), seat('g', 'Gépéto'), seat('j', 'Josiane')]
    for (const round of ROUNDS.slice(0, 50)) {
      for (const held of [true, false]) {
        const state = revealOf(players, 'g', 'j', { held, round, calza: true })
        expect(state.lastReveal?.mode).toBe('calza')
        expect(reactions(state)).toEqual([])
      }
    }
  })

  it('rien hors de la révélation', () => {
    const players = [seat('h', 'Riqui', false), seat('k', 'Kéké')]
    const state = revealOf(players, 'h', 'k', { held: false })
    expect(reactions({ ...state, phase: 'bidding' })).toEqual([])
    expect(reactions({ ...state, phase: 'finished' })).toEqual([])
    expect(reactions({ ...state, lastReveal: null })).toEqual([])
  })

  it('bavardage : le tirage tombe sous bavardage/3 — toujours à 3, deux fois sur trois à 2, une fois sur trois à 1', () => {
    const rate = (name: string) => {
      let n = 0
      for (const round of ROUNDS) {
        n += reactions(revealOf([seat('h', 'Riqui', false), seat('b', name)], 'h', 'b', { round })).length
      }
      return n / ROUNDS.length
    }
    expect(rate('Kéké')).toBe(1)
    expect(rate('Raoul')).toBeGreaterThan(0.58)
    expect(rate('Raoul')).toBeLessThan(0.75)
    expect(rate('Bernadette')).toBeGreaterThan(0.26)
    expect(rate('Bernadette')).toBeLessThan(0.41)
  })

  it('plafond min(2, bavardage) de la manche : qui l’a atteint se tait, une manche passée ne compte pas', () => {
    const duel = (name: string, speech: MenteurSpeech[], round: number) =>
      reactions(revealOf([seat('h', 'Riqui', false), seat('b', name)], 'b', 'h', { round, speech }))
    for (const round of ROUNDS.slice(1, 80)) {
      // Kéké (bavardage 3) plafonne à 2, Bernadette (1) à 1.
      expect(duel('Kéké', [said('b', 'sure', 'h', round), said('b', 'unsure', 'h', round)], round)).toEqual([])
      expect(duel('Bernadette', [said('b', 'sure', 'h', round)], round)).toEqual([])
      expect(duel('Kéké', [said('b', 'sure', 'h', round)], round)).toHaveLength(1)
      expect(duel('Kéké', [said('b', 'sure', 'h', round - 1), said('b', 'unsure', 'h', round - 1)], round)).toHaveLength(1)
    }
    // Le converti n'a pas de persona : même avec du plafond, il se tait.
    expect(duel('Kevin', [], 1)).toEqual([])
  })

  it('les dés révélés ne changent pas qui parle : la graine est la manche et le challenger', () => {
    const base = [seat('h', 'Riqui', false), seat('r', 'Raoul')]
    const other = base.map((p) => ({ ...p, dice: p.dice.slice(0, MENTEUR_START_DICE - 2) }))
    for (const round of ROUNDS.slice(0, 100)) {
      const a = reactions(revealOf(base, 'h', 'r', { round, held: false }))
      const b = reactions(revealOf(other, 'h', 'r', { round, held: false }))
      expect(b).toEqual(a)
    }
  })

  it('une vue d’avant les paroles et l’échelle (ni speech, ni bids, ni duels, ni mode) réagit comme une neuve', () => {
    const state = revealOf([seat('h', 'Riqui', false), seat('k', 'Kéké')], 'h', 'k', { held: false })
    // Une partie commencée avant le déploiement n'a pas ces clés optionnelles dans son état.
    const legacy = JSON.parse(JSON.stringify(toMenteurSpectatorView(state)))
    delete legacy.speech
    delete legacy.bids
    delete legacy.duels
    delete legacy.lastReveal.mode
    expect(menteurRevealReactions(legacy)).toEqual([said('k', 'gotcha', 'h')])
  })

  it('un bot qui défie sa propre enchère (son répondant est parti) ne se répond pas à lui-même', () => {
    const state = revealOf([seat('g', 'Gépéto'), seat('h', 'Riqui', false, { leftAt: T0 })], 'g', 'g', { held: false })
    expect(state.lastReveal).toMatchObject({ challengerId: 'g', bid: { by: 'g' } })
    expect(reactions(state)).toEqual([])
  })

  it('garde d’import : le module, lu par les écrans, ne touche ni au cerveau ni à l’adaptateur serveur', () => {
    const source = readFileSync(new URL('./reveal-reactions.ts', import.meta.url), 'utf8')
    const imports = [...source.matchAll(/from\s+['"]([^'"]+)['"]/g)].map((m) => m[1]).sort()
    expect(imports).toEqual(['./engine', '@/lib/online/bot-personas', '@/lib/petit-buveur/rng'])
  })
})
