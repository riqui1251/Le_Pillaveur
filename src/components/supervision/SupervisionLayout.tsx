"use client"

import { useCallback, useEffect, useId, useRef, useState, type ComponentType, type ReactNode, type RefObject } from 'react'
import { BookOpen, Check, ChevronDown, CircleAlert, CircleCheck, CircleX, Info, Loader2, X } from 'lucide-react'
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
 * en ligne, rôle, heure de fraîcheur) en chips qui peuvent s'enrouler sans
 * casser la mise en page.
 */
export function SupervisionHeader({
  kicker,
  title,
  roleBadge,
  onlineLabel,
  online,
  updatedLabel,
  onRefresh,
  refreshLabel,
  refreshing,
}: {
  kicker: string
  title: string
  roleBadge: ReactNode
  /** Pastille « en ligne » simple, sans action (fiche d'un compte). */
  onlineLabel?: string
  /**
   * Pastille « N en ligne » cliquable vers la liste filtrée (tableau de bord).
   * `description` dit sa définition au lecteur d'écran (nom accessible) :
   * sans elle, rien ne distingue ce chiffre des navigateurs actifs. Pas de
   * `title` : invisible au toucher, et la définition se lit en clair sous le
   * filtre « En ligne » de Comptes, où la pastille mène. Absente, comme
   * `onlineLabel` : pastille masquée (compte sans accès aux statistiques).
   */
  online?: { label: string; description: string; onClick: () => void }
  /** « à jour · 14:32 » : dernière actualisation réussie des données en direct. */
  updatedLabel?: string
  onRefresh: () => void
  refreshLabel: string
  refreshing?: boolean
}) {
  return (
    <header className="space-y-2 border-b border-gold/[0.15] pb-4">
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
        {!online && onlineLabel && (
          <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-200">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
            {onlineLabel}
          </span>
        )}
        {online && (
          <button
            type="button"
            onClick={online.onClick}
            className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-500/10 px-2.5 py-1 text-xs font-medium text-emerald-200 transition-colors hover:border-emerald-400/50 hover:bg-emerald-500/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
          >
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />
            {online.label}
            {/* Le nom accessible commence par le texte visible, puis la définition. */}
            <span className="sr-only">{` — ${online.description}`}</span>
          </button>
        )}
        {roleBadge}
        {updatedLabel && <span className="text-xs tabular-nums text-white/70">{updatedLabel}</span>}
      </div>
    </header>
  )
}

/** Ton d'un compteur : neutre par défaut, ou coloré selon l'urgence. */
export type CountTone = 'neutral' | 'danger' | 'warning'

/**
 * Compteur posé après un libellé (onglet, vue, filtre). Rien quand il est
 * vide ou absent : un « 0 » permanent dans la navigation ne dit rien.
 */
function CountBadge({ count, tone }: { count?: number | string; tone?: CountTone }) {
  if (count == null || count === '') return null
  return (
    <span
      className={cn(
        'ml-0.5 rounded-full px-1.5 py-px text-xs font-semibold tabular-nums',
        tone === 'danger'
          ? 'bg-suit-red/20 text-red-200'
          : tone === 'warning'
            ? 'bg-amber-500/20 text-amber-200'
            : 'bg-white/10 text-white/70'
      )}
    >
      {count}
    </span>
  )
}

export type SupervisionNavGroup = {
  label: string
  items: Array<{
    value: string
    label: string
    icon: IconType
    count?: number | string
    tone?: CountTone
  }>
}

/**
 * Amène `element` dans la partie visible de `container`, À L'HORIZONTALE
 * seulement : scrollIntoView ferait aussi défiler la page à la verticale.
 * `margin` dégage le fondu des bords.
 */
function revealHorizontally(container: HTMLElement, element: HTMLElement, margin = 16) {
  const box = container.getBoundingClientRect()
  const item = element.getBoundingClientRect()
  if (item.left < box.left + margin) container.scrollLeft -= box.left + margin - item.left
  else if (item.right > box.right - margin) container.scrollLeft += item.right - (box.right - margin)
}

/** Id du bouton d'un onglet : le panneau ouvert s'en sert pour se nommer (aria-labelledby). */
export function supervisionNavItemId(value: string): string {
  return `supervision-nav-${value}`
}

