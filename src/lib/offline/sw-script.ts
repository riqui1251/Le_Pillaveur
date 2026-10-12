/**
 * Le script du service worker, construit comme une CHAÎNE par la route
 * /sw.js (src/app/sw.js/route.ts) à partir des manifestes du build.
 *
 * Pourquoi une chaîne et pas un fichier public/sw.js : la liste des fichiers
 * à précharger (chunks JS/CSS à empreinte) n'existe qu'après `next build`, et
 * la version du worker DOIT changer à chaque déploiement — un worker dont le
 * texte ne change pas n'est jamais réinstallé par le navigateur.
 *
 * Le JS ci-dessous n'est PAS transpilé par Next : syntaxe ES2017 (async/await,
 * pas de `?.`, `??`, champs de classe), pour les WebView Android anciennes
 * (cf. le mode TV « n'affiche rien » sur les vieux navigateurs, 2026-10).
 *
 * Stratégies :
 * - /_next/static/*, /icons/*, /manifest.json : cache d'abord (empreinte
 *   dans le nom : un fichier ne change jamais de contenu) ;
 * - navigation (document) vers une page MISE EN CACHE : réseau d'abord, borné
 *   à NAV_TIMEOUT_MS, puis le cache — sans réseau (navigator.onLine faux) le
 *   cache tout de suite ; une 502/503/504 ou 52x hors défi Cloudflare (le
 *   site redéploie, Caddy ou Cloudflare ne joint pas l'origine) rend aussi
 *   la page en cache : on finit sa partie pendant une migration ;
 * - navigation vers une autre page : réseau, et en panne une redirection
 *   vers /{langue}/hors-ligne (ou vers le hub pour la racine) ;
 * - navigation CLIENT de Next (en-tête RSC) vers une page en cache : réseau
 *   borné, et en échec une erreur réseau franche — Next retombe alors sur un
 *   chargement complet de la page, que le worker sert depuis son cache ;
 * - /api/*, requêtes non GET, autres origines, chemins /_capacitor_* : jamais
 *   touchés (le worker ne répond pas, le navigateur fait comme sans lui).
 *
 * Coquille Android : le serveur local de Capacitor n'injecte le pont natif
 * (window.Capacitor) que dans les réponses HTML qu'il proxifie lui-même. Les
 * requêtes du worker y passent par un ServiceWorkerClient posé dans
 * MainActivity ; les pages sont demandées avec `Accept: text/html`, sans quoi
 * ce proxy ne les reconnaît pas et le HTML arrive sans pont.
 */

export type ServiceWorkerConfig = {
  /** Version du build (BUILD_ID de Next) : nomme les caches, change à chaque déploiement. */
  version: string
  /** Langue de la page qui a enregistré le worker : celle des pages préchargées. */
  locale: string
  /** Toutes les langues du site, pour reconnaître un préfixe de chemin. */
  locales: readonly string[]
  /** Fichiers statiques à précharger (chemins absolus, « /_next/static/… », « /icons/… »). */
  assets: readonly string[]
  /** Pages HTML à précharger (chemins absolus avec langue, « /fr/jeux »). */
  pages: readonly string[]
  /** Chemins SANS langue dont les pages peuvent être mises en cache à la navigation. */
  cacheablePaths: readonly string[]
  hubPath: string
  offlinePath: string
  /**
   * Page des joueurs (protégée) : tentée au préchargement SANS faire échouer
   * l'installation — un visiteur sans mode choisi en recevrait la page compte,
   * que le marqueur (`pageMarkers`) écarte. Sans elle, un premier soir hors
   * ligne tournait en rond : jeu → « il manque des joueurs » → /joueurs →
   * page hors ligne → « Gérer les joueurs » → page hors ligne.
   */
  playersPath: string
  /**
   * Marqueurs à exiger dans le HTML avant de mettre une page en cache, par
   * chemin sans langue : une page protégée qui redirige vers le compte ne
   * doit pas être mémorisée sous son propre chemin. Dans la coquille, le
   * proxy de Capacitor suit les redirections sans que `response.redirected`
   * le dise ; seul le contenu fait foi.
   */
  pageMarkers: Readonly<Record<string, string>>
  /** Délai accordé au réseau quand la page est en cache (ms). */
  navTimeoutMs: number
  /** Textes de la page de secours minimale, dans la langue du worker. */
  strings: { title: string; lead: string; retry: string }
}

