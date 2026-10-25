import { describe, expect, it } from 'vitest'
import {
  applyEspionBotAction,
  applyEspionRoomAction,
  buildEspionState,
  markEspionPlayerLeft,
  parseEspionState,
  rejoinEspionPlayer,
  serializeEspionState,
} from './server-adapter'
import { reduceEspion, ESPION_ACCUSATION_WINDOW_MS, type EspionState } from './engine'
import { espionLocationIdOf } from './data'
import { phaseKey } from '@/lib/online/phase-clock'
import { createRng } from '@/lib/petit-buveur/rng'

const members = (n: number) =>
  Array.from({ length: n }, (_, i) => ({ userId: `u${i + 1}`, user: { displayName: `Joueur ${i + 1}` } }))

/** Table construite par le lobby, passée en discussion à `now`. */
function inDiscussion(humans: number, bots: number, seed: string | number): { state: EspionState; now: number } {
  const built = buildEspionState(members(humans), 'fr', bots, seed)
  const now = built.phaseEndsAt!
  return { state: reduceEspion(built, { type: 'ADVANCE', claimedKey: phaseKey(built), now }), now }
}

/**
 * Les ticks bot d'une accusation, de son ouverture à la fin de sa fenêtre, au
 * pas de l'arbitre client (250 ms). Ces invariants valent quel que soit le
 * moment où un bot décide : le tirage au soutien d'avant le planificateur
 * comme les instants hachés du lot 3 les tiennent.
 */
function driveAccusation(state: EspionState, rand: () => number): { state: EspionState; refusals: string[] } {
  const acc = state.activeAccusation!
  let s = state
  const refusals: string[] = []
  for (let t = acc.endsAt - ESPION_ACCUSATION_WINDOW_MS; t < acc.endsAt; t += 250) {
    if (s.phase !== 'discussion' || s.activeAccusation?.endsAt !== acc.endsAt) break
    const result = applyEspionBotAction(s, rand, t)
    if (result.ok) s = result.state
    else refusals.push(result.error)
  }
  return { state: s, refusals }
}

/** Les joueurs qui ont soutenu ou refusé dans la manche, d'après le fil. */
const decidedBy = (s: EspionState) =>
  (s.speech ?? []).filter((sp) => sp.round === s.round && (sp.kind === 'rally' || sp.kind === 'doubt')).map((sp) => sp.playerId)

