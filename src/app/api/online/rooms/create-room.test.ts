import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Garde d'entrée de POST /api/online/rooms : on n'ouvre une table QUE pour un
 * jeu réellement jouable en ligne.
 *
 * Le contrôle ne portait que sur `!hidden`, et les jeux purement locaux
 * (hi-lo, monsieur-3, pmu, plinko) sont visibles au hub — donc pas `hidden`.
 * On pouvait créer une salle pour eux : elle se créait bel et bien, puis
 * n'avait aucun écran en ligne à rendre. Ces tests appellent la vraie route
 * (base, session et cache simulés) pour que le catalogue et la route restent
 * d'accord — un jeu qui perdrait `onlineReady` casserait ici.
 */

const { userMock, roomCreateMock, roomDtoMock, leaveOtherRoomsMock, cookieLang } = vi.hoisted(() => ({
  userMock: vi.fn(),
  roomCreateMock: vi.fn(),
  roomDtoMock: vi.fn(),
  leaveOtherRoomsMock: vi.fn(),
  /** Valeur du cookie de langue (lp_locale) de la requête ; undefined = pas de cookie. */
  cookieLang: { value: undefined as string | undefined },
}))

vi.mock('@/lib/prisma', () => ({ prisma: { onlineRoom: { create: roomCreateMock } } }))
vi.mock('@/lib/auth-server', () => ({ getCurrentUser: userMock }))
vi.mock('next/headers', () => ({
  cookies: async () => ({
    get: (name: string) => (name === 'lp_locale' && cookieLang.value !== undefined ? { value: cookieLang.value } : undefined),
  }),
}))
vi.mock('@/lib/online-room', () => ({
  buildRoomDto: roomDtoMock,
  cleanupAbandonedRooms: vi.fn(),
  createUniqueRoomCode: vi.fn(async () => 'ABCD'),
  leaveOtherRooms: leaveOtherRoomsMock,
}))
vi.mock('@/lib/online/achievements', () => ({ awardAchievement: vi.fn() }))
vi.mock('@/lib/online/lobbies-cache', () => ({ invalidateLobbiesCache: vi.fn() }))

import { POST } from './route'
import { GAMES } from '@/lib/games'

/**
 * Un compte NEUF par requête : la route est aussi limitée en cadence (quota
 * par compte, état gardé d'un test à l'autre dans le module). Sans ça, ajouter
 * quelques cas ici ferait un jour tomber les derniers en 429 — pour une raison
 * qui n'a rien à voir avec ce qu'ils vérifient.
 */
let seq = 0
const nextUserId = () => `u${++seq}`

/** Requête de création telle que l'envoie le client (guichet ou rangée « Rejouer »). */
const createRoom = (gameId: string) => {
  userMock.mockResolvedValue({ id: nextUserId() })
  return POST(
    new Request('http://test/api/online/rooms', { method: 'POST', body: JSON.stringify({ gameId }) })
  )
}

beforeEach(() => {
  vi.resetAllMocks()
  cookieLang.value = undefined
  roomCreateMock.mockResolvedValue({ id: 'room-1' })
  roomDtoMock.mockResolvedValue({ id: 'room-1' })
})

describe('POST /api/online/rooms — jeu jouable en ligne', () => {
  // Les quatre rescapés du pipeline client-autoritaire : visibles au hub, mais
  // sans aucune UI en ligne depuis le retrait de leurs lanceurs.
  for (const gameId of ['hi-lo', 'monsieur-3', 'pmu', 'plinko']) {
    it(`refuse ${gameId}, jeu local visible au hub mais pas jouable en ligne`, async () => {
      const meta = GAMES.find((g) => g.id === gameId)
      // Le piège d'origine : pas `hidden`, donc l'ancien contrôle le laissait passer.
      expect(meta?.hidden, `${gameId} n'est pas masqué du hub`).toBeFalsy()
      expect(meta?.onlineReady, `${gameId} ne doit pas être onlineReady`).toBeFalsy()

      const res = await createRoom(gameId)

      expect(res.status).toBe(400)
      expect((await res.json()).error).toBe('invalid_game')
      // Aucune table fantôme laissée en base.
      expect(roomCreateMock).not.toHaveBeenCalled()
    })
  }

  it('refuse un jeu masqué du hub', async () => {
    const hidden = GAMES.find((g) => g.hidden)
    const res = await createRoom(hidden?.id ?? 'roue-des-gorgees')

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_game')
    expect(roomCreateMock).not.toHaveBeenCalled()
  })

  it('refuse un id de jeu inconnu', async () => {
    const res = await createRoom('jeu-inexistant')

    expect(res.status).toBe(400)
    expect((await res.json()).error).toBe('invalid_game')
    expect(roomCreateMock).not.toHaveBeenCalled()
  })

  it('ouvre bien une table pour un jeu onlineReady', async () => {
    const res = await createRoom('loup-garou')

    expect(res.status).toBe(200)
    expect(roomCreateMock).toHaveBeenCalledTimes(1)
    expect(roomCreateMock.mock.calls[0][0].data).toMatchObject({
      gameId: 'loup-garou',
      hostUserId: (await userMock.mock.results[0].value).id,
    })
  })
})

describe('POST /api/online/rooms — cartes dans la langue de la table', () => {
  it('aucun jeu n’est plus limité au français : Sans Filtre et Dilemmes ont leurs cartes ×4', () => {
    expect(GAMES.filter((g) => g.contentLangs && !g.contentLangs.includes('en'))).toEqual([])
  })

  for (const gameId of ['sans-filtre', 'dilemmes']) {
    for (const lang of ['fr', 'en', 'es', 'it']) {
      it(`ouvre ${gameId} depuis le site en ${lang}, table en ${lang}`, async () => {
        cookieLang.value = lang

        const res = await createRoom(gameId)

        expect(res.status).toBe(200)
        expect(JSON.parse(roomCreateMock.mock.calls[0][0].data.settingsJson).lang).toBe(lang)
      })
    }
  }

  // Le garde-fou reste pour un futur jeu aux cartes non traduites : on le
  // vérifie en posant temporairement contentLangs sur un vrai jeu.
  describe('jeu aux cartes françaises seules (contentLangs)', () => {
    const game = GAMES.find((g) => g.id === 'sans-filtre')!
    beforeEach(() => {
      game.contentLangs = ['fr']
    })
    afterEach(() => {
      delete game.contentLangs
    })

    for (const lang of ['en', 'es', 'it']) {
      it(`refuse depuis le site en ${lang}, sans quitter ni créer de table`, async () => {
        cookieLang.value = lang

        const res = await createRoom('sans-filtre')

        expect(res.status).toBe(400)
        expect((await res.json()).error).toBe('content_lang_unavailable')
        // Refus AVANT leaveOtherRooms : l'hôte garde la place qu'il avait.
        expect(leaveOtherRoomsMock).not.toHaveBeenCalled()
        expect(roomCreateMock).not.toHaveBeenCalled()
      })
    }

    // Français, pas de cookie (première visite, robot) ou cookie inconnu :
    // la table est française, jamais refusée.
    for (const [label, lang] of [
      ['en fr', 'fr'],
      ['sans cookie de langue', undefined],
      ['avec un cookie de langue invalide', 'de'],
    ] as const) {
      it(`ouvre ${label}, table en français`, async () => {
        cookieLang.value = lang

        const res = await createRoom('sans-filtre')

        expect(res.status).toBe(200)
        expect(roomCreateMock).toHaveBeenCalledTimes(1)
        expect(JSON.parse(roomCreateMock.mock.calls[0][0].data.settingsJson).lang).toBe('fr')
      })
    }
  })
})
