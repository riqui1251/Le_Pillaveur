"use client"

import { useId, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowLeft, ChevronDown } from 'lucide-react'
import type { Player } from '@/lib/players'
import { getGameById } from '@/lib/games'
import { useLocalizedGame } from '@/lib/games-i18n'
import { cn } from '@/lib/utils'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { useAuth } from '@/hooks/useAuth'
import { resolveNextGamePath } from '@/lib/next-game-path'
import { enterLocalPlay } from '@/lib/local-play-client'
import { GameIconById } from '@/components/hub/GameIconById'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { PlayerName } from '@/components/ui/PlayerName'

const PRIMARY_BUTTON =
  'w-full rounded-2xl bg-amber-500 py-4 text-base font-bold text-black hover:bg-amber-400 disabled:opacity-40'

interface LocalGamePrelobbyProps {
  gameId: string
  players: Player[]
  minPlayers?: number
  onStart: () => void
  startLabel?: string
  startDisabled?: boolean
  description?: string
  children?: ReactNode
  secondaryAction?: ReactNode
}

/**
 * Pré-lobby commun des jeux locaux « un seul téléphone ». Le layout parent
 * (games/layout.tsx) fournit la coquille feutre + filet or : ni fond ni
 * min-h ici.
 */
export function LocalGamePrelobby({
  gameId,
  players,
  minPlayers,
  onStart,
  startLabel,
  startDisabled = false,
  description,
  children,
  secondaryAction,
}: LocalGamePrelobbyProps) {
  const tCommon = useTranslations('common')
  const tPlayers = useTranslations('players')
  const game = useLocalizedGame(gameId)
  const router = useRouter()
  const pathname = usePathname()
  const { user, loading: authLoading } = useAuth()

  const min = minPlayers ?? getGameById(gameId)?.localMinPlayers ?? 2
  const next = resolveNextGamePath(pathname)
  const playersHref = next ? `/joueurs?next=${encodeURIComponent(next)}` : '/joueurs'
  // Visiteur sans cookie de mode local : /joueurs est protégée, on pose le
  // cookie d'abord et on navigue même si la pose échoue (cf. SelectedPlayersDisplay).
  const isVisitor = !authLoading && !user
  const goToPlayers = () => {
    void enterLocalPlay()
      .catch(() => undefined)
      .then(() => router.push(playersHref))
  }

  const playersLinkClass =
    'inline-flex min-h-[44px] items-center gap-1.5 text-xs font-semibold text-gold hover:text-gold-strong'
  const playersLinkContent = (
    <>
      <ArrowLeft className="h-3.5 w-3.5" aria-hidden />
      {tPlayers('selectTitle')}
    </>
  )
  const playersLink = isVisitor ? (
    <button type="button" onClick={goToPlayers} className={playersLinkClass}>
      {playersLinkContent}
    </button>
  ) : (
    <Link href={playersHref} className={playersLinkClass}>
      {playersLinkContent}
    </Link>
  )

  const needMore = players.length < min

  return (
    <div className="mx-auto w-full max-w-lg px-1 py-4 sm:py-8">
      <header className="text-center">
        <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl border border-gold/30 bg-gold/10 text-gold">
          <GameIconById id={gameId} className="h-8 w-8" />
        </div>
        <h1 className="font-display text-3xl font-bold tracking-tight text-cream">{game?.title}</h1>
        <p className="mx-auto mt-2 max-w-sm text-sm leading-snug text-cream/70">
          {description ?? game?.description}
        </p>
      </header>

      <div className="mt-6 space-y-4">
        <PrelobbySection label={`${tCommon('players')} — ${players.length}`} action={playersLink}>
          {players.length > 0 ? (
            <div className="flex flex-wrap gap-2">
              {players.map((p) => (
                <span
                  key={p.id}
                  className="flex items-center gap-1.5 rounded-full border border-gold/[0.15] bg-black/25 px-3 py-1.5 text-sm font-medium text-cream"
                >
                  <PlayerIcon player={p} size="sm" className="h-6 w-6 text-sm" />
                  <PlayerName player={p} />
                </span>
              ))}
            </div>
          ) : (
            <p className="text-sm text-cream/60">
              {tPlayers('selectionStatus.needMore', { min, current: 0 })}
            </p>
          )}
        </PrelobbySection>

        {children}

        {needMore ? (
          <>
            <div className="rounded-xl border border-gold/30 bg-gold/10 px-4 py-3 text-center text-sm text-gold">
              {tPlayers('selectionStatus.needMore', { min, current: players.length })}
            </div>
            {isVisitor ? (
              <button type="button" onClick={goToPlayers} className={PRIMARY_BUTTON}>
                {tPlayers('selectTitle')}
              </button>
            ) : (
              <Link href={playersHref} className={cn(PRIMARY_BUTTON, 'block text-center')}>
                {tPlayers('selectTitle')}
              </Link>
            )}
          </>
        ) : (
          <>
            <button type="button" onClick={onStart} disabled={startDisabled} className={PRIMARY_BUTTON}>
              {startLabel ?? tPlayers('startGame')}
            </button>
            {secondaryAction}
          </>
        )}
      </div>

      <Link
        href="/jeux"
        className="mx-auto mt-6 flex w-fit min-h-[44px] items-center gap-1.5 text-sm text-cream/60 transition-colors hover:text-cream"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {tCommon('backToGames')}
      </Link>
    </div>
  )
}

