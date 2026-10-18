"use client"

import { useTranslations } from 'next-intl'
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
    <details className="rounded-2xl border border-gold/15 bg-felt-deep/60 px-3 py-2 text-xs text-white/70">
      <summary className="cursor-pointer font-semibold text-cream/85">{t('notebook.title')}</summary>
      {byQuestion.size === 0 ? (
        <p className="mt-1.5 text-white/40">{t('notebook.empty')}</p>
      ) : (
        <dl className="mt-1.5 space-y-1.5">
          {[...byQuestion].map(([questionId, list]) => (
            <div key={questionId}>
              <dt className="font-semibold text-white/50 first-letter:uppercase">{t(`qa.${questionId}.q`)}</dt>
              {list.map((sp) => (
                <dd key={`${sp.playerId}-${sp.at}`} className="pl-2">
                  <span className="font-bold text-cream/85">{nameOf(sp.playerId)}</span>{' '}
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
