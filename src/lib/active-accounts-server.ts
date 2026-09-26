import { prisma } from '@/lib/prisma'
import type { AccountKind } from '@/lib/account-kind'
import {
  mergeOverlappingVisits,
  VISIT_END_TAIL_MS,
  type StoredAccountVisit,
} from '@/lib/account-activity-server'
import { accountKindSelect, kindOfAccount, NON_LEGACY_ACCOUNT_WHERE } from '@/lib/account-kind-server'
import type { DeviceKind } from '@/lib/device-from-user-agent'
import { getExcludedUserIds } from '@/lib/metrics-exclusions'
import { GAME_JOURNAL_SINCE } from '@/lib/online/game-sessions'
import { parisDayOffset, parisDayStartUtc, parisDayString, parisDaysBack } from '@/lib/paris-time'
import { onlineSince } from '@/lib/presence'

/**
 * COMPTES ACTIFS ET JOUEURS UNIQUES — tableau de la Vue d'ensemble (lot 7),
 * admin et plus. Lecture seule, sans donnée nouvelle : tout se lit dans les
 * visites des comptes consentants (AccountVisit), le journal des parties
 * (OnlineGameSession ⨝ OnlineGameSessionPlayer, tous les comptes) et, à part,
 * les jours de visite des navigateurs (DailyVisitor).
 *
 * Définitions (jours calendaires de PARIS, aujourd'hui inclus) :
 * - compte ACTIF sur P : une visite commencée dans P avec au moins 60 s de
 *   temps actif, OU une place dans une partie lancée dans P ;
 * - JOUEUR UNIQUE sur P : une place dans une partie lancée dans P, OU une
 *   visite commencée dans P avec au moins 60 s en partie (seule trace du jeu
 *   local) ;
 * - NOUVEAU sur P : créé dans P ET actif dans P (un invité créé sans jouer
 *   n'est pas un nouveau compte : il est compté à part) ; REVENANT : actif
 *   dans P, créé avant P ;
 * - NOUVEAUX DU JOUR J (série) : créés le jour J ET actifs depuis, J compris.
 *   Même définition, rapportée au jour de CRÉATION : les 7 derniers jours de
 *   la série additionnés redonnent le « nouveaux sur 7 jours ». Un simple
 *   « créés ce jour-là » aurait menti : les invités créés sans jouer sont
 *   purgés à 7 jours, la courbe aurait chuté d'elle-même au-delà ;
 * - retour J+1 / J+7 : parmi les comptes créés du jour J−8 au jour J−2
 *   (resp. J−21 à J−8) ET actifs depuis leur création, ceux actifs un jour de
 *   Paris ≥ création + 1 (resp. + 7). Jamais de compte créé avant le début du
 *   journal : ses jours d'activité d'alors ne sont connus nulle part, il
 *   passerait pour « non revenu ». Effectifs bruts, invités compris : l'écran
 *   masque le pourcentage des petites cohortes ;
 * - APPAREILS sur 7 jours : visites commencées sur 7 jours par catégorie
 *   d'appareil de leur premier battement (AccountVisit.device), et comptes
 *   distincts par catégorie. Une catégorie, jamais un navigateur ni une IP.
 * Une visite compte pour son jour de DÉBUT ; une partie, pour son lancement.
 *
 * Équipe (rôle ≠ 'user', rôle ACTUEL : un ancien modérateur rétrogradé
 * réapparaît) et comptes de test (metrics-exclusions.ts) sont exclus de TOUS
 * les chiffres et comptés à part. Libellé « comptes », jamais « personnes » :
 * un même joueur peut avoir plusieurs comptes invités.
 *
 * Passé instable, à dire à l'écran : un compte supprimé depuis perd ses
 * visites (Cascade) et ses places (SetNull) — il sort des totaux des jours
 * passés, qui sont recalculés à chaque lecture. Ses sièges restent, sans
 * compte : ils sont comptés à part, par jour.
 *
 * Coût : des lectures bornées aux 30 derniers jours de Paris (les cohortes y
 * tiennent : la plus ancienne remonte à J−21), regroupées en JS, sous un cache
 * de 5 min — jamais dans la boucle de 15 s de la Supervision. Seuls « en ligne
 * maintenant » et les noms du classement sont relus à chaque appel.
 *
 * RGPD : aucun pseudo lu hors des 10 comptes du classement, résolus à chaque
 * lecture (jamais mis en cache : un compte supprimé ou renommé cesse aussitôt
 * d'y être nommé) ; aucun email, aucune IP, aucun visitorId renvoyé.
 */

