import { GAMES, type GameMeta } from '@/lib/games'
import { locales, type AppLocale } from '@/i18n/routing'

/**
 * Hors ligne — ce que le service worker (src/app/sw.js/route.ts) doit savoir
 * du catalogue, en fonctions PURES testables sans navigateur.
 *
 * Pourquoi : les jeux « un seul téléphone qui tourne autour de la table » ne
 * parlent jamais au serveur pendant la partie (moteur dans src/lib/<jeu>/,
 * joueurs en localStorage). Seule la PAGE vient du réseau : mise en cache,
 * elle se rejoue sans réseau — dans l'app Android (coquille Capacitor qui
 * charge lepillaveur.fr) comme en PWA. Les jeux « en ligne uniquement »
 * n'ont rien à faire ici : sans serveur, pas de table.
 */

/** Hub des jeux : la page d'entrée de l'app, celle que l'icône ouvre. */
export const HUB_PATH = '/jeux'
/** Gestion des joueurs locaux : protégée (mode choisi), mise en cache à la VISITE, jamais préchargée. */
export const PLAYERS_PATH = '/joueurs'
/** Page de repli quand une page non mise en cache est demandée sans réseau. */
export const OFFLINE_PAGE_PATH = '/hors-ligne'

/**
 * Jeu jouable sans réseau : publié (pas `hidden`) et jouable en local (pas
 * `onlineOnly`). Un jeu masqué reste routable, mais le hub ne le propose pas :
 * on ne précharge pas ce qu'on ne montre pas.
 */
export function isOfflinePlayableGame(game: Pick<GameMeta, 'hidden' | 'onlineOnly'>): boolean {
  return !game.hidden && !game.onlineOnly
}

export function offlinePlayableGames(games: readonly GameMeta[] = GAMES): GameMeta[] {
  return games.filter(isOfflinePlayableGame)
}

/**
 * Chemins SANS langue que le worker garde en cache quand il les voit passer
 * (navigation réussie) : hub, joueurs, page de repli et pages des jeux locaux.
 */
export function offlineCacheablePaths(games: readonly GameMeta[] = GAMES): string[] {
  return [HUB_PATH, PLAYERS_PATH, OFFLINE_PAGE_PATH, ...offlinePlayableGames(games).map((g) => g.path)]
}

/**
 * Pages PRÉCHARGÉES à l'installation du worker, pour UNE langue (celle de la
 * page qui l'enregistre) : tout ce qui est public et rendu au build. La page
 * des joueurs n'en est pas : protégée par le middleware, un visiteur sans
 * mode choisi en recevrait la page compte — et dans la coquille, le proxy de
 * Capacitor suit les redirections sans le dire. Elle entre dans le cache
 * quand le joueur l'ouvre vraiment (voir le marqueur dans sw-script.ts).
 */
export function offlinePrecachePages(locale: AppLocale, games: readonly GameMeta[] = GAMES): string[] {
  return [HUB_PATH, OFFLINE_PAGE_PATH, ...offlinePlayableGames(games).map((g) => g.path)].map(
    (path) => `/${locale}${path}`
  )
}

/**
 * Clés de `app-build-manifest.json` (segments de l'App Router) dont les
 * fichiers JS/CSS sont nécessaires aux pages ci-dessus : le layout racine,
 * le layout de langue, les trois pages communes, le layout et le squelette
 * des jeux, puis le layout SEO et la page de chaque jeu local. Une clé
 * absente du manifeste (pas de loading.tsx, par exemple) est ignorée.
 */
export function offlineRouteManifestKeys(games: readonly GameMeta[] = GAMES): string[] {
  const keys = [
    '/layout',
    // Frontière d'erreur racine et page d'entrée de la langue : le HTML
    // pré-rendu de CHAQUE page les référence (charge Flight), hors ligne ils
    // doivent donc être là aussi.
    '/global-error',
    '/[locale]/page',
    '/[locale]/layout',
    '/[locale]/error',
    `/[locale]${HUB_PATH}/page`,
    `/[locale]${PLAYERS_PATH}/page`,
    `/[locale]${OFFLINE_PAGE_PATH}/page`,
    '/[locale]/games/layout',
    '/[locale]/games/loading',
  ]
  for (const game of offlinePlayableGames(games)) {
    keys.push(`/[locale]${game.path}/layout`, `/[locale]${game.path}/page`)
  }
  return keys
}

/**
 * Entrées de `react-loadable-manifest.json` (morceaux chargés à la demande
 * par next/dynamic) à précharger : celles dont l'IMPORTEUR appartient au
 * flux local — page ou composants d'un jeu local, gestion des joueurs, hub —
 * et dont la cible n'est pas un composant en ligne (lobby, vocal, TV…). Le
 * jeu local de Purple, par exemple, est `page.tsx -> ./components/game` ;
 * son jumeau `page.tsx -> @/components/online/PurpleOnline` ne sert qu'avec
 * une table en ligne.
 *
 * Clé du manifeste : `<fichier importeur relatif au projet> -> <spécificateur>`.
 * Les séparateurs Windows sont ramenés à « / » : le build de production se
 * fait sous Linux (Docker), celui d'un poste de dev sous Windows.
 */
export function isOfflineLoadableKey(key: string, games: readonly GameMeta[] = GAMES): boolean {
  const normalized = key.split('\\').join('/')
  const arrow = normalized.indexOf(' -> ')
  if (arrow === -1) return false
  const importer = normalized.slice(0, arrow)
  const specifier = normalized.slice(arrow + 4)
  if (/\/components\/(online|voice|tv|supervision|chat|friends)\//.test(specifier)) return false
  const importers = [
    `app/[locale]${HUB_PATH}/`,
    `app/[locale]${PLAYERS_PATH}/`,
    `app/[locale]${OFFLINE_PAGE_PATH}/`,
    'components/PlayerManager',
    'components/hub/',
    'components/game/',
    'components/games/',
    'components/petit-buveur/',
    // Confettis de fin de partie (canvas-confetti, chargé à la demande) :
    // Monsieur 3, le Petit Buveur et les écrans de fin locaux les tirent.
    'components/online/EndConfetti',
    // Les panneaux de la barre de navigation (retour, amis, chat) sont
    // chargés à la demande sur TOUTES les pages : sans leur morceau, un tap
    // sur « Donner mon avis » hors ligne ferait tomber la page en erreur.
    'components/layout/Navbar',
    ...offlinePlayableGames(games).flatMap((g) => [`app/[locale]${g.path}/`, `lib/${g.id}/`]),
  ]
  return importers.some((prefix) => importer.includes(prefix))
}

/** Langue en tête d'un chemin (`/fr/jeux` → 'fr'), ou null s'il n'en a pas. */
export function localeOfPath(pathname: string): AppLocale | null {
  const first = pathname.split('/')[1] ?? ''
  return (locales as readonly string[]).includes(first) ? (first as AppLocale) : null
}
