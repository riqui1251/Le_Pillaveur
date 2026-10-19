import type { PetitBuveurCastStage, PetitBuveurCastState } from '@/lib/cast-types'
import { castRevealIsCurrent, type TvCastCues } from '../petit-buveur-cues'
import type { TvPbCard, TvPbChange, TvPbEffect, TvPbEffectKind, TvPbPending, TvPbPlayer, TvPbScreenModel } from './model'
import type { PbTexts } from './online-view'

/**
 * Écran TV d'une partie LOCALE diffusée, tiré de ce que pousse le téléphone
 * (PetitBuveurCastState). Le payload vient d'un autre appareil : tout est
 * filtré avant affichage, et toujours rendu en texte.
 */

const EFFECT_KINDS: readonly TvPbEffectKind[] = ['protection', 'curse', 'chain', 'skip', 'anchor', 'mirror']
const BOARD_SIZE = 30
const MAX_LINES = 8
const MAX_TEXT = 280
const MAX_ICON = 32

function cleanText(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const text = value.trim()
  return text ? text.slice(0, MAX_TEXT) : null
}

function cleanInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : null
}

function isDie(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 6
}

function hasMessage(texts: PbTexts, key: string): boolean {
  return texts.base.has?.(key) !== false
}

function caseLabel(texts: PbTexts, type: string): string {
  return hasMessage(texts, `caseTypes.${type}`) ? texts.t(`caseTypes.${type}`) : type
}

function caseDescription(texts: PbTexts, type: string, effect: number | null): string | null {
  const key = `caseDescriptions.${type}`
  if (type === 'defi' || !hasMessage(texts, key)) return null
  return texts.t(key, { count: effect ?? 1 })
}

/** Effets en cours poussés par le téléphone (liste « Effets en cours »). */
export function castEffects(state: Pick<PetitBuveurCastState, 'effects' | 'players'>): TvPbEffect[] {
  if (!Array.isArray(state.effects)) return []
  const ids = new Set(state.players.map((p) => p.id))
  const out: TvPbEffect[] = []
  for (const e of state.effects) {
    if (!e || !EFFECT_KINDS.includes(e.kind) || !ids.has(e.playerId)) continue
    const remaining = cleanInt(e.remaining)
    if (remaining === null || remaining < 1) continue
    out.push({
      id: `${e.kind}-${e.playerId}`,
      kind: e.kind,
      playerId: e.playerId,
      ...(typeof e.partnerId === 'string' && ids.has(e.partnerId) ? { partnerId: e.partnerId } : {}),
      remaining,
    })
  }
  return out
}

/** Ce que l'écran garde tel quel tant que le dé roule ou qu'un pion marche. */
export type CastHeld = {
  drinks: Record<string, number>
  effects: TvPbEffect[]
  currentPlayer: number
  turnCount: number | null
}

export function castHeld(state: PetitBuveurCastState): CastHeld {
  const turnCount = cleanInt(state.turnCount)
  return {
    drinks: Object.fromEntries(state.players.map((p) => [p.id, p.drinks])),
    effects: castEffects(state),
    currentPlayer: state.currentPlayer,
    turnCount: turnCount !== null && turnCount >= 1 ? turnCount : null,
  }
}

/** Carte de la dernière case : le titre de la case, son texte et ses pastilles, comme la fenêtre du téléphone. */
export function castCard(state: PetitBuveurCastState, cues: TvCastCues, texts: PbTexts): TvPbCard | null {
  const reveal = state.reveal
  if (!reveal || !cues.revealKey || !cues.caseType) return null
  const ids = new Set(state.players.map((p) => p.id))
  const changes: TvPbChange[] = Array.isArray(reveal.changes)
    ? reveal.changes
        .filter(
          (c) =>
            c &&
            ids.has(c.playerId) &&
            cleanInt(c.drinks) !== null &&
            cleanInt(c.from) !== null &&
            cleanInt(c.to) !== null
        )
        .map((c) => ({ playerId: c.playerId, drinks: Math.max(0, Math.trunc(c.drinks)), from: Math.trunc(c.from), to: Math.trunc(c.to) }))
    : []
  const lines = Array.isArray(reveal.lines)
    ? reveal.lines.map(cleanText).filter((l): l is string => l !== null).slice(0, MAX_LINES)
    : []
  const caseNumber = cleanInt(reveal.caseNumber)
  // Un téléphone d'avant ce champ ne disait pas quel dé : celui du tour, s'il y en a un — sauf un passe-tour,
  // qui n'en lance pas (le dé connu est alors celui du joueur précédent).
  const dice =
    'dice' in reveal
      ? isDie(reveal.dice)
        ? reveal.dice
        : null
      : cues.diceSeq !== null && cues.caseType !== 'passe-tour'
        ? cues.dice
        : null
  return {
    key: cues.revealKey,
    caseType: cues.caseType,
    title: caseLabel(texts, cues.caseType),
    caseNumber: caseNumber !== null && caseNumber >= 1 && caseNumber <= BOARD_SIZE ? caseNumber : null,
    dice,
    detail: cleanText(reveal.detail),
    changes,
    lines,
    nothing: false,
    targetId: typeof reveal.targetId === 'string' && ids.has(reveal.targetId) ? reveal.targetId : null,
  }
}

function stageStatus(
  stage: Extract<PetitBuveurCastStage, { kind: 'duel' | 'case' }>,
  rollingText: string
): TvPbPending['status'] {
  if (stage.rolling) return { text: rollingText, rolling: true }
  const result = cleanText(stage.result)
  if (!result) return null
  const die = stage.kind === 'case' && isDie(stage.die) ? stage.die : null
  return { text: result, rolling: false, die }
}

