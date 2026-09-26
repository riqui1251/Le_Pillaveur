import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Tableau des comptes actifs (lot 7). Ce qui se calcule ici doit tenir ces
 * promesses :
 *  - les fenêtres et la série découpent en jours de PARIS, le jour du
 *    changement d'heure (25/10/2026) compris, sans doubler ni sauter un jour ;
 *  - « actif » = visite ≥ 60 s actives OU place dans une partie ; « joueur
 *    unique » = place OU visite ≥ 60 s en partie ;
 *  - nouveau = créé ET actif dans la période ; revenant = actif, créé avant ;
 *    un invité créé sans jouer n'est ni l'un ni l'autre, il est compté à part ;
 *    la série compte les nouveaux à leur jour de création de Paris, et ses
 *    7 derniers jours redonnent les nouveaux sur 7 jours ;
 *  - les appareils des visites de 7 jours se comptent après fusion, par
 *    catégorie seulement, hors équipe et comptes de test ;
 *  - l'équipe et les comptes de test sortent de tous les chiffres et sont
 *    comptés à part ; une partie de l'équipe seule n'est pas un lancement ;
 *  - les retours J+1 / J+7 lisent des cohortes de jours de Paris, invités
 *    compris, de comptes actifs depuis leur création, jamais créés avant le
 *    début du journal ;
 *  - deux visites créées au même instant n'en font qu'une ;
 *  - les sièges sans compte sont comptés à part, par jour ;
 *  - les navigateurs sans compte restent une unité à part, et seule une
 *    présence existante sans compte les désigne ;
 *  - la liste d'exclusion se lit avec tolérance ;
 *  - la lecture est bornée, le résumé mis en cache, mais « en ligne
 *    maintenant » et les noms du classement relus à chaque appel.
 * La base est simulée : on vérifie les calculs et la forme, pas Prisma.
 */
const { userMock, visitMock, gameSessionMock, dailyVisitorMock, presenceMock, settingMock } = vi.hoisted(
  () => ({
    userMock: { findMany: vi.fn(), count: vi.fn() },
    visitMock: { findMany: vi.fn(), findFirst: vi.fn() },
    gameSessionMock: { findMany: vi.fn() },
    dailyVisitorMock: { findMany: vi.fn() },
    presenceMock: { findMany: vi.fn() },
    settingMock: { findUnique: vi.fn() },
  })
)

vi.mock('@/lib/prisma', () => ({
  prisma: {
    user: userMock,
    accountVisit: visitMock,
    onlineGameSession: gameSessionMock,
    dailyVisitor: dailyVisitorMock,
    sitePresence: presenceMock,
    siteSetting: settingMock,
  },
}))

import {
  getActiveAccountsStats,
  invalidateActiveAccountsStats,
  shiftParisDay,
  summarizeActiveAccounts,
  type ActiveAccountsInput,
  type ActivityAccount,
  type ActivityGame,
  type ActivityVisit,
} from '@/lib/active-accounts-server'
import { parseExcludedUserIds } from '@/lib/metrics-exclusions'

const MIN = 60 * 1000

/**
 * `now` = 25/10/2026 à 23 h 30, heure de Paris (22 h 30 UTC) — le jour où
 * l'on repasse à l'heure d'hiver (3 h → 2 h). Fenêtres : aujourd'hui = 25/10,
 * 7 jours depuis le 19/10, 30 jours depuis le 26/09.
 */
const NOW = new Date('2026-10-25T22:30:00.000Z')

function account(id: string, createdIso: string, extra: Partial<ActivityAccount> = {}): ActivityAccount {
  return { id, role: 'user', isGuest: false, createdAt: new Date(createdIso), ...extra }
}

/** Visite de test : début ISO, dernier battement N min plus tard, crédits en secondes. */
function visit(
  userId: string,
  startIso: string,
  {
    minutes = 10,
    active = 0,
    game = 0,
    visible,
    device = null,
  }: { minutes?: number; active?: number; game?: number; visible?: number; device?: string | null } = {}
): ActivityVisit {
  const startedAt = new Date(startIso)
  return {
    userId,
    startedAt,
    lastBeatAt: new Date(startedAt.getTime() + minutes * MIN),
    visibleSeconds: visible ?? Math.max(active, game),
    activeSeconds: active,
    gameSeconds: game,
    device,
  }
}

function game(startIso: string, ...seatUserIds: Array<string | null>): ActivityGame {
  return { startedAt: new Date(startIso), seatUserIds }
}

function input(extra: Partial<ActiveAccountsInput>): ActiveAccountsInput {
  return {
    accounts: [],
    visits: [],
    games: [],
    excludedUserIds: [],
    browserDays: [],
    unlinkedVisitorIds: [],
    firstVisitStartedAt: null,
    ...extra,
  }
}

beforeEach(() => {
  vi.resetAllMocks()
})

