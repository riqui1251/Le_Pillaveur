import { describe, expect, it } from 'vitest'
import { botTickDelayMs, personaForBotName } from '@/lib/online/bot-personas'
import { phaseKey } from '@/lib/online/phase-clock'
import { vueDeNezAdapter as adapter } from './online-adapter'
import { VDN_ANSWER_MS, VDN_REVEAL_MS, vdnBotDueAt, vdnBotTempoRand } from './online-view'
import {
  applyVdnRoomAction,
  buildVdnOnlineState,
  vdnClientViewJson,
  vdnSpectatorViewJson,
  type VdnOnlineState,
} from './server-adapter'

const NOW = 1_700_000_000_000
/** Retard du filet serveur sur un tick dû (SERVICE_TICK_MARGIN_MS de room-ticker.ts, qui tire Prisma). */
const SERVICE_TICK_MARGIN_MS = 1_500

const members = (...ids: string[]) => ids.map((id) => ({ userId: id, user: { displayName: `Joueur ${id}` } }))

/** États bâtis sur l'horloge réelle : l'adaptateur juge les échéances avec Date.now(). */
function fresh(ids: string[], botsCount = 0): VdnOnlineState {
  return buildVdnOnlineState(members(...ids), { seed: 'adaptateur', botsCount })
}

function applied(state: unknown, userId: string, body: Record<string, unknown>): VdnOnlineState {
  const result = adapter.applyAction(state, userId, body)
  if (!result.ok) throw new Error(`refus ${result.status} ${result.error}`)
  return result.state as VdnOnlineState
}

const answerOf = (s: VdnOnlineState) => s.questions[s.game.index].answer

describe('vueDeNezAdapter : registre', () => {
  it('bornes 2-16, complété par des bots', () => {
    expect(adapter.minPlayers).toBe(2)
    expect(adapter.maxPlayers).toBe(16)
    expect(adapter.botsFillable).toBe(true)
    expect(typeof adapter.serviceTick).toBe('function')
  })

  it('personne au tour, fin sur la phase', () => {
    const state = fresh(['u1', 'u2'])
    expect(adapter.currentActorId(state)).toBeNull()
    expect(adapter.isFinished(state)).toBe(false)
    expect(adapter.isFinished({ ...state, phase: 'finished' })).toBe(true)
  })

  it('parse ne lève jamais et relit ce que serialize écrit', () => {
    const state = fresh(['u1', 'u2'])
    expect(adapter.parse(adapter.serialize(state))).toEqual(state)
    for (const json of [null, '', 'oups', '{}', '[1]']) {
      expect(() => adapter.parse(json)).not.toThrow()
      expect(adapter.parse(json)).toBeNull()
    }
  })
})