/**
 * Navigation à icônes. Une seule rangée, groupes séparés par de l'espace
 * (pas d'étiquette de groupe ni de trait vertical — plus rien à lire pour
 * distinguer les familles, juste à voir). Défile horizontalement quand ça ne
 * tient pas, avec un fondu aux bords en indice discret (masque CSS). À 375
 * px, cinq onglets n'y tiennent pas : l'onglet actif est ramené à l'écran à
 * chaque changement, y compris quand un lien de la page l'ouvre (file,
 * « Tout le journal »…), sinon rien de surligné n'y paraîtrait.
 */
export function SupervisionNav({
  groups,
  active,
  onSelect,
  groupAria,
  navRef,
}: {
  groups: SupervisionNavGroup[]
  active: string
  onSelect: (value: string) => void
  groupAria: string
  /** Réf de la barre, pour que la page y ramène le focus après un lien interne. */
  navRef?: RefObject<HTMLElement>
}) {
  const ownRef = useRef<HTMLElement>(null)
  const ref = navRef ?? ownRef
  useEffect(() => {
    const nav = ref.current
    const current = nav?.querySelector<HTMLElement>('[aria-current="page"]')
    if (nav && current) revealHorizontally(nav, current)
  }, [active, ref])
  return (
    <nav
      ref={ref}
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
                id={supervisionNavItemId(item.value)}
                type="button"
                onClick={() => onSelect(item.value)}
                aria-current={isActive ? 'page' : undefined}
                className={cn(
                  'inline-flex h-9 shrink-0 items-center gap-1.5 rounded-xl px-3 text-sm font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50',
                  isActive
                    ? 'border border-amber-400/40 bg-amber-500/[0.15] text-amber-100'
                    : 'border border-transparent text-white/70 hover:bg-white/[0.06] hover:text-white'
                )}
              >
                <Icon className="h-4 w-4 shrink-0" />
                <span className="whitespace-nowrap">{item.label}</span>
                <CountBadge count={item.count} tone={item.tone} />
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
            <p className="mt-0.5 text-xs leading-relaxed text-white/70">{description}</p>
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
 * `trend` : mini-courbe posée juste sous la valeur (Sparkline du kit, en
 * teintes « surface crème ») — le chiffre avec, d'un coup d'œil, la pente des
 * jours RÉVOLUS qui précèdent (un jour entamé y passerait pour une chute).
 */
export function KpiPlaque({
  label,
  value,
  hint,
  delta,
  tone = 'default',
  trend,
}: {
  label: string
  value: ReactNode
  hint?: string
  delta?: { direction: 'up' | 'down'; label: string }
  tone?: 'default' | 'alert'
  trend?: ReactNode
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
      {/* En alerte, libellé et indice en crème PLEINE : sur le rouge d'enseigne,
          /75 et /70 tombaient à ~3,4:1 et ~3,2:1, sous les 4,5:1 exigés pour
          du texte de 12 px ; le crème plein donne ~5:1 (même /90 plafonne
          à ~4,3:1). L'indice porte parfois l'information d'état (« La base ne
          répond pas »). */}
      {/* 12 px : le libellé nomme le chiffre, c'est une information, pas un décor. */}
      <p className={cn('break-words text-xs font-semibold uppercase tracking-wide', alert ? 'text-cream' : 'text-[#6B6455]')}>
        {label}
      </p>
      {/* flex-wrap : à 375 px, deux plaques par ligne, l'écart (« ▲ +12 % vs
          7 j. préc. ») passe sous le chiffre au lieu de déborder. */}
      <p className="mt-0.5 flex flex-wrap items-baseline gap-x-1.5 font-display text-2xl font-bold tabular-nums sm:text-3xl">
        {value}
        {delta && (
          <span className={cn('text-xs font-bold', delta.direction === 'up' ? (alert ? 'text-cream' : 'text-emerald-700') : 'text-suit-red')}>
            {delta.direction === 'up' ? '▲' : '▼'} {delta.label}
          </span>
        )}
      </p>
      {trend && <div className="mt-1.5">{trend}</div>}
      {hint && <p className={cn('mt-0.5 break-words text-xs', alert ? 'text-cream' : 'text-[#6B6455]')}>{hint}</p>}
    </div>
  )
}

/*
 * Plus de TrendChart ici : sa courbe sans axe superposait deux séries à
 * DEUX échelles, la comparaison était trompeuse. La tendance de la Salle
 * passe par deux ColumnChart du kit (charts.tsx), axe gradué, valeurs écrites.
 */

export type LiveTableStatus = 'waiting' | 'briefing' | 'playing' | 'cast'

const LIVE_STATUS_TONE: Record<LiveTableStatus, string> = {
  waiting: 'border-white/20 bg-white/[0.05] text-white/80',
  briefing: 'border-gold/40 bg-gold/[0.15] text-amber-100',
  playing: 'border-emerald-400/30 bg-emerald-500/[0.15] text-emerald-200',
  cast: 'border-chip-blue/40 bg-chip-blue/[0.15] text-sky-200',
}

/**
 * Une table en direct, sur une ligne compacte (deux au téléphone) : jeu,
 * code, statut, joueurs, durée, tour ou hôte. Une table FIGÉE (aucune
 * écriture d'état ni présence depuis le seuil de son statut, F46) passe en
 * rouge d'enseigne avec son inactivité écrite : c'est exactement ce que
 * l'exploitant doit repérer, la page la range en tête de liste.
 */
export function LiveTableRow({
  icon,
  gameTitle,
  code,
  status,
  statusLabel,
  players,
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
  /** Ex. « 4 joueurs · Léa, Max +2 ». */
  players: string
  /** Ex. « ouverte depuis 12 min ». */
  elapsed: string
  /** Table sans aucun signe de vie depuis le seuil de son statut (F46). */
  stalled?: boolean
  /** Ex. « Figée depuis 12 min » — affiché seulement si `stalled`. */
  stalledLabel?: string
  /** Ex. « Au tour de Léa » ou « Diffusée par Max ». */
  turnLabel?: string
  /** Fermeture forcée (admin) : bouton rendu seulement si `onClose` est fourni. */
  closeLabel?: string
  onClose?: () => void
  closing?: boolean
}) {
  return (
    <li
      className={cn(
        // Sous 640 px, le bouton passe sous le texte (comme la file « À
        // traiter ») : à côté, il ne laissait presque rien du nom du jeu.
        'flex min-w-0 flex-col gap-2 rounded-xl border px-3 py-2.5 sm:flex-row sm:items-center sm:gap-3',
        stalled ? 'border-suit-red/50 bg-suit-red/[0.07]' : 'border-white/10 bg-white/[0.02]'
      )}
    >
      <div className="min-w-0 flex-1">
        <div className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1">
          <span className="flex min-w-0 items-center gap-1.5 text-sm font-bold text-white">
            {icon}
            <span className="min-w-0 break-words">{gameTitle}</span>
          </span>
          <span className="font-mono text-xs font-semibold tracking-widest text-cream">{code}</span>
          <span
            className={cn(
              'inline-flex shrink-0 items-center gap-1 rounded-full border px-2 py-px text-xs font-semibold',
              LIVE_STATUS_TONE[status]
            )}
          >
            {status === 'playing' && <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" aria-hidden />}
            {statusLabel}
          </span>
        </div>
        {stalled && stalledLabel && (
          <p className="mt-1 flex items-center gap-1.5 text-xs font-bold text-red-200">
            <AlertGlyph />
            {stalledLabel}
          </p>
        )}
        <p className="mt-1 flex min-w-0 flex-wrap gap-x-2 gap-y-0.5 text-xs text-white/70">
          <span className="min-w-0 break-words">{players}</span>
          <span aria-hidden>·</span>
          <span className="tabular-nums">{elapsed}</span>
          {turnLabel && (
            <>
              <span aria-hidden>·</span>
              <span className="min-w-0 break-words font-medium text-amber-200">{turnLabel}</span>
            </>
          )}
        </p>
      </div>
      {onClose && (
        <button
          type="button"
          onClick={onClose}
          disabled={closing}
          className={cn(
            'inline-flex shrink-0 items-center gap-1 self-end rounded-lg border px-2.5 py-1 text-xs font-bold transition-colors disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50 sm:self-auto',
            stalled
              ? 'border-suit-red/60 bg-suit-red/30 text-red-100 hover:bg-suit-red/50'
              : 'border-suit-red/40 bg-suit-red/10 text-red-200 hover:bg-suit-red/20'
          )}
        >
          {closing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
          {closeLabel}
          {/* Dix « Fermer » identiques ne disent pas quelle table on ferme :
              le nom accessible garde le libellé visible en tête, puis la table. */}
          <span className="sr-only">{` — ${gameTitle} ${code}`}</span>
        </button>
      )}
    </li>
  )
}

export type JournalKind =
  | 'ban'
  | 'unban'
  | 'feature-ban'
  | 'feature-unban'
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
  'feature-unban': 'bg-emerald-400',
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
          <span className="w-11 shrink-0 tabular-nums text-white/70">{e.time}</span>
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
                <p className="text-xs text-white/70 line-clamp-2 sm:truncate">{it.subtitle}</p>
              </div>
            </div>
            <div className="flex shrink-0 items-center gap-1.5 self-end sm:self-auto">
              {/* Libellé visible en tête du nom accessible, puis l'entrée :
                  « Voir » répété sur chaque ligne ne dirait pas laquelle (le
                  titre seul se répète d'un signalement de même type à l'autre). */}
              <button
                type="button"
                onClick={() => onView(it.id)}
                disabled={busy}
                className="rounded-lg border border-white/[0.15] bg-white/5 px-2.5 py-1 text-xs font-semibold text-white/70 transition-colors hover:bg-white/10 disabled:opacity-40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
              >
                {viewLabel}
                <span className="sr-only">
                  {' — '}
                  {it.title} · {it.subtitle}
                </span>
              </button>
              {it.canAcknowledge !== false && (
              <button
                type="button"
                onClick={() => onAcknowledge(it.id)}
                disabled={busy}
                className="flex items-center gap-1 rounded-lg border border-emerald-500/[0.35] bg-emerald-500/10 px-2.5 py-1 text-xs font-bold text-emerald-200 transition-colors hover:bg-emerald-500/20 disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/50"
              >
                {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                {acknowledgeLabel}
                <span className="sr-only">
                  {' — '}
                  {it.title} · {it.subtitle}
                </span>
              </button>
              )}
            </div>
          </li>
        )
      })}
    </ul>
  )
}

