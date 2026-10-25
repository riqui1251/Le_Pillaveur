import {
  createEspionState,
  ESPION_REVEAL_MIN_MS,
  pendingEspionQuestion,
  reduceEspion,
  type EspionAction,
  type EspionSpeechKind,
  type EspionState,
} from '@/lib/espion/engine'
import { ESPION_LOCATION_IDS, espionLocationIdOf, getEspionLocations } from '@/lib/espion/data'
import { phaseKey } from '@/lib/online/phase-clock'
import { BOT_PERSONAS, botDisplayName } from '@/lib/online/bot-personas'
import { onlineRoom, previewMembers, PREVIEW_NAMES, type PreviewMember, type TvPreviewFixture, type TvPreviewStep } from '../fixture-kit'

const GAME = 'espion'
const LOCATIONS = getEspionLocations('fr')

/** 16 noms (le maximum du jeu), dont plusieurs longs. */
const NAMES_16 = [...PREVIEW_NAMES, 'Anne-Sophie', 'Pierre-Alexandre', 'Marie-Antoinette', 'Charles-Henri'] as const

/** Une action sans son horodatage : l'horloge de la partie le pose. */
type Move = EspionAction extends infer A ? (A extends { now: number } ? Omit<A, 'now'> : A) : never

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

/**
 * Partie jouée par le vrai moteur, sur une horloge qui avance d’1 s par
 * coup (du temps de lecture de la révélation avant « Manche suivante »),
 * commencée assez tôt pour que tout soit « dans le passé » au rendu.
 */
class Game {
  now = Date.now() - 30 * 60_000
  constructor(public s: EspionState) {}

  act(action: Move): this {
    this.now += action.type === 'CONTINUE' ? ESPION_REVEAL_MIN_MS : 1_000
    this.s = reduceEspion(this.s, { ...action, now: this.now } as EspionAction)
    return this
  }

  advance(): this {
    this.now = Math.max(this.now, this.s.phaseEndsAt ?? this.now)
    this.s = reduceEspion(this.s, { type: 'ADVANCE', claimedKey: phaseKey(this.s), now: this.now })
    return this
  }

  ask(playerId: string, targetId: string, questionId: string): this {
    return this.act({ type: 'ASK', playerId, targetId, questionId })
  }

  answer(playerId: string, value: string): this {
    return this.act({ type: 'ANSWER', playerId, value })
  }

  speak(playerId: string, kind: EspionSpeechKind, targetId: string): this {
    return this.act({ type: 'SPEAK', playerId, kind, targetId })
  }

  /** Une variante de la partie à cet instant, sans toucher la suite. */
  fork(): Game {
    const copy = new Game(this.s)
    copy.now = this.now
    return copy
  }

  get spyId(): string {
    return this.s.players.find((p) => p.role === 'spy')!.id
  }

  /** Les joueurs actifs hors `exclude`, dans l'ordre de la table. */
  others(...exclude: string[]): string[] {
    return this.s.players.filter((p) => !p.leftAt && !exclude.includes(p.id)).map((p) => p.id)
  }

  guess(right: boolean): this {
    const truth = espionLocationIdOf(this.s.location)
    const locationId = right ? truth! : ESPION_LOCATION_IDS.find((id) => id !== truth)!
    return this.act({ type: 'GUESS_LOCATION', playerId: this.spyId, locationId })
  }
}

/**
 * Échéances recalées sur l'instant du rendu, pour que minuteurs, fenêtre
 * d'accusation, question en attente et bandeau de retour restent à l'écran
 * dans l'aperçu ; le reste de l'état sort tel quel du moteur.
 */
function frozen(game: Game): EspionState {
  const s = game.s
  const later = Date.now() + 10 * 60_000
  const pending = pendingEspionQuestion(s, game.now)
  return {
    ...s,
    phaseEndsAt: s.phaseEndsAt === null ? null : later,
    activeAccusation: s.activeAccusation ? { ...s.activeAccusation, endsAt: later } : null,
    players: s.players.map((p) => (p.leftAt ? { ...p, leftAt: Date.now() } : p)),
    speech: (s.speech ?? []).map((sp) =>
      pending && sp.kind === 'question' && sp.round === s.round && sp.at === pending.askedAt ? { ...sp, at: later - 25_000 } : sp
    ),
  }
}

