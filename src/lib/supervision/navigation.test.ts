import { describe, expect, it } from 'vitest'
import {
  DEFAULT_STATS_VIEW,
  defaultSupervisionTab,
  defaultTabView,
  isModerationView,
  isStatsView,
  isSupervisionTab,
  moderationViewsFor,
  resolveSupervisionLocation,
  supervisionNavGroupsFor,
  supervisionTabsFor,
  supervisionUrlPatch,
  tabViewsFor,
} from '@/lib/supervision/navigation'

const resolve = (
  tab: string | null,
  options: { view?: string | null; scope?: string | null; userId?: string | null; role?: string } = {}
) =>
  resolveSupervisionLocation({
    tab,
    view: options.view ?? null,
    scope: options.scope ?? null,
    userId: options.userId ?? null,
    role: options.role ?? 'admin',
  })

describe('onglets et vues par rôle', () => {
  it('modérateur : Comptes et Modération réduite aux signalements', () => {
    expect(supervisionTabsFor('moderator')).toEqual(['accounts', 'moderation'])
    expect(moderationViewsFor('moderator')).toEqual(['reports'])
    expect(tabViewsFor('stats', 'moderator')).toEqual([])
    expect(defaultSupervisionTab('moderator')).toBe('accounts')
  })

  it('admin et super admin : tout sauf Serveur', () => {
    for (const role of ['admin', 'superadmin']) {
      expect(supervisionTabsFor(role)).toEqual(['overview', 'stats', 'accounts', 'moderation'])
      expect(moderationViewsFor(role)).toEqual(['reports', 'sanctions', 'words', 'journal'])
      expect(defaultSupervisionTab(role)).toBe('overview')
    }
  })

  it('fondateur : les cinq onglets', () => {
    expect(supervisionTabsFor('fondateur')).toEqual(['overview', 'stats', 'accounts', 'moderation', 'ops'])
    expect(tabViewsFor('stats', 'fondateur')).toEqual(['audience', 'players', 'games', 'quality'])
  })

  it('joueur : rien', () => {
    expect(supervisionTabsFor('user')).toEqual([])
    expect(moderationViewsFor('user')).toEqual([])
  })

  it('vue par défaut : Joueurs pour les Statistiques, Signalements pour la Modération, aucune ailleurs', () => {
    expect(defaultTabView('stats', 'admin')).toBe(DEFAULT_STATS_VIEW)
    expect(defaultTabView('moderation', 'admin')).toBe('reports')
    expect(defaultTabView('moderation', 'moderator')).toBe('reports')
    expect(defaultTabView('accounts', 'admin')).toBeNull()
    expect(defaultTabView('ops', 'fondateur')).toBeNull()
  })

  it('navigation en trois familles, une famille vide disparaît', () => {
    expect(supervisionNavGroupsFor('moderator')).toEqual([{ key: 'community', tabs: ['accounts', 'moderation'] }])
    expect(supervisionNavGroupsFor('admin')).toEqual([
      { key: 'analysis', tabs: ['overview', 'stats'] },
      { key: 'community', tabs: ['accounts', 'moderation'] },
    ])
    expect(supervisionNavGroupsFor('fondateur')).toEqual([
      { key: 'analysis', tabs: ['overview', 'stats'] },
      { key: 'community', tabs: ['accounts', 'moderation'] },
      { key: 'server', tabs: ['ops'] },
    ])
  })
})

