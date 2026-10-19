import { getGameAdapter } from '@/lib/online/game-adapters'
import { BOT_PERSONAS, botDisplayName } from '@/lib/online/bot-personas'
import { createPurpleState, type PurpleBet, type PurpleCard, type PurpleState } from '@/lib/purple/engine'
import { onlineRoom, previewMembers, PREVIEW_NAMES, type PreviewMember, type TvPreviewFixture, type TvPreviewStep } from '../fixture-kit'

const GAME = 'purple'

/** Coup joué par le joueur au tour, via l'adaptateur réel (mêmes refus que le serveur). */
function act(state: PurpleState, body: Record<string, unknown>): PurpleState {
  const actorId = state.players[state.currentPlayer]?.id ?? ''
  const result = getGameAdapter(GAME)!.applyAction(state, actorId, body)
  if (!result.ok) throw new Error(`purple ${JSON.stringify(body)} : ${result.error}`)
  return result.state as PurpleState
}

const colorsOf = (cards: PurpleCard[]) => cards.map((c) => c.color)

/** Pari gagnant sur les `count` prochaines cartes (null si aucun ne gagne, ex. double purple impossible). */
function winningBet(state: PurpleState, count: 1 | 2 | 4): PurpleBet | null {
  const c = colorsOf(state.deck.slice(0, count))
  if (c.length < count) return null
  if (count === 1) return c[0] === 'red' ? 'rouge' : 'noir'
  if (count === 2) return c[0] !== c[1] ? 'purple' : c[0] === 'red' ? 'double-rouge' : 'double-noir'
  return c[0] !== c[1] && c[2] !== c[3] ? 'double-purple' : null
}

/** Pari perdant à deux cartes (montre deux cartes et un verdict rouge). */
function losingBet(state: PurpleState): PurpleBet {
  const c = colorsOf(state.deck.slice(0, 2))
  return c[0] !== c[1] ? 'double-noir' : 'purple'
}

function win(state: PurpleState, count: 1 | 2 = 1): PurpleState {
  return act(state, { action: 'bet', bet: winningBet(state, count) })
}
function lose(state: PurpleState): PurpleState {
  return act(state, { action: 'bet', bet: losingBet(state) })
}

function tablePlayers(humans: number, bots: number): { members: PreviewMember[]; players: { id: string; name: string; isBot: boolean }[] } {
  const members = previewMembers(humans, PREVIEW_NAMES)
  const players = [
    ...members.map((m) => ({ id: m.userId, name: m.displayName, isBot: false })),
    ...Array.from({ length: bots }, (_, i) => ({ id: `bot-${i + 1}`, name: botDisplayName(BOT_PERSONAS[i]), isBot: true })),
  ]
  return { members, players }
}

function fresh(players: { id: string; name: string; isBot: boolean }[], seed: string): PurpleState {
  return { ...createPurpleState(players, seed), currentPlayer: 0 }
}

/**
 * Table pleine (12 humains + 4 bots = 16, maximum du jeu) après huit tours
 * joués : gorgées réparties, historique rempli, cagnotte en cours, et c'est
 * à Marie-Charlotte (index 8) de parier. La graine est choisie pour qu'un
 * double purple gagnant soit possible à ce moment-là.
 */
function fullTable(): { members: PreviewMember[]; base: PurpleState } {
  const { members, players } = tablePlayers(12, 4)
  for (let k = 0; k < 500; k += 1) {
    let s = fresh(players, `apercu-purple-16-${k}`)
    for (let turn = 0; turn < 8; turn += 1) {
      if (turn === 1 || turn === 4) {
        s = act(lose(s), { action: 'close-reveal' })
      } else {
        s = act(win(s, turn % 2 === 0 ? 2 : 1), { action: 'pass' })
      }
    }
    if (winningBet(s, 4)) return { members, base: s }
  }
  throw new Error('purple : aucune graine ne permet le double purple')
}

