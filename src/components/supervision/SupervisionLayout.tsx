"use client"

import type { ComponentType, ReactNode } from 'react'
import { cn } from '@/lib/utils'

/**
 * Ossature visuelle de la supervision — direction artistique sobre et nette :
 * fond très sombre (#07060b), un unique halo ambre discret, trame de points
 * légère, contours francs, accent ambre réservé à l'essentiel. Aucun gradient
 * agressif ni glow. Tous ces composants sont purement présentationnels.
 */

type IconType = ComponentType<{ className?: string }>

/** Fond immersif contenu + conteneur centré. */
export function SupervisionShell({ children }: { children: ReactNode }) {
  return (
    <main className="relative min-h-screen overflow-x-hidden bg-[#07060b] text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 right-0 h-72 w-72 rounded-full bg-amber-500/10 blur-[130px]" />
        <div
          className="absolute inset-0 opacity-[0.35]"
          style={{
            backgroundImage:
              'radial-gradient(circle at 1px 1px, rgba(255,255,255,0.05) 1px, transparent 0)',
            backgroundSize: '30px 30px',
          }}
        />
      </div>
      <div className="relative mx-auto max-w-6xl space-y-5 px-3 pb-24 pt-4 sm:px-6 sm:pb-16 sm:pt-6">
        {children}
      </div>
    </main>
  )
}

/** En-tête : identité (bouclier + sur-titre + titre) et infos vivantes à droite. */
export function SupervisionHeader({
  kicker,
  title,
  roleBadge,
  onlineLabel,
  onRefresh,
  refreshLabel,
  refreshing,
}: {
  kicker: string
  title: string
  roleBadge: ReactNode
  onlineLabel: string
  onRefresh: () => void
  refreshLabel: string
  refreshing?: boolean
}) {
  return (
    <header className="flex flex-wrap items-center gap-3 border-b border-white/10 pb-4">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-amber-400/30 bg-amber-500/10 text-amber-300">
        <ShieldGlyph />
      </span>
      <div className="mr-auto min-w-0">
        <p className="text-[11px] font-semibold uppercase tracking-[0.18em] text-white/40">{kicker}</p>
        <h1 className="truncate text-lg font-bold text-white sm:text-xl">{title}</h1>
      </div>
      <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-200">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        {onlineLabel}
      </span>
      {roleBadge}
      <button
        type="button"
        onClick={onRefresh}
        className="inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] px-2.5 text-xs font-medium text-white/70 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
        aria-label={refreshLabel}
      >
        <RefreshGlyph spinning={refreshing} />
        <span className="hidden sm:inline">{refreshLabel}</span>
      </button>
    </header>
  )
}

export type SupervisionNavGroup = {
  label: string
  items: Array<{
    value: string
    label: string
    icon: IconType
    count?: number | string
    /** Ton du compteur : neutre par défaut, ou coloré selon l'urgence. */
    tone?: 'neutral' | 'danger' | 'warning'
  }>
}

/**
 * Navigation groupée à icônes. Desktop : barre unique avec libellés de groupe
 * en séparateurs ; mobile : même barre en défilement horizontal (pas un menu
 * déroulant réducteur). Les compteurs colorés signalent l'urgence.
 */
export function SupervisionNav({
  groups,
  active,
  onSelect,
  groupAria,
}: {
  groups: SupervisionNavGroup[]
  active: string
  onSelect: (value: string) => void
  groupAria: string
}) {
  return (
    <nav
      aria-label={groupAria}
      className="flex items-center gap-1 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03] p-1.5 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {groups.map((group, gi) => (
        <div key={group.label} className="flex shrink-0 items-center gap-1">
          {gi > 0 && <span className="mx-1 h-5 w-px shrink-0 bg-white/10" aria-hidden />}
          <span className="hidden shrink-0 px-1.5 text-[10px] font-semibold uppercase tracking-wider text-white/30 lg:inline">
            {group.label}
          </span>
          {group.items.map((item) => {
            const isActive = item.value === active
            const Icon = item.icon
            return (
              <button
                key={item.value}
                type="button"
                onClick={() => onSelect(item.value)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50',
                  isActive
                    ? 'border border-amber-400/40 bg-amber-500/15 text-amber-100'
                    : 'border border-transparent text-white/60 hover:bg-white/[0.06] hover:text-white'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">{item.label}</span>
                {item.count != null && item.count !== '' && (
                  <span
                    className={cn(
                      'ml-0.5 rounded-full px-1.5 py-px text-[11px] font-semibold tabular-nums',
                      item.tone === 'danger'
                        ? 'bg-rose-500/20 text-rose-200'
                        : item.tone === 'warning'
                          ? 'bg-amber-500/20 text-amber-200'
                          : 'bg-white/10 text-white/60'
                    )}
                  >
                    {item.count}
                  </span>
                )}
              </button>
            )
          })}
        </div>
      ))}
    </nav>
  )
}

