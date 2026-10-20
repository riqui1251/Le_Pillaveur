/**
 * Navigation de la Supervision — module PUR : quels onglets et quelles vues
 * un rôle peut ouvrir, et où mène une URL (?tab=, ?view=, ?scope=, ?userId=).
 * Sorti de la page pour que les droits et les anciens liens restent testés.
 *
 * Mêmes conditions que les routes qui alimentent chaque écran (src/lib/roles.ts) :
 * un onglet ou une vue n'apparaît que si sa route répondrait, et une URL hors
 * de portée retombe sur le défaut plutôt que d'afficher un écran vide ou un 403.
 */

import {
  canAccessSupervision,
  canManageUsers,
  canViewOpsStatus,
  canViewSupervisionAnalytics,
  canViewSupervisionBans,
  canViewUserFeedback,
} from '@/lib/roles'

/** Onglets, dans l'ordre de la navigation. */
export const SUPERVISION_TABS = ['overview', 'stats', 'accounts', 'moderation', 'ops'] as const
export type SupervisionTab = (typeof SUPERVISION_TABS)[number]

/** Vues de l'onglet Statistiques (?view=), dans l'ordre du sélecteur. */
export const STATS_VIEWS = ['audience', 'players', 'games', 'quality'] as const
export type StatsView = (typeof STATS_VIEWS)[number]

/** Vues de l'onglet Modération (?view=), dans l'ordre du sélecteur. */
export const MODERATION_VIEWS = ['reports', 'sanctions', 'words', 'journal'] as const
export type ModerationView = (typeof MODERATION_VIEWS)[number]

export type SupervisionView = StatsView | ModerationView

/** Filtre des signalements : « en cours » (tout ce qui n'est pas résolu) ou « traités ». */
export type FeedbackScope = 'active' | 'resolved'

/** Vue ouverte sans ?view= : les comptes et leurs retours, la question la plus posée. */
export const DEFAULT_STATS_VIEW: StatsView = 'players'

/** Valeur de ?scope= qui ouvre les signalements traités ; absente = en cours. */
export const RESOLVED_SCOPE_PARAM = 'resolved'

export function isSupervisionTab(value: string | null | undefined): value is SupervisionTab {
  return SUPERVISION_TABS.some((tab) => tab === value)
}

export function isStatsView(value: string | null | undefined): value is StatsView {
  return STATS_VIEWS.some((view) => view === value)
}

export function isModerationView(value: string | null | undefined): value is ModerationView {
  return MODERATION_VIEWS.some((view) => view === value)
}

/**
 * Qui peut ouvrir chaque vue de Modération : la LECTURE des signalements dès
 * modérateur ; les sanctions, les mots et pseudos (édition des termes) et le
 * journal de l'équipe (servi par la vue d'ensemble) à partir d'admin.
 */
const MODERATION_VIEW_ACCESS: Readonly<Record<ModerationView, (role: string) => boolean>> = {
  reports: canViewUserFeedback,
  sanctions: canViewSupervisionBans,
  words: canManageUsers,
  journal: canViewSupervisionAnalytics,
}

/** Vues de Modération que ce rôle peut ouvrir, dans l'ordre du sélecteur. */
export function moderationViewsFor(role: string): ModerationView[] {
  if (!canAccessSupervision(role)) return []
  return MODERATION_VIEWS.filter((view) => MODERATION_VIEW_ACCESS[view](role))
}

/** Vues que ce rôle peut ouvrir dans un onglet ; vide pour un onglet sans vues. */
export function tabViewsFor(tab: SupervisionTab, role: string): readonly SupervisionView[] {
  if (tab === 'stats') return canAccessSupervision(role) && canViewSupervisionAnalytics(role) ? STATS_VIEWS : []
  if (tab === 'moderation') return moderationViewsFor(role)
  return []
}

/** Onglets que ce rôle peut ouvrir, dans l'ordre de la navigation. */
export function supervisionTabsFor(role: string): SupervisionTab[] {
  if (!canAccessSupervision(role)) return []
  const analytics = canViewSupervisionAnalytics(role)
  return SUPERVISION_TABS.filter((tab) => {
    switch (tab) {
      case 'overview':
      case 'stats':
        return analytics
      case 'accounts':
        return true
      case 'moderation':
        return moderationViewsFor(role).length > 0
      case 'ops':
        return canViewOpsStatus(role)
    }
  })
}

/**
 * Onglet ouvert sans ?tab= : La Salle pour qui voit les statistiques, Comptes
 * sinon (les modérateurs n'ont pas La Salle : la vue d'ensemble reste admin+).
 */
export function defaultSupervisionTab(role: string): SupervisionTab {
  return canViewSupervisionAnalytics(role) ? 'overview' : 'accounts'
}

/** Vue ouverte dans un onglet sans ?view= valide ; null pour un onglet sans vues. */
export function defaultTabView(tab: SupervisionTab, role: string): SupervisionView | null {
  const views = tabViewsFor(tab, role)
  if (tab === 'stats') return views.includes(DEFAULT_STATS_VIEW) ? DEFAULT_STATS_VIEW : (views[0] ?? null)
  return views[0] ?? null
}

export type SupervisionNavGroupKey = 'analysis' | 'community' | 'server'

/**
 * Familles de la navigation, séparées à l'écran par de l'espace : ce qu'on
 * regarde (Salle, Statistiques), les gens (Comptes, Modération), la machine
 * (Serveur, fondateurs seulement).
 */
export const SUPERVISION_NAV_GROUPS: ReadonlyArray<{ key: SupervisionNavGroupKey; tabs: readonly SupervisionTab[] }> = [
  { key: 'analysis', tabs: ['overview', 'stats'] },
  { key: 'community', tabs: ['accounts', 'moderation'] },
  { key: 'server', tabs: ['ops'] },
]

