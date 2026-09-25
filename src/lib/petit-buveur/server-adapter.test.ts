import { describe, it, expect } from 'vitest'
import {
  buildPetitBuveurEngineState,
  serializeEngineState,
  parseEngineState,
  toClientView,
  applyRoomAction,
  applyBotAction,
} from './server-adapter'
import { currentPlayerId } from './engine'
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
