import { describe, expect, it, vi } from 'vitest'
import {
  createProgressionStore,
  parseProgressionPayload,
  type OnlineProgression,
  type ProgressionPayload,
} from './useOnlineProgression'

/**
 * Le store partagé de la progression doit tenir ces promesses :
 *  - les composants montés ENSEMBLE partagent une seule requête ;
 *  - un composant monté PLUS TARD obtient une réponse postérieure à son
 *    montage (l'écran de fin ne lit jamais l'XP d'avant la partie) ;
 *  - refresh() relance et notifie TOUS les abonnés ;
 *  - une réponse doublée par une plus récente, ou arrivée après une
 *    déconnexion / un changement de compte, est jetée ;
 *  - un échec garde l'état précédent sans laisser le chargement pendre.
 */

function progression(xp: number): OnlineProgression {
  return {
    xp,
    level: 1,
    current: xp,
    required: 100,
    unlockedKeys: [],
    grantedKeys: [],
    streakCount: 0,
    streakLastDay: null,
  }
}

function payload(xp: number, extra: Partial<ProgressionPayload> = {}): ProgressionPayload {
  return { progression: progression(xp), lastGain: null, firstGameFeedback: false, ...extra }
}

/** Requêtes résolues à la main, dans l'ordre que le test choisit. */
function manualFetcher() {
  const pending: Array<(value: ProgressionPayload | null) => void> = []
  const fetcher = vi.fn(
    () => new Promise<ProgressionPayload | null>((resolve) => pending.push(resolve))
  )
  return { fetcher, pending }
}

