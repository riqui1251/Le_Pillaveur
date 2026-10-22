"use client"

import { useTranslations } from 'next-intl'
import { GAME_1220_DRINK_SPEECH_KINDS } from '@/lib/1220/engine'
import type { Game1220SyncedSpeech } from '@/lib/online-game-state'
import { BotSpeechFeed, type FeedPlayer } from '../bot-speech/BotSpeechFeed'
import { hideSpeechKinds, type LineTranslator } from '../bot-speech/bot-speech-feed'

/**
 * Fil des paroles du 12-20 (téléphone et TV) : le fil commun aux jeux à
 * paroles (BotSpeechFeed), lu dans le catalogue du jeu — le namespace reste un
 * littéral ici, comme l'exige le relevé des tranches de messages.
 *
 * La « manche » est le lancer : le fil ne montre que les réactions au lancer
 * AFFICHÉ (`roll`) — le téléphone, dont les dés roulent encore, garde celles
 * du précédent pour ne pas trahir le résultat avant les dés. `speechBase`
 * (paroles élaguées par le moteur) garde les clés des bulles stables. Pour un
 * spectateur « Sans alcool », les paroles qui parlent de boire
 * (GAME_1220_DRINK_SPEECH_KINDS) sont masquées.
 */
export function Game1220SpeechFeed({
  view,
  roll,
  iconOf,
  meId,
  variant,
  soft = false,
}: {
  view: { speech?: readonly Game1220SyncedSpeech[]; speechBase?: number; players: readonly FeedPlayer[] }
  /** Numéro du lancer affiché (`rolls` de l'état, moins un pendant que les dés roulent). */
  roll: number
  iconOf: (p: FeedPlayer) => string
  /** Spectateur local ; absent sur la TV (aucune bulle n'y est surlignée). */
  meId?: string | null
  variant: 'phone' | 'tv'
  soft?: boolean
}) {
  const t = useTranslations('games.1220')
  const tr: LineTranslator = {
    has: (key) => t.has(key),
    format: (key, values) => t(key, values),
  }

  return (
    <BotSpeechFeed
      speeches={hideSpeechKinds(view.speech ?? [], soft ? GAME_1220_DRINK_SPEECH_KINDS : [])}
      round={roll}
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
