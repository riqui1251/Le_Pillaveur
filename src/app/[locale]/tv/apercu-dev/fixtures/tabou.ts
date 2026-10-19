import { getTabouWords } from '@/lib/tabou/data'
import { createTabouState, reduceTabou, type TabouState, type TabouTeam } from '@/lib/tabou/engine'
import { phaseKey } from '@/lib/online/phase-clock'
import { BOT_PERSONAS, botDisplayName } from '@/lib/online/bot-personas'
import { onlineRoom, previewMembers, type PreviewMember, type TvPreviewFixture, type TvPreviewStep } from '../fixture-kit'

const GAME = 'tabou'

/** 16 = plafond du jeu (8 par équipe), avec beaucoup de noms longs pour éprouver les troncatures. */
const LONG_NAMES = [
  'Jean-Baptiste',
  'Marie-Charlotte',
  'Maxime-Alexandre',
  'Anne-Sophie',
  'Pierre-Emmanuel',
  'Marie-Antoinette',
  'Charles-Henri',
  'Léa',
  'Sofiane',
  'Camille',
  'Inès',
  'Thomas',
  'Zoé',
  'Hugo',
  'Nora',
  'Bastien',
] as const

/** Ids réels du catalogue d'icônes : un emoji du kit retomberait sur la chope. */
const ICONS = ['chope', 'vin', 'flute', 'cocktail', 'whisky', 'bouteille', 'trinque', 'shaker', 'citron', 'olive', 'tonneau', 'glacon', 'content', 'mdr', 'clin', 'choque']

/** Échéance lointaine : le minuteur reste visible dans l'aperçu. */
const FAR = () => Date.now() + 10 * 60_000

function members(count: number): PreviewMember[] {
  return previewMembers(count, LONG_NAMES).map((m, i) => ({ ...m, preferences: { ...m.preferences, icon: ICONS[i % ICONS.length] } }))
}

/** Équipes alternées (u1 A, u2 B…), comme l'équilibrage automatique du lobby ; `bots` derniers sièges tenus par des bots. */
function table(count: number, bots = 0, targetScore = 20): { list: PreviewMember[]; state: TabouState } {
  const list = members(count - bots)
  const players = [
    ...list.map((m, i) => ({ id: m.userId, name: m.displayName, team: (i % 2 === 0 ? 'A' : 'B') as TabouTeam })),
    ...BOT_PERSONAS.slice(0, bots).map((p, i) => ({
      id: `bot-${i + 1}`,
      name: botDisplayName(p),
      isBot: true,
      team: ((count - bots + i) % 2 === 0 ? 'A' : 'B') as TabouTeam,
    })),
  ]
  const state = createTabouState(players, getTabouWords('fr'), 'apercu-tv-tabou', Date.now(), targetScore)
  return { list, state: { ...state, phaseEndsAt: FAR() } }
}

function far(state: TabouState): TabouState {
  return state.phaseEndsAt === null ? state : { ...state, phaseEndsAt: FAR() }
}

function advance(state: TabouState): TabouState {
  return far(reduceTabou(state, { type: 'ADVANCE', claimedKey: phaseKey(state), now: (state.phaseEndsAt ?? Date.now()) + 1 }))
}

function describer(state: TabouState) {
  return state.players.find((p) => p.id === state.describerId)!
}

/** Un coéquipier du décrivant trouve `n` mots. */
function found(state: TabouState, n: number): TabouState {
  let next = state
  for (let i = 0; i < n; i += 1) {
    const mate = next.players.find((p) => p.team === describer(next).team && p.id !== next.describerId && !p.leftAt)!
    next = reduceTabou(next, { type: 'FOUND', playerId: mate.id, now: Date.now() })
  }
  return next
}

function passed(state: TabouState, n: number): TabouState {
  let next = state
  for (let i = 0; i < n; i += 1) next = reduceTabou(next, { type: 'PASS', playerId: next.describerId, now: Date.now() })
  return next
}

function taboo(state: TabouState, n: number): TabouState {
  let next = state
  for (let i = 0; i < n; i += 1) {
    const opp = next.players.find((p) => p.team !== describer(next).team && !p.leftAt)!
    next = reduceTabou(next, { type: 'TABOO_CALLED', playerId: opp.id, now: Date.now() })
  }
  return next
}

function next(state: TabouState): TabouState {
  return far(reduceTabou(state, { type: 'CONTINUE', playerId: state.players[0].id, now: Date.now() }))
}

function leave(state: TabouState, playerId: string): TabouState {
  return reduceTabou(state, { type: 'LEAVE', playerId, at: Date.now() - 20_000 })
}

/** Manches jouées jusqu'au score cible, A devant ; rend l'état final et le bilan qui le précède. */
function playToEnd(state: TabouState): { lastRoundEnd: TabouState; finished: TabouState } {
  let s = state
  for (let guard = 0; guard < 40; guard += 1) {
    if (s.phase === 'countdown') s = advance(s)
    const team = describer(s).team
    s = found(s, team === 'A' ? 4 : 2)
    s = passed(s, 1)
    s = advance(s)
    if (s.scores.A >= s.targetScore || s.scores.B >= s.targetScore) {
      return { lastRoundEnd: s, finished: next(s) }
    }
    s = next(s)
  }
  throw new Error('Tabou : score cible jamais atteint')
}

function step(label: string, list: PreviewMember[], state: TabouState): TvPreviewStep {
  return { label, room: onlineRoom(GAME, state, { members: list, stateVersion: state.version }) }
}

function fullGame(count: number, id: string, label: string): TvPreviewFixture {
  const { list, state } = table(count, 0, 15)
  const countdown = state
  const describingStart = advance(countdown)
  const describingMid = taboo(passed(found(describingStart, 3), 1), 1)
  // Un nom long (Marie-Charlotte, équipe B) éprouve le bandeau de retour sur deux lignes.
  const withLeft = leave(describingMid, list[1].userId)
  const roundEnd = advance(describingMid)
  const round2 = found(next(roundEnd), 2)
  const { lastRoundEnd, finished } = playToEnd(round2)
  const voters = list.filter((_, i) => i % 3 === 0).map((m) => m.userId)
  return {
    id,
    label,
    steps: [
      step('compte à rebours', list, countdown),
      step('manche 1, début', list, describingStart),
      step('manche 1, 3 trouvés', list, describingMid),
      step('manche 1, joueur parti', list, withLeft),
      step('bilan manche 1', list, roundEnd),
      step('manche 2 (équipe B)', list, round2),
      step('dernier bilan (score cible atteint)', list, lastRoundEnd),
      step('victoire', list, finished),
      step(`victoire, revanche ${voters.length}/${list.length}`, list, { ...finished, rematchVotes: voters }),
    ],
  }
}

/** Décrivant bot (remplaçant) : manche écourtée à 5 s côté moteur. */
function botDescriber(): TvPreviewFixture {
  const { list, state } = table(6, 2)
  let s = advance(state)
  for (let guard = 0; guard < 10 && !describer(s).isBot; guard += 1) s = next(advance(s))
  return {
    id: 'decrivant-bot',
    label: 'Décrivant bot, 6 joueurs (4 humains + 2 bots)',
    steps: [step('manche du bot', list, s), step('bilan du bot', list, advance(s))],
  }
}

export function build(): TvPreviewFixture[] {
  return [
    fullGame(16, 'partie-16', 'Partie complète, 16 joueurs (8 contre 8), noms longs'),
    fullGame(4, 'partie-4', 'Partie complète, 4 joueurs (2 contre 2)'),
    botDescriber(),
  ]
}
