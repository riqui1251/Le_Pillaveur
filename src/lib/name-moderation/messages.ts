import type { AppLocale } from '@/i18n/routing'
import { normalizeAppLocale } from '@/lib/locale-utils'
import type { NameModerationReason } from './index'
import frMessages from '../../../messages/fr.json'
import enMessages from '../../../messages/en.json'
import esMessages from '../../../messages/es.json'
import itMessages from '../../../messages/it.json'

type NameValidationMessages = {
  empty: string
  tooLong: string
  invalidCharacters: string
  invalidCharactersPlayer: string
  profanity: string
}

const MESSAGE_CATALOG: Record<AppLocale, NameValidationMessages> = {
  fr: frMessages.common.nameValidation,
  en: enMessages.common.nameValidation,
  es: esMessages.common.nameValidation,
  it: itMessages.common.nameValidation,
}

function messageKeyForReason(
  reason: NameModerationReason
): keyof Omit<NameValidationMessages, 'invalidCharactersPlayer'> {
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

export function getModerationErrorMessage(
  reason: NameModerationReason,
  locale: AppLocale | string | null | undefined,
  context: 'account' | 'player' = 'account'
): string {
  const messages = MESSAGE_CATALOG[normalizeAppLocale(locale)]
  if (reason === 'invalid_characters' && context === 'player') {
    return messages.invalidCharactersPlayer
  }
  return messages[messageKeyForReason(reason)]
}