function step(label: string, state: PurpleState, members: PreviewMember[]): TvPreviewStep {
  return {
    label,
    room: onlineRoom(GAME, state, {
      members,
      stateVersion: state.version,
      currentTurnUserId: state.phase === 'finished' ? null : state.players[state.currentPlayer]?.id ?? null,
    }),
  }
}

export function build(): TvPreviewFixture[] {
  const { members, base } = fullTable()

  const won16 = act(base, { action: 'bet', bet: 'double-purple' })
  const lost16 = lose(base)
  const left16 = getGameAdapter(GAME)!.markLeft(base, 'u5', Date.now() - 20_000) as PurpleState
  const finished16 = { ...act(base, { action: 'end' }), rematchVotes: ['u1', 'u3', 'u7'] }

  const small = tablePlayers(3, 0)
  const s1 = fresh(small.players, 'apercu-purple-3')
  const s2 = win(s1, 2)
  const s3 = act(s2, { action: 'continue' })
  const s4 = win(s3, 1)
  const s5 = act(s4, { action: 'pass' })
  const s6 = lose(s5)
  const s7 = act(s6, { action: 'close-reveal' })

  // Paquet presque vide → le pari à deux cartes reboucle un paquet neuf.
  let d = fresh(small.players, 'apercu-purple-paquet')
  let turn = 0
  while (d.deck.length > 1) {
    d = turn % 3 === 0 ? act(win(d, 1), { action: 'pass' }) : act(act(d, { action: 'bet', bet: d.deck[0].color === 'red' ? 'noir' : 'rouge' }), { action: 'close-reveal' })
    turn += 1
  }
  const deckEnd = d
  const deckNew = act(deckEnd, { action: 'bet', bet: 'purple' })
  // Pari suivant dans les 4 s du flash : il doit s'éteindre seul, le nombre de cartes restant visible.
  const afterNew = act(deckNew, { action: deckNew.canContinue ? 'pass' : 'close-reveal' })
  const nextBet = win(afterNew, 1)

  const duo = tablePlayers(1, 1)
  let f2 = fresh(duo.players, 'apercu-purple-2')
  f2 = act(lose(f2), { action: 'close-reveal' })
  f2 = act(win(f2, 2), { action: 'pass' })
  f2 = act(lose(f2), { action: 'close-reveal' })
  const finished2 = act(f2, { action: 'end' })

  return [
    { id: 'pari-16', label: '16 joueurs : pari en attente (Marie-Charlotte)', steps: [step('pari', base, members)] },
    { id: 'gagne-16', label: '16 joueurs : double purple gagné', steps: [step('gagné', won16, members)] },
    { id: 'perdu-16', label: '16 joueurs : mauvaise pioche', steps: [step('perdu', lost16, members)] },
    { id: 'parti-16', label: '16 joueurs : un joueur parti (remplacement)', steps: [step('parti', left16, members)] },
    { id: 'fin-16', label: '16 joueurs : fin de partie, revanche en cours', steps: [step('fin', finished16, members)] },
    {
      id: 'tour-3',
      label: '3 joueurs : un tour complet',
      steps: [
        step('pari', s1, small.members),
        step('purple gagné', s2, small.members),
        step('continue', s3, small.members),
        step('rouge/noir gagné', s4, small.members),
        step('passe la main', s5, small.members),
        step('perdu', s6, small.members),
        step('joueur suivant', s7, small.members),
      ],
    },
    {
      id: 'paquet-3',
      label: '3 joueurs : paquet épuisé, nouveau paquet puis pari suivant',
      steps: [
        step('dernière carte', deckEnd, small.members),
        step('nouveau paquet', deckNew, small.members),
        step('joueur suivant', afterNew, small.members),
        step('pari suivant', nextBet, small.members),
      ],
    },
    { id: 'fin-2', label: '2 joueurs (dont un bot) : fin de partie', steps: [step('fin', finished2, duo.members)] },
  ]
}
