import { describe, expect, it } from 'vitest'
import {
  countMatches,
  createMenteurState,
  currentMenteurActorId,
  isLegalRaise,
  menteurTotalDice,
  reduceMenteur,
  toMenteurClientView,
  toMenteurSpectatorView,
  MENTEUR_START_DICE,
  MenteurEngineError,
  type MenteurPlayer,
  type MenteurState,
} from './engine'
import { applyMenteurBotAction, buildMenteurState } from './server-adapter'

const P = (id: string, dice: number[], extra: Partial<MenteurPlayer> = {}): MenteurPlayer => ({
  id,
  name: id.toUpperCase(),
  isBot: false,
  leftAt: null,
  dice,
  lostCount: MENTEUR_START_DICE - dice.length,
  ...extra,
})

/** État artisanal à dés CONNUS (bypass du RNG) pour tester les résolutions. */
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
  ruleCalza: false,
  palifico: false,
  ...over,
})

describe('createMenteurState', () => {
  it('donne 5 dés cachés à chacun, reproductible par graine', () => {
    const players = [
      { id: 'a', name: 'A' },
      { id: 'b', name: 'B' },
      { id: 'c', name: 'C' },
    ]
    const s1 = createMenteurState(players, 'seed-1')
    const s2 = createMenteurState(players, 'seed-1')
    const s3 = createMenteurState(players, 'seed-2')
    expect(s1.players.every((p) => p.dice.length === MENTEUR_START_DICE)).toBe(true)
    expect(s1.players.every((p) => p.dice.every((d) => d >= 1 && d <= 6))).toBe(true)
    expect(s1).toEqual(s2)
    expect(s1.players.map((p) => p.dice)).not.toEqual(s3.players.map((p) => p.dice))
  })

  it('refuse moins de 2 ou plus de 6 joueurs', () => {
    expect(() => createMenteurState([{ id: 'a', name: 'A' }], 1)).toThrow(MenteurEngineError)
    const seven = Array.from({ length: 7 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))
    expect(() => createMenteurState(seven, 1)).toThrow(MenteurEngineError)
  })

  it('buildMenteurState : bots choisis par l’hôte + filet jusqu’au minimum', () => {
    // Filet : sans bots demandés, complété à 2 (rematch résilient).
    const solo = buildMenteurState([{ userId: 'u1', user: { displayName: 'Riri' } }], 0, 42)
    expect(solo.players).toHaveLength(2)
    expect(solo.players[0]).toMatchObject({ id: 'u1', isBot: false })
    expect(solo.players[1].isBot).toBe(true)
    // Nombre choisi : 1 humain + 3 bots = 4 joueurs.
    const withBots = buildMenteurState([{ userId: 'u1', user: { displayName: 'Riri' } }], 3, 42)
    expect(withBots.players).toHaveLength(4)
    expect(withBots.players.filter((p) => p.isBot)).toHaveLength(3)
    const duo = buildMenteurState(
      [
        { userId: 'u1', user: { displayName: 'A' } },
        { userId: 'u2', user: { displayName: 'B' } },
      ],
      0,
      42
    )
    expect(duo.players).toHaveLength(2)
    expect(duo.players.every((p) => !p.isBot)).toBe(true)
  })
})

describe('isLegalRaise', () => {
  const total = 10
  it('première enchère libre (dans les bornes)', () => {
    expect(isLegalRaise(null, 1, 2, total)).toBe(true)
    expect(isLegalRaise(null, 10, 6, total)).toBe(true)
    expect(isLegalRaise(null, 11, 6, total)).toBe(false)
    expect(isLegalRaise(null, 0, 2, total)).toBe(false)
    expect(isLegalRaise(null, 2, 7, total)).toBe(false)
    expect(isLegalRaise(null, 2.5, 3, total)).toBe(false)
  })
  it('normal → normal : quantité qui monte ou même quantité + face supérieure', () => {
    const prev = { qty: 3, face: 4, by: 'a' }
    expect(isLegalRaise(prev, 4, 2, total)).toBe(true)
    expect(isLegalRaise(prev, 3, 5, total)).toBe(true)
    expect(isLegalRaise(prev, 3, 4, total)).toBe(false)
    expect(isLegalRaise(prev, 3, 3, total)).toBe(false)
    expect(isLegalRaise(prev, 2, 6, total)).toBe(false)
  })
  it('normal → aux 1 : moitié arrondie sup', () => {
    const prev = { qty: 5, face: 3, by: 'a' }
    expect(isLegalRaise(prev, 3, 1, total)).toBe(true)
    expect(isLegalRaise(prev, 2, 1, total)).toBe(false)
  })
  it('aux 1 → normal : double + 1', () => {
    const prev = { qty: 2, face: 1, by: 'a' }
    expect(isLegalRaise(prev, 5, 6, total)).toBe(true)
    expect(isLegalRaise(prev, 4, 6, total)).toBe(false)
  })
  it('aux 1 → aux 1 : quantité qui monte', () => {
    const prev = { qty: 2, face: 1, by: 'a' }
    expect(isLegalRaise(prev, 3, 1, total)).toBe(true)
    expect(isLegalRaise(prev, 2, 1, total)).toBe(false)
  })
})

