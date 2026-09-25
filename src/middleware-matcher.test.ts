import { describe, expect, it, vi } from 'vitest'

// next-intl/middleware importe `next/server` sans extension, ce que la
// résolution ESM de Node refuse sous vitest. Seul le `config` exporté
// intéresse ce test : le middleware lui-même n'est jamais appelé.
vi.mock('next-intl/middleware', () => ({ default: () => () => undefined }))

import { config } from '@/middleware'

// Le motif du matcher est une expression path-to-regexp réduite à un groupe :
// ancrée, elle se juge comme une expression régulière ordinaire. On vérifie
// ici ce qui passe par le middleware i18n — et donc peut être redirigé vers
// /fr/… — et ce qui doit lui échapper.
const matcher = new RegExp(`^${config.matcher[0]}$`)

describe('matcher du middleware', () => {
  it('laisse les fichiers lus tels quels par le navigateur hors de next-intl', () => {
    // manifest.json redirigé vers /fr/manifest.json (404) = plus aucune
    // proposition d'installation de l'application.
    for (const path of [
      '/manifest.json',
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
    for (const path of ['/', '/fr', '/fr/jeux', '/regles/loup-garou', '/en/games/tabou']) {
      expect(matcher.test(path), path).toBe(true)
    }
  })
})