function step(label: string, game: Game, members: PreviewMember[], extra: Partial<EspionState> = {}): TvPreviewStep {
  const shown = { ...frozen(game), ...extra }
  return {
    label,
    room: onlineRoom(GAME, shown, {
      members,
      status: shown.phase === 'finished' ? 'finished' : 'playing',
      stateVersion: shown.version,
    }),
  }
}

/** Table pleine : 12 humains aux noms longs + 4 bots, deux manches gagnées par l'équipe. */
function fullTable(): TvPreviewFixture {
  const { members, players } = table(12, 4, PREVIEW_NAMES)
  const steps: TvPreviewStep[] = []
  const g = new Game(createEspionState(players, LOCATIONS, 'apercu-espion-16', Date.now() - 30 * 60_000, undefined, 2))
  steps.push(step('compte à rebours', g, members))

  g.advance()
  steps.push(step('manche 1 : début de la discussion', g, members))

  g.ask('bot-1', 'u5', 'when')
  steps.push(step('question en attente (bot → Jean-Baptiste)', g, members))

  g.answer('u5', 'night')
    .ask('u5', 'bot-2', 'where')
    .answer('bot-2', 'inside')
    .ask('bot-2', 'u9', 'company')
    .answer('u9', 'friends')
    .ask('u9', 'bot-3', 'when')
    .answer('bot-3', 'day')
    .speak('bot-3', 'suspect', 'u9')
    .speak('u9', 'defend', 'bot-3')
    .ask('bot-4', 'u2', 'price')
    .answer('u2', 'cheap')
    .ask('u2', 'u7', 'noise')
    .answer('u7', 'any')
  steps.push(step('carnet plein + fil', g, members))

  // Pire cas de la carte d'accusation à deux colonnes : deux noms longs, bandeau de retour, bandeau des joueurs sur deux rangées.
  const long = g.fork()
  long.act({ type: 'ACCUSE', playerId: 'u9', targetId: 'u5' })
  for (const id of long.others('u9', 'u5').slice(0, 4)) long.act({ type: 'SUPPORT', playerId: id })
  for (const id of long.others('u9', 'u5').slice(4, 7)) long.act({ type: 'DECLINE', playerId: id })
  long.act({ type: 'LEAVE', playerId: 'u12', at: long.now })
  steps.push(step('accusation : Marie-Charlotte accuse Jean-Baptiste + joueur parti', long, members))

  const spy = g.spyId
  const accuser = g.others(spy).find((id) => id.startsWith('bot-'))!
  g.act({ type: 'ACCUSE', playerId: accuser, targetId: spy })
  const voters = g.others(spy, accuser)
  for (const id of voters.slice(0, 3)) g.act({ type: 'SUPPORT', playerId: id })
  for (const id of voters.slice(3, 5)) g.act({ type: 'DECLINE', playerId: id })
  steps.push(step('accusation : 4 soutiens, 2 refus', g, members))

  const leaver = voters.find((id) => id.startsWith('u') && id !== 'u1' && voters.indexOf(id) > 5)!
  g.act({ type: 'LEAVE', playerId: leaver, at: g.now })
  steps.push(step('accusation + joueur parti (hauteur maximale)', g, members))

  for (const id of g.others(spy, accuser, ...voters.slice(0, 5))) {
    if (g.s.phase !== 'discussion') break
    g.act({ type: 'SUPPORT', playerId: id })
  }
  // Espion humain démasqué : il garde une dernière chance de nommer le lieu.
  if (g.s.phase === 'lastChance') {
    steps.push(step('dernière chance : l’espion démasqué cherche le lieu', g, members))
    g.advance()
  }
  steps.push(step('révélation : espion démasqué', g, members))

  g.act({ type: 'REJOIN', playerId: leaver })
  g.act({ type: 'CONTINUE', playerId: 'u1' })
  const spy2 = g.spyId
  const [a, b] = g.others(spy2, spy).filter((id) => id.startsWith('bot-'))
  g.speak(a, 'toldYou', spy)
  g.ask(b, 'u9', 'outfit')
  steps.push(step('manche 2 : remarque + question en attente', g, members))

  g.answer('u9', 'swim')
  g.guess(false)
  steps.push(step('révélation : l’espion se trompe de lieu', g, members))

  g.act({ type: 'CONTINUE', playerId: 'u1' })
  steps.push(step('fin : l’équipe gagne', g, members))
  steps.push(step('fin : 5 votes de revanche', g, members, { rematchVotes: ['u1', 'u3', 'u5', 'u9', 'u11'] }))

  return { id: 'table-16', label: 'Table pleine (12 humains + 4 bots, noms longs)', steps }
}

