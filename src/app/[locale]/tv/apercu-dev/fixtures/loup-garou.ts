import {
  createLGState,
  currentLGActorId,
  reduceLG,
  LG_DEBATE_DEFAULT_MS,
  type LGAction,
  type LGRole,
  type LGState,
} from '@/lib/loup-garou/engine'
import { lgBotDebateMove } from '@/lib/loup-garou/bot-debate'
import { phaseKey } from '@/lib/online/phase-clock'
import { BOT_PERSONAS, botDisplayName } from '@/lib/online/bot-personas'
import { onlineRoom, previewMembers, type PreviewMember, type TvPreviewFixture, type TvPreviewStep } from '../fixture-kit'

/**
 * Parties de Loup-Garou jouées par le VRAI moteur (graines choisies pour la
 * composition) : chaque étape est un état réel, masqué comme pour la télé.
 * L'horloge est simulée (`now` avance à chaque échéance) ; à l'affichage,
 * l'échéance est recalée dans dix minutes pour garder le minuteur visible.
 */

const GAME = 'loup-garou'

/** Générateur déterministe pour les bots du débat. */
function lcg(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (s * 1664525 + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

class Table {
  state: LGState
  now = 1_000_000
  steps: TvPreviewStep[] = []

  constructor(
    private members: PreviewMember[],
    players: { id: string; name: string; isBot?: boolean }[],
    seed: number
  ) {
    this.state = createLGState(players, seed, LG_DEBATE_DEFAULT_MS, this.now)
  }

  act(action: LGAction): this {
    this.state = reduceLG(this.state, action)
    return this
  }

  advance(): this {
    this.now = Math.max(this.now, this.state.phaseEndsAt ?? this.now)
    return this.act({ type: 'ADVANCE', claimedKey: phaseKey(this.state), now: this.now })
  }

  /** Joue la nuit entière, rôle par rôle (le moteur saute les rôles morts). */
  night(plan: { guard?: string; seer?: string; raven?: string; wolf: string }): this {
    const holder = (role: LGRole) => this.state.players.find((p) => p.alive && p.role === role)?.id
    for (let i = 0; i < 8 && this.state.phase.startsWith('night-'); i += 1) {
      const phase = this.state.phase
      const now = this.now
      const guard = holder('salvateur')
      const seer = holder('voyante')
      const raven = holder('corbeau')
      const witch = holder('sorciere')
      if (phase === 'night-guard' && guard && plan.guard) {
        this.act({ type: 'GUARD_PROTECT', playerId: guard, targetId: plan.guard, now })
      } else if (phase === 'night-seer' && seer && plan.seer) {
        this.act({ type: 'SEER_PEEK', playerId: seer, targetId: plan.seer, now })
      } else if (phase === 'night-raven' && raven && plan.raven) {
        this.act({ type: 'RAVEN_MARK', playerId: raven, targetId: plan.raven, now })
      } else if (phase === 'night-wolves') {
        for (const w of this.state.players.filter((p) => p.alive && p.role === 'loup')) {
          if (this.state.phase !== 'night-wolves') break
          this.act({ type: 'WOLF_VOTE', playerId: w.id, targetId: plan.wolf })
        }
      } else if (phase === 'night-witch' && witch) {
        this.act({ type: 'WITCH_ACTION', playerId: witch, action: 'none', now })
      }
      if (this.state.phase === phase) this.advance()
    }
    return this
  }

  /** Votes tant que la phase ne change pas (le moteur dépouille quand tous ont voté). */
  votes(type: 'DAY_VOTE' | 'MAYOR_VOTE', pairs: readonly (readonly [string, string])[]): this {
    const phase = this.state.phase
    for (const [playerId, targetId] of pairs) {
      if (this.state.phase !== phase) break
      if (!this.state.players.some((p) => p.id === playerId && p.alive)) continue
      this.act({ type, playerId, targetId, now: this.now })
    }
    return this
  }

  bots(times: number, rand: () => number): this {
    for (let i = 0; i < times; i += 1) {
      const moves = lgBotDebateMove(this.state, this.now, rand)
      for (const move of moves ?? []) this.act(move)
    }
    return this
  }

  snap(label: string): this {
    const s = this.state
    const frozen: LGState = { ...s, phaseEndsAt: s.phaseEndsAt === null ? null : Date.now() + 10 * 60_000 }
    this.steps.push({
      label,
      room: onlineRoom(GAME, frozen, {
        members: this.members,
        currentTurnUserId: currentLGActorId(s),
        stateVersion: s.version,
        status: s.phase === 'finished' ? 'finished' : 'playing',
      }),
    })
    return this
  }
}

/**
 * 12 joueurs (maximum du moteur), dont deux bots et deux noms longs.
 * Graine 19 : u1 villageois, u2 chasseur, u3 loup, u4 corbeau, u5 villageois
 * (Jean-Baptiste), u6 voyante, u7 et u8 loups, u9 sorcière (Marie-Charlotte),
 * u10 salvateur, bots 11-12 villageois.
 */
function bigGame(): TvPreviewStep[] {
  const members = previewMembers(10)
  const players = [
    ...members.map((m) => ({ id: m.userId, name: m.displayName })),
    { id: 'bot-1', name: botDisplayName(BOT_PERSONAS[0]), isBot: true },
    { id: 'bot-2', name: botDisplayName(BOT_PERSONAS[3]), isBot: true },
  ]
  const g = new Table(members, players, 19)
  const now = () => g.now
  g.snap('rôles distribués')
  g.advance().snap('nuit 1 : Salvateur')
  g.act({ type: 'GUARD_PROTECT', playerId: 'u10', targetId: 'u1', now: now() })
  g.advance().act({ type: 'SEER_PEEK', playerId: 'u6', targetId: 'u3', now: now() }).snap('nuit 1 : Voyante')
  g.advance().act({ type: 'RAVEN_MARK', playerId: 'u4', targetId: 'u9', now: now() })
  g.advance()
  for (const w of ['u3', 'u7', 'u8']) g.act({ type: 'WOLF_VOTE', playerId: w, targetId: 'u2' })
  g.snap('nuit 1 : Loups')
  g.advance().act({ type: 'WITCH_ACTION', playerId: 'u9', action: 'none', now: now() })
  g.advance().snap('aube : le Chasseur est mort, marque du Corbeau')
  g.advance().snap('tir du Chasseur')
  g.act({ type: 'HUNTER_SHOT', playerId: 'u2', targetId: 'u7', now: now() })
  for (const [voter, target] of [
    ['u1', 'u5'],
    ['u3', 'u9'],
    ['u4', 'u5'],
    ['u6', 'u5'],
    ['bot-1', 'u5'],
    ['u10', 'u1'],
  ] as const) {
    g.act({ type: 'MAYOR_VOTE', playerId: voter, targetId: target, now: now() })
  }
  g.snap('élection du maire (6/10 ont voté)')
  for (const voter of ['u5', 'u8', 'u9', 'bot-2']) {
    if (g.state.phase !== 'mayor-election') break
    if (!g.state.players.some((p) => p.id === voter && p.alive)) continue
    g.act({ type: 'MAYOR_VOTE', playerId: voter, targetId: 'u5', now: now() })
  }
  if (g.state.phase === 'mayor-election') g.advance()
  const rand = lcg(7)
  g.act({ type: 'DEBATE_SPEAK', playerId: 'u1', kind: 'suspect', targetId: 'u8' })
  g.bots(2, rand)
  g.act({ type: 'DEBATE_SPEAK', playerId: 'u8', kind: 'defend', targetId: 'u1' })
  g.act({ type: 'DEBATE_SPEAK', playerId: 'u9', kind: 'suspect', targetId: 'u3' })
  g.bots(2, rand)
  g.act({ type: 'DEBATE_SPEAK', playerId: 'u5', kind: 'ally', targetId: 'u6' })
  for (const p of ['u1', 'u4', 'u6', 'u10']) g.act({ type: 'DEBATE_SKIP', playerId: p, now: now() })
  g.snap('débat (fil + passages au vote)')
  g.advance()
  const votes: [string, string][] = [
    ['u1', 'u8'],
    ['u3', 'u9'],
    ['u4', 'bot-2'],
    ['u5', 'u3'],
  ]
  for (const [v, t] of votes) g.act({ type: 'DAY_VOTE', playerId: v, targetId: t, now: now() })
  g.snap('vote du jour (4/10, marque du Corbeau)')
  const rest: [string, string][] = [
    ['u6', 'u3'],
    ['u8', 'u6'],
    ['u9', 'u1'],
    ['u10', 'u8'],
    ['bot-1', 'u1'],
    ['bot-2', 'u4'],
  ]
  for (const [v, t] of rest) {
    if (g.state.phase !== 'day-vote') break
    g.act({ type: 'DAY_VOTE', playerId: v, targetId: t, now: now() })
  }
  if (g.state.phase === 'day-vote') g.advance()
  for (const [v, t] of [
    ['u1', 'u3'],
    ['u3', 'u9'],
    ['u4', 'u3'],
  ] as const) {
    if (g.state.phase !== 'day-revote') break
    g.act({ type: 'DAY_VOTE', playerId: v, targetId: t, now: now() })
  }
  g.snap('revote entre ex-aequo (3/10)')
  for (const [v, t] of [
    ['u5', 'u3'],
    ['u6', 'u3'],
    ['u8', 'u9'],
    ['u9', 'u3'],
    ['u10', 'u3'],
    ['bot-1', 'u9'],
    ['bot-2', 'u3'],
  ] as const) {
    if (g.state.phase !== 'day-revote') break
    g.act({ type: 'DAY_VOTE', playerId: v, targetId: t, now: now() })
  }
  if (g.state.phase === 'day-revote') g.advance()
  g.snap('nuit 2 : lynchage + maire en bandeau')
  if (g.state.phase === 'night-guard') {
    g.act({ type: 'GUARD_PROTECT', playerId: 'u10', targetId: 'u5', now: now() }).advance()
  }
  if (g.state.phase === 'night-seer') {
    g.act({ type: 'SEER_PEEK', playerId: 'u6', targetId: 'u8', now: now() }).advance()
  }
  if (g.state.phase === 'night-raven') {
    g.act({ type: 'RAVEN_MARK', playerId: 'u4', targetId: 'u1', now: now() }).advance()
  }
  if (g.state.phase === 'night-wolves') {
    g.act({ type: 'WOLF_VOTE', playerId: 'u8', targetId: 'u6' }).advance()
  }
  if (g.state.phase === 'night-witch') {
    g.act({ type: 'WITCH_ACTION', playerId: 'u9', action: 'kill', targetId: 'u8', now: now() }).advance()
  }
  g.snap('aube 2 : deux morts')
  g.advance().snap('victoire du village')
  return g.steps
}

/**
 * 5 joueurs, graine 4 : u1 voyante, u2-u3 villageois, u4 loup, u5 ancien
 * (Jean-Baptiste) — la morsure sur l'Ancien donne une aube sans mort.
 */
function smallGame(): TvPreviewStep[] {
  const members = previewMembers(5)
  const g = new Table(
    members,
    members.map((m) => ({ id: m.userId, name: m.displayName })),
    4
  )
  const now = () => g.now
  g.snap('rôles distribués')
  g.advance().act({ type: 'SEER_PEEK', playerId: 'u1', targetId: 'u4', now: now() }).snap('nuit : Voyante')
  g.advance().act({ type: 'WOLF_VOTE', playerId: 'u4', targetId: 'u5' })
  if (g.state.phase === 'night-wolves') g.advance()
  g.snap('aube : personne n’est mort')
  g.advance()
  g.act({ type: 'MAYOR_VOTE', playerId: 'u1', targetId: 'u2', now: now() })
  g.act({ type: 'MAYOR_VOTE', playerId: 'u3', targetId: 'u2', now: now() })
  g.snap('élection du maire')
  for (const v of ['u2', 'u4', 'u5']) {
    if (g.state.phase !== 'mayor-election') break
    g.act({ type: 'MAYOR_VOTE', playerId: v, targetId: 'u2', now: now() })
  }
  g.act({ type: 'DEBATE_SPEAK', playerId: 'u1', kind: 'suspect', targetId: 'u4' })
  g.act({ type: 'DEBATE_SPEAK', playerId: 'u4', kind: 'defend', targetId: 'u1' })
  g.snap('débat')
  g.advance()
  g.act({ type: 'DAY_VOTE', playerId: 'u1', targetId: 'u4', now: now() })
  g.snap('vote du jour')
  for (const v of ['u2', 'u3', 'u5']) {
    if (g.state.phase !== 'day-vote') break
    g.act({ type: 'DAY_VOTE', playerId: v, targetId: 'u4', now: now() })
  }
  if (g.state.phase === 'day-vote') g.act({ type: 'DAY_VOTE', playerId: 'u4', targetId: 'u1', now: now() })
  g.snap('victoire du village')
  return g.steps
}

/**
 * 12 joueurs, même graine que `bigGame` mais les loups gagnent : Voyante
 * dévorée, Chasseur marqué par le Corbeau puis lynché (tir juste après le
 * lynchage), débat de la manche 2 avec bandeaux, marque et fil plein, revote
 * à 5 ex-aequo (dont Jean-Baptiste et Marie-Charlotte), victoire des loups.
 */
function wolvesGame(): TvPreviewStep[] {
  const members = previewMembers(10)
  const players = [
    ...members.map((m) => ({ id: m.userId, name: m.displayName })),
    { id: 'bot-1', name: botDisplayName(BOT_PERSONAS[1]), isBot: true },
    { id: 'bot-2', name: botDisplayName(BOT_PERSONAS[5]), isBot: true },
  ]
  const g = new Table(members, players, 19)
  const now = () => g.now
  const rand = lcg(11)
  g.advance().night({ guard: 'u1', seer: 'u3', raven: 'u2', wolf: 'u6' })
  g.snap('aube 1 : Voyante dévorée, Chasseur marqué')
  g.advance()
  const everyone = ['u1', 'u2', 'u4', 'u5', 'u7', 'u8', 'u9', 'u10', 'bot-1', 'bot-2', 'u3']
  g.votes('MAYOR_VOTE', everyone.map((v) => [v, 'u3'] as const))
  if (g.state.phase === 'mayor-election') g.advance()
  g.act({ type: 'DEBATE_SPEAK', playerId: 'u5', kind: 'suspect', targetId: 'u2' })
  g.bots(2, rand)
  if (g.state.phase === 'day-debate') g.advance()
  g.votes('DAY_VOTE', [
    ['u3', 'u2'],
    ['u7', 'u2'],
    ['u8', 'u2'],
  ])
  g.snap('vote du jour : Chasseur marqué (+2), maire loup')
  g.votes('DAY_VOTE', [
    ['u1', 'u8'],
    ['u2', 'u3'],
    ['u4', 'u7'],
    ['u5', 'u3'],
    ['u9', 'u8'],
    ['u10', 'u7'],
    ['bot-1', 'u3'],
    ['bot-2', 'u5'],
  ])
  if (g.state.phase === 'day-vote') g.advance()
  g.snap('tir du Chasseur juste après son lynchage')
  if (g.state.phase === 'hunter-shot') g.act({ type: 'HUNTER_SHOT', playerId: 'u2', targetId: 'u10', now: now() })
  g.night({ raven: 'u9', wolf: 'u4' })
  g.advance()
  g.act({ type: 'DEBATE_SPEAK', playerId: 'u9', kind: 'suspect', targetId: 'u7' })
  g.bots(3, rand)
  g.act({ type: 'DEBATE_SPEAK', playerId: 'u7', kind: 'defend', targetId: 'u9' })
  g.act({ type: 'DEBATE_SPEAK', playerId: 'u5', kind: 'doubt', targetId: 'u1' })
  g.bots(3, rand)
  g.act({ type: 'DEBATE_SPEAK', playerId: 'u1', kind: 'suspect', targetId: 'u8' })
  for (const p of ['u3', 'u8']) g.act({ type: 'DEBATE_SKIP', playerId: p, now: now() })
  g.snap('débat manche 2 : bandeaux, marque du Corbeau, fil plein')
  if (g.state.phase === 'day-debate') g.advance()
  g.votes('DAY_VOTE', [
    ['u3', 'u5'],
    ['u7', 'u1'],
    ['u8', 'u1'],
    ['u1', 'bot-2'],
    ['u5', 'bot-2'],
    ['u9', 'u7'],
    ['bot-1', 'u7'],
  ])
  if (g.state.phase === 'day-vote') g.advance()
  g.votes('DAY_VOTE', [
    ['u3', 'u1'],
    ['u7', 'u1'],
  ])
  g.snap('revote à 5 ex-aequo, noms longs')
  g.votes('DAY_VOTE', [
    ['u8', 'u1'],
    ['u1', 'u7'],
    ['u5', 'u7'],
    ['u9', 'u7'],
    ['bot-1', 'u9'],
    ['bot-2', 'u9'],
  ])
  if (g.state.phase === 'day-revote') g.advance()
  g.night({ wolf: 'u5' })
  g.snap('aube 3')
  g.advance().snap('victoire des loups')
  return g.steps
}

export function build(): TvPreviewFixture[] {
  return [
    { id: 'partie-12', label: 'Partie complète, 12 joueurs (noms longs, 2 bots)', steps: bigGame() },
    { id: 'partie-5', label: 'Petite table, 5 joueurs (aube sans mort)', steps: smallGame() },
    {
      id: 'loups-12',
      label: '12 joueurs, victoire des loups (Chasseur lynché, débat manche 2, revote à 5)',
      steps: wolvesGame(),
    },
  ]
}
