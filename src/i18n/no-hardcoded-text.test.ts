import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs'
import { join, relative, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import ts from 'typescript'
import { describe, expect, it } from 'vitest'

/**
 * Textes français écrits EN DUR dans les écrans locaux.
 *
 * Un libellé tapé directement dans le JSX ne passe pas par next-intl : la
 * tablée anglaise, espagnole ou italienne lit « À qui ? » ou « Paramètres de
 * la roue » au milieu d'un écran traduit, et aucun test ne le voyait — le
 * test de couverture (messages-coverage) ne vérifie que les namespaces lus.
 *
 * Relevé STATIQUE, par l'analyseur de TypeScript (pas d'expressions
 * régulières sur le source : un `a > b && c < d` n'est pas du texte). Il
 * signale :
 * - tout texte littéral entre deux balises (`<p>À qui ?</p>`) ;
 * - tout attribut `placeholder`, `title` ou `aria-label` littéral (chaîne ou
 *   gabarit sans traduction) ;
 * dès qu'il contient une lettre accentuée du français ou un mot français
 * courant de MOTS_FRANCAIS.
 *
 * Exceptions de principe, sans entrée à tenir : les commentaires (JSX ou non)
 * ne sont pas du texte rendu, les expressions (`{t('…')}`, `{player.name}`)
 * non plus, et un texte sans lettre (emoji, flèche, chiffres, « 🍺 ») ne
 * contient ni accent ni mot. Le reste — un nom propre accentué, par exemple —
 * s'inscrit NOMMÉMENT dans TEXTES_ADMIS, avec sa raison.
 */

const SRC_DIR = resolve(fileURLToPath(new URL('../', import.meta.url)))
const GAMES_DIR = join(SRC_DIR, 'app', '[locale]', 'games')

/** Écrans relevés, hors pages de jeu : la gestion des joueurs locaux et la fiche compte. */
const EXTRA_FILES = ['components/PlayerManager.tsx', 'components/ui/AccountInfo.tsx']

/** Attributs lus par le joueur ou par son lecteur d'écran. */
const TEXT_ATTRIBUTES = new Set(['placeholder', 'title', 'aria-label'])

/** Lettres accentuées du français (et ligatures). */
const FRENCH_LETTERS = /[àâäçéèêëîïôöùûüÿœæ]/i

/**
 * Mots français COURANTS, sans accent (un mot accentué est déjà pris par
 * FRENCH_LETTERS) — liste courte, choisie pour ne pas croiser l'anglais des
 * interfaces : un « tour » ou un « pour » n'a rien à faire en dur dans un
 * écran traduit. « case » croise l'anglais, mais pas le vocabulaire des
 * écrans relevés : c'est la case du plateau (« case 12 »).
 */
const MOTS_FRANCAIS = [
  'joueur', 'joueurs', 'partie', 'parties', 'tour', 'tours', 'jeu', 'jeux',
  'boire', 'bois', 'boit', 'trinque', 'trinquer', 'manche', 'manches',
  'suivant', 'suivante', 'retour', 'enregistrer', 'valider', 'annuler', 'choisir',
  'pseudo', 'compte', 'ton', 'votre', 'vos',
  'case', 'gagne', 'reste', 'recule',
  'qui', 'avec', 'pour', 'sans', 'les', 'des', 'une', 'est',
]
const FRENCH_WORD = new RegExp(`\\b(?:${MOTS_FRANCAIS.join('|')})\\b`, 'i')

/**
 * Textes admis malgré le détecteur, chacun avec sa raison (texte exact,
 * espaces normalisés). Le test échoue si une entrée ne sert plus.
 */
const TEXTES_ADMIS: Record<string, string> = {}

/**
 * Liste d'ATTENTE : fichiers hors du chantier qui a posé ce test (« le groupe
 * revient le lendemain », 2026-09-25) et qui portent encore des textes en dur.
 * Chaque entrée est une dette NOMMÉE (datée, motivée) — pas un oubli — et
 * FIGÉE : `textes` liste exactement ce que le détecteur y voit aujourd'hui.
 * Un texte NOUVEAU dans le fichier fait échouer le test comme ailleurs ; un
 * texte nettoyé aussi, pour que la liste raccourcisse avec le fichier. On
 * retire l'entrée le jour où le fichier est propre.
 */
const LISTE_D_ATTENTE: Record<string, { depuis: string; raison: string; textes: string[] }> = {
  'app/[locale]/games/petit-buveur/components/game.tsx': {
    depuis: '2026-09-25',
    raison:
      'plateau local du Petit Buveur, hors périmètre de ce chantier. « Résultat » et les deux issues du ' +
      'duel ont déjà leur clé (games.petit-buveur.game.duel.result, .winnerStays, .opponentWins — ces ' +
      'deux-là en t.rich, les noms sont des composants) ; « Actions de tour » et « case {n} » en demandent ' +
      'de nouvelles',
    textes: [
      'case',
      'Actions de tour',
      'Case',
      'gagne et reste ·',
      'recule d&apos;une case',
      'gagne ·',
      'recule d&apos;une case',
      'Résultat',
    ],
  },
}

type Finding = { line: number; text: string }

/** Fichiers relevés, en chemin relatif à src/ (séparateur « / »). */
function scannedFiles(): string[] {
  const files: string[] = []
  for (const entry of readdirSync(GAMES_DIR).sort()) {
    const dir = join(GAMES_DIR, entry)
    if (!statSync(dir).isDirectory()) continue
    const page = join(dir, 'page.tsx')
    if (existsSync(page)) files.push(page)
    const components = join(dir, 'components')
    if (existsSync(components) && statSync(components).isDirectory()) {
      for (const file of readdirSync(components).sort()) {
        if (file.endsWith('.tsx')) files.push(join(components, file))
      }
    }
  }
  for (const extra of EXTRA_FILES) files.push(join(SRC_DIR, extra))
  return files.map((file) => relative(SRC_DIR, file).replace(/\\/g, '/'))
}

function normalize(text: string): string {
  return text.replace(/\s+/g, ' ').trim()
}

function looksFrench(text: string): boolean {
  return FRENCH_LETTERS.test(text) || FRENCH_WORD.test(text)
}

/** Valeur littérale d'un attribut JSX, ou null si c'est une expression calculée. */
function literalAttributeValue(initializer: ts.JsxAttribute['initializer']): string | null {
  if (!initializer) return null
  if (ts.isStringLiteral(initializer)) return initializer.text
  if (!ts.isJsxExpression(initializer) || !initializer.expression) return null
  const expression = initializer.expression
  if (ts.isStringLiteral(expression) || ts.isNoSubstitutionTemplateLiteral(expression)) return expression.text
  // Gabarit : seules ses parties écrites comptent (`${n} joueurs` → « joueurs »).
  if (ts.isTemplateExpression(expression)) {
    return [expression.head.text, ...expression.templateSpans.map((span) => span.literal.text)].join(' ')
  }
  return null
}

/** Textes français en dur d'un source TSX. */
function findHardcodedFrench(source: string, fileName = 'fichier.tsx'): Finding[] {
  const sourceFile = ts.createSourceFile(fileName, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX)
  const findings: Finding[] = []
  const report = (node: ts.Node, raw: string) => {
    const text = normalize(raw)
    if (!text || !looksFrench(text)) return
    const { line } = sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile))
    findings.push({ line: line + 1, text })
  }
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) {
      report(node, node.text)
    } else if (ts.isJsxAttribute(node) && TEXT_ATTRIBUTES.has(node.name.getText(sourceFile))) {
      const value = literalAttributeValue(node.initializer)
      if (value !== null) report(node, value)
    }
    ts.forEachChild(node, visit)
  }
  visit(sourceFile)
  return findings
}

