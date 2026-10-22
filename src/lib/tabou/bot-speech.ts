import type { SpeechPlayer } from '@/lib/online/bot-speech'
import { reactionSay, readReactionTable, type ReactionOption } from '@/lib/online/reaction-speech'
import {
  TABOU_ROUND_SPEECH_MAX,
  TABOU_SPEECH_CAP,
  type TabouClientView,
  type TabouSay,
  type TabouSpeechKind,
  type TabouTeam,
} from './engine'

/**
 * PAROLES DES BOTS DU TABOU : des réactions de coéquipier ou d'adversaire à
 * ce que toute la table voit — la manche qui commence, un mot trouvé, passé
 * ou buzzé, le bilan. Un bot n'entend pas la description (il ne décrit ni ne
 * devine) : il réagit aux boutons, comme un pote qui suit la partie d'un œil.
 *
 * NE LIT QUE LE PUBLIC : la vue spectateur (`TabouSpeechView`, sans
 * `currentWord`), et le fait que l'adaptateur lui passe. Le mot en cours et
 * ses tabous ne peuvent donc ni apparaître ni se deviner dans une bulle : une
 * réaction ne dépend jamais du mot, seulement des clics de la table.
 *
 * Une réaction au plus par fait (reaction-speech.ts), au plus
 * min(2, bavardage) bulles par bot et TABOU_ROUND_SPEECH_MAX pour la table
 * par manche. Pendant la manche d'un bot décrivant (5 s, il ne peut pas
 * décrire), il dit seulement qu'il passe : le reste de la table se tait.
 *
 * PUR : `rand` injecté.
 */

/** Ce que le planificateur lit : la vue spectateur, mot en cours exclu par construction. */
export type TabouSpeechView = Pick<
  TabouClientView,
  'phase' | 'round' | 'players' | 'describerId' | 'scores' | 'roundStats' | 'speech'
>

/** Le fait auquel la table réagit, tel que l'adaptateur l'a vu passer. */
export type TabouSpeechEvent =
  | { type: 'roundStart' }
  /** Un coéquipier humain du décrivant a trouvé ; scores d'avant le point. */
  | { type: 'found'; by: string; scoresBefore: { A: number; B: number } }
  | { type: 'pass' }
  /** Un adversaire humain a buzzé un tabou. */
  | { type: 'taboo'; by: string }
  | { type: 'roundEnd' }

/** Chances de parler d'un bot de bavardage 2 (cf. reactionTalkChance). */
export const TABOU_TALK = {
  roundStart: 0.5,
  /** Le bot décrivant dit (presque) toujours qu'il passe : c'est ce qui explique la manche de 5 s. */
  skip: 1,
  lead: 0.9,
  found: 0.3,
  taboo: 0.5,
  tease: 0.3,
  roundEnd: 0.6,
} as const

/** Bilan : « belle manche » à partir de ce nombre de mots trouvés. */
export const TABOU_PROUD_AT = 5
/** Bilan : « on se rattrape » jusqu'à ce nombre de mots trouvés. */
export const TABOU_CONSOLE_AT = 1

type Seat = SpeechPlayer & { team: TabouTeam }

const ahead = (scores: { A: number; B: number }, team: TabouTeam) =>
  scores[team] > scores[team === 'A' ? 'B' : 'A']

export function tabouBotSay(view: TabouSpeechView, event: TabouSpeechEvent, rand: () => number): TabouSay | null {
  const seats: Seat[] = view.players.map((p) => ({
    id: p.id,
    name: p.name,
    isBot: p.isBot,
    alive: !p.leftAt,
    team: p.team,
  }))
  const table = readReactionTable<TabouSpeechKind, Seat>(seats, view.speech ?? [], view.round, TABOU_SPEECH_CAP)
  const describer = table.byId.get(view.describerId)
  if (!describer?.alive) return null
  const mates = table.bots.filter((b) => b.team === describer.team && b.id !== describer.id)
  const rivals = table.bots.filter((b) => b.team !== describer.team)
  const isMate = (b: Seat) => b.team === describer.team
  const say = (options: ReactionOption<TabouSpeechKind, Seat>[]) =>
    reactionSay(table, options, TABOU_ROUND_SPEECH_MAX, rand)

  if (describer.isBot) {
    if (event.type !== 'roundStart' || view.phase !== 'describing') return null
    // À qui il s'excuse : un humain de son équipe, celle qui ne marquera pas.
    const human = table.humans.find((h) => h.team === describer.team) ?? table.humans[0]
    if (!human) return null
    return say([{ speakers: [describer], kind: 'skip', targetId: human.id, base: TABOU_TALK.skip }])
  }

  switch (event.type) {
    case 'roundStart':
      if (view.phase !== 'describing') return null
      return say([
        {
          speakers: [...mates, ...rivals],
          kind: (b) => (isMate(b) ? 'go' : 'jinx'),
          targetId: describer.id,
          base: TABOU_TALK.roundStart,
        },
      ])

    case 'found': {
      if (view.phase !== 'describing') return null
      const options: ReactionOption<TabouSpeechKind, Seat>[] = []
      if (!ahead(event.scoresBefore, describer.team) && ahead(view.scores, describer.team)) {
        options.push({ speakers: mates, kind: 'lead', targetId: event.by, base: TABOU_TALK.lead })
      }
      options.push({
        speakers: [...mates, ...rivals],
        kind: (b) => (isMate(b) ? 'found' : 'grumble'),
        targetId: (b) => (isMate(b) ? event.by : describer.id),
        base: TABOU_TALK.found,
      })
      return say(options)
    }

    case 'pass':
      if (view.phase !== 'describing') return null
      return say([{ speakers: rivals, kind: 'tease', targetId: describer.id, base: TABOU_TALK.tease }])

    case 'taboo':
      if (view.phase !== 'describing') return null
      return say([
        {
          speakers: [...rivals, ...mates],
          kind: (b) => (isMate(b) ? 'protest' : 'buzz'),
          targetId: (b) => (isMate(b) ? event.by : describer.id),
          base: TABOU_TALK.taboo,
        },
      ])

    case 'roundEnd': {
      if (view.phase !== 'roundEnd') return null
      const found = view.roundStats.found
      const kind: TabouSpeechKind | null =
        found >= TABOU_PROUD_AT ? 'proud' : found <= TABOU_CONSOLE_AT ? 'console' : null
      return kind ? say([{ speakers: mates, kind, targetId: describer.id, base: TABOU_TALK.roundEnd }]) : null
    }
  }
}
