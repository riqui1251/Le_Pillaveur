"use client"

import { useEffect, useRef, useState, type UIEvent } from 'react'
import { motion, useReducedMotion } from 'framer-motion'
import { ArrowDown } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { BotSpeech } from '@/lib/online/bot-speech'
import { PlayerAvatarGlyph } from '@/components/icons/PlayerIcons'
import { cn } from '@/lib/utils'
import { TV_FEED_SIZE, botLine, speechFeedItems, type LineTranslator } from './bot-speech-feed'

export type FeedPlayer = { id: string; name: string; isBot: boolean }

/** Sous cet écart au bas du fil (px), le lecteur est « en bas » : le fil suit les nouvelles paroles. */
const STICK_THRESHOLD_PX = 24

export type BotSpeechFeedProps<K extends string> = {
  speeches: readonly BotSpeech<K>[]
  round: number
  /** Jeux sans manches : première fenêtre affichée (cf. FeedWindow), `round` seule par défaut. */
  sinceRound?: number
  /** Paroles élaguées par le moteur avant `speeches[0]` (cf. FeedWindow) : clés stables. */
  indexBase?: number
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
  /**
   * Ce que le lecteur d'écran entend du fil (téléphone) :
   * - `all` (défaut) : chaque bulle — le fil EST l'annonce (le « Menteur ! »
   *   de la révélation du Menteur) ;
   * - `aimed` : seulement les bulles qui visent le spectateur, dans une région
   *   à part ; le fil se tait. Pour un débat où les bots parlent toutes les
   *   2,5 à 5,5 s : tout annoncer, c'était un flot sans pause.
   * La TV garde son fil annoncé tel quel.
   */
  live?: 'all' | 'aimed'
}

type Bubble = {
  key: string
  author: FeedPlayer | undefined
  authorName: string
  line: string
  badge: string | null
  aimsAtMe: boolean
}

/**
 * Fil des paroles d'un jeu à débat, bots ET humains : une bulle par parole,
 * avec l'avatar et le nom de son auteur. Téléphone : borné en hauteur, il
 * suit la dernière bulle tant que le lecteur est en bas ; remonté lire le
 * début, il n'est plus ramené à chaque parole de bot, une pastille
 * « Nouvelles paroles » le ramène. TV : les dernières paroles de la manche,
 * en grand.
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
 * Le catalogue du jeu est lu par l'appelant : le namespace est celui du jeu,
 * et le relevé des tranches de messages (src/i18n/messages-coverage.test.ts)
 * ne lit qu'un namespace littéral. L'appelant — un wrapper par jeu — passe
 * `tr`, `feedAria` et le texte du badge ; seul le libellé de la pastille,
 * commun à tous les jeux, vient du socle (`gameUi.feed`).
 *
 * La région live est montée dès l'ouverture des paroles, même vide : une
 * région aria-live doit exister avant de parler pour être annoncée
 * (VoiceOver iOS, cf. ConnectionBanner).
 */