/** Seuil de temps actif (visite) ou en partie (joueur unique), en secondes. */
export const ACTIVITY_MIN_SECONDS = 60

/** Fenêtres des compteurs, en jours de Paris (aujourd'hui inclus). */
export const ACTIVITY_WINDOW_DAYS = { d1: 1, d7: 7, d30: 30 } as const

/** Série quotidienne : 14 jours de Paris, du plus ancien au plus récent. */
export const ACTIVITY_SERIES_DAYS = 14

/**
 * Cohortes des retours, en jours de Paris avant aujourd'hui (bornes
 * incluses) : `from` est le plus ancien jour de création, `to` le plus récent.
 * `gapDays` = écart minimal entre le jour de création et un jour d'activité.
 */
export const RETENTION_COHORTS = {
  d1: { from: 8, to: 2, gapDays: 1 },
  d7: { from: 21, to: 8, gapDays: 7 },
} as const

/** Taille du classement des comptes les plus actifs sur 7 jours. */
export const TOP_ACCOUNTS = 10

/**
 * Catégories d'appareil connues, dans l'ordre de départage à égalité de
 * visites. 'unknown' en dernier : c'est l'absence de réponse, pas un appareil.
 */
const DEVICE_ORDER: readonly DeviceKind[] = ['mobile', 'tablet', 'mac', 'pc', 'unknown']

/**
 * Catégorie d'une visite. L'écriture stocke null pour un appareil non reconnu
 * (account-visits-server.ts) ; une valeur inattendue (colonne écrite par une
 * autre version) est traitée pareil plutôt que de créer une catégorie de plus.
 */
function visitDevice(device: string | null): DeviceKind {
  return DEVICE_ORDER.find((kind) => kind === device) ?? 'unknown'
}

/** Durée de vie du cache (même parti pris que getGrowthStats). */
const ACTIVE_ACCOUNTS_CACHE_MS = 5 * 60 * 1000

/**
 * Plafonds des lectures de la fenêtre. Quelques dizaines de lignes par jour en
 * pratique ; les bornes ne servent qu'à garder les requêtes bornées (les plus
 * récentes sont gardées).
 */
const MAX_WINDOW_VISITS = 20_000
const MAX_WINDOW_GAMES = 10_000
const MAX_BROWSER_DAYS = 20_000

type DayWindows = { d1: number; d7: number; d30: number }
type WeekMonth = { d7: number; d30: number }

/** Compte tel que lu pour l'agrégation : ni pseudo, ni email. */
export type ActivityAccount = {
  id: string
  role: string
  isGuest: boolean
  createdAt: Date
}

/** Visite brute d'un compte (avant fusion des créations simultanées). */
export type ActivityVisit = StoredAccountVisit & { userId: string }

/** Partie du journal : date de lancement et comptes des sièges HUMAINS (null = compte supprimé). */
export type ActivityGame = { startedAt: Date; seatUserIds: Array<string | null> }

/** Jour de visite d'un navigateur (DailyVisitor). */
export type ActivityBrowserDay = { visitorId: string; date: string }

/** Compte du classement, pseudo résolu à la lecture. */
export type TopActiveAccount = {
  userId: string
  displayName: string
  accountCode: string | null
  kind: AccountKind
  /**
   * Temps actif des visites commencées sur 7 jours ; null quand le compte n'a
   * aucune visite sur 7 jours (statistiques non acceptées) : non suivi, pas nul.
   */
  activeSeconds: number | null
  /** Parties du journal lancées sur 7 jours où le compte a un siège. */
  games: number
}

/**
 * Retour J+1 ou J+7. `createdSince` : premier jour de création retenu quand la
 * cohorte est rognée par le début du journal (null sinon) — l'écran le dit.
 */
export type RetentionCohort = { cohort: number; retained: number; createdSince: string | null }

