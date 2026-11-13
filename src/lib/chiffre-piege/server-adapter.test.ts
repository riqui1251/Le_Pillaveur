import { describe, expect, it, vi } from 'vitest'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import { phaseKey } from '@/lib/online/phase-clock'
import { currentChiffrePiegePlayerId, toChiffrePiegePublicView, type ChiffrePiegeState } from './engine'
import {
  CHIFFRE_PIEGE_ONLINE_BOOM_MS,
  CHIFFRE_PIEGE_ONLINE_MAX_PLAYERS,
  CHIFFRE_PIEGE_ONLINE_READ_MS,
  chiffrePiegeBotTickDelayMs,
  chiffrePiegeContinueAt,
  currentChiffrePiegeActorId,
  parseChiffrePiegeClientView,
  type ChiffrePiegeOnlineState,
} from './online-state'
import {
  applyChiffrePiegeBotAction,
  applyChiffrePiegeRoomAction,
  buildChiffrePiegeState,
  chiffrePiegeBotMove,
  chiffrePiegeClientViewJson,
  chiffrePiegeEntropy,
  chiffrePiegeSpectatorViewJson,
  convertChiffrePiegePlayerToBot,
  markChiffrePiegePlayerLeft,
  parseChiffrePiegeState,
  rejoinChiffrePiegePlayer,
  serializeChiffrePiegeState,
  toChiffrePiegeClientView,
  type ChiffrePiegeEntropy,
  type ChiffrePiegeRoomActionInput,
  type ChiffrePiegeRoomActionResult,
  type ChiffrePiegeRoomMember,
} from './server-adapter'
import { chiffrePiegeMatchOutcomes } from './match-outcomes'

/** Horloge FIXE : BOUM, lecture et échéances restent déterministes. */
const T0 = 1_790_000_000_000

/** Hasard « frais » rejoué dans l'ordre (en boucle) : les manches suivantes restent rejouables. */
function entropyOf(...values: number[]): ChiffrePiegeEntropy {
  let index = 0
  return () => values[index++ % values.length]
}

const members = (n: number): ChiffrePiegeRoomMember[] =>
  Array.from({ length: n }, (_, i) => ({ userId: `u${i + 1}`, user: { displayName: `Joueur ${i + 1}` } }))

function accepted(result: ChiffrePiegeRoomActionResult): ChiffrePiegeOnlineState {
  if (!result.ok) throw new Error(`refus inattendu : ${result.error}`)
  return result.state
}

function refusal(result: ChiffrePiegeRoomActionResult): string | null {
  return result.ok ? null : result.error
}

/** Table posée à la main : 3 humains (u1 au tour), piège en 42, plage 1-100, 3 manches. */
function table(game: Partial<ChiffrePiegeState> = {}, botsCount = 0, humans = 3): ChiffrePiegeOnlineState {
  const built = buildChiffrePiegeState(members(humans), botsCount, 'soirée', { max: 100, rounds: 3 })
  return { ...built, game: { ...built.game, turnIndex: 0, trap: 42, ...game } }
}

const act = (
  state: ChiffrePiegeOnlineState,
  userId: string,
  input: ChiffrePiegeRoomActionInput,
  now = T0,
  entropy: ChiffrePiegeEntropy = entropyOf(0x2f6b9d41)
) => applyChiffrePiegeRoomAction(state, userId, input, now, entropy)

/** Le joueur au tour tente `value`. */
function guess(state: ChiffrePiegeOnlineState, value: number, now = T0): ChiffrePiegeOnlineState {
  return accepted(act(state, currentChiffrePiegePlayerId(state.game) ?? '', { type: 'guess', value }, now))
}

