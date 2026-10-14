import { botTraitsFor, type BotTraits } from '@/lib/online/bot-personas'
import {
  askOf,
  botsByTempo,
  lastHumanSpeech,
  mostSuspect,
  pick,
  reactionBudget,
  reactionDare,
  readSpeechTable,
  remarkOf,
  standsBy,
  type SpeechPlayer,
  type SpeechTable,
} from '@/lib/online/bot-speech'
import { imposteurBotVote, imposteurClueReading, imposteurSuspicion, type ImposteurClueBook } from './bot-brain'
import {
  isImposteurRemark,
  toImposteurClientView,
  toImposteurSpectatorView,
  IMPOSTEUR_INTENTS_MAX,
  IMPOSTEUR_SPEECH_CAP,
  type ImposteurAction,
  type ImposteurClientView,
  type ImposteurSpeech,
  type ImposteurSpeechKind,
  type ImposteurState,
} from './engine'

/**
 * PAROLES DES BOTS DE L'IMPOSTEUR : « un coup par tick », sobre.
 *
 * Chaque tick bot produit AU PLUS une parole, qui bumpe la version et réarme
 * le tick suivant ; la chaîne s'arrête d'elle-même par les compteurs (cap
 * moteur, bavardage du persona, budgets par parole humaine et par manche).
 * Les coups :
 *   (a) réponse à la dernière accusation HUMAINE visant un bot : l'accusé se
 *       défend (ou contre-accuse son plus suspect s'il est agressif, ou
 *       farceur qui ose), puis un autre abonde ou doute ;
 *   (b) réaction au dernier indice d'un HUMAIN, sur signal FORT seulement
 *       (« … », mon mot, perroquet) — un indice simplement inconnu ne fait
 *       jamais parler, un concordant peut valoir une alliance ;
 *   (c) manche ≥ 2 : « je l'avais dit » / « je me suis planté » sur
 *       l'éliminé de la manche d'avant ;
 *   (d) chaque bot annonce son vote (« je vote X ») avant de voter, pour que
 *       l'humain puisse peser dessus ;
 *   (e) « et toi, tu votes qui ? » à un humain qui n'a pas voté.
 * Ordre d'un tick — indices : (a), (c), (b) ; vote : (a), (b) sans alliance,
 * (d), (e). Rien à dire → null : l'adaptateur donne alors son indice au bot
 * au tour (indices) ou fait voter les bots (vote).
 *
 * ANTI-TRICHE, comme bot-brain.ts : l'état brut ne sert qu'à bâtir la vue
 * NEUTRE de la table (spectateur) et la vue CLIENT de chaque bot ; chaque
 * décision ne lit que celle-ci, la liste d'indices de SON mot et son persona.
 * Personne ne lit un camp ni le mot d'un autre.
 *
 * PUR : `rand` et `now` injectés, aucun curseur — l'avancement se lit dans
 * le fil (`speech`) et les indices.
 */

/** Part d'alliance sur un indice concordant : 15 % pour un traître, 45 % pour un fidèle. */
export const CLUE_ALLY_SHARE_MIN = 0.15
export const CLUE_ALLY_SHARE_SPAN = 0.3

type Kind = ImposteurSpeechKind

/** Ce que le planificateur lit d'un joueur : la place publique, et s'il a voté. */
type Seat = SpeechPlayer & { hasVoted: boolean }

export type ImposteurSpeechDeps = {
  /** Liste d'indices du mot de CE bot — et de lui seul ; vide sans catalogue. */
  ownCluesOf: (botId: string) => readonly string[]
  /** Carnet des mots PUBLICS de la vue de CE bot (bluff informé de l'annonce de vote) ; absent, il n'en a pas. */
  clueBookOf?: (botId: string) => ImposteurClueBook
}

type Mind = {
  view: ImposteurClientView
  ownClues: readonly string[]
  traits: BotTraits
  book: ImposteurClueBook | undefined
}

