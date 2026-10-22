import type { SpeechPlayer } from '@/lib/online/bot-speech'
import { reactionSay, readReactionTable, type ReactionOption } from '@/lib/online/reaction-speech'
import {
  MC_SPEECH_CAP,
  MC_TURN_SPEECH_MAX,
  type MCClientView,
  type MCSay,
  type MCSpeechKind,
  type MCTeam,
} from './engine'

/**
 * PAROLES DES BOTS DES MOTS CODÉS : des réactions de coéquipier ou
 * d'adversaire à une tuile qui se retourne sous les yeux de toute la table
 * — bien vu, raté, cadeau à l'équipe d'en face, l'assassin, la victoire — et
 * à une équipe qui passe la main. Un bot n'y donne jamais d'indice et ne
 * touche aucune tuile (il saboterait sa table) : il commente.
 *
 * NE LIT QUE LE PUBLIC : la vue spectateur (`MCSpeechView`), où une tuile
 * n'a de couleur qu'une fois révélée, et les mots restants que les deux
 * équipes voient. La grille de clés (qui est espion de quelle couleur,
 * l'assassin) ne peut donc rien colorer d'une bulle ; et un bot maître-mot,
 * qui la tient, ne parle pas du tout — sa bulle, même innocente, aurait
 * l'air informée.
 *
 * Une réaction au plus par coup (reaction-speech.ts), min(2, bavardage)
 * bulles par bot et MC_TURN_SPEECH_MAX pour la table par tour d'équipe.
 * Seuls les coups des HUMAINS appellent une réaction : l'équipe de bots qui
 * passe d'office ne se fait pas chambrer à chaque tour.
 *
 * PUR : `rand` injecté.
 */

/** Ce que le planificateur lit : la vue spectateur, grille de clés exclue par construction. */
export type MCSpeechView = Pick<
  MCClientView,
  'phase' | 'turn' | 'players' | 'tiles' | 'remaining' | 'winnerTeam' | 'speech'
>

/** Le coup auquel la table réagit, tel que l'adaptateur l'a vu passer. */
export type MCSpeechEvent =
  /** Un devineur humain a retourné `tile` ; mots restants d'avant le coup. */
  | { type: 'guess'; by: string; tile: number; remainingBefore: { gold: number; red: number } }
  /** Un devineur humain a passé la main. */
  | { type: 'pass'; by: string }

/** Chances de parler d'un bot de bavardage 2 (cf. reactionTalkChance). */
export const MC_TALK = {
  /** L'assassin et la dernière tuile : le moment de la partie, presque toujours commenté. */
  decisive: 0.9,
  lead: 0.8,
  nice: 0.3,
  miss: 0.4,
  gift: 0.5,
  tease: 0.4,
} as const

type Seat = SpeechPlayer & { team: MCTeam; isSpymaster: boolean }

const other = (team: MCTeam): MCTeam => (team === 'gold' ? 'red' : 'gold')

export function mcBotSay(view: MCSpeechView, event: MCSpeechEvent, rand: () => number): MCSay | null {
  const seats: Seat[] = view.players.map((p) => ({
    id: p.id,
    name: p.name,
    isBot: p.isBot,
    alive: !p.leftAt,
    team: p.team,
    isSpymaster: p.isSpymaster,
  }))
  const table = readReactionTable<MCSpeechKind, Seat>(seats, view.speech ?? [], view.turn ?? 0, MC_SPEECH_CAP)
  const actor = table.byId.get(event.by)
  if (!actor || actor.isBot) return null
  const team = actor.team
  const talkers = table.bots.filter((b) => !b.isSpymaster && b.id !== actor.id)
  const mates = talkers.filter((b) => b.team === team)
  const rivals = talkers.filter((b) => b.team !== team)
  const isMate = (b: Seat) => b.team === team
  const say = (options: ReactionOption<MCSpeechKind, Seat>[]) =>
    reactionSay(table, options, MC_TURN_SPEECH_MAX, rand)

  if (event.type === 'pass') {
    return say([{ speakers: rivals, kind: 'tease', targetId: actor.id, base: MC_TALK.tease }])
  }

  const tile = view.tiles[event.tile]
  if (!tile?.revealed || !tile.kind) return null
  if (tile.kind === 'assassin') {
    return say([
      {
        speakers: [...mates, ...rivals],
        kind: (b) => (isMate(b) ? 'assassin' : 'saved'),
        targetId: actor.id,
        base: MC_TALK.decisive,
      },
    ])
  }
  if (view.phase === 'finished') {
    return view.winnerTeam === team
      ? say([{ speakers: mates, kind: 'win', targetId: actor.id, base: MC_TALK.decisive }])
      : say([{ speakers: rivals, kind: 'thanks', targetId: actor.id, base: MC_TALK.decisive }])
  }
  if (tile.kind === 'neutral') {
    return say([{ speakers: mates, kind: 'miss', targetId: actor.id, base: MC_TALK.miss }])
  }
  if (tile.kind !== team) {
    return say([
      {
        speakers: [...mates, ...rivals],
        kind: (b) => (isMate(b) ? 'oops' : 'thanks'),
        targetId: actor.id,
        base: MC_TALK.gift,
      },
    ])
  }
  const before = event.remainingBefore
  const options: ReactionOption<MCSpeechKind, Seat>[] = []
  // Devant = moins de mots à trouver que l'équipe d'en face.
  if (before[team] >= before[other(team)] && view.remaining[team] < view.remaining[other(team)]) {
    options.push({ speakers: mates, kind: 'lead', targetId: actor.id, base: MC_TALK.lead })
  }
  options.push({ speakers: mates, kind: 'nice', targetId: actor.id, base: MC_TALK.nice })
  return say(options)
}
