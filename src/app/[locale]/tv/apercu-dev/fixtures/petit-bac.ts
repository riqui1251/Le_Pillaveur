import { phaseKey } from '@/lib/online/phase-clock'
import {
  createPbcState,
  pbcContestThreshold,
  reducePbc,
  PBC_REVEAL_MIN_MS,
  PBC_STOP_MIN_MS,
  type PbcState,
} from '@/lib/petit-bac/engine'
import { onlineRoom, previewMembers, type PreviewMember, type TvPreviewFixture, type TvPreviewStep } from '../fixture-kit'

/** 16 = plafond du Petit Bac, avec beaucoup de noms longs pour éprouver les troncatures. */
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
const ICONS = [
  'chope', 'vin', 'flute', 'cocktail', 'whisky', 'bouteille', 'trinque', 'shaker',
  'citron', 'olive', 'tonneau', 'glacon', 'content', 'mdr', 'clin', 'choque',
]

function members(count: number, names: readonly string[] = LONG_NAMES): PreviewMember[] {
  return previewMembers(count, names).map((m, i) => ({
    ...m,
    preferences: { ...m.preferences, icon: ICONS[i % ICONS.length] },
  }))
}

/**
 * Lettres et catégories imposées (le tirage du moteur est aléatoire) pour que
 * les réponses de démonstration commencent par la bonne lettre.
 */
const ROUNDS: { letter: string; categories: string[] }[] = [
  { letter: 'B', categories: ['prenom', 'animal', 'ville', 'metier', 'personnage-fiction'] },
  { letter: 'M', categories: ['pays', 'fruit-legume', 'marque', 'film-serie', 'monument-lieu'] },
  { letter: 'P', categories: ['sport', 'plat', 'boisson', 'vetement', 'instrument'] },
]

/** Peu de mots par case : les doublons (1 pt) tombent naturellement sur une grande table. */
const BANK: Record<string, string[]> = {
  prenom: ['Bastien', 'Bérénice', 'Benoît', 'Baptiste', 'Blandine', 'Bruno', 'Bérangère-Ophélie'],
  animal: ['Baleine', 'Blaireau', 'Bison', 'Buffle', 'Bouquetin', 'Baleine', 'Bélier'],
  ville: ['Bordeaux', 'Brest', 'Besançon', 'Biarritz', 'Bruxelles', 'Bordeaux', 'Barcelone'],
  metier: ['Boulanger', 'Banquier', 'Bûcheron', 'Bijoutier', 'Brancardier-ambulancier de nuit', 'Boulanger'],
  'personnage-fiction': ['Batman', 'Bilbo Sacquet', 'Blanche-Neige', "Bob l'éponge", "Buzz l'Éclair", 'Batman'],
  pays: ['Maroc', 'Mexique', 'Mali', 'Malte', 'Monaco', 'Mongolie', 'Madagascar'],
  'fruit-legume': ['Mangue', 'Melon', 'Mandarine', 'Myrtille', 'Mirabelle', 'Melon'],
  marque: ['Michelin', 'Mercedes', 'Mattel', 'Monoprix', 'Milka', 'Moulinex'],
  'film-serie': ['Matrix', 'Mad Max', 'Mulan', 'Malcolm', 'Memento', 'Matrix'],
  'monument-lieu': ['Mont-Saint-Michel', 'Machu Picchu', 'Mont Blanc', 'Montmartre', 'Musée du Louvre'],
  sport: ['Pétanque', 'Ping-pong', 'Plongée', 'Polo', 'Patinage artistique', 'Pétanque'],
  plat: ['Paella', 'Pizza', 'Pot-au-feu', 'Purée', 'Pâtes carbonara', 'Pizza'],
  boisson: ['Pastis', 'Panaché', 'Porto', 'Punch', 'Piña colada', 'Pastis'],
  vetement: ['Pull', 'Pantalon', 'Pyjama', 'Parka', 'Poncho', 'Pull'],
  instrument: ['Piano', 'Percussions', 'Pipeau', 'Piccolo', 'Piano'],
}

/** Copie du joueur `i` à la manche `round` : quelques cases vides et une hors-sujet (« Lion »). */
function copyOf(i: number, round: number): string[] {
  return ROUNDS[round].categories.map((cat, c) => {
    if ((i * 3 + c + round) % 11 === 5) return ''
    if (i === 4 && c === 1 && round === 0) return 'Lion'
    const bank = BANK[cat]
    return bank[(i * 2 + c * 3 + round) % bank.length]
  })
}

/**
 * Partie pilotée par le VRAI moteur, horloge virtuelle partant de `start` :
 * dans le futur, chaque échéance montrée reste à venir pendant la revue.
 */
