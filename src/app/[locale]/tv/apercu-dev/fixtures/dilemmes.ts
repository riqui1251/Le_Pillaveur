import { BOT_PERSONAS, botDisplayName } from '@/lib/online/bot-personas'
import { phaseKey } from '@/lib/online/phase-clock'
import { dilContentFor } from '@/lib/dilemmes/data'
import { dilBotChoice } from '@/lib/dilemmes/server-adapter'
import {
  createDilState,
  currentDilActorId,
  dilActive,
  dilCurrentCard,
  reduceDil,
  DIL_COUNTDOWN_MS,
  type DilCard,
  type DilState,
} from '@/lib/dilemmes/engine'
import { onlineRoom, previewMembers, type PreviewMember, type TvPreviewFixture, type TvPreviewStep } from '../fixture-kit'

/** 16 joueurs (le maximum), beaucoup de noms longs pour éprouver les troncatures. */
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

function members(count: number): PreviewMember[] {
  return previewMembers(count, LONG_NAMES).map((m, i) => ({
    ...m,
    preferences: { ...m.preferences, icon: ICONS[i % ICONS.length] },
  }))
}

/** Les cartes les plus longues d'un type : le pire cas d'affichage. */
function longestCards(kind: DilCard['kind'], count: number): DilCard[] {
  const len = (c: DilCard) => (c.kind === 'prefer' ? Math.max(c.a.length, c.b.length) : c.text.length)
  return dilContentFor('alcool')
    .filter((c) => c.kind === kind)
    .sort((a, b) => len(b) - len(a))
    .slice(0, count)
}

/** Aléa déterministe pour les choix des bots (reproductible d'un rechargement à l'autre). */
function seededRand(seed: number): () => number {
  let x = seed
  return () => {
    x = (x * 1103515245 + 12345) % 2147483648
    return x / 2147483648
  }
}

/**
 * Partie pilotée par le VRAI moteur. L'horloge virtuelle démarre ~10 min dans
 * le futur : le chrono de vote montré reste à venir pendant la revue.
 */
class Game {
  state: DilState
  clock = Date.now() + 10 * 60_000
  readonly list: PreviewMember[]
  private readonly rand: () => number

  constructor(kind: DilCard['kind'], humans: number, bots: number, seed: string) {
    this.list = members(humans)
    const players = [
      ...this.list.map((m) => ({ id: m.userId, name: m.displayName })),
      ...BOT_PERSONAS.slice(0, bots).map((p, i) => ({ id: `bot-${i + 1}`, name: botDisplayName(p), isBot: true })),
    ]
    this.rand = seededRand(seed.length * 7919)
    this.state = createDilState(players, longestCards(kind, 10), seed, this.clock - DIL_COUNTDOWN_MS, 10)
  }

  advance(): this {
    this.clock = Math.max(this.clock, this.state.phaseEndsAt ?? this.clock)
    this.state = reduceDil(this.state, { type: 'ADVANCE', claimedKey: phaseKey(this.state), now: this.clock })
    return this
  }

  /** `choice` : 'A' | 'B' | id visé ; un bot sans choix imposé vote comme le serveur (dilBotChoice). */
  vote(playerId: string, choice?: string): this {
    this.clock += 900
    const player = this.state.players.find((p) => p.id === playerId)
    const card = dilCurrentCard(this.state)
    const resolved =
      choice ?? (player && card ? dilBotChoice(this.state, player, card, this.rand) : null) ?? 'A'
    this.state = reduceDil(this.state, { type: 'VOTE', playerId, choice: resolved, now: this.clock })
    return this
  }

  /** Fait voter les joueurs actifs encore muets ; `pick(index, id)` donne le choix, `undefined` = ne vote pas encore. */
  voteAll(pick: (index: number, id: string) => string | undefined): this {
    dilActive(this.state).forEach((p, i) => {
      const choice = pick(i, p.id)
      if (choice !== undefined && this.state.phase === 'vote' && !this.state.votes[p.id]) this.vote(p.id, choice)
    })
    return this
  }

  continue(): this {
    this.clock += 4_000
    const actor = currentDilActorId(this.state) ?? this.state.players[0].id
    this.state = reduceDil(this.state, { type: 'CONTINUE', playerId: actor, now: this.clock })
    return this
  }

  /** Joue des manches complètes (tout le monde vote A / le premier autre joueur) pour arriver plus loin dans la partie. */
  skipRounds(count: number): this {
    for (let i = 0; i < count; i += 1) {
      const ids = dilActive(this.state).map((p) => p.id)
      this.voteAll((idx, id) =>
        dilCurrentCard(this.state)?.kind === 'who' ? ids.find((other) => other !== id) : idx % 3 === 0 ? 'B' : 'A'
      )
      this.continue()
    }
    return this
  }

  step(label: string): TvPreviewStep {
    return {
      label,
      room: onlineRoom('dilemmes', this.state, {
        members: this.list,
        currentTurnUserId: currentDilActorId(this.state),
        stateVersion: this.state.version,
      }),
    }
  }
}

