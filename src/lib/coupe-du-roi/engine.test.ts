import { afterEach, describe, expect, it, vi } from 'vitest'
import { isSameLocalTable, parseLocalGameSave } from '@/lib/game-session'
import {
  COUPE_DECK_SIZE,
  COUPE_RANKS,
  COUPE_RULE_MAX_LENGTH,
  COUPE_SAVE_VERSION,
  COUPE_SUGGESTION_KEYS,
  COUPE_SUITS,
  addCoupeRule,
  cleanCoupeOverrides,
  cleanCoupeText,
  coupeActorId,
  coupeHasInForce,
  coupeKingDraws,
  coupeLastDrawPartner,
  coupeRoleSpan,
  coupeRuleFor,
  coupeTally,
  createCoupeDeck,
  createCoupeGame,
  currentCoupePlayerId,
  drawCoupeCard,
  isCoupeFinished,
  lastCoupeDraw,
  pickCoupeSuggestion,
  restoreCoupeSave,
  setCoupePair,
  skipCoupeRule,
  toCoupeSave,
  type CoupeCard,
  type CoupeCupMode,
  type CoupeRank,
  type CoupeSettings,
  type CoupeState,
  type CoupeSuit,
} from './engine'

const TABLE = ['alice', 'bob', 'chloe']
const SETTINGS: CoupeSettings = { cup: 'solo', overrides: {} }

const SUIT_BY_LETTER: Record<string, CoupeSuit> = { s: 'spade', h: 'heart', d: 'diamond', c: 'club' }

/** '5h' → 5 de cœur, '10s' → 10 de pique, 'Kc' → roi de trèfle. */
function card(code: string): CoupeCard {
  const rank = code.slice(0, -1)
  const suit = SUIT_BY_LETTER[code.slice(-1)]
  if (!(COUPE_RANKS as readonly string[]).includes(rank) || !suit) throw new Error(`carte inconnue : ${code}`)
  return { rank: rank as CoupeRank, suit }
}

const keyOf = (c: CoupeCard) => `${c.rank}-${c.suit}`

/** Partie posée à la main : alice tire la première, le paquet est choisi. */
function posed(codes: string[], overrides: Partial<CoupeState> = {}, settings: CoupeSettings = SETTINGS): CoupeState {
  return {
    ...createCoupeGame(TABLE, settings, 'table'),
    deck: codes.map(card),
    turn: 0,
    ...overrides,
  }
}

function drawTimes(state: CoupeState, count: number): CoupeState {
  let next = state
  for (let i = 0; i < count; i += 1) next = drawCoupeCard(next)
  return next
}

/** Tranche la décision en attente comme le ferait la table : binôme = voisin suivant, règle numérotée. */
function settle(state: CoupeState): CoupeState {
  const pending = state.pending
  if (!pending) return state
  if (pending.kind === 'rule') return addCoupeRule(state, `Règle ${state.customRules.length + 1}`)
  const index = state.playerIds.indexOf(pending.playerId)
  return setCoupePair(state, pending.playerId, state.playerIds[(index + 1) % state.playerIds.length])
}

/** Joue jusqu'à la fin (borné : un paquet ne dépasse jamais 52 tirages). */
function playOut(state: CoupeState): CoupeState {
  let next = state
  for (let i = 0; i <= COUPE_DECK_SIZE && !next.finished; i += 1) next = settle(drawCoupeCard(next))
  return next
}

describe('paquet', () => {
  it('52 cartes distinctes : 13 rangs dans chacune des 4 enseignes', () => {
    const deck = createCoupeDeck()
    expect(deck).toHaveLength(COUPE_DECK_SIZE)
    expect(new Set(deck.map(keyOf)).size).toBe(52)
    for (const rank of COUPE_RANKS) expect(deck.filter((c) => c.rank === rank)).toHaveLength(4)
    for (const suit of COUPE_SUITS) expect(deck.filter((c) => c.suit === suit)).toHaveLength(13)
  })
})