describe('resolveSupervisionLocation', () => {
  it('ouvre un onglet connu que le rôle peut charger, sans vue sur un onglet qui n’en a pas', () => {
    expect(resolve('overview')).toEqual({ tab: 'overview', view: null })
    expect(resolve('accounts', { view: 'games' })).toEqual({ tab: 'accounts', view: null })
    expect(resolve('ops', { role: 'fondateur' })).toEqual({ tab: 'ops', view: null })
  })

  it('Statistiques : la vue demandée, sinon Joueurs', () => {
    expect(resolve('stats', { view: 'audience' })).toEqual({ tab: 'stats', view: 'audience' })
    expect(resolve('stats', { view: 'quality' })).toEqual({ tab: 'stats', view: 'quality' })
    expect(resolve('stats')).toEqual({ tab: 'stats', view: DEFAULT_STATS_VIEW })
    expect(resolve('stats', { view: 'inconnue' })).toEqual({ tab: 'stats', view: 'players' })
    // Une vue d'un autre onglet ne s'applique pas.
    expect(resolve('stats', { view: 'sanctions' })).toEqual({ tab: 'stats', view: 'players' })
  })

  it('Modération : la vue demandée si le rôle la voit, sinon Signalements', () => {
    expect(resolve('moderation', { view: 'sanctions' })).toEqual({ tab: 'moderation', view: 'sanctions' })
    expect(resolve('moderation', { view: 'words' })).toEqual({ tab: 'moderation', view: 'words' })
    expect(resolve('moderation', { view: 'journal' })).toEqual({ tab: 'moderation', view: 'journal' })
    expect(resolve('moderation', { view: 'reports' })).toEqual({
      tab: 'moderation',
      view: 'reports',
      feedbackScope: 'active',
    })
    expect(resolve('moderation', { view: 'inconnue' })).toEqual({
      tab: 'moderation',
      view: 'reports',
      feedbackScope: 'active',
    })
    for (const view of ['sanctions', 'words', 'journal']) {
      expect(resolve('moderation', { view, role: 'moderator' })).toEqual({
        tab: 'moderation',
        view: 'reports',
        feedbackScope: 'active',
      })
    }
  })

  it('Signalements : ?scope=resolved ouvre les traités, toute autre valeur les en cours', () => {
    expect(resolve('moderation', { view: 'reports', scope: 'resolved' })).toEqual({
      tab: 'moderation',
      view: 'reports',
      feedbackScope: 'resolved',
    })
    expect(resolve('moderation', { view: 'reports', scope: 'n’importe' })).toEqual({
      tab: 'moderation',
      view: 'reports',
      feedbackScope: 'active',
    })
    // Le filtre ne vaut que pour les signalements.
    expect(resolve('moderation', { view: 'sanctions', scope: 'resolved' })).toEqual({
      tab: 'moderation',
      view: 'sanctions',
    })
  })

  it('retombe sur le défaut sans ?tab=, pour un onglet inconnu ou hors de portée', () => {
    expect(resolve(null)).toEqual({ tab: 'overview', view: null })
    expect(resolve('')).toEqual({ tab: 'overview', view: null })
    expect(resolve('inconnu')).toEqual({ tab: 'overview', view: null })
    // Un modérateur n'a ni La Salle ni Statistiques ; un admin n'a pas Serveur.
    expect(resolve('stats', { role: 'moderator' })).toEqual({ tab: 'accounts', view: null })
    expect(resolve('overview', { role: 'moderator' })).toEqual({ tab: 'accounts', view: null })
    expect(resolve(null, { role: 'moderator' })).toEqual({ tab: 'accounts', view: null })
    expect(resolve('ops')).toEqual({ tab: 'overview', view: null })
    expect(resolve('ops', { role: 'superadmin' })).toEqual({ tab: 'overview', view: null })
  })

  it('ancien onglet « Pays / IP » (?tab=geo) : vue Audience des Statistiques', () => {
    expect(resolve('geo')).toEqual({ tab: 'stats', view: 'audience' })
    expect(resolve('geo', { view: 'players' })).toEqual({ tab: 'stats', view: 'audience' })
    expect(resolve('geo', { role: 'moderator' })).toEqual({ tab: 'accounts', view: null })
  })

  it('ancien onglet « Sanctions » (?tab=bans) : Modération › Sanctions', () => {
    expect(resolve('bans')).toEqual({ tab: 'moderation', view: 'sanctions' })
    // Hors de portée d'un modérateur : la vue par défaut de Modération.
    expect(resolve('bans', { role: 'moderator' })).toEqual({
      tab: 'moderation',
      view: 'reports',
      feedbackScope: 'active',
    })
  })

  it('anciens onglets « Signalements » et « Traités » : les deux filtres de Modération › Signalements', () => {
    for (const role of ['moderator', 'admin', 'fondateur']) {
      expect(resolve('feedback', { role })).toEqual({ tab: 'moderation', view: 'reports', feedbackScope: 'active' })
      expect(resolve('feedback-resolved', { role })).toEqual({
        tab: 'moderation',
        view: 'reports',
        feedbackScope: 'resolved',
      })
    }
    // L'ancien onglet l'emporte sur un ?scope= resté dans l'URL.
    expect(resolve('feedback', { scope: 'resolved' })).toEqual({
      tab: 'moderation',
      view: 'reports',
      feedbackScope: 'active',
    })
  })

  it('ancien onglet « Termes » (?tab=moderation sans vue) : mots et pseudos, ou signalements pour un modérateur', () => {
    expect(resolve('moderation')).toEqual({ tab: 'moderation', view: 'words' })
    expect(resolve('moderation', { role: 'moderator' })).toEqual({
      tab: 'moderation',
      view: 'reports',
      feedbackScope: 'active',
    })
  })

  it('ancien lien « voir dans le journal » (?tab=overview&userId=) : vue Jeux', () => {
    expect(resolve('overview', { userId: 'u1' })).toEqual({ tab: 'stats', view: 'games' })
    expect(resolve('stats', { userId: 'u1' })).toEqual({ tab: 'stats', view: 'games' })
    // Une vue explicite l'emporte : le filtre reste dans l'URL pour la vue Jeux.
    expect(resolve('stats', { userId: 'u1', view: 'players' })).toEqual({ tab: 'stats', view: 'players' })
  })

  it('la redirection ne contourne pas les droits', () => {
    expect(resolve('overview', { userId: 'u1', role: 'moderator' })).toEqual({ tab: 'accounts', view: null })
  })

  it('un ?userId= ne détourne que La Salle', () => {
    expect(resolve('accounts', { userId: 'u1' })).toEqual({ tab: 'accounts', view: null })
    expect(resolve('moderation', { userId: 'u1', view: 'journal' })).toEqual({ tab: 'moderation', view: 'journal' })
  })
})