describe('shiftParisDay', () => {
  it('avance d’un jour calendaire, changements d’heure et fin d’année compris', () => {
    expect(shiftParisDay('2026-10-24', 1)).toBe('2026-10-25')
    expect(shiftParisDay('2026-10-25', 1)).toBe('2026-10-26')
    expect(shiftParisDay('2027-03-27', 1)).toBe('2027-03-28')
    expect(shiftParisDay('2027-03-28', 7)).toBe('2027-04-04')
    expect(shiftParisDay('2026-12-31', 1)).toBe('2027-01-01')
  })
})

describe('summarizeActiveAccounts — jours de Paris', () => {
  const old = '2026-08-01T10:00:00.000Z'
  const stats = summarizeActiveAccounts(
    input({
      accounts: ['today', 'yesterday', 'weekEdge', 'beforeWeek', 'monthEdge', 'beforeMonth', 'future'].map(
        (id) => account(id, old)
      ),
      visits: [
        // 25/10 à 0 h 30 à Paris (encore à l'heure d'été) : aujourd'hui.
        visit('today', '2026-10-24T22:30:00.000Z', { active: 120 }),
        // 24/10 à 23 h 30 à Paris : hier.
        visit('yesterday', '2026-10-24T21:30:00.000Z', { active: 120 }),
        // 19/10 à 0 h 30 à Paris : premier jour des 7 jours.
        visit('weekEdge', '2026-10-18T22:30:00.000Z', { active: 120 }),
        // 18/10 à 23 h 30 à Paris : hors des 7 jours, dans les 30.
        visit('beforeWeek', '2026-10-18T21:30:00.000Z', { active: 120 }),
        // 26/09 à 0 h 30 à Paris : premier jour des 30 jours.
        visit('monthEdge', '2026-09-25T22:30:00.000Z', { active: 120 }),
        // 25/09 à 23 h 30 à Paris : hors fenêtre.
        visit('beforeMonth', '2026-09-25T21:30:00.000Z', { active: 120 }),
        // 26/10 à 0 h 30 à Paris (heure d'hiver) : demain, ignoré.
        visit('future', '2026-10-25T23:30:00.000Z', { active: 120 }),
      ],
    }),
    NOW
  )

  it('compte les comptes actifs sur 1, 7 et 30 jours de Paris', () => {
    expect(stats.accounts.active).toEqual({ d1: 1, d7: 3, d30: 5 })
  })

  it('série de 14 jours de Paris distincts, sans doublon au changement d’heure', () => {
    const days = stats.series.map((point) => point.day)
    expect(days).toHaveLength(14)
    expect(new Set(days).size).toBe(14)
    expect(days[0]).toBe('2026-10-12')
    expect(days[13]).toBe('2026-10-25')
    const byDay = new Map(stats.series.map((point) => [point.day, point]))
    expect(byDay.get('2026-10-25')?.activeAccounts).toBe(1)
    expect(byDay.get('2026-10-24')?.activeAccounts).toBe(1)
    expect(byDay.get('2026-10-19')?.activeAccounts).toBe(1)
    expect(byDay.get('2026-10-18')?.activeAccounts).toBe(1)
    expect(byDay.get('2026-10-20')?.activeAccounts).toBe(0)
  })

  it('série juste au passage à l’heure d’été (29/03/2027 à 0 h 30, heure de Paris)', () => {
    const spring = summarizeActiveAccounts(input({}), new Date('2027-03-28T22:30:00.000Z'))
    const days = spring.series.map((point) => point.day)
    expect(new Set(days).size).toBe(14)
    expect(days[13]).toBe('2027-03-29')
    expect(days.filter((day) => day === '2027-03-28')).toHaveLength(1)
  })
})

describe('summarizeActiveAccounts — actifs et joueurs uniques', () => {
  const old = '2026-08-01T10:00:00.000Z'
  const stats = summarizeActiveAccounts(
    input({
      accounts: ['idle', 'active', 'localPlayer', 'onlinePlayer'].map((id) => account(id, old)),
      visits: [
        visit('idle', '2026-10-22T18:00:00.000Z', { active: 59, game: 59 }),
        visit('active', '2026-10-22T18:00:00.000Z', { active: 60 }),
        // 90 s sur un écran de jeu, dont 30 s avec interaction récente.
        visit('localPlayer', '2026-10-22T18:00:00.000Z', { active: 30, game: 90 }),
      ],
      games: [
        game('2026-10-23T18:00:00.000Z', 'onlinePlayer', null),
      ],
    }),
    NOW
  )

  it('actif = visite d’au moins 60 s actives OU place dans une partie', () => {
    expect(stats.accounts.active).toEqual({ d1: 0, d7: 2, d30: 2 })
  })

  it('joueur unique = place dans une partie OU visite d’au moins 60 s en partie', () => {
    expect(stats.players.unique).toEqual({ d1: 0, d7: 2, d30: 2 })
    const byDay = new Map(stats.series.map((point) => [point.day, point]))
    expect(byDay.get('2026-10-22')).toMatchObject({ activeAccounts: 1, uniquePlayers: 1, launches: 0 })
    expect(byDay.get('2026-10-23')).toMatchObject({ activeAccounts: 1, uniquePlayers: 1, launches: 1 })
  })
})

