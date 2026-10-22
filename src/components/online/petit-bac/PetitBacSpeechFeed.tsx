"use client"

import { useTranslations } from 'next-intl'
import type { PbcClientView, PbcSpeech } from '@/lib/petit-bac/engine'
import { pbcCitedAnswer } from '@/lib/petit-bac/bot-speech'
import { BotSpeechFeed, type FeedPlayer } from '../bot-speech/BotSpeechFeed'
import { ambianceLineTranslator, type LineTranslator } from '../bot-speech/bot-speech-feed'

/**
 * Fil des paroles du Petit Bac (téléphone et TV) : le fil commun aux jeux à
 * paroles (BotSpeechFeed), lu dans le catalogue du Petit Bac — namespace
 * littéral, comme l'exige le relevé des tranches de messages. Seuls les
 * bots (déserteurs convertis) parlent : au STOP, puis à la révélation, où
 * la bulle cite la réponse commentée, lue dans la grille publique. En Sans
 * alcool, les tics qui trinquent sont tus.
 */
export function PetitBacSpeechFeed({
  view,
  iconOf,
  meId,
  variant,
  soft,
}: {
  view: Pick<PbcClientView, 'speech' | 'round' | 'revealGrid'> & { players: readonly FeedPlayer[] }
  iconOf: (p: FeedPlayer) => string
  /** Spectateur local ; absent sur la TV (aucune bulle n'y est surlignée). */
  meId?: string | null
  variant: 'phone' | 'tv'
  soft: boolean
}) {
  const t = useTranslations('games.petit-bac.game')
  const tr: LineTranslator = ambianceLineTranslator(
    { has: (key) => t.has(key), format: (key, values) => t(key, values) },
    soft
  )

  return (
    <BotSpeechFeed
      speeches={view.speech ?? []}
      round={view.round}
      players={view.players}
      iconOf={iconOf}
      meId={meId}
      variant={variant}
      tr={tr}
      feedAria={t('feedAria')}
      // Les paroles du fil sont celles du Petit Bac : `category` les accompagne.
      valuesOf={(speech) => ({ answer: pbcCitedAnswer(view, speech as PbcSpeech) })}
    />
  )
}