export type HealthStripPill = {
  key: string
  tone: 'ok' | 'warn' | 'bad'
  label: string
  detail: string
}

const HEALTH_TONE: Record<HealthStripPill['tone'], { icon: IconType; className: string }> = {
  bad: { icon: CircleX, className: 'border-suit-red/50 bg-suit-red/20 text-red-100 hover:bg-suit-red/30' },
  warn: { icon: CircleAlert, className: 'border-amber-400/40 bg-amber-500/10 text-amber-100 hover:bg-amber-500/20' },
  ok: { icon: CircleCheck, className: 'border-emerald-400/30 bg-emerald-500/10 text-emerald-100 hover:bg-emerald-500/20' },
}

/**
 * Bandeau santé : une pastille par problème, en tête, puis UNE pastille verte
 * qui regroupe tout ce qui va bien (« En ordre : Site · Sauvegardes… »).
 * Icône ET mots, jamais la couleur seule. Chaque pastille est un bouton :
 * `toggleKeys` désigne celles qui déplient un détail sous le bandeau
 * (aria-expanded), les autres mènent ailleurs (onglet, section). Purement
 * présentationnel : le tri et le regroupement viennent de
 * src/lib/supervision/health.ts.
 */
export function HealthStrip({
  ariaLabel,
  alerts,
  ok,
  okGroupKey,
  okGroupLabel,
  toggleKeys,
  expandedKey,
  onSelect,
  children,
}: {
  ariaLabel: string
  alerts: HealthStripPill[]
  ok: HealthStripPill[]
  /** Clé passée à `onSelect` pour la pastille verte. */
  okGroupKey: string
  /** Texte de la pastille verte, noms déjà joints. */
  okGroupLabel: string
  toggleKeys: readonly string[]
  expandedKey: string | null
  onSelect: (key: string) => void
  /** Détail déplié, rendu sous les pastilles. */
  children?: ReactNode
}) {
  if (alerts.length === 0 && ok.length === 0) return null
  const pillClass =
    'inline-flex max-w-full items-start gap-1.5 rounded-full border px-3 py-1 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50'
  const expandedProps = (key: string) =>
    toggleKeys.includes(key) ? { 'aria-expanded': expandedKey === key } : {}
  const OkIcon = HEALTH_TONE.ok.icon
  return (
    <section aria-label={ariaLabel} className="min-w-0 space-y-2">
      <ul className="flex min-w-0 flex-wrap gap-2">
        {alerts.map((pill) => {
          const { icon: Icon, className } = HEALTH_TONE[pill.tone]
          return (
            <li key={pill.key} className="min-w-0 max-w-full">
              <button type="button" onClick={() => onSelect(pill.key)} className={cn(pillClass, className)} {...expandedProps(pill.key)}>
                <Icon className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
                <span className="min-w-0 break-words">
                  <span className="font-bold">{pill.label}</span> · {pill.detail}
                </span>
              </button>
            </li>
          )
        })}
        {ok.length > 0 && (
          <li className="min-w-0 max-w-full">
            <button
              type="button"
              onClick={() => onSelect(okGroupKey)}
              className={cn(pillClass, HEALTH_TONE.ok.className)}
              {...expandedProps(okGroupKey)}
            >
              <OkIcon className="mt-px h-3.5 w-3.5 shrink-0" aria-hidden />
              <span className="min-w-0 break-words font-medium">{okGroupLabel}</span>
            </button>
          </li>
        )}
      </ul>
      {children}
    </section>
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
        className="mt-1 inline-flex h-8 items-center gap-1.5 rounded-lg border border-white/[0.15] bg-white/[0.06] px-3 text-xs font-medium text-white transition-colors hover:bg-white/[0.12] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
      >
        {retryLabel}
      </button>
    </div>
  )
}

