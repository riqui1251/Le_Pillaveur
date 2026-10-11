/**
 * Liste des fichiers statiques à précharger par le service worker, calculée
 * à partir des manifestes que `next build` laisse dans `.next/` — en
 * fonctions PURES, pour être testées sur des manifestes de fixture.
 *
 * - `app-build-manifest.json` : par segment de l'App Router (`/[locale]/games/purple/page`),
 *   les chunks JS et feuilles CSS de son premier rendu ;
 * - `build-manifest.json` : les fichiers communs à toute l'app (`rootMainFiles`)
 *   et les polyfills (`polyfillFiles`) ;
 * - `react-loadable-manifest.json` : les morceaux chargés à la demande
 *   (next/dynamic, import()) — c'est là que vivent les composants de jeu,
 *   que la page ne rend qu'au clic sur « Commencer » : sans eux, la page
 *   s'ouvre hors ligne mais le jeu ne démarre jamais ;
 * - les feuilles CSS : les polices auto-hébergées de next/font y sont
 *   référencées par `url(/_next/static/media/…)` — le manifeste des polices
 *   de Next est vide pour l'App Router dans cette version, on lit donc le CSS.
 */

export type AppBuildManifest = { pages: Record<string, readonly string[]> }
export type BuildManifest = { rootMainFiles?: readonly string[]; polyfillFiles?: readonly string[] }
export type ReactLoadableManifest = Record<string, { files: readonly string[] }>

export type PrecacheInput = {
  appBuildManifest: AppBuildManifest
  buildManifest: BuildManifest
  reactLoadableManifest: ReactLoadableManifest
  /** Segments de l'App Router dont les fichiers sont nécessaires (voir offlineRouteManifestKeys). */
  routeKeys: readonly string[]
  /** Entrées de react-loadable à retenir (voir isOfflineLoadableKey). */
  isLoadableKey: (key: string) => boolean
  /**
   * Contenu des feuilles CSS retenues, par chemin de manifeste
   * (`static/css/abc.css`) — pour en extraire les polices. Une feuille
   * absente de la table est simplement lue sans ses polices.
   */
  cssSources?: Readonly<Record<string, string>>
}

/**
 * Chemin de manifeste (`static/chunks/app/[locale]/layout-abc.js`) → URL
 * telle que le navigateur la demande : préfixe `/_next/` et crochets
 * encodés — Next écrit `%5Blocale%5D` dans le HTML, et le cache du worker
 * compare des URL exactes.
 */
export function assetUrl(file: string): string {
  return '/_next/' + file.split('/').map((segment) => encodeURIComponent(segment)).join('/')
}

/** URL des polices (et autres médias) qu'une feuille CSS référence sous /_next/static/media/. */
export function mediaUrlsFromCss(css: string): string[] {
  const urls = new Set<string>()
  const pattern = /url\((['"]?)(\/_next\/static\/media\/[^'")]+)\1\)/g
  let match: RegExpExecArray | null
  while ((match = pattern.exec(css)) !== null) {
    urls.add(match[2])
  }
  return [...urls]
}

/** Fichiers de build à retenir : JS et CSS seulement, jamais les source maps ni les mises à jour à chaud. */
function isBuildFile(file: string): boolean {
  return (file.endsWith('.js') || file.endsWith('.css')) && !file.includes('.hot-update.')
}

/**
 * Toutes les URL statiques à précharger, dédoublonnées et triées (une liste
 * stable évite de réécrire le script du worker — donc de le réinstaller —
 * sans raison). Ne contient que des chemins sous /_next/ ; les fichiers de
 * public/ (icônes, manifeste PWA) sont ajoutés par l'appelant.
 */
export function buildPrecacheAssets(input: PrecacheInput): string[] {
  const files = new Set<string>()
  const add = (list: readonly string[] | undefined) => {
    for (const file of list ?? []) {
      if (isBuildFile(file)) files.add(file)
    }
  }

  add(input.buildManifest.rootMainFiles)
  add(input.buildManifest.polyfillFiles)
  for (const key of input.routeKeys) add(input.appBuildManifest.pages[key])
  for (const [key, entry] of Object.entries(input.reactLoadableManifest)) {
    if (input.isLoadableKey(key)) add(entry.files)
  }

  const urls = new Set<string>([...files].map(assetUrl))
  for (const file of files) {
    if (!file.endsWith('.css')) continue
    const css = input.cssSources?.[file]
    if (!css) continue
    for (const url of mediaUrlsFromCss(css)) urls.add(url)
  }
  return [...urls].sort()
}

/** Les feuilles CSS (chemins de manifeste) que `buildPrecacheAssets` retiendra — pour savoir lesquelles lire. */
export function cssFilesToRead(input: Omit<PrecacheInput, 'cssSources'>): string[] {
  return buildPrecacheAssets({ ...input, cssSources: {} })
    .filter((url) => url.endsWith('.css'))
    .map((url) => decodeURIComponent(url.slice('/_next/'.length)))
}
