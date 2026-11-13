import { describe, expect, it } from 'vitest'
import { VDN_QUESTIONS } from './data/questions'
import type { VdnQuestionMeta } from './data/types'
import { VDN_LANGS, buildVdnQuestions, loadVdnTexts, type VdnLang, type VdnTexts } from './load'
import { vdnShownUnit } from './unit'

const METAS: readonly VdnQuestionMeta[] = VDN_QUESTIONS
/** L'unité des questions-années dans chaque banque : derrière un millésime, elle se lirait « 1959 année ». */
const YEAR_WORD: Record<VdnLang, string> = { fr: 'année', en: 'year', es: 'año', it: 'anno' }

describe('À Vue de Nez : unité affichée', () => {
  it('une année de notre ère se lit seule, avant notre ère avec son ère, le reste avec son unité', () => {
    expect(vdnShownUnit('année', { year: true })).toBe('')
    expect(vdnShownUnit('année', { year: true, bce: false })).toBe('')
    expect(vdnShownUnit('av. J.-C.', { year: true, bce: true })).toBe('av. J.-C.')
    expect(vdnShownUnit('os', {})).toBe('os')
    expect(vdnShownUnit('m', { year: false })).toBe('m')
  })

  it.each(VDN_LANGS)('%s : le jeu local n’affiche jamais l’unité « année » derrière un millésime', async (lang) => {
    const texts = await loadVdnTexts(lang)
    const shown = new Map(buildVdnQuestions(texts).map((q) => [q.id, q.unit]))
    let years = 0
    for (const meta of METAS) {
      const raw = texts[meta.id as keyof VdnTexts].unit.trim()
      const unit = shown.get(meta.id)
      if (meta.year && !meta.bce) {
        years += 1
        expect(raw, `${lang} ${meta.id}`).toBe(YEAR_WORD[lang])
        expect(unit, `${lang} ${meta.id}`).toBe('')
      } else if (meta.bce) {
        expect(unit, `${lang} ${meta.id}`).toBe(raw)
        expect(unit?.length, `${lang} ${meta.id}`).toBeGreaterThan(0)
      } else {
        expect(unit, `${lang} ${meta.id}`).toBe(raw)
      }
    }
    expect(years).toBeGreaterThanOrEqual(10)
    expect([...shown.values()]).not.toContain(YEAR_WORD[lang])
  })
})
