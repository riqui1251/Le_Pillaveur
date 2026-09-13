import { describe, expect, it } from 'vitest'
import { parsePingBody, planPing, type PingContext } from '@/lib/analytics-ping'

/** Contexte de base : aucun signal, aucun consentement, aucune session, aucun lp_vid. */
function ctx(overrides: Partial<PingContext>): PingContext {
  return {
    view: false,
    beat: false,
    syncLocalPlayers: false,
    hasConsent: false,
    hasSession: false,
    hasVisitorId: false,
    ...overrides,
  }
}

describe('parsePingBody — les trois corps du contrat', () => {
  it('{ view: true } est une vue, et rien d’autre', () => {
    expect(parsePingBody({ view: true })).toEqual({
      view: true,
      beat: false,
      syncLocalPlayers: false,
      localPlayerNames: [],
    })
  })

  it('{ beat: true } est un battement, et rien d’autre', () => {
    expect(parsePingBody({ beat: true })).toEqual({
      view: false,
      beat: true,
      syncLocalPlayers: false,
      localPlayerNames: [],
    })
  })

  it('{ localPlayers: true, localPlayerNames } est une synchro, pseudos nettoyés', () => {
    expect(
      parsePingBody({ localPlayers: true, localPlayerNames: [' Alice ', 'alice', 'Bob', 42] })
    ).toEqual({
      view: false,
      beat: false,
      syncLocalPlayers: true,
      localPlayerNames: ['Alice', 'Bob'],
    })
  })

  it('une liste vide reste une vraie synchro (joueurs locaux tous supprimés)', () => {
    expect(parsePingBody({ localPlayers: true, localPlayerNames: [] })).toMatchObject({
      syncLocalPlayers: true,
      localPlayerNames: [],
    })
  })
})

describe('parsePingBody — tout le reste ne vaut aucun signal', () => {
  const EMPTY = { view: false, beat: false, syncLocalPlayers: false, localPlayerNames: [] }

  it.each([
    ['corps absent ou illisible', null],
    ['undefined', undefined],
    ['objet vide (ancien onglet sans consentement)', {}],
    ['pseudos sans drapeau', { localPlayerNames: ['Alice'] }],
    [
      'ancien corps consenti (ancien drapeau syncLocalPlayers)',
      { localPlayerNames: ['Alice'], syncLocalPlayers: true },
    ],
    ['tableau', [{ beat: true }]],
    ['texte', 'beat'],
    ['drapeaux non booléens', { view: 'true', beat: 1 }],
  ])('%s', (_label, json) => {
    expect(parsePingBody(json)).toEqual(EMPTY)
  })

  it('synchro sans tableau de pseudos : pas de synchro (la liste stockée n’est pas effacée)', () => {
    expect(parsePingBody({ localPlayers: true })).toEqual(EMPTY)
    expect(parsePingBody({ localPlayers: true, localPlayerNames: 'Alice' })).toEqual(EMPTY)
  })

  it('pseudos ignorés hors synchro, même accompagnés d’un battement', () => {
    expect(parsePingBody({ beat: true, localPlayerNames: ['Alice'] })).toEqual({
      ...EMPTY,
      beat: true,
    })
  })
})

describe('planPing — battement', () => {
  it('session sans consentement : le compte seulement (intérêt légitime), rien du navigateur', () => {
    expect(planPing(ctx({ beat: true, hasSession: true, hasVisitorId: true }))).toEqual(['account'])
  })

  it('session avec consentement : compte, puis présence du navigateur (IP comprise)', () => {
    expect(
      planPing(ctx({ beat: true, hasSession: true, hasConsent: true, hasVisitorId: true }))
    ).toEqual(['account', 'visitor-beat'])
  })

  it('session avec consentement : l’IP va au compte, jamais en double au navigateur', () => {
    const writes = planPing(ctx({ beat: true, hasSession: true, hasConsent: true, hasVisitorId: true }))
    expect(writes).not.toContain('visitor-ip')
  })

  it('consentement sans session : présence et historique IP du navigateur, jamais le compte', () => {
    expect(planPing(ctx({ beat: true, hasConsent: true, hasVisitorId: true }))).toEqual([
      'visitor-beat',
      'visitor-ip',
    ])
  })

  it('consentement sans cookie lp_vid : le cookie est créé AVANT la présence', () => {
    expect(planPing(ctx({ beat: true, hasConsent: true }))).toEqual([
      'visitor-cookie',
      'visitor-beat',
      'visitor-ip',
    ])
  })

  it('ni session ni consentement : rien', () => {
    expect(planPing(ctx({ beat: true, hasVisitorId: true }))).toEqual([])
  })
})

