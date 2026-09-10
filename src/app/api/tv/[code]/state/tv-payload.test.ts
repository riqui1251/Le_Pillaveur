import { describe, expect, it } from 'vitest'
import type { TvRoomDto } from '@/lib/online-room'
import { toTvDisplayPayload } from './tv-payload'

/** Alias déterministe pour les tests (le vrai passe par un hachage salé). */
const fakeAlias = (id: string) => `alias-${id.slice(-2)}`

function buildRoom(overrides: Partial<TvRoomDto> = {}): TvRoomDto {
  return {
    code: 'ABC123',
    status: 'playing',
    gameId: 'menteur',
    hostUserId: 'ckuser01',
    members: [
      {
        userId: 'ckuser01',
        displayName: 'Alice',
        isHost: true,
        isReady: true,
        preferences: { color: 'bg-amber-500', icon: '🦊', specialEffect: null, iconFrame: null },
        level: 7,
        role: 'user',
      },
      {
        userId: 'ckuser02',
        displayName: 'Bob',
        isHost: false,
        isReady: false,
        preferences: { color: 'bg-emerald-500', icon: '🐼', specialEffect: null, iconFrame: null },
        level: 3,
        role: 'admin',
      },
    ],
    settings: { difficulty: 'normal', lang: 'fr', tcTeams: { ckuser01: 'A' } },
    stateVersion: 12,
    currentTurnUserId: 'ckuser02',
    gameStateJson: JSON.stringify({
      players: [{ id: 'ckuser01', dice: 5 }, { id: 'ckuser02', dice: 4 }],
      currentBid: { by: 'ckuser01' },
    }),
    ...overrides,
  }
}

describe('toTvDisplayPayload', () => {
  it('remplace tous les identifiants de compte par des alias', () => {
    const payload = toTvDisplayPayload(buildRoom(), fakeAlias)
    const raw = JSON.stringify(payload)

    expect(raw).not.toContain('ckuser01')
    expect(raw).not.toContain('ckuser02')
    expect(payload.members.map((m) => m.userId)).toEqual(['alias-01', 'alias-02'])
    expect(payload.hostUserId).toBe('alias-01')
    expect(payload.currentTurnUserId).toBe('alias-02')
  })

  it('garde les correspondances dont dépend le rendu', () => {
    const payload = toTvDisplayPayload(buildRoom(), fakeAlias)
    const state = JSON.parse(payload.gameStateJson ?? '{}') as {
      players: { id: string }[]
      currentBid: { by: string }
    }

    // Le joueur actif et l'auteur de l'enchère restent reliables aux membres.
    expect(state.players.map((p) => p.id)).toEqual(['alias-01', 'alias-02'])
    expect(state.currentBid.by).toBe(payload.members[0].userId)
    expect(payload.members.map((m) => m.displayName)).toEqual(['Alice', 'Bob'])
    expect(payload.members[0].preferences.icon).toBe('🦊')
    expect(payload.members[0].isHost).toBe(true)
  })

  it('retire les réglages de table et le niveau, inutiles à l’affichage', () => {
    const payload = toTvDisplayPayload(buildRoom(), fakeAlias)

    expect(payload.settings).toEqual({})
    expect(payload.members.every((m) => m.level === 0)).toBe(true)
  })

  it('n’invente pas d’alias quand il n’y a pas de tour en cours', () => {
    const payload = toTvDisplayPayload(
      buildRoom({ currentTurnUserId: null, gameStateJson: null }),
      fakeAlias
    )

    expect(payload.currentTurnUserId).toBeNull()
    expect(payload.gameStateJson).toBeNull()
  })

  it('donne le même alias au même identifiant (clés React stables)', () => {
    const room = buildRoom()
    const first = toTvDisplayPayload(room, fakeAlias)
    const second = toTvDisplayPayload(room, fakeAlias)

    expect(first.members[0].userId).toBe(second.members[0].userId)
  })

  it('alias aussi un identifiant absent de la liste des membres', () => {
    // Joueur parti en cours de partie (ou bot remplacé) : il ne figure plus
    // dans `members`, mais son id traîne dans l'état sérialisé — c'est
    // exactement ce que le balayage final doit rattraper.
    const gone = 'cm4x9q7t0000abcdefghijklm'
    const payload = toTvDisplayPayload(
      buildRoom({
        gameStateJson: JSON.stringify({
          players: [{ id: 'ckuser01' }, { id: gone }],
          eliminated: [gone],
          votes: { [gone]: 'ckuser01' },
          roomId: 'cm4x9q7t0001abcdefghijkzy',
        }),
      }),
      fakeAlias
    )
    const raw = payload.gameStateJson ?? ''

    expect(raw).not.toContain(gone)
    expect(raw).not.toContain('cm4x9q7t0001abcdefghijkzy')

    const state = JSON.parse(raw) as {
      players: { id: string }[]
      eliminated: string[]
      votes: Record<string, string>
    }
    // Alias STABLE d'un champ à l'autre : sans ça, l'écran TV afficherait deux
    // joueurs différents là où il n'y en a qu'un.
    const aliasGone = state.players[1].id
    expect(aliasGone).toBe(fakeAlias(gone))
    expect(state.eliminated).toEqual([aliasGone])
    expect(Object.keys(state.votes)).toEqual([aliasGone])
    expect(state.votes[aliasGone]).toBe(payload.members[0].userId)
  })

  it('ne touche pas au reste du texte de l’état de jeu', () => {
    const payload = toTvDisplayPayload(
      buildRoom({
        gameStateJson: JSON.stringify({ phase: 'voting', word: 'chaussette', round: 3 }),
      }),
      fakeAlias
    )

    expect(JSON.parse(payload.gameStateJson ?? '{}')).toEqual({
      phase: 'voting',
      word: 'chaussette',
      round: 3,
    })
  })
})
