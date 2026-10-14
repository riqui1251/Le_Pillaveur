import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import {
  isValidClue,
  normalizeClue,
  IMPOSTEUR_CLUE_MAX_LEN,
  IMPOSTEUR_EMPTY_CLUE,
  IMPOSTEUR_LANGS,
  type ImposteurLang,
  type ImposteurWordPair,
} from '../engine'
import { IMPOSTEUR_PAIRS_FR } from './fr'
import { IMPOSTEUR_PAIRS_EN } from './en'
import { IMPOSTEUR_PAIRS_ES } from './es'
import { IMPOSTEUR_PAIRS_IT } from './it'
import { clueListIn, imposteurClueKey, IMPOSTEUR_CLUES_COMPLETE, type ImposteurClueSet } from './clues'
import { IMPOSTEUR_CLUES_FR_LOTS } from './clues/fr'
import { IMPOSTEUR_CLUES_EN_LOTS } from './clues/en'
import { IMPOSTEUR_CLUES_ES_LOTS } from './clues/es'
import { IMPOSTEUR_CLUES_IT_LOTS } from './clues/it'

/**
 * VALIDATEUR du catalogue d'indices des bots (data/clues/<lang>/lot-NN.ts).
 * Un describe par fichier de lot, filtrable :
 *   npx vitest run src/lib/imposteur/data/clues.test.ts -t "fr/lot-03"
 * Chaque violation nomme la paire, le côté, l'index et la règle, pour être
 * renvoyée telle quelle à l'agent qui a écrit le lot. Les règles sont celles
 * du brief (scripts/imposteur-clues-brief.mjs). Un stub vide passe tant que la
 * langue n'est pas dans IMPOSTEUR_CLUES_COMPLETE ; en mode strict, chaque
 * paire du lot doit avoir son entrée.
 */

const LOT_SIZE = 23
const LOT_COUNT = 8
const MIN_CLUES = 5
const MAX_CLUES = 8
const MAX_SHARED = 2
/** Dernier rang admis pour un indice commun aux deux mots (proxy de l'ordre vague → précis). */
const SHARED_MAX_RANK = 1

type Lot = Record<string, ImposteurClueSet>

const CATALOGUE: Record<ImposteurLang, { pairs: ImposteurWordPair[]; lots: readonly Lot[] }> = {
  fr: { pairs: IMPOSTEUR_PAIRS_FR, lots: IMPOSTEUR_CLUES_FR_LOTS },
  en: { pairs: IMPOSTEUR_PAIRS_EN, lots: IMPOSTEUR_CLUES_EN_LOTS },
  es: { pairs: IMPOSTEUR_PAIRS_ES, lots: IMPOSTEUR_CLUES_ES_LOTS },
  it: { pairs: IMPOSTEUR_PAIRS_IT, lots: IMPOSTEUR_CLUES_IT_LOTS },
}

const pad = (n: number) => String(n).padStart(2, '0')

type LotContext = {
  /** « fr/lot-03 » */
  name: string
  lot: Lot
  /** Paires attendues dans ce lot (tranche de 23), par clé exacte. */
  slice: Map<string, ImposteurWordPair>
  /** Numéro de lot de chaque clé de la langue (clé absente = orpheline). */
  lotOfKey: Map<string, number>
  strict: boolean
}

function contextOf(lang: ImposteurLang, index: number, lot: Lot): LotContext {
  const { pairs } = CATALOGUE[lang]
  const lotOfKey = new Map<string, number>()
  pairs.forEach((pair, i) => lotOfKey.set(imposteurClueKey(pair), Math.floor(i / LOT_SIZE) + 1))
  const slice = new Map(
    pairs.slice(index * LOT_SIZE, (index + 1) * LOT_SIZE).map((pair) => [imposteurClueKey(pair), pair])
  )
  return {
    name: `${lang}/lot-${pad(index + 1)}`,
    lot,
    slice,
    lotOfKey,
    strict: IMPOSTEUR_CLUES_COMPLETE.includes(lang),
  }
}

type Entry = { key: string; pair: ImposteurWordPair; side: 'a' | 'b'; list: string[] }

