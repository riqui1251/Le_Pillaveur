import {
  addMCSpeech,
  createMCState,
  mcSpymasterOf,
  reduceMC,
  MC_GRID,
  type MCState,
  type MCTeam,
  type MCTileKind,
} from '@/lib/mots-codes/engine'
import { phaseKey } from '@/lib/online/phase-clock'
import { buildMCState } from '@/lib/mots-codes/server-adapter'
import { MC_WORDS_IT } from '@/lib/mots-codes/data'
import { onlineRoom, previewMembers, type PreviewMember, type TvPreviewFixture, type TvPreviewStep } from '../fixture-kit'

const GAME = 'mots-codes'

/** 16 = plafond du jeu ; beaucoup de noms longs pour éprouver les colonnes d'équipe. */
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

function members(count: number, names: readonly string[] = LONG_NAMES): PreviewMember[] {
  return previewMembers(count, names)
}

/** Échéance lointaine : le minuteur reste visible dans l'aperçu. */
function keepTimer(s: MCState): MCState {
  return s.phaseEndsAt === null ? s : { ...s, phaseEndsAt: Date.now() + 10 * 60_000 }
}

function step(label: string, list: PreviewMember[], s: MCState): TvPreviewStep {
  return {
    label,
    room: onlineRoom(GAME, keepTimer(s), { members: list, stateVersion: s.version }),
  }
}

function startNow(s: MCState): MCState {
  return reduceMC(s, {
    type: 'ADVANCE',
    claimedKey: phaseKey(s),
    now: (s.phaseEndsAt ?? Date.now()) + 1,
  })
}

function clue(s: MCState, word: string, count: number): MCState {
  const master = mcSpymasterOf(s, s.activeTeam)
  if (!master) throw new Error('pas de maître-mot')
  return reduceMC(s, { type: 'GIVE_CLUE', playerId: master.id, word, count, now: Date.now() })
}

function guesserOf(s: MCState, team: MCTeam): string {
  const g = s.players.find((p) => p.team === team && !p.isSpymaster && !p.leftAt)
  if (!g) throw new Error('pas de devineur')
  return g.id
}

function firstTile(s: MCState, kind: MCTileKind): number {
  const i = s.kinds.findIndex((k, idx) => k === kind && !s.revealed[idx])
  if (i < 0) throw new Error(`plus de tuile ${kind}`)
  return i
}

function guess(s: MCState, kind: MCTileKind): MCState {
  return reduceMC(s, { type: 'GUESS', playerId: guesserOf(s, s.activeTeam), tile: firstTile(s, kind), now: Date.now() })
}

function other(team: MCTeam): MCTeam {
  return team === 'gold' ? 'red' : 'gold'
}

/** Joue une manche « honnête » : l'équipe active trouve `hits` mots puis tombe sur une tuile neutre. */
function round(s: MCState, word: string, hits: number, miss: 'neutral' | 'other' = 'neutral'): MCState {
  let n = clue(s, word, Math.max(1, hits))
  for (let i = 0; i < hits && n.phase === 'guess'; i += 1) n = guess(n, n.activeTeam)
  if (n.phase === 'guess') n = guess(n, miss === 'neutral' ? 'neutral' : other(n.activeTeam))
  return n
}

/** Choix d'équipe du lobby : en alternance, ou les `goldCount` premiers en Or. */
function teamChoices(list: PreviewMember[], goldCount?: number): Record<string, MCTeam> {
  return Object.fromEntries(
    list.map((m, i): [string, MCTeam] => [
      m.userId,
      (goldCount === undefined ? i % 2 === 0 : i < goldCount) ? 'gold' : 'red',
    ])
  )
}

function maxTable(): TvPreviewFixture {
  const list = members(16)
  const s0 = buildMCState(
    list.map((m) => ({ userId: m.userId, displayName: m.displayName })),
    teamChoices(list),
    'fr',
    'tv-mc-16'
  )
  const s1 = startNow(s0)
  const s2 = clue(s1, 'Vignoble', 3)
  const s3 = guess(s2, s2.activeTeam)
  const s4 = guess(s3, 'neutral')
  let mid = round(s4, 'Océan', 2)
  mid = round(mid, 'Forteresse', 2, 'other')
  mid = clue(mid, 'Médiéval', 2)
  const gone = mid.players.find((p) => !p.isSpymaster && p.team === mid.activeTeam && p.name.length > 10)
  const withLeft: MCState = gone
    ? { ...mid, players: mid.players.map((p) => (p.id === gone.id ? { ...p, leftAt: Date.now() } : p)) }
    : mid
  let end = mid
  for (let guard = 0; guard < 30 && end.phase !== 'finished'; guard += 1) {
    end = end.phase === 'clue' ? clue(end, 'Navigation', 9) : guess(end, end.activeTeam)
  }
  const rematch: MCState = { ...end, rematchVotes: [list[0].userId, list[3].userId] }
  /** Cas le plus serré de la grille : « Marie-Charlotte (Rouge) prépare son indice… » sur deux lignes + bandeau de retour. */
  const redClue = [s1, s4].find((s) => s.activeTeam === 'red') ?? s1
  const longest = redClue.players
    .filter((p) => !p.isSpymaster && !p.isBot)
    .reduce((a, b) => (b.name.length > a.name.length ? b : a))
  const clueWithLeft: MCState = {
    ...redClue,
    players: redClue.players.map((p) => (p.id === longest.id ? { ...p, leftAt: Date.now() } : p)),
  }
  return {
    id: 'table-16',
    label: '16 joueurs (8 contre 8), noms longs : manche complète, victoire puis revanche',
    steps: [
      step('compte à rebours', list, s0),
      step('indice attendu', list, s1),
      step('indice donné', list, s2),
      step('1 mot trouvé', list, s3),
      step('neutre : la main passe', list, s4),
      step('milieu de partie, indice', list, mid),
      step('joueur parti (bandeau de retour)', list, withLeft),
      step('indice attendu, Maître-mot au nom long + joueur parti', list, clueWithLeft),
      step('victoire', list, end),
      step('victoire, revanche demandée (2/16)', list, rematch),
    ],
  }
}

