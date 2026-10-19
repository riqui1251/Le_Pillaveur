import {
  createImposteurState,
  currentImposteurActorId,
  imposteurAlive,
  isValidClue,
  reduceImposteur,
  IMPOSTEUR_EMPTY_CLUE,
  type ImposteurSpeechKind,
  type ImposteurState,
} from '@/lib/imposteur/engine'
import { phaseKey } from '@/lib/online/phase-clock'
import { BOT_PERSONAS, botDisplayName } from '@/lib/online/bot-personas'
import { onlineRoom, previewMembers, PREVIEW_NAMES, type PreviewMember, type TvPreviewFixture, type TvPreviewStep } from '../fixture-kit'

const GAME = 'imposteur'
const PAIRS = [{ a: 'plage', b: 'piscine' }]

/** 16 noms (le maximum du jeu), dont plusieurs longs. */
const NAMES_16 = [...PREVIEW_NAMES, 'Anne-Sophie', 'Pierre-Alexandre'] as const

/** Indices plausibles pour les deux mots ; le premier valide pour le mot du joueur est pris. */
const CLUES = [
  'sable',
  'serviette',
  'crème solaire indice cinquante',
  'maillot',
  'bouée',
  'été',
  'chlore',
  'vacances',
  'parasol',
  'nager',
  'bonnet',
  'transat',
  'soleil',
  'plongeoir',
  'coquillage',
  'lunettes',
]

/** Paire de titres longs (fr.ts) et indices d'environ 25 caractères : la ligne d'indice la plus large. */
const PAIRS_LONG_FR = [{ a: 'Harry Potter', b: 'Le Seigneur des Anneaux' }]
const CLUES_LONG_FR = [
  'baguette magique en bois',
  'école de sorciers anglais',
  'grand voyage vers la montagne',
  'cicatrice en forme d’éclair',
  'magicien à longue barbe',
  'saga de livres et de films',
  'petit héros très courageux',
  'chapeau pointu qui parle',
  'combat du bien contre le mal',
  'créatures, elfes et dragons',
]

/** La paire la plus longue du jeu (it.ts) : la fin de partie doit passer à la ligne. */
const PAIRS_LONG_IT = [{ a: 'contratto a tempo indeterminato', b: 'contratto a tempo determinato' }]
const CLUES_LONG_IT = [
  'posto fisso per tutta la vita',
  'lavoro in ufficio ogni giorno',
  'stipendio a fine mese',
  'firma dal datore di lavoro',
  'scadenza da rinnovare',
  'ferie pagate e tredicesima',
  'periodo di prova iniziale',
  'busta paga e contributi',
  'sindacato e diritti',
]

const NAMES_8_LONG = ['Marie-Charlotte', 'Jean-Baptiste', 'Pierre-Alexandre', 'Anne-Sophie', 'Sofiane'] as const

type Table = { members: PreviewMember[]; players: { id: string; name: string; isBot?: boolean }[] }

function table(humans: number, bots: number, names: readonly string[]): Table {
  const members = previewMembers(humans, names)
  const players = [
    ...members.map((m) => ({ id: m.userId, name: m.displayName })),
    ...Array.from({ length: bots }, (_, i) => ({
      id: `bot-${i + 1}`,
      name: botDisplayName(BOT_PERSONAS[i % BOT_PERSONAS.length]),
      isBot: true,
    })),
  ]
  return { members, players }
}

/** Échéance lointaine : le minuteur reste visible dans l'aperçu. */
function frozen(state: ImposteurState): ImposteurState {
  return state.phaseEndsAt === null ? state : { ...state, phaseEndsAt: Date.now() + 10 * 60_000 }
}

function step(label: string, state: ImposteurState, members: PreviewMember[]): TvPreviewStep {
  const shown = frozen(state)
  return {
    label,
    room: onlineRoom(GAME, shown, {
      members,
      currentTurnUserId: currentImposteurActorId(shown),
      stateVersion: shown.version,
    }),
  }
}

