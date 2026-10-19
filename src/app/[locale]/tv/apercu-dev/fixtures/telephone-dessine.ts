import type { Stroke } from '@/lib/crobard/engine'
import { phaseKey } from '@/lib/online/phase-clock'
import {
  createTelephoneState,
  currentTelephoneActorId,
  reduceTelephone,
  telephoneActionTypeForRound,
  TELEPHONE_COUNTDOWN_MS,
  type TelephoneState,
} from '@/lib/telephone-dessine/engine'
import {
  onlineRoom,
  previewMembers,
  type PreviewMember,
  type TvPreviewFixture,
  type TvPreviewStep,
} from '../fixture-kit'

/** Noms longs en nombre, pour éprouver les troncatures (8 = plafond du jeu). */
const LONG_NAMES = [
  'Jean-Baptiste',
  'Marie-Charlotte',
  'Maxime-Alexandre',
  'Anne-Sophie',
  'Pierre-Emmanuel',
  'Léa',
  'Marie-Antoinette',
  'Charles-Henri',
] as const

/** Ids réels du catalogue d'icônes (player-icon-defs.ts). */
const ICONS = ['chope', 'vin', 'flute', 'cocktail', 'whisky', 'bouteille', 'trinque', 'shaker']

function members(count: number, names: readonly string[] = LONG_NAMES): PreviewMember[] {
  return previewMembers(count, names).map((m, i) => ({
    ...m,
    preferences: { ...m.preferences, icon: ICONS[i % ICONS.length] },
  }))
}

// ─── Dessins de démonstration (points normalisés [0,1]) ──────────────────────

function circle(cx: number, cy: number, r: number, segments = 24): number[] {
  const pts: number[] = []
  for (let i = 0; i <= segments; i += 1) {
    const a = (i / segments) * Math.PI * 2
    pts.push(cx + Math.cos(a) * r * 0.75, cy + Math.sin(a) * r)
  }
  return pts
}

const stroke = (points: number[], color = '#020617', width = 6): Stroke => ({ points, color, width })

