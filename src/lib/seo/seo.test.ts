import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import robots from '@/app/robots'
import sitemap from '@/app/sitemap'
import { locales } from '@/i18n/routing'
import { GAMES } from '@/lib/games'
import { RULES_GAME_IDS } from '@/lib/rules/rules-content'
import { SITE_URL } from '@/lib/site'

/**
 * Invariants SEO qu'aucun rendu ne signale : un titre trop long est tronqué
 * dans Google sans erreur, un jeu masqué dans le sitemap y reste des mois,
 * un extrait de 190 caractères perd sa fin (l'effectif, la gratuité). Tout
 * ce qui est lu ici est ce que les pages lisent : le catalogue de messages
 * (games.meta.<id>, puis la metadata des autres pages : accueil, hub,
 * collections, règles, classement, application, pages légales), les articles
 * de règles (rules.articles.<id>),
 * le sitemap et robots.txt tels que Next les sert.
 *
 * Les longueurs comptent des points de code (« — », « œ » : un caractère),
 * ce que Google mesure en pixels — 60 et 160 sont les seuils usuels au-delà
 * desquels la troncature est quasi certaine.
 */

const ROOT = resolve(fileURLToPath(new URL('../../../', import.meta.url)))
const TITLE_MAX = 60
const DESCRIPTION_MAX = 160

type Meta = { title?: string; description?: string }
type Catalogue = { games?: { meta?: Record<string, Meta> }; rules?: { articles?: Record<string, Meta> } }

const CATALOGUES: Record<string, Catalogue> = Object.fromEntries(
  locales.map((locale) => [
    locale,
    JSON.parse(readFileSync(join(ROOT, 'messages', `${locale}.json`), 'utf8')),
  ])
)

const visible = GAMES.filter((game) => !game.hidden)
const length = (text: string) => [...text].length

/** Les dépassements d'une entrée titre/description, libellés pour le rapport d'échec. */
function tooLong(id: string, meta: Meta | undefined): string[] {
  if (!meta?.title || !meta.description) return []
  const out: string[] = []
  if (length(meta.title) > TITLE_MAX) out.push(`${id}.title (${length(meta.title)} > ${TITLE_MAX})`)
  if (length(meta.description) > DESCRIPTION_MAX) {
    out.push(`${id}.description (${length(meta.description)} > ${DESCRIPTION_MAX})`)
  }
  return out
}

describe('games.meta — titre et extrait des pages de jeu, par langue', () => {
  for (const locale of locales) {
    describe(locale, () => {
      const meta = CATALOGUES[locale].games?.meta ?? {}

      it('a un titre et une description pour chaque jeu visible', () => {
        const missing = visible.map((g) => g.id).filter((id) => !meta[id]?.title || !meta[id]?.description)
        expect(missing).toEqual([])
      })

      it(`tient dans ${TITLE_MAX} caractères de titre et ${DESCRIPTION_MAX} de description`, () => {
        expect(visible.flatMap((g) => tooLong(g.id, meta[g.id]))).toEqual([])
      })

      it("n'a aucun titre en double entre deux jeux", () => {
        const seen = new Map<string, string>()
        const duplicates: string[] = []
        for (const game of visible) {
          const title = meta[game.id]?.title
          if (!title) continue
          const other = seen.get(title)
          if (other) duplicates.push(`${game.id} = ${other} : « ${title} »`)
          seen.set(title, game.id)
        }
        expect(duplicates).toEqual([])
      })
    })
  }
})

describe('pages règles (rules.articles)', () => {
  it('ne documente que des jeux visibles du hub', () => {
    const visibleIds = new Set(visible.map((g) => g.id))
    expect(RULES_GAME_IDS.filter((id) => !visibleIds.has(id))).toEqual([])
  })

  for (const locale of locales) {
    it(`${locale} : une entrée par page, titre ≤ ${TITLE_MAX} et extrait ≤ ${DESCRIPTION_MAX}`, () => {
      const articles = CATALOGUES[locale].rules?.articles ?? {}
      const missing = RULES_GAME_IDS.filter((id) => !articles[id]?.title || !articles[id]?.description)
      expect(missing).toEqual([])
      expect(RULES_GAME_IDS.flatMap((id) => tooLong(id, articles[id]))).toEqual([])
    })
  }
})

/**
 * Les autres pages dont la metadata vient du catalogue : titre tel que Google
 * l'affiche — suffixé « — Le Pillaveur » par le gabarit du layout de langue,
 * sauf titre `absolute` — et extrait, dans les quatre langues.
 */
