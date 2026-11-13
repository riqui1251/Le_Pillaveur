import { afterEach, describe, expect, it, vi } from 'vitest'
import { isSameLocalTable, parseLocalGameSave } from '@/lib/game-session'
import {
  CAP_PRICE_MAX,
  CAP_SAVE_VERSION,
  CAP_THEMES,
  canResumeCapSave,
  canReturnToSender,
  capCardsPlayed,
  capLevelUp,
  capPool,
  capPoolFor,
  capPoints,
  capTargetId,
  cardHolderId,
  cardStake,
  createGame,
  currentLevel,
  currentPlayerId,
  drawCard,
  endGame,
  fillPlayerToken,
  hasJoker,
  levelForRound,
  mixesAllCapThemes,
  ranking,
  resolve,
  restoreCapSave,
  returnToSender,
  splitPlayerToken,
  toCapSave,
  toggleAllCapThemes,
  toggleCapTheme,
  type CapCard,
  type CapKind,
  type CapLevel,
  type CapSettings,
  type CapState,
  type CapTheme,
} from './engine'

const TABLE = ['alice', 'bob', 'chloe']

function card(
  id: string,
  theme: CapTheme,
  level: CapLevel,
  kind: CapKind,
  price: 1 | 2 | 3 | 4 | 5,
  text = `Carte ${id}`,
): CapCard {
  return { id, theme, level, kind, price, text }
}

/** Petite banque de test : la vraie (252 cartes par langue) a son propre test. */
const CARDS: CapCard[] = [
  card('v-souv-apero-1', 'souvenirs', 'apero', 'truth', 1),
  card('v-souv-apero-2', 'souvenirs', 'apero', 'truth', 2),
  card('v-souv-apero-3', 'souvenirs', 'apero', 'truth', 2),
  card('a-souv-apero-1', 'souvenirs', 'apero', 'dare', 1),
  card('v-coeur-apero-1', 'coeur', 'apero', 'truth', 2),
  card('v-souv-soiree-1', 'souvenirs', 'soiree', 'truth', 3),
  card('a-souv-soiree-1', 'souvenirs', 'soiree', 'dare', 2),
  card('v-souv-minuit-1', 'souvenirs', 'apres-minuit', 'truth', 5),
  card('a-souv-minuit-1', 'souvenirs', 'apres-minuit', 'dare', 4),
  card('a-table-apero-1', 'table', 'apero', 'dare', 2, 'Fais un compliment sincère à {player}.'),
]

const SOUVENIRS_APERO: CapSettings = { level: 'apero', themes: ['souvenirs'] }

/** Partie posée à la main : alice au tour, graine fixe. */
function game(settings: CapSettings = SOUVENIRS_APERO, overrides: Partial<CapState> = {}): CapState {
  return { ...createGame({ playerIds: TABLE, settings, seed: 'soirée' }), firstPlayerIndex: 0, ...overrides }
}

function draw(state: CapState, kind: CapKind, cards: readonly CapCard[] = CARDS): CapState {
  const next = drawCard(state, kind, cards)
  if (!next) throw new Error('aucune carte tirée')
  return next
}

function settle(state: CapState, outcome: 'done' | 'refused'): CapState {
  const next = resolve(state, outcome)
  if (!next) throw new Error('rien à résoudre')
  return next
}

describe('début de partie', () => {
  it('même graine → même partie', () => {
    const a = createGame({ playerIds: TABLE, settings: SOUVENIRS_APERO, seed: 42 })
    const b = createGame({ playerIds: TABLE, settings: SOUVENIRS_APERO, seed: 42 })
    expect(a).toEqual(b)
    expect(TABLE).toContain(currentPlayerId(a))
  })

  it('part du premier tour de table, compteurs à zéro, sans carte ni joker joué', () => {
    const state = game()
    expect(state.turn).toBe(0)
    expect(state.round).toBe(1)
    expect(state.current).toBeNull()
    expect(state.jokersUsed).toEqual([])
    expect(state.tallies.bob).toEqual({ done: 0, refused: 0, donePrice: 0, refusedPrice: 0 })
    expect(capCardsPlayed(state)).toBe(0)
  })

  it('aucun thème choisi vaut « tout mélanger » ; les thèmes sont rangés et dédoublonnés', () => {
    expect(createGame({ playerIds: TABLE, settings: { level: 'soiree', themes: [] }, seed: 1 }).settings.themes).toEqual([
      ...CAP_THEMES,
    ])
    const settings: CapSettings = { level: 'soiree', themes: ['table', 'coeur', 'table'] }
    expect(createGame({ playerIds: TABLE, settings, seed: 1 }).settings.themes).toEqual(['coeur', 'table'])
  })
})

