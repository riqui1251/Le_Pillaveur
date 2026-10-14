"use client"

import { useEffect, useRef } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import type { BotSpeech } from '@/lib/online/bot-speech'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { cn } from '@/lib/utils'
import { TV_FEED_SIZE, botLine, speechFeedItems, type LineTranslator } from './bot-speech-feed'

export type FeedPlayer = { id: string; name: string; isBot: boolean }

export type BotSpeechFeedProps<K extends string> = {
  speeches: readonly BotSpeech<K>[]
  round: number
  players: readonly FeedPlayer[]
  iconOf: (p: FeedPlayer) => string
  /** Spectateur local ; absent sur la TV (aucune bulle n'y est surlignée). */
  meId?: string | null
  variant: 'phone' | 'tv'
  /** Le catalogue du jeu (`games.<jeu>.game`), lu par l'appelant. */
  tr: LineTranslator
  feedAria: string
  /** Mention ajoutée aux bulles de ces kinds qui visent le spectateur (« Il t'accuse ! »). */
  aimedBadge?: { kinds: readonly K[]; text: string }
  /** Arguments propres au jeu passés à la phrase d'une parole (l'indice cité…). */
  valuesOf?: (speech: BotSpeech<K>) => Record<string, string>
}

/**
 * Fil des paroles d'un jeu à débat, bots ET humains : une bulle par parole,
 * avec l'avatar et le nom de son auteur. Téléphone : borné en hauteur, défile
 * seul vers la dernière bulle ; TV : les dernières paroles de la manche, en
 * grand.
 *
 * Chaque bot parle au ton de son persona quand le catalogue a la variante,
 * sinon de la voix neutre commune aux humains, et glisse son tic de langage
 * dans sa première parole de la manche (botLine). Les phrases s'accordent au
 * genre du persona, auteur comme cible, et varient d'une parole à l'autre de
 * façon déterministe : la graine est la clé de l'item, la même sur les
 * téléphones et la TV. Un kind inconnu de cet onglet (ouvert avant un
 * déploiement) est masqué plutôt que rendu en clé brute. La bulle qui VISE le
 * spectateur local est surlignée.
 *
 * Aucun `useTranslations` ici : le namespace est celui du jeu, et le relevé
 * des tranches de messages (src/i18n/messages-coverage.test.ts) ne lit qu'un
 * namespace littéral. L'appelant — un wrapper par jeu — lit son catalogue et
 * passe `tr`, `feedAria` et le texte du badge.
 *
 * La liste est montée dès l'ouverture des paroles, même vide : une région
 * aria-live doit exister avant de parler pour être annoncée (VoiceOver iOS,
 * cf. ConnectionBanner).
 */
export function BotSpeechFeed<K extends string>({
  speeches,
  round,
  players,
  iconOf,
  meId,
  variant,
  tr,
  feedAria,
  aimedBadge,
  valuesOf,
}: BotSpeechFeedProps<K>) {
  const reduced = useReducedMotion()
  const listRef = useRef<HTMLUListElement>(null)
  const tv = variant === 'tv'
  const items = speechFeedItems(speeches, round, meId, tv ? TV_FEED_SIZE : undefined)
  const count = items.length

  // Même mécanique que le chat : seul le fil défile, jamais la page — un
  // scrollIntoView entraînerait aussi les ancêtres et ferait sauter l'écran
  // du téléphone à chaque parole de bot.
  useEffect(() => {
    const el = listRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [count])

  const nameOf = (id: string | null) => players.find((p) => p.id === id)?.name ?? '—'

  return (
    <ul
      ref={listRef}
      aria-live="polite"
      aria-label={feedAria}
      className={tv ? 'w-full max-w-3xl space-y-2 text-left' : 'max-h-48 space-y-1 overflow-y-auto'}
    >
      {items.map(({ key, speech, aimsAtMe, firstOfAuthor }) => {
        const author = players.find((p) => p.id === speech.playerId)
        const target = players.find((p) => p.id === speech.targetId)
        const line = botLine(speech.kind, author, target, tr, {
          withTic: firstOfAuthor,
          seed: key,
          values: valuesOf?.(speech),
        })
        if (!line) return null
        const badge = aimsAtMe && aimedBadge?.kinds.includes(speech.kind) ? aimedBadge.text : null
        return (
          <motion.li
            key={key}
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className={cn('flex items-start', tv ? 'gap-3' : 'gap-2')}
          >
            <span
              aria-hidden
              className={cn('shrink-0 leading-none', tv ? 'mt-1 text-3xl' : 'mt-0.5 text-lg')}
            >
              {author && <PlayerAvatarGlyph value={iconOf(author)} />}
            </span>
            <div
              className={cn(
                'min-w-0 flex-1 rounded-xl rounded-tl-sm border px-3 py-1.5',
                tv ? 'text-xl text-cream' : 'text-xs text-white/80',
                aimsAtMe ? 'border-gold/40 bg-gold/10' : 'border-white/10 bg-white/5'
              )}
            >
              <span className="font-bold">{nameOf(speech.playerId)}</span>{' '}
              {line}
              {badge && <span className="ml-1 font-bold text-gold">{badge}</span>}
            </div>
          </motion.li>
        )
      })}
    </ul>
  )
}