/**
 * État d'une définition à un geste : ouverte ou non, et l'id du bloc déplié
 * que le bouton désigne (aria-controls).
 */
export function useDefinitionToggle() {
  const [open, setOpen] = useState(false)
  const panelId = `definition-${useId()}`
  const toggle = useCallback(() => setOpen((value) => !value), [])
  return { open, toggle, panelId }
}

/**
 * Bouton « i » d'une définition. Pas d'infobulle au survol : invisible au
 * toucher, et une définition de trois lignes ne tient pas dans une bulle. Le
 * texte se déplie SOUS le chiffre ou le titre (InfoPanel), là où l'œil lit
 * déjà. 24 px de cible, l'icône seule en fait 16. `label` : nom accessible
 * complet, « Définition : Comptes actifs ».
 */
export function InfoToggle({
  label,
  expanded,
  onToggle,
  controls,
}: {
  label: string
  expanded: boolean
  onToggle: () => void
  controls: string
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      aria-expanded={expanded}
      aria-controls={controls}
      aria-label={label}
      className={cn(
        'inline-flex h-6 w-6 shrink-0 items-center justify-center rounded-full transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50',
        expanded ? 'bg-gold/20 text-gold' : 'text-white/70 hover:bg-white/10 hover:text-gold'
      )}
    >
      <Info className="h-4 w-4" aria-hidden />
    </button>
  )
}

