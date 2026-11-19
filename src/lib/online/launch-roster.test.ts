import { describe, expect, it } from 'vitest'
import { launchRosterRefusal } from './launch-roster'
import { getGameAdapter } from './game-adapters'

/** Bornes d'effectif partagées par /launch et /briefing-ack (registre et moteurs réels). */

const room = (gameId: string, settings: Record<string, unknown> = {}) => ({
  gameId,
  settingsJson: JSON.stringify(settings),
})
const players = (n: number) => Array.from({ length: n }, (_, i) => `p${i + 1}`)

describe('launchRosterRefusal', () => {
  it('Téléphone Dessiné : 3 passe, 2 refusé au minimum', () => {
    expect(launchRosterRefusal(room('telephone-dessine'), players(3))).toBeNull()
    expect(launchRosterRefusal(room('telephone-dessine'), players(2))).toEqual({
      code: 'min_players',
      params: { count: 3 },
    })
  })

  it('jeu à bots : le minimum compte humains + bots, pas les bots d’un jeu sans complément', () => {
    const min = getGameAdapter('imposteur')!.minPlayers
    expect(launchRosterRefusal(room('imposteur', { botsCount: min - 1 }), players(1))).toBeNull()
    expect(launchRosterRefusal(room('imposteur', { botsCount: min - 2 }), players(1))?.code).toBe('min_players')
    expect(launchRosterRefusal(room('patate-chaude', { botsCount: 3 }), players(1))?.code).toBe('min_players')
  })

  it('après le briefing : le minimum d’un jeu à bots est laissé au lanceur, pas celui d’un jeu sans bots', () => {
    const min = getGameAdapter('imposteur')!.minPlayers
    const after = { afterBriefing: true }
    expect(launchRosterRefusal(room('imposteur', { botsCount: min - 2 }), players(1), after)).toBeNull()
    expect(launchRosterRefusal(room('chiffre-piege'), players(1), after)).toBeNull()
    expect(launchRosterRefusal(room('telephone-dessine'), players(2), after)?.code).toBe('min_players')
    expect(launchRosterRefusal(room('patate-chaude'), players(1), after)?.code).toBe('min_players')
    const max = getGameAdapter('imposteur')!.maxPlayers
    expect(launchRosterRefusal(room('imposteur', { botsCount: 1 }), players(max), after)?.code).toBe('max_players')
    const alone = { tabouTeams: { p1: 'A', p2: 'A', p3: 'A', p4: 'A', p5: 'B' } }
    expect(launchRosterRefusal(room('tabou', alone), players(5), after)).toEqual({ code: 'team_min_players' })
  })

  it('maximum du registre, bots compris', () => {
    const max = getGameAdapter('imposteur')!.maxPlayers
    expect(launchRosterRefusal(room('imposteur', { botsCount: 1 }), players(max))).toEqual({
      code: 'max_players',
      params: { count: max },
    })
  })

  it('Toucher-Coulé : seule la capacité du format compte', () => {
    expect(launchRosterRefusal(room('toucher-coule'), players(1))).toBeNull()
    expect(launchRosterRefusal(room('toucher-coule'), players(3))?.code).toBe('max_players')
  })

  it('Mots Codés : 2 par équipe après répartition', () => {
    expect(launchRosterRefusal(room('mots-codes'), players(4))).toBeNull()
    const lopsided = { mcTeams: { p1: 'A', p2: 'A', p3: 'A', p4: 'B' } }
    expect(launchRosterRefusal(room('mots-codes', lopsided), players(4))).toEqual({ code: 'team_min_players' })
  })

  it('Tabou : 2 humains par équipe', () => {
    const lopsided = { tabouTeams: { p1: 'A', p2: 'A', p3: 'A', p4: 'B', p5: 'B' } }
    expect(launchRosterRefusal(room('tabou', lopsided), players(5))).toBeNull()
    const alone = { tabouTeams: { p1: 'A', p2: 'A', p3: 'A', p4: 'A', p5: 'B' } }
    expect(launchRosterRefusal(room('tabou', alone), players(5))).toEqual({ code: 'team_min_players' })
  })
})
