import { createHash } from 'node:crypto'
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { botDisplayName, pickBotPersonas } from '@/lib/online/bot-personas'
import { phaseKey } from '@/lib/online/phase-clock'
import { createRng } from '@/lib/petit-buveur/rng'
import {
  LG_SPEECH_CAP,
  LGEngineError,
  createLGState,
  lgAlive,
  reduceLG,
  type LGAction,
  type LGDebateSpeech,
  type LGState,
} from './engine'
import { applyLGBotAction } from './server-adapter'

/**
 * GOLDEN du débat du Loup-Garou : 200 parties (50 graines × tables de 4, 6, 8
 * et 12) jouées de bout en bout, figées dans __fixtures__/debate-golden.json.
 * Il garde l'extraction du socle de parole (src/lib/online/bot-speech.ts) à
 * comportement STRICTEMENT constant : la moindre parole, le moindre skip ou
 * vote qui change dans une seule partie fait échouer le test.
 *
 * Le harnais reprend celui de simulation.test.ts (rand `createRng('bots-…')`,
 * échéances simulées) en le rendant plus exigeant, sinon le golden ne verrait
 * qu'une partie du planificateur : des personas tirés au sort (traits,
 * bavardage, loyauté, rancune), 0 à 2 humains scriptés sur un dé à part (ils
 * accusent, se défendent, s'allient, passent au vote, votent) pour exercer
 * les réactions, l'interpellation et le skip groupé, et une horloge simulée
 * (un tick bot = 3 s) au lieu de Date.now(), sans quoi l'interpellation (> 20 s
 * restantes) ne serait jamais tentée.
 *
 * Régénérer (après un changement de comportement VOULU, jamais pour faire
 * passer un refacto) : `UPDATE_GOLDEN=1 npx vitest run src/lib/loup-garou/debate-golden.test.ts`.
 */

const FIXTURE = join(dirname(fileURLToPath(import.meta.url)), '__fixtures__', 'debate-golden.json')
const COUNTS = [4, 6, 8, 12] as const
const SEEDS = 50
const DEBATE_MS = 60_000
const BOT_TICK_MS = 3_000

type GoldenGame = {
  winner: string | null
  /** Fil complet : paroles `manche:auteur:kind:cible`, skips `skip:id`, votes du jour `vote:id>cible`. */
  thread: string
  /** Empreinte de la suite complète des états (secrets compris) : attrape tout le reste. */
  states: string
}

type Golden = Record<string, GoldenGame>

function sha(text: string): string {
  return createHash('sha256').update(text).digest('hex').slice(0, 16)
}

/**
 * Ce qu'une transition a ajouté au fil public, aux skips et aux votes du jour.
 * Le skip unanime et le dernier vote vident leur liste dans la même écriture :
 * on les déduit alors des vivants qui manquaient, et le dépouillement public
 * (`result:`) fige les voix qu'on ne peut plus attribuer.
 */
function diff(before: LGState, after: LGState, advanced: boolean): string[] {
  const out: string[] = []
  for (const sp of after.debateSpeech) {
    if (before.debateSpeech.includes(sp)) continue
    out.push(`${sp.round}:${sp.playerId}:${sp.kind}:${sp.targetId ?? '-'}`)
  }
  const unanimous = !advanced && before.phase === 'day-debate' && after.phase !== 'day-debate'
  const skips = unanimous
    ? lgAlive(before).map((p) => p.id)
    : after.debateSkips
  for (const id of skips) if (!before.debateSkips.includes(id)) out.push(`skip:${id}`)
  for (const [id, target] of Object.entries(after.dayVotes)) {
    if (before.dayVotes[id] !== target) out.push(`vote:${id}>${target}`)
  }
  if (after.lastVoteResult !== before.lastVoteResult && after.lastVoteResult) {
    const { round, eliminatedId, tie, tally } = after.lastVoteResult
    const voices = Object.entries(tally)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([id, n]) => `${id}=${n}`)
      .join(',')
    out.push(`result:${round}:${eliminatedId ?? '-'}:${tie ? 'tie' : 'ok'}:${voices}`)
  }
  if (after.phase !== before.phase) out.push(`>${after.phase}`)
  return out
}

