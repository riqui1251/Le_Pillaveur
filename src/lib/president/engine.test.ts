import { describe, expect, it } from 'vitest'
import { phaseKey } from '@/lib/online/phase-clock'
import {
  createPreState,
  currentPreActorId,
  preCanPlay,
  prePickBotPlay,
  preRankOf,
  reducePre,
  toPreClientView,
  PRE_TWO,
  type PreState,
} from './engine'

const NOW = 1_000_000

function makePlayers(n: number) {
  return Array.from({ length: n }, (_, i) => ({ id: `p${i + 1}`, name: `Joueur ${i + 1}` }))
}

/** Distribue la première manche (saute le countdown). */
function inPlay(n = 4, manches = 1): PreState {
  const state = createPreState(makePlayers(n), 'seed', NOW, manches)
  return reducePre(state, { type: 'ADVANCE', claimedKey: phaseKey(state), now: NOW + 5_000 })
}

/** Fabrique un état jouable avec des mains CHOISIES (pour tester les règles). */
function rigged(hands: Record<string, number[]>, turnId: string, overrides: Partial<PreState> = {}): PreState {
  const base = inPlay(Object.keys(hands).length)
  return {
    ...base,
    players: base.players.map((p) => ({ ...p, hand: hands[p.id] ?? [] })),
    currentTurnId: turnId,
    lastPlay: null,
    passedIds: [],
    outOrder: [],
    ...overrides,
  }
}

// Cartes : rang r, couleur s → r*4+s. Rang 0='3' … 11='A', 12='2'.
const c = (rank: number, suit = 0) => rank * 4 + suit

describe('président — distribution', () => {
  it('distribue les 52 cartes aux joueurs actifs', () => {
    const state = inPlay(4)
    expect(state.phase).toBe('playing')
    const total = state.players.reduce((sum, p) => sum + p.hand.length, 0)
    expect(total).toBe(52)
    expect(state.players.every((p) => p.hand.length === 13)).toBe(true)
    expect(state.currentTurnId).not.toBeNull()
    const all = state.players.flatMap((p) => p.hand).sort((a, b) => a - b)
    expect(all).toEqual(Array.from({ length: 52 }, (_, i) => i))
  })

  it('refuse moins de 4 joueurs', () => {
    expect(() => createPreState(makePlayers(3), 'x', NOW)).toThrow('NOT_ENOUGH_PLAYERS')
  })
})