describe('summarizeActiveAccounts — nouveaux et revenants', () => {
  const stats = summarizeActiveAccounts(
    input({
      accounts: [
        account('newWeek', '2026-10-20T10:00:00.000Z', { isGuest: true }),
        account('newMonth', '2026-10-01T10:00:00.000Z'),
        account('old', '2026-08-01T10:00:00.000Z'),
        // Invité créé sans jouer : ni nouveau ni revenant.
        account('idleGuest', '2026-10-23T10:00:00.000Z', { isGuest: true }),
        // Créé le 19/10 à 0 h 30 à Paris : dans les 7 jours.
        account('edgeNew', '2026-10-18T22:30:00.000Z'),
        // Créé le 18/10 à 23 h 30 à Paris : avant les 7 jours.
        account('edgeOld', '2026-10-18T21:30:00.000Z'),
      ],
      visits: [visit('newMonth', '2026-10-22T18:00:00.000Z', { active: 600 })],
      games: [
        game('2026-10-21T18:00:00.000Z', 'newWeek'),
        game('2026-10-23T18:00:00.000Z', 'old'),
        game('2026-10-19T10:00:00.000Z', 'edgeNew'),
        game('2026-10-20T10:00:00.000Z', 'edgeOld'),
      ],
    }),
    NOW
  )

  it('nouveau = créé dans la période ET actif dans la période', () => {
    expect(stats.accounts.newAccounts).toEqual({ d7: 2, d30: 4 })
  })

  it('revenant = actif dans la période et créé avant elle', () => {
    expect(stats.accounts.returning).toEqual({ d7: 3, d30: 1 })
    // Nouveaux + revenants = actifs.
    expect(stats.accounts.active).toEqual({ d1: 0, d7: 5, d30: 5 })
  })

  it('ventile les invités actifs, sans l’invité créé sans jouer', () => {
    expect(stats.accounts.guests).toEqual({ d1: 0, d7: 1, d30: 1 })
  })

  it('compte à part les invités créés sans jouer sur la période', () => {
    expect(stats.accounts.idleGuests).toEqual({ d7: 1, d30: 1 })
  })

  it('série : les 7 derniers jours de nouveaux additionnés redonnent les nouveaux sur 7 jours', () => {
    const lastWeek = stats.series.slice(-7)
    expect(lastWeek[0].day).toBe('2026-10-19')
    expect(lastWeek.reduce((sum, point) => sum + point.newAccounts, 0)).toBe(stats.accounts.newAccounts.d7)
    // edgeOld, créé le 18/10 et actif le 20/10 : à son jour de création, hors des 7 jours.
    expect(stats.series.find((point) => point.day === '2026-10-18')?.newAccounts).toBe(1)
  })
})

