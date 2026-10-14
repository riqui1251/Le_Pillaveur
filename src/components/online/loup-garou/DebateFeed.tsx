"use client"

import { useTranslations } from 'next-intl'
import type { LGDebateSpeech } from '@/lib/loup-garou/engine'
import { BotSpeechFeed, type FeedPlayer } from '../bot-speech/BotSpeechFeed'
import type { LGLineTranslator } from './debate-feed'

/**
 * Fil du débat du Loup-Garou (téléphone et TV) : le fil commun aux jeux à
 * débat (BotSpeechFeed), lu dans le catalogue du Loup-Garou. Le namespace
 * reste un littéral ici, comme l'exige le relevé des tranches de messages.
 * La bulle d'une accusation qui VISE le spectateur porte « Il t'accuse » —
 * c'est elle qui ouvre « Me défendre » dans la carte parente ; la carte
 * d'interpellation (« tu votes qui ? ») reste hors du fil.
 */
export function DebateFeed({
  speeches,
  round,
  players,
  iconOf,
  meId,
  variant,
}: {
  speeches: readonly LGDebateSpeech[]
  round: number
  players: readonly FeedPlayer[]
  iconOf: (p: FeedPlayer) => string
  /** Spectateur local ; absent sur la TV (aucune bulle n'y est surlignée). */
  meId?: string | null
  variant: 'phone' | 'tv'
}) {
  const t = useTranslations('games.loup-garou.game')
  const tr: LGLineTranslator = {
    has: (key) => t.has(key),
    format: (key, values) => t(key, values),
  }

  return (
    <BotSpeechFeed
      speeches={speeches}
      round={round}
      players={players}
      iconOf={iconOf}
      meId={meId}
      variant={variant}
      tr={tr}
      feedAria={t('feedAria')}
      aimedBadge={{ kinds: ['suspect'], text: t('accusedYou') }}
    />
  )
}
