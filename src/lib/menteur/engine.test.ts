import { afterEach, describe, expect, it, vi } from 'vitest'
import {
  countMatches,
  createMenteurState,
  currentMenteurActorId,
  isLegalRaise,
  menteurHumanSeated,
  menteurTotalDice,
  reduceMenteur,
  toMenteurClientView,
  toMenteurSpectatorView,
  MENTEUR_START_DICE,
  MENTEUR_REVEAL_MIN_MS,
  menteurSipsTotal,
  MenteurEngineError,
  MENTEUR_SPEECH_CAP,
  type MenteurPlayer,
  type MenteurRules,
  type MenteurSay,
  type MenteurSpeech,
  type MenteurSpeechKind,
  type MenteurState,
} from './engine'
import {
  applyMenteurBotAction,
  buildMenteurState,
  menteurClientViewJson,
  menteurSpectatorViewJson,
  parseMenteurState,
  type MenteurRoomActionResult,
} from './server-adapter'
import { createRng } from '@/lib/petit-buveur/rng'

const P = (id: string, dice: number[], extra: Partial<MenteurPlayer> = {}): MenteurPlayer => ({
  id,
  name: id.toUpperCase(),
  isBot: false,
  leftAt: null,
  dice,
  lostCount: MENTEUR_START_DICE - dice.length,
  ...extra,
})

/** Horloge de référence des tests (le moteur n'appelle jamais Date.now). */
const T0 = 1_000_000
/** Après le plancher de lecture du reveal : le « manche suivante » passe. */
const T_CONT = T0 + MENTEUR_REVEAL_MIN_MS

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
  revealAt: null,
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
    expect(() => reduceMenteur(s, { type: 'DUDO', playerId: 'a', now: T0 })).toThrow('NO_BID_TO_CHALLENGE')
  })

  it('enchère qui TIENT → l’accusateur perd un dé et boit', () => {
    // 3× face 3 sur la table (un 3 chez a, un 3 + un joker chez b).
    const s = craft([P('a', [3, 2, 4]), P('b', [3, 1, 5])], {
      currentBid: { qty: 3, face: 3, by: 'a' },
      turnIdx: 1,
    })
    const after = reduceMenteur(s, { type: 'DUDO', playerId: 'b', now: T0 })
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
    const after = reduceMenteur(s, { type: 'DUDO', playerId: 'b', now: T0 })
    expect(after.lastReveal).toMatchObject({ matchCount: 1, bidHeld: false, loserId: 'a' })
    expect(after.players[0].dice.length).toBe(2)
  })

  it('dernier dé perdu = éliminé', () => {
    const s = craft([P('a', [2]), P('b', [6, 5])], {
      currentBid: { qty: 2, face: 6, by: 'a' },
      turnIdx: 1,
    })
    const after = reduceMenteur(s, { type: 'DUDO', playerId: 'b', now: T0 })
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
    const after = reduceMenteur(s, { type: 'CONTINUE', playerId: 'a', now: T_CONT })
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
    const after = reduceMenteur(s, { type: 'CONTINUE', playerId: 'c', now: T_CONT })
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
    const after = reduceMenteur(s, { type: 'CONTINUE', playerId: 'b', now: T_CONT })
    expect(after.phase).toBe('finished')
    expect(after.winnerId).toBe('b')
  })
})

describe('gorgées annoncées = gorgées appliquées (F35)', () => {
  /**
   * Source de vérité du Menteur : le perdant boit AUTANT DE GORGÉES QUE DE DÉS
   * déjà perdus (1 au premier dé, 2 au deuxième, 3 au troisième…). Le nombre
   * annoncé dans `lastReveal.sips` est donc exactement son `lostCount` APRÈS
   * la perte — c'est cette valeur que l'affichage doit reprendre, et le total
   * réellement bu est la SOMME des annonces, pas le nombre de dés perdus.
   */
  it('lastReveal.sips vaut le lostCount du perdant après la perte, et escalade dé après dé', () => {
    let s = craft([P('a', [2, 2, 2, 2, 2]), P('b', [6, 6, 6, 6, 6])])
    const announced: number[] = []
    for (let lost = 1; lost <= 3; lost += 1) {
      // Enchère intenable de « a » : « b » démasque, « a » perd un dé.
      s = {
        ...s,
        phase: 'bidding',
        currentBid: { qty: 10, face: 3, by: 'a' },
        turnIdx: 1,
        revealAt: null,
      }
      s = reduceMenteur(s, { type: 'DUDO', playerId: 'b', now: T0 })
      const loser = s.players.find((p) => p.id === 'a')!
      expect(s.lastReveal?.loserId).toBe('a')
      expect(s.lastReveal?.sips).toBe(loser.lostCount)
      expect(loser.lostCount).toBe(lost)
      announced.push(s.lastReveal!.sips)
    }
    expect(announced).toEqual([1, 2, 3])
    // Le compteur de dés perdus (3) n'est PAS le total bu (6) : un écran qui
    // affiche `lostCount` comme un nombre de gorgées mentirait.
    const loser = s.players.find((p) => p.id === 'a')!
    expect(loser.lostCount).toBe(3)
    expect(announced.reduce((x, y) => x + y, 0)).toBe(6)
  })

  it('la vue client expose le TOTAL bu (sipsTotal), pas le nombre de dés perdus', () => {
    let s = craft([P('a', [2, 2, 2, 2, 2]), P('b', [6, 6, 6, 6, 6])])
    let announced = 0
    for (let lost = 1; lost <= 3; lost += 1) {
      s = {
        ...s,
        phase: 'bidding',
        currentBid: { qty: 10, face: 3, by: 'a' },
        turnIdx: 1,
        revealAt: null,
      }
      s = reduceMenteur(s, { type: 'DUDO', playerId: 'b', now: T0 })
      announced += s.lastReveal!.sips
      const view = toMenteurClientView(s, 'a').players.find((p) => p.id === 'a')!
      // Le nombre derrière la chope = la SOMME des gorgées annoncées.
      expect(view.sipsTotal).toBe(announced)
      expect(view.sipsTotal).toBe(menteurSipsTotal(view.lostCount))
    }
    // 3 dés perdus, mais 6 gorgées bues : afficher lostCount mentirait.
    expect(announced).toBe(6)
    expect(toMenteurClientView(s, 'a').players[0].lostCount).toBe(3)
  })

  it('Calza réussi : rien d’annoncé, rien d’appliqué', () => {
    const s = craft([P('a', [3, 3, 2]), P('b', [4, 5, 6])], {
      currentBid: { qty: 2, face: 3, by: 'b' },
      turnIdx: 0,
      ruleCalza: true,
    })
    const after = reduceMenteur(s, { type: 'CALZA', playerId: 'a', now: T0 })
    expect(after.lastReveal).toMatchObject({ loserId: null, sips: 0 })
    expect(after.players.map((p) => p.lostCount)).toEqual(s.players.map((p) => p.lostCount))
  })
})

