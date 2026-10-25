import {
  countMatches,
  createMenteurState,
  menteurAlivePlayers,
  currentMenteurActorId,
  menteurBotSeatId,
  menteurSeatPlayedByBot,
  reduceMenteur,
  toMenteurClientView,
  type MenteurInitialPlayer,
  type MenteurRules,
  type MenteurState,
} from '@/lib/menteur/engine'
import { menteurBotDecide } from '@/lib/menteur/bot-brain'
import { applyMenteurBotAction } from '@/lib/menteur/server-adapter'
import { DEFAULT_BOT_TRAITS } from '@/lib/online/bot-personas'
import { onlineRoom, previewMembers, type PreviewMember, type TvPreviewFixture, type TvPreviewStep } from '../fixture-kit'

/**
 * Le Menteur : de vraies parties jouées par le moteur (cerveau des bots pour
 * tout le monde, paroles des bots comprises), graine et hasard fixes, figées
 * aux moments que rend la TV. Les humains jouent avec les traits par défaut
 * et sans parole, comme un humain réel n'en a pas.
 */

function seeded(seed: number): () => number {
  let s = seed >>> 0
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0
    return s / 2 ** 32
  }
}

type Table = { state: MenteurState; now: number; rand: () => number }

function newTable(players: MenteurInitialPlayer[], seed: number, rules: MenteurRules = {}): Table {
  return { state: createMenteurState(players, seed, rules), now: Date.now() - 60 * 60_000, rand: seeded(seed) }
}

/** Un coup de l'acteur courant ; 5 s passent à chaque coup (plancher de lecture). */
function step(table: Table): void {
  table.now += 5_000
  const { state } = table
  // Le siège qui joue, révélation comprise (currentMenteurActorId y vaut null :
  // n'importe qui referme les gobelets).
  const actorId = menteurBotSeatId(state)
  const actor = state.players.find((p) => p.id === actorId)
  if (!actor) throw new Error('Menteur : aucun acteur')
  if (menteurSeatPlayedByBot(actor)) {
    const res = applyMenteurBotAction(state, table.rand, table.now, table.rand)
    if (!res.ok) throw new Error(`Menteur : coup de bot refusé (${res.error})`)
    table.state = res.state
    return
  }
  if (state.phase === 'reveal') {
    table.state = reduceMenteur(state, { type: 'CONTINUE', playerId: actor.id, now: table.now })
    return
  }
  const { action } = menteurBotDecide(toMenteurClientView(state, actor.id), actor.id, DEFAULT_BOT_TRAITS, table.rand)
  table.state =
    action.type === 'BID'
      ? reduceMenteur(state, { type: 'BID', playerId: actor.id, qty: action.qty, face: action.face })
      : reduceMenteur(state, { type: action.type, playerId: actor.id, now: table.now })
}

function runUntil(table: Table, done: (s: MenteurState) => boolean, max = 2_000): void {
  for (let i = 0; i < max; i += 1) {
    if (done(table.state)) return
    if (table.state.phase === 'finished') break
    step(table)
  }
  if (!done(table.state)) throw new Error('Menteur : état visé jamais atteint')
}

const HUMANS_LONG = ['Marie-Charlotte', 'Jean-Baptiste', 'Maxime']
const BOTS = ['Gépéto', 'Ginette', 'Bernadette']

/** 6 sièges (le maximum) : 3 humains aux noms longs, 3 bots bavards, alternés. */
function sixSeats(): { players: MenteurInitialPlayer[]; members: PreviewMember[] } {
  const members = previewMembers(3, HUMANS_LONG)
  const players: MenteurInitialPlayer[] = []
  for (let i = 0; i < 3; i += 1) {
    players.push({ id: members[i].userId, name: members[i].displayName })
    players.push({ id: `bot-${i + 1}`, name: BOTS[i], isBot: true })
  }
  return { players, members }
}

