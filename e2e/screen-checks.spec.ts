import { checkScreen, expect, PageGuard, test } from './support/fixtures'

/**
 * Le contrôle de débordement lui-même (checkScreen), sur des pages
 * synthétiques : il doit voir un bouton coupé par le bord du téléphone sous
 * un `overflow-x: clip` (cas réel de Trial Poursuite), et ignorer un texte
 * qu'un conteneur interne tronque exprès (bandeau d'effets de Plinko).
 */
const page390 = (body: string) =>
  `<html lang="fr"><head><meta name="viewport" content="width=device-width, initial-scale=1"></head><body style="margin:0">${body}</body></html>`

test('contrôle d’écran : un bouton coupé par le bord est signalé', async ({ page }) => {
  await page.setContent(
    page390(`<div style="overflow-x:clip;width:100%"><div style="display:flex;justify-content:center;gap:16px">
      <button style="width:224px;flex-shrink:0">Réussi</button><button style="width:224px;flex-shrink:0">Non réussi</button>
    </div></div>`)
  )
  await expect(checkScreen(page, new PageGuard(page), 'fr', 'bord')).rejects.toThrow(/coupés par le bord/)
})

test('contrôle d’écran : un rognage interne voulu ne compte pas', async ({ page }) => {
  await page.setContent(
    page390(`<div style="overflow:hidden;width:300px;margin-left:20px">
      <span style="white-space:nowrap;display:inline-block;width:600px">texte tronqué par son conteneur</span>
    </div>`)
  )
  await checkScreen(page, new PageGuard(page), 'fr', 'interne')
})

test('contrôle d’écran : une clé de traduction brute est signalée', async ({ page }) => {
  await page.setContent(page390('<p>Lancer games.pmu.setup.nextRace</p>'))
  await expect(checkScreen(page, new PageGuard(page), 'fr', 'clé')).rejects.toThrow(/Clé de traduction brute/)
})
