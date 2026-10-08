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
  return calendarDayOffset(parisDayString(from), days)
}

/**
 * Jour CALENDAIRE `days` jours avant `day` (positif = passé), sans fuseau :
 * même arithmétique que parisDayOffset, mais depuis une date déjà connue
 * (une ancienne valeur en base, un lundi de semaine) plutôt qu'un instant.
 */
export function calendarDayOffset(day: string, days: number): string {
  const [year, month, dayOfMonth] = parseDay(day)
  return new Date(Date.UTC(year, month - 1, dayOfMonth - days, 12)).toISOString().slice(0, 10)
}

const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_STRING = /^(\d{4})-W(\d{2})$/

/**
 * Semaine ISO 8601 d'un jour calendaire, au format 'YYYY-Www' (lundi →
 * dimanche ; la semaine 1 est celle du premier jeudi de janvier).
 *
 * POURQUOI ISO plutôt qu'un simple « numéro de semaine » maison : l'année
 * ISO n'est PAS l'année civile aux bords — le lundi 28/12/2026 est en
 * 2026-W53, le vendredi 01/01/2027 aussi, et le lundi 30/12/2024 déjà en
 * 2025-W01. Une série qui découpait par année civile casserait chaque nuit
 * du Nouvel An. Les clés se comparent comme des chaînes (zéro de tête).
 *
 * Arithmétique sur la date seule, posée à MIDI UTC comme parisDayOffset :
 * aucun changement d'heure ne peut faire glisser le jour.
 */
export function weekKeyOfDay(day: string): string {
  const [year, month, dayOfMonth] = parseDay(day)
  const noon = Date.UTC(year, month - 1, dayOfMonth, 12)
  // Lundi = 0 … dimanche = 6.
  const weekday = (new Date(noon).getUTCDay() + 6) % 7
  // Le jeudi de la semaine porte l'année ISO.
  const thursday = new Date(noon + (3 - weekday) * DAY_MS)
  const isoYear = thursday.getUTCFullYear()
  const week = Math.floor((thursday.getTime() - Date.UTC(isoYear, 0, 1, 12)) / (7 * DAY_MS)) + 1
  return `${isoYear}-W${String(week).padStart(2, '0')}`
}

/** Semaine ISO de Paris d'un instant ('YYYY-Www') : celle du jour de Paris, pas du jour UTC. */
export function parisWeekKey(date: Date = new Date()): string {
  return weekKeyOfDay(parisDayString(date))
}

/**
 * Semaine de Paris décalée de `weeks` semaines (positif = passé) par rapport
 * à celle de `from`. Sept jours CALENDAIRES en arrière, jamais 7 × 24 h : la
 * semaine du passage à l'heure d'hiver dure 169 h (« maintenant − 168 h », le
 * dimanche entre 23 h et minuit, retombait dans la semaine COURANTE) et celle
 * de l'heure d'été 167 h (le lundi suivant entre 0 h et 1 h, il sautait une
 * semaine — et cassait la série de la table du dimanche soir, passé minuit).
 */
export function parisWeekOffset(weeks: number, from: Date = new Date()): string {
  return weekKeyOfDay(parisDayOffset(7 * weeks, from))
}

/**
 * Lundi ('YYYY-MM-DD') d'une semaine 'YYYY-Www' : le 4 janvier est toujours
 * en semaine 1, son lundi ouvre donc l'année ISO.
 */
export function weekKeyMonday(week: string): string {
  const match = WEEK_STRING.exec(week)
  if (!match) throw new RangeError(`Semaine attendue au format AAAA-Www : ${week}`)
  const jan4 = Date.UTC(Number(match[1]), 0, 4, 12)
  const firstMonday = jan4 - ((new Date(jan4).getUTCDay() + 6) % 7) * DAY_MS
  return new Date(firstMonday + (Number(match[2]) - 1) * 7 * DAY_MS).toISOString().slice(0, 10)
}

/** Nombre de semaines de `from` à `to` (clés 'YYYY-Www' ; négatif si `to` précède). */
export function weeksBetween(from: string, to: string): number {
  const start = Date.parse(`${weekKeyMonday(from)}T12:00:00Z`)
  const end = Date.parse(`${weekKeyMonday(to)}T12:00:00Z`)
  return Math.round((end - start) / (7 * DAY_MS))
}

/**
 * Lecture TOLÉRANTE d'une semaine stockée : une clé 'YYYY-Www' valide passe
 * telle quelle, un ancien jour 'YYYY-MM-DD' (série quotidienne d'avant le
 * 08/10/2026) devient la semaine qui le contient, tout le reste → null.
 *
 * Migration douce, à la lecture : aucun script de données à jouer, et une
 * valeur qu'on ne comprend pas ne casse rien (pas de semaine = pas de série
 * en cours). La clé est vérifiée par aller-retour : '2025-W53' n'existe pas
 * (2025 n'a que 52 semaines), '2026-02-30' non plus.
 */
export function toWeekKey(value: string | null | undefined): string | null {
  if (!value) return null
  if (WEEK_STRING.test(value)) {
    const week = Number(value.slice(6))
    if (week < 1 || week > 53) return null
    return weekKeyOfDay(weekKeyMonday(value)) === value ? value : null
  }
  if (DAY_STRING.test(value)) {
    return calendarDayOffset(value, 0) === value ? weekKeyOfDay(value) : null
  }
  return null
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