function advance(state: ImposteurState): ImposteurState {
  const now = (state.phaseEndsAt ?? Date.now()) + 1
  return reduceImposteur(state, { type: 'ADVANCE', claimedKey: phaseKey(state), now })
}

/** Donne `count` indices dans l'ordre de parole (tous si absent). */
function giveClues(
  state: ImposteurState,
  count = Number.POSITIVE_INFINITY,
  offset = 0,
  pool: readonly string[] = CLUES
): ImposteurState {
  let s = state
  let given = 0
  while (s.phase === 'clue' && given < count) {
    const actorId = s.clueOrder[s.clueTurnIdx]
    const actor = s.players.find((p) => p.id === actorId)
    const idx = (s.clueTurnIdx + offset + s.round * 5) % pool.length
    const text =
      [...pool.slice(idx), ...pool.slice(0, idx)].find((c) => actor && isValidClue(c, actor.word)) ??
      IMPOSTEUR_EMPTY_CLUE
    s = reduceImposteur(s, { type: 'CLUE', playerId: actorId, text, now: Date.now() })
    given += 1
  }
  return s
}

function speak(state: ImposteurState, lines: [string, ImposteurSpeechKind, string][]): ImposteurState {
  let s = state
  for (const [playerId, kind, targetId] of lines) {
    try {
      s = reduceImposteur(s, { type: 'SPEAK', playerId, kind, targetId })
    } catch {
      // Parole refusée par le moteur (cible éliminée, plafond) : l'aperçu continue sans elle.
    }
  }
  return s
}

/** `count` vivants votent pour `targetId` (ceux qui ne peuvent pas — la cible — votent pour `fallbackId`). */
function vote(state: ImposteurState, targetId: string, fallbackId: string, count = Number.POSITIVE_INFINITY): ImposteurState {
  let s = state
  let done = 0
  for (const voter of imposteurAlive(state)) {
    if (s.phase !== 'vote' || done >= count) break
    if (s.pendingVotes[voter.id]) continue
    s = reduceImposteur(s, {
      type: 'VOTE',
      playerId: voter.id,
      targetId: voter.id === targetId ? fallbackId : targetId,
      now: Date.now(),
    })
    done += 1
  }
  return s
}

const idsOf = (state: ImposteurState, team: 'civil' | 'imposteur') =>
  state.players.filter((p) => p.team === team && !p.eliminated).map((p) => p.id)

/** Table pleine (16, deux bots), trois manches jusqu'à la victoire du village. */
function fullTable(): TvPreviewFixture {
  const { members, players } = table(14, 2, NAMES_16)
  const steps: TvPreviewStep[] = []
  let s = createImposteurState(players, PAIRS, 'apercu-imposteur-16')
  steps.push(step('compte à rebours', s, members))

  s = advance(s)
  steps.push(step('manche 1 : premier indice', s, members))

  const [imp1, imp2] = idsOf(s, 'imposteur')
  const civils = idsOf(s, 'civil')
  s = giveClues(s, 6)
  s = speak(s, [
    ['bot-1', 'suspect', s.clueOrder[2]],
    [s.clueOrder[2], 'defend', 'bot-1'],
    ['u5', 'suspect', s.clueOrder[4]],
    ['bot-2', 'ally', s.clueOrder[0]],
  ])
  steps.push(step('manche 1 : six indices + paroles', s, members))

  s = giveClues(s, s.clueOrder.length - s.clueTurnIdx - 1)
  steps.push(step('manche 1 : dernier joueur au tour', s, members))

  s = giveClues(s)
  s = speak(s, [
    ['bot-1', 'intent', civils[3]],
    ['u9', 'rally', civils[3]],
    [civils[3], 'defend', 'u9'],
  ])
  steps.push(step('vote : personne n’a voté', s, members))
  s = vote(s, civils[3], civils[4], 9)
  steps.push(step('vote : 9 votes sur 16', s, members))
  s = vote(s, civils[3], civils[4])
  steps.push(step('révélation : un civil sort', s, members))

  s = advance(s)
  s = giveClues(s, 4, 3)
  s = speak(s, [
    ['bot-1', 'wrong', civils[3]],
    ['u2', 'suspect', imp1],
    [imp1, 'defend', 'u2'],
    ['bot-2', 'doubt', s.clueOrder[1]],
  ])
  steps.push(step('manche 2 : indices (aide-mémoire manche 1)', s, members))
  s = giveClues(s, Number.POSITIVE_INFINITY, 3)
  s = vote(s, imp1, civils[0])
  steps.push(step('révélation : un imposteur sort', s, members))

  s = advance(s)
  s = giveClues(s, Number.POSITIVE_INFINITY, 7)
  s = vote(s, imp2, civils[0])
  steps.push(step('révélation : dernier imposteur', s, members))
  s = advance(s)
  steps.push(step('fin : le village gagne', s, members))

  return { id: 'table-16', label: 'Table pleine (16 joueurs, noms longs)', steps }
}

