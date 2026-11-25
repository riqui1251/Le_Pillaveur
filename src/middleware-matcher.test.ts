import { describe, expect, it, vi } from 'vitest'

// next-intl/middleware importe `next/server` sans extension, ce que la
// résolution ESM de Node refuse sous vitest. La réponse i18n simulée est
// `undefined` : un chemin public la renvoie telle quelle, un chemin protégé
// sans cookie part en redirection vers /compte.
vi.mock('next-intl/middleware', () => ({ default: () => () => undefined }))

import { NextRequest } from 'next/server'
import { config, middleware } from '@/middleware'

// Le motif du matcher est une expression path-to-regexp réduite à un groupe :
// ancrée, elle se juge comme une expression régulière ordinaire. On vérifie
// ici ce qui passe par le middleware i18n — et donc peut être redirigé vers
// /fr/… — et ce qui doit lui échapper.
const matcher = new RegExp(`^${config.matcher[0]}$`)

describe('matcher du middleware', () => {
  it('laisse les fichiers lus tels quels par le navigateur hors de next-intl', () => {
    // manifest.json redirigé vers /fr/manifest.json (404) = plus aucune
    // proposition d'installation de l'application.
    // assetlinks.json redirigé = App Links jamais vérifiés : Android exige
    // un 200 direct, sans aucune redirection.
    // sw.js redirigé vers /fr/sw.js = le service worker (jeux locaux hors
    // ligne) ne s'installe jamais : un script de worker n'admet aucune redirection.
    for (const path of [
      '/.well-known/assetlinks.json',
      '/manifest.json',
      '/sw.js',
      '/app/le-pillaveur.apk',
      '/robots.txt',
      '/sitemap.xml',
      '/icons/icon-192.png',
      '/favicon.ico',
      '/api/health',
      '/_next/static/chunks/main.js',
    ]) {
      expect(matcher.test(path), path).toBe(false)
    }
  })

  it('fait passer les pages par le middleware (préfixe de langue, garde d’accès)', () => {
    // Le point de .well-known est littéral : une page dont le nom contient
    // « well-known » reste localisée.
    // Même chose pour sw.js : « /swxjs » et « /fr/sw.js » restent des pages.
    for (const path of ['/', '/fr', '/fr/jeux', '/regles/loup-garou', '/en/games/tabou', '/well-known', '/xwell-known/a', '/swxjs', '/fr/sw.js']) {
      expect(matcher.test(path), path).toBe(true)
    }
  })
})

describe('garde d’accès du middleware', () => {
  const visit = (path: string) => middleware(new NextRequest(`https://lepillaveur.fr${path}`))

  it('laisse lire les listes de questions sans session ni cookie mode local', () => {
    for (const path of ['/fr/idees', '/fr/idees/je-n-ai-jamais', '/en/idees/tu-preferes', '/it/idees/action-ou-verite']) {
      expect(visit(path), path).toBeUndefined()
    }
  })

  it('renvoie toujours une page protégée vers /compte', () => {
    const response = visit('/fr/stats')
    expect(response?.status).toBe(307)
    expect(response?.headers.get('location')).toContain('/fr/compte')
  })
})