describe('début de partie', () => {
  it('même graine → même partie', () => {
    expect(createCoupeGame(TABLE, SETTINGS, 'soirée')).toEqual(createCoupeGame(TABLE, SETTINGS, 'soirée'))
    expect(createCoupeGame(TABLE, SETTINGS, 'soirée').deck).not.toEqual(createCoupeGame(TABLE, SETTINGS, 'autre').deck)
  })

  it('le paquet mélangé reste un paquet complet, rien de tiré, aucun rôle', () => {
    const state = createCoupeGame(TABLE, SETTINGS, 'mélange')
    expect(state.deck.map(keyOf).sort()).toEqual(createCoupeDeck().map(keyOf).sort())
    expect(state.deck.map(keyOf)).not.toEqual(createCoupeDeck().map(keyOf))
    expect(state.drawn).toEqual([])
    expect(state.kingsDrawn).toBe(0)
    expect(coupeHasInForce(state)).toBe(false)
    expect(state.finished).toBe(false)
  })

  it('le premier joueur est tiré au sort dans la table', () => {
    const firsts = new Set<string | null>()
    for (let i = 0; i < 30; i += 1) {
      const state = createCoupeGame(TABLE, SETTINGS, `graine-${i}`)
      expect(state.turn).toBeGreaterThanOrEqual(0)
      expect(state.turn).toBeLessThan(TABLE.length)
      firsts.add(currentCoupePlayerId(state))
    }
    expect(firsts).toEqual(new Set(TABLE))
  })

  it('les réglages sont nettoyés : textes rognés, coupe inconnue → sans verre commun', () => {
    const state = createCoupeGame(TABLE, { cup: 'shared', overrides: { '3': '  Tu prends 4  ', '6': '   ' } }, 'g')
    expect(state.settings).toEqual({ cup: 'shared', overrides: { '3': 'Tu prends 4' } })
    expect(createCoupeGame(TABLE, { cup: 'triple' as CoupeCupMode, overrides: {} }, 'g').settings.cup).toBe('solo')
  })
})

describe('tirage', () => {
  it('chacun tire à son tour dans l’ordre de la table, à partir du premier', () => {
    const state = drawTimes(posed(['2h', '3h', '4h', '6h', '7h'], { turn: 1 }), 5)
    expect(state.drawn.map((d) => d.playerId)).toEqual(['bob', 'chloe', 'alice', 'bob', 'chloe'])
    expect(currentCoupePlayerId(state)).toBe('alice')
  })

  it('la carte du dessus passe du paquet aux cartes tirées, sans toucher l’état reçu', () => {
    const before = posed(['2h', '3h'])
    const after = drawCoupeCard(before)
    expect(after.drawn).toEqual([{ card: card('2h'), playerId: 'alice' }])
    expect(after.deck).toEqual([card('3h')])
    expect(before.deck).toHaveLength(2)
    expect(before.drawn).toEqual([])
    expect(lastCoupeDraw(after)).toEqual({ card: card('2h'), playerId: 'alice' })
  })

  it('paquet vide : rien ne bouge', () => {
    const empty = posed([])
    expect(drawCoupeCard(empty)).toBe(empty)
    expect(lastCoupeDraw(empty)).toBeNull()
  })
})