const DRAWINGS: ((shift: number) => Stroke[])[] = [
  // Chat
  (d) => [
    stroke(circle(0.5 + d, 0.55, 0.25)),
    stroke([0.36 + d, 0.38, 0.4 + d, 0.18, 0.47 + d, 0.32]),
    stroke([0.53 + d, 0.32, 0.6 + d, 0.18, 0.64 + d, 0.38]),
    stroke(circle(0.43 + d, 0.5, 0.03, 8), '#22c55e', 6),
    stroke(circle(0.57 + d, 0.5, 0.03, 8), '#22c55e', 6),
    stroke([0.3 + d, 0.62, 0.12 + d, 0.58], '#020617', 3),
    stroke([0.7 + d, 0.62, 0.88 + d, 0.58], '#020617', 3),
  ],
  // Maison au soleil
  (d) => [
    stroke([0.25 + d, 0.85, 0.25 + d, 0.5, 0.65 + d, 0.5, 0.65 + d, 0.85, 0.25 + d, 0.85]),
    stroke([0.2 + d, 0.52, 0.45 + d, 0.25, 0.7 + d, 0.52], '#ef4444', 12),
    stroke(circle(0.85, 0.18, 0.09), '#f59e0b', 6),
    stroke([0.4 + d, 0.85, 0.4 + d, 0.68, 0.5 + d, 0.68, 0.5 + d, 0.85], '#3b82f6', 6),
  ],
  // Bonhomme qui danse
  (d) => [
    stroke(circle(0.5 + d, 0.22, 0.1)),
    stroke([0.5 + d, 0.32, 0.5 + d, 0.62]),
    stroke([0.3 + d, 0.3, 0.5 + d, 0.42, 0.72 + d, 0.28]),
    stroke([0.35 + d, 0.88, 0.5 + d, 0.62, 0.68 + d, 0.86]),
    stroke([0.15, 0.9, 0.85, 0.9], '#a855f7', 12),
  ],
  // Bateau sur les vagues
  (d) => [
    stroke([0.2 + d, 0.6, 0.8 + d, 0.6, 0.68 + d, 0.75, 0.32 + d, 0.75, 0.2 + d, 0.6], '#020617', 6),
    stroke([0.5 + d, 0.6, 0.5 + d, 0.2]),
    stroke([0.5 + d, 0.22, 0.72 + d, 0.5, 0.5 + d, 0.5], '#ef4444', 6),
    stroke([0.05, 0.85, 0.2, 0.8, 0.35, 0.85, 0.5, 0.8, 0.65, 0.85, 0.8, 0.8, 0.95, 0.85], '#3b82f6', 12),
  ],
  // Gâteau d'anniversaire
  (d) => [
    stroke([0.25 + d, 0.85, 0.25 + d, 0.55, 0.75 + d, 0.55, 0.75 + d, 0.85, 0.25 + d, 0.85], '#a855f7', 6),
    stroke([0.25 + d, 0.68, 0.75 + d, 0.68], '#f59e0b', 12),
    stroke([0.4 + d, 0.55, 0.4 + d, 0.38], '#ef4444', 6),
    stroke([0.6 + d, 0.55, 0.6 + d, 0.38], '#ef4444', 6),
    stroke(circle(0.4 + d, 0.32, 0.03, 8), '#f59e0b', 3),
    stroke(circle(0.6 + d, 0.32, 0.03, 8), '#f59e0b', 3),
  ],
  // Fusée
  (d) => [
    stroke([0.5 + d, 0.1, 0.62 + d, 0.35, 0.62 + d, 0.72, 0.38 + d, 0.72, 0.38 + d, 0.35, 0.5 + d, 0.1]),
    stroke(circle(0.5 + d, 0.42, 0.06, 12), '#3b82f6', 6),
    stroke([0.42 + d, 0.74, 0.5 + d, 0.92, 0.58 + d, 0.74], '#f59e0b', 12),
    stroke([0.38 + d, 0.6, 0.28 + d, 0.75, 0.38 + d, 0.72], '#ef4444', 6),
    stroke([0.62 + d, 0.6, 0.72 + d, 0.75, 0.62 + d, 0.72], '#ef4444', 6),
  ],
  // Arbre
  (d) => [
    stroke([0.47 + d, 0.9, 0.47 + d, 0.55, 0.53 + d, 0.55, 0.53 + d, 0.9], '#020617', 6),
    stroke(circle(0.5 + d, 0.38, 0.22), '#22c55e', 12),
    stroke(circle(0.42 + d, 0.35, 0.03, 8), '#ef4444', 6),
    stroke(circle(0.58 + d, 0.42, 0.03, 8), '#ef4444', 6),
  ],
  // Poisson
  (d) => [
    stroke(circle(0.45 + d, 0.5, 0.18), '#f59e0b', 6),
    stroke([0.6 + d, 0.5, 0.82 + d, 0.32, 0.82 + d, 0.68, 0.6 + d, 0.5], '#f59e0b', 6),
    stroke(circle(0.38 + d, 0.45, 0.025, 8), '#020617', 6),
    stroke(circle(0.2, 0.25, 0.03, 8), '#3b82f6', 3),
    stroke(circle(0.25, 0.15, 0.02, 8), '#3b82f6', 3),
  ],
]

/** Phrases par chaîne : départ puis devinettes successives (longueurs variées, dont une de 140 signes). */
const CHAIN_TEXTS: string[][] = [
  ['Un chat qui fait du ski', 'Un hibou fâché', 'Un hibou qui boude parce que personne ne l’a invité à la fête', 'Fête des voisins'],
  [
    'Le voisin du dessus qui passe l’aspirateur à trois heures du matin en chantant du Johnny pendant que son chien aboie sur la lune et les étoiles',
    'Une maison',
    'Maison hantée au soleil',
    'Les vacances à la campagne chez mamie',
  ],
  ['Mon oncle au mariage', 'Un bonhomme qui danse la macarena', 'Gym tonic', 'Un zombie qui fait du yoga sur la plage'],
  ['Pirate en croisière', 'Bateau', 'Le Titanic avant l’iceberg', 'Croisière qui finit mal'],
  ['Joyeux anniversaire Bastien !', 'Un gâteau à deux bougies', 'Gâteau', 'Bébé de deux ans'],
  ['Elon sur Mars', 'Une fusée qui décolle', 'Le feu d’artifice du 14 juillet vu depuis le balcon', 'Fusée'],
  ['La forêt enchantée', 'Un pommier', 'Un arbre de Noël en été', 'Le sapin'],
  ['Némo perdu dans le bocal', 'Poisson rouge', 'Un poisson-chat', 'Le chat qui a mangé le poisson'],
]

