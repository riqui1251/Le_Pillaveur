import { readFile } from 'node:fs/promises'
import path from 'node:path'
import { NextResponse } from 'next/server'
import { routing } from '@/i18n/routing'
import { normalizeAppLocale } from '@/lib/locale-utils'
import {
  HUB_PATH,
  OFFLINE_PAGE_PATH,
  PLAYERS_PATH,
  isOfflineLoadableKey,
  offlineCacheablePaths,
  offlinePrecachePages,
  offlineRouteManifestKeys,
} from '@/lib/offline/offline-routes'
import { offlineStrings } from '@/lib/offline/offline-strings'
import {
  buildPrecacheAssets,
  cssFilesToRead,
  type AppBuildManifest,
  type BuildManifest,
  type ReactLoadableManifest,
} from '@/lib/offline/precache-manifest'
import { buildRetiringServiceWorkerScript, buildServiceWorkerScript } from '@/lib/offline/sw-script'

/**
 * GET /sw.js?l=<langue> — le service worker du site, GÉNÉRÉ par build.
 *
 * Pourquoi une route et pas un fichier dans public/ : la liste des fichiers à
 * précharger (chunks à empreinte) n'existe qu'après `next build`, dans les
 * manifestes de `.next/` — que l'image standalone embarque (ils font partie
 * des « required server files »). Le script est calculé UNE fois par
 * processus et par langue, puis servi tel quel.
 *
 * Hors middleware (matcher de src/middleware.ts) : next-intl le redirigerait
 * vers /fr/sw.js. `Cache-Control: no-cache` : le navigateur revalide le
 * script à chaque vérification (c'est ce qui fait découvrir une nouvelle
 * version), et Cloudflare — qui met les .js en cache par extension — ne le
 * garde pas en bordure.
 *
 * Le worker est propre à une LANGUE (celle de la page qui l'enregistre, voir
 * src/components/pwa/ServiceWorkerRegistration.tsx) : il précharge les pages
 * de cette langue seulement — dix pages, pas quarante. Changer de langue
 * enregistre l'URL de l'autre langue, qui remplace la précédente.
 *
 * Marqueur de la page des joueurs : <meta name="lp-page" content="joueurs">,
 * posé par src/app/[locale]/joueurs/layout.tsx (metadata.other). Le worker
 * ne mémorise cette page protégée que s'il le trouve dans le HTML — sinon
 * c'est la page compte, rendue à sa place par le middleware.
 */

export const dynamic = 'force-dynamic'

/** Délai accordé au réseau avant de servir la page en cache (navigation vers une page connue). */
const NAV_TIMEOUT_MS = 6000

const PAGE_MARKERS: Readonly<Record<string, string>> = {
  [PLAYERS_PATH]: '<meta name="lp-page" content="joueurs"',
}

const PUBLIC_ASSETS = ['/manifest.json', '/icons/icon-192x192.png', '/icons/icon-512x512.png']

const nextDir = () => path.join(process.cwd(), '.next')

async function readJson<T>(relativePath: string): Promise<T> {
  return JSON.parse(await readFile(path.join(nextDir(), relativePath), 'utf8')) as T
}

async function readCss(files: readonly string[]): Promise<Record<string, string>> {
  const sources: Record<string, string> = {}
  await Promise.all(
    files.map(async (file) => {
      try {
        sources[file] = await readFile(path.join(nextDir(), file), 'utf8')
      } catch {
        // Feuille introuvable (déplacée par un hébergement exotique) : ses polices
        // ne seront pas préchargées, le reste du hors-ligne tient.
      }
    })
  )
  return sources
}

type Generated = { script: string; retiring: boolean }

async function generate(locale: string): Promise<Generated> {
  if (process.env.NODE_ENV !== 'production') {
    return { script: buildRetiringServiceWorkerScript('mode developpement : pas de manifeste de build'), retiring: true }
  }
  try {
    const [buildId, appBuildManifest, buildManifest, reactLoadableManifest] = await Promise.all([
      readFile(path.join(nextDir(), 'BUILD_ID'), 'utf8'),
      readJson<AppBuildManifest>('app-build-manifest.json'),
      readJson<BuildManifest>('build-manifest.json'),
      readJson<ReactLoadableManifest>('react-loadable-manifest.json'),
    ])
    const input = {
      appBuildManifest,
      buildManifest,
      reactLoadableManifest,
      routeKeys: offlineRouteManifestKeys(),
      isLoadableKey: isOfflineLoadableKey,
    }
    const cssSources = await readCss(cssFilesToRead(input))
    const assets = [...buildPrecacheAssets({ ...input, cssSources }), ...PUBLIC_ASSETS]
    const script = buildServiceWorkerScript({
      version: buildId.trim(),
      locale,
      locales: routing.locales,
      assets,
      pages: offlinePrecachePages(locale as (typeof routing.locales)[number]),
      cacheablePaths: offlineCacheablePaths(),
      hubPath: HUB_PATH,
      offlinePath: OFFLINE_PAGE_PATH,
      playersPath: PLAYERS_PATH,
      pageMarkers: PAGE_MARKERS,
      navTimeoutMs: NAV_TIMEOUT_MS,
      strings: offlineStrings(locale),
    })
    return { script, retiring: false }
  } catch (error) {
    // Manifestes absents (déploiement inhabituel) : plutôt qu'un worker qui
    // précache dans le vide, un worker qui se retire — le site marche comme avant.
    console.error('[sw] manifestes de build illisibles, service worker neutralise', error instanceof Error ? error.name : typeof error)
    return { script: buildRetiringServiceWorkerScript('manifestes de build illisibles'), retiring: true }
  }
}

/** Scripts COMPLETS, par langue : un worker neutralisé n'est jamais mémorisé — une lecture de manifeste ratée au démarrage ne doit pas vider les caches de tous les joueurs jusqu'au redémarrage. */
const scripts = new Map<string, Promise<Generated>>()

export async function GET(request: Request) {
  const locale = normalizeAppLocale(new URL(request.url).searchParams.get('l'))
  let pending = scripts.get(locale)
  if (!pending) {
    pending = generate(locale)
    scripts.set(locale, pending)
    pending.then(
      (result) => {
        if (result.retiring) scripts.delete(locale)
      },
      () => scripts.delete(locale)
    )
  }
  const { script } = await pending
  return new NextResponse(script, {
    headers: {
      'Content-Type': 'text/javascript; charset=utf-8',
      'Cache-Control': 'no-cache, max-age=0, must-revalidate',
    },
  })
}