describe('createProgressionStore', () => {
  it('composants montés ensemble : une seule requête, un seul instantané', async () => {
    const { fetcher, pending } = manualFetcher()
    const store = createProgressionStore(fetcher)
    const mountSeq = store.startedSeq()

    const a = store.ensure('u1', mountSeq)
    const b = store.ensure('u1', mountSeq)
    const c = store.ensure('u1', mountSeq)
    expect(fetcher).toHaveBeenCalledTimes(1)

    pending[0](payload(120))
    await Promise.all([a, b, c])
    expect(store.getSnapshot().progression?.xp).toBe(120)
    expect(store.getSnapshot().userId).toBe('u1')
    expect(store.getSnapshot().seq).toBeGreaterThan(mountSeq)
  })

  it('réponse déjà arrivée après le montage : pas de nouvelle requête', async () => {
    const { fetcher, pending } = manualFetcher()
    const store = createProgressionStore(fetcher)
    const mountSeq = store.startedSeq()
    const first = store.ensure('u1', mountSeq)
    pending[0](payload(10))
    await first

    await store.ensure('u1', mountSeq)
    expect(fetcher).toHaveBeenCalledTimes(1)
  })

  it('composant monté plus tard : nouvelle requête, l’ancien instantané ne lui suffit pas', async () => {
    const { fetcher, pending } = manualFetcher()
    const store = createProgressionStore(fetcher)
    const first = store.ensure('u1', store.startedSeq())
    pending[0](payload(10))
    await first

    // L'écran de fin monte après la partie : son repère est postérieur.
    const laterMount = store.startedSeq()
    const later = store.ensure('u1', laterMount)
    expect(fetcher).toHaveBeenCalledTimes(2)
    pending[1](payload(60))
    await later
    expect(store.getSnapshot().progression?.xp).toBe(60)
  })

  it('abonné différé avec le repère de l’écran de fin : il réutilise la lecture de la bannière', async () => {
    const { fetcher, pending } = manualFetcher()
    const store = createProgressionStore(fetcher)
    // Fiche ou lobby, avant la partie.
    const before = store.ensure('u1', store.startedSeq())
    pending[0](payload(10))
    await before

    // L'écran de fin note son repère, puis la bannière monte et lit.
    const screenMark = store.startedSeq()
    const banner = store.ensure('u1', screenMark)
    expect(fetcher).toHaveBeenCalledTimes(2)

    // L'avis de 1re partie monte en différé : en vol, il rejoint la lecture…
    const joined = store.ensure('u1', screenMark)
    expect(fetcher).toHaveBeenCalledTimes(2)
    pending[1](payload(60, { firstGameFeedback: true }))
    await Promise.all([banner, joined])

    // … arrivée, il s'en contente ; sans le repère (le sien, plus récent),
    // il en aurait relancé une.
    await store.ensure('u1', screenMark)
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(store.getSnapshot().firstGameFeedback).toBe(true)
    void store.ensure('u1', store.startedSeq())
    expect(fetcher).toHaveBeenCalledTimes(3)
    pending[2](payload(60))
  })

  it('refresh relance la requête et notifie tous les abonnés', async () => {
    const { fetcher, pending } = manualFetcher()
    const store = createProgressionStore(fetcher)
    const first = store.ensure('u1', 0)
    pending[0](payload(10))
    await first

    const listenerA = vi.fn()
    const listenerB = vi.fn()
    store.subscribe(listenerA)
    const unsubscribeB = store.subscribe(listenerB)

    const refreshed = store.refresh('u1')
    expect(fetcher).toHaveBeenCalledTimes(2)
    pending[1](payload(70, { firstGameFeedback: true }))
    await refreshed
    expect(listenerA).toHaveBeenCalled()
    expect(listenerB).toHaveBeenCalled()
    expect(store.getSnapshot().progression?.xp).toBe(70)
    expect(store.getSnapshot().firstGameFeedback).toBe(true)

    // Désabonné : plus notifié.
    unsubscribeB()
    listenerB.mockClear()
    const again = store.refresh('u1')
    pending[2](payload(80))
    await again
    expect(listenerB).not.toHaveBeenCalled()
  })

  it('une réponse arrivée après une plus récente est jetée', async () => {
    const { fetcher, pending } = manualFetcher()
    const store = createProgressionStore(fetcher)
    const older = store.refresh('u1')
    const newer = store.refresh('u1')
    pending[1](payload(200))
    await newer
    pending[0](payload(100))
    await older
    expect(store.getSnapshot().progression?.xp).toBe(200)
  })

  it('un montage rejoint la requête la plus récente en vol', async () => {
    const { fetcher, pending } = manualFetcher()
    const store = createProgressionStore(fetcher)
    const mountSeq = store.startedSeq()
    void store.refresh('u1')
    void store.refresh('u1')
    const joined = store.ensure('u1', mountSeq)
    expect(fetcher).toHaveBeenCalledTimes(2)
    pending[1](payload(50))
    await joined
    expect(store.getSnapshot().progression?.xp).toBe(50)
  })

  it('échec : l’état précédent reste, mais la requête compte comme arrivée', async () => {
    const fetcher = vi
      .fn<() => Promise<ProgressionPayload | null>>()
      .mockResolvedValueOnce(payload(40))
      .mockResolvedValueOnce(null)
      .mockRejectedValueOnce(new Error('réseau'))
    const store = createProgressionStore(fetcher)
    await store.ensure('u1', 0)
    const seqAfterFirst = store.getSnapshot().seq
    expect(store.getSnapshot().dataSeq).toBe(seqAfterFirst)

    await store.refresh('u1')
    expect(store.getSnapshot().progression?.xp).toBe(40)
    expect(store.getSnapshot().seq).toBeGreaterThan(seqAfterFirst)
    // Arrivée, mais pas fraîche : les données restent celles de la 1re lecture.
    expect(store.getSnapshot().dataSeq).toBe(seqAfterFirst)

    const seqAfterSecond = store.getSnapshot().seq
    await store.refresh('u1')
    expect(store.getSnapshot().progression?.xp).toBe(40)
    expect(store.getSnapshot().seq).toBeGreaterThan(seqAfterSecond)
    expect(store.getSnapshot().dataSeq).toBe(seqAfterFirst)
  })

  it('écran de fin dont la lecture échoue : arrivée, mais jamais « fraîche »', async () => {
    const { fetcher, pending } = manualFetcher()
    const store = createProgressionStore(fetcher)
    // Instantané d'avant la partie (fiche, lobby, partie précédente).
    const before = store.ensure('u1', store.startedSeq())
    pending[0](payload(50))
    await before

    // La bannière monte après la partie ; sa lecture échoue (4G, 5xx).
    const bannerMount = store.startedSeq()
    const failed = store.ensure('u1', bannerMount)
    pending[1](null)
    await failed
    const snapshot = store.getSnapshot()
    expect(snapshot.seq).toBeGreaterThan(bannerMount) // chargement terminé…
    expect(snapshot.dataSeq).toBeLessThanOrEqual(bannerMount) // … données d'avant
    expect(snapshot.progression?.xp).toBe(50)

    // La relance réussit : les données deviennent fraîches pour ce montage.
    const retried = store.refresh('u1')
    pending[2](payload(110))
    await retried
    expect(store.getSnapshot().dataSeq).toBeGreaterThan(bannerMount)
    expect(store.getSnapshot().progression?.xp).toBe(110)
  })

  it('déconnexion : l’instantané disparaît et la réponse en vol est jetée', async () => {
    const { fetcher, pending } = manualFetcher()
    const store = createProgressionStore(fetcher)
    const inFlight = store.ensure('u1', 0)
    store.clear()
    pending[0](payload(90))
    await inFlight
    expect(store.getSnapshot().userId).toBeNull()
    expect(store.getSnapshot().progression).toBeNull()

    // Et la requête suivante repart de zéro (rien de rejoint).
    void store.ensure('u1', 0)
    expect(fetcher).toHaveBeenCalledTimes(2)
  })

  it('changement de compte : rien de l’ancien ne fuite, sa réponse tardive est jetée', async () => {
    const { fetcher, pending } = manualFetcher()
    const store = createProgressionStore(fetcher)
    const forA = store.ensure('a', 0)
    const forB = store.ensure('b', 0)
    // Le compte B ne rejoint pas la requête de A.
    expect(fetcher).toHaveBeenCalledTimes(2)
    expect(store.getSnapshot().userId).toBe('b')
    expect(store.getSnapshot().progression).toBeNull()

    pending[0](payload(999))
    await forA
    expect(store.getSnapshot().progression).toBeNull()
    pending[1](payload(5))
    await forB
    expect(store.getSnapshot()).toMatchObject({ userId: 'b', progression: { xp: 5 } })
  })
})

