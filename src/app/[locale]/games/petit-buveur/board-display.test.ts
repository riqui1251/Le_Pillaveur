import { describe, expect, it } from 'vitest'
import {
  boardHighlightClass,
  boardHighlights,
  buildLocalCastState,
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
