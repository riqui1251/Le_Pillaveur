"use client"

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { TargetGrid, type TargetGridPlayer } from '../TargetGrid'
import type { EspionQuestionId } from '@/lib/espion/data/questions'

/**
 * Poser une question : la cible d'abord (TargetGrid, sans celui qui vient de
 * m'interroger), puis trois questions parmi les moins posées de la manche.
 * Le choix vit ici le temps de la saisie ; le parent referme la feuille quand
 * la phase ou mes propres échanges changent, pas à chaque parole de bot.
 */
export function AskSheet({
  title,
  targets,
  excludeIds,
  iconOf,
  selfId,
  questionsFor,
  asksLeft,
  disabled,
  onAsk,
  onCancel,
}: {
  title: string
  targets: readonly TargetGridPlayer[]
  excludeIds: string[]
  iconOf: (p: TargetGridPlayer) => string
  selfId: string
  /** Les questions proposées pour cette cible (trois au plus). */
  questionsFor: (targetId: string) => EspionQuestionId[]
  asksLeft: { n: number; max: number }
  disabled: boolean
  onAsk: (targetId: string, questionId: EspionQuestionId) => void
  onCancel: () => void
}) {
  const t = useTranslations('games.espion.game')
  const [targetId, setTargetId] = useState<string | null>(null)
  const target = targets.find((p) => p.id === targetId)

  return (
    <div className="space-y-2 rounded-2xl border border-gold/30 bg-felt-deep/[0.85] p-3">
      <p className="text-center text-sm font-bold text-cream">{title}</p>
      {!target ? (
        <>
          <p className="text-center text-xs font-semibold text-white/60">{t('askWho')}</p>
          <TargetGrid
            players={targets}
            iconOf={iconOf}
            onPick={setTargetId}
            disabled={disabled}
            excludeIds={excludeIds}
            youLabel={t('you')}
            selfId={selfId}
          />
        </>
      ) : (
        <>
          <p className="text-center text-xs font-semibold text-white/60">{t('askWhich', { name: target.name })}</p>
          <div className="space-y-1.5">
            {questionsFor(target.id).map((questionId) => (
              <button
                key={questionId}
                onClick={() => onAsk(target.id, questionId)}
                disabled={disabled}
                className="w-full rounded-xl border border-[#D8CCAE] bg-cream px-3 py-2.5 text-left text-sm font-bold text-[#24201A] shadow-[0_6px_14px_-8px_rgba(0,0,0,0.55)] transition-all active:scale-95 disabled:opacity-50"
              >
                <span className="block first-letter:uppercase">{t(`qa.${questionId}.q`)}</span>
              </button>
            ))}
          </div>
        </>
      )}
      <p className="text-center text-[11px] text-white/40">{t('asksLeft', asksLeft)}</p>
      <button
        onClick={() => (target ? setTargetId(null) : onCancel())}
        className="w-full text-center text-[11px] font-semibold text-white/40"
      >
        {t('cancel')}
      </button>
    </div>
  )
}