function js(value: unknown): string {
  // JSON est du JS valide pour chaînes, tableaux et objets ; les séquences
  // </script> ne concernent pas un fichier JS servi seul.
  return JSON.stringify(value)
}

/** Échappe un texte pour l'inclure dans du HTML (page de secours minimale). */
function html(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

export function buildServiceWorkerScript(config: ServiceWorkerConfig): string {
  const fallbackHtml =
    `<!doctype html><html lang="${html(config.locale)}"><head><meta charset="utf-8">` +
    `<meta name="viewport" content="width=device-width, initial-scale=1"><meta name="color-scheme" content="dark">` +
    `<title>${html(config.strings.title)}</title>` +
    `<style>html{height:100%;background:#0a2c22}body{margin:0;min-height:100%;display:flex;align-items:center;justify-content:center;` +
    `text-align:center;background:radial-gradient(120% 80% at 50% 0%,#0e3b2e,#0a2c22 70%);color:#f3ead3;` +
    `font-family:system-ui,-apple-system,'Segoe UI',Roboto,sans-serif}main{max-width:22rem;padding:32px 24px}` +
    `h1{font-family:Georgia,'Times New Roman',serif;font-size:1.6rem;margin:0 0 .5rem}p{margin:0 0 1.5rem;opacity:.8}` +
    `button{font:inherit;font-weight:700;padding:12px 24px;border-radius:999px;border:0;background:#d9a441;color:#1b1407}</style></head>` +
    `<body><main><h1>${html(config.strings.title)}</h1><p>${html(config.strings.lead)}</p>` +
    `<button type="button" onclick="location.reload()">${html(config.strings.retry)}</button></main></body></html>`

  return `/* Le Pillaveur — service worker ${config.version} (${config.locale}). Généré par /sw.js : src/lib/offline/sw-script.ts. */
'use strict';
var VERSION = ${js(config.version)};
var LOCALE = ${js(config.locale)};
var LOCALES = ${js(config.locales)};
var ASSETS = ${js(config.assets)};
var PAGES = ${js(config.pages)};
var CACHEABLE = ${js(config.cacheablePaths)};
var HUB_PATH = ${js(config.hubPath)};
var OFFLINE_PATH = ${js(config.offlinePath)};
var PLAYERS_PATH = ${js(config.playersPath)};
var PAGE_MARKERS = ${js(config.pageMarkers)};
var NAV_TIMEOUT_MS = ${js(config.navTimeoutMs)};
var FALLBACK_HTML = ${js(fallbackHtml)};

var STATIC_CACHE = 'lp-static-' + VERSION;
var PAGES_CACHE = 'lp-pages-' + VERSION;
/* Non versionné : la dernière langue vue, pour ramener la racine au bon hub sans réseau. */
var META_CACHE = 'lp-meta';
var LAST_LOCALE_KEY = '/__lp/derniere-langue';

function sameOriginUrl(path) {
  return new URL(path, self.location.origin).href;
}

/* '/fr/games/purple/' -> { locale: 'fr', rest: '/games/purple' } ; sans langue en tete -> null. */
function splitLocale(pathname) {
  var parts = pathname.split('/');
  var locale = parts[1] || '';
  if (LOCALES.indexOf(locale) === -1) return null;
  var rest = '/' + parts.slice(2).join('/');
  if (rest.length > 1 && rest.charAt(rest.length - 1) === '/') rest = rest.slice(0, -1);
  return { locale: locale, rest: rest };
}

/* La page mise en cache que ce chemin designe, ou null. */
function cacheablePage(pathname) {
  var split = splitLocale(pathname);
  if (!split || CACHEABLE.indexOf(split.rest) === -1) return null;
  return { locale: split.locale, rest: split.rest, key: '/' + split.locale + split.rest };
}

function isServerDown(response) {
  var s = response.status;
  var gateway = s === 502 || s === 503 || s === 504 || (s >= 520 && s <= 530);
  return gateway && !response.headers.has('cf-mitigated');
}

function isStorableResponse(response) {
  return response.ok && !response.redirected && (response.type === 'basic' || response.type === 'default');
}

function withTimeout(promise, ms) {
  return new Promise(function (resolve, reject) {
    var timer = setTimeout(function () { reject(new Error('timeout')); }, ms);
    promise.then(
      function (value) { clearTimeout(timer); resolve(value); },
      function (error) { clearTimeout(timer); reject(error); }
    );
  });
}

function browserOffline() {
  return typeof navigator !== 'undefined' && navigator.onLine === false;
}

/* Le HTML recu est-il bien la page attendue ? (type, puis marqueur pour les pages protegees). */
async function isStorablePage(rest, response) {
  var type = response.headers.get('content-type') || '';
  if (type.indexOf('text/html') === -1) return false;
  var marker = PAGE_MARKERS[rest];
  if (!marker) return true;
  var text = await response.text();
  return text.indexOf(marker) !== -1;
}

async function rememberLocale(locale) {
  try {
    var meta = await caches.open(META_CACHE);
    await meta.put(sameOriginUrl(LAST_LOCALE_KEY), new Response(locale));
  } catch (error) {
    /* stockage refuse : la racine tombera sur la langue du worker */
  }
}

async function lastLocale() {
  try {
    var meta = await caches.open(META_CACHE);
    var stored = await meta.match(sameOriginUrl(LAST_LOCALE_KEY));
    if (!stored) return null;
    var text = (await stored.text()).trim();
    return LOCALES.indexOf(text) === -1 ? null : text;
  } catch (error) {
    return null;
  }
}

/* ---- installation : prechargement ------------------------------------------------ */

async function storeAsset(cache, path) {
  var url = sameOriginUrl(path);
  if (path.indexOf('/_next/static/') === 0) {
    /* Empreinte dans le nom : un fichier deja la (version precedente) est le meme fichier. */
    var reused = await caches.match(url, { ignoreVary: true });
    if (reused) {
      await cache.put(url, reused);
      return;
    }
  }
  var response = await fetch(url, { credentials: 'same-origin' });
  if (!response.ok) throw new Error('precache ' + path + ' : ' + response.status);
  await cache.put(url, response);
}

async function storePage(cache, path) {
  var url = sameOriginUrl(path);
  var response = await fetch(url, { credentials: 'same-origin', headers: { Accept: 'text/html' } });
  if (!isStorableResponse(response)) throw new Error('precache ' + path + ' : ' + response.status);
  var split = splitLocale(path);
  if (!(await isStorablePage(split ? split.rest : path, response.clone()))) {
    throw new Error('precache ' + path + ' : pas la page attendue');
  }
  await cache.put(url, response);
}

async function precache() {
  var statics = await caches.open(STATIC_CACHE);
  await Promise.all(ASSETS.map(function (path) { return storeAsset(statics, path); }));
  var pages = await caches.open(PAGES_CACHE);
  await Promise.all(PAGES.map(function (path) {
    return storePage(pages, path).then(null, function (error) {
      /* Hub et page de repli : indispensables, leur echec fait echouer l'installation (le
         navigateur la retentera au prochain chargement). Une page de jeu en echec (504
         passager) n'empeche pas les autres : sans ca, un seul 404 ferait retelecharger tout
         le lot a CHAQUE chargement, sans jamais aboutir. */
      if (path === '/' + LOCALE + HUB_PATH || path === '/' + LOCALE + OFFLINE_PATH) throw error;
    });
  }));
  /* Page des joueurs, protegee : tentee seulement — sans mode choisi, c'est la page compte qui
     arrive (ecartee par son marqueur) et l'installation n'a pas a en souffrir. */
  await storePage(pages, '/' + LOCALE + PLAYERS_PATH).catch(function () {});
  await rememberLocale(LOCALE);
}

self.addEventListener('install', function (event) {
  event.waitUntil(precache().then(function () { return self.skipWaiting(); }));
});

/* Prolonge la vie du worker le temps d'une ecriture differee dans le cache. Apres la reponse
   rendue, waitUntil refuse (InvalidStateError) : l'ecriture court alors sans garantie. */
function extend(event, promise) {
  var guarded = promise.then(function () {}, function () {});
  try {
    event.waitUntil(guarded);
  } catch (error) {
    /* evenement deja clos */
  }
}

async function purgeOldCaches() {
  var names = await caches.keys();
  await Promise.all(
    names
      .filter(function (name) {
        return name.indexOf('lp-') === 0 && name !== STATIC_CACHE && name !== PAGES_CACHE && name !== META_CACHE;
      })
      .map(function (name) { return caches.delete(name); })
  );
}

self.addEventListener('activate', function (event) {
  event.waitUntil(purgeOldCaches().then(function () { return self.clients.claim(); }));
});

/* ---- requetes --------------------------------------------------------------------- */

async function cacheFirst(event, request) {
  var cached = await caches.match(request, { ignoreVary: true });
  if (cached) return cached;
  var response = await fetch(request);
  if (isStorableResponse(response)) {
    var copy = response.clone();
    extend(event, caches.open(STATIC_CACHE).then(function (cache) { return cache.put(request, copy); }));
  }
  return response;
}

async function storeNavigation(pages, page, response) {
  try {
    if (!(await isStorablePage(page.rest, response.clone()))) return;
    await pages.put(sameOriginUrl(page.key), response);
    await rememberLocale(page.locale);
  } catch (error) {
    /* cache plein ou ferme : la page reste servie par le reseau */
  }
}

function fallbackResponse() {
  return new Response(FALLBACK_HTML, {
    status: 503,
    headers: { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-store' }
  });
}

function redirectTo(path) {
  return Response.redirect(sameOriginUrl(path), 302);
}

/* Navigation en panne reseau, sans page en cache pour ce chemin. */
async function offlineFallback(url) {
  var split = splitLocale(url.pathname);
  if (!split) {
    /* Racine (icone de l'app, demarrage de la coquille) ou chemin sans langue (/jeux du manifeste) :
       le middleware, absent sans reseau, aurait ajoute la langue — on le fait a sa place. */
    var locale = (await lastLocale()) || LOCALE;
    var target = url.pathname === '/' ? '/' + locale + HUB_PATH : '/' + locale + url.pathname;
    return redirectTo(target + url.search);
  }
  if (split.rest === '/') return redirectTo('/' + split.locale + HUB_PATH);
  if (split.rest === OFFLINE_PATH) {
    var pages = await caches.open(PAGES_CACHE);
    var page = await pages.match(sameOriginUrl('/' + split.locale + OFFLINE_PATH), { ignoreSearch: true, ignoreVary: true });
    if (page) return page;
    /* Page de repli absente dans cette langue (jamais vue en ligne, changement de langue hors
       ligne) : celle d'une autre langue vaut mieux que l'ecran brut — elle liste les jeux. */
    var candidates = [await lastLocale(), LOCALE].concat(LOCALES);
    for (var i = 0; i < candidates.length; i++) {
      if (!candidates[i] || candidates[i] === split.locale) continue;
      var other = await pages.match(sameOriginUrl('/' + candidates[i] + OFFLINE_PATH), { ignoreSearch: true, ignoreVary: true });
      if (other) return other;
    }
    return fallbackResponse();
  }
  return redirectTo('/' + split.locale + OFFLINE_PATH + '?from=' + encodeURIComponent(split.rest + url.search));
}

async function navigation(event, request, url) {
  var page = cacheablePage(url.pathname);
  var pages = await caches.open(PAGES_CACHE);
  var cached = page ? await pages.match(sameOriginUrl(page.key), { ignoreSearch: true, ignoreVary: true }) : undefined;
  if (cached && browserOffline()) return cached;
  var network = fetch(request).then(function (response) {
    if (page && isStorableResponse(response)) extend(event, storeNavigation(pages, page, response.clone()));
    return response;
  });
  if (!cached) {
    try {
      return await network;
    } catch (error) {
      return offlineFallback(url);
    }
  }
  try {
    var response = await withTimeout(network, NAV_TIMEOUT_MS);
    return isServerDown(response) ? cached : response;
  } catch (error) {
    /* delai depasse ou panne : la reponse tardive, s'il y en a une, rafraichira le cache. */
    extend(event, network);
    return cached;
  }
}

/* Navigation CLIENT de Next (fetch du contenu RSC) vers une page en cache : reseau borne,
   et en echec une erreur reseau franche, que Next transforme en chargement complet. Les
   PRECHARGEMENTS de Next (liens a l'ecran) restent au reseau : lents, ils ne doivent pas
   devenir un rechargement de page. */
async function clientNavigation(request, page) {
  if (request.headers.get('Next-Router-Prefetch') === '1') return fetch(request);
  var pages = await caches.open(PAGES_CACHE);
  var cached = await pages.match(sameOriginUrl(page.key), { ignoreSearch: true, ignoreVary: true });
  if (!cached) return fetch(request);
  if (browserOffline()) return Response.error();
  var controller = typeof AbortController === 'function' ? new AbortController() : null;
  try {
    return await withTimeout(fetch(request, controller ? { signal: controller.signal } : undefined), NAV_TIMEOUT_MS);
  } catch (error) {
    if (controller) controller.abort();
    return Response.error();
  }
}

/* Une panne du stockage (caches.open/match qui rejette) ne doit jamais rendre une navigation
   en erreur : on refait alors ce que le navigateur aurait fait sans worker. */
function orNetwork(request, promise) {
  return promise.catch(function () { return fetch(request); });
}

self.addEventListener('fetch', function (event) {
  var request = event.request;
  if (request.method !== 'GET') return;
  var url = new URL(request.url);
  if (url.origin !== self.location.origin) return;
  var path = url.pathname;
  if (path.indexOf('/_capacitor_') === 0 || path.indexOf('/api/') === 0 || path === '/sw.js') return;
  if (path.indexOf('/_next/static/') === 0 || path.indexOf('/icons/') === 0 || path === '/manifest.json') {
    event.respondWith(orNetwork(request, cacheFirst(event, request)));
    return;
  }
  if (request.mode === 'navigate') {
    /* Une NAVIGATION reste une navigation, meme si son URL porte ?_rsc= (lien copie depuis
       une requete de Next) : la branche RSC ne vaut que pour les fetch du routeur client. */
    event.respondWith(orNetwork(request, navigation(event, request, url)));
    return;
  }
  if (request.headers.get('RSC') === '1' || url.searchParams.has('_rsc')) {
    var page = cacheablePage(path);
    if (page) event.respondWith(orNetwork(request, clientNavigation(request, page)));
  }
});
`
}

/**
 * Worker « qui se retire » : servi en développement (pas de manifeste de
 * build, et un worker masquerait le rechargement à chaud) ou quand les
 * manifestes manquent en production. Il s'installe, vide ses caches et se
 * désinscrit : le site repasse en « sans worker », rien de cassé.
 */
export function buildRetiringServiceWorkerScript(reason: string): string {
  return `/* Le Pillaveur — service worker neutralise (${reason.replace(/\*\//g, '')}). */
'use strict';
self.addEventListener('install', function () { self.skipWaiting(); });
self.addEventListener('activate', function (event) {
  event.waitUntil(
    caches.keys()
      .then(function (names) {
        return Promise.all(names.filter(function (name) { return name.indexOf('lp-') === 0; }).map(function (name) { return caches.delete(name); }));
      })
      .then(function () { return self.registration.unregister(); })
  );
});
`
}
