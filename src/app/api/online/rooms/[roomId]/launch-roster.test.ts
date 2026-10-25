import { describe, expect, it, vi } from 'vitest'

/**
 * checkLaunchRoster — les bornes d'effectif communes au lancement (POST
 * /launch) et à la fin du briefing (briefing-start.ts). Registre, adaptateurs
 * et répartition des équipes réels ; la base n'est pas lue.
 */

vi.mock('@/lib/prisma', () => ({ prisma: {} }))

import { checkLaunchRoster } from './launch-roster'

const players = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`)
const room = (gameId: string, settings: Record<string, unknown> = {}) => ({
  gameId,
  settingsJson: JSON.stringify({ difficulty: 'normal', lang: 'fr', ...settings }),
})

describe('checkLaunchRoster', () => {
  it('Petit Bac seul : min_players (2)', () => {
    expect(checkLaunchRoster(room('petit-bac'), players(1))).toEqual({ code: 'min_players', count: 2 })
    expect(checkLaunchRoster(room('petit-bac'), players(2))).toBeNull()
  })

  it('Téléphone Dessiné à 2 : min_players (3), les bots réglés ne comptent pas', () => {
    expect(checkLaunchRoster(room('telephone-dessine', { botsCount: 4 }), players(2))).toEqual({
      code: 'min_players',
      count: 3,
    })
  })

  it('Mots Codés : 4 joueurs dont 3 en or → team_min_players', () => {
    const mcTeams = { p1: 'A', p2: 'A', p3: 'A', p4: 'B' }
    expect(checkLaunchRoster(room('mots-codes', { mcTeams }), players(4))).toEqual({ code: 'team_min_players' })
    expect(checkLaunchRoster(room('mots-codes'), players(4))).toBeNull()
  })

  it('Tabou Vocal : 2 contre 1 humains → refusé, jamais complété par un bot', () => {
    const tabouTeams = { p1: 'A', p2: 'A', p3: 'B' }
    expect(checkLaunchRoster(room('tabou', { tabouTeams }), players(3))).toEqual({ code: 'min_players', count: 4 })
    expect(
      checkLaunchRoster(room('tabou', { tabouTeams: { ...tabouTeams, p4: 'A' } }), players(4))
    ).toEqual({ code: 'team_min_players' })
  })

  it('Toucher-Coulé : capacité par format d’équipes', () => {
    expect(checkLaunchRoster(room('toucher-coule'), players(3))).toEqual({ code: 'max_players', count: 2 })
    expect(checkLaunchRoster(room('toucher-coule'), players(1))).toBeNull()
  })

  it('Petit Buveur : un humain et un bot suffisent', () => {
    expect(checkLaunchRoster(room('petit-buveur', { botsCount: 1 }), players(1))).toBeNull()
  })
})
