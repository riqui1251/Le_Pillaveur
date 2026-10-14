import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { IMPOSTEUR_PAIRS_FR } from './fr'
import { IMPOSTEUR_PAIRS_EN } from './en'
import { IMPOSTEUR_PAIRS_ES } from './es'
import { IMPOSTEUR_PAIRS_IT } from './it'
import type { ImposteurWordPair } from '../engine'

const POOLS: Record<string, ImposteurWordPair[]> = {
  fr: IMPOSTEUR_PAIRS_FR,
  en: IMPOSTEUR_PAIRS_EN,
  es: IMPOSTEUR_PAIRS_ES,
  it: IMPOSTEUR_PAIRS_IT,
}

/** Garde-fou du contenu écrit à la main (paires proches, sans doublons). */
describe('imposteur data', () => {
  for (const [lang, pool] of Object.entries(POOLS)) {
    it(`${lang} : au moins 180 paires valides, sans doublon ni auto-paire`, () => {
      expect(pool.length).toBeGreaterThanOrEqual(180)
      const seen = new Set<string>()
      for (const { a, b } of pool) {
        expect(a.length).toBeGreaterThan(0)
        expect(b.length).toBeGreaterThan(0)
        expect(a.toLowerCase()).not.toBe(b.toLowerCase())
        const key = [a.toLowerCase(), b.toLowerCase()].sort().join('|')
        expect(seen.has(key), `paire dupliquée: ${a} / ${b}`).toBe(false)
        seen.add(key)
      }
    })
  }
})

/**
 * Les 4 listes sont ALIGNÉES par position : même paire (adaptée à chaque
 * culture) au même index. Le catalogue d'indices (data/clues) est découpé en
 * lots de 23 par index — un décalage ferait écrire la mauvaise paire dans un
 * lot, et le brief d'un lot ne correspondrait plus d'une langue à l'autre.
 */
describe('imposteur data : alignement positionnel des 4 langues', () => {
  it('même nombre de paires', () => {
    for (const [lang, pool] of Object.entries(POOLS)) {
      expect(pool.length, lang).toBe(IMPOSTEUR_PAIRS_FR.length)
    }
  })

  it('la section « Renfort » commence au même index dans les 4 fichiers', () => {
    const marks = Object.keys(POOLS).map((lang) => {
      const source = readFileSync(fileURLToPath(new URL(`./${lang}.ts`, import.meta.url)), 'utf8')
      const lines = source.split(/\r?\n/)
      const at = lines.findIndex((line) => /^\s*\/\/ ──/.test(line))
      expect(at, `${lang} : section « Renfort » introuvable`).toBeGreaterThan(0)
      return lines.slice(0, at).filter((line) => /^\s*\{\s*a:/.test(line)).length
    })
    expect(marks[0]).toBeGreaterThan(0)
    expect(new Set(marks).size, `index de la section par langue : ${marks.join(', ')}`).toBe(1)
  })
})