describe('niveaux', () => {
  it('un niveau fixe ne bouge pas, quel que soit le tour de table', () => {
    for (const round of [1, 2, 4, 9]) {
      expect(levelForRound('apero', round)).toBe('apero')
      expect(levelForRound('soiree', round)).toBe('soiree')
      expect(levelForRound('apres-minuit', round)).toBe('apres-minuit')
    }
  })

  it('progressif : Apéro au 1er tour de table, Soirée au 2e et au 3e, Après minuit dès le 4e', () => {
    expect([1, 2, 3, 4, 5, 12].map((round) => levelForRound('progressif', round))).toEqual([
      'apero',
      'soiree',
      'soiree',
      'apres-minuit',
      'apres-minuit',
      'apres-minuit',
    ])
  })

  it('progressif : le niveau suit les tours de table réellement joués', () => {
    let state = game({ level: 'progressif', themes: ['souvenirs'] })
    expect(currentLevel(state)).toBe('apero')
    for (let i = 0; i < TABLE.length; i += 1) state = settle(draw(state, 'truth'), 'done')
    expect(state.round).toBe(2)
    expect(currentLevel(state)).toBe('soiree')
    expect(draw(state, 'truth').current?.cardId).toBe('v-souv-soiree-1')
    for (let i = 0; i < TABLE.length * 2; i += 1) state = settle(draw(state, 'truth'), 'refused')
    expect(state.round).toBe(4)
    expect(draw(state, 'truth').current?.cardId).toBe('v-souv-minuit-1')
  })

  it('progressif : la montée de niveau s’annonce au premier tour du tour de table, avant le tirage', () => {
    let state = game({ level: 'progressif', themes: ['souvenirs'] })
    const seen: (CapLevel | null)[] = [capLevelUp(state)]
    for (let i = 0; i < TABLE.length * 4; i += 1) {
      state = settle(draw(state, 'dare'), 'done')
      seen.push(capLevelUp(state))
    }
    expect(seen.map((level, turn) => (level ? `${turn}:${level}` : null)).filter(Boolean)).toEqual([
      '3:soiree',
      '9:apres-minuit',
    ])
    let atRound2 = game({ level: 'progressif', themes: ['souvenirs'] })
    for (let i = 0; i < TABLE.length; i += 1) atRound2 = settle(draw(atRound2, 'truth'), 'done')
    expect(capLevelUp(draw(atRound2, 'truth'))).toBeNull()
    expect(capLevelUp(game({ level: 'soiree', themes: ['souvenirs'] }, { turn: 3, round: 2 }))).toBeNull()
  })
})

