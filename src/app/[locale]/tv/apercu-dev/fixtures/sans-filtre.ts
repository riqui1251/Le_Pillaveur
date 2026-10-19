import { createSFState, reduceSF, type SFState } from '@/lib/sans-filtre/engine'
import { SF_BLACKS_FR, SF_WHITES_FR } from '@/lib/sans-filtre/data'
import { BOT_PERSONAS, botDisplayName } from '@/lib/online/bot-personas'
import { phaseKey } from '@/lib/online/phase-clock'
import { onlineRoom, previewMembers, type PreviewMember, type TvPreviewFixture, type TvPreviewStep } from '../fixture-kit'

const GAME = 'sans-filtre'

/** Noms de la plus grande tablée (16 = plafond du moteur), dont beaucoup de longs. */
const LONG_NAMES = [
  'Jean-Baptiste',
  'Marie-Charlotte',
  'Léa',
  'Maxime-Alexandre',
  'Sofiane',
  'Anne-Sophie',
  'Camille',
  'Pierre-Emmanuel',
  'Inès',
  'Thomas',
  'Marie-Antoinette',
  'Zoé',
  'Hugo',
  'Charles-Henri',
  'Nora',
  'Bastien',
] as const

/** Ids réels du catalogue d'icônes (les emojis du kit retombent tous sur la chope). */
const ICONS = ['chope', 'vin', 'flute', 'cocktail', 'whisky', 'bouteille', 'trinque', 'shaker', 'citron', 'olive', 'tonneau', 'glacon', 'content', 'mdr', 'clin', 'choque']

const BLACKS = SF_BLACKS_FR.map((c) => c.text)
const WHITES = SF_WHITES_FR.map((c) => c.text)
const LONGEST_BLACK = [...BLACKS].sort((a, b) => b.length - a.length)[0]
/** Les réponses les plus longues, juste assez pour distribuer 16 mains : le pire cas de la mise en page. */
const LONGEST_WHITES = [...WHITES].sort((a, b) => b.length - a.length).slice(0, 16 * 7)

type Table = { members: PreviewMember[]; state: SFState }

function table(
  humans: number,
  bots: number,
  opts: { seed: string; rounds?: number; whites?: string[]; longBlack?: boolean }
): Table {
  const members = previewMembers(humans, LONG_NAMES).map((m, i) => ({
    ...m,
    preferences: { ...m.preferences, icon: ICONS[i % ICONS.length] },
  }))
  const players = [
    ...members.map((m) => ({ id: m.userId, name: m.displayName })),
    ...BOT_PERSONAS.slice(0, bots).map((p, i) => ({ id: `bot-${i + 1}`, name: botDisplayName(p), isBot: true })),
  ]
  const state = createSFState(players, BLACKS, opts.whites ?? WHITES, opts.seed, Date.now(), opts.rounds ?? 8)
  // Carte noire la plus longue en première manche, pour éprouver la mise en page.
  return { members, state: opts.longBlack ? { ...state, blacks: [LONGEST_BLACK, ...state.blacks.slice(1)] } : state }
}

function advance(state: SFState): SFState {
  return reduceSF(state, { type: 'ADVANCE', claimedKey: phaseKey(state), now: (state.phaseEndsAt ?? Date.now()) + 1 })
}

/** `count` joueurs (hors juge, ordre de table) abattent leur réponse la plus longue. */
function play(state: SFState, count: number): SFState {
  let next = state
  const ids = next.players.filter((p) => p.id !== next.judgeId && !p.leftAt).map((p) => p.id).slice(0, count)
  for (const id of ids) {
    if (next.phase !== 'submit') break
    const hand = next.players.find((p) => p.id === id)?.hand ?? []
    const card = [...hand].sort((a, b) => next.whites[b].length - next.whites[a].length)[0]
    next = reduceSF(next, { type: 'PLAY_CARD', playerId: id, card, now: Date.now() })
  }
  return next
}

/** Le juge couronne la `pick`-ième réponse (ordre anonyme). */
function crown(state: SFState, pick: number): SFState {
  const sorted = [...state.submissions].sort((a, b) => a.card - b.card)
  const card = sorted[pick % sorted.length].card
  return reduceSF(state, { type: 'JUDGE_PICK', playerId: state.judgeId as string, card, now: Date.now() })
}

function next(state: SFState): SFState {
  return reduceSF(state, { type: 'CONTINUE', playerId: state.players[0].id, now: Date.now() })
}

/**
 * Manches complètes jouées par tous, pour répartir des couronnes avant la
 * manche affichée ; `winners[r]` = joueur couronné à la manche r (sinon une
 * réponse au hasard de l'ordre anonyme).
 */
function playRounds(state: SFState, rounds: number, winners: string[] = []): SFState {
  let s = state
  for (let r = 0; r < rounds; r += 1) {
    s = play(s, s.players.length)
    const target = [...s.submissions].sort((a, b) => a.card - b.card).findIndex((sub) => sub.playerId === winners[r])
    s = crown(s, target >= 0 ? target : r * 5 + 2)
    s = next(s)
  }
  return s
}

/** Échéance repoussée de 10 min : le minuteur reste visible dans l'aperçu figé. */
function live(state: SFState): SFState {
  return state.phaseEndsAt === null ? state : { ...state, phaseEndsAt: Date.now() + 10 * 60_000 }
}