describe('summarizeActiveAccounts — nouveaux comptes par jour (série)', () => {
  const old = '2026-08-01T10:00:00.000Z'
  const stats = summarizeActiveAccounts(
    input({
      accounts: [
        // Créé le 25/10 à 0 h 30 à Paris (heure d'été), joue le jour même.
        account('todayEdge', '2026-10-24T22:30:00.000Z', { isGuest: true }),
        // Créé le 24/10 à 23 h 30 à Paris, actif seulement le lendemain :
        // compté à son jour de création.
        account('yesterdayEdge', '2026-10-24T21:30:00.000Z'),
        // Créé le 22/10 à 0 h 30 à Paris (21/10 en UTC), joue le jour même.
        account('guest22', '2026-10-21T22:30:00.000Z', { isGuest: true }),
        account('player22', '2026-10-22T10:00:00.000Z'),
        // Moins de 60 s actives : pas actif, pas nouveau.
        account('shortVisit', '2026-10-22T09:00:00.000Z'),
        // Invité créé sans jouer : compté à part, jamais parmi les nouveaux.
        account('idleGuest', '2026-10-23T10:00:00.000Z', { isGuest: true }),
        // Équipe et compte de test créés et actifs : exclus.
        account('staff', '2026-10-23T10:00:00.000Z', { role: 'moderator' }),
        account('tester', '2026-10-23T10:00:00.000Z', { isGuest: true }),
        // Premier jour de la série.
        account('firstDay', '2026-10-12T10:00:00.000Z'),
        // Créé avant la série (11/10), actif dedans : jamais un nouveau de la série.
        account('before', '2026-10-11T10:00:00.000Z'),
        account('old', old),
      ],
      excludedUserIds: ['tester'],
      visits: [
        visit('yesterdayEdge', '2026-10-25T10:00:00.000Z', { active: 120 }),
        visit('shortVisit', '2026-10-22T09:05:00.000Z', { active: 30 }),
        visit('staff', '2026-10-23T12:00:00.000Z', { active: 600 }),
      ],
      games: [
        game('2026-10-24T23:00:00.000Z', 'todayEdge'),
        game('2026-10-21T23:00:00.000Z', 'guest22', 'player22'),
        game('2026-10-23T12:00:00.000Z', 'tester'),
        game('2026-10-12T12:00:00.000Z', 'firstDay'),
        game('2026-10-20T12:00:00.000Z', 'before', 'old'),
      ],
    }),
    NOW
  )
  const byDay = new Map(stats.series.map((point) => [point.day, point]))

  it('compte par jour de création de Paris les comptes créés et actifs depuis, invités ventilés', () => {
    expect(byDay.get('2026-10-25')).toMatchObject({ newAccounts: 1, newGuests: 1 })
    expect(byDay.get('2026-10-24')).toMatchObject({ newAccounts: 1, newGuests: 0 })
    expect(byDay.get('2026-10-22')).toMatchObject({ newAccounts: 2, newGuests: 1 })
    expect(byDay.get('2026-10-12')).toMatchObject({ newAccounts: 1, newGuests: 0 })
    expect(byDay.get('2026-10-11')).toBeUndefined()
  })

  it('écarte l’équipe, les comptes de test, les inactifs et les invités créés sans jouer', () => {
    expect(byDay.get('2026-10-23')).toMatchObject({ newAccounts: 0, newGuests: 0 })
    expect(stats.series.reduce((sum, point) => sum + point.newAccounts, 0)).toBe(5)
    expect(stats.accounts.idleGuests.d7).toBe(1)
  })

  it('les 7 derniers jours additionnés redonnent les nouveaux sur 7 jours', () => {
    const lastWeek = stats.series.slice(-7).reduce((sum, point) => sum + point.newAccounts, 0)
    expect(lastWeek).toBe(4)
    expect(stats.accounts.newAccounts.d7).toBe(lastWeek)
  })

  it('sans compte, 14 jours à zéro', () => {
    const empty = summarizeActiveAccounts(input({}), NOW)
    expect(empty.series).toHaveLength(14)
    expect(empty.series.every((point) => point.newAccounts === 0 && point.newGuests === 0)).toBe(true)
  })
})

describe('summarizeActiveAccounts — appareils des visites de 7 jours', () => {
  const old = '2026-08-01T10:00:00.000Z'
  const stats = summarizeActiveAccounts(
    input({
      accounts: ['u1', 'u2', 'u3', 'u4', 'admin', 'tester'].map((id) =>
        account(id, old, id === 'admin' ? { role: 'admin' } : {})
      ),
      excludedUserIds: ['tester'],
      visits: [
        visit('u1', '2026-10-23T18:00:00.000Z', { device: 'mobile' }),
        // Deux créations simultanées : une seule visite, l'appareil du premier
        // battement connu.
        visit('u1', '2026-10-24T18:00:00.000Z', { device: null }),
        visit('u1', '2026-10-24T18:00:00.000Z', { device: 'mobile' }),
        visit('u1', '2026-10-25T10:00:00.000Z', { device: 'mobile' }),
        visit('u1', '2026-10-22T18:00:00.000Z', { device: 'pc' }),
        visit('u2', '2026-10-22T18:00:00.000Z', { device: 'pc' }),
        // Non reconnu (null) ou valeur inattendue : 'unknown'.
        visit('u2', '2026-10-23T18:00:00.000Z', { device: null }),
        visit('u4', '2026-10-24T18:00:00.000Z', { device: 'console' }),
        // 19/10 à 0 h 30 à Paris : dans les 7 jours ; 18/10 à 23 h 30 : hors.
        visit('u3', '2026-10-18T22:30:00.000Z', { device: 'tablet' }),
        visit('u3', '2026-10-18T21:30:00.000Z', { device: 'tablet' }),
        // Équipe et compte de test : exclus (aucune ligne « mac »).
        visit('admin', '2026-10-24T18:00:00.000Z', { device: 'mobile' }),
        visit('tester', '2026-10-24T18:00:00.000Z', { device: 'mac' }),
      ],
    }),
    NOW
  )

  it('compte visites et comptes distincts par appareil, triés par visites décroissantes', () => {
    expect(stats.visits.devices7d).toEqual([
      { device: 'mobile', visits: 3, accounts: 1 },
      // À égalité de visites : plus de comptes d'abord, puis l'ordre fixe ('unknown' en dernier).
      { device: 'pc', visits: 2, accounts: 2 },
      { device: 'unknown', visits: 2, accounts: 2 },
      { device: 'tablet', visits: 1, accounts: 1 },
    ])
  })

  it('ne renvoie qu’une catégorie : ni identifiant de compte ni navigateur', () => {
    const json = JSON.stringify(stats.visits.devices7d)
    for (const id of ['u1', 'u2', 'u3', 'u4']) expect(json).not.toContain(`"${id}"`)
  })
})

