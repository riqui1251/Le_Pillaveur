import { describe, expect, it } from 'vitest'
import {
  createCrobardState,
  currentCrobardActorId,
  crobardActive,
  reduceCrobard,
  toCrobardClientView,
  toCrobardSpectatorView,
  CrobardEngineError,
  CROBARD_COUNTDOWN_MS,
  CROBARD_CHOOSING_MS,
  CROBARD_DRAWING_MS,
  CROBARD_BOT_DRAWER_ROUND_MS,
  CROBARD_POINTS_FIRST,
  CROBARD_POINTS_SECOND,
  CROBARD_DRAWER_POINTS_PER_GUESSER,
  type CrobardState,
} from './engine'
import { phaseKey } from '@/lib/online/phase-clock'

const WORDS = ['Pizza', 'Chat', 'Plage', 'Vélo', 'Noël', 'Robot', 'Fantôme']
const T0 = 1_000_000

function make(n = 4, seed: string | number = 'seed', totalRounds = 8): CrobardState {
  const players = Array.from({ length: n }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))
  const raw = createCrobardState(players, WORDS, seed, T0 - CROBARD_COUNTDOWN_MS, totalRounds)
  const choosing = reduceCrobard(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
  return reduceCrobard(choosing, { type: 'CHOOSE_WORD', playerId: choosing.drawerId, index: 0, now: T0 })
}

describe('createCrobardState', () => {
  it('borne 3-16 joueurs, countdown au lancement', () => {
    const two = [
      { id: 'p0', name: 'P0' },
      { id: 'p1', name: 'P1' },
    ]
    expect(() => createCrobardState(two, WORDS, 1, T0)).toThrow(CrobardEngineError)
    const seventeen = Array.from({ length: 17 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))
    expect(() => createCrobardState(seventeen, WORDS, 1, T0)).toThrow(CrobardEngineError)
    const four = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))
    const raw = createCrobardState(four, WORDS, 1, T0)
    expect(raw.phase).toBe('countdown')
    expect(raw.phaseEndsAt).toBe(T0 + CROBARD_COUNTDOWN_MS)
  })

  it('refuse un pool de moins de 3 mots', () => {
    const four = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))
    expect(() => createCrobardState(four, ['a', 'b'], 1, T0)).toThrow('NOT_ENOUGH_WORDS')
  })

  it('reproductible avec la même graine', () => {
    expect(make(4)).toEqual(make(4))
  })
})

describe('countdown → choosing → drawing', () => {
  it('countdown écoulé propose 3 mots distincts au dessinateur', () => {
    const players = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))
    const raw = createCrobardState(players, WORDS, 'seed', T0 - CROBARD_COUNTDOWN_MS, 8)
    const choosing = reduceCrobard(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
    expect(choosing.phase).toBe('choosing')
    expect(choosing.phaseEndsAt).toBe(T0 + CROBARD_CHOOSING_MS)
    expect(choosing.wordChoices).toHaveLength(3)
    expect(new Set(choosing.wordChoices)).toEqual(new Set(choosing.wordChoices))
  })

  it('CHOOSE_WORD réservé au dessinateur, démarre la manche de dessin', () => {
    const players = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))
    const raw = createCrobardState(players, WORDS, 'seed', T0 - CROBARD_COUNTDOWN_MS, 8)
    const choosing = reduceCrobard(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
    const other = choosing.players.find((p) => p.id !== choosing.drawerId)!.id
    expect(() =>
      reduceCrobard(choosing, { type: 'CHOOSE_WORD', playerId: other, index: 0, now: T0 })
    ).toThrow('NOT_DRAWER')
    const drawing = reduceCrobard(choosing, {
      type: 'CHOOSE_WORD',
      playerId: choosing.drawerId,
      index: 1,
      now: T0,
    })
    expect(drawing.phase).toBe('drawing')
    expect(drawing.word).toBe(choosing.wordChoices![1])
    expect(drawing.phaseEndsAt).toBe(T0 + CROBARD_DRAWING_MS)
  })

  it('choosing écoulé sans choix auto-sélectionne le premier mot proposé', () => {
    const players = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))
    const raw = createCrobardState(players, WORDS, 'seed', T0 - CROBARD_COUNTDOWN_MS, 8)
    const choosing = reduceCrobard(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
    const drawing = reduceCrobard(choosing, {
      type: 'ADVANCE',
      claimedKey: phaseKey(choosing),
      now: T0 + CROBARD_CHOOSING_MS,
    })
    expect(drawing.phase).toBe('drawing')
    expect(drawing.word).toBe(choosing.wordChoices![0])
  })
})