describe('pioche', () => {
  it('filtre par niveau, thèmes et type', () => {
    expect(capPool(CARDS, { level: 'apero', themes: ['souvenirs'], kind: 'truth' }).map((c) => c.id)).toEqual([
      'v-souv-apero-1',
      'v-souv-apero-2',
      'v-souv-apero-3',
    ])
    expect(capPool(CARDS, { level: 'apero', themes: ['souvenirs', 'coeur'], kind: 'truth' })).toHaveLength(4)
    expect(capPool(CARDS, { level: 'soiree', themes: ['coeur'], kind: 'truth' })).toEqual([])
    for (const seed of ['a', 'b', 'c', 'd', 'e']) {
      const state = draw(createGame({ playerIds: TABLE, settings: SOUVENIRS_APERO, seed }), 'dare')
      expect(state.current).toMatchObject({ cardId: 'a-souv-apero-1', kind: 'dare', price: 1 })
    }
  })

  it('sans remise : chaque carte du filtre sort une fois avant toute répétition', () => {
    let state = game()
    const drawn: string[] = []
    for (let i = 0; i < 3; i += 1) {
      state = draw(state, 'truth')
      drawn.push(state.current?.cardId ?? '')
      state = settle(state, 'done')
    }
    expect([...drawn].sort()).toEqual(['v-souv-apero-1', 'v-souv-apero-2', 'v-souv-apero-3'])
  })

  it('filtre épuisé : ses cartes sont remélangées, sans resservir la dernière vue, les autres filtres restent vus', () => {
    let state = draw(game(), 'dare')
    state = settle(state, 'done')
    const drawn: string[] = []
    for (let i = 0; i < 3; i += 1) {
      state = draw(state, 'truth')
      drawn.push(state.current?.cardId ?? '')
      state = settle(state, 'done')
    }
    const last = drawn[2]
    for (const seed of [1, 2, 3, 4, 5, 6]) {
      const again = draw({ ...state, rngState: seed }, 'truth')
      expect(again.current?.cardId).not.toBe(last)
      expect(again.deckUsed).toEqual(['a-souv-apero-1', again.current?.cardId])
    }
  })

  it('la pioche du moment suit le niveau du tour de table et les thèmes de la partie', () => {
    const state = game({ level: 'progressif', themes: ['souvenirs', 'coeur'] })
    expect(capPoolFor(state, 'truth', CARDS).map((c) => c.id)).toEqual([
      'v-souv-apero-1',
      'v-souv-apero-2',
      'v-souv-apero-3',
      'v-coeur-apero-1',
    ])
    expect(capPoolFor({ ...state, round: 4 }, 'dare', CARDS).map((c) => c.id)).toEqual(['a-souv-minuit-1'])
    expect(capPoolFor(state, 'dare', [])).toEqual([])
    for (const c of CARDS) expect(c.price).toBeLessThanOrEqual(CAP_PRICE_MAX)
  })

  it('un filtre d’une seule carte la resservit', () => {
    let state = settle(draw(game(), 'dare'), 'done')
    state = draw(state, 'dare')
    expect(state.current?.cardId).toBe('a-souv-apero-1')
  })

  it('refuse de tirer : carte déjà en jeu, partie finie, pioche vide', () => {
    const withCard = draw(game(), 'truth')
    expect(drawCard(withCard, 'dare', CARDS)).toBeNull()
    expect(drawCard(endGame(game()), 'truth', CARDS)).toBeNull()
    expect(drawCard(game({ level: 'soiree', themes: ['coeur'] }), 'truth', CARDS)).toBeNull()
    expect(drawCard(game(), 'truth', [])).toBeNull()
  })

  it('tire le même ordre avec la même graine', () => {
    const run = () => {
      let state = createGame({ playerIds: TABLE, settings: { level: 'apero', themes: [] }, seed: 'rejouable' })
      const ids: string[] = []
      for (let i = 0; i < 6; i += 1) {
        state = draw(state, i % 2 === 0 ? 'truth' : 'dare')
        ids.push(state.current?.cardId ?? '')
        state = settle(state, 'done')
      }
      return ids
    }
    expect(run()).toEqual(run())
  })
})

describe('{player}', () => {
  it('désigne un autre joueur que celui au tour', () => {
    const settings: CapSettings = { level: 'apero', themes: ['table'] }
    for (const seed of ['x', 'y', 'z', 'w']) {
      const state = draw({ ...createGame({ playerIds: TABLE, settings, seed }), firstPlayerIndex: 1 }, 'dare')
      expect(state.current?.targetPlayer).not.toBeNull()
      expect(state.current?.targetPlayer).not.toBe('bob')
      expect(TABLE).toContain(state.current?.targetPlayer)
    }
  })

  it('reste nul quand la carte ne cite personne', () => {
    expect(draw(game(), 'truth').current?.targetPlayer).toBeNull()
  })

  it('se remplace partout dans le texte', () => {
    expect(fillPlayerToken('Imite {player}, puis laisse {player} juger.', 'Léa')).toBe('Imite Léa, puis laisse Léa juger.')
    expect(splitPlayerToken('Fais un compliment à {player}.')).toEqual(['Fais un compliment à ', '.'])
    expect(fillPlayerToken('Sans jeton.', 'Léa')).toBe('Sans jeton.')
  })

  it('le joueur cité est celui du tirage ; sans tirage, le voisin de celui qui tient la carte', () => {
    const settings: CapSettings = { level: 'apero', themes: ['table'] }
    const drawn = draw(game(settings), 'dare')
    const text = 'Fais un compliment sincère à {player}.'
    expect(capTargetId(drawn, text)).toBe(drawn.current?.targetPlayer)
    expect(capTargetId(drawn, 'Sans jeton.')).toBeNull()

    const untargeted: CapState = { ...drawn, current: drawn.current && { ...drawn.current, targetPlayer: null } }
    expect(capTargetId(untargeted, text)).toBe('bob')
    const returned = returnToSender(untargeted, 'chloe') as CapState
    expect(capTargetId(returned, text)).toBe('alice')
    expect(capTargetId(game(settings), text)).toBeNull()
  })
})

