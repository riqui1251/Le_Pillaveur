import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { OpsLive, OpsStatusResponse } from '@/lib/ops-status-types'

/**
 * GET /api/admin/ops-status — onglet « Surveillance ». La vraie route (garde
 * et rôles réels ; session et collectes simulées) : fondateurs seulement,
 * aucune lecture pour les autres, jamais de cache, et rien du compte qui
 * demande dans la réponse.
 */

const { userMock, collectOpsLiveMock, readOpsStatusMock } = vi.hoisted(() => ({
  userMock: vi.fn(),
  collectOpsLiveMock: vi.fn(),
  readOpsStatusMock: vi.fn(),
}))

vi.mock('@/lib/auth-server', () => ({ getCurrentUser: userMock }))
vi.mock('@/lib/ops-live', () => ({ collectOpsLive: collectOpsLiveMock }))
vi.mock('@/lib/ops-status', () => ({ readOpsStatus: readOpsStatusMock }))

import { GET, dynamic, runtime } from './route'

/** Compte connecté : de vraies données personnelles, qui ne doivent pas ressortir. */
const account = (role: string) => ({
  id: 'cm1fondateur000000000000',
  email: 'fondateur@exemple.fr',
  displayName: 'PseudoDuFondateur',
  onlineDisplayName: 'PseudoEnLigne',
  accountCode: 'ABCD-1234',
  role,
})

const LIVE: OpsLive = {
  buildSha: 'abc1234',
  uptimeSec: 3600,
  memory: { rssMb: 180, heapUsedMb: 90 },
  db: { up: true, latencyMs: 2 },
  disk: { freePct: 41 },
  streams: { total: 3, accounts: 2, maxPerAccount: 2 },
  clientErrors24h: 0,
  scheduler: [
    {
      name: 'retention',
      cron: '30 4 * * *',
      tz: 'Europe/Paris',
      lastRun: { at: '2026-09-26T02:30:00.000Z', outcome: 'done', durationMs: 1200 },
    },
  ],
  retentionLastRun: { at: '2026-09-26T02:30:00.000Z', ok: true },
}

const STATUS = {
  statusDirFound: true,
  jobs: [
    {
      job: 'probe',
      state: 'ok',
      maxAgeMs: 15 * 60 * 1000,
      record: {
        v: 1,
        job: 'probe',
        ok: true,
        code: 'ok',
        at: '2026-09-26T09:55:00.000Z',
        detail: '',
        metrics: { httpCode: 200, ms: 83 },
      },
    },
    {
      job: 'backup-daily',
      state: 'ok',
      maxAgeMs: 26 * 60 * 60 * 1000,
      record: {
        v: 1,
        job: 'backup-daily',
        ok: true,
        code: 'ok',
        at: '2026-09-26T01:00:02.000Z',
        detail: 'prod-2026-09-26_0300.db.gz',
        metrics: { sizeBytes: 1234567 },
      },
    },
    { job: 'offsite', state: 'unknown', maxAgeMs: 26 * 60 * 60 * 1000, record: null },
  ],
}

/** Toutes les clés d'un JSON, à toute profondeur. */
function allKeys(value: unknown, keys: string[] = []): string[] {
  if (Array.isArray(value)) {
    for (const item of value) allKeys(item, keys)
  } else if (value && typeof value === 'object') {
    for (const [key, child] of Object.entries(value)) {
      keys.push(key)
      allKeys(child, keys)
    }
  }
  return keys
}

/**
 * Mots d'une clé camelCase ou snake_case (« lastIp » → last, ip). Découpés
 * plutôt que cherchés en sous-chaîne : `ship` ou `tip` ne sont pas des IP.
 */
function keyWords(key: string): string[] {
  return key
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .split(/[\s_-]+/)
}

/** Ce qui désignerait une personne : e-mail, IP, pseudo, identifiant de compte. */
const PERSONAL_WORDS = new Set([
  'email',
  'mail',
  'ip',
  'ipv4',
  'ipv6',
  'pseudo',
  'nickname',
  'display',
  'user',
  'username',
  'userid',
  'login',
  'country',
  'phone',
])

beforeEach(() => {
  vi.resetAllMocks()
  collectOpsLiveMock.mockResolvedValue(LIVE)
  readOpsStatusMock.mockResolvedValue(STATUS)
  vi.spyOn(console, 'error').mockImplementation(() => {})
})

describe('GET /api/admin/ops-status — accès', () => {
  it('se déclare dynamique et en Node', () => {
    expect(runtime).toBe('nodejs')
    expect(dynamic).toBe('force-dynamic')
  })

  it('403 sans compte connecté, sans rien lire', async () => {
    userMock.mockResolvedValue(null)
    const res = await GET()
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'Accès refusé' })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
    expect(collectOpsLiveMock).not.toHaveBeenCalled()
    expect(readOpsStatusMock).not.toHaveBeenCalled()
  })

  it('403 pour tous les grades sous le fondateur, super admin compris', async () => {
    for (const role of ['user', 'moderator', 'admin', 'superadmin']) {
      userMock.mockResolvedValue(account(role))
      const res = await GET()
      expect(res.status, role).toBe(403)
      expect(res.headers.get('Cache-Control'), role).toBe('no-store')
    }
    expect(collectOpsLiveMock).not.toHaveBeenCalled()
    expect(readOpsStatusMock).not.toHaveBeenCalled()
  })

  it('200 pour le fondateur, jamais mis en cache', async () => {
    userMock.mockResolvedValue(account('fondateur'))
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get('Cache-Control')).toBe('no-store')

    const body = (await res.json()) as OpsStatusResponse
    expect(body).toEqual({
      generatedAt: expect.any(String),
      live: LIVE,
      jobs: STATUS.jobs,
      statusDirFound: true,
    })
    expect(Number.isNaN(Date.parse(body.generatedAt))).toBe(false)
    // Dossier lu depuis l'environnement, pas depuis la requête.
    expect(readOpsStatusMock).toHaveBeenCalledWith()
  })

  it('500 neutre si la session elle-même casse', async () => {
    userMock.mockRejectedValue(new Error('session illisible'))
    const res = await GET()
    expect(res.status).toBe(500)
    expect(await res.json()).toEqual({ error: 'Erreur serveur' })
    expect(res.headers.get('Cache-Control')).toBe('no-store')
  })
})

describe('GET /api/admin/ops-status — RGPD', () => {
  it('aucune clé qui ressemble à un e-mail, une IP ou un pseudo', async () => {
    userMock.mockResolvedValue(account('fondateur'))
    const body = await (await GET()).json()
    const suspicious = allKeys(body).filter((key) =>
      keyWords(key).some((word) => PERSONAL_WORDS.has(word))
    )
    expect(suspicious).toEqual([])
  })

  it('rien du compte qui demande, et aucune valeur en forme d’e-mail ou d’IP', async () => {
    const viewer = account('fondateur')
    userMock.mockResolvedValue(viewer)
    const text = await (await GET()).text()
    for (const value of [viewer.id, viewer.email, viewer.displayName, viewer.onlineDisplayName, viewer.accountCode]) {
      expect(text).not.toContain(value)
    }
    expect(text).not.toMatch(/[^\s"@]+@[^\s"@]+\.[a-z]{2,}/i)
    expect(text).not.toMatch(/\b\d{1,3}(?:\.\d{1,3}){3}\b/)
  })
})