/** Les listes du lot dont la clé est bien une paire du lot (les autres relèvent de la règle 1). */
function listsOf({ lot, slice }: LotContext): Entry[] {
  return Object.entries(lot).flatMap(([key, set]) => {
    const pair = slice.get(key)
    if (!pair) return []
    return [
      { key, pair, side: 'a' as const, list: set.a },
      { key, pair, side: 'b' as const, list: set.b },
    ]
  })
}

/** Les deux côtés d'une même paire, pour les règles qui les comparent. */
function setsOf({ lot, slice }: LotContext): { key: string; pair: ImposteurWordPair; set: ImposteurClueSet }[] {
  return Object.entries(lot).flatMap(([key, set]) => {
    const pair = slice.get(key)
    return pair ? [{ key, pair, set }] : []
  })
}

const startsUpper = (text: string) => /^\p{Lu}/u.test(text)

// ─── Les règles : chacune rend la liste des violations, nommées ──────────────

/** (1) clé = paire exacte de la langue, dans son lot ; en mode strict, chaque paire du lot présente. */
function rule1Keys(ctx: LotContext): string[] {
  const v: string[] = []
  for (const key of Object.keys(ctx.lot)) {
    const lotNo = ctx.lotOfKey.get(key)
    if (lotNo === undefined) {
      v.push(
        `${ctx.name} › ${key} : clé orpheline — aucune paire du fichier de langue ne s'écrit ainsi (casse, accents, apostrophe telle quelle, ordre a|b)`
      )
    } else if (!ctx.slice.has(key)) {
      v.push(`${ctx.name} › ${key} : paire d'un autre lot (attendue dans lot-${pad(lotNo)})`)
    }
  }
  if (ctx.strict) {
    for (const key of ctx.slice.keys()) {
      if (!(key in ctx.lot)) v.push(`${ctx.name} › ${key} : paire absente (langue déclarée complète)`)
    }
  }
  return v
}

/** (2) 5 à 8 indices par côté. */
function rule2Count(ctx: LotContext): string[] {
  const v: string[] = []
  for (const { key, side, list } of listsOf(ctx)) {
    if (list.length < MIN_CLUES || list.length > MAX_CLUES) {
      v.push(`${ctx.name} › ${key} › ${side} : ${list.length} indices (attendu ${MIN_CLUES} à ${MAX_CLUES})`)
    }
  }
  return v
}

/** (3) chaque indice : trim-stable, 1-30 caractères, ≠ « … », valide contre les DEUX mots. */
function rule3Clue(ctx: LotContext): string[] {
  const v: string[] = []
  for (const { key, pair, side, list } of listsOf(ctx)) {
    list.forEach((clue, i) => {
      const where = `${ctx.name} › ${key} › ${side}[${i}] ${JSON.stringify(clue)}`
      if (clue !== clue.trim()) {
        v.push(`${where} : espaces en bordure`)
      } else if (clue.length < 1 || clue.length > IMPOSTEUR_CLUE_MAX_LEN) {
        v.push(`${where} : ${clue.length} caractères (attendu 1 à ${IMPOSTEUR_CLUE_MAX_LEN})`)
      } else if (clue === IMPOSTEUR_EMPTY_CLUE) {
        v.push(`${where} : « … » n'est pas un indice`)
      } else {
        for (const word of [pair.a, pair.b]) {
          if (!isValidClue(clue, word)) {
            v.push(`${where} : isValidClue(…, ${JSON.stringify(word)}) faux (contient ou fragmente le mot)`)
          }
        }
      }
    })
  }
  return v
}

/** (4) pas de doublon normalisé dans une liste. */
function rule4Duplicates(ctx: LotContext): string[] {
  const v: string[] = []
  for (const { key, side, list } of listsOf(ctx)) {
    const seen = new Map<string, number>()
    list.forEach((clue, i) => {
      const norm = normalizeClue(clue)
      const first = seen.get(norm)
      if (first === undefined) seen.set(norm, i)
      else v.push(`${ctx.name} › ${key} › ${side}[${i}] ${JSON.stringify(clue)} : doublon de ${side}[${first}] ${JSON.stringify(list[first])}`)
    })
  }
  return v
}