/** Familles de la navigation réduites aux onglets du rôle ; une famille vide disparaît. */
export function supervisionNavGroupsFor(role: string): Array<{ key: SupervisionNavGroupKey; tabs: SupervisionTab[] }> {
  const allowed = supervisionTabsFor(role)
  return SUPERVISION_NAV_GROUPS.map((group) => ({
    key: group.key,
    tabs: group.tabs.filter((tab) => allowed.includes(tab)),
  })).filter((group) => group.tabs.length > 0)
}

/**
 * Anciens onglets fondus dans une vue d'un des cinq onglets. Un favori, un
 * lien partagé ou l'historique du navigateur y mènent encore :
 * - « Pays / IP » est devenu la vue Audience des Statistiques ;
 * - « Sanctions » est passé sous Modération ;
 * - « Signalements » et « Traités » sont les deux filtres de la vue Signalements.
 */
const LEGACY_TABS: Readonly<
  Record<string, { tab: SupervisionTab; view: SupervisionView; feedbackScope?: FeedbackScope } | undefined>
> = {
  geo: { tab: 'stats', view: 'audience' },
  bans: { tab: 'moderation', view: 'sanctions' },
  feedback: { tab: 'moderation', view: 'reports', feedbackScope: 'active' },
  'feedback-resolved': { tab: 'moderation', view: 'reports', feedbackScope: 'resolved' },
}

/**
 * Ancien onglet « Termes » : il s'appelait déjà ?tab=moderation. La
 * navigation écrit toujours ?view= ; un ?tab=moderation SANS vue vient donc
 * d'un ancien lien, qui ouvre les mots et pseudos quand le rôle les voit.
 */
const LEGACY_MODERATION_VIEW: ModerationView = 'words'

export type SupervisionLocation = {
  tab: SupervisionTab
  /** Vue de l'onglet ; null sur un onglet sans vues. */
  view: SupervisionView | null
  /** Filtre des signalements ; seulement sur Modération › Signalements. */
  feedbackScope?: FeedbackScope
}

/**
 * Onglet, vue et filtre à ouvrir pour `?tab=`, `?view=`, `?scope=` et
 * `?userId=`. Un onglet inconnu, absent ou hors de portée du rôle retombe
 * sur l'onglet par défaut ; une vue inconnue ou hors de portée, sur la vue
 * par défaut de l'onglet. Une redirection d'ancien lien ne contourne jamais
 * les droits.
 *
 * Le journal des parties vit dans la vue Jeux des Statistiques. Les anciens
 * liens « voir dans le journal » d'une fiche compte (?tab=overview&userId=),
 * gardés en favori ou dans l'historique, y mènent ; un ?userId= sans vue
 * explicite ouvre aussi Jeux, puisque c'est le journal qu'il filtre. Sans
 * `userId`, ?tab=overview reste La Salle.
 */
export function resolveSupervisionLocation({
  tab,
  view,
  scope = null,
  userId,
  role,
}: {
  tab: string | null
  view: string | null
  scope?: string | null
  userId: string | null
  role: string
}): SupervisionLocation {
  const allowed = supervisionTabsFor(role)
  const fallback = defaultSupervisionTab(role)
  const legacy = tab ? LEGACY_TABS[tab] : undefined
  const journalLink = tab === 'overview' && Boolean(userId)

  let wantedTab: string | null = tab
  let wantedView: string | null = view
  let legacyScope: FeedbackScope | undefined
  if (legacy) {
    wantedTab = legacy.tab
    wantedView = legacy.view
    legacyScope = legacy.feedbackScope
  } else if (journalLink) {
    wantedTab = 'stats'
    wantedView = 'games'
  } else if (tab === 'moderation' && !view) {
    wantedView = LEGACY_MODERATION_VIEW
  } else if (tab === 'stats' && !view && userId) {
    wantedView = 'games'
  }

  const resolvedTab = isSupervisionTab(wantedTab) && allowed.includes(wantedTab) ? wantedTab : fallback
  // Une redirection vers un onglet refusé retombe sur le défaut : sa vue cible ne vaut plus.
  if (resolvedTab !== wantedTab) wantedView = null
  const views = tabViewsFor(resolvedTab, role)
  const resolvedView = views.find((candidate) => candidate === wantedView) ?? defaultTabView(resolvedTab, role)

  if (resolvedTab === 'moderation' && resolvedView === 'reports') {
    const feedbackScope = legacyScope ?? (scope === RESOLVED_SCOPE_PARAM ? 'resolved' : 'active')
    return { tab: resolvedTab, view: resolvedView, feedbackScope }
  }
  return { tab: resolvedTab, view: resolvedView }
}

/**
 * Paramètres à réécrire dans l'URL courante pour un changement d'onglet
 * (`null` retire le paramètre). ?view= ne vaut que pour un onglet à vues,
 * ?scope= que pour les signalements traités, ?userId= (journal des parties
 * filtré) que pour les Statistiques : resté sur ?tab=overview, il ferait
 * passer l'URL de La Salle pour l'ancien lien « voir dans le journal », et un
 * rechargement rouvrirait Statistiques › Jeux.
 */
export function supervisionUrlPatch({
  tab,
  view,
  feedbackScope,
}: {
  tab: SupervisionTab
  view: SupervisionView | null
  feedbackScope?: FeedbackScope
}): Record<string, string | null> {
  const scope = tab === 'moderation' && view === 'reports' && feedbackScope === 'resolved' ? RESOLVED_SCOPE_PARAM : null
  return tab === 'stats' ? { tab, view, scope } : { tab, view, scope, userId: null }
}