/** 16 humains, sans bot : pas de fil, grand minuteur au centre. */
function humans16(): TvPreviewFixture {
  const { members, players } = table(16, 0, NAMES_16)
  const steps: TvPreviewStep[] = []
  const g = new Game(createEspionState(players, LOCATIONS, 'apercu-espion-h16', Date.now() - 30 * 60_000, undefined, 1))
  steps.push(step('compte à rebours', g, members))
  g.advance()
  steps.push(step('discussion : grand minuteur', g, members))

  const spy = g.spyId
  const [accuser, target, ...rest] = g.others(spy)
  g.act({ type: 'ACCUSE', playerId: accuser, targetId: target })
  for (const id of rest.slice(0, 5)) g.act({ type: 'SUPPORT', playerId: id })
  steps.push(step('accusation : 6 soutiens sur 9', g, members))

  for (const id of rest.slice(5)) {
    if (g.s.phase !== 'discussion') break
    g.act({ type: 'SUPPORT', playerId: id })
  }
  steps.push(step('révélation : mauvaise cible', g, members))
  g.act({ type: 'CONTINUE', playerId: 'u1' })
  steps.push(step('fin : l’espion gagne', g, members))
  return { id: 'humains-16', label: '16 humains sans bot', steps }
}

/** Petite table : un humain et deux bots, l'espion gagne en deux manches. */
function smallTable(): TvPreviewFixture {
  const { members, players } = table(1, 2, ['Marie-Charlotte'])
  const steps: TvPreviewStep[] = []
  const g = new Game(createEspionState(players, LOCATIONS, 'apercu-espion-3', Date.now() - 30 * 60_000, undefined, 2))
  steps.push(step('compte à rebours', g, members))
  g.advance()
  steps.push(step('discussion : carnet vide', g, members))
  g.ask('bot-1', 'u1', 'where')
  steps.push(step('question en attente', g, members))
  g.answer('u1', 'outside').ask('u1', 'bot-2', 'food').answer('bot-2', 'snack')
  steps.push(step('carnet + fil', g, members))

  const spy = g.spyId
  const [accuser] = g.others(spy)
  g.act({ type: 'ACCUSE', playerId: accuser, targetId: spy })
  steps.push(step('accusation : 1 soutien sur 2', g, members))
  g.advance()
  g.guess(true)
  steps.push(step('révélation : l’espion devine le lieu', g, members))

  g.act({ type: 'CONTINUE', playerId: 'u1' })
  g.advance()
  steps.push(step('révélation : temps écoulé', g, members))
  g.act({ type: 'CONTINUE', playerId: 'u1' })
  steps.push(step('fin : l’espion gagne', g, members))
  return { id: 'table-3', label: 'Petite table (1 humain + 2 bots)', steps }
}

/** Quatre humains : bandeau des joueurs sur une rangée, sans fil. */
function humans4(): TvPreviewFixture {
  const { members, players } = table(4, 0, PREVIEW_NAMES)
  const g = new Game(createEspionState(players, LOCATIONS, 'apercu-espion-h4', Date.now() - 30 * 60_000))
  g.advance()
  return { id: 'humains-4', label: '4 humains sans bot', steps: [step('discussion', g, members)] }
}

export function build(): TvPreviewFixture[] {
  return [fullTable(), humans16(), smallTable(), humans4()]
}