describe('countMatches (jokers Pillaveurs)', () => {
  it('les 1 comptent pour toutes les faces sauf pour eux-mêmes', () => {
    const players = [P('a', [1, 3, 3]), P('b', [1, 5])]
    expect(countMatches(players, 3)).toBe(4) // deux 3 + deux jokers
    expect(countMatches(players, 5)).toBe(3) // un 5 + deux jokers
    expect(countMatches(players, 1)).toBe(2) // seulement les 1
  })
})

describe('BID / DUDO', () => {
  it('seul le joueur au tour peut enchérir, et légalement', () => {
    const s = craft([P('a', [2, 2, 3, 4, 5]), P('b', [1, 2, 3, 4, 6])])
    expect(() => reduceMenteur(s, { type: 'BID', playerId: 'b', qty: 2, face: 3 })).toThrow(
      'NOT_YOUR_TURN'
    )
    const after = reduceMenteur(s, { type: 'BID', playerId: 'a', qty: 2, face: 3 })
    expect(after.currentBid).toEqual({ qty: 2, face: 3, by: 'a' })
    expect(after.turnIdx).toBe(1)
    expect(() =>
      reduceMenteur(after, { type: 'BID', playerId: 'b', qty: 2, face: 2 })
    ).toThrow('ILLEGAL_BID')
  })

  it('DUDO impossible sans enchère', () => {
    const s = craft([P('a', [2, 2, 3, 4, 5]), P('b', [1, 2, 3, 4, 6])])
    expect(() => reduceMenteur(s, { type: 'DUDO', playerId: 'a' })).toThrow('NO_BID_TO_CHALLENGE')
  })

  it('enchère qui TIENT → l’accusateur perd un dé et boit', () => {
    // 3× face 3 sur la table (un 3 chez a, un 3 + un joker chez b).
    const s = craft([P('a', [3, 2, 4]), P('b', [3, 1, 5])], {
      currentBid: { qty: 3, face: 3, by: 'a' },
      turnIdx: 1,
    })
    const after = reduceMenteur(s, { type: 'DUDO', playerId: 'b' })
    expect(after.phase).toBe('reveal')
    expect(after.lastReveal).toMatchObject({
      matchCount: 3,
      bidHeld: true,
      loserId: 'b',
      sips: 3, // b avait déjà perdu 2 dés (5-3), +1
      eliminatedId: null,
    })
    expect(after.players[1].dice.length).toBe(2)
    expect(after.lastReveal?.allDice).toEqual([
      { playerId: 'a', dice: [3, 2, 4] },
      { playerId: 'b', dice: [3, 1, 5] },
    ])
  })

  it('enchère qui ÉCHOUE → l’enchérisseur perd un dé', () => {
    const s = craft([P('a', [2, 2, 4]), P('b', [6, 5, 5])], {
      currentBid: { qty: 4, face: 6, by: 'a' },
      turnIdx: 1,
    })
    const after = reduceMenteur(s, { type: 'DUDO', playerId: 'b' })
    expect(after.lastReveal).toMatchObject({ matchCount: 1, bidHeld: false, loserId: 'a' })
    expect(after.players[0].dice.length).toBe(2)
  })

  it('dernier dé perdu = éliminé', () => {
    const s = craft([P('a', [2]), P('b', [6, 5])], {
      currentBid: { qty: 2, face: 6, by: 'a' },
      turnIdx: 1,
    })
    const after = reduceMenteur(s, { type: 'DUDO', playerId: 'b' })
    expect(after.lastReveal?.loserId).toBe('a')
    expect(after.lastReveal?.eliminatedId).toBe('a')
    expect(after.players[0].dice.length).toBe(0)
  })
})

