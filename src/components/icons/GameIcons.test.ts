import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { GAMES } from '@/lib/games'
import { GAME_ICONS } from '@/components/hub/GameIconById'

/**
 * Garde-fou des icônes de jeux : elles se posent sur la carte crème du hub,
 * sur le feutre (vert ou bleu nuit) et sur des pastilles or. Une couleur
 * écrite DANS le SVG ignore ce contexte — c'est ce qui effaçait la chope du
 * Petit Buveur (or à 60 % sur crème, 1,3:1) et le dé de Monsieur 3.
 * Relevé sur le SOURCE : rien ne s'écrit dans le dessin qui décide d'une teinte.
 */
const SOURCE = readFileSync(fileURLToPath(new URL('./GameIcons.tsx', import.meta.url)), 'utf8')

/** Le source sans ses commentaires : un mot d'explication n'est pas un attribut. */
const CODE = SOURCE.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')

describe('GameIcons — langage des icônes', () => {
  it("n'a qu'un seul className, celui que reçoit la racine <svg>", () => {
    const classNames = CODE.match(/className=\{?[^\s>]*/g) ?? []
    expect(classNames).toEqual(['className={className}'])
  })

  it("n'écrit aucune couleur en dur : corps en currentColor, accent par --icon-accent", () => {
    expect(CODE).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(CODE).not.toMatch(/\brgba?\(/)
    expect(CODE).not.toMatch(/\b(?:text|fill|stroke)-(?:slate|amber|emerald|rose|purple|violet|fuchsia|red|blue|orange|white|gray)/)
  })

  it("replie l'accent sur currentColor (monochrome), jamais sur une teinte fixe", () => {
    const accents = CODE.match(/var\(--icon-accent[^)]*\)/g) ?? []
    expect(accents.length).toBeGreaterThan(0)
    for (const accent of accents) expect(accent).toBe('var(--icon-accent, currentColor)')
  })

  it("n'utilise aucune opacité partielle", () => {
    expect(CODE).not.toMatch(/\b(?:opacity|fillOpacity|strokeOpacity|fill-opacity|stroke-opacity)\s*[=:]/)
  })

  it('ne contient aucun <text> : lettres et chiffres sont des tracés', () => {
    expect(CODE).not.toMatch(/<text\b/)
  })

  it('trace tous ses traits à la même épaisseur (LINE, 2)', () => {
    const widths = CODE.match(/strokeWidth\s*[:=]\s*[^,\s}]+/g) ?? []
    expect(widths).toEqual(['strokeWidth: 2'])
  })
})

describe('GameIconById — une icône dédiée par jeu', () => {
  it('chaque jeu du catalogue a la sienne (pas le jeton générique)', () => {
    const missing = GAMES.filter((game) => !GAME_ICONS[game.id]).map((game) => game.id)
    expect(missing).toEqual([])
  })

  it('deux jeux visibles ne partagent pas la même icône', () => {
    const visible = GAMES.filter((game) => !game.hidden)
    const icons = new Set(visible.map((game) => GAME_ICONS[game.id]))
    expect(icons.size).toBe(visible.length)
  })
})