function newGame(list: PreviewMember[], roundsCount: number, start: number) {
  let clock = start
  const base = createPbcState(
    list.map((m) => ({ id: m.userId, name: m.displayName })),
    'apercu-tv-petit-bac',
    clock,
    roundsCount
  )
  const rounds = ROUNDS.slice(0, roundsCount)
  let state: PbcState = {
    ...base,
    letters: rounds.map((r) => r.letter),
    categoryRounds: rounds.map((r) => r.categories),
    categories: rounds[0].categories,
  }
  const ids = list.map((m) => m.userId)

  return {
    ids,
    get state() {
      return state
    },
    snap(label: string): TvPreviewStep {
      return { label, room: onlineRoom('petit-bac', state, { members: list, stateVersion: state.version }) }
    },
    /** Échéance de la phase en cours (compte à rebours, écriture, ramassage). */
    expire() {
      clock = state.phaseEndsAt ?? clock
      state = reducePbc(state, { type: 'ADVANCE', claimedKey: phaseKey(state), now: clock })
    },
    stop(index: number) {
      clock += PBC_STOP_MIN_MS + 4_000
      const answers = ROUNDS[state.round].categories.map((cat) => BANK[cat][index % BANK[cat].length])
      state = reducePbc(state, { type: 'STOP', playerId: ids[index], answers, now: clock })
    },
    submit(indexes: number[]) {
      for (const i of indexes) {
        if (state.phase !== 'flush' || state.answers[ids[i]]) continue
        clock += 300
        state = reducePbc(state, { type: 'SUBMIT', playerId: ids[i], answers: copyOf(i, state.round), now: clock })
      }
    },
    /** `votes` joueurs contestent la case (cible, catégorie). */
    contest(target: number, category: number, votes: number) {
      const voters = ids.filter((_, i) => i !== target).slice(0, votes)
      for (const v of voters) {
        clock += 200
        state = reducePbc(state, { type: 'CONTEST', playerId: v, targetId: ids[target], category, now: clock })
      }
    },
    /** Une case contestée jusqu'au seuil : rayée, 0 pt. */
    reject(target: number, category: number) {
      const threshold = pbcContestThreshold(state, ids[target])
      if (threshold !== null) this.contest(target, category, threshold)
    },
    leave(index: number, at: number) {
      state = reducePbc(state, { type: 'LEAVE', playerId: ids[index], at })
    },
    /** Votes de revanche (écran de fin) : posés hors moteur, comme le fait la route commune. */
    rematch(indexes: number[]) {
      state = { ...state, rematchVotes: indexes.map((i) => ids[i]) }
    },
    next() {
      clock += PBC_REVEAL_MIN_MS
      state = reducePbc(state, { type: 'CONTINUE', playerId: ids[0], now: clock })
    },
  }
}

const range = (from: number, to: number) => Array.from({ length: to - from }, (_, i) => from + i)

function fullTable(): TvPreviewFixture {
  const now = Date.now()
  const list = members(16)
  const g = newGame(list, 3, now + 10 * 60_000 - 5 * 60_000)
  const steps: TvPreviewStep[] = [g.snap('compte à rebours')]
  g.expire()
  steps.push(g.snap('manche 1, écriture (STOP verrouillé)'))
  g.stop(0)
  g.submit(range(1, 10))
  steps.push(g.snap('ramassage : STOP de Jean-Baptiste, 10 copies sur 16'))
  g.submit(range(10, 16))
  g.contest(2, 0, 3)
  g.reject(4, 2)
  steps.push(g.snap('révélation 1 : doublons, vides, « Lion », une contestation 3/8, une case rayée'))
  g.next()
  g.leave(15, now)
  steps.push(g.snap('manche 2, écriture : Bastien a quitté la table'))
  g.expire()
  steps.push(g.snap('ramassage sans STOP (temps écoulé)'))
  g.submit(range(0, 15))
  g.contest(0, 3, 5)
  steps.push(g.snap('révélation 2 : 15 joueurs actifs, cumul des points'))
  g.next()
  g.stop(6)
  g.submit(range(0, 15))
  steps.push(g.snap('révélation 3 (dernière manche)'))
  g.next()
  steps.push(g.snap('fin de partie : classement des 16'))
  g.rematch([0, 3, 7, 12])
  steps.push(g.snap('fin : 4 votes de revanche'))
  return { id: 'partie-16', label: '16 joueurs (max), noms longs : de bout en bout (dont un départ et des votes de revanche)', steps }
}

/** Écriture avec le STOP déjà recevable : la partie démarre 30 s avant l'ouverture de l'aperçu. */
function stopOpen(): TvPreviewFixture {
  const list = members(16)
  const g = newGame(list, 3, Date.now() - 35_000)
  g.expire()
  return {
    id: 'stop-ouvert',
    label: '16 joueurs, écriture avec STOP recevable (minuteur ~90 s)',
    steps: [g.snap('écriture, STOP ouvert')],
  }
}

function midTable(): TvPreviewFixture {
  const list = members(8, ['Léa', 'Maxime', 'Sofiane', 'Camille', 'Jean-Baptiste', 'Inès', 'Marie-Charlotte', 'Hugo'])
  const g = newGame(list, 2, Date.now() + 5 * 60_000)
  g.expire()
  g.stop(1)
  g.submit(range(0, 8))
  g.contest(3, 1, 2)
  g.reject(6, 3)
  const steps: TvPreviewStep[] = [g.snap('révélation 1 : 8 joueurs, contestation 2/4, case rayée')]
  g.next()
  g.expire()
  g.submit(range(0, 8))
  steps.push(g.snap('révélation 2 (dernière)'))
  g.next()
  steps.push(g.snap('fin de partie, 8 joueurs'))
  g.rematch([1, 4])
  steps.push(g.snap('fin : 2 votes de revanche'))
  return { id: 'partie-8', label: '8 joueurs : révélations et fin', steps }
}

function smallTable(): TvPreviewFixture {
  const list = members(2, ['Léa', 'Marie-Charlotte'])
  const g = newGame(list, 1, Date.now() + 5 * 60_000)
  const steps: TvPreviewStep[] = [g.snap('compte à rebours')]
  g.expire()
  steps.push(g.snap('écriture'))
  g.expire()
  g.submit([0])
  steps.push(g.snap('ramassage (temps écoulé), 1 copie sur 2'))
  g.submit([1])
  steps.push(g.snap('révélation : table trop petite pour contester'))
  g.next()
  steps.push(g.snap('fin de partie, 2 joueurs'))
  return { id: 'partie-2', label: '2 joueurs (minimum), une manche', steps }
}

export function build(): TvPreviewFixture[] {
  return [fullTable(), stopOpen(), midTable(), smallTable()]
}
