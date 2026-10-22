"use client"

import { useTranslations } from 'next-intl'
import type { QuizSpeech } from '@/lib/quiz/engine'
import { BotSpeechFeed, type FeedPlayer } from '../bot-speech/BotSpeechFeed'
import { ambianceLineTranslator, type LineTranslator } from '../bot-speech/bot-speech-feed'

/**
 * Fil des paroles du Grand Pillaveur (téléphone et TV) : le fil commun aux
 * jeux à paroles (BotSpeechFeed), lu dans le catalogue du Quiz — le
 * namespace reste un littéral ici, comme l'exige le relevé des tranches de
 * messages. Seuls les bots parlent : en buzzant, puis à la révélation ; le
 * fil ne montre que la question en cours. En Sans alcool, les tics qui
 * trinquent sont tus (aucune phrase ne parle de boire).
 */
export function QuizSpeechFeed({
  speech,
  qIdx,
  players,
  iconOf,
  meId,
  variant,
  soft,
}: {
  speech: readonly QuizSpeech[] | undefined
  qIdx: number
  players: readonly FeedPlayer[]
  iconOf: (p: FeedPlayer) => string
  /** Spectateur local ; absent sur la TV (aucune bulle n'y est surlignée). */
  meId?: string | null
  variant: 'phone' | 'tv'
  soft: boolean
}) {
  const t = useTranslations('games.quiz.game')
  const tr: LineTranslator = ambianceLineTranslator(
    { has: (key) => t.has(key), format: (key, values) => t(key, values) },
    soft
  )

  return (
    <BotSpeechFeed
      speeches={speech ?? []}
      round={qIdx}
      players={players}
      iconOf={iconOf}
      meId={meId}
      variant={variant}
      tr={tr}
      feedAria={t('feedAria')}
    />
  )
}
