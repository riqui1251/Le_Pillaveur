import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * POST /api/chat/report — signalement. Vraie route, vrai dossier (reports.ts),
 * base simulée. Un harceleur retirait l'ami (ou la victime le bloquait) et ses
 * messages privés ne pouvaient plus être signalés : un MESSAGE d'un canal
 * `friend:<a>:<b>` se signale désormais tant qu'on est l'un des deux
 * participants et que le message appartient bien à ce canal — sans ouvrir de
 * porte vers les conversations des autres.
 */

const { chatMessageDb, abuseReportDb, currentUserMock, areFriendsMock, isBlockedMock } = vi.hoisted(() => ({
  chatMessageDb: { findUnique: vi.fn(), findMany: vi.fn() },
  abuseReportDb: { findFirst: vi.fn(), create: vi.fn() },
  currentUserMock: vi.fn(),
  areFriendsMock: vi.fn(),
  isBlockedMock: vi.fn(),
}))

vi.mock('@/lib/prisma', () => ({
  prisma: { chatMessage: chatMessageDb, abuseReport: abuseReportDb },
}))
vi.mock('@/lib/auth-server', () => ({ getCurrentUser: currentUserMock }))
vi.mock('@/lib/friends', () => ({ areFriends: areFriendsMock }))
vi.mock('@/lib/moderation/blocks', () => ({ isBlockedBetween: isBlockedMock }))

import { POST } from './route'

const HARASSER = 'charceleur0000000000001'
const STRANGER = 'cetranger00000000000001'
const channelOf = (a: string, b: string) => `friend:${[a, b].sort().join(':')}`

/** Victime distincte par test : le quota de signalements par compte vit en mémoire. */
let VICTIM = ''
let PRIVATE_CHANNEL = ''

const send = (body: unknown, headers: Record<string, string> = {}) =>
  POST(
    new Request('http://test/api/chat/report', {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body),
    })
  )

const reportMessage = (messageId: string, friendUserId = HARASSER) =>
  send({ scope: 'friend', friendUserId, messageId, reason: 'threat' })

const storedMessage = (channel: string, senderId = HARASSER) => ({
  id: 'msg-1',
  senderId,
  channel,
  body: 'Je sais où tu habites',
  createdAt: new Date('2026-10-20T21:00:00Z'),
  sender: { displayName: 'Harceleur' },
})

let seq = 0

beforeEach(() => {
  vi.clearAllMocks()
  seq += 1
  VICTIM = `cvictime${String(seq).padStart(15, '0')}`
  PRIVATE_CHANNEL = channelOf(VICTIM, HARASSER)
  currentUserMock.mockResolvedValue({ id: VICTIM })
  areFriendsMock.mockResolvedValue(false)
  isBlockedMock.mockResolvedValue(false)
  chatMessageDb.findMany.mockResolvedValue([])
  abuseReportDb.findFirst.mockResolvedValue(null)
  abuseReportDb.create.mockResolvedValue({ id: 'dossier-1' })
})

describe('message privé, amitié rompue ou blocage', () => {
  it('ami retiré par le harceleur : le message se signale quand même', async () => {
    chatMessageDb.findUnique.mockResolvedValue(storedMessage(PRIVATE_CHANNEL))

    const res = await reportMessage('msg-1')

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ status: 'created', reportId: 'dossier-1' })
    expect(abuseReportDb.create).toHaveBeenCalledTimes(1)
    expect(abuseReportDb.create.mock.calls[0][0].data).toMatchObject({
      reporterId: VICTIM,
      reportedUserId: HARASSER,
      targetType: 'message',
      messageId: 'msg-1',
      channel: PRIVATE_CHANNEL,
    })
    expect(areFriendsMock).not.toHaveBeenCalled()
  })

  it('harceleur bloqué par la victime : le message se signale quand même', async () => {
    areFriendsMock.mockResolvedValue(false)
    isBlockedMock.mockResolvedValue(true)
    chatMessageDb.findUnique.mockResolvedValue(storedMessage(PRIVATE_CHANNEL))

    const res = await reportMessage('msg-1')

    expect(res.status).toBe(200)
    expect(abuseReportDb.create).toHaveBeenCalledTimes(1)
  })

  it('message d’une conversation dont on n’est pas participant : 404, aucun dossier', async () => {
    const othersChannel = channelOf(HARASSER, STRANGER)
    chatMessageDb.findUnique.mockResolvedValue(storedMessage(othersChannel))

    // Que l'appelant désigne l'un ou l'autre des participants, le canal calculé est le sien.
    for (const friendUserId of [HARASSER, STRANGER]) {
      const res = await reportMessage('msg-1', friendUserId)
      expect(res.status).toBe(404)
    }
    expect(abuseReportDb.create).not.toHaveBeenCalled()
  })

  it('message d’un salon de partie présenté comme privé : 404', async () => {
    chatMessageDb.findUnique.mockResolvedValue(storedMessage('room:salle-1'))
    expect((await reportMessage('msg-1')).status).toBe(404)
    expect(abuseReportDb.create).not.toHaveBeenCalled()
  })

  it('identifiant forgé avec « : » pour viser un autre canal : contrôle ordinaire (403)', async () => {
    chatMessageDb.findUnique.mockResolvedValue(storedMessage(PRIVATE_CHANNEL))
    const res = await reportMessage('msg-1', `${HARASSER}:${STRANGER}`)
    expect(res.status).toBe(403)
    expect(abuseReportDb.create).not.toHaveBeenCalled()
  })

  it('son propre message : refusé', async () => {
    chatMessageDb.findUnique.mockResolvedValue(storedMessage(PRIVATE_CHANNEL, VICTIM))
    expect((await reportMessage('msg-1')).status).toBe(400)
    expect(abuseReportDb.create).not.toHaveBeenCalled()
  })
})

describe('signalement d’un JOUEUR sans message : droits inchangés', () => {
  it('sans amitié, pas de dossier contre un identifiant glané ailleurs (403)', async () => {
    const res = await send({ scope: 'friend', friendUserId: HARASSER, reportedUserId: HARASSER, reason: 'harassment' })
    expect(res.status).toBe(403)
    expect(areFriendsMock).toHaveBeenCalled()
    expect(abuseReportDb.create).not.toHaveBeenCalled()
  })
})

describe('enveloppe commune', () => {
  it('envoi depuis un autre site : 403 cross_site_request, rien d’écrit', async () => {
    chatMessageDb.findUnique.mockResolvedValue(storedMessage(PRIVATE_CHANNEL))
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    const res = await send(
      { scope: 'friend', friendUserId: HARASSER, messageId: 'msg-1', reason: 'threat' },
      { 'sec-fetch-site': 'cross-site' }
    )
    expect(res.status).toBe(403)
    expect(await res.json()).toEqual({ error: 'cross_site_request', code: 'cross_site_request' })
    expect(abuseReportDb.create).not.toHaveBeenCalled()
    warn.mockRestore()
  })
})