describe('président — règles de pose', () => {
  it('valide taille identique et rang supérieur OU ÉGAL (l’égal verrouille)', () => {
    const state = rigged(
      { p1: [c(5), c(5, 1), c(8)], p2: [c(3), c(3, 1), c(4), c(4, 1)], p3: [c(8, 1)], p4: [c(9, 1)] },
      'p1',
      { lastPlay: { playerId: 'p4', cards: [c(4, 2), c(4, 3)] }, outOrder: [] }
    )
    expect(preCanPlay(state, 'p1', [c(5), c(5, 1)])).toBeNull()
    expect(preCanPlay(state, 'p1', [c(5)])).toBe('WRONG_SIZE')
    // La pose ÉGALE est désormais permise (elle verrouille le pli — « ou rien »).
    expect(preCanPlay(state, 'p2', [c(4), c(4, 1)])).toBeNull()
    // Strictement inférieur reste interdit.
    expect(preCanPlay(state, 'p2', [c(3), c(3, 1)])).toBe('TOO_LOW')
    expect(preCanPlay(state, 'p1', [c(5), c(8)])).toBe('MIXED_RANKS')
    expect(preCanPlay(state, 'p1', [c(9)])).toBe('NOT_YOUR_CARDS')
  })

  it('« ou rien » : l’égalisation verrouille le rang, les sans-carte sautent', () => {
    let state = rigged(
      {
        p1: [c(9), c(3)],
        p2: [c(9, 1), c(3, 1)],
        p3: [c(7), c(7, 1)],
        p4: [c(9, 2), c(5)],
      },
      'p1'
    )
    state = reducePre(state, { type: 'PLAY', playerId: 'p1', cards: [c(9)], now: NOW })
    state = reducePre(state, { type: 'PLAY', playerId: 'p2', cards: [c(9, 1)], now: NOW })
    // p3 n'a pas de dame → son tour SAUTE, la main passe à p4 qui en a une.
    expect(state.currentTurnId).toBe('p4')
    expect(state.passedIds).toContain('p3')
    // p4 ne peut QUE égaler (dame ou rien).
    expect(preCanPlay(state, 'p4', [c(5)])).toBe('MUST_MATCH_RANK')
    expect(preCanPlay(state, 'p4', [c(9, 2)])).toBeNull()
    // p4 égale : plus personne ne peut suivre → pli fermé, p4 remène.
    state = reducePre(state, { type: 'PLAY', playerId: 'p4', cards: [c(9, 2)], now: NOW })
    expect(state.lastPlay).toBeNull()
    expect(state.trickRun).toBeNull()
    expect(state.currentTurnId).toBe('p4')
  })

  it('« ou rien » : personne ne peut égaler → le pli revient à l’égaliseur', () => {
    let state = rigged(
      { p1: [c(6), c(3)], p2: [c(6, 1), c(4)], p3: [c(8), c(8, 1)], p4: [c(10), c(11)] },
      'p1'
    )
    state = reducePre(state, { type: 'PLAY', playerId: 'p1', cards: [c(6)], now: NOW })
    state = reducePre(state, { type: 'PLAY', playerId: 'p2', cards: [c(6, 1)], now: NOW })
    expect(state.lastPlay).toBeNull()
    expect(state.currentTurnId).toBe('p2')
  })

  it('fermeture : 3 simples à la suite → le détenteur de la 4e ferme HORS TOUR', () => {
    const state = rigged(
      { p1: [c(3), c(4)], p2: [c(10)], p3: [c(11)], p4: [c(8, 3), c(5)] },
      'p2',
      {
        lastPlay: { playerId: 'p3', cards: [c(8, 2)] },
        trickRun: { rank: 8, count: 3 },
      }
    )
    // Ce n'est PAS le tour de p4, mais il possède la dernière carte du rang.
    const closed = reducePre(state, { type: 'CLOSE', playerId: 'p4', cards: [c(8, 3)], now: NOW })
    expect(closed.lastPlay).toBeNull()
    expect(closed.trickRun).toBeNull()
    expect(closed.currentTurnId).toBe('p4')
    expect(closed.players.find((p) => p.id === 'p4')?.hand).toEqual([c(5)])
    // Mauvais nombre de cartes → refus.
    expect(() =>
      reducePre(state, { type: 'CLOSE', playerId: 'p4', cards: [c(5)], now: NOW })
    ).toThrow('CANNOT_CLOSE')
  })

  it('fermeture : une paire posée → la paire restante ferme le pli', () => {
    const state = rigged(
      { p1: [c(3), c(4)], p2: [c(10)], p3: [c(5, 2), c(5, 3), c(9)], p4: [c(11)] },
      'p2',
      {
        lastPlay: { playerId: 'p1', cards: [c(5), c(5, 1)] },
        trickRun: { rank: 5, count: 2 },
      }
    )
    const closed = reducePre(state, {
      type: 'CLOSE',
      playerId: 'p3',
      cards: [c(5, 2), c(5, 3)],
      now: NOW,
    })
    expect(closed.lastPlay).toBeNull()
    expect(closed.currentTurnId).toBe('p3')
  })

  it('fermeture interdite sur une carte seule (run < 2)', () => {
    const state = rigged(
      { p1: [c(3)], p2: [c(10)], p3: [c(5, 1), c(5, 2), c(5, 3)], p4: [c(11)] },
      'p2',
      {
        lastPlay: { playerId: 'p1', cards: [c(5)] },
        trickRun: { rank: 5, count: 1 },
      }
    )
    expect(() =>
      reducePre(state, { type: 'CLOSE', playerId: 'p3', cards: [c(5, 1), c(5, 2), c(5, 3)], now: NOW })
    ).toThrow('NOTHING_TO_CLOSE')
  })

  it('le carré complété PAR UNE POSE ferme aussi le pli', () => {
    let state = rigged(
      { p1: [c(3)], p2: [c(6, 3), c(9)], p3: [c(10)], p4: [c(11)] },
      'p2',
      {
        lastPlay: { playerId: 'p1', cards: [c(6, 2)] },
        trickRun: { rank: 6, count: 3 },
      }
    )
    state = reducePre(state, { type: 'PLAY', playerId: 'p2', cards: [c(6, 3)], now: NOW })
    expect(state.lastPlay).toBeNull()
    expect(state.currentTurnId).toBe('p2')
  })

  it('le tour passe au joueur suivant après une pose', () => {
    const state = rigged(
      { p1: [c(3), c(7)], p2: [c(4), c(8)], p3: [c(5), c(9)], p4: [c(6), c(10)] },
      'p1'
    )
    const next = reducePre(state, { type: 'PLAY', playerId: 'p1', cards: [c(3)], now: NOW + 10_000 })
    expect(next.currentTurnId).toBe('p2')
    expect(next.lastPlay?.cards).toEqual([c(3)])
    expect(next.players.find((p) => p.id === 'p1')?.hand).toEqual([c(7)])
  })

  it('impossible de passer quand on mène le pli', () => {
    const state = rigged({ p1: [c(3)], p2: [c(4)], p3: [c(5)], p4: [c(6)] }, 'p1')
    expect(() => reducePre(state, { type: 'PASS', playerId: 'p1', now: NOW })).toThrow('MUST_LEAD')
  })

  it('quand tous passent, le poseur remporte le pli et remène', () => {
    let state = rigged(
      { p1: [c(6), c(7)], p2: [c(3), c(4)], p3: [c(3, 1), c(4, 1)], p4: [c(3, 2), c(4, 2)] },
      'p1'
    )
    state = reducePre(state, { type: 'PLAY', playerId: 'p1', cards: [c(6)], now: NOW })
    state = reducePre(state, { type: 'PASS', playerId: 'p2', now: NOW })
    state = reducePre(state, { type: 'PASS', playerId: 'p3', now: NOW })
    state = reducePre(state, { type: 'PASS', playerId: 'p4', now: NOW })
    expect(state.lastPlay).toBeNull()
    expect(state.currentTurnId).toBe('p1')
    expect(state.passedIds).toEqual([])
  })

  it('le 2 coupe le pli immédiatement', () => {
    let state = rigged(
      { p1: [c(6), c(8)], p2: [c(PRE_TWO), c(3)], p3: [c(4), c(5)], p4: [c(4, 1), c(5, 1)] },
      'p1'
    )
    state = reducePre(state, { type: 'PLAY', playerId: 'p1', cards: [c(6)], now: NOW })
    state = reducePre(state, { type: 'PLAY', playerId: 'p2', cards: [c(PRE_TWO)], now: NOW })
    expect(state.lastPlay).toBeNull()
    expect(state.currentTurnId).toBe('p2')
  })
})