type Ctx = {
  pub: ImposteurClientView
  /** Paroles de la manche HORS annonces de vote : les réactions et le bavardage s'y lisent. */
  table: SpeechTable<Kind, Seat>
  /** Toutes les paroles de la manche, annonces comprises : le plafond moteur s'y lit. */
  roundSpeech: ImposteurSpeech[]
  total: (id: string) => number
  mind: (bot: Seat) => Mind
  rand: () => number
  now: number
}

const isAsk = (kind: Kind) => kind === 'ask'

function speak(playerId: string, kind: Kind, targetId: string): ImposteurAction {
  return { type: 'SPEAK', playerId, kind, targetId }
}

function readCtx(state: ImposteurState, now: number, rand: () => number, deps: ImposteurSpeechDeps): Ctx {
  const pub = toImposteurSpectatorView(state)
  const seats: Seat[] = pub.players.map((p) => ({
    id: p.id,
    name: p.name,
    isBot: p.isBot,
    alive: !p.eliminated,
    hasVoted: p.hasVoted,
  }))
  const speech = pub.speech ?? []
  const roundSpeech = speech.filter((sp) => sp.round === pub.round)
  // L'annonce de vote n'entre pas dans le bavardage (cap persona ≤ 2, une
  // place sur les trois du moteur lui est gardée) ni dans les réactions.
  const table = readSpeechTable({
    players: seats,
    speech: speech.filter((sp) => sp.kind !== 'intent'),
    round: pub.round,
    engineCap: IMPOSTEUR_SPEECH_CAP - 1,
    isRemark: isImposteurRemark,
    isAsk,
  })
  const minds = new Map<string, Mind>()
  return {
    pub,
    table,
    roundSpeech,
    total: (id) => roundSpeech.filter((sp) => sp.playerId === id).length,
    mind: (bot) => {
      let m = minds.get(bot.id)
      if (!m) {
        m = {
          view: toImposteurClientView(state, bot.id),
          ownClues: deps.ownCluesOf(bot.id),
          traits: botTraitsFor(bot.name),
          book: deps.clueBookOf?.(bot.id),
        }
        minds.set(bot.id, m)
      }
      return m
    },
    rand,
    now,
  }
}

const canSpeak = (ctx: Ctx, id: string) => ctx.total(id) < IMPOSTEUR_SPEECH_CAP

function suspicionOf(ctx: Ctx, bot: Seat): Map<string, number> {
  const { view, ownClues, traits } = ctx.mind(bot)
  return imposteurSuspicion(view, bot.id, ownClues, traits)
}

/** Le plus suspect du bot parmi les autres vivants (égalités au hasard), null s'il n'y a personne. */
function mostSuspectOf(ctx: Ctx, bot: Seat): string | null {
  const score = suspicionOf(ctx, bot)
  const tied = mostSuspect(
    score,
    ctx.table.alive.filter((p) => p.id !== bot.id).map((p) => p.id)
  )
  return tied.length > 0 ? pick(tied, ctx.rand) : null
}

/**
 * (a) Une accusation humaine visant un bot : l'accusé répond d'abord — hors
 * bavardage, sous le seul plafond moteur, un taiseux qu'on accuse ne se tait
 * pas —, puis un second bot abonde ou doute ; au plus deux réponses, et un
 * bot déjà engagé ne revient qu'en osant (reactionDare). Une défense humaine
 * ne fait réagir personne.
 */
