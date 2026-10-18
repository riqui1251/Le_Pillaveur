import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs'
import { dirname, join, relative, resolve, sep } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { ESPION_LOCATION_IDS, type EspionLocationId } from './locations'
import { ESPION_ANY, ESPION_QUESTIONS, ESPION_QUESTION_IDS, type EspionQuestionId } from './questions'
import { ESPION_ATTRIBUTE_LOTS, ESPION_ATTRIBUTE_LOT_SIZE, espionAttrsOf } from './attributes'

/**
 * VALIDATEUR du carnet de l'Espion (data/attributes/lot-01..05.ts). Un
 * describe par lot, filtrable :
 *   npx vitest run src/lib/espion/data/attributes.test.ts -t "attributes/lot-03"
 * puis, les 5 lots remplis :
 *   npx vitest run src/lib/espion/data/attributes.test.ts -t "attributes/global"
 * Chaque violation nomme le lot, le lieu, la question et la règle, pour être
 * renvoyée telle quelle au rédacteur. Mode strict depuis que les 5 lots sont
 * remplis : un lot vidé ou un lieu retiré fait échouer L1 et le carnet
 * complet, au lieu de sauter les règles comme pendant la rédaction.
 */

const LOT_COUNT = 5
/** Au plus 5 `any` par lieu : au moins 7 questions peuvent le contredire. */
const MAX_ANY_PER_LOCATION = 5
/** G1 : part de `any` par question. */
const MAX_ANY_SHARE = 0.4
/** G2 : part max d'une valeur parmi les lieux à réponse précise. */
const MAX_VALUE_SHARE = 0.7
/**
 * G2, seule exception : le monde vit de jour. Hors des sorties du soir
 * (12 lieux), aucun « nuit » n'est sûr pour un humain de bonne foi, et `any`
 * plafonné par G1 (30 lieux) ne peut pas descendre « jour » sous 73 % des
 * lieux précis. Forcer « nuit » ferait soupçonner un équipier honnête.
 */
const MAX_VALUE_SHARE_BY_QUESTION: Partial<Record<EspionQuestionId, number>> = { when: 0.8 }
const maxValueShare = (q: EspionQuestionId) => MAX_VALUE_SHARE_BY_QUESTION[q] ?? MAX_VALUE_SHARE
/** G2 : une valeur sert à au moins 6 lieux, sinon elle ne départage rien. */
const MIN_VALUE_LOCATIONS = 6
/** G3 / L4 : questions précises des deux côtés sur lesquelles deux lieux doivent différer. */
const MIN_PRECISE_DIFF = 2
const MAX_NEAR_TWINS = 5
/**
 * Lieux voisins par nature, admis à moins de 2 différences (jamais
 * identiques sur les 12 réponses). Au plus 5 paires, chacune justifiée.
 */
const NEAR_TWINS: readonly (readonly [EspionLocationId, EspionLocationId])[] = [
  // Même expérience de client ; seul le menu change.
  ['restaurant', 'restaurant-japonais'],
  // Même soirée de spectacle, assis et en tenue soignée ; seul le genre change.
  ['theatre', 'opera'],
  // On y fait ses courses ; seul le toit les sépare.
  ['supermarche', 'marche-aux-poissons'],
  // Lieux de recueillement, gratuits et ouverts ; seul le toit les sépare.
  ['cathedrale', 'cimetiere'],
]

type RawAttrs = Record<string, unknown>
type RawLot = Record<string, RawAttrs>

const pad = (n: number) => String(n).padStart(2, '0')
const LOCATION_SET = new Set<string>(ESPION_LOCATION_IDS)
const lotOfLocation = (id: string): number => Math.floor(ESPION_LOCATION_IDS.indexOf(id as EspionLocationId) / ESPION_ATTRIBUTE_LOT_SIZE) + 1

type LotContext = {
  /** « attributes/lot-03 » */
  name: string
  lot: RawLot
  /** Les 15 lieux attendus, dans l'ordre. */
  slice: readonly EspionLocationId[]
}

