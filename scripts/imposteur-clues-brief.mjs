/**
 * Brief d'un lot du catalogue d'indices de l'Imposteur : imprime les 23 paires
 * du lot avec leur clé EXACTE `a|b` (telle qu'écrite dans
 * src/lib/imposteur/data/<lang>.ts — casse, accents, apostrophe), pour l'agent
 * qui remplit src/lib/imposteur/data/clues/<lang>/lot-NN.ts.
 *
 *   node scripts/imposteur-clues-brief.mjs fr 3
 *
 * Validation ensuite : npx vitest run src/lib/imposteur/data/clues.test.ts -t "fr/lot-03"
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const LOT_SIZE = 23
const LOT_COUNT = 8
const LANGS = ['fr', 'en', 'es', 'it']

const [lang, lotArg] = process.argv.slice(2)
const lot = Number(lotArg)
if (!LANGS.includes(lang) || !Number.isInteger(lot) || lot < 1 || lot > LOT_COUNT) {
  process.stderr.write(`usage : node scripts/imposteur-clues-brief.mjs <${LANGS.join('|')}> <1-${LOT_COUNT}>\n`)
  process.exit(1)
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const source = fs.readFileSync(path.join(root, 'src', 'lib', 'imposteur', 'data', `${lang}.ts`), 'utf8')

// Une chaîne TypeScript simple, entre apostrophes droites ou guillemets (le
// fichier de paires n'échappe rien : « parc d'attractions » est entre guillemets).
const STR = `(?:'([^'\\n]*)'|"([^"\\n]*)")`
const PAIR = new RegExp(`\\{\\s*a:\\s*${STR}\\s*,\\s*b:\\s*${STR}\\s*\\}`, 'g')
const pairs = []
for (const m of source.matchAll(PAIR)) pairs.push({ a: m[1] ?? m[2], b: m[3] ?? m[4] })

const from = (lot - 1) * LOT_SIZE
const slice = pairs.slice(from, from + LOT_SIZE)
const NN = String(lot).padStart(2, '0')
const tsKey = (key) => (key.includes("'") ? `"${key}"` : `'${key}'`)

let out = `# ${lang}/lot-${NN} — paires ${from + 1} à ${from + slice.length} sur ${pairs.length} (src/lib/imposteur/data/${lang}.ts)\n`
out += `# fichier : src/lib/imposteur/data/clues/${lang}/lot-${NN}.ts — export IMPOSTEUR_CLUES_${lang.toUpperCase()}_LOT_${NN}\n\n`
slice.forEach((p, i) => {
  out += `${String(from + i + 1).padStart(3, ' ')}  ${p.a}|${p.b}\n`
})
out += `\n# clés prêtes à coller (5 à 8 indices par côté, du plus vague au plus précis) :\n`
for (const p of slice) out += `  ${tsKey(`${p.a}|${p.b}`)}: { a: [], b: [] },\n`
process.stdout.write(out)
