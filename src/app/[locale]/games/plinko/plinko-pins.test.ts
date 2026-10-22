import { isValidElement } from 'react'
import { describe, expect, it } from 'vitest'
import {
  SPECIAL_PIN_COLORS,
  SPECIAL_PIN_FAMILIES,
  SPECIAL_PIN_FAMILY_STYLE,
  type SpecialPinType,
} from '@/lib/plinko-pins'

const TYPES = Object.keys(SPECIAL_PIN_COLORS) as SpecialPinType[]

describe('pions spéciaux du Plinko (partagés avec la TV)', () => {
  it('couvre les 18 types, chacun rangé dans une famille du thème', () => {
    expect(TYPES).toHaveLength(18)
    for (const type of TYPES) {
      const style = SPECIAL_PIN_COLORS[type]
      expect(SPECIAL_PIN_FAMILIES).toContain(style.family)
      expect({ type, ...pick(style) }).toEqual({ type, ...SPECIAL_PIN_FAMILY_STYLE[style.family] })
    }
  })

  it('ne peint aucun pion d’une teinte Tailwind hors palette', () => {
    for (const family of SPECIAL_PIN_FAMILIES) {
      const { bg } = SPECIAL_PIN_FAMILY_STYLE[family]
      expect(bg).toMatch(/^bg-(gold|cream|chip-blue|suit-red)$/)
    }
  })

  it('donne à chaque pion un glyphe rendu (icône ou texte), jamais un emoji', () => {
    for (const type of TYPES) {
      const { glyph, text } = SPECIAL_PIN_COLORS[type]
      expect(isValidElement(glyph)).toBe(true)
      if (text !== undefined) expect(text).toMatch(/^[+−×]\d$/)
    }
    expect(SPECIAL_PIN_COLORS.addSip.text).toBe('+1')
    expect(SPECIAL_PIN_COLORS.subtractSip.text).toBe('−1')
    expect(SPECIAL_PIN_COLORS.multiplier.text).toBe('×2')
  })

  it('distingue les deux aimants par leur glyphe, pas par la couleur', () => {
    const left = SPECIAL_PIN_COLORS.magnetLeft
    const right = SPECIAL_PIN_COLORS.magnetRight
    expect(left.family).toBe(right.family)
    expect(isValidElement(left.glyph) && isValidElement(right.glyph) && left.glyph.type !== right.glyph.type).toBe(true)
  })
})

function pick({ border, bg, fg }: { border: string; bg: string; fg: string }) {
  return { border, bg, fg }
}
