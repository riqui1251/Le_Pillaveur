import { normalizeForModeration, squashRepeats, type ModerationWord } from './normalize'

/**
 * Mots et prénoms innocents qui CONTIENNENT un terme modéré : « cocktail »
 * (cock), « député » (pute), « habite » (bite), « combinazione » (nazi),
 * « salopette » (salope), « Tamer » (tamer), « râpé » (rape)…
 *
 * Les racines de 4-5 lettres sont cherchées DANS les mots (terms.ts) : c'est
 * ce qui arrête « SaleNegre » ou « GrosseBite », et c'est cette liste qui
 * rend leurs mots innocents. Les racines trop répandues pour une liste
 * (nique, esti, cono…) ne comptent, elles, qu'en début de mot. Chaque entrée
 * ouvre une porte : une entrée nomme un mot RÉEL, jamais un morceau qu'un
 * troll pourrait coller à une insulte (« debite* » protège débiter, pas
 * « tetedebite », d'où un préfixe plutôt qu'une portion n'importe où).
 *
 * Syntaxe :
 * - `mot`   : le mot entier seulement (« tamer » protège Tamer, pas « tamerlapute ») ;
 * - `mot*`  : le mot et ce qui le prolonge (« cocktail* » → cocktails) ;
 * - `*mot*` : la portion, OÙ qu'elle tombe dans le mot — réservé aux suffixes
 *   productifs qu'aucun préfixe ne peut énumérer (« *nazion* » : nazionale,
 *   combinazione, destinazione, internazionale…) ;
 * - avec accents (« râpé* ») : comparé au mot TEL QUE TAPÉ, accents compris.
 *   « râpé » passe, « rape » (anglais) reste bloqué alors que leur forme
 *   normalisée est identique. Jamais d'accent dans une entrée `*mot*`.
 *
 * Une entrée ne protège que SA portion du mot : un terme qui déborde au-delà
 * (« cocktailconnard », « tamere ») reste détecté. Corpus de contrôle : les
 * textes du site dans les quatre langues (word-boundaries.test.ts).
 */