describe('Cap ! / Pas cap', () => {
  it('« Cap ! » compte le prix à distribuer, puis la main passe au voisin', () => {
    let state = draw(game(), 'truth')
    const price = state.current?.price ?? 0
    state = settle(state, 'done')
    expect(state.tallies.alice).toEqual({ done: 1, refused: 0, donePrice: price, refusedPrice: 0 })
    expect(state.current).toBeNull()
    expect(state.turn).toBe(1)
    expect(currentPlayerId(state)).toBe('bob')
  })

  it('« Pas cap » compte le prix bu ; après le dernier joueur, le tour de table repart du premier', () => {
    let state = game(SOUVENIRS_APERO, { firstPlayerIndex: 2 })
    expect(currentPlayerId(state)).toBe('chloe')
    state = draw(state, 'dare')
    state = settle(state, 'refused')
    expect(state.tallies.chloe).toEqual({ done: 0, refused: 1, donePrice: 0, refusedPrice: 1 })
    expect(currentPlayerId(state)).toBe('alice')
    expect(state.round).toBe(1)
  })

  it('rien à résoudre sans carte en jeu ni après la fin', () => {
    expect(resolve(game(), 'done')).toBeNull()
    expect(resolve(endGame(draw(game(), 'truth')), 'done')).toBeNull()
  })
})

describe('joker « Retour à l’envoyeur »', () => {
  it('renvoie la carte au double du prix ; le destinataire répond, le tour du lanceur est joué', () => {
    let state = draw(game(), 'dare')
    expect(canReturnToSender(state)).toBe(true)
    const returned = returnToSender(state, 'chloe')
    expect(returned).not.toBeNull()
    state = returned as CapState
    expect(state.current?.returnedTo).toBe('chloe')
    expect(cardHolderId(state)).toBe('chloe')
    expect(cardStake(state.current ?? { price: 0, returnedTo: null })).toBe(2)
    expect(hasJoker(state, 'alice')).toBe(false)

    state = settle(state, 'done')
    expect(state.tallies.chloe).toEqual({ done: 1, refused: 0, donePrice: 2, refusedPrice: 0 })
    expect(state.tallies.alice).toEqual({ done: 0, refused: 0, donePrice: 0, refusedPrice: 0 })
    expect(currentPlayerId(state)).toBe('bob')
  })

  it('un refus après renvoi coûte le double', () => {
    let state = draw(game(), 'truth')
    const price = state.current?.price ?? 0
    state = returnToSender(state, 'bob') as CapState
    state = settle(state, 'refused')
    expect(state.tallies.bob).toEqual({ done: 0, refused: 1, donePrice: 0, refusedPrice: price * 2 })
  })

  it('un seul par joueur et par partie ; les autres gardent le leur', () => {
    let state = draw(game(), 'truth')
    state = settle(returnToSender(state, 'bob') as CapState, 'done')
    state = settle(draw(state, 'truth'), 'done')
    state = settle(draw(state, 'truth'), 'done')
    expect(currentPlayerId(state)).toBe('alice')
    state = draw(state, 'dare')
    expect(canReturnToSender(state)).toBe(false)
    expect(returnToSender(state, 'chloe')).toBeNull()

    state = settle(state, 'done')
    state = draw(state, 'dare')
    expect(currentPlayerId(state)).toBe('bob')
    expect(canReturnToSender(state)).toBe(true)
  })

  it('refuse : soi-même, un inconnu, sans carte, carte déjà renvoyée', () => {
    const state = draw(game(), 'truth')
    expect(returnToSender(state, 'alice')).toBeNull()
    expect(returnToSender(state, 'zoe')).toBeNull()
    expect(returnToSender(game(), 'bob')).toBeNull()
    const returned = returnToSender(state, 'bob') as CapState
    expect(canReturnToSender(returned)).toBe(false)
    expect(returnToSender(returned, 'chloe')).toBeNull()
  })

  it('le destinataire qui était le {player} de la carte : elle vise alors l’envoyeur', () => {
    const settings: CapSettings = { level: 'apero', themes: ['table'] }
    let state = draw(game(settings), 'dare')
    const target = state.current?.targetPlayer
    expect(target).toBeTruthy()
    state = returnToSender(state, target as string) as CapState
    expect(state.current?.returnedTo).toBe(target)
    expect(state.current?.targetPlayer).toBe('alice')
  })

  it('le {player} reste le même quand la carte part chez quelqu’un d’autre', () => {
    const settings: CapSettings = { level: 'apero', themes: ['table'] }
    const state = draw(game(settings), 'dare')
    const target = state.current?.targetPlayer
    const other = TABLE.find((id) => id !== 'alice' && id !== target) as string
    expect(returnToSender(state, other)?.current?.targetPlayer).toBe(target)
  })
})

