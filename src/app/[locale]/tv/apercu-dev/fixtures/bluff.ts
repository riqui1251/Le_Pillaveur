import {
  createBluffState,
  currentBluffActorId,
  reduceBluff,
  BLUFF_REVEAL_MIN_MS,
  type BluffPrompt,
  type BluffState,
} from '@/lib/bluff/engine'
import { getBluffPrompts } from '@/lib/bluff/data'
import { phaseKey } from '@/lib/online/phase-clock'
import { BOT_PERSONAS, botDisplayName } from '@/lib/online/bot-personas'
import { onlineRoom, previewMembers, type PreviewMember, type TvPreviewFixture, type TvPreviewStep } from '../fixture-kit'

const GAME = 'bluff'

/** Questions choisies : la plus longue du pool, des réponses longues, puis une courte. */
const PROMPT_IDS = ['fr-sp-106', 'fr-fe-26', 'fr-fe-129', 'fr-ec-131', 'fr-fe-130', 'fr-sp-125']

/**
 * Bluffs plausibles (≤ 60 caractères), dont un très long. Jamais la vraie
 * réponse : elle se confondrait avec elle au vote.
 */
const FAKES = [
  'Nadia Comăneci',
  'Une Ivanovna dont plus personne ne se souvient du prénom',
  'Svetlana Khorkina',
  'Ludmilla Tourischeva',
  'Nellie Kim',
  'Elena Moukhina',
  'Natalia Kuchinskaya',
  'Polina Astakhova',
  'Tatiana Lysenko',
  'Ma tante Josiane, médaillée d’or du tiercé',
  'Maria Gorokhovskaya',
  'Sofia Muratova',
  'Galina Shamrai',
  'Olga Korbut',
  'Věra Čáslavská',
  'Irina Deriouguina',
]

function prompts(rounds: number): BluffPrompt[] {
  const pool = getBluffPrompts('fr')
  const chosen = PROMPT_IDS.map((id) => pool.find((p) => p.id === id)).filter((p): p is BluffPrompt => Boolean(p))
  const rest = pool.filter((p) => !PROMPT_IDS.includes(p.id))
  return [...chosen, ...rest].slice(0, rounds)
}

function table(humans: number, bots: number, rounds: number): { members: PreviewMember[]; state: BluffState } {
  const members = previewMembers(humans)
  const players = [
    ...members.map((m) => ({ id: m.userId, name: m.displayName })),
    ...BOT_PERSONAS.slice(0, bots).map((p, i) => ({ id: `bot-${i + 1}`, name: botDisplayName(p), isBot: true })),
  ]
  const now = Date.now()
  const base = createBluffState(players, prompts(rounds), 'apercu-tv', now, rounds)
  // Ordre des questions imposé : la plus longue d'abord, pour éprouver la mise en page.
  return { members, state: { ...base, roundPrompts: prompts(rounds) } }
}

function advance(state: BluffState): BluffState {
  return reduceBluff(state, { type: 'ADVANCE', claimedKey: phaseKey(state), now: (state.phaseEndsAt ?? Date.now()) + 1 })
}

function submit(state: BluffState, count: number, round = 0): BluffState {
  let next = state
  const ids = next.players.map((p) => p.id).slice(0, count)
  ids.forEach((id, i) => {
    if (next.phase !== 'submit') return
    const text = round === 0 ? FAKES[i % FAKES.length] : `${next.roundPrompts[next.promptIdx].decoys[0]} (${i + 1})`
    next = reduceBluff(next, { type: 'SUBMIT_FAKE', playerId: id, text, now: Date.now() })
  })
  return next
}

/** Votes déterministes, jamais pour son propre bluff ; `realEvery` = un votant sur N trouve la vraie. */
function vote(state: BluffState, count: number, realEvery = 3): BluffState {
  let next = state
  const ids = next.players.filter((p) => !p.leftAt).map((p) => p.id).slice(0, count)
  ids.forEach((id, i) => {
    if (next.phase !== 'vote') return
    const options = next.candidates.filter((c) => c.authorId !== id)
    const target =
      i % realEvery === 0
        ? options.find((c) => c.isReal) ?? options[0]
        : options[(i * 7) % options.length]
    next = reduceBluff(next, { type: 'VOTE', playerId: id, candidateId: target.candidateId, now: Date.now() })
  })
  return next
}

/** Au plancher de lecture : avant, le moteur refuse le CONTINUE (READING_TIME). */
function cont(state: BluffState): BluffState {
  const now = Math.max(Date.now(), (state.revealAt ?? 0) + BLUFF_REVEAL_MIN_MS)
  return reduceBluff(state, { type: 'CONTINUE', playerId: state.players[0].id, now })
}

/** Échéance lointaine : le minuteur reste visible sur l'aperçu. */
function live(state: BluffState): BluffState {
  return state.phaseEndsAt === null ? state : { ...state, phaseEndsAt: Date.now() + 10 * 60_000 }
}

