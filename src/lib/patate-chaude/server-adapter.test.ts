import { describe, expect, it } from 'vitest'
import { phaseKey } from '@/lib/online/phase-clock'
import { PC_DEFAULT_SETTINGS, pcFuseRangeMs, ranking, type PcChallenge, type PcSettings } from './engine'
import { pcServerSource } from './server-bank'
import {
  PC_ONLINE_BOOM_MS,
  PC_ONLINE_FIRST_READY_MS,
  PC_ONLINE_READY_MS,
  currentPcActorId,
  isPcSetAside,
  isPcTableTooSmall,
  pcEndStandings,
  toPcClientView,
  type PcOnlineState,
} from './online-shared'
import {
  PC_SERVER_ENTROPY,
  applyPcRoomAction,
  buildPcState,
  markPcPlayerLeft,
  parsePcState,
  pcClientViewJson,
  pcSettingsFromRoom,
  pcSpectatorViewJson,
  rejoinPcPlayer,
  serializePcState,
  type PcEntropy,
  type PcRoomActionInput,
  type PcRoomActionResult,
} from './server-adapter'
import { patateChaudeMatchOutcomes } from './match-outcomes'

/** Horloge FIXE : échéances déterministes. */
const T0 = 1_700_000_000_000
const IDS = ['u1', 'u2', 'u3', 'u4']
const MEMBERS = IDS.map((userId) => ({ userId, user: { displayName: `Joueur ${userId}` } }))

function expectOk(result: PcRoomActionResult): PcOnlineState {
  if (!result.ok) throw new Error(`refus inattendu : ${result.error}`)
  return result.state
}

function expectError(result: PcRoomActionResult): string {
  if (result.ok) throw new Error('l’action aurait dû être refusée')
  return result.error
}

function act(state: PcOnlineState, userId: string, input: PcRoomActionInput, now: number): PcRoomActionResult {
  return applyPcRoomAction(state, userId, input, now)
}

function built(settings: Partial<PcSettings> = {}, lang = 'fr', members = MEMBERS): PcOnlineState {
  return buildPcState(members, settings, lang, 'soirée', T0)
}

/** Compte à rebours écoulé : la mèche s'allume. */
function lightUp(state: PcOnlineState): PcOnlineState {
  return expectOk(act(state, '__service__', { type: 'advance', phaseKey: phaseKey(state) }, state.phaseEndsAt!))
}

/** Mèche allumée à T0 + 5 s, défi imposé si besoin. */
function burning(settings: Partial<PcSettings> = {}, challenge?: PcChallenge): PcOnlineState {
  const state = lightUp(built(settings))
  return challenge ? { ...state, game: { ...state.game, challenge } } : state
}

const THEME: PcChallenge = { kind: 'theme', id: 'fruit', value: 'Un fruit' }
const LETTER_B: PcChallenge = { kind: 'letter', value: 'B' }