/** (5) au plus 2 indices communs aux deux côtés. */
function rule5Shared(ctx: LotContext): string[] {
  const v: string[] = []
  for (const { key, set } of setsOf(ctx)) {
    const normB = new Set(set.b.map(normalizeClue))
    const common = set.a.filter((clue) => normB.has(normalizeClue(clue)))
    if (common.length > MAX_SHARED) {
      v.push(`${ctx.name} › ${key} : a∩b = ${common.length} > ${MAX_SHARED} (${common.join(', ')})`)
    }
  }
  return v
}

/** (6) pas de ponctuation finale ; initiale minuscule sauf si a ou b commence par une majuscule. */
function rule6Form(ctx: LotContext): string[] {
  const v: string[] = []
  for (const { key, pair, side, list } of listsOf(ctx)) {
    const upperOk = startsUpper(pair.a) || startsUpper(pair.b)
    list.forEach((clue, i) => {
      const where = `${ctx.name} › ${key} › ${side}[${i}] ${JSON.stringify(clue)}`
      if (/[.,;:!?…]$/u.test(clue)) v.push(`${where} : ponctuation finale`)
      if (!upperOk && startsUpper(clue)) v.push(`${where} : initiale majuscule (la paire est en minuscules)`)
    })
  }
  return v
}

/** (7) un indice commun aux deux côtés ouvre chaque liste (rang 0 ou 1). */
function rule7SharedFirst(ctx: LotContext): string[] {
  const v: string[] = []
  for (const { key, set } of setsOf(ctx)) {
    const normA = set.a.map(normalizeClue)
    const normB = set.b.map(normalizeClue)
    for (const norm of normA.filter((n) => normB.includes(n))) {
      for (const [side, list, norms] of [
        ['a', set.a, normA],
        ['b', set.b, normB],
      ] as const) {
        const rank = norms.indexOf(norm)
        if (rank > SHARED_MAX_RANK) {
          v.push(
            `${ctx.name} › ${key} › ${side}[${rank}] ${JSON.stringify(list[rank])} : commun aux deux mots, hors des ${SHARED_MAX_RANK + 1} premiers rangs (vague d'abord)`
          )
        }
      }
    }
  }
  return v
}

const RULES: [string, (ctx: LotContext) => string[]][] = [
  ['(1) clés = paires exactes du lot, aucune orpheline ; strict : toutes présentes', rule1Keys],
  [`(2) ${MIN_CLUES} à ${MAX_CLUES} indices par côté`, rule2Count],
  ['(3) indices trim-stables, 1-30 caractères, ≠ « … », valides contre les DEUX mots', rule3Clue],
  ['(4) aucun doublon normalisé dans une liste', rule4Duplicates],
  [`(5) au plus ${MAX_SHARED} indices communs aux deux côtés`, rule5Shared],
  ['(6) pas de ponctuation finale ; initiale minuscule sauf paire à majuscule', rule6Form],
  ['(7) les indices communs ouvrent chaque liste (rang 0 ou 1)', rule7SharedFirst],
]

// ─── Un describe par langue, un par fichier de lot ───────────────────────────

for (const lang of IMPOSTEUR_LANGS) {
  const { pairs, lots } = CATALOGUE[lang]

  describe(`imposteur clues ${lang}`, () => {
    it(`${LOT_COUNT} lots de ${LOT_SIZE} paires couvrent exactement la liste`, () => {
      expect(lots).toHaveLength(LOT_COUNT)
      expect(pairs).toHaveLength(LOT_SIZE * LOT_COUNT)
    })

    it('aucune clé dans deux lots (le spread écraserait la première)', () => {
      const seen = new Map<string, number>()
      const v: string[] = []
      lots.forEach((lot, i) => {
        for (const key of Object.keys(lot)) {
          const first = seen.get(key)
          if (first !== undefined) v.push(`${lang} › ${key} : dans lot-${pad(first)} et lot-${pad(i + 1)}`)
          else seen.set(key, i + 1)
        }
      })
      expect(v, v.join('\n')).toEqual([])
    })
  })

  lots.forEach((lot, index) => {
    const ctx = contextOf(lang, index, lot)
    describe(ctx.name, () => {
      for (const [title, rule] of RULES) {
        it(title, () => {
          const v = rule(ctx)
          expect(v, v.join('\n')).toEqual([])
        })
      }
    })
  })
}

