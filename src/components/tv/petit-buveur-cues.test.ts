import { describe, expect, it } from 'vitest'
import { autoAction, createInitialState, reduce, type EngineAction, type EngineState } from '@/lib/petit-buveur/engine'
import { toClientView } from '@/lib/petit-buveur/server-adapter'
import {
  castCues,
  castRevealIsCurrent,
  onlineInteractionKey,
  onlineRollCue,
} from './petit-buveur-cues'
import {
  absentsBlockRem,
  CELL_INNER_REM,
  cardHeaderRem,
  cardLayout,
  effectsLayout,
  effectsLayoutHeight,
  EFFECTS_LIST_REM,
  engineEffects,
  PAWN_GAP_REM,
  pawnGrid,
  pawnGridHeight,
  pendingLayout,
  RANKING_LIST_REM,
  rankingDensity,
  rankingHeight,
  titleLayout,
} from './petit-buveur/model'

const settings = { difficulty: 'normal' as const, defiDrinks: [2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2, 2] }

function game(seed: string, count = 4): EngineState {
  return createInitialState(
    Array.from({ length: count }, (_, i) => ({ id: `p${i + 1}`, name: `Joueur ${i + 1}` })),
    settings,
    seed
  )
}

function next(s: EngineState): EngineState {
  const { state, action } = autoAction(s)
  return reduce(state, action)
}

/** Une partie complète, coup par coup (vues client, comme la TV les reçoit). */
function history(seed: string): EngineState[] {
  let s = game(seed)
  const out = [s]
  for (let i = 0; i < 400 && s.phase !== 'finished'; i += 1) {
    s = next(s)
    out.push(s)
  }
  return out
}

const view = (s: EngineState) => toClientView(s)

describe('onlineRollCue — un lancer, et seulement un lancer', () => {
  it('aucun lancer avant le premier coup', () => {
    expect(onlineRollCue(view(game('a')))).toBeNull()
  })

  it('chaque ROLL donne une clé neuve ; un choix de cible ou de verdict ne rejoue pas le dé', () => {
    const seen = new Set<string>()
    let rolls = 0
    for (const [i, s] of history('cues-1').entries()) {
      if (i === 0) continue
      const cue = onlineRollCue(view(s))
      const message = s.log[s.log.length - 1]?.message ?? ''
      const wasRoll =
        message.startsWith('case:') ||
        ((message === 'resolved:chance' || message === 'win') && typeof s.lastOutcome?.diceLanding === 'number')
      if (s.log[s.log.length - 1]?.message.startsWith('resolved:') && typeof s.lastOutcome?.diceLanding !== 'number') {
        expect(cue).toBeNull()
      }
      if (cue) {
        expect(seen.has(cue.key)).toBe(false)
        seen.add(cue.key)
        expect(cue.value).toBe(s.lastDice)
        rolls += 1
      } else {
        expect(wasRoll).toBe(false)
      }
    }
    expect(rolls).toBeGreaterThan(10)
  })

  it('une écriture sans lancer (départ, retour) garde la même clé', () => {
    const h = history('cues-2')
    const rolled = h.find((s, i) => i > 0 && onlineRollCue(view(s)))!
    const bumped = { ...rolled, version: rolled.version + 1, players: rolled.players.map((p) => ({ ...p })) }
    expect(onlineRollCue(view(bumped))?.key).toBe(onlineRollCue(view(rolled))?.key)
  })

  it('le lancer gagnant compte comme un lancer quand il finit la partie sans case', () => {
    for (const seed of ['fin-1', 'fin-2', 'fin-3', 'fin-4', 'fin-5']) {
      const h = history(seed)
      const last = h[h.length - 1]
      expect(last.phase).toBe('finished')
      const cue = onlineRollCue(view(last))
      if (!last.lastOutcome) expect(cue).not.toBeNull()
      else if (typeof last.lastOutcome.diceLanding !== 'number') expect(cue).toBeNull()
    }
  })

  it('relance Chance tombée sur un défi ou un pile ou face : le choix de cible qui suit ne rejoue pas le dé', () => {
    let found = 0
    for (let seed = 0; seed < 300 && found < 3; seed += 1) {
      let s = game(`relance-${seed}`)
      for (let i = 0; i < 400 && s.phase !== 'finished'; i += 1) {
        const n = autoAction(s)
        const chance = s.pending?.caseType === 'chance' && !s.pending.stage
        const action: EngineAction =
          chance && n.action.type === 'RESOLVE_INTERACTION'
            ? { ...n.action, choice: { ...n.action.choice, chanceChoice: 'reroll' } }
            : n.action
        const after = reduce(n.state, action)
        const landed = after.pending && !after.pending.stage && ['defi', 'question', 'pile-face'].includes(after.pending.caseType)
        if (chance && landed) {
          const reroll = onlineRollCue(view(after))
          expect(reroll).not.toBeNull()
          const m = autoAction(after)
          const chosen = reduce(m.state, m.action)
          expect(chosen.lastOutcome?.diceLanding).toBe(after.lastOutcome?.diceLanding)
          const cue = onlineRollCue(view(chosen))
          expect(cue === null || cue.key === reroll!.key).toBe(true)
          found += 1
          break
        }
        s = after
      }
    }
    expect(found).toBeGreaterThan(0)
  })

  it('le lanceur de la relance Chance est l’acteur de la case', () => {
    for (const seed of Array.from({ length: 20 }, (_, i) => `chance-${i}`)) {
      const s = history(seed).find((x) => x.lastOutcome?.chanceChoice === 'reroll')
      if (!s) continue
      expect(onlineRollCue(view(s))?.actorId).toBe(s.lastOutcome?.actorId)
      return
    }
  })
})