export type ActiveAccountsStats = {
  /**
   * Instant du calcul du résumé (ISO) : il est mis en cache, donc daté. Seuls
   * `accounts.onlineNow` et les noms du classement sont lus à chaque appel.
   */
  computedAt: string
  /** Durée de vie du cache, en secondes. */
  cacheSeconds: number
  coverage: {
    /** Premier jour du journal des parties (tous les comptes) : rien avant. */
    journalSince: string
    /** Jour de Paris de la plus ancienne visite conservée ; null si aucune. */
    visitsSince: string | null
  }
  accounts: {
    /** Comptes dont la dernière activité date de moins de 3 min (presence.ts), lu à chaque appel. */
    onlineNow: number
    active: DayWindows
    /** Dont comptes invités. */
    guests: DayWindows
    newAccounts: WeekMonth
    returning: WeekMonth
    /**
     * Invités créés sur la période SANS y être actifs : ni nouveaux ni
     * revenants, comptés à part. Jamais créés avant le début du journal.
     */
    idleGuests: WeekMonth
    /** Comptes de l'équipe actifs sur 30 jours, écartés de tous les chiffres (« + N équipe »). */
    staffExcluded: number
    /** Comptes de test actifs sur 30 jours, écartés de tous les chiffres. */
    testExcluded: number
  }
  players: {
    unique: DayWindows
    /**
     * Sièges humains SANS compte des parties lancées sur la période (compte
     * supprimé depuis, ou humain jamais rattaché) : hors effectifs, à part.
     */
    deletedSeats: DayWindows
  }
  visits: {
    /** Durée médiane d'une visite commencée sur 7 jours (fin = dernier battement + 60 s). */
    medianVisitSeconds7d: number | null
    /** Médiane, par compte ayant des visites sur 7 jours, de son temps actif cumulé. */
    medianActiveSecondsPerAccount7d: number | null
    /** Temps en partie des visites de 7 jours (part du temps passée en partie : / visibleSeconds7d). */
    gameSeconds7d: number
    visibleSeconds7d: number
    /**
     * Visites commencées sur 7 jours de Paris (les mêmes que les durées
     * ci-dessus : comptes ayant accepté les statistiques, hors équipe et
     * comptes de test), par catégorie d'appareil de leur premier battement ;
     * 'unknown' = appareil non reconnu. `accounts` = comptes distincts ayant
     * au moins une visite sur cet appareil : un compte vu sur mobile ET sur
     * PC compte dans les deux, la somme des `accounts` dépasse donc le nombre
     * de comptes. Catégories sans visite absentes ; tri par visites
     * décroissantes. Vide sans visite.
     */
    devices7d: Array<{ device: DeviceKind; visits: number; accounts: number }>
  }
  /**
   * 14 jours de Paris, du plus ancien au plus récent. `launches` = parties
   * lancées ce jour, hors parties jouées par l'équipe ou des comptes de test
   * SEULS ; `deletedSeats` = sièges sans compte des parties lancées ce jour.
   */
  series: Array<{
    day: string
    activeAccounts: number
    uniquePlayers: number
    launches: number
    deletedSeats: number
    /**
     * Comptes CRÉÉS ce jour de Paris ET actifs depuis (ce jour compris,
     * jusqu'à aujourd'hui), hors équipe et comptes de test : la définition de
     * « nouveau », rapportée au jour de création. Les 7 derniers jours
     * additionnés = `accounts.newAccounts.d7`. Un invité créé sans jouer n'y
     * est pas (voir `accounts.idleGuests`). Peut monter après coup : un compte
     * créé un jour et actif seulement le lendemain rejoint son jour de
     * création au calcul suivant. Avant `coverage.journalSince`, seules les
     * visites disent l'activité : sous-estimé, comme `activeAccounts`.
     */
    newAccounts: number
    /** Dont comptes invités. */
    newGuests: number
  }>
  retention: {
    d1: RetentionCohort
    d7: RetentionCohort
  }
  topAccounts7d: TopActiveAccount[]
  /**
   * Navigateurs (statistiques acceptées) dont la présence n'est liée à aucun
   * compte. Une autre unité que les comptes : JAMAIS additionnés à eux.
   */
  browsersWithoutAccount: { d1: number; d7: number }
}

export type ActiveAccountsInput = {
  /** Comptes connus de la fenêtre (actifs, créés ou en ligne), équipe comprise. */
  accounts: ActivityAccount[]
  visits: ActivityVisit[]
  games: ActivityGame[]
  excludedUserIds: readonly string[]
  browserDays: ActivityBrowserDay[]
  /**
   * visitorId des navigateurs dont la présence EXISTE et n'est liée à aucun
   * compte. Une présence effacée (retour d'un navigateur resté à l'ancien
   * accord : jours de visite gardés) ne dit plus rien du compte : ce
   * navigateur n'est pas présumé « sans compte ».
   */
  unlinkedVisitorIds: readonly string[]
  /** Début de la plus ancienne visite conservée (toutes dates). */
  firstVisitStartedAt: Date | null
}

/** Classement avant résolution des noms. */
export type RankedActiveAccount = Pick<TopActiveAccount, 'userId' | 'activeSeconds' | 'games'>

/**
 * Résumé mis en cache : ni « en ligne maintenant » (une fenêtre de 3 min ne
 * se sert pas 5 min en cache) ni nom de compte (résolus à chaque lecture).
 */