function stepOf(label: string, table: Table, members: PreviewMember[]): TvPreviewStep {
  return {
    label,
    room: onlineRoom('menteur', table.state, {
      members,
      currentTurnUserId: currentMenteurActorId(table.state),
      stateVersion: table.state.version,
    }),
  }
}

/** Une table jouée jusqu'au bout, figée à chaque moment demandé, dans l'ordre. */
function sequence(
  table: Table,
  members: PreviewMember[],
  marks: { label: string; until: (s: MenteurState) => boolean }[]
): TvPreviewStep[] {
  return marks.map(({ label, until }) => {
    runUntil(table, until)
    return stepOf(label, table, members)
  })
}

const opening = (s: MenteurState) => s.phase === 'bidding' && s.currentBid === null
const bidsAtLeast = (n: number) => (s: MenteurState) => s.phase === 'bidding' && (s.bids?.length ?? 0) >= n
const reveal = (s: MenteurState) => s.phase === 'reveal'

function table6(): TvPreviewFixture {
  const { players, members } = sixSeats()
  const table = newTable(players, 4242, { calza: true })
  let roundOfReveal = 0
  return {
    id: 'table-6',
    label: '6 joueurs (noms longs, 3 bots) : ouverture, enchères, révélation, manche 2',
    steps: sequence(table, members, [
      { label: 'ouverture de la manche', until: opening },
      { label: 'enchères (échelle + paroles)', until: bidsAtLeast(5) },
      {
        label: 'gobelets levés',
        until: (s) => {
          if (!reveal(s)) return false
          roundOfReveal = s.round
          return true
        },
      },
      { label: 'manche suivante', until: (s) => s.phase === 'bidding' && s.round > roundOfReveal && s.currentBid !== null },
    ]),
  }
}

/** Bluffs démasqués hors des 6 dernières enchères : ceux qu'une échelle d'une ligne fait tomber. */
const earlyBluffs = (s: MenteurState) => {
  const bids = s.duels?.[s.duels.length - 1]?.bids ?? []
  return bids.slice(0, -6).filter((b) => b.bluff).length
}

function longChain(): TvPreviewFixture {
  const { players, members } = sixSeats()
  // La plus longue chaîne trouvée parmi quelques graines : l'échelle de la révélation au pire.
  let best: Table | null = null
  for (let seed = 1; seed <= 40; seed += 1) {
    const table = newTable(players, seed)
    runUntil(table, reveal)
    if (!best || (table.state.bids?.length ?? 0) > (best.state.bids?.length ?? 0)) best = table
  }
  const table = best as Table
  // Bandeau « joueur parti » (une seule ligne d'échelle) et bluffs en début de chaîne.
  let bluffy: Table | null = null
  for (let seed = 1; seed <= 120; seed += 1) {
    const t = newTable(players, seed)
    t.state = reduceMenteur(t.state, { type: 'LEAVE', playerId: 'u2', at: Date.now() })
    runUntil(t, reveal)
    if (!bluffy || earlyBluffs(t.state) > earlyBluffs(bluffy.state)) bluffy = t
  }
  return {
    id: 'longue-chaine',
    label: `6 joueurs, révélation après ${table.state.bids?.length ?? 0} enchères ; puis bandeau et bluffs rognés`,
    steps: [
      stepOf('révélation, longue échelle', table, members),
      stepOf('révélation, joueur parti, bluffs hors échelle', bluffy as Table, members),
    ],
  }
}

function elimination(): TvPreviewFixture {
  const { players, members } = sixSeats()
  const table = newTable(players, 777, { palifico: true })
  const steps = sequence(table, members, [
    { label: 'manche Palifico, ouverture', until: (s) => s.phase === 'bidding' && s.palifico && s.currentBid === null },
    { label: 'manche Palifico', until: (s) => s.phase === 'bidding' && s.palifico && s.currentBid !== null },
    { label: 'éliminé (cul sec)', until: (s) => reveal(s) && Boolean(s.lastReveal?.eliminatedId) },
    { label: 'podium', until: (s) => s.phase === 'finished' },
  ])
  // Les votes de revanche sont écrits par la salle (route commune), pas par le moteur.
  table.state = { ...table.state, rematchVotes: [members[0].userId, members[2].userId] }
  steps.push(stepOf('podium, revanche demandée', table, members))
  return {
    id: 'elimination',
    label: '6 joueurs, Palifico : ouverture et enchère Palifico, un joueur éliminé, podium, revanche',
    steps,
  }
}