describe('président — fin de manche et rôles', () => {
  it('premier sorti = Président, dernier = Trou ; une seule manche = finished', () => {
    let state = rigged(
      { p1: [c(9)], p2: [c(3), c(4)], p3: [c(5), c(6)], p4: [c(7), c(8)] },
      'p1'
    )
    // p1 pose sa dernière carte (fort) — tous passent, p2 mène le pli suivant.
    state = reducePre(state, { type: 'PLAY', playerId: 'p1', cards: [c(9)], now: NOW })
    expect(state.outOrder).toEqual(['p1'])
    expect(state.phase).toBe('playing')
    state = reducePre(state, { type: 'PASS', playerId: 'p2', now: NOW })
    state = reducePre(state, { type: 'PASS', playerId: 'p3', now: NOW })
    state = reducePre(state, { type: 'PASS', playerId: 'p4', now: NOW })
    expect(state.currentTurnId).toBe('p2')
    // p2 vide sa main en deux plis gagnés.
    state = reducePre(state, { type: 'PLAY', playerId: 'p2', cards: [c(3)], now: NOW })
    state = reducePre(state, { type: 'PASS', playerId: 'p3', now: NOW })
    state = reducePre(state, { type: 'PASS', playerId: 'p4', now: NOW })
    state = reducePre(state, { type: 'PLAY', playerId: 'p2', cards: [c(4)], now: NOW })
    expect(state.outOrder).toEqual(['p1', 'p2'])
    state = reducePre(state, { type: 'PASS', playerId: 'p3', now: NOW })
    state = reducePre(state, { type: 'PASS', playerId: 'p4', now: NOW })
    // p3 mène puis sort ; il ne reste que p4 → fin de manche.
    state = reducePre(state, { type: 'PLAY', playerId: 'p3', cards: [c(5)], now: NOW })
    state = reducePre(state, { type: 'PASS', playerId: 'p4', now: NOW })
    state = reducePre(state, { type: 'PLAY', playerId: 'p3', cards: [c(6)], now: NOW })
    expect(state.phase).toBe('finished')
    expect(state.lastRanking).toEqual(['p1', 'p2', 'p3', 'p4'])
    expect(state.players.find((p) => p.id === 'p1')?.role).toBe('president')
    expect(state.players.find((p) => p.id === 'p4')?.role).toBe('trou')
  })

  it('avec plusieurs manches : interlude, puis échange automatique à la redistribution', () => {
    let state = rigged(
      { p1: [c(9)], p2: [c(3)], p3: [c(5)], p4: [c(7), c(8)] },
      'p1',
      { totalManches: 3 }
    )
    state = reducePre(state, { type: 'PLAY', playerId: 'p1', cards: [c(9)], now: NOW })
    state = reducePre(state, { type: 'PASS', playerId: 'p2', now: NOW })
    state = reducePre(state, { type: 'PASS', playerId: 'p3', now: NOW })
    state = reducePre(state, { type: 'PASS', playerId: 'p4', now: NOW })
    state = reducePre(state, { type: 'PLAY', playerId: 'p2', cards: [c(3)], now: NOW })
    state = reducePre(state, { type: 'PASS', playerId: 'p3', now: NOW })
    state = reducePre(state, { type: 'PASS', playerId: 'p4', now: NOW })
    state = reducePre(state, { type: 'PLAY', playerId: 'p3', cards: [c(5)], now: NOW })
    expect(state.phase).toBe('interlude')
    expect(state.lastRanking).toEqual(['p1', 'p2', 'p3', 'p4'])

    const next = reducePre(state, { type: 'CONTINUE', playerId: 'p1', now: NOW + 20_000 })
    expect(next.phase).toBe('playing')
    expect(next.manche).toBe(1)
    expect(next.lastExchange).not.toBeNull()
    expect(next.lastExchange?.presidentId).toBe('p1')
    expect(next.lastExchange?.trouId).toBe('p4')
    // Le Trou mène la manche suivante.
    expect(next.currentTurnId).toBe('p4')
    // Les 2 données par le Trou sont plus fortes que les 2 rendues par le Président.
    const given = next.lastExchange!.fromTrou.map(preRankOf)
    const returned = next.lastExchange!.fromPresident.map(preRankOf)
    expect(Math.min(...given)).toBeGreaterThanOrEqual(Math.max(...returned) - 12)
    expect(next.players.reduce((s, p) => s + p.hand.length, 0)).toBe(52)
  })
})

