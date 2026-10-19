import { describe, expect, it } from 'vitest'
import { createTranslator } from 'next-intl'
import fr from '../../../../messages/fr.json'
import { withAmbiance } from '@/app/[locale]/games/petit-buveur/ambiance'
import type { PetitBuveurT } from '@/app/[locale]/games/petit-buveur/case-config'
import type { PetitBuveurCastState } from '@/lib/cast-types'
import { LOCAL_DICE_RESULT_MS } from '@/app/[locale]/games/petit-buveur/board-display'
import { castCues, TV_CAST_ROLLING_MAX_MS, TV_DICE_ROLL_MS } from '../petit-buveur-cues'
import { castCard, castEffects, castHeld, castPending, castScreenModel, type CastSequence } from './cast-view'
import type { PbTexts } from './online-view'
import { castDiceInitial, castDiceOnCue, castDiceStep } from './use-tv-sequence'

const base = createTranslator({ locale: 'fr', messages: fr, namespace: 'games.petit-buveur' }) as unknown as PetitBuveurT
const texts: PbTexts = { t: base, base, soft: false }
const softTexts: PbTexts = { t: withAmbiance(base, 'soft'), base, soft: true }

const state: PetitBuveurCastState = {
  castKind: 'petit-buveur',
  players: [
    { id: 'a', name: 'Jean-Baptiste', position: 6, drinks: 3, icon: '🦊' },
    { id: 'b', name: 'Marie-Charlotte', position: 2, drinks: 1 },
    { id: 'c', name: 'Hugo', position: 6, drinks: 0 },
  ],
  currentPlayer: 0,
  phase: 'playing',
  winner: null,
  dice: { value: 4, seq: 100, phase: 'result' },
  turnCount: 3,
}

function seqOf(s: PetitBuveurCastState, over: Partial<CastSequence> = {}): CastSequence {
  return {
    positions: Object.fromEntries(s.players.map((p) => [p.id, p.position])),
    settled: true,
    roll: null,
    held: castHeld(s),
    ...over,
  }
}

const model = (s: PetitBuveurCastState, over: Partial<CastSequence> = {}, t: PbTexts = texts) =>
  castScreenModel(s, castCues(s), t, seqOf(s, over))

describe('castPending — la fenêtre du téléphone, sans ce qu’il cache', () => {
  it('« Qui cibler ? » : aucune trace de la case tombée', () => {
    const pending = castPending({ ...state, stage: { kind: 'target' } }, castCues(state), texts)
    expect(pending).toMatchObject({ icon: '🎯', title: 'Qui cibler ?', waiting: { kind: 'choice', name: 'Jean-Baptiste' } })
    expect(pending?.detail).toBe("L'effet de la case sera révélé après ton choix")
    expect(JSON.stringify(pending)).not.toMatch(/gorg|défi|Malédiction/i)
  })

  it('duel : les règles, puis l’adversaire, puis l’issue une fois la roue arrêtée', () => {
    const pick = castPending({ ...state, stage: { kind: 'duel', caseNumber: 7 } }, castCues(state), texts)
    expect(pick?.detail).toBe("Gagnant : ne bouge pas · Perdant : recule d'une case")
    expect(pick?.status).toBeNull()
    const spinning = castPending(
      { ...state, stage: { kind: 'duel', caseNumber: 7, opponentId: 'c', rolling: true } },
      castCues(state),
      texts
    )
    expect(spinning?.detail).toBe('Jean-Baptiste vs Hugo')
    expect(spinning?.status).toEqual({ text: 'La roue tourne…', rolling: true })
    const done = castPending(
      { ...state, stage: { kind: 'duel', caseNumber: 7, opponentId: 'c', result: 'Hugo gagne · Jean-Baptiste recule' } },
      castCues(state),
      texts
    )
    expect(done?.status).toMatchObject({ text: 'Hugo gagne · Jean-Baptiste recule', rolling: false })
  })

  it('case visible : son titre, ce qu’elle fait, qui décide ; pile ou face : la cible choisit', () => {
    const vote = castPending({ ...state, stage: { kind: 'case', caseType: 'vote', effect: 3 } }, castCues(state), texts)
    expect(vote).toMatchObject({ title: 'Vote', detail: '🗳️ Vote ! Désignez qui boit 3 gorgées.' })
    const coin = castPending(
      { ...state, stage: { kind: 'case', caseType: 'pile-face', targetId: 'b' } },
      castCues(state),
      texts
    )
    expect(coin?.waiting).toEqual({ kind: 'side', name: 'Marie-Charlotte', deadlineAt: null })
    expect(coin?.targetId).toBe('b')
    const shame = castPending(
      { ...state, stage: { kind: 'case', caseType: 'de-honte', die: 4, result: 'Résultat : 2 gorgées' } },
      castCues(state),
      texts
    )
    expect(shame?.status).toEqual({ text: 'Résultat : 2 gorgées', rolling: false, die: 4 })
  })

  it('verdict d’un défi : qui juge, qui est visé, le défi', () => {
    const s: PetitBuveurCastState = {
      ...state,
      reveal: {
        caseType: 'defi',
        seq: 101,
        detail: 'Défi : Imite un chat ou bois 2 gorgée(s) !',
        lines: ['Joueur ciblé : Marie-Charlotte'],
        targetId: 'b',
        verdictPending: true,
      },
    }
    expect(castPending(s, castCues(s), texts)).toMatchObject({
      title: 'Défi',
      detail: 'Défi : Imite un chat ou bois 2 gorgée(s) !',
      targetId: 'b',
      waiting: { kind: 'verdict', judge: 'Jean-Baptiste', target: 'Marie-Charlotte' },
    })
  })
})

