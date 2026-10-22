"use client"

import { useTranslations } from 'next-intl'
import { tcSpeechRound, type TCSpeech } from '@/lib/toucher-coule/engine'
import { BotSpeechFeed, type FeedPlayer } from '../bot-speech/BotSpeechFeed'
import type { LineTranslator } from '../bot-speech/bot-speech-feed'

/**
 * Fil des paroles du Touché-Coulé (téléphone et TV) : le fil commun aux jeux
 * à paroles (BotSpeechFeed), lu dans le catalogue du jeu — le namespace reste
 * un littéral ici, comme l'exige le relevé des tranches de messages.
 *
 * Pas de manches : le fil montre la fenêtre de tours en cours et la
 * précédente (tcSpeechRound), pour qu'un « Coulé ! » survive au tir dans
 * l'eau qui le suit d'une seconde. `speechBase` (paroles élaguées par le
 * moteur) garde les clés des bulles, donc leurs phrases, stables à l'écran.
 */
export function ToucherCouleSpeechFeed({
  view,
  iconOf,
  meId,
  variant,
}: {
  view: {
    turnOrder: readonly string[]
    turnCount: number
    speech?: readonly TCSpeech[]
    speechBase?: number
    players: readonly FeedPlayer[]
  }
  iconOf: (p: FeedPlayer) => string
  /** Spectateur local ; absent sur la TV (aucune bulle n'y est surlignée). */
  meId?: string | null
  variant: 'phone' | 'tv'
}) {
  const t = useTranslations('games.toucher-coule.game')
  const tr: LineTranslator = {
    has: (key) => t.has(key),
    format: (key, values) => t(key, values),
  }
  const round = tcSpeechRound(view)

  return (
    <BotSpeechFeed
      speeches={view.speech ?? []}
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
