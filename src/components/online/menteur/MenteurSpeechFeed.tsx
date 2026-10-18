"use client"

import { useTranslations } from 'next-intl'
import { menteurRevealReactions, type MenteurReactionView } from '@/lib/menteur/reveal-reactions'
import { BotSpeechFeed, type FeedPlayer } from '../bot-speech/BotSpeechFeed'
import type { LineTranslator } from '../bot-speech/bot-speech-feed'

/**
 * Fil des paroles du Menteur (téléphone et TV) : le fil commun aux jeux à
 * paroles (BotSpeechFeed), lu dans le catalogue du Menteur. Le namespace
 * reste un littéral ici, comme l'exige le relevé des tranches de messages.
 * Seuls les bots parlent, avec leur coup ; la bulle d'un « Menteur ! » qui
 * VISE le spectateur porte « On te défie ! ». Un kind inconnu de cet onglet
 * (ouvert avant un déploiement) est masqué par le socle, jamais rendu brut.
 *
 * À la révélation, la réaction d'un bot (reveal-reactions.ts), dérivée de la
 * vue publique, passe DERRIÈRE les paroles de l'état : sa clé — sa position
 * dans le fil — ne bouge pas, puisque le fil ne grandit plus avant la manche
 * suivante, et chaque écran tire la même bulle.
 */
export function MenteurSpeechFeed({
  view,
  iconOf,
  meId,
  variant,
}: {
  view: MenteurReactionView
  iconOf: (p: FeedPlayer) => string
  /** Spectateur local ; absent sur la TV (aucune bulle n'y est surlignée). */
  meId?: string | null
  variant: 'phone' | 'tv'
}) {
  const t = useTranslations('games.menteur.game')
  const tr: LineTranslator = {
    has: (key) => t.has(key),
    format: (key, values) => t(key, values),
  }

  return (
    <BotSpeechFeed
      speeches={[...(view.speech ?? []), ...menteurRevealReactions(view)]}
      round={view.round}
      players={view.players}
      iconOf={iconOf}
      meId={meId}
      variant={variant}
      tr={tr}
      feedAria={t('feedAria')}
      aimedBadge={{ kinds: ['suspect', 'again'], text: t('speechAimedYou') }}
    />
  )
}
