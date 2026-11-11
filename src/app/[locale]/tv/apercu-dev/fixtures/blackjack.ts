import { getGameAdapter } from '@/lib/online/game-adapters'
import { BOT_PERSONAS, botDisplayName } from '@/lib/online/bot-personas'
import { applyBjBotTurn, createBjState, currentBjActorId, freshShoe, type BjCard, type BjState } from '@/lib/blackjack/engine'
import { onlineRoom, previewMembers, PREVIEW_NAMES, type TvPreviewFixture, type TvPreviewStep } from '../fixture-kit'

const GAME = 'blackjack'

function act(state: BjState, actorId: string, body: Record<string, unknown>): BjState {
  const result = getGameAdapter(GAME)!.applyAction(state, actorId, body)
  if (!result.ok) throw new Error(`blackjack ${JSON.stringify(body)} : ${result.error}`)
  return result.state as BjState
}

const c = (rank: BjCard['rank'], suit: BjCard['suit']): BjCard => ({ rank, suit })

/** Table de 4 humains + 2 bots, sabot truqué pour montrer séparation, double et Black Jack. */
function table() {
  const members = previewMembers(4, PREVIEW_NAMES)
  const players = [
    ...members.map((m) => ({ id: m.userId, name: m.displayName, isBot: false })),
    ...[0, 1].map((i) => ({ id: `bot-${i + 1}`, name: botDisplayName(BOT_PERSONAS[i]), isBot: true })),
  ]
  const base = createBjState(players, 'apercu-blackjack')
  // Donne : 6 joueurs puis croupier, deux fois.
  const top = [
    c('8', '♠'), c('A', '♥'), c('6', '♦'), c('10', '♣'), c('9', '♥'), c('5', '♠'), c('10', '♦'),
    c('8', '♥'), c('R', '♠'), c('5', '♣'), c('7', '♦'), c('9', '♠'), c('6', '♣'), c('7', '♣'),
    c('3', '♦'), c('10', '♥'), c('V', '♣'), c('2', '♠'), c('4', '♥'),
  ]
  return { members, betting: { ...base, shoe: [...top, ...freshShoe()] } }
}

function step(label: string, state: BjState, members: ReturnType<typeof previewMembers>): TvPreviewStep {
  return {
    label,
    room: onlineRoom(GAME, state, {
      members,
      stateVersion: state.version,
      currentTurnUserId: state.phase === 'finished' ? null : currentBjActorId(state),
    }),
  }
}

export function build(): TvPreviewFixture[] {
  const { members, betting } = table()
  const halfBet = act(betting, 'u1', { action: 'bet', stake: 2 })
  let s = halfBet
  for (const m of members.slice(1)) s = act(s, m.userId, { action: 'bet', stake: 1 + (members.indexOf(m) % 3) })
  const dealt = s
  const split = act(dealt, 'u1', { action: 'split' })
  let play = act(act(split, 'u1', { action: 'stand' }), 'u1', { action: 'stand' })
  play = act(play, 'u3', { action: 'double' })
  play = act(play, 'u4', { action: 'stand' })
  const midway = play
  let guard = 0
  while (play.phase === 'playing' && guard < 20) {
    play = applyBjBotTurn(play) ?? play
    guard += 1
  }
  const results = play
  const finished = { ...act(results, 'u1', { action: 'end' }), rematchVotes: ['u2'] }
  return [
    { id: 'mises-6', label: '6 joueurs : mises en cours', steps: [step('mises', halfBet, members)] },
    {
      id: 'manche-6',
      label: '6 joueurs : une manche complète',
      steps: [
        step('donne', dealt, members),
        step('séparation', split, members),
        step('au tour des bots', midway, members),
        step('résultats', results, members),
      ],
    },
    { id: 'fin-6', label: '6 joueurs : bilan', steps: [step('fin', finished, members)] },
  ]
}
