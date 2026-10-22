import type { Locator, Page } from '@playwright/test'
import { checkScreen, snap, type PageGuard } from './fixtures'
import { exact, pattern, raw, tr, type Locale } from './i18n'

type Values = Record<string, string | number>

/** Ce que chaque scénario de jeu reçoit : la page, la langue, des raccourcis. */
export type GameCtx = {
  page: Page
  locale: Locale
  gameId: string
  guard: PageGuard
  /** Contenu de la page (hors barre du haut et tiroir). */
  ui: Locator
  /** Texte formaté d'une clé du catalogue. */
  t: (key: string, values?: Values) => string
  /** Texte formaté d'une clé du jeu (`games.<id>.<clé>`). */
  g: (key: string, values?: Values) => string
  /** Gabarit d'une clé du jeu en expression régulière (ANY = joker). */
  gp: (key: string, values?: Values) => RegExp
  /** Valeur brute d'une clé du jeu (tableaux, objets). */
  graw: (key: string) => unknown
  /** Bouton du contenu dont le nom accessible est exactement ce texte. */
  button: (name: string | RegExp) => Locator
  /** Capture puis contrôles communs (langue, clés brutes, débordement, erreurs). */
  step: (name: string) => Promise<void>
}

/** Contenu de la page, hors barre du haut et tiroir de navigation. */
export function content(page: Page): Locator {
  return page.locator('.content-container')
}

export function gameCtx(page: Page, guard: PageGuard, locale: Locale, gameId: string, firstStep = 1): GameCtx {
  let n = firstStep
  const ui = content(page)
  return {
    page,
    locale,
    gameId,
    guard,
    ui,
    t: (key, values) => tr(locale, key, values),
    g: (key, values) => tr(locale, `games.${gameId}.${key}`, values),
    gp: (key, values) => pattern(locale, `games.${gameId}.${key}`, values),
    graw: (key) => raw(locale, `games.${gameId}.${key}`),
    button: (name) => ui.getByRole('button', { name: typeof name === 'string' ? exact(name) : name }),
    step: async (name) => {
      const label = `${String(n).padStart(2, '0')}-${name}`
      n += 1
      // Capture d'abord : un contrôle qui échoue laisse l'écran fautif sur le disque.
      await snap(page, locale, gameId, label)
      await checkScreen(page, guard, locale, `${gameId} ${locale} ${label}`)
    },
  }
}