/** Panneau encadré cohérent : en-tête (icône + titre + actions) puis corps. */
export function SectionCard({
  icon: Icon,
  title,
  description,
  actions,
  children,
  className,
  bodyClassName,
}: {
  icon?: IconType
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  children: ReactNode
  className?: string
  bodyClassName?: string
}) {
  return (
    <section className={cn('rounded-2xl border border-white/10 bg-white/[0.02]', className)}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-white/[0.07] px-4 py-3.5 sm:px-5">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-base font-semibold text-white">
            {Icon && <Icon className="h-[18px] w-[18px] shrink-0 text-amber-400" />}
            {title}
          </h2>
          {description && (
            <p className="mt-0.5 text-xs leading-relaxed text-white/45">{description}</p>
          )}
        </div>
        {actions && <div className="flex shrink-0 flex-wrap items-center gap-2">{actions}</div>}
      </div>
      <div className={cn('p-4 sm:p-5', bodyClassName)}>{children}</div>
    </section>
  )
}

/**
 * Bento de chiffres clés : un KPI « héros » mis en avant (accent ambre) + des
 * métriques secondaires plus discrètes. Volontairement non uniforme.
 */
export function KpiBento({
  hero,
  metrics,
}: {
  hero: { label: string; value: number; hint?: string; icon: IconType }
  metrics: Array<{ label: string; value: number; hint?: string }>
}) {
  const HeroIcon = hero.icon
  return (
    <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
      <div className="col-span-2 rounded-2xl border border-amber-400/25 bg-amber-500/[0.07] p-4 sm:p-5">
        <div className="flex items-center gap-1.5 text-xs font-medium text-amber-200/80">
          <HeroIcon className="h-4 w-4 shrink-0" />
          {hero.label}
        </div>
        <div className="mt-1 text-3xl font-bold tabular-nums text-white sm:text-4xl">
          {hero.value.toLocaleString('fr-FR')}
        </div>
        {hero.hint && <p className="mt-0.5 text-xs text-white/45">{hero.hint}</p>}
      </div>
      {metrics.map((m) => (
        <div key={m.label} className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
          <div className="text-xs font-medium text-white/55">{m.label}</div>
          <div className="mt-1 text-2xl font-bold tabular-nums text-white">
            {m.value.toLocaleString('fr-FR')}
          </div>
          {m.hint && <p className="mt-0.5 text-[11px] text-white/40">{m.hint}</p>}
        </div>
      ))}
    </div>
  )
}

/** Squelette de chargement : lignes pulsantes (vrai état de chargement). */
export function SkeletonRows({ rows = 4 }: { rows?: number }) {
  return (
    <div className="space-y-2" aria-hidden>
      {Array.from({ length: rows }).map((_, i) => (
        <div
          key={i}
          className="flex items-center gap-3 rounded-xl border border-white/[0.06] bg-white/[0.02] p-3"
        >
          <div className="h-9 w-9 shrink-0 animate-pulse rounded-full bg-white/[0.06]" />
          <div className="flex-1 space-y-2">
            <div className="h-2.5 w-1/3 animate-pulse rounded-full bg-white/[0.06]" />
            <div className="h-2 w-1/2 animate-pulse rounded-full bg-white/[0.05]" />
          </div>
        </div>
      ))}
    </div>
  )
}

/** État vide accueillant (invitation, pas excuse). */
export function EmptyState({
  icon: Icon,
  title,
  hint,
}: {
  icon: IconType
  title: string
  hint?: string
}) {
  return (
    <div className="flex flex-col items-center gap-1.5 rounded-xl border border-dashed border-white/10 bg-white/[0.01] px-4 py-8 text-center">
      <Icon className="h-6 w-6 text-white/30" />
      <p className="text-sm font-medium text-white/80">{title}</p>
      {hint && <p className="max-w-xs text-xs text-white/40">{hint}</p>}
    </div>
  )
}

/** État d'erreur avec action réessayer. */
export function ErrorState({
  icon: Icon,
  message,
  retryLabel,
  onRetry,
}: {
  icon: IconType
  message: string
  retryLabel: string
  onRetry: () => void
}) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-xl border border-rose-500/25 bg-rose-500/[0.06] px-4 py-6 text-center">
      <Icon className="h-6 w-6 text-rose-300" />
      <p className="text-sm text-rose-100">{message}</p>
      <button
        type="button"
        onClick={onRetry}
        className="mt-1 inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/15 bg-white/[0.06] px-3 text-xs font-medium text-white transition-colors hover:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
      >
        {retryLabel}
      </button>
    </div>
  )
}

// ── Glyphes internes (évite d'alourdir les imports d'icônes de la page) ──────

function ShieldGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 3l7 3v5c0 4.5-3 7.5-7 9-4-1.5-7-4.5-7-9V6l7-3z" />
      <path d="M12 3v18" opacity="0.5" />
    </svg>
  )
}

function RefreshGlyph({ spinning }: { spinning?: boolean }) {
  return (
    <svg
      viewBox="0 0 24 24"
      className={cn('h-4 w-4', spinning && 'animate-spin')}
      fill="none"
      stroke="currentColor"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
    >
      <path d="M21 12a9 9 0 1 1-3-6.7L21 8" />
      <path d="M21 3v5h-5" />
    </svg>
  )
}
