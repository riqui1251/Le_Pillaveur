import { describe, expect, it } from 'vitest'
import {
  createCrobardState,
  reduceCrobard,
  CROBARD_BOT_DRAWER_ROUND_MS,
  CROBARD_CHOOSING_MS,
  CROBARD_COUNTDOWN_MS,
  CROBARD_DRAWER_POINTS_PER_GUESSER,
  CROBARD_DRAWING_MS,
  CROBARD_POINTS_FIRST,
  type CrobardState,
} from './engine'
import { phaseKey } from '@/lib/online/phase-clock'

const WORDS = ['Pizza', 'Chat', 'Plage', 'Vélo', 'Noël', 'Robot', 'Fantôme', 'Gâteau', 'Lune', 'Fusée', 'Tigre', 'Phare']
const T0 = 1_000_000

function countdown(n: number, totalRounds = 8): CrobardState {
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))
  return createCrobardState(players, WORDS, 'seed-leave', T0 - CROBARD_COUNTDOWN_MS, totalRounds)
}

function choosing(n: number, totalRounds = 8): CrobardState {
  const raw = countdown(n, totalRounds)
  return reduceCrobard(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
}

function drawing(n: number, totalRounds = 8): CrobardState {
  const s = choosing(n, totalRounds)
  return reduceCrobard(s, { type: 'CHOOSE_WORD', playerId: s.drawerId, index: 0, now: T0 })
}

const guessers = (s: CrobardState) => s.players.filter((p) => p.id !== s.drawerId).map((p) => p.id)
const find = (s: CrobardState, playerId: string, now = T0 + 1_000) =>
  reduceCrobard(s, { type: 'GUESS', playerId, text: s.word ?? '', now })
const leave = (s: CrobardState, playerId: string, at = T0 + 5_000) =>
  reduceCrobard(s, { type: 'LEAVE', playerId, at })
const scoreOf = (s: CrobardState, id: string) => s.players.find((p) => p.id === id)?.score ?? 0
/** Joueur du créneau `offset` après le dessinateur courant, dans l'ordre de passage. */
const drawerAfter = (s: CrobardState, offset: number) =>
  s.drawerOrder[(s.drawerIdx + offset) % s.drawerOrder.length]

describe('Crobard — départ du dessinateur', () => {
  it('pendant le dessin : la manche se clôt aussitôt, les points acquis restent', () => {
    let s = drawing(5)
    const drawer = s.drawerId
    const word = s.word
    const [first] = guessers(s)
    s = find(s, first)

    s = leave(s, drawer, T0 + 12_000)

    // Sans cela : jusqu'à 80 s de toile que plus personne ne dessine.
    expect(s.phase).toBe('roundEnd')
    expect(s.lastRoundWord).toBe(word)
    expect(s.word).toBeNull()
    expect(scoreOf(s, first)).toBe(CROBARD_POINTS_FIRST)
    expect(scoreOf(s, drawer)).toBe(CROBARD_DRAWER_POINTS_PER_GUESSER)
  })

  it('pendant le dessin de la dernière manche : bilan, jamais de fin de partie sur un départ', () => {
    let s = drawing(4, 1)
    s = leave(s, s.drawerId)

    // La fin de partie s'enregistre sur /action : un départ ne la déclenche pas.
    expect(s.phase).toBe('roundEnd')
    expect(s.winnerId).toBeNull()
  })

  it('pendant le choix du mot : on l’attend jusqu’à l’échéance, puis le suivant choisit de nouveaux mots', () => {
    const before = choosing(5)
    const drawer = before.drawerId
    const expected = drawerAfter(before, 1)

    const left = leave(before, drawer, T0 + 2_000)

    // Rien ne bouge au départ : il lui reste le délai de choix pour revenir.
    expect(left.phase).toBe('choosing')
    expect(left.drawerId).toBe(drawer)
    expect(left.wordChoices).toEqual(before.wordChoices)
    expect(left.phaseEndsAt).toBe(before.phaseEndsAt)

    const s = reduceCrobard(left, { type: 'ADVANCE', claimedKey: phaseKey(left), now: T0 + CROBARD_CHOOSING_MS })

    // Sans cela : le mot par défaut, puis 80 s de toile que personne ne dessine.
    expect(s.phase).toBe('choosing')
    expect(s.drawerId).toBe(expected)
    expect(s.drawerOrder[s.drawerIdx]).toBe(expected)
    expect(s.round).toBe(before.round)
    expect(s.phaseEndsAt).toBe(T0 + 2 * CROBARD_CHOOSING_MS)
    // Le partant a vu les trois premiers mots : il pourrait revenir deviner.
    expect(s.wordChoices).toHaveLength(3)
    expect(s.wordChoices?.some((w) => before.wordChoices?.includes(w))).toBe(false)
    expect(() =>
      reduceCrobard(s, { type: 'CHOOSE_WORD', playerId: expected, index: 1, now: T0 + 13_000 })
    ).not.toThrow()
  })

  it('revenu avant l’échéance du choix : il garde ses mots, son tour et une manche entière', () => {
    const before = choosing(5)
    const drawer = before.drawerId
    let s = leave(before, drawer, T0 + 2_000)
    s = reduceCrobard(s, { type: 'REJOIN', playerId: drawer })

    s = reduceCrobard(s, { type: 'CHOOSE_WORD', playerId: drawer, index: 2, now: T0 + 6_000 })

    expect(s.phase).toBe('drawing')
    expect(s.drawerId).toBe(drawer)
    expect(s.word).toBe(before.wordChoices?.[2])
    expect(s.phaseEndsAt).toBe(T0 + 6_000 + CROBARD_DRAWING_MS)
  })

  it('pendant le compte à rebours : son créneau s’ouvre, puis passe au suivant à l’échéance', () => {
    let s = countdown(4)
    const drawer = s.drawerId
    const expected = drawerAfter(s, 1)
    s = leave(s, drawer, T0 - 1_000)

    s = reduceCrobard(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: T0 })
    expect(s.phase).toBe('choosing')
    expect(s.drawerId).toBe(drawer)

    s = reduceCrobard(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: T0 + CROBARD_CHOOSING_MS })
    expect(s.phase).toBe('choosing')
    expect(s.drawerId).toBe(expected)
  })

  it('parti au bilan, revenu 3 s après le « continuer » : il dessine son tour', () => {
    let s = drawing(5)
    const next = drawerAfter(s, 1)
    const other = drawerAfter(s, 2)
    s = reduceCrobard(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: T0 + CROBARD_DRAWING_MS })
    s = leave(s, next, T0 + 85_000)
    s = reduceCrobard(s, { type: 'CONTINUE', playerId: other, now: T0 + 87_000 })
    expect(s.drawerId).toBe(next)
    expect(s.phaseEndsAt).toBe(T0 + 87_000 + CROBARD_CHOOSING_MS)

    s = reduceCrobard(s, { type: 'REJOIN', playerId: next })
    s = reduceCrobard(s, { type: 'CHOOSE_WORD', playerId: next, index: 0, now: T0 + 90_000 })

    // Sauté d'office, il ne dessinait pas de la partie quand il y a autant de
    // manches que de joueurs.
    expect(s.phase).toBe('drawing')
    expect(s.drawerId).toBe(next)
    expect(s.phaseEndsAt).toBe(T0 + 90_000 + CROBARD_DRAWING_MS)
  })

  it('toujours parti à son créneau : 10 s d’attente puis le suivant, pas 90 s ; devenu bot, manche écourtée', () => {
    let s = drawing(5)
    const next = drawerAfter(s, 1)
    const afterNext = drawerAfter(s, 2)
    s = leave(s, next)
    s = reduceCrobard(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: T0 + CROBARD_DRAWING_MS })
    expect(s.phase).toBe('roundEnd')

    const waiting = reduceCrobard(s, { type: 'CONTINUE', playerId: afterNext, now: T0 + 90_000 })
    expect(waiting.drawerId).toBe(next)
    expect(waiting.round).toBe(s.round + 1)
    const passed = reduceCrobard(waiting, {
      type: 'ADVANCE',
      claimedKey: phaseKey(waiting),
      now: T0 + 90_000 + CROBARD_CHOOSING_MS,
    })
    expect(passed.phase).toBe('choosing')
    expect(passed.drawerId).toBe(afterNext)
    // Le créneau passé ne consomme pas de manche.
    expect(passed.round).toBe(waiting.round)
    expect(passed.phaseEndsAt).toBe(T0 + 90_000 + 2 * CROBARD_CHOOSING_MS)

    // Devenu bot, il reprend son créneau : sa manche s'écourte d'elle-même.
    const replaced = reduceCrobard(s, { type: 'REPLACE_LEFT', now: T0 + 90_000, graceMs: 1_000 })
    let botTurn = reduceCrobard(replaced, { type: 'CONTINUE', playerId: afterNext, now: T0 + 90_000 })
    expect(botTurn.drawerId).toBe(next)
    botTurn = reduceCrobard(botTurn, {
      type: 'ADVANCE',
      claimedKey: phaseKey(botTurn),
      now: T0 + 90_000 + CROBARD_CHOOSING_MS,
    })
    expect(botTurn.phaseEndsAt).toBe(T0 + 90_000 + CROBARD_CHOOSING_MS + CROBARD_BOT_DRAWER_ROUND_MS)
  })

  it('dernier présent, il part pendant le choix : rien ne bouge, il retrouve son tour au retour', () => {
    let s = choosing(3)
    const chooser = s.drawerId
    for (const id of guessers(s)) s = leave(s, id, T0 + 1_000)
    const before = s

    s = leave(s, chooser, T0 + 2_000)

    expect(s.phase).toBe('choosing')
    expect(s.drawerId).toBe(chooser)
    expect(s.wordChoices).toEqual(before.wordChoices)
    expect(s.phaseEndsAt).toBe(before.phaseEndsAt)
  })

  it('partie en cours d’avant le correctif : à l’échéance du choix, la main passe au présent suivant', () => {
    const before = choosing(4)
    const expected = drawerAfter(before, 1)
    // État tel que l'ancien moteur le laissait : parti, toujours dessinateur.
    const legacy: CrobardState = {
      ...before,
      players: before.players.map((p) => (p.id === before.drawerId ? { ...p, leftAt: T0 + 1_000 } : p)),
    }

    const s = reduceCrobard(legacy, {
      type: 'ADVANCE',
      claimedKey: phaseKey(legacy),
      now: T0 + CROBARD_CHOOSING_MS,
    })

    expect(s.phase).toBe('choosing')
    expect(s.drawerId).toBe(expected)
    expect(s.phaseEndsAt).toBe(T0 + 2 * CROBARD_CHOOSING_MS)
  })

  it('deux absents à la suite : chacun son délai de choix, puis le présent choisit — jamais de dessin à vide', () => {
    let s = choosing(3)
    const chooser = s.drawerId
    // Le présent est le DERNIER des deux autres créneaux : les deux absents passent avant lui.
    const back = drawerAfter(s, 2)
    for (const id of guessers(s)) s = leave(s, id, T0 + 1_000)
    s = leave(s, chooser, T0 + 2_000)
    s = reduceCrobard(s, { type: 'REJOIN', playerId: back })

    s = reduceCrobard(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: T0 + CROBARD_CHOOSING_MS })
    expect(s.phase).toBe('choosing')
    expect(s.drawerId).not.toBe(back)

    s = reduceCrobard(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: T0 + 2 * CROBARD_CHOOSING_MS })
    expect(s.phase).toBe('choosing')
    expect(s.drawerId).toBe(back)
    expect(s.round).toBe(1)
  })

  it('personne à table à l’échéance du choix : manche écourtée, pas de choix en boucle', () => {
    let s = choosing(3)
    const chooser = s.drawerId
    for (const id of guessers(s)) s = leave(s, id, T0 + 1_000)
    s = leave(s, chooser, T0 + 2_000)

    s = reduceCrobard(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: T0 + CROBARD_CHOOSING_MS })

    expect(s.phase).toBe('drawing')
    expect(s.drawerId).toBe(chooser)
    expect(s.phaseEndsAt).toBe(T0 + CROBARD_CHOOSING_MS + CROBARD_BOT_DRAWER_ROUND_MS)
  })

  it('dernier humain d’une table de bots, il part pendant son choix : son tour l’attend', () => {
    const players = [
      { id: 'h', name: 'Humain' },
      { id: 'bot-1', name: 'Bot 1', isBot: true },
      { id: 'bot-2', name: 'Bot 2', isBot: true },
    ]
    let s = createCrobardState(players, WORDS, 'seed-leave', T0 - CROBARD_COUNTDOWN_MS)
    // Le tirage de l'ordre ne compte pas ici : on place l'humain au premier créneau.
    s = { ...s, drawerOrder: ['h', 'bot-1', 'bot-2'], drawerIdx: 0, drawerId: 'h' }
    s = reduceCrobard(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: T0 })
    expect(s.drawerId).toBe('h')

    s = leave(s, 'h', T0 + 1_000)

    expect(s.phase).toBe('choosing')
    expect(s.drawerId).toBe('h')
    expect(s.phaseEndsAt).toBe(T0 + CROBARD_CHOOSING_MS)
  })
})