describe('supervisionUrlPatch', () => {
  /** L'URL après un changement d'onglet, puis ce qu'un rechargement y relirait. */
  const reload = (search: string, patch: Record<string, string | null>, role = 'admin') => {
    const params = new URLSearchParams(search)
    for (const [key, value] of Object.entries(patch)) {
      if (value === null) params.delete(key)
      else params.set(key, value)
    }
    return {
      params,
      location: resolveSupervisionLocation({
        tab: params.get('tab'),
        view: params.get('view'),
        scope: params.get('scope'),
        userId: params.get('userId'),
        role,
      }),
    }
  }

  it('quitter les Statistiques retire ?userId= : La Salle se rouvre au rechargement', () => {
    const { params, location } = reload('tab=stats&view=games&userId=u1', supervisionUrlPatch({ tab: 'overview', view: null }))
    expect(params.get('userId')).toBeNull()
    expect(location).toEqual({ tab: 'overview', view: null })
    for (const tab of ['accounts', 'moderation'] as const) {
      expect(supervisionUrlPatch({ tab, view: tab === 'moderation' ? 'journal' : null })).toHaveProperty('userId', null)
    }
  })

  it('les Statistiques gardent le filtre du journal', () => {
    const { params, location } = reload('tab=stats&view=games&userId=u1', supervisionUrlPatch({ tab: 'stats', view: 'audience' }))
    expect(params.get('userId')).toBe('u1')
    expect(location).toEqual({ tab: 'stats', view: 'audience' })
  })

  it('?scope= seulement pour les signalements traités, ?view= seulement pour un onglet à vues', () => {
    expect(supervisionUrlPatch({ tab: 'moderation', view: 'reports', feedbackScope: 'resolved' })).toMatchObject({
      tab: 'moderation',
      view: 'reports',
      scope: 'resolved',
    })
    expect(supervisionUrlPatch({ tab: 'moderation', view: 'sanctions', feedbackScope: 'resolved' }).scope).toBeNull()
    expect(supervisionUrlPatch({ tab: 'moderation', view: 'reports', feedbackScope: 'active' }).scope).toBeNull()
    const { params } = reload('tab=moderation&view=reports&scope=resolved', supervisionUrlPatch({ tab: 'accounts', view: null }))
    expect(params.toString()).toBe('tab=accounts')
  })
})

describe('gardes de type', () => {
  it('reconnaissent les onglets et les vues, rien d’autre', () => {
    expect(['overview', 'stats', 'accounts', 'moderation', 'ops'].every(isSupervisionTab)).toBe(true)
    expect(['geo', 'bans', 'feedback', 'feedback-resolved', null].some(isSupervisionTab)).toBe(false)
    expect(['audience', 'players', 'games', 'quality'].every(isStatsView)).toBe(true)
    expect(isStatsView('geo')).toBe(false)
    expect(isStatsView(null)).toBe(false)
    expect(isStatsView(undefined)).toBe(false)
    expect(['reports', 'sanctions', 'words', 'journal'].every(isModerationView)).toBe(true)
    expect(isModerationView('players')).toBe(false)
  })
})