function step(label: string, members: PreviewMember[], state: BluffState, version: number): TvPreviewStep {
  // Comme le serveur : personne n'est « au tour » au Bluff, reveal compris.
  return {
    label,
    room: onlineRoom(GAME, live(state), { members, currentTurnUserId: currentBluffActorId(state), stateVersion: version }),
  }
}

/** Joue toutes les manches restantes (tout le monde bluffe et vote) jusqu'à la fin. */
function playToEnd(state: BluffState, realEvery: number): BluffState {
  let next = state
  while (next.phase !== 'finished') {
    if (next.phase === 'countdown') next = advance(next)
    else if (next.phase === 'submit') next = submit(next, next.players.length, next.promptIdx)
    else if (next.phase === 'vote') next = vote(next, next.players.length, realEvery)
    else next = cont(next)
  }
  return next
}

function sequence(humans: number, bots: number, rounds: number) {
  const { members, state: countdown } = table(humans, bots, rounds)
  const total = humans + bots
  const submitEmpty = advance(countdown)
  const submitPartial = submit(submitEmpty, Math.ceil(total * 0.6))
  const voteEmpty = submit(submitEmpty, total)
  const votePartial = vote(voteEmpty, Math.ceil(total * 0.6))
  const reveal = vote(voteEmpty, total)
  const submit2 = cont(reveal)
  const reveal2 = vote(submit(submit2, total, 1), total, 2)
  const finished = playToEnd(reveal2, 2)
  return { members, total, countdown, submitEmpty, submitPartial, voteEmpty, votePartial, reveal, submit2, reveal2, finished }
}

export function build(): TvPreviewFixture[] {
  const max = sequence(12, 4, 8)
  const mid = sequence(8, 0, 6)
  const few = sequence(2, 1, 6)

  const tie = (() => {
    const { members, state } = table(3, 0, 6)
    // Tout le monde trouve la vraie réponse à chaque manche : égalité parfaite.
    return { members, state: playToEnd(state, 1) }
  })()

  const left = (() => {
    const { members, state } = table(6, 0, 6)
    const voting = submit(advance(state), 6)
    const gone = reduceBluff(voting, { type: 'LEAVE', playerId: 'u5', at: Date.now() })
    return { members, state: vote(gone, 3) }
  })()

  // Pire cas du bandeau de retour : 16 joueurs, 17 propositions, question la plus longue.
  const leftMax = (() => {
    const { members, state } = table(12, 4, 8)
    const voting = submit(advance(state), 16)
    const gone = reduceBluff(voting, { type: 'LEAVE', playerId: 'u1', at: Date.now() })
    return { members, voting: vote(gone, 9), reveal: vote(gone, 15) }
  })()

  return [
    {
      id: 'seize',
      label: '16 joueurs (12 + 4 bots), noms et question longs : partie complète',
      steps: [
        step('compte à rebours', max.members, max.countdown, 1),
        step('bluff 0/16', max.members, max.submitEmpty, 2),
        step('bluff 10/16', max.members, max.submitPartial, 3),
        step('vote 0/16 (17 propositions)', max.members, max.voteEmpty, 4),
        step('vote 10/16', max.members, max.votePartial, 5),
        step('révélation manche 1', max.members, max.reveal, 6),
        step('bluff manche 2', max.members, max.submit2, 7),
        step('révélation manche 2 (réponses longues)', max.members, max.reveal2, 8),
        step('fin de partie', max.members, max.finished, 9),
      ],
    },
    {
      id: 'huit',
      label: '8 joueurs (limite des bandeaux nominatifs)',
      steps: [
        step('bluff 5/8', mid.members, mid.submitPartial, 1),
        step('vote 5/8', mid.members, mid.votePartial, 2),
        step('révélation', mid.members, mid.reveal, 3),
        step('révélation manche 2', mid.members, mid.reveal2, 4),
        step('fin de partie', mid.members, mid.finished, 5),
      ],
    },
    {
      id: 'trois',
      label: '3 joueurs (2 + 1 bot)',
      steps: [
        step('compte à rebours', few.members, few.countdown, 1),
        step('bluff 2/3', few.members, few.submitPartial, 2),
        step('vote 2/3', few.members, few.votePartial, 3),
        step('révélation', few.members, few.reveal, 4),
        step('fin de partie', few.members, few.finished, 5),
      ],
    },
    {
      id: 'egalite',
      label: 'Fin de partie à égalité (3 joueurs)',
      steps: [step('égalité', tie.members, tie.state, 1)],
    },
    {
      id: 'depart',
      label: 'Joueur parti pendant le vote (bandeau de retour)',
      steps: [step('vote, Jean-Baptiste parti', left.members, left.state, 1)],
    },
    {
      id: 'depart-seize',
      label: '16 joueurs, 17 propositions, un joueur parti (bandeau au vote et à la révélation)',
      steps: [
        step('vote 9/15, un joueur parti', leftMax.members, leftMax.voting, 1),
        step('révélation, bandeau toujours là', leftMax.members, leftMax.reveal, 2),
      ],
    },
  ]
}
