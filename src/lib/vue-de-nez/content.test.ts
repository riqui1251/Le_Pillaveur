import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join, posix, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { VDN_QUESTIONS } from './data/questions'
import { VDN_THEMES, type VdnQuestionMeta } from './data/types'
import { VDN_MAX_ABS_ESTIMATE, createGame, restoreVdnSave, scaleFor, scoreQuestion, toVdnSave } from './engine'
import {
  VDN_LANGS,
  VDN_QUESTION_IDS,
  buildVdnQuestions,
  loadVdnTexts,
  vdnLangOf,
  type VdnLang,
  type VdnTexts,
} from './load'

const METAS: readonly VdnQuestionMeta[] = VDN_QUESTIONS
// Les banques passent par le chargeur du jeu : une langue absente ne fait échouer que SES tests.
const OTHER_LANGS = VDN_LANGS.filter((lang): lang is Exclude<VdnLang, 'fr'> => lang !== 'fr')

/**
 * Aucun contenu ne parle d'alcool : le mode Sans alcool n'a ainsi rien à
 * filtrer. `\b` de JS ne connaît que l'ASCII : « boîte » ou « bebé » ne se
 * confondent pas avec « boit » ou « bebe ». Les mots ambigus d'une langue
 * (« bois », « soul », « copa », « vaso », « shot » ou « glasses » en
 * anglais) sont laissés de côté.
 */
const ALCOHOL: Record<VdnLang, RegExp> = {
  fr: /\b(?:bi[eè]res?|vins?|shots?|verres?|boire|boit|buvez|buveurs?|gorg[ée]es?|cul[- ]sec|alcool\w*|ap[ée]ro\w*|ivre\w*|cocktails?|vodka|whiske?y|rhum|tequila|pastis|liqueurs?|trinqu\w*|picol\w*|soûl\w*|saoul\w*)\b/i,
  en: /\b(?:beers?|wines?|glass(?:es)? of|drink\w*|drunk\w*|sips?|booze\w*|alcohol\w*|cocktails?|vodka|whiske?y|rum|tequila|liquors?|pints?|hangovers?|tipsy)\b/i,
  es: /\b(?:cervezas?|vinos?|chupitos?|beber|bebe[ns]?|tragos?|sorbos?|alcohol\w*|borrach\w*|resacas?|c[óo]ctel(?:es)?|vodka|whisky|tequila)\b/i,
  it: /\b(?:birr[ae]|vin[oi]|shots?|bicchier[ei]|bere|bev(?:e|i|o|ono|uto|endo)|sors[oi]|alcol\w*|alcool\w*|ubriac\w*|sbronz\w*|sborni\w*|cocktails?|vodka|whisky|rum|grappa|aperitiv\w*)\b/i,
}

