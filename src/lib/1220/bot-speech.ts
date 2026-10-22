import type { SpeechPlayer } from '@/lib/online/bot-speech'
import { reactionSay, readReactionTable, type ReactionOption } from '@/lib/online/reaction-speech'
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
 * bulle par lancer, écrite dans la même écriture que lui. Le dé et le
 * plafond sont ceux des jeux à réactions (reaction-speech.ts : reactionSay).
 *
 * ANTI-FUITE : le planificateur ne lit que la vue client (sans la graine des
 * dés) qui sort du lancer et l'auteur du lancer : rien ne lui dit le lancer
 * suivant, et aucune phrase ne le prédit (test sur les 4 langues).
 *
 *   • un humain boit : UN bot, tiré au sort, le chambre (mock) — c'est la
 *     réaction qui passe d'abord ;
 *   • le résultat d'un bot (un orateur tiré au sort par kind, les bots de la
 *     table partageant souvent les mêmes paris) : jinx (son chiffre « boire »
 *     est sorti, il s'en prend au lanceur), bullseye (son chiffre « donner »
 *     est sorti), gift (il distribue au moins deux gorgées), almost (un de
 *     ses chiffres sur un seul dé).
 *
 * Sobriété : un dé de parole par option (GAME_1220_TALK à bavardage 2),
 * plafond min(2, bavardage) par bot sur GAME_1220_SPEECH_WINDOW lancers. Une
 * table sans humain présent se tait. Les paroles ne pèsent pas sur le jeu.
 *
 * PUR : `rand` injecté.
 */

/** Chances de parler d'un bot de bavardage 2 (cf. reactionTalkChance). */
export const GAME_1220_TALK: Record<Game1220SpeechKind, number> = {
  mock: 0.45,
  jinx: 0.45,
  bullseye: 0.4,
  gift: 0.3,
  almost: 0.2,
}
/** Gorgées distribuées à partir desquelles un bot s'en vante. */
export const GAME_1220_BIG_GIFT = 2

export type Game1220PublicView = Pick<ReturnType<typeof toGame1220ClientView>, 'players' | 'lastRoll' | 'rollCount' | 'speech'>

type Option = ReactionOption<Game1220SpeechKind, SpeechPlayer>

/** La parole jointe au lancer de `rollerId` qui vient d'avoir lieu (`view.lastRoll`), ou rien. */
export function game1220BotSpeech(view: Game1220PublicView, rollerId: string, rand: () => number): Game1220Say[] {
  const roll = view.lastRoll
  if (!roll) return []
  const round = view.rollCount
  const seats: SpeechPlayer[] = view.players.map((p) => ({ id: p.id, name: p.name, isBot: p.isBot, alive: !p.leftAt }))
  // Le plafond se compte sur la fenêtre de lancers : ses paroles comptent comme celles du lancer courant.
  const recent = (view.speech ?? [])
    .filter((sp) => sp.round > round - GAME_1220_SPEECH_WINDOW)
    .map((sp) => ({ ...sp, round }))
  const table = readReactionTable<Game1220SpeechKind, SpeechPlayer>(seats, recent, round, GAME_1220_SPEECH_CAP)
  const firstHuman = table.humans[0]
  if (!firstHuman) return []
  const resultOf = (id: string) => roll.results.find((r) => r.playerId === id)
  // Le lanceur, un humain ; à défaut, le premier humain présent.
  const blame = table.byId.get(rollerId)?.alive ? rollerId : firstHuman.id
  const botsWhere = (test: (r: NonNullable<ReturnType<typeof resultOf>>) => boolean) =>
    table.bots.filter((b) => {
      const r = resultOf(b.id)
      return Boolean(r && test(r))
    })

  const drinker = table.humans.find((h) => (resultOf(h.id)?.drinkSips ?? 0) > 0)
  const options: Option[] = [
    ...(drinker ? [{ speakers: table.bots, kind: 'mock' as const, targetId: drinker.id, base: GAME_1220_TALK.mock }] : []),
    { speakers: botsWhere((r) => r.drinkSips > 0), kind: 'jinx', targetId: blame, base: GAME_1220_TALK.jinx },
    { speakers: botsWhere((r) => r.giveReasons.includes('giveNum')), kind: 'bullseye', targetId: blame, base: GAME_1220_TALK.bullseye },
    {
      speakers: botsWhere((r) => r.giveEffective >= GAME_1220_BIG_GIFT && !r.giveReasons.includes('giveNum')),
      kind: 'gift',
      targetId: blame,
      base: GAME_1220_TALK.gift,
    },
    { speakers: botsWhere((r) => r.partialHit), kind: 'almost', targetId: blame, base: GAME_1220_TALK.almost },
  ]
  const say = reactionSay(table, options, Infinity, rand)
  return say?.targetId ? [{ playerId: say.playerId, kind: say.kind, targetId: say.targetId }] : []
}