describe('CONTINUE', () => {
  it('relance une manche : dés relancés (mêmes comptes), perdant à la main', () => {
    const s = craft([P('a', [2, 3]), P('b', [4, 5, 6])], {
      phase: 'reveal',
      lastReveal: {
        bid: { qty: 9, face: 6, by: 'b' },
        challengerId: 'a',
        allDice: [],
        matchCount: 0,
        bidHeld: false,
        loserId: 'b',
        sips: 3,
        eliminatedId: null,
      },
    })
    const after = reduceMenteur(s, { type: 'CONTINUE', playerId: 'a' })
    expect(after.phase).toBe('bidding')
    expect(after.round).toBe(2)
    expect(after.currentBid).toBeNull()
    expect(after.lastReveal).toBeNull()
    expect(after.players.map((p) => p.dice.length)).toEqual([2, 3])
    expect(after.turnIdx).toBe(1) // le perdant b rouvre
    expect(after.rngState).not.toBe(s.rngState) // le RNG a avancé
  })

  it('perdant éliminé → le vivant suivant rouvre', () => {
    const s = craft([P('a', [2]), P('b', []), P('c', [3, 4])], {
      phase: 'reveal',
      lastReveal: {
        bid: { qty: 1, face: 2, by: 'b' },
        challengerId: 'a',
        allDice: [],
        matchCount: 0,
        bidHeld: false,
        loserId: 'b',
        sips: 5,
        eliminatedId: 'b',
      },
    })
    const after = reduceMenteur(s, { type: 'CONTINUE', playerId: 'c' })
    expect(after.turnIdx).toBe(2)
  })

  it('un seul survivant → partie finie, vainqueur déclaré', () => {
    const s = craft([P('a', []), P('b', [6])], {
      phase: 'reveal',
      lastReveal: {
        bid: { qty: 2, face: 2, by: 'a' },
        challengerId: 'b',
        allDice: [],
        matchCount: 0,
        bidHeld: false,
        loserId: 'a',
        sips: 5,
        eliminatedId: 'a',
      },
    })
    const after = reduceMenteur(s, { type: 'CONTINUE', playerId: 'b' })
    expect(after.phase).toBe('finished')
    expect(after.winnerId).toBe('b')
  })
})

describe('tour et acteur courant', () => {
  it('le tour saute les éliminés', () => {
    const s = craft([P('a', [2, 3]), P('b', []), P('c', [4, 5])])
    const after = reduceMenteur(s, { type: 'BID', playerId: 'a', qty: 1, face: 2 })
    expect(after.turnIdx).toBe(2)
  })
  it('acteur pendant reveal = perdant vivant, sinon suivant', () => {
    const base = {
      bid: { qty: 1, face: 2, by: 'a' },
      challengerId: 'b',
      allDice: [],
      matchCount: 0,
      bidHeld: false,
      sips: 1,
    }
    const alive = craft([P('a', [2]), P('b', [3])], {
      phase: 'reveal',
      lastReveal: { ...base, loserId: 'a', eliminatedId: null },
    })
    expect(currentMenteurActorId(alive)).toBe('a')
    const dead = craft([P('a', []), P('b', [3])], {
      phase: 'reveal',
      lastReveal: { ...base, loserId: 'a', eliminatedId: 'a' },
    })
    expect(currentMenteurActorId(dead)).toBe('b')
    expect(currentMenteurActorId(craft([P('a', [2])], { phase: 'finished' }))).toBeNull()
  })
})

describe('contrat remplacement (LEAVE / REJOIN / REPLACE_LEFT)', () => {
  it('marque parti, revient, puis bot après la grâce', () => {
    const s = craft([P('a', [2, 3]), P('b', [4, 5])])
    const left = reduceMenteur(s, { type: 'LEAVE', playerId: 'a', at: 1000 })
    expect(left.players[0].leftAt).toBe(1000)
    const back = reduceMenteur(left, { type: 'REJOIN', playerId: 'a' })
    expect(back.players[0].leftAt).toBeNull()
    const gone = reduceMenteur(left, { type: 'REPLACE_LEFT', now: 1000 + 60_000, graceMs: 30_000 })
    expect(gone.players[0].isBot).toBe(true)
    expect(gone.players[0].leftAt).toBeNull()
    expect(() =>
      reduceMenteur(left, { type: 'REPLACE_LEFT', now: 1000, graceMs: 30_000 })
    ).toThrow('NOTHING_TO_REPLACE')
  })
})