describe('construction de la table', () => {
  it('humains dans l’ordre de la salle, puis les bots de l’hôte (bot-1…), sans persona en double', () => {
    const state = buildChiffrePiegeState(members(2), 3, 'graine')
    expect(state.players.map((p) => p.id)).toEqual(['u1', 'u2', 'bot-1', 'bot-2', 'bot-3'])
    expect(state.players.map((p) => p.isBot)).toEqual([false, false, true, true, true])
    expect(new Set(state.players.map((p) => p.name)).size).toBe(5)
    expect(state.players.every((p) => p.leftAt === null)).toBe(true)
    expect(state.game.playerIds).toEqual(state.players.map((p) => p.id))
  })

  it('complète jusqu’au minimum sans bot demandé (relance après des départs)', () => {
    const state = buildChiffrePiegeState(members(1), 0, 'seul')
    expect(state.players.map((p) => p.id)).toEqual(['u1', 'bot-1'])
  })

  it(`jamais plus de ${CHIFFRE_PIEGE_ONLINE_MAX_PLAYERS} joueurs, et un nombre de bots illisible vaut zéro`, () => {
    expect(buildChiffrePiegeState(members(14), 11, 'foule').players).toHaveLength(CHIFFRE_PIEGE_ONLINE_MAX_PLAYERS)
    expect(buildChiffrePiegeState(members(3), Number.NaN, 'nan').players).toHaveLength(3)
    expect(buildChiffrePiegeState(members(3), -4, 'négatif').players).toHaveLength(3)
  })

  it('reproductible à graine égale, différente sinon', () => {
    expect(buildChiffrePiegeState(members(2), 2, 'même')).toEqual(buildChiffrePiegeState(members(2), 2, 'même'))
    const traps = new Set(['a', 'b', 'c', 'd', 'e', 'f'].map((seed) => buildChiffrePiegeState(members(2), 0, seed).game.trap))
    expect(traps.size).toBeGreaterThan(1)
  })

  it('lancement réel : partie, noms et coups des bots sur trois tirages indépendants', () => {
    const entropy = vi.fn(entropyOf(11, 22, 33))
    const base = buildChiffrePiegeState(members(1), 3, undefined, {}, entropy)
    expect(entropy).toHaveBeenCalledTimes(3)
    // Autres bots (noms publics, coups publics), même tirage de partie : le piège ne bouge pas.
    const otherBots = buildChiffrePiegeState(members(1), 3, undefined, {}, entropyOf(11, 98, 99))
    expect(otherBots.game).toEqual(base.game)
    expect(otherBots.players.map((p) => p.name)).not.toEqual(base.players.map((p) => p.name))
    expect(otherBots.rngState).not.toBe(base.rngState)
    // Mêmes bots, autre tirage de partie : seuls le premier joueur et le piège changent.
    const otherGame = buildChiffrePiegeState(members(1), 3, undefined, {}, entropyOf(12, 22, 33))
    expect(otherGame.players).toEqual(base.players)
    expect(otherGame.rngState).toBe(base.rngState)
    expect([otherGame.game.turnIndex, otherGame.game.trap]).not.toEqual([base.game.turnIndex, base.game.trap])
  })

  it('réglages de l’hôte appliqués, défauts du jeu local pour une valeur hors liste', () => {
    const custom = buildChiffrePiegeState(members(2), 0, 'r', { max: 200, rounds: 10 })
    expect([custom.game.max, custom.game.roundsTotal, custom.game.high]).toEqual([200, 10, 200])
    const odd = buildChiffrePiegeState(members(2), 0, 'r', { max: 75, rounds: '3' })
    expect([odd.game.max, odd.game.roundsTotal]).toEqual([100, 5])
    expect(buildChiffrePiegeState(members(2), 0, 'r').game.max).toBe(100)
  })

  it('socle des jeux en ligne : version, phase, horloge, votes, hasard du serveur', () => {
    const state = buildChiffrePiegeState(members(3), 0, 'socle')
    expect(state.version).toBe(1)
    expect(state.phase).toBe('playing')
    expect(state.phaseEndsAt).toBeNull()
    expect(typeof state.phaseSeq).toBe('number')
    expect(state.rematchVotes).toEqual([])
    expect(Number.isInteger(state.rngState)).toBe(true)
    expect(currentChiffrePiegeActorId(state)).toBe(state.players[state.game.turnIndex].id)
  })
})

