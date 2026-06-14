import type { Case, CaseType, PetitBuveurT } from './case-config'

/** Case data persisted in game state — descriptions are derived at render time. */
export type StoredCase = {
  type: CaseType
  effect: number
  defiChallenge?: string
  gorgéeCulSec?: boolean
}

export type EffectOutcome =
  | { type: 'caseBase' }
  | {
      type: 'i18n'
      key: string
      params?: Record<string, string | number>
      htmlParams?: Record<string, string>
      playerRefs?: Record<string, string>
    }
  | { type: 'compose'; items: EffectOutcome[]; separator?: string }

export type CaseNotificationState = {
  case: StoredCase
  outcome: EffectOutcome
  duelPrefix?: boolean
  targetPlayerId?: string | null
  includeEffectsSummary?: boolean
  randomMessageIndex?: number
  complimentIndex?: number
  debMessageIndex?: number
}

export type StoredLastAction = {
  turnNumber: number
  actorId: string
  caseType: CaseType
  outcome: EffectOutcome
  targetId: string | null
  duelPrefix?: boolean
  includeEffectsSummary?: boolean
}

export type NotificationBuildContext = {
  t: PetitBuveurT
  players: { id: string; name: string; preferences?: unknown; position?: number; linkedTo?: string; cursed?: number; linkedTurns?: number }[]
  formatPlayerNameHtml: (player: { id: string; name: string; preferences?: unknown }, opts?: { compliment?: string }) => string
  effectsSummaryHtml: string
  duelNoteHtml?: string
  randomMessages?: string[]
  debMessages?: string[]
  compliments?: string[]
}

export function toStoredCase(c: Case): StoredCase {
  return {
    type: c.type,
    effect: c.effect,
    defiChallenge: c.defiChallenge,
    gorgéeCulSec: c.gorgéeCulSec,
  }
}

export function formatCaseDescription(c: StoredCase | Case, t: PetitBuveurT): string {
  const stored = toStoredCase(c as Case)

  if (stored.type === 'defi' && stored.defiChallenge) {
    return t('caseDescriptions.defi', { challenge: stored.defiChallenge, count: stored.effect })
  }
  if (stored.type === 'gorgée' && stored.gorgéeCulSec) {
    return t('caseDescriptions.gorgéeCulSec')
  }

  switch (stored.type) {
    case 'gorgée':
      return t('caseDescriptions.gorgée', { count: stored.effect })
    case 'avance':
      return t('caseDescriptions.avance', { count: stored.effect })
    case 'tous':
      return t('caseDescriptions.tous', { count: stored.effect })
    case 'double-peine':
      return t('caseDescriptions.double-peine', { count: stored.effect })
    case 'question':
      return t('caseDescriptions.question', { count: stored.effect })
    case 'vote':
      return t('caseDescriptions.vote', { count: stored.effect })
    case 'inversion':
      return t('caseDescriptions.inversion', { count: stored.effect })
    default:
      return t(`caseDescriptions.${stored.type}`)
  }
}

function tWithHtml(
  t: PetitBuveurT,
  key: string,
  html: Record<string, string>,
  plain?: Record<string, string | number>
): string {
  const placeholders = Object.fromEntries(Object.keys(html).map(k => [k, `__HTML_${k}__`]))
  let result = t(key, { ...plain, ...placeholders })
  for (const [k, v] of Object.entries(html)) {
    result = result.replaceAll(`__HTML_${k}__`, v)
  }
  return result
}

function resolvePlayerRefs(
  outcome: Extract<EffectOutcome, { type: 'i18n' }>,
  ctx: NotificationBuildContext
): { htmlParams?: Record<string, string>; params?: Record<string, string | number> } {
  if (!outcome.playerRefs) {
    return { htmlParams: outcome.htmlParams, params: outcome.params }
  }

  const htmlParams = { ...(outcome.htmlParams ?? {}) }
  const params = { ...(outcome.params ?? {}) }

  for (const [paramName, playerId] of Object.entries(outcome.playerRefs)) {
    const player = ctx.players.find(p => p.id === playerId)
    if (!player) continue
    htmlParams[paramName] = ctx.formatPlayerNameHtml(player)
  }

  return { htmlParams: Object.keys(htmlParams).length ? htmlParams : undefined, params }
}

export function resolveOutcomeHtml(outcome: EffectOutcome, ctx: NotificationBuildContext): string {
  const { t } = ctx

  switch (outcome.type) {
    case 'caseBase':
      return ''
    case 'i18n': {
      if (outcome.key === '__legacy__' && outcome.htmlParams?.body) {
        return outcome.htmlParams.body
      }
      const { htmlParams, params } = resolvePlayerRefs(outcome, ctx)
      if (htmlParams && Object.keys(htmlParams).length > 0) {
        return tWithHtml(t, outcome.key, htmlParams, params)
      }
      return t(outcome.key, params)
    }
    case 'compose':
      return outcome.items
        .map(item => resolveOutcomeHtml(item, ctx))
        .filter(Boolean)
        .join(outcome.separator ?? '\n\n')
    default:
      return ''
  }
}

export function buildNotificationHtml(
  state: CaseNotificationState,
  ctx: NotificationBuildContext
): string {
  const parts: string[] = []

  if (state.duelPrefix && ctx.duelNoteHtml) {
    parts.push(ctx.duelNoteHtml)
  }

  const outcomeHtml = resolveOutcomeHtml(state.outcome, ctx)
  const needsCaseDesc =
    state.outcome.type === 'caseBase' ||
    (state.outcome.type === 'compose' &&
      state.outcome.items.some(i => i.type === 'caseBase'))

  if (needsCaseDesc || (!outcomeHtml && state.outcome.type !== 'i18n')) {
    parts.push(formatCaseDescription(state.case, ctx.t))
  }
  if (outcomeHtml) {
    parts.push(outcomeHtml)
  }

  if (state.randomMessageIndex != null && ctx.randomMessages?.length) {
    const msg = ctx.randomMessages[state.randomMessageIndex % ctx.randomMessages.length]
    parts.push(`<span class="italic text-sm">${msg}</span>`)
  }

  if (state.includeEffectsSummary !== false) {
    parts.push(ctx.effectsSummaryHtml)
  }

  return parts.filter(Boolean).join('\n\n')
}

export function buildLastActionHtml(
  stored: StoredLastAction,
  ctx: NotificationBuildContext
): string {
  return buildNotificationHtml(
    {
      case: { type: stored.caseType, effect: 0 },
      outcome: stored.outcome,
      duelPrefix: stored.duelPrefix,
      includeEffectsSummary: stored.includeEffectsSummary ?? false,
    },
    ctx
  )
}

export function normalizeStoredCase(raw: Case | StoredCase): StoredCase {
  return {
    type: raw.type,
    effect: raw.effect,
    defiChallenge: raw.defiChallenge,
    gorgéeCulSec: raw.gorgéeCulSec,
  }
}

export function normalizeSavedCase(raw: Case | StoredCase | null): Case | null {
  if (!raw) return null
  return normalizeStoredCase(raw)
}

export function outcomeFromLegacyHtml(html: string): EffectOutcome {
  return { type: 'i18n', key: '__legacy__', htmlParams: { body: html } }
}

export function protectedBadgeHtml(t: PetitBuveurT): string {
  return `<span class="bg-blue-500 text-white px-2 py-1 rounded-md font-bold">${t('game.effects.protected')}</span>`
}