// ─── Le validateur lui-même : chaque règle se déclenche sur un lot fautif ────

describe('imposteur clues : le validateur nomme chaque violation', () => {
  // fr/lot-01 s'ouvre sur plage|piscine ; Noël|Nouvel An (majuscules) est au lot 2.
  const KEY = 'plage|piscine'
  const good: ImposteurClueSet = {
    a: ['été', 'serviette', 'sable', 'vagues', 'parasol', 'marée'],
    b: ['été', 'serviette', 'chlore', 'maître-nageur', 'plongeoir'],
  }
  const ctxWith = (lot: Lot, strict = false, index = 0): LotContext => ({
    ...contextOf('fr', index, lot),
    strict,
  })
  const withA = (a: string[]): Lot => ({ [KEY]: { ...good, a } })

  it('un lot correct ne produit aucune violation ; un stub vide passe hors mode strict', () => {
    for (const [, rule] of RULES) {
      expect(rule(ctxWith({ [KEY]: good }))).toEqual([])
      expect(rule(ctxWith({}))).toEqual([])
    }
  })

  it('(1) clé orpheline, paire d’un autre lot, paire absente en mode strict', () => {
    expect(rule1Keys(ctxWith({ 'Plage|piscine': good }))).toEqual([
      expect.stringContaining('fr/lot-01 › Plage|piscine : clé orpheline'),
    ])
    expect(rule1Keys(ctxWith({ 'piscine|plage': good }))).toEqual([
      expect.stringContaining('piscine|plage : clé orpheline'),
    ])
    const last = imposteurClueKey(IMPOSTEUR_PAIRS_FR[IMPOSTEUR_PAIRS_FR.length - 1])
    expect(rule1Keys(ctxWith({ [last]: good }))).toEqual([
      expect.stringContaining(`${last} : paire d'un autre lot (attendue dans lot-08)`),
    ])
    const strictMissing = rule1Keys(ctxWith({}, true))
    expect(strictMissing).toHaveLength(LOT_SIZE)
    expect(strictMissing[0]).toContain(`fr/lot-01 › ${KEY} : paire absente`)
    expect(rule1Keys(ctxWith({ [KEY]: good }, true))).toHaveLength(LOT_SIZE - 1)
  })

  it('(2) nombre d’indices par côté', () => {
    const v = rule2Count(ctxWith({ [KEY]: { a: ['été', 'sable', 'vagues', 'marée'], b: [...good.b, 'x1', 'x2', 'x3', 'x4'] } }))
    expect(v).toEqual([
      expect.stringContaining(`${KEY} › a : 4 indices`),
      expect.stringContaining(`${KEY} › b : 9 indices`),
    ])
  })

  it('(3) bordure, longueur, « … », indice qui contient ou fragmente un des deux mots', () => {
    const v = rule3Clue(ctxWith(withA(['été', ' chlore', 'x'.repeat(31), '…', 'plages', 'pisc', 'sable'])))
    expect(v).toEqual([
      expect.stringContaining('a[1] " chlore" : espaces en bordure'),
      expect.stringContaining('a[2] "xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx" : 31 caractères'),
      expect.stringContaining('a[3] "…" : « … » n\'est pas un indice'),
      expect.stringContaining('a[4] "plages" : isValidClue(…, "plage") faux'),
      expect.stringContaining('a[5] "pisc" : isValidClue(…, "piscine") faux'),
    ])
  })

  it('(4) doublon normalisé', () => {
    expect(rule4Duplicates(ctxWith(withA(['été', 'serviette', 'Été', 'sable', 'vagues'])))).toEqual([
      expect.stringContaining('a[2] "Été" : doublon de a[0] "été"'),
    ])
  })

  it('(5) plus de 2 indices communs', () => {
    const v = rule5Shared(ctxWith(withA(['été', 'serviette', 'chlore', 'sable', 'vagues'])))
    expect(v).toEqual([expect.stringContaining(`${KEY} : a∩b = 3 > 2 (été, serviette, chlore)`)])
  })

  it('(6) ponctuation finale et majuscule — admise quand la paire en porte une', () => {
    expect(rule6Form(ctxWith(withA(['été', 'serviette', 'Sable', 'vagues.', 'marée'])))).toEqual([
      expect.stringContaining('a[2] "Sable" : initiale majuscule'),
      expect.stringContaining('a[3] "vagues." : ponctuation finale'),
    ])
    const noel: Lot = {
      'Noël|Nouvel An': {
        a: ['fête', 'famille', 'Sapin', 'cadeaux', 'crèche'],
        b: ['fête', 'famille', 'minuit', 'bonne année', 'champagne'],
      },
    }
    expect(rule1Keys(ctxWith(noel, false, 1))).toEqual([])
    expect(rule6Form(ctxWith(noel, false, 1))).toEqual([])
  })

  it('(7) un indice commun hors des 2 premiers rangs', () => {
    expect(rule7SharedFirst(ctxWith(withA(['sable', 'vagues', 'été', 'parasol', 'marée'])))).toEqual([
      expect.stringContaining('a[2] "été" : commun aux deux mots, hors des 2 premiers rangs'),
    ])
  })
})

