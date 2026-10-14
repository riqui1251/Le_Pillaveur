import type { BotTraits } from '@/lib/online/bot-personas'
import { speechSuspicion } from '@/lib/online/bot-speech'
import {
  IMPOSTEUR_EMPTY_CLUE,
  isValidClue,
  type ImposteurClientView,
  type ImposteurClue,
  type ImposteurPlayerView,
  type ImposteurTeam,
} from './engine'
import { clueKey, clueMatches } from './clue-match'
import { pickBotClue } from './bot-clue'

/**
 * Cerveau des bots de l'Imposteur — PUR, aléa injecté.
 *
 * CONTRAT ANTI-TRICHE, tenu par le type : chaque fonction reçoit la vue
 * CLIENT du bot (`toImposteurClientView(state, botId)` : son mot, les indices
 * publics, le mot et le camp des seuls éliminés, la révélation d'avant), la
 * liste d'indices de SON mot et, au plus, le carnet des mots PUBLICS de sa
 * vue (ImposteurClueBook). Jamais l'état brut, jamais la liste d'un mot
 * encore secret : un bot sait exactement ce que sait un humain assis à sa
 * place, et ignore son camp tant qu'une information publique ne le lui a pas
 * appris.
 */

export type BotSelfBelief = 'civil' | 'imposteur' | 'unsure'

/**
 * Carnet d'indices : la liste d'un mot PUBLIC pour ce bot — le sien, ou celui
 * d'un éliminé, annoncé à sa révélation —, null pour tout autre. L'adaptateur
 * serveur refuse tout mot absent de la vue du bot (server-adapter.ts) : un
 * humain qui a entendu « piscine » à la révélation en sait autant.
 */
export type ImposteurClueBook = (word: string) => readonly string[] | null

/**
 * Ce que le bot sait de son camp et, s'il le sait, du mot des civils — tiré
 * des seules informations publiques (botSelfBelief).
 */
export type ImposteurInsight = {
  belief: BotSelfBelief
  /** Mot des civils, s'il est public pour ce bot : le sien s'il se sait civil, celui d'un civil éliminé sinon. */
  civilWord: string | null
}

/**
 * Poids des signaux d'un indice dans le soupçon. « Inconnu » reste faible
 * exprès : un humain civil donne volontiers un synonyme absent de la liste du
 * bot, alors que « … » ou « mon mot » sont des signaux nets. Le perroquet
 * vaut `unknown − concordant` : redire l'indice d'un autre, même pris dans ma
 * liste, ne prouve pas qu'on porte mon mot — il pèse donc autant qu'un indice
 * inconnu. À +2, l'imposteur au seul indice hors liste ressortait devant les
 * civils contraints de se répéter : 93 % de victoires du village à 16 bots,
 * 85 % à +3 (simulation.test.ts).
 */
export const IMPOSTEUR_SUSPICION = {
  mute: 3,
  saysMyWord: 5,
  parrot: 3,
  unknown: 1,
  concordant: -2,
} as const

/** Une manche passée compte moitié : on se souvient, sans rester figé. */
export const IMPOSTEUR_PAST_ROUND_WEIGHT = 0.5

/**
 * Mémoire du vote d'avant : PART des voix reçues × ce poids × (1 pour un
 * suiveur, ½ sinon). En part et non en voix brutes : à 16 joueurs, 7 voix
 * écraseraient tous les signaux d'indice alors qu'elles pèsent autant que 2
 * voix sur 4.
 */
export const IMPOSTEUR_TALLY_WEIGHT = 2

/** Chance qu'un bot change d'avis après une manche close sur une égalité. */
export const IMPOSTEUR_TIE_SHAKE = 0.5

const otherTeam = (team: ImposteurTeam): ImposteurTeam => (team === 'civil' ? 'imposteur' : 'civil')

function meIn(view: ImposteurClientView, botId: string): ImposteurPlayerView | null {
  return view.players.find((p) => p.id === botId) ?? null
}

/**
 * Vrai si `text` est un indice que le moteur REFUSERAIT à qui porte `word`
 * (il le contient, ou en est un fragment parlant) : son auteur porte donc
 * forcément l'autre mot.
 */