/**
 * Définition dépliée par InfoToggle, à liseré or. Reste dans le DOM, masquée
 * (`hidden`), pour que aria-controls désigne toujours un élément existant.
 * Aucune classe d'affichage ici : elle l'emporterait sur `[hidden]`.
 */
export function InfoPanel({ id, open, children }: { id: string; open: boolean; children: ReactNode }) {
  return (
    <div
      id={id}
      hidden={!open}
      className="mt-1.5 min-w-0 break-words border-l-2 border-gold/60 pl-2.5 text-xs leading-relaxed text-cream/80"
    >
      {children}
    </div>
  )
}

/**
 * Indicateur chiffré : le libellé et son « i », la valeur, son unité, puis la
 * définition dépliée sous le chiffre. Un chiffre dont on ignore la définition
 * ne sert à rien — l'exploitant doit pouvoir le défendre sans nous appeler
 * (F45) ; elle reste donc à un geste, sans encombrer la tuile. `children` : un
 * graphe du kit (répartition…) sous la valeur. `definitionLabel` : nom
 * accessible du bouton, traduit par la page (« Définition : … »). `delta` :
 * écart à la période précédente, flèche ET signe écrits (pas la couleur seule).
 */
export function GrowthMetric({
  label,
  value,
  detail,
  definition,
  definitionLabel,
  tone = 'default',
  delta,
  children,
}: {
  label: string
  value: string
  detail?: string
  definition: ReactNode
  definitionLabel: string
  tone?: 'default' | 'alert'
  delta?: { direction: 'up' | 'down'; label: string }
  children?: ReactNode
}) {
  const info = useDefinitionToggle()
  return (
    <div
      className={cn(
        // min-w-0 : posée dans une grille, la carte (et le graphe qu'elle
        // peut porter) doit pouvoir descendre sous la largeur de son contenu.
        'min-w-0 rounded-xl border p-3',
        tone === 'alert' ? 'border-suit-red/[0.35] bg-suit-red/[0.07]' : 'border-white/10 bg-white/[0.02]'
      )}
    >
      <div className="flex min-w-0 items-start gap-1">
        <p className="min-w-0 break-words py-1 text-xs font-semibold uppercase tracking-wide text-white/80">{label}</p>
        <InfoToggle label={definitionLabel} expanded={info.open} onToggle={info.toggle} controls={info.panelId} />
      </div>
      {/* flex-wrap : à 375 px, l'écart passe sous le chiffre plutôt que de déborder. */}
      <p className="flex flex-wrap items-baseline gap-x-1.5 break-words font-display text-2xl font-bold tabular-nums text-white">
        {value}
        {delta && (
          <span className={cn('text-xs font-bold', delta.direction === 'up' ? 'text-emerald-300' : 'text-red-300')}>
            {delta.direction === 'up' ? '▲' : '▼'} {delta.label}
          </span>
        )}
      </p>
      {detail && <p className="break-words text-xs text-white/70">{detail}</p>}
      <InfoPanel id={info.panelId} open={info.open}>
        {definition}
      </InfoPanel>
      {children && <div className="mt-2.5 min-w-0">{children}</div>}
    </div>
  )
}