export function build(): TvPreviewFixture[] {
  const countdown = new Game('prefer', 16, 0, 'tv-dil-countdown')
  // Le compte à rebours réel (5 s) : il s'arrête ensuite sur « 1 », comme la TV.
  countdown.state = { ...countdown.state, phaseEndsAt: Date.now() + DIL_COUNTDOWN_MS }

  const prefer = new Game('prefer', 16, 0, 'tv-dil-prefer').advance().skipRounds(3)
  const preferSteps = [prefer.step('vote, personne n’a voté')]
  prefer.voteAll((i) => (i < 9 ? (i % 3 === 0 ? 'B' : 'A') : undefined))
  preferSteps.push(prefer.step('vote, 9/16 ont voté'))
  prefer.voteAll((i) => (i % 3 === 0 ? 'B' : 'A'))
  preferSteps.push(prefer.step('révélation, camps partagés'))

  const unanimous = new Game('prefer', 16, 0, 'tv-dil-unanime').advance().skipRounds(6)
  unanimous.voteAll(() => 'B')

  const never = new Game('never', 16, 0, 'tv-dil-never').advance().skipRounds(1)
  const neverSteps = [never.step('vote, 0/16')]
  never.voteAll((i) => (i < 5 ? 'A' : undefined))
  neverSteps.push(never.step('vote, 5/16'))
  // Deux abstentions : la révélation tombe à l'échéance (ADVANCE), comme sur le serveur.
  dilActive(never.state)
    .slice(0, 14)
    .forEach((p, i) => {
      if (!never.state.votes[p.id]) never.vote(p.id, i % 2 === 0 ? 'A' : 'B')
    })
  neverSteps.push(never.advance().step('révélation, 2 abstentions'))

  const who = new Game('who', 16, 0, 'tv-dil-who').advance().skipRounds(2)
  const ids = dilActive(who.state).map((p) => p.id)
  const whoSteps = [who.step('vote, 0/16')]
  const target = (i: number, id: string) => {
    const wanted = i % 4 === 0 ? ids[1] : i % 4 === 1 ? ids[4] : i % 4 === 2 ? ids[1] : ids[10]
    return wanted === id ? ids[4] : wanted
  }
  who.voteAll((i, id) => (i < 11 ? target(i, id) : undefined))
  whoSteps.push(who.step('vote, 11/16'))
  who.voteAll(target)
  whoSteps.push(who.step('révélation'))

  const few = new Game('prefer', 2, 1, 'tv-dil-few').advance()
  const fewSteps = [few.vote('u2', 'A').step('vote, 1/3 (avec un bot)')]
  few.vote('bot-1').vote('u1', 'B')
  fewSteps.push(few.step('révélation'))

  const fewWho = new Game('who', 2, 1, 'tv-dil-few-who').advance()
  const fewWhoSteps = [fewWho.step('vote, 0/3')]
  fewWho.vote('u1', 'u2').vote('bot-1', 'u2').vote('u2', 'u1')
  fewWhoSteps.push(fewWho.step('révélation'))

  const left = new Game('prefer', 8, 0, 'tv-dil-left').advance()
  left.vote('u1', 'A').vote('u2', 'B')
  left.state = reduceDil(left.state, { type: 'LEAVE', playerId: 'u5', at: Date.now() })

  const done = new Game('never', 16, 0, 'tv-dil-fin').advance().skipRounds(10)
  done.state = { ...done.state, rematchVotes: ['u1', 'u3', 'u7'] }

  // Le bot ne compte pas dans le quorum de la revanche : « 1/2 », comme sur les téléphones.
  const doneFew = new Game('prefer', 2, 1, 'tv-dil-fin-few').advance().skipRounds(10)
  doneFew.state = { ...doneFew.state, rematchVotes: ['u1'] }

  return [
    { id: 'compte-a-rebours', label: 'Compte à rebours, 16 joueurs', steps: [countdown.step('compte à rebours')] },
    { id: 'prefere-16', label: 'Tu préfères, 16 joueurs', steps: preferSteps },
    { id: 'prefere-unanime-16', label: 'Tu préfères, 16 votes du même côté', steps: [unanimous.step('révélation unanime')] },
    { id: 'jamais-16', label: 'Je n’ai jamais, 16 joueurs', steps: neverSteps },
    { id: 'qui-16', label: 'Qui de la table, 16 joueurs', steps: whoSteps },
    { id: 'prefere-3', label: 'Tu préfères, 3 joueurs dont un bot', steps: fewSteps },
    { id: 'qui-3', label: 'Qui de la table, 3 joueurs dont un bot', steps: fewWhoSteps },
    { id: 'depart', label: 'Joueur parti pendant le vote, 8 joueurs', steps: [left.step('vote, attente du retour')] },
    {
      id: 'fin',
      label: 'Fin de partie, 16 joueurs',
      steps: [
        done.step('fin, revanche 3/16'),
        { label: 'fin, sans revanche', room: onlineRoom('dilemmes', { ...done.state, rematchVotes: [] }, { members: done.list }) },
      ],
    },
    { id: 'fin-3', label: 'Fin de partie, 2 joueurs et un bot', steps: [doneFew.step('fin, revanche 1/2 (bot hors quorum)')] },
  ]
}