describe('rois et fin de partie', () => {
  it('les trois premiers rois comptent, le quatrième finit la partie et donne la coupe', () => {
    let state = drawTimes(posed(['Kh', 'Ks', '2c', 'Kd', 'Kc', '5h']), 4)
    expect(state.kingsDrawn).toBe(3)
    expect(isCoupeFinished(state)).toBe(false)

    state = drawCoupeCard(state)
    expect(state.kingsDrawn).toBe(4)
    expect(isCoupeFinished(state)).toBe(true)
    expect(state.cupHolder).toBe('bob')
    expect(currentCoupePlayerId(state)).toBeNull()
    expect(coupeActorId(state)).toBeNull()
    expect(coupeKingDraws(state).map((d) => d.playerId)).toEqual(['alice', 'bob', 'alice', 'bob'])
    // Plus rien ne se tire une fois la coupe attribuée.
    expect(drawCoupeCard(state)).toBe(state)
  })

  it('une partie complète finit au quatrième roi, sans jamais dépasser le paquet', () => {
    for (let i = 0; i < 20; i += 1) {
      const end = playOut(createCoupeGame(TABLE, SETTINGS, `partie-${i}`))
      const last = lastCoupeDraw(end)
      expect(end.finished).toBe(true)
      expect(end.kingsDrawn).toBe(4)
      expect(coupeKingDraws(end)).toHaveLength(4)
      expect(last?.card.rank).toBe('K')
      expect(end.cupHolder).toBe(last?.playerId)
      expect(end.drawn.length + end.deck.length).toBe(COUPE_DECK_SIZE)
    }
  })
})