describe('temps de lecture de la révélation (F33)', () => {
  it('le premier impatient ne relance pas les dés avant que la table ait vu', () => {
    const s = craft([P('a', [2, 2, 4]), P('b', [6, 5, 5])], {
      currentBid: { qty: 4, face: 6, by: 'a' },
      turnIdx: 1,
    })
    const revealed = reduceMenteur(s, { type: 'DUDO', playerId: 'b', now: T0 })
    expect(revealed.revealAt).toBe(T0)
    expect(() =>
      reduceMenteur(revealed, {
        type: 'CONTINUE',
        playerId: 'b',
        now: T0 + MENTEUR_REVEAL_MIN_MS - 1,
      })
    ).toThrow('READING_TIME')
    const next = reduceMenteur(revealed, {
      type: 'CONTINUE',
      playerId: 'b',
      now: T0 + MENTEUR_REVEAL_MIN_MS,
    })
    expect(next.phase).toBe('bidding')
    expect(next.revealAt).toBeNull()
  })

  it('un BOT (tick de service) enchaîne sans attendre — une table de bots ne se figera jamais', () => {
    const s = craft(
      [P('a', [2, 2, 4], { isBot: true }), P('b', [6, 5, 5], { isBot: true })],
      { currentBid: { qty: 4, face: 6, by: 'a' }, turnIdx: 1 }
    )
    const revealed = reduceMenteur(s, { type: 'DUDO', playerId: 'b', now: T0 })
    const next = reduceMenteur(revealed, { type: 'CONTINUE', playerId: 'b', now: T0 })
    expect(next.phase).toBe('bidding')
  })

  /** Révélation entrée à T0, menée par le bot 'b' (perdant encore vivant). */
  const botLedReveal = (others: MenteurPlayer[]): MenteurState =>
    craft([P('b', [6, 5], { isBot: true }), ...others], {
      phase: 'reveal',
      revealAt: T0,
      lastReveal: {
        bid: { qty: 4, face: 6, by: 'b' },
        challengerId: others[0].id,
        allDice: [],
        matchCount: 1,
        bidHeld: false,
        loserId: 'b',
        sips: 4,
        eliminatedId: null,
        mode: 'dudo',
        gainedId: null,
      },
    })
  const botContinue = (s: MenteurState, now: number) =>
    reduceMenteur(s, { type: 'CONTINUE', playerId: 'b', now })

  it('un humain assis, même éliminé : le bot attend le plancher comme lui', () => {
    const alive = botLedReveal([P('h', [2, 3]), P('c', [4], { isBot: true })])
    const eliminated = botLedReveal([P('c', [4], { isBot: true }), P('h', [])])
    for (const s of [alive, eliminated]) {
      expect(currentMenteurActorId(s)).toBe('b')
      expect(() => botContinue(s, T0 + 3_900)).toThrow('READING_TIME')
      expect(botContinue(s, T0 + MENTEUR_REVEAL_MIN_MS).phase).toBe('bidding')
      // Vieil état sans horodatage : lisible tout de suite, jamais figé.
      expect(botContinue({ ...s, revealAt: null }, T0).phase).toBe('bidding')
    }
  })

  it('table 100 % bots : le bot enchaîne dès 0 s, la révélation ne se fige jamais', () => {
    const s = botLedReveal([P('c', [4, 2], { isBot: true }), P('d', [3], { isBot: true })])
    expect(botContinue(s, T0).phase).toBe('bidding')
  })

  it('un humain parti ne compte pas : personne à faire lire', () => {
    const s = botLedReveal([P('h', [2, 3], { leftAt: T0 - 1_000 }), P('c', [4], { isBot: true })])
    expect(menteurHumanSeated(s.players)).toBe(false)
    expect(botContinue(s, T0).phase).toBe('bidding')
    // Revenu : il compte de nouveau.
    const back = { ...s, players: s.players.map((p) => (p.id === 'h' ? { ...p, leftAt: null } : p)) }
    expect(() => botContinue(back, T0 + 3_900)).toThrow('READING_TIME')
  })

  it('état sérialisé sans horodatage (partie en vol) : jamais bloqué', () => {
    const s = craft([P('a', [2]), P('b', [6])], {
      phase: 'reveal',
      revealAt: null,
      lastReveal: {
        bid: { qty: 1, face: 2, by: 'b' },
        challengerId: 'a',
        allDice: [],
        matchCount: 0,
        bidHeld: false,
        loserId: 'b',
        sips: 4,
        eliminatedId: null,
      },
    })
    expect(reduceMenteur(s, { type: 'CONTINUE', playerId: 'a', now: T0 }).phase).toBe('bidding')
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

  it('le partant qui tenait les enchères rend la main immédiatement', () => {
    const s = craft([P('a', [2, 3]), P('b', [4, 5]), P('c', [6, 1])], {
      turnIdx: 0,
      currentBid: { qty: 2, face: 4, by: 'c' },
    })
    const left = reduceMenteur(s, { type: 'LEAVE', playerId: 'a', at: 1000 })
    expect(left.turnIdx).toBe(1)
    expect(currentMenteurActorId(left)).toBe('b')
    // Rien d'autre ne bouge : dés gardés, enchère en cours intacte.
    expect(left.players[0].dice).toEqual([2, 3])
    expect(left.currentBid).toEqual(s.currentBid)
    expect(left.phase).toBe('bidding')
    // Départ en chaîne : le tour saute les partants pour atteindre 'c'.
    const left2 = reduceMenteur(left, { type: 'LEAVE', playerId: 'b', at: 1100 })
    expect(left2.turnIdx).toBe(2)
  })

  it('le revenant a perdu son tour : REJOIN ne ramène pas la main en arrière', () => {
    const s = craft([P('a', [2, 3]), P('b', [4, 5]), P('c', [6, 1])], { turnIdx: 0 })
    const left = reduceMenteur(s, { type: 'LEAVE', playerId: 'a', at: 1000 })
    // Entre-temps la table a joué : 'b' a enchéri, c'est au tour de 'c'.
    const played = reduceMenteur(left, { type: 'BID', playerId: 'b', qty: 2, face: 4 })
    const back = reduceMenteur(played, { type: 'REJOIN', playerId: 'a' })
    expect(back.players.find((p) => p.id === 'a')?.leftAt).toBeNull()
    // Le tour NE revient PAS au revenant, et rien d'autre n'a bougé.
    expect(back.turnIdx).toBe(played.turnIdx)
    expect(currentMenteurActorId(back)).toBe('c')
    expect(back.currentBid).toEqual(played.currentBid)
    // Ses dés ne l'ont jamais quitté : il reprend sa place telle qu'il l'a laissée.
    expect(back.players.find((p) => p.id === 'a')?.dice).toEqual([2, 3])
    expect(menteurTotalDice(back)).toBe(menteurTotalDice(s))
  })

  it('un départ hors tour (ou hors enchères) ne déplace pas le tour', () => {
    const s = craft([P('a', [2, 3]), P('b', [4, 5]), P('c', [6, 1])], { turnIdx: 1 })
    expect(reduceMenteur(s, { type: 'LEAVE', playerId: 'a', at: 1000 }).turnIdx).toBe(1)
    const revealing = craft([P('a', [2, 3]), P('b', [4, 5])], {
      phase: 'reveal',
      turnIdx: 0,
      lastReveal: {
        bid: { qty: 2, face: 4, by: 'b' },
        challengerId: 'a',
        allDice: [],
        matchCount: 2,
        bidHeld: true,
        loserId: 'a',
        sips: 3,
        eliminatedId: null,
      },
    })
    expect(reduceMenteur(revealing, { type: 'LEAVE', playerId: 'a', at: 1000 }).turnIdx).toBe(0)
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
    const after = reduceMenteur(s, { type: 'CONTINUE', playerId: 'a', now: T_CONT })
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
    expect(() => reduceMenteur(s, { type: 'CALZA', playerId: 'a', now: T0 })).toThrow('CALZA_DISABLED')
  })

  it('Calza exact → regagne un dé, personne ne boit', () => {
    // 2 face 3 exactement sur la table (un 3 chez a, un 3 chez b, aucun joker).
    const s = craft([P('a', [3, 2]), P('b', [3, 5])], {
      ruleCalza: true,
      currentBid: { qty: 2, face: 3, by: 'b' },
      turnIdx: 0,
    })
    const after = reduceMenteur(s, { type: 'CALZA', playerId: 'a', now: T0 })
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
    const after = reduceMenteur(s, { type: 'CALZA', playerId: 'a', now: T0 })
    expect(after.lastReveal).toMatchObject({ mode: 'calza', matchCount: 1, loserId: 'a', gainedId: null })
    expect(after.players[0].dice.length).toBe(1)
  })

  it('Calza réussi ne dépasse pas le nombre de dés de départ', () => {
    const s = craft([P('a', [3, 2, 4, 5, 6]), P('b', [3])], {
      ruleCalza: true,
      currentBid: { qty: 2, face: 3, by: 'b' },
      turnIdx: 0,
    })
    const after = reduceMenteur(s, { type: 'CALZA', playerId: 'a', now: T0 })
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
    const after = reduceMenteur(s, { type: 'CONTINUE', playerId: 'a', now: T_CONT })
    expect(after.turnIdx).toBe(0) // a (challengerId) rouvre, pas de loserId à suivre
  })
})

describe('IA du bot', () => {
  /** Hasard des choix rejouable : jamais Math.random dans ces tests. */
  const seeded = (seed: string | number) => createRng(`menteur-ia-${seed}`).next

  /** Joue des bots seuls jusqu'à la fin (ou `maxSteps`), sur une horloge virtuelle. */
  const playBots = (s0: MenteurState, rand: () => number, maxSteps = 500) => {
    let s = s0
    let now = T0
    let steps = 0
    while (s.phase !== 'finished' && steps < maxSteps) {
      const r = applyMenteurBotAction(s, rand, now)
      expect(r).toMatchObject({ ok: true })
      if (r.ok) s = r.state
      now += 3_000
      steps += 1
    }
    return s
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('refuse de jouer si l’acteur n’est pas un bot', () => {
    const s = craft([P('a', [2, 2, 3, 4, 5]), P('b', [1, 2, 3, 4, 6])])
    expect(applyMenteurBotAction(s, seeded(0), T0)).toMatchObject({ ok: false, error: 'NOT_BOT_TURN' })
  })

  it('produit toujours une action légale (enchère ou défi) sur de nombreuses mains', () => {
    for (let seed = 0; seed < 30; seed += 1) {
      const s = createMenteurState(
        [
          { id: 'bot1', name: 'Bernadette', isBot: true },
          { id: 'bot2', name: 'Gépéto', isBot: true },
          { id: 'bot3', name: 'Raoul', isBot: true },
        ],
        seed
      )
      // Fait jouer les bots quelques coups : aucune erreur ne doit sortir.
      expect(menteurTotalDice(playBots(s, seeded(seed), 12))).toBeGreaterThan(0)
    }
  })

  it('des bots seuls terminent toujours une partie', () => {
    for (let seed = 100; seed < 110; seed += 1) {
      const s = createMenteurState(
        [
          { id: 'x', name: 'Suzette', isBot: true },
          { id: 'y', name: 'Germaine', isBot: true },
        ],
        seed
      )
      const end = playBots(s, seeded(seed))
      expect(end.phase).toBe('finished')
      expect(end.winnerId).not.toBeNull()
    }
  })

  it('des bots seuls terminent toujours une partie avec Palifico + Calza activés', () => {
    for (let seed = 200; seed < 210; seed += 1) {
      const s = createMenteurState(
        [
          { id: 'x', name: 'Marcel', isBot: true },
          { id: 'y', name: 'Dédé', isBot: true },
        ],
        seed,
        { palifico: true, calza: true }
      )
      const end = playBots(s, seeded(seed))
      expect(end.phase).toBe('finished')
      expect(end.winnerId).not.toBeNull()
    }
  })
})

describe('IA du bot : décision sur sa seule vue, rejouable par graine', () => {
  // Un persona par trait : le cerveau joue avec le caractère de chacun.
  const BOTS = ['Barnabé', 'Gépéto', 'Kéké', 'Mauricette'].map((name, i) => ({ id: `b${i + 1}`, name, isBot: true }))
  const RULES: MenteurRules[] = [{}, { calza: true }, { palifico: true, calza: true }]

  /** Le coup joué, lu dans le résultat : l'enchère posée, ou le défi lancé. */
  const moveOf = (r: MenteurRoomActionResult) => {
    if (!r.ok) return { error: r.error }
    const { phase, currentBid, lastReveal } = r.state
    return phase === 'bidding'
      ? { bid: currentBid }
      : { call: lastReveal?.mode, by: lastReveal?.challengerId, against: lastReveal?.bid }
  }

  /**
   * Relance les dés cachés de tous sauf `keepId` (même nombre de dés) et
   * change le RNG du moteur : tout ce qu'un humain à sa place ne voit pas.
   */
  const scramble = (s: MenteurState, keepId: string, seed: string): MenteurState => {
    const rng = createRng(seed)
    return {
      ...s,
      rngState: createRng(`${seed}-rng`).getState(),
      players: s.players.map((p) => (p.id === keepId ? p : { ...p, dice: p.dice.map(() => rng.int(1, 6)) })),
    }
  }

  /** États d'enchères variés, bot au tour, tirés de vraies parties de bots. */
  const biddingStates = (): MenteurState[] => {
    const out: MenteurState[] = []
    for (const rules of RULES) {
      for (let seed = 0; seed < 12; seed += 1) {
        let s = createMenteurState(BOTS.slice(0, 2 + (seed % 3)), `etats-${seed}`, rules)
        const rand = createRng(`etats-coups-${seed}`).next
        let now = T0
        for (let step = 0; step < 60 && s.phase !== 'finished'; step += 1) {
          if (s.phase === 'bidding') out.push(s)
          const r = applyMenteurBotAction(s, rand, now)
          if (!r.ok) throw new Error(r.error)
          s = r.state
          now += 3_000
        }
      }
    }
    return out
  }

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('même suite rand ⇒ même partie, sans Math.random ni Date.now', () => {
    const random = vi.spyOn(Math, 'random')
    const clock = vi.spyOn(Date, 'now')
    for (const rules of RULES) {
      for (let seed = 0; seed < 8; seed += 1) {
        const replay = () => {
          let s = createMenteurState(BOTS.slice(0, 3), `replay-${seed}`, rules)
          const rand = createRng(`replay-coups-${seed}`).next
          const moves: unknown[] = []
          for (let step = 0; step < 400 && s.phase !== 'finished'; step += 1) {
            const r = applyMenteurBotAction(s, rand, T0 + step * 3_000)
            moves.push(moveOf(r))
            if (!r.ok) break
            s = r.state
          }
          return { moves, end: s }
        }
        const first = replay()
        expect(first.end.phase).toBe('finished')
        expect(replay()).toEqual(first)
      }
    }
    expect(random).not.toHaveBeenCalled()
    expect(clock).not.toHaveBeenCalled()
  })

  it('anti-triche : dés cachés des autres et RNG du moteur brouillés ⇒ même coup', () => {
    const states = biddingStates()
    expect(states.length).toBeGreaterThan(300)
    const seen = new Set<string>()
    let scrambledDice = 0
    states.forEach((s, i) => {
      const botId = currentMenteurActorId(s)!
      const other = scramble(s, botId, `brouille-${i}`)
      if (JSON.stringify(other.players) !== JSON.stringify(s.players)) scrambledDice += 1
      const move = moveOf(applyMenteurBotAction(s, createRng(`coup-${i}`).next, T0))
      expect(moveOf(applyMenteurBotAction(other, createRng(`coup-${i}`).next, T0)), `état ${i}`).toEqual(move)
      seen.add('bid' in move ? 'BID' : String(move.call))
    })
    // Le test mord : les dés brouillés diffèrent presque toujours, et les
    // trois coups (enchère, Menteur, Calza) y passent.
    expect(scrambledDice).toBeGreaterThan(states.length * 0.9)
    expect([...seen].sort()).toEqual(['BID', 'calza', 'dudo'])
  })
})

describe('mémoire de la table : la chaîne des enchères et les duels', () => {
  const BOTS = ['b1', 'b2', 'b3', 'b4'].map((id) => ({ id, name: id.toUpperCase(), isBot: true }))

  /** Une partie de bots jouée jusqu'au bout : chaque état traversé, dans l'ordre. */
  const botGame = (seed: string, rules: MenteurRules = {}, seats = 4): MenteurState[] => {
    let s = createMenteurState(BOTS.slice(0, seats), `memoire-${seed}`, rules)
    const rand = createRng(`memoire-coups-${seed}`).next
    const states = [s]
    let now = T0
    for (let step = 0; step < 800 && s.phase !== 'finished'; step += 1) {
      const r = applyMenteurBotAction(s, rand, now)
      if (!r.ok) throw new Error(r.error)
      s = r.state
      states.push(s)
      now += 3_000
    }
    expect(s.phase).toBe('finished')
    return states
  }

  const RULES: MenteurRules[] = [{}, { calza: true }, { palifico: true, calza: true }]
  const GAMES = RULES.flatMap((rules, r) => [0, 1, 2].map((g) => botGame(`${r}-${g}`, rules, 2 + ((r + g) % 3))))

  it('BID ajoute une entrée ; la chaîne tient pendant la révélation, CONTINUE la vide', () => {
    let s = craft([P('a', [2, 2, 3]), P('b', [4, 5, 6]), P('c', [1, 6, 6])])
    s = reduceMenteur(s, { type: 'BID', playerId: 'a', qty: 2, face: 2 })
    expect(s.bids).toEqual([{ qty: 2, face: 2, by: 'a' }])
    s = reduceMenteur(s, { type: 'BID', playerId: 'b', qty: 2, face: 5 })
    s = reduceMenteur(s, { type: 'BID', playerId: 'c', qty: 3, face: 6 })
    expect(s.bids).toEqual([
      { qty: 2, face: 2, by: 'a' },
      { qty: 2, face: 5, by: 'b' },
      { qty: 3, face: 6, by: 'c' },
    ])
    const revealed = reduceMenteur(s, { type: 'DUDO', playerId: 'a', now: T0 })
    expect(revealed.phase).toBe('reveal')
    expect(revealed.bids).toEqual(s.bids)
    const next = reduceMenteur(revealed, { type: 'CONTINUE', playerId: 'a', now: T_CONT })
    expect(next.phase).toBe('bidding')
    expect(next.bids).toEqual([])
    expect(next.duels).toHaveLength(1)
  })

  it('la partie finie vide aussi la chaîne, et garde ses duels', () => {
    const s = craft([P('a', [2]), P('b', [6, 6])], {
      currentBid: { qty: 2, face: 3, by: 'a' },
      bids: [{ qty: 2, face: 3, by: 'a' }],
      turnIdx: 1,
    })
    const revealed = reduceMenteur(s, { type: 'DUDO', playerId: 'b', now: T0 })
    expect(revealed.lastReveal?.eliminatedId).toBe('a')
    const end = reduceMenteur(revealed, { type: 'CONTINUE', playerId: 'b', now: T_CONT })
    expect(end.phase).toBe('finished')
    expect(end.bids).toEqual([])
    expect(end.duels).toEqual(revealed.duels)
  })

  it('DUDO pousse un duel en faits bruts : enchérisseur, défieur, issue, perdant, chaîne', () => {
    let s = craft([P('a', [2, 2, 3]), P('b', [4, 5, 6])])
    s = reduceMenteur(s, { type: 'BID', playerId: 'a', qty: 2, face: 2 })
    s = reduceMenteur(s, { type: 'BID', playerId: 'b', qty: 3, face: 5 })
    const after = reduceMenteur(s, { type: 'DUDO', playerId: 'a', now: T0 })
    expect(after.duels).toEqual([
      {
        round: 1,
        bidderId: 'b',
        challengerId: 'a',
        mode: 'dudo',
        held: false,
        loserId: 'b',
        bids: [
          { qty: 2, face: 2, by: 'a', bluff: false },
          { qty: 3, face: 5, by: 'b', bluff: false },
        ],
      },
    ])
  })

  it('CALZA pousse un duel ; un Calza exact n’a pas de perdant', () => {
    // Exact : deux 3 sur la table pour « 2 × 3 ».
    const exact = craft([P('a', [3, 2]), P('b', [3, 5])], { ruleCalza: true, turnIdx: 1 })
    const bidded = reduceMenteur(exact, { type: 'BID', playerId: 'b', qty: 2, face: 3 })
    const won = reduceMenteur(bidded, { type: 'CALZA', playerId: 'a', now: T0 })
    expect(won.duels).toEqual([
      {
        round: 1,
        bidderId: 'b',
        challengerId: 'a',
        mode: 'calza',
        held: true,
        loserId: null,
        bids: [{ qty: 2, face: 3, by: 'b', bluff: false }],
      },
    ])

    // Raté : un seul 6 pour « 3 × 6 », le parieur perd.
    const miss = craft([P('a', [2, 2]), P('b', [6, 5])], { ruleCalza: true, turnIdx: 1 })
    const lost = reduceMenteur(reduceMenteur(miss, { type: 'BID', playerId: 'b', qty: 3, face: 6 }), {
      type: 'CALZA',
      playerId: 'a',
      now: T0,
    })
    expect(lost.duels?.[0]).toMatchObject({ mode: 'calza', held: false, loserId: 'a', bidderId: 'b' })
  })

  it('drapeau bluff : les jokers comptent, mais pas pour une enchère aux 1', () => {
    let s = craft([P('a', [1, 4]), P('b', [2, 4]), P('c', [3, 3, 6])])
    s = reduceMenteur(s, { type: 'BID', playerId: 'a', qty: 1, face: 3 }) // un joker : pas un bluff
    s = reduceMenteur(s, { type: 'BID', playerId: 'b', qty: 2, face: 3 }) // ni 3 ni joker : bluff
    s = reduceMenteur(s, { type: 'BID', playerId: 'c', qty: 1, face: 1 }) // des 3, aucun 1 : bluff
    s = reduceMenteur(s, { type: 'BID', playerId: 'a', qty: 2, face: 1 }) // tient un 1 : pas un bluff
    const after = reduceMenteur(s, { type: 'DUDO', playerId: 'b', now: T0 })
    expect(after.duels?.[0].bids.map((b) => b.bluff)).toEqual([false, true, true, false])
  })

  it('drapeau bluff en Palifico : les 1 ne sont plus jokers', () => {
    let s = craft([P('a', [1]), P('b', [3, 5]), P('c', [2, 2])], { rulePalifico: true, palifico: true })
    s = reduceMenteur(s, { type: 'BID', playerId: 'a', qty: 1, face: 3 }) // un 1 seul : bluff en Palifico
    s = reduceMenteur(s, { type: 'BID', playerId: 'b', qty: 2, face: 3 }) // tient un 3
    const after = reduceMenteur(s, { type: 'DUDO', playerId: 'c', now: T0 })
    expect(after.duels?.[0].bids.map((b) => b.bluff)).toEqual([true, false])
    expect(after.duels?.[0]).toMatchObject({ held: false, loserId: 'b' })
  })

  it('manche commencée avant la chaîne (vieil état) : le duel porte quand même l’enchère défiée', () => {
    const s = craft([P('a', [2, 2]), P('b', [6, 5])], { currentBid: { qty: 3, face: 4, by: 'a' }, turnIdx: 1 })
    const after = reduceMenteur(s, { type: 'DUDO', playerId: 'b', now: T0 })
    expect(after.duels?.[0].bids).toEqual([{ qty: 3, face: 4, by: 'a', bluff: true }])
  })

  it('`duels` reste figé pendant les enchères ; chaque défi en ajoute UN, d’accord avec la révélation', () => {
    let challenges = 0
    for (const states of GAMES) {
      for (let i = 1; i < states.length; i += 1) {
        const prev = states[i - 1]
        const s = states[i]
        if (s.phase === 'reveal' && prev.phase === 'bidding') {
          challenges += 1
          expect(s.duels).toHaveLength((prev.duels ?? []).length + 1)
          expect(s.duels?.slice(0, -1)).toEqual(prev.duels)
          const duel = s.duels![s.duels!.length - 1]
          const reveal = s.lastReveal!
          expect(duel).toMatchObject({
            round: s.round,
            bidderId: reveal.bid.by,
            challengerId: reveal.challengerId,
            mode: reveal.mode,
            held: reveal.matchCount >= reveal.bid.qty,
            loserId: reveal.loserId,
          })
          expect(duel.bids.map(({ qty, face, by }) => ({ qty, face, by }))).toEqual(prev.bids)
          expect(duel.bids[duel.bids.length - 1]).toMatchObject(reveal.bid)
          // La marque se relit sur les gobelets levés, publics à cet instant.
          for (const b of duel.bids) {
            const shown = reveal.allDice.find((d) => d.playerId === b.by)!
            expect(b.bluff).toBe(countMatches([P(b.by, shown.dice)], b.face, prev.palifico) === 0)
          }
        } else {
          expect(s.duels).toBe(prev.duels)
        }
        if (s.phase === 'bidding' && prev.phase === 'bidding') {
          expect(s.bids).toEqual([...(prev.bids ?? []), s.currentBid])
        }
      }
    }
    expect(challenges).toBeGreaterThan(100)
  })

  it('compatibilité : un état JSON sans bids ni duels se parse et se joue jusqu’à la fin', () => {
    for (const rules of RULES) {
      const s0 = createMenteurState(BOTS.slice(0, 3), 'compat', rules)
      const r1 = applyMenteurBotAction(s0, createRng('compat-1').next, T0)
      if (!r1.ok) throw new Error(r1.error)
      const { bids: _bids, duels: _duels, ...legacy } = r1.state
      void _bids
      void _duels
      const parsed = parseMenteurState(JSON.stringify(legacy))!
      expect(parsed.bids).toEqual([])
      expect(parsed.duels).toEqual([])
      let s = parsed
      const rand = createRng('compat-coups').next
      for (let step = 0; step < 800 && s.phase !== 'finished'; step += 1) {
        const r = applyMenteurBotAction(s, rand, T0 + step * 3_000)
        if (!r.ok) throw new Error(r.error)
        s = r.state
      }
      expect(s.phase).toBe('finished')
      expect(s.duels!.length).toBeGreaterThan(0)
    }
  })

  // Liste blanche EXACTE : un champ d'état ajouté demain est public par
  // construction (…rest) ; ce test l'arrête tant qu'on n'a pas décidé.
  const VIEW_KEYS = [
    'bids', 'currentBid', 'duels', 'lastReveal', 'palifico', 'phase', 'players', 'rematchVotes',
    'revealAt', 'round', 'ruleCalza', 'rulePalifico', 'speech', 'turnIdx', 'version', 'winnerId',
  ]
  const PLAYER_KEYS = ['dice', 'diceCount', 'id', 'isBot', 'leftAt', 'lostCount', 'name', 'sipsTotal']
  const REVEAL_KEYS = [
    'allDice', 'bid', 'bidHeld', 'challengerId', 'eliminatedId', 'gainedId', 'loserId', 'matchCount', 'mode', 'sips',
  ]
  const BID_KEYS = ['by', 'face', 'qty']
  const DUEL_KEYS = ['bidderId', 'bids', 'challengerId', 'held', 'loserId', 'mode', 'round']
  const DUEL_BID_KEYS = ['bluff', 'by', 'face', 'qty']
  const SPEECH_KEYS = ['kind', 'playerId', 'round', 'targetId']
  it('vue joueur et vue spectateur : liste blanche exacte des clés, à tous les étages', () => {
    // Jeux de clés RENCONTRÉS par étage, sur toutes les vues de toutes les parties.
    const seen = {
      view: new Set<string>(),
      player: new Set<string>(),
      bid: new Set<string>(),
      reveal: new Set<string>(),
      duel: new Set<string>(),
      duelBid: new Set<string>(),
      speech: new Set<string>(),
    }
    const note = (set: Set<string>, o: object) => set.add(Object.keys(o).sort().join(','))
    let checked = 0
    for (const states of GAMES) {
      for (const s of states) {
        const views = [...s.players.map((p) => toMenteurClientView(s, p.id)), toMenteurSpectatorView(s)]
        for (const view of views) {
          checked += 1
          note(seen.view, view)
          for (const p of view.players) note(seen.player, p)
          if (view.currentBid) note(seen.bid, view.currentBid)
          for (const b of view.bids ?? []) note(seen.bid, b)
          if (view.lastReveal) note(seen.reveal, view.lastReveal)
          for (const duel of view.duels ?? []) {
            note(seen.duel, duel)
            for (const b of duel.bids) note(seen.duelBid, b)
          }
          for (const sp of view.speech ?? []) note(seen.speech, sp)
        }
      }
    }
    expect(checked).toBeGreaterThan(1000)
    expect([...seen.view]).toEqual([VIEW_KEYS.join(',')])
    expect([...seen.player]).toEqual([PLAYER_KEYS.join(',')])
    expect([...seen.bid]).toEqual([BID_KEYS.join(',')])
    expect([...seen.reveal]).toEqual([REVEAL_KEYS.join(',')])
    expect([...seen.duel]).toEqual([DUEL_KEYS.join(',')])
    expect([...seen.duelBid]).toEqual([DUEL_BID_KEYS.join(',')])
    expect([...seen.speech]).toEqual([SPEECH_KEYS.join(',')])
  })

  it('brouillage : pendant les enchères, dés des autres et RNG changés ⇒ pas un octet de vue ne bouge', () => {
    let withMemory = 0
    let compared = 0
    GAMES.forEach((states, g) => {
      states.forEach((s, i) => {
        if (s.phase !== 'bidding') return
        if ((s.duels ?? []).length > 0 && (s.bids ?? []).length > 0) withMemory += 1
        for (const viewer of s.players) {
          const rng = createRng(`brouille-${g}-${i}-${viewer.id}`)
          const other: MenteurState = {
            ...s,
            rngState: createRng(`brouille-rng-${g}-${i}-${viewer.id}`).getState(),
            players: s.players.map((p) =>
              p.id === viewer.id ? p : { ...p, dice: p.dice.map(() => rng.int(1, 6)) }
            ),
          }
          compared += 1
          expect(menteurClientViewJson(other, viewer.id)).toBe(menteurClientViewJson(s, viewer.id))
          expect(menteurSpectatorViewJson(other)).toBe(menteurSpectatorViewJson(s))
        }
      })
    })
    // Le test mord : des états avec chaîne ET duels passés, en nombre.
    expect(withMemory).toBeGreaterThan(100)
    expect(compared).toBeGreaterThan(500)
  })
})

describe('paroles portées par les coups (say)', () => {
  // a (bot) au tour, b répond, c a enchéri juste avant a, d est éliminé.
  const table = (over: Partial<MenteurState> = {}) =>
    craft(
      [
        P('a', [2, 2, 3, 4, 5], { isBot: true, name: 'Raoul' }),
        P('b', [1, 2, 3, 4, 6]),
        P('c', [3, 3, 5], { isBot: true, name: 'Suzette' }),
        P('d', []),
      ],
      over
    )
  const facing = (over: Partial<MenteurState> = {}) =>
    table({ currentBid: { qty: 2, face: 2, by: 'c' }, bids: [{ qty: 2, face: 2, by: 'c' }], ...over })
  const bid = (s: MenteurState, qty: number, face: number, say?: MenteurSay) =>
    reduceMenteur(s, { type: 'BID', playerId: 'a', qty, face, say })
  const call = (s: MenteurState, type: 'DUDO' | 'CALZA', say?: MenteurSay) =>
    reduceMenteur(s, { type, playerId: 'a', now: T0, say })
  const said = (kind: MenteurSpeechKind, targetId: string, round = 1): MenteurSpeech => ({
    playerId: 'a',
    kind,
    targetId,
    round,
  })
  const REACTIONS: MenteurSpeechKind[] = ['gotcha', 'held', 'caught', 'wrongCall']

  it('la parole naît avec le coup, dans la même version : une enchère, un défi, un Calza', () => {
    const s = table()
    const opened = bid(s, 2, 3, { kind: 'sure', targetId: 'b' })
    expect(opened.version).toBe(s.version + 1)
    expect(opened.currentBid).toEqual({ qty: 2, face: 3, by: 'a' })
    expect(opened.speech).toEqual([said('sure', 'b')])

    const dudo = call(facing(), 'DUDO', { kind: 'suspect', targetId: 'c' })
    expect(dudo.version).toBe(facing().version + 1)
    expect(dudo.phase).toBe('reveal')
    expect(dudo.speech).toEqual([said('suspect', 'c')])

    const calza = call(facing({ ruleCalza: true }), 'CALZA', { kind: 'exact', targetId: 'c' })
    expect(calza.version).toBe(facing().version + 1)
    expect(calza.speech).toEqual([said('exact', 'c')])
  })

  it('sans `say`, aucune parole ; un coup n’en porte jamais plus d’une', () => {
    const s = table({ speech: [said('grudge', 'c', 0)] })
    expect(bid(s, 2, 3).speech).toEqual(s.speech)
    expect(bid(facing(), 3, 2, { kind: 'ally', targetId: 'c' }).speech).toEqual([said('ally', 'c')])
  })

  it('kind permis par coup : enchère sure/unsure/ally/grudge, défi suspect/again, Calza exact ; jamais une réaction', () => {
    for (const kind of ['suspect', 'again', 'exact', ...REACTIONS] as MenteurSpeechKind[]) {
      expect(() => bid(table(), 2, 3, { kind, targetId: 'b' }), kind).toThrow('INVALID_KIND')
    }
    for (const kind of ['sure', 'unsure', 'ally', 'grudge', 'exact', ...REACTIONS] as MenteurSpeechKind[]) {
      expect(() => call(facing(), 'DUDO', { kind, targetId: 'c' }), kind).toThrow('INVALID_KIND')
    }
    for (const kind of ['sure', 'suspect', 'again', ...REACTIONS] as MenteurSpeechKind[]) {
      expect(() => call(facing({ ruleCalza: true }), 'CALZA', { kind, targetId: 'c' }), kind).toThrow('INVALID_KIND')
    }
    expect(() => call(facing(), 'DUDO', { kind: 'bavard' as MenteurSpeechKind, targetId: 'c' })).toThrow('INVALID_KIND')
    // La pique ne se lance qu'à l'ouverture ; « je te suis » suppose quelqu'un à suivre.
    expect(() => bid(facing(), 3, 2, { kind: 'grudge', targetId: 'c' })).toThrow('INVALID_KIND')
    expect(() => bid(table(), 2, 3, { kind: 'ally', targetId: 'b' })).toThrow('INVALID_KIND')
    expect(bid(table(), 2, 3, { kind: 'grudge', targetId: 'c' }).speech).toEqual([said('grudge', 'c')])
    expect(call(facing(), 'DUDO', { kind: 'again', targetId: 'c' }).speech).toEqual([said('again', 'c')])
  })

  it('cible : jamais l’auteur, un éliminé ou un inconnu ; celle que le coup désigne', () => {
    for (const targetId of ['a', 'd', 'zz']) {
      expect(() => bid(table(), 2, 3, { kind: 'grudge', targetId }), targetId).toThrow('INVALID_TARGET')
      expect(() => call(facing(), 'DUDO', { kind: 'suspect', targetId }), targetId).toThrow('INVALID_TARGET')
    }
    // sure / unsure : le joueur qui doit répondre (b), pas un autre.
    expect(() => bid(table(), 2, 3, { kind: 'sure', targetId: 'c' })).toThrow('INVALID_TARGET')
    expect(bid(table(), 2, 3, { kind: 'unsure', targetId: 'b' }).speech).toEqual([said('unsure', 'b')])
    // ally, suspect, again, exact : l'enchérisseur précédent (c), pas un autre.
    expect(() => bid(facing(), 3, 2, { kind: 'ally', targetId: 'b' })).toThrow('INVALID_TARGET')
    expect(() => call(facing(), 'DUDO', { kind: 'again', targetId: 'b' })).toThrow('INVALID_TARGET')
    expect(() => call(facing({ ruleCalza: true }), 'CALZA', { kind: 'exact', targetId: 'b' })).toThrow('INVALID_TARGET')
    // Le répondant saute l'éliminé : après c vient a, puisque d n'a plus de dés.
    const fromC = table({ turnIdx: 2 })
    const cSays = reduceMenteur(fromC, { type: 'BID', playerId: 'c', qty: 1, face: 5, say: { kind: 'sure', targetId: 'a' } })
    expect(cSays.speech).toEqual([{ playerId: 'c', kind: 'sure', targetId: 'a', round: 1 }])
  })

  it(`plafond : ${MENTEUR_SPEECH_CAP} paroles par joueur et par manche ; ni les manches passées ni les autres n’y comptent`, () => {
    const full = facing({ speech: [said('sure', 'b'), said('unsure', 'b')] })
    expect(() => call(full, 'DUDO', { kind: 'suspect', targetId: 'c' })).toThrow('ALREADY_SPOKE')
    expect(call(full, 'DUDO').phase).toBe('reveal')
    const old = facing({ round: 2, speech: [said('sure', 'b'), said('unsure', 'b')] })
    expect(call(old, 'DUDO', { kind: 'suspect', targetId: 'c' }).speech).toHaveLength(3)
    const fromOthers: MenteurSpeech[] = [
      { playerId: 'c', kind: 'sure', targetId: 'a', round: 1 },
      { playerId: 'c', kind: 'ally', targetId: 'b', round: 1 },
    ]
    expect(call(facing({ speech: fromOthers }), 'DUDO', { kind: 'suspect', targetId: 'c' }).speech).toHaveLength(3)
  })

  it('une parole refusée refuse le coup : l’état ne bouge pas', () => {
    const s = facing()
    const before = JSON.stringify(s)
    expect(() => call(s, 'DUDO', { kind: 'suspect', targetId: 'a' })).toThrow(MenteurEngineError)
    expect(JSON.stringify(s)).toBe(before)
  })

  it('CONTINUE élague le fil : seule la manche qui s’achève reste, la nouvelle s’ouvre vide', () => {
    const s = facing({
      round: 2,
      speech: [
        { playerId: 'c', kind: 'sure', targetId: 'a', round: 1 },
        { playerId: 'c', kind: 'ally', targetId: 'b', round: 2 },
      ],
    })
    const reveal = call(s, 'DUDO', { kind: 'suspect', targetId: 'c' })
    expect(reveal.speech?.map((sp) => sp.round)).toEqual([1, 2, 2])
    const next = reduceMenteur(reveal, { type: 'CONTINUE', playerId: 'b', now: T_CONT })
    expect(next.round).toBe(3)
    expect(next.speech).toEqual([
      { playerId: 'c', kind: 'ally', targetId: 'b', round: 2 },
      { playerId: 'a', kind: 'suspect', targetId: 'c', round: 2 },
    ])
    expect(next.speech?.filter((sp) => sp.round === next.round)).toEqual([])
    expect(next.version).toBe(reveal.version + 1)
  })

  it('compatibilité : un vieux JSON sans `speech` se parse, parle et se joue jusqu’à la fin', () => {
    const s0 = createMenteurState(
      ['Raoul', 'Gépéto', 'Josiane'].map((name, i) => ({ id: `bot-${i + 1}`, name, isBot: true })),
      'compat-parole'
    )
    const { speech: _speech, ...legacy } = s0
    void _speech
    const parsed = parseMenteurState(JSON.stringify(legacy))!
    expect(parsed.speech).toEqual([])
    // Même sans le complément du parse, un état d'avant le fil accepte une parole.
    const raw = JSON.parse(JSON.stringify(legacy)) as MenteurState
    const actor = raw.players[raw.turnIdx]
    const answerer = raw.players[(raw.turnIdx + 1) % raw.players.length]
    const opened = reduceMenteur(raw, {
      type: 'BID',
      playerId: actor.id,
      qty: 1,
      face: 2,
      say: { kind: 'sure', targetId: answerer.id },
    })
    expect(opened.speech).toEqual([{ playerId: actor.id, kind: 'sure', targetId: answerer.id, round: 1 }])
    let s = parsed
    let spoken = 0
    const rand = createRng('compat-parole-coups').next
    for (let step = 0; step < 800 && s.phase !== 'finished'; step += 1) {
      const r = applyMenteurBotAction(s, rand, T0 + step * 3_000)
      if (!r.ok) throw new Error(r.error)
      if ((r.state.speech?.length ?? 0) > (s.speech?.length ?? 0)) spoken += 1
      s = r.state
    }
    expect(s.phase).toBe('finished')
    expect(spoken).toBeGreaterThan(0)
  })
})
