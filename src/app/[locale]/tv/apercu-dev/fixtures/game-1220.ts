import { createGame1220State, reduceGame1220, type Game1220State } from '@/lib/1220/engine'
import type { Band1220, Choices1220, Parity1220 } from '@/lib/game-1220'
import { BOT_PERSONAS, botDisplayName } from '@/lib/online/bot-personas'
import { PREVIEW_NAMES, onlineRoom, previewMembers, type PreviewMember, type TvPreviewFixture } from '../fixture-kit'

const GAME = '1220'
/** 16 = maximum du moteur ; les noms d'aperçu n'en ont que 12, d'autres longs complètent. */
const NAMES_16 = [...PREVIEW_NAMES, 'Anne-Sophie', 'Pierre-Alexandre', 'Gwendoline', 'Maximilien']
const BANDS: Band1220[] = ['2-10', '11-20', '21-30']

function choicesFor(i: number): Choices1220 {
  const parity: Parity1220 = i % 2 === 0 ? 'pair' : 'impair'
  const drinkNumber = 5 + ((i * 7) % 20)
  let giveNumber = 6 + ((i * 11 + 3) % 22)
  if (giveNumber === drinkNumber) giveNumber += 1
  return { parity, band: BANDS[i % 3], drinkNumber, giveNumber }
}

type Table = { members: PreviewMember[]; players: { id: string; name: string; isBot?: boolean }[] }

function table(humans: number, bots = 0, names: readonly string[] = NAMES_16): Table {
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

/** Mise en place, échéance à 10 min ; `ready` premiers humains déjà prêts (les bots le sont d'office). */
function setupState(tb: Table, ready: number): Game1220State {
  // Le moteur pose l'échéance à now + 3 min : décalé pour garder ~10 min à l'écran.
  let s = createGame1220State(tb.players, 'apercu-1220', Date.now() + 7 * 60_000)
  tb.players.forEach((p, i) => {
    if (p.isBot) return
    s = reduceGame1220(s, { type: 'SET_DRAFT', playerId: p.id, choices: choicesFor(i) })
  })
  for (const p of tb.players.filter((x) => !x.isBot).slice(0, ready)) {
    s = reduceGame1220(s, { type: 'READY', playerId: p.id })
  }
  return s
}

function playState(tb: Table): Game1220State {
  return setupState(tb, tb.players.length)
}

function roll(s: Game1220State, times = 1): Game1220State {
  let next = s
  for (let i = 0; i < times; i += 1) next = reduceGame1220(next, { type: 'ROLL', playerId: 'u1' })
  return next
}

function room(tb: Table, s: Game1220State) {
  return onlineRoom(GAME, s, { members: tb.members, stateVersion: s.version })
}

/** Séquence de jeu : avant le 1er lancer, puis lancers successifs (le 1220 n'a ni dé animé ni suspense). */
function playSteps(tb: Table, rolls: number) {
  const steps = []
  let s = playState(tb)
  steps.push({ label: 'avant le 1er lancer', room: room(tb, s) })
  for (let i = 1; i <= rolls; i += 1) {
    s = roll(s)
    steps.push({ label: `lancer ${i}`, room: room(tb, s) })
  }
  return { steps, last: s }
}

export function build(): TvPreviewFixture[] {
  const t16 = table(14, 2)
  const t12 = table(12)
  const t9 = table(9)
  const t6 = table(5, 1)
  const t3 = table(3)
  const t2 = table(1, 1)

  const play16 = playSteps(t16, 3)
  const left16 = reduceGame1220(roll(play16.last, 4), { type: 'LEAVE', playerId: 'u5', at: Date.now() })

  const play3 = playSteps(t3, 3)
  // Au-delà de 15 lancers l'historique du moteur ne grandit plus : le fondu doit quand même rejouer.
  const capped15 = roll(play3.last, 12)
  const capped16 = roll(capped15)
  const capped17 = roll(capped16)
  const play9 = playSteps(t9, 2)
  const left9 = reduceGame1220(roll(play9.last), { type: 'LEAVE', playerId: 'u9', at: Date.now() })
  const finished16 = reduceGame1220(roll(playState(t16), 9), { type: 'END', playerId: 'u1' })
  const finished16Votes = { ...finished16, rematchVotes: ['u1', 'u2', 'u3', 'u7'] }
  const finished2 = reduceGame1220(roll(playState(t2), 2), { type: 'END', playerId: 'u1' })

  return [
    {
      id: 'setup-16',
      label: 'Mise en place, 16 joueurs (dont 2 bots), noms longs',
      steps: [
        { label: 'personne de prêt', room: room(t16, setupState(t16, 0)) },
        { label: 'moitié prête', room: room(t16, setupState(t16, 7)) },
        { label: 'presque tous', room: room(t16, setupState(t16, 13)) },
      ],
    },
    {
      id: 'setup-3',
      label: 'Mise en place, 3 joueurs',
      steps: [{ label: '1 prêt sur 3', room: room(t3, setupState(t3, 1)) }],
    },
    {
      id: 'play-16',
      label: 'Lancers, 16 joueurs (dont 2 bots), noms longs',
      steps: [
        ...play16.steps,
        { label: '7 lancers + Jean-Baptiste parti', room: room(t16, left16) },
      ],
    },
    { id: 'play-12', label: 'Lancers, 12 joueurs', steps: playSteps(t12, 2).steps },
    {
      id: 'play-9',
      label: 'Lancers, 9 joueurs, puis joueur parti',
      steps: [...play9.steps, { label: '3 lancers + Marie-Charlotte partie', room: room(t9, left9) }],
    },
    { id: 'play-6', label: 'Lancers, 6 joueurs (dont 1 bot)', steps: playSteps(t6, 2).steps },
    {
      id: 'play-3',
      label: 'Lancers, 3 joueurs, jusqu’au-delà des 15 lancers gardés',
      steps: [
        ...play3.steps,
        { label: 'lancer 15', room: room(t3, capped15) },
        { label: 'lancer 16', room: room(t3, capped16) },
        { label: 'lancer 17', room: room(t3, capped17) },
      ],
    },
    { id: 'play-2', label: 'Lancers, 1 joueur + 1 bot', steps: playSteps(t2, 1).steps },
    {
      id: 'fin',
      label: 'Fin de partie',
      steps: [
        { label: '16 joueurs, sans revanche', room: room(t16, finished16) },
        { label: '16 joueurs, 4 votes de revanche', room: room(t16, finished16Votes) },
        { label: '2 joueurs', room: room(t2, finished2) },
      ],
    },
  ]
}
