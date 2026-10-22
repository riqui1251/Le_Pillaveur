"use client"

import { useTranslations } from 'next-intl'
import { useAmbianceMode } from '@/components/providers/AmbianceAttribute'
import type { CrobardClientView } from '@/lib/crobard/engine'
import { BotSpeechFeed, type FeedPlayer } from '../bot-speech/BotSpeechFeed'
import type { LineTranslator } from '../bot-speech/bot-speech-feed'
import { ticOverrides } from '../bot-speech/tic-overrides'

/**
 * Fil des paroles du Crobard (téléphone et TV) : le fil commun aux jeux à
 * paroles (BotSpeechFeed), lu dans le catalogue du Crobard — namespace
 * littéral, comme l'exige le relevé des tranches de messages. Les bulles ne
 * portent que des kinds et des noms : rien du mot dessiné ne peut s'y lire,
 * et aucun texte du catalogue, tics retouchés compris (tic-overrides.ts), ne
 * contient un mot de la pioche. En ambiance « Sans alcool », le tic qui
 * trinque prend sa variante soft.
 */
export function CrobardSpeechFeed({
  view,
  iconOf,
  meId,
  variant,
  soft,
}: {
  view: Pick<CrobardClientView, 'speech' | 'round' | 'players'>
  iconOf: (p: FeedPlayer) => string
  /** Spectateur local ; absent sur la TV (aucune bulle n'y est surlignée). */
  meId?: string | null
  variant: 'phone' | 'tv'
  /** Ambiance imposée (tests) ; sinon celle du compte ou de l'appareil. */
  soft?: boolean
}) {
  const t = useTranslations('games.crobard.game')
  const { mode } = useAmbianceMode()
  const tr: LineTranslator = ticOverrides(
    { has: (key) => t.has(key), format: (key, values) => t(key, values) },
    soft ?? mode === 'soft'
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
    />
  )
}