describe('vueDeNezAdapter : actions et statuts', () => {
  it('corps mal formé ou action inconnue : 400 invalid_action', () => {
    const state = fresh(['u1', 'u2'])
    for (const body of [
      { action: 'estimate' },
      { action: 'estimate', value: '12' },
      { action: 'advance' },
      { action: 'deviner', value: 3 },
      {},
    ]) {
      expect(adapter.applyAction(state, 'u1', body)).toEqual({ ok: false, error: 'invalid_action', status: 400 })
    }
  })

  it('estimation sous le minimum : 400 (le téléphone la filtre déjà)', () => {
    const state = fresh(['u1', 'u2'])
    const min = state.questions[0].min
    expect(adapter.applyAction(state, 'u1', { action: 'estimate', value: min - 5 })).toEqual({
      ok: false,
      error: 'invalid_action',
      status: 400,
    })
  })

  it('estimation acceptée ; un inconnu prend 403', () => {
    const state = fresh(['u1', 'u2'])
    const next = applied(state, 'u1', { action: 'estimate', value: answerOf(state), expectedVersion: 1 })
    expect(next.version).toBe(2)
    expect(adapter.applyAction(state, 'intrus', { action: 'estimate', value: 3 })).toMatchObject({
      ok: false,
      error: 'UNKNOWN_PLAYER',
      status: 403,
    })
  })

  it('courses attendues en 409 : échéance pas atteinte, pas de bot à faire jouer, phase déjà changée', () => {
    const state = fresh(['u1', 'u2'])
    expect(adapter.applyAction(state, '__service__', { action: 'advance', phaseKey: phaseKey(state) })).toMatchObject({
      error: 'NOT_EXPIRED',
      status: 409,
    })
    expect(adapter.applyAction(state, '__service__', { action: 'bot' })).toMatchObject({ error: 'NOT_BOT_TURN', status: 409 })
    expect(adapter.applyAction(state, 'u1', { action: 'replace-left' })).toMatchObject({ error: 'NOTHING_TO_REPLACE', status: 409 })
    let shown = applied(state, 'u1', { action: 'estimate', value: answerOf(state) })
    shown = applied(shown, 'u2', { action: 'estimate', value: answerOf(state) + 1 })
    expect(shown.phase).toBe('reveal')
    expect(adapter.applyAction(shown, 'u1', { action: 'estimate', value: 1 })).toMatchObject({ error: 'WRONG_PHASE', status: 409 })
    // « Question suivante » trop tôt : un refus lisible (reading_time), pas une course.
    expect(adapter.applyAction(shown, 'u1', { action: 'continue' })).toMatchObject({ error: 'READING_TIME', status: 403 })
    // D'un autre que le meneur : refusé, son téléphone n'affiche d'ailleurs pas le bouton.
    expect(adapter.applyAction(shown, 'u2', { action: 'continue' })).toMatchObject({ error: 'NOT_YOUR_TURN', status: 403 })
  })

  it('actionResponse porte EXACTEMENT la vue de GET /state', () => {
    const state = applied(fresh(['u1', 'u2']), 'u1', { action: 'estimate', value: 42 })
    for (const viewer of ['u1', 'u2']) {
      const response = adapter.actionResponse(state, viewer)
      expect(response.viewJson).toBe(adapter.clientViewJson(state, viewer))
      expect(response.viewJson).toBe(vdnClientViewJson(state, viewer))
      expect(response.view).toEqual(JSON.parse(response.viewJson as string))
    }
    expect(adapter.spectatorViewJson(state)).toBe(vdnSpectatorViewJson(state))
  })

  it('départ, retour, conversion', () => {
    const state = fresh(['u1', 'u2'])
    const left = adapter.markLeft(state, 'u2', NOW) as VdnOnlineState
    expect(left.players[1].leftAt).toBe(NOW)
    expect((adapter.rejoin(left, 'u2') as VdnOnlineState).players[1].leftAt).toBeNull()
    expect(adapter.rejoin(state, 'u2')).toBeNull()
    expect((adapter.convertToBot(state, 'u2') as VdnOnlineState).players[1].isBot).toBe(true)
  })
})

