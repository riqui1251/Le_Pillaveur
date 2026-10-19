import { BOT_PERSONAS, botDisplayName } from '@/lib/online/bot-personas'
import { phaseKey } from '@/lib/online/phase-clock'
import { createRng } from '@/lib/petit-buveur/rng'
import {
  createPreState,
  preOuRien,
  prePickBotPlay,
  preSortHand,
  reducePre,
  PRE_INTERLUDE_MIN_MS,
  PRE_INTERLUDE_MS,
  type PreState,
} from '@/lib/president/engine'
import { onlineRoom, previewMembers, type PreviewMember, type TvPreviewFixture } from '../fixture-kit'

const LONG_NAMES = [
  'Marie-Charlotte',
  'Jean-Baptiste',
  'Maxime-Alexandre',
  'Léa',
  'Anne-Sophie',
  'Pierre-Emmanuel',
] as const

/** Ids réels du catalogue d'icônes (les emojis du kit retombent sur la chope). */
const ICONS = ['chope', 'vin', 'flute', 'cocktail', 'whisky', 'bouteille', 'trinque', 'shaker']

const LATER = () => Date.now() + 10 * 60_000

function members(count: number): PreviewMember[] {
  return previewMembers(count, LONG_NAMES).map((m, i) => ({
    ...m,
    preferences: { ...m.preferences, icon: ICONS[i % ICONS.length] },
  }))
}

type Table = { list: PreviewMember[]; state: PreState }

/** Table de `humans` joueurs + `bots` bots (personas réels : avatar et accord en genre). */
function newTable(humans: number, bots: number, seed: string, manches = 3): Table {
  const list = members(humans)
  const players = [
    ...list.map((m) => ({ id: m.userId, name: m.displayName })),
    ...Array.from({ length: bots }, (_, i) => ({
      id: `bot-${i + 1}`,
      name: botDisplayName(BOT_PERSONAS[(i * 3 + 1) % BOT_PERSONAS.length]),
      isBot: true,
    })),
  ]
  return { list, state: createPreState(players, seed, Date.now(), manches) }
}

function deal(s: PreState): PreState {
  return reducePre(s, { type: 'ADVANCE', claimedKey: phaseKey(s), now: s.phaseEndsAt ?? Date.now() })
}

/** Un tour joué par la stratégie des bots du moteur (humains compris), tirages seedés. */
function turn(s: PreState, rand: () => number): PreState {
  const actor = s.currentTurnId
  if (!actor) return s
  const now = Date.now()
  const pick = prePickBotPlay(s, actor, rand)
  if (pick) {
    try {
      return reducePre(s, { type: 'PLAY', playerId: actor, cards: pick, now })
    } catch {
      // Pose refusée par le moteur : on passe (ou on mène au plus petit).
    }
  }
  if (!s.lastPlay) {
    const hand = s.players.find((p) => p.id === actor)?.hand ?? []
    return reducePre(s, { type: 'PLAY', playerId: actor, cards: [preSortHand(hand)[0]], now })
  }
  return reducePre(s, { type: 'PASS', playerId: actor, now })
}

function finishManche(s: PreState, rand: () => number): PreState {
  for (let guard = 0; guard < 2_000 && s.phase === 'playing'; guard += 1) s = turn(s, rand)
  if (s.phase === 'playing') throw new Error('Manche de Président non terminée')
  return s
}

/** « Manche suivante » d'un humain, après le temps de lecture minimal. */
function nextManche(s: PreState, by: string): PreState {
  const now = (s.phaseEndsAt ?? Date.now()) - PRE_INTERLUDE_MS + PRE_INTERLUDE_MIN_MS + 1
  return reducePre(s, { type: 'CONTINUE', playerId: by, now })
}

function withTimer(s: PreState): PreState {
  return s.phaseEndsAt === null ? s : { ...s, phaseEndsAt: LATER() }
}

function step(label: string, t: Table, s: PreState): TvPreviewFixture['steps'][number] {
  const state = withTimer(s)
  return {
    label,
    room: onlineRoom('president', state, {
      members: t.list,
      currentTurnUserId: state.currentTurnId,
      stateVersion: state.version,
    }),
  }
}

/**
 * Cherche, en jouant la manche, le premier état qui satisfait `want` ;
 * à défaut, le meilleur état « en jeu » vu (selon `score`).
 */
function playUntil(s: PreState, rand: () => number, want: (x: PreState) => boolean, score: (x: PreState) => number): PreState {
  let best = s
  for (let guard = 0; guard < 2_000 && s.phase === 'playing'; guard += 1) {
    if (want(s)) return s
    if (score(s) > score(best)) best = s
    s = turn(s, rand)
  }
  return best
}