describe('lecture de l’état persisté', () => {
  it('aller-retour sans perte', () => {
    const state = guess(table(), 30)
    expect(parseChiffrePiegeState(serializeChiffrePiegeState(state))).toEqual(state)
  })

  it('champs ajoutés après coup complétés, jamais d’exception sur un JSON illisible', () => {
    const { rematchVotes: _votes, phaseSeq: _seq, phaseEndsAt: _ends, ...old } = table()
    expect(parseChiffrePiegeState(JSON.stringify(old))).toMatchObject({ rematchVotes: [], phaseSeq: 0, phaseEndsAt: null })
    for (const json of [null, '', '{', 'null', '[]', '{}', '42', '{"version":1,"phase":"playing","players":[],"rngState":1}']) {
      expect(() => parseChiffrePiegeState(json)).not.toThrow()
      expect(parseChiffrePiegeState(json)).toBeNull()
    }
  })
})

describe('coups des joueurs', () => {
  it('un essai raté resserre l’intervalle et passe la main, sans toucher à l’horloge', () => {
    const before = table()
    const after = guess(before, 30)
    expect([after.game.low, after.game.high]).toEqual([31, 100])
    expect(currentChiffrePiegeActorId(after)).toBe('u2')
    expect(after.version).toBe(before.version + 1)
    expect([after.phase, after.phaseSeq, after.phaseEndsAt]).toEqual(['playing', before.phaseSeq, null])
  })

  it('refus lisibles : pas son tour, hors intervalle, joker déjà grillé, inconnu', () => {
    const state = guess(table(), 30)
    expect(refusal(act(state, 'u1', { type: 'guess', value: 50 }))).toBe('NOT_YOUR_TURN')
    expect(refusal(act(state, 'u2', { type: 'guess', value: 30 }))).toBe('OUT_OF_RANGE')
    expect(refusal(act(state, 'zoé', { type: 'pass' }))).toBe('UNKNOWN_PLAYER')
    const passed = accepted(act(state, 'u2', { type: 'pass' }))
    expect(passed.game.jokersUsed.u2).toBe(true)
    const backToU2 = guess(guess(passed, 90), 35)
    expect(currentChiffrePiegeActorId(backToU2)).toBe('u2')
    expect(refusal(act(backToU2, 'u2', { type: 'pass' }))).toBe('JOKER_USED')
  })

  it('BOUM : phase chronométrée, lecture minimale avant la manche suivante', () => {
    const before = guess(table(), 30)
    const boom = guess(before, 42, T0 + 5_000)
    expect(boom.phase).toBe('boom')
    expect(boom.phaseSeq).toBe(before.phaseSeq + 1)
    expect(boom.phaseEndsAt).toBe(T0 + 5_000 + CHIFFRE_PIEGE_ONLINE_BOOM_MS)
    expect(boom.game.lastBoom).toMatchObject({ playerId: 'u2', trap: 42, attempts: 2, penalty: 2, at: T0 + 5_000 })
    expect(chiffrePiegeContinueAt(boom)).toBe(T0 + 5_000 + CHIFFRE_PIEGE_ONLINE_READ_MS)
    expect(currentChiffrePiegeActorId(boom)).toBeNull()
  })
})

