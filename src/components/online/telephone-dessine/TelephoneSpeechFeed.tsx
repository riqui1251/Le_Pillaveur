"use client"

import { useTranslations } from 'next-intl'
import { telephoneSpeechRound, type TelephoneClientView } from '@/lib/telephone-dessine/engine'
import { BotSpeechFeed, type FeedPlayer } from '../bot-speech/BotSpeechFeed'
import { ambianceLineTranslator, type LineTranslator } from '../bot-speech/bot-speech-feed'

/**
 * Fil des paroles du Téléphone dessiné (téléphone et TV) : le fil commun aux
 * jeux à paroles (BotSpeechFeed), lu dans le catalogue du jeu — namespace
 * littéral, comme l'exige le relevé des tranches de messages. Seuls les bots
 * (déserteurs convertis) parlent, à la chute d'une chaîne : le fil ne montre
 * que la chaîne à l'écran (une « manche » de paroles par chaîne révélée).
 * En Sans alcool, les tics qui trinquent sont tus.
 */
export function TelephoneSpeechFeed({
  view,
  iconOf,
  meId,
  variant,
  soft,
}: {
  view: Pick<TelephoneClientView, 'speech' | 'phase' | 'round' | 'totalRounds' | 'revealIdx'> & {
    players: readonly FeedPlayer[]
  }
  iconOf: (p: FeedPlayer) => string
  /** Spectateur local ; absent sur la TV (aucune bulle n'y est surlignée). */
  meId?: string | null
  variant: 'phone' | 'tv'
  soft: boolean
}) {
  const t = useTranslations('games.telephone-dessine.game')
  const tr: LineTranslator = ambianceLineTranslator(
    { has: (key) => t.has(key), format: (key, values) => t(key, values) },
    soft
  )

  return (
    <BotSpeechFeed
      speeches={view.speech ?? []}
      round={telephoneSpeechRound(view)}
      players={view.players}
      iconOf={iconOf}
      meId={meId}
      variant={variant}
      tr={tr}
      feedAria={t('feedAria')}
    />
  )
}
