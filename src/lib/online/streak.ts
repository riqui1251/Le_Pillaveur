import { streakBonusXp } from '@/lib/online/cosmetics'
import {
  calendarDayOffset,
  parisWeekKey,
  parisWeekOffset,
  toWeekKey,
  weekKeyOfDay,
  weeksBetween,
} from '@/lib/paris-time'

/**
 * Série HEBDOMADAIRE de parties en ligne — module PUR, importable côté client
 * (bannière de fin) comme côté serveur (crédit en fin de partie, fiche staff).
 *
 * POURQUOI la semaine et plus le jour : sur les données du 07/10/2026, AUCUNE
 * série quotidienne n'a dépassé un jour — les parties tombent le vendredi et
 * le dimanche soir, pas tous les jours. Une série que personne ne peut tenir
 * ne retient personne ; « une soirée par semaine » colle au rythme réel.
 *
 * Règles : la série compte les semaines de Paris consécutives (ISO, du lundi
 * au dimanche) avec au moins une partie comptée. La 1re partie comptée de la
 * semaine fait avancer la série (+1 si la semaine précédente était créditée,
 * sinon retour à 1) et crédite le bonus streakBonusXp ; les suivantes de la
 * même semaine ne changent rien.
 *
 * Stockage : User.streakCount et User.streakLastDay — la colonne garde son
 * nom historique mais porte la clé de semaine 'YYYY-Www'. Les valeurs d'avant
 * (un jour 'YYYY-MM-DD' et un compte de JOURS) sont converties À LA LECTURE
 * (readWeeklyStreak) : pas de script de données, et rien à défaire si une
 * ligne n'est jamais relue.
 */

/** Ce que la base contient (colonnes de User). */
export type StoredStreak = { streakCount: number | null; streakLastDay: string | null }

/** La série lue : nombre de semaines et dernière semaine créditée ('YYYY-Www'). */
export type WeeklyStreak = { count: number; week: string | null }

const LEGACY_DAY = /^\d{4}-\d{2}-\d{2}$/

/**
 * Lecture de la série stockée, ancienne forme comprise.
 *
 * Une ancienne série de N JOURS consécutifs finissant le jour J couvre toutes
 * les semaines de J − (N − 1) à J, chacune avec au moins une partie : elle
 * vaut donc exactement ce nombre de semaines (3 jours du jeudi au samedi = 1
 * semaine, du dimanche au mardi = 2). Recopier N tel quel aurait annoncé
 * « 5 semaines d'affilée » à qui avait joué cinq soirs de suite.
 */
export function readWeeklyStreak(stored: StoredStreak): WeeklyStreak {
  const count = Math.max(0, stored.streakCount ?? 0)
  const week = toWeekKey(stored.streakLastDay)
  // Valeur illisible : pas de semaine connue, donc pas de série en cours.
  if (!week) return { count: stored.streakLastDay ? 0 : count, week: null }
  if (!LEGACY_DAY.test(stored.streakLastDay ?? '') || count === 0) return { count, week }
  const firstDay = calendarDayOffset(stored.streakLastDay as string, count - 1)
  return { count: weeksBetween(weekKeyOfDay(firstDay), week) + 1, week }
}

/** Issue d'une partie comptée pour la série d'un joueur. */
export type WeeklyStreakStep = {
  /** Série en semaines APRÈS cette partie. */
  streak: number
  /** XP de bonus à créditer (0 : déjà créditée cette semaine). */
  bonus: number
  /** Semaine de Paris de la partie — la valeur à écrire dans streakLastDay. */
  week: string
  /** true = 1re partie comptée de la semaine : la ligne User doit être écrite. */
  credited: boolean
}

/**
 * Décision de la série à la fin d'une partie comptée. `now` est lu UNE fois
 * par l'appelant pour tous les joueurs de la table : une fin de partie à
 * cheval sur minuit du dimanche ne mélange pas deux semaines.
 */
export function advanceWeeklyStreak(stored: StoredStreak, now: Date): WeeklyStreakStep {
  const current = readWeeklyStreak(stored)
  const week = parisWeekKey(now)
  if (current.week === week) {
    // Déjà créditée cette semaine : la série reste AFFICHABLE, sans bonus.
    return { streak: current.count, bonus: 0, week, credited: false }
  }
  const streak = current.week === parisWeekOffset(1, now) ? current.count + 1 : 1
  return { streak, bonus: streakBonusXp(streak), week, credited: true }
}

/**
 * Série à afficher à un instant : celle de la semaine EN COURS, 0 si rien n'a
 * encore été crédité cette semaine (la série de la semaine dernière n'est pas
 * perdue pour autant — elle le sera dimanche à minuit).
 */
export function streakThisWeek(stored: StoredStreak, now: Date = new Date()): number {
  const current = readWeeklyStreak(stored)
  return current.week === parisWeekKey(now) ? current.count : 0
}

/** Bonus que rapporterait la 1re partie de la semaine PROCHAINE, si la série tient. */
export function nextWeekStreakBonus(streak: number): number {
  return streakBonusXp(Math.max(0, streak) + 1)
}