describe('vues anti-triche', () => {
  it('le viewer voit SES dés, les autres un simple compte, jamais rngState', () => {
    const s = craft([P('a', [2, 3]), P('b', [4, 5, 6])])
    const view = toMenteurClientView(s, 'a')
    expect(view.players[0].dice).toEqual([2, 3])
    expect(view.players[1].dice).toEqual([])
    expect(view.players[1].diceCount).toBe(3)
    expect('rngState' in view).toBe(false)
    expect(JSON.stringify(view)).not.toContain('rngState')
  })
  it('le spectateur TV ne voit aucun gobelet', () => {
    const s = craft([P('a', [2, 3]), P('b', [4, 5, 6])])
    const view = toMenteurSpectatorView(s)
    expect(view.players.every((p) => p.dice.length === 0)).toBe(true)
    expect(view.players.map((p) => p.diceCount)).toEqual([2, 3])
  })
})

describe('Palifico', () => {
  it('countMatches ignore les jokers en Palifico', () => {
    const players = [P('a', [1, 3, 3]), P('b', [1, 5])]
    expect(countMatches(players, 3, true)).toBe(2) // les 1 ne comptent plus
    expect(countMatches(players, 1, true)).toBe(2) // seulement les 1 eux-mêmes
  })

  it('isLegalRaise : face verrouillée, seule la quantité monte', () => {
    const prev = { qty: 3, face: 4, by: 'a' }
    expect(isLegalRaise(prev, 4, 4, 10, true)).toBe(true)
    expect(isLegalRaise(prev, 4, 5, 10, true)).toBe(false) // changement de face interdit
    expect(isLegalRaise(prev, 3, 4, 10, true)).toBe(false) // quantité qui ne monte pas
    // Première enchère de la manche : toujours libre, même en Palifico.
    expect(isLegalRaise(null, 2, 5, 10, true)).toBe(true)
  })

  it('createMenteurState active rulePalifico et calcule palifico initial', () => {
    const s = createMenteurState(
      [
        { id: 'a', name: 'A' },
        { id: 'b', name: 'B' },
      ],
      'seed',
      { palifico: true }
    )
    expect(s.rulePalifico).toBe(true)
    expect(s.palifico).toBe(false) // 5 dés chacun au départ
  })

  it('CONTINUE recalcule palifico quand un joueur tombe à 1 dé', () => {
    const s = craft([P('a', [2]), P('b', [3, 4])], {
      rulePalifico: true,
      phase: 'reveal',
      lastReveal: {
        bid: { qty: 5, face: 6, by: 'b' },
        challengerId: 'a',
        allDice: [],
        matchCount: 0,
        bidHeld: false,
        loserId: 'b',
        sips: 1,
        eliminatedId: null,
        mode: 'dudo',
        gainedId: null,
      },
    })
    const after = reduceMenteur(s, { type: 'CONTINUE', playerId: 'a' })
    // a n'a qu'un dé → la manche suivante est Palifico.
    expect(after.palifico).toBe(true)
  })

  it('BID rejette un changement de face en manche Palifico', () => {
    const s = craft([P('a', [2, 3]), P('b', [4, 5])], {
      rulePalifico: true,
      palifico: true,
      currentBid: { qty: 2, face: 3, by: 'b' },
      turnIdx: 0,
    })
    expect(() => reduceMenteur(s, { type: 'BID', playerId: 'a', qty: 3, face: 4 })).toThrow('ILLEGAL_BID')
    const after = reduceMenteur(s, { type: 'BID', playerId: 'a', qty: 3, face: 3 })
    expect(after.currentBid).toEqual({ qty: 3, face: 3, by: 'a' })
  })
})