export type ActiveAccountsSummary = Omit<
  ActiveAccountsStats,
  'computedAt' | 'cacheSeconds' | 'topAccounts7d' | 'accounts'
> & {
  accounts: Omit<ActiveAccountsStats['accounts'], 'onlineNow'>
  topAccounts7d: RankedActiveAccount[]
}

/**
 * Jour de Paris `days` jours APRÈS `day` (AAAA-MM-JJ), en arithmétique
 * calendaire : midi UTC d'un jour tombe toujours ce même jour à Paris (UTC+1
 * ou +2), et parisDayOffset ne soustrait jamais 24 h.
 */
export function shiftParisDay(day: string, days: number): string {
  return parisDayOffset(-days, new Date(`${day}T12:00:00.000Z`))
}

/** Médiane arrondie à la seconde ; null pour une liste vide. */
function median(values: number[]): number | null {
  if (values.length === 0) return null
  const sorted = [...values].sort((a, b) => a - b)
  const middle = Math.floor(sorted.length / 2)
  return sorted.length % 2 === 1
    ? sorted[middle]
    : Math.round((sorted[middle - 1] + sorted[middle]) / 2)
}

function addDay(map: Map<string, Set<string>>, userId: string, day: string): void {
  const days = map.get(userId) ?? new Set<string>()
  days.add(day)
  map.set(userId, days)
}

/** Au moins un jour ≥ `fromDay` (les jours au-delà d'aujourd'hui sont écartés en amont). */
function hasDaySince(days: Set<string> | undefined, fromDay: string): boolean {
  if (!days) return false
  for (const day of days) if (day >= fromDay) return true
  return false
}

/**
 * Agrégation PURE du tableau (voir l'en-tête du module). `now` est lu une
 * fois : tous les « aujourd'hui » du calcul sont le même jour de Paris, quel
 * que soit le fuseau du conteneur (UTC en production).
 */
