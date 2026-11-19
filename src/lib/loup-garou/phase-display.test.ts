import { describe, expect, it } from 'vitest'
import { toLGClientView, toLGSpectatorView, type LGPhase, type LGPlayer, type LGState } from './engine'
import { lgPhaseDisplay } from './phase-display'

/**
 * Les sous-phases de nuit n'existent que si leur rôle est vivant : leur
 * libellé, leur chrono ou une animation à chaque sous-phase trahiraient les
 * rôles en jeu. Seul l'acteur (et le fantôme) voit la sous-phase précise.
 */

const P = (id: string, role: LGPlayer['role'], extra: Partial<LGPlayer> = {}): LGPlayer => ({
  id,
  name: id.toUpperCase(),
  isBot: false,
  leftAt: null,
  role,
  alive: true,
  sips: 0,
  ...extra,
})

const PLAYERS = [
  P('loup1', 'loup'),
  P('voy', 'voyante'),
  P('sor', 'sorciere'),
  P('gar', 'salvateur'),
  P('cor', 'corbeau'),
  P('vil1', 'villageois'),
  P('vil2', 'villageois', { alive: false }),
]

function craft(phase: LGPhase, phaseSeq: number): LGState {
  return {
    version: 1,
    phase,
    phaseSeq,
    phaseEndsAt: 2_000_000,
    players: PLAYERS,
    round: 2,
    debateMs: 120_000,
    wolfVotes: {},
    seerPeeks: [],
    witchSaveUsed: false,
    witchKillUsed: false,
    witchActed: false,
    nightVictimId: null,
    witchSavedId: null,
    witchKillId: null,
    guardProtectedId: null,
    guardLastProtectedId: null,
    ravenTargetId: null,
    elderLifeUsed: false,
    elderAttackedRound: null,
    mayorId: null,
    mayorVotes: {},
    dayVotes: {},
    debateSkips: [],
    debateSpeech: [],
    revoteCandidates: null,
    pendingHunterId: null,
    afterHunter: null,
    lastNightDeaths: [],
    lastVoteResult: null,
    deaths: [],
    winnerTeam: null,
    rematchVotes: [],
    rngState: 1,
  }
}

const NIGHT: [LGPhase, string][] = [
  ['night-guard', 'gar'],
  ['night-seer', 'voy'],
  ['night-raven', 'cor'],
  ['night-wolves', 'loup1'],
  ['night-witch', 'sor'],
]

const display = (phase: LGPhase, viewerId: string, seq = 5) =>
  lgPhaseDisplay(toLGClientView(craft(phase, seq), viewerId), viewerId)

describe('libellé de la phase de nuit', () => {
  it('l’acteur garde son libellé précis et son chrono', () => {
    for (const [phase, actor] of NIGHT) {
      const d = display(phase, actor)
      expect(d.labelKey, phase).toBe(`phases.${phase}`)
      expect(d.countdown, phase).toBe(true)
    }
  })

  it('un vivant qui n’agit pas, loup compris pendant la Voyante, voit la nuit générique sans chrono', () => {
    for (const [phase, actor] of NIGHT) {
      for (const viewer of ['loup1', 'voy', 'sor', 'gar', 'cor', 'vil1'].filter((id) => id !== actor)) {
        const d = display(phase, viewer)
        expect(d.labelKey, `${phase} ${viewer}`).toBe('phases.night')
        expect(d.countdown, `${phase} ${viewer}`).toBe(false)
      }
    }
  })

  it('le dormeur garde le même écran d’une sous-phase à l’autre (ni clignotement ni animation)', () => {
    const keys = NIGHT.map(([phase], i) => display(phase, 'vil1', 10 + i).screenKey)
    expect(new Set(keys).size).toBe(1)
    // L'acteur, lui, change d'écran.
    expect(display('night-seer', 'voy', 11).screenKey).not.toBe(display('night-guard', 'voy', 10).screenKey)
  })

  it('la TV (spectateur neutre) voit la nuit générique', () => {
    for (const [phase] of NIGHT) {
      const d = lgPhaseDisplay(toLGSpectatorView(craft(phase, 3)), '')
      expect(d.labelKey).toBe('phases.night')
      expect(d.countdown).toBe(false)
    }
  })

  it('le fantôme voit tout : libellé précis et chrono', () => {
    for (const [phase] of NIGHT) {
      const d = display(phase, 'vil2')
      expect(d.labelKey).toBe(`phases.${phase}`)
      expect(d.countdown).toBe(true)
    }
  })

  it('hors de la nuit, rien ne change', () => {
    for (const phase of ['reveal-role', 'mayor-election', 'dawn', 'day-debate', 'day-vote', 'finished'] as LGPhase[]) {
      const d = display(phase, 'vil1', 9)
      expect(d).toEqual({ labelKey: `phases.${phase}`, countdown: true, screenKey: `${phase}#9` })
    }
  })
})