describe('président — timeout et bots', () => {
  it('au timeout, le joueur passe (ou pose sa plus petite carte s’il mène)', () => {
    const state = rigged(
      { p1: [c(7), c(3)], p2: [c(4)], p3: [c(5)], p4: [c(6)] },
      'p1'
    )
    const afterLead = reducePre(state, {
      type: 'ADVANCE',
      claimedKey: phaseKey(state),
      now: state.phaseEndsAt! + 1,
    })
    expect(afterLead.lastPlay?.cards).toEqual([c(3)])
    expect(afterLead.currentTurnId).toBe('p2')

    const afterPass = reducePre(afterLead, {
      type: 'ADVANCE',
      claimedKey: phaseKey(afterLead),
      now: afterLead.phaseEndsAt! + 1,
    })
    expect(afterPass.passedIds).toContain('p2')
    expect(afterPass.currentTurnId).toBe('p3')
  })

  it('le bot suit au plus petit combo valide, sinon passe', () => {
    const state = rigged(
      { p1: [c(5), c(5, 1), c(9), c(PRE_TWO)], p2: [c(3)], p3: [c(4)], p4: [c(6)] },
      'p1',
      { lastPlay: { playerId: 'p4', cards: [c(4, 2), c(4, 3)] } }
    )
    expect(prePickBotPlay(state, 'p1')).toEqual([c(5), c(5, 1)])
    const noFollow = { ...state, lastPlay: { playerId: 'p4', cards: [c(10), c(10, 1)] } }
    expect(prePickBotPlay(noFollow, 'p1')).toBeNull()
    const lead = { ...state, lastPlay: null }
    expect(prePickBotPlay(lead, 'p1')).toEqual([c(5), c(5, 1)])
  })

  /** Renomme p1 pour lui donner un persona (le trait se retrouve par le nom). */
  function named(state: PreState, name: string): PreState {
    return {
      ...state,
      players: state.players.map((p) => (p.id === 'p1' ? { ...p, name } : p)),
    }
  }

  it('préfère un groupe de taille EXACTE plutôt que casser un brelan', () => {
    const state = rigged(
      { p1: [c(5), c(5, 1), c(5, 2), c(9), c(9, 1)], p2: [c(3)], p3: [c(4)], p4: [c(6)] },
      'p1',
      { lastPlay: { playerId: 'p4', cards: [c(4, 2), c(4, 3)] } }
    )
    // Paire demandée : la paire de 9 (exacte) plutôt que d'amputer le brelan de 5.
    expect(prePickBotPlay(state, 'p1', () => 0.99)).toEqual([c(9), c(9, 1)])
  })

  it('sortie sèche : un combo qui vide la main se joue toujours', () => {
    const state = rigged(
      { p1: [c(8), c(8, 1)], p2: [c(3)], p3: [c(4)], p4: [c(6)] },
      'p1',
      { lastPlay: { playerId: 'p4', cards: [c(6, 2), c(6, 3)] } }
    )
    expect(prePickBotPlay(state, 'p1', () => 0.99)).toEqual([c(8), c(8, 1)])
  })

  it('garde la coupe : vise le rang isolé plutôt que le 2, mais coupe faute de mieux', () => {
    const withNine = rigged(
      { p1: [c(9), c(PRE_TWO)], p2: [c(3)], p3: [c(4)], p4: [c(6)] },
      'p1',
      { lastPlay: { playerId: 'p4', cards: [c(8)] } }
    )
    expect(prePickBotPlay(withNine, 'p1', () => 0.99)).toEqual([c(9)])
    const onlyTwo = rigged(
      { p1: [c(PRE_TWO)], p2: [c(3)], p3: [c(4)], p4: [c(6)] },
      'p1',
      { lastPlay: { playerId: 'p4', cards: [c(8)] } }
    )
    expect(prePickBotPlay(onlyTwo, 'p1', () => 0.99)).toEqual([c(PRE_TWO)])
  })

  it('n’ouvre jamais avec les 2 tant qu’il reste autre chose', () => {
    const state = named(
      rigged({ p1: [c(PRE_TWO), c(PRE_TWO, 1), c(7)], p2: [c(3)], p3: [c(4)], p4: [c(6)] }, 'p1'),
      'Joueur 1'
    )
    expect(prePickBotPlay(state, 'p1', () => 0.99)).toEqual([c(7)])
  })

  it('prudent (Bernadette) : lâche un pli déjà haut quand il a de la marge', () => {
    const state = named(
      rigged(
        { p1: [c(10), c(11), c(3), c(4)], p2: [c(3, 1)], p3: [c(4, 1)], p4: [c(6)] },
        'p1',
        { lastPlay: { playerId: 'p4', cards: [c(9, 2)] } }
      ),
      'Bernadette 🧶'
    )
    expect(prePickBotPlay(state, 'p1', () => 0)).toBeNull()
  })

  it('agressif (Dédé) : surenchérit parfois d’un cran au-dessus du minimum', () => {
    const state = named(
      rigged(
        { p1: [c(5), c(8), c(3, 1)], p2: [c(3)], p3: [c(4)], p4: [c(6)] },
        'p1',
        { lastPlay: { playerId: 'p4', cards: [c(4, 2)] } }
      ),
      'Dédé 🎲'
    )
    expect(prePickBotPlay(state, 'p1', () => 0)).toEqual([c(8)])
    expect(prePickBotPlay(state, 'p1', () => 0.99)).toEqual([c(5)])
  })

  it('farceur (Gépéto) : ouvre parfois d’un simple médian', () => {
    const state = named(
      rigged({ p1: [c(3), c(7), c(9)], p2: [c(3, 1)], p3: [c(4)], p4: [c(6)] }, 'p1'),
      'Gépéto 🤠'
    )
    expect(prePickBotPlay(state, 'p1', () => 0)).toEqual([c(7)])
    expect(prePickBotPlay(state, 'p1', () => 0.99)).toEqual([c(3)])
  })
})

