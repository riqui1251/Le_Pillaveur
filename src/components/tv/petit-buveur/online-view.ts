import type { LastOutcome } from '@/lib/petit-buveur/engine'
import type { EngineCase } from '@/lib/petit-buveur/types'
import { getCaseMeta } from '@/lib/petit-buveur/case-families'
import { PLAYER_ICONS } from '@/lib/players'
import { botAvatarFromName } from '@/lib/online/bot-personas'
import type { TvRoomDto } from '@/lib/online-room'
import { ALCOHOL_DEFI_INDEXES } from '@/app/[locale]/games/petit-buveur/ambiance'
import type { PetitBuveurT } from '@/app/[locale]/games/petit-buveur/case-config'
import { ONLINE_REPLACE_GRACE_MS } from '@/lib/online/replacement'
import {
  caseDescription,
  deciderIdOf,
  defiTextAt,
  landingIndex,
  noteMessage,
  outcomeSignature,
  shownDrinks,
  type EngineView,
} from '@/components/online/petit-buveur/view-helpers'
import { engineEffects, type TvPbCard, type TvPbPending, type TvPbPlayer, type TvPbScreenModel } from './model'

/**
 * Textes de l'écran TV d'une partie EN LIGNE, tirés de l'état du moteur avec
 * les mêmes règles que PetitBuveurOnline (titre de case, défi, notes…).
 * `t` : traducteur `games.petit-buveur` déjà passé par withAmbiance ; `base`
 * : le même sans ambiance (liste brute des défis).
 */
export type PbTexts = { t: PetitBuveurT; base: PetitBuveurT; soft: boolean }

/** Icône d'un joueur comme sur les téléphones : portrait du bot, icône du compte, sinon icône stable par rang. */
export function onlineIconOf(view: Pick<EngineView, 'players'>, members: TvRoomDto['members'], id: string): string {
  const index = Math.max(0, view.players.findIndex((p) => p.id === id))
  const player = view.players[index]
  if (player?.id === id && player.isBot) return botAvatarFromName(player.name)
  return members.find((m) => m.userId === id)?.preferences?.icon ?? PLAYER_ICONS[index % PLAYER_ICONS.length]
}

function caseLabel(texts: PbTexts, type: string): string {
  return texts.t(`caseTypes.${type}`)
}

export function defiText(texts: PbTexts, index: number | undefined): string | null {
  if (typeof index !== 'number') return null
  const softList =
    texts.soft && texts.base.has?.('soft.defis') ? (texts.base.raw('soft.defis') as { text: string }[]) : null
  return (
    defiTextAt(
      (texts.base.raw('defis') as { text: string }[]) ?? [],
      softList,
      ALCOHOL_DEFI_INDEXES,
      index,
      texts.soft
    ) ?? null
  )
}

export function outcomeTitle(texts: PbTexts, outcome: LastOutcome): string {
  if (outcome.effectiveCase) {
    return `${caseLabel(texts, outcome.caseType)} → ${caseLabel(texts, outcome.effectiveCase.type)}`
  }
  if (outcome.cases?.length) {
    return `${caseLabel(texts, outcome.caseType)} (${outcome.cases.map((c) => caseLabel(texts, c.type)).join(' + ')})`
  }
  return caseLabel(texts, outcome.caseType)
}

/** Verdict du défi, choix Chance, notes du moteur — les lignes sous les pastilles du téléphone. */
export function outcomeLines(texts: PbTexts, outcome: LastOutcome, nameOf: (id: string | null | undefined) => string): string[] {
  const lines: string[] = []
  if (outcome.succeeded === true) {
    lines.push(texts.t('game.outcomes.challengeSuccess', { player: nameOf(outcome.targetId) }))
  }
  if (outcome.chanceChoice === 'reroll') lines.push(texts.t('game.dialogs.chanceReroll'))
  if (outcome.chanceChoice === 'plus2') lines.push(texts.t('game.dialogs.chanceAdvance'))
  for (const n of outcome.notes ?? []) {
    const msg = noteMessage(n, (id) => nameOf(id), outcome.actorId)
    lines.push(texts.t(msg.key, msg.values))
  }
  return lines
}

/**
 * Carte de la dernière case jouée, telle que le téléphone la retourne. Le
 * QUAND (pion posé, pas de choix en attente, spectacle fini) reste à
 * l'appelant ; ici, seulement QUOI.
 */
export function onlineCard(view: EngineView, texts: PbTexts): TvPbCard | null {
  const last = view.lastCase
  if (!last) return null
  const nameOf = (id: string | null | undefined) => view.players.find((p) => p.id === id)?.name ?? ''
  const outcome = view.lastOutcome && view.lastOutcome.caseType === last.type ? view.lastOutcome : null
  // Consigne de la case jouée (celle rejouée par Répétition / Rewind), défi compris — comme le téléphone.
  const shownCase: EngineCase = outcome?.effectiveCase ?? last
  const lines = outcome ? outcomeLines(texts, outcome, nameOf) : []
  const family = getCaseMeta(last.type).family
  const landing = outcome ? landingIndex(view.players, outcome) : null
  return {
    key: outcomeSignature(view) || `${view.turnCount}:${last.type}:${view.lastDice ?? ''}`,
    caseType: last.type,
    title: outcome ? outcomeTitle(texts, outcome) : caseLabel(texts, last.type),
    caseNumber: landing != null ? landing + 1 : null,
    dice: view.lastDice ?? null,
    detail: shownCase.type === 'normal' ? null : caseDescription(shownCase, texts.t, (i) => defiText(texts, i)),
    changes: outcome ? outcome.changes : [],
    lines,
    targetId: outcome?.targetId ?? null,
    nothing:
      outcome !== null && outcome.changes.length === 0 && lines.length === 0 && family !== 'neutral' && family !== 'bonus',
  }
}

