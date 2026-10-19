import { describe, expect, it } from 'vitest'
import {
  boardHighlightClass,
  boardHighlights,
  buildLocalCastState,
  castChanges,
  castEffectOf,
  htmlToLines,
  localRevealContent,
  nextCastCue,
  rankByShownPosition,
  shownPosition,
  splitSlots,
  translateWithSlots,
} from './board-display'
import { buildEffectsSummaryHtml } from './case-notification'
import type { PetitBuveurT } from './case-config'

function fakeT(messages: Record<string, string>): PetitBuveurT {
  const t = ((key: string, values?: Record<string, string | number>) => {
    let text = messages[key] ?? key
    for (const [k, v] of Object.entries(values ?? {})) text = text.replaceAll(`{${k}}`, String(v))
    return text
  }) as PetitBuveurT
  t.raw = () => []
  return t
}

describe('position affichée pendant la marche du pion (#23)', () => {
  // A part de l'index 3 et fait 6 : l'état est déjà en 9, le pion n'en est qu'à 4.
  const players = [
    { id: 'A', position: 9 },
    { id: 'B', position: 6 },
  ]
  const walking = { A: 4, B: 6 }

  it('lit la case du pion, pas la cible', () => {
    expect(shownPosition(players[0], walking)).toBe(4)
    expect(shownPosition(players[0], {})).toBe(9)
  })

  it('surligne la case où se trouve le pion, pas sa case d’arrivée', () => {
    const highlights = boardHighlights(players, 0, walking)
    expect(highlights).toEqual({ leader: 6, active: 4 })
    expect(boardHighlightClass(9, highlights)).toBe('')
    expect(boardHighlightClass(4, highlights)).toBe('pb-board-highlight-active')
    expect(boardHighlightClass(6, highlights)).toBe('pb-board-highlight-leader')
  })

  it('ne réordonne le classement qu’une fois le pion passé devant', () => {
    expect(rankByShownPosition(players, walking).map(p => p.id)).toEqual(['B', 'A'])
    expect(rankByShownPosition(players, { A: 9, B: 6 }).map(p => p.id)).toEqual(['A', 'B'])
  })

  it('les deux surbrillances sur la même case', () => {
    expect(boardHighlightClass(5, { leader: 5, active: 5 })).toBe('pb-board-highlight-both')
    expect(boardHighlights([], 0, {})).toEqual({ leader: -1, active: -1 })
  })
})

describe('diffusion TV d’une partie locale (#24)', () => {
  it('porte le dé, la case révélée et l’ambiance', () => {
    const input = {
      players: [{ id: 'A', name: 'Alice', position: 3, drinks: 2 }],
      currentPlayer: 0,
      winnerId: null,
      dice: { value: 5, seq: 10 },
      reveal: { caseType: 'gorgée', seq: 11 },
      ambiance: 'soft' as const,
    }
    const state = buildLocalCastState(input)
    expect(state).toEqual({
      castKind: 'petit-buveur',
      players: [{ id: 'A', name: 'Alice', position: 3, drinks: 2 }],
      currentPlayer: 0,
      phase: 'playing',
      winner: null,
      dice: { value: 5, seq: 10 },
      reveal: { caseType: 'gorgée', seq: 11 },
      ambiance: 'soft',
    })
    const finished = buildLocalCastState({ ...input, winnerId: 'A', ambiance: 'alcool' })
    expect(finished.phase).toBe('finished')
    expect(finished.winner).toBe('A')
  })

  it('chaque signal a une seq nouvelle, même valeur, même milliseconde ou horloge en retard', () => {
    const first = nextCastCue(null, { value: 4 }, 1000)
    const sameMs = nextCastCue(first, { value: 4 }, 1000)
    const clockBack = nextCastCue(sameMs, { value: 4 }, 10)
    expect(first).toEqual({ value: 4, seq: 1000 })
    expect(sameMs.seq).toBe(1001)
    expect(clockBack.seq).toBe(1002)
  })

  it('la case d’un tour passe après son dé, même horloge en retard', () => {
    expect(nextCastCue({ seq: 5 }, { caseType: 'gorgée' }, 3, 2_000).seq).toBe(2_001)
  })

  it('porte les champs ajoutés (icônes, tour, effets, fenêtre, saut) seulement quand ils sont donnés', () => {
    const state = buildLocalCastState({
      players: [
        { id: 'A', name: 'Alice', position: 3, drinks: 2, icon: '🦊' },
        { id: 'B', name: 'Bob', position: 0, drinks: 0, icon: null },
      ],
      currentPlayer: 1,
      winnerId: null,
      dice: { value: 0, seq: 12, phase: 'rolling' },
      reveal: null,
      ambiance: 'alcool',
      turnCount: 4,
      difficulty: 'difficile',
      effects: [{ kind: 'curse', playerId: 'A', remaining: 2 }],
      stage: { kind: 'target' },
      snapKey: 3,
    })
    expect(state.players).toEqual([
      { id: 'A', name: 'Alice', position: 3, drinks: 2, icon: '🦊' },
      { id: 'B', name: 'Bob', position: 0, drinks: 0 },
    ])
    expect(state).toMatchObject({ turnCount: 4, difficulty: 'difficile', stage: { kind: 'target' }, snapKey: 3 })
    expect(state.effects).toEqual([{ kind: 'curse', playerId: 'A', remaining: 2 }])
    const bare = buildLocalCastState({ players: [], currentPlayer: 0, winnerId: null, dice: null, reveal: null, ambiance: 'soft' })
    expect(Object.keys(bare)).not.toContain('stage')
    expect(Object.keys(bare)).not.toContain('effects')
  })
})