describe('après le BOUM', () => {
  const boomed = () => guess(table(), 42)

  it('« Manche suivante » : un joueur présent, la clé du BOUM, après la lecture', () => {
    const boom = boomed()
    const key = phaseKey(boom)
    const readAt = T0 + CHIFFRE_PIEGE_ONLINE_READ_MS
    expect(refusal(act(boom, 'u2', { type: 'next', phaseKey: key }, readAt - 1))).toBe('READING_TIME')
    expect(refusal(act(boom, 'u2', { type: 'next', phaseKey: 'boom#0' }, readAt))).toBe('PHASE_CHANGED')
    expect(refusal(act(boom, 'zoé', { type: 'next', phaseKey: key }, readAt))).toBe('UNKNOWN_PLAYER')
    const next = accepted(act(boom, 'u3', { type: 'next', phaseKey: key }, readAt))
    expect(next.phase).toBe('playing')
    expect(next.game.roundIndex).toBe(1)
    expect([next.game.low, next.game.high, next.game.history]).toEqual([1, 100, []])
    // La manche s'ouvre au voisin du perdant (u1).
    expect(currentChiffrePiegeActorId(next)).toBe('u2')
    expect([next.phaseSeq, next.phaseEndsAt]).toEqual([boom.phaseSeq + 1, null])
    // Le second appui arrive sur la manche suivante : course muette.
    expect(refusal(act(next, 'u2', { type: 'next', phaseKey: key }, readAt))).toBe('PHASE_CHANGED')
  })

  it('un parti ou un bot ne relance pas la manche', () => {
    const left = markChiffrePiegePlayerLeft(boomed(), 'u3', T0)!
    const readAt = T0 + CHIFFRE_PIEGE_ONLINE_READ_MS
    expect(refusal(act(left, 'u3', { type: 'next', phaseKey: phaseKey(left) }, readAt))).toBe('UNKNOWN_PLAYER')
    const withBot = guess(table({}, 1, 1), 42)
    expect(refusal(act(withBot, 'bot-1', { type: 'next', phaseKey: phaseKey(withBot) }, readAt))).toBe('UNKNOWN_PLAYER')
  })

  it('l’échéance du BOUM fait avancer, une seule fois, jamais avant l’heure', () => {
    const boom = boomed()
    const key = phaseKey(boom)
    const dueAt = boom.phaseEndsAt!
    expect(refusal(act(boom, '__service__', { type: 'advance', phaseKey: key }, dueAt - 1))).toBe('NOT_EXPIRED')
    const next = accepted(act(boom, '__service__', { type: 'advance', phaseKey: key }, dueAt))
    expect(next.game.roundIndex).toBe(1)
    expect(refusal(act(next, '__service__', { type: 'advance', phaseKey: key }, dueAt))).toBe('PHASE_CHANGED')
    expect(refusal(act(next, '__service__', { type: 'advance', phaseKey: phaseKey(next) }, dueAt))).toBe('NO_DEADLINE')
  })

  it('le BOUM de la dernière manche mène au classement', () => {
    const last = guess(table({ roundIndex: 2 }), 42)
    const done = accepted(act(last, '__service__', { type: 'advance', phaseKey: phaseKey(last) }, last.phaseEndsAt!))
    expect([done.phase, done.game.phase, done.phaseEndsAt]).toEqual(['finished', 'finished', null])
    expect(currentChiffrePiegeActorId(done)).toBeNull()
    expect(refusal(act(done, 'u1', { type: 'guess', value: 10 }))).toBe('WRONG_PHASE')
  })
})

