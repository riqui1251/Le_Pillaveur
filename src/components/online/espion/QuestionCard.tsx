"use client"

import { useTranslations } from 'next-intl'
import { PhaseCountdown } from '../PhaseCountdown'
import { ESPION_ANY, espionQuestionValues, type EspionAnswer, type EspionQuestionId } from '@/lib/espion/data/questions'
import { ESPION_QUESTION_TIMEOUT_MS } from '@/lib/espion/engine'

/**
 * « Mila te demande : on y va plutôt le jour ou la nuit ? » — la carte crème
 * de l'interrogé : une touche par réponse possible, plus « ça dépend », et la
 * barre des 25 s au bout desquelles la question n'attend plus. `questionKey` :
 * la tournure tirée pour la bulle du fil (espionExchangeKeys), pour que la
 * carte reprenne mot pour mot la question que la table vient de lire.
 */
export function QuestionCard({
  askerName,
  questionId,
  questionKey = `qa.${questionId}.q`,
  askedAt,
  disabled,
  onAnswer,
}: {
  askerName: string
  questionId: EspionQuestionId
  questionKey?: string
  askedAt: number
  disabled: boolean
  onAnswer: (value: EspionAnswer) => void
}) {
  const t = useTranslations('games.espion.game')
  const answers: EspionAnswer[] = [...espionQuestionValues(questionId), ESPION_ANY]
  const labelOf = (value: EspionAnswer) => t(value === ESPION_ANY ? 'qa.any' : `qa.${questionId}.${value}`)

  return (
    <div className="space-y-2.5 rounded-2xl border border-[#D8CCAE] bg-cream p-3 text-[#24201A] shadow-[0_10px_24px_-14px_rgba(0,0,0,0.7)]">
      <p className="text-sm">
        <span className="font-bold">{t('askedYou', { name: askerName })}</span> {t(questionKey)}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {answers.map((value) => (
          <button
            key={value}
            onClick={() => onAnswer(value)}
            disabled={disabled}
            className={
              value === ESPION_ANY
                ? 'col-span-2 rounded-xl border border-[#D8CCAE] bg-white/50 px-3 py-2.5 text-sm font-bold text-[#6B6455] transition-all active:scale-95 disabled:opacity-50'
                : 'rounded-xl bg-felt-deep px-3 py-2.5 text-sm font-bold text-cream transition-all active:scale-95 disabled:opacity-50'
            }
          >
            <span className="block first-letter:uppercase">{labelOf(value)}</span>
          </button>
        ))}
      </div>
      <PhaseCountdown
        variant="bar"
        endsAt={askedAt + ESPION_QUESTION_TIMEOUT_MS}
        total={ESPION_QUESTION_TIMEOUT_MS}
        className="h-1.5 w-full overflow-hidden rounded-full bg-[#24201A]/10"
        barClassName="h-full rounded-full bg-gold"
      />
    </div>
  )
}