interface PrelobbySectionProps {
  label: string
  action?: ReactNode
  children: ReactNode
  className?: string
}

export function PrelobbySection({ label, action, children, className }: PrelobbySectionProps) {
  return (
    <section className={cn('rounded-2xl border border-gold/15 bg-felt-deep/70 p-4', className)}>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/75">
          {label}
        </h2>
        {action}
      </div>
      {children}
    </section>
  )
}

interface PrelobbyDisclosureProps {
  label: string
  open: boolean
  onToggle: () => void
  children: ReactNode
  className?: string
}

/**
 * Section repliable (règles du jeu…) : tout l'en-tête est le bouton, le
 * contenu se déplie en CSS pur (grille 0fr → 1fr) et reste dans le DOM à
 * hauteur nulle, masqué aux lecteurs d'écran — aucun vide une fois replié.
 */
export function PrelobbyDisclosure({ label, open, onToggle, children, className }: PrelobbyDisclosureProps) {
  const panelId = useId()
  return (
    <section className={cn('rounded-2xl border border-gold/15 bg-felt-deep/70 px-4 py-2', className)}>
      <h2 className="font-display text-[11px] font-semibold uppercase tracking-[0.2em] text-gold/75">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-h-[44px] w-full items-center justify-between gap-3 text-left transition-colors hover:text-gold"
        >
          {label}
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 text-cream/70 transition-transform duration-200', open && 'rotate-180')}
            aria-hidden
          />
        </button>
      </h2>
      <div
        id={panelId}
        aria-hidden={!open}
        className={cn(
          'grid transition-[grid-template-rows,opacity] duration-200 ease-out',
          open ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0'
        )}
      >
        <div className="overflow-hidden">
          <div className="border-t border-gold/[0.15] pb-2 pt-3">{children}</div>
        </div>
      </div>
    </section>
  )
}

interface PrelobbyChoiceProps {
  active: boolean
  onClick: () => void
  title: string
  description?: string
  icon?: ReactNode
  className?: string
}

export function PrelobbyChoice({
  active,
  onClick,
  title,
  description,
  icon,
  className,
}: PrelobbyChoiceProps) {
  return (
    <button
      type="button"
      aria-pressed={active}
      onClick={onClick}
      className={cn(
        'flex min-h-[44px] w-full flex-col items-start gap-0.5 rounded-xl border px-3 py-3 text-left transition-colors',
        active
          ? 'border-gold/60 bg-gold/[0.15] text-cream'
          : 'border-gold/[0.15] bg-black/20 text-cream/75 hover:border-gold/40 hover:text-cream',
        className
      )}
    >
      {icon && (
        <span aria-hidden className="text-xl leading-none">
          {icon}
        </span>
      )}
      <span className="text-sm font-bold">{title}</span>
      {description && (
        <span className={cn('text-xs', active ? 'text-cream/80' : 'text-cream/60')}>{description}</span>
      )}
    </button>
  )
}