function findingsOf(relativePath: string): Finding[] {
  return findHardcodedFrench(readFileSync(join(SRC_DIR, relativePath), 'utf8'), relativePath)
}

const FILES = scannedFiles()

describe('détecteur de texte français en dur', () => {
  it('signale le texte entre balises et les attributs lus', () => {
    const source = [
      'export function Demo() {',
      '  return (',
      '    <div title="Paramètres">',
      '      <p>À qui ?</p>',
      '      <span>Tous les joueurs sont gagnants.</span>',
      '      <input placeholder="Ton pseudo online" />',
      '      <button aria-label={`${count} joueurs`}>ok</button>',
      '    </div>',
      '  )',
      '}',
    ].join('\n')
    expect(findHardcodedFrench(source).map((f) => f.text)).toEqual([
      'Paramètres',
      'À qui ?',
      'Tous les joueurs sont gagnants.',
      'Ton pseudo online',
      'joueurs',
    ])
  })

  it('laisse passer traductions, expressions, commentaires, emoji et code', () => {
    const source = [
      'export function Demo({ a, b }: { a: number; b: number }) {',
      '  // Les joueurs à la table : commentaire, pas du texte',
      '  const x = a > b && b < a',
      '  return (',
      '    <div title={t("title")} aria-label={label}>',
      '      {/* À qui la tournée ? */}',
      '      <p>{t("results.toWhom")}</p>',
      '      <span>🍺 → {player.name}</span>',
      '      <span>Score: {x ? 1 : 0}</span>',
      '      <input placeholder={t("placeholder")} value="joueurs" />',
      '    </div>',
      '  )',
      '}',
    ].join('\n')
    expect(findHardcodedFrench(source)).toEqual([])
  })
})

