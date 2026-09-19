import { describe, expect, it } from 'vitest'
import {
  EMPTY_NAV_BADGES,
  NAV_BADGES_POLL_MS,
  navBadgesEndpoint,
  readNavResponse,
  shouldPollNavBadges,
  type NavBadges,
} from './useNavBadges'

/**
 * Les badges de la barre doivent tenir ces promesses :
 *  - UNE requête par page : jamais en visiteur puis en compte, jamais onglet
 *    caché ;
 *  - un visiteur ne voit que le compteur public, un compte tout le reste ;
 *  - une réponse abîmée (champ absent, mal typé, négatif) ne remplace jamais
 *    une valeur affichée par n'importe quoi.
 */

const LOADED: NavBadges = {
  unread: { total: 3, room: 1, friends: { u2: 2 } },
  pendingRequests: 1,
  friendsOnline: 2,
  progression: { level: 4 },
  presenceCount: 12,
}

describe('navBadgesEndpoint', () => {
  it('sert le compte connecté en une seule route', () => {
    expect(navBadgesEndpoint('u1')).toBe('/api/me/nav')
  })

  it('laisse au visiteur le seul compteur public (la route compte répond 401)', () => {
    expect(navBadgesEndpoint(undefined)).toBe('/api/presence/count')
  })
})

describe('shouldPollNavBadges', () => {
  it('attend que la session soit connue (sinon deux requêtes pour une)', () => {
    expect(shouldPollNavBadges({ authLoading: true, visible: true })).toBe(false)
  })

  it('ne sonde pas un onglet caché', () => {
    expect(shouldPollNavBadges({ authLoading: false, visible: false })).toBe(false)
  })

  it('sonde onglet visible, session connue', () => {
    expect(shouldPollNavBadges({ authLoading: false, visible: true })).toBe(true)
  })

  it('garde une cadence d’au moins une minute (rythme du ping de visite)', () => {
    expect(NAV_BADGES_POLL_MS).toBeGreaterThanOrEqual(60_000)
  })
})

describe('readNavResponse — /api/me/nav', () => {
  it('lit une réponse complète', () => {
    const raw = {
      unread: { total: 3, room: 1, friends: { u2: 2 } },
      pendingRequests: 1,
      friendsOnline: 2,
      progression: { level: 4 },
      presenceCount: 12,
    }
    expect(readNavResponse('/api/me/nav', raw, EMPTY_NAV_BADGES)).toEqual(LOADED)
  })

  it('garde la valeur précédente de chaque champ absent ou mal typé', () => {
    const raw = {
      unread: { total: 'trois', room: 1, friends: {} },
      pendingRequests: -1,
      friendsOnline: '2',
      presenceCount: Number.NaN,
    }
    expect(readNavResponse('/api/me/nav', raw, LOADED)).toEqual(LOADED)
  })

  it('accepte une progression nulle et ignore une progression sans niveau', () => {
    expect(readNavResponse('/api/me/nav', { progression: null }, LOADED).progression).toBeNull()
    expect(readNavResponse('/api/me/nav', { progression: {} }, LOADED).progression).toEqual({ level: 4 })
  })

  it('ne garde des non-lus par ami que les compteurs valides', () => {
    const raw = { unread: { total: 2, room: 0, friends: { u2: 2, u3: 'x', u4: -1 } } }
    expect(readNavResponse('/api/me/nav', raw, EMPTY_NAV_BADGES).unread).toEqual({
      total: 2,
      room: 0,
      friends: { u2: 2 },
    })
  })

  it('ignore un corps qui n’est pas un objet', () => {
    expect(readNavResponse('/api/me/nav', null, LOADED)).toBe(LOADED)
    expect(readNavResponse('/api/me/nav', 'oops', LOADED)).toBe(LOADED)
  })
})

describe('readNavResponse — /api/presence/count (visiteur)', () => {
  it('ne touche qu’au compteur public', () => {
    const next = readNavResponse('/api/presence/count', { count: 7 }, LOADED)
    expect(next).toEqual({ ...LOADED, presenceCount: 7 })
  })

  it('garde le compteur précédent si la réponse est abîmée', () => {
    expect(readNavResponse('/api/presence/count', { count: 'sept' }, LOADED)).toBe(LOADED)
    expect(readNavResponse('/api/presence/count', {}, LOADED)).toBe(LOADED)
  })

  it('accepte zéro (site vide, la pastille se cache)', () => {
    expect(readNavResponse('/api/presence/count', { count: 0 }, LOADED).presenceCount).toBe(0)
  })
})
