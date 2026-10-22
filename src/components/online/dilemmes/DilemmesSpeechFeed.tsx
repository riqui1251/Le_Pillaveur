"use client"

import { useTranslations } from 'next-intl'
import { useAmbianceMode } from '@/components/providers/AmbianceAttribute'
import { dilRevealReactions, type DilReactionView } from '@/lib/dilemmes/reveal-reactions'
import { BotSpeechFeed, type FeedPlayer } from '../bot-speech/BotSpeechFeed'
import { ambianceLineTranslator, type LineTranslator } from '../bot-speech/bot-speech-feed'

/**
 * Fil des paroles de Dilemmes (téléphone et TV) : le fil commun aux jeux à
 * paroles (BotSpeechFeed), lu dans le catalogue de Dilemmes — namespace
 * littéral, comme l'exige le relevé des tranches de messages. Seuls les bots
 * parlent, avec leur vote (sans jamais le dire) ; à la révélation, leur
 * réaction (reveal-reactions.ts), dérivée de la vue publique, passe DERRIÈRE
 * les paroles de l'état, qui ne grandit plus avant la carte suivante : les
 * clés ne bougent pas, et chaque écran tire la même bulle. Un écran réglé
 * Sans alcool tait les tics qui trinquent.
 */
export function DilemmesSpeechFeed({
  view,
  iconOf,
  meId,
  variant,
}: {
  view: DilReactionView
  iconOf: (p: FeedPlayer) => string
  /** Spectateur local ; absent sur la TV (aucune bulle n'y est surlignée). */
  meId?: string | null
  variant: 'phone' | 'tv'
}) {
  const t = useTranslations('games.dilemmes.game')
  const { mode } = useAmbianceMode()
  const tr: LineTranslator = ambianceLineTranslator(
    { has: (key) => t.has(key), format: (key, values) => t(key, values) },
    mode === 'soft'
  )

  return (
    <BotSpeechFeed
      speeches={[...(view.speech ?? []), ...dilRevealReactions(view)]}
      round={view.round}
      players={view.players}
      iconOf={iconOf}
      meId={meId}
      variant={variant}
      tr={tr}
      feedAria={t('feedAria')}
    />
  )
}