describe('summarizeActiveAccounts — équipe et comptes de test', () => {
  const old = '2026-08-01T10:00:00.000Z'
  const stats = summarizeActiveAccounts(
    input({
      accounts: [
        account('player', old),
        account('away', old),
        account('admin', old, { role: 'admin' }),
        // Invité de test créé le 24/10 : pas non plus un « invité créé sans jouer ».
        account('tester', '2026-10-24T10:00:00.000Z', { isGuest: true }),
      ],
      excludedUserIds: ['tester'],
      visits: [
        // Visites d'un ancien joueur passé dans l'équipe, et du compte de test.
        visit('admin', '2026-10-22T18:00:00.000Z', { minutes: 60, active: 3000 }),
        visit('tester', '2026-10-22T18:00:00.000Z', { minutes: 60, active: 3000, game: 3000 }),
        visit('player', '2026-10-22T18:00:00.000Z', { minutes: 20, active: 600 }),
      ],
      games: [
        // Équipe seule (essai de TryBotsGate) : pas un lancement.
        game('2026-10-22T10:00:00.000Z', 'admin'),
        // Compte de test seul : pas un lancement non plus.
        game('2026-10-23T10:00:00.000Z', 'tester'),
        // Équipe + joueur : une partie de joueur.
        game('2026-10-24T10:00:00.000Z', 'admin', 'player'),
        // Compte de test + siège sans compte : pas présumée interne.
        game('2026-10-24T12:00:00.000Z', 'tester', null),
      ],
    }),
    NOW
  )

  it('exclut l’équipe et les comptes de test de tous les compteurs, comptés à part', () => {
    expect(stats.accounts.active).toEqual({ d1: 0, d7: 1, d30: 1 })
    expect(stats.accounts.guests).toEqual({ d1: 0, d7: 0, d30: 0 })
    expect(stats.players.unique).toEqual({ d1: 0, d7: 1, d30: 1 })
    expect(stats.accounts.staffExcluded).toBe(1)
    expect(stats.accounts.testExcluded).toBe(1)
  })

  it('ne compte pas le compte de test parmi les invités créés sans jouer', () => {
    expect(stats.accounts.idleGuests).toEqual({ d7: 0, d30: 0 })
  })

  it('ne compte pas les parties de l’équipe ou des tests seuls parmi les lancements', () => {
    const byDay = new Map(stats.series.map((point) => [point.day, point.launches]))
    expect(byDay.get('2026-10-22')).toBe(0)
    expect(byDay.get('2026-10-23')).toBe(0)
    expect(byDay.get('2026-10-24')).toBe(2)
  })

  it('écarte leurs visites des durées, des appareils et du classement', () => {
    expect(stats.visits).toEqual({
      medianVisitSeconds7d: 21 * 60,
      medianActiveSecondsPerAccount7d: 600,
      gameSeconds7d: 0,
      visibleSeconds7d: 600,
      devices7d: [{ device: 'unknown', visits: 1, accounts: 1 }],
    })
    expect(stats.topAccounts7d).toEqual([{ userId: 'player', activeSeconds: 600, games: 1 }])
    expect(stats.players.deletedSeats).toEqual({ d1: 0, d7: 1, d30: 1 })
  })
})

