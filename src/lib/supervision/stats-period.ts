import { sharesOf } from '@/lib/supervision/chart-scale'
import { partialSince } from '@/lib/supervision/week'

/**
 * Période de l'onglet Statistiques — module PUR. Un seul sélecteur
 * (Aujourd'hui / 7 jours / 30 jours) pour tout l'onglet, mais toutes les
 * mesures n'existent pas sur toutes les fenêtres : les visites ne se lisent
 * que sur 7 jours, les nouveaux comptes sur 7 ou 30… Ce module dit, mesure
 * par mesure, quelle fenêtre lire pour la période choisie, et quand la
 * mesure est plus jeune que sa fenêtre. Jamais un chiffre sous une période
 * qu'il ne mesure pas : l'intitulé suit la fenêtre réellement lue.
 */

export const STATS_PERIODS = ['d1', 'd7', 'd30'] as const
export type StatsPeriod = (typeof STATS_PERIODS)[number]

export const DEFAULT_STATS_PERIOD: StatsPeriod = 'd7'

/** Clé de stockage local de la période choisie (un réglage par navigateur). */
export const STATS_PERIOD_STORAGE_KEY = 'supervision.statsPeriod'

/** Jours de Paris de chaque période, aujourd'hui compris. */
export const PERIOD_DAYS: Readonly<Record<StatsPeriod, number>> = { d1: 1, d7: 7, d30: 30 }

/** Période relue du stockage : toute autre valeur (ancienne, abîmée, absente) vaut null. */
export function parseStatsPeriod(value: unknown): StatsPeriod | null {
  return STATS_PERIODS.find((period) => period === value) ?? null
}

/**
 * Fenêtre à lire pour une mesure qui ne sait servir que `available` : la
 * période elle-même quand elle existe, sinon la fenêtre la plus proche en
 * jours (aujourd'hui → 7 jours, 30 jours → 7 jours pour une mesure sur 1 ou
 * 7 jours). null pour une mesure sans aucune fenêtre.
 */
export function measureWindow<K extends StatsPeriod>(period: StatsPeriod, available: readonly K[]): K | null {
  const exact = available.find((key) => key === period)
  if (exact !== undefined) return exact
  const distance = (key: StatsPeriod) => Math.abs(PERIOD_DAYS[key] - PERIOD_DAYS[period])
  let best: K | null = null
  for (const key of available) if (best === null || distance(key) < distance(best)) best = key
  return best
}

export type MeasureSpan<K extends StatsPeriod = StatsPeriod> = {
  /** Fenêtre lue. */
  key: K
  days: number
  /** La période choisie n'existe pas pour cette mesure : l'intitulé doit dire sa propre fenêtre. */
  substituted: boolean
  /**
   * Premier jour mesuré quand la source est plus jeune que la fenêtre (lue à
   * l'heure du calcul, la valeur étant mise en cache) ; null quand la fenêtre
   * est entièrement couverte ou que la source n'a pas de début connu.
   */
  since: string | null
}

/**
 * Fenêtre lue pour une mesure et sa couverture : ce qu'il faut écrire dans
 * son intitulé (« 7 jours », « 30 jours · depuis le 08/10 »).
 */
export function measureSpan<K extends StatsPeriod>(
  period: StatsPeriod,
  available: readonly [K, ...K[]],
  coverage?: { computedAt: Date; since: string | null }
): MeasureSpan<K>
export function measureSpan<K extends StatsPeriod>(
  period: StatsPeriod,
  available: readonly K[],
  coverage?: { computedAt: Date; since: string | null }
): MeasureSpan<K> | null
export function measureSpan<K extends StatsPeriod>(
  period: StatsPeriod,
  available: readonly K[],
  coverage?: { computedAt: Date; since: string | null }
): MeasureSpan<K> | null {
  const key = measureWindow(period, available)
  if (key === null) return null
  const days = PERIOD_DAYS[key]
  const since = coverage?.since ? partialSince(days, coverage.computedAt, coverage.since) : null
  return { key, days, substituted: key !== period, since }
}

/** Le plus ancien de deux instants de calcul : un pied qui réunit deux caches donne l'heure du plus vieux. */
export function oldestComputedAt(...instants: Array<string | null | undefined>): string | null {
  let oldest: string | null = null
  for (const at of instants) {
    if (!at || !Number.isFinite(new Date(at).getTime())) continue
    if (oldest === null || new Date(at).getTime() < new Date(oldest).getTime()) oldest = at
  }
  return oldest
}

export type DailyVisitors = { date: string; visitors: number }

/**
 * Écart des visiteurs d'une semaine sur l'autre, en % arrondi : les 7
 * derniers jours RÉVOLUS (hier compris, aujourd'hui exclu) contre les 7
 * d'avant. Aujourd'hui est entamé : le compter tirerait l'écart vers le bas
 * chaque matin. null quand la série n'a pas 14 jours révolus, quand la
 * semaine de référence est vide, ou quand elle commence avant ou le jour
 * `comparableAfter` (reprise du bandeau de consentement : sa marche n'est
 * pas une baisse de fréquentation).
 */
