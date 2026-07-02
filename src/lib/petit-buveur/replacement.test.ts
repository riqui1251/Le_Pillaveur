import { describe, it, expect } from 'vitest'
import {
  buildPetitBuveurEngineState,
  serializeEngineState,
  markPlayerLeft,
  rejoinPlayer,
  replaceExpiredWithBots,
  convertPlayerToBot,
  applyBotAction,
} from './server-adapter'
import { currentPlayerId, reduce } from './engine'
import { findLeftHumanPlayer, ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'

const MEMBERS = [
  { userId: 'u1', displayName: 'Alice' },
  { userId: 'u2', displayName: 'Bob' },
  { userId: 'u3', displayName: 'Chloé' },
]

function freshState(seed: string | number = 'repl-1') {
  return buildPetitBuveurEngineState(MEMBERS, 'normal', seed)
}

describe('markPlayerLeft / rejoinPlayer', () => {
  it('marque un joueur parti avec son horodatage', () => {
    const s = freshState()
    const next = markPlayerLeft(s, 'u2', 5000)
    expect(next).not.toBeNull()
    expect(next?.players.find((p) => p.id === 'u2')?.leftAt).toBe(5000)
    expect(next?.version).toBe(s.version + 1)
  })

  it('no-op (null) si joueur inconnu, déjà parti, bot ou partie finie', () => {
    const s = freshState()
    expect(markPlayerLeft(s, 'ghost', 5000)).toBeNull()
    const left = markPlayerLeft(s, 'u2', 5000)!
    expect(markPlayerLeft(left, 'u2', 9000)).toBeNull()
    const bot = convertPlayerToBot(s, 'u2')!
    expect(markPlayerLeft(bot, 'u2', 5000)).toBeNull()
    const finished = { ...s, phase: 'finished' as const, winner: 'u1' }
    expect(markPlayerLeft(finished, 'u2', 5000)).toBeNull()
  })

  it('rejoinPlayer efface leftAt tant que le joueur est humain', () => {
    const s = markPlayerLeft(freshState(), 'u2', 5000)!
    const back = rejoinPlayer(s, 'u2')
    expect(back?.players.find((p) => p.id === 'u2')?.leftAt).toBeNull()
    // Pas parti / déjà bot → null.
    expect(rejoinPlayer(freshState(), 'u2')).toBeNull()
    expect(rejoinPlayer(convertPlayerToBot(s, 'u2')!, 'u2')).toBeNull()
  })
})

describe('replaceExpiredWithBots', () => {
  it('convertit uniquement les partis depuis plus de graceMs', () => {
    let s = markPlayerLeft(freshState(), 'u2', 1000)!
    s = markPlayerLeft(s, 'u3', 100_000)!
    const now = 1000 + ONLINE_REPLACE_GRACE_MS
    const next = replaceExpiredWithBots(s, now, ONLINE_REPLACE_GRACE_MS)!
    expect(next.players.find((p) => p.id === 'u2')?.isBot).toBe(true)
    expect(next.players.find((p) => p.id === 'u2')?.leftAt).toBeNull()
    expect(next.players.find((p) => p.id === 'u3')?.isBot).toBeFalsy()
  })

  it('null si personne à remplacer (délai non écoulé)', () => {
    const s = markPlayerLeft(freshState(), 'u2', 1000)!
    expect(replaceExpiredWithBots(s, 2000, ONLINE_REPLACE_GRACE_MS)).toBeNull()
  })
})

describe('convertPlayerToBot (AFK)', () => {
  it('convertit un humain présent en bot', () => {
    const next = convertPlayerToBot(freshState(), 'u1')!
    expect(next.players.find((p) => p.id === 'u1')?.isBot).toBe(true)
  })

  it('null si déjà bot ou partie finie', () => {
    const s = convertPlayerToBot(freshState(), 'u1')!
    expect(convertPlayerToBot(s, 'u1')).toBeNull()
    const finished = { ...freshState(), phase: 'finished' as const, winner: 'u2' }
    expect(convertPlayerToBot(finished, 'u1')).toBeNull()
  })
})

describe('applyBotAction', () => {
  it("refuse si le joueur au tour n'est pas un bot", () => {
    const r = applyBotAction(freshState())
    expect(r.ok).toBe(false)
    if (!r.ok) expect(r.error).toBe('NOT_BOT_TURN')
  })

  it('un bot joue des tours complets (roll + résolutions) sans se bloquer', () => {
    // Tous bots : la partie doit pouvoir se terminer entièrement via des ticks.
    let s = freshState('bot-full')
    for (const id of ['u1', 'u2', 'u3']) s = convertPlayerToBot(s, id)!
    let guard = 0
    while (s.phase !== 'finished' && guard < 2000) {
      const r = applyBotAction(s)
      expect(r.ok).toBe(true)
      if (!r.ok) break
      s = r.state
      guard += 1
    }
    expect(s.phase).toBe('finished')
    expect(s.winner).not.toBeNull()
  })

  it('le tour passe correctement entre humain et bot remplaçant', () => {
    let s = convertPlayerToBot(freshState('mix-1'), 'u1')!
    expect(currentPlayerId(s)).toBe('u1')
    // Le bot u1 joue jusqu'à ce que le tour passe à u2 (humain).
    let guard = 0
    while (currentPlayerId(s) === 'u1' && guard < 50) {
      const r = applyBotAction(s)
      expect(r.ok).toBe(true)
      if (!r.ok) break
      s = r.state
      guard += 1
    }
    // Le tour est passé à un humain (u2 ou u3 selon les effets de case) :
    // le tick bot doit alors refuser de jouer à sa place.
    expect(currentPlayerId(s)).not.toBe('u1')
    expect(applyBotAction(s).ok).toBe(false)
  })
})

describe('lastInteraction (spectacle client des tirages)', () => {
  function withPending(caseType: 'de-honte' | 'pile-face' | 'roue' | 'roue-defis') {
    const s = freshState('spectacle-' + caseType)
    return {
      ...s,
      phase: 'awaiting-interaction' as const,
      pending: { caseType, playerId: 'u1', needsTarget: false },
      lastCase: { type: caseType, effect: 2 },
    }
  }

  it('de-honte expose la valeur du dé (1-6) et son acteur', () => {
    const next = reduce(withPending('de-honte'), { type: 'RESOLVE_INTERACTION', playerId: 'u1' })
    expect(next.lastInteraction?.kind).toBe('de-honte')
    if (next.lastInteraction?.kind === 'de-honte') {
      expect(next.lastInteraction.actorId).toBe('u1')
      expect(next.lastInteraction.value).toBeGreaterThanOrEqual(1)
      expect(next.lastInteraction.value).toBeLessThanOrEqual(6)
    }
  })

  it('pile-face expose côté misé, résultat et gorgées cohérentes', () => {
    const next = reduce(withPending('pile-face'), {
      type: 'RESOLVE_INTERACTION',
      playerId: 'u1',
      choice: { targetId: 'u2', side: 'pile' },
    })
    expect(next.lastInteraction?.kind).toBe('pile-face')
    if (next.lastInteraction?.kind === 'pile-face') {
      const li = next.lastInteraction
      expect(li.side).toBe('pile')
      expect(li.targetId).toBe('u2')
      const lost = li.side !== li.flip
      expect(li.drinks).toBe(lost ? 2 : 0)
      const target = next.players.find((p) => p.id === 'u2')!
      expect(target.drinks).toBe(li.drinks)
    }
  })

  it('roue expose le segment tiré (0-14) et les gorgées appliquées', () => {
    const next = reduce(withPending('roue'), { type: 'RESOLVE_INTERACTION', playerId: 'u1' })
    expect(next.lastInteraction?.kind).toBe('roue')
    if (next.lastInteraction?.kind === 'roue') {
      expect(next.lastInteraction.segment).toBeGreaterThanOrEqual(0)
      expect(next.lastInteraction.segment).toBeLessThan(15)
      expect(next.players.find((p) => p.id === 'u1')!.drinks).toBe(next.lastInteraction.drinks)
    }
  })

  it('le ROLL suivant efface le spectacle précédent', () => {
    const resolved = reduce(withPending('roue-defis'), { type: 'RESOLVE_INTERACTION', playerId: 'u1' })
    expect(resolved.lastInteraction).not.toBeNull()
    const roller = currentPlayerId(resolved)!
    const next = reduce(resolved, { type: 'ROLL', playerId: roller })
    expect(next.lastInteraction).toBeNull()
  })
})

describe('findLeftHumanPlayer (contrat générique)', () => {
  it('retrouve un joueur parti dans le JSON sérialisé', () => {
    const s = markPlayerLeft(freshState(), 'u2', 7000)!
    const found = findLeftHumanPlayer(serializeEngineState(s), 'u2')
    expect(found?.id).toBe('u2')
    expect(found?.leftAt).toBe(7000)
  })

  it('ignore les présents, les bots et les états invalides', () => {
    const s = freshState()
    expect(findLeftHumanPlayer(serializeEngineState(s), 'u2')).toBeNull()
    const bot = convertPlayerToBot(markPlayerLeft(s, 'u2', 7000)!, 'u2')!
    expect(findLeftHumanPlayer(serializeEngineState(bot), 'u2')).toBeNull()
    expect(findLeftHumanPlayer(null, 'u2')).toBeNull()
    expect(findLeftHumanPlayer('pas du json', 'u2')).toBeNull()
  })
})
