"use client"

import { useTranslations } from 'next-intl'
import { purpleSpeechRound, PURPLE_DRINK_SPEECH_KINDS } from '@/lib/purple/engine'
import type { PurpleSyncedSpeech } from '@/lib/online-game-state'
import { useAmbianceMode } from '@/components/providers/AmbianceAttribute'
import { BotSpeechFeed, type FeedPlayer } from '../bot-speech/BotSpeechFeed'
import { ambianceLineTranslator, hideSpeechKinds, type LineTranslator } from '../bot-speech/bot-speech-feed'

/**
 * Fil des paroles du Purple (téléphone, verdict et TV) : le fil commun aux
 * jeux à paroles (BotSpeechFeed), lu dans le catalogue du jeu — le namespace
 * reste un littéral ici, comme l'exige le relevé des tranches de messages.
 *
 * Pas de manches : le fil montre la fenêtre de tours en cours et la
 * précédente (purpleSpeechRound), clés stables malgré l'élagage du moteur
 * (`speechBase`). Pour un spectateur « Sans alcool », les paroles qui parlent
 * de boire (PURPLE_DRINK_SPEECH_KINDS) sont masquées, les autres gardent leur
 * place et leur phrase, et le tic qui trinque se tait (ambianceLineTranslator).
 */
export function PurpleSpeechFeed({
  view,
  iconOf,
  meId,
  variant,
  soft,
}: {
  view: { turn?: number; speech?: readonly PurpleSyncedSpeech[]; speechBase?: number; players: readonly FeedPlayer[] }
  iconOf: (p: FeedPlayer) => string
  /** Spectateur local ; absent sur la TV (aucune bulle n'y est surlignée). */
  meId?: string | null
  variant: 'phone' | 'tv'
  /** Ambiance imposée (tests) ; sinon celle du compte ou de l'appareil. */
  soft?: boolean
}) {
  const t = useTranslations('games.purple')
  const { mode } = useAmbianceMode()
  const sober = soft ?? mode === 'soft'
  const tr: LineTranslator = ambianceLineTranslator(
    { has: (key) => t.has(key), format: (key, values) => t(key, values) },
    sober
  )
  const round = purpleSpeechRound(view)

  return (
    <BotSpeechFeed
      speeches={hideSpeechKinds(view.speech ?? [], sober ? PURPLE_DRINK_SPEECH_KINDS : [])}
      round={round}
      sinceRound={round - 1}
      indexBase={view.speechBase ?? 0}
      players={view.players}
      iconOf={iconOf}
      meId={meId}
      variant={variant}
      tr={tr}
      feedAria={t('feedAria')}
    />
  )
}
