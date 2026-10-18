import { describe, expect, it } from 'vitest'
import { GAME_ADAPTERS } from './game-adapters'
import { GAMES } from '@/lib/games'
import { personaForBotName } from './bot-personas'
import { ONLINE_REPLACE_GRACE_MS } from './replacement'
import { buildPetitBuveurEngineState } from '@/lib/petit-buveur/server-adapter'
import type { EngineState } from '@/lib/petit-buveur/engine'
import { buildTabouState, markTabouPlayerLeft } from '@/lib/tabou/server-adapter'
import type { TabouState } from '@/lib/tabou/engine'
import { buildLGState } from '@/lib/loup-garou/server-adapter'
import type { LGState } from '@/lib/loup-garou/engine'
import { buildImposteurState } from '@/lib/imposteur/server-adapter'
import { IMPOSTEUR_EMPTY_CLUE, type ImposteurState } from '@/lib/imposteur/engine'
import { buildMenteurState } from '@/lib/menteur/server-adapter'
import type { MenteurState } from '@/lib/menteur/engine'
import { buildEspionState } from '@/lib/espion/server-adapter'
import { reduceEspion, toEspionSpectatorView, type EspionState } from '@/lib/espion/engine'
import { espionBotTickDelayMs } from '@/lib/espion/bot-tick'
import { espionLocationIdOf, espionLocationsFor } from '@/lib/espion/data'
import { phaseKey } from './phase-clock'

/**
 * Les bornes de joueurs vivent à DEUX endroits : le registre (vérité serveur,
 * enforcement lobby/launch) et `games.ts` (affichage hub + lobby, bundle
 * client). Ce test garantit qu'elles ne divergent jamais.
 */
describe('bornes de joueurs : registre ↔ GAMES', () => {
  for (const [gameId, adapter] of Object.entries(GAME_ADAPTERS)) {
    it(`${gameId} : min/max identiques des deux côtés`, () => {
      const meta = GAMES.find((g) => g.id === gameId)
      expect(meta, `${gameId} absent de GAMES`).toBeTruthy()
      expect(meta?.onlineReady, `${gameId} devrait être onlineReady`).toBe(true)
      expect(meta?.minPlayers, `minPlayers de ${gameId}`).toBe(adapter.minPlayers)
      expect(meta?.maxPlayers, `maxPlayers de ${gameId}`).toBe(adapter.maxPlayers)
      expect(Boolean(meta?.botsFillable), `botsFillable de ${gameId}`).toBe(
        Boolean(adapter.botsFillable)
      )
    })
  }
})

describe('Espion : devinette par identifiant', () => {
  const adapter = GAME_ADAPTERS.espion
  /** Salle en anglais, 3 humains, en discussion ; renvoie aussi l'espion. */
  const englishRoom = (): { state: EspionState; spyId: string } => {
    const members = ['u1', 'u2', 'u3'].map((userId) => ({ userId, user: { displayName: userId } }))
    const built = buildEspionState(members, 'en', 0, 11)
    const state = reduceEspion(built, { type: 'ADVANCE', claimedKey: phaseKey(built), now: built.phaseEndsAt! })
    return { state, spyId: state.players.find((p) => p.role === 'spy')!.id }
  }
  const outcome = (result: ReturnType<typeof adapter.applyAction>) =>
    result.ok ? (result.state as EspionState).lastReveal?.outcome : result

  it('le corps locationId est accepté et jugé sur le lieu de la salle', () => {
    const { state, spyId } = englishRoom()
    const locationId = espionLocationIdOf(state.location)!
    expect(outcome(adapter.applyAction(state, spyId, { action: 'guess-location', locationId }))).toBe('spy-guessed-right')
    const other = espionLocationsFor('fr').find((l) => l.id !== locationId)!.id
    expect(outcome(adapter.applyAction(state, spyId, { action: 'guess-location', locationId: other }))).toBe('spy-guessed-wrong')
  })

  it('l’ancien corps location (nom) reste accepté', () => {
    const { state, spyId } = englishRoom()
    expect(outcome(adapter.applyAction(state, spyId, { action: 'guess-location', location: state.location }))).toBe(
      'spy-guessed-right'
    )
  })

  it('id mal formé ou corps vide : action invalide (400)', () => {
    const { state, spyId } = englishRoom()
    for (const body of [{ locationId: 'Plage!' }, { locationId: 42 }, {}]) {
      expect(adapter.applyAction(state, spyId, { action: 'guess-location', ...body })).toEqual({
        ok: false,
        error: 'invalid_action',
        status: 400,
      })
    }
  })
})