describe('parseProgressionPayload', () => {
  it('lit la réponse complète de la route', () => {
    const lastGain = {
      reason: 'win' as const,
      base: 50,
      streakBonus: 10,
      total: 60,
      streakCount: 1,
      xpBefore: 40,
      xpAfter: 100,
      levelBefore: 1,
      levelAfter: 2,
      achievements: ['first_game'],
    }
    const parsed = parseProgressionPayload({
      progression: { ...progression(100), level: 2, streakCount: 3, streakLastDay: '2026-10-07' },
      lastGain,
      firstGameFeedback: true,
    })
    expect(parsed?.progression).toMatchObject({ xp: 100, level: 2, streakCount: 3, streakLastDay: '2026-10-07' })
    expect(parsed?.lastGain).toEqual(lastGain)
    expect(parsed?.firstGameFeedback).toBe(true)
  })

  it('tolère un serveur antérieur (ni série, ni dernier gain, ni avis)', () => {
    const parsed = parseProgressionPayload({
      progression: { xp: 30, level: 1, current: 30, required: 100, unlockedKeys: ['icon:chope'], grantedKeys: [] },
    })
    expect(parsed).toEqual({
      progression: {
        xp: 30,
        level: 1,
        current: 30,
        required: 100,
        unlockedKeys: ['icon:chope'],
        grantedKeys: [],
        streakCount: 0,
        streakLastDay: null,
      },
      lastGain: null,
      firstGameFeedback: false,
    })
  })

  it('seul un vrai `true` vaut demande d’avis', () => {
    const base = { progression: progression(0) }
    expect(parseProgressionPayload({ ...base, firstGameFeedback: 'true' })?.firstGameFeedback).toBe(false)
    expect(parseProgressionPayload({ ...base, firstGameFeedback: 1 })?.firstGameFeedback).toBe(false)
  })

  it('réponse illisible : null', () => {
    expect(parseProgressionPayload(null)).toBeNull()
    expect(parseProgressionPayload({})).toBeNull()
    expect(parseProgressionPayload({ progression: { level: 1 } })).toBeNull()
    expect(parseProgressionPayload({ error: 'auth_required' })).toBeNull()
  })
})