describe('À Vue de Nez : banque de questions', () => {
  it('ids uniques, thèmes connus, réponses finies et saisissables, minimum sous la réponse', () => {
    expect(METAS.length).toBeGreaterThanOrEqual(105)
    expect(new Set(METAS.map((q) => q.id)).size).toBe(METAS.length)
    for (const q of METAS) {
      expect(VDN_THEMES, q.id).toContain(q.theme)
      expect(Number.isFinite(q.answer), q.id).toBe(true)
      expect(Math.abs(q.answer), q.id).toBeLessThanOrEqual(VDN_MAX_ABS_ESTIMATE)
      const min = q.min ?? 0
      expect(Number.isFinite(min), q.id).toBe(true)
      expect(q.answer, q.id).toBeGreaterThanOrEqual(min)
    }
  })

  it('chaque thème suffit à une partie choisie seule', () => {
    for (const theme of VDN_THEMES) {
      expect(METAS.filter((q) => q.theme === theme).length, theme).toBeGreaterThanOrEqual(5)
    }
  })

  it.each(VDN_LANGS)('%s : chaque question a son énoncé, son unité et sa source', async (lang) => {
    const texts = await loadVdnTexts(lang)
    for (const q of METAS) {
      const text = texts[q.id as keyof VdnTexts]
      expect(text, `${lang} ${q.id}`).toBeDefined()
      expect(text.text.trim().length, `${lang} ${q.id} texte`).toBeGreaterThan(0)
      expect(text.source.trim().length, `${lang} ${q.id} source`).toBeGreaterThan(0)
      expect(typeof text.unit, `${lang} ${q.id} unité`).toBe('string')
    }
    expect(Object.keys(texts).sort()).toEqual(METAS.map((q) => q.id).sort())
    expect(buildVdnQuestions(texts)).toHaveLength(METAS.length)
  })

  it.each(OTHER_LANGS)('%s : le chargeur lit sa propre banque, pas celle du français', async (lang) => {
    expect(await loadVdnTexts(lang)).not.toBe(await loadVdnTexts('fr'))
  })

  it.each(VDN_LANGS)('%s : aucun mot d’alcool (énoncé, unité, source)', async (lang) => {
    const texts = await loadVdnTexts(lang)
    const offenders: string[] = []
    for (const q of METAS) {
      const text = texts[q.id as keyof VdnTexts]
      for (const field of [text.text, text.unit, text.source]) {
        const hit = field.match(ALCOHOL[lang])
        if (hit) offenders.push(`${q.id} « ${hit[0]} » : ${field}`)
      }
    }
    expect(offenders, offenders.join('\n')).toEqual([])
  })

  it('la langue de la page choisit la banque, repli sur le français', () => {
    expect(vdnLangOf('it')).toBe('it')
    expect(vdnLangOf('de')).toBe('fr')
    expect(vdnLangOf(undefined)).toBe('fr')
  })

  it('une partie de 15 questions se tire dans chaque thème et sur toute la banque', async () => {
    const pool = buildVdnQuestions(await loadVdnTexts('fr'))
    for (const themes of [[], ...VDN_THEMES.map((t) => [t])]) {
      const outcome = createGame({ playerIds: ['a', 'b'], pool, seed: themes.join() || 'tout', questionCount: 15, themes })
      expect(outcome.ok).toBe(true)
    }
  })

  it('les dates avant notre ère se jugent à un an près, comme la règle l’affiche', async () => {
    const bank = buildVdnQuestions(await loadVdnTexts('fr'))
    for (const id of ['histoire-fondation-rome', 'histoire-alesia']) {
      expect(bank.find((q) => q.id === id)?.year, id).toBe(true)
    }
    const rome = bank.find((q) => q.id === 'histoire-fondation-rome')
    if (!rome) throw new Error('histoire-fondation-rome absente')
    const tags = scoreQuestion(rome.answer, [
      { playerId: 'alice', estimate: 740 },
      { playerId: 'bob', estimate: 600 },
    ], rome).map((r) => r.tag)
    expect(tags).toEqual(['closest', 'farthest'])
  })

  it('reprise : le prédicat connaît toute la banque avant ses textes, réglages de la partie compris', async () => {
    expect([...VDN_QUESTION_IDS].sort()).toEqual(METAS.map((q) => q.id).sort())
    const pool = buildVdnQuestions(await loadVdnTexts('it'))
    const outcome = createGame({ playerIds: ['a', 'b'], pool, seed: 'reprise', questionCount: 15, themes: ['histoire'] })
    if (!outcome.ok) throw new Error(outcome.error)
    const save: unknown = JSON.parse(JSON.stringify(toVdnSave(outcome.state)))
    expect(restoreVdnSave(save, ['b', 'a'], VDN_QUESTION_IDS)).toEqual(outcome.state)
  })

  it('la règle graduée tient pour chaque réponse de la banque', () => {
    for (const q of METAS) {
      const scale = scaleFor(q.answer, [q.answer * 0.5, q.answer * 2, q.min ?? 0])
      expect(scale.min, q.id).toBeLessThan(scale.max)
      expect(scale.ticks.length, q.id).toBeGreaterThanOrEqual(2)
    }
  })
})

// ─── Garde d'imports ─────────────────────────────────────────────────────────

const SRC_DIR = resolve(fileURLToPath(new URL('../../', import.meta.url)))
const BANK_TARGET = /^lib\/vue-de-nez\/data(?:\/(?:index|questions|fr|en|es|it))?(?:\.ts)?$/
const LOADER_TARGET = /^lib\/vue-de-nez\/load(?:\.ts)?$/

/** Les réponses ne quittent jamais le jeu local ni le serveur : l'en ligne et la TV reçoivent la question par la vue. */
function bankReaderAllowed(rel: string): boolean {
  return (
    rel === 'lib/vue-de-nez/load.ts' ||
    rel === 'lib/vue-de-nez/server-adapter.ts' ||
    rel.startsWith('lib/vue-de-nez/data/') ||
    /^lib\/vue-de-nez\/[^/]+\.test\.ts$/.test(rel)
  )
}

function loaderReaderAllowed(rel: string): boolean {
  return rel.startsWith('app/[locale]/games/vue-de-nez/') || /^lib\/vue-de-nez\/[^/]+\.test\.ts$/.test(rel)
}

function walk(dir: string, visit: (file: string) => void): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, visit)
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) visit(full)
  }
}

describe('À Vue de Nez : accès à la banque', () => {
  it('seuls le chargeur local (et le serveur) lisent la banque ; seul le jeu local lit le chargeur', () => {
    const offenders: string[] = []
    const readers = new Set<string>()
    walk(SRC_DIR, (file) => {
      const rel = relative(SRC_DIR, file).split(sep).join('/')
      const source = readFileSync(file, 'utf8')
      for (const m of source.matchAll(/from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        const spec = m[1] ?? m[2]
        const target = spec.startsWith('.') ? posix.join(posix.dirname(rel), spec) : spec.replace(/^@\//, '')
        if (BANK_TARGET.test(target)) {
          if (bankReaderAllowed(rel)) readers.add(rel)
          else offenders.push(`${rel} → ${spec}`)
        } else if (LOADER_TARGET.test(target)) {
          if (loaderReaderAllowed(rel)) readers.add(rel)
          else offenders.push(`${rel} → ${spec}`)
        }
      }
    })
    expect(offenders, offenders.join('\n')).toEqual([])
    expect([...readers]).toContain('lib/vue-de-nez/load.ts')
  })
})