describe('summarizeActiveAccounts — retours J+1 / J+7', () => {
  // Aujourd'hui J = 25/10. Cohorte J+1 : créés du 17/10 au 23/10 ; J+7 : du 04/10 au 17/10.
  const stats = summarizeActiveAccounts(
    input({
      accounts: [
        account('r1', '2026-10-20T10:00:00.000Z'),
        account('r2', '2026-10-22T10:00:00.000Z'),
        // Créé le 23/10 à 23 h 30 à Paris, joue le 24/10 à 0 h 30 : revenu le lendemain.
        account('r3', '2026-10-23T21:30:00.000Z', { isGuest: true }),
        // Créé hier (J−1) : trop tôt pour la cohorte.
        account('r4', '2026-10-24T10:00:00.000Z'),
        account('s1', '2026-10-10T10:00:00.000Z'),
        account('s2', '2026-10-10T10:00:00.000Z'),
        // Créé le 17/10 : dans les deux cohortes.
        account('s3', '2026-10-17T10:00:00.000Z'),
        // Créé le 03/10 à 23 h 30 à Paris : avant la cohorte J+7.
        account('s4', '2026-10-03T21:30:00.000Z'),
        account('staff', '2026-10-20T10:00:00.000Z', { role: 'moderator' }),
        // Invités créés sans jamais être actifs : hors des deux cohortes.
        account('idle1', '2026-10-21T10:00:00.000Z', { isGuest: true }),
        account('idle7', '2026-10-12T10:00:00.000Z', { isGuest: true }),
        // Visite de moins de 60 s actives le jour de sa création : pas actif, hors cohorte.
        account('idle1b', '2026-10-19T10:00:00.000Z'),
      ],
      visits: [
        visit('r1', '2026-10-21T18:00:00.000Z', { active: 120 }),
        visit('s2', '2026-10-16T18:00:00.000Z', { active: 120 }),
        // Moins de 60 s actives le 24/10 : pas un retour.
        visit('r2', '2026-10-24T18:00:00.000Z', { active: 50 }),
        visit('idle1b', '2026-10-19T18:00:00.000Z', { active: 40 }),
      ],
      games: [
        game('2026-10-22T18:00:00.000Z', 'r2'),
        game('2026-10-23T22:30:00.000Z', 'r3'),
        game('2026-10-25T10:00:00.000Z', 'r4'),
        game('2026-10-17T10:00:00.000Z', 's1'),
        game('2026-10-11T10:00:00.000Z', 's2'),
        game('2026-10-18T10:00:00.000Z', 's3'),
        game('2026-10-20T10:00:00.000Z', 's4'),
        game('2026-10-21T10:00:00.000Z', 'staff'),
      ],
    }),
    NOW
  )

  it('J+1 : actifs un jour de Paris au moins égal au lendemain de la création, invités compris', () => {
    expect(stats.retention.d1).toEqual({ cohort: 4, retained: 3, createdSince: null })
  })

  it('J+7 : actifs un jour de Paris au moins 7 jours après la création', () => {
    expect(stats.retention.d7).toEqual({ cohort: 3, retained: 1, createdSince: null })
  })

  it('cohortes rognées au début du journal (10/09/2026) tant qu’elles le précèdent', () => {
    // Aujourd'hui J = 13/09 : J+1 = créés du 05/09 au 11/09, J+7 = du 23/08 au 05/09.
    const early = summarizeActiveAccounts(
      input({
        accounts: [
          // Créé le 07/09, revenu le 09/09 puis plus rien : ce retour n'est
          // connu nulle part, il ne doit pas passer pour « non revenu ».
          account('before', '2026-09-07T10:00:00.000Z'),
          account('after', '2026-09-10T10:00:00.000Z'),
          account('afterIdle', '2026-09-11T10:00:00.000Z'),
          // Invités sans partie connue : créé avant le journal (activité
          // d'alors inconnue), ou depuis — seul le second est « créé sans jouer ».
          account('guestBefore', '2026-09-05T10:00:00.000Z', { isGuest: true }),
          account('guestIdle', '2026-09-11T10:00:00.000Z', { isGuest: true }),
        ],
        games: [
          game('2026-09-12T10:00:00.000Z', 'before'),
          game('2026-09-10T12:00:00.000Z', 'after'),
          game('2026-09-11T12:00:00.000Z', 'after'),
          game('2026-09-11T12:00:00.000Z', 'afterIdle'),
        ],
      }),
      new Date('2026-09-13T10:00:00.000Z')
    )
    expect(early.retention.d1).toEqual({ cohort: 2, retained: 1, createdSince: '2026-09-10' })
    // Aucun jour de la cohorte J+7 n'est mesurable : vide, et dit.
    expect(early.retention.d7).toEqual({ cohort: 0, retained: 0, createdSince: '2026-09-10' })
    expect(early.accounts.idleGuests).toEqual({ d7: 1, d30: 1 })
  })
})