describe('DRAW_STROKE / CLEAR', () => {
  it('seul le dessinateur peut tracer ou effacer, les traits sont publics', () => {
    const s = make(4)
    const guesser = s.players.find((p) => p.id !== s.drawerId)!.id
    expect(() =>
      reduceCrobard(s, { type: 'DRAW_STROKE', playerId: guesser, stroke: { points: [0, 0, 1, 1], color: '#000', width: 3 } })
    ).toThrow('NOT_DRAWER')
    const withStroke = reduceCrobard(s, {
      type: 'DRAW_STROKE',
      playerId: s.drawerId,
      stroke: { points: [0, 0, 1, 1], color: '#000', width: 3 },
    })
    expect(withStroke.strokes).toHaveLength(1)
    const cleared = reduceCrobard(withStroke, { type: 'CLEAR', playerId: s.drawerId })
    expect(cleared.strokes).toHaveLength(0)
  })
})

describe('GUESS', () => {
  function makeWithKnownWord() {
    const players = Array.from({ length: 5 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))
    const raw = createCrobardState(players, WORDS, 'seed', T0 - CROBARD_COUNTDOWN_MS, 8)
    const choosing = reduceCrobard(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
    const drawing = reduceCrobard(choosing, {
      type: 'CHOOSE_WORD',
      playerId: choosing.drawerId,
      index: 0,
      now: T0,
    })
    return drawing
  }

  it('bonne réponse (normalisée) marque des points dégressifs et alimente correctGuessers', () => {
    let s = makeWithKnownWord()
    const word = s.word!
    const guessers = s.players.filter((p) => p.id !== s.drawerId).map((p) => p.id)
    const drawerScoreBefore = s.players.find((p) => p.id === s.drawerId)!.score

    s = reduceCrobard(s, { type: 'GUESS', playerId: guessers[0], text: word.toUpperCase(), now: T0 })
    expect(s.correctGuessers).toEqual([guessers[0]])
    expect(s.players.find((p) => p.id === guessers[0])!.score).toBe(CROBARD_POINTS_FIRST)
    expect(s.players.find((p) => p.id === s.drawerId)!.score).toBe(
      drawerScoreBefore + CROBARD_DRAWER_POINTS_PER_GUESSER
    )

    s = reduceCrobard(s, { type: 'GUESS', playerId: guessers[1], text: word, now: T0 })
    expect(s.players.find((p) => p.id === guessers[1])!.score).toBe(CROBARD_POINTS_SECOND)
  })

  it('refuse le dessinateur, une double réponse, une réponse fausse ou proche', () => {
    let s = makeWithKnownWord()
    const word = s.word!
    const guesser = s.players.find((p) => p.id !== s.drawerId)!.id
    expect(() =>
      reduceCrobard(s, { type: 'GUESS', playerId: s.drawerId, text: word, now: T0 })
    ).toThrow('DRAWER_CANNOT_GUESS')
    expect(() =>
      reduceCrobard(s, { type: 'GUESS', playerId: guesser, text: 'totalement faux xyz', now: T0 })
    ).toThrow('GUESS_WRONG')
    // Une lettre en trop → distance 1 → "proche"
    expect(() =>
      reduceCrobard(s, { type: 'GUESS', playerId: guesser, text: `${word}x`, now: T0 })
    ).toThrow('GUESS_CLOSE')
    s = reduceCrobard(s, { type: 'GUESS', playerId: guesser, text: word, now: T0 })
    expect(() =>
      reduceCrobard(s, { type: 'GUESS', playerId: guesser, text: word, now: T0 })
    ).toThrow('ALREADY_GUESSED')
  })

  it('fin de manche anticipée dès que tous les non-dessinateurs ont trouvé', () => {
    let s = makeWithKnownWord()
    const word = s.word!
    const guessers = s.players.filter((p) => p.id !== s.drawerId).map((p) => p.id)
    for (const id of guessers) {
      s = reduceCrobard(s, { type: 'GUESS', playerId: id, text: word, now: T0 })
    }
    expect(s.phase).toBe('roundEnd')
    expect(s.lastRoundWord).toBe(word)
    expect(s.word).toBeNull()
  })
})

describe('ADVANCE : timeout de manche', () => {
  it('manche écoulée → bilan avec le mot révélé publiquement', () => {
    const s = make(4)
    const word = s.word!
    const ended = reduceCrobard(s, {
      type: 'ADVANCE',
      claimedKey: phaseKey(s),
      now: T0 + CROBARD_DRAWING_MS,
    })
    expect(ended.phase).toBe('roundEnd')
    expect(ended.lastRoundWord).toBe(word)
    expect(ended.phaseEndsAt).toBeNull()
  })
})

describe('CONTINUE', () => {
  it('enchaîne la manche suivante avec le dessinateur suivant, puis termine après totalRounds', () => {
    let s = make(4, 'seed', 2)
    const firstDrawer = s.drawerId
    s = reduceCrobard(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: T0 + CROBARD_DRAWING_MS })
    s = reduceCrobard(s, { type: 'CONTINUE', playerId: 'p0', now: T0 })
    expect(s.phase).toBe('choosing')
    expect(s.round).toBe(2)
    expect(s.drawerId).not.toBe(firstDrawer)
    expect(s.lastRoundWord).toBeNull()
    s = reduceCrobard(s, { type: 'CHOOSE_WORD', playerId: s.drawerId, index: 0, now: T0 })
    s = reduceCrobard(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: T0 + CROBARD_DRAWING_MS })
    s = reduceCrobard(s, { type: 'CONTINUE', playerId: 'p0', now: T0 })
    expect(s.phase).toBe('finished')
    expect(s.phaseEndsAt).toBeNull()
    expect(s.winnerId).not.toBeNull()
  })

  it('refuse hors phase roundEnd ou pour un joueur inconnu', () => {
    const s = make(4)
    expect(() => reduceCrobard(s, { type: 'CONTINUE', playerId: 'p0', now: T0 })).toThrow('NOT_ROUND_END')
  })
})

