import { describe, expect, it } from 'vitest'
import { DEFAULT_ONLINE_ICON, ONLINE_ICON_IDS } from '@/lib/online/cosmetics'
import { PLAYER_ICON_SERIES } from '@/lib/online/player-icon-defs'
import { sanitizeOnlinePreferences } from '@/lib/online-preferences'
import { BOT_PERSONAS } from './bot-personas'
import { BOT_PORTRAITS } from './bot-portrait-defs'

describe('BOT_PORTRAITS : un buste par persona, au format des icônes joueur', () => {
  it('vingt portraits aux ids distincts, préfixés bot-', () => {
    expect(BOT_PORTRAITS).toHaveLength(20)
    expect(new Set(BOT_PORTRAITS.map((p) => p.id)).size).toBe(BOT_PORTRAITS.length)
    for (const p of BOT_PORTRAITS) {
      expect(p.id).toMatch(/^bot-[a-z]+$/)
      expect(p.label.length).toBeGreaterThan(0)
    }
  })

  it('markup interne d’un viewBox 24 : sans <svg>, sans currentColor, sans <text>, sans id=', () => {
    for (const p of BOT_PORTRAITS) {
      expect(p.svg, p.id).not.toContain('<svg')
      expect(p.svg, p.id).not.toContain('currentColor')
      expect(p.svg, p.id).not.toContain('<text')
      expect(p.svg, p.id).not.toContain('id=')
      expect(p.svg, p.id).toContain('#24201A')
    }
  })

  it('chaque persona pointe un portrait existant, et chaque portrait sert à un persona', () => {
    const ids = new Set(BOT_PORTRAITS.map((p) => p.id))
    for (const persona of BOT_PERSONAS) expect(ids.has(persona.portraitId), persona.name).toBe(true)
    expect(new Set(BOT_PERSONAS.map((p) => p.portraitId))).toEqual(ids)
  })
})

describe('les portraits restent hors cosmétiques', () => {
  it('aucun id de portrait dans les séries ni dans ONLINE_ICON_IDS', () => {
    const seriesIds = new Set(PLAYER_ICON_SERIES.flatMap((s) => s.icons.map((i) => i.id)))
    for (const p of BOT_PORTRAITS) {
      expect(seriesIds.has(p.id), p.id).toBe(false)
      expect(ONLINE_ICON_IDS).not.toContain(p.id)
    }
  })

  it('un portrait posé comme icône de compte est refusé par sanitizeOnlinePreferences', () => {
    expect(sanitizeOnlinePreferences({ icon: 'bot-gepeto' }).icon).toBe(DEFAULT_ONLINE_ICON)
  })
})
