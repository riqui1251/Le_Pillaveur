import type { BotTraits } from '@/lib/online/bot-personas'
import { readSpeechTable, type SpeechMove, type SpeechPlayer } from '@/lib/online/bot-speech'
import type { MenteurBotAction, MenteurBotWhy } from './bot-brain'
import {
  isMenteurAsk,
  isMenteurRemark,
  MENTEUR_SPEECH_CAP,
  type MenteurClientView,
  type MenteurDuel,
  type MenteurSpeechKind,
} from './engine'

/**
 * PAROLES DES BOTS DU MENTEUR : une bulle au plus, portée par le coup du bot
 * et écrite dans la même réduction — aucun tick de plus, rien à rattraper.
 *
 * LE TON DIT QUELQUE CHOSE, et c'est voulu : le kind (sure, unsure…) est le
 * seul message, calculé sur la probabilité que SON enchère tienne vue de sa
 * place (`why.pOwn`, ses dés et l'échelle publique), jamais sur les dés des
 * autres. Chaque trait parle à sa façon :
 *   • la prudente n'est sûre que si c'est vrai (pOwn ≥ 0,8), avoue son
 *     doute sous 0,45 et se tait entre les deux : sa parole vaut de l'or ;
 *   • le farceur annonce toujours quelque chose, et ment au gré de son
 *     audace : Gépéto (0,8) dit vrai une fois sur cinq ;
 *   • l'agressif crâne toujours (sure), bluff ou pas : sa parole ne vaut rien ;
 *   • le suiveur dit « je te suis » quand il monte sur la face de
 *     l'enchérisseur précédent, et n'est sûr qu'avec la table derrière lui.
 * Au défi : again contre un bluffeur déjà démasqué (la marque « sans un
 * seul » de l'écran), sinon suspect, jamais systématiquement. À l'ouverture,
 * le rancunier (≥ 0,5) qui vient de perdre un dé pique celui qui le lui a
 * pris, avec une probabilité égale à sa rancune : Germaine à chaque fois.
 *
 * Sobriété : au plus min(2, bavardage) bulles par bot et par manche, et les
 * bavards seuls parlent souvent — les phrases ne pèsent pas sur le jeu, les
 * bots ne lisent jamais le fil.
 *
 * PUR : `rand` injecté ; le planificateur ne lit que la vue CLIENT du bot.
 */

/** La prudente se dit sûre à partir de cette probabilité (et le suiveur, quand il ne suit pas). */
export const MENTEUR_SURE_AT = 0.8
/** La prudente avoue son doute sous cette probabilité. */
export const MENTEUR_UNSURE_AT = 0.45
/** Ce que « dire vrai » veut dire pour le farceur : sûr au-dessus, pas sûr en dessous. */
export const MENTEUR_TELL_SPLIT = 0.5
/**
 * Franchise des tells : null, chaque trait parle à sa façon (ci-dessus) ;
 * un nombre h, tout tell sure/unsure dit vrai avec la probabilité h, quel que
 * soit le trait — 0,5 est le bruit pur, le repli si des tells lisibles
 * déséquilibraient la table (décision 2 du propriétaire, 14/10/2026).
 */
export const MENTEUR_TELL_HONESTY: number | null = null
/** Sous cette rancune, un bot ne pique personne à l'ouverture (Lucien, Suzette…). */
export const MENTEUR_GRUDGE_MIN_RANCUNE = 0.5
/** Chance de parler au « Menteur ! » par point de bavardage. */
export const MENTEUR_TALK_PER_BAVARDAGE = 0.25
/**
 * Chance de parler avec une enchère par point de bavardage (hors prudente,
 * que ses seuils font déjà taire) : un sixième, car on enchérit bien plus
 * souvent qu'on ne défie. À un quart, une table d'essai (1 + 3) montait à
 * 2 bulles par manche avant même les réactions de la révélation.
 */
export const MENTEUR_BID_TALK_PER_BAVARDAGE = 1 / 6
/** L'agressif a la gâchette facile : bonus de parole au « Menteur ! ». */
export const MENTEUR_AGGRESSIVE_CALL_TALK = 0.25
/** Jamais systématique : même le plus bavard des agressifs se tait parfois au défi. */
export const MENTEUR_CALL_TALK_MAX = 0.9

export type MenteurSayMove = SpeechMove<MenteurSpeechKind>

/** Le joueur a déjà été pris avec une enchère « sans un seul » dé de la face, toute la partie. */
export function menteurBluffedBefore(duels: readonly MenteurDuel[], playerId: string): boolean {
  return duels.some((duel) => duel.bids.some((b) => b.by === playerId && b.bluff))
}

/**
 * Qui le bot pique à l'ouverture : celui qui lui a fait perdre un dé au défi
 * de la manche qui vient de finir (le perdant rouvre la manche suivante),
 * encore en lice. Un Calza raté ne compte pas : personne d'autre que lui ne
 * l'a fait perdre.
 */
export function menteurGrudgeTarget(view: MenteurClientView, botId: string, rancune: number): string | null {
  if (rancune < MENTEUR_GRUDGE_MIN_RANCUNE) return null
  const duels = view.duels ?? []
  const last = duels[duels.length - 1]
  if (!last || last.mode !== 'dudo' || last.loserId !== botId || last.round !== view.round - 1) return null
  const foeId = last.challengerId === botId ? last.bidderId : last.challengerId
  const foe = view.players.find((p) => p.id === foeId)
  return foe && foe.id !== botId && foe.diceCount > 0 ? foe.id : null
}