function contextOf(index: number, lot: RawLot): LotContext {
  return {
    name: `attributes/lot-${pad(index + 1)}`,
    lot,
    slice: ESPION_LOCATION_IDS.slice(index * ESPION_ATTRIBUTE_LOT_SIZE, (index + 1) * ESPION_ATTRIBUTE_LOT_SIZE),
  }
}

const isPrecise = (value: unknown) => value !== ESPION_ANY

/** Questions où les deux lieux répondent précisément et différemment. */
function preciseDiffs(a: RawAttrs, b: RawAttrs): EspionQuestionId[] {
  return ESPION_QUESTION_IDS.filter((q) => isPrecise(a[q]) && isPrecise(b[q]) && a[q] !== b[q])
}

const identical = (a: RawAttrs, b: RawAttrs) => ESPION_QUESTION_IDS.every((q) => a[q] === b[q])

const isNearTwin = (a: string, b: string) =>
  NEAR_TWINS.some(([x, y]) => (x === a && y === b) || (x === b && y === a))

/** Les lieux du lot dont l'id est bien un lieu du lot (les autres relèvent de L1). */
function entriesOf({ lot, slice }: LotContext): [EspionLocationId, RawAttrs][] {
  return Object.entries(lot).flatMap(([id, attrs]) =>
    (slice as readonly string[]).includes(id) ? [[id as EspionLocationId, attrs] as [EspionLocationId, RawAttrs]] : []
  )
}

// ─── Règles par lot : chacune rend la liste des violations, nommées ──────────

/** L1 : les 15 lieux du lot, dans l'ordre ; aucun id inconnu ni lieu d'un autre lot. */
function ruleL1Locations(ctx: LotContext): string[] {
  const v: string[] = []
  for (const id of Object.keys(ctx.lot)) {
    if (!LOCATION_SET.has(id)) v.push(`${ctx.name} › ${id} : id inconnu (voir ESPION_LOCATION_IDS, data/locations.ts)`)
    else if (!(ctx.slice as readonly string[]).includes(id)) {
      v.push(`${ctx.name} › ${id} : lieu d'un autre lot (attendu dans lot-${pad(lotOfLocation(id))})`)
    }
  }
  for (const id of ctx.slice) if (!(id in ctx.lot)) v.push(`${ctx.name} › ${id} : lieu absent`)
  const present = Object.keys(ctx.lot).filter((id) => (ctx.slice as readonly string[]).includes(id))
  const expected = ctx.slice.filter((id) => present.includes(id))
  if (present.join() !== expected.join()) {
    v.push(`${ctx.name} : ordre des lieux ${present.join(', ')} ; attendu ${expected.join(', ')}`)
  }
  return v
}

/** L2 : les 12 questions renseignées, chacune par une de ses valeurs ou `any`. */
function ruleL2Values(ctx: LotContext): string[] {
  const v: string[] = []
  for (const [id, attrs] of entriesOf(ctx)) {
    for (const q of ESPION_QUESTION_IDS) {
      const value = attrs[q]
      const allowed: readonly unknown[] = [...ESPION_QUESTIONS[q], ESPION_ANY]
      if (value === undefined) v.push(`${ctx.name} › ${id} › ${q} : question non renseignée`)
      else if (!allowed.includes(value)) {
        v.push(`${ctx.name} › ${id} › ${q} : ${JSON.stringify(value)} hors de ${allowed.join(' / ')}`)
      }
    }
    for (const key of Object.keys(attrs)) {
      if (!(ESPION_QUESTION_IDS as readonly string[]).includes(key)) v.push(`${ctx.name} › ${id} › ${key} : question inconnue`)
    }
  }
  return v
}

