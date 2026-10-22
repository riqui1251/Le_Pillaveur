"use client"

import { useTranslations } from 'next-intl'
import { TargetGrid, type TargetGridPlayer } from '../TargetGrid'
import type { EspionQuestionId } from '@/lib/espion/data/questions'

/**
 * Poser une question : la cible d'abord (TargetGrid, sans celui qui vient de
 * m'interroger), puis trois questions parmi les moins posées de la manche.
 * La cible est tenue par le parent : « Retour » et « Annuler » vivent dans la
 * barre du bas, sous le pouce, et la feuille se referme quand la phase ou mes
 * propres échanges changent, pas à chaque parole de bot.
 */
export function AskSheet({
  title,
  targets,
  excludeIds,
  excludedMeta,
  iconOf,
  selfId,
  questionsFor,
  targetId,
  onTargetChange,
  disabled,
  onAsk,
}: {
  title: string
  targets: readonly TargetGridPlayer[]
  excludeIds: string[]
  /** Pourquoi une cible est grisée (« vient de t'interroger »), sous son nom. */
  excludedMeta?: string
  iconOf: (p: TargetGridPlayer) => string
  selfId: string
  /** Les questions proposées pour cette cible (trois au plus). */
  questionsFor: (targetId: string) => EspionQuestionId[]
  targetId: string | null
  onTargetChange: (targetId: string | null) => void
  disabled: boolean
  onAsk: (targetId: string, questionId: EspionQuestionId) => void
}) {
  const t = useTranslations('games.espion.game')
  const target = targets.find((p) => p.id === targetId)

  return (
    <div className="space-y-3 rounded-2xl border border-gold/30 bg-felt-deep/80 p-3">
      <p className="text-center font-display text-base font-bold text-gold">{title}</p>
      {!target ? (
        <>
          <p className="text-center text-sm text-cream/80">{t('askWho')}</p>
          <TargetGrid
            players={targets}
            iconOf={iconOf}
            onPick={onTargetChange}
            disabled={disabled}
            excludeIds={excludeIds}
            meta={excludedMeta ? (p) => (excludeIds.includes(p.id) ? excludedMeta : null) : undefined}
            youLabel={t('you')}
            selfId={selfId}
          />
        </>
      ) : (
        <>
          <p className="text-center text-sm text-cream/80">{t('askWhich', { name: target.name })}</p>
          <div className="space-y-2">
            {questionsFor(target.id).map((questionId) => (
              <button
                key={questionId}
                type="button"
                onClick={() => onAsk(target.id, questionId)}
                disabled={disabled}
                className="flex min-h-[3rem] w-full items-center rounded-xl border border-[#D8CCAE] bg-cream px-3 py-2 text-left text-sm font-bold leading-snug text-[#24201A] shadow-[0_6px_14px_-8px_rgba(0,0,0,0.55)] transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold focus-visible:ring-offset-2 focus-visible:ring-offset-felt-deep active:scale-95 disabled:opacity-50"
              >
                <span className="block first-letter:uppercase">{t(`qa.${questionId}.q`)}</span>
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  )
}
