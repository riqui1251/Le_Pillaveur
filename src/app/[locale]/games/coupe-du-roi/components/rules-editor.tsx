"use client"

import { useId } from 'react'
import { useTranslations } from 'next-intl'
import { RotateCcw } from 'lucide-react'
import type { AmbianceMode } from '@/lib/ambiance-mode'
import { Button } from '@/components/ui/button'
import { useConfirmAction } from '@/components/game/ConfirmActionDialog'
import { cn } from '@/lib/utils'
import {
  COUPE_RANKS,
  COUPE_RULE_MAX_LENGTH,
  cleanCoupeOverrides,
  cleanCoupeText,
  type CoupeCupMode,
  type CoupeOverrides,
  type CoupeRank,
} from '@/lib/coupe-du-roi/engine'
import { useCoupeRuleText } from './coupe-ui'

/**
 * Les 13 règles d'origine, chacune avec un champ pour la version de la table.
 * Un champ vide garde la règle d'origine ; le tout est gardé sur l'appareil
 * par la page (lp-coupe-du-roi-rules).
 */
export function RulesEditor({
  drafts,
  onChange,
  cup,
  ambiance,
}: {
  drafts: CoupeOverrides
  onChange: (next: CoupeOverrides) => void
  cup: CoupeCupMode
  ambiance: AmbianceMode
}) {
  const t = useTranslations('games.coupe-du-roi')
  const ruleText = useCoupeRuleText(ambiance)
  const [confirmDialog, confirm] = useConfirmAction()
  const baseId = useId()
  const modified = Object.keys(cleanCoupeOverrides(drafts)).length
  const originals = { cup, overrides: {} }

  const setDraft = (rank: CoupeRank, value: string) => {
    const next: CoupeOverrides = { ...drafts }
    next[rank] = value
    onChange(next)
  }

  // Effacer jusqu'à 13 règles écrites à la main d'un seul toucher : on demande.
  const askReset = async () => {
    const ok = await confirm({
      title: t('page.resetConfirm.title'),
      description: t('page.resetConfirm.description', { count: modified }),
      confirmLabel: t('page.resetConfirm.confirm'),
      cancelLabel: t('page.resetConfirm.cancel'),
      tone: 'danger',
    })
    if (ok) onChange({})
  }

  return (
    <div className="space-y-3">
      {confirmDialog}
      <p className="text-sm text-cream/70">{t('page.customizeHint')}</p>
      <ul className="space-y-2">
        {COUPE_RANKS.map((rank, index) => {
          const original = ruleText(rank, originals)
          const inputId = `${baseId}-${rank}`
          const nextRank: CoupeRank | undefined = COUPE_RANKS[index + 1]
          const changed = Boolean(cleanCoupeText(drafts[rank]))
          return (
            <li
              key={rank}
              className={cn('rounded-xl border p-3', changed ? 'border-gold/40 bg-gold/10' : 'border-transparent bg-black/20')}
            >
              <div className="flex items-start gap-3">
                <span
                  aria-hidden
                  className="flex h-9 w-7 shrink-0 items-center justify-center rounded-md border border-[#D8CCAE] bg-cream font-display text-xs font-bold text-[#24201A]"
                >
                  {rank}
                </span>
                <div className="min-w-0 flex-1">
                  <label htmlFor={inputId} className="block text-sm font-bold text-cream">
                    {t('page.rankRule', { rank: t(`ranks.${rank}`), title: original.title })}
                  </label>
                  <p className="mt-0.5 text-xs leading-snug text-cream/70">{original.text}</p>
                </div>
              </div>
              <input
                id={inputId}
                type="text"
                value={drafts[rank] ?? ''}
                maxLength={COUPE_RULE_MAX_LENGTH}
                autoComplete="off"
                enterKeyHint={nextRank ? 'next' : 'done'}
                placeholder={t('page.customPlaceholder')}
                onChange={(e) => setDraft(rank, e.target.value)}
                onKeyDown={(e) => {
                  // Hors formulaire, « Suivant » du clavier ne fait rien (iPhone) : on passe nous-mêmes au rang suivant.
                  if (e.key !== 'Enter' || e.nativeEvent.isComposing) return
                  e.preventDefault()
                  if (nextRank) document.getElementById(`${baseId}-${nextRank}`)?.focus()
                  else e.currentTarget.blur()
                }}
                className="mt-2 h-12 w-full min-w-0 rounded-xl border border-cream/50 bg-black/30 px-4 text-base font-semibold text-cream placeholder:text-cream/60 focus:border-gold focus:outline-none focus:ring-2 focus:ring-gold/40"
              />
            </li>
          )
        })}
      </ul>
      <Button
        type="button"
        variant="quiet"
        size="game"
        className="w-full"
        disabled={modified === 0}
        onClick={() => void askReset()}
      >
        <RotateCcw aria-hidden className="mr-2 h-5 w-5" />
        {t('page.reset')}
      </Button>
    </div>
  )
}
