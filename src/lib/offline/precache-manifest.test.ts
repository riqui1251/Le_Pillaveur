import { describe, expect, it } from 'vitest'
import { assetUrl, buildPrecacheAssets, cssFilesToRead, mediaUrlsFromCss } from './precache-manifest'

const appBuildManifest = {
  pages: {
    '/layout': ['static/chunks/webpack-1.js', 'static/chunks/main-app-1.js'],
    '/[locale]/layout': ['static/chunks/webpack-1.js', 'static/css/layout.css', 'static/chunks/app/[locale]/layout-1.js'],
    '/[locale]/games/purple/page': ['static/chunks/app/[locale]/games/purple/page-1.js', 'static/chunks/shared-1.js'],
    '/[locale]/games/quiz/page': ['static/chunks/app/[locale]/games/quiz/page-1.js'],
  },
}
const buildManifest = {
  rootMainFiles: ['static/chunks/webpack-1.js', 'static/chunks/main-app-1.js'],
  polyfillFiles: ['static/chunks/polyfills-1.js'],
}
const reactLoadableManifest = {
  'app/[locale]/games/purple/page.tsx -> ./components/game': { files: ['static/chunks/7153.js'] },
  'app/[locale]/games/purple/page.tsx -> @/components/online/PurpleOnline': { files: ['static/chunks/1804.js'] },
}

describe('assetUrl', () => {
  it('préfixe /_next/ et encode les crochets des segments dynamiques comme Next le fait dans le HTML', () => {
    expect(assetUrl('static/chunks/app/[locale]/layout-1.js')).toBe('/_next/static/chunks/app/%5Blocale%5D/layout-1.js')
    expect(assetUrl('static/css/abc.css')).toBe('/_next/static/css/abc.css')
  })
})

describe('mediaUrlsFromCss', () => {
  it('relève les polices auto-hébergées, une fois chacune, avec ou sans guillemets', () => {
    const css =
      '@font-face{src:url(/_next/static/media/a-s.woff2) format("woff2")}' +
      '@font-face{src:url("/_next/static/media/b-s.p.woff2")}' +
      '.x{background:url(/_next/static/media/a-s.woff2)}.y{background:url(data:image/png;base64,AAA)}'
    expect(mediaUrlsFromCss(css)).toEqual(['/_next/static/media/a-s.woff2', '/_next/static/media/b-s.p.woff2'])
  })
})

describe('buildPrecacheAssets', () => {
  const input = {
    appBuildManifest,
    buildManifest,
    reactLoadableManifest,
    routeKeys: ['/layout', '/[locale]/layout', '/[locale]/games/purple/page', '/[locale]/games/purple/layout'],
    isLoadableKey: (key: string) => key.includes('./components/game'),
  }

  it('réunit socle, polyfills, segments demandés et morceaux à la demande retenus, sans doublon, triés', () => {
    const urls = buildPrecacheAssets(input)
    expect(urls).toEqual([
      '/_next/static/chunks/7153.js',
      '/_next/static/chunks/app/%5Blocale%5D/games/purple/page-1.js',
      '/_next/static/chunks/app/%5Blocale%5D/layout-1.js',
      '/_next/static/chunks/main-app-1.js',
      '/_next/static/chunks/polyfills-1.js',
      '/_next/static/chunks/shared-1.js',
      '/_next/static/chunks/webpack-1.js',
      '/_next/static/css/layout.css',
    ])
  })

  it('ignore les segments absents du manifeste et les morceaux en ligne', () => {
    const urls = buildPrecacheAssets(input)
    expect(urls).not.toContain('/_next/static/chunks/1804.js')
    expect(urls).not.toContain('/_next/static/chunks/app/%5Blocale%5D/games/quiz/page-1.js')
  })

  it('ajoute les polices des feuilles CSS fournies', () => {
    const urls = buildPrecacheAssets({
      ...input,
      cssSources: { 'static/css/layout.css': '@font-face{src:url(/_next/static/media/font-s.p.woff2)}' },
    })
    expect(urls).toContain('/_next/static/media/font-s.p.woff2')
  })

  it('écarte les source maps et les mises à jour à chaud', () => {
    const urls = buildPrecacheAssets({
      ...input,
      buildManifest: { rootMainFiles: ['static/chunks/main.js.map', 'static/chunks/x.hot-update.js', 'static/chunks/ok.js'] },
    })
    expect(urls).toContain('/_next/static/chunks/ok.js')
    expect(urls.some((u) => u.endsWith('.map') || u.includes('hot-update'))).toBe(false)
  })

  it('dit quelles feuilles CSS lire', () => {
    expect(cssFilesToRead(input)).toEqual(['static/css/layout.css'])
  })
})
