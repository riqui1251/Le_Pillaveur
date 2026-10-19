import {
  createCrobardState,
  reduceCrobard,
  type CrobardState,
  type Stroke,
} from '@/lib/crobard/engine'
import { getCrobardWords } from '@/lib/crobard/data'
import { phaseKey } from '@/lib/online/phase-clock'
import { BOT_PERSONAS, botDisplayName } from '@/lib/online/bot-personas'
import { onlineRoom, previewMembers, type PreviewMember, type TvPreviewFixture, type TvPreviewStep } from '../fixture-kit'

const GAME = 'crobard'

/** 16 noms (plafond du jeu), beaucoup de longs, pour éprouver les troncatures. */
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

/** Ids réels du catalogue d'icônes (player-icon-defs.ts). */
const ICONS = ['chope', 'vin', 'flute', 'cocktail', 'whisky', 'bouteille', 'trinque', 'shaker', 'citron', 'olive', 'tonneau', 'glacon', 'content', 'mdr', 'clin', 'choque']

/** Longue échéance : le minuteur reste visible pendant l'inspection. */
const LONG = () => Date.now() + 10 * 60_000

function members(count: number, names: readonly string[] = LONG_NAMES): PreviewMember[] {
  return previewMembers(count, names).map((m, i) => ({
    ...m,
    preferences: { ...m.preferences, icon: ICONS[i % ICONS.length] },
  }))
}

function table(humans: number, bots: number, rounds: number, seed: string): { list: PreviewMember[]; state: CrobardState } {
  const list = members(humans)
  const players = [
    ...list.map((m) => ({ id: m.userId, name: m.displayName })),
    ...BOT_PERSONAS.slice(0, bots).map((p, i) => ({ id: `bot-${i + 1}`, name: botDisplayName(p), isBot: true })),
  ]
  return { list, state: createCrobardState(players, getCrobardWords('fr'), seed, Date.now(), rounds) }
}

function advance(state: CrobardState): CrobardState {
  return reduceCrobard(state, { type: 'ADVANCE', claimedKey: phaseKey(state), now: (state.phaseEndsAt ?? Date.now()) + 1 })
}

/** Le dessinateur prend le mot imposé (le moteur n'en propose que 3 au hasard). */
function choose(state: CrobardState, word: string): CrobardState {
  const forced = { ...state, wordChoices: [word, ...(state.wordChoices ?? []).slice(1)] }
  return reduceCrobard(forced, { type: 'CHOOSE_WORD', playerId: state.drawerId, index: 0, now: Date.now() })
}

function circle(cx: number, cy: number, r: number, steps = 20): number[] {
  const pts: number[] = []
  for (let i = 0; i <= steps; i += 1) {
    const a = (i / steps) * Math.PI * 2
    pts.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r * (4 / 3))
  }
  return pts
}

/** Maison, soleil, arbre : un vrai dessin, tracé trait par trait. */
const PICTURE: Stroke[] = [
  { points: [0.12, 0.85, 0.88, 0.85], color: '#22c55e', width: 6 },
  { points: [0.25, 0.85, 0.25, 0.55, 0.55, 0.55, 0.55, 0.85], color: '#020617', width: 6 },
  { points: [0.22, 0.56, 0.4, 0.33, 0.58, 0.56], color: '#ef4444', width: 6 },
  { points: [0.36, 0.85, 0.36, 0.7, 0.44, 0.7, 0.44, 0.85], color: '#f59e0b', width: 6 },
  { points: [0.29, 0.6, 0.34, 0.6, 0.34, 0.66, 0.29, 0.66, 0.29, 0.6], color: '#3b82f6', width: 3 },
  { points: circle(0.82, 0.2, 0.07), color: '#f59e0b', width: 12 },
  { points: [0.72, 0.85, 0.72, 0.6], color: '#a855f7', width: 12 },
  { points: circle(0.72, 0.5, 0.08), color: '#22c55e', width: 12 },
  { points: [0.62, 0.12, 0.66, 0.1, 0.7, 0.12], color: '#020617', width: 3 },
]

function draw(state: CrobardState, count: number): CrobardState {
  let next = state
  for (const stroke of PICTURE.slice(0, count)) {
    next = reduceCrobard(next, { type: 'DRAW_STROKE', playerId: next.drawerId, stroke })
  }
  return next
}

/** Les `count` premiers devineurs (hors dessinateur) trouvent le mot. */
function guess(state: CrobardState, count: number): CrobardState {
  let next = state
  const guessers = next.players.filter((p) => p.id !== next.drawerId && !p.isBot).slice(0, count)
  for (const p of guessers) {
    if (next.phase !== 'drawing') break
    next = reduceCrobard(next, { type: 'GUESS', playerId: p.id, text: next.word ?? '', now: Date.now() })
  }
  return next
}

/** Fin de manche puis manche suivante : un tour complet joué par le moteur. */
function playRound(state: CrobardState, word: string, found: number): CrobardState {
  let s = choose(state, word)
  s = draw(s, PICTURE.length)
  s = guess(s, found)
  if (s.phase === 'drawing') s = advance(s)
  return s
}

function cont(state: CrobardState): CrobardState {
  return reduceCrobard(state, { type: 'CONTINUE', playerId: state.players[0].id, now: Date.now() })
}

