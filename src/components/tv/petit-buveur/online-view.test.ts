import { describe, expect, it } from 'vitest'
import { createTranslator } from 'next-intl'
import fr from '../../../../messages/fr.json'
import { autoAction, createInitialState, reduce, type EngineState } from '@/lib/petit-buveur/engine'
import { toClientView } from '@/lib/petit-buveur/server-adapter'
import { withAmbiance } from '@/app/[locale]/games/petit-buveur/ambiance'
import type { PetitBuveurT } from '@/app/[locale]/games/petit-buveur/case-config'
import { onlineRollCue } from '../petit-buveur-cues'
import { onlineScreenModel, type OnlineSequence, type PbTexts } from './online-view'

const base = createTranslator({ locale: 'fr', messages: fr, namespace: 'games.petit-buveur' }) as unknown as PetitBuveurT
const texts: PbTexts = { t: base, base, soft: false }
const softTexts: PbTexts = { t: withAmbiance(base, 'soft'), base, soft: true }
const settings = { difficulty: 'normal' as const, defiDrinks: Array.from({ length: 60 }, () => 2) }

function playUntil(pred: (s: EngineState, prev: EngineState) => boolean): { prev: EngineState; s: EngineState } {
  for (let seed = 1; seed <= 30; seed += 1) {
    let s = createInitialState(
      ['Léa', 'Jean-Baptiste', 'Marie-Charlotte', 'Hugo', 'Nora'].map((name, i) => ({ id: `u${i + 1}`, name })),
      settings,
      `online-view-${seed}`
    )
    for (let i = 0; i < 400 && s.phase !== 'finished'; i += 1) {
      const prev = s
      const n = autoAction(s)
      s = reduce(n.state, n.action)
      if (pred(s, prev)) return { prev, s }
    }
  }
  throw new Error('situation introuvable')
}

const settledBoard = (s: EngineState): OnlineSequence['board'] => ({
  positions: Object.fromEntries(s.players.map((p) => [p.id, p.position])),
  animating: false,
  caseRevealed: true,
  effectPending: false,
  animatedActorId: null,
})