function lopsided(): TvPreviewFixture {
  const list = members(16)
  const s0 = buildMCState(
    list.map((m) => ({ userId: m.userId, displayName: m.displayName })),
    teamChoices(list, 14),
    'fr',
    'tv-mc-14-2'
  )
  const s1 = clue(startNow(s0), 'Anticonstitutionnel', 4)
  return {
    id: 'equipes-14-2',
    label: '16 joueurs en 14 contre 2 (colonne la plus haute), indice de 19 lettres',
    steps: [step('compte à rebours', list, s0), step('indice long', list, s1)],
  }
}

function smallAssassin(): TvPreviewFixture {
  const list = previewMembers(4)
  const s0 = buildMCState(
    list.map((m) => ({ userId: m.userId, displayName: m.displayName })),
    teamChoices(list),
    'fr',
    'tv-mc-4'
  )
  const s1 = startNow(s0)
  const s2 = clue(s1, 'Chaise', 2)
  const s3 = guess(s2, s2.activeTeam)
  const s4 = guess(s3, 'assassin')
  return {
    id: 'table-4-assassin',
    label: '4 joueurs : indice, un mot trouvé, puis l’assassin',
    steps: [
      step('indice attendu', list, s1),
      step('indice donné', list, s2),
      step('1 mot trouvé', list, s3),
      step('assassin touché', list, s4),
    ],
  }
}

/** Les 25 mots les plus longs de la banque italienne (« interruttore »…) : césure des tuiles. */
function longWords(): TvPreviewFixture {
  const list = members(8)
  const words = [...new Set(MC_WORDS_IT)].sort((a, b) => b.length - a.length).slice(0, MC_GRID)
  const players = list.map((m, i) => ({ id: m.userId, name: m.displayName, team: (i % 2 === 0 ? 'gold' : 'red') as MCTeam }))
  const s0 = createMCState(players, words, 'tv-mc-long')
  const s1 = startNow(s0)
  let s2 = round(s1, 'Cantiere', 2)
  s2 = clue(s2, 'Ufficio', 2)
  s2 = guess(s2, s2.activeTeam)
  return {
    id: 'mots-longs',
    label: '8 joueurs, mots italiens les plus longs (12 lettres)',
    steps: [step('grille vierge', list, s1), step('quelques mots révélés', list, s2)],
  }
}

/** Réactions des bots (remplaçants) : bien vu, cadeau à l'adversaire, l'assassin. */
function botChatter(): TvPreviewFixture {
  const list = members(4)
  const players = [
    ...list.map((m, i) => ({ id: m.userId, name: m.displayName, team: (i % 2 === 0 ? 'gold' : 'red') as MCTeam })),
    { id: 'bot-1', name: 'Paulette', team: 'gold' as MCTeam, isBot: true },
    { id: 'bot-2', name: 'Kéké', team: 'red' as MCTeam, isBot: true },
  ]
  const s1 = startNow(createMCState(players, MC_WORDS_IT.slice(0, 40), 'tv-mc-paroles'))
  const team = s1.activeTeam
  const mateBot = team === 'gold' ? 'bot-1' : 'bot-2'
  const rivalBot = team === 'gold' ? 'bot-2' : 'bot-1'
  let s2 = guess(clue(s1, 'Cantiere', 2), team)
  const finder = guesserOf(s2, team)
  s2 = addMCSpeech(s2, { playerId: mateBot, kind: 'nice', targetId: finder })
  let s3 = guess(s2, other(team))
  s3 = addMCSpeech(s3, { playerId: rivalBot, kind: 'thanks', targetId: finder })
  s3 = addMCSpeech(s3, { playerId: mateBot, kind: 'oops', targetId: finder })
  const victim = guesserOf(s3, s3.activeTeam)
  let s4 = guess(clue(s3, 'Ufficio', 1), 'assassin')
  s4 = addMCSpeech(s4, { playerId: s3.activeTeam === 'gold' ? 'bot-1' : 'bot-2', kind: 'assassin', targetId: victim })
  return {
    id: 'paroles-bots',
    label: 'Réactions des bots, 4 joueurs + 2 bots',
    steps: [
      step('bien vu', list, s2),
      step('tuile adverse : merci du cadeau', list, s3),
      step('assassin, réaction', list, s4),
    ],
  }
}

export function build(): TvPreviewFixture[] {
  return [maxTable(), lopsided(), smallAssassin(), longWords(), botChatter()]
}
