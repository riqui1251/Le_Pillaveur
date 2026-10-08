import { calendarDayOffset, parisDayStartUtc, parisDayString, parisWeekKey } from '@/lib/paris-time'

/**
 * LA TABLE OUVERTE DU VENDREDI — module PUR, importable côté client comme
 * côté serveur (bandeau du hub, ligne de la landing, route publique).
 *
 * Pourquoi : un nouveau venu seul ne revient presque jamais (2 joueurs sur 57
 * reviennent une 2e soirée) et une première partie seul contre des bots
 * déçoit (4/21 rejouent, contre 25/36 à plusieurs). Il lui faut du MONDE, et
 * le monde est dispersé : 67 parties sur 82 se jouent en table privée, et les
 * soirées tombent surtout le vendredi et le dimanche entre 21 h et 1 h. On
 * donne donc un rendez-vous fixe — le vendredi, 21 h à minuit, heure de Paris
 * — sur le jeu qui marche le mieux à plusieurs : l'Imposteur (4,2 humains par
 * partie, 14 parties terminées sur 15). Une seule table PUBLIQUE mise en
 * avant, pour que les arrivants s'additionnent au lieu de s'éparpiller.
 */
export const FRIDAY_TABLE = {
  /** Jour de la semaine (0 = dimanche … 5 = vendredi), lu à Paris. */
  weekday: 5,
  /** Heure d'ouverture, heure de Paris. */
  startHour: 21,
  /** Heure de fermeture, heure de Paris ; 24 = minuit (le lendemain 00:00). */
  endHour: 24,
  gameId: 'imposteur',
  /** Documentaire : les calculs passent par paris-time.ts, câblé sur ce fuseau. */
  tz: 'Europe/Paris',
} as const

/** Clé localStorage du bandeau masqué : vaut la clé de semaine (`YYYY-Www`) de l'occurrence masquée. */
export const FRIDAY_TABLE_DISMISS_KEY = 'lp-friday-table-dismissed'

/**
 * Où en est le rendez-vous : `live` pendant la soirée ; sinon `startsAt`/
 * `endsAt` décrivent la PROCHAINE occurrence. Instants ISO (UTC) : chacun les
 * affiche dans son propre fuseau — le bandeau du hub dans celui du visiteur.
 */
export type FridayTableStatus = {
  live: boolean
  startsAt: string
  endsAt: string
}

const HOUR_MS = 60 * 60 * 1000

/**
 * Jour calendaire décalé de `days` jours (positif = futur). Arithmétique sur
 * la date SEULE (paris-time.ts, posée à midi UTC) : jamais de « + 24 h » qui
 * doublerait ou sauterait un jour au changement d'heure.
 */
function shiftDay(day: string, days: number): string {
  return calendarDayOffset(day, -days)
}

/** Jour de la semaine d'une date calendaire AAAA-MM-JJ (0 = dimanche), lue à midi UTC. */
function weekdayOf(day: string): number {
  return new Date(`${day}T12:00:00Z`).getUTCDay()
}

/**
 * Bornes (ms UTC) de la soirée qui OUVRE le jour de Paris `day`.
 *
 * Ancrage sur le minuit de Paris qui suit (parisDayStartUtc, exact en toute
 * saison), puis décalage en heures pleines. C'est exact parce qu'à Paris le
 * changement d'heure se fait la nuit du samedi au dimanche entre 2 h et 3 h :
 * la plage « startHour → minuit → endHour » d'un vendredi (et, plus
 * généralement, toute plage comprise entre 3 h et 2 h le lendemain) ne le
 * traverse jamais. Une soirée qui finirait après 2 h devrait passer par une
 * vraie conversion heure murale → UTC.
 */
function occurrenceOn(day: string): { start: number; end: number } {
  const nextMidnight = parisDayStartUtc(shiftDay(day, 1)).getTime()
  return {
    start: nextMidnight - (24 - FRIDAY_TABLE.startHour) * HOUR_MS,
    end: nextMidnight + (FRIDAY_TABLE.endHour - 24) * HOUR_MS,
  }
}

/**
 * La soirée en cours, ou la prochaine. On part du DERNIER vendredi de Paris
 * (aujourd'hui compris) : tant que sa soirée n'est pas finie, c'est elle —
 * en cours ou à venir dans la journée ; sinon la semaine suivante. Partir du
 * dernier vendredi plutôt que du prochain garde juste une soirée qui
 * déborderait après minuit (endHour > 24) : le samedi 0 h 30, elle est encore
 * en cours.
 */