export function summarizeActiveAccounts(input: ActiveAccountsInput, now: Date): ActiveAccountsSummary {
  const today = parisDayString(now)
  const fromDay = (days: number) => parisDayOffset(days - 1, now)
  const from = {
    d1: fromDay(ACTIVITY_WINDOW_DAYS.d1),
    d7: fromDay(ACTIVITY_WINDOW_DAYS.d7),
    d30: fromDay(ACTIVITY_WINDOW_DAYS.d30),
  }
  // Les lectures bornent déjà ; on ne se fie pas à l'appelant pour la fenêtre.
  const inWindow = (day: string) => day >= from.d30 && day <= today

  const excluded = new Set(input.excludedUserIds)
  const accountsById = new Map(input.accounts.map((account) => [account.id, account]))
  /** Compté dans les chiffres : rôle joueur et hors comptes de test. */
  const isCounted = (account: ActivityAccount) => account.role === 'user' && !excluded.has(account.id)
  const counted = input.accounts.filter(isCounted)

  // Jours d'activité et jours de jeu par compte (équipe et tests compris : ils
  // sont comptés à part). Un compte absent de `accounts` (legacy, ou créé
  // pendant la lecture) est ignoré.
  const activeDays = new Map<string, Set<string>>()
  const playerDays = new Map<string, Set<string>>()

  // ── Visites : fusion des créations simultanées par compte, puis seuils. ──
  const visitsByUser = new Map<string, StoredAccountVisit[]>()
  for (const { userId, ...visit } of input.visits) {
    if (!accountsById.has(userId)) continue
    const visits = visitsByUser.get(userId) ?? []
    visits.push(visit)
    visitsByUser.set(userId, visits)
  }
  const visits7 = new Map<string, StoredAccountVisit[]>()
  for (const [userId, visits] of visitsByUser) {
    for (const visit of mergeOverlappingVisits(visits)) {
      const day = parisDayString(visit.startedAt)
      if (!inWindow(day)) continue
      if (visit.activeSeconds >= ACTIVITY_MIN_SECONDS) addDay(activeDays, userId, day)
      if (visit.gameSeconds >= ACTIVITY_MIN_SECONDS) addDay(playerDays, userId, day)
      if (day < from.d7) continue
      const week = visits7.get(userId) ?? []
      week.push(visit)
      visits7.set(userId, week)
    }
  }

  // ── Journal : une place = actif ET joueur ce jour-là. ──
  const launchesByDay = new Map(parisDaysBack(ACTIVITY_SERIES_DAYS, now).map((day) => [day, 0]))
  const games7 = new Map<string, number>()
  /** Sièges sans compte (userId nul) par jour de Paris de la fenêtre. */
  const deletedSeatsByDay = new Map<string, number>()
  for (const game of input.games) {
    const day = parisDayString(game.startedAt)
    if (!inWindow(day)) continue
    // Compte supprimé depuis (SetNull) ou humain jamais rattaché, indiscernables :
    // un par siège, jamais parmi les comptes.
    const deletedSeats = game.seatUserIds.filter((userId) => userId === null).length
    if (deletedSeats > 0) deletedSeatsByDay.set(day, (deletedSeatsByDay.get(day) ?? 0) + deletedSeats)
    const seats = game.seatUserIds.map((userId) => (userId ? (accountsById.get(userId) ?? null) : null))
    // Partie jouée par l'équipe ou des comptes de test SEULS (un essai de
    // TryBotsGate) : pas une partie de joueur. Un siège sans compte (supprimé
    // ou non rattaché) n'est pas présumé interne.
    const internalOnly = seats.length > 0 && seats.every((account) => account !== null && !isCounted(account))
    const launches = launchesByDay.get(day)
    if (!internalOnly && launches !== undefined) launchesByDay.set(day, launches + 1)

    const seen = new Set<string>()
    for (const account of seats) {
      if (!account || seen.has(account.id)) continue
      seen.add(account.id)
      addDay(activeDays, account.id, day)
      addDay(playerDays, account.id, day)
      if (day >= from.d7) games7.set(account.id, (games7.get(account.id) ?? 0) + 1)
    }
  }

  const countSince = (
    days: Map<string, Set<string>>,
    since: string,
    extra: (account: ActivityAccount) => boolean = () => true
  ) => counted.filter((account) => hasDaySince(days.get(account.id), since) && extra(account)).length
  const windows = (days: Map<string, Set<string>>, extra?: (account: ActivityAccount) => boolean) => ({
    d1: countSince(days, from.d1, extra),
    d7: countSince(days, from.d7, extra),
    d30: countSince(days, from.d30, extra),
  })
  const createdDay = (account: ActivityAccount) => parisDayString(account.createdAt)
  const createdSince = (since: string) => (account: ActivityAccount) => createdDay(account) >= since
  const createdBefore = (since: string) => (account: ActivityAccount) => createdDay(account) < since

  const activeOn30 = (account: ActivityAccount) => hasDaySince(activeDays.get(account.id), from.d30)

  // ── Visites de 7 jours : comptes comptés seulement. ──
  const countedVisits7 = counted.flatMap((account) => visits7.get(account.id) ?? [])
  const activeByAccount7 = counted.flatMap((account) => {
    const week = visits7.get(account.id)
    return week
      ? [{ userId: account.id, activeSeconds: week.reduce((sum, visit) => sum + visit.activeSeconds, 0) }]
      : []
  })

  // ── Appareils des visites de 7 jours : les mêmes visites que les durées
  // (après fusion : deux onglets ouverts au même instant ne font pas deux
  // visites mobiles), comptes comptés seulement. ──
  const devices = new Map<DeviceKind, { visits: number; accounts: Set<string> }>()
  for (const account of counted) {
    for (const visit of visits7.get(account.id) ?? []) {
      const device = visitDevice(visit.device)
      const row = devices.get(device) ?? { visits: 0, accounts: new Set<string>() }
      row.visits += 1
      row.accounts.add(account.id)
      devices.set(device, row)
    }
  }
  const devices7d = [...devices]
    .map(([device, row]) => ({ device, visits: row.visits, accounts: row.accounts.size }))
    .sort(
      (a, b) =>
        b.visits - a.visits ||
        b.accounts - a.accounts ||
        DEVICE_ORDER.indexOf(a.device) - DEVICE_ORDER.indexOf(b.device)
    )

  // ── Retours J+1 / J+7 par cohorte de création. ──
  const retention = (spec: { from: number; to: number; gapDays: number }): RetentionCohort => {
    const nominalOldest = parisDayOffset(spec.from, now)
    // Rognée au début du journal : avant, ni le jour de création ni un retour
    // ne sont connus (le compte passerait pour inactif, ou pour « non revenu »).
    const oldest = nominalOldest < GAME_JOURNAL_SINCE ? GAME_JOURNAL_SINCE : nominalOldest
    const newest = parisDayOffset(spec.to, now)
    // Comptes créés ET actifs depuis : un invité créé sans jouer n'est pas un
    // nouveau compte, il gonflerait la cohorte — et inégalement, puisque les
    // invités orphelins inactifs sont purgés à 7 jours.
    const cohort = counted.filter((account) => {
      const day = createdDay(account)
      return day >= oldest && day <= newest && hasDaySince(activeDays.get(account.id), day)
    })
    const retained = cohort.filter((account) =>
      hasDaySince(activeDays.get(account.id), shiftParisDay(createdDay(account), spec.gapDays))
    )
    return {
      cohort: cohort.length,
      retained: retained.length,
      createdSince: oldest > nominalOldest ? oldest : null,
    }
  }

  // ── Classement : comptes actifs sur 7 jours, temps actif puis parties. ──
  const activeSecondsById = new Map(activeByAccount7.map((row) => [row.userId, row.activeSeconds]))
  const topAccounts7d = counted
    .filter((account) => hasDaySince(activeDays.get(account.id), from.d7))
    .map((account) => ({
      userId: account.id,
      // Aucune visite sur 7 jours : temps non suivi (null), classé comme 0.
      activeSeconds: activeSecondsById.get(account.id) ?? null,
      games: games7.get(account.id) ?? 0,
    }))
    .sort(
      (a, b) =>
        (b.activeSeconds ?? 0) - (a.activeSeconds ?? 0) || b.games - a.games || a.userId.localeCompare(b.userId)
    )
    .slice(0, TOP_ACCOUNTS)

  // ── Navigateurs sans compte : une autre unité, jamais additionnée. ──
  const unlinked = new Set(input.unlinkedVisitorIds)
  const browsersSince = (since: string) =>
    new Set(
      input.browserDays
        .filter((row) => row.date >= since && row.date <= today && unlinked.has(row.visitorId))
        .map((row) => row.visitorId)
    ).size

  // ── Hors effectifs : sièges sans compte, invités créés sans jouer. ──
  const deletedSeatsSince = (since: string) =>
    [...deletedSeatsByDay].reduce((sum, [day, seats]) => (day >= since ? sum + seats : sum), 0)
  // Créés avant le début du journal : leur activité d'alors n'est connue nulle
  // part, ils passeraient pour « sans jouer » — même borne que les cohortes.
  const idleGuestsSince = (since: string) => {
    const bound = since < GAME_JOURNAL_SINCE ? GAME_JOURNAL_SINCE : since
    return counted.filter(
      (account) =>
        account.isGuest && createdDay(account) >= bound && !hasDaySince(activeDays.get(account.id), bound)
    ).length
  }

  // ── Nouveaux comptes par jour de création (série) : créés ce jour-là ET
  // actifs depuis. Les comptes créés dans la fenêtre sont tous lus (voir la
  // requête), sans lecture de plus ; leur activité aussi, puisque la série
  // tient dans la fenêtre de 30 jours. ──
  const newByDay = new Map<string, { accounts: number; guests: number }>()
  for (const account of counted) {
    const day = createdDay(account)
    if (!launchesByDay.has(day) || !hasDaySince(activeDays.get(account.id), day)) continue
    const row = newByDay.get(day) ?? { accounts: 0, guests: 0 }
    row.accounts += 1
    if (account.isGuest) row.guests += 1
    newByDay.set(day, row)
  }

  return {
    coverage: {
      journalSince: GAME_JOURNAL_SINCE,
      visitsSince: input.firstVisitStartedAt ? parisDayString(input.firstVisitStartedAt) : null,
    },
    accounts: {
      active: windows(activeDays),
      guests: windows(activeDays, (account) => account.isGuest),
      newAccounts: {
        d7: countSince(activeDays, from.d7, createdSince(from.d7)),
        d30: countSince(activeDays, from.d30, createdSince(from.d30)),
      },
      returning: {
        d7: countSince(activeDays, from.d7, createdBefore(from.d7)),
        d30: countSince(activeDays, from.d30, createdBefore(from.d30)),
      },
      idleGuests: { d7: idleGuestsSince(from.d7), d30: idleGuestsSince(from.d30) },
      staffExcluded: input.accounts.filter((account) => account.role !== 'user' && activeOn30(account)).length,
      testExcluded: input.accounts.filter(
        (account) => account.role === 'user' && excluded.has(account.id) && activeOn30(account)
      ).length,
    },
    players: {
      unique: windows(playerDays),
      deletedSeats: {
        d1: deletedSeatsSince(from.d1),
        d7: deletedSeatsSince(from.d7),
        d30: deletedSeatsSince(from.d30),
      },
    },
    visits: {
      medianVisitSeconds7d: median(
        countedVisits7.map((visit) =>
          Math.max(
            0,
            Math.round((visit.lastBeatAt.getTime() + VISIT_END_TAIL_MS - visit.startedAt.getTime()) / 1000)
          )
        )
      ),
      medianActiveSecondsPerAccount7d: median(activeByAccount7.map((row) => row.activeSeconds)),
      gameSeconds7d: countedVisits7.reduce((sum, visit) => sum + visit.gameSeconds, 0),
      visibleSeconds7d: countedVisits7.reduce((sum, visit) => sum + visit.visibleSeconds, 0),
      devices7d,
    },
    series: [...launchesByDay].map(([day, launches]) => ({
      day,
      activeAccounts: counted.filter((account) => activeDays.get(account.id)?.has(day)).length,
      uniquePlayers: counted.filter((account) => playerDays.get(account.id)?.has(day)).length,
      launches,
      deletedSeats: deletedSeatsByDay.get(day) ?? 0,
      newAccounts: newByDay.get(day)?.accounts ?? 0,
      newGuests: newByDay.get(day)?.guests ?? 0,
    })),
    retention: {
      d1: retention(RETENTION_COHORTS.d1),
      d7: retention(RETENTION_COHORTS.d7),
    },
    topAccounts7d,
    browsersWithoutAccount: {
      d1: browsersSince(from.d1),
      d7: browsersSince(from.d7),
    },
  }
}