describe('hasard des pièges : rien de public ne prédit le suivant', () => {
  /** Piège de la manche que l'échéance du BOUM ouvre, sur le hasard frais donné. */
  const nextTrap = (boom: ChiffrePiegeOnlineState, entropy: ChiffrePiegeEntropy) =>
    accepted(act(boom, '__service__', { type: 'advance', phaseKey: phaseKey(boom) }, boom.phaseEndsAt!, entropy)).game.trap

  it('chaque manche tire son piège sur un hasard frais, pas sur la suite des précédents', () => {
    const boom = guess(table(), 42)
    // Même passé (pièges révélés, graine de la partie), hasard frais différent : le piège change.
    expect(new Set([1, 2, 3, 4, 5, 6].map((fresh) => nextTrap(boom, entropyOf(fresh)))).size).toBeGreaterThan(1)
    // Autre passé, même hasard frais : même piège. L'histoire de la partie n'y entre pas.
    const otherPast = { ...boom, game: { ...boom.game, rngState: (boom.game.rngState ^ 0x5bd1e995) >>> 0 } }
    expect(nextTrap(otherPast, entropyOf(7))).toBe(nextTrap(boom, entropyOf(7)))
    // « Manche suivante » d'un joueur : même tirage que l'échéance.
    const asked = act(boom, 'u2', { type: 'next', phaseKey: phaseKey(boom) }, T0 + CHIFFRE_PIEGE_ONLINE_READ_MS, entropyOf(7))
    expect(accepted(asked).game.trap).toBe(nextTrap(boom, entropyOf(7)))
  })

  it('deux parties aux cinq premiers pièges égaux n’ont pas les mêmes pièges suivants', () => {
    const traps = (entropy: ChiffrePiegeEntropy): number[] => {
      let state = buildChiffrePiegeState(members(1), 2, 'jumelles', { rounds: 10 })
      const seen: number[] = []
      for (let step = 0; step < 3_000 && state.phase !== 'finished'; step += 1) {
        if (state.phase === 'boom') {
          seen.push(state.game.lastBoom!.trap)
          state = accepted(act(state, '__service__', { type: 'advance', phaseKey: phaseKey(state) }, state.phaseEndsAt!, entropy))
        } else {
          state = currentChiffrePiegeActorId(state) === 'u1' ? guess(state, state.game.low) : accepted(applyChiffrePiegeBotAction(state, T0))
        }
      }
      return seen
    }
    const a = traps(entropyOf(1, 2, 3, 4, 5, 6, 7, 8, 9))
    const b = traps(entropyOf(1, 2, 3, 4, 50, 60, 70, 80, 90))
    expect([a.length, b.length]).toEqual([10, 10])
    expect(b.slice(0, 5)).toEqual(a.slice(0, 5))
    expect(b.slice(5)).not.toEqual(a.slice(5))
  })

  it('le hasard du serveur : des entiers de 32 bits tirés par crypto', () => {
    const draws = Array.from({ length: 8 }, () => chiffrePiegeEntropy())
    for (const n of draws) {
      expect(Number.isInteger(n) && n >= 0 && n < 2 ** 32).toBe(true)
    }
    expect(new Set(draws).size).toBeGreaterThan(1)
  })
})

describe('bots', () => {
  /** u1 humain, puis bot-1 et bot-2 ; `turnIndex` désigne qui a la main. */
  const withBots = (game: Partial<ChiffrePiegeState> = {}) => table({ turnIndex: 1, ...game }, 2, 1)

  it('rien à faire hors du tour d’un bot : NOT_BOT_TURN, jamais d’écriture à vide', () => {
    expect(refusal(applyChiffrePiegeBotAction(withBots({ turnIndex: 0 }), T0))).toBe('NOT_BOT_TURN')
    expect(refusal(applyChiffrePiegeBotAction(guess(withBots(), 42), T0))).toBe('NOT_BOT_TURN')
    expect(refusal(applyChiffrePiegeBotAction(table(), T0))).toBe('NOT_BOT_TURN')
  })

  it('un nombre de l’intervalle, tiré par le hasard du serveur (rejouable)', () => {
    const state = withBots({ low: 31, high: 47, trap: 40 })
    const once = accepted(applyChiffrePiegeBotAction(state, T0))
    expect(once).toEqual(accepted(applyChiffrePiegeBotAction(state, T0)))
    expect(once.rngState).not.toBe(state.rngState)
    expect(once.version).toBe(state.version + 1)
    const lastMove = once.game.history[once.game.history.length - 1]
    const played = lastMove?.kind === 'guess' ? lastMove.value : once.game.lastBoom?.trap
    expect(played).toBeGreaterThanOrEqual(31)
    expect(played).toBeLessThanOrEqual(47)
  })

  it('tirage uniforme sur l’intervalle, bornes comprises', () => {
    const view = toChiffrePiegePublicView(withBots({ low: 10, high: 13 }).game)
    const seen = [0, 0.26, 0.51, 0.76, 0.9999].map((r) => chiffrePiegeBotMove(view, 'bot-1', () => r))
    expect(seen).toEqual([10, 11, 12, 13, 13].map((value) => ({ kind: 'guess', value })))
  })

  it('le dernier nombre : joker s’il lui en reste un, sinon il le joue', () => {
    const forced = withBots({ low: 42, high: 42 })
    const passed = accepted(applyChiffrePiegeBotAction(forced, T0))
    expect(passed.game.jokersUsed['bot-1']).toBe(true)
    expect(passed.game.history[passed.game.history.length - 1]).toEqual({ kind: 'pass', playerId: 'bot-1' })
    const noJoker = withBots({ low: 42, high: 42, jokersUsed: { u1: false, 'bot-1': true, 'bot-2': false } })
    const boom = accepted(applyChiffrePiegeBotAction(noJoker, T0))
    expect(boom.phase).toBe('boom')
    expect(boom.game.lastBoom?.playerId).toBe('bot-1')
  })

  it('ne lit jamais le piège : même coup quel que soit le nombre caché', () => {
    const a = withBots({ low: 20, high: 60, trap: 21 })
    const b = withBots({ low: 20, high: 60, trap: 59 })
    expect(chiffrePiegeBotMove(toChiffrePiegePublicView(a.game), 'bot-1', () => 0.5)).toEqual(
      chiffrePiegeBotMove(toChiffrePiegePublicView(b.game), 'bot-1', () => 0.5)
    )
    const moveOf = (s: ChiffrePiegeOnlineState) => {
      const next = accepted(applyChiffrePiegeBotAction(s, T0))
      const last = next.game.history[next.game.history.length - 1]
      return last?.kind === 'guess' ? last.value : next.game.lastBoom?.trap
    }
    expect(moveOf(a)).toBe(moveOf(b))
  })

  it('une partie entière se joue jusqu’au classement', () => {
    let state = buildChiffrePiegeState(members(1), 3, 'partie', { rounds: 3 })
    let now = T0
    for (let step = 0; step < 500 && state.phase !== 'finished'; step += 1) {
      now += 1_000
      if (state.phase === 'boom') {
        state = accepted(act(state, '__service__', { type: 'advance', phaseKey: phaseKey(state) }, state.phaseEndsAt!))
        continue
      }
      const actorId = currentChiffrePiegeActorId(state)!
      state = actorId === 'u1' ? guess(state, state.game.low, now) : accepted(applyChiffrePiegeBotAction(state, now))
    }
    expect(state.phase).toBe('finished')
    const booms = Object.values(state.game.booms).reduce((sum, n) => sum + n, 0)
    expect(booms).toBe(3)
  })
})