describe('patate-chaude en ligne — construction', () => {
  it('la table suit les membres, la bombe attend chez le premier, compte à rebours public', () => {
    const state = built()
    expect(state.players.map((p) => p.id)).toEqual(IDS)
    expect(state.players.every((p) => !p.isBot && p.leftAt === null)).toBe(true)
    expect(state).toMatchObject({ version: 1, phase: 'ready', phaseSeq: 1, rematchVotes: [], lang: 'fr' })
    expect(state.phaseEndsAt).toBe(T0 + PC_ONLINE_FIRST_READY_MS)
    expect(state.game.holder).toBe('u1')
    expect(state.game.explodeAt).toBeNull()
    expect(currentPcActorId(state)).toBeNull()
  })

  it('un membre en double ne compte qu’une fois', () => {
    expect(built({}, 'fr', [...MEMBERS, MEMBERS[0]]).players).toHaveLength(4)
  })

  it('table tombée sous deux joueurs avant l’allumage (départ au briefing) : partie close, jamais d’exception', () => {
    const alone = built({}, 'fr', MEMBERS.slice(0, 1))
    expect(alone).toMatchObject({ version: 1, phase: 'finished', phaseEndsAt: null, rematchVotes: [] })
    expect(alone.players.map((p) => p.id)).toEqual(['u1'])
    expect(alone.game.phase).toBe('finished')
    expect(Object.values(alone.game.explosions)).toEqual([0])
    // L'écran de fin et « Rejouer » lisent un état valide ; aucune action de jeu n'y prend.
    expect(parsePcState(serializePcState(alone))).toEqual(alone)
    expect(expectError(act(alone, 'u1', { type: 'advance', phaseKey: phaseKey(alone) }, T0 + 9_000))).toBe('NO_DEADLINE')
    expect(expectError(act(alone, 'u1', { type: 'end' }, T0 + 9_000))).toBe('WRONG_PHASE')
    expect(patateChaudeMatchOutcomes(alone)).toEqual([{ playerId: 'u1', isBot: false, won: false }])
    expect(built({}, 'fr', []).phase).toBe('finished')
  })

  it('réglages de la salle : valeurs de la liste, sinon les défauts du jeu local', () => {
    expect(pcSettingsFromRoom({})).toEqual(PC_DEFAULT_SETTINGS)
    expect(pcSettingsFromRoom({ pcChallenge: 'letter', pcFuse: 'long', pcRounds: 0 })).toEqual({
      challenge: 'letter',
      fuse: 'long',
      rounds: 0,
    })
    expect(pcSettingsFromRoom({ pcChallenge: 'chiffres', pcFuse: 12, pcRounds: 7 })).toEqual(PC_DEFAULT_SETTINGS)
    expect(built({ fuse: 'short', rounds: 5 }).game.settings).toEqual({ challenge: 'mix', fuse: 'short', rounds: 5 })
  })

  it('langue inconnue ou absente → français', () => {
    expect(built({}, 'de').lang).toBe('fr')
    expect(built({}, 'it').lang).toBe('it')
  })
})

describe('patate-chaude en ligne — lecture de l’état', () => {
  it('aller-retour sans perte', () => {
    const state = burning()
    expect(parsePcState(serializePcState(state))).toEqual(state)
  })

  it('JSON illisible ou d’une autre forme → null, jamais d’exception', () => {
    for (const json of [null, '', 'pas du json', '[]', '{}', '{"version":1,"phase":"ready","players":[]}', 'null']) {
      expect(parsePcState(json)).toBeNull()
    }
  })

  it('complète les votes « Rejouer », l’horloge et la langue absents', () => {
    const state = built()
    const { rematchVotes: _votes, phaseSeq: _seq, lang: _lang, ...rest } = state
    void _votes
    void _seq
    void _lang
    expect(parsePcState(JSON.stringify(rest))).toMatchObject({ rematchVotes: [], phaseSeq: 0, lang: 'fr' })
  })
})

describe('patate-chaude en ligne — allumage', () => {
  it('pas avant l’échéance, ni sur une phase déjà passée', () => {
    const state = built()
    expect(expectError(act(state, 'u2', { type: 'advance', phaseKey: phaseKey(state) }, T0 + 1_000))).toBe('NOT_EXPIRED')
    expect(expectError(act(state, 'u2', { type: 'advance', phaseKey: 'ready#0' }, T0 + 9_000))).toBe('PHASE_CHANGED')
  })

  it('à l’échéance : mèche secrète dans la plage, défi de la langue de la salle, aucune échéance publique', () => {
    const state = lightUp(built({ fuse: 'normal' }, 'en'))
    const startedAt = T0 + PC_ONLINE_FIRST_READY_MS
    const range = pcFuseRangeMs('normal')
    expect(state).toMatchObject({ phase: 'burning', phaseSeq: 2, phaseEndsAt: null, version: 2 })
    expect(state.game.roundStartedAt).toBe(startedAt)
    expect(state.game.explodeAt).toBeGreaterThanOrEqual(startedAt + range.min)
    expect(state.game.explodeAt).toBeLessThanOrEqual(startedAt + range.max)
    const english = pcServerSource('en')
    const values = [
      ...english.themes.map((theme) => theme.text),
      ...english.letters,
      ...english.syllables,
    ]
    expect(values).toContain(state.game.challenge?.value)
    expect(currentPcActorId(state)).toBe('u1')
  })
})