/**
 * Pied UNIQUE d'une section de statistiques : ce que ses chiffres laissent de
 * côté (exclusions, couverture des sources), l'heure de leur calcul quand ils
 * sortent d'un cache, et « Méthode », qui réunit toutes les définitions dans
 * une seule fenêtre. Remplace les lignes de fraîcheur et d'exclusion qui se
 * répétaient sous chaque bloc.
 */
export function StatsFooter({
  notes,
  freshness,
  methodLabel,
  onMethod,
}: {
  notes?: Array<{ key: string; content: ReactNode }>
  /** « Calculé à 14:32 — recalculé au plus une fois toutes les 5 min. » */
  freshness?: string
  methodLabel: string
  onMethod: () => void
}) {
  return (
    <footer className="min-w-0 space-y-2 border-t border-white/[0.07] pt-3 text-xs leading-relaxed text-white/70">
      {notes && notes.length > 0 && (
        <ul className="min-w-0 space-y-1">
          {notes.map((note) => (
            <li key={note.key} className="min-w-0 break-words">
              {note.content}
            </li>
          ))}
        </ul>
      )}
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
        {freshness && <p className="min-w-0 flex-1 break-words">{freshness}</p>}
        <button
          type="button"
          onClick={onMethod}
          className="ml-auto inline-flex min-h-[24px] shrink-0 items-center gap-1.5 rounded-md px-1.5 font-semibold text-gold transition-colors hover:bg-gold/10 hover:text-amber-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50"
        >
          <BookOpen className="h-3.5 w-3.5 shrink-0" aria-hidden />
          {methodLabel}
        </button>
      </div>
    </footer>
  )
}

/**
 * Choix exclusif en boutons collés (vues de l'onglet Statistiques, période) :
 * tout est visible d'un coup d'œil, contrairement à une liste déroulante.
 * aria-pressed dit le bouton choisi au lecteur d'écran, le fond et la graisse
 * le disent à l'œil (jamais la couleur seule). Trop large pour l'écran (375
 * px, langue longue, compteurs), la rangée passe à la ligne plutôt que de
 * défiler : une option rangée hors champ, sans indice, passait pour absente
 * — et l'option choisie par un lien de la page (« Tout le journal ») avec
 * elle. `count` : compteur après le libellé, comme dans la navigation
 * (signalements en cours, sanctions actives).
 */
