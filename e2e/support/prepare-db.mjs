// Base SQLite JETABLE des tests de bout en bout, recréée à chaque démarrage
// du serveur de test (webServer de playwright.config.ts, qui pose
// DATABASE_URL) : jamais prisma/dev.db, suivie par git.
// `db push` et non `migrate deploy` : sur une base neuve, l'historique des
// migrations échoue (« no such table: SitePresence ») ; le schéma fait foi.
import { execFileSync } from 'node:child_process'
import { mkdirSync, rmSync } from 'node:fs'
import path from 'node:path'

const url = process.env.DATABASE_URL ?? ''
const file = url.startsWith('file:') ? url.slice('file:'.length) : ''
if (!path.isAbsolute(file) || !file.includes(`${path.sep}e2e${path.sep}.tmp${path.sep}`)) {
  console.error(`[e2e] DATABASE_URL doit viser une base jetable sous e2e/.tmp/, reçu : « ${url} »`)
  process.exit(1)
}

mkdirSync(path.dirname(file), { recursive: true })
for (const suffix of ['', '-journal', '-wal', '-shm']) {
  rmSync(`${file}${suffix}`, { force: true })
}

execFileSync('npx', ['prisma', 'db', 'push', '--skip-generate'], { stdio: 'inherit', env: process.env })