describe('Espion : fil de questions, statuts des refus', () => {
  const adapter = GAME_ADAPTERS.espion
  /** 2 humains + 3 bots, en discussion. */
  const table = (): EspionState => {
    const members = ['u1', 'u2'].map((userId) => ({ userId, user: { displayName: userId } }))
    const built = buildEspionState(members, 'fr', 3, 'fil')
    return reduceEspion(built, { type: 'ADVANCE', claimedKey: phaseKey(built), now: built.phaseEndsAt! })
  }
  const play = (state: EspionState, userId: string, body: Record<string, unknown>): EspionState => {
    const result = adapter.applyAction(state, userId, body)
    if (!result.ok) throw new Error(result.error)
    return result.state as EspionState
  }
  const refusal = (result: ReturnType<typeof adapter.applyAction>) =>
    result.ok ? 'accepté' : { error: result.error, status: result.status }

  it('courses entre joueurs et tick sans bot concerné : conflits attendus (409)', () => {
    const s = table()
    const asked = play(s, 'u1', { action: 'ask', targetId: 'u2', questionId: 'when' })
    expect(refusal(adapter.applyAction(asked, 'u2', { action: 'ask', targetId: 'bot-1', questionId: 'where' }))).toEqual({
      error: 'QUESTION_PENDING',
      status: 409,
    })
    expect(refusal(adapter.applyAction(s, 'u2', { action: 'answer', value: 'night' }))).toEqual({
      error: 'NO_PENDING_QUESTION',
      status: 409,
    })
    const accused = play(s, 'u1', { action: 'accuse', targetId: 'bot-1' })
    for (const body of [
      { action: 'accuse', targetId: 'bot-2' },
      { action: 'ask', targetId: 'bot-2', questionId: 'where' },
    ]) {
      expect(refusal(adapter.applyAction(accused, 'u2', body)), body.action).toEqual({
        error: 'ACCUSATION_IN_PROGRESS',
        status: 409,
      })
    }
    expect(refusal(adapter.applyAction(s, 'u1', { action: 'bot' }))).toEqual({ error: 'NOT_BOT_TURN', status: 409 })
    expect(refusal(adapter.applyAction(asked, 'u2', { action: 'answer', value: 'night' }))).toBe('accepté')
  })

  it('soutien ou refus arrivé après la clôture de l’accusation : conflit attendu (409)', () => {
    // 5 actifs, majorité 3 : deux refus de bots rendent l'accusation de u1 perdue d'avance.
    const accused = play(table(), 'u1', { action: 'accuse', targetId: 'bot-1' })
    const now = accused.activeAccusation!.endsAt - 1_000
    let rejected = reduceEspion(accused, { type: 'DECLINE', playerId: 'bot-2', now })
    rejected = reduceEspion(rejected, { type: 'DECLINE', playerId: 'bot-3', now })
    expect(rejected.activeAccusation).toBeNull()
    for (const action of ['support', 'decline']) {
      expect(refusal(adapter.applyAction(rejected, 'u2', { action })), action).toEqual({
        error: 'NO_ACTIVE_ACCUSATION',
        status: 409,
      })
    }
    // Fenêtre écoulée, tick d'échéance pas encore passé.
    const lapsed: EspionState = { ...accused, activeAccusation: { ...accused.activeAccusation!, endsAt: Date.now() - 1 } }
    for (const action of ['support', 'decline']) {
      expect(refusal(adapter.applyAction(lapsed, 'u2', { action })), action).toEqual({
        error: 'ACCUSATION_EXPIRED',
        status: 409,
      })
    }
  })

  it('interdictions (403) : parole hors boutons, question inconnue, valeur étrangère, refus de l’accusateur', () => {
    const s = table()
    expect(refusal(adapter.applyAction(s, 'u1', { action: 'speak', kind: 'ally', targetId: 'u2' }))).toEqual({
      error: 'INVALID_KIND',
      status: 403,
    })
    expect(refusal(adapter.applyAction(s, 'u1', { action: 'speak', kind: 'suspect', targetId: 'u2' }))).toBe('accepté')
    expect(refusal(adapter.applyAction(s, 'u1', { action: 'ask', targetId: 'u2', questionId: 'weather' }))).toEqual({
      error: 'UNKNOWN_QUESTION',
      status: 403,
    })
    const asked = play(s, 'u1', { action: 'ask', targetId: 'u2', questionId: 'when' })
    expect(refusal(adapter.applyAction(asked, 'u2', { action: 'answer', value: 'swim' }))).toEqual({
      error: 'INVALID_ANSWER',
      status: 403,
    })
    const accused = play(s, 'u1', { action: 'accuse', targetId: 'bot-1' })
    expect(refusal(adapter.applyAction(accused, 'u1', { action: 'decline' }))).toEqual({
      error: 'CANNOT_DECLINE',
      status: 403,
    })
    expect(refusal(adapter.applyAction(accused, 'u2', { action: 'decline' }))).toBe('accepté')
  })

  it('corps mal formés : action invalide (400)', () => {
    const s = table()
    for (const body of [
      { action: 'ask', targetId: 'u2' },
      { action: 'ask', questionId: 'when' },
      { action: 'ask', targetId: 2, questionId: 'when' },
      { action: 'answer' },
      { action: 'answer', value: 3 },
      { action: 'speak', kind: 'suspect' },
      { action: 'speak', targetId: 'u2' },
    ]) {
      expect(adapter.applyAction(s, 'u1', body), JSON.stringify(body)).toEqual({
        ok: false,
        error: 'invalid_action',
        status: 400,
      })
    }
  })

  it('serviceTick : le tick bot tombe au délai du client (espionBotTickDelayMs, borne haute), l’échéance reste due', () => {
    const s = table()
    const now = s.phaseEndsAt! - s.discussionMs
    const tick = adapter.serviceTick!(s, now)!
    const clientDelay = espionBotTickDelayMs(toEspionSpectatorView(s), now, () => 1)!
    expect(tick).toEqual({ body: { action: 'bot' }, dueAt: now + clientDelay })
    for (const r of [0, 0.5, 0.999]) {
      expect(espionBotTickDelayMs(toEspionSpectatorView(s), now, () => r)!).toBeLessThanOrEqual(clientDelay)
    }
    // Tick bot déjà refusé sur cette version : seule l'échéance du chrono reste.
    expect(adapter.serviceTick!(s, now, { skipBot: true })).toEqual({
      body: { action: 'advance', phaseKey: phaseKey(s) },
      dueAt: s.phaseEndsAt,
    })
  })
})