describe('patate-chaude en ligne — passes', () => {
  it('le porteur tape un mot : la bombe file chez le suivant, le mot est noté avec son auteur', () => {
    const state = burning({}, THEME)
    const next = expectOk(act(state, 'u1', { type: 'pass', word: '  Fraise ' }, T0 + 6_000))
    expect(next.game.holder).toBe('u2')
    expect(next.game.words).toEqual([{ player: 'u1', word: 'Fraise', struck: false }])
    expect(next.version).toBe(state.version + 1)
    expect(next.phaseSeq).toBe(state.phaseSeq)
    expect(currentPcActorId(next)).toBe('u2')
  })

  it('refus du moteur : pas le porteur, mot déjà dit, mauvaise lettre ; la bombe reste', () => {
    const theme = burning({}, THEME)
    expect(expectError(act(theme, 'u2', { type: 'pass', word: 'Pomme' }, T0 + 6_000))).toBe('NOT_HOLDER')
    const said = expectOk(act(theme, 'u1', { type: 'pass', word: 'Pomme' }, T0 + 6_000))
    expect(expectError(act(said, 'u2', { type: 'pass', word: 'pommé' }, T0 + 7_000))).toBe('WORD_ALREADY_SAID')
    const letter = burning({}, LETTER_B)
    expect(expectError(act(letter, 'u1', { type: 'pass', word: 'Avion' }, T0 + 6_000))).toBe('WORD_WRONG_LETTER')
    expect(expectError(act(letter, 'u1', { type: 'pass', word: 'B' }, T0 + 6_000))).toBe('WORD_TOO_SHORT')
  })

  it('une passe reçue après la mèche ne s’applique pas : celui qui tenait la bombe explose', () => {
    const state = burning({}, THEME)
    const explodeAt = state.game.explodeAt!
    const late = expectOk(act(state, 'u1', { type: 'pass', word: 'Kiwi' }, explodeAt + 800))
    expect(late.phase).toBe('boom')
    expect(late.game.lastBoom?.playerId).toBe('u1')
    expect(late.game.words).toEqual([])
    expect(late.game.explosions.u1).toBe(1)
    expect(late.phaseEndsAt).toBe(explodeAt + 800 + PC_ONLINE_BOOM_MS)
    expect(late.phaseSeq).toBe(state.phaseSeq + 1)
  })
})

describe('patate-chaude en ligne — la mèche', () => {
  it('advance pendant la mèche : refusé avant l’échéance secrète, BOUM chez le porteur ensuite', () => {
    const state = expectOk(act(burning({}, THEME), 'u1', { type: 'pass', word: 'Kiwi' }, T0 + 6_000))
    const key = phaseKey(state)
    const explodeAt = state.game.explodeAt!
    expect(expectError(act(state, '__service__', { type: 'advance', phaseKey: key }, explodeAt - 1))).toBe('NOT_EXPIRED')
    expect(expectError(act(state, '__service__', { type: 'advance', phaseKey: 'ready#1' }, explodeAt))).toBe('PHASE_CHANGED')
    const boom = expectOk(act(state, '__service__', { type: 'advance', phaseKey: key }, explodeAt + 1_500))
    expect(boom.phase).toBe('boom')
    expect(boom.game.lastBoom).toMatchObject({ playerId: 'u2', passes: 1, round: 0 })
    expect(currentPcActorId(boom)).toBeNull()
  })

  it('après le BOUM : manche suivante chez le perdant, nouveau compte à rebours ; fin après N manches', () => {
    let state = lightUp(built({ rounds: 5, challenge: 'theme' }))
    for (let round = 0; round < 5; round += 1) {
      expect(state.game.roundIndex).toBe(round)
      // Une passe par manche : la bombe a bougé, la manche suivante repart bien du perdant.
      state = expectOk(act(state, state.game.holder, { type: 'pass', word: 'Pomme' }, state.game.roundStartedAt! + 500))
      const explodeAt = state.game.explodeAt!
      state = expectOk(act(state, '__service__', { type: 'advance', phaseKey: phaseKey(state) }, explodeAt + 1_500))
      expect(state.phase).toBe('boom')
      const loser = state.game.lastBoom!.playerId
      const dueAt = state.phaseEndsAt!
      expect(expectError(act(state, 'u3', { type: 'advance', phaseKey: phaseKey(state) }, dueAt - 1))).toBe('NOT_EXPIRED')
      state = expectOk(act(state, 'u3', { type: 'advance', phaseKey: phaseKey(state) }, dueAt))
      if (round === 4) break
      expect(state).toMatchObject({ phase: 'ready', phaseEndsAt: dueAt + PC_ONLINE_READY_MS })
      expect(state.game.holder).toBe(loser)
      state = lightUp(state)
    }
    expect(state.phase).toBe('finished')
    expect(state.phaseEndsAt).toBeNull()
    expect(Object.values(state.game.explosions).reduce((a, b) => a + b, 0)).toBe(5)
  })
})

