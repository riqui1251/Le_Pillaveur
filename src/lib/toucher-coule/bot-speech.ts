import type { BotTraits } from '@/lib/online/bot-personas'
import type { SpeechPlayer } from '@/lib/online/bot-speech'
import { reactionSay, readReactionTable, type ReactionOption } from '@/lib/online/reaction-speech'
import {
  otherTeam,
  tcSpeechRound,
  TC_SPEECH_CAP,
  type TCClientView,
  type TCSay,
  type TCSpeechKind,
} from './engine'

/**
 * PAROLES DES BOTS DU TOUCHÉ-COULÉ : au plus une bulle par tir, écrite dans
 * la même écriture que le tir — celui d'un bot comme celui d'un humain.
 * Aucun tick de plus. Le dé et le plafond sont ceux des jeux à réactions
 * (reaction-speech.ts : reactionSay).
 *
 * ANTI-FUITE : le planificateur ne lit que la vue SPECTATEUR qui sort du tir
 * (navires intacts réduits à leurs cases touchées, des DEUX équipes) : il ne
 * sait pas plus où sont les navires qu'un écran TV. Le bot qui parle se
 * choisit sur le résultat public du tir (lastShot) et l'ordre de table,
 * jamais sur une position, et aucune phrase ne parle d'une case, d'une ligne
 * ou d'un voisinage (test sur les 4 langues).
 *
 *   • le tireur : sunk (il coule), bomb (sa Bombe ne coule rien), hit
 *     (touché), miss (à l'eau, adressé au tireur suivant) ;
 *   • la cible : lost (son navire coulé), ouch (touché), ou, sur un tir dans
 *     l'eau, taunt par UN bot de l'équipe visée, tiré au sort.
 * La réaction qui vise un humain passe devant ; à égalité, le tireur.
 *
 * Sobriété : un dé de parole par option (TC_TALK à bavardage 2, bonus de
 * trait et de rancune pour l'orateur désigné), plafond min(2, bavardage) par
 * bot et par fenêtre de tours (tcSpeechRound). Une table sans humain présent
 * se tait. Les bots ne lisent jamais le fil : le jeu et ses tirages sont
 * inchangés.
 *
 * PUR : `rand` injecté.
 */

/** Chances de parler d'un bot de bavardage 2 (cf. reactionTalkChance). */
export const TC_TALK: Record<TCSpeechKind, number> = {
  sunk: 0.5,
  bomb: 0.4,
  hit: 0.12,
  miss: 0.12,
  lost: 0.3,
  ouch: 0.12,
  taunt: 0.15,
}

/** Ce que le planificateur lit : la vue spectateur qui sort du tir. */
export type TCPublicView = Pick<
  TCClientView,
  'phase' | 'players' | 'turnOrder' | 'currentTurnIndex' | 'turnCount' | 'lastShot' | 'speech'
>

type Seat = SpeechPlayer & { team: 'A' | 'B' }
type Option = ReactionOption<TCSpeechKind, Seat>

/** La chance de base d'un orateur DÉSIGNÉ (tireur, armateur) : l'agressif crie, le rancunier pleure. */
export function tcTalkBase(kind: TCSpeechKind, traits: BotTraits): number {
  let base = TC_TALK[kind]
  if (kind === 'sunk' && traits.trait === 'agressif') base += 0.3
  if (kind === 'bomb' && traits.trait === 'farceur') base += 0.2
  if (kind === 'lost') base += 0.8 * traits.rancune
  if (kind === 'ouch') base += 0.4 * traits.rancune
  return base
}

/** La parole jointe au tir qui vient d'avoir lieu (`view.lastShot`), ou rien. */
export function tcBotSpeech(view: TCPublicView, rand: () => number): TCSay[] {
  const shot = view.lastShot
  if (!shot) return []
  const seats: Seat[] = view.players.map((p) => ({
    id: p.id,
    name: p.name,
    isBot: p.isBot,
    alive: !p.leftAt,
    team: p.team,
  }))
  const table = readReactionTable<TCSpeechKind, Seat>(seats, view.speech ?? [], tcSpeechRound(view), TC_SPEECH_CAP)
  const shooter = table.byId.get(shot.shooterId)
  if (!shooter) return []
  const own = (playerId: string | null, kind: TCSpeechKind, targetId: string | null): Option | null => {
    const speaker = playerId ? table.byId.get(playerId) : undefined
    if (!speaker || !targetId) return null
    return { speakers: [speaker], kind, targetId, base: tcTalkBase(kind, table.traits(speaker)) }
  }

  const ownerId = shot.shipOwnerId
  const nextShooter = view.phase === 'battle' ? (view.turnOrder[view.currentTurnIndex] ?? null) : null
  const firstEnemy = view.players.find((p) => p.team === shot.targetTeam && !p.leftAt)?.id ?? null
  const options: (Option | null)[] =
    shot.result === 'sunk'
      ? [own(shooter.id, 'sunk', ownerId), own(ownerId, 'lost', shooter.id)]
      : shot.bombResults
        ? [own(shooter.id, 'bomb', ownerId ?? nextShooter ?? firstEnemy), shot.result === 'hit' ? own(ownerId, 'ouch', shooter.id) : null]
        : shot.result === 'hit'
          ? [own(shooter.id, 'hit', ownerId), own(ownerId, 'ouch', shooter.id)]
          : [
              own(shooter.id, 'miss', nextShooter),
              // Un seul moqueur, tiré au sort dans l'équipe visée : jamais choisi
              // sur ses navires, et une grande équipe ne chambre pas plus qu'une petite.
              {
                speakers: table.bots.filter((b) => b.team === otherTeam(shooter.team)),
                kind: 'taunt',
                targetId: shooter.id,
                base: TC_TALK.taunt,
              },
            ]

  const aimsHuman = (o: Option) =>
    typeof o.targetId === 'string' && table.byId.get(o.targetId)?.isBot === false ? 1 : 0
  const ordered = options.filter((o): o is Option => o !== null).sort((a, b) => aimsHuman(b) - aimsHuman(a))
  const say = reactionSay(table, ordered, Infinity, rand)
  return say?.targetId ? [{ playerId: say.playerId, kind: say.kind, targetId: say.targetId }] : []
}