describe('Crobard — départ d’un devineur', () => {
  it('le dernier à chercher s’en va : la manche se clôt sans attendre le chrono', () => {
    let s = drawing(4)
    const [a, b, c] = guessers(s)
    s = find(s, a)
    s = find(s, b)
    expect(s.phase).toBe('drawing')

    s = leave(s, c)

    expect(s.phase).toBe('roundEnd')
  })

  it('un devineur qui a trouvé puis part ne clôt pas la manche à la place d’un présent', () => {
    let s = drawing(5)
    const [a, b, c, d] = guessers(s)
    s = find(s, a)
    s = leave(s, a)
    s = find(s, b)
    s = find(s, c)

    // Trois ont trouvé, trois présents : mais `d`, présent, cherche encore.
    expect(s.phase).toBe('drawing')

    s = find(s, d)
    expect(s.phase).toBe('roundEnd')
  })

  it('tous les devineurs partis : le dessinateur ne dessine plus pour personne', () => {
    let s = drawing(3)
    for (const id of guessers(s)) s = leave(s, id, T0 + 1_000)

    expect(s.phase).toBe('roundEnd')
  })

  it('un départ ne clôt rien tant qu’un présent cherche encore', () => {
    let s = drawing(5)
    const [a, b] = guessers(s)
    s = find(s, a)
    s = leave(s, b)

    expect(s.phase).toBe('drawing')
    expect(s.phaseEndsAt).toBe(T0 + CROBARD_DRAWING_MS)
  })
})
