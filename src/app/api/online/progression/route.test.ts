import { beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * GET /api/online/progression — forme de la réponse (contrat partagé avec le
 * hook useOnlineProgression) : { progression, lastGain, firstGameFeedback }.
 * Une panne de la lecture d'éligibilité ne prive pas le joueur de sa
 * progression : la carte d'avis ne sort simplement pas.
 */

const { currentUserMock, buildProgressionMock, recallXpGainMock, dueMock } = vi.hoisted(() => ({
  currentUserMock: vi.fn(),
  buildProgressionMock: vi.fn(),
  recallXpGainMock: vi.fn(),
  dueMock: vi.fn(),
}))

vi.mock('@/lib/auth-server', () => ({ getCurrentUser: currentUserMock }))
vi.mock('@/lib/online/progression-server', () => ({ buildProgression: buildProgressionMock }))
vi.mock('@/lib/online/xp', () => ({ recallXpGain: recallXpGainMock }))
vi.mock('@/lib/first-game-feedback-server', () => ({ isFirstGameFeedbackDue: dueMock }))

import { GET } from './route'

const USER = { id: 'u1', role: 'user', onlineXp: 120, isGuest: true }
const PROGRESSION = {
  xp: 120,
  level: 2,
  current: 20,
  required: 150,
  unlockedKeys: ['icon:dice'],
  grantedKeys: [],
  streakCount: 1,
  streakLastDay: '2026-10-07',
}
const GAIN = { base: 40, total: 40 }

beforeEach(() => {
  vi.resetAllMocks()
  currentUserMock.mockResolvedValue(USER)
  buildProgressionMock.mockResolvedValue(PROGRESSION)
  recallXpGainMock.mockReturnValue(GAIN)
  dueMock.mockResolvedValue(false)
})

describe('GET /api/online/progression', () => {
  it('sans compte : 401, aucune lecture', async () => {
    currentUserMock.mockResolvedValue(null)

    const res = await GET()

    expect(res.status).toBe(401)
    expect(buildProgressionMock).not.toHaveBeenCalled()
    expect(dueMock).not.toHaveBeenCalled()
  })

  it('carte due : firstGameFeedback vrai, à côté de la progression et du dernier gain', async () => {
    dueMock.mockResolvedValue(true)

    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ progression: PROGRESSION, lastGain: GAIN, firstGameFeedback: true })
    expect(dueMock).toHaveBeenCalledWith('u1')
  })

  it('carte non due, aucun gain récent : false et null', async () => {
    recallXpGainMock.mockReturnValue(null)

    const res = await GET()

    expect(await res.json()).toEqual({ progression: PROGRESSION, lastGain: null, firstGameFeedback: false })
  })

  it('lecture d’éligibilité en panne : progression servie quand même, carte éteinte', async () => {
    dueMock.mockRejectedValue(new Error('SQLITE_BUSY'))
    const spy = vi.spyOn(console, 'error').mockImplementation(() => {})

    const res = await GET()

    expect(res.status).toBe(200)
    expect(await res.json()).toEqual({ progression: PROGRESSION, lastGain: GAIN, firstGameFeedback: false })
    spy.mockRestore()
  })
})