describe('fin et classement', () => {
  it('« Terminer » écarte la carte en jeu et fige la partie', () => {
    const state = endGame(draw(game(), 'truth'))
    expect(state.ended).toBe(true)
    expect(state.current).toBeNull()
    expect(endGame(state)).toBe(state)
    expect(canReturnToSender(state)).toBe(false)
  })

  it('points = prix relevés moins prix refusés ; égalité de points = même rang', () => {
    const state = game(SOUVENIRS_APERO, {
      tallies: {
        alice: { done: 1, refused: 1, donePrice: 3, refusedPrice: 1 },
        bob: { done: 2, refused: 0, donePrice: 2, refusedPrice: 0 },
        chloe: { done: 0, refused: 2, donePrice: 0, refusedPrice: 4 },
      },
    })
    expect(capPoints(state.tallies.chloe)).toBe(-4)
    expect(capCardsPlayed(state)).toBe(6)
    const rows = ranking(state)
    expect(rows.map((r) => [r.playerId, r.points, r.rank, r.won])).toEqual([
      ['bob', 2, 1, true],
      ['alice', 2, 1, true],
      ['chloe', -4, 3, false],
    ])
  })

  it('personne ne gagne sans score positif', () => {
    const rows = ranking(
      game(SOUVENIRS_APERO, {
        tallies: {
          alice: { done: 0, refused: 1, donePrice: 0, refusedPrice: 1 },
          bob: { done: 0, refused: 0, donePrice: 0, refusedPrice: 0 },
          chloe: { done: 0, refused: 0, donePrice: 0, refusedPrice: 0 },
        },
      }),
    )
    expect(rows.every((r) => !r.won)).toBe(true)
    expect(rows.map((r) => r.playerId)).toEqual(['bob', 'chloe', 'alice'])
  })
})

describe('réglages de la pré-partie', () => {
  it('« Tout mélanger » coche tout, ou décoche tout quand tout l’était', () => {
    expect(toggleAllCapThemes(['coeur'])).toEqual([...CAP_THEMES])
    expect(toggleAllCapThemes([...CAP_THEMES])).toEqual([])
    expect(mixesAllCapThemes([...CAP_THEMES])).toBe(true)
    expect(mixesAllCapThemes(['coeur'])).toBe(false)
  })

  it('un thème se coche et se décoche, rangé dans l’ordre du catalogue', () => {
    expect(toggleCapTheme(['table'], 'souvenirs')).toEqual(['souvenirs', 'table'])
    expect(toggleCapTheme(['souvenirs', 'table'], 'table')).toEqual(['souvenirs'])
    expect(toggleCapTheme(['souvenirs'], 'souvenirs')).toEqual([])
  })
})