export function weekOverWeekDelta(points: readonly DailyVisitors[], today: string, comparableAfter: string): number | null {
  const done = points.filter((p) => p.date < today)
  if (done.length < 14) return null
  const last = done.slice(-7)
  const previous = done.slice(-14, -7)
  if (!(previous[0].date > comparableAfter)) return null
  const sum = (days: readonly DailyVisitors[]) =>
    days.reduce((total, p) => total + (Number.isFinite(p.visitors) && p.visitors > 0 ? p.visitors : 0), 0)
  const before = sum(previous)
  if (before <= 0) return null
  return Math.round(((sum(last) - before) / before) * 100)
}

/**
 * Part des visites commencées sur un téléphone (catégorie 'mobile' ; la
 * tablette est à part). null sans visite : « — », jamais 0 %.
 */
export function phoneShare(
  devices: ReadonlyArray<{ device: string; visits: number }>
): { phone: number; total: number; share: number } | null {
  const count = (visits: number) => (Number.isFinite(visits) && visits > 0 ? visits : 0)
  const total = devices.reduce((sum, row) => sum + count(row.visits), 0)
  if (total <= 0) return null
  const phone = devices.filter((row) => row.device === 'mobile').reduce((sum, row) => sum + count(row.visits), 0)
  // Même arrondi (plus fort reste) que les barres « Appareils » posées à côté :
  // 23 sur 34 doit se lire 67 % des deux côtés, pas 68 % sur la tuile.
  const shares = sharesOf(devices.map((row) => count(row.visits)))
  const rounded = devices.reduce((sum, row, i) => sum + (row.device === 'mobile' ? (shares[i] ?? 0) : 0), 0)
  return { phone, total, share: rounded / 100 }
}

export type GameDay = { day: string; solo: number; withHumans: number; local: number; muted: boolean }

/**
 * Parties par jour de Paris, en ligne (journal) et locales (compteurs
 * anonymes) réunies sur les jours de la série en ligne. Un jour antérieur à
 * l'une des mesures dessinées est RAYÉ en entier : sa pile additionnerait
 * une mesure et l'absence de l'autre, un total qui mentirait. `local` null :
 * mesure absente (lecture en échec, ou rien jamais compté), rien n'est
 * additionné ni rayé pour elle ; `local.since` null (rien jamais compté) :
 * des zéros, sans jour rayé.
 */
export function gamesByDay(
  online: ReadonlyArray<{ day: string; solo: number; withHumans: number }>,
  journalSince: string,
  local: { days: ReadonlyArray<{ day: string; starts: number }>; since: string | null } | null
): GameDay[] {
  const localByDay = new Map((local?.days ?? []).map((d) => [d.day, d.starts]))
  return online.map((d) => ({
    day: d.day,
    solo: d.solo,
    withHumans: d.withHumans,
    local: localByDay.get(d.day) ?? 0,
    muted: d.day < journalSince || (local?.since != null && d.day < local.since),
  }))
}

export type GameRow = {
  gameId: string
  gameTitle: string
  /** Parties en ligne lancées ; null quand la mesure manque (colonne « — »). */
  online: number | null
  /** Dont parties à deux humains ou plus. */
  withHumans: number | null
  /** Parties locales lancées ; null quand la mesure manque. */
  local: number | null
  /** Parties locales terminées. */
  ends: number | null
  /** Jeu local sans écran de fin (1220, Purple, Roue des gorgées) : jamais de « terminée ». */
  noEndScreen: boolean
  /** Somme des deux, seulement quand les deux mesures existent. */
  total: number | null
}

/**
 * Tableau par jeu d'une fenêtre : en ligne et locales réunies par jeu. Une
 * liste absente (null) donne « — » dans sa colonne et pas de total ; un jeu
 * absent d'une liste présente y vaut 0. Tri par total (ou par la seule
 * mesure présente) décroissant, puis par titre.
 */
export function gameRows(
  online: ReadonlyArray<{ gameId: string; gameTitle: string; launches: number; withHumans: number }> | null,
  local: ReadonlyArray<{ gameId: string; gameTitle: string; starts: number; ends: number; noEndScreen?: boolean }> | null
): GameRow[] {
  const rows = new Map<string, GameRow>()
  const row = (gameId: string, gameTitle: string) => {
    const existing = rows.get(gameId)
    if (existing) return existing
    const created: GameRow = {
      gameId,
      gameTitle,
      online: online ? 0 : null,
      withHumans: online ? 0 : null,
      local: local ? 0 : null,
      ends: local ? 0 : null,
      noEndScreen: false,
      total: null,
    }
    rows.set(gameId, created)
    return created
  }
  for (const game of online ?? []) {
    const r = row(game.gameId, game.gameTitle)
    r.online = (r.online ?? 0) + game.launches
    r.withHumans = (r.withHumans ?? 0) + game.withHumans
  }
  for (const game of local ?? []) {
    const r = row(game.gameId, game.gameTitle)
    r.local = (r.local ?? 0) + game.starts
    r.ends = (r.ends ?? 0) + game.ends
    r.noEndScreen = game.noEndScreen === true
  }
  const sortKey = (r: GameRow) => r.total ?? r.online ?? r.local ?? 0
  return [...rows.values()]
    .map((r) => ({ ...r, total: r.online !== null && r.local !== null ? r.online + r.local : null }))
    .sort((a, b) => sortKey(b) - sortKey(a) || a.gameTitle.localeCompare(b.gameTitle, 'fr') || a.gameId.localeCompare(b.gameId))
}