describe('écrans locaux sans texte français en dur', () => {
  it('relève bien les pages et composants des jeux, la gestion des joueurs et le compte', () => {
    expect(FILES.some((f) => /^app\/\[locale\]\/games\/[^/]+\/page\.tsx$/.test(f))).toBe(true)
    expect(FILES.some((f) => /^app\/\[locale\]\/games\/[^/]+\/components\/[^/]+\.tsx$/.test(f))).toBe(true)
    for (const extra of EXTRA_FILES) expect(FILES).toContain(extra)
  })

  for (const file of FILES) {
    const waiting = LISTE_D_ATTENTE[file]
    if (waiting) {
      // Dette figée : exactement les textes listés, ni un de plus, ni un de moins.
      it(`${file} — en attente depuis ${waiting.depuis}, liste figée`, () => {
        const found = findingsOf(file)
          .map((f) => f.text)
          .filter((text) => !(text in TEXTES_ADMIS))
          .sort()
        expect(
          found,
          'texte en dur ajouté (passer par next-intl) ou nettoyé (le retirer de LISTE_D_ATTENTE.textes)'
        ).toEqual([...waiting.textes].sort())
      })
      continue
    }
    it(`${file}`, () => {
      const offending = findingsOf(file)
        .filter((f) => !(f.text in TEXTES_ADMIS))
        .map((f) => `${file}:${f.line} « ${f.text} »`)
      expect(offending, 'texte en dur : passer par next-intl (ou TEXTES_ADMIS, avec sa raison)').toEqual([])
    })
  }

  it('la liste d’attente ne garde que des fichiers relevés qui en ont encore besoin', () => {
    const stale = Object.keys(LISTE_D_ATTENTE).filter(
      (file) => !FILES.includes(file) || findingsOf(file).length === 0
    )
    expect(stale, 'fichier nettoyé ou disparu : retirer son entrée de LISTE_D_ATTENTE').toEqual([])
  })

  it('chaque texte admis sert encore', () => {
    const seen = new Set(FILES.flatMap((file) => findingsOf(file).map((f) => f.text)))
    const unused = Object.keys(TEXTES_ADMIS).filter((text) => !seen.has(text))
    expect(unused, 'texte admis introuvable : retirer son entrée de TEXTES_ADMIS').toEqual([])
  })
})