function reactionOf(ctx: Ctx): ImposteurAction | null {
  const { table, rand } = ctx
  const last = lastHumanSpeech(table)
  if (!last || last.speech.kind !== 'suspect' || !last.speech.targetId) return null
  const accused = table.byId.get(last.speech.targetId)
  if (!accused?.isBot || !accused.alive) return null
  const { index, author } = last
  const { answers, left } = reactionBudget(table, index)
  if (left <= 0) return null
  const dares = reactionDare(table, { answers, accusedId: accused.id, rand })
  const authorId = author.alive ? author.id : null

  if (!table.spokeAfter(accused.id, index) && canSpeak(ctx, accused.id) && dares(accused)) {
    const { trait, audace } = table.traits(accused)
    // Accusé par l'allié qu'il s'est choisi, un fidèle se défend sans contre-attaquer.
    const betrayed = authorId !== null && standsBy(table, accused, authorId)
    if (!betrayed && (trait === 'agressif' || (trait === 'farceur' && rand() < audace))) {
      const target = mostSuspectOf(ctx, accused)
      if (target) return speak(accused.id, 'suspect', target)
    }
    return authorId ? speak(accused.id, 'defend', authorId) : null
  }

  for (const bot of botsByTempo(table)) {
    if (bot.id === accused.id || !table.underCap(bot.id) || !canSpeak(ctx, bot.id)) continue
    if (table.spokeAfter(bot.id, index) || !dares(bot)) continue
    const move = followUp(ctx, bot, accused)
    if (move) return move
  }
  return null
}

/**
 * Le second bot : un fidèle de l'accusé doute ; un prudent doute si les
 * indices de l'accusé ne l'inquiètent pas, lui ; un suiveur ou un agressif
 * abonde quand son propre soupçon — accusation comprise — est positif ; un
 * farceur ne s'en mêle qu'en osant. Sinon il se tait.
 */
function followUp(ctx: Ctx, bot: Seat, accused: Seat): ImposteurAction | null {
  const { table, rand } = ctx
  if (standsBy(table, bot, accused.id)) return speak(bot.id, 'doubt', accused.id)
  const { trait, audace } = table.traits(bot)
  const score = suspicionOf(ctx, bot).get(accused.id) ?? 0
  if (trait === 'prudent') {
    const { view, ownClues, traits } = ctx.mind(bot)
    const fromClues = imposteurSuspicion({ ...view, speech: [] }, bot.id, ownClues, traits).get(accused.id) ?? 0
    return fromClues <= 0 ? speak(bot.id, 'doubt', accused.id) : null
  }
  if (trait === 'farceur') {
    if (rand() >= audace) return null
    return speak(bot.id, score > 0 ? 'rally' : 'doubt', accused.id)
  }
  return score > 0 ? speak(bot.id, 'rally', accused.id) : null
}

/**
 * (b) Le dernier indice de la manche vient d'un humain que nul bot n'a encore
 * accusé ni approuvé : le plus rapide des bots qui y lit un signal FORT
 * l'accuse ; à défaut, le plus rapide qui le trouve concordant peut s'allier
 * (15 à 45 % selon sa loyauté). Un indice de bot, ou un indice humain
 * simplement inconnu, ne fait jamais parler.
 */
function clueReactionOf(ctx: Ctx, { allowAlly }: { allowAlly: boolean }): ImposteurAction | null {
  const { pub, table, rand } = ctx
  const index = pub.clues.length - 1
  const clue = pub.clues[index]
  if (!clue || clue.round !== pub.round) return null
  const author = table.byId.get(clue.playerId)
  if (!author || author.isBot || !author.alive) return null
  const answered = table.speech.some(
    (sp) =>
      sp.targetId === author.id &&
      (sp.kind === 'suspect' || sp.kind === 'ally') &&
      table.byId.get(sp.playerId)?.isBot
  )
  if (answered) return null
  const ready = botsByTempo(table).filter((b) => table.underCap(b.id) && canSpeak(ctx, b.id))
  const readings = ready.map((bot) => {
    const { view, ownClues } = ctx.mind(bot)
    return { bot, reading: imposteurClueReading(view, bot.id, ownClues, index) }
  })
  const strong = readings.find(
    ({ reading }) => reading.signal === 'mute' || reading.signal === 'saysMyWord' || reading.parrot
  )
  if (strong) return speak(strong.bot.id, 'suspect', author.id)
  if (!allowAlly) return null
  const fan = readings.find(({ reading }) => reading.signal === 'concordant')
  if (!fan) return null
  const share = CLUE_ALLY_SHARE_MIN + CLUE_ALLY_SHARE_SPAN * table.traits(fan.bot).loyaute
  return rand() < share ? speak(fan.bot.id, 'ally', author.id) : null
}