/** L3 : au plus 5 `any` par lieu. */
function ruleL3Any(ctx: LotContext): string[] {
  const v: string[] = []
  for (const [id, attrs] of entriesOf(ctx)) {
    const anys = ESPION_QUESTION_IDS.filter((q) => attrs[q] === ESPION_ANY)
    if (anys.length > MAX_ANY_PER_LOCATION) {
      v.push(`${ctx.name} › ${id} : ${anys.length} any (au plus ${MAX_ANY_PER_LOCATION}) sur ${anys.join(', ')}`)
    }
  }
  return v
}

/** Paires trop proches parmi `entries` : moins de 2 différences précises, ou identiques. */
function nearPairs(name: string, entries: readonly [string, RawAttrs][]): string[] {
  const v: string[] = []
  for (let i = 0; i < entries.length; i += 1) {
    for (let j = i + 1; j < entries.length; j += 1) {
      const [a, attrsA] = entries[i]
      const [b, attrsB] = entries[j]
      if (identical(attrsA, attrsB)) {
        v.push(`${name} › ${a} / ${b} : mêmes 12 réponses`)
        continue
      }
      const diffs = preciseDiffs(attrsA, attrsB)
      if (diffs.length < MIN_PRECISE_DIFF && !isNearTwin(a, b)) {
        v.push(
          `${name} › ${a} / ${b} : ${diffs.length} différence(s) précise(s) des deux côtés (${diffs.join(', ') || 'aucune'}), au moins ${MIN_PRECISE_DIFF} attendues`
        )
      }
    }
  }
  return v
}

/** L4 : dans le lot, deux lieux diffèrent sur au moins 2 questions précises des deux côtés. */
function ruleL4Diversity(ctx: LotContext): string[] {
  return nearPairs(ctx.name, entriesOf(ctx))
}

const LOT_RULES: [string, (ctx: LotContext) => string[]][] = [
  ['L1 : les 15 lieux du lot, dans l’ordre, aucun d’un autre lot', ruleL1Locations],
  ['L2 : 12 questions renseignées, chaque valeur dans celles de sa question ou any', ruleL2Values],
  [`L3 : au plus ${MAX_ANY_PER_LOCATION} any par lieu`, ruleL3Any],
  [`L4 : deux lieux du lot diffèrent sur au moins ${MIN_PRECISE_DIFF} questions précises`, ruleL4Diversity],
]

// ─── Règles globales, sur le carnet entier ───────────────────────────────────

type Carnet = [string, RawAttrs][]

/** G1 : `any` sur au plus 40 % des lieux, pour chaque question. */
function ruleG1AnyShare(carnet: Carnet): string[] {
  const v: string[] = []
  for (const q of ESPION_QUESTION_IDS) {
    const anys = carnet.filter(([, attrs]) => attrs[q] === ESPION_ANY).length
    if (anys > MAX_ANY_SHARE * carnet.length) {
      v.push(`global › ${q} : any sur ${anys}/${carnet.length} lieux (au plus ${Math.round(MAX_ANY_SHARE * 100)} %)`)
    }
  }
  return v
}

/** G2 : aucune valeur sur plus de 70 % des lieux à réponse précise (when : 80 %) ; chaque valeur sur au moins 6 lieux. */
function ruleG2Distribution(carnet: Carnet): string[] {
  const v: string[] = []
  for (const q of ESPION_QUESTION_IDS) {
    const precise = carnet.filter(([, attrs]) => isPrecise(attrs[q])).length
    const maxShare = maxValueShare(q)
    for (const value of ESPION_QUESTIONS[q]) {
      const count = carnet.filter(([, attrs]) => attrs[q] === value).length
      if (count > maxShare * precise) {
        v.push(`global › ${q} = ${value} : ${count}/${precise} lieux précis (au plus ${Math.round(maxShare * 100)} %)`)
      }
      if (count < MIN_VALUE_LOCATIONS) {
        v.push(`global › ${q} = ${value} : ${count} lieu(x), au moins ${MIN_VALUE_LOCATIONS} attendus`)
      }
    }
  }
  return v
}

