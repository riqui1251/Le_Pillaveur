"use client"

import { useTranslations } from 'next-intl'
import { useAmbianceMode } from '@/components/providers/AmbianceAttribute'
import type { MCClientView } from '@/lib/mots-codes/engine'
import { BotSpeechFeed, type FeedPlayer } from '../bot-speech/BotSpeechFeed'
import type { LineTranslator } from '../bot-speech/bot-speech-feed'
import { ticOverrides } from '../bot-speech/tic-overrides'

/**
 * Fil des paroles des Mots Codés (téléphone, écran de fin et TV) : le fil
 * commun aux jeux à paroles (BotSpeechFeed), lu dans le catalogue du jeu —
 * namespace littéral, comme l'exige le relevé des tranches de messages. La
 * « manche » des paroles est le tour d'équipe (`turn`). Les bulles ne
 * portent que des kinds et des noms : rien de la grille de clés. En ambiance
 * « Sans alcool », le tic qui trinque prend sa variante soft.
 */
export function MotsCodesSpeechFeed({
  view,
  iconOf,
  meId,
  variant,
  soft,
}: {
  view: Pick<MCClientView, 'speech' | 'turn' | 'players'>
  iconOf: (p: FeedPlayer) => string
  /** Spectateur local ; absent sur la TV (aucune bulle n'y est surlignée). */
  meId?: string | null
  variant: 'phone' | 'tv'
  /** Ambiance imposée (tests) ; sinon celle du compte ou de l'appareil. */
  soft?: boolean
}) {
  const t = useTranslations('games.mots-codes.game')
  const { mode } = useAmbianceMode()
  const tr: LineTranslator = ticOverrides(
    { has: (key) => t.has(key), format: (key, values) => t(key, values) },
    soft ?? mode === 'soft'
  )
  return (
    <BotSpeechFeed
      speeches={view.speech ?? []}
      round={view.turn ?? 0}
      players={view.players}
      iconOf={iconOf}
      meId={meId}
      variant={variant}
      tr={tr}
      feedAria={t('feedAria')}
    />
  )
}