describe('bots : soutien d’une accusation', () => {
  it('le bot ciblé ne soutient jamais, même quand le tirage dit oui', () => {
    // 3 humains + 1 bot : le seul bot est la cible ; de toute la fenêtre, il ne fait que se défendre, une fois.
    const solo = inDiscussion(3, 1, 'cible-seule')
    const accused = reduceEspion(solo.state, { type: 'ACCUSE', playerId: 'u1', targetId: 'bot-1', now: solo.now })
    const idle = driveAccusation(accused, () => 0)
    const written = (idle.state.speech ?? []).slice((accused.speech ?? []).length)
    expect(written.map((sp) => [sp.playerId, sp.kind, sp.targetId])).toEqual([['bot-1', 'defend', 'u1']])
    expect(idle.state.activeAccusation).toEqual(accused.activeAccusation)
    expect(new Set(idle.refusals)).toEqual(new Set(['NOT_BOT_TURN']))

    // 4 humains + 2 bots (majorité à 4, jamais atteinte) : l'autre bot se prononce, la cible jamais.
    for (let seed = 0; seed < 50; seed += 1) {
      const table = inDiscussion(4, 2, seed)
      const pending = reduceEspion(table.state, { type: 'ACCUSE', playerId: 'u1', targetId: 'bot-1', now: table.now })
      for (const rand of [() => 0, () => 0.999]) {
        const { state, refusals } = driveAccusation(pending, rand)
        expect(refusals.filter((e) => e !== 'NOT_BOT_TURN'), `graine ${seed}`).toEqual([])
        expect(decidedBy(state), `graine ${seed}`).not.toContain('bot-1')
        expect(state.activeAccusation?.supporters ?? []).not.toContain('bot-1')
        expect(state.activeAccusation?.declined ?? []).not.toContain('bot-1')
      }
      // Tirage favorable : le bot libre ne reste pas muet toute la fenêtre.
      expect(decidedBy(driveAccusation(pending, () => 0).state), `graine ${seed}`).toContain('bot-2')
    }
  })

  it('un bot qui a déjà refusé est sauté, sans faire échouer le tick des autres', () => {
    // 4 humains + 2 bots, majorité 4 : u3 refuse, puis un bot prend sa place ; bot-2 reste libre.
    const table = inDiscussion(4, 2, 'refus-puis-bot')
    let s = reduceEspion(table.state, { type: 'ACCUSE', playerId: 'u1', targetId: 'bot-1', now: table.now })
    s = reduceEspion(s, { type: 'DECLINE', playerId: 'u3', now: table.now })
    s = { ...s, players: s.players.map((p) => (p.id === 'u3' ? { ...p, isBot: true } : p)) }
    const { state, refusals } = driveAccusation(s, () => 0)
    // ALREADY_DECLINED ou ALREADY_SUPPORTED ici voudrait dire que le converti a été relancé.
    expect(refusals.filter((e) => e !== 'NOT_BOT_TURN')).toEqual([])
    expect(decidedBy(state).filter((id) => id === 'u3')).toEqual(['u3'])
    expect(state.activeAccusation?.supporters ?? []).not.toContain('u3')
    expect(decidedBy(state)).toContain('bot-2')
  })

  it('même rand et mêmes instants ⇒ même résultat', () => {
    const table = inDiscussion(1, 6, 'meme-rand')
    const accused = reduceEspion(table.state, { type: 'ACCUSE', playerId: 'u1', targetId: 'bot-3', now: table.now })
    let decided = 0
    for (let seed = 0; seed < 20; seed += 1) {
      const run = () => {
        const rng = createRng(seed)
        return driveAccusation(accused, () => rng.next())
      }
      const once = run()
      expect(run(), `graine ${seed}`).toEqual(once)
      expect(decidedBy(once.state), `graine ${seed}`).not.toContain('bot-3')
      decided += decidedBy(once.state).length
    }
    // Sans aucune décision, l'égalité ne prouverait rien.
    expect(decided).toBeGreaterThan(0)
  })

  it('le reveal mené par un bot repart à l’instant donné', () => {
    const table = inDiscussion(1, 3, 'reveal')
    const revealing = reduceEspion(table.state, {
      type: 'ADVANCE',
      claimedKey: phaseKey(table.state),
      now: table.state.phaseEndsAt!,
    })
    // u1 mène le reveal tant qu'il est là : on le remplace pour laisser la main à un bot.
    const botLed = { ...revealing, players: revealing.players.map((p) => (p.id === 'u1' ? { ...p, isBot: true } : p)) }
    const later = table.now + 123_456
    const result = applyEspionBotAction(botLed, () => 0.5, later)
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect(result.state.phase).toBe('discussion')
      expect(result.state.phaseEndsAt).toBe(later + result.state.discussionMs)
    }
  })
})

describe('devinette de l’espion par identifiant', () => {
  it('guess-location par locationId est jugé sur le lieu de la salle', () => {
    const { state } = inDiscussion(3, 0, 'devine')
    const spy = state.players.find((p) => p.role === 'spy')!
    const result = applyEspionRoomAction(state, spy.id, {
      type: 'guess-location',
      locationId: espionLocationIdOf(state.location)!,
    })
    expect(result.ok).toBe(true)
    if (result.ok) expect(result.state.lastReveal?.outcome).toBe('spy-guessed-right')
  })
})

