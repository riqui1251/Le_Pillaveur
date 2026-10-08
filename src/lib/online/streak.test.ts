import { describe, expect, it } from 'vitest'
import { STREAK_BONUS_CAP_WEEKS, XP_STREAK_STEP, streakBonusXp } from '@/lib/online/cosmetics'
import {
  advanceWeeklyStreak,
  nextWeekStreakBonus,
  readWeeklyStreak,
  streakThisWeek,
} from './streak'

/**
 * Série HEBDOMADAIRE : semaines de Paris consécutives (ISO, lundi →
 * dimanche) avec au moins une partie comptée. Instants fixes : un test qui
 * lirait l'horloge changerait de semaine un dimanche à minuit.
 */

const at = (iso: string) => new Date(iso)
/** Jeudi 08/10/2026, 20 h à Paris : semaine 2026-W41 (la précédente : W40). */
const THURSDAY = at('2026-10-08T18:00:00.000Z')

describe('readWeeklyStreak — migration douce de l’ancienne série quotidienne', () => {
  it('une clé de semaine se lit telle quelle', () => {
    expect(readWeeklyStreak({ streakCount: 4, streakLastDay: '2026-W40' })).toEqual({ count: 4, week: '2026-W40' })
  })

  it('jamais crédité : 0 et aucune semaine', () => {
    expect(readWeeklyStreak({ streakCount: 0, streakLastDay: null })).toEqual({ count: 0, week: null })
    expect(readWeeklyStreak({ streakCount: null, streakLastDay: null })).toEqual({ count: 0, week: null })
  })

  it('un ancien jour vaut sa semaine ; N jours valent les semaines qu’ils couvrent', () => {
    // Lundi 05/10, 1 jour : 1 semaine, la W41.
    expect(readWeeklyStreak({ streakCount: 1, streakLastDay: '2026-10-05' })).toEqual({ count: 1, week: '2026-W41' })
    // Du jeudi 01/10 au samedi 03/10 : 3 jours dans la même semaine = 1 semaine.
    expect(readWeeklyStreak({ streakCount: 3, streakLastDay: '2026-10-03' })).toEqual({ count: 1, week: '2026-W40' })
    // Du dimanche 04/10 au mardi 06/10 : à cheval sur W40 et W41 = 2 semaines.
    expect(readWeeklyStreak({ streakCount: 3, streakLastDay: '2026-10-06' })).toEqual({ count: 2, week: '2026-W41' })
    // 15 jours du dimanche 20/09 au dimanche 04/10 : W38 (un seul jour) à W40.
    expect(readWeeklyStreak({ streakCount: 15, streakLastDay: '2026-10-04' })).toEqual({ count: 3, week: '2026-W40' })
  })

  it('une valeur illisible ne fabrique pas de série', () => {
    expect(readWeeklyStreak({ streakCount: 7, streakLastDay: 'n’importe quoi' })).toEqual({ count: 0, week: null })
    expect(readWeeklyStreak({ streakCount: 7, streakLastDay: '2025-W53' })).toEqual({ count: 0, week: null })
  })
})

