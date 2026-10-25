import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  PLAYER_EFFECTS,
  PLAYER_FRAMES,
  PLAYER_ICONS,
  addPlayer,
  getStoredPlayers,
  sanitizePlayer,
  sanitizePlayerPreferences,
  savePlayers,
  type Player,
} from './players'
import { formatPlayerNameHtml } from './playerUtils'

/**
 * Le stockage local (`game_players`) peut déjà contenir une liste empoisonnée
 * par une fusion avec le nuage d'un autre compte : elle est nettoyée à la
 * relecture, et réécrite propre.
 */

const PAYLOAD = 'fire"><img src=x onerror=alert(document.domain)>'

function fakeStorage() {
  const data = new Map<string, string>()
  return {
    data,
    getItem: (key: string) => data.get(key) ?? null,
    setItem: (key: string, value: string) => void data.set(key, value),
    removeItem: (key: string) => void data.delete(key),
  }
}

let storage: ReturnType<typeof fakeStorage>

beforeEach(() => {
  storage = fakeStorage()
  vi.stubGlobal('window', { localStorage: storage })
})

afterEach(() => {
  vi.unstubAllGlobals()
})

// Relu par JSON.parse, comme le stockage ou le nuage : `__proto__` y est une clé ordinaire.
const poisoned = JSON.parse(JSON.stringify({
  id: 'player-1',
  name: 'Marie',
  createdAt: 10,
  evil: '<script>',
  stats: {
    gamesPlayed: 3,
    wins: 'beaucoup',
    totalDrinks: null,
    lastPlayed: 4102444800000,
    gameStats: { 'petit-buveur': { gamesPlayed: 3, wins: 1, totalDrinks: 'x' }, PROTO: { gamesPlayed: 1, wins: 1 } },
  },
  preferences: {
    color: 'bg-red-500" onclick="x',
    icon: '<img src=x onerror=1>',
    specialEffect: PAYLOAD,
    iconFrame: 'gold" onmouseover="x',
    avatar: 'https://espion.example/pixel.png',
    theme: 'sombre',
    extra: 1,
  },
}).replace('"PROTO"', '"__proto__"'))

describe('sanitizePlayer', () => {
  it('ramène un joueur empoisonné aux catalogues et retire les clés inconnues', () => {
    const player = sanitizePlayer(poisoned)
    expect(player).toEqual({
      id: 'player-1',
      name: 'Marie',
      createdAt: 10,
      stats: {
        gamesPlayed: 3,
        wins: 0,
        totalDrinks: 0,
        lastPlayed: 4102444800000,
        gameStats: { 'petit-buveur': { gamesPlayed: 3, wins: 1 } },
      },
      preferences: { color: 'bg-red-500' },
    })
    expect(Object.getPrototypeOf(player!.stats.gameStats)).toBe(Object.prototype)
    expect(formatPlayerNameHtml(player!)).toBe(
      '<span class="player-name player-name-default font-semibold">Marie</span>'
    )
  })

  it('garde tel quel un joueur valide', () => {
    const valid: Player = {
      id: 'player-2',
      name: 'Léo',
      onlineEnabled: false,
      createdAt: 20,
      stats: { gamesPlayed: 1, wins: 1, totalDrinks: 4, favoriteGame: 'hi-lo', lastPlayed: 30, gameStats: { 'hi-lo': { gamesPlayed: 1, wins: 1, totalDrinks: 4 } } },
      preferences: { color: 'bg-teal-500', icon: '🏋️‍♂️', specialEffect: 'galaxy', iconFrame: null },
    }
    expect(sanitizePlayer(valid)).toEqual(valid)
    expect(JSON.stringify(sanitizePlayer(valid))).toBe(JSON.stringify(valid))
  })

  it('ne perd aucune valeur légitime des catalogues', () => {
    for (const icon of PLAYER_ICONS) {
      expect(sanitizePlayerPreferences({ color: 'bg-red-500', icon }).icon).toBe(icon)
    }
    for (const { id } of PLAYER_EFFECTS) {
      expect(sanitizePlayerPreferences({ color: 'bg-red-500', specialEffect: id }).specialEffect).toBe(id)
    }
    for (const { id } of PLAYER_FRAMES) {
      expect(sanitizePlayerPreferences({ color: 'bg-red-500', iconFrame: id }).iconFrame).toBe(id)
    }
    // Couleurs posées par addPlayer (DEFAULT_COLORS, une par rang).
    for (let i = 0; i < 12; i++) addPlayer(`Joueur ${String.fromCharCode(65 + i)}`)
    const colors = getStoredPlayers().map((player) => player.preferences.color)
    expect(new Set(colors).size).toBe(12)
    expect(colors.map((color) => sanitizePlayerPreferences({ color }).color)).toEqual(colors)
  })

  it('rejette ce qui n’est pas un objet, remplace un id illisible', () => {
    expect(sanitizePlayer(null)).toBeNull()
    expect(sanitizePlayer('Marie')).toBeNull()
    expect(sanitizePlayer([])).toBeNull()
    const player = sanitizePlayer({ ...poisoned, id: '"><img>' })
    expect(player?.id).toMatch(/^player-/)
  })
})

describe('getStoredPlayers — stockage déjà empoisonné', () => {
  it('nettoie la liste relue et la réécrit propre', () => {
    storage.setItem('game_players', JSON.stringify([poisoned, null, 'x']))

    const players = getStoredPlayers()
    expect(players).toHaveLength(1)
    expect(players[0]?.preferences).toEqual({ color: 'bg-red-500' })
    expect(storage.data.get('game_players')).not.toContain('onerror')
    expect(storage.data.get('game_players')).not.toContain('espion')
  })

  it('ne réécrit pas une liste déjà propre', () => {
    savePlayers([sanitizePlayer({ ...poisoned, preferences: { color: 'bg-blue-500', specialEffect: 'fire' } })!])
    const setItem = vi.spyOn(storage, 'setItem')
    expect(getStoredPlayers()[0]?.preferences.specialEffect).toBe('fire')
    expect(setItem).not.toHaveBeenCalled()
  })

  it('rend une liste vide pour un contenu qui n’est pas un tableau', () => {
    storage.setItem('game_players', JSON.stringify({ players: [] }))
    expect(getStoredPlayers()).toEqual([])
  })
})
