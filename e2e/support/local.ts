import { expect } from './fixtures'
import { exact } from './i18n'
import type { GameCtx } from './scenario'

export const TABLE = ['Alice', 'Bruno', 'Chloé'] as const

/**
 * Compose la table locale par l'interface, comme un groupe qui arrive sur un
 * jeu sans joueurs :
 * - `entry: 'game'` — le bouton « Sélectionner les joueurs » de l'écran du
 *   jeu (pré-lobby commun ou carton des anciens jeux) pose le mode local et
 *   ouvre /joueurs?next=… ;
 * - `entry: 'hub'` — l'écran du jeu n'offre aucun chemin (anciens jeux
 *   masqués) : on passe par les réglages de la soirée du hub (« Qui joue ? »
 *   puis « Choisir les joueurs »).
 * Les trois prénoms sont saisis d'un trait (« Alice, Bruno, Chloé ») ; un
 * joueur ajouté est sélectionné d'office. « Commencer » ramène au jeu quand
 * il est publié (?next=), au hub sinon — on rouvre alors le jeu.
 */
export async function setupLocalTable(ctx: GameCtx, entry: 'game' | 'hub' = 'game') {
  const { page, locale, gameId, ui, t } = ctx
  if (entry === 'game') {
    await page.goto(`/${locale}/games/${gameId}`)
    await ctx.button(t('players.selectTitle')).click()
  } else {
    await page.goto(`/${locale}/jeux`)
    await ctx.button(t('hub.partyBar.players', { count: 0 })).click()
    await page.getByRole('dialog').getByRole('button', { name: t('hub.selectedPlayers.choose') }).click()
  }
  await page.waitForURL(new RegExp(`/${locale}/joueurs`))

  await page.getByPlaceholder(t('players.namesPlaceholder')).fill(TABLE.join(', '))
  await ctx.button(t('players.addButton')).click()
  await expect(ui.getByText(exact(t('players.selectionStatus.ready', { count: TABLE.length })))).toBeVisible()
  for (const name of TABLE) await expect(ui.getByText(name, { exact: true })).toBeVisible()
  await ctx.step('joueurs')

  const published = page.url().includes('next=')
  const start = published
    ? t('hub.joueurs.playGame', { game: t(`games.catalog.${gameId}.title`) })
    : t('players.startGame')
  await ctx.button(start).click()
  if (published) {
    await page.waitForURL(new RegExp(`/${locale}/games/${gameId}$`))
  } else {
    await page.waitForURL(new RegExp(`/${locale}/jeux`))
    await page.goto(`/${locale}/games/${gameId}`)
  }
}