function saysWord(text: string, word: string): boolean {
  return word !== '' && text.trim() !== IMPOSTEUR_EMPTY_CLUE && !isValidClue(text, word)
}

/**
 * Ce que le bot peut savoir de son camp, d'informations PUBLIQUES seulement :
 * (a) un éliminé révélé porte mon mot → son camp est le mien ; l'autre mot →
 * le camp inverse ; (b) assez de joueurs ont dit un indice qui contient mon
 * mot pour être forcément les civils (plus nombreux que les imposteurs) →
 * je suis l'imposteur. Aucune déduction sur les indices « inconnus » : les
 * synonymes des humains la rendraient fausse une fois sur deux.
 */
export function botSelfBelief(view: ImposteurClientView, botId: string): BotSelfBelief {
  return botInsight(view, botId).belief
}

/**
 * botSelfBelief, plus le mot des civils quand il est public : le sien s'il se
 * sait civil ; s'il se sait imposteur, le mot d'un éliminé qui ne porte pas
 * le sien (il n'y a que deux mots), s'il y en a un. Un imposteur sorti au
 * même mot que lui lui apprend son camp, pas le mot des civils.
 */
export function botInsight(view: ImposteurClientView, botId: string): ImposteurInsight {
  const me = meIn(view, botId)
  if (!me || me.word === '') return { belief: 'unsure', civilWord: null }
  for (const p of view.players) {
    if (p.id === botId || !p.eliminated || p.team === null || p.word === '') continue
    const belief = p.word === me.word ? p.team : otherTeam(p.team)
    if (belief === 'civil') return { belief, civilWord: me.word }
    // Imposteur : un éliminé à l'autre mot est forcément civil (il n'y a que deux mots).
    const civil = view.players.find((q) => q.eliminated && q.word !== '' && q.word !== me.word)
    return { belief, civilWord: civil?.word ?? null }
  }
  const holdersOfOther = new Set(
    view.clues.filter((c) => c.playerId !== botId && saysWord(c.text, me.word)).map((c) => c.playerId)
  )
  return {
    belief: holdersOfOther.size >= Math.max(2, view.imposteurCount + 1) ? 'imposteur' : 'unsure',
    civilWord: null,
  }
}

/**
 * Lecture d'UN indice public (`view.clues[index]`) par le bot, à l'aune de son
 * mot et de sa liste : « … », un indice que le moteur lui refuserait (il
 * porte donc l'autre mot), ou un indice de sa liste (concordant) ou non
 * (inconnu) — chacun pouvant être en plus un perroquet, la redite d'un
 * indice déjà donné par un autre, dans la partie.
 */
export type ImposteurClueReading =
  | { signal: 'mute' }
  | { signal: 'saysMyWord' }
  | { signal: 'concordant' | 'unknown'; parrot: boolean }

export function imposteurClueReading(
  view: ImposteurClientView,
  botId: string,
  ownClues: readonly string[],
  index: number
): ImposteurClueReading {
  return readClues(view.clues.slice(0, index + 1), meIn(view, botId)?.word ?? '', ownClues)[index]
}

/**
 * Lectures d'une suite d'indices, en un seul passage : les auteurs déjà
 * entendus sont tenus par clé, et chaque texte n'est jugé qu'une fois.
 * Linéaire exprès — avec la redite, une table de 16 joue une dizaine de
 * manches où chacun redit le même indice, et tout relire pour chaque indice
 * rendait le vote groupé quadratique.
 */