const ALLOWED_WORDS: readonly string[] = [
  // Prénoms et noms propres.
  'tamer', // prénom ; aussi « lion tamer » — « tamere » reste bloqué
  'tamers',
  'conor', // cono (coño)
  'nazim', // nazi
  'nazir',
  'nazira',
  'naziha',
  'nazih',
  'ignazi*', // Ignazio
  'benazir',
  'peder', // pede
  'pedersen',
  'dickson', // dick
  'dickens',
  'dickinson',
  'riddick',
  'roddick',
  'reddick',
  'benedick',
  'vergara', // verga
  'maricarmen', // marica
  'figaro*', // figa
  'hancock', // cock
  'hitchcock',
  'babcock',
  'wilcock',

  // cock (anglais) : mots courants.
  'cocktail*',
  'cockpit*',
  'cocker*',
  'cockney*',
  'cockroach*',
  'cockatoo*',
  'cockatiel*',
  'cockle*',
  'peacock*',
  'woodcock*',
  'shuttlecock*',
  'poppycock*',

  // salop / salope.
  'salopette*',

  // bite : habiter, orbite, subite, débiter… et les boissons italiennes.
  'habite*',
  'cohabite*',
  'inhabite*',
  'orbite*',
  'exorbite*',
  'subite*',
  'debite*',
  'bibite*', // bibite (IT, boissons)
  'arbiter*',
  'inhibite*',
  'exhibite*',
  'prohibite*',
  'proibite*',
  'frostbite*',
  'snakebite*',

  // pute / puta / puto : député, dispute, computer, réputé, amputer…
  'depute*',
  'dispute*',
  'undispute*',
  'indispute*',
  'compute*',
  'repute*',
  'impute*',
  'ampute*',
  'suppute*',
  'dipute*',
  'computa*',
  'computo*',
  'disputa*',
  'disputo*',
  'indisputa*',
  'diputad*',
  'diputac*',
  'deputat*',
  'imputa*',
  'imputo*',
  'reputa*',
  'reputo*',
  'disreputa*',
  'amputa*',
  'amputo*',
  'saputa*', // risaputo (IT)
  'saputo*',
  'risaputa*',
  'risaputo*',
  'sputa*', // sputare (IT, cracher)
  'sputo*',

  // nazi : le suffixe italien -nazione (combinazione, destinazione…).
  '*nazion*',

  // pede : bipède, quadrupède, stampede…
  'bipede*',
  'quadrupede*',
  'velocipede*',
  'centipede*',
  'millipede*',
  'stampede*',
  'impede*',
  'torpede*',

  // rape / rapist (anglais). La râpe et le fromage râpé exigent l'accent.
  'râpe*',
  'râpé*',
  'rapeur*', // rappeur écrit avec un seul p
  'rapero*', // rappeur (ES)
  'rapera*',
  'rapear*',
  'rapeseed*',
  'rapetiss*', // rapetisser
  'therapist*',
  'therape*', // thérapeute, therapeutic
  'drape*', // drapeau, draper
  'grape*',
  'crape*', // crapette
  'scrape*',
  'skyscrape*',
  'trape*', // trapèze, trapear
  'attrape*',
  'rattrape*',
  'derape*', // déraper
  'parape*', // parapet

  // nigger dans snigger (ricaner).
  'snigger*',

  // esti / osti (sacres québécois) en tête de mots FR, ES, IT, EN.
  'estim*', // estime, estimation, estimate, estimar
  'estiv*', // estival, estivant, estivo
  'estil*', // estilo
  'estin*', // estinto, estintore
  'estir*', // estirar, estirpare
  'estig*', // estigma
  'estip*', // estipular
  'estierc*', // estiércol
  'ostil*', // ostile
  'ostin*', // ostinato
  'ostic*', // ostico

  // criss : le crissement des pneus.
  'crissement*',
  'crissant*',

  // sacrement (sacre québécois) : l'adverbe « sacrément » exige l'accent.
  'sacrément*',

  // pede : randonnée pédestre, pedestrian.
  'pedest*',

  // prick : prickly.
  'prickl*',

  // puta : putatif, putative, putativo.
  'putati*',

  // cono : conocer, conozco (ES), conoscere (IT).
  'conoc*',
  'conoz*',
  'conosc*',

  // porco : porcospino (IT).
  'porcospin*',

  // branl : une table branlante.
  'branlant*',

  // shit : le champignon, souvent écrit avec un seul i.
  'shitake*',
]

type AllowedEntry = {
  /** Forme brute (entrée accentuée) ou normalisée puis écrasée (sinon). */
  match: string
  prefix: boolean
  /** `*mot*` : portion protégée où qu'elle tombe dans le mot. */
  infix: boolean
  accented: boolean
  /** Longueur normalisée de l'entrée (portion protégée d'une entrée accentuée). */
  normLength: number
}

const ACCENTED_RE = /[^a-z]/

const ENTRIES: readonly AllowedEntry[] = ALLOWED_WORDS.map((entry) => {
  const infix = entry.length > 2 && entry.startsWith('*') && entry.endsWith('*')
  const prefix = !infix && entry.endsWith('*')
  const bare = infix ? entry.slice(1, -1) : prefix ? entry.slice(0, -1) : entry
  const text = bare.normalize('NFC').toLowerCase()
  const accented = ACCENTED_RE.test(text)
  const norm = normalizeForModeration(text)
  return {
    // Hors accents, on compare les formes écrasées : « cocktaiiil » tapé avec
    // enthousiasme reste un cocktail pour la passe « lettres martelées ».
    match: accented ? text : squashRepeats(norm),
    prefix,
    infix,
    accented,
    normLength: norm.length,
  }
})

/** Entrées ancrées au début du mot (`mot`, `mot*`). */
const WORD_ENTRIES: readonly AllowedEntry[] = ENTRIES.filter((entry) => !entry.infix)
/** Portions `*mot*` — jamais accentuées (comparées sur la forme écrasée). */
const INFIX_ENTRIES: readonly AllowedEntry[] = ENTRIES.filter((entry) => entry.infix && !entry.accented)

/** Longueur du début de `norm` qui couvre ses `runs` premières salves de lettres. */
function lengthCoveringRuns(norm: string, runs: number): number {
  let seen = 0
  let i = 0
  while (i < norm.length) {
    let j = i + 1
    while (j < norm.length && norm[j] === norm[i]) j += 1
    seen += 1
    if (seen === runs) return j
    i = j
  }
  return norm.length
}