describe('onlineInteractionKey', () => {
  it('suit le tirage et l’effet : deux tirages identiques à des tours différents restent distincts', () => {
    const h = history('cues-3')
    const keys = h.map((s) => onlineInteractionKey(view(s))).filter((k): k is string => k !== null)
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('null sans tirage', () => {
    expect(onlineInteractionKey(view(game('b')))).toBeNull()
  })
})

describe('castCues — partie locale diffusée', () => {
  it("sans lancer ni case, rien à montrer (payload d'avant le premier lancer)", () => {
    expect(castCues({})).toEqual({
      diceKey: null,
      dice: null,
      diceSeq: null,
      dicePhase: null,
      revealKey: null,
      caseType: null,
      revealSeq: null,
    })
  })

  it('dé qui roule sur le téléphone : le lancer est là, sa valeur pas encore', () => {
    const rolling = castCues({ dice: { value: 0, seq: 20, phase: 'rolling' }, reveal: { caseType: 'gorgée', seq: 11 } })
    expect(rolling).toMatchObject({ diceKey: 'cast:20', dice: null, diceSeq: 20, dicePhase: 'rolling' })
    // La case du tour d'avant n'est plus « en cours » dès que le dé roule.
    expect(castRevealIsCurrent(rolling)).toBe(false)
    const shown = castCues({ dice: { value: 5, seq: 20, phase: 'result' } })
    expect(shown).toMatchObject({ diceKey: 'cast:20', dice: 5, dicePhase: 'result' })
  })

  it('un ancien téléphone (sans phase) garde son dé, valeur comprise', () => {
    expect(castCues({ dice: { value: 3, seq: 4 } })).toMatchObject({ diceKey: 'cast:4', dice: 3, dicePhase: null })
  })

  it('dé et case ont chacun leur séquence', () => {
    const before = castCues({ dice: { value: 4, seq: 1 }, reveal: { caseType: 'bonus', seq: 2 } })
    const after = castCues({ dice: { value: 4, seq: 3 }, reveal: { caseType: 'bonus', seq: 2 } })
    expect(after.diceKey).not.toBe(before.diceKey)
    expect(after.revealKey).toBe(before.revealKey)
  })

  it('la case poussée après le dé appartient au lancer en cours, plus après le lancer suivant', () => {
    expect(castRevealIsCurrent(castCues({ dice: { value: 2, seq: 10 }, reveal: { caseType: 'gorgée', seq: 11 } }))).toBe(true)
    expect(castRevealIsCurrent(castCues({ dice: { value: 2, seq: 12 }, reveal: { caseType: 'gorgée', seq: 11 } }))).toBe(false)
    expect(castRevealIsCurrent(castCues({ reveal: { caseType: 'passe-tour', seq: 5 } }))).toBe(true)
  })

  it('ignore un dé hors 1..6 ou une case vide venus du payload', () => {
    const cues = castCues({ dice: { value: 9, seq: 1 }, reveal: { caseType: '', seq: 1 } })
    expect(cues.diceKey).toBeNull()
    expect(cues.revealKey).toBeNull()
    expect(castCues({ dice: { value: 0, seq: 1, phase: 'result' } }).diceKey).toBeNull()
  })
})

describe('engineEffects — la liste des effets en cours du téléphone', () => {
  it('protection, malédiction, chaîne, passe-tour, ancre et miroir, avec leurs tours', () => {
    const s = game('fx')
    const players = s.players.map((p, i) =>
      i === 0
        ? { ...p, protected: true, protectionTurnsLeft: 3, cursed: 2 }
        : i === 1
          ? { ...p, linkedTo: 'p3', linkedTurns: 4, skipNextTurn: true }
          : i === 2
            ? { ...p, anchored: true, mirrorDrinkTargetId: 'p1', mirrorDrinkTurns: 2 }
            : p
    )
    expect(engineEffects(players).map((e) => [e.kind, e.playerId, e.partnerId ?? null, e.remaining])).toEqual([
      ['protection', 'p1', null, 3],
      ['curse', 'p1', null, 2],
      ['chain', 'p2', 'p3', 4],
      ['skip', 'p2', null, 1],
      ['anchor', 'p3', null, 1],
      ['mirror', 'p3', 'p1', 2],
    ])
  })

  it('une protection épuisée ou une chaîne finie ne s’affichent plus', () => {
    const p = game('fx2').players[0]
    expect(engineEffects([{ ...p, protected: true, protectionTurnsLeft: 0, linkedTo: 'x', linkedTurns: 0 }])).toEqual([])
  })
})

describe('densités de l’écran TV', () => {
  it('le classement se resserre avec le nombre de joueurs et résume au-delà de 15', () => {
    expect(rankingDensity(7).mode).toBe('detailed')
    expect(rankingDensity(12)).toEqual({ mode: 'single', visible: 12 })
    expect(rankingDensity(15)).toEqual({ mode: 'dense', visible: 15 })
    expect(rankingDensity(20)).toEqual({ mode: 'dense', visible: 14 })
  })

  it('l’encadré des absents en tête du classement : les lignes (et « +N ») tiennent toujours dans la colonne', () => {
    for (const absents of [0, 1, 2, 5]) {
      const reserved = absentsBlockRem(absents)
      for (const count of [2, 3, 7, 8, 12, 13, 15, 20, 99]) {
        const { mode, visible } = rankingDensity(count, reserved)
        const rows = visible + (visible < count ? 1 : 0)
        expect(reserved + rankingHeight(mode, rows)).toBeLessThanOrEqual(RANKING_LIST_REM)
      }
    }
    expect(rankingDensity(12, absentsBlockRem(1)).visible).toBe(12)
  })

  it('effets : une ligne par effet jusqu’à 4 (partenaire en toutes lettres quand ça tient), puis pastilles et « +N »', () => {
    const solo = { partnerId: undefined }
    const duo = { partnerId: 'b' }
    expect(effectsLayout([solo, duo])).toEqual({ mode: 'rows', rows: ['two', 'two'] })
    expect(effectsLayout([solo, duo, solo])).toEqual({ mode: 'rows', rows: ['line', 'two', 'line'] })
    expect(effectsLayout([duo, duo, solo, solo])).toEqual({ mode: 'rows', rows: ['line', 'line', 'line', 'line'] })
    expect(effectsLayout(Array.from({ length: 8 }, () => duo))).toEqual({ mode: 'chips', visible: 8 })
    expect(effectsLayout(Array.from({ length: 12 }, () => solo))).toEqual({ mode: 'chips', visible: 7 })
    for (let n = 0; n <= 12; n += 1) {
      for (const pick of [solo, duo]) {
        const effects = Array.from({ length: n }, (_, i) => (i % 2 === 0 ? pick : duo))
        expect(effectsLayoutHeight(effectsLayout(effects), n)).toBeLessThanOrEqual(EFFECTS_LIST_REM)
      }
    }
  })

  it('les pions rapetissent quand toute la table partage une case, et tiennent dans la case jusqu’à 99', () => {
    expect(pawnGrid(1).size).toBeGreaterThan(pawnGrid(4).size)
    for (let count = 1; count <= 99; count += 1) {
      const { size, cols, visible } = pawnGrid(count)
      expect(visible).toBeLessThanOrEqual(count)
      expect(Math.min(cols, visible) * size + (Math.min(cols, visible) - 1) * PAWN_GAP_REM).toBeLessThanOrEqual(CELL_INNER_REM)
      expect(pawnGridHeight(count)).toBeLessThanOrEqual(CELL_INNER_REM)
    }
    expect(pawnGrid(40)).toMatchObject({ visible: 12 })
  })
})

describe('titres et encadré « en attente » — rien de coupé', () => {
  it('le titre passe en text-3xl puis sur deux lignes plutôt que d’être tronqué', () => {
    expect(titleLayout('Pile ou face')).toMatchObject({ size: '4xl', lines: 1 })
    expect(titleLayout('Répétition → Malédiction').size).toBe('3xl')
    expect(titleLayout('Double case (Gorgées + Malédiction)')).toMatchObject({ size: '3xl', lines: 2 })
  })

  it('pile ou face avec une cible au nom long : le titre garde toute la largeur, la cible a sa rangée', () => {
    const layout = pendingLayout({
      title: 'Pile ou face',
      detail: null,
      targetRow: true,
      status: 'La pièce tourne…',
      die: false,
    })
    expect(layout.title).toMatchObject({ size: '4xl', lines: 1 })
  })

  it('verdict aux noms longs : qui juge reste en entier, le défi se resserre', () => {
    const layout = pendingLayout({
      title: 'Défi',
      detail: 'Défi : Imite un animal choisi par la table pendant dix secondes ou bois 2 gorgée(s) !',
      targetRow: false,
      status: 'Jean-Baptiste juge si Marie-Charlotte a relevé le défi…',
      die: false,
    })
    expect(layout.statusClamp).toBe(2)
    expect(layout.detailClamp).toBeGreaterThanOrEqual(1)
  })

  it('l’en-tête de la carte grandit avec un titre sur deux lignes', () => {
    expect(cardHeaderRem(titleLayout('Gorgées'), true)).toBeLessThan(cardHeaderRem(titleLayout('Double case (Gorgées + Malédiction)'), true))
  })
})

describe('cardLayout — la carte de case ne coupe jamais une ligne', () => {
  const name = () => 'Marie-Charlotte'
  const change = (i: number) => ({ playerId: `p${i}`, drinks: 2, from: i, to: i })

  it('une case simple montre tout : pastilles avec nom, notes et défi', () => {
    const layout = cardLayout({ detail: 'Cite 5 marques de soda', changes: [change(1)], lines: [], nothing: false }, name)
    expect(layout).toMatchObject({ plainChips: true, visibleChips: 1, detailClamp: 2 })
  })

  it('toute la table touchée : pions sans nom, deux rangées au plus, le reste en « +N »', () => {
    const changes = Array.from({ length: 12 }, (_, i) => change(i))
    const layout = cardLayout({ detail: null, changes, lines: ['X est protégé'], nothing: false }, name)
    expect(layout.plainChips).toBe(false)
    expect(layout.visibleChips).toBeLessThan(12)
    expect(layout.lineCount).toBe(1)
  })

  it('pastilles, notes et défi ensemble : le défi se resserre plutôt que de déborder', () => {
    const layout = cardLayout(
      { detail: 'Un long défi', changes: [change(1), change(2)], lines: ['a', 'b'], nothing: false },
      name
    )
    expect(layout.plainChips).toBe(false)
    expect(layout.lineCount).toBe(2)
    expect(layout.detailClamp).toBeLessThanOrEqual(1)
  })
})