/** Petite table (3) : égalité puis victoire de l'imposteur. */
function smallTable(): TvPreviewFixture {
  const { members, players } = table(2, 1, PREVIEW_NAMES)
  const steps: TvPreviewStep[] = []
  let s = advance(createImposteurState(players, PAIRS, 'apercu-imposteur-3'))
  s = giveClues(s, 1)
  s = speak(s, [['bot-1', 'suspect', s.clueOrder[0]]])
  steps.push(step('indices', s, members))
  s = giveClues(s)
  steps.push(step('vote', s, members))
  const [a, b, c] = s.players.map((p) => p.id)
  s = reduceImposteur(s, { type: 'VOTE', playerId: a, targetId: b, now: Date.now() })
  s = reduceImposteur(s, { type: 'VOTE', playerId: b, targetId: c, now: Date.now() })
  s = reduceImposteur(s, { type: 'VOTE', playerId: c, targetId: a, now: Date.now() })
  steps.push(step('révélation : égalité', s, members))
  s = advance(s)
  s = giveClues(s, 2, 4)
  s = speak(s, [['bot-1', 'suspect', s.clueOrder[0]]])
  steps.push(step('manche 2 : indices (aide-mémoire manche 1)', s, members))
  s = giveClues(s, Number.POSITIVE_INFINITY, 4)
  s = advance(s)
  steps.push(step('révélation : personne n’a voté', s, members))
  s = advance(s)
  s = giveClues(s)
  s = vote(s, idsOf(s, 'civil')[0], idsOf(s, 'civil')[1])
  steps.push(step('révélation : civil sorti', s, members))
  s = advance(s)
  steps.push(step('fin : l’imposteur gagne', s, members))
  return { id: 'table-3', label: 'Petite table (3 joueurs)', steps }
}

/** Table de 8 : un joueur parti (bandeau de retour) pendant les indices puis le vote. */
function leftPlayer(): TvPreviewFixture {
  const { members, players } = table(8, 0, PREVIEW_NAMES)
  let s = advance(createImposteurState(players, PAIRS, 'apercu-imposteur-8'))
  s = giveClues(s, 3)
  s = reduceImposteur(s, { type: 'LEAVE', playerId: 'u5', at: Date.now() })
  s = speak(s, [
    ['u2', 'suspect', s.clueOrder[1]],
    [s.clueOrder[1], 'defend', 'u2'],
  ])
  const clueStep = step('indices, joueur parti', s, members)
  s = giveClues(s)
  s = vote(s, idsOf(s, 'imposteur')[0], idsOf(s, 'civil')[0], 4)
  return {
    id: 'table-8-depart',
    label: 'Table de 8, un joueur parti',
    steps: [clueStep, step('vote, 4 votes sur 8', s, members)],
  }
}