describe('rôles qui durent', () => {
  it('le 5 donne le pouce jusqu’au prochain 5', () => {
    let state = drawCoupeCard(posed(['5h', '2c', '5s']))
    expect(state.thumbMaster).toBe('alice')
    expect(coupeHasInForce(state)).toBe(true)
    state = drawTimes(state, 2)
    expect(state.thumbMaster).toBe('chloe')
  })

  it('le 10 donne les questions jusqu’au prochain 10', () => {
    let state = drawCoupeCard(posed(['10h', '10s']))
    expect(state.questionMaster).toBe('alice')
    state = drawCoupeCard(state)
    expect(state.questionMaster).toBe('bob')
  })

  it('le 8 attend un binôme : aucune carte suivante avant le choix', () => {
    const state = drawCoupeCard(posed(['8h', '2c']))
    expect(state.pending).toEqual({ kind: 'pair', playerId: 'alice' })
    expect(drawCoupeCard(state)).toBe(state)
    expect(coupeActorId(state)).toBe('alice')
    expect(currentCoupePlayerId(state)).toBe('bob')
  })

  it('binôme refusé : soi-même, un inconnu, ou un autre que le tireur du 8', () => {
    const state = drawCoupeCard(posed(['8h']))
    expect(setCoupePair(state, 'alice', 'alice')).toBe(state)
    expect(setCoupePair(state, 'alice', 'zoe')).toBe(state)
    expect(setCoupePair(state, 'bob', 'chloe')).toBe(state)
  })

  it('un nouveau 8 remplace le binôme du même joueur ; ceux des autres restent', () => {
    let state = drawCoupeCard(posed(['8h', '2c', '3c', '8s', '8d']))
    state = setCoupePair(state, 'alice', 'bob')
    expect(state.pairs).toEqual({ alice: 'bob' })
    expect(state.pending).toBeNull()

    state = drawTimes(state, 3)
    state = setCoupePair(state, 'alice', 'chloe')
    state = drawCoupeCard(state)
    state = setCoupePair(state, 'bob', 'alice')
    expect(state.pairs).toEqual({ alice: 'chloe', bob: 'alice' })
  })

  it('à deux, le binôme se fait tout seul', () => {
    const duo = { ...createCoupeGame(['alice', 'bob'], SETTINGS, 'duo'), deck: [card('8h')], turn: 0 }
    const state = drawCoupeCard(duo)
    expect(state.pairs).toEqual({ alice: 'bob' })
    expect(state.pending).toBeNull()
    // Sans choix à faire, l'écran doit quand même dire qui est le binôme.
    expect(coupeLastDrawPartner(state)).toBe('bob')
  })

  it('binôme formé par la dernière carte : rien pendant le choix, le choisi une fois validé', () => {
    let state = drawCoupeCard(posed(['8h', '8s', '2c']))
    expect(coupeLastDrawPartner(state)).toBeNull()
    state = setCoupePair(state, 'alice', 'chloe')
    expect(coupeLastDrawPartner(state)).toBe('chloe')

    // Un nouveau 8 en attente ne ressort pas le binôme d'un autre joueur.
    state = drawCoupeCard(state)
    expect(state.pending).toEqual({ kind: 'pair', playerId: 'bob' })
    expect(coupeLastDrawPartner(state)).toBeNull()
    state = setCoupePair(state, 'bob', 'alice')
    expect(coupeLastDrawPartner(state)).toBe('alice')

    // La carte suivante n'est plus un 8 : plus rien à annoncer, le binôme reste en vigueur.
    state = drawCoupeCard(state)
    expect(coupeLastDrawPartner(state)).toBeNull()
    expect(state.pairs).toEqual({ alice: 'chloe', bob: 'alice' })
  })

  it('un 8 réécrit par la table ne forme aucun binôme, même à deux', () => {
    const settings: CoupeSettings = { cup: 'solo', overrides: { '8': 'Tout le monde change de place' } }
    const duo = { ...createCoupeGame(['alice', 'bob'], settings, 'duo'), deck: [card('8h')], turn: 0 }
    const state = drawCoupeCard(duo)
    expect(state.pairs).toEqual({})
    expect(coupeLastDrawPartner(state)).toBeNull()
    expect(coupeLastDrawPartner(posed([]))).toBeNull()
  })

  it('le Valet attend une règle ; les règles s’ajoutent pour toute la partie', () => {
    let state = drawCoupeCard(posed(['Jh', '2c', 'Js']))
    expect(state.pending).toEqual({ kind: 'rule', playerId: 'alice' })
    expect(addCoupeRule(state, '   ')).toBe(state)

    state = addCoupeRule(state, '  Interdit de dire « oui »  ')
    expect(state.customRules).toEqual([{ text: 'Interdit de dire « oui »', playerId: 'alice' }])
    expect(state.pending).toBeNull()

    state = drawTimes(state, 2)
    state = addCoupeRule(state, 'Bras de T-Rex')
    expect(state.customRules.map((r) => r.playerId)).toEqual(['alice', 'chloe'])
  })

  it('Valet sans idée : la table passe sans nouvelle règle', () => {
    const state = skipCoupeRule(drawCoupeCard(posed(['Jh'])))
    expect(state.pending).toBeNull()
    expect(state.customRules).toEqual([])
  })

  it('choix hors de propos : sans effet', () => {
    const idle = posed(['2h'])
    expect(addCoupeRule(idle, 'Règle')).toBe(idle)
    expect(skipCoupeRule(idle)).toBe(idle)
    expect(setCoupePair(idle, 'alice', 'bob')).toBe(idle)
    const waitingPair = drawCoupeCard(posed(['8h']))
    expect(addCoupeRule(waitingPair, 'Règle')).toBe(waitingPair)
    expect(skipCoupeRule(waitingPair)).toBe(waitingPair)
  })

  it('durée des rôles : prochain du rang, prochain 8 du joueur, toute la partie', () => {
    expect(coupeRoleSpan('5', {})).toBe('next')
    expect(coupeRoleSpan('10', {})).toBe('next')
    expect(coupeRoleSpan('8', {})).toBe('own')
    expect(coupeRoleSpan('J', {})).toBe('game')
    expect(coupeRoleSpan('K', {})).toBeNull()
    expect(coupeRoleSpan('A', {})).toBeNull()
  })
})