describe('planPing — vue', () => {
  it('avec consentement et session : présence du navigateur, JAMAIS la dernière activité du compte', () => {
    const writes = planPing(ctx({ view: true, hasConsent: true, hasSession: true, hasVisitorId: true }))
    expect(writes).toEqual(['visitor-view'])
    expect(writes).not.toContain('account')
  })

  it('avec consentement sans lp_vid : cookie créé, présence, sans historique IP', () => {
    expect(planPing(ctx({ view: true, hasConsent: true }))).toEqual(['visitor-cookie', 'visitor-view'])
  })

  it('sans consentement : rien, même connecté', () => {
    expect(planPing(ctx({ view: true, hasSession: true, hasVisitorId: true }))).toEqual([])
    expect(planPing(ctx({ view: true }))).toEqual([])
  })

  it('vue ET battement dans le même corps : un seul upsert, celui du battement', () => {
    expect(
      planPing(ctx({ view: true, beat: true, hasConsent: true, hasSession: true, hasVisitorId: true }))
    ).toEqual(['account', 'visitor-beat'])
  })
})

describe('planPing — synchro des pseudos locaux', () => {
  it('avec consentement : le patch des pseudos seulement, sans présence ni compte', () => {
    expect(
      planPing(ctx({ syncLocalPlayers: true, hasConsent: true, hasSession: true, hasVisitorId: true }))
    ).toEqual(['local-players'])
  })

  it('avec consentement mais sans lp_vid : rien (ni cookie ni présence créés)', () => {
    expect(planPing(ctx({ syncLocalPlayers: true, hasConsent: true, hasSession: true }))).toEqual([])
  })

  it('sans consentement : rien, même connecté', () => {
    expect(
      planPing(ctx({ syncLocalPlayers: true, hasSession: true, hasVisitorId: true }))
    ).toEqual([])
  })

  it('accompagnée d’un battement sans lp_vid : patch après la présence créée par la même requête', () => {
    expect(planPing(ctx({ beat: true, syncLocalPlayers: true, hasConsent: true }))).toEqual([
      'visitor-cookie',
      'visitor-beat',
      'visitor-ip',
      'local-players',
    ])
  })

  it('bout à bout : le corps du nouveau client ne patche que les pseudos', () => {
    const body = parsePingBody({ localPlayers: true, localPlayerNames: ['Alice'] })
    expect(planPing({ ...body, hasConsent: true, hasSession: true, hasVisitorId: true })).toEqual([
      'local-players',
    ])
  })
})

describe('planPing — corps inconnu ou ancien', () => {
  it.each([
    ['sans rien', ctx({})],
    ['connecté', ctx({ hasSession: true, hasVisitorId: true })],
    ['connecté avec consentement', ctx({ hasSession: true, hasConsent: true, hasVisitorId: true })],
    ['consentement sans lp_vid', ctx({ hasConsent: true })],
  ])('%s : aucune écriture', (_label, context) => {
    expect(planPing(context)).toEqual([])
  })

  it('bout à bout : les deux corps réels de l’ancien client n’écrivent rien', () => {
    // Ancien sendVisitPing, toutes les 60 s onglet caché compris, et ancien
    // usePlayers à chaque stat : `{}` sans consentement, pseudos + ancien
    // drapeau avec. Même envoyés avec consentement, session et lp_vid : rien.
    for (const json of [{}, { localPlayerNames: ['Alice'], syncLocalPlayers: true }]) {
      const body = parsePingBody(json)
      expect(
        planPing({ ...body, hasConsent: true, hasSession: true, hasVisitorId: true })
      ).toEqual([])
    }
  })
})
