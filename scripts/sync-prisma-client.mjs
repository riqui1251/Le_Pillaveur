/**
 * Synchronise schema.prisma vers le client Prisma (contourne EPERM Windows
 * quand prisma generate ne peut pas remplacer query-engine-windows.exe).
 */
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import { execSync } from 'child_process'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const schemaSrc = path.join(root, 'prisma', 'schema.prisma')
const clientDir = path.join(root, 'node_modules', '.prisma', 'client')
const schemaDest = path.join(clientDir, 'schema.prisma')

if (!fs.existsSync(schemaSrc)) {
  console.warn('[sync-prisma] schema.prisma introuvable')
  process.exit(0)
}

if (!fs.existsSync(clientDir)) {
  try {
    execSync('npx prisma generate', { cwd: root, stdio: 'inherit' })
  } catch {
    /* fallback copy below if partial generate */
  }
}

if (!fs.existsSync(clientDir)) {
  console.warn('[sync-prisma] client Prisma absent — lancez npm install')
  process.exit(0)
}

fs.mkdirSync(clientDir, { recursive: true })
fs.copyFileSync(schemaSrc, schemaDest)
console.log('[sync-prisma] schema.prisma synchronisé')

const enginePath = path.join(clientDir, 'query-engine-windows.exe')
if (process.platform === 'win32' && !fs.existsSync(enginePath)) {
  const tmpEngines = fs
    .readdirSync(clientDir)
    .filter((name) => name.startsWith('query-engine-windows.exe.tmp'))
  if (tmpEngines.length > 0) {
    const latest = tmpEngines.sort().at(-1)
    fs.copyFileSync(path.join(clientDir, latest), enginePath)
    console.log('[sync-prisma] query-engine restauré depuis', latest)
  }
}