/** G3 : deux lieux du carnet diffèrent sur au moins 2 questions précises des deux côtés. */
function ruleG3Diversity(carnet: Carnet): string[] {
  return nearPairs('global', carnet)
}

/** Le carnet tel que lu par le serveur, lieu par lieu, dans l'ordre des ids. */
function liveCarnet(): Carnet {
  return ESPION_LOCATION_IDS.flatMap((id) => {
    const attrs = espionAttrsOf(id)
    return attrs ? [[id, attrs as RawAttrs] as [string, RawAttrs]] : []
  })
}

// ─── Garde d'import ──────────────────────────────────────────────────────────

const SRC_DIR = resolve(fileURLToPath(new URL('../../../', import.meta.url)))
const IMPORT_SPEC = /\b(?:from|import)\s*\(?\s*['"]([^'"\n]+)['"]|\brequire\(\s*['"]([^'"\n]+)['"]\s*\)/g

function walk(dir: string, visit: (file: string) => void): void {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name)
    if (statSync(full).isDirectory()) walk(full, visit)
    else if (/\.(ts|tsx|js|mjs)$/.test(name)) visit(full)
  }
}

/** Module visé par un import, relatif à src/ sans extension ni /index ; null pour un paquet. */
function resolveSpec(fromFile: string, spec: string): string | null {
  let target: string
  if (spec.startsWith('@/')) target = join(SRC_DIR, spec.slice(2))
  else if (spec.startsWith('.')) target = resolve(dirname(fromFile), spec)
  else return null
  return relative(SRC_DIR, target)
    .split(sep)
    .join('/')
    .replace(/\.(ts|tsx|js|mjs)$/, '')
    .replace(/\/index$/, '')
}

function importsOf(file: string): string[] {
  const source = readFileSync(file, 'utf8')
  return [...source.matchAll(IMPORT_SPEC)].flatMap((m) => {
    const resolved = resolveSpec(file, m[1] ?? m[2])
    return resolved ? [resolved] : []
  })
}

const CARNET = 'lib/espion/data/attributes'
const isCarnet = (mod: string) => mod === CARNET || mod.startsWith(`${CARNET}/`)
const isEspionData = (mod: string) => mod === 'lib/espion/data' || mod.startsWith('lib/espion/data/')
const isTestFile = (rel: string) => /\.test\.tsx?$/.test(rel)
const CARNET_READERS_ALLOWED = (rel: string) =>
  rel === 'lib/espion/server-adapter.ts' || rel.startsWith(`${CARNET}/`)

/** G5 : hors tests, seuls server-adapter.ts et data/attributes/ importent le carnet ; bot-tick.ts n'importe aucune donnée. */
function ruleG5Imports(): { offenders: string[]; readers: string[] } {
  const offenders: string[] = []
  const readers = new Set<string>()
  walk(SRC_DIR, (file) => {
    const rel = relative(SRC_DIR, file).split(sep).join('/')
    for (const mod of importsOf(file)) {
      if (isCarnet(mod)) {
        readers.add(rel)
        if (!isTestFile(rel) && !CARNET_READERS_ALLOWED(rel)) offenders.push(`${rel} → ${mod} : le carnet est réservé au serveur`)
      }
      if (rel === 'lib/espion/bot-tick.ts' && isEspionData(mod)) {
        offenders.push(`${rel} → ${mod} : le délai des bots est importé côté client, sans aucune donnée`)
      }
    }
  })
  return { offenders, readers: [...readers] }
}

/**
 * Imports qui restent dans le bundle : `import type` et `export type`
 * s'effacent à la compilation, ils ne transportent aucune donnée.
 */