describe('règles de la table', () => {
  const CUSTOM: CoupeSettings = {
    cup: 'solo',
    overrides: { '5': 'Tout le monde chante', '8': 'Compliment à ta gauche', J: 'Le Valet invente un surnom', K: 'Le roi choisit la musique' },
  }

  it('la version de la table remplace l’originale, rang par rang', () => {
    expect(coupeRuleFor('5', CUSTOM.overrides)).toEqual({ kind: 'custom', rank: '5', text: 'Tout le monde chante' })
    expect(coupeRuleFor('6', CUSTOM.overrides)).toEqual({ kind: 'default', rank: '6' })
    expect(coupeRuleFor('6', { '6': '    ' })).toEqual({ kind: 'default', rank: '6' })
  })

  it('une règle réécrite remplace aussi le rôle de sa carte', () => {
    let state = posed(['5h', '8h', 'Jh'], {}, CUSTOM)
    for (let i = 0; i < 3; i += 1) {
      state = drawCoupeCard(state)
      expect(state.pending).toBeNull()
    }
    expect(state.drawn).toHaveLength(3)
    expect(state.thumbMaster).toBeNull()
    expect(state.pairs).toEqual({})
    expect(coupeRoleSpan('5', CUSTOM.overrides)).toBeNull()
    expect(coupeRoleSpan('10', CUSTOM.overrides)).toBe('next')
  })

  it('un roi réécrit compte toujours pour la coupe', () => {
    const state = drawTimes(posed(['Kh', 'Ks', 'Kd', 'Kc'], {}, CUSTOM), 4)
    expect(state.finished).toBe(true)
    expect(state.cupHolder).toBe('alice')
  })

  it('texte saisi : une ligne propre, sans contrôle, coupée sans casser un emoji', () => {
    expect(cleanCoupeText('  Interdit\nde\tdire   oui  ')).toBe('Interdit de dire oui')
    expect(cleanCoupeText('a\u0000b\u007fc')).toBe('a b c')
    expect(cleanCoupeText(42)).toBe('')
    expect(cleanCoupeText('x'.repeat(200))).toHaveLength(COUPE_RULE_MAX_LENGTH)
    expect(cleanCoupeText('👑'.repeat(150))).toBe('👑'.repeat(COUPE_RULE_MAX_LENGTH))
  })

  it('règles relues : rangs inconnus et textes vides écartés', () => {
    expect(cleanCoupeOverrides({ A: '  Cascade inversée ', Z: 'inconnu', '5': '   ', '10': 12 })).toEqual({
      A: 'Cascade inversée',
    })
    expect(cleanCoupeOverrides(null)).toEqual({})
    expect(cleanCoupeOverrides('texte')).toEqual({})
    expect(cleanCoupeOverrides(['A'])).toEqual({})
  })
})

describe('idées de règle pour le Valet', () => {
  it('une douzaine d’idées, toutes différentes', () => {
    expect(COUPE_SUGGESTION_KEYS).toHaveLength(12)
    expect(new Set(COUPE_SUGGESTION_KEYS).size).toBe(12)
  })

  it('même état → même idée, et le générateur avance', () => {
    const state = createCoupeGame(TABLE, SETTINGS, 'idées')
    const first = pickCoupeSuggestion(state)
    expect(pickCoupeSuggestion(state).key).toBe(first.key)
    expect(first.state.rngState).not.toBe(state.rngState)
    expect({ ...first.state, rngState: state.rngState }).toEqual(state)
  })

  it('évite les idées déjà montrées tant qu’il en reste, puis repart de la liste entière', () => {
    const state = createCoupeGame(TABLE, SETTINGS, 'idées')
    const allButOne = COUPE_SUGGESTION_KEYS.filter((key) => key !== 'tRex')
    expect(pickCoupeSuggestion(state, allButOne).key).toBe('tRex')
    expect(COUPE_SUGGESTION_KEYS).toContain(pickCoupeSuggestion(state, COUPE_SUGGESTION_KEYS).key)

    let current = state
    const shown: string[] = []
    for (let i = 0; i < COUPE_SUGGESTION_KEYS.length; i += 1) {
      const pick = pickCoupeSuggestion(current, shown)
      current = pick.state
      shown.push(pick.key)
    }
    expect(new Set(shown).size).toBe(COUPE_SUGGESTION_KEYS.length)
  })
})