describe('patate-chaude en ligne — contestation', () => {
  /** u1 a passé « Brocoli » à u2 sur le thème des fruits. */
  const passed = () => expectOk(act(burning({}, THEME), 'u1', { type: 'pass', word: 'Brocoli' }, T0 + 6_000))

  it('à quatre : les deux joueurs hors jeu raient le mot, la bombe revient à son auteur', () => {
    const state = passed()
    expect(toPcClientView(state).contestThreshold).toBe(2)
    const once = expectOk(act(state, 'u3', { type: 'contest', index: 0 }, T0 + 7_000))
    expect(once.game.contests).toEqual(['u3'])
    expect(once.game.holder).toBe('u2')
    const twice = expectOk(act(once, 'u4', { type: 'contest', index: 0 }, T0 + 7_500))
    expect(twice.game.words[0].struck).toBe(true)
    expect(twice.game.holder).toBe('u1')
    expect(twice.game.penalties.u1).toBe(1)
    expect(toPcClientView(twice).contestThreshold).toBeNull()
  })

  it('le porteur, juge et partie, ne vote pas', () => {
    expect(expectError(act(passed(), 'u2', { type: 'contest', index: 0 }, T0 + 7_000))).toBe('HOLDER_CANNOT_CONTEST')
  })

  it('à deux ou trois, pas de contestation : le receveur ne renvoie plus la bombe à volonté', () => {
    for (const count of [2, 3]) {
      const lit = lightUp(built({ challenge: 'theme' }, 'fr', MEMBERS.slice(0, count)))
      const state = expectOk(act(lit, 'u1', { type: 'pass', word: 'Pomme' }, T0 + 6_000))
      expect(toPcClientView(state).contestThreshold).toBeNull()
      expect(expectError(act(state, 'u2', { type: 'contest', index: 0 }, T0 + 6_500))).toBe('HOLDER_CANNOT_CONTEST')
      if (count === 3) {
        expect(expectError(act(state, 'u3', { type: 'contest', index: 0 }, T0 + 6_500))).toBe('CONTEST_NEEDS_MORE_PLAYERS')
      }
    }
  })

  it('lettre et syllabe se contestent aussi : le serveur ne sait pas si « Bxx » est un mot', () => {
    const letter = expectOk(act(burning({}, LETTER_B), 'u1', { type: 'pass', word: 'Bxx' }, T0 + 6_000))
    expect(toPcClientView(letter).contestThreshold).toBe(2)
    const once = expectOk(act(letter, 'u3', { type: 'contest', index: 0 }, T0 + 7_000))
    const twice = expectOk(act(once, 'u4', { type: 'contest', index: 0 }, T0 + 7_500))
    expect(twice.game.words[0]).toEqual({ player: 'u1', word: 'Bxx', struck: true })
    expect(twice.game.holder).toBe('u1')
  })

  it('refus : mot déjà repassé (index périmé), son propre mot', () => {
    const state = passed()
    const repassed = expectOk(act(state, 'u2', { type: 'pass', word: 'Banane' }, T0 + 7_000))
    expect(expectError(act(repassed, 'u4', { type: 'contest', index: 0 }, T0 + 7_500))).toBe('NOTHING_TO_CONTEST')
    expect(expectError(act(state, 'u1', { type: 'contest', index: 0 }, T0 + 7_500))).toBe('OWN_WORD')
  })

  it('une contestation après la mèche fait exploser le porteur', () => {
    const state = passed()
    const late = expectOk(act(state, 'u3', { type: 'contest', index: 0 }, state.game.explodeAt!))
    expect(late.phase).toBe('boom')
    expect(late.game.lastBoom?.playerId).toBe('u2')
  })
})