/** Résumé mis en cache, avec la liste des comptes de test qui l'a produit. */
type CachedSummary = { at: number; summary: ActiveAccountsSummary; excludedUserIds: string[] }

/**
 * Lectures du tableau, en parallèle et bornées au minuit de Paris d'il y a
 * 29 jours, puis agrégation pure. Aucun nom lu ici : le résultat est mis en
 * cache. Passer par `getActiveAccountsStats()`, jamais directement.
 */
async function computeActiveAccountsSummary(now: Date): Promise<CachedSummary> {
  const since = parisDayStartUtc(parisDayOffset(ACTIVITY_WINDOW_DAYS.d30 - 1, now))

  const [accounts, visits, games, excludedUserIds, browserDays, firstVisit] = await Promise.all([
    // Comptes utiles au calcul, et eux seuls : créés dans la fenêtre (nouveaux,
    // cohortes, invités créés sans jouer), ou avec une visite ou une place
    // dans la fenêtre. Legacy exclu, comme de la liste et des totaux. Ni
    // pseudo ni email.
    prisma.user.findMany({
      where: {
        AND: [
          NON_LEGACY_ACCOUNT_WHERE,
          {
            OR: [
              { createdAt: { gte: since } },
              { accountVisits: { some: { startedAt: { gte: since } } } },
              { onlineGameSessions: { some: { session: { startedAt: { gte: since } } } } },
            ],
          },
        ],
      },
      select: { id: true, role: true, isGuest: true, createdAt: true },
    }),
    prisma.accountVisit.findMany({
      where: { startedAt: { gte: since } },
      orderBy: { startedAt: 'desc' },
      take: MAX_WINDOW_VISITS,
      select: {
        userId: true,
        startedAt: true,
        lastBeatAt: true,
        visibleSeconds: true,
        activeSeconds: true,
        gameSeconds: true,
        // Catégorie d'appareil seulement ('mobile', 'pc'…) : ni navigateur ni IP.
        device: true,
      },
    }),
    prisma.onlineGameSession.findMany({
      where: { startedAt: { gte: since } },
      orderBy: { startedAt: 'desc' },
      take: MAX_WINDOW_GAMES,
      select: {
        startedAt: true,
        // Sièges HUMAINS seulement ; un compte supprimé revient à userId nul.
        participants: { where: { botName: null }, select: { userId: true } },
      },
    }),
    getExcludedUserIds(),
    // DailyVisitor est déjà daté au jour de Paris (chaîne AAAA-MM-JJ).
    prisma.dailyVisitor.findMany({
      where: { date: { gte: parisDayOffset(ACTIVITY_WINDOW_DAYS.d7 - 1, now) } },
      take: MAX_BROWSER_DAYS,
      select: { visitorId: true, date: true },
    }),
    // Plus ancienne visite conservée : « visites suivies depuis le … ».
    prisma.accountVisit.findFirst({ orderBy: { startedAt: 'asc' }, select: { startedAt: true } }),
  ])

  // Navigateurs de la semaine dont la présence existe SANS compte lié
  // (SitePresence.userId : dernier compte vu sur ce navigateur). Aucun
  // visitorId ne sort de cette fonction.
  const visitorIds = [...new Set(browserDays.map((row) => row.visitorId))]
  const unlinkedPresences = visitorIds.length
    ? await prisma.sitePresence.findMany({
        where: { visitorId: { in: visitorIds }, userId: null },
        select: { visitorId: true },
      })
    : []

  const summary = summarizeActiveAccounts(
    {
      accounts,
      visits,
      games: games.map((game) => ({
        startedAt: game.startedAt,
        seatUserIds: game.participants.map((seat) => seat.userId),
      })),
      excludedUserIds,
      browserDays,
      unlinkedVisitorIds: unlinkedPresences.map((presence) => presence.visitorId),
      firstVisitStartedAt: firstVisit?.startedAt ?? null,
    },
    now
  )

  return { at: now.getTime(), summary, excludedUserIds }
}