describe('reprise', () => {
  function played(): CapState {
    let state = draw(game({ level: 'progressif', themes: [] }), 'truth')
    state = settle(state, 'done')
    state = draw(state, 'dare')
    return state
  }

  it('sauvegarde → reprise à l’identique, carte en jeu comprise', () => {
    const state = played()
    const raw = JSON.stringify({ version: CAP_SAVE_VERSION, savedAt: 1_000, state: toCapSave(state) })
    const save = parseLocalGameSave<unknown>(raw, CAP_SAVE_VERSION, 2_000)
    expect(restoreCapSave(save, TABLE)).toEqual(state)
  })

  it('seule la table décide de la reprise : Progressif + deux thèmes repart avec SES réglages, pré-partie revenue aux défauts ou non', () => {
    const settings: CapSettings = { level: 'progressif', themes: ['souvenirs', 'comedie'] }
    let state = game(settings)
    for (let i = 0; i < TABLE.length * 3; i += 1) state = settle(draw(state, 'truth'), i % 2 === 0 ? 'done' : 'refused')
    const save = JSON.parse(JSON.stringify(toCapSave(state))) as unknown

    expect(canResumeCapSave(save, ['bob', 'chloe', 'alice'])).toBe(true)
    const restored = restoreCapSave(save, TABLE)
    expect(restored?.settings).toEqual(settings)
    expect(restored?.round).toBe(4)
    expect(restored && currentLevel(restored)).toBe('apres-minuit')
    expect(restored?.tallies).toEqual(state.tallies)

    expect(canResumeCapSave(save, ['alice', 'bob'])).toBe(false)
    expect(canResumeCapSave(save, ['alice', 'bob', 'zoe'])).toBe(false)
    expect(canResumeCapSave({ ...toCapSave(state), settings: { level: 'turbo', themes: ['coeur'] } }, TABLE)).toBe(false)
    expect(canResumeCapSave(null, TABLE)).toBe(false)
  })

  it('garde l’ordre du tour de la sauvegarde, même si la table arrive dans un autre ordre', () => {
    const state = played()
    const restored = restoreCapSave(JSON.parse(JSON.stringify(toCapSave(state))), ['chloe', 'alice', 'bob'])
    expect(restored?.playerIds).toEqual(TABLE)
    expect(restored && currentPlayerId(restored)).toBe(currentPlayerId(state))
  })

  it('refuse une autre table ou une sauvegarde illisible', () => {
    const save = toCapSave(played())
    expect(isSameLocalTable(save.playerIds, [{ id: 'alice' }, { id: 'bob' }])).toBe(false)
    expect(restoreCapSave(save, ['alice', 'bob'])).toBeNull()
    expect(restoreCapSave(save, ['alice', 'bob', 'zoe'])).toBeNull()
    expect(restoreCapSave(null, TABLE)).toBeNull()
    expect(restoreCapSave({ ...save, settings: { level: 'turbo', themes: ['coeur'] } }, TABLE)).toBeNull()
    expect(restoreCapSave({ ...save, firstPlayerIndex: 3 }, TABLE)).toBeNull()
    expect(restoreCapSave({ ...save, turn: -1 }, TABLE)).toBeNull()
    expect(restoreCapSave({ ...save, jokersUsed: ['zoe'] }, TABLE)).toBeNull()
    expect(restoreCapSave({ ...save, current: { ...save.current, price: 9 } }, TABLE)).toBeNull()
    expect(restoreCapSave({ ...save, current: { ...save.current, returnedTo: 'zoe' } }, TABLE)).toBeNull()
    expect(restoreCapSave({ ...save, tallies: { alice: { done: 'deux' } } }, TABLE)).toBeNull()
  })

  it('une carte en jeu absente de la banque chargée est écartée, le reste de la partie reprend', () => {
    const state = played()
    const save = JSON.parse(JSON.stringify(toCapSave(state))) as unknown
    const known = new Set(CARDS.map((c) => c.id).filter((id) => id !== state.current?.cardId))
    const restored = restoreCapSave(save, TABLE, known)
    expect(restored?.current).toBeNull()
    expect(restored?.tallies).toEqual(state.tallies)
    expect(restoreCapSave(save, TABLE, new Set(CARDS.map((c) => c.id)))?.current).toEqual(state.current)
  })

  it('un joueur sans compteur dans la sauvegarde repart de zéro', () => {
    const save = toCapSave(played())
    const restored = restoreCapSave({ ...save, tallies: { alice: save.tallies.alice } }, TABLE)
    expect(restored?.tallies.chloe).toEqual({ done: 0, refused: 0, donePrice: 0, refusedPrice: 0 })
  })
})

describe('pureté', () => {
  afterEach(() => vi.restoreAllMocks())

  it('ni Math.random ni Date.now : tout l’aléatoire passe par la graine', () => {
    const random = vi.spyOn(Math, 'random')
    const clock = vi.spyOn(Date, 'now')
    let state = createGame({ playerIds: TABLE, settings: { level: 'progressif', themes: [] }, seed: 7 })
    for (let i = 0; i < 12; i += 1) {
      state = draw(state, i % 2 === 0 ? 'truth' : 'dare')
      if (i === 4) state = returnToSender(state, TABLE.find((id) => id !== currentPlayerId(state)) as string) as CapState
      state = settle(state, i % 3 === 0 ? 'refused' : 'done')
    }
    ranking(endGame(state))
    expect(random).not.toHaveBeenCalled()
    expect(clock).not.toHaveBeenCalled()
  })
})