export function fridayTableStatus(now: Date = new Date()): FridayTableStatus {
  const nowMs = now.getTime()
  const today = parisDayString(now)
  const back = (weekdayOf(today) - FRIDAY_TABLE.weekday + 7) % 7
  const lastEventDay = shiftDay(today, -back)
  let occurrence = occurrenceOn(lastEventDay)
  if (nowMs >= occurrence.end) occurrence = occurrenceOn(shiftDay(lastEventDay, 7))
  return {
    live: nowMs >= occurrence.start && nowMs < occurrence.end,
    startsAt: new Date(occurrence.start).toISOString(),
    endsAt: new Date(occurrence.end).toISOString(),
  }
}

/**
 * Clé de semaine ISO de Paris (`YYYY-Www`, celle de la série hebdomadaire)
 * de l'occurrence décrite par `status` — celle en cours, ou la prochaine. C'est elle que retient le bandeau masqué : masquer
 * vaut « pas cette fois », jusqu'à la fin de CETTE soirée — et non jusqu'au
 * lundi suivant, qui rouvrirait le bandeau dès le lendemain d'un masquage
 * fait un samedi.
 */
export function fridayTableWeekKey(status: FridayTableStatus): string {
  return parisWeekKey(new Date(status.startsAt))
}

const NBSP = String.fromCharCode(0xa0)

/**
 * Heure d'horloge du rendez-vous à la typographie de la langue. Intl rend
 * « 21:00 » en français, alors que l'usage (et le reste du site : « vers
 * 17 h ») est « 21 h », « 21 h 30 » — espaces insécables, pour que « 21 h »
 * ne se coupe jamais en fin de ligne. Les autres langues gardent le format
 * d'Intl. `timeZone` absent = fuseau de l'appelant (le navigateur pour le
 * bandeau du hub) ; la vitrine, rendue au serveur, passe celui de Paris.
 */
export function formatClockTime(date: Date, locale: string, timeZone?: string): string {
  if (!locale.startsWith('fr')) {
    return new Intl.DateTimeFormat(locale, { timeZone, hour: 'numeric', minute: '2-digit' }).format(date)
  }
  const parts = new Intl.DateTimeFormat('fr-FR', {
    timeZone,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(date)
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? '0')
  const minute = parts.find((p) => p.type === 'minute')?.value ?? '00'
  return minute === '00' ? `${hour}${NBSP}h` : `${hour}${NBSP}h${NBSP}${minute}`
}

/** Langues de contenu d'une table (settings.lang, posé à la création). */
export const FRIDAY_TABLE_LANGS = ['fr', 'en', 'es', 'it'] as const
export type FridayTableLang = (typeof FRIDAY_TABLE_LANGS)[number]

/**
 * Langue demandée par le bandeau (`?lang=`) : celle de la page. Inconnue ou
 * absente → le français, comme POST /api/online/rooms sans cookie de langue.
 */
export function parseFridayTableLang(raw: string | null | undefined): FridayTableLang {
  return (FRIDAY_TABLE_LANGS as readonly string[]).includes(raw ?? '') ? (raw as FridayTableLang) : 'fr'
}

/** Une table publique d'Imposteur en attente, telle que la route la lit — aucun pseudo. */
export type FridayTableCandidate = {
  code: string
  /** Sièges humains occupés. */
  players: number
  /** Langue des mots de la table (settings.lang ; 'fr' quand absente). */
  lang: FridayTableLang
  createdAtMs: number
}

/** Ce que la route publie de la table retenue : de quoi la rejoindre et la jauger, rien de plus. */
export type FridayTableSeat = {
  code: string
  players: number
  maxPlayers: number
}

/** Réponse de GET /api/online/friday-table. */
export type FridayTableResponse = {
  status: FridayTableStatus
  table: FridayTableSeat | null
}

/**
 * LA table à montrer : dans la langue de la page (des mots français à une
 * table anglaise, la partie est injouable), avec au moins une place, et la
 * plus PEUPLÉE — c'est elle qui fera une partie. À effectif égal, la plus
 * ancienne, puis le code : tous les visiteurs reçoivent la même, et les
 * arrivants convergent au lieu d'ouvrir chacun la leur.
 */
export function pickFridayTable(
  candidates: readonly FridayTableCandidate[],
  lang: FridayTableLang,
  maxPlayers: number
): FridayTableSeat | null {
  const best = candidates
    .filter((c) => c.lang === lang && c.players > 0 && c.players < maxPlayers)
    .sort(
      (a, b) =>
        b.players - a.players ||
        a.createdAtMs - b.createdAtMs ||
        (a.code < b.code ? -1 : a.code > b.code ? 1 : 0)
    )[0]
  return best ? { code: best.code, players: best.players, maxPlayers } : null
}