describe('advanceWeeklyStreak', () => {
  it('première partie comptée : série à 1, bonus du premier palier', () => {
    expect(advanceWeeklyStreak({ streakCount: 0, streakLastDay: null }, THURSDAY)).toEqual({
      streak: 1,
      bonus: XP_STREAK_STEP,
      week: '2026-W41',
      credited: true,
    })
  })

  it('semaine précédente créditée : +1, bonus croissant', () => {
    expect(advanceWeeklyStreak({ streakCount: 3, streakLastDay: '2026-W40' }, THURSDAY)).toEqual({
      streak: 4,
      bonus: streakBonusXp(4),
      week: '2026-W41',
      credited: true,
    })
  })

  it('déjà créditée cette semaine : aucun bonus, aucune écriture, la série reste affichable', () => {
    expect(advanceWeeklyStreak({ streakCount: 4, streakLastDay: '2026-W41' }, THURSDAY)).toEqual({
      streak: 4,
      bonus: 0,
      week: '2026-W41',
      credited: false,
    })
  })

  it('une semaine sautée : retour à 1', () => {
    expect(advanceWeeklyStreak({ streakCount: 9, streakLastDay: '2026-W39' }, THURSDAY)).toMatchObject({
      streak: 1,
      bonus: XP_STREAK_STEP,
      credited: true,
    })
  })

  it('bonus plafonné, formule inchangée (cosmetics.ts)', () => {
    const step = advanceWeeklyStreak({ streakCount: 12, streakLastDay: '2026-W40' }, THURSDAY)
    expect(step.streak).toBe(13)
    expect(step.bonus).toBe(XP_STREAK_STEP * STREAK_BONUS_CAP_WEEKS)
  })

  it('ancien jour de cette semaine : le bonus de la semaine est déjà tombé', () => {
    // Crédité lundi 05/10 sous l'ancienne règle : même semaine que jeudi.
    expect(advanceWeeklyStreak({ streakCount: 1, streakLastDay: '2026-10-05' }, THURSDAY)).toEqual({
      streak: 1,
      bonus: 0,
      week: '2026-W41',
      credited: false,
    })
  })

  it('ancien jour de la semaine dernière : la série continue', () => {
    // Samedi 03/10 (W40), 1 jour → 1 semaine, puis +1 cette semaine.
    expect(advanceWeeklyStreak({ streakCount: 1, streakLastDay: '2026-10-03' }, THURSDAY)).toMatchObject({
      streak: 2,
      bonus: streakBonusXp(2),
      week: '2026-W41',
      credited: true,
    })
  })

  it('ancien jour plus ancien : retour à 1', () => {
    expect(advanceWeeklyStreak({ streakCount: 1, streakLastDay: '2026-09-26' }, THURSDAY)).toMatchObject({
      streak: 1,
      credited: true,
    })
  })

  it('le vendredi puis le dimanche suivant passé minuit (changement d’heure) : semaines consécutives', () => {
    // Vendredi 23/10/2026 (W43) crédité ; lundi 26/10 00:30 à Paris = 23:30Z
    // le 25 — nouvelle semaine W44, la précédente est bien la W43.
    const step = advanceWeeklyStreak(
      { streakCount: 2, streakLastDay: '2026-W43' },
      at('2026-10-25T23:30:00.000Z')
    )
    expect(step).toMatchObject({ streak: 3, week: '2026-W44', credited: true })
    // Dimanche 25/10 23:30 à Paris (22:30Z) : encore la W43, déjà créditée.
    expect(
      advanceWeeklyStreak({ streakCount: 2, streakLastDay: '2026-W43' }, at('2026-10-25T22:30:00.000Z'))
    ).toMatchObject({ streak: 2, bonus: 0, credited: false })
  })

  it('traverse le Nouvel An ISO : W53 de 2026 puis W01 de 2027', () => {
    expect(
      advanceWeeklyStreak({ streakCount: 5, streakLastDay: '2026-W53' }, at('2027-01-08T20:00:00.000Z'))
    ).toMatchObject({ streak: 6, week: '2027-W01', credited: true })
  })
})

describe('streakThisWeek', () => {
  it('la série ne s’affiche que si cette semaine est créditée', () => {
    expect(streakThisWeek({ streakCount: 3, streakLastDay: '2026-W41' }, THURSDAY)).toBe(3)
    expect(streakThisWeek({ streakCount: 3, streakLastDay: '2026-W40' }, THURSDAY)).toBe(0)
    expect(streakThisWeek({ streakCount: 0, streakLastDay: null }, THURSDAY)).toBe(0)
  })

  it('lit encore un ancien jour (serveur d’avant la série hebdomadaire)', () => {
    expect(streakThisWeek({ streakCount: 1, streakLastDay: '2026-10-07' }, THURSDAY)).toBe(1)
    expect(streakThisWeek({ streakCount: 1, streakLastDay: '2026-10-04' }, THURSDAY)).toBe(0)
  })
})

describe('nextWeekStreakBonus', () => {
  it('le palier suivant, plafond compris', () => {
    expect(nextWeekStreakBonus(1)).toBe(streakBonusXp(2))
    expect(nextWeekStreakBonus(STREAK_BONUS_CAP_WEEKS)).toBe(XP_STREAK_STEP * STREAK_BONUS_CAP_WEEKS)
    expect(nextWeekStreakBonus(0)).toBe(XP_STREAK_STEP)
  })
})