/** Lettres (et accents combinants) — le reste en bordure de mot est de la ponctuation. */
const EDGE_NON_LETTERS_START_RE = /^[^\p{L}\p{M}]+/u
const EDGE_NON_LETTERS_END_RE = /[^\p{L}\p{M}]+$/u

/**
 * Portion du mot protégée par la liste blanche, en positions de `word.norm`
 * (début inclus, fin exclue), ou null. La ponctuation collée en bordure est
 * ignorée : « Tamer! » reste Tamer même si « ! » se lit « i » en leet.
 */
export function allowedSpanInWord(
  word: ModerationWord
): { start: number; end: number } | null {
  const lead = word.raw.match(EDGE_NON_LETTERS_START_RE)?.[0] ?? ''
  const core = word.raw.slice(lead.length).replace(EDGE_NON_LETTERS_END_RE, '')
  if (!core) return null

  const coreNorm = normalizeForModeration(core)
  const coreSquashed = squashRepeats(coreNorm)
  let protectedLength = 0

  for (const entry of WORD_ENTRIES) {
    const candidate = entry.accented ? core : coreSquashed
    const hit = entry.prefix ? candidate.startsWith(entry.match) : candidate === entry.match
    if (!hit) continue

    let length: number
    if (!entry.prefix) length = coreNorm.length
    else if (entry.accented) length = entry.normLength
    else length = lengthCoveringRuns(coreNorm, entry.match.length)

    protectedLength = Math.max(protectedLength, length)
  }

  if (protectedLength === 0) return null
  const start = normalizeForModeration(lead).length
  return { start, end: Math.min(start + protectedLength, word.norm.length) }
}

/** Bornes [début, fin) de chaque salve de lettres de `norm` : la i-ème lettre de sa forme écrasée. */
function runBounds(norm: string): Array<{ start: number; end: number }> {
  const runs: Array<{ start: number; end: number }> = []
  let i = 0
  while (i < norm.length) {
    let j = i + 1
    while (j < norm.length && norm[j] === norm[i]) j += 1
    runs.push({ start: i, end: j })
    i = j
  }
  return runs
}

/**
 * TOUTES les portions protégées du mot, en positions de `word.norm` : celle
 * d'une entrée ancrée au début (allowedSpanInWord) et chaque occurrence d'une
 * portion `*mot*`. Dans « combinazione », seule la portion « nazion » est
 * protégée ; « NeoNazi » n'en contient aucune et reste refusé. C'est ce que
 * lit le détecteur (index.ts).
 */
export function allowedSpansInWord(word: ModerationWord): Array<{ start: number; end: number }> {
  const spans: Array<{ start: number; end: number }> = []
  const anchored = allowedSpanInWord(word)
  if (anchored) spans.push(anchored)

  const lead = word.raw.match(EDGE_NON_LETTERS_START_RE)?.[0] ?? ''
  const core = word.raw.slice(lead.length).replace(EDGE_NON_LETTERS_END_RE, '')
  if (!core || INFIX_ENTRIES.length === 0) return spans

  const coreNorm = normalizeForModeration(core)
  const coreSquashed = squashRepeats(coreNorm)
  const runs = runBounds(coreNorm)
  const offset = normalizeForModeration(lead).length

  for (const entry of INFIX_ENTRIES) {
    for (
      let at = coreSquashed.indexOf(entry.match);
      at !== -1;
      at = coreSquashed.indexOf(entry.match, at + 1)
    ) {
      const first = runs[at]
      const last = runs[at + entry.match.length - 1]
      if (!first || !last) continue
      spans.push({
        start: offset + first.start,
        end: Math.min(offset + last.end, word.norm.length),
      })
    }
  }
  return spans
}

/** Vrai si le texte entier est un mot de la liste blanche (tests, supervision). */
export function isAllowedWord(text: string): boolean {
  const norm = normalizeForModeration(text)
  if (!norm || norm.includes(' ')) return false
  const span = allowedSpanInWord({ raw: text.normalize('NFC').toLowerCase(), norm })
  return span !== null && span.start === 0 && span.end === norm.length
}