/** Joue des manches complètes (tous les indices, tout le monde vote un imposteur) jusqu'à la fin. */
function playToEnd(state: ImposteurState, pool: readonly string[]): ImposteurState {
  let s = state
  for (let guard = 0; s.phase !== 'finished' && guard < 40; guard += 1) {
    if (s.phase === 'clue') s = giveClues(s, Number.POSITIVE_INFINITY, 2, pool)
    else if (s.phase === 'vote') s = vote(s, idsOf(s, 'imposteur')[0], idsOf(s, 'civil')[0])
    else s = advance(s)
  }
  return s
}

/**
 * Table de 8 aux noms longs, manche 2 : indices de ~25 caractères avec l'aide-mémoire
 * de la manche 1 (la ligne la plus large sur une colonne), puis un vote avec quatre
 * longues paroles et un joueur parti (la colonne des paroles la plus chargée).
 */
function longRound2(): TvPreviewFixture {
  const { members, players } = table(5, 3, NAMES_8_LONG)
  const steps: TvPreviewStep[] = []
  let s = advance(createImposteurState(players, PAIRS_LONG_FR, 'apercu-imposteur-8-longs'))
  const civils = idsOf(s, 'civil')
  const imp = idsOf(s, 'imposteur')[0]
  s = giveClues(s, Number.POSITIVE_INFINITY, 0, CLUES_LONG_FR)
  s = vote(s, civils[1], civils[2])
  s = advance(s)
  s = giveClues(s, 5, 4, CLUES_LONG_FR)
  steps.push(step('manche 2 : indices longs + aide-mémoire', s, members))
  s = giveClues(s, Number.POSITIVE_INFINITY, 4, CLUES_LONG_FR)
  s = reduceImposteur(s, { type: 'LEAVE', playerId: 'u3', at: Date.now() })
  const target = s.clueOrder.find((id) => id === imp) ?? imp
  s = speak(s, [
    ['bot-1', 'rally', target],
    ['bot-2', 'wrong', civils[1]],
    ['bot-3', 'suspect', target],
    ['u1', 'suspect', target],
  ])
  s = vote(s, target, civils[0], 4)
  steps.push(step('manche 2 : vote 4/8, quatre paroles, joueur parti', s, members))
  s = vote(s, target, civils[0])
  steps.push(step('révélation avec joueur parti', s, members))
  s = playToEnd(s, CLUES_LONG_FR)
  steps.push(step('fin : Harry Potter / Le Seigneur des Anneaux', s, members))
  return { id: 'table-8-longs', label: 'Table de 8, indices et paroles longs, joueur parti', steps }
}

/** Table pleine aux indices longs : vote sur deux colonnes, paroles, départ, puis la paire la plus longue. */
function longFullTable(): TvPreviewFixture {
  const { members, players } = table(13, 3, NAMES_16)
  const steps: TvPreviewStep[] = []
  let s = advance(createImposteurState(players, PAIRS_LONG_IT, 'apercu-imposteur-16-longs'))
  const imp = idsOf(s, 'imposteur')[0]
  const civils = idsOf(s, 'civil')
  s = giveClues(s, 9, 0, CLUES_LONG_IT)
  steps.push(step('indices longs sur deux colonnes', s, members))
  s = giveClues(s, Number.POSITIVE_INFINITY, 0, CLUES_LONG_IT)
  s = reduceImposteur(s, { type: 'LEAVE', playerId: 'u9', at: Date.now() })
  s = speak(s, [
    ['bot-1', 'rally', imp],
    ['bot-2', 'suspect', civils[2]],
    ['bot-3', 'doubt', imp],
    ['u4', 'suspect', imp],
  ])
  s = vote(s, imp, civils[0], 8)
  steps.push(step('vote 8/16, quatre paroles, joueur parti', s, members))
  s = playToEnd(s, CLUES_LONG_IT)
  steps.push(step('fin : contratto a tempo (in)determinato', s, members))
  return { id: 'table-16-longs', label: 'Table pleine, indices longs et paire la plus longue', steps }
}

export function build(): TvPreviewFixture[] {
  return [fullTable(), smallTable(), leftPlayer(), longRound2(), longFullTable()]
}