describe('onlineScreenModel — rien avant le téléphone', () => {
  it('lancer à case d’office : pendant le dé, ni carte ni gorgées de l’effet, le lanceur reste au tour', () => {
    const { prev, s } = playUntil(
      (x) => typeof x.lastOutcome?.diceLanding === 'number' && x.lastOutcome.changes.some((c) => c.drinks > 0) && !x.pending
    )
    const view = toClientView(s)
    const actor = s.lastOutcome!.actorId
    const walkingBoard: OnlineSequence['board'] = {
      positions: Object.fromEntries(prev.players.map((p) => [p.id, p.position])),
      animating: true,
      caseRevealed: false,
      effectPending: true,
      animatedActorId: actor,
    }
    const during = onlineScreenModel(
      view,
      [],
      texts,
      { diceActive: true, diceRolling: true, spectacleActive: false, board: walkingBoard },
      onlineRollCue(view)
    )
    expect(during.card).toBeNull()
    // Sous l'overlay translucide du dé, la carte ne donne pas la valeur avant le téléphone qui lance.
    expect(during.roll).toBeNull()
    expect(during.turnPlayerId).toBe(actor)
    const read = onlineScreenModel(
      view,
      [],
      texts,
      { diceActive: true, diceRolling: false, spectacleActive: false, board: walkingBoard },
      onlineRollCue(view)
    )
    expect(read.roll?.value).toBe(s.lastDice)
    expect(read.card).toBeNull()
    for (const c of s.lastOutcome!.changes) {
      const shown = during.players.find((p) => p.id === c.playerId)!
      expect(shown.drinks).toBe(s.players.find((p) => p.id === c.playerId)!.drinks - c.drinks)
    }
    const after = onlineScreenModel(view, [], texts, { diceActive: false, diceRolling: false, spectacleActive: false, board: settledBoard(s) }, null)
    expect(after.card?.caseType).toBe(s.lastCase!.type)
  })

  it('lancer vers une case à choix : l’encadré « en attente » attend que le pion soit posé', () => {
    const { s } = playUntil((x) => x.phase === 'awaiting-interaction' && Boolean(x.pending?.needsTarget) && !x.pending?.stage)
    const view = toClientView(s)
    const walking = onlineScreenModel(view, [], texts, {
      diceActive: false,
      diceRolling: false,
      spectacleActive: false,
      board: { ...settledBoard(s), animating: true },
    }, onlineRollCue(view))
    expect(walking.pending).toBeNull()
    expect(walking.card).toBeNull()
    expect(walking.roll?.value).toBe(s.lastDice)
    const landed = onlineScreenModel(view, [], texts, { diceActive: false, diceRolling: false, spectacleActive: false, board: settledBoard(s) }, null)
    expect(landed.pending?.waiting).toEqual({ kind: 'choice', name: s.players[s.currentPlayer].name })
  })

  it('cible choisie à l’aveugle : la TV montre « Qui cibler ? », pas la case (comme la diffusion locale)', () => {
    const { s } = playUntil((x) => Boolean(x.pending?.needsTarget) && !x.pending?.stage)
    const model = onlineScreenModel(toClientView(s), [], texts, { diceActive: false, diceRolling: false, spectacleActive: false, board: settledBoard(s) }, null)
    expect(model.pending).toMatchObject({
      caseType: 'target',
      icon: '🎯',
      title: 'Qui cibler ?',
      detail: "L'effet de la case sera révélé après ton choix",
    })
    expect(JSON.stringify(model)).not.toContain(base(`caseTypes.${s.pending!.case!.type}`))
  })

  it('carte de la case jouée : sa consigne, comme au téléphone', () => {
    const { s } = playUntil((x) => !x.pending && x.lastCase?.type === 'bombe' && Boolean(x.lastOutcome))
    const model = onlineScreenModel(toClientView(s), [], texts, { diceActive: false, diceRolling: false, spectacleActive: false, board: settledBoard(s) }, null)
    expect(model.card?.detail).toBe(base('caseDescriptions.bombe'))
  })

  it('roue : sous le spectacle, la carte et les gorgées tirées restent cachées', () => {
    const { s } = playUntil((x) => x.lastInteraction?.kind === 'roue' && x.lastInteraction.drinks > 0)
    const view = toClientView(s)
    const spinning = onlineScreenModel(view, [], texts, { diceActive: false, diceRolling: false, spectacleActive: true, board: settledBoard(s) }, null)
    expect(spinning.card).toBeNull()
    const actor = s.players.find((p) => p.id === s.lastInteraction!.actorId)!
    const drunk = s.lastInteraction!.kind === 'roue' ? s.lastInteraction!.drinks : 0
    expect(spinning.players.find((p) => p.id === actor.id)!.drinks).toBe(actor.drinks - drunk)
    const done = onlineScreenModel(view, [], texts, { diceActive: false, diceRolling: false, spectacleActive: false, board: settledBoard(s) }, null)
    expect(done.card?.changes.some((c) => c.playerId === actor.id && c.drinks === drunk)).toBe(true)
  })

  it('verdict d’un défi : le texte du défi et qui arbitre qui', () => {
    const { s } = playUntil((x) => x.pending?.stage === 'verdict' && x.pending.case?.type === 'defi')
    const model = onlineScreenModel(toClientView(s), [], texts, { diceActive: false, diceRolling: false, spectacleActive: false, board: settledBoard(s) }, null)
    expect(model.pending?.detail).toMatch(/^Défi : /)
    expect(model.pending?.waiting).toMatchObject({ kind: 'verdict' })
  })

  it('en Soft, les titres de case parlent de gages', () => {
    const { s } = playUntil((x) => !x.pending && x.lastCase?.type === 'gorgée' && Boolean(x.lastOutcome))
    const model = onlineScreenModel(toClientView(s), [], softTexts, { diceActive: false, diceRolling: false, spectacleActive: false, board: settledBoard(s) }, null)
    expect(model.card?.title).toBe('Gages')
    expect(model.soft).toBe(true)
  })

  it('icône des joueurs comme sur les téléphones : celle du compte', () => {
    const { s } = playUntil((x) => x.turnCount >= 2)
    const members = [{ userId: 'u2', displayName: 'Jean-Baptiste', isHost: false, isReady: true, preferences: { icon: '🦊' }, level: 0, role: 'user' }] as never
    const model = onlineScreenModel(toClientView(s), members, texts, { diceActive: false, diceRolling: false, spectacleActive: false, board: settledBoard(s) }, null)
    expect(model.players.find((p) => p.id === 'u2')?.icon).toBe('🦊')
  })
})