function rollingTextOf(texts: PbTexts, caseType: string): string {
  if (caseType === 'de-honte') return texts.t('game.dialogs.diceRolling')
  if (caseType === 'pile-face') return texts.t('game.dialogs.coinSpinning')
  return texts.t('game.wheel.spinning')
}

/**
 * Fenêtre du téléphone qui attend une décision : choix de cible et duel SANS
 * la case (le téléphone la garde cachée), fenêtre d'une case visible (roue,
 * chance, vote…) avec son tirage, ou verdict d'un défi.
 */
export function castPending(state: PetitBuveurCastState, cues: TvCastCues, texts: PbTexts): TvPbPending | null {
  const ids = new Set(state.players.map((p) => p.id))
  const nameOf = (id: string | null | undefined) => state.players.find((p) => p.id === id)?.name ?? ''
  const actorName = state.players[state.currentPlayer]?.name ?? ''
  const choice = { kind: 'choice' as const, name: actorName }
  const stage = state.stage
  if (stage?.kind === 'target') {
    return {
      caseType: 'target',
      icon: '🎯',
      title: texts.t('game.target.title'),
      detail: texts.t('game.target.hint'),
      targetId: null,
      waiting: choice,
    }
  }
  if (stage?.kind === 'duel') {
    const opponentId = typeof stage.opponentId === 'string' && ids.has(stage.opponentId) ? stage.opponentId : null
    return {
      caseType: 'duel',
      icon: '⚔️',
      title: texts.t('game.duel.title'),
      detail: opponentId ? texts.t('game.duel.vs', { a: actorName, b: nameOf(opponentId) }) : texts.t('game.duel.rules'),
      targetId: null,
      waiting: choice,
      status: stageStatus(stage, texts.t('game.duel.spinning')),
    }
  }
  if (stage?.kind === 'case' && typeof stage.caseType === 'string' && stage.caseType) {
    const targetId = typeof stage.targetId === 'string' && ids.has(stage.targetId) ? stage.targetId : null
    return {
      caseType: stage.caseType,
      title: caseLabel(texts, stage.caseType),
      detail: caseDescription(texts, stage.caseType, cleanInt(stage.effect)),
      targetId,
      waiting:
        stage.caseType === 'pile-face' && targetId
          ? { kind: 'side', name: nameOf(targetId), deadlineAt: null }
          : choice,
      status: stageStatus(stage, rollingTextOf(texts, stage.caseType)),
    }
  }
  const reveal = state.reveal
  if (reveal?.verdictPending === true && cues.caseType && castRevealIsCurrent(cues)) {
    const targetId = typeof reveal.targetId === 'string' && ids.has(reveal.targetId) ? reveal.targetId : null
    const firstLine = Array.isArray(reveal.lines) ? cleanText(reveal.lines[0]) : null
    return {
      caseType: cues.caseType,
      title: caseLabel(texts, cues.caseType),
      detail: cleanText(reveal.detail) ?? firstLine,
      targetId,
      waiting: { kind: 'verdict', judge: actorName, target: nameOf(targetId) },
    }
  }
  return null
}

/** Où en est la mise en scène à la TV, au moment du rendu. */
export type CastSequence = {
  /** Cases affichées : les pions marchent, le payload a déjà sauté. */
  positions: Record<string, number>
  /** Dé fini et pions arrivés. */
  settled: boolean
  /** Dernier lancer dont la TV a montré la valeur, avec son lanceur. */
  roll: { actorId: string; value: number } | null
  held: CastHeld
}

function cleanIcon(value: unknown): string | null {
  return typeof value === 'string' && value.trim() && value.length <= MAX_ICON ? value : null
}

/**
 * Modèle de l'écran : la fenêtre en attente ou la carte n'apparaissent qu'une
 * fois le pion posé à la TV ; gorgées, effets et tour restent ceux d'avant
 * tant qu'il marche (`held`), pour que rien n'annonce l'effet avant sa carte.
 */
export function castScreenModel(
  state: PetitBuveurCastState,
  cues: TvCastCues,
  texts: PbTexts,
  seq: CastSequence
): TvPbScreenModel {
  const finished = Boolean(state.winner) || state.phase === 'finished'
  const players: TvPbPlayer[] = state.players.map((p, index) => ({
    id: p.id,
    name: p.name,
    index,
    icon: cleanIcon(p.icon),
    position: seq.positions[p.id] ?? p.position,
    drinks: seq.held.drinks[p.id] ?? p.drinks,
  }))
  const turn = state.players[seq.held.currentPlayer] ?? state.players[state.currentPlayer] ?? null
  const pending = seq.settled && !finished ? castPending(state, cues, texts) : null
  // Téléphone d'avant `snapKey`/`stage` : il ne vide pas sa dernière carte sur « Rejouer ». Plateau revenu à
  // la case 1 hors fin de partie = partie neuve, la carte de l'ancienne n'a plus rien à dire.
  const staleLegacyCard =
    state.snapKey === undefined && state.stage === undefined && !finished && state.players.every((p) => p.position === 0)
  const card =
    seq.settled && !pending && !staleLegacyCard && castRevealIsCurrent(cues) ? castCard(state, cues, texts) : null
  const roll =
    !card && !pending && seq.roll && turn && seq.roll.actorId === turn.id
      ? { playerId: seq.roll.actorId, value: seq.roll.value }
      : null
  return {
    players,
    turnPlayerId: turn?.id ?? null,
    turnCount: seq.held.turnCount,
    effects: seq.held.effects,
    card,
    pending,
    roll,
    waitingName: finished ? null : (turn?.name ?? null),
    absents: [],
    soft: texts.soft,
  }
}
