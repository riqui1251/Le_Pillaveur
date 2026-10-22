"use client"

import { useTranslations } from 'next-intl'
import { PhaseCountdown } from '../PhaseCountdown'
import { formatCountdown } from '../phase-countdown'
import { ESPION_ANY, espionQuestionValues, type EspionAnswer, type EspionQuestionId } from '@/lib/espion/data/questions'
import { ESPION_QUESTION_TIMEOUT_MS } from '@/lib/espion/engine'

const ANSWER_BUTTON =
  'flex min-h-[3rem] items-center justify-center rounded-xl px-3 py-2 text-sm font-bold leading-tight transition-all active:scale-95 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-cream'

/**
 * « Mila te demande : on y va plutôt le jour ou la nuit ? » — la carte crème
 * de l'interrogé : une touche par réponse possible, plus « ça dépend », et le
 * temps restant (barre + chiffre) des 25 s au bout desquelles la question
 * n'attend plus. `questionKey` : la tournure tirée pour la bulle du fil
 * (espionExchangeKeys), pour que la carte reprenne mot pour mot la question
 * que la table vient de lire.
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
  const endsAt = askedAt + ESPION_QUESTION_TIMEOUT_MS

  return (
    <div className="space-y-3 rounded-2xl border border-[#D8CCAE] bg-cream p-3 text-[#24201A] shadow-[0_10px_24px_-14px_rgba(0,0,0,0.7)]">
      <p className="text-base leading-snug">
        <span className="font-bold">{t('askedYou', { name: askerName })}</span> {t(questionKey)}
      </p>
      <div className="grid grid-cols-2 gap-2">
        {answers.map((value) => (
          <button
            key={value}
            type="button"
            onClick={() => onAnswer(value)}
            disabled={disabled}
            className={
              value === ESPION_ANY
                ? `${ANSWER_BUTTON} col-span-2 border border-[#24201A]/30 text-[#24201A]`
                : `${ANSWER_BUTTON} bg-felt-deep text-cream`
            }
          >
            <span className="block first-letter:uppercase">{labelOf(value)}</span>
          </button>
        ))}
      </div>
      {/* Sur crème : piste et remplissage à l'encre, rouge carreau quand ça presse. */}
      <div className="flex items-center gap-3">
        <PhaseCountdown
          variant="bar"
          endsAt={endsAt}
          total={ESPION_QUESTION_TIMEOUT_MS}
          dangerMs={8_000}
          className="h-2 min-w-0 flex-1 overflow-hidden rounded-full bg-[#24201A]/10"
          barClassName="h-full rounded-full"
          colorClassName="bg-[#24201A]/70"
          dangerClassName="bg-suit-red"
        />
        <PhaseCountdown endsAt={endsAt}>
          {({ seconds }) => (
            <span
              role="timer"
              className={`shrink-0 text-sm font-bold tabular-nums ${seconds <= 8 ? 'text-suit-red' : ''}`}
            >
              {formatCountdown(seconds)}
            </span>
          )}
        </PhaseCountdown>
      </div>
    </div>
  )
}