export function SegmentedControl<T extends string>({
  label,
  options,
  value,
  onChange,
  className,
}: {
  /** Nom du groupe pour le lecteur d'écran (« Vue », « Période »). */
  label: string
  options: ReadonlyArray<{ value: T; label: string; icon?: IconType; count?: number | string; tone?: CountTone }>
  value: T
  onChange: (value: T) => void
  className?: string
}) {
  return (
    <div role="group" aria-label={label} className={cn('min-w-0 max-w-full', className)}>
      <div className="inline-flex max-w-full flex-wrap gap-1 rounded-xl border border-white/10 bg-white/[0.03] p-1">
        {options.map((option) => {
          const active = option.value === value
          const Icon = option.icon
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={active}
              onClick={() => onChange(option.value)}
              className={cn(
                'inline-flex h-8 shrink-0 items-center gap-1.5 whitespace-nowrap rounded-lg px-3 text-sm transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400/50',
                active
                  ? 'border border-amber-400/40 bg-amber-500/20 font-semibold text-amber-100'
                  : 'border border-transparent font-medium text-white/70 hover:bg-white/[0.06] hover:text-white'
              )}
            >
              {Icon && <Icon className="h-4 w-4 shrink-0" />}
              {option.label}
              <CountBadge count={option.count} tone={option.tone} />
            </button>
          )
        })}
      </div>
    </div>
  )
}

/**
 * Détail replié d'une vue : un bouton pleine largeur (aria-expanded) et son
 * contenu, monté seulement une fois ouvert — un panneau qui charge ses
 * propres données (journal des parties, liste des visiteurs) ne coûte rien
 * tant qu'on ne le déplie pas. Le conteneur reste dans le DOM pour que
 * aria-controls désigne toujours un élément existant. Contrôlé (`open`,
 * `onOpenChange`) quand la page doit l'ouvrir elle-même, libre sinon. Le
 * bouton est posé dans un titre (motif accordéon) : un bloc replié reste
 * dans le plan de la page pour qui navigue par titres. `headingLevel` : h3
 * sous le titre d'une vue, ses propres titres internes passant en h4.
 */
export function Disclosure({
  title,
  icon: Icon,
  open: controlledOpen,
  onOpenChange,
  defaultOpen = false,
  headingLevel = 3,
  children,
  className,
}: {
  title: ReactNode
  icon?: IconType
  open?: boolean
  onOpenChange?: (open: boolean) => void
  defaultOpen?: boolean
  headingLevel?: 2 | 3 | 4
  children: ReactNode
  className?: string
}) {
  const [uncontrolledOpen, setUncontrolledOpen] = useState(defaultOpen)
  const open = controlledOpen ?? uncontrolledOpen
  const panelId = `disclosure-${useId()}`
  const toggle = () => {
    if (controlledOpen === undefined) setUncontrolledOpen(!open)
    onOpenChange?.(!open)
  }
  const Heading = headingLevel === 2 ? 'h2' : headingLevel === 4 ? 'h4' : 'h3'
  return (
    <div className={cn('min-w-0 rounded-xl border border-white/10 bg-white/[0.02]', className)}>
      <Heading className="min-w-0">
        <button
          type="button"
          onClick={toggle}
          aria-expanded={open}
          aria-controls={panelId}
          className="flex min-h-[44px] w-full min-w-0 items-center justify-between gap-3 rounded-xl px-3 py-2 text-left text-sm font-semibold text-white transition-colors hover:bg-white/[0.04] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-400/50 sm:px-4"
        >
          <span className="flex min-w-0 items-center gap-2">
            {Icon && <Icon className="h-4 w-4 shrink-0 text-amber-400" />}
            <span className="min-w-0 break-words">{title}</span>
          </span>
          <ChevronDown className={cn('h-4 w-4 shrink-0 text-white/70 transition-transform', open && 'rotate-180')} aria-hidden />
        </button>
      </Heading>
      <div id={panelId} hidden={!open}>
        {open && <div className="min-w-0 space-y-4 border-t border-white/[0.07] p-3 sm:p-4">{children}</div>}
      </div>
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
    'rounded-lg border border-white/[0.15] bg-white/5 px-3 py-1.5 text-xs font-semibold text-white/70 transition-colors hover:bg-white/10 disabled:opacity-35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50'

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

function AlertGlyph() {
  return (
    <svg viewBox="0 0 24 24" className="h-3.5 w-3.5 shrink-0" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M12 9v4" />
      <path d="M12 17h.01" />
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z" />
    </svg>
  )
}
