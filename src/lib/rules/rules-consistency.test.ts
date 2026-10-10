import { existsSync, readFileSync, readdirSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { locales } from '@/i18n/routing'
import { getGameById } from '@/lib/games'
import { RULES_GAME_IDS } from './rules-content'

/**
 * Cohérence des articles de règles (docs/rules/<langue>/) avec le registre des
 * jeux, dans les quatre langues.
 *
 * Les articles sont écrits à la main ; le registre (src/lib/games.ts) est ce
 * que le lobby applique vraiment. Cinq d'entre eux annonçaient un effectif
 * périmé (« Purple, 2 à 10 joueurs » pour une table qui en accepte 16) :
 * personne ne relit dix-huit pages — soixante-douze avec les traductions — à
 * chaque réglage d'un moteur. Ce test tient donc l'intro de chaque article —
 * la phrase « X à Y joueurs », dans la forme de sa langue — égale aux bornes
 * EN LIGNE du registre, et pareil pour les descriptions SEO
 * (`rules.articles.<id>.description`) qui répètent l'effectif.
 *
 * Il garde aussi la forme éditoriale que les pages promettent : une FAQ de
 * quatre à six questions par article (ce que Google cite en « autres
 * questions »), une section « Variantes et effectifs » là où le nombre de
 * joueurs change vraiment le jeu, et un fichier par page — ni page sans
 * article, ni article orphelin (sauf celui d'un jeu masqué, retiré avec lui).
 * Le français fait référence : chaque traduction a les mêmes articles et le
 * même nombre de questions que lui.
 */

const RULES_ROOT = resolve(fileURLToPath(new URL('../../../docs/rules/', import.meta.url)))
const MESSAGES_DIR = resolve(fileURLToPath(new URL('../../../messages/', import.meta.url)))

/** Articles où l'effectif change la composition ou le rythme : la section est due. */
const VARIANTES_ATTENDUES = ['loup-garou', 'imposteur', 'mots-codes', 'tabou', 'president', 'sans-filtre'] as const

const FAQ_MIN = 4
const FAQ_MAX = 6

/** Les repères éditoriaux de chaque langue (titres de section, effectif). */
type LocaleConventions = {
  /** Début obligatoire du titre de l'article. */
  title: string
  faq: string
  variantes: string
  /** « X à Y joueurs » dans la langue, espace insécable admise. */
  players: RegExp
  /** Le même effectif, réécrit à partir des bornes du registre. */
  range: (min: number, max: number) => string
}

const CONVENTIONS: Record<string, LocaleConventions> = {
  fr: {
    title: '# Règles',
    faq: '## Questions fréquentes',
    variantes: '## Variantes et effectifs',
    players: /(\d+)[\s\u00a0]à[\s\u00a0](\d+)[\s\u00a0]joueurs/g,
    range: (min, max) => `${min} à ${max}`,
  },
  en: {
    title: '# Rules of',
    faq: '## Frequently asked questions',
    variantes: '## Variants and player counts',
    players: /(\d+)[\s\u00a0]to[\s\u00a0](\d+)[\s\u00a0]players/g,
    range: (min, max) => `${min} to ${max}`,
  },
  es: {
    title: '# Reglas de',
    faq: '## Preguntas frecuentes',
    variantes: '## Variantes y número de jugadores',
    players: /(\d+)[\s\u00a0]a[\s\u00a0](\d+)[\s\u00a0]jugadores/g,
    range: (min, max) => `${min} a ${max}`,
  },
  it: {
    title: '# Regole d',
    faq: '## Domande frequenti',
    variantes: '## Varianti e numero di giocatori',
    players: /(\d+)[\s\u00a0]a[\s\u00a0](\d+)[\s\u00a0]giocatori/g,
    range: (min, max) => `${min} a ${max}`,
  },
}

/**
 * Fins de ligne ramenées à LF : le dépôt normalise le texte (`* text=auto`),
 * et un checkout Windows (`core.autocrlf=true`) écrit les articles en CRLF —
 * `section()` ne trouverait plus son titre suivi d'un saut de ligne, et le
 * test bloquerait le déploiement pour une fin de ligne.
 */
function readDoc(locale: string, id: string): string {
  return readFileSync(join(RULES_ROOT, locale, `${id}.md`), 'utf8').replace(/\r\n?/g, '\n')
}

/** Le chapeau : tout ce qui précède la première section « ## ». */
function intro(markdown: string): string {
  const firstSection = markdown.search(/^## /m)
  return firstSection === -1 ? markdown : markdown.slice(0, firstSection)
}

/** Le corps d'une section « ## titre », jusqu'à la section suivante ou la fin. */
function section(markdown: string, heading: string): string | null {
  const start = markdown.indexOf(`${heading}\n`)
  if (start === -1) return null
  const body = markdown.slice(start + heading.length)
  const next = body.search(/^## /m)
  return next === -1 ? body : body.slice(0, next)
}

function ranges(locale: string, text: string): string[] {
  const { players, range } = CONVENTIONS[locale]
  return [...text.matchAll(players)].map((m) => range(Number(m[1]), Number(m[2])))
}

function faqQuestions(locale: string, markdown: string): string[] | null {
  const faq = section(markdown, CONVENTIONS[locale].faq)
  return faq === null ? null : (faq.match(/^### .+\?\s*$/gm) ?? [])
}

function docFiles(locale: string): string[] {
  const dir = join(RULES_ROOT, locale)
  if (!existsSync(dir)) return []
  return readdirSync(dir)
    .filter((name) => name.endsWith('.md'))
    .map((name) => name.slice(0, -'.md'.length))
    .sort()
}

type ArticleMeta = Record<string, { title?: string; description?: string }>
function articlesMeta(locale: string): ArticleMeta {
  const catalogue = JSON.parse(readFileSync(join(MESSAGES_DIR, `${locale}.json`), 'utf8'))
  return catalogue.rules?.articles ?? {}
}

it('chaque langue du site a ses conventions éditoriales', () => {
  expect(Object.keys(CONVENTIONS).sort()).toEqual([...locales].sort())
})

describe('pages de règles et fichiers docs/rules/<langue>', () => {
  for (const locale of locales) {
    it(`${locale} : chaque page de règles a son article`, () => {
      const manquants = RULES_GAME_IDS.filter((id) => !existsSync(join(RULES_ROOT, locale, `${id}.md`)))
      expect(manquants, `ids de RULES_GAME_IDS sans fichier docs/rules/${locale}/<id>.md`).toEqual([])
    })

    it(`${locale} : chaque article a sa page — sauf celui d’un jeu masqué, retiré du catalogue avec lui`, () => {
      const orphelins = docFiles(locale)
        .filter((id) => !(RULES_GAME_IDS as readonly string[]).includes(id))
        .filter((id) => !getGameById(id)?.hidden)
      expect(orphelins, 'articles sans page /regles/<id> alors que le jeu est visible').toEqual([])
    })
  }

  it('ne vise que des jeux du registre, visibles et jouables en ligne', () => {
    for (const id of RULES_GAME_IDS) {
      const game = getGameById(id)
      expect(game, `${id} absent du registre`).toBeDefined()
      expect(game?.hidden, `${id} est masqué du hub : sa page règles doit partir avec lui`).toBeFalsy()
      expect(game?.onlineReady, `${id} n'a pas de version en ligne`).toBe(true)
      expect(game?.minPlayers, `${id} sans minPlayers au registre`).toBeTypeOf('number')
      expect(game?.maxPlayers, `${id} sans maxPlayers au registre`).toBeTypeOf('number')
    }
  })
})

describe('effectif annoncé = bornes en ligne du registre', () => {
  for (const locale of locales) {
    describe(locale, () => {
      for (const id of docFiles(locale)) {
        it(`${id}.md`, () => {
          const game = getGameById(id)
          expect(game?.minPlayers && game?.maxPlayers, `${id} : bornes absentes du registre`).toBeTruthy()
          const attendu = CONVENTIONS[locale].range(game!.minPlayers!, game!.maxPlayers!)
          const trouves = ranges(locale, intro(readDoc(locale, id)))
          expect(trouves.length, `${locale}/${id}.md : aucun effectif « X–Y » dans le chapeau`).toBeGreaterThan(0)
          for (const range of trouves) {
            expect(range, `${locale}/${id}.md annonce « ${range} », le registre dit « ${attendu} »`).toBe(attendu)
          }
        })
      }

      it('les descriptions SEO (rules.articles) ne contredisent pas le registre', () => {
        const meta = articlesMeta(locale)
        const ecarts: string[] = []
        for (const id of RULES_GAME_IDS) {
          const game = getGameById(id)!
          const attendu = CONVENTIONS[locale].range(game.minPlayers!, game.maxPlayers!)
          for (const range of ranges(locale, meta[id]?.description ?? '')) {
            if (range !== attendu) ecarts.push(`${id} : « ${range} » (registre : « ${attendu} »)`)
          }
        }
        expect(ecarts).toEqual([])
      })
    })
  }
})

describe('forme éditoriale des articles', () => {
  for (const locale of locales) {
    describe(locale, () => {
      const { faq, variantes, title } = CONVENTIONS[locale]

      for (const id of docFiles(locale)) {
        it(`${id}.md : une FAQ de ${FAQ_MIN} à ${FAQ_MAX} questions`, () => {
          const questions = faqQuestions(locale, readDoc(locale, id))
          expect(questions, `${locale}/${id}.md : section « ${faq} » absente`).not.toBeNull()
          expect(
            questions!.length,
            `${locale}/${id}.md : ${questions!.length} question(s) en « ### … ? » dans la FAQ`
          ).toBeGreaterThanOrEqual(FAQ_MIN)
          expect(questions!.length, `${locale}/${id}.md : FAQ trop longue`).toBeLessThanOrEqual(FAQ_MAX)
        })
      }

      for (const id of VARIANTES_ATTENDUES) {
        it(`${id}.md : une section « ${variantes.slice(3)} »`, () => {
          expect(docFiles(locale), `${locale}/${id}.md introuvable`).toContain(id)
          const body = section(readDoc(locale, id), variantes)
          expect(body, `${locale}/${id}.md : section « ${variantes} » absente`).not.toBeNull()
          expect(body!.trim().length, `${locale}/${id}.md : section « ${variantes} » vide`).toBeGreaterThan(0)
        })
      }

      it(`chaque article commence par un titre « ${title.slice(2)} … »`, () => {
        for (const id of docFiles(locale)) {
          expect(readDoc(locale, id).startsWith(title), `${locale}/${id}.md : premier titre inattendu`).toBe(true)
        }
      })

      if (locale !== 'fr') {
        it('suit le français : mêmes sections « ## », même nombre de questions, mêmes liens internes', () => {
          const ecarts: string[] = []
          for (const id of docFiles(locale)) {
            const fr = readDoc('fr', id)
            const doc = readDoc(locale, id)
            const sections = (md: string) => (md.match(/^## /gm) ?? []).length
            if (sections(doc) !== sections(fr)) ecarts.push(`${id} : ${sections(doc)} sections, ${sections(fr)} en fr`)
            if (faqQuestions(locale, doc)?.length !== faqQuestions('fr', fr)?.length) ecarts.push(`${id} : FAQ`)
            const links = (md: string) => [...md.matchAll(/\]\((\/[^)\s]*)\)/g)].map((m) => m[1]).join(' ')
            if (links(doc) !== links(fr)) ecarts.push(`${id} : liens internes « ${links(doc)} » ≠ « ${links(fr)} »`)
          }
          expect(ecarts).toEqual([])
        })
      }
    })
  }
})
