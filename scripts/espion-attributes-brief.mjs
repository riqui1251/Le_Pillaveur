/**
 * Brief d'un lot du carnet de l'Espion : imprime les 15 lieux du lot avec
 * leurs 4 noms, la définition de chaque réponse, les cellules déjà remplies
 * dans les autres lots, la distribution de chaque question et les paires de
 * lieux trop proches, pour l'agent qui remplit
 * src/lib/espion/data/attributes/lot-NN.ts.
 *
 *   node scripts/espion-attributes-brief.mjs 3
 *
 * Validation ensuite :
 *   npx vitest run src/lib/espion/data/attributes.test.ts -t "attributes/lot-03"
 *
 * Les données sont lues dans les sources TypeScript elles-mêmes (esbuild,
 * déjà installé avec vitest), jamais recopiées ici.
 */
import path from 'path'
import { fileURLToPath } from 'url'
import { build } from 'esbuild'

const LOT_COUNT = 5
const lot = Number(process.argv[2])
if (!Number.isInteger(lot) || lot < 1 || lot > LOT_COUNT) {
  process.stderr.write(`usage : node scripts/espion-attributes-brief.mjs <1-${LOT_COUNT}>\n`)
  process.exit(1)
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const data = path.join(root, 'src', 'lib', 'espion', 'data')
const bundled = await build({
  stdin: {
    contents: `
      export { ESPION_LOCATION_IDS, espionLocationName } from './index'
      export { ESPION_QUESTIONS, ESPION_QUESTION_IDS, ESPION_ANY } from './questions'
      export { ESPION_ATTRIBUTE_LOTS, ESPION_ATTRIBUTE_LOT_SIZE } from './attributes'
    `,
    resolveDir: data,
    loader: 'ts',
  },
  bundle: true,
  write: false,
  format: 'esm',
  platform: 'node',
  logLevel: 'silent',
})
const mod = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`)
const { ESPION_LOCATION_IDS, espionLocationName, ESPION_QUESTIONS, ESPION_QUESTION_IDS, ESPION_ANY } = mod
const { ESPION_ATTRIBUTE_LOTS, ESPION_ATTRIBUTE_LOT_SIZE } = mod

/**
 * Définition opérationnelle de chaque réponse. Le point de vue est celui d'une
 * personne typique sur place : client, visiteur, usager ; à défaut (sous-marin,
 * base militaire), celui qui y travaille.
 */
const GUIDE = {
  where: {
    q: 'dedans ou dehors ?',
    inside: "l'essentiel se passe sous un toit, entre des murs (y compris un véhicule fermé)",
    outside: "l'essentiel se passe à l'air libre",
  },
  when: {
    q: 'on y va plutôt le jour ou la nuit ?',
    day: 'surtout en journée (heures d’ouverture, lumière du jour)',
    night: 'surtout le soir ou la nuit',
  },
  price: {
    q: 'ça coûte cher d’y être ?',
    free: 'on ne paie rien pour y être (lieu public, ou on y est pour son travail ou contraint)',
    cheap: 'quelques euros, une dépense courante',
    pricey: 'une vraie dépense, un budget',
  },
  outfit: {
    q: 'quelle tenue y porte-t-on ?',
    casual: 'vêtements de tous les jours',
    smart: 'on s’habille : costume, robe, tenue soignée',
    uniform: 'tenue imposée : uniforme, blouse, combinaison, casque, équipement',
    swim: 'tenue légère : maillot de bain, serviette, tenue de sport',
  },
  noise: { q: 'calme ou bruyant ?', quiet: 'on parle bas, on s’entend', loud: 'il faut hausser la voix' },
  food: {
    q: 'on y mange ?',
    meal: 'on y prend un vrai repas, assis',
    snack: 'on y grignote, en-cas, sur le pouce',
    none: 'on n’y mange pas',
  },
  crowd: { q: 'il y a du monde ?', few: 'quelques personnes, une poignée', crowd: 'beaucoup de monde, une foule' },
  company: {
    q: 'on y va avec qui ?',
    alone: 'en solo, sans personne',
    friends: 'entre amis',
    family: 'en famille, avec les enfants',
    work: 'pour le travail, entre collègues',
  },
  stay: {
    q: 'on y reste combien de temps ?',
    minutes: 'moins d’une heure, le temps d’un passage',
    hours: 'quelques heures, une demi-journée, une soirée',
    days: 'plusieurs jours, on y dort',
  },
  moving: {
    q: 'on y reste en place ou on bouge ?',
    fixed: 'on reste à sa place : assis, allongé, à son poste',
    moving: 'on se déplace sans arrêt : on marche, on danse, on circule',
  },
  entry: {
    q: 'n’importe qui peut y entrer ?',
    open: 'entrée libre, tout le monde peut entrer',
    ticket: 'il faut un billet, une entrée payante ou une réservation',
    restricted: 'accès réservé : badge, autorisation, membres, convocation',
  },
  mood: {
    q: 'quelle ambiance ?',
    fun: 'détendue, festive, on s’amuse',
    serious: 'sérieuse, concentrée, solennelle',
    tense: 'tendue, stressante, sous surveillance',
  },
}

const size = ESPION_ATTRIBUTE_LOT_SIZE
const NN = String(lot).padStart(2, '0')
const from = (lot - 1) * size
const slice = ESPION_LOCATION_IDS.slice(from, from + size)
const lotOf = (id) => Math.floor(ESPION_LOCATION_IDS.indexOf(id) / size) + 1

const filled = ESPION_ATTRIBUTE_LOTS.flatMap((entries) => Object.entries(entries))
const others = filled.filter(([id]) => lotOf(id) !== lot)
const mine = filled.filter(([id]) => lotOf(id) === lot)
const precise = (v) => v !== ESPION_ANY
const preciseDiffs = (a, b) => ESPION_QUESTION_IDS.filter((q) => precise(a[q]) && precise(b[q]) && a[q] !== b[q])
const row = (attrs) => ESPION_QUESTION_IDS.map((q) => String(attrs[q] ?? '?').padEnd(10)).join(' ')

let out = `# Carnet de l'Espion, lot-${NN} : lieux ${from + 1} à ${from + slice.length} sur ${ESPION_LOCATION_IDS.length}\n`
out += `# fichier : src/lib/espion/data/attributes/lot-${NN}.ts, export ESPION_ATTRIBUTES_LOT_${NN}\n`
out += `# validation : npx vitest run src/lib/espion/data/attributes.test.ts -t "attributes/lot-${NN}"\n\n`

out += `CONSIGNE\n`
out += `- Si un joueur moyen de bonne foi peut répondre autre chose, mets any.\n`
out += `- Réponds comme une personne typique sur place (client, visiteur, usager ; à défaut, celui qui y travaille).\n`
out += `- 12 questions par lieu, chacune une de ses valeurs ou any ; au plus 5 any par lieu.\n`
out += `- Deux lieux diffèrent sur au moins 2 questions où les deux répondent précisément (règle vérifiée dans le lot, puis sur les 75).\n`
out += `- Sur les 75 lieux : any sur au plus 40 % des lieux par question ; aucune valeur sur plus de 70 % des lieux précis (when : 80 %) ;\n`
out += `  chaque valeur sur au moins 6 lieux. Équilibre en regardant la distribution plus bas.\n`
out += `- Les lieux dans l'ordre ci-dessous, rien d'autre dans le fichier ; aucun texte, seulement des codes.\n\n`

out += `QUESTIONS ET VALEURS\n`
for (const q of ESPION_QUESTION_IDS) {
  out += `${q} (${GUIDE[q].q})\n`
  for (const value of ESPION_QUESTIONS[q]) out += `  ${value.padEnd(10)} ${GUIDE[q][value]}\n`
  out += `  ${ESPION_ANY.padEnd(10)} ça dépend de la personne, du moment ou de l'endroit précis\n`
}

out += `\nLIEUX DU LOT (fr / en / es / it)\n`
slice.forEach((id, i) => {
  const names = ['fr', 'en', 'es', 'it'].map((lang) => espionLocationName(id, lang)).join(' / ')
  out += `${String(from + i + 1).padStart(3)}  ${id.padEnd(26)} ${names}\n`
})

const header = `${''.padEnd(26)} ${ESPION_QUESTION_IDS.map((q) => q.padEnd(10)).join(' ')}\n`
out += `\nDÉJÀ REMPLIS DANS LES AUTRES LOTS (${others.length}/${ESPION_LOCATION_IDS.length - slice.length})\n`
if (others.length === 0) out += `  aucun pour l'instant\n`
else {
  out += header
  for (const [id, attrs] of others) out += `${id.padEnd(26)} ${row(attrs)}\n`
}
if (mine.length > 0) {
  out += `\nCE LOT, ÉTAT ACTUEL (${mine.length}/${slice.length})\n${header}`
  for (const [id, attrs] of mine) out += `${id.padEnd(26)} ${row(attrs)}\n`
}

out += `\nDISTRIBUTION SUR LES ${filled.length} LIEUX REMPLIS\n`
for (const q of ESPION_QUESTION_IDS) {
  const counts = [...ESPION_QUESTIONS[q], ESPION_ANY].map((value) => `${value} ${filled.filter(([, a]) => a[q] === value).length}`)
  out += `  ${q.padEnd(9)} ${counts.join(' · ')}\n`
}

const collisions = []
for (let i = 0; i < filled.length; i += 1) {
  for (let j = i + 1; j < filled.length; j += 1) {
    const [a, attrsA] = filled[i]
    const [b, attrsB] = filled[j]
    const diffs = preciseDiffs(attrsA, attrsB)
    if (diffs.length < 2) collisions.push(`  ${a} / ${b} : ${diffs.length} différence(s) précise(s) (${diffs.join(', ') || 'aucune'})`)
  }
}
out += `\nPAIRES TROP PROCHES (moins de 2 différences précises des deux côtés)\n`
out += collisions.length === 0 ? `  aucune\n` : `${collisions.join('\n')}\n`
out += `  (paires admises : NEAR_TWINS dans src/lib/espion/data/attributes.test.ts, jamais identiques sur les 12 réponses)\n`

out += `\n# squelette à remplir (une valeur par question, ou 'any') :\n`
for (const id of slice) {
  const key = /^[a-z]+$/.test(id) ? id : `'${id}'`
  out += `  ${key}: { ${ESPION_QUESTION_IDS.map((q) => `${q}: ''`).join(', ')} },\n`
}
process.stdout.write(out)
