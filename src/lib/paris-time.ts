/**
 * Heure de Paris — module PUR, importable côté client comme côté serveur.
 *
 * Fuseau d'affichage de TOUTES les dates de la Supervision (page et panneaux
 * autonomes). next-intl n'en fixe aucun : la date suivait le navigateur
 * (fausse depuis l'étranger) et, rendue côté serveur, le conteneur de
 * production, qui tourne en UTC. L'exploitation du site vit à l'heure de
 * Paris. Le fuseau global de next-intl, lui, reste celui du visiteur.
 */
export const PARIS_TIME_ZONE = 'Europe/Paris'

const PARIS_DAY_FORMAT = new Intl.DateTimeFormat('en-CA', {
  timeZone: PARIS_TIME_ZONE,
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
})

/** Jour de Paris d'un instant, au format AAAA-MM-JJ (comparable comme une chaîne). */
export function parisDayString(date: Date = new Date()): string {
  return PARIS_DAY_FORMAT.format(date)
}

const DAY_STRING = /^(\d{4})-(\d{2})-(\d{2})$/

function parseDay(day: string): [number, number, number] {
  const match = DAY_STRING.exec(day)
  if (!match) throw new RangeError(`Jour attendu au format AAAA-MM-JJ : ${day}`)
  return [Number(match[1]), Number(match[2]), Number(match[3])]
}

/**
 * Jour de Paris décalé de `days` jours CALENDAIRES (positif = passé) par
 * rapport au jour de Paris de `from`.
 *
 * Jamais de soustraction de 24 h ni de `setDate` : dans le fuseau du
 * PROCESSUS (UTC en production), l'heure qui entoure minuit les jours de
 * changement d'heure doublait un jour et en sautait un autre — une série de
 * 14 jours affichait deux fois le 25/10. L'arithmétique se fait donc sur la
 * date seule, posée à MIDI UTC (loin de tout bord de jour), puis reformatée.
 */
export function parisDayOffset(days: number, from: Date = new Date()): string {
  const [year, month, day] = parseDay(parisDayString(from))
  return new Date(Date.UTC(year, month - 1, day - days, 12)).toISOString().slice(0, 10)
}

/**
 * Les `count` derniers jours de Paris, du plus ancien au plus récent,
 * aujourd'hui inclus. `from` est lu UNE fois : une série calculée à cheval
 * sur minuit ne mélange pas deux « aujourd'hui ».
 */
export function parisDaysBack(count: number, from: Date = new Date()): string[] {
  const days: string[] = []
  for (let offset = count - 1; offset >= 0; offset -= 1) days.push(parisDayOffset(offset, from))
  return days
}

const PARIS_WALL_CLOCK_FORMAT = new Intl.DateTimeFormat('en-US', {
  timeZone: PARIS_TIME_ZONE,
  hourCycle: 'h23',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit',
  hour: '2-digit',
  minute: '2-digit',
  second: '2-digit',
})

/** Avance de l'heure de Paris sur UTC à cet instant, en ms (+1 h l'hiver, +2 h l'été). */
function parisOffsetMs(instantMs: number): number {
  const parts: Record<string, number> = {}
  for (const part of PARIS_WALL_CLOCK_FORMAT.formatToParts(new Date(instantMs))) {
    if (part.type !== 'literal') parts[part.type] = Number(part.value)
  }
  const wallClockAsUtc = Date.UTC(
    parts.year,
    parts.month - 1,
    parts.day,
    parts.hour % 24,
    parts.minute,
    parts.second
  )
  return wallClockAsUtc - Math.floor(instantMs / 1000) * 1000
}

/**
 * Instant UTC du minuit de Paris ouvrant ce jour : borne `gte` des fenêtres
 * « depuis minuit » et « N derniers jours de Paris ».
 *
 * Deux passes : l'avance lue au minuit UTC peut différer de celle du minuit de
 * Paris un jour de changement d'heure — la seconde lecture, faite sur le
 * candidat, tranche. Minuit n'est jamais dans le trou ni dans le doublon d'un
 * changement d'heure à Paris (bascule à 2 h / 3 h), donc il existe et il est
 * unique.
 */
export function parisDayStartUtc(day: string): Date {
  const [year, month, dayOfMonth] = parseDay(day)
  const utcMidnight = Date.UTC(year, month - 1, dayOfMonth)
  const guess = utcMidnight - parisOffsetMs(utcMidnight)
  return new Date(utcMidnight - parisOffsetMs(guess))
}
