"use client"

import { useState } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowDown, ArrowUp, Plus, RefreshCw, Shuffle, X } from 'lucide-react'
import { Button } from '@/components/ui/button'
import { useLocalizedGames } from '@/lib/games-i18n'
import { soireeCounting, soireeGameColors, soireeHeat, soireeMinutes } from '@/lib/soiree/catalog'
import { addRound, moveRound, programHeat, programMinutes, removeRound, replaceRound, SOIREE_MAX_ROUNDS } from '@/lib/soiree/program'
import { GameBadge, HeatPips, gameGradient } from './soiree-ui'
import { GamePickerDialog } from './GamePickerDialog'

/** Courbe d'intensité du programme, de la chauffe au final (échelle 1 à 3). */
function HeatCurve({ program }: { program: readonly string[] }) {
  const t = useTranslations('soiree.programme')
  if (program.length < 2) return null
  const heats = programHeat(program)
  const W = 300
  const x0 = 18
  const x1 = W - 18
  const points = heats.map((h, i) => [x0 + (i * (x1 - x0)) / (heats.length - 1), 50 - (h - 1) * 18] as const)
  const line = points.map((p) => p.join(',')).join(' ')
  return (
    <svg viewBox={`0 0 ${W} 72`} className="h-auto w-full" role="img" aria-label={t('curve')}>
      <polygon points={`${x0},60 ${line} ${x1},60`} fill="rgba(217,164,65,0.14)" />
      <polyline points={line} fill="none" stroke="#D9A441" strokeWidth={2.5} strokeLinejoin="round" />
      {points.map(([x, y], i) => (
        <circle key={i} cx={x} cy={y} r={i === points.length - 1 ? 6 : 5} fill={soireeGameColors(program[i]).from} stroke="#F3EAD3" strokeWidth={1.5} />
      ))}
      <text x={x0} y={71} fill="rgba(243,234,211,0.6)" fontSize={10} fontWeight={700}>{t('warm')}</text>
      <text x={x1} y={71} fill="rgba(243,234,211,0.6)" fontSize={10} fontWeight={700} textAnchor="end">{t('final')}</text>
    </svg>
  )
}

type Picking = { mode: 'add' } | { mode: 'replace'; index: number } | null

/**
 * Le programme modifiable : monter, descendre, changer, retirer, ajouter.
 * `firstNumber` numérote la suite d'une soirée déjà commencée (entracte).
 */
export function ProgrammeEditor({
  program,
  onChange,
  playerCount,
  firstNumber = 1,
  onReroll,
}: {
  program: string[]
  onChange: (next: string[]) => void
  playerCount: number
  firstNumber?: number
  onReroll?: () => void
}) {
  const t = useTranslations('soiree.programme')
  const games = useLocalizedGames()
  const title = (id: string) => games.find((g) => g.id === id)?.title ?? id
  const [picking, setPicking] = useState<Picking>(null)

  const pick = (gameId: string) => {
    if (picking?.mode === 'replace') onChange(replaceRound(program, picking.index, gameId))
    else onChange(addRound(program, gameId))
    setPicking(null)
  }

  return (
    <div className="space-y-4">
      <p className="text-sm font-semibold text-cream/70">
        {program.length > 0 ? t('summary', { count: program.length, minutes: programMinutes(program) }) : t('empty')}
      </p>
      <HeatCurve program={program} />

      <ol className="space-y-2.5" aria-label={t('listLabel')}>
        {program.map((gameId, i) => {
          const isLast = i === program.length - 1
          const counting = soireeCounting(gameId)
          return (
            <li key={`${gameId}-${i}`} className="soiree-deal flex items-stretch gap-2.5" style={{ animationDelay: `${i * 70}ms` }}>
              <span aria-hidden className="w-6 shrink-0 pt-3 text-center font-display text-lg font-bold text-gold">
                {firstNumber + i}
              </span>
              <div className="relative min-w-0 flex-1 overflow-hidden rounded-xl border border-[#D8CCAE] bg-cream py-3 pl-4 pr-3 text-[#24201A] shadow-[0_10px_24px_-12px_rgba(0,0,0,0.6)]">
                <span aria-hidden className="absolute inset-y-0 left-0 w-1.5" style={{ background: gameGradient(gameId, 180) }} />
                <div className="flex items-start gap-2.5">
                  <GameBadge gameId={gameId} size="sm" />
                  <div className="min-w-0 flex-1">
                    <p className="font-display text-base font-bold leading-tight">
                      <span className="sr-only">{t('roundNumber', { number: firstNumber + i })} · </span>
                      {title(gameId)}
                    </p>
                    <p className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-[#5E5444]">
                      <HeatPips heat={soireeHeat(gameId)} />
                      <span>{t('minutes', { minutes: soireeMinutes(gameId) })}</span>
                      {counting !== 'auto' && <span className="font-semibold">{t(`counting.${counting}`)}</span>}
                    </p>
                  </div>
                </div>
                <div className="mt-2 flex items-center gap-1">
                  <button type="button" onClick={() => onChange(moveRound(program, i, i - 1))} disabled={i === 0} aria-label={t('up', { game: title(gameId) })} className="grid h-9 w-9 place-items-center rounded-lg border border-[#24201A]/20 transition hover:bg-[#24201A]/5 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">
                    <ArrowUp aria-hidden className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => onChange(moveRound(program, i, i + 1))} disabled={isLast} aria-label={t('down', { game: title(gameId) })} className="grid h-9 w-9 place-items-center rounded-lg border border-[#24201A]/20 transition hover:bg-[#24201A]/5 disabled:opacity-30 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">
                    <ArrowDown aria-hidden className="h-4 w-4" />
                  </button>
                  <button type="button" onClick={() => setPicking({ mode: 'replace', index: i })} className="ml-auto inline-flex h-9 items-center gap-1.5 rounded-lg border border-[#24201A]/20 px-2.5 text-sm font-bold transition hover:bg-[#24201A]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">
                    <RefreshCw aria-hidden className="h-3.5 w-3.5" />
                    {t('change')}
                  </button>
                  <button type="button" onClick={() => onChange(removeRound(program, i))} aria-label={t('remove', { game: title(gameId) })} className="grid h-9 w-9 place-items-center rounded-lg border border-[#24201A]/20 transition hover:bg-[#24201A]/5 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-gold">
                    <X aria-hidden className="h-4 w-4" />
                  </button>
                </div>
              </div>
            </li>
          )
        })}
      </ol>

      <div className="flex flex-wrap gap-2">
        <Button variant="quiet" size="game" onClick={() => setPicking({ mode: 'add' })} disabled={program.length >= SOIREE_MAX_ROUNDS}>
          <Plus aria-hidden className="mr-1.5 h-4 w-4" />
          {t('add')}
        </Button>
        {onReroll && (
          <Button variant="quiet" size="game" onClick={onReroll}>
            <Shuffle aria-hidden className="mr-1.5 h-4 w-4" />
            {t('reroll')}
          </Button>
        )}
      </div>

      <GamePickerDialog
        open={picking !== null}
        title={picking?.mode === 'replace' ? t('replaceTitle', { game: title(program[picking.index]) }) : t('addTitle')}
        playerCount={playerCount}
        inProgram={program}
        onPick={pick}
        onClose={() => setPicking(null)}
      />
    </div>
  )
}