describe('summarizeActiveAccounts — visites, classement, navigateurs', () => {
  const old = '2026-08-01T10:00:00.000Z'
  const stats = summarizeActiveAccounts(
    input({
      accounts: ['u1', 'u2', 'u3', 'u4', 'u5'].map((id) => account(id, old)),
      visits: [
        // Deux visites créées au même instant : une seule, de 30 min + 60 s.
        visit('u1', '2026-10-22T18:00:00.000Z', { minutes: 30, active: 1200, game: 600, visible: 1500 }),
        visit('u1', '2026-10-22T18:00:00.000Z', { minutes: 0 }),
        visit('u2', '2026-10-23T18:00:00.000Z', { minutes: 10, active: 300, visible: 500 }),
        visit('u2', '2026-10-24T18:00:00.000Z', { minutes: 20, active: 600, game: 800, visible: 1100 }),
        // Hors des 7 jours : ni dans les durées ni dans le classement.
        visit('u3', '2026-10-10T18:00:00.000Z', { minutes: 90, active: 5000 }),
        // Moins de 60 s actives et aucune partie : pas actif, pas classé — mais
        // c'est bien une visite (durée d'une minute, un seul battement).
        visit('u5', '2026-10-24T18:00:00.000Z', { minutes: 0, active: 30 }),
      ],
      games: [
        game('2026-10-24T20:00:00.000Z', 'u4', 'u4', null),
        game('2026-10-25T20:00:00.000Z', 'u4'),
        game('2026-10-25T21:00:00.000Z', null, null),
      ],
      browserDays: [
        { visitorId: 'v1', date: '2026-10-25' },
        { visitorId: 'v1', date: '2026-10-24' },
        { visitorId: 'v2', date: '2026-10-20' },
        { visitorId: 'v3', date: '2026-10-25' },
        { visitorId: 'v4', date: '2026-10-18' },
        { visitorId: 'v5', date: '2026-10-26' },
      ],
      // v3 : présence liée à un compte ; v4 : présence effacée (ancien accord).
      unlinkedVisitorIds: ['v1', 'v2', 'v5'],
      firstVisitStartedAt: new Date('2026-09-12T22:30:00.000Z'),
    }),
    NOW
  )

  it('durée médiane d’une visite et temps actif médian par compte, sur 7 jours', () => {
    expect(stats.visits).toEqual({
      // Durées après fusion : 31 min, 11 min, 21 min et 1 min.
      medianVisitSeconds7d: 16 * 60,
      // u1 : 1 200 s ; u2 : 900 s ; u5 : 30 s.
      medianActiveSecondsPerAccount7d: 900,
      gameSeconds7d: 1400,
      visibleSeconds7d: 3130,
      // Les deux créations simultanées de u1 : une visite, pas deux.
      devices7d: [{ device: 'unknown', visits: 4, accounts: 3 }],
    })
  })

  it('classe les comptes actifs sur 7 jours par temps actif, puis par parties', () => {
    expect(stats.topAccounts7d).toEqual([
      { userId: 'u1', activeSeconds: 1200, games: 0 },
      { userId: 'u2', activeSeconds: 900, games: 0 },
      // Un siège par partie, même rattaché deux fois ; aucune visite : temps
      // non suivi (null), pas « 0 s ».
      { userId: 'u4', activeSeconds: null, games: 2 },
    ])
  })

  it('compte à part les sièges sans compte, par jour et par fenêtre', () => {
    expect(stats.players.deletedSeats).toEqual({ d1: 2, d7: 3, d30: 3 })
    const byDay = new Map(stats.series.map((point) => [point.day, point.deletedSeats]))
    expect(byDay.get('2026-10-24')).toBe(1)
    expect(byDay.get('2026-10-25')).toBe(2)
    // Jamais parmi les comptes.
    expect(stats.players.unique.d1).toBe(1)
  })

  it('compte les navigateurs sans compte à part, sur 1 et 7 jours de Paris', () => {
    // v1 (aujourd'hui et hier), v2 ; ni v3 (lié), ni v4 (présence effacée), ni v5 (demain).
    expect(stats.browsersWithoutAccount).toEqual({ d1: 1, d7: 2 })
  })

  it('date la couverture du journal et des visites', () => {
    expect(stats.coverage).toEqual({ journalSince: '2026-09-10', visitsSince: '2026-09-13' })
  })

  it('sans visite, les médianes sont nulles et non 0', () => {
    const empty = summarizeActiveAccounts(input({}), NOW)
    expect(empty.visits).toEqual({
      medianVisitSeconds7d: null,
      medianActiveSecondsPerAccount7d: null,
      gameSeconds7d: 0,
      visibleSeconds7d: 0,
      devices7d: [],
    })
    expect(empty.retention).toEqual({
      d1: { cohort: 0, retained: 0, createdSince: null },
      d7: { cohort: 0, retained: 0, createdSince: null },
    })
    expect(empty.coverage.visitsSince).toBeNull()
  })

  it('limite le classement à 10 comptes', () => {
    const many = summarizeActiveAccounts(
      input({
        accounts: Array.from({ length: 12 }, (_, i) => account(`p${i}`, old)),
        games: Array.from({ length: 12 }, (_, i) =>
          Array.from({ length: i + 1 }, () => game('2026-10-24T20:00:00.000Z', `p${i}`))
        ).flat(),
      }),
      NOW
    )
    expect(many.topAccounts7d).toHaveLength(10)
    expect(many.topAccounts7d[0]).toEqual({ userId: 'p11', activeSeconds: null, games: 12 })
  })
})

describe('parseExcludedUserIds', () => {
  it('lit un tableau JSON d’identifiants, sans doublon ni entrée invalide', () => {
    expect(parseExcludedUserIds('["a","b","a","",42,null]')).toEqual(['a', 'b'])
  })

  it('tolère une valeur absente, illisible ou d’un autre type', () => {
    expect(parseExcludedUserIds(null)).toEqual([])
    expect(parseExcludedUserIds(undefined)).toEqual([])
    expect(parseExcludedUserIds('pas du json')).toEqual([])
    expect(parseExcludedUserIds('{"a":1}')).toEqual([])
  })
})