describe('patate-chaude en ligne — fin, bots et départs', () => {
  it('« Terminer » : un joueur actif seulement, et une seule fois', () => {
    const state = burning()
    expect(expectError(act(state, 'inconnu', { type: 'end' }, T0 + 6_000))).toBe('UNKNOWN_PLAYER')
    const ended = expectOk(act(state, 'u2', { type: 'end' }, T0 + 6_000))
    expect(ended).toMatchObject({ phase: 'finished', phaseEndsAt: null })
    expect(Object.values(ended.game.explosions).every((n) => n === 0)).toBe(true)
    expect(expectError(act(ended, 'u2', { type: 'end' }, T0 + 7_000))).toBe('WRONG_PHASE')
  })

  it('aucun bot : rien à jouer, rien à remplacer', () => {
    const state = burning()
    expect(expectError(act(state, '__service__', { type: 'bot' }, T0 + 6_000))).toBe('NOT_BOT_TURN')
    expect(expectError(act(state, 'u2', { type: 'replace-left' }, T0 + 6_000))).toBe('NOTHING_TO_REPLACE')
  })

  it('le porteur s’en va : la bombe passe au suivant actif, il est sauté, puis reprend sa place', () => {
    const state = burning({}, THEME)
    const left = markPcPlayerLeft(state, 'u1', T0 + 6_000)!
    expect(left.players.find((p) => p.id === 'u1')?.leftAt).toBe(T0 + 6_000)
    expect(left.game.holder).toBe('u2')
    expect(left.version).toBe(state.version + 1)
    expect(markPcPlayerLeft(left, 'u1', T0 + 7_000)).toBeNull()
    expect(markPcPlayerLeft(left, 'inconnu', T0 + 7_000)).toBeNull()
    const passed = expectOk(act(left, 'u2', { type: 'pass', word: 'Kiwi' }, T0 + 7_000))
    const back = rejoinPcPlayer(passed, 'u1')!
    expect(back.players.find((p) => p.id === 'u1')?.leftAt).toBeNull()
    expect(back.game.absent).toEqual([])
    expect(rejoinPcPlayer(back, 'u1')).toBeNull()
  })

  it('moins de deux joueurs actifs : échéance immédiate, et c’est l’advance (route d’action) qui termine', () => {
    const duo = lightUp(built({}, 'fr', MEMBERS.slice(0, 2)))
    const alone = markPcPlayerLeft(duo, 'u2', T0 + 6_000)!
    // Pas de fin hors de la route d'action : elle seule enregistre XP, séries, succès et journal.
    expect(alone).toMatchObject({ phase: 'ready', phaseEndsAt: T0 + 6_000, phaseSeq: duo.phaseSeq + 1 })
    expect(alone.game.explodeAt).toBeNull()
    expect(isPcTableTooSmall(toPcClientView(alone))).toBe(true)
    const ended = expectOk(act(alone, '__service__', { type: 'advance', phaseKey: phaseKey(alone) }, T0 + 6_000))
    expect(ended).toMatchObject({ phase: 'finished', phaseEndsAt: null, version: alone.version + 1 })
    expect(markPcPlayerLeft(ended, 'u1', T0 + 7_000)).toBeNull()
  })

  it('départ pendant le compte à rebours : il s’écourte ; le revenant, lui, relance la partie', () => {
    const duo = built({}, 'fr', MEMBERS.slice(0, 2))
    const alone = markPcPlayerLeft(duo, 'u1', T0 + 1_000)!
    expect(alone).toMatchObject({ phase: 'ready', phaseEndsAt: T0 + 1_000, phaseSeq: duo.phaseSeq + 1 })
    expect(alone.game.holder).toBe('u2')
    const back = rejoinPcPlayer(alone, 'u1')!
    expect(isPcTableTooSmall(back)).toBe(false)
    const lit = expectOk(act(back, 'u2', { type: 'advance', phaseKey: phaseKey(back) }, T0 + 1_500))
    expect(lit.phase).toBe('burning')
  })

  it('départ pendant l’écran du BOUM : il reste affiché, puis la partie se termine', () => {
    const duo = lightUp(built({}, 'fr', MEMBERS.slice(0, 2)))
    const boom = expectOk(act(duo, '__service__', { type: 'advance', phaseKey: phaseKey(duo) }, duo.game.explodeAt!))
    const alone = markPcPlayerLeft(boom, 'u2', boom.phaseEndsAt! - 1_000)!
    expect(alone).toMatchObject({ phase: 'boom', phaseEndsAt: boom.phaseEndsAt })
    const ended = expectOk(act(alone, 'u1', { type: 'advance', phaseKey: phaseKey(alone) }, boom.phaseEndsAt!))
    expect(ended.phase).toBe('finished')
  })

  it('un départ après la mèche fait d’abord exploser le porteur', () => {
    const state = burning({}, THEME)
    const left = markPcPlayerLeft(state, 'u3', state.game.explodeAt! + 10)!
    expect(left.phase).toBe('boom')
    expect(left.game.lastBoom?.playerId).toBe('u1')
  })
})

