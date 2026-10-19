"use client"

import { useTranslations } from 'next-intl'
import { Beer, Leaf, Trophy } from 'lucide-react'
import { cn } from '@/lib/utils'
import { EndConfetti } from '@/components/online/EndConfetti'
import type { TvPbPlayer } from './model'
import type { PbTexts } from './online-view'
import { TvPbPawn } from './TvPbScreen'

const DIFFICULTY_EMOJI: Record<string, string> = { facile: '🌱', normal: '🌟', difficile: '🔥', extreme: '💀' }

/**
 * Fin de partie, comme l'écran de victoire du téléphone : vainqueur, tours,
 * joueurs, difficulté, puis le classement final (case et gorgées).
 * `players` porte les positions et gorgées FINALES.
 */
export function TvPbVictory({
  players,
  winnerId,
  turnCount,
  difficulty,
  texts,
}: {
  players: TvPbPlayer[]
  winnerId: string | null
  turnCount: number | null
  difficulty: string | null
  texts: PbTexts
}) {
  const t = useTranslations('tv')
  const winner = players.find((p) => p.id === winnerId) ?? null
  const ranking = [...players].sort((a, b) => b.position - a.position)
  const compact = ranking.length > 8
  const visible = ranking.slice(0, compact ? 12 : 8)
  const hidden = ranking.length - visible.length
  const DrinkGlyph = texts.soft ? Leaf : Beer
  const stats: { value: string; label: string }[] = []
  if (turnCount != null) stats.push({ value: String(turnCount), label: texts.t('game.victory.turns') })
  stats.push({ value: String(players.length), label: texts.t('game.victory.players') })
  if (difficulty && difficulty in DIFFICULTY_EMOJI) {
    stats.push({
      value: `${DIFFICULTY_EMOJI[difficulty]} ${texts.t(`difficultyLabels.${difficulty}`)}`,
      label: texts.t('game.victory.difficulty'),
    })
  }

  return (
    <div className="relative mx-auto flex min-h-0 w-full max-w-[80rem] flex-1 items-center gap-10 px-8 py-4">
      <EndConfetti pieces={220} />
      <div className="relative flex min-w-0 flex-1 flex-col items-center gap-5 text-center">
        <div className="flex h-24 w-24 items-center justify-center rounded-3xl bg-gradient-to-br from-amber-400 to-orange-500 shadow-xl">
          <Trophy aria-hidden className="h-14 w-14 text-felt-deep" />
        </div>
        <p className="text-xl font-bold uppercase tracking-[0.3em] text-gold/90">{t('winner')}</p>
        {winner && (
          <div className="flex min-w-0 max-w-full items-center gap-5">
            <TvPbPawn player={winner} size={5} active />
            <p
              className={cn(
                'min-w-0 truncate font-display font-bold leading-tight text-gold',
                winner.name.length > 12 ? 'text-6xl' : 'text-7xl'
              )}
            >
              {winner.name}
            </p>
          </div>
        )}
        <p className="text-2xl font-semibold text-white/80">{texts.t('game.victory.wonGame')}</p>
        <div className="flex flex-wrap justify-center gap-4">
          {stats.map((s) => (
            <div key={s.label} className="min-w-[9rem] rounded-2xl border border-white/10 bg-white/5 px-5 py-3">
              <p className="text-3xl font-black text-amber-300">{s.value}</p>
              <p className="text-lg font-semibold text-white/75">{s.label}</p>
            </div>
          ))}
        </div>
      </div>
      <div className="relative flex w-[30rem] shrink-0 flex-col gap-2">
        <p className="text-base font-bold uppercase tracking-[0.2em] text-white/80">{texts.t('game.finalRanking')}</p>
        <ol className={cn('flex flex-col', compact ? 'gap-1' : 'gap-2')}>
          {visible.map((p, i) => (
            <li
              key={p.id}
              className={cn(
                'flex items-center gap-3 rounded-2xl border px-4',
                compact ? 'py-0.5' : 'py-1.5',
                p.id === winnerId ? 'border-amber-400/40 bg-amber-500/[0.15]' : 'border-white/10 bg-white/5'
              )}
            >
              <span className="w-8 shrink-0 text-center text-xl font-black tabular-nums text-white/75">{i + 1}</span>
              <TvPbPawn player={p} size={compact ? 2 : 2.5} />
              <span className="min-w-0 flex-1 truncate text-2xl font-bold text-white">{p.name}</span>
              <span className="shrink-0 text-xl font-semibold text-white/80">
                {t('position')} {p.position + 1}
              </span>
              <span className="flex w-20 shrink-0 items-center justify-end gap-1 text-xl font-black tabular-nums text-red-300">
                <span aria-hidden>{p.drinks}</span>
                <DrinkGlyph aria-hidden className="h-6 w-6" />
                <span className="sr-only">{texts.t('game.drinksShort', { count: p.drinks })}</span>
              </span>
            </li>
          ))}
          {hidden > 0 && (
            <li className="rounded-2xl border border-white/10 bg-white/5 px-4 py-0.5 text-center text-xl font-bold text-white/75">
              +{hidden}
            </li>
          )}
        </ol>
      </div>
    </div>
  )
}