describe('Calza', () => {
  it('refuse Calza si la règle est désactivée', () => {
    const s = craft([P('a', [3, 2]), P('b', [3, 5])], {
      ruleCalza: false,
      currentBid: { qty: 2, face: 3, by: 'b' },
      turnIdx: 0,
    })
    expect(() => reduceMenteur(s, { type: 'CALZA', playerId: 'a' })).toThrow('CALZA_DISABLED')
  })

  it('Calza exact → regagne un dé, personne ne boit', () => {
    // 2 face 3 exactement sur la table (un 3 chez a, un 3 chez b, aucun joker).
    const s = craft([P('a', [3, 2]), P('b', [3, 5])], {
      ruleCalza: true,
      currentBid: { qty: 2, face: 3, by: 'b' },
      turnIdx: 0,
    })
    const after = reduceMenteur(s, { type: 'CALZA', playerId: 'a' })
    expect(after.lastReveal).toMatchObject({ mode: 'calza', matchCount: 2, loserId: null, sips: 0 })
    expect(after.lastReveal?.gainedId).toBe('a')
    expect(after.players[0].dice.length).toBe(3) // a avait 2 dés (3 perdus), en regagne 1
  })

  it('Calza raté → le joueur perd un dé et boit', () => {
    // 1 seul dé face 6 sur la table, annoncé 3 → pas exact.
    const s = craft([P('a', [2, 2]), P('b', [6, 5])], {
      ruleCalza: true,
      currentBid: { qty: 3, face: 6, by: 'b' },
      turnIdx: 0,
    })
    const after = reduceMenteur(s, { type: 'CALZA', playerId: 'a' })
    expect(after.lastReveal).toMatchObject({ mode: 'calza', matchCount: 1, loserId: 'a', gainedId: null })
    expect(after.players[0].dice.length).toBe(1)
  })

  it('Calza réussi ne dépasse pas le nombre de dés de départ', () => {
    const s = craft([P('a', [3, 2, 4, 5, 6]), P('b', [3])], {
      ruleCalza: true,
      currentBid: { qty: 2, face: 3, by: 'b' },
      turnIdx: 0,
    })
    const after = reduceMenteur(s, { type: 'CALZA', playerId: 'a' })
    expect(after.lastReveal?.gainedId).toBeNull() // déjà à 5 dés, plafond atteint
    expect(after.players[0].dice.length).toBe(5)
  })

  it('CONTINUE après un Calza réussi : le joueur central rouvre la manche', () => {
    const s = craft([P('a', [3, 2]), P('b', [3, 5])], {
      ruleCalza: true,
      phase: 'reveal',
      lastReveal: {
        bid: { qty: 2, face: 3, by: 'b' },
        challengerId: 'a',
        allDice: [],
        matchCount: 2,
        bidHeld: true,
        loserId: null,
        sips: 0,
        eliminatedId: null,
        mode: 'calza',
        gainedId: 'a',
      },
    })
    const after = reduceMenteur(s, { type: 'CONTINUE', playerId: 'a' })
    expect(after.turnIdx).toBe(0) // a (challengerId) rouvre, pas de loserId à suivre
  })
})

describe('IA du bot', () => {
  it('refuse de jouer si l’acteur n’est pas un bot', () => {
    const s = craft([P('a', [2, 2, 3, 4, 5]), P('b', [1, 2, 3, 4, 6])])
    expect(applyMenteurBotAction(s)).toMatchObject({ ok: false, error: 'NOT_BOT_TURN' })
  })
  it('produit toujours une action légale (enchère ou défi) sur de nombreuses mains', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      let s = createMenteurState(
        [
          { id: 'bot1', name: 'B1', isBot: true },
          { id: 'bot2', name: 'B2', isBot: true },
          { id: 'bot3', name: 'B3', isBot: true },
        ],
        seed
      )
      // Fait jouer les bots quelques coups : aucune erreur ne doit sortir.
      for (let step = 0; step < 12 && s.phase !== 'finished'; step += 1) {
        const r = applyMenteurBotAction(s)
        expect(r.ok).toBe(true)
        if (r.ok) s = r.state
      }
      expect(menteurTotalDice(s)).toBeGreaterThan(0)
    }
  })
  it('des bots seuls terminent toujours une partie', () => {
    for (let seed = 100; seed < 110; seed += 1) {
      let s = createMenteurState(
        [
          { id: 'x', name: 'X', isBot: true },
          { id: 'y', name: 'Y', isBot: true },
        ],
        seed
      )
      let guard = 0
      while (s.phase !== 'finished' && guard < 500) {
        const r = applyMenteurBotAction(s)
        expect(r.ok).toBe(true)
        if (r.ok) s = r.state
        guard += 1
      }
      expect(s.phase).toBe('finished')
      expect(s.winnerId).not.toBeNull()
    }
  })
  it('des bots seuls terminent toujours une partie avec Palifico + Calza activés', () => {
    for (let seed = 200; seed < 210; seed += 1) {
      let s = createMenteurState(
        [
          { id: 'x', name: 'X', isBot: true },
          { id: 'y', name: 'Y', isBot: true },
        ],
        seed,
        { palifico: true, calza: true }
      )
      let guard = 0
      while (s.phase !== 'finished' && guard < 500) {
        const r = applyMenteurBotAction(s)
        expect(r.ok).toBe(true)
        if (r.ok) s = r.state
        guard += 1
      }
      expect(s.phase).toBe('finished')
      expect(s.winnerId).not.toBeNull()
    }
  })
})
