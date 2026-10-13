"use client"

import { useTranslations } from 'next-intl'

interface ResumeGamePromptProps {
  onResume: () => void
  onDiscard: () => void
}

/**
 * « Reprendre la partie en cours ? » commun aux jeux locaux : le layout
 * parent fournit déjà le feutre, donc ni fond ni min-h-screen ici.
 */
export function ResumeGamePrompt({ onResume, onDiscard }: ResumeGamePromptProps) {
  const tCommon = useTranslations('common')

  return (
    <div className="flex min-h-[60vh] w-full items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-gold/20 bg-felt-deep/80 p-6 text-center text-cream shadow-[0_18px_50px_-24px_rgba(0,0,0,0.85)]">
        <h2 className="font-display text-xl font-bold text-cream">{tCommon('resumeGame.title')}</h2>
        <p className="text-sm text-cream/70">{tCommon('resumeGame.body')}</p>
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={onResume}
            className="w-full rounded-2xl bg-amber-500 py-3 text-base font-bold text-black hover:bg-amber-400 disabled:opacity-40"
          >
            {tCommon('resumeGame.resume')}
          </button>
          <button
            type="button"
            onClick={onDiscard}
            className="w-full rounded-2xl border border-gold/25 bg-black/20 py-3 text-sm font-semibold text-cream/80 transition-colors hover:bg-black/30 hover:text-cream"
          >
            {tCommon('resumeGame.newGame')}
          </button>
        </div>
      </div>
    </div>
  )
}