export function BotSpeechFeed<K extends string>({
  speeches,
  round,
  sinceRound,
  indexBase,
  players,
  iconOf,
  meId,
  variant,
  tr,
  feedAria,
  aimedBadge,
  valuesOf,
  live = 'all',
}: BotSpeechFeedProps<K>) {
  const reduced = useReducedMotion()
  const t = useTranslations('gameUi.feed')
  const listRef = useRef<HTMLUListElement>(null)
  const atEndRef = useRef(true)
  const [hasNewer, setHasNewer] = useState(false)
  const tv = variant === 'tv'
  const items = speechFeedItems(speeches, round, meId, tv ? TV_FEED_SIZE : undefined, {
    since: sinceRound,
    indexBase,
  })
  const count = items.length

  const nameOf = (id: string | null) => players.find((p) => p.id === id)?.name ?? '—'

  const bubbles: Bubble[] = items.flatMap(({ key, speech, aimsAtMe, firstOfAuthor }) => {
    const author = players.find((p) => p.id === speech.playerId)
    const target = players.find((p) => p.id === speech.targetId)
    const line = botLine(speech.kind, author, target, tr, {
      withTic: firstOfAuthor,
      seed: key,
      values: valuesOf?.(speech),
    })
    if (!line) return []
    const badge = aimsAtMe && aimedBadge?.kinds.includes(speech.kind) ? aimedBadge.text : null
    return [{ key, author, authorName: nameOf(speech.playerId), line, badge, aimsAtMe }]
  })

  // Même mécanique que le chat : seul le fil défile, jamais la page — un
  // scrollIntoView entraînerait aussi les ancêtres et ferait sauter l'écran
  // du téléphone à chaque parole de bot.
  useEffect(() => {
    const el = listRef.current
    if (!el) return
    if (tv || atEndRef.current) {
      el.scrollTop = el.scrollHeight
      setHasNewer(false)
    } else {
      setHasNewer(true)
    }
  }, [count, tv])

  const onScroll = (e: UIEvent<HTMLUListElement>) => {
    const el = e.currentTarget
    atEndRef.current = el.scrollHeight - el.scrollTop - el.clientHeight <= STICK_THRESHOLD_PX
    if (atEndRef.current) setHasNewer(false)
  }

  const scrollToEnd = () => {
    const el = listRef.current
    if (!el) return
    atEndRef.current = true
    el.scrollTop = el.scrollHeight
    setHasNewer(false)
  }

  // Région « aimed » : seule la DERNIÈRE bulle qui me vise s'annonce, quand
  // elle change. L'historique présent au montage (retour sur l'onglet,
  // reconnexion) ne s'annonce pas.
  const aimedOnly = live === 'aimed' && !tv
  const lastAimed = aimedOnly ? [...bubbles].reverse().find((b) => b.aimsAtMe) ?? null : null
  const lastAimedKey = lastAimed?.key ?? null
  const lastAimedName = lastAimed?.authorName ?? ''
  const lastAimedLine = lastAimed?.line ?? ''
  const lastAimedBadge = lastAimed?.badge ?? null
  const seenAimedRef = useRef<string | null | undefined>(undefined)
  const [announced, setAnnounced] = useState<{ name: string; line: string; badge: string | null } | null>(null)
  useEffect(() => {
    if (seenAimedRef.current === undefined) {
      seenAimedRef.current = lastAimedKey
      return
    }
    if (lastAimedKey === null || lastAimedKey === seenAimedRef.current) return
    seenAimedRef.current = lastAimedKey
    setAnnounced({ name: lastAimedName, line: lastAimedLine, badge: lastAimedBadge })
  }, [lastAimedKey, lastAimedName, lastAimedLine, lastAimedBadge])

  if (tv) {
    return (
      <ul ref={listRef} aria-live="polite" aria-label={feedAria} className="w-full max-w-3xl space-y-2 text-left">
        {bubbles.map(({ key, author, authorName, line, badge }) => (
          <motion.li
            key={key}
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className="flex items-start gap-3"
          >
            <span aria-hidden className="mt-1 shrink-0 text-3xl leading-none">
              {author && <PlayerAvatarGlyph value={iconOf(author)} />}
            </span>
            <div className="min-w-0 flex-1 rounded-xl rounded-tl-sm border border-white/10 bg-white/5 px-3 py-1.5 text-xl text-cream">
              <span className="font-bold">{authorName}</span> {line}
              {badge && <span className="ml-1 font-bold text-gold">{badge}</span>}
            </div>
          </motion.li>
        ))}
      </ul>
    )
  }

  return (
    <>
      <ul
        ref={listRef}
        aria-live={aimedOnly ? 'off' : 'polite'}
        aria-label={feedAria}
        onScroll={onScroll}
        className="max-h-48 space-y-1.5 overflow-y-auto overscroll-contain"
      >
        {bubbles.map(({ key, author, authorName, line, badge, aimsAtMe }) => (
          <motion.li
            key={key}
            initial={reduced ? false : { opacity: 0, y: 6 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.18 }}
            className="flex items-start gap-2"
          >
            <span aria-hidden className="mt-1 shrink-0 text-xl leading-none">
              {author && <PlayerAvatarGlyph value={iconOf(author)} />}
            </span>
            {/* L'auteur sur sa ligne, en or : à une parole de bot toutes les
                quelques secondes, le nom fondu dans la phrase ne se
                retrouvait plus. L'espace qui le suit garde le même texte
                que la bulle TV (lecteurs d'écran, copie). Sur le fond or de
                la bulle qui me vise, l'or pur tombe à 4,4:1 : or pâle. */}
            <div
              className={cn(
                'min-w-0 flex-1 rounded-xl rounded-tl-sm border px-3 py-1.5 text-sm leading-snug',
                aimsAtMe ? 'border-gold/40 bg-gold/20 text-cream' : 'border-cream/10 bg-black/20 text-cream/90'
              )}
            >
              <span className={cn('block font-bold leading-tight', aimsAtMe ? 'text-amber-200' : 'text-gold')}>
                {authorName}
              </span>{' '}
              {line}
              {badge && <span className="ml-1 font-bold text-amber-200">{badge}</span>}
            </div>
          </motion.li>
        ))}
        {/* Dans le fil borné, collée à son bas : posée sous la liste, la
            pastille poussait Accuser / Faire équipe de 50 px sous le doigt.
            Muette pour la région live du fil (`all`). */}
        {hasNewer && (
          <li aria-live="off" className="sticky bottom-0 flex justify-center pt-1">
            <button
              type="button"
              onClick={scrollToEnd}
              className="inline-flex h-11 items-center gap-1.5 rounded-full border border-gold/40 bg-felt-deep px-4 text-sm font-semibold text-gold shadow-[0_6px_14px_-6px_rgba(0,0,0,0.7)] transition-colors hover:border-gold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold"
            >
              <ArrowDown aria-hidden className="h-4 w-4" />
              {t('newer')}
            </button>
          </li>
        )}
      </ul>
      {aimedOnly && (
        <p role="status" aria-live="polite" aria-atomic="true" className="sr-only">
          {announced && (
            <>
              <span>{announced.name}</span> <span>{announced.line}</span>
              {announced.badge && <span> {announced.badge}</span>}
            </>
          )}
        </p>
      )}
    </>
  )
}