describe('patate-chaude en ligne — vues', () => {
  it('ni échéance, ni graine, ni mémoire des défis ; mais l’allumage et la borne haute pour le tic-tac', () => {
    const state = burning({ fuse: 'long' })
    const json = pcClientViewJson(state)
    const view = JSON.parse(json)
    expect(view.game).not.toHaveProperty('explodeAt')
    expect(view.game).not.toHaveProperty('rngState')
    expect(view.game).not.toHaveProperty('usedChallenges')
    expect(json).not.toContain(String(state.game.explodeAt))
    expect(json).not.toContain('"winner"')
    expect(view).toMatchObject({
      version: state.version,
      phase: 'burning',
      phaseEndsAt: null,
      phaseKey: phaseKey(state),
      maxFuseMs: pcFuseRangeMs('long').max,
      nextHolderId: 'u2',
    })
    expect(view.game.roundStartedAt).toBe(T0 + PC_ONLINE_FIRST_READY_MS)
  })

  it('la TV voit la même chose qu’un joueur', () => {
    const state = burning()
    expect(pcSpectatorViewJson(state)).toBe(pcClientViewJson(state))
  })

  it('après le BOUM, la durée de la mèche devient publique', () => {
    const state = burning()
    const boom = expectOk(act(state, '__service__', { type: 'advance', phaseKey: phaseKey(state) }, state.game.explodeAt!))
    const view = toPcClientView(boom)
    expect(view.game.lastBoom?.fuseMs).toBe(state.game.explodeAt! - state.game.roundStartedAt!)
    expect(view.phaseEndsAt).toBe(boom.phaseEndsAt)
  })
})

describe('patate-chaude en ligne — hasard du serveur', () => {
  const fixed = (fuseMs: number, seed = 42): PcEntropy => ({ seed: () => seed, fuseMs: () => fuseMs })
  const lightWith = (state: PcOnlineState, entropy: PcEntropy) =>
    expectOk(applyPcRoomAction(state, '__service__', { type: 'advance', phaseKey: phaseKey(state) }, state.phaseEndsAt!, entropy))

  it('la mèche vient du hasard du serveur, pas du flux des défis', () => {
    const ready = built()
    const short = lightWith(ready, fixed(16_000))
    const long = lightWith(ready, fixed(44_000))
    expect(short.game.explodeAt! - short.game.roundStartedAt!).toBe(16_000)
    expect(long.game.explodeAt! - long.game.roundStartedAt!).toBe(44_000)
    // Mèches différentes, tout le reste identique : ni la vue, ni le flux des défis ne la trahissent.
    expect(pcClientViewJson(short)).toBe(pcClientViewJson(long))
    expect(short.game.rngState).toBe(long.game.rngState)
  })

  it('les défis repartent d’une graine neuve à chaque manche', () => {
    const ready = built({ challenge: 'theme' })
    const seeds = [1, 2, 3, 4, 5, 6, 7, 8].map((seed) => lightWith(ready, fixed(20_000, seed)).game.challenge?.id)
    expect(new Set(seeds).size).toBeGreaterThan(1)
  })

  it('hasard réel : mèche dans la plage, graine sur 32 bits', () => {
    const range = pcFuseRangeMs('short')
    for (let i = 0; i < 50; i += 1) {
      const fuse = PC_SERVER_ENTROPY.fuseMs(range)
      expect(Number.isInteger(fuse) && fuse >= range.min && fuse <= range.max).toBe(true)
      const seed = PC_SERVER_ENTROPY.seed()
      expect(Number.isInteger(seed) && seed >= 0 && seed < 2 ** 32).toBe(true)
    }
  })
})

