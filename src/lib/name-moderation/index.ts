import {
  compactForModeration,
  normalizeForModeration,
  tokenizeForModeration,
} from './normalize'
import { getPreparedTerms } from './prepared-terms'
import { getModerationErrorMessage } from './messages'

export type NameModerationReason =
  | 'empty'
  | 'too_long'
  | 'invalid_characters'
  | 'profanity'

export type NameModerationResult =
  | { ok: true; value: string }
  | { ok: false; reason: NameModerationReason }

/** Lettres Unicode (accents), chiffres et espaces uniquement — pseudos compte. */
const ACCOUNT_CHARS_RE = /^[\p{L}\p{N}\s]+$/u

/** Joueurs locaux : lettres, chiffres, espaces, tiret, apostrophe. */
const PLAYER_CHARS_RE = /^[\p{L}\p{N}\s'\-]+$/u

export function containsProfanity(name: string): boolean {
  const tokens = tokenizeForModeration(name)
  const compact = compactForModeration(name)

  if (!compact) return false

  for (const { compact: term } of getPreparedTerms()) {
    if (!term) continue

    if (term.length <= 3) {
      if (compact === term) return true
      if (tokens.some((token) => token === term)) return true
      continue
    }

    if (compact.includes(term)) return true
  }

  return false
}

export function validateAccountDisplayName(
  name: string,
  maxLength = 30
): NameModerationResult {
  const trimmed = name.trim()

  if (!trimmed) return { ok: false, reason: 'empty' }
  if (trimmed.length > maxLength) return { ok: false, reason: 'too_long' }
  if (!ACCOUNT_CHARS_RE.test(trimmed)) return { ok: false, reason: 'invalid_characters' }
  if (containsProfanity(trimmed)) return { ok: false, reason: 'profanity' }

  return { ok: true, value: trimmed }
}

export function validateLocalPlayerName(
  name: string,
  maxLength = 40
): NameModerationResult {
  const trimmed = name.trim()

  if (!trimmed) return { ok: false, reason: 'empty' }
  if (trimmed.length > maxLength) return { ok: false, reason: 'too_long' }
  if (!PLAYER_CHARS_RE.test(trimmed)) return { ok: false, reason: 'invalid_characters' }
  if (containsProfanity(trimmed)) return { ok: false, reason: 'profanity' }

  return { ok: true, value: trimmed }
}

export const NAME_MODERATION_ERROR_CODES = {
  empty: 'NAME_EMPTY',
  too_long: 'NAME_TOO_LONG',
  invalid_characters: 'NAME_INVALID_CHARACTERS',
  profanity: 'NAME_PROFANITY',
} as const

export type NameModerationErrorCode =
  (typeof NAME_MODERATION_ERROR_CODES)[NameModerationReason]

export function moderationErrorCode(
  reason: NameModerationReason
): NameModerationErrorCode {
  return NAME_MODERATION_ERROR_CODES[reason]
}

/** Fallback FR — préférer getModerationErrorMessage avec locale explicite. */
export function moderationErrorMessage(reason: NameModerationReason): string {
  return getModerationErrorMessage(reason, 'fr', 'account')
}

export function nameValidationI18nKey(
  reason: NameModerationReason
): 'empty' | 'tooLong' | 'invalidCharacters' | 'profanity' {
  switch (reason) {
    case 'empty':
      return 'empty'
    case 'too_long':
      return 'tooLong'
    case 'invalid_characters':
      return 'invalidCharacters'
    case 'profanity':
      return 'profanity'
  }
}

export { getModerationErrorMessage } from './messages'
export { normalizeForModeration, compactForModeration, tokenizeForModeration }
