import { describe, it, expect } from 'vitest'
import {
  buildPetitBuveurEngineState,
  serializeEngineState,
  parseEngineState,
  toClientView,
  applyRoomAction,
  applyBotAction,
  hidesDrawnCase,
} from './server-adapter'
import { currentPlayerId, type EnginePending, type EngineState } from './engine'
import { needsTarget, type EngineCase } from './types'
import { DEFI_DRINKS, DEFI_VERIFIABLE_ONLINE } from './game-data'
import { personaForBotName } from '@/lib/online/bot-personas'

const MEMBERS = [
  { userId: 'u1', displayName: 'Alice' },
  { userId: 'u2', displayName: 'Bob' },
]

describe('server-adapter Petit Buveur', () => {
  it("construit l'état moteur avec userId comme id joueur", () => {
    const s = buildPetitBuveurEngineState(MEMBERS, 'normal', 'seed-x')
    expect(s.players.map((p) => p.id)).toEqual(['u1', 'u2'])
    expect(s.players.map((p) => p.name)).toEqual(['Alice', 'Bob'])
    expect(s.settings.defiDrinks).toEqual(DEFI_DRINKS)
    expect(s.players.every((p) => p.position === 0)).toBe(true)
  })

  it('en ligne, seuls les défis vérifiables sont autorisés au tirage', () => {
    const s = buildPetitBuveurEngineState(MEMBERS, 'normal', 'seed-defi')
    expect(s.settings.defiAllowed).toBeDefined()
    expect(s.settings.defiAllowed!.length).toBeGreaterThan(0)
    expect(s.settings.defiAllowed!.length).toBeLessThan(DEFI_DRINKS.length)
    for (const idx of s.settings.defiAllowed!) {
      expect(DEFI_VERIFIABLE_ONLINE[idx]).toBe(true)
    }
  })

  it('sérialise puis reparse à l’identique', () => {
    const s = buildPetitBuveurEngineState(MEMBERS, 'difficile', 42)
    const round = parseEngineState(serializeEngineState(s))
    expect(round).toEqual(s)
  })

  it('parseEngineState gère null et JSON invalide', () => {
    expect(parseEngineState(null)).toBeNull()
    expect(parseEngineState('pas du json')).toBeNull()
    expect(parseEngineState('{"foo":1}')).toBeNull()
  })

  it('toClientView masque rngState mais garde le reste', () => {
    const s = buildPetitBuveurEngineState(MEMBERS, 'normal', 'seed-y')
    const view = toClientView(s)
    expect('rngState' in view).toBe(false)
    expect(view.players).toHaveLength(2)
    expect(view.currentPlayer).toBe(0)
    expect(view.phase).toBe('playing')
  })
})

describe('cible choisie à l’aveugle, comme en local : la vue ne trahit pas la case', () => {
  const pendingWith = (c: EngineCase, extra: Partial<EnginePending> = {}): EngineState => {
    const s = buildPetitBuveurEngineState(MEMBERS, 'normal', 'seed-blind')
    return {
      ...s,
      phase: 'awaiting-interaction',
      lastCase: c,
      lastEffectiveCase: c,
      log: [{ turn: 1, playerId: 'u1', message: `case:${c.type}` }],
      pending: { caseType: c.type, playerId: 'u1', needsTarget: needsTarget(c.type), case: c, ...extra },
    }
  }

  it('case à cible, Défi, Double case, case rejouée, Pile ou face : ni type, ni effet, ni défi, ni journal', () => {
    const hiddenOnes = [
      pendingWith({ type: 'gorgée', effect: 6 }),
      pendingWith({ type: 'defi', effect: 2, defiIndex: 3 }),
      pendingWith({ type: 'gorgée', effect: 2 }, { via: 'repetition' }),
      pendingWith({ type: 'double-case', effect: 0 }, { needsTarget: true, cases: [{ type: 'recul', effect: -1 }, { type: 'solo', effect: 1 }] }),
      pendingWith({ type: 'pile-face', effect: 2 }),
    ]
    for (const s of hiddenOnes) {
      expect(hidesDrawnCase(s.pending)).toBe(true)
      const view = toClientView(s)
      expect(view.pending).toEqual({ caseType: 'normal', playerId: 'u1', needsTarget: true, hidden: true })
      expect(view.lastCase).toBeNull()
      expect('lastEffectiveCase' in view).toBe(false)
      expect(view.log.map((e) => e.message)).toEqual(['case:'])
      // Le moteur, lui, garde tout : la cible choisie, la case s'applique.
      expect(applyRoomAction(s, 'u1', { type: 'resolve', choice: { targetId: 'u2' } }).ok).toBe(true)
    }
  })

  it('duel avant la case : adversaires et décideur visibles, la case tirée non', () => {
    const s = pendingWith({ type: 'piege', effect: 0 }, { stage: 'duel', opponents: ['u2'], needsTarget: false })
    expect(hidesDrawnCase(s.pending)).toBe(true)
    const view = toClientView(s)
    expect(view.pending).toEqual({
      caseType: 'normal',
      playerId: 'u1',
      needsTarget: false,
      hidden: true,
      stage: 'duel',
      opponents: ['u2'],
    })
    expect(view.lastCase).toBeNull()
    expect(JSON.stringify(view)).not.toContain('piege')
    // Passer le duel (aucun adversaire) : la case se joue — ici une cible encore à choisir, toujours cachée.
    const passed = applyRoomAction(s, 'u1', { type: 'resolve', choice: {} })
    if (!passed.ok) throw new Error(passed.error)
    expect(toClientView(passed.state).pending).toEqual({ caseType: 'normal', playerId: 'u1', needsTarget: true, hidden: true })
    expect(JSON.stringify(toClientView(passed.state))).not.toContain('piege')
  })

  it('Vote, Échange, Défi en chaîne, Téléport, roue, Chance, verdict et côté : annoncés comme en local', () => {
    const visible = [
      pendingWith({ type: 'vote', effect: 3 }),
      pendingWith({ type: 'echange', effect: 0 }),
      pendingWith({ type: 'defi-chaine', effect: 5 }),
      pendingWith({ type: 'teleport', effect: 0 }),
      pendingWith({ type: 'roue', effect: 0 }),
      pendingWith({ type: 'chance', effect: 0 }),
      pendingWith({ type: 'defi', effect: 2, defiIndex: 3 }, { stage: 'verdict', targetId: 'u2', needsTarget: false }),
      pendingWith({ type: 'pile-face', effect: 2 }, { stage: 'side', targetId: 'u2', needsTarget: false }),
    ]
    for (const s of visible) {
      expect(hidesDrawnCase(s.pending)).toBe(false)
      const view = toClientView(s)
      expect(view.pending).toEqual(s.pending)
      expect(view.lastCase).toEqual(s.lastCase)
      expect(view.log).toEqual(s.log)
    }
  })
})