describe('Petit Buveur : bots de l’hôte, tour joué par le serveur', () => {
  const adapter = GAME_ADAPTERS['petit-buveur']
  const NOW = 1_700_000_000_000
  /** Un hôte seul + 1 bot, le bot ayant la main. */
  const botToPlay = (): EngineState => ({
    ...buildPetitBuveurEngineState([{ userId: 'u1', displayName: 'Alice' }], 'normal', 'pb-tick', 1),
    currentPlayer: 1,
  })

  it('se complète avec des bots (lobby et lancement)', () => {
    expect(adapter.botsFillable).toBe(true)
  })

  it('tour d’un bot : tick « bot » au tempo de son persona, puis coup accepté', () => {
    const state = botToPlay()
    const persona = personaForBotName(state.players[1].name)!
    expect(persona).toBeTruthy()
    const tick = adapter.serviceTick!(state, NOW)
    expect(tick).toEqual({ body: { action: 'bot' }, dueAt: NOW + persona.tempoMaxMs })
    // Le corps que le filet serveur s'applique à lui-même : un coup du bot.
    const result = adapter.applyAction(state, 'u1', tick!.body)
    expect(result.ok).toBe(true)
  })

  it('tour de l’humain : rien à attendre côté serveur', () => {
    const state: EngineState = { ...botToPlay(), currentPlayer: 0 }
    expect(adapter.serviceTick!(state, NOW)).toBeNull()
  })
})