function readClues(
  clues: readonly ImposteurClue[],
  myWord: string,
  ownClues: readonly string[]
): ImposteurClueReading[] {
  const sayers = new Map<string, Set<string>>()
  const judged = new Map<string, { key: string; signal: ImposteurClueReading['signal'] }>()
  return clues.map((clue) => {
    let verdict = judged.get(clue.text)
    if (!verdict) {
      const signal =
        clue.text.trim() === IMPOSTEUR_EMPTY_CLUE
          ? 'mute'
          : saysWord(clue.text, myWord)
            ? 'saysMyWord'
            : clueMatches(clue.text, ownClues)
              ? 'concordant'
              : 'unknown'
      verdict = { key: clueKey(clue.text), signal }
      judged.set(clue.text, verdict)
    }
    const before = sayers.get(verdict.key)
    const parrot = before !== undefined && (before.size > 1 || !before.has(clue.playerId))
    if (before) before.add(clue.playerId)
    else sayers.set(verdict.key, new Set([clue.playerId]))
    if (verdict.signal === 'mute' || verdict.signal === 'saysMyWord') return { signal: verdict.signal }
    return { signal: verdict.signal, parrot }
  })
}

function readingWeight(reading: ImposteurClueReading): number {
  if (reading.signal === 'mute') return IMPOSTEUR_SUSPICION.mute
  if (reading.signal === 'saysMyWord') return IMPOSTEUR_SUSPICION.saysMyWord
  return IMPOSTEUR_SUSPICION[reading.signal] + (reading.parrot ? IMPOSTEUR_SUSPICION.parrot : 0)
}

/**
 * Soupçon du bot envers chaque AUTRE vivant : signaux des indices (manche
 * courante ×1, manches passées ×½), mémoire du vote d'avant et part
 * publique du fil de paroles (speechSuspicion : accusations reçues,
 * alliances, rancune et loyauté du persona). Qui a voté quoi reste secret :
 * rien n'en est tiré. Les paroles pèsent sous les indices nets (« … » +3,
 * mon mot +5) : une accusation compte +2, le double pour un suiveur quand
 * elle vient d'un humain — l'imposteur humain n'a pas de levier gratuit.
 */
export function imposteurSuspicion(
  view: ImposteurClientView,
  botId: string,
  ownClues: readonly string[],
  traits: BotTraits
): Map<string, number> {
  const scores = new Map<string, number>()
  for (const p of view.players) if (!p.eliminated && p.id !== botId) scores.set(p.id, 0)

  const readings = readClues(view.clues, meIn(view, botId)?.word ?? '', ownClues)
  view.clues.forEach((clue, i) => {
    const current = scores.get(clue.playerId)
    if (current === undefined) return
    const weight = clue.round === view.round ? 1 : IMPOSTEUR_PAST_ROUND_WEIGHT
    scores.set(clue.playerId, current + weight * readingWeight(readings[i]))
  })

  const speech = view.speech ?? []
  if (speech.length > 0) {
    const humans = new Set(view.players.filter((p) => !p.isBot).map((p) => p.id))
    const spoken = speechSuspicion({
      candidates: [...scores.keys()],
      speech,
      round: view.round,
      botId,
      trait: traits.trait,
      mood: traits,
      isHuman: (id) => humans.has(id),
    })
    for (const [id, n] of spoken) scores.set(id, (scores.get(id) ?? 0) + n)
  }

  const tally = view.previousReveal?.tally ?? {}
  const total = Object.values(tally).reduce((sum, n) => sum + n, 0)
  if (total > 0) {
    const follow = traits.trait === 'suiveur' ? 1 : 0.5
    for (const [id, votes] of Object.entries(tally)) {
      const current = scores.get(id)
      if (current !== undefined) scores.set(id, current + (IMPOSTEUR_TALLY_WEIGHT * follow * votes) / total)
    }
  }
  return scores
}

/** Classement décroissant ; les égalités sont tranchées par `rand` (mélange avant tri stable). */
function ranked(scores: Map<string, number>, rand: () => number): string[] {
  const ids = [...scores.keys()]
  for (let i = ids.length - 1; i > 0; i -= 1) {
    const j = Math.min(i, Math.floor(rand() * (i + 1)))
    const swap = ids[i]
    ids[i] = ids[j]
    ids[j] = swap
  }
  return ids.sort((a, b) => (scores.get(b) ?? 0) - (scores.get(a) ?? 0))
}

/**
 * Concordant : a parlé, et tout ce qu'il a dit (hors « … ») colle à MA liste
 * — porteur probable de mon mot.
 */