describe('président — rematch et positions héritées', () => {
  it('le classement précédent désigne Président et Trou ; les absents sont remplacés par le plus proche', () => {
    // 'x' (parti entre les deux parties) était Président : p2, le plus
    // proche au classement, récupère la position ; p1 (dernier) reste Trou.
    const state = createPreState(makePlayers(4), 'seed', NOW, 1, ['x', 'p2', 'p3', 'p4', 'p1'])
    expect(state.players.find((p) => p.id === 'p2')?.role).toBe('president')
    expect(state.players.find((p) => p.id === 'p1')?.role).toBe('trou')
    // La première manche applique l'échange hérité et le Trou mène.
    const dealt = reducePre(state, { type: 'ADVANCE', claimedKey: phaseKey(state), now: NOW + 5_000 })
    expect(dealt.lastExchange?.presidentId).toBe('p2')
    expect(dealt.lastExchange?.trouId).toBe('p1')
    expect(dealt.currentTurnId).toBe('p1')
  })

  it('sans classement précédent, personne ne démarre avec un rôle', () => {
    const state = createPreState(makePlayers(4), 'seed', NOW, 1)
    expect(state.players.every((p) => p.role === null)).toBe(true)
  })
})

describe('président — vues anti-triche', () => {
  it('cache les mains adverses et le contenu de l’échange aux non-concernés', () => {
    let state = inPlay(4, 2)
    // Simule un échange en cours de partie.
    state = {
      ...state,
      lastExchange: {
        fromTrou: [c(11), c(PRE_TWO)],
        fromPresident: [c(0), c(1)],
        trouId: 'p4',
        presidentId: 'p1',
      },
    }
    const viewP2 = toPreClientView(state, 'p2')
    expect(viewP2.myHand.length).toBe(13)
    expect(viewP2.players.every((p) => typeof p.handCount === 'number')).toBe(true)
    expect((viewP2.players[0] as unknown as { hand?: unknown }).hand).toBeUndefined()
    expect(viewP2.lastExchange?.fromTrou).toEqual([])

    const viewP1 = toPreClientView(state, 'p1')
    expect(viewP1.lastExchange?.fromTrou).toEqual([c(11), c(PRE_TWO)])
    expect(currentPreActorId(state)).toBe(state.currentTurnId)
  })
})
