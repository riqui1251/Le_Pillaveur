"use client"

import { useId, type ReactNode } from 'react'
import { useTranslations } from 'next-intl'
import { ArrowLeft, ChevronDown, ChevronRight, Users } from 'lucide-react'
import type { Player } from '@/lib/players'
import { getGameById } from '@/lib/games'
import { useLocalizedGame } from '@/lib/games-i18n'
import { cn } from '@/lib/utils'
import { Link, usePathname, useRouter } from '@/i18n/navigation'
import { useAuth } from '@/hooks/useAuth'
import { resolveNextGamePath } from '@/lib/next-game-path'
import { enterLocalPlay } from '@/lib/local-play-client'
import { GameIconById } from '@/components/hub/GameIconById'
import { GameFixedActionBar, gameActionBarPadding } from '@/components/game/GameFixedActionBar'
import { Button } from '@/components/ui/button'
import { PlayerIcon } from '@/components/ui/PlayerIcon'
import { PlayerName } from '@/components/ui/PlayerName'

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
 *
 * L'action du moment (« Commencer la partie », ou « Sélectionner les joueurs »
 * tant qu'il en manque) vit dans une barre FIXE en bas, dans la zone du
 * pouce : en fin de flux, après l'en-tête, les joueurs et les options du jeu,
 * elle tombait vers 840-900 px à 375×667, hors de l'écran du joueur qui
 * reçoit le téléphone.
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

  const needMore = players.length < min
  const empty = players.length === 0
  const tall = !needMore && Boolean(secondaryAction)

  // Lien « Modifier » de la section Joueurs. À 0 joueur il n'existe pas : le
  // bouton de la barre fait exactement la même chose, et le même geste
  // apparaissait deux fois, flèche « retour » en prime.
  const playersLinkClass =
    'inline-flex min-h-[44px] items-center gap-1 text-sm font-semibold text-gold hover:text-gold-strong'
  const playersLinkContent = (
    <>
      {tCommon('modify')}
      <ChevronRight className="h-4 w-4" aria-hidden />
    </>
  )
  const playersLink = empty ? undefined : isVisitor ? (
    <button type="button" onClick={goToPlayers} className={playersLinkClass}>
      {playersLinkContent}
    </button>
  ) : (
    <Link href={playersHref} className={playersLinkClass}>
      {playersLinkContent}
    </Link>
  )

  const selectContent = (
    <>
      <Users className="mr-2 h-5 w-5" aria-hidden />
      {tPlayers('selectTitle')}
    </>
  )

  return (
    // Pas de `py`/`sm:py-*` : un `sm:py-8` l'emportait dès 640 px sur le
    // padding de la barre fixe, qui recouvrait alors la fin du pré-lobby.
    <div className={cn('mx-auto w-full max-w-lg px-1 pt-4 sm:pt-8', gameActionBarPadding(tall ? 'tall' : 'default'))}>
      <header className="flex items-center gap-3">
        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl border border-gold/30 bg-felt-deep">
          <GameIconById id={gameId} surface="felt" className="h-8 w-8" />
        </div>
        <div className="min-w-0">
          <h1 className="font-display text-2xl font-bold leading-tight tracking-tight text-cream">{game?.title}</h1>
          <p className="mt-0.5 text-[13px] leading-snug text-cream/70">{description ?? game?.description}</p>
        </div>
      </header>

      <div className="mt-5 space-y-4">
        <PrelobbySection
          label={empty ? tCommon('players') : `${tCommon('players')} — ${players.length}`}
          action={playersLink}
        >
          {empty ? (
            // Places vides en pointillé : la table attend ses joueurs.
            <div aria-hidden className="mb-2 flex flex-wrap gap-2">
              {Array.from({ length: Math.min(min, 3) }, (_, i) => (
                <span key={i} className="h-9 w-24 rounded-full border border-dashed border-gold/40" />
              ))}
            </div>
          ) : (
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
          )}
          {/* Le seul endroit qui dit ce qui manque (il était répété dans un
              encadré or juste au-dessus du bouton). */}
          {needMore && (
            <p className={cn('text-sm text-cream/80', !empty && 'mt-3')}>
              {tPlayers('selectionStatus.needMore', { min, current: players.length })}
            </p>
          )}
        </PrelobbySection>

        {children}
      </div>

      <Link
        href="/jeux"
        className="mx-auto mt-6 flex w-fit min-h-[44px] items-center gap-1.5 text-sm text-cream/70 transition-colors hover:text-cream"
      >
        <ArrowLeft className="h-4 w-4" aria-hidden />
        {tCommon('backToGames')}
      </Link>

      <GameFixedActionBar maxWidthClass="max-w-lg">
        {needMore ? (
          isVisitor ? (
            <Button type="button" variant="primary" size="gameLg" onClick={goToPlayers} className="w-full">
              {selectContent}
            </Button>
          ) : (
            <Button asChild variant="primary" size="gameLg" className="w-full">
              <Link href={playersHref}>{selectContent}</Link>
            </Button>
          )
        ) : (
          <div className="space-y-2">
            <Button
              type="button"
              variant="primary"
              size="gameLg"
              onClick={onStart}
              disabled={startDisabled}
              className="w-full"
            >
              {startLabel ?? tPlayers('startGame')}
            </Button>
            {secondaryAction}
          </div>
        )}
      </GameFixedActionBar>
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
      {/* Intertitre en 12 px or plein (6,7:1) : en 11 px à 75 %, il tombait
          sous 4,5:1 sur le feutre. */}
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">
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
      <h2 className="font-display text-xs font-semibold uppercase tracking-[0.18em] text-gold">
        <button
          type="button"
          onClick={onToggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-h-[44px] w-full items-center justify-between gap-3 text-left transition-colors hover:text-cream"
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