function duel2(): TvPreviewFixture {
  const members = previewMembers(1, ['Léa'])
  const players: MenteurInitialPlayer[] = [
    { id: members[0].userId, name: members[0].displayName },
    { id: 'bot-1', name: 'Raoul', isBot: true },
  ]
  const table = newTable(players, 99, { calza: true })
  const steps = sequence(table, members, [
    { label: 'ouverture (2 joueurs)', until: opening },
    { label: 'enchère en cours', until: bidsAtLeast(2) },
    { label: 'révélation', until: reveal },
  ])
  // Un Calza demandé à la main sur la manche suivante : le Calza n'a pas d'autre rendu.
  runUntil(table, (s) => s.phase === 'bidding' && s.currentBid !== null && currentMenteurActorId(s) === 'u1')
  table.now += 5_000
  table.state = reduceMenteur(table.state, { type: 'CALZA', playerId: 'u1', now: table.now })
  steps.push(stepOf('Calza', table, members))
  return { id: 'duel-2', label: '2 joueurs (Léa contre un bot) : ouverture, enchère, révélation, Calza', steps }
}

/**
 * L'acteur courant annonce la face la plus fournie, pile le compte (Calza
 * juste) ou un de plus (Calza raté), et le suivant crie CALZA : à la main,
 * les bots n'en viennent presque jamais à ces deux issues.
 */
function forceCalza(table: Table, exact: boolean): void {
  const alive = menteurAlivePlayers(table.state)
  let face = 2
  for (let f = 3; f <= 6; f += 1) {
    if (countMatches(alive, f, table.state.palifico) > countMatches(alive, face, table.state.palifico)) face = f
  }
  const count = countMatches(alive, face, table.state.palifico)
  const bidder = currentMenteurActorId(table.state) as string
  table.state = reduceMenteur(table.state, { type: 'BID', playerId: bidder, qty: exact ? count : count + 1, face })
  table.now += 5_000
  const caller = currentMenteurActorId(table.state) as string
  table.state = reduceMenteur(table.state, { type: 'CALZA', playerId: caller, now: table.now })
}

function calza6(): TvPreviewFixture {
  const { players, members } = sixSeats()
  const capped = newTable(players, 4242, { calza: true })
  runUntil(capped, opening)
  forceCalza(capped, true)
  const missed = newTable(players, 31, { calza: true })
  runUntil(missed, opening)
  forceCalza(missed, false)
  return {
    id: 'calza',
    label: '6 joueurs : Calza juste à 5 dés (rien à regagner), Calza raté',
    steps: [stepOf('Calza juste, dés au maximum', capped, members), stepOf('Calza raté', missed, members)],
  }
}

function leftPlayer(): TvPreviewFixture {
  const { players, members } = sixSeats()
  const table = newTable(players, 4242)
  runUntil(table, bidsAtLeast(3))
  table.state = reduceMenteur(table.state, { type: 'LEAVE', playerId: 'u2', at: Date.now() })
  const steps = [stepOf('joueur parti', table, members)]
  // Le cas le plus haut de la révélation : bandeau d'attente et 6 rangées de dés.
  runUntil(table, reveal)
  steps.push(stepOf('gobelets levés, joueur parti', table, members))
  return {
    id: 'parti',
    label: '6 joueurs, Jean-Baptiste parti (attente de retour) : enchères puis révélation',
    steps,
  }
}

export function build(): TvPreviewFixture[] {
  return [table6(), longChain(), elimination(), duel2(), calza6(), leftPlayer()]
}