describe('castCard — la carte de l’effet', () => {
  it('texte, case, dé du tour et pastilles du téléphone ; joueurs inconnus écartés', () => {
    const s: PetitBuveurCastState = {
      ...state,
      reveal: {
        caseType: 'gorgée',
        seq: 101,
        lines: ['Marie-Charlotte boit 3 gorgée(s) !', '  ', 42 as unknown as string],
        caseNumber: 7,
        dice: 4,
        targetId: 'b',
        changes: [
          { playerId: 'b', drinks: 3, from: 2, to: 2 },
          { playerId: 'zz', drinks: 1, from: 0, to: 0 },
        ],
      },
    }
    const card = castCard(s, castCues(s), texts)
    expect(card).toMatchObject({
      title: 'Gorgées',
      caseNumber: 7,
      dice: 4,
      lines: ['Marie-Charlotte boit 3 gorgée(s) !'],
      changes: [{ playerId: 'b', drinks: 3, from: 2, to: 2 }],
      targetId: 'b',
    })
  })

  it('tour passé : pas le dé du joueur d’avant', () => {
    const s: PetitBuveurCastState = { ...state, reveal: { caseType: 'passe-tour', seq: 101, dice: null, caseNumber: null } }
    expect(castCard(s, castCues(s), texts)?.dice).toBeNull()
  })
})

describe('castScreenModel — rien avant le pion', () => {
  const revealed: PetitBuveurCastState = {
    ...state,
    reveal: { caseType: 'malediction', seq: 101, lines: ['Hugo est maudit'], dice: 4, caseNumber: 7 },
  }

  it('pion encore en marche : ni carte ni fenêtre, mais le lancer lu', () => {
    const m = model(revealed, { settled: false, roll: { actorId: 'a', value: 4 } })
    expect(m.card).toBeNull()
    expect(m.pending).toBeNull()
    expect(m.roll).toEqual({ playerId: 'a', value: 4 })
  })

  it('pion posé : la carte, qui reste après le passage du tour', () => {
    expect(model(revealed).card?.title).toBe('Malédiction')
    expect(model({ ...revealed, currentPlayer: 1 }).card?.title).toBe('Malédiction')
  })

  it('nouveau lancer : la carte d’avant s’efface', () => {
    const rolling = { ...revealed, dice: { value: 0, seq: 102, phase: 'rolling' as const } }
    expect(model(rolling).card).toBeNull()
  })

  it('fenêtre ouverte : elle passe avant la carte, seulement une fois le pion posé', () => {
    const s = { ...state, stage: { kind: 'target' as const } }
    expect(model(s, { settled: false }).pending).toBeNull()
    expect(model(s).pending?.title).toBe('Qui cibler ?')
  })

  it('gorgées, effets et tour : ceux tenus pendant la marche', () => {
    const before = castHeld(state)
    const after: PetitBuveurCastState = {
      ...state,
      currentPlayer: 1,
      players: state.players.map((p) => (p.id === 'c' ? { ...p, drinks: 5 } : p)),
      effects: [{ kind: 'curse', playerId: 'c', remaining: 3 }],
    }
    const m = model(after, { settled: false, held: before })
    expect(m.players.find((p) => p.id === 'c')?.drinks).toBe(0)
    expect(m.effects).toEqual([])
    expect(m.turnPlayerId).toBe('a')
    const settled = model(after)
    expect(settled.players.find((p) => p.id === 'c')?.drinks).toBe(5)
    expect(settled.effects.map((e) => e.kind)).toEqual(['curse'])
    expect(settled.turnCount).toBe(3)
  })

  it('icônes du téléphone, initiale sinon ; Soft transmis', () => {
    const m = model(state, {}, softTexts)
    expect(m.players.map((p) => p.icon)).toEqual(['🦊', null, null])
    expect(m.soft).toBe(true)
  })
})

