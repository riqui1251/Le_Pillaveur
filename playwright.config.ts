import path from 'node:path'
import { defineConfig, devices } from '@playwright/test'

/**
 * Tests de bout en bout sur écran de téléphone : chaque jeu, dans chaque
 * langue, contre le build de production (`next start`), sur une base SQLite
 * jetable recréée au démarrage du serveur (e2e/support/prepare-db.mjs).
 *
 * Prérequis : `npm run build` (le serveur de test sert `.next`, il ne compile
 * rien). Les captures vont dans e2e/screenshots/<langue>/ (ignoré par git).
 */
const PORT = Number(process.env.E2E_PORT ?? 3100)
const BASE_URL = `http://localhost:${PORT}`
const E2E_DB_FILE = path.join(__dirname, 'e2e', '.tmp', 'e2e.db')

export default defineConfig({
  testDir: './e2e',
  testMatch: '**/*.spec.ts',
  outputDir: './test-results',
  fullyParallel: true,
  // Machine partagée : deux navigateurs au plus. Le serveur SQLite n'a qu'une
  // connexion, plus de parallélisme ne ferait qu'allonger les files d'attente.
  workers: 2,
  retries: 0,
  forbidOnly: Boolean(process.env.CI),
  timeout: 120_000,
  expect: { timeout: 15_000 },
  reporter: [['list'], ['html', { open: 'never', outputFolder: 'playwright-report' }]],
  use: {
    baseURL: BASE_URL,
    locale: 'fr-FR',
    timezoneId: 'Europe/Paris',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 15_000,
    navigationTimeout: 30_000,
  },
  projects: [
    {
      name: 'mobile-chromium',
      use: {
        // Chromium Android, à la largeur d'un iPhone 12-16 (390 × 844) : le
        // gabarit le plus courant chez les joueurs, et plus étroit que les
        // 412 px du Pixel 7 — un débordement s'y voit plus tôt.
        ...devices['Pixel 7'],
        viewport: { width: 390, height: 844 },
      },
    },
  ],
  webServer: {
    command: 'node e2e/support/prepare-db.mjs && npx next start -p ' + PORT,
    // Page statique et publique : /api/health répondrait 503 sur un disque
    // presque plein (machine de dev partagée), sans rapport avec le site.
    url: `${BASE_URL}/fr/legal/cgu`,
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      DATABASE_URL: `file:${E2E_DB_FILE}`,
      NEXT_TELEMETRY_DISABLED: '1',
      // Aucun e-mail ne part : sans clé, src/lib/email.ts n'envoie rien.
      RESEND_API_KEY: '',
      SITE_URL: BASE_URL,
    },
  },
})
