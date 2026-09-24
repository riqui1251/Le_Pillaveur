import { describe, expect, it } from 'vitest'
import { locales } from '@/i18n/routing'
import { OG_LOCALES, SITE_NAME, buildAlternates, buildOpenGraphLocale, pageOpenGraph, pageTwitter, siteOgImage } from './alternates'

/**
 * `buildAlternates` est LA convention canonical/hreflang du site : pages de
 * jeu, hub, vitrine, légal, application et sitemap en dépendent. Ces tests
 * figent ce qu'un moteur lira, pour qu'une retouche ne désaligne pas une
 * page du sitemap.
 */

describe('buildAlternates', () => {
  it('pose un canonical auto-référent et une entrée par langue', () => {
    const { canonical, languages } = buildAlternates('/jeux', 'en')
    expect(canonical).toBe('/en/jeux')
    expect(languages).toEqual({
      fr: '/fr/jeux',
      en: '/en/jeux',
      es: '/es/jeux',
      it: '/it/jeux',
      'x-default': '/fr/jeux',
    })
  })

  it('met x-default sur le français, quelle que soit la langue de la page', () => {
    for (const locale of locales) {
      expect(buildAlternates('/games/purple', locale).languages['x-default']).toBe('/fr/games/purple')
    }
  })

  it('accepte la racine (chemin vide) sans barre finale parasite', () => {
    expect(buildAlternates('', 'it')).toEqual({
      canonical: '/it',
      languages: { fr: '/fr', en: '/en', es: '/es', it: '/it', 'x-default': '/fr' },
    })
  })

  it('couvre exactement les langues du routage', () => {
    const { languages } = buildAlternates('/application', 'fr')
    expect(Object.keys(languages).sort()).toEqual([...locales, 'x-default'].sort())
  })
})

describe('buildOpenGraphLocale', () => {
  it('donne langue et territoire, et les trois autres langues en alternates', () => {
    expect(buildOpenGraphLocale('es')).toEqual({
      locale: 'es_ES',
      alternateLocale: ['fr_FR', 'en_GB', 'it_IT'],
    })
  })

  it('a une locale OG par langue du routage, toutes distinctes et de la forme xx_YY', () => {
    const values = locales.map((l) => OG_LOCALES[l])
    expect(new Set(values).size).toBe(locales.length)
    for (const value of values) expect(value).toMatch(/^[a-z]{2}_[A-Z]{2}$/)
  })

  it('retombe sur le français pour une langue inconnue', () => {
    expect(buildOpenGraphLocale('de').locale).toBe('fr_FR')
  })
})

describe('siteOgImage', () => {
  it('cible la carte de marque de /api/og dans la langue du lien', () => {
    expect(siteOgImage('it')).toBe('/api/og?type=site&locale=it')
  })
})

/**
 * Next REMPLACE l'openGraph du layout par celui de la page : tout ce que la
 * page ne repose pas disparaît du HTML (og:type, og:site_name, l'image).
 */
describe('pageOpenGraph', () => {
  const base = { title: 'Classement', description: 'Les meilleurs', url: '/es/classement' }

  it('repose type, nom du site et locale que le layout ne fournit plus', () => {
    const og = pageOpenGraph('es', base)
    expect(og.type).toBe('website')
    expect(og.siteName).toBe(SITE_NAME)
    expect(og.locale).toBe('es_ES')
    expect(og.alternateLocale).toEqual(['fr_FR', 'en_GB', 'it_IT'])
    expect(og).toMatchObject(base)
  })

  it("met la carte de marque dans la langue du lien quand la page n'a pas d'image", () => {
    expect(pageOpenGraph('es', base).images).toEqual([
      { url: siteOgImage('es'), width: 1200, height: 630, alt: 'Classement' },
    ])
  })

  it("garde l'image propre à la page quand elle en a une", () => {
    const images = [{ url: '/api/og?type=game&game=purple&locale=es', width: 1200, height: 630, alt: 'Purple' }]
    expect(pageOpenGraph('es', { ...base, images }).images).toBe(images)
  })
})

/**
 * Même remplacement pour `twitter` : sans ce bloc, la page hérite du titre et
 * de la description de l'accueil (layout de langue) sur les cartes X.
 */
describe('pageTwitter', () => {
  const base = { title: 'Jeux de soirée sans alcool', description: 'Les gorgées deviennent des gages' }

  it('pose une grande carte avec le titre et la description de la page', () => {
    expect(pageTwitter('it', base)).toEqual({
      card: 'summary_large_image',
      ...base,
      images: [siteOgImage('it')],
    })
  })

  it("garde l'image propre à la page quand elle en a une", () => {
    const images = ['/api/og?type=game&game=purple&locale=fr']
    expect(pageTwitter('fr', { ...base, images }).images).toBe(images)
  })
})
