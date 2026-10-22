import { mkdirSync } from 'node:fs'
import path from 'node:path'
import { expect, test as base, type Page } from '@playwright/test'
import { RAW_KEY_PATTERN, type Locale } from './i18n'

export { expect }

const SCREENSHOTS_DIR = path.join(__dirname, '..', 'screenshots')

/**
 * Bruits CONNUS et bénins de la console, chacun avec sa raison. Tout le reste
 * (erreur de page, console.error) fait échouer le test.
 */
type Allowance = { reason: string; matches: (text: string, url: string, page: PageGuard) => boolean }
const ALLOWED_CONSOLE_ERRORS: Allowance[] = [
  {
    // Visiteur sans session : AuthProvider demande /api/auth/me, qui répond
    // 401 — c'est la réponse attendue, le navigateur la journalise quand même.
    reason: '401 de /api/auth/me pour un visiteur sans session',
    matches: (text, url) => /status of 401/.test(text) && /\/api\/auth\/me(\?|$)/.test(url),
  },
  {
    // Chaque humain d'une table réveille les bots (src/hooks/useBotReferee.ts)
    // et la route d'action valide par compare-and-swap : le tick devancé par
    // un autre (ou par le minuteur du serveur) reçoit un 409, par conception.
    reason: "409 d'un tick d'arbitre devancé sur /api/online/rooms/<id>/action",
    matches: (text, url) => /status of 409/.test(text) && /\/api\/online\/rooms\/[^/]+\/action(\?|$)/.test(url),
  },
  {
    // Le serveur de test parle HTTP, mais la CSP de prod porte
    // `upgrade-insecure-requests` : une redirection du middleware (préchargement
    // d'une page protégée par un visiteur → /compte) est réécrite en
    // https://localhost, qui n'existe pas. En prod tout est en HTTPS. Admis
    // seulement si une requête https://localhost a bien échoué ainsi.
    reason: 'redirection réécrite en https par la CSP sur le serveur HTTP de test',
    matches: (text, _url, guard) =>
      guard.upgradedRequestFailed &&
      (/net::ERR_SSL_PROTOCOL_ERROR/.test(text) || /Failed to fetch RSC payload/.test(text)),
  },
]

export class PageGuard {
  readonly errors: string[] = []
  upgradedRequestFailed = false

  constructor(page: Page) {
    page.on('pageerror', (error) => {
      this.errors.push(`pageerror: ${error.message} (${page.url()})`)
    })
    page.on('requestfailed', (request) => {
      if (/^https:\/\/localhost[:/]/.test(request.url()) && /ERR_SSL_PROTOCOL_ERROR/.test(request.failure()?.errorText ?? '')) {
        this.upgradedRequestFailed = true
      }
    })
    page.on('console', (message) => {
      if (message.type() !== 'error') return
      const text = message.text()
      const url = message.location()?.url ?? ''
      if (ALLOWED_CONSOLE_ERRORS.some((a) => a.matches(text, url, this))) return
      this.errors.push(`console.error: ${text.slice(0, 500)} (${url || page.url()})`)
    })
  }

  expectClean(where: string) {
    expect(this.errors, `Erreurs de page ou de console (${where})`).toEqual([])
  }
}

type Fixtures = {
  guard: PageGuard
}

// Le second argument d'une fixture s'appelle `use` dans la doc Playwright ;
// il est renommé `provide` pour que la règle rules-of-hooks de React ne le
// prenne pas pour le hook `use`.
export const test = base.extend<Fixtures>({
  context: async ({ context, baseURL }, provide, testInfo) => {
    // Portail 18+ déjà franchi et statistiques refusées : la modale et le
    // bandeau de consentement ne recouvrent pas les écrans de jeu. Le mode
    // local, lui, se pose par l'interface (« Sélectionner les joueurs »).
    await context.addCookies([
      { name: 'lp_age_verified', value: '1', url: baseURL },
      { name: 'lp_analytics_consent', value: '0', url: baseURL },
    ])
    // Une adresse de réseau PAR TEST (plage de doc 198.18.0.0/15) : la
    // création de comptes invités est plafonnée à 40 par heure et par réseau
    // (api/auth/guest), et toute la suite sort de 127.0.0.1. L'en-tête est
    // celui que Cloudflare pose en prod (lib/geo-server.ts).
    await context.setExtraHTTPHeaders({ 'cf-connecting-ip': networkFor(testInfo.testId) })
    await provide(context)
  },
  guard: async ({ page }, provide) => {
    const guard = new PageGuard(page)
    await provide(guard)
    guard.expectClean('fin du test')
  },
})

function networkFor(testId: string): string {
  let hash = 0
  for (const char of testId) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  return `198.${18 + (hash & 1)}.${(hash >>> 1) & 255}.${1 + ((hash >>> 9) % 254)}`
}

type ScreenReport = {
  lang: string
  innerWidth: number
  docScrollWidth: number
  bodyScrollWidth: number
  offenders: string[]
  text: string
}

/**
 * Contrôles communs à chaque étape : langue du document, aucune clé brute,
 * aucun débordement horizontal, aucune erreur depuis l'étape précédente.
 */