/**
 * Cache mémoire partagé par toutes les consoles du processus, comme celui des
 * indicateurs de croissance : la donnée est reconstructible. Un calcul déjà
 * en cours est partagé plutôt que relancé (plusieurs consoles ouvertes en même
 * temps, SQLite en journal DELETE).
 */
let activeAccountsCache: CachedSummary | null = null
let pendingComputation: Promise<CachedSummary> | null = null
/** Incrémentée à chaque invalidation : un calcul lancé avant ne remplit pas le cache. */
let cacheGeneration = 0

/** Résumé agrégé, recalculé au plus une fois par ACTIVE_ACCOUNTS_CACHE_MS. */
async function getActiveAccountsSummary(now: Date): Promise<CachedSummary> {
  const nowMs = now.getTime()
  const cache = activeAccountsCache
  if (cache && nowMs >= cache.at && nowMs - cache.at < ACTIVE_ACCOUNTS_CACHE_MS) return cache
  if (!pendingComputation) {
    const generation = cacheGeneration
    const computation = computeActiveAccountsSummary(now)
      .then((value) => {
        if (generation === cacheGeneration) activeAccountsCache = value
        return value
      })
      .finally(() => {
        if (pendingComputation === computation) pendingComputation = null
      })
    pendingComputation = computation
  }
  return pendingComputation
}