/**
 * Partie pilotée par le VRAI moteur. L'horloge virtuelle démarre ~10 min
 * dans le futur : chaque échéance montrée reste à venir pendant la revue.
 */
function newGame(count: number, seed: string, opts: { countdownLive?: boolean } = {}) {
  const list = members(count)
  let clock = opts.countdownLive ? Date.now() : Date.now() + 10 * 60_000 - TELEPHONE_COUNTDOWN_MS
  let state: TelephoneState = createTelephoneState(
    list.map((m) => ({ id: m.userId, name: m.displayName })),
    seed,
    clock
  )

  const snap = (label: string): TvPreviewStep => ({
    label,
    room: onlineRoom('telephone-dessine', state, {
      members: list,
      stateVersion: state.version,
      currentTurnUserId: currentTelephoneActorId(state),
    }),
  })

  /** Maillon que le joueur d'index `idx` produit à la manche courante (cohérent avec la chaîne qu'il tient). */
  const contribute = (idx: number) => {
    const n = state.players.length
    const ownerIdx = (((idx - state.round) % n) + n) % n
    const playerId = state.players[idx].id
    clock += 700
    if (telephoneActionTypeForRound(state.round) === 'write') {
      const texts = CHAIN_TEXTS[ownerIdx % CHAIN_TEXTS.length]
      const text = texts[Math.floor(state.round / 2) % texts.length]
      state = reduceTelephone(state, { type: 'WRITE', playerId, text, now: clock })
    } else {
      const strokes = DRAWINGS[ownerIdx % DRAWINGS.length]((state.round % 3) * 0.04 - 0.04)
      state = reduceTelephone(state, { type: 'SUBMIT', playerId, strokes, now: clock })
    }
  }

  return {
    snap,
    get state() {
      return state
    },
    start() {
      clock = state.phaseEndsAt ?? clock
      state = reduceTelephone(state, { type: 'ADVANCE', claimedKey: phaseKey(state), now: clock })
    },
    /** Les joueurs dont l'index passe `who` rendent leur maillon. */
    submit(who: (idx: number) => boolean = () => true) {
      const round = state.round
      for (let i = 0; i < state.players.length; i += 1) {
        if (state.phase !== 'contributing' || state.round !== round) return
        if (!state.submittedIds.includes(state.players[i].id) && who(i)) contribute(i)
      }
    },
    /** Fin du temps : les maillons manquants partent blancs. */
    timeout() {
      if (state.phase !== 'contributing' || state.phaseEndsAt === null) return
      clock = state.phaseEndsAt
      state = reduceTelephone(state, { type: 'ADVANCE', claimedKey: phaseKey(state), now: clock })
    },
    /** Joue toutes les manches restantes (tout le monde rend, sauf `skip` qui laisse un blanc). */
    playToReveal(skip?: { round: number; idx: number }) {
      for (let guard = 0; guard < 20 && state.phase === 'contributing'; guard += 1) {
        const round = state.round
        this.submit((i) => !(skip && skip.round === round && skip.idx === i))
        if (state.phase === 'contributing' && state.round === round) this.timeout()
      }
    },
    leave(idx: number) {
      state = reduceTelephone(state, { type: 'LEAVE', playerId: state.players[idx].id, at: Date.now() - 20_000 })
    },
    next() {
      clock += 8_000
      state = reduceTelephone(state, { type: 'CONTINUE', playerId: currentTelephoneActorId(state) ?? '', now: clock })
    },
    rematch(ids: string[]) {
      state = { ...state, rematchVotes: ids }
    },
  }
}

