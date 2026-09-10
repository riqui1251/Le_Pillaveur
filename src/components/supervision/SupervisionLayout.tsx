"use client"

import type { ComponentType, ReactNode } from 'react'
import { Check, Loader2, X } from 'lucide-react'
import { cn } from '@/lib/utils'

/**
 * Ossature visuelle de la supervision — « Cartes sur Table » côté console :
 * le feutre du layout, un unique halo d'or discret, contours francs, accent
 * or réservé à l'essentiel. Aucun gradient agressif ni glow. Tous ces
 * composants sont purement présentationnels.
 */

type IconType = ComponentType<{ className?: string }>

/** Fond immersif contenu + conteneur centré. */
export function SupervisionShell({ children }: { children: ReactNode }) {
  return (
    <main className="relative min-h-screen overflow-x-hidden text-white">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -top-32 right-0 h-72 w-72 rounded-full bg-gold/10 blur-[130px]" />
      </div>
      <div className="relative mx-auto max-w-6xl space-y-5 px-3 pb-24 pt-4 sm:px-6 sm:pb-16 sm:pt-6">
        {children}
      </div>
    </main>
  )
}

/**
 * En-tête compact : ligne 1 = identité (bouclier + titre + actualiser),
 * TOUJOURS sur une ligne, même à 375 px (le bouton reste icône-seule sur
 * mobile — jamais orphelin sur sa propre ligne). Ligne 2 = méta (sur-titre,
 * en ligne, rôle) en chips qui peuvent s'enrouler sans casser la mise en page.
 */
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
    <header className="space-y-2 border-b border-gold/15 pb-4">
      <div className="flex items-center gap-2.5">
        <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl border border-gold/40 bg-gold/10 text-gold sm:h-10 sm:w-10">
          <ShieldGlyph />
        </span>
        <h1 className="min-w-0 flex-1 truncate font-display text-lg font-bold text-white sm:text-xl">{title}</h1>
        <button
          type="button"
          onClick={onRefresh}
          className="inline-flex h-9 w-9 shrink-0 items-center justify-center gap-1.5 rounded-lg border border-white/10 bg-white/[0.04] text-white/70 transition-colors hover:border-white/20 hover:bg-white/[0.08] hover:text-white focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 sm:w-auto sm:px-2.5"
          aria-label={refreshLabel}
        >
          <RefreshGlyph spinning={refreshing} />
          <span className="hidden text-xs font-medium sm:inline">{refreshLabel}</span>
        </button>
      </div>
      <div className="flex flex-wrap items-center gap-x-2 gap-y-1.5">
        <span className="font-display text-[11px] font-semibold uppercase tracking-[0.18em] text-gold/60">{kicker}</span>
        <span className="h-3 w-px shrink-0 bg-white/10" aria-hidden />
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-200">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
          {onlineLabel}
        </span>
        {roleBadge}
      </div>
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
 * Navigation à icônes. Une seule rangée, groupes séparés par de l'espace
 * (pas d'étiquette de groupe ni de trait vertical — plus rien à lire pour
 * distinguer les familles, juste à voir). Défile horizontalement quand ça ne
 * tient pas, avec un fondu aux bords en indice discret (masque CSS, aucun
 * état JS à maintenir).
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
      className="flex items-center gap-3 overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.03] p-1.5 [-ms-overflow-style:none] [-webkit-mask-image:linear-gradient(to_right,transparent,black_14px,black_calc(100%-14px),transparent)] [mask-image:linear-gradient(to_right,transparent,black_14px,black_calc(100%-14px),transparent)] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
    >
      {groups.map((group) => (
        <div key={group.label} role="group" aria-label={group.label} className="flex shrink-0 items-center gap-1">
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
                        ? 'bg-suit-red/20 text-red-200'
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
    /* `min-w-0` : dans une grille, une section garde `min-width: auto` — la
       piste ne peut pas descendre sous la largeur de son contenu, si bien que
       la carte débordait de l'écran et se faisait couper par l'overflow caché
       de la page (invisible sur grand écran, cassant sur téléphone). */
    <section className={cn('min-w-0 rounded-2xl border border-white/10 bg-white/[0.02]', className)}>
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
 * Plaque de casino : un KPI sur fond crème, tranchant sur le feutre — le
 * vocabulaire visuel du lobby (plaques de mise) appliqué à la supervision.
 * `tone="alert"` bascule sur le rouge d'enseigne (file à traiter, bans…).
 */
export function KpiPlaque({
  label,
  value,
  hint,
  delta,
  tone = 'default',
}: {
  label: string
  value: ReactNode
  hint?: string
  delta?: { direction: 'up' | 'down'; label: string }
  tone?: 'default' | 'alert'
}) {
  const alert = tone === 'alert'
  return (
    <div
      className={cn(
        'min-w-0 rounded-2xl border p-3 sm:p-4',
        alert
          ? 'border-suit-red/40 bg-suit-red text-cream'
          : 'border-gold/30 bg-cream text-[#24201A] shadow-[inset_0_0_0_2px_rgba(255,255,255,0.35)]'
      )}
    >
      <p className={cn('text-[10px] font-semibold uppercase tracking-wide sm:text-[11px]', alert ? 'text-cream/75' : 'text-[#6B6455]')}>
        {label}
      </p>
      <p className="mt-0.5 flex items-baseline gap-1.5 font-display text-2xl font-bold tabular-nums sm:text-3xl">
        {value}
        {delta && (
          <span className={cn('text-xs font-bold', delta.direction === 'up' ? (alert ? 'text-cream' : 'text-emerald-700') : 'text-suit-red')}>
            {delta.direction === 'up' ? '▲' : '▼'} {delta.label}
          </span>
        )}
      </p>
      {hint && <p className={cn('mt-0.5 text-[11px]', alert ? 'text-cream/70' : 'text-[#6B6455]')}>{hint}</p>}
    </div>
  )
}

/** Courbe 14 j : visiteurs (trait plein or) + parties (pointillé bleu jeton). */
export function TrendChart({
  points,
  primaryLabel,
  secondaryLabel,
}: {
  points: Array<{ date: string; visitors: number; parties: number }>
  primaryLabel: string
  secondaryLabel: string
}) {
  if (points.length === 0) return null
  const w = 640
  const h = 110
  const pad = 6
  const maxV = Math.max(1, ...points.map((p) => p.visitors))
  const maxP = Math.max(1, ...points.map((p) => p.parties))
  const stepX = points.length > 1 ? (w - pad * 2) / (points.length - 1) : 0
  const xAt = (i: number) => pad + i * stepX
  const yAt = (v: number, max: number) => h - pad - (v / max) * (h - pad * 2 - 14)

  const linePath = (key: 'visitors' | 'parties', max: number) =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${xAt(i).toFixed(1)},${yAt(p[key], max).toFixed(1)}`).join(' ')

  const areaPath = `${linePath('visitors', maxV)} L${xAt(points.length - 1).toFixed(1)},${h - pad} L${xAt(0).toFixed(1)},${h - pad} Z`

  return (
    <div>
      <svg viewBox={`0 0 ${w} ${h}`} className="h-24 w-full sm:h-28" role="img" aria-label={`${primaryLabel} / ${secondaryLabel}`}>
        <defs>
          <linearGradient id="supervision-trend-fill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor="rgb(var(--gold-rgb))" stopOpacity="0.35" />
            <stop offset="1" stopColor="rgb(var(--gold-rgb))" stopOpacity="0" />
          </linearGradient>
        </defs>
        <path d={areaPath} fill="url(#supervision-trend-fill)" />
        <path d={linePath('parties', maxP)} fill="none" stroke="rgb(var(--chip-blue-rgb))" strokeWidth="1.6" strokeDasharray="3 3" strokeLinecap="round" />
        <path d={linePath('visitors', maxV)} fill="none" stroke="rgb(var(--gold-rgb))" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="mt-1.5 flex items-center gap-4 text-[11px] text-white/45">
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full bg-gold" /> {primaryLabel}
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-0.5 w-3 rounded-full bg-chip-blue" style={{ backgroundImage: 'repeating-linear-gradient(90deg, rgb(var(--chip-blue-rgb)) 0 3px, transparent 3px 5px)' }} /> {secondaryLabel}
        </span>
      </div>
    </div>
  )
}

export type LiveTableStatus = 'waiting' | 'briefing' | 'playing' | 'cast'

const LIVE_STATUS_TONE: Record<LiveTableStatus, string> = {
  waiting: 'border-white/15 bg-white/[0.05] text-white/55',
  briefing: 'border-gold/40 bg-gold/15 text-amber-100',
  playing: 'border-emerald-400/30 bg-emerald-500/15 text-emerald-200',
  cast: 'border-chip-blue/40 bg-chip-blue/15 text-sky-200',
}

/**
 * Mini-table ovale — le même vocabulaire visuel que le lobby Table Ronde.
 * Une table FIGÉE (aucune écriture d'état ni présence depuis le seuil du
 * statut) se distingue au premier coup d'œil : bordure rouge d'enseigne et
 * bandeau d'inactivité. C'est exactement ce que l'exploitant doit repérer.
 */
export function LiveTableCard({
  icon,
  gameTitle,
  code,
  status,
  statusLabel,
  memberCount,
  memberNames,
  elapsed,
  stalled,
  stalledLabel,
  turnLabel,
  closeLabel,
  onClose,
  closing,
}: {
  icon?: ReactNode
  gameTitle: string
  code: string
  status: LiveTableStatus
  statusLabel: string
  memberCount: number
  memberNames: string[]
  elapsed: string
  /** Table sans aucun signe de vie depuis le seuil de son statut (F46). */
  stalled?: boolean
  /** Ex. « Figée depuis 12 min » — affiché seulement si `stalled`. */
  stalledLabel?: string
  /** Ex. « Tour : Léa » quand le jeu tient un tour courant. */
  turnLabel?: string
  /** Fermeture forcée (admin) : bouton rendu seulement si `onClose` est fourni. */
  closeLabel?: string
  onClose?: () => void
  closing?: boolean
}) {
  const extra = memberCount - memberNames.length
  return (
    <div
      className={cn(
        // `min-w-0` pour la même raison que SectionCard : posée dans une
        // grille, la carte ne pouvait pas descendre sous la largeur de son
        // contenu (pseudos, « Figée depuis… », « Au tour de… ») et débordait.
        'min-w-0 rounded-2xl border p-3',
        stalled ? 'border-suit-red/50 bg-suit-red/[0.07]' : 'border-gold/15 bg-felt-deep/50'
      )}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="flex min-w-0 items-center gap-1.5 truncate text-sm font-bold text-white">
          {icon}
          <span className="truncate">{gameTitle}</span>
        </span>
        <span className={cn('shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide', LIVE_STATUS_TONE[status])}>
          {status === 'playing' && <span className="mr-1 inline-block h-1.5 w-1.5 rounded-full bg-emerald-400 align-middle" aria-hidden />}
          {statusLabel}
        </span>
      </div>
      <div className="my-2 flex h-11 items-center justify-center rounded-[50%/70%] border border-gold/25 bg-gradient-to-b from-felt to-felt-deep font-display text-sm font-bold tracking-widest text-cream">
        {code}
      </div>
      {stalled && stalledLabel && (
        <p className="mb-2 flex items-center gap-1.5 rounded-lg border border-suit-red/40 bg-suit-red/15 px-2 py-1 text-[11px] font-bold text-red-200">
          <AlertGlyph />
          {stalledLabel}
        </p>
      )}
      {turnLabel && (
        <p className="mb-1.5 truncate text-[11px] font-medium text-amber-200/80">{turnLabel}</p>
      )}
      <div className="flex items-center justify-between gap-2 text-[11px] text-white/45">
        <span className="min-w-0 truncate">
          {memberNames.length > 0 ? memberNames.join(', ') : '—'}
          {extra > 0 ? ` +${extra}` : ''}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          <span>{elapsed}</span>
          {onClose && (
            <button
              type="button"
              onClick={onClose}
              disabled={closing}
              className="inline-flex items-center gap-1 rounded-full border border-suit-red/40 bg-suit-red/10 px-2 py-0.5 text-[10px] font-bold text-red-200 transition hover:bg-suit-red/25 disabled:opacity-50"
            >
              {closing ? <Loader2 className="h-3 w-3 animate-spin" /> : <X className="h-3 w-3" />}
              {closeLabel}
            </button>
          )}
        </span>
      </div>
    </div>
  )
}

export type JournalKind =
  | 'ban'
  | 'unban'
  | 'feature-ban'
  | 'cosmetic-grant'
  | 'moderation-term'
  | 'role-change'
  | 'account-delete'
  | 'room-close'
  | 'site-setting'

const JOURNAL_DOT: Record<JournalKind, string> = {
  ban: 'bg-suit-red',
  unban: 'bg-emerald-400',
  'feature-ban': 'bg-amber-400',
  'cosmetic-grant': 'bg-chip-blue',
  'moderation-term': 'bg-amber-400',
  'role-change': 'bg-gold',
  'account-delete': 'bg-suit-red',
  'room-close': 'bg-chip-blue',
  'site-setting': 'bg-gold',
}

/** Journal chronologique des actions du staff — traçabilité d'équipe. */
export function JournalList({
  entries,
}: {
  entries: Array<{ id: string; kind: JournalKind; time: string; text: ReactNode }>
}) {
  return (
    <ul className="space-y-0">
      {entries.map((e) => (
        <li key={e.id} className="flex items-baseline gap-2.5 border-b border-dashed border-white/[0.06] py-2 text-xs last:border-0">
          <span className={cn('h-1.5 w-1.5 shrink-0 translate-y-[-1px] rounded-full', JOURNAL_DOT[e.kind])} aria-hidden />
          <span className="w-11 shrink-0 tabular-nums text-white/35">{e.time}</span>
          <span className="min-w-0 flex-1 text-white/75">{e.text}</span>
        </li>
      ))}
    </ul>
  )
}

/** File « À traiter » unifiée — inbox zéro, une action par entrée. */
/**
 * File « à traiter » : deux actions distinctes par entrée — Voir (inspecter
 * avant de juger, navigue vers l'onglet concerné) et Acquitter (clore
 * directement, sans quitter la Salle). L'acquittement journalise toujours
 * une trace sur le compte cible (voir supervision-overview-server.ts).
 */
export function QueueList({
  items,
  viewLabel,
  acknowledgeLabel,
  onView,
  onAcknowledge,
  busyId,
}: {
  items: Array<{
    id: string
    icon: IconType
    danger?: boolean
    title: ReactNode
    subtitle: string
    /** À false, l'entrée se consulte mais ne s'acquitte pas (grade insuffisant). */
    canAcknowledge?: boolean
  }>
  viewLabel: string
  acknowledgeLabel: string
  onView: (id: string) => void
  onAcknowledge: (id: string) => void
  busyId?: string | null
}) {
  return (
    <ul className="space-y-1.5">
      {items.map((it) => {
        const Icon = it.icon
        const busy = busyId === it.id
        return (
          /* Sur téléphone, les deux boutons dévoraient la ligne : il ne
             restait qu'une quinzaine de caractères du signalement, donc plus
             moyen de savoir de quoi il s'agissait. On empile en dessous sous
             640 px, on revient sur une ligne au-delà. */
          <li key={it.id} className="flex flex-col gap-2 rounded-xl border border-white/10 bg-white/[0.02] px-3 py-2.5 sm:flex-row sm:items-center sm:gap-2.5">
            {/* Icône et texte restent SOLIDAIRES quand la ligne s'empile. */}
            <div className="flex min-w-0 flex-1 items-center gap-2.5">
              <span
                className={cn(
                  'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border',
                  it.danger ? 'border-suit-red/35 bg-suit-red/15 text-suit-red' : 'border-gold/25 bg-gold/10 text-gold'
                )}
              >
                <Icon className="h-4 w-4" />
              </span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-white">{it.title}</p>
                <p className="text-xs text-white/45 line-clamp-2 sm:truncate">{it.subtitle}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 self-end sm:self-auto">
              <button
                type="button"
                onClick={() => onView(it.id)}
                disabled={busy}
                className="rounded-lg border border-white/15 bg-white/5 px-2.5 py-1 text-xs font-semibold text-white/70 transition-colors hover:bg-white/10 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
              >
                {viewLabel}
              </button>
              {it.canAcknowledge !== false && (
              <button
                type="button"
                onClick={() => onAcknowledge(it.id)}
                disabled={busy}
                className="flex items-center gap-1 rounded-lg border border-emerald-500/35 bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-200 transition-colors hover:bg-emerald-500/20 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                {acknowledgeLabel}
              </button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
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

/**
 * Indicateur de croissance : la valeur ET sa définition, écrites noir sur
 * blanc juste en dessous. Un chiffre dont on ignore la définition ne sert à
 * rien — l'exploitant doit pouvoir le défendre sans nous appeler (F45).
 */
export function GrowthMetric({
  label,
  value,
  detail,
  definition,
  tone = 'default',
}: {
  label: string
  value: string
  detail?: string
  definition: string
  tone?: 'default' | 'alert'
}) {
  return (
    <div
      className={cn(
        'rounded-xl border p-3',
        tone === 'alert' ? 'border-suit-red/35 bg-suit-red/[0.07]' : 'border-white/10 bg-white/[0.02]'
      )}
    >
      <p className="text-[11px] font-semibold uppercase tracking-wide text-white/45">{label}</p>
      <p className="mt-0.5 font-display text-2xl font-bold tabular-nums text-white">{value}</p>
      {detail && <p className="text-xs text-white/50">{detail}</p>}
      <p className="mt-1.5 border-t border-white/[0.07] pt-1.5 text-[11px] leading-relaxed text-white/40">
        {definition}
      </p>
    </div>
  )
}

/**
 * Pagination sobre : rien à afficher tant qu'une seule page suffit. Les
 * listes de la Supervision se chargent désormais page par page côté serveur
 * (F75) — ce bandeau est le seul moyen d'atteindre la suite.
 */
export function Pager({
  page,
  pageSize,
  total,
  onPage,
  summary,
  previousLabel,
  nextLabel,
  busy,
}: {
  page: number
  pageSize: number
  total: number
  onPage: (page: number) => void
  summary: string
  previousLabel: string
  nextLabel: string
  busy?: boolean
}) {
  const pageCount = Math.max(1, Math.ceil(total / Math.max(1, pageSize)))
  if (pageCount <= 1) return null

  const buttonClass =
    'rounded-lg border border-white/15 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/70 transition-colors hover:bg-white/10 disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50'

  return (
    <div className="flex flex-wrap items-center justify-between gap-2 border-t border-white/[0.07] pt-3">
      <p className="text-xs text-white/45">{summary}</p>
      <div className="flex items-center gap-2">
        <button type="button" className={buttonClass} disabled={busy || page <= 1} onClick={() => onPage(page - 1)}>
          {previousLabel}
        </button>
        <button
          type="button"
          className={buttonClass}
          disabled={busy || page >= pageCount}
          onClick={() => onPage(page + 1)}
        >
          {nextLabel}
        </button>
      </div>
    </div>
  )
}

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

function AlertGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </svg>
  )
}
