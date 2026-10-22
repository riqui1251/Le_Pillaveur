"use client"

import { useTranslations } from 'next-intl'
import { ChevronDown } from 'lucide-react'
import { ESPION_ANY, type EspionQuestionId } from '@/lib/espion/data/questions'
import { espionRoundSpeech, type EspionSpeech } from '@/lib/espion/engine'

/**
 * Carnet des réponses de la manche, regroupées par question dans l'ordre où
 * elles ont été posées : de quoi comparer d'un coup d'œil. Tiré du journal,
 * sans état ; seule l'ouverture du volet est locale (<details>).
 */
export function EspionNotebook({
  speech,
  round,
  nameOf,
}: {
  speech: readonly EspionSpeech[]
  round: number
  nameOf: (id: string) => string
}) {
  const t = useTranslations('games.espion.game')
  const answers = espionRoundSpeech({ round, speech: [...speech] }).filter(
    (sp) => sp.kind === 'answer' && sp.questionId && sp.value
  )
  const byQuestion = new Map<EspionQuestionId, EspionSpeech[]>()
  for (const sp of answers) byQuestion.set(sp.questionId!, [...(byQuestion.get(sp.questionId!) ?? []), sp])

  return (
    <details className="group rounded-2xl border border-gold/20 bg-felt-deep/60 px-3 text-sm text-cream/80">
      {/* En flex, le résumé perd le triangle natif : le chevron dit qu'il s'ouvre. */}
      <summary className="flex min-h-[44px] cursor-pointer list-none items-center justify-between gap-2 rounded-xl font-semibold text-cream focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold [&::-webkit-details-marker]:hidden">
        <span>{t('notebook.title')}</span>
        <ChevronDown className="h-4 w-4 shrink-0 text-gold transition-transform group-open:rotate-180" aria-hidden />
      </summary>
      {byQuestion.size === 0 ? (
        <p className="pb-3 text-cream/70">{t('notebook.empty')}</p>
      ) : (
        <dl className="space-y-2 pb-3">
          {[...byQuestion].map(([questionId, list]) => (
            <div key={questionId}>
              <dt className="font-semibold text-gold first-letter:uppercase">{t(`qa.${questionId}.q`)}</dt>
              {list.map((sp) => (
                <dd key={`${sp.playerId}-${sp.at}`} className="pl-2">
                  <span className="font-bold text-cream">{nameOf(sp.playerId)}</span>{' '}
                  {t(sp.value === ESPION_ANY ? 'qa.any' : `qa.${questionId}.${sp.value}`)}
                </dd>
              ))}
            </div>
          ))}
        </dl>
      )}
    </details>
  )
}