// ─── Accès au catalogue ──────────────────────────────────────────────────────

const SRC_DIR = resolve(fileURLToPath(new URL('../../../', import.meta.url)))
/** Seuls lecteurs admis du catalogue : l'adaptateur serveur et le dossier data lui-même. */
const READERS_ALLOWED = (rel: string) =>
  rel === 'lib/imposteur/server-adapter.ts' || rel.startsWith('lib/imposteur/data/')

function walk(dir: string, visit: (file: string) => void): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, visit)
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) visit(full)
  }
}

describe('imposteur clues : accès', () => {
  it('(8) le catalogue (data/clues) n’est importé que par server-adapter.ts et data/', () => {
    const offenders: string[] = []
    const readers = new Set<string>()
    walk(SRC_DIR, (file) => {
      const rel = relative(SRC_DIR, file).split(sep).join('/')
      const source = readFileSync(file, 'utf8')
      for (const m of source.matchAll(/from\s+['"]([^'"]+)['"]|import\(\s*['"]([^'"]+)['"]\s*\)/g)) {
        const spec = m[1] ?? m[2]
        if (!/data\/clues/.test(spec)) continue
        if (READERS_ALLOWED(rel)) readers.add(rel)
        else offenders.push(`${rel} → ${spec}`)
      }
    })
    expect(offenders, offenders.join('\n')).toEqual([])
    // Le relevé a bien parcouru le dépôt : l'adaptateur serveur, lui, l'importe.
    expect([...readers]).toContain('lib/imposteur/server-adapter.ts')
  })

  it('clueListIn ne rend que la liste du mot demandé, a|b puis b|a, en copie', () => {
    const table: Lot = { 'plage|piscine': { a: ['été', 'sable'], b: ['été', 'chlore'] } }
    const pair = { a: 'plage', b: 'piscine' }
    const flipped = { a: 'piscine', b: 'plage' }
    expect(clueListIn(table, pair, 'plage')).toEqual(['été', 'sable'])
    expect(clueListIn(table, pair, 'piscine')).toEqual(['été', 'chlore'])
    expect(clueListIn(table, flipped, 'piscine')).toEqual(['été', 'chlore'])
    expect(clueListIn(table, flipped, 'plage')).toEqual(['été', 'sable'])
    expect(clueListIn(table, pair, 'mer')).toBeNull()
    expect(clueListIn(table, { a: 'café', b: 'thé' }, 'café')).toBeNull()
    clueListIn(table, pair, 'plage')!.push('x')
    expect(table['plage|piscine'].a).toEqual(['été', 'sable'])
  })
})
