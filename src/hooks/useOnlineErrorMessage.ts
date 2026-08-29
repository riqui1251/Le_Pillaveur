"use client"

import { useTranslations } from 'next-intl'

import { resolveOnlineErrorCode } from '@/lib/online-errors'

/**
 * Traduit un code d'erreur des routes /api/online (namespace onlineLobby.errors).
 * Les valeurs inconnues (anciens textes FR, messages bruts) sont affichées telles quelles.
 */
export function useOnlineErrorMessage(error: string | null): string | null {
  const t = useTranslations('onlineLobby.errors')
  if (!error) return null
  const code = resolveOnlineErrorCode(error)
  return code ? t(code) : error
}