describe('carte TV d’un effet de case local', () => {
  it('texte de la notification en paragraphes, sans balise, entités décodées', () => {
    const html =
      '<span class="player-name font-semibold">Tom &amp; Jerry</span> boit <strong>3</strong> gorgée(s) !\n\n<span class="italic text-sm">Santé &quot;!&quot;</span>'
    expect(htmlToLines(html)).toEqual(['Tom & Jerry boit 3 gorgée(s) !', 'Santé "!"'])
    expect(htmlToLines('')).toEqual([])
    expect(htmlToLines('a<br/>b &#39;c&#39; &#x1F37A;')).toEqual(['a', "b 'c' 🍺"])
  })

  it('pastilles : qui a bu et qui a bougé depuis l’arrivée sur la case', () => {
    const before = [
      { id: 'A', position: 6, drinks: 1 },
      { id: 'B', position: 2, drinks: 0 },
      { id: 'C', position: 4, drinks: 3 },
    ]
    const after = [
      { id: 'A', position: 8, drinks: 1 },
      { id: 'B', position: 2, drinks: 2 },
      { id: 'C', position: 4, drinks: 3 },
    ]
    expect(castChanges(before, after)).toEqual([
      { playerId: 'A', drinks: 0, from: 6, to: 8 },
      { playerId: 'B', drinks: 2, from: 2, to: 2 },
    ])
  })

  it('effets en cours : le genre vient de l’id de la liste du téléphone', () => {
    expect(castEffectOf({ id: 'prot-A', player: { id: 'A' }, remainingTurns: 2 })).toEqual({
      kind: 'protection',
      playerId: 'A',
      remaining: 2,
    })
    expect(castEffectOf({ id: 'link-A', player: { id: 'A' }, linkedPlayer: { id: 'B' }, remainingTurns: 5 })).toEqual({
      kind: 'chain',
      playerId: 'A',
      partnerId: 'B',
      remaining: 5,
    })
    expect(castEffectOf({ id: 'mirror-A', player: { id: 'A' }, linkedPlayer: { id: 'C' }, remainingTurns: 1 })?.kind).toBe(
      'mirror'
    )
    expect(castEffectOf({ id: 'autre-A', player: { id: 'A' }, remainingTurns: 1 })).toBeNull()
  })

  it('défi : le texte de la case à part, le reste en lignes, verdict en attente', () => {
    const content = localRevealContent({
      caseType: 'defi',
      mainHtml: 'Défi : Imite un chat ou bois 2 gorgée(s) !\n\nJoueur ciblé : <span class="player-name">Bob</span>',
      caseText: 'Défi : Imite un chat ou bois 2 gorgée(s) !',
      landing: { players: [{ id: 'B', position: 2, drinks: 0 }], caseNumber: 7, dice: 4 },
      players: [{ id: 'B', position: 2, drinks: 0 }],
      targetId: 'B',
      verdictPending: true,
    })
    expect(content).toEqual({
      caseType: 'defi',
      detail: 'Défi : Imite un chat ou bois 2 gorgée(s) !',
      lines: ['Joueur ciblé : Bob'],
      caseNumber: 7,
      dice: 4,
      targetId: 'B',
      changes: [],
      verdictPending: true,
    })
  })

  it('tour passé : ni case ni dé', () => {
    const content = localRevealContent({
      caseType: 'passe-tour',
      mainHtml: '⏭️ Bob passe automatiquement ce tour.',
      caseText: null,
      landing: { players: [], caseNumber: null, dice: null },
      players: [],
      targetId: null,
      verdictPending: false,
    })
    expect(content).toMatchObject({ caseNumber: null, dice: null, detail: null, lines: ['⏭️ Bob passe automatiquement ce tour.'] })
  })
})

describe('phrases avec un nom de joueur stylé (#40)', () => {
  it('découpe la phrase traduite autour des noms, dans l’ordre de la langue', () => {
    const it_ = fakeT({ 'game.duel.vs': '{a} contro {b}', 'game.dialogs.chainChooser': '{player} sceglie' })
    expect(translateWithSlots(it_, 'game.duel.vs', ['a', 'b'])).toEqual([{ slot: 'a' }, ' contro ', { slot: 'b' }])
    expect(translateWithSlots(it_, 'game.dialogs.chainChooser', ['player'])).toEqual([{ slot: 'player' }, ' sceglie'])
  })

  it('garde un texte sans emplacement et un nom en tête de phrase', () => {
    expect(splitSlots('Elige {x}', [])).toEqual(['Elige {x}'])
    expect(splitSlots('', [])).toEqual([])
    const ja = fakeT({ k: 'は{player}が選ぶ' })
    expect(translateWithSlots(ja, 'k', ['player'])).toEqual(['は', { slot: 'player' }, 'が選ぶ'])
  })
})

describe('titre du résumé des effets (#46)', () => {
  it('ne double pas le deux-points hors du français', () => {
    const en = fakeT({ 'game.effects.active': 'Current effects:', 'game.effects.none': 'No special effects in progress' })
    expect(buildEffectsSummaryHtml(en, ['🛡️ A'])).toBe('<strong>Current effects:</strong>\n🛡️ A')
    const fr = fakeT({ 'game.effects.active': 'Effets en cours :' })
    expect(buildEffectsSummaryHtml(fr, ['🛡️ A'])).toBe('<strong>Effets en cours :</strong>\n🛡️ A')
    expect(buildEffectsSummaryHtml(en, [])).toBe('<em>No special effects in progress</em>')
  })
})