describe('vueDeNezAdapter : tick de service', () => {
  function atTable(botsCount: number): VdnOnlineState {
    return buildVdnOnlineState(members('u1'), { seed: 'tick', botsCount, now: NOW })
  }

  it('un bot n’a pas estimé : tick « bot » à la borne haute de son tempo', () => {
    const state = atTable(2)
    const persona = personaForBotName(state.players[1].name)!
    expect(persona).toBeTruthy()
    expect(adapter.serviceTick!(state, NOW)).toEqual({ body: { action: 'bot' }, dueAt: NOW + persona.tempoMaxMs })
    // Le corps que le serveur s'applique : l'estimation du PREMIER bot en attente.
    const next = applied(state, '__service__', adapter.serviceTick!(state, NOW)!.body)
    expect(next.game.estimates[state.players[1].id]).not.toBeNull()
    expect(next.game.estimates[state.players[2].id]).toBeNull()
  })

  it('bot déjà refusé (skipBot) ou tous les bots ont estimé : l’échéance de la question', () => {
    const state = atTable(1)
    const deadline = { body: { action: 'advance', phaseKey: phaseKey(state) }, dueAt: NOW + VDN_ANSWER_MS }
    expect(adapter.serviceTick!(state, NOW, { skipBot: true })).toEqual(deadline)
    const played = applied(state, '__service__', { action: 'bot' })
    expect(adapter.serviceTick!(played, NOW)).toEqual({ ...deadline, body: { action: 'advance', phaseKey: phaseKey(played) } })
  })

  it('le tempo du bot court depuis le DÉBUT de la question, pas depuis la dernière écriture', () => {
    const state = atTable(2)
    const persona = personaForBotName(state.players[1].name)!
    const due = NOW + persona.tempoMaxMs
    // Une estimation humaine juste avant l'échéance du bot ne la repousse pas.
    const corrected = applyVdnRoomAction(state, 'u1', { type: 'estimate', value: 5 }, due - 500)
    if (!corrected.ok) throw new Error(corrected.error)
    expect(adapter.serviceTick!(corrected.state, due - 500)).toEqual({ body: { action: 'bot' }, dueAt: due })
    // Échéance déjà passée (bot en retard derrière un autre) : il part aussitôt.
    expect(adapter.serviceTick!(state, NOW + 20_000)).toEqual({ body: { action: 'bot' }, dueAt: NOW + 20_000 })
  })

  /**
   * Le serveur seul fait jouer les bots (téléphones verrouillés, partie devant
   * la TV) : il tire chaque tick à son échéance + SERVICE_TICK_MARGIN_MS et
   * réarme après chaque écriture. `humanEveryMs` : un humain qui estime puis
   * corrige à ce rythme. Rend l'instant où le dernier bot a estimé.
   */
  function serverOnly(botsCount: number, seed: string, humanEveryMs: number | null): { doneAt: number; deadline: number } {
    let state = buildVdnOnlineState(members('u1'), { seed, botsCount, now: NOW })
    const deadline = state.phaseEndsAt!
    let now = NOW
    let nextHuman = humanEveryMs === null ? Infinity : NOW + humanEveryMs
    for (;;) {
      const tick = adapter.serviceTick!(state, now)!
      const fireAt = tick.dueAt + SERVICE_TICK_MARGIN_MS
      const human = nextHuman < fireAt
      now = human ? nextHuman : fireAt
      if (now >= deadline || (!human && tick.body.action !== 'bot')) return { doneAt: now, deadline }
      if (human) nextHuman += humanEveryMs ?? 0
      const result = human
        ? applyVdnRoomAction(state, 'u1', { type: 'estimate', value: 7 }, now)
        : applyVdnRoomAction(state, '__service__', { type: 'bot' }, now)
      if (!result.ok) throw new Error(result.error)
      state = result.state
      if (state.players.every((p) => !p.isBot || state.game.estimates[p.id] !== null)) return { doneAt: now, deadline }
    }
  }

  it('serveur seul : 11 ou 15 bots estiment tous bien avant l’échéance, corrections humaines comprises', () => {
    for (const botsCount of [11, 15]) {
      for (const seed of ['a', 'b', 'c', 'd', 'e']) {
        const label = `${botsCount} bots, graine ${seed}`
        // Sans écriture humaine : le tempo le plus lent (7,5 s), puis un bot par marge du serveur.
        const alone = serverOnly(botsCount, `${seed}-${botsCount}`, null)
        expect(alone.doneAt - NOW, label).toBeLessThanOrEqual(7_500 + botsCount * SERVICE_TICK_MARGIN_MS)
        // Un humain qui corrige toutes les 2 s réarme le minuteur à chaque fois : les bots passent quand même.
        const busy = serverOnly(botsCount, `${seed}-${botsCount}`, 2_000)
        expect(busy.doneAt, label).toBeLessThan(busy.deadline - 10_000)
      }
    }
  })

  it('client : tempo tiré dans la fenêtre du persona, figé pour la question, jamais après le serveur', () => {
    const state = atTable(3)
    const key = phaseKey(state)
    for (const bot of state.players.filter((p) => p.isBot)) {
      const persona = personaForBotName(bot.name)!
      const tempo = botTickDelayMs(bot.name, vdnBotTempoRand(bot.id, key))
      expect(tempo).toBeGreaterThanOrEqual(persona.tempoMinMs)
      expect(tempo).toBeLessThanOrEqual(persona.tempoMaxMs)
      expect(botTickDelayMs(bot.name, vdnBotTempoRand(bot.id, key))).toBe(tempo)
      const client = vdnBotDueAt(state.phaseEndsAt, tempo, NOW + 1_000)
      const server = vdnBotDueAt(state.phaseEndsAt, botTickDelayMs(bot.name, () => 1), NOW + 1_000)
      expect(client).toBeLessThanOrEqual(server)
    }
    const [a, b] = state.players.filter((p) => p.isBot)
    const draws = new Set(['answering#1', 'answering#2', 'answering#3'].flatMap((k) => [a, b].map((p) => vdnBotTempoRand(p.id, k)())))
    expect(draws.size).toBe(6)
  })

  it('révélation : la question suivante à l’échéance ; partie finie ou table désertée : rien', () => {
    const state = atTable(1)
    const played = applied(state, '__service__', { action: 'bot' })
    const shown = applied(played, 'u1', { action: 'estimate', value: answerOf(played) })
    expect(shown.phase).toBe('reveal')
    const tick = adapter.serviceTick!(shown, NOW)
    expect(tick).toEqual({ body: { action: 'advance', phaseKey: phaseKey(shown) }, dueAt: shown.phaseEndsAt })
    expect(shown.phaseEndsAt! - shown.revealAt!).toBe(VDN_REVEAL_MS)
    expect(adapter.serviceTick!({ ...state, phase: 'finished', phaseEndsAt: null }, NOW)).toBeNull()
    const deserted = { ...state, players: state.players.map((p) => (p.isBot ? p : { ...p, leftAt: NOW })) }
    expect(adapter.serviceTick!(deserted, NOW)).toBeNull()
  })
})