describe('départs et retours', () => {
  /** Dernier coup de la manche (raté ou joker), ou le BOUM : qui a joué. */
  const lastPlayerOf = (state: ChiffrePiegeOnlineState) =>
    state.phase === 'boom' ? state.game.lastBoom?.playerId : state.game.history[state.game.history.length - 1]?.playerId

  it('le partant garde sa place : la main ne le saute pas, son siège joue pour lui', () => {
    const before = table()
    const left = markChiffrePiegePlayerLeft(before, 'u1', T0)!
    expect(left.players[0].leftAt).toBe(T0)
    expect(left.version).toBe(before.version + 1)
    expect(left.game).toEqual(before.game)
    expect(currentChiffrePiegeActorId(left)).toBe('u1')
    expect(refusal(act(left, 'u2', { type: 'guess', value: 10 }))).toBe('NOT_YOUR_TURN')
    // Même délai que pour un bot, au téléphone arbitre comme au serveur.
    expect(chiffrePiegeBotTickDelayMs(left, () => 1)).toBe(4_000)
    const played = accepted(applyChiffrePiegeBotAction(left, T0))
    expect(lastPlayerOf(played)).toBe('u1')
    expect(played.version).toBe(left.version + 1)
  })

  it('quitter sur le dernier nombre sans joker : le BOUM est pour le partant', () => {
    const forced = table({ low: 42, high: 42, jokersUsed: { u1: true, u2: false, u3: false } })
    expect(refusal(act(forced, 'u1', { type: 'pass' }))).toBe('JOKER_USED')
    // Quitter puis rejoindre aussitôt : la main l'attend toujours.
    const back = rejoinChiffrePiegePlayer(markChiffrePiegePlayerLeft(forced, 'u1', T0)!, 'u1')!
    expect(currentChiffrePiegeActorId(back)).toBe('u1')
    expect(refusal(applyChiffrePiegeBotAction(back, T0))).toBe('NOT_BOT_TURN')
    // Parti pour de bon : son siège joue le dernier nombre, et le revenant le retrouve compté.
    const boom = accepted(applyChiffrePiegeBotAction(markChiffrePiegePlayerLeft(forced, 'u1', T0)!, T0))
    expect(boom.phase).toBe('boom')
    expect(boom.game.lastBoom).toMatchObject({ playerId: 'u1', trap: 42, penalty: 1 })
    expect(boom.game.penalties).toEqual({ u1: 1, u2: 0, u3: 0 })
    expect(rejoinChiffrePiegePlayer(boom, 'u1')!.game.penalties.u1).toBe(1)
  })

  it('le dernier nombre d’un partant qui a encore son joker : le joker part, il coûte', () => {
    const left = markChiffrePiegePlayerLeft(table({ low: 42, high: 42 }), 'u1', T0)!
    const passed = accepted(applyChiffrePiegeBotAction(left, T0))
    expect(passed.game.history).toEqual([{ kind: 'pass', playerId: 'u1' }])
    expect([passed.game.jokersUsed.u1, passed.game.penalties.u1]).toEqual([true, 1])
    expect(currentChiffrePiegeActorId(passed)).toBe('u2')
  })

  it('partir avant son tour ne l’enjambe pas : le dernier nombre lui revient', () => {
    // u1 au tour sur [41, 42], piège en 42 ; u2, sans joker, part pendant ce tour.
    const state = table({ low: 41, high: 42, jokersUsed: { u1: false, u2: true, u3: true } })
    const missed = guess(markChiffrePiegePlayerLeft(state, 'u2', T0)!, 41)
    expect(currentChiffrePiegeActorId(missed)).toBe('u2')
    expect(currentChiffrePiegeActorId(rejoinChiffrePiegePlayer(missed, 'u2')!)).toBe('u2')
    const boom = accepted(applyChiffrePiegeBotAction(missed, T0))
    expect(boom.game.lastBoom).toMatchObject({ playerId: 'u2', trap: 42, penalty: 2 })
  })

  it('jamais figé sur un parti : un revenant trouve son coup joué par le serveur', () => {
    // Deux humains : u2 part, puis u1 au tour ; personne à table, rien ne bouge.
    let state = table({}, 0, 2)
    state = markChiffrePiegePlayerLeft(state, 'u2', T0)!
    state = markChiffrePiegePlayerLeft(state, 'u1', T0 + 1_000)!
    expect(currentChiffrePiegeActorId(state)).toBe('u1')
    // u2 revient : le siège de u1 joue (tick « bot »), la main ne reste pas sur un absent.
    state = rejoinChiffrePiegePlayer(state, 'u2')!
    expect(refusal(act(state, 'u2', { type: 'guess', value: 10 }))).toBe('NOT_YOUR_TURN')
    expect(chiffrePiegeBotTickDelayMs(state, () => 1)).not.toBeNull()
    const played = accepted(applyChiffrePiegeBotAction(state, T0 + 2_000))
    expect(lastPlayerOf(played)).toBe('u1')
    if (played.phase === 'playing') expect(currentChiffrePiegeActorId(played)).toBe('u2')
  })

  it('rien à marquer pour un bot, un inconnu, un déjà parti, une partie finie', () => {
    const left = markChiffrePiegePlayerLeft(table(), 'u2', T0)!
    expect(markChiffrePiegePlayerLeft(left, 'u2', T0)).toBeNull()
    expect(markChiffrePiegePlayerLeft(table(), 'zoé', T0)).toBeNull()
    expect(markChiffrePiegePlayerLeft(table({}, 1, 1), 'bot-1', T0)).toBeNull()
    expect(markChiffrePiegePlayerLeft({ ...table(), phase: 'finished' }, 'u2', T0)).toBeNull()
  })

  it('le retour rend la main au joueur, sans rien changer à la partie', () => {
    const left = markChiffrePiegePlayerLeft(table(), 'u2', T0)!
    expect(rejoinChiffrePiegePlayer(table(), 'u2')).toBeNull()
    const back = rejoinChiffrePiegePlayer(left, 'u2')!
    expect(back.players[1].leftAt).toBeNull()
    expect(back.version).toBe(left.version + 1)
    expect(back.game).toEqual(left.game)
    const u2Turn = guess(back, 10)
    expect(currentChiffrePiegeActorId(u2Turn)).toBe('u2')
    expect(refusal(applyChiffrePiegeBotAction(u2Turn, T0))).toBe('NOT_BOT_TURN')
  })

  it('remplacement des partis après la grâce : des bots à la place qu’ils n’ont pas quittée', () => {
    const left = markChiffrePiegePlayerLeft(table(), 'u1', T0)!
    const early = act(left, '__service__', { type: 'replace-left', graceMs: ONLINE_REPLACE_GRACE_MS }, T0 + ONLINE_REPLACE_GRACE_MS - 1)
    expect(refusal(early)).toBe('NOTHING_TO_REPLACE')
    const replaced = accepted(
      act(left, '__service__', { type: 'replace-left', graceMs: ONLINE_REPLACE_GRACE_MS }, T0 + ONLINE_REPLACE_GRACE_MS)
    )
    expect(replaced.players[0]).toMatchObject({ id: 'u1', isBot: true, leftAt: null })
    expect(replaced.game).toEqual(left.game)
    expect(currentChiffrePiegeActorId(replaced)).toBe('u1')
    expect(applyChiffrePiegeBotAction(replaced, T0).ok).toBe(true)
  })

  it('joueur inactif au tour → bot, qui joue à sa place', () => {
    const state = table()
    const converted = convertChiffrePiegePlayerToBot(state, 'u1')!
    expect(converted.players[0]).toMatchObject({ isBot: true, leftAt: null })
    expect(converted.version).toBe(state.version + 1)
    expect(currentChiffrePiegeActorId(converted)).toBe('u1')
    expect(applyChiffrePiegeBotAction(converted, T0).ok).toBe(true)
    expect(convertChiffrePiegePlayerToBot(converted, 'u1')).toBeNull()
    expect(convertChiffrePiegePlayerToBot({ ...state, phase: 'finished' }, 'u2')).toBeNull()
  })
})

