"use client"

import { useTranslations } from 'next-intl'
import type { PreSpeech } from '@/lib/president/engine'
import { BotSpeechFeed, type FeedPlayer } from '../bot-speech/BotSpeechFeed'
import type { LineTranslator } from '../bot-speech/bot-speech-feed'

/**
 * Fil des paroles du Président (téléphone et TV) : le fil commun aux jeux à
 * paroles (BotSpeechFeed), lu dans le catalogue du Président — le namespace
 * reste un littéral ici, comme l'exige le relevé des tranches de messages.
 * Seuls les bots parlent, avec les coups de la manche en cours (round =
 * manche) ; les remarques de fin de manche se lisent avec le classement.
 */
export function PresidentSpeechFeed({
  view,
  iconOf,
  meId,
  variant,
}: {
  view: { manche: number; speech?: readonly PreSpeech[]; players: readonly FeedPlayer[] }
  iconOf: (p: FeedPlayer) => string
  /** Spectateur local ; absent sur la TV (aucune bulle n'y est surlignée). */
  meId?: string | null
  variant: 'phone' | 'tv'
}) {
  const t = useTranslations('games.president.game')
  const tr: LineTranslator = {
    has: (key) => t.has(key),
    format: (key, values) => t(key, values),
  }

  return (
    <BotSpeechFeed
      speeches={view.speech ?? []}
      round={view.manche}
      players={view.players}
      iconOf={iconOf}
      meId={meId}
      variant={variant}
      tr={tr}
      feedAria={t('feedAria')}
    />
  )
}