describe('metadata lue dans le catalogue — titres et extraits, par langue', () => {
  const COLLECTION_SLUGS = ['a-2-joueurs', 'sans-alcool', 'seul-avec-des-bots', 'en-grand-groupe']
  const LEGAL_PAGES = ['cgu', 'confidentialite', 'mentionsLegales']

  type Node = Record<string, unknown>
  const at = (catalogue: Catalogue, path: string): string => {
    const value = path.split('.').reduce<unknown>((node, part) => (node as Node | undefined)?.[part], catalogue)
    if (typeof value !== 'string') throw new Error(`clé absente : ${path}`)
    return value
  }

  for (const locale of locales) {
    it(locale, () => {
      const catalogue = CATALOGUES[locale]
      const suffix = ` — ${at(catalogue, 'metadata.title')}`
      /** [libellé, titre affiché, extrait] */
      const pages: Array<[string, string, string]> = [
        ['accueil', at(catalogue, 'metadata.titleFull'), at(catalogue, 'metadata.description')],
        ['accueil (compteur)', at(catalogue, 'metadata.titleFull'), at(catalogue, 'metadata.descriptionCount').replace('{count}', '22')],
        ['hub /jeux', at(catalogue, 'games.meta.hub.title'), at(catalogue, 'games.meta.hub.description')],
        ['/regles', at(catalogue, 'rules.meta.title') + suffix, at(catalogue, 'rules.meta.description')],
        ['/classement', at(catalogue, 'metadata.ranking.title') + suffix, at(catalogue, 'metadata.ranking.description')],
        ['/application', at(catalogue, 'metadata.mobileApp.title') + suffix, at(catalogue, 'metadata.mobileApp.description')],
        ...COLLECTION_SLUGS.map((slug): [string, string, string] => [
          `/jeux/${slug}`,
          at(catalogue, `collections.${slug}.title`) + suffix,
          at(catalogue, `collections.${slug}.description`),
        ]),
        ...LEGAL_PAGES.map((page): [string, string, string] => [
          `légal ${page}`,
          at(catalogue, `legal.pages.${page}`) + suffix,
          at(catalogue, `legal.meta.${page}.description`),
        ]),
      ]
      expect(pages.flatMap(([label, title, description]) => tooLong(label, { title, description }))).toEqual([])
    })
  }
})

describe('sitemap.xml', () => {
  const entries = sitemap()
  const urls = entries.map((entry) => entry.url)
  const languagesOf = (entry: (typeof entries)[number]) =>
    (entry.alternates?.languages ?? {}) as Record<string, string>

  it('ne liste aucun jeu masqué', () => {
    const hidden = GAMES.filter((g) => g.hidden)
    expect(hidden.length).toBeGreaterThan(0)
    const leaked = urls.filter((url) => hidden.some((g) => url.endsWith(`/games/${g.id}`)))
    expect(leaked).toEqual([])
  })

  it('liste chaque jeu visible et chaque page règles', () => {
    for (const game of visible) expect(urls).toContain(`${SITE_URL}/fr/games/${game.id}`)
    for (const id of RULES_GAME_IDS) expect(urls).toContain(`${SITE_URL}/fr/regles/${id}`)
  })

  it("liste l'index des règles et chaque article avec leurs quatre langues", () => {
    const index = entries.find((entry) => entry.url === `${SITE_URL}/fr/regles`)
    expect(index).toBeDefined()
    expect(index?.priority).toBe(0.7)
    for (const path of ['/regles', ...RULES_GAME_IDS.map((id) => `/regles/${id}`)]) {
      const entry = entries.find((e) => e.url === `${SITE_URL}/fr${path}`)
      expect(entry, path).toBeDefined()
      expect(languagesOf(entry!), path).toEqual({
        fr: `${SITE_URL}/fr${path}`,
        en: `${SITE_URL}/en${path}`,
        es: `${SITE_URL}/es${path}`,
        it: `${SITE_URL}/it${path}`,
        'x-default': `${SITE_URL}/fr${path}`,
      })
    }
  })

  it('liste les quatre collections du hub, mêmes slugs dans les quatre langues', () => {
    for (const slug of ['a-2-joueurs', 'sans-alcool', 'seul-avec-des-bots', 'en-grand-groupe']) {
      const entry = entries.find((e) => e.url === `${SITE_URL}/fr/jeux/${slug}`)
      expect(entry, slug).toBeDefined()
      expect(languagesOf(entry!)).toEqual({
        fr: `${SITE_URL}/fr/jeux/${slug}`,
        en: `${SITE_URL}/en/jeux/${slug}`,
        es: `${SITE_URL}/es/jeux/${slug}`,
        it: `${SITE_URL}/it/jeux/${slug}`,
        'x-default': `${SITE_URL}/fr/jeux/${slug}`,
      })
    }
  })

  it('garde /application (page de téléchargement de la coquille mobile)', () => {
    expect(urls).toContain(`${SITE_URL}/fr/application`)
  })

  it('a des URL uniques, canoniques (/fr), et des alternates absolus sur les quatre langues', () => {
    expect(new Set(urls).size).toBe(urls.length)
    for (const entry of entries) {
      expect(entry.url.startsWith(`${SITE_URL}/fr`), entry.url).toBe(true)
      if (!entry.alternates) continue
      const languages = languagesOf(entry)
      expect(Object.keys(languages).sort(), entry.url).toEqual([...locales, 'x-default'].sort())
      for (const href of Object.values(languages)) {
        expect(href.startsWith(`${SITE_URL}/`), href).toBe(true)
      }
    }
  })
})

describe('robots.txt', () => {
  it("laisse passer les cartes de partage (/api/og) malgré le Disallow de l'API", () => {
    const { rules } = robots()
    const rule = Array.isArray(rules) ? rules[0] : rules
    const allow = [rule.allow].flat()
    const disallow = [rule.disallow].flat()
    expect(allow).toContain('/')
    expect(allow).toContain('/api/og')
    expect(disallow).toContain('/api/')
  })
})

describe('layout de langue — JSON-LD Organization', () => {
  it("déclare le logo de l'éditeur, et le fichier est bien servi", () => {
    const source = readFileSync(join(ROOT, 'src', 'app', '[locale]', 'layout.tsx'), 'utf8')
    const match = source.match(/logo:\s*`\$\{SITE_URL\}(\/icons\/[\w.-]+)`/)
    expect(match, 'logo absent du bloc publisher').not.toBeNull()
    expect(match?.[1]).toBe('/icons/icon-512x512.png')
    expect(existsSync(join(ROOT, 'public', match![1]))).toBe(true)
  })
})
