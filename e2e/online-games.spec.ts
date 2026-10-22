import { GAMES, hasContentIn } from '../src/lib/games'
import { expect, test } from './support/fixtures'
import { LOCALES } from './support/i18n'
import { openGuestTable, openShowcase, playSoloWithBots } from './support/online'
import { gameCtx, type GameCtx } from './support/scenario'
import { ONLINE_SCENARIOS } from './scenarios/online'

/** Jeux en ligne × langues : scénarios dans e2e/scenarios/online.ts. */
for (const scenario of ONLINE_SCENARIOS) {
  const game = GAMES.find((x) => x.id === scenario.id)
  test.describe(`${scenario.id} (en ligne)`, () => {
    for (const locale of LOCALES) {
      test(`${scenario.id} — ${locale}`, async ({ page, guard }) => {
        const ctx = gameCtx(page, guard, locale, scenario.id)
        if (game && !hasContentIn(game, locale)) {
          await showcaseOnly(ctx)
          return
        }
        if (scenario.mode === 'bots') {
          await playSoloWithBots(ctx)
        } else {
          await openGuestTable(ctx)
          await ctx.step('lobby')
        }
        await scenario.play?.(ctx)
      })
    }
  })
}

/** Jeu sans cartes dans cette langue : la vitrine seule, connexion comprise, sans « Essayer avec des bots ». */
async function showcaseOnly(ctx: GameCtx) {
  await openShowcase(ctx)
  await expect(ctx.ui.getByRole('button', { name: ctx.t('tryBots.cta') })).toHaveCount(0)
}
