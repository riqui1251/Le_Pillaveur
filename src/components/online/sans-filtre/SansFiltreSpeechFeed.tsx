"use client"

import { useTranslations } from 'next-intl'
import { useAmbianceMode } from '@/components/providers/AmbianceAttribute'
import { sfRevealReactions, type SFReactionView } from '@/lib/sans-filtre/reveal-reactions'
import { BotSpeechFeed, type FeedPlayer } from '../bot-speech/BotSpeechFeed'
import { ambianceLineTranslator, type LineTranslator } from '../bot-speech/bot-speech-feed'

/**
 * Fil des paroles de Sans Filtre (téléphone et TV) : le fil commun aux jeux à
 * paroles (BotSpeechFeed), lu dans le catalogue de Sans Filtre — namespace
 * littéral, comme l'exige le relevé des tranches de messages. Seuls les bots
 * parlent, avec la carte qu'ils abattent ; au couronnement, leurs réactions
 * (reveal-reactions.ts), dérivées de la vue publique, passent DERRIÈRE les
 * paroles de l'état, qui ne grandit plus avant la manche suivante : les clés
 * ne bougent pas, et chaque écran tire les mêmes bulles. Un écran réglé Sans
 * alcool tait les tics qui trinquent.
 */
export function SansFiltreSpeechFeed({
  view,
  iconOf,
  meId,
  variant,
}: {
  view: SFReactionView
  iconOf: (p: FeedPlayer) => string
  /** Spectateur local ; absent sur la TV (aucune bulle n'y est surlignée). */
  meId?: string | null
  variant: 'phone' | 'tv'
}) {
  const t = useTranslations('games.sans-filtre.game')
  const { mode } = useAmbianceMode()
  const tr: LineTranslator = ambianceLineTranslator(
    { has: (key) => t.has(key), format: (key, values) => t(key, values) },
    mode === 'soft'
  )

  return (
    <BotSpeechFeed
      speeches={[...(view.speech ?? []), ...sfRevealReactions(view)]}
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
