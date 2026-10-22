import type { SpeechPlayer } from '@/lib/online/bot-speech'
import { reactionSay, readReactionTable, type ReactionOption } from '@/lib/online/reaction-speech'
import {
  CROBARD_ROUND_SPEECH_MAX,
  CROBARD_SPEECH_CAP,
  type CrobardClientView,
  type CrobardSay,
  type CrobardSpeechKind,
} from './engine'

/**
 * PAROLES DES BOTS DU CROBARD : des réactions de spectateurs au dessin —
 * un encouragement quand la manche s'ouvre, un commentaire en cours de
 * route, un « on efface tout ? », un bravo au devineur, le bilan. Un bot ne
 * dessine ni ne devine : il regarde la toile, comme toute la table.
 *
 * NE LIT QUE LE PUBLIC : la vue spectateur (`CrobardSpeechView`, sans `word`
 * ni `wordChoices`) et le fait que l'adaptateur lui passe. Une réaction ne
 * dépend jamais du mot — le commentaire en cours de dessin tombe à un
 * nombre de traits fixé, son ton suit le caractère du bot (les taquins se
 * disent perdus, les polis admirent) : rien qui oriente les devineurs.
 *
 * Une réaction au plus par fait (reaction-speech.ts), min(2, bavardage)
 * bulles par bot et CROBARD_ROUND_SPEECH_MAX pour la table par manche ; un
 * seul commentaire de dessin et un seul « on efface ? » par manche. Pendant
 * la manche d'un bot dessinateur, il dit seulement qu'il passe.
 *
 * PUR : `rand` injecté.
 */

/** Ce que le planificateur lit : la vue spectateur, mot exclu par construction. */
export type CrobardSpeechView = Pick<
  CrobardClientView,
  'phase' | 'round' | 'players' | 'drawerId' | 'correctGuessers' | 'strokes' | 'speech'
>

/** Le fait auquel la table réagit, tel que l'adaptateur l'a vu passer. */
export type CrobardSpeechEvent =
  | { type: 'roundStart' }
  /** Le dessinateur humain vient de poser un trait. */
  | { type: 'stroke' }
  /** Le dessinateur humain a tout effacé ; traits d'avant l'effacement. */
  | { type: 'erase'; strokesBefore: number }
  /** Un devineur humain a trouvé, la manche continue. */
  | { type: 'found'; by: string }
  | { type: 'roundEnd' }

/** Chances de parler d'un bot de bavardage 2 (cf. reactionTalkChance). */
export const CROBARD_TALK = {
  go: 0.5,
  /** Le bot dessinateur dit (presque) toujours qu'il passe : c'est ce qui explique la manche de 5 s. */
  skip: 1,
  comment: 0.6,
  erase: 0.5,
  first: 0.6,
  found: 0.3,
  roundEnd: 0.6,
} as const

/** Le commentaire de dessin tombe au 8e trait, sinon au 20e : jamais selon ce qui est dessiné. */
export const CROBARD_COMMENT_AT_STROKES: readonly number[] = [8, 20]
/** « On efface tout ? » seulement s'il y avait de quoi effacer. */
export const CROBARD_ERASE_MIN_STROKES = 3

const COMMENTS: readonly CrobardSpeechKind[] = ['puzzled', 'admire']

export function crobardBotSay(
  view: CrobardSpeechView,
  event: CrobardSpeechEvent,
  rand: () => number
): CrobardSay | null {
  const seats: SpeechPlayer[] = view.players.map((p) => ({
    id: p.id,
    name: p.name,
    isBot: p.isBot,
    alive: !p.leftAt,
  }))
  const table = readReactionTable<CrobardSpeechKind, SpeechPlayer>(
    seats,
    view.speech ?? [],
    view.round,
    CROBARD_SPEECH_CAP
  )
  const drawer = table.byId.get(view.drawerId)
  if (!drawer?.alive) return null
  const watchers = table.bots.filter((b) => b.id !== drawer.id)
  const said = (kinds: readonly CrobardSpeechKind[]) => table.speech.some((sp) => kinds.includes(sp.kind))
  const say = (options: ReactionOption<CrobardSpeechKind, SpeechPlayer>[]) =>
    reactionSay(table, options, CROBARD_ROUND_SPEECH_MAX, rand)
  const toDrawer = (kind: CrobardSpeechKind | ((b: SpeechPlayer) => CrobardSpeechKind), base: number) =>
    say([{ speakers: watchers, kind, targetId: drawer.id, base }])

  if (drawer.isBot) {
    if (event.type !== 'roundStart' || view.phase !== 'choosing') return null
    const human = table.humans[0]
    return human ? say([{ speakers: [drawer], kind: 'skip', targetId: human.id, base: CROBARD_TALK.skip }]) : null
  }

  switch (event.type) {
    case 'roundStart':
      return view.phase === 'choosing' ? toDrawer('go', CROBARD_TALK.go) : null

    case 'stroke':
      if (view.phase !== 'drawing' || said(COMMENTS)) return null
      if (!CROBARD_COMMENT_AT_STROKES.includes(view.strokes.length)) return null
      return toDrawer((b) => {
        const { trait } = table.traits(b)
        return trait === 'farceur' || trait === 'agressif' ? 'puzzled' : 'admire'
      }, CROBARD_TALK.comment)

    case 'erase':
      if (view.phase !== 'drawing' || said(['erase']) || event.strokesBefore < CROBARD_ERASE_MIN_STROKES) return null
      return toDrawer('erase', CROBARD_TALK.erase)

    case 'found': {
      if (view.phase !== 'drawing') return null
      const first = view.correctGuessers.length === 1 && view.correctGuessers[0] === event.by
      return say([
        {
          speakers: watchers,
          kind: first ? 'first' : 'found',
          targetId: event.by,
          base: first ? CROBARD_TALK.first : CROBARD_TALK.found,
        },
      ])
    }

    case 'roundEnd':
      if (view.phase !== 'roundEnd') return null
      return toDrawer(view.correctGuessers.length > 0 ? 'bravo' : 'stumped', CROBARD_TALK.roundEnd)
  }
}