describe('patate-chaude en ligne — joueur qui ne joue plus', () => {
  /** La mèche brûle jusqu'au bout sans que personne ne joue, puis l'écran du BOUM se ferme. */
  function silentRound(state: PcOnlineState): PcOnlineState {
    const lit = lightUp(state)
    const boom = expectOk(act(lit, '__service__', { type: 'advance', phaseKey: phaseKey(lit) }, lit.game.explodeAt!))
    return expectOk(act(boom, 'u2', { type: 'advance', phaseKey: phaseKey(boom) }, boom.phaseEndsAt!))
  }

  it('le porteur muet ne garde pas la bombe d’une manche à l’autre, puis il est mis de côté', () => {
    // u1 ne joue jamais : sa manche d'ouverture explose sans que la bombe ait bougé…
    let state = silentRound(built({ challenge: 'theme' }))
    expect(state.game.lastBoom).toMatchObject({ playerId: 'u1', passes: 0 })
    expect(state.game.holder).toBe('u2')
    // … puis la table la lui repasse, et elle explose encore chez lui.
    state = lightUp(state)
    let t = state.game.roundStartedAt! + 500
    for (const [id, word] of [
      ['u2', 'Pomme'],
      ['u3', 'Poire'],
      ['u4', 'Kiwi'],
    ]) {
      state = expectOk(act(state, id, { type: 'pass', word }, t))
      t += 500
    }
    expect(state.game.holder).toBe('u1')
    const boom = expectOk(act(state, '__service__', { type: 'advance', phaseKey: phaseKey(state) }, state.game.explodeAt!))
    state = expectOk(act(boom, 'u2', { type: 'advance', phaseKey: phaseKey(boom) }, boom.phaseEndsAt!))
    expect(isPcSetAside(state, 'u1')).toBe(true)
    expect(toPcClientView(state).game.absent).toEqual(['u1'])
    expect(state.game.holder).toBe('u2')
    expect(state.players.find((p) => p.id === 'u1')?.leftAt).toBeNull()
    // Mis de côté : il ne termine pas la partie à la place des autres.
    expect(expectError(act(state, 'u1', { type: 'end' }, boom.phaseEndsAt! + 1))).toBe('UNKNOWN_PLAYER')
  })

  it('« Je suis là » : il reprend sa place ; un second toucher est une course muette', () => {
    let state = silentRound(built({}, 'fr', MEMBERS.slice(0, 3)))
    state = {
      ...state,
      game: { ...state.game, absent: ['u1'], idleBooms: { ...state.game.idleBooms, u1: 2 } },
    }
    const back = expectOk(act(state, 'u1', { type: 'resume' }, T0 + 60_000))
    expect(isPcSetAside(back, 'u1')).toBe(false)
    expect(back.game.absent).toEqual([])
    expect(back.game.idleBooms.u1).toBe(0)
    expect(back.version).toBe(state.version + 1)
    expect(expectError(act(back, 'u1', { type: 'resume' }, T0 + 60_100))).toBe('NOT_SET_ASIDE')
    // Un parti revient par la salle (rejoin), pas par « Je suis là ».
    const left = markPcPlayerLeft(back, 'u3', T0 + 61_000)!
    expect(expectError(act(left, 'u3', { type: 'resume' }, T0 + 61_500))).toBe('NOT_SET_ASIDE')
  })

  it('à deux (recette) : mot refusé, deux BOUM chez le même joueur, la partie va au bout', () => {
    const J: PcChallenge = { kind: 'letter', value: 'J' }
    // u2 ouvre la table, comme Recette2 : la bombe commence chez lui.
    let state = lightUp(built({ rounds: 5 }, 'fr', [MEMBERS[1], MEMBERS[0]]))
    state = { ...state, game: { ...state.game, challenge: J } }
    const t = state.game.roundStartedAt! + 2_000
    expect(expectError(act(state, 'u2', { type: 'pass', word: 'pomme' }, t))).toBe('WORD_WRONG_LETTER')
    // Le refus n'écrit rien : l'écran du porteur signale qu'il joue, une seule fois par mèche.
    const noted = expectOk(act(state, 'u2', { type: 'attempt' }, t + 100))
    expect(noted.version).toBe(state.version + 1)
    expect(expectError(act(noted, 'u2', { type: 'attempt' }, t + 200))).toBe('NOTHING_TO_NOTE')
    expect(pcClientViewJson(noted)).not.toContain('"played"')
    // BOUM chez u2, bombe immobile : la manche 2 part de u1, qui passe ; u2 saute encore.
    let boom = expectOk(act(noted, '__service__', { type: 'advance', phaseKey: phaseKey(noted) }, noted.game.explodeAt!))
    state = expectOk(act(boom, 'u1', { type: 'advance', phaseKey: phaseKey(boom) }, boom.phaseEndsAt!))
    expect(state.game.holder).toBe('u1')
    state = lightUp(state)
    state = { ...state, game: { ...state.game, challenge: THEME } }
    state = expectOk(act(state, 'u1', { type: 'pass', word: 'Lasagnes' }, state.game.roundStartedAt! + 1_000))
    boom = expectOk(act(state, '__service__', { type: 'advance', phaseKey: phaseKey(state) }, state.game.explodeAt!))
    expect(boom.game.explosions).toEqual({ u2: 2, u1: 0 })
    state = expectOk(act(boom, 'u1', { type: 'advance', phaseKey: phaseKey(boom) }, boom.phaseEndsAt!))
    expect(state.phase).toBe('ready')
    expect(state.game.roundIndex).toBe(2)
    expect(state.game.absent).toEqual([])
    expect(isPcSetAside(state, 'u2')).toBe(false)
    // Même sans le signe (mot refusé non signalé), on ne met jamais de côté le dernier adversaire.
    const mute = { ...boom, game: { ...boom.game, idleBooms: { u1: 0, u2: 2 } } }
    const next = expectOk(act(mute, 'u1', { type: 'advance', phaseKey: phaseKey(mute) }, mute.phaseEndsAt!))
    expect(next.phase).toBe('ready')
    expect(next.game.absent).toEqual([])
  })
})

