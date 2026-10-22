"use client"

import { useTranslations } from 'next-intl'
import { useAmbianceMode } from '@/components/providers/AmbianceAttribute'
import { bluffRevealReactions, type BluffReactionView } from '@/lib/bluff/reveal-reactions'
import { BotSpeechFeed, type FeedPlayer } from '../bot-speech/BotSpeechFeed'
import { softLineTranslator, type LineTranslator } from '../bot-speech/bot-speech-feed'

/**
 * Fil des paroles du Grand Bluff (téléphone et TV) : le fil commun aux jeux à
 * paroles (BotSpeechFeed), lu dans le catalogue du Bluff — namespace
 * littéral, comme l'exige le relevé des tranches de messages. Seuls les bots
 * parlent, avec leur bluff ou leur vote ; à la révélation, leurs réactions
 * (reveal-reactions.ts), dérivées de la vue publique, passent DERRIÈRE les
 * paroles de l'état, qui ne grandit plus avant la manche suivante : les clés
 * ne bougent pas, et chaque écran tire les mêmes bulles. Un écran réglé Sans
 * alcool tait les tics qui trinquent.
 */
export function BluffSpeechFeed({
  view,
  iconOf,
  meId,
  variant,
}: {
  view: BluffReactionView
  iconOf: (p: FeedPlayer) => string
  /** Spectateur local ; absent sur la TV (aucune bulle n'y est surlignée). */
  meId?: string | null
  variant: 'phone' | 'tv'
}) {
  const t = useTranslations('games.bluff.game')
  const { mode } = useAmbianceMode()
  const tr: LineTranslator = softLineTranslator(
    { has: (key) => t.has(key), format: (key, values) => t(key, values) },
    mode === 'soft'
  )

  return (
    <BotSpeechFeed
      speeches={[...(view.speech ?? []), ...bluffRevealReactions(view)]}
      round={view.promptIdx}
      players={view.players}
      iconOf={iconOf}
      meId={meId}
      variant={variant}
      tr={tr}
      feedAria={t('feedAria')}
    />
  )
}