export async function checkScreen(page: Page, guard: PageGuard, locale: Locale, where: string) {
  await expect(page.locator('html')).toHaveAttribute('lang', locale)
  const report = await page.evaluate(measureScreen)
  expect(report.lang).toBe(locale)

  const rawKeys = [...report.text.matchAll(RAW_KEY_PATTERN)].map((m) => m[1])
  expect(rawKeys, `Clé de traduction brute affichée (${where})`).toEqual([])

  expect(report.docScrollWidth, `Débordement horizontal du document (${where})`).toBeLessThanOrEqual(report.innerWidth)
  expect(report.bodyScrollWidth, `Débordement horizontal du body (${where})`).toBeLessThanOrEqual(report.innerWidth)
  expect(report.offenders, `Éléments coupés par le bord de l'écran (${where})`).toEqual([])

  guard.expectClean(where)
}

/**
 * Exécuté DANS la page. Le body est le conteneur de défilement sur téléphone
 * (`.is-mobile-device` : hauteur 100 %, overflow-x masqué) et le contenu vit
 * sous un `overflow-x: clip` : un élément trop large y est rogné sans jamais
 * élargir scrollWidth. D'où la troisième mesure : tout texte ou contrôle
 * VISIBLE à cheval sur un bord de l'écran. Les éléments entièrement hors
 * champ (tiroir de navigation replié), ceux d'une rangée qui défile
 * horizontalement exprès et ceux qu'un conteneur interne rogne ne comptent
 * pas.
 */
function measureScreen(): ScreenReport {
  const vw = window.innerWidth
  const offenders: string[] = []
  // Ancêtre qui « absorbe » le dépassement : une rangée qui défile
  // horizontalement exprès, ou un conteneur qui rogne (troncature, bandeau)
  // et tient lui-même DANS l'écran — l'élément y est coupé par design, pas par
  // le bord du téléphone.
  const absorbedBy = (el: Element) => {
    const s = getComputedStyle(el)
    if ((s.overflowX === 'auto' || s.overflowX === 'scroll') && el.scrollWidth > el.clientWidth) return true
    if (s.overflowX === 'hidden' || s.overflowX === 'clip') {
      const box = el.getBoundingClientRect()
      return box.left > 0.5 && box.right < vw - 0.5
    }
    return false
  }
  const hasOwnText = (el: Element) =>
    Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.textContent ?? '').trim().length > 0)
  const candidates = document.body.querySelectorAll<HTMLElement>(
    'button, a, input, select, textarea, label, h1, h2, h3, h4, p, span, li, td, th, img, canvas, svg'
  )
  for (const el of Array.from(candidates)) {
    const tag = el.tagName.toLowerCase()
    const interactive = ['button', 'a', 'input', 'select', 'textarea', 'img', 'canvas'].includes(tag)
    if (!interactive && tag !== 'svg' && !hasOwnText(el)) continue
    if (tag === 'svg' && el.closest('button, a')) continue
    const r = el.getBoundingClientRect()
    if (r.width < 1 || r.height < 1) continue
    if (r.right <= 0 || r.left >= vw) continue
    if (r.left >= -1 && r.right <= vw + 1) continue
    const style = getComputedStyle(el)
    if (style.visibility === 'hidden' || Number(style.opacity) === 0) continue
    if (el.closest('[aria-hidden="true"], [inert]')) continue
    let parent = el.parentElement
    let absorbed = false
    while (parent && parent !== document.body) {
      if (absorbedBy(parent)) {
        absorbed = true
        break
      }
      parent = parent.parentElement
    }
    if (absorbed) continue
    const label = (el.getAttribute('aria-label') || el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 60)
    offenders.push(`<${tag}> « ${label} » [${Math.round(r.left)}, ${Math.round(r.right)}] / ${vw}`)
  }
  return {
    lang: document.documentElement.lang,
    innerWidth: vw,
    docScrollWidth: document.documentElement.scrollWidth,
    bodyScrollWidth: document.body.scrollWidth,
    offenders: offenders.slice(0, 10),
    text: document.body.innerText,
  }
}

/**
 * Capture pleine page dans e2e/screenshots/<langue>/<jeu>-<étape>.png. Sur
 * téléphone, le body fait la hauteur de l'écran et défile lui-même : le temps
 * de la capture, html et body reprennent leur hauteur naturelle pour que la
 * page entière tienne dans l'image.
 */
export async function snap(page: Page, locale: Locale, gameId: string, step: string) {
  const dir = path.join(SCREENSHOTS_DIR, locale)
  mkdirSync(dir, { recursive: true })
  const file = path.join(dir, `${gameId}-${step}.png`)
  const style = await page.addStyleTag({
    content: 'html, body, html.is-mobile-device, html.is-mobile-device body { height: auto !important; min-height: 100% !important; overflow-y: visible !important; }',
  })
  try {
    await page.screenshot({ path: file, fullPage: true, scale: 'css', caret: 'hide' })
  } finally {
    await style.evaluate((node) => (node as Element).remove()).catch(() => undefined)
  }
}