function step(label: string, t: Table, state: SFState, members: PreviewMember[] = t.members): TvPreviewStep {
  return { label, room: onlineRoom(GAME, live(state), { members, stateVersion: state.version }) }
}

export function build(): TvPreviewFixture[] {
  const big = table(16, 0, { seed: 'tv-sf-16', longBlack: true })
  const bigSubmit = advance(big.state)
  const bigLeft = reduceSF(play(bigSubmit, 9), { type: 'LEAVE', playerId: 'u6', at: Date.now() })

  const worst = table(16, 0, { seed: 'tv-sf-16-max', whites: LONGEST_WHITES, longBlack: true })
  const worstJudging = play(advance(worst.state), 15)

  const mid = table(6, 2, { seed: 'tv-sf-8' })
  const midRound = playRounds(advance(mid.state), 3)
  const midJudging = play(midRound, 7)

  const small = table(1, 3, { seed: 'tv-sf-4', longBlack: true })
  const smallSubmit = advance(small.state)
  const smallJudging = play(smallSubmit, 3)

  const crowned = playRounds(advance(big.state), 4)
  const crownedJudging = play(crowned, 15)
  const crownedJudgingLeft = reduceSF(crownedJudging, { type: 'LEAVE', playerId: 'u6', at: Date.now() })

  const empty = table(4, 0, { seed: 'tv-sf-vide' })
  const emptyReveal = advance(advance(empty.state))

  const finished16 = playRounds(advance(table(16, 0, { seed: 'tv-sf-fin-16', rounds: 5 }).state), 5, ['u2', 'u11', 'u2', 'u2', 'u16'])
  const sixTable = table(6, 0, { seed: 'tv-sf-fin-6', rounds: 3 })
  const finished6 = playRounds(advance(sixTable.state), 3, ['u3', 'u3', 'u5'])
  const twelveTable = table(12, 0, { seed: 'tv-sf-fin-12', rounds: 4 })
  const finished12 = playRounds(advance(twelveTable.state), 4, ['u8', 'u2', 'u8', 'u11'])
  const tieTable = table(2, 2, { seed: 'tv-sf-egalite', rounds: 2 })
  const tie = playRounds(advance(tieTable.state), 2, ['u2', 'bot-1'])

  return [
    {
      id: 'compte-a-rebours',
      label: 'Compte à rebours de lancement (16 joueurs)',
      steps: [step('compte à rebours', big, big.state)],
    },
    {
      id: 'abattage-16',
      label: 'Abattage, 16 joueurs aux noms longs (personne → 9 → 14 ont joué, puis un départ)',
      steps: [
        step('personne n’a joué', big, bigSubmit),
        step('9 ont joué', big, play(bigSubmit, 9)),
        step('14 sur 15', big, play(bigSubmit, 14)),
        step('un joueur parti (bandeau de retour)', big, bigLeft),
      ],
    },
    {
      id: 'abattage-4',
      label: 'Abattage, table solo (1 humain + 3 bots)',
      steps: [step('personne', small, smallSubmit), step('2 ont joué', small, play(smallSubmit, 2))],
    },
    {
      id: 'jugement-4',
      label: 'Jugement, 3 réponses puis couronnement (table solo)',
      steps: [step('jugement', small, smallJudging), step('couronnement', small, crown(smallJudging, 1))],
    },
    {
      id: 'jugement-8',
      label: 'Jugement, 8 joueurs (dont 2 bots), manche 4',
      steps: [step('jugement', mid, midJudging), step('couronnement', mid, crown(midJudging, 4))],
    },
    {
      id: 'jugement-16',
      label: 'Jugement, 16 joueurs : 15 réponses (la plus longue de chaque main), un départ, puis couronnement',
      steps: [
        step('jugement', big, crownedJudging),
        step('un joueur part pendant le jugement (bandeau de retour)', big, crownedJudgingLeft),
        step('couronnement', big, crown(crownedJudging, 7)),
      ],
    },
    {
      id: 'jugement-16-max',
      label: 'Jugement, pire cas : 15 des réponses les plus longues du jeu et la carte noire la plus longue',
      steps: [step('jugement', worst, worstJudging), step('couronnement', worst, crown(worstJudging, 0))],
    },
    {
      id: 'couronnement-personne',
      label: 'Manche sans carte abattue (personne couronné)',
      steps: [step('personne', empty, emptyReveal)],
    },
    {
      id: 'fin-16',
      label: 'Fin de partie, 16 joueurs (vainqueur, revanche demandée)',
      steps: [
        step('podium', big, finished16),
        step('revanche 3/16', big, { ...finished16, rematchVotes: ['u1', 'u4', 'u9'] }),
      ],
    },
    {
      id: 'fin-6-revanche',
      label: 'Fin de partie, 6 joueurs (une colonne de 6 lignes), revanche demandée',
      steps: [step('revanche 2/6', sixTable, { ...finished6, rematchVotes: ['u1', 'u4'] })],
    },
    {
      id: 'fin-12-revanche',
      label: 'Fin de partie, 12 joueurs (deux colonnes de 6 lignes), revanche demandée',
      steps: [step('revanche 5/12', twelveTable, { ...finished12, rematchVotes: ['u1', 'u2', 'u5', 'u9', 'u12'] })],
    },
    {
      id: 'fin-4-egalite',
      label: 'Fin de partie, 4 joueurs, égalité',
      steps: [step('égalité', tieTable, tie)],
    },
  ]
}
