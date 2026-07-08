import { describe, expect, it } from 'vitest'
import {
  COSMETICS,
  DEFAULT_ONLINE_ICON,
  ICON_SERIES,
  KNOWN_EFFECT_IDS,
  KNOWN_FRAME_IDS,
  ONLINE_EFFECT_IDS,
  ONLINE_FRAME_IDS,
  ONLINE_ICON_IDS,
  ROLE_FRAME_MIN_RANK,
  XP_LOSS,
  XP_WIN,
  cosmeticKey,
  effectRarity,
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

describe('rareté des effets (dérivée du niveau)', () => {
  it('bandes de niveau', () => {
    expect(effectRarity(1)).toBe('commun')
    expect(effectRarity(4)).toBe('commun')
    expect(effectRarity(5)).toBe('rare')
    expect(effectRarity(11)).toBe('rare')
    expect(effectRarity(12)).toBe('epique')
    expect(effectRarity(19)).toBe('epique')
    expect(effectRarity(20)).toBe('legendaire')
    expect(effectRarity(30)).toBe('legendaire')
  })

  it('gold (Nv 12) est épique, galaxy (Nv 16) est épique — inchangés depuis la V1', () => {
    const gold = COSMETICS.find((c) => c.kind === 'effect' && c.id === 'gold')!
    const galaxy = COSMETICS.find((c) => c.kind === 'effect' && c.id === 'galaxy')!
    expect(gold.unlockLevel).toBe(12)
    expect(galaxy.unlockLevel).toBe(16)
    expect(effectRarity(gold.unlockLevel)).toBe('epique')
    expect(effectRarity(galaxy.unlockLevel)).toBe('epique')
  })

  it('toast est le nouvel effet signature légendaire (Nv 30)', () => {
    const toast = COSMETICS.find((c) => c.kind === 'effect' && c.id === 'toast')
    expect(toast).toBeTruthy()
    expect(effectRarity(toast!.unlockLevel)).toBe('legendaire')
  })
})

describe('catalogue cosmétiques', () => {
  it('clés uniques', () => {
    const keys = COSMETICS.map((c) => cosmeticKey(c.kind, c.id))
    expect(new Set(keys).size).toBe(keys.length)
  })

  it('les ids d’effet du catalogue LOCAUX (hors ajouts online-exclusifs) existent dans PLAYER_EFFECTS', () => {
    const onlineExclusive = new Set(['toast'])
    for (const c of COSMETICS.filter((c) => c.kind === 'effect')) {
      if (onlineExclusive.has(c.id)) continue
      expect(KNOWN_EFFECT_IDS).toContain(c.id)
    }
  })

  it('chaque cadre de niveau du catalogue existe dans PLAYER_FRAMES', () => {
    for (const c of COSMETICS.filter((c) => c.kind === 'frame')) {
      expect(KNOWN_FRAME_IDS).toContain(c.id)
    }
  })

  it('tous les effets locaux connus sont couverts par le catalogue', () => {
    const catalogEffects = new Set(COSMETICS.filter((c) => c.kind === 'effect').map((c) => c.id))
    for (const id of KNOWN_EFFECT_IDS) {
      expect(catalogEffects.has(id)).toBe(true)
    }
  })

  it('tous les cadres de niveau locaux connus sont couverts, sauf staff (réservé rôle)', () => {
    const catalogFrames = new Set(COSMETICS.filter((c) => c.kind === 'frame').map((c) => c.id))
    for (const id of KNOWN_FRAME_IDS.filter((id) => id !== 'staff')) {
      expect(catalogFrames.has(id)).toBe(true)
    }
    expect(catalogFrames.has('staff')).toBe(false)
  })

  it('les 4 cadres de rôle ne sont PAS dans le catalogue de niveaux (réservés au grade)', () => {
    const catalogFrames = new Set(COSMETICS.filter((c) => c.kind === 'frame').map((c) => c.id))
    for (const id of Object.keys(ROLE_FRAME_MIN_RANK)) {
      expect(catalogFrames.has(id)).toBe(false)
    }
  })
})

describe('séries d’icônes', () => {
  it('icône par défaut débloquée dès le niveau 1 (série Apéro)', () => {
    const apero = ICON_SERIES.find((s) => s.id === 'apero')!
    expect(apero.unlockLevel).toBe(1)
    expect(apero.icons).toContain(DEFAULT_ONLINE_ICON)
  })

  it('chaque icône de série est dans le catalogue avec le niveau de sa série', () => {
    for (const series of ICON_SERIES) {
      for (const icon of series.icons) {
        const c = COSMETICS.find((c) => c.kind === 'icon' && c.id === icon)
        expect(c).toBeTruthy()
        expect(c!.unlockLevel).toBe(series.unlockLevel)
      }
    }
  })

  it('aucune icône dupliquée entre séries', () => {
    const all = ICON_SERIES.flatMap((s) => s.icons)
    expect(new Set(all).size).toBe(all.length)
  })

  it('la série Fondateur est hors de portée par le niveau (grant/rôle uniquement)', () => {
    const fondateur = ICON_SERIES.find((s) => s.id === 'fondateur')!
    const highestOtherRequirement = Math.max(...ICON_SERIES.filter((s) => s.id !== 'fondateur').map((s) => s.unlockLevel))
    expect(fondateur.unlockLevel).toBeGreaterThan(highestOtherRequirement)
  })
})

describe('sources de validation online (séparées du catalogue local)', () => {
  it('ONLINE_EFFECT_IDS inclut toast (online-exclusif) en plus des ids locaux', () => {
    expect(ONLINE_EFFECT_IDS).toContain('toast')
    expect(ONLINE_EFFECT_IDS).toContain('red')
  })

  it('ONLINE_FRAME_IDS inclut staff + les 4 cadres de rôle + les 7 cadres de niveau', () => {
    expect(ONLINE_FRAME_IDS).toContain('staff')
    for (const id of Object.keys(ROLE_FRAME_MIN_RANK)) {
      expect(ONLINE_FRAME_IDS).toContain(id)
    }
    for (const id of KNOWN_FRAME_IDS.filter((id) => id !== 'staff')) {
      expect(ONLINE_FRAME_IDS).toContain(id)
    }
  })

  it('ONLINE_ICON_IDS couvre exactement les icônes des séries', () => {
    const expected = new Set(ICON_SERIES.flatMap((s) => s.icons))
    expect(new Set(ONLINE_ICON_IDS)).toEqual(expected)
  })
})

describe('déblocage', () => {
  const none = new Set<string>()

  it('joueur niveau 1 : effets de base + icônes Apéro seulement', () => {
    const ctx = { xp: 0, role: 'user', grantedKeys: none }
    expect(isCosmeticUnlocked(ctx, 'effect', 'red')).toBe(true)
    expect(isCosmeticUnlocked(ctx, 'effect', 'blue')).toBe(true)
    expect(isCosmeticUnlocked(ctx, 'effect', 'galaxy')).toBe(false)
    expect(isCosmeticUnlocked(ctx, 'icon', '🍺')).toBe(true)
    expect(isCosmeticUnlocked(ctx, 'icon', '🦊')).toBe(false)
    expect(isCosmeticUnlocked(ctx, 'frame', 'silver')).toBe(false)
    expect(isCosmeticUnlocked(ctx, 'frame', 'staff')).toBe(false)
  })

  it('le niveau débloque effets, icônes de série et cadres', () => {
    const ctx = { xp: xpForLevel(10), role: 'user', grantedKeys: none }
    expect(isCosmeticUnlocked(ctx, 'effect', 'neon')).toBe(true)
    expect(isCosmeticUnlocked(ctx, 'frame', 'gold')).toBe(true)
    expect(isCosmeticUnlocked(ctx, 'frame', 'diamond')).toBe(false)
    expect(isCosmeticUnlocked(ctx, 'icon', '🦊')).toBe(true) // Bestiaire Nv 8
    expect(isCosmeticUnlocked(ctx, 'icon', '👑')).toBe(false) // Légende Nv 25
  })

  it('un grant manuel débloque sans le niveau (effet, cadre ou icône)', () => {
    const ctx = {
      xp: 0,
      role: 'user',
      grantedKeys: new Set([cosmeticKey('frame', 'diamond'), cosmeticKey('icon', '🌟')]),
    }
    expect(isCosmeticUnlocked(ctx, 'frame', 'diamond')).toBe(true)
    expect(isCosmeticUnlocked(ctx, 'frame', 'royal')).toBe(false)
    expect(isCosmeticUnlocked(ctx, 'icon', '🌟')).toBe(true)
    expect(isCosmeticUnlocked(ctx, 'icon', '🦄')).toBe(false)
  })

  it('les cadres de rôle sont réservés au grade, jamais au niveau ni au grant', () => {
    const highLevelPlayer = { xp: xpForLevel(50), role: 'user', grantedKeys: none }
    expect(isCosmeticUnlocked(highLevelPlayer, 'frame', 'sentinel')).toBe(false)

    const mod = { xp: 0, role: 'moderator', grantedKeys: none }
    expect(isCosmeticUnlocked(mod, 'frame', 'sentinel')).toBe(true)
    expect(isCosmeticUnlocked(mod, 'frame', 'blade')).toBe(false)

    const admin = { xp: 0, role: 'admin', grantedKeys: none }
    expect(isCosmeticUnlocked(admin, 'frame', 'sentinel')).toBe(true)
    expect(isCosmeticUnlocked(admin, 'frame', 'blade')).toBe(true)
    expect(isCosmeticUnlocked(admin, 'frame', 'prestige')).toBe(false)
  })

  it('prestige est exclusif au fondateur (superadmin l’a via la règle générale, pas admin)', () => {
    const admin = { xp: 0, role: 'admin', grantedKeys: none }
    expect(isCosmeticUnlocked(admin, 'frame', 'prestige')).toBe(false)

    const fondateur = { xp: 0, role: 'fondateur', grantedKeys: none }
    expect(isCosmeticUnlocked(fondateur, 'frame', 'prestige')).toBe(true)
  })

  it('superadmin et fondateur : tout débloqué, y compris icônes et cadres de rôle', () => {
    for (const role of ['superadmin', 'fondateur']) {
      const ctx = { xp: 0, role, grantedKeys: none }
      expect(isCosmeticUnlocked(ctx, 'effect', 'cyber')).toBe(true)
      expect(isCosmeticUnlocked(ctx, 'frame', 'crown')).toBe(true)
      expect(isCosmeticUnlocked(ctx, 'frame', 'staff')).toBe(true)
      expect(isCosmeticUnlocked(ctx, 'frame', 'prestige')).toBe(true)
      expect(isCosmeticUnlocked(ctx, 'icon', '🌟')).toBe(true)
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
    expect(isCosmeticUnlocked(ctx, 'icon', '🙈')).toBe(false)
  })

  it('unlockedCosmeticKeys : cohérent avec isCosmeticUnlocked, inclut les cadres de rôle', () => {
    const ctx = { xp: xpForLevel(5), role: 'admin', grantedKeys: none }
    const keys = unlockedCosmeticKeys(ctx)
    expect(keys.has(cosmeticKey('effect', 'ocean'))).toBe(true)
    expect(keys.has(cosmeticKey('frame', 'silver'))).toBe(true)
    expect(keys.has(cosmeticKey('frame', 'gold'))).toBe(false)
    expect(keys.has(cosmeticKey('frame', 'staff'))).toBe(true)
    expect(keys.has(cosmeticKey('frame', 'sentinel'))).toBe(true)
    expect(keys.has(cosmeticKey('frame', 'blade'))).toBe(true)
    expect(keys.has(cosmeticKey('frame', 'prestige'))).toBe(false)
  })
})