function withDeadline(state: CrobardState, endsAt: number | null = LONG()): CrobardState {
  return { ...state, phaseEndsAt: state.phaseEndsAt === null ? null : endsAt }
}

function step(label: string, state: CrobardState, list: PreviewMember[]): TvPreviewStep {
  return { label, room: onlineRoom(GAME, state, { members: list }) }
}

/** Partie complète à 16 : chaque phase dans l'ordre, du lancement au podium. */
function fullGame(): TvPreviewFixture {
  const { list, state: s0 } = table(16, 0, 3, 'apercu-tv-crobard-16')
  const choosing = advance(s0)
  const drawing = choose(choosing, 'Maison')
  const sketch = draw(drawing, 4)
  const full = draw(drawing, PICTURE.length)
  const someFound = guess(full, 5)
  const roundEnd = advance(someFound)
  const r2 = playRound(cont(roundEnd), 'Volcan en éruption', 15)
  const r3 = playRound(cont(r2), 'Parapluie', 9)
  const blankEnd = advance(choose(cont(r2), 'Parapluie'))
  const finished = cont(r3)
  const votes = list.slice(0, 4).map((m) => m.userId)
  return {
    id: 'partie-16',
    label: 'Partie à 16 joueurs (noms longs), toutes les phases',
    steps: [
      step('compte à rebours', withDeadline(s0), list),
      step('choix du mot', withDeadline(choosing), list),
      step('dessin, toile vide', withDeadline(drawing), list),
      step('dessin, 4 traits', withDeadline(sketch), list),
      step('dessin complet, 5 ont trouvé', withDeadline(someFound), list),
      step('dessin, moins de 15 s', withDeadline(someFound, Date.now() + 14_000), list),
      step('bilan, mot révélé', roundEnd, list),
      step('bilan, mot long, tous trouvé', r2, list),
      step('choix du mot, manche 3', withDeadline(cont(r2)), list),
      step('bilan, toile vide, personne n’a trouvé', blankEnd, list),
      step('podium', finished, list),
      step('podium, 4 votes de revanche', { ...finished, rematchVotes: votes }, list),
    ],
  }
}

/** Petite table : 2 humains + 1 bot (minimum du jeu), le bot finit par dessiner. */
function smallGame(): TvPreviewFixture {
  const { list, state: s0 } = table(2, 1, 3, 'apercu-tv-crobard-3')
  let s = advance(s0)
  const choosing = s
  const drawing = guess(draw(choose(s, 'Bougie'), PICTURE.length), 1)
  const steps: TvPreviewStep[] = [
    step('choix du mot', withDeadline(choosing), list),
    step('dessin, 1 sur 2 a trouvé', withDeadline(drawing), list),
  ]
  s = advance(drawing)
  steps.push(step('bilan', s, list))
  let botTurn: CrobardState | null = null
  for (let round = 0; round < 3 && s.phase !== 'finished'; round += 1) {
    if (s.phase === 'roundEnd') s = cont(s)
    if (s.phase === 'finished') break
    const drawer = s.players.find((p) => p.id === s.drawerId)
    if (drawer?.isBot && !botTurn) {
      botTurn = choose(s, 'Horloge')
      steps.push(step('le bot dessine', withDeadline(botTurn), list))
      s = advance(botTurn)
      steps.push(step('bilan, le bot n’a rien dessiné', s, list))
    } else {
      s = playRound(s, 'Clé', 2)
    }
  }
  if (s.phase === 'roundEnd') s = cont(s)
  steps.push(step('podium', s, list))
  steps.push(step('podium, les 2 humains veulent rejouer', { ...s, rematchVotes: list.map((m) => m.userId) }, list))
  return { id: 'petite-table', label: 'Petite table : 2 joueurs + 1 bot', steps }
}

/** Un joueur a quitté la table en plein dessin : bandeau « en attente du retour ». */
function playerLeft(): TvPreviewFixture {
  const { list, state: s0 } = table(12, 0, 8, 'apercu-tv-crobard-left')
  const drawing = guess(draw(choose(advance(s0), 'Téléphérique'), 6), 3)
  const leaver = drawing.players.find((p) => p.id !== drawing.drawerId && !drawing.correctGuessers.includes(p.id))
  const left = leaver ? reduceCrobard(drawing, { type: 'LEAVE', playerId: leaver.id, at: Date.now() }) : drawing
  return {
    id: 'joueur-parti',
    label: '12 joueurs, un joueur parti pendant le dessin',
    steps: [step('dessin, joueur parti', withDeadline(left), list)],
  }
}

/** Table de 8 : la colonne des joueurs passe à une seule colonne plus grande. */
function midTable(): TvPreviewFixture {
  const { list, state: s0 } = table(7, 1, 6, 'apercu-tv-crobard-8')
  const drawing = guess(draw(choose(advance(s0), 'Étoile filante'), PICTURE.length), 2)
  return {
    id: 'table-8',
    label: '8 joueurs (dont 1 bot), dessin en cours',
    steps: [step('dessin, 2 ont trouvé', withDeadline(drawing), list), step('bilan', advance(drawing), list)],
  }
}

export function build(): TvPreviewFixture[] {
  return [fullGame(), smallGame(), playerLeft(), midTable()]
}