/**
 * (c) Remarque d'ouverture : le bot avait accusé (ou annoncé voter) l'éliminé
 * de la manche d'avant — « je l'avais dit » si c'était un imposteur, « je me
 * suis planté » sinon. Au plus deux par manche, une seule par bot, et
 * seulement s'il lui reste une parole ensuite (remarkOf).
 */
function openingRemarkOf(ctx: Ctx): ImposteurAction | null {
  const { pub, table } = ctx
  const prev = pub.previousReveal
  if (pub.round < 2 || !prev?.eliminatedId || !prev.team) return null
  const outId = prev.eliminatedId
  const kind: Kind = prev.team === 'imposteur' ? 'toldYou' : 'wrong'
  const remark = remarkOf(table, (bot) => {
    const accused = (pub.speech ?? []).some(
      (sp) =>
        sp.round === pub.round - 1 &&
        sp.playerId === bot.id &&
        sp.targetId === outId &&
        (sp.kind === 'suspect' || sp.kind === 'rally' || sp.kind === 'intent')
    )
    return accused && canSpeak(ctx, bot.id) ? { kind, targetId: outId } : null
  })
  return remark?.targetId ? speak(remark.playerId, remark.kind, remark.targetId) : null
}

/**
 * (d) Annonce de vote : le prochain bot qui n'a ni voté ni annoncé, par tempo,
 * vise ce qu'il voterait À L'INSTANT (imposteurBotVote) — le vote réel est
 * recalculé plus tard, une accusation entre-temps peut le retourner. Hors
 * bavardage du persona (un taiseux annonce aussi), sous le plafond moteur,
 * IMPOSTEUR_INTENTS_MAX par manche.
 */
function intentOf(ctx: Ctx): ImposteurAction | null {
  const { table, roundSpeech, rand } = ctx
  const intents = roundSpeech.filter((sp) => sp.kind === 'intent')
  if (intents.length >= IMPOSTEUR_INTENTS_MAX) return null
  for (const bot of botsByTempo(table)) {
    if (bot.hasVoted || !canSpeak(ctx, bot.id) || intents.some((sp) => sp.playerId === bot.id)) continue
    const { view, ownClues, traits, book } = ctx.mind(bot)
    const target = imposteurBotVote(view, bot.id, ownClues, traits, rand, book)
    if (target) return speak(bot.id, 'intent', target)
  }
  return null
}

export function imposteurBotSpeechMove(
  state: ImposteurState,
  now: number,
  rand: () => number,
  deps: ImposteurSpeechDeps
): ImposteurAction | null {
  if (state.phase !== 'clue' && state.phase !== 'vote') return null
  const ctx = readCtx(state, now, rand, deps)
  if (ctx.table.bots.length === 0) return null

  const reaction = reactionOf(ctx)
  if (reaction) return reaction

  // Un dé d'alliance (b) qui échoue n'écrit rien : jeté après les remarques,
  // il ne l'est qu'une fois par indice — sauf parole humaine dans
  // l'intervalle. Au vote, chaque annonce relance un tick : seul le signal
  // fort, sans dé, y réagit encore (au dernier indice, donné juste avant).
  if (ctx.pub.phase === 'clue') return openingRemarkOf(ctx) ?? clueReactionOf(ctx, { allowAlly: true })

  // Après leur vote, les bots ne font plus que répondre (a).
  if (ctx.table.bots.every((b) => b.hasVoted)) return null
  const lastClue = clueReactionOf(ctx, { allowAlly: false })
  if (lastClue) return lastClue
  // Tous les humains ont voté : plus personne à éclairer, on vote.
  if (ctx.table.humans.every((h) => h.hasVoted)) return null

  const intent = intentOf(ctx)
  if (intent) return intent

  const ask = askOf(ctx.table, now, ctx.pub.phaseEndsAt, { isSilent: (h) => !h.hasVoted })
  return ask && canSpeak(ctx, ask.playerId) ? speak(ask.playerId, 'ask', ask.targetId) : null
}
