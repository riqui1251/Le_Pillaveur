"use client"

import { useMemo } from 'react'
import { useTranslations } from 'next-intl'
import type { BotSpeech } from '@/lib/online/bot-speech'
import { ESPION_ANY, type EspionAnswer, type EspionQuestionId } from '@/lib/espion/data/questions'
import type { EspionSpeech, EspionSpeechKind } from '@/lib/espion/engine'
import { BotSpeechFeed, type FeedPlayer } from '../bot-speech/BotSpeechFeed'
import { sayVariantKey, type LineTranslator } from '../bot-speech/bot-speech-feed'

/**
 * Les clés de la tournure d'une question ou d'une réponse du fil, tirées sur
 * une graine propre à l'entrée (son auteur, la manche, la question) : la même
 * sur les téléphones et la TV, bulle comme question en cours en grand.
 */
export function espionExchangeKeys(
  entry: { authorId: string; round: number; questionId: EspionQuestionId; value?: EspionAnswer },
  has: (key: string) => boolean
): { question: string; answer: string | null } {
  const seed = `${entry.authorId}-${entry.round}-${entry.questionId}`
  const question = sayVariantKey(`qa.${entry.questionId}.q`, seed, has)
  if (!entry.value) return { question, answer: null }
  const answerKey = entry.value === ESPION_ANY ? 'qa.any' : `qa.${entry.questionId}.${entry.value}`
  return { question, answer: sayVariantKey(answerKey, seed, has) }
}

/**
 * Qui me vise encore, et donc vers qui part « Me défendre » : l'auteur de la
 * dernière accusation ou du dernier « je trouve ça louche » contre moi dans
 * le fil de la manche, toujours là, si je ne me suis pas défendu depuis ;
 * null sinon — le bouton n'apparaît que quand on est visé.
 */
export function espionAimedBy(
  roundSpeech: readonly EspionSpeech[],
  meId: string,
  present: (id: string) => boolean
): string | null {
  for (let i = roundSpeech.length - 1; i >= 0; i -= 1) {
    const sp = roundSpeech[i]
    if (sp.playerId === meId && sp.kind === 'defend') return null
    if ((sp.kind === 'accuse' || sp.kind === 'suspect') && sp.targetId === meId && present(sp.playerId)) return sp.playerId
  }
  return null
}

/**
 * Fil des échanges de L'Espion : questions, réponses, accusations, soutiens et
 * refus, paroles libres, lus dans le catalogue de l'Espion. Le namespace reste
 * un littéral, comme l'exige le relevé des tranches de messages.
 *
 * Les entrées silencieuses (soutiens et refus au-delà du premier) sont
 * retirées AVANT le fil : le journal ne fait qu'ajouter en fin, la liste
 * filtrée aussi, donc la clé d'une bulle (sa position) ne bouge pas.
 * Téléphone : la bulle qui me vise (accusation, « je trouve ça louche »)
 * porte un badge ; TV : les quatre dernières bulles, sans badge.
 */
export function EspionTableTalk({
  speech,
  round,
  players,
  iconOf,
  meId = null,
  variant = 'phone',
}: {
  speech: readonly EspionSpeech[]
  round: number
  players: readonly FeedPlayer[]
  iconOf: (p: FeedPlayer) => string
  meId?: string | null
  variant?: 'phone' | 'tv'
}) {
  const t = useTranslations('games.espion.game')
  const tr: LineTranslator = {
    has: (key) => t.has(key),
    format: (key, values) => t(key, values),
  }
  const visible = useMemo(() => speech.filter((sp) => !sp.quiet), [speech])

  const valuesOf = (entry: BotSpeech<EspionSpeechKind>): Record<string, string> => {
    const sp = entry as EspionSpeech
    if (!sp.questionId) return {}
    const keys = espionExchangeKeys({ authorId: sp.playerId, round: sp.round, questionId: sp.questionId, value: sp.value }, (key) => t.has(key))
    return keys.answer ? { question: t(keys.question), answer: t(keys.answer) } : { question: t(keys.question) }
  }

  return (
    <BotSpeechFeed
      speeches={visible}
      round={round}
      players={players}
      iconOf={iconOf}
      meId={variant === 'tv' ? null : meId}
      variant={variant}
      tr={tr}
      feedAria={t('feedAria')}
      aimedBadge={variant === 'tv' ? undefined : { kinds: ['accuse', 'suspect'], text: t('accusedYou') }}
      valuesOf={valuesOf}
    />
  )
}
