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