describe('patate-chaude en ligne — issue de partie', () => {
  it('participation seule : personne ne « gagne »', () => {
    const ended = expectOk(act(burning(), 'u1', { type: 'end' }, T0 + 6_000))
    expect(patateChaudeMatchOutcomes(ended)).toEqual(IDS.map((playerId) => ({ playerId, isBot: false, won: false })))
    expect(patateChaudeMatchOutcomes(null)).toEqual([])
    expect(patateChaudeMatchOutcomes({ players: 'non' })).toEqual([])
  })

  /** La mèche s'allume puis explose chez le porteur, sans passe ; la manche suivante s'ouvre. */
  function silentRound(state: PcOnlineState): PcOnlineState {
    const lit = lightUp(state)
    const boom = expectOk(act(lit, '__service__', { type: 'advance', phaseKey: phaseKey(lit) }, lit.game.explodeAt!))
    return expectOk(act(boom, '__service__', { type: 'advance', phaseKey: phaseKey(boom) }, boom.phaseEndsAt!))
  }

  it('classement de fin : un joueur parti n’est jamais vainqueur, même sans explosion ; il suit, sans victoire', () => {
    // u4 part dès l'allumage de la première mèche ; u1, u2 puis u3 explosent chacun une fois.
    let state = lightUp(built({ rounds: 5 }))
    state = markPcPlayerLeft(state, 'u4', state.game.roundStartedAt! + 100)!
    const boom = expectOk(act(state, '__service__', { type: 'advance', phaseKey: phaseKey(state) }, state.game.explodeAt!))
    state = expectOk(act(boom, '__service__', { type: 'advance', phaseKey: phaseKey(boom) }, boom.phaseEndsAt!))
    state = silentRound(silentRound(state))
    const ended = expectOk(act(state, 'u1', { type: 'end' }, state.phaseEndsAt! - 1))
    expect(ended.phase).toBe('finished')
    expect(ended.game.explosions).toEqual({ u1: 1, u2: 1, u3: 1, u4: 0 })
    // Le classement brut du moteur, lui, mettrait le parti seul en tête.
    expect(ranking(ended.game).filter((row) => row.won).map((row) => row.playerId)).toEqual(['u4'])
    const rows = pcEndStandings(toPcClientView(ended))
    expect(rows.map((row) => row.playerId)).toEqual(['u1', 'u2', 'u3', 'u4'])
    expect(rows.filter((row) => row.won).map((row) => row.playerId)).toEqual(['u1', 'u2', 'u3'])
    expect(rows[3]).toMatchObject({ playerId: 'u4', explosions: 0, won: false, left: true })
    // Un mis de côté, lui, reste à la table : il garde son rang.
    const aside = pcEndStandings(toPcClientView({ ...ended, game: { ...ended.game, absent: ['u3', 'u4'] } }))
    expect(aside.find((row) => row.playerId === 'u3')).toMatchObject({ left: false, rank: 1, won: true })
  })
})
