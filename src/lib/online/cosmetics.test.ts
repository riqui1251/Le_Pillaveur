import { describe, expect, it } from 'vitest'
import {
  COSMETICS,
  KNOWN_EFFECT_IDS,
  KNOWN_FRAME_IDS,
  XP_LOSS,
  XP_WIN,
  cosmeticKey,
  isCosmeticUnlocked,
  levelForXp,
  progressForXp,
  unlockedCosmeticKeys,
  xpForLevel,
} from './cosmetics'

describe('courbe XP', () => {
  it('niveau 1 = 0 XP, croissance strictement monotone', () => {
    expect(xpForLevel(1)).toBe(0)
    for (let n = 2; n <= 50; n++) {
      expect(xpForLevel(n)).toBeGreaterThan(xpForLevel(n - 1))
    }
  })

  it('levelForXp est l’inverse exact de xpForLevel', () => {
    for (let n = 1; n <= 50; n++) {
      const floor = xpForLevel(n)
      expect(levelForXp(floor)).toBe(n)
      // 1 XP sous le seuil → niveau précédent
      if (n > 1) expect(levelForXp(floor - 1)).toBe(n - 1)
    }
  })

  it('xp négative ou nulle → niveau 1', () => {
    expect(levelForXp(0)).toBe(1)
    expect(levelForXp(-100)).toBe(1)
  })

  it('progressForXp cohérent avec la courbe', () => {
    const p = progressForXp(xpForLevel(3) + 10)
    expect(p.level).toBe(3)
    expect(p.current).toBe(10)
    expect(p.required).toBe(xpForLevel(4) - xpForLevel(3))
  })

  it('une victoire rapporte plus qu’une défaite, les deux > 0', () => {
    expect(XP_WIN).toBeGreaterThan(XP_LOSS)
    expect(XP_LOSS).toBeGreaterThan(0)
  })
})

describe('catalogue cosmétiques', () => {
  it('clés uniques', () => {
    const keys = COSMETICS.map((c) => cosmeticKey(c.kind, c.id))
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('chaque effet du catalogue existe dans PLAYER_EFFECTS', () => {
    for (const c of COSMETICS.filter((c) => c.kind === 'effect')) {
      expect(KNOWN_EFFECT_IDS).toContain(c.id)
    }
  })

  it('chaque cadre du catalogue existe dans PLAYER_FRAMES', () => {
    for (const c of COSMETICS.filter((c) => c.kind === 'frame')) {
      expect(KNOWN_FRAME_IDS).toContain(c.id)
    }
  })

  it('tous les effets connus sont couverts par le catalogue', () => {
    const catalogEffects = new Set(COSMETICS.filter((c) => c.kind === 'effect').map((c) => c.id))
    for (const id of KNOWN_EFFECT_IDS) {
      expect(catalogEffects.has(id)).toBe(true)
    }
  })

  it('tous les cadres connus sont couverts, sauf staff (réservé rôle)', () => {
    const catalogFrames = new Set(COSMETICS.filter((c) => c.kind === 'frame').map((c) => c.id))
    for (const id of KNOWN_FRAME_IDS.filter((id) => id !== 'staff')) {
      expect(catalogFrames.has(id)).toBe(true)
    }
    expect(catalogFrames.has('staff')).toBe(false)
  })
})

describe('déblocage', () => {
  const none = new Set<string>()

  it('joueur niveau 1 : effets de base seulement', () => {
    const ctx = { xp: 0, role: 'user', grantedKeys: none }
    expect(isCosmeticUnlocked(ctx, 'effect', 'red')).toBe(true)
    expect(isCosmeticUnlocked(ctx, 'effect', 'blue')).toBe(true)
    expect(isCosmeticUnlocked(ctx, 'effect', 'galaxy')).toBe(false)
    expect(isCosmeticUnlocked(ctx, 'frame', 'silver')).toBe(false)
    expect(isCosmeticUnlocked(ctx, 'frame', 'staff')).toBe(false)
  })

  it('le niveau débloque effets et cadres', () => {
    const ctx = { xp: xpForLevel(10), role: 'user', grantedKeys: none }
    expect(isCosmeticUnlocked(ctx, 'effect', 'neon')).toBe(true)
    expect(isCosmeticUnlocked(ctx, 'frame', 'gold')).toBe(true)
    expect(isCosmeticUnlocked(ctx, 'frame', 'diamond')).toBe(false)
  })

  it('un grant manuel débloque sans le niveau', () => {
    const ctx = {
      xp: 0,
      role: 'user',
      grantedKeys: new Set([cosmeticKey('frame', 'diamond')]),
    }
    expect(isCosmeticUnlocked(ctx, 'frame', 'diamond')).toBe(true)
    expect(isCosmeticUnlocked(ctx, 'frame', 'royal')).toBe(false)
  })

  it('superadmin et fondateur : tout débloqué', () => {
    for (const role of ['superadmin', 'fondateur']) {
      const ctx = { xp: 0, role, grantedKeys: none }
      expect(isCosmeticUnlocked(ctx, 'effect', 'cyber')).toBe(true)
      expect(isCosmeticUnlocked(ctx, 'frame', 'crown')).toBe(true)
      expect(isCosmeticUnlocked(ctx, 'frame', 'staff')).toBe(true)
    }
  })

  it('admin et modérateur : cadre staff mais pas tout le catalogue', () => {
    for (const role of ['moderator', 'admin']) {
      const ctx = { xp: 0, role, grantedKeys: none }
      expect(isCosmeticUnlocked(ctx, 'frame', 'staff')).toBe(true)
      expect(isCosmeticUnlocked(ctx, 'frame', 'crown')).toBe(false)
    }
  })

  it('cosmétique inconnu → jamais débloqué', () => {
    const ctx = { xp: xpForLevel(50), role: 'user', grantedKeys: none }
    expect(isCosmeticUnlocked(ctx, 'effect', 'inexistant')).toBe(false)
  })

  it('unlockedCosmeticKeys : cohérent avec isCosmeticUnlocked', () => {
    const ctx = { xp: xpForLevel(5), role: 'user', grantedKeys: none }
    const keys = unlockedCosmeticKeys(ctx)
    expect(keys.has(cosmeticKey('effect', 'ocean'))).toBe(true)
    expect(keys.has(cosmeticKey('frame', 'silver'))).toBe(true)
    expect(keys.has(cosmeticKey('frame', 'gold'))).toBe(false)
    expect(keys.has(cosmeticKey('frame', 'staff'))).toBe(false)
  })
})