describe('dé TV d’une partie locale — calé sur le téléphone', () => {
  const cue = (s: PetitBuveurCastState) => {
    const c = castCues(s)
    return { key: c.diceKey, value: c.dice, phase: c.dicePhase }
  }
  const rolling = (seq: number): PetitBuveurCastState => ({ ...state, dice: { value: 0, seq, phase: 'rolling' } })
  const shown = (seq: number, value: number): PetitBuveurCastState => ({ ...state, dice: { value, seq, phase: 'result' } })

  it('au montage, rien ne se rejoue et le lanceur reste inconnu', () => {
    const init = castDiceInitial(cue(shown(5, 3)), LOCAL_DICE_RESULT_MS)
    expect(init.phase).toBe('done')
    expect(init.actorId).toBeNull()
    expect(castDiceOnCue(init, cue(shown(5, 3)), 'a', LOCAL_DICE_RESULT_MS)).toBe(init)
  })

  it('roule tant que le téléphone roule, sans valeur ; puis la tient autant que lui', () => {
    const init = castDiceInitial(cue(state), LOCAL_DICE_RESULT_MS)
    const roll = castDiceOnCue(init, cue(rolling(200)), 'a', LOCAL_DICE_RESULT_MS)
    expect(roll).toMatchObject({ phase: 'rolling', following: true, actorId: 'a' })
    // Aucun minuteur ne fait apparaître de valeur : seul le téléphone la donne.
    expect(castDiceStep(roll)).toEqual({ ms: TV_CAST_ROLLING_MAX_MS, phase: 'done' })
    expect(castDiceOnCue(roll, cue(rolling(200)), 'a', LOCAL_DICE_RESULT_MS)).toBe(roll)
    const result = castDiceOnCue(roll, cue(shown(200, 6)), 'a', LOCAL_DICE_RESULT_MS)
    expect(result).toMatchObject({ phase: 'result', value: 6, following: false })
    expect(castDiceStep(result)).toEqual({ ms: LOCAL_DICE_RESULT_MS, phase: 'done' })
  })

  it('résultat reçu sans « roule » (états fusionnés) : montré tout de suite', () => {
    const init = castDiceInitial(cue(state), LOCAL_DICE_RESULT_MS)
    expect(castDiceOnCue(init, cue(shown(300, 2)), 'b', LOCAL_DICE_RESULT_MS)).toMatchObject({
      phase: 'result',
      value: 2,
      actorId: 'b',
    })
  })

  it('ancien téléphone (dé poussé au début) : la séquence minutée d’origine', () => {
    const init = castDiceInitial(cue(state), LOCAL_DICE_RESULT_MS)
    const legacy: PetitBuveurCastState = { ...state, dice: { value: 4, seq: 400 } }
    const show = castDiceOnCue(init, cue(legacy), 'a', LOCAL_DICE_RESULT_MS)
    expect(show).toMatchObject({ phase: 'rolling', following: false, value: 4 })
    expect(castDiceStep(show)).toEqual({ ms: TV_DICE_ROLL_MS, phase: 'result' })
  })
})

describe('castEffects — payload filtré', () => {
  it('écarte un genre inconnu, un joueur absent, un partenaire inconnu, des tours épuisés', () => {
    const effects = castEffects({
      players: state.players,
      effects: [
        { kind: 'chain', playerId: 'a', partnerId: 'b', remaining: 4 },
        { kind: 'mirror', playerId: 'b', partnerId: 'zz', remaining: 1 },
        { kind: 'curse', playerId: 'zz', remaining: 2 },
        { kind: 'bogus' as 'curse', playerId: 'a', remaining: 2 },
        { kind: 'protection', playerId: 'c', remaining: 0 },
      ],
    })
    expect(effects).toEqual([
      { id: 'chain-a', kind: 'chain', playerId: 'a', partnerId: 'b', remaining: 4 },
      { id: 'mirror-b', kind: 'mirror', playerId: 'b', remaining: 1 },
    ])
  })
})
