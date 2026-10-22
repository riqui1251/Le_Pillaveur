import type { Locator } from '@playwright/test'
import { expect } from './fixtures'
import type { GameCtx } from './scenario'

export const PSEUDO = 'Testeur'

/**
 * Pseudo d'invité propre au test : la route essaie le pseudo demandé puis
 * trois suffixes à deux chiffres, et répond 409 si tous sont pris — ce qui
 * finit par arriver quand chaque passe crée ses « Testeur » dans la base.
 * Deux mots choisis plutôt que des chiffres : la modération lit le leet
 * (« Testeur8173 » se lit « testeurbite » et est refusé).
 */
const WORDS = ['Lune', 'Pomme', 'Nuage', 'Tigre', 'Olive', 'Corail', 'Galet', 'Menthe', 'Plume', 'Cerise', 'Ambre', 'Givre']
function uniquePseudo(): string {
  const pick = () => WORDS[Math.floor(Math.random() * WORDS.length)]
  return `${PSEUDO}${pick()}${pick()}`
}

/**
 * Le micro de la salle est proposé dès le lobby (« Activer le micro pour
 * cette partie ? ») et revient au lancement : on répond « Plus tard » chaque
 * fois qu'il recouvre l'écran, sans jamais demander l'accès au micro.
 */
async function declineMicrophone(ctx: GameCtx) {
  const later = ctx.page.getByRole('button', { name: ctx.t('voice.prompt.later'), exact: true })
  await ctx.page.addLocatorHandler(later, async () => {
    await later.click()
  })
}

/** Vitrine d'un jeu en ligne vue par un visiteur (ni compte ni mode local). */
export async function openShowcase(ctx: GameCtx) {
  await ctx.page.goto(`/${ctx.locale}/games/${ctx.gameId}`)
  await expect(ctx.ui.getByRole('heading', { level: 1, name: ctx.t(`games.catalog.${ctx.gameId}.title`) })).toBeVisible()
  await expect(ctx.ui.getByRole('link', { name: ctx.t('tryBots.loginCta') })).toBeVisible()
  await ctx.step('vitrine')
}

/**
 * « Essayer avec des bots » de bout en bout, comme un visiteur : pseudo →
 * compte invité → table privée et ses bots → lobby → « Lancer avec les
 * bots » → briefing passé (« Je connais déjà les règles »).
 */
export async function playSoloWithBots(ctx: GameCtx) {
  const { page, t, button } = ctx
  await declineMicrophone(ctx)
  await openShowcase(ctx)

  await button(t('tryBots.cta')).click()
  await page.getByPlaceholder(t('tryBots.pseudoPlaceholder')).fill(uniquePseudo())
  await button(t('tryBots.go')).click()

  const launch = page.getByRole('button', { name: t('onlineLobby.launch.withBots'), exact: true })
  await expect(launch).toBeVisible({ timeout: 30_000 })
  await ctx.step('lobby')

  await launch.click()
  await page.getByRole('button', { name: t('briefing.skip'), exact: true }).click({ timeout: 30_000 })
}

/**
 * Jeux sans bots au lancement : la vitrine n'offre que la connexion. On crée
 * le compte invité par l'API (la même route que le guichet « rejoindre une
 * table »), puis on ouvre une table : le lobby attend ses vrais joueurs.
 */
export async function openGuestTable(ctx: GameCtx) {
  const { page, t, button } = ctx
  await declineMicrophone(ctx)
  await openShowcase(ctx)
  await expect(ctx.ui.getByRole('button', { name: t('tryBots.cta') })).toHaveCount(0)

  const res = await createGuest(ctx)
  expect(res.status(), await res.text()).toBe(200)
  await page.goto(`/${ctx.locale}/games/${ctx.gameId}`)
  await button(t('onlineLobby.create.cta')).click()
  await ctx.ui.getByRole('button', { name: t('onlineLobby.create.privateLabel') }).click()
  await expectLobby(ctx)
}

/** Lobby de SA table : le code à copier est affiché. */
export async function expectLobby(ctx: GameCtx) {
  await expect(ctx.ui.getByRole('button', { name: ctx.t('onlineLobby.table.tapToCopy') })).toBeVisible({ timeout: 30_000 })
}

/**
 * POST /api/auth/guest par le contexte de requêtes de la page (cookies
 * partagés avec le navigateur). Une connexion keep-alive que le serveur vient
 * de fermer se solde par un ECONNRESET : on retente une fois.
 */
async function createGuest(ctx: GameCtx) {
  const send = () => ctx.page.request.post('/api/auth/guest', { data: { displayName: uniquePseudo(), locale: ctx.locale } })
  try {
    return await send()
  } catch (error) {
    if (!/ECONNRESET|socket hang up/.test(String(error))) throw error
    return send()
  }
}

/**
 * Attend que l'un des écrans possibles apparaisse (les bots jouent à leur
 * rythme, le tour du joueur arrive quand il arrive) et rend son indice.
 */
export async function firstVisible(candidates: Locator[], timeout = 60_000): Promise<number> {
  const deadline = Date.now() + timeout
  while (Date.now() < deadline) {
    for (let i = 0; i < candidates.length; i += 1) {
      if (await candidates[i].first().isVisible()) return i
    }
    await candidates[0].page().waitForTimeout(250)
  }
  throw new Error(`Aucun des écrans attendus n'est apparu en ${timeout} ms : ${candidates.map(String).join(' | ')}`)
}
