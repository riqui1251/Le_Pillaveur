import { botTraitsFor, type BotTraits } from '@/lib/online/bot-personas'
import { pick } from '@/lib/online/bot-speech'
import {
  GAME_1220_SPEECH_CAP,
  GAME_1220_SPEECH_WINDOW,
  type Game1220Say,
  type Game1220SpeechKind,
  type toGame1220ClientView,
} from './engine'

/**
 * PAROLES DES BOTS DU 12-20 : les bots ne lancent jamais les dés (prêts
 * d'office, sans tour), ils RÉAGISSENT au lancer d'un humain. Au plus une
 * bulle par lancer, écrite dans la même écriture que lui.
 *
 * ANTI-FUITE : le planificateur ne lit que la vue client (sans la graine des
 * dés) qui sort du lancer et l'auteur du lancer : rien ne lui dit le lancer
 * suivant, et aucune phrase ne le prédit (test sur les 4 langues).
 *
 *   • un humain boit : UN bot, tiré au sort, le chambre (mock) — c'est la
 *     réaction qui passe d'abord ;
 *   • le résultat d'un bot (un bot tiré au sort par kind, les bots de la
 *     table partageant souvent les mêmes paris) : jinx (son chiffre « boire »
 *     est sorti, il s'en prend au lanceur), bullseye (son chiffre « donner »
 *     est sorti), gift (il distribue au moins deux gorgées), almost (un de
 *     ses chiffres sur un seul dé).
 *
 * Sobriété : chance par point de bavardage et bonus de trait, plafond
 * min(2, bavardage) par bot sur GAME_1220_SPEECH_WINDOW lancers. Une table
 * sans humain présent se tait. Les paroles ne pèsent pas sur le jeu.
 *
 * PUR : `rand` injecté.
 */

/** Chance de parler, par point de bavardage, selon le kind. */
export const GAME_1220_TALK_PER_BAVARDAGE: Record<Game1220SpeechKind, number> = {
  mock: 0.18,
  jinx: 0.2,
  bullseye: 0.2,
  gift: 0.15,
  almost: 0.1,
}
/** Jamais systématique : même le plus bavard se tait parfois. */
export const GAME_1220_TALK_MAX = 0.85
/** Gorgées distribuées à partir desquelles un bot s'en vante. */
export const GAME_1220_BIG_GIFT = 2

export type Game1220PublicView = Pick<ReturnType<typeof toGame1220ClientView>, 'players' | 'lastRoll' | 'rolls' | 'speech'>

export function game1220TalkChance(kind: Game1220SpeechKind, traits: BotTraits): number {
  let chance = traits.bavardage * GAME_1220_TALK_PER_BAVARDAGE[kind]
  const { trait } = traits
  if (kind === 'mock' && (trait === 'farceur' || trait === 'agressif')) chance += 0.1
  if (kind === 'jinx') chance += 0.2 * traits.rancune
  if (kind === 'gift' || kind === 'bullseye') chance += 0.1 * traits.audace
  return Math.min(GAME_1220_TALK_MAX, chance)
}

type Candidate = { say: Game1220Say; chance: number }

/** La parole jointe au lancer de `rollerId` qui vient d'avoir lieu (`view.lastRoll`), ou rien. */
export function game1220BotSpeech(view: Game1220PublicView, rollerId: string, rand: () => number): Game1220Say[] {
  const roll = view.lastRoll
  if (!roll) return []
  const present = view.players.filter((p) => !p.leftAt)
  const humans = present.filter((p) => !p.isBot)
  if (humans.length === 0) return []
  const round = view.rolls ?? 0
  const recent = (view.speech ?? []).filter((sp) => sp.round > round - GAME_1220_SPEECH_WINDOW)
  const bots = present.filter((p) => {
    const cap = Math.min(GAME_1220_SPEECH_CAP, botTraitsFor(p.name).bavardage)
    return p.isBot && recent.filter((sp) => sp.playerId === p.id).length < cap
  })
  const byId = new Map(view.players.map((p) => [p.id, p]))
  const resultOf = (id: string) => roll.results.find((r) => r.playerId === id)
  // Le lanceur, un humain ; à défaut, le premier humain présent.
  const blame = (botId: string) => (rollerId !== botId && byId.has(rollerId) ? rollerId : humans[0].id)

  const candidate = (botId: string, kind: Game1220SpeechKind, targetId: string): Candidate => ({
    say: { playerId: botId, kind, targetId },
    chance: game1220TalkChance(kind, botTraitsFor(byId.get(botId)!.name)),
  })
  const oneOf = (list: Candidate[]): Candidate[] => (list.length > 0 ? [pick(list, rand)] : [])

  const drinker = humans.find((h) => (resultOf(h.id)?.drinkSips ?? 0) > 0)
  const out: Candidate[] = [
    ...(drinker ? oneOf(bots.map((b) => candidate(b.id, 'mock', drinker.id))) : []),
    ...oneOf(bots.filter((b) => (resultOf(b.id)?.drinkSips ?? 0) > 0).map((b) => candidate(b.id, 'jinx', blame(b.id)))),
    ...oneOf(
      bots.filter((b) => resultOf(b.id)?.giveReasons.includes('giveNum')).map((b) => candidate(b.id, 'bullseye', blame(b.id)))
    ),
    ...oneOf(
      bots
        .filter((b) => (resultOf(b.id)?.giveEffective ?? 0) >= GAME_1220_BIG_GIFT && !resultOf(b.id)?.giveReasons.includes('giveNum'))
        .map((b) => candidate(b.id, 'gift', blame(b.id)))
    ),
    ...oneOf(bots.filter((b) => resultOf(b.id)?.partialHit).map((b) => candidate(b.id, 'almost', blame(b.id)))),
  ]
  for (const { say, chance } of out) {
    if (rand() < chance) return [say]
  }
  return []
}
