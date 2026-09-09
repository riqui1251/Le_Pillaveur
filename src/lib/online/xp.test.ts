import { beforeEach, describe, expect, it } from 'vitest'
import { XP_STREAK_STEP, XP_WIN, xpForLevel } from '@/lib/online/cosmetics'
import {
  XP_GAIN_TTL_MS,
  buildXpGainDetail,
  clearXpGains,
  recallXpGain,
  rememberXpGain,
  takeUnannouncedAchievements,
} from './xp'

/**
 * Détail du gain d'XP : le chiffre annoncé au joueur DOIT être celui qui a
 * été crédité, bonus de série compris — c'est tout l'objet du module.
 */

beforeEach(() => {
  clearXpGains()
})

describe('buildXpGainDetail', () => {
  it('le total inclut le bonus de série (la bannière annonçait le seul gain de base)', () => {
    const d = buildXpGainDetail({
      reason: 'win',
      xpBefore: 60,
      base: XP_WIN,
      streakBonus: XP_STREAK_STEP * 3,
      streakCount: 3,
    })
    expect(d.base).toBe(50)
    expect(d.streakBonus).toBe(30)
    expect(d.total).toBe(80)
    expect(d.xpAfter).toBe(140)
  })

  it('le passage de niveau se juge sur le total crédité, bonus compris', () => {
    // Niveau 2 à 100 XP : depuis 60 XP, une défaite seule (+20) laisse à 80 ;
    // c'est le bonus de série qui fait basculer — exactement le passage de
    // niveau que l'ancienne bannière ne fêtait pas.
    expect(xpForLevel(2)).toBe(100)
    const sansBonus = buildXpGainDetail({
      reason: 'loss',
      xpBefore: 60,
      base: 20,
      streakBonus: 0,
      streakCount: 0,
    })
    expect(sansBonus.levelBefore).toBe(1)
    expect(sansBonus.levelAfter).toBe(1)

    const avecBonus = buildXpGainDetail({
      reason: 'loss',
      xpBefore: 60,
      base: 20,
      streakBonus: 30,
      streakCount: 3,
    })
    expect(avecBonus.total).toBe(50)
    expect(avecBonus.levelBefore).toBe(1)
    expect(avecBonus.levelAfter).toBe(2)
  })

  it('un gain nul (solo au plafond) reste un détail valide, sans niveau gagné', () => {
    const d = buildXpGainDetail({
      reason: 'solo',
      xpBefore: 1000,
      base: 0,
      streakBonus: 0,
      streakCount: 0,
    })
    expect(d.total).toBe(0)
    expect(d.levelAfter).toBe(d.levelBefore)
  })

  it('aucune valeur négative ne passe', () => {
    const d = buildXpGainDetail({
      reason: 'participation',
      xpBefore: -10,
      base: -5,
      streakBonus: -1,
      streakCount: -2,
    })
    expect(d).toMatchObject({ xpBefore: 0, base: 0, streakBonus: 0, total: 0, streakCount: 0 })
  })
})

describe('mémoire du dernier gain', () => {
  const detail = buildXpGainDetail({
    reason: 'win',
    xpBefore: 0,
    base: 50,
    streakBonus: 10,
    streakCount: 1,
  })

  it('relit le gain mémorisé, et rien pour un autre compte', () => {
    rememberXpGain('u1', detail)
    expect(recallXpGain('u1')?.total).toBe(60)
    expect(recallXpGain('u2')).toBeNull()
  })

  it('oublie le gain passé le délai de vie', () => {
    const t0 = 1_000_000
    rememberXpGain('u1', detail, t0)
    expect(recallXpGain('u1', t0 + XP_GAIN_TTL_MS - 1)).not.toBeNull()
    expect(recallXpGain('u1', t0 + XP_GAIN_TTL_MS + 1)).toBeNull()
  })

  it('la dernière partie écrase la précédente', () => {
    rememberXpGain('u1', detail)
    rememberXpGain(
      'u1',
      buildXpGainDetail({ reason: 'loss', xpBefore: 60, base: 20, streakBonus: 0, streakCount: 1 })
    )
    expect(recallXpGain('u1')?.total).toBe(20)
  })
})

describe('succès déjà annoncés', () => {
  it('un succès n’est annoncé qu’une fois', () => {
    expect(takeUnannouncedAchievements('u1', ['first_game', 'first_room'])).toEqual([
      'first_game',
      'first_room',
    ])
    expect(takeUnannouncedAchievements('u1', ['first_game', 'first_room'])).toEqual([])
    expect(takeUnannouncedAchievements('u1', ['first_win'])).toEqual(['first_win'])
  })

  it('chaque joueur a sa propre mémoire', () => {
    takeUnannouncedAchievements('u1', ['first_game'])
    expect(takeUnannouncedAchievements('u2', ['first_game'])).toEqual(['first_game'])
  })
})