describe('fil de questions : actions de la salle', () => {
  it('ask, answer et decline passent par l’adaptateur', () => {
    // 5 joueurs : majorité 3, un refus laisse l'accusation ouverte (1 soutien + 2 indécis).
    const { state } = inDiscussion(5, 0, 'fil')
    const asked = applyEspionRoomAction(state, 'u1', { type: 'ask', targetId: 'u2', questionId: 'when' })
    expect(asked.ok).toBe(true)
    if (!asked.ok) return
    const answered = applyEspionRoomAction(asked.state, 'u2', { type: 'answer', value: 'night' })
    expect(answered.ok && answered.state.speech?.slice(-1)[0]).toMatchObject({ kind: 'answer', value: 'night' })
    if (!answered.ok) return
    const accused = applyEspionRoomAction(answered.state, 'u1', { type: 'accuse', targetId: 'u2' })
    if (!accused.ok) throw new Error(accused.error)
    const declined = applyEspionRoomAction(accused.state, 'u3', { type: 'decline' })
    expect(declined.ok && declined.state.activeAccusation?.declined).toEqual(['u3'])
  })

  it('speak : un humain n’a que suspect et defend (INVALID_KIND sinon)', () => {
    const { state } = inDiscussion(3, 2, 'parole')
    for (const kind of ['ally', 'toldYou', 'wrong', 'question', 'answer', 'accuse', 'rally', 'doubt', 'nope']) {
      expect(applyEspionRoomAction(state, 'u1', { type: 'speak', kind, targetId: 'u2' }), kind).toEqual({
        ok: false,
        error: 'INVALID_KIND',
      })
    }
    for (const kind of ['suspect', 'defend']) {
      const result = applyEspionRoomAction(state, 'u1', { type: 'speak', kind, targetId: 'bot-1' })
      expect(result.ok && result.state.speech?.slice(-1)[0], kind).toMatchObject({ playerId: 'u1', kind, targetId: 'bot-1' })
    }
  })

  it('un JSON d’avant le fil (ni speech ni declined) se reparse avec un fil vide et se joue', () => {
    const { state, now } = inDiscussion(5, 0, 'ancien')
    const accused = reduceEspion(state, { type: 'ACCUSE', playerId: 'u1', targetId: 'u2', now })
    const { speech: _speech, ...base } = accused
    void _speech
    const { declined: _declined, ...oldAccusation } = accused.activeAccusation!
    void _declined
    const parsed = parseEspionState(JSON.stringify({ ...base, activeAccusation: oldAccusation }))!
    expect(parsed.speech).toEqual([])
    expect(parsed.activeAccusation?.declined).toEqual([])
    const declined = reduceEspion(parsed, { type: 'DECLINE', playerId: 'u3', now })
    expect(declined.activeAccusation?.declined).toEqual(['u3'])
    expect(declined.speech).toEqual([{ playerId: 'u3', kind: 'doubt', targetId: 'u2', round: 1, at: now }])

    const calm = parseEspionState(JSON.stringify({ ...base, activeAccusation: null }))!
    expect(calm.speech).toEqual([])
    expect(calm.activeAccusation).toBeNull()
    expect(parseEspionState(serializeEspionState(parsed))).toEqual(parsed)
  })
})

describe('départs : grâce cumulée et parties d’avant le plancher de lecture', () => {
  it('rejoindre puis repartir garde l’absence déjà faite : le bot remplace au bout de 3 min cumulées', () => {
    const table = inDiscussion(3, 0, 'aller-retour')
    const t = table.now
    let s = markEspionPlayerLeft(table.state, 'u2', t)!
    s = rejoinEspionPlayer(s, 'u2', t + 150_000)!
    s = markEspionPlayerLeft(s, 'u2', t + 160_000)!
    // Le compte à rebours affiché (leftAt + 3 min) ne laisse que 30 s.
    expect(s.players.find((p) => p.id === 'u2')?.leftAt).toBe(t + 10_000)
    expect(() => reduceEspion(s, { type: 'REPLACE_LEFT', now: t + 189_999, graceMs: 180_000 })).toThrow('NOTHING_TO_REPLACE')
    const replaced = reduceEspion(s, { type: 'REPLACE_LEFT', now: t + 190_000, graceMs: 180_000 })
    expect(replaced.players.find((p) => p.id === 'u2')?.isBot).toBe(true)
  })

  it('état sérialisé sans revealAt (révélation en cours au déploiement) : jamais bloqué au « continuer »', () => {
    const table = inDiscussion(3, 0, 'vieux-reveal')
    const reveal = reduceEspion(table.state, {
      type: 'ADVANCE',
      claimedKey: phaseKey(table.state),
      now: table.state.phaseEndsAt!,
    })
    const { revealAt: _r, ...legacy } = reveal
    void _r
    const parsed = parseEspionState(JSON.stringify(legacy))!
    expect(parsed.revealAt).toBeNull()
    expect(applyEspionRoomAction(parsed, 'u1', { type: 'continue' })).toMatchObject({ ok: true })
  })

  it('l’espion humain démasqué devine par la route pendant sa dernière chance', () => {
    const table = inDiscussion(4, 0, 'derniere-chance-route')
    const spy = table.state.players.find((p) => p.role === 'spy')!.id
    const crew = table.state.players.filter((p) => p.id !== spy).map((p) => p.id)
    let s = reduceEspion(table.state, { type: 'ACCUSE', playerId: crew[0], targetId: spy, now: table.now })
    for (const id of crew.slice(1)) s = reduceEspion(s, { type: 'SUPPORT', playerId: id, now: table.now })
    expect(s.phase).toBe('lastChance')
    const locationId = espionLocationIdOf(s.location)!
    const guessed = applyEspionRoomAction(s, spy, { type: 'guess-location', locationId })
    expect(guessed.ok && guessed.state.lastReveal).toMatchObject({ outcome: 'spy-guessed-right', winner: 'spy' })
    expect(applyEspionRoomAction(s, crew[0], { type: 'guess-location', locationId })).toEqual({ ok: false, error: 'NOT_SPY' })
  })
})