describe('vues (téléphones et TV)', () => {
  it('ni piège en cours, ni graines : seulement ce que la table peut savoir', () => {
    const state = guess(table({ trap: 77 }), 30)
    const view = toChiffrePiegeClientView(state)
    expect(view).not.toHaveProperty('rngState')
    expect(view.game).not.toHaveProperty('trap')
    expect(view.game).not.toHaveProperty('rngState')
    expect(JSON.stringify(view)).not.toMatch(/"trap"|"rngState"/)
    expect(view.phaseKey).toBe(phaseKey(state))
    expect(view.continueAt).toBeNull()
    expect([view.version, view.phase]).toEqual([state.version, state.phase])
  })

  it('le piège devient public une fois tombé, avec l’heure de lecture', () => {
    const boom = guess(table(), 42)
    const view = toChiffrePiegeClientView(boom)
    expect(view.game.lastBoom?.trap).toBe(42)
    expect(view.continueAt).toBe(T0 + CHIFFRE_PIEGE_ONLINE_READ_MS)
    expect(view.phaseEndsAt).toBe(boom.phaseEndsAt)
  })

  it('la TV voit ce que voient les joueurs, et le téléphone relit la vue', () => {
    const state = guess(table(), 30)
    expect(chiffrePiegeSpectatorViewJson(state)).toBe(chiffrePiegeClientViewJson(state))
    expect(parseChiffrePiegeClientView(chiffrePiegeClientViewJson(state))).toEqual(toChiffrePiegeClientView(state))
    for (const json of [null, '', '{', 'null', '{"phase":"playing","players":[]}']) {
      expect(parseChiffrePiegeClientView(json)).toBeNull()
    }
  })
})

describe('issue de partie (XP)', () => {
  it('participation seulement : personne ne « gagne », les bots restent des bots', () => {
    const outcomes = chiffrePiegeMatchOutcomes(table({}, 1, 2))
    expect(outcomes).toEqual([
      { playerId: 'u1', isBot: false, won: false },
      { playerId: 'u2', isBot: false, won: false },
      { playerId: 'bot-1', isBot: true, won: false },
    ])
  })
})