describe('décrivant... dessinateur bot', () => {
  it('écourte la manche quand le dessinateur tiré est un bot', () => {
    const players = [
      { id: 'p0', name: 'P0' },
      { id: 'bot-1', name: 'Bot', isBot: true },
      { id: 'p2', name: 'P2' },
      { id: 'p3', name: 'P3' },
    ]
    const raw = createCrobardState(players, WORDS, 'seed', T0 - CROBARD_COUNTDOWN_MS, 8)
    const choosing = reduceCrobard(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
    if (choosing.drawerId === 'bot-1') {
      const drawing = reduceCrobard(choosing, {
        type: 'ADVANCE',
        claimedKey: phaseKey(choosing),
        now: T0 + CROBARD_CHOOSING_MS,
      })
      expect(drawing.phaseEndsAt).toBe(T0 + CROBARD_CHOOSING_MS + CROBARD_BOT_DRAWER_ROUND_MS)
    } else {
      expect(choosing.drawerId).not.toBe('bot-1')
    }
  })
})

describe('LEAVE / REJOIN / REPLACE_LEFT', () => {
  it('REJOIN restaure un joueur parti ; REPLACE_LEFT le convertit en bot après le délai', () => {
    let s = make(4)
    s = reduceCrobard(s, { type: 'LEAVE', playerId: 'p0', at: T0 })
    s = reduceCrobard(s, { type: 'REJOIN', playerId: 'p0' })
    expect(s.players.find((p) => p.id === 'p0')?.leftAt).toBeNull()
    s = reduceCrobard(s, { type: 'LEAVE', playerId: 'p0', at: T0 })
    expect(crobardActive(s)).toHaveLength(3)
    expect(() =>
      reduceCrobard(s, { type: 'REPLACE_LEFT', now: T0 + 1000, graceMs: 180_000 })
    ).toThrow('NOTHING_TO_REPLACE')
    const replaced = reduceCrobard(s, { type: 'REPLACE_LEFT', now: T0 + 200_000, graceMs: 180_000 })
    expect(replaced.players.find((p) => p.id === 'p0')?.isBot).toBe(true)
  })
})

describe('currentCrobardActorId', () => {
  it('le dessinateur en choosing, null en drawing, premier actif en roundEnd', () => {
    const players = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))
    const raw = createCrobardState(players, WORDS, 'seed', T0 - CROBARD_COUNTDOWN_MS, 8)
    const choosing = reduceCrobard(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
    expect(currentCrobardActorId(choosing)).toBe(choosing.drawerId)
    const drawing = reduceCrobard(choosing, {
      type: 'CHOOSE_WORD',
      playerId: choosing.drawerId,
      index: 0,
      now: T0,
    })
    expect(currentCrobardActorId(drawing)).toBeNull()
    const ended = reduceCrobard(drawing, {
      type: 'ADVANCE',
      claimedKey: phaseKey(drawing),
      now: T0 + CROBARD_DRAWING_MS,
    })
    expect(currentCrobardActorId(ended)).toBe('p0')
  })
})