/**
 * Tableau des comptes actifs : le résumé agrégé (cache de 5 min), plus deux
 * lectures faites à CHAQUE appel, bornées et indexées :
 * - « en ligne maintenant » : une fenêtre de 3 min servie 5 min en cache
 *   compterait des comptes partis depuis 8 min, et le bouton Actualiser n'y
 *   changerait rien ;
 * - pseudo, code et type des 10 comptes classés : résolus à la lecture, un
 *   compte supprimé entre-temps sort du classement, un compte renommé y
 *   apparaît sous son nom actuel.
 */
export async function getActiveAccountsStats(now: Date = new Date()): Promise<ActiveAccountsStats> {
  const { at, summary, excludedUserIds } = await getActiveAccountsSummary(now)
  const topIds = summary.topAccounts7d.map((row) => row.userId)

  const [onlineNow, topUsers] = await Promise.all([
    // Comptes de joueurs vus dans la fenêtre, hors comptes de test (même liste
    // que le résumé servi) ; legacy exclu comme partout.
    prisma.user.count({
      where: {
        AND: [
          NON_LEGACY_ACCOUNT_WHERE,
          { role: 'user', lastSeenAt: { gte: onlineSince(now.getTime()) } },
          ...(excludedUserIds.length ? [{ id: { notIn: excludedUserIds } }] : []),
        ],
      },
    }),
    topIds.length
      ? prisma.user.findMany({
          where: { id: { in: topIds } },
          select: { id: true, displayName: true, accountCode: true, ...accountKindSelect(now) },
        })
      : Promise.resolve([]),
  ])
  const topById = new Map(topUsers.map((user) => [user.id, user]))

  return {
    computedAt: new Date(at).toISOString(),
    cacheSeconds: Math.round(ACTIVE_ACCOUNTS_CACHE_MS / 1000),
    ...summary,
    accounts: { onlineNow, ...summary.accounts },
    topAccounts7d: summary.topAccounts7d.flatMap((row) => {
      const user = topById.get(row.userId)
      return user
        ? [
            {
              userId: row.userId,
              displayName: user.displayName,
              accountCode: user.accountCode,
              kind: kindOfAccount(user),
              activeSeconds: row.activeSeconds,
              games: row.games,
            },
          ]
        : []
    }),
  }
}

/**
 * Oublie le cache : appelé quand la liste des comptes de test change, pour que
 * l'exploitant voie l'effet de sa coche sans attendre 5 min.
 */
export function invalidateActiveAccountsStats(): void {
  cacheGeneration += 1
  activeAccountsCache = null
  pendingComputation = null
}
