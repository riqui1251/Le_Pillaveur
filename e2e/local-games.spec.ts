import { test } from './support/fixtures'
import { LOCALES } from './support/i18n'
import { setupLocalTable } from './support/local'
import { gameCtx } from './support/scenario'
import { LOCAL_SCENARIOS } from './scenarios/local'

/** Jeux locaux × langues : scénarios dans e2e/scenarios/local.ts. */
for (const scenario of LOCAL_SCENARIOS) {
  test.describe(`${scenario.id} (local)`, () => {
    for (const locale of LOCALES) {
      test(`${scenario.id} — ${locale}`, async ({ page, guard }) => {
        const ctx = gameCtx(page, guard, locale, scenario.id)
        await setupLocalTable(ctx, scenario.entry)
        await scenario.play(ctx)
      })
    }
  })
}