describe('vues anti-triche', () => {
  it('seul le dessinateur voit wordChoices (choosing) et word (drawing)', () => {
    const players = Array.from({ length: 4 }, (_, i) => ({ id: `p${i}`, name: `P${i}` }))
    const raw = createCrobardState(players, WORDS, 'seed', T0 - CROBARD_COUNTDOWN_MS, 8)
    const choosing = reduceCrobard(raw, { type: 'ADVANCE', claimedKey: phaseKey(raw), now: T0 })
    const drawerChoosingView = toCrobardClientView(choosing, choosing.drawerId)
    expect(drawerChoosingView.wordChoices).toHaveLength(3)
    const otherId = choosing.players.find((p) => p.id !== choosing.drawerId)!.id
    expect(toCrobardClientView(choosing, otherId).wordChoices).toBeNull()

    const drawing = reduceCrobard(choosing, {
      type: 'CHOOSE_WORD',
      playerId: choosing.drawerId,
      index: 0,
      now: T0,
    })
    expect(toCrobardClientView(drawing, drawing.drawerId).word).toBe(drawing.word)
    expect(toCrobardClientView(drawing, otherId).word).toBeNull()
  })

  it('le spectateur (TV) ne voit jamais wordChoices ni word', () => {
    const s = make(4)
    const spectator = toCrobardSpectatorView(s)
    expect(spectator.word).toBeNull()
    expect(spectator.wordChoices).toBeNull()
    expect(JSON.stringify(spectator)).not.toContain(s.word!)
  })

  it('les traits (strokes) restent publics pour tout le monde', () => {
    const s = make(4)
    const withStroke = reduceCrobard(s, {
      type: 'DRAW_STROKE',
      playerId: s.drawerId,
      stroke: { points: [0, 0, 1, 1], color: '#000', width: 3 },
    })
    const otherId = s.players.find((p) => p.id !== s.drawerId)!.id
    expect(toCrobardClientView(withStroke, otherId).strokes).toHaveLength(1)
    expect(toCrobardSpectatorView(withStroke).strokes).toHaveLength(1)
  })

  it('allWords/remainingWords ne fuient jamais dans la vue client', () => {
    const s = make(4)
    const view = toCrobardClientView(s, 'p0')
    expect(view).not.toHaveProperty('allWords')
    expect(view).not.toHaveProperty('remainingWords')
    expect(view).not.toHaveProperty('rngState')
  })
})