function isConcordant(view: ImposteurClientView, playerId: string, ownClues: readonly string[]): boolean {
  const spoken = view.clues.filter((c) => c.playerId === playerId && c.text.trim() !== IMPOSTEUR_EMPTY_CLUE)
  return spoken.length > 0 && spoken.every((c) => clueMatches(c.text, ownClues))
}

/**
 * Classement du bot qui se SAIT imposteur sans connaître le mot des civils :
 * il épargne les concordants (ses complices probables quand ils sont
 * plusieurs) et se fond dans la majorité — d'abord le plus voté de la manche
 * d'avant, puis celui qui détonne le plus ; les concordants ferment la marche.
 */
function bluffOrder(
  view: ImposteurClientView,
  botId: string,
  ownClues: readonly string[],
  traits: BotTraits,
  rand: () => number
): string[] {
  const scores = imposteurSuspicion(view, botId, ownClues, traits)
  const tally = view.previousReveal?.tally ?? {}
  const others = ranked(scores, rand)
  const strangers = others.filter((id) => !isConcordant(view, id, ownClues))
  const allies = others.filter((id) => isConcordant(view, id, ownClues))
  const byTally = (ids: string[]) => [...ids].sort((a, b) => (tally[b] ?? 0) - (tally[a] ?? 0))
  return [...byTally(strangers), ...byTally(allies)]
}

/**
 * Couverture du bluff INFORMÉ : le bot se sait imposteur et un civil éliminé
 * a rendu public le mot des civils. `civil` : la liste de ce mot, telle
 * quelle (pour lire la table comme eux) ; `clues` : la même, moins ce que le
 * moteur refuserait à son mot (pour y puiser ses indices). Null sinon.
 */
type Cover = { civil: readonly string[]; clues: readonly string[] }

function coverOf(view: ImposteurClientView, botId: string, book: ImposteurClueBook | undefined): Cover | null {
  const me = meIn(view, botId)
  if (!book || !me || me.word === '') return null
  const { belief, civilWord } = botInsight(view, botId)
  if (belief !== 'imposteur' || !civilWord || civilWord === me.word) return null
  const civil = book(civilWord) ?? []
  const clues = civil.filter((c) => isValidClue(c, me.word))
  return clues.length > 0 ? { civil, clues } : null
}

/**
 * Complices probables, pour l'imposteur qui connaît le mot des civils : qui a
 * dit au moins un indice de MA liste que celle des civils n'a pas — une
 * marque de mon mot qu'aucun civil n'a de raison de donner.
 */
function markedAllies(
  view: ImposteurClientView,
  ownClues: readonly string[],
  civil: readonly string[]
): Set<string> {
  const marks = new Map<string, boolean>()
  const allies = new Set<string>()
  for (const c of view.clues) {
    let mark = marks.get(c.text)
    if (mark === undefined) {
      mark = c.text.trim() !== IMPOSTEUR_EMPTY_CLUE && clueMatches(c.text, ownClues) && !clueMatches(c.text, civil)
      marks.set(c.text, mark)
    }
    if (mark) allies.add(c.playerId)
  }
  return allies
}

/**
 * Classement de l'imposteur qui connaît le mot des civils : il lit la table
 * avec LEUR liste — son soupçon devient le leur, il vote avec la majorité —,
 * ses complices probables fermant la marche.
 */
function coverOrder(
  view: ImposteurClientView,
  botId: string,
  ownClues: readonly string[],
  cover: Cover,
  traits: BotTraits,
  rand: () => number
): string[] {
  const others = ranked(imposteurSuspicion(view, botId, cover.civil, traits), rand)
  const allies = markedAllies(view, ownClues, cover.civil)
  return [...others.filter((id) => !allies.has(id)), ...others.filter((id) => allies.has(id))]
}

/**
 * Cible du vote : le plus soupçonné, égalités au hasard ; un farceur qui ne
 * bluffe pas (`rand() < audace`) se rabat sur le deuxième. Après une manche
 * close sur une égalité, chacun peut aussi changer d'avis (une chance sur
 * deux) : sans ce pas de côté, des bots aux soupçons figés revotaient la même
 * égalité à chaque manche, et la partie ne finissait jamais. Jamais soi ni un
 * éliminé ; null s'il n'y a personne à viser. Le bot qui se sait imposteur
 * vote en bluffeur (coverOrder s'il connaît le mot des civils, bluffOrder
 * sinon).
 */