const VALUE_IMPORT_SPEC =
  /\b(?:import|export)\s+(type\s+)?(?:[^'";]*?\bfrom\s*)?['"]([^'"\n]+)['"]|\bimport\(\s*['"]([^'"\n]+)['"]\s*\)/g
const USE_CLIENT = /^(?:\s*(?:\/\/[^\n]*|\/\*[\s\S]*?\*\/))*\s*['"]use client['"]/
const CARNET_SERVER_READER = 'lib/espion/server-adapter'

function valueImportSpecs(source: string): string[] {
  return [...source.matchAll(VALUE_IMPORT_SPEC)].flatMap((m) => (m[1] ? [] : [m[2] ?? m[3]]))
}

/** Fichier d'un module (relatif à src/, sans extension ni /index), ou null hors de src/. */
function fileOfModule(mod: string): string | null {
  for (const candidate of [`${mod}.ts`, `${mod}.tsx`, `${mod}/index.ts`, `${mod}/index.tsx`]) {
    const full = join(SRC_DIR, candidate)
    if (existsSync(full) && statSync(full).isFile()) return full
  }
  return null
}

/**
 * G5 bis : la règle directe ne suffit pas, server-adapter.ts a le droit de
 * lire le carnet. Le bundle client part de chaque module 'use client' et
 * suit ses imports de valeur : aucun chemin ne doit atteindre le carnet, ni
 * server-adapter.ts qui le lira dès le lot 3.
 */
function ruleG5ClientReach(): { offenders: string[]; reached: string[] } {
  const relOf = (file: string) => relative(SRC_DIR, file).split(sep).join('/')
  const roots: string[] = []
  walk(SRC_DIR, (file) => {
    if (!isTestFile(relOf(file)) && USE_CLIENT.test(readFileSync(file, 'utf8'))) roots.push(file)
  })
  const parent = new Map<string, string | null>(roots.map((root) => [root, null]))
  const chainOf = (file: string): string => {
    const chain: string[] = []
    for (let at: string | null | undefined = file; at; at = parent.get(at)) chain.unshift(relOf(at))
    return chain.join(' → ')
  }
  const offenders: string[] = []
  const queue = [...roots]
  while (queue.length > 0) {
    const file = queue.shift()!
    for (const spec of valueImportSpecs(readFileSync(file, 'utf8'))) {
      const mod = resolveSpec(file, spec)
      if (!mod) continue
      if (isCarnet(mod) || mod === CARNET_SERVER_READER) {
        offenders.push(`${chainOf(file)} → ${mod} : module client qui atteint le carnet`)
      }
      const next = fileOfModule(mod)
      if (next && !parent.has(next)) {
        parent.set(next, file)
        queue.push(next)
      }
    }
  }
  return { offenders, reached: [...parent.keys()].map(relOf) }
}

// ─── Un describe par lot, puis le carnet entier ──────────────────────────────

describe('attributes : structure', () => {
  it(`${LOT_COUNT} lots de ${ESPION_ATTRIBUTE_LOT_SIZE} lieux couvrent exactement ESPION_LOCATION_IDS`, () => {
    expect(ESPION_ATTRIBUTE_LOTS).toHaveLength(LOT_COUNT)
    expect(ESPION_LOCATION_IDS).toHaveLength(LOT_COUNT * ESPION_ATTRIBUTE_LOT_SIZE)
  })

  it(`au plus ${MAX_NEAR_TWINS} paires de lieux voisins admises, ids connus et distincts`, () => {
    expect(NEAR_TWINS.length).toBeLessThanOrEqual(MAX_NEAR_TWINS)
    for (const [a, b] of NEAR_TWINS) {
      expect(LOCATION_SET.has(a) && LOCATION_SET.has(b) && a !== b, `${a} / ${b}`).toBe(true)
    }
  })
})

ESPION_ATTRIBUTE_LOTS.forEach((lot, index) => {
  const ctx = contextOf(index, lot as RawLot)
  describe(ctx.name, () => {
    for (const [title, rule] of LOT_RULES) {
      it(title, () => {
        const v = rule(ctx)
        expect(v, v.join('\n')).toEqual([])
      })
    }
  })
})

describe('attributes/global', () => {
  const carnet = liveCarnet()

  it(`carnet complet : les ${ESPION_LOCATION_IDS.length} lieux ont leur ligne, rien ne retombe sur null`, () => {
    const missing = ESPION_LOCATION_IDS.filter((id) => espionAttrsOf(id) === null)
    expect(missing, missing.join(', ')).toEqual([])
    expect(carnet).toHaveLength(ESPION_LOCATION_IDS.length)
  })

  it(`G1 : any sur au plus ${Math.round(MAX_ANY_SHARE * 100)} % des lieux, par question`, () => {
    const v = ruleG1AnyShare(carnet)
    expect(v, v.join('\n')).toEqual([])
  })

  it(
    `G2 : aucune valeur sur plus de ${Math.round(MAX_VALUE_SHARE * 100)} % des lieux précis (when : ${Math.round(maxValueShare('when') * 100)} %), chacune sur au moins ${MIN_VALUE_LOCATIONS}`,
    () => {
      const v = ruleG2Distribution(carnet)
      expect(v, v.join('\n')).toEqual([])
    }
  )

  it(`G3 : deux lieux diffèrent sur au moins ${MIN_PRECISE_DIFF} questions précises`, () => {
    const v = ruleG3Diversity(carnet)
    expect(v, v.join('\n')).toEqual([])
  })

  it('G4 : ids de question et codes de valeur sans élément commun avec les ids de lieu', () => {
    const codes = [...ESPION_QUESTION_IDS, ...Object.values(ESPION_QUESTIONS).flat(), ESPION_ANY]
    expect(codes.filter((code) => LOCATION_SET.has(code))).toEqual([])
  })

  it('G5 : hors tests, seuls server-adapter.ts et data/attributes/ importent le carnet ; bot-tick.ts aucune donnée', () => {
    const { offenders, readers } = ruleG5Imports()
    expect(offenders, offenders.join('\n')).toEqual([])
    // Le relevé a bien résolu les chemins : ce fichier-ci importe le carnet.
    expect(readers).toContain('lib/espion/data/attributes.test.ts')
    expect(existsSync(join(SRC_DIR, CARNET, 'index.ts'))).toBe(true)
  })

  it('G5 bis : aucun module client n’atteint le carnet ni server-adapter.ts, même par rebond', () => {
    const { offenders, reached } = ruleG5ClientReach()
    expect(offenders, offenders.join('\n')).toEqual([])
    // Le parcours a bien suivi les imports : l'écran de l'Espion mène au moteur, puis aux questions.
    expect(reached).toEqual(
      expect.arrayContaining(['components/online/EspionOnline.tsx', 'lib/espion/engine.ts', 'lib/espion/data/questions.ts'])
    )
  })
})

// ─── Le validateur lui-même : chaque règle se déclenche sur un carnet fautif ─

describe('attributes : le validateur nomme chaque violation', () => {
  const SLICE = ESPION_LOCATION_IDS.slice(0, ESPION_ATTRIBUTE_LOT_SIZE)
  const valueAt = (q: EspionQuestionId, n: number) => ESPION_QUESTIONS[q][n % ESPION_QUESTIONS[q].length]
  const bit = (i: number, k: number) => (i >> k) & 1
  /**
   * 15 lieux factices tous précis : 4 bits de l'index sur where/when/noise/crowd
   * et leur parité sur moving, donc deux lieux diffèrent toujours sur 2 questions.
   */
  const fake = (i: number): RawAttrs => ({
    where: valueAt('where', bit(i, 0)),
    when: valueAt('when', bit(i, 1)),
    price: valueAt('price', i),
    outfit: valueAt('outfit', i),
    noise: valueAt('noise', bit(i, 2)),
    food: valueAt('food', i + 1),
    crowd: valueAt('crowd', bit(i, 3)),
    company: valueAt('company', i + 2),
    stay: valueAt('stay', i + 2),
    moving: valueAt('moving', bit(i, 0) ^ bit(i, 1) ^ bit(i, 2) ^ bit(i, 3)),
    entry: valueAt('entry', i),
    mood: valueAt('mood', i + 1),
  })
  const goodLot = (): RawLot => Object.fromEntries(SLICE.map((id, i) => [id, fake(i)]))
  const ctxWith = (lot: RawLot) => contextOf(0, lot)
  const [first, second, third] = SLICE

  it('un lot correct ne produit aucune violation', () => {
    for (const [, rule] of LOT_RULES) expect(rule(ctxWith(goodLot()))).toEqual([])
  })

  it('L1 : id inconnu, lieu d’un autre lot, lieu absent, ordre', () => {
    const lot = goodLot()
    delete lot[second]
    lot['atlantide'] = fake(0)
    lot['observatoire-volcanique'] = fake(1)
    expect(ruleL1Locations(ctxWith(lot))).toEqual([
      expect.stringContaining('attributes/lot-01 › atlantide : id inconnu'),
      expect.stringContaining('observatoire-volcanique : lieu d\'un autre lot (attendu dans lot-05)'),
      expect.stringContaining(`${second} : lieu absent`),
    ])
    const { [first]: moved, ...rest } = goodLot()
    expect(ruleL1Locations(ctxWith({ ...rest, [first]: moved }))).toEqual([
      expect.stringContaining('attributes/lot-01 : ordre des lieux'),
    ])
  })

  it('L2 : question non renseignée, valeur hors de sa question, question inconnue', () => {
    const lot = goodLot()
    const { when: _when, ...noWhen } = lot[first]
    void _when
    lot[first] = { ...noWhen, price: 'swim', weather: 'sunny' }
    expect(ruleL2Values(ctxWith(lot))).toEqual([
      expect.stringContaining(`${first} › when : question non renseignée`),
      expect.stringContaining(`${first} › price : "swim" hors de free / cheap / pricey / any`),
      expect.stringContaining(`${first} › weather : question inconnue`),
    ])
  })

  it('L3 : plus de 5 any sur un lieu', () => {
    const lot = goodLot()
    lot[first] = { ...lot[first], where: 'any', when: 'any', price: 'any', outfit: 'any', noise: 'any', food: 'any' }
    expect(ruleL3Any(ctxWith(lot))).toEqual([
      expect.stringContaining(`${first} : 6 any (au plus 5) sur where, when, price, outfit, noise, food`),
    ])
  })

  it('L4 : deux lieux identiques, ou une seule différence précise des deux côtés', () => {
    const twin = goodLot()
    twin[second] = { ...twin[first] }
    expect(ruleL4Diversity(ctxWith(twin))).toContainEqual(expect.stringContaining(`${first} / ${second} : mêmes 12 réponses`))

    const close = goodLot()
    // Une seule différence précise : l'autre écart tombe sur un any.
    close[third] = { ...close[first], where: valueAt('where', 1), mood: 'any' }
    expect(ruleL4Diversity(ctxWith(close))).toContainEqual(
      expect.stringContaining(`${first} / ${third} : 1 différence(s) précise(s) des deux côtés (where)`)
    )
  })

  it('L4 : une paire de lieux voisins admise passe, sauf identique', () => {
    const entries: [string, RawAttrs][] = [
      ['restaurant', fake(0)],
      ['restaurant-japonais', { ...fake(0), price: valueAt('price', 2) }],
    ]
    expect(nearPairs('x', entries)).toEqual([])
    expect(nearPairs('x', [entries[0], ['restaurant-japonais', fake(0)]])).toEqual([
      expect.stringContaining('restaurant / restaurant-japonais : mêmes 12 réponses'),
    ])
  })

  it('G1 : any sur plus de 40 % des lieux d’une question', () => {
    const carnet: Carnet = Array.from({ length: 10 }, (_, i) => [`l${i}`, { ...fake(i), food: i < 5 ? 'any' : 'meal' }])
    expect(ruleG1AnyShare(carnet)).toEqual([expect.stringContaining('global › food : any sur 5/10 lieux (au plus 40 %)')])
  })

  it('G2 : une valeur qui écrase les autres, une valeur trop rare', () => {
    const carnet: Carnet = Array.from({ length: 16 }, (_, i) => [`l${i}`, fake(i)])
    const v = ruleG2Distribution(carnet.map(([id, attrs], i) => [id, { ...attrs, noise: i < 12 ? 'loud' : 'quiet' }]))
    expect(v).toContainEqual(expect.stringContaining('global › noise = loud : 12/16 lieux précis (au plus 70 %)'))
    expect(v).toContainEqual(expect.stringContaining('global › noise = quiet : 4 lieu(x), au moins 6 attendus'))
  })

  it('G2 : la tolérance de when ne vaut que pour when', () => {
    const carnet: Carnet = Array.from({ length: 24 }, (_, i) => [
      `l${i}`,
      { ...fake(i), when: i < 18 ? 'day' : 'night', noise: i < 18 ? 'loud' : 'quiet' },
    ])
    const v = ruleG2Distribution(carnet)
    expect(v).toContainEqual(expect.stringContaining('global › noise = loud : 18/24 lieux précis (au plus 70 %)'))
    expect(v.filter((line) => line.includes('› when ='))).toEqual([])
    const v2 = ruleG2Distribution(carnet.map(([id, attrs], i) => [id, { ...attrs, when: i < 20 ? 'day' : 'night' }]))
    expect(v2).toContainEqual(expect.stringContaining('global › when = day : 20/24 lieux précis (au plus 80 %)'))
  })

  it('G3 : la diversité vaut aussi entre lots', () => {
    const carnet: Carnet = [
      ['plage', fake(3)],
      ['observatoire-volcanique', { ...fake(3), where: valueAt('where', 0) }],
    ]
    expect(ruleG3Diversity(carnet)).toEqual([
      expect.stringContaining('global › plage / observatoire-volcanique : 1 différence(s) précise(s)'),
    ])
  })

  it('G5 : la résolution des imports suit les chemins relatifs et l’alias @/', () => {
    const from = join(SRC_DIR, 'lib', 'espion', 'engine.ts')
    expect(resolveSpec(from, './data/attributes')).toBe(CARNET)
    expect(resolveSpec(from, '@/lib/espion/data/attributes/lot-01')).toBe(`${CARNET}/lot-01`)
    expect(resolveSpec(from, './data/attributes/index')).toBe(CARNET)
    expect(resolveSpec(from, 'vitest')).toBeNull()
    expect(isCarnet('lib/espion/data/attributes.test')).toBe(false)
    expect(CARNET_READERS_ALLOWED('lib/espion/engine.ts')).toBe(false)
  })

  it('G5 bis : les imports de valeur sont suivis, les imports de type ignorés', () => {
    const source = [
      "import type { RoomDto } from '@/lib/online-room'",
      "export type { EspionAttributes } from './data/questions'",
      "import { getGameAdapter } from '@/lib/online/game-adapters'",
      "import {\n  espionAttrsOf,\n  type EspionAttributeLot,\n} from './data/attributes'",
      "export * from '@/lib/espion/server-adapter'",
      "import './side-effect'",
      "const lazy = await import('./data/attributes/lot-01')",
    ].join('\n')
    expect(valueImportSpecs(source)).toEqual([
      '@/lib/online/game-adapters',
      './data/attributes',
      '@/lib/espion/server-adapter',
      './side-effect',
      './data/attributes/lot-01',
    ])
    expect(USE_CLIENT.test("// écran\n'use client'\nimport x from 'y'")).toBe(true)
    expect(USE_CLIENT.test("import x from 'y'\n'use client'")).toBe(false)
    expect(fileOfModule('lib/espion/data')).toBe(join(SRC_DIR, 'lib', 'espion', 'data', 'index.ts'))
    expect(fileOfModule('lib/espion/data/attributes')).toBe(join(SRC_DIR, CARNET, 'index.ts'))
  })
})
