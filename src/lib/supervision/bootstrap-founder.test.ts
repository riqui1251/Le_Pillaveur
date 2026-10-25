import { spawnSync } from 'node:child_process'
import { chmodSync, existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { describe, expect, it, vi } from 'vitest'
import { bootstrapFounder, parseBootstrapArgs } from '../../../scripts/bootstrap-admin.mjs'

/**
 * Amorçage du compte fondateur (scripts/bootstrap-admin.mjs et
 * scripts/prod-bootstrap-fondateur.sh). L'ancien script cherchait le compte
 * par PSEUDO (« Riqui1251 », libre une fois le fondateur renommé) ou par
 * e-mail CONTENANT « riqui » : relancé, il nommait fondateur le compte de
 * n'importe qui. Désormais : e-mail exact (sans casse) ou id, refus si
 * plusieurs comptes répondent, rien si un autre fondateur existe sauf
 * --force, et plus aucun renommage.
 */

type Row = { id: string; email: string | null; displayName: string; role: string; isGuest: boolean }

function fakePrisma(rows: Row[]) {
  return {
    $queryRaw: vi.fn(async (strings: TemplateStringsArray, email: string) => {
      expect(strings.join('?')).toContain('lower("email") = lower(?)')
      return rows.filter((r) => r.email?.toLowerCase() === email.toLowerCase()).map((r) => ({ id: r.id }))
    }),
    user: {
      findMany: vi.fn(async ({ where }: { where: { id: string } }) =>
        rows.filter((r) => r.id === where.id).map((r) => ({ id: r.id }))
      ),
      findUnique: vi.fn(async ({ where }: { where: { id: string } }) => rows.find((r) => r.id === where.id) ?? null),
      count: vi.fn(
        async ({ where }: { where: { role: string; id: { not: string } } }) =>
          rows.filter((r) => r.role === where.role && r.id !== where.id.not).length
      ),
      update: vi.fn(async ({ where, data }: { where: { id: string }; data: Partial<Row> }) => {
        const row = rows.find((r) => r.id === where.id)!
        Object.assign(row, data)
        return row
      }),
    },
  }
}

const account = (id: string, email: string | null, extra: Partial<Row> = {}): Row => ({
  id,
  email,
  displayName: id,
  role: 'user',
  isGuest: false,
  ...extra,
})

describe('bootstrap-admin.mjs : arguments', () => {
  it('exige exactement un e-mail ou un id', () => {
    expect(parseBootstrapArgs([])).toBeNull()
    expect(parseBootstrapArgs(['--force'])).toBeNull()
    expect(parseBootstrapArgs(['a@b.fr', 'c@d.fr'])).toBeNull()
    expect(parseBootstrapArgs(['--oui', 'a@b.fr'])).toBeNull()
    expect(parseBootstrapArgs([' '])).toBeNull()
  })

  it('lit la cible et le drapeau --force', () => {
    expect(parseBootstrapArgs(['Riqui1251@gmail.com'])).toEqual({ target: 'Riqui1251@gmail.com', force: false })
    expect(parseBootstrapArgs(['--force', 'clx123'])).toEqual({ target: 'clx123', force: true })
  })
})

describe('bootstrap-admin.mjs : promotion', () => {
  it('promeut le compte de l’e-mail exact, jamais celui qui a pris le pseudo', async () => {
    const rows = [
      account('vrai', 'riqui1251@gmail.com', { displayName: 'Riqui' }),
      account('intrus', 'riqui@exemple.com', { displayName: 'Riqui1251' }),
    ]
    const prisma = fakePrisma(rows)

    const result = await bootstrapFounder(prisma, { target: 'Riqui1251@Gmail.com', force: false })

    expect(result).toMatchObject({ status: 'promoted', user: { id: 'vrai', role: 'fondateur' } })
    expect(rows.find((r) => r.id === 'intrus')?.role).toBe('user')
    expect(prisma.user.update).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 'vrai' }, data: { role: 'fondateur' } })
    )
  })

  it('ne renomme plus le compte promu', async () => {
    const rows = [account('vrai', 'riqui1251@gmail.com', { displayName: 'Riqui1251' })]

    await bootstrapFounder(fakePrisma(rows), { target: 'riqui1251@gmail.com', force: false })

    expect(rows[0]).toMatchObject({ role: 'fondateur', displayName: 'Riqui1251' })
  })

  it('plusieurs comptes pour l’adresse : refus, rien n’est écrit', async () => {
    const prisma = fakePrisma([account('a', 'Riqui@exemple.com'), account('b', 'riqui@exemple.com')])

    const result = await bootstrapFounder(prisma, { target: 'riqui@exemple.com', force: false })

    expect(result).toMatchObject({ status: 'ambiguous', count: 2 })
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('aucun compte : refus', async () => {
    const prisma = fakePrisma([account('a', 'autre@exemple.com')])

    expect(await bootstrapFounder(prisma, { target: 'riqui@exemple.com', force: false })).toEqual({
      status: 'not_found',
    })
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('un autre fondateur existe : rien sans --force, promotion avec', async () => {
    const rows = [account('fondateur', 'f@exemple.com', { role: 'fondateur' }), account('a', 'a@exemple.com')]
    const prisma = fakePrisma(rows)

    expect(await bootstrapFounder(prisma, { target: 'a@exemple.com', force: false })).toMatchObject({
      status: 'founder_exists',
    })
    expect(prisma.user.update).not.toHaveBeenCalled()

    expect(await bootstrapFounder(prisma, { target: 'a@exemple.com', force: true })).toMatchObject({
      status: 'promoted',
    })
  })

  it('compte déjà fondateur : rien à faire', async () => {
    const prisma = fakePrisma([account('f', 'f@exemple.com', { role: 'fondateur' })])

    expect(await bootstrapFounder(prisma, { target: 'f@exemple.com', force: false })).toMatchObject({
      status: 'already',
    })
    expect(prisma.user.update).not.toHaveBeenCalled()
  })

  it('par id : promeut ce compte, refuse un invité', async () => {
    const prisma = fakePrisma([account('clx1', null), account('invite', null, { isGuest: true })])

    expect(await bootstrapFounder(prisma, { target: 'clx1', force: false })).toMatchObject({ status: 'promoted' })
    expect(await bootstrapFounder(prisma, { target: 'invite', force: false })).toEqual({ status: 'guest' })
    expect(prisma.$queryRaw).not.toHaveBeenCalled()
  })
})

// ---------------------------------------------------------------------------
// prod-bootstrap-fondateur.sh : exécuté pour de vrai par bash, avec docker,
// su-exec et sqlite3 remplacés par des doublures. Celle de docker exécute le
// bloc `sh -c` localement ; celle de sqlite3 note chaque requête et répond
// d'après FAKE_IDS (ids trouvés pour l'adresse) et FAKE_OTHERS (nombre
// d'autres fondateurs).
// ---------------------------------------------------------------------------

const SCRIPT = path.join(process.cwd(), 'scripts', 'prod-bootstrap-fondateur.sh')

const DOCKER_STUB = `#!/bin/bash
echo "docker $1" >> "$FAKE_LOG"
case "$1" in
  image) exit 0 ;;
  run)
    shift
    envs=()
    while [ $# -gt 0 ]; do
      case "$1" in
        -e) envs+=("$2"); shift 2 ;;
        -v) shift 2 ;;
        sh) exec env "\${envs[@]}" sh -c "$3" ;;
        *) shift ;;
      esac
    done
    ;;
esac
exit 99
`

const SQLITE_STUB = `#!/bin/bash
echo "$2" >> "$FAKE_LOG"
case "$2" in
  "SELECT id FROM User"*) if [ -n "$FAKE_IDS" ]; then printf '%s\\n' "$FAKE_IDS"; fi ;;
  "SELECT count(*) FROM User"*) echo "$FAKE_OTHERS" ;;
  "SELECT email"*) echo "ligne" ;;
esac
exit 0
`

function runScript(args: string[], db: { ids?: string[]; others?: number } = {}) {
  const dir = mkdtempSync(path.join(tmpdir(), 'bootstrap-fondateur-'))
  try {
    const log = path.join(dir, 'appels.log')
    for (const [name, body] of [
      ['docker', DOCKER_STUB],
      ['su-exec', '#!/bin/sh\nshift\nexec "$@"\n'],
      ['sqlite3', SQLITE_STUB],
    ]) {
      writeFileSync(path.join(dir, name), body)
      chmodSync(path.join(dir, name), 0o755)
    }
    const result = spawnSync('bash', [SCRIPT, ...args], {
      encoding: 'utf8',
      env: {
        ...process.env,
        PATH: `${dir}${path.delimiter}${process.env.PATH ?? ''}`,
        FAKE_LOG: log,
        FAKE_IDS: (db.ids ?? []).join('\n'),
        FAKE_OTHERS: String(db.others ?? 0),
      },
    })
    const calls = existsSync(log) ? readFileSync(log, 'utf8').split('\n').filter(Boolean) : []
    return {
      status: result.status,
      output: `${result.stdout}${result.stderr}`,
      docker: calls.some((c) => c.startsWith('docker ')),
      sql: calls.filter((c) => !c.startsWith('docker ')),
      updates: calls.filter((c) => c.startsWith('UPDATE')),
    }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

describe.skipIf(process.platform === 'win32')('prod-bootstrap-fondateur.sh', () => {
  it('sans adresse : refus, aucune adresse par défaut, docker jamais lancé', () => {
    const run = runScript([])
    expect(run.status).toBe(2)
    expect(run.docker).toBe(false)
  })

  it('adresse qui sortirait de la chaîne SQL : refusée avant docker', () => {
    const run = runScript(["x'; DELETE FROM User; --@exemple.com"])
    expect(run.status).toBe(2)
    expect(run.docker).toBe(false)
  })

  it('compte unique, pas d’autre fondateur : promu, sans renommage', () => {
    const run = runScript(['Riqui1251@Gmail.com'], { ids: ['vrai'] })
    expect(run.status).toBe(0)
    expect(run.sql[0]).toContain("lower(email) = 'riqui1251@gmail.com'")
    expect(run.updates).toEqual([
      "UPDATE User SET role = 'fondateur', updatedAt = CURRENT_TIMESTAMP WHERE id = 'vrai';",
    ])
  })

  it('plusieurs comptes pour l’adresse : refus, aucun UPDATE', () => {
    const run = runScript(['riqui@exemple.com'], { ids: ['a', 'b'] })
    expect(run.status).toBe(1)
    expect(run.updates).toEqual([])
  })

  it('compte introuvable : refus, aucun UPDATE', () => {
    const run = runScript(['riqui@exemple.com'], { ids: [] })
    expect(run.status).toBe(1)
    expect(run.updates).toEqual([])
  })

  it('un autre fondateur existe : rien sans --force, promotion avec', () => {
    const refused = runScript(['riqui@exemple.com'], { ids: ['a'], others: 1 })
    expect(refused.status).toBe(1)
    expect(refused.updates).toEqual([])

    const forced = runScript(['riqui@exemple.com', '--force'], { ids: ['a'], others: 1 })
    expect(forced.status).toBe(0)
    expect(forced.updates).toHaveLength(1)
  })
})