describe('applyRoomAction (validation serveur)', () => {
  it('accepte un roll du joueur courant', () => {
    const s = buildPetitBuveurEngineState(MEMBERS, 'normal', 'act-1')
    const r = applyRoomAction(s, 'u1', { type: 'roll' })
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.state.version).toBe(1)
  })

  it('refuse un roll hors-tour', () => {
    const s = buildPetitBuveurEngineState(MEMBERS, 'normal', 'act-2')
    const r = applyRoomAction(s, 'u2', { type: 'roll' })
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('NOT_YOUR_TURN')
  })

  it('refuse une résolution sans interaction en attente', () => {
    const s = buildPetitBuveurEngineState(MEMBERS, 'normal', 'act-3')
    const r = applyRoomAction(s, 'u1', { type: 'resolve' })
    expect(r.ok).toBe(false)
  })
})

describe('bots de l’hôte au lancement (botsCount)', () => {
  const HOST = [{ userId: 'u1', displayName: 'Alice' }]

  it('un hôte seul + 2 bots : 3 joueurs, dont 2 bots assis après lui', () => {
    const s = buildPetitBuveurEngineState(HOST, 'normal', 'bots-1', 2)
    expect(s.players).toHaveLength(3)
    expect(s.players.map((p) => p.id)).toEqual(['u1', 'bot-1', 'bot-2'])
    expect(s.players.filter((p) => p.isBot)).toHaveLength(2)
    expect(s.players[0].isBot).toBeFalsy()
    // Nom de persona : c'est lui qui donne son tempo au tick serveur.
    for (const bot of s.players.slice(1)) expect(personaForBotName(bot.name)).not.toBeNull()
    // L'humain garde la main au premier tour.
    expect(currentPlayerId(s)).toBe('u1')
  })

  it('sans bot, l’état est celui d’avant l’option (mêmes tirages à graine égale)', () => {
    const avant = buildPetitBuveurEngineState(MEMBERS, 'normal', 'iso-seed')
    const apres = buildPetitBuveurEngineState(MEMBERS, 'normal', 'iso-seed', 0)
    expect(apres).toEqual(avant)
    expect(apres.players.some((p) => 'isBot' in p)).toBe(false)
  })

  it('complète jusqu’au minimum de 2 joueurs (relance où l’hôte reste seul)', () => {
    const s = buildPetitBuveurEngineState(HOST, 'normal', 'solo', 0)
    expect(s.players.map((p) => p.id)).toEqual(['u1', 'bot-1'])
    expect(s.players[1].isBot).toBe(true)
  })

  it('le tour d’un bot est jouable : lancer puis résoudre ce que la case demande', () => {
    const s = buildPetitBuveurEngineState(HOST, 'normal', 'tour-bot', 2)
    // Le bot n'a pas la main tant que l'humain n'a pas joué.
    const refus = applyBotAction(s)
    expect(refus.ok).toBe(false)
    if (!refus.ok) expect(refus.error).toBe('NOT_BOT_TURN')

    const auBot = { ...s, currentPlayer: 1 }
    const r = applyBotAction(auBot)
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.state.version).toBe(auBot.version + 1)
      expect(r.state.lastDice).not.toBeNull()
    }
  })

  it('une table de bots va au bout sans jamais bloquer (chaque tick bot est accepté)', () => {
    let s = buildPetitBuveurEngineState([], 'normal', 'table-de-bots', 3)
    expect(s.players.every((p) => p.isBot)).toBe(true)
    let ticks = 0
    while (s.phase !== 'finished' && ticks < 5000) {
      const r = applyBotAction(s)
      expect(r.ok, `tick ${ticks} refusé : ${r.ok ? '' : r.error}`).toBe(true)
      if (!r.ok) break
      s = r.state
      ticks += 1
    }
    expect(s.phase).toBe('finished')
    expect(s.winner).toMatch(/^bot-\d+$/)
  })
})