/** Le tour des humains scriptés : rien que des actions qu'un joueur ferait à l'écran. */
function humanActions(s: LGState, roll: () => number, now: number): LGAction[] {
  const actions: LGAction[] = []
  const alive = lgAlive(s)
  const pickOther = (id: string) => {
    const others = alive.filter((p) => p.id !== id)
    return others[Math.min(others.length - 1, Math.floor(roll() * others.length))]
  }
  for (const h of alive.filter((p) => !p.isBot)) {
    if (s.phase === 'day-debate') {
      const mine = s.debateSpeech.filter((sp) => sp.round === s.round && sp.playerId === h.id)
      const r = roll()
      if (r < 0.25 && mine.length < LG_SPEECH_CAP) {
        const accuser = [...s.debateSpeech]
          .reverse()
          .find((sp) => sp.round === s.round && sp.kind === 'suspect' && sp.targetId === h.id)
        const k = roll()
        const kind: LGDebateSpeech['kind'] = accuser && k < 0.4 ? 'defend' : k < 0.75 ? 'suspect' : 'ally'
        const targetId = kind === 'defend' && accuser ? accuser.playerId : pickOther(h.id)?.id
        if (targetId) actions.push({ type: 'DEBATE_SPEAK', playerId: h.id, kind, targetId })
      } else if (r < 0.33 && !s.debateSkips.includes(h.id)) {
        actions.push({ type: 'DEBATE_SKIP', playerId: h.id, now })
      }
    } else if ((s.phase === 'day-vote' || s.phase === 'day-revote') && !s.dayVotes[h.id]) {
      if (roll() < 0.5) {
        const pool = alive.filter(
          (p) => p.id !== h.id && (!s.revoteCandidates || s.revoteCandidates.includes(p.id))
        )
        if (pool.length > 0) {
          const target = pool[Math.min(pool.length - 1, Math.floor(roll() * pool.length))]
          actions.push({ type: 'DAY_VOTE', playerId: h.id, targetId: target.id, now })
        }
      }
    } else if (s.phase === 'mayor-election' && !s.mayorVotes[h.id] && roll() < 0.5) {
      const target = pickOther(h.id) ?? h
      actions.push({ type: 'MAYOR_VOTE', playerId: h.id, targetId: target.id, now })
    }
  }
  return actions
}

function playGame(count: number, seed: number): GoldenGame {
  const key = `${count}-${seed}`
  const humans = seed % 3
  const setup = createRng(`golden-${key}`)
  const personas = pickBotPersonas(count - humans, setup.next)
  const players = [
    ...Array.from({ length: humans }, (_, i) => ({ id: `h${i}`, name: `Humain ${i}`, isBot: false })),
    ...personas.map((persona, i) => ({ id: `b${i}`, name: botDisplayName(persona), isBot: true })),
  ]
  let s = createLGState(players, `golden-${key}`, DEBATE_MS, 0)
  const rand = createRng(`bots-${key}`).next
  const roll = createRng(`humains-${key}`).next
  let now = 0
  const thread: string[] = []
  const states = createHash('sha256')
  const step = (next: LGState, advanced = false) => {
    thread.push(...diff(s, next, advanced))
    states.update(JSON.stringify(next))
    s = next
  }
  // Lu par fonction : `step` réassigne `s`, le rétrécissement de type de TS ne le voit pas.
  const over = () => s.phase === 'finished'

  for (let guard = 0; !over() && guard < 3_000; guard += 1) {
    if (s.phaseEndsAt !== null && now >= s.phaseEndsAt) {
      step(reduceLG(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now }), true)
      continue
    }
    for (const action of humanActions(s, roll, now)) {
      if (over()) break
      try {
        step(reduceLG(s, action))
      } catch (e) {
        if (!(e instanceof LGEngineError)) throw e
      }
    }
    if (over()) break
    const r = applyLGBotAction(s, rand, now)
    if (r.ok) {
      step(r.state)
      now += BOT_TICK_MS
    } else if (s.phaseEndsAt !== null) {
      now = Math.max(now, s.phaseEndsAt)
    } else {
      break
    }
  }
  return { winner: s.winnerTeam, thread: thread.join(' '), states: sha(states.digest('hex')) }
}

function playAll(): Golden {
  const golden: Golden = {}
  for (const count of COUNTS) {
    for (let seed = 0; seed < SEEDS; seed += 1) golden[`${count}-${seed}`] = playGame(count, seed)
  }
  return golden
}

describe('golden du débat du Loup-Garou (200 parties figées)', () => {
  const played = playAll()

  if (process.env.UPDATE_GOLDEN === '1') {
    mkdirSync(dirname(FIXTURE), { recursive: true })
    writeFileSync(FIXTURE, `${JSON.stringify(played, null, 1)}\n`)
  }

  it('le harnais exerce tout le planificateur : chaque kind, réactions aux humains, interpellations, skips groupés', () => {
    const all = Object.values(played)
    expect(all.every((g) => g.winner !== null)).toBe(true)
    const words = all.flatMap((g) => g.thread.split(' '))
    for (const kind of ['suspect', 'defend', 'ally', 'rally', 'doubt', 'ask', 'toldYou', 'wrong']) {
      expect(words.some((w) => w.split(':')[2] === kind && /^\d+:b/.test(w)), kind).toBe(true)
    }
    expect(words.some((w) => /^\d+:h\d:/.test(w))).toBe(true)
    expect(words.some((w) => /^\d+:b\d+:ask:h\d$/.test(w))).toBe(true)
    expect(words.some((w) => w.startsWith('skip:h'))).toBe(true)
  })

  it('chaque partie rejoue à l’identique le fil figé (paroles, skips, votes, vainqueur, états)', () => {
    expect(existsSync(FIXTURE), `fixture absente : UPDATE_GOLDEN=1 npx vitest run ${FIXTURE}`).toBe(true)
    const golden = JSON.parse(readFileSync(FIXTURE, 'utf8')) as Golden
    expect(Object.keys(played).sort()).toEqual(Object.keys(golden).sort())
    for (const [key, game] of Object.entries(played)) {
      expect(game.winner, `${key} : vainqueur`).toBe(golden[key].winner)
      expect(game.thread, `${key} : fil`).toBe(golden[key].thread)
      expect(game.states, `${key} : suite des états`).toBe(golden[key].states)
    }
  })
})