export function build(): TvPreviewFixture[] {
  // ── 8 joueurs (maximum), noms longs, deux bots ────────────────────────────
  const t8 = newTable(6, 2, 'tv-president-8')
  const r8 = createRng('tv-president-8-jeu').next
  const countdown8 = t8.state
  const free8 = deal(countdown8)

  let s = finishManche(free8, r8)
  const interlude8 = s
  s = nextManche(s, 'u1')
  const manche2Start = s
  // Milieu de manche 2 : un joueur sorti, des plis archivés, idéalement un « ou rien ».
  const mid8 = playUntil(
    s,
    r8,
    (x) => x.outOrder.length >= 1 && x.trickHistory.length >= 3 && preOuRien(x) !== null,
    (x) =>
      (x.lastPlay ? 1 : 0) + (preOuRien(x) !== null ? 4 : 0) + Math.min(x.outOrder.length, 1) * 2 + Math.min(x.trickHistory.length, 3)
  )
  // Un humain qui n'a pas la main quitte la table : bandeau « en attente du retour ».
  const leaver = mid8.players.find((p) => !p.isBot && p.id !== mid8.currentTurnId && p.hand.length > 0)
  const midLeft8 = leaver ? reducePre(mid8, { type: 'LEAVE', playerId: leaver.id, at: Date.now() }) : mid8

  // Grosse pose (brelan, carré ou jokers) : largeur du tapis.
  const big8 = playUntil(
    manche2Start,
    createRng('tv-president-8-gros').next,
    (x) => (x.lastPlay?.cards.length ?? 0) >= 3 || (x.lastPlay?.cards.some((c) => c >= 52) ?? false),
    (x) => x.lastPlay?.cards.length ?? 0
  )

  // Séquence : les premières poses de la manche 2, coup par coup.
  const seq: PreState[] = [manche2Start]
  for (let i = 0; i < 7; i += 1) seq.push(turn(seq[seq.length - 1], r8))

  let end8 = finishManche(mid8, r8)
  while (end8.phase === 'interlude') end8 = finishManche(nextManche(end8, 'u1'), r8)
  const finished8: PreState = { ...end8, rematchVotes: ['u1', 'u3'] }

  // ── 4 joueurs (minimum), deux humains et deux bots ────────────────────────
  const t4 = newTable(2, 2, 'tv-president-4', 1)
  const r4 = createRng('tv-president-4-jeu').next
  const free4 = deal(t4.state)
  const mid4 = playUntil(
    free4,
    r4,
    (x) => x.lastPlay !== null && x.trickHistory.length >= 2,
    (x) => x.trickHistory.length
  )
  const finished4 = finishManche(mid4, r4)

  const t4b = newTable(4, 0, 'tv-president-4b')
  const interlude4 = finishManche(deal(t4b.state), createRng('tv-president-4b-jeu').next)

  return [
    { id: 'compte-a-rebours-8', label: 'Compte à rebours, 8 joueurs', steps: [step('compte à rebours', t8, countdown8)] },
    { id: 'pli-libre-8', label: 'Manche 1, pli libre, 8 joueurs', steps: [step('pli libre', t8, free8)] },
    {
      id: 'milieu-8',
      label: 'Manche 2 : sortie, plis précédents, « ou rien », joueur parti (8 joueurs)',
      steps: [step('milieu de manche', t8, mid8), step('un joueur quitte la table', t8, midLeft8)],
    },
    { id: 'grosse-pose-8', label: 'Grosse pose (brelan/carré/joker), 8 joueurs', steps: [step('grosse pose', t8, big8)] },
    {
      id: 'sequence-8',
      label: 'Séquence : premières poses de la manche 2 (8 joueurs)',
      steps: seq.map((x, i) => step(i === 0 ? 'donne' : `coup ${i}`, t8, x)),
    },
    { id: 'fin-manche-8', label: 'Fin de manche, 8 joueurs', steps: [step('fin de manche', t8, interlude8)] },
    { id: 'fin-partie-8', label: 'Fin de partie, 8 joueurs (revanche 2/6)', steps: [step('fin de partie', t8, finished8)] },
    { id: 'milieu-4', label: 'Manche en cours, 4 joueurs', steps: [step('milieu de manche', t4, mid4)] },
    { id: 'fin-manche-4', label: 'Fin de manche, 4 joueurs', steps: [step('fin de manche', t4b, interlude4)] },
    { id: 'fin-partie-4', label: 'Fin de partie, 4 joueurs', steps: [step('fin de partie', t4, finished4)] },
  ]
}