/** Le joueur en lice qui répondra à une enchère du bot : le suivant à table. */
function answererOf(view: MenteurClientView, botId: string): string | null {
  const n = view.players.length
  const at = view.players.findIndex((p) => p.id === botId)
  if (at < 0) return null
  for (let step = 1; step < n; step += 1) {
    const p = view.players[(at + step) % n]
    if (p.diceCount > 0) return p.id
  }
  return null
}

const talks = (chance: number, rand: () => number) => chance > 0 && rand() < chance

/**
 * Le tell d'une enchère : sure, unsure, ou rien. La vérité d'un tell se lit
 * sur pOwn : sûr à partir de MENTEUR_TELL_SPLIT. Avec une franchise fixée
 * (MENTEUR_TELL_HONESTY), qui parle dit vrai avec cette probabilité.
 */
function tellOf(
  traits: BotTraits,
  pOwn: number,
  facing: boolean,
  rand: () => number,
  honesty: number | null
): 'sure' | 'unsure' | null {
  const truth = pOwn >= MENTEUR_TELL_SPLIT ? 'sure' : 'unsure'
  const lie = truth === 'sure' ? 'unsure' : 'sure'
  const talk = traits.bavardage * MENTEUR_BID_TALK_PER_BAVARDAGE
  let kind: 'sure' | 'unsure' | null
  switch (traits.trait) {
    case 'prudent':
      // Sans dé de parole : les seuils la font déjà taire au milieu.
      kind = pOwn >= MENTEUR_SURE_AT ? 'sure' : pOwn <= MENTEUR_UNSURE_AT ? 'unsure' : null
      break
    case 'agressif':
      kind = talks(talk, rand) ? 'sure' : null
      break
    case 'farceur':
      kind = talks(talk, rand) ? (rand() < 1 - traits.audace ? truth : lie) : null
      break
    case 'suiveur':
    default:
      // « Si la table y croit, j'y crois » : à l'ouverture, aucune table derrière lui.
      kind = facing && pOwn >= MENTEUR_SURE_AT && talks(talk, rand) ? 'sure' : null
  }
  if (kind === null || honesty === null) return kind
  return rand() < honesty ? truth : lie
}

/**
 * La parole jointe au coup `action` du bot `botId`, ou null. `why` est le
 * pourquoi du cerveau (bot-brain.ts) : il reste dans le processus serveur,
 * seul le kind en sort. Au plus min(MENTEUR_SPEECH_CAP, bavardage) paroles
 * par manche ; toute parole a une cible, celle qu'exige le moteur.
 */
export function menteurBotSay(
  view: MenteurClientView,
  botId: string,
  action: MenteurBotAction,
  why: MenteurBotWhy,
  traits: BotTraits,
  rand: () => number,
  honesty: number | null = MENTEUR_TELL_HONESTY
): MenteurSayMove | null {
  if (view.phase !== 'bidding') return null
  const seats: SpeechPlayer[] = view.players.map((p) => ({
    id: p.id,
    name: p.name,
    isBot: p.isBot,
    alive: p.diceCount > 0,
  }))
  const table = readSpeechTable({
    players: seats,
    speech: view.speech ?? [],
    round: view.round,
    engineCap: MENTEUR_SPEECH_CAP,
    isRemark: isMenteurRemark,
    isAsk: isMenteurAsk,
  })
  const me = table.byId.get(botId)
  if (!me?.isBot || !me.alive) return null
  // Le plafond du persona tel que l'adaptateur le lui passe (un converti : celui par défaut).
  if (table.count(botId) >= Math.min(MENTEUR_SPEECH_CAP, traits.bavardage)) return null

  // Un répondant parti rend la main au suivant : un bot peut se retrouver face
  // à sa propre enchère, et le moteur refuserait tout le coup d'une parole à soi.
  const say = (kind: MenteurSpeechKind, targetId: string | null): MenteurSayMove | null =>
    targetId && targetId !== botId ? { playerId: botId, kind, targetId } : null
  const current = view.currentBid

  if (action.type === 'DUDO') {
    if (!current) return null
    const bonus = traits.trait === 'agressif' ? MENTEUR_AGGRESSIVE_CALL_TALK : 0
    const talk = traits.bavardage * MENTEUR_TALK_PER_BAVARDAGE + bonus
    if (!talks(Math.min(MENTEUR_CALL_TALK_MAX, talk), rand)) return null
    return say(menteurBluffedBefore(view.duels ?? [], current.by) ? 'again' : 'suspect', current.by)
  }

  if (action.type === 'CALZA') {
    if (!current) return null
    return talks(traits.bavardage / 3, rand) ? say('exact', current.by) : null
  }

  if (!current) {
    // La pique revient à chaque dé perdu : sa rancune dit s'il la lance.
    const foe = menteurGrudgeTarget(view, botId, traits.rancune)
    if (foe && talks(traits.rancune, rand)) return say('grudge', foe)
  }
  if (current && traits.trait === 'suiveur' && action.face === current.face) {
    return talks(traits.bavardage * MENTEUR_BID_TALK_PER_BAVARDAGE, rand) ? say('ally', current.by) : null
  }
  const kind = tellOf(traits, why.pOwn ?? 0, current !== null, rand, honesty)
  return kind ? say(kind, answererOf(view, botId)) : null
}