export function imposteurBotVote(
  view: ImposteurClientView,
  botId: string,
  ownClues: readonly string[],
  traits: BotTraits,
  rand: () => number,
  book?: ImposteurClueBook
): string | null {
  const cover = coverOf(view, botId, book)
  const bluffing = cover !== null || botSelfBelief(view, botId) === 'imposteur'
  const order = cover
    ? coverOrder(view, botId, ownClues, cover, traits, rand)
    : bluffing
      ? bluffOrder(view, botId, ownClues, traits, rand)
      : ranked(imposteurSuspicion(view, botId, ownClues, traits), rand)
  if (order.length === 0) return null
  if (order.length >= 2) {
    if (!bluffing && traits.trait === 'farceur' && rand() < traits.audace) return order[1]
    if (view.previousReveal?.tie && rand() < IMPOSTEUR_TIE_SHAKE) return order[1]
  }
  return order[0]
}

/**
 * Le vote posé au vote groupé : le choix frais (imposteurBotVote), sauf si le
 * bot a annoncé un vote cette manche et que la cible annoncée reste à ses
 * yeux au moins aussi suspecte — on ne se dédit pas pour un départage au dé.
 * Qu'une accusation fasse passer quelqu'un devant, et il change d'avis. Le
 * choix frais est toujours tiré d'abord : la suite des tirages ne dépend pas
 * de l'annonce.
 */
export function imposteurBotVoteNow(
  view: ImposteurClientView,
  botId: string,
  ownClues: readonly string[],
  traits: BotTraits,
  rand: () => number,
  book?: ImposteurClueBook
): string | null {
  const fresh = imposteurBotVote(view, botId, ownClues, traits, rand, book)
  const said = (view.speech ?? []).find(
    (sp) => sp.round === view.round && sp.playerId === botId && sp.kind === 'intent'
  )?.targetId
  if (!said || said === fresh || !view.players.some((p) => p.id === said && !p.eliminated)) return fresh
  if (!fresh) return said
  const lens = coverOf(view, botId, book)?.civil ?? ownClues
  const scores = imposteurSuspicion(view, botId, lens, traits)
  return (scores.get(fresh) ?? 0) > (scores.get(said) ?? 0) ? fresh : said
}

/**
 * Indice du bot au tour : au ton de son persona ; s'il se sait imposteur et
 * connaît le mot des civils, tiré de LEUR liste (bluff informé, au ton du
 * persona) ; s'il se sait imposteur sans le connaître, pour se fondre
 * (perroquet de la manche ou le plus vague). Liste épuisée, il se répète
 * (bot-clue.ts). Toujours un indice que le moteur accepte de lui ; « … » pour
 * le seul bot sans catalogue.
 */
export function imposteurBotClue(
  view: ImposteurClientView,
  botId: string,
  ownClues: readonly string[],
  traits: BotTraits,
  rand: () => number,
  book?: ImposteurClueBook
): string {
  const me = meIn(view, botId)
  if (!me || me.word === '' || ownClues.length === 0) return IMPOSTEUR_EMPTY_CLUE
  const cover = coverOf(view, botId, book)
  const blending = !cover && botSelfBelief(view, botId) === 'imposteur'
  const text = pickBotClue({
    clues: cover ? cover.clues : ownClues,
    given: view.clues.map((c) => c.text),
    mine: view.clues.filter((c) => c.playerId === botId).map((c) => c.text),
    traits,
    round: view.round,
    rand,
    mode: blending ? 'blend' : 'play',
    parrots: blending
      ? view.clues.filter((c) => c.round === view.round && c.playerId !== botId).map((c) => c.text)
      : undefined,
    ownWord: me.word,
    alive: view.players.filter((p) => !p.eliminated).length,
  })
  return isValidClue(text, me.word) ? text : IMPOSTEUR_EMPTY_CLUE
}