describe('getActiveAccountsStats', () => {
  it('lit sur 30 jours de Paris, met le résumé en cache, relit « en ligne » et les noms à chaque appel', async () => {
    settingMock.findUnique.mockResolvedValue({ key: 'metrics.excludedUserIds', value: '["tester"]' })
    userMock.findMany.mockImplementation(async (args: { where: { id?: unknown } }) =>
      args.where.id
        ? [
            {
              id: 'guest1',
              displayName: 'Suzon',
              accountCode: 'LP-ABCDEF',
              isGuest: true,
              email: null,
              passwordHash: '',
              sessions: [{ expiresAt: new Date('2027-01-01T00:00:00.000Z') }],
            },
          ]
        : [
            account('guest1', '2026-10-20T10:00:00.000Z', { isGuest: true }),
            account('tester', '2026-10-20T10:00:00.000Z', { isGuest: true }),
          ]
    )
    visitMock.findMany.mockResolvedValue([])
    visitMock.findFirst.mockResolvedValue(null)
    gameSessionMock.findMany.mockResolvedValue([
      { startedAt: new Date('2026-10-24T18:00:00.000Z'), participants: [{ userId: 'guest1' }, { userId: null }] },
      { startedAt: new Date('2026-10-24T19:00:00.000Z'), participants: [{ userId: 'tester' }] },
    ])
    dailyVisitorMock.findMany.mockResolvedValue([
      { visitorId: 'v1', date: '2026-10-25' },
      { visitorId: 'v2', date: '2026-10-25' },
    ])
    // v1 : présence sans compte ; v2 : liée à un compte (non renvoyée).
    presenceMock.findMany.mockResolvedValue([{ visitorId: 'v1' }])
    userMock.count.mockResolvedValue(2)

    const stats = await getActiveAccountsStats(NOW)

    // Borne basse : minuit de Paris du 26/09 (heure d'été), jamais « now − 30 × 24 h ».
    const since = new Date('2026-09-25T22:00:00.000Z')
    expect(visitMock.findMany.mock.calls[0][0].where).toEqual({ startedAt: { gte: since } })
    // L'appareil (catégorie seule) est lu pour la répartition par appareil.
    expect(visitMock.findMany.mock.calls[0][0].select).toMatchObject({ device: true })
    expect(gameSessionMock.findMany.mock.calls[0][0].where).toEqual({ startedAt: { gte: since } })
    expect(dailyVisitorMock.findMany.mock.calls[0][0].where).toEqual({ date: { gte: '2026-10-19' } })
    expect(presenceMock.findMany.mock.calls[0][0].where).toEqual({
      visitorId: { in: ['v1', 'v2'] },
      userId: null,
    })
    // En ligne : comptes de joueurs vus depuis 3 min, hors comptes de test.
    expect(userMock.count.mock.calls[0][0].where.AND).toEqual([
      { OR: [{ email: { not: null } }, { isGuest: true }] },
      { role: 'user', lastSeenAt: { gte: new Date(NOW.getTime() - 3 * MIN) } },
      { id: { notIn: ['tester'] } },
    ])
    expect(stats.accounts.onlineNow).toBe(2)

    expect(stats.accounts.active).toEqual({ d1: 0, d7: 1, d30: 1 })
    expect(stats.accounts.testExcluded).toBe(1)
    expect(stats.series.find((point) => point.day === '2026-10-24')?.launches).toBe(1)
    // Invité créé le 20/10 et actif depuis : nouveau de son jour de création ;
    // le compte de test, créé le même jour, n'y est pas.
    expect(stats.series.find((point) => point.day === '2026-10-20')).toMatchObject({ newAccounts: 1, newGuests: 1 })
    expect(stats.visits.devices7d).toEqual([])
    expect(stats.topAccounts7d).toEqual([
      { userId: 'guest1', displayName: 'Suzon', accountCode: 'LP-ABCDEF', kind: 'guest', activeSeconds: null, games: 1 },
    ])
    expect(stats.browsersWithoutAccount).toEqual({ d1: 1, d7: 1 })
    expect(stats).toMatchObject({ computedAt: NOW.toISOString(), cacheSeconds: 300 })
    // Ni email ni hash dans la réponse.
    expect(JSON.stringify(stats)).not.toMatch(/passwordHash|email/)

    // Une minute plus tard : résumé servi par le cache, daté de son calcul ;
    // « en ligne » et le classement relus (un compte renommé entre-temps).
    userMock.count.mockResolvedValue(0)
    userMock.findMany.mockImplementation(async () => [
      {
        id: 'guest1',
        displayName: 'Suzanne',
        accountCode: 'LP-ABCDEF',
        isGuest: true,
        email: null,
        passwordHash: '',
        sessions: [],
      },
    ])
    const cached = await getActiveAccountsStats(new Date(NOW.getTime() + MIN))
    expect(visitMock.findMany).toHaveBeenCalledTimes(1)
    expect(cached.computedAt).toBe(NOW.toISOString())
    expect(cached.accounts.onlineNow).toBe(0)
    expect(cached.topAccounts7d[0]).toMatchObject({ displayName: 'Suzanne', kind: 'guest_orphan' })

    // Compte supprimé entre-temps : il sort du classement sans attendre le cache.
    userMock.findMany.mockImplementation(async () => [])
    expect((await getActiveAccountsStats(new Date(NOW.getTime() + 90 * 1000))).topAccounts7d).toEqual([])

    // Liste des tests modifiée : recalcul immédiat.
    invalidateActiveAccountsStats()
    await getActiveAccountsStats(new Date(NOW.getTime() + 2 * MIN))
    expect(visitMock.findMany).toHaveBeenCalledTimes(2)
  })
})