function contributingSequence(): TvPreviewFixture {
  const g = newGame(8, 'apercu-tv-td-8')
  const steps: TvPreviewStep[] = []
  g.start()
  steps.push(g.snap('manche 1 (écriture), personne n’a rendu'))
  g.submit((i) => i % 3 === 0)
  steps.push(g.snap('manche 1, 3/8 ont rendu'))
  g.submit((i) => i !== 6)
  steps.push(g.snap('manche 1, 7/8 ont rendu'))
  g.submit()
  steps.push(g.snap('manche 2 (dessin), personne n’a rendu'))
  g.submit((i) => i < 5)
  steps.push(g.snap('manche 2, 5/8 ont rendu'))
  g.submit()
  g.submit((i) => i % 2 === 1)
  steps.push(g.snap('manche 3 (devinette), 4/8 ont rendu'))
  return { id: 'manches-8', label: 'Manches, 8 joueurs aux noms longs (écriture, dessin, devinette)', steps }
}

function leftPlayer(): TvPreviewFixture {
  const g = newGame(8, 'apercu-tv-td-depart')
  g.start()
  g.submit()
  g.submit((i) => i < 3)
  g.leave(4)
  return { id: 'depart-8', label: 'Manche de dessin, un joueur parti (bandeau de retour)', steps: [g.snap('joueur parti')] }
}

function revealSequence(count: number, seed: string): TvPreviewStep[] {
  const g = newGame(count, seed)
  g.start()
  g.playToReveal({ round: Math.min(3, count - 1), idx: 1 })
  const steps: TvPreviewStep[] = [g.snap(`révélation, chaîne 1/${count}`)]
  g.next()
  steps.push(g.snap(`révélation, chaîne 2/${count}`))
  g.next()
  steps.push(g.snap(`révélation, chaîne 3/${count}`))
  return steps
}

function finishedSteps(count: number, seed: string): TvPreviewStep[] {
  const g = newGame(count, seed)
  g.start()
  g.playToReveal()
  for (let guard = 0; guard < 20 && g.state.phase === 'reveal'; guard += 1) g.next()
  const steps: TvPreviewStep[] = [g.snap('fin')]
  g.rematch(g.state.players.slice(0, Math.ceil(count / 2)).map((p) => p.id))
  steps.push(g.snap('fin, votes « Rejouer »'))
  return steps
}

export function build(): TvPreviewFixture[] {
  const live = newGame(8, 'apercu-tv-td-cd-live', { countdownLive: true })
  const small = newGame(3, 'apercu-tv-td-3')
  small.start()
  small.submit()
  small.submit((i) => i === 0)

  return [
    {
      id: 'compte-a-rebours',
      label: 'Compte à rebours de lancement (5 s en direct)',
      steps: [live.snap('8 joueurs, 5 s en direct')],
    },
    contributingSequence(),
    leftPlayer(),
    {
      id: 'manche-3',
      label: 'Manche de dessin, 3 joueurs',
      steps: [small.snap('dessin, 1/3 a rendu')],
    },
    { id: 'revelation-8', label: 'Révélation, 8 joueurs (8 maillons, un blanc)', steps: revealSequence(8, 'apercu-tv-td-rev-8') },
    { id: 'revelation-6', label: 'Révélation, 6 joueurs', steps: revealSequence(6, 'apercu-tv-td-rev-6') },
    { id: 'revelation-4', label: 'Révélation, 4 joueurs', steps: revealSequence(4, 'apercu-tv-td-rev-4') },
    { id: 'revelation-3', label: 'Révélation, 3 joueurs', steps: revealSequence(3, 'apercu-tv-td-rev-3') },
    { id: 'fin-8', label: 'Fin de partie, 8 joueurs', steps: finishedSteps(8, 'apercu-tv-td-fin-8') },
    { id: 'fin-3', label: 'Fin de partie, 3 joueurs', steps: finishedSteps(3, 'apercu-tv-td-fin-3') },
  ]
}