describe('bilan', () => {
  it('cartes et rois de chacun, dans l’ordre de la table', () => {
    const state = drawTimes(posed(['Kh', '2c', '3c', '4c', 'Ks']), 5)
    expect(coupeTally(state)).toEqual([
      { playerId: 'alice', cards: 2, kings: 1, cup: false },
      { playerId: 'bob', cards: 2, kings: 1, cup: false },
      { playerId: 'chloe', cards: 1, kings: 0, cup: false },
    ])
    expect(coupeKingDraws(state).map((d) => keyOf(d.card))).toEqual(['K-heart', 'K-spade'])
  })

  it('la coupe revient au tireur du quatrième roi', () => {
    const end = drawTimes(posed(['Kh', 'Ks', 'Kd', 'Kc']), 4)
    expect(coupeTally(end).filter((row) => row.cup).map((row) => row.playerId)).toEqual(['alice'])
  })
})

describe('reprise (useResumableLocalGame)', () => {
  /** Partie en cours : quelques cartes, un binôme, une règle — sur un vrai paquet de 52. */
  function inProgress(): CoupeState {
    let state = createCoupeGame(TABLE, { cup: 'shared', overrides: { Q: 'La Dame chante' } }, 'reprise')
    const eight = state.deck.findIndex((c) => c.rank === '8')
    const jack = state.deck.findIndex((c) => c.rank === 'J')
    const ordered = [state.deck[eight], state.deck[jack], ...state.deck.filter((_, i) => i !== eight && i !== jack)]
    state = { ...state, deck: ordered.filter((c) => c.rank !== 'K').concat(ordered.filter((c) => c.rank === 'K')) }
    for (let i = 0; i < 6; i += 1) state = settle(drawCoupeCard(state))
    return state
  }

  it('sauvegarde → reprise à l’identique', () => {
    const state = inProgress()
    expect(state.finished).toBe(false)
    expect(Object.keys(state.pairs).length).toBeGreaterThan(0)
    expect(state.customRules.length).toBeGreaterThan(0)
    const raw = JSON.stringify({ version: COUPE_SAVE_VERSION, savedAt: 1_000, state: toCoupeSave(state) })
    const save = parseLocalGameSave<unknown>(raw, COUPE_SAVE_VERSION, 2_000)
    expect(restoreCoupeSave(save, TABLE)).toEqual(state)
  })

  it('une décision en attente est reprise, et se tranche après coup', () => {
    let state = createCoupeGame(TABLE, SETTINGS, 'attente')
    const eight = state.deck.findIndex((c) => c.rank === '8')
    state = { ...state, deck: [state.deck[eight], ...state.deck.filter((_, i) => i !== eight)] }
    state = drawCoupeCard(state)
    const actor = state.pending?.playerId ?? ''
    const restored = restoreCoupeSave(JSON.parse(JSON.stringify(toCoupeSave(state))), TABLE)
    expect(restored?.pending).toEqual({ kind: 'pair', playerId: actor })
    const partner = TABLE.find((id) => id !== actor) ?? ''
    expect(setCoupePair(restored!, actor, partner).pairs).toEqual({ [actor]: partner })
  })

  it('« Rejouer » après une reprise repart des réglages de la partie reprise, pas d’un pré-lobby oublié', () => {
    const restored = restoreCoupeSave(JSON.parse(JSON.stringify(toCoupeSave(inProgress()))), TABLE)
    expect(restored?.settings).toEqual({ cup: 'shared', overrides: { Q: 'La Dame chante' } })
    // L'écran relance avec game.settings : le nettoyage les rend tels quels.
    expect(createCoupeGame(TABLE, restored!.settings, 'revanche').settings).toEqual(restored!.settings)
  })

  it('l’ordre de passage reste celui de la sauvegarde', () => {
    const save = toCoupeSave(inProgress())
    expect(restoreCoupeSave(save, ['chloe', 'alice', 'bob'])?.playerIds).toEqual(TABLE)
  })

  it('sauvegarde illisible ou trafiquée → null (partie neuve plutôt qu’un plantage)', () => {
    const save = toCoupeSave(inProgress())
    const base = toCoupeSave(posed([]))
    const kings = createCoupeDeck().filter((c) => c.rank === 'K')
    const withoutKings = createCoupeDeck().filter((c) => c.rank !== 'K')
    const kingDraws = (count: number) => kings.slice(0, count).map((c) => ({ card: c, playerId: 'alice' }))
    // Témoin : trois rois tirés, la partie continue.
    expect(
      restoreCoupeSave({ ...base, deck: [...withoutKings, kings[3]], drawn: kingDraws(3), kingsDrawn: 3 }, TABLE)
    ).not.toBeNull()

    expect(restoreCoupeSave(null, TABLE)).toBeNull()
    expect(restoreCoupeSave('texte', TABLE)).toBeNull()
    expect(restoreCoupeSave(save, ['alice', 'bob'])).toBeNull()
    expect(restoreCoupeSave(save, ['alice', 'bob', 'zoe'])).toBeNull()
    expect(restoreCoupeSave({ ...save, deck: undefined }, TABLE)).toBeNull()
    expect(restoreCoupeSave({ ...save, deck: [save.deck[1], ...save.deck.slice(1)] }, TABLE)).toBeNull()
    expect(restoreCoupeSave({ ...save, deck: save.deck.slice(1) }, TABLE)).toBeNull()
    expect(restoreCoupeSave({ ...save, deck: [{ rank: '1', suit: 'heart' }, ...save.deck.slice(1)] }, TABLE)).toBeNull()
    expect(restoreCoupeSave({ ...save, drawn: [{ ...save.drawn[0], playerId: 'zoe' }, ...save.drawn.slice(1)] }, TABLE)).toBeNull()
    expect(restoreCoupeSave({ ...save, kingsDrawn: save.kingsDrawn + 1 }, TABLE)).toBeNull()
    expect(restoreCoupeSave({ ...base, deck: withoutKings, drawn: kingDraws(4), kingsDrawn: 4 }, TABLE)).toBeNull()
    expect(restoreCoupeSave({ ...save, turn: 3 }, TABLE)).toBeNull()
    expect(restoreCoupeSave({ ...save, turn: 1.5 }, TABLE)).toBeNull()
    expect(restoreCoupeSave({ ...save, thumbMaster: 'zoe' }, TABLE)).toBeNull()
    expect(restoreCoupeSave({ ...save, pairs: { alice: 'alice' } }, TABLE)).toBeNull()
    expect(restoreCoupeSave({ ...save, pairs: { alice: 'zoe' } }, TABLE)).toBeNull()
    expect(restoreCoupeSave({ ...save, customRules: [{ text: '   ', playerId: 'alice' }] }, TABLE)).toBeNull()
    expect(restoreCoupeSave({ ...save, settings: { cup: 'triple', overrides: {} } }, TABLE)).toBeNull()
    expect(restoreCoupeSave({ ...save, pending: { kind: 'vote', playerId: 'alice' } }, TABLE)).toBeNull()
    expect(restoreCoupeSave({ ...save, rngState: 'graine' }, TABLE)).toBeNull()
  })

  it('le contrôle de table (appelant) refuse une autre soirée', () => {
    const save = toCoupeSave(inProgress())
    expect(isSameLocalTable(save.playerIds, TABLE.map((id) => ({ id })))).toBe(true)
    expect(isSameLocalTable(save.playerIds, [{ id: 'alice' }, { id: 'bob' }])).toBe(false)
  })
})

describe('pureté', () => {
  afterEach(() => vi.restoreAllMocks())

  it('ni Math.random ni Date.now : tout vient de la graine', () => {
    const random = vi.spyOn(Math, 'random')
    const clock = vi.spyOn(Date, 'now')
    let state = createCoupeGame(TABLE, SETTINGS, 'pure')
    state = pickCoupeSuggestion(state).state
    state = playOut(state)
    expect(state.finished).toBe(true)
    expect(random).not.toHaveBeenCalled()
    expect(clock).not.toHaveBeenCalled()
  })
})
