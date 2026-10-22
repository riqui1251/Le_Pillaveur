"use client"

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import type { PbSpeech } from '@/lib/petit-buveur/engine'
import { BotSpeechFeed, type FeedPlayer } from '../bot-speech/BotSpeechFeed'
import { ambianceLineTranslator, type LineTranslator } from '../bot-speech/bot-speech-feed'

/**
 * Fil des paroles du Petit Buveur en ligne (téléphone et TV) : le fil commun
 * aux jeux à paroles (BotSpeechFeed), lu dans le catalogue du jeu — le
 * namespace reste un littéral ici, comme l'exige le relevé des tranches de
 * messages. Seuls les bots parlent, du coup qui vient de se jouer ; le fil ne
 * montre que le tour de table en cours. En Sans alcool, les tics qui
 * trinquent sont tus (aucune phrase ne parle de boire).
 */
export function PetitBuveurSpeechFeed({
  speech,
  round,
  players,
  iconOf,
  meId,
  variant,
  soft,
  tvSize,
}: {
  speech: readonly PbSpeech[] | undefined
  round: number
  players: readonly { id: string; name: string; isBot?: boolean }[]
  iconOf: (p: FeedPlayer) => string
  /** Spectateur local ; absent sur la TV (aucune bulle n'y est surlignée). */
  meId?: string | null
  variant: 'phone' | 'tv'
  soft: boolean
  /** Bulles gardées à la TV (voir BotSpeechFeed). */
  tvSize?: number
}) {
  const t = useTranslations('games.petit-buveur.game')
  const tr: LineTranslator = ambianceLineTranslator(
    { has: (key) => t.has(key), format: (key, values) => t(key, values) },
    soft
  )

  return (
    <BotSpeechFeed
      speeches={speech ?? []}
      round={round}
      players={players.map((p) => ({ id: p.id, name: p.name, isBot: Boolean(p.isBot) }))}
      iconOf={iconOf}
      meId={meId}
      variant={variant}
      tr={tr}
      feedAria={t('feedAria')}
      tvSize={tvSize}
    />
  )
}

export type ShownSpeech = { key: string; speech: readonly PbSpeech[]; round: number }

export function shownSpeechOf(speech: readonly PbSpeech[] | undefined, round: number): ShownSpeech {
  const list = speech ?? []
  // Le fil ne fait que grandir dans un tour de table : manche et longueur disent s'il a changé.
  return { key: `${round}:${list.length}`, speech: list, round }
}

/**
 * Le fil à montrer : le fil vivant quand le plateau est posé, sinon celui
 * qu'on montrait. Le serveur écrit la parole d'un bot avec le coup qu'elle
 * commente ; à l'écran, ce coup se joue en plusieurs temps (dé, pion qui
 * marche, carte, roue ou pièce). La bulle (« Aïe ! », « Je te double ! »)
 * attend donc que le plateau soit posé, comme la carte de la case : elle ne
 * trahit pas l'effet avant qu'il soit montré, et le fil d'avant reste
 * lisible pendant ce temps.
 */
export function settledSpeech(shown: ShownSpeech, live: ShownSpeech, settled: boolean): ShownSpeech {
  if (!settled || shown.key === live.key) return shown
  return live
}

/** settledSpeech, ajusté pendant le rendu : le rendu qui reçoit le coup garde déjà le fil d'avant. */
export function useSettledSpeech(
  speech: readonly PbSpeech[] | undefined,
  round: number,
  settled: boolean
): ShownSpeech {
  const live = shownSpeechOf(speech, round)
  const [shown, setShown] = useState(live)
  const next = settledSpeech(shown, live, settled)
  if (next !== shown) setShown(next)
  return next
}