describe('Tabou Vocal : pas de bots au lancement, remplacement intact', () => {
  const adapter = GAME_ADAPTERS.tabou
  const members = ['u1', 'u2', 'u3', 'u4'].map((userId) => ({ userId, displayName: userId }))
  const teams = { u1: 'A', u2: 'A', u3: 'B', u4: 'B' } as const

  it('ne se complète pas avec des bots (un bot ne décrit rien)', () => {
    expect(adapter.botsFillable).toBeFalsy()
    const state = buildTabouState(members, { ...teams }, 'fr', 0, 'tabou-seed')
    expect(state.players.some((p) => p.isBot)).toBe(false)
  })

  it('un joueur parti depuis le délai de grâce est remplacé par un bot quand même', () => {
    const state = buildTabouState(members, { ...teams }, 'fr', 0, 'tabou-seed')
    const left = markTabouPlayerLeft(state, 'u1', Date.now() - ONLINE_REPLACE_GRACE_MS - 1_000)
    expect(left).not.toBeNull()
    const result = adapter.applyAction(left, 'u2', { action: 'replace-left' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      const u1 = (result.state as TabouState).players.find((p) => p.id === 'u1')
      expect(u1?.isBot).toBe(true)
    }
  })

  it('un joueur inactif peut être converti en bot (replace-afk)', () => {
    const state = buildTabouState(members, { ...teams }, 'fr', 0, 'tabou-seed')
    const converted = adapter.convertToBot(state, 'u3') as TabouState | null
    expect(converted?.players.find((p) => p.id === 'u3')?.isBot).toBe(true)
  })
})

describe('Loup-Garou : parole humaine au débat (debate-speak)', () => {
  const adapter = GAME_ADAPTERS['loup-garou']
  /** 1 humain + 3 bots, posés en plein débat. */
  const debating = (): LGState => ({
    ...buildLGState([{ userId: 'u1', user: { displayName: 'Riri' } }], undefined, 3, 42),
    phase: 'day-debate',
    phaseEndsAt: Date.now() + 60_000,
    round: 1,
  })
  const speak = (state: LGState, body: Record<string, unknown>) =>
    adapter.applyAction(state, 'u1', { action: 'debate-speak', ...body })

  it('accuser / se défendre / faire équipe entre dans debateSpeech', () => {
    const result = speak(debating(), { kind: 'suspect', targetId: 'bot-1' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect((result.state as LGState).debateSpeech).toEqual([
        { playerId: 'u1', kind: 'suspect', targetId: 'bot-1', round: 1 },
      ])
    }
    for (const kind of ['defend', 'ally']) {
      expect(speak(debating(), { kind, targetId: 'bot-1' }).ok).toBe(true)
    }
  })

  it('kind hors liste ou cible absente → invalid_action 400', () => {
    expect(speak(debating(), { kind: 'rally', targetId: 'bot-1' })).toEqual({
      ok: false,
      error: 'invalid_action',
      status: 400,
    })
    expect(speak(debating(), { kind: 'suspect' })).toEqual({
      ok: false,
      error: 'invalid_action',
      status: 400,
    })
  })

  it('refus du moteur → 403 (mort : NOT_ALIVE ; soi-même : INVALID_TARGET)', () => {
    const base = debating()
    const dead: LGState = {
      ...base,
      players: base.players.map((p) => (p.id === 'u1' ? { ...p, alive: false } : p)),
    }
    expect(speak(dead, { kind: 'suspect', targetId: 'bot-1' })).toEqual({
      ok: false,
      error: 'NOT_ALIVE',
      status: 403,
    })
    expect(speak(base, { kind: 'suspect', targetId: 'u1' })).toEqual({
      ok: false,
      error: 'INVALID_TARGET',
      status: 403,
    })
  })
})

describe('Menteur : Calza humain et statuts des refus', () => {
  const adapter = GAME_ADAPTERS.menteur
  /** 1 humain + 3 bots (table d'essai solo), l'humain au tour face à l'enchère d'un bot. */
  const humanFacingBid = (calza: boolean): MenteurState => {
    const built = buildMenteurState([{ userId: 'u1', user: { displayName: 'Riri' } }], 3, 7, { calza })
    const bot = built.players.find((p) => p.isBot)!
    return {
      ...built,
      phase: 'bidding',
      turnIdx: built.players.findIndex((p) => p.id === 'u1'),
      currentBid: { qty: 3, face: 4, by: bot.id },
    }
  }

  it('calza passe quand la règle est active (le bouton répondait invalid_action)', () => {
    const result = adapter.applyAction(humanFacingBid(true), 'u1', { action: 'calza' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect((result.state as MenteurState).lastReveal).toMatchObject({ mode: 'calza', challengerId: 'u1' })
    }
  })

  it('règle désactivée : CALZA_DISABLED est une interdiction (403)', () => {
    expect(adapter.applyAction(humanFacingBid(false), 'u1', { action: 'calza' })).toEqual({
      ok: false,
      error: 'CALZA_DISABLED',
      status: 403,
    })
  })

  it('tick bot pendant le tour de l’humain : NOT_BOT_TURN est un conflit attendu (409)', () => {
    expect(adapter.applyAction(humanFacingBid(true), 'u1', { action: 'bot' })).toEqual({
      ok: false,
      error: 'NOT_BOT_TURN',
      status: 409,
    })
  })

  it('les autres refus du moteur restent des interdictions (403)', () => {
    const s = humanFacingBid(true)
    const bot = s.players.find((p) => p.isBot)!
    expect(adapter.applyAction(s, bot.id, { action: 'dudo' })).toEqual({
      ok: false,
      error: 'NOT_YOUR_TURN',
      status: 403,
    })
    expect(adapter.applyAction(s, 'u1', { action: 'bid', qty: 2, face: 4 })).toEqual({
      ok: false,
      error: 'ILLEGAL_BID',
      status: 403,
    })
  })

  it('un `say` envoyé par un humain est ignoré : le coup passe, sans parole', () => {
    const s = humanFacingBid(true)
    const bot = s.players.find((p) => p.isBot)!
    const next = s.players[(s.turnIdx + 1) % s.players.length]
    const bid = adapter.applyAction(s, 'u1', { action: 'bid', qty: 4, face: 4, say: { kind: 'sure', targetId: next.id } })
    expect(bid.ok).toBe(true)
    if (bid.ok) {
      expect((bid.state as MenteurState).currentBid).toEqual({ qty: 4, face: 4, by: 'u1' })
      expect((bid.state as MenteurState).speech).toEqual([])
    }
    const dudo = adapter.applyAction(s, 'u1', { action: 'dudo', say: { kind: 'suspect', targetId: bot.id } })
    expect(dudo.ok).toBe(true)
    if (dudo.ok) expect((dudo.state as MenteurState).speech).toEqual([])
  })
})

describe('Imposteur : indice humain par POST', () => {
  const adapter = GAME_ADAPTERS.imposteur
  /** 1 humain + 4 bots, l'humain au tour d'indice. */
  const humanTurn = (): ImposteurState => {
    const built = buildImposteurState([{ userId: 'u1', user: { displayName: 'Riri' } }], 'fr', 4, 7)
    return {
      ...built,
      phase: 'clue',
      phaseEndsAt: Date.now() + 45_000,
      clueOrder: ['u1', ...built.clueOrder.filter((id) => id !== 'u1')],
      clueTurnIdx: 0,
    }
  }
  const clue = (text: unknown) => adapter.applyAction(humanTurn(), 'u1', { action: 'clue', text })

  it('« … » est refusé (403) : réservé à l’indice automatique du muet', () => {
    expect(clue(IMPOSTEUR_EMPTY_CLUE)).toEqual({ ok: false, error: 'INVALID_CLUE', status: 403 })
    expect(clue(` ${IMPOSTEUR_EMPTY_CLUE}  `)).toEqual({ ok: false, error: 'INVALID_CLUE', status: 403 })
  })

  it('un vrai indice passe ; un corps sans texte reste une action invalide (400)', () => {
    const result = clue('indice')
    expect(result.ok).toBe(true)
    if (result.ok) expect((result.state as ImposteurState).clues).toEqual([{ playerId: 'u1', text: 'indice', round: 1 }])
    expect(clue(42)).toEqual({ ok: false, error: 'invalid_action', status: 400 })
  })
})

describe('Imposteur : paroles humaines et tick bot', () => {
  const adapter = GAME_ADAPTERS.imposteur
  /** 1 humain + 4 bots, au vote (aucun bot n'a voté). */
  const atVote = (): ImposteurState => {
    const built = buildImposteurState([{ userId: 'u1', user: { displayName: 'Riri' } }], 'fr', 4, 7)
    return { ...built, phase: 'vote', phaseEndsAt: Date.now() + 60_000, clueTurnIdx: built.clueOrder.length }
  }

  it('speak est mappé : Accuser / Me défendre passent, le fil grandit', () => {
    const s = atVote()
    const result = adapter.applyAction(s, 'u1', { action: 'speak', kind: 'suspect', targetId: 'bot-1' })
    expect(result.ok).toBe(true)
    if (result.ok) {
      expect((result.state as ImposteurState).speech).toEqual([{ playerId: 'u1', kind: 'suspect', targetId: 'bot-1', round: 1 }])
    }
    expect(adapter.applyAction(s, 'u1', { action: 'speak', kind: 'defend', targetId: 'bot-2' }).ok).toBe(true)
  })

  it('un kind réservé aux bots est une interdiction (INVALID_KIND, 403), pas une action mal formée', () => {
    for (const kind of ['intent', 'ask', 'rally', 'toldYou', 'nimporte']) {
      expect(adapter.applyAction(atVote(), 'u1', { action: 'speak', kind, targetId: 'bot-1' }), kind).toEqual({
        ok: false,
        error: 'INVALID_KIND',
        status: 403,
      })
    }
  })

  it('corps incomplet ou inconnu : 400', () => {
    expect(adapter.applyAction(atVote(), 'u1', { action: 'speak', kind: 'suspect' })).toEqual({
      ok: false,
      error: 'invalid_action',
      status: 400,
    })
    expect(adapter.applyAction(atVote(), 'u1', { action: 'speak', targetId: 'bot-1' }).ok).toBe(false)
    expect(adapter.applyAction(atVote(), 'u1', { action: 'chuchoter' })).toEqual({
      ok: false,
      error: 'invalid_action',
      status: 400,
    })
  })

  it('tick bot « au cas où » sans bot concerné : NOT_BOT_TURN est un conflit attendu (409)', () => {
    const s = atVote()
    const voted = Object.fromEntries(s.players.filter((p) => p.isBot).map((p) => [p.id, 'u1']))
    expect(adapter.applyAction({ ...s, pendingVotes: voted }, 'u1', { action: 'bot' })).toEqual({
      ok: false,
      error: 'NOT_BOT_TURN',
      status: 409,
    })
    // Bots sans vote : le tick réussit toujours (une parole ou le vote groupé).
    expect(adapter.applyAction(s, 'u1', { action: 'bot' }).ok).toBe(true)
  })
})