/** Case en attente d'une décision, comme l'encadré public du téléphone (qui décide, quoi). */
export function onlinePending(view: EngineView, texts: PbTexts): TvPbPending | null {
  const pending = view.pending
  if (!pending) return null
  const nameOf = (id: string | null | undefined) => view.players.find((p) => p.id === id)?.name ?? ''
  // Cible choisie à l'aveugle : comme la diffusion du jeu local, la case reste cachée.
  if (pending.hidden) {
    return {
      caseType: 'target',
      icon: '🎯',
      title: texts.t('game.target.title'),
      detail: texts.t('game.target.hint'),
      targetId: null,
      waiting: { kind: 'choice', name: nameOf(deciderIdOf(view)) },
    }
  }
  const pendingCase = pending.case ?? view.lastCase ?? null
  const title =
    pending.caseType === 'double-case' && pending.cases?.length
      ? `${caseLabel(texts, 'double-case')} (${pending.cases.map((c) => caseLabel(texts, c.type)).join(' + ')})`
      : pending.via
        ? `${caseLabel(texts, pending.via)} → ${caseLabel(texts, pending.caseType)}`
        : caseLabel(texts, pending.caseType)
  const detail = pendingCase ? caseDescription(pendingCase, texts.t, (i) => defiText(texts, i)) : null
  const waiting: TvPbPending['waiting'] =
    pending.stage === 'side'
      ? { kind: 'side', name: nameOf(pending.targetId), deadlineAt: typeof pending.deadlineAt === 'number' ? pending.deadlineAt : null }
      : pending.stage === 'verdict'
        ? { kind: 'verdict', judge: nameOf(pending.playerId), target: nameOf(pending.targetId) }
        : { kind: 'choice', name: nameOf(deciderIdOf(view)) }
  return {
    caseType: pending.caseType,
    title,
    detail,
    targetId: pending.targetId ?? null,
    waiting,
  }
}

/** Où en est la mise en scène à la TV (dé, spectacle, pions), au moment du rendu. */
export type OnlineSequence = {
  diceActive: boolean
  /** Le dé roule encore : sa valeur n'est pas lue sur le téléphone qui lance. */
  diceRolling: boolean
  spectacleActive: boolean
  board: {
    positions: Record<string, number>
    animating: boolean
    caseRevealed: boolean
    effectPending: boolean
    animatedActorId: string | null
  }
}

/**
 * Modèle de l'écran TV pour un état du moteur : QUOI montrer (comme le
 * téléphone) et surtout QUAND. La carte attend que le pion soit posé, que le
 * dé soit lu et que le spectacle soit fini ; l'encadré « en attente » attend
 * que tout soit posé ; les gorgées d'un effet pas encore joué sont retenues.
 */
export function onlineScreenModel(
  view: EngineView,
  members: TvRoomDto['members'],
  texts: PbTexts,
  seq: OnlineSequence,
  roll: { actorId: string; value: number } | null
): TvPbScreenModel {
  const finished = view.phase === 'finished' || Boolean(view.winner)
  const settled = !seq.diceActive && !seq.spectacleActive && !seq.board.animating
  const drinksById = shownDrinks(
    view.players,
    seq.board.effectPending || seq.spectacleActive ? view.lastOutcome : null
  )
  const players: TvPbPlayer[] = view.players.map((p, index) => ({
    id: p.id,
    name: p.name,
    index,
    icon: onlineIconOf(view, members, p.id),
    position: seq.board.positions[p.id] ?? p.position,
    drinks: drinksById[p.id] ?? p.drinks,
  }))
  const cardVisible =
    Boolean(view.lastCase) && !view.pending && seq.board.caseRevealed && !seq.spectacleActive && !seq.diceActive
  const card = cardVisible ? onlineCard(view, texts) : null
  const pending = view.pending && settled && !finished ? onlinePending(view, texts) : null
  // Sous l'overlay du dé, la carte reste visible : pas de valeur tant qu'il roule.
  const rolling = roll && !seq.diceRolling && !card && !pending && (seq.diceActive || seq.board.animating)
  const active = view.players[view.currentPlayer] ?? null
  return {
    players,
    turnPlayerId: seq.board.animatedActorId ?? active?.id ?? null,
    turnCount: view.turnCount ?? null,
    effects: engineEffects(view.players),
    card,
    pending,
    roll: rolling && roll ? { playerId: roll.actorId, value: roll.value } : null,
    waitingName: finished ? null : (view.players.find((p) => p.id === deciderIdOf(view))?.name ?? null),
    absents: finished
      ? []
      : view.players
          .filter((p) => !p.isBot && p.leftAt)
          .map((p) => ({ name: p.name, endsAt: (p.leftAt ?? 0) + ONLINE_REPLACE_GRACE_MS })),
    soft: texts.soft,
  }
}
