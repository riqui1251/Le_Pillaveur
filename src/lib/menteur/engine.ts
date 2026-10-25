import { createRng, rngFromState, type RngState, type SeededRng } from '@/lib/petit-buveur/rng'
import type { BotSpeech } from '@/lib/online/bot-speech'

/**
 * LE MENTEUR (Perudo apéro) — moteur PUR, serveur-autoritaire.
 *
 * Chaque joueur cache 5 dés sous son gobelet. À ton tour : surenchérir
 * (« il y a au moins Q dés de face F sur la table ») ou crier « Menteur ! ».
 * Les 1 — les « Pillaveurs » — sont jokers : ils comptent pour toutes les
 * faces (sauf quand l'enchère porte sur les 1 eux-mêmes).
 *
 * Défi (« Menteur ! ») → révélation : si l'enchère tient, l'accusateur perd
 * un dé, sinon l'enchérisseur. Le perdant boit (gorgées = total de ses dés
 * perdus). Plus de dés = éliminé (cul sec). Dernier en lice = vainqueur.
 *
 * Déterminisme : tous les lancers passent par le RNG seedé sérialisé dans
 * l'état (`rngState`) — jamais envoyé au client (anti-triche).
 */

export const MENTEUR_START_DICE = 5
/**
 * TEMPS DE LECTURE MINIMAL de la révélation. Le bouton « manche suivante »
 * est ouvert à toute la table : sans plancher, le premier impatient relançait
 * les dés avant que les autres aient vu les gobelets levés (F33). Le Menteur
 * n'a PAS d'horloge de phase — on horodate donc l'entrée en révélation.
 * Le bot qui mène la révélation y est soumis lui aussi dès qu'un humain non
 * parti est assis, même éliminé : exempté, il refermait à 2,6 s la révélation
 * où l'humain venait de le démasquer. Ses ticks (bot-tick.ts) dépassent le
 * plancher d'au moins 1 s, client comme serveur : le tick serveur n'est donc
 * jamais refusé, sinon skipBot figerait une révélation sans échéance. Une
 * table sans humain présent reste exemptée et ne peut pas se figer.
 */
export const MENTEUR_REVEAL_MIN_MS = 4_000
export const MENTEUR_MIN_PLAYERS = 2
export const MENTEUR_MAX_PLAYERS = 6

export type MenteurPlayer = {
  id: string
  name: string
  isBot: boolean
  leftAt: number | null
  /** SECRET — dés sous le gobelet (vide = éliminé). */
  dice: number[]
  /**
   * Dés perdus au total. ATTENTION : ce n'est PAS le nombre de gorgées bues —
   * l'addition grimpe (1 gorgée au 1er dé, 2 au 2e, 3 au 3e…), donc le total
   * bu vaut n(n+1)/2, pas n. Pour l'affichage, utiliser `sipsTotal` de la vue
   * client, jamais `lostCount` (F35).
   */
  lostCount: number
}

export type MenteurBid = { qty: number; face: number; by: string }

/**
 * Une enchère de la manche telle que les gobelets levés la jugent : `bluff`
 * = son auteur n'avait AUCUN dé de la face (jokers compris hors Palifico).
 */
export type MenteurDuelBid = MenteurBid & { bluff: boolean }

/**
 * Fait BRUT d'un défi (« Menteur ! » ou Calza), gardé toute la partie. Rien
 * d'agrégé : la réputation et le « qui m'a fait boire » se dérivent de cette
 * liste, au lieu de figer une donnée calculée qui dupliquerait les règles.
 * Tout y est public : les dés qui fondent `bluff` étaient levés à cet instant.
 */
export type MenteurDuel = {
  round: number
  /** Auteur de l'enchère défiée. */
  bidderId: string
  challengerId: string
  mode: 'dudo' | 'calza'
  /** L'enchère défiée tenait (au moins la quantité annoncée). */
  held: boolean
  /** Qui a perdu un dé ; null sur un Calza réussi. */
  loserId: string | null
  /** Toute la chaîne de la manche, de l'ouverture à l'enchère défiée. */
  bids: MenteurDuelBid[]
}

/** Résultat PUBLIC d'un défi — tous les gobelets sont levés. */
export type MenteurReveal = {
  bid: MenteurBid
  challengerId: string
  /** Dés de chaque joueur encore en lice AU MOMENT du défi. */
  allDice: { playerId: string; dice: number[] }[]
  matchCount: number
  bidHeld: boolean
  /** DUDO, ou Calza raté : qui boit. Calza réussi : null (personne ne boit). */
  loserId: string | null
  /** Gorgées du perdant (= son total de dés perdus). */
  sips: number
  /** Joueur éliminé sur ce défi (cul sec), sinon null. */
  eliminatedId: string | null
  /** 'dudo' (par défaut) ou 'calza' (pari « pile la quantité »). */
  mode?: 'dudo' | 'calza'
  /** Calza réussi seulement : qui regagne un dé. */
  gainedId?: string | null
}

export type MenteurPhase = 'bidding' | 'reveal' | 'finished'

/**
 * Parole PUBLIQUE d'un bot, portée par son coup (`botSay.<kind>` sous
 * games.menteur.game) : elle naît dans la MÊME réduction que l'enchère ou le
 * défi, sans tick ni version de plus. Le kind est le seul message : le texte
 * des phrases ne révèle rien, et le kind se calcule sur les seuls dés du bot.
 *   • enchère : sure (je la tiens), unsure (ça passe ou ça casse), ally (je
 *     te suis sur ta face), grudge (pique d'ouverture à qui l'a fait perdre) ;
 *   • « Menteur ! » : suspect, ou again contre un bluffeur déjà démasqué ;
 *   • Calza : exact.
 * gotcha, held, caught et wrongCall sont les réactions à la révélation :
 * dérivées de la vue publique côté client, jamais écrites dans l'état.
 */
export type MenteurSpeechKind =
  | 'sure'
  | 'unsure'
  | 'ally'
  | 'suspect'
  | 'exact'
  | 'again'
  | 'grudge'
  | 'gotcha'
  | 'held'
  | 'caught'
  | 'wrongCall'
export type MenteurSpeech = BotSpeech<MenteurSpeechKind>

export const MENTEUR_SPEECH_KINDS = [
  'sure',
  'unsure',
  'ally',
  'suspect',
  'exact',
  'again',
  'grudge',
  'gotcha',
  'held',
  'caught',
  'wrongCall',
] as const satisfies readonly MenteurSpeechKind[]

/** Paroles max par joueur et par manche ; le bavardage du persona borne en dessous. */
export const MENTEUR_SPEECH_CAP = 2
/** Les remarques sur une manche passée : le bluff déjà démasqué, le dé perdu. */
export const MENTEUR_REMARK_KINDS = ['again', 'grudge'] as const satisfies readonly MenteurSpeechKind[]
/**
 * Aucune parole humaine : l'adaptateur HTTP ne lit pas `say`, le chat vocal
 * de la table suffit aux humains.
 */
export const MENTEUR_HUMAN_SPEECH_KINDS = [] as const satisfies readonly MenteurSpeechKind[]

/** Les kinds qu'un coup peut porter ; les réactions de révélation n'y sont jamais. */
const SAY_KINDS_OF: Record<'BID' | 'DUDO' | 'CALZA', readonly MenteurSpeechKind[]> = {
  BID: ['sure', 'unsure', 'ally', 'grudge'],
  DUDO: ['suspect', 'again'],
  CALZA: ['exact'],
}

export function isMenteurRemark(kind: MenteurSpeechKind): boolean {
  return (MENTEUR_REMARK_KINDS as readonly string[]).includes(kind)
}

/** Le Menteur n'interpelle personne : on répond par son coup, pas par une question. */
export function isMenteurAsk(kind: MenteurSpeechKind): boolean {
  void kind
  return false
}

/** La parole jointe à un coup : son kind et le joueur qu'elle nomme. */
export type MenteurSay = { kind: MenteurSpeechKind; targetId: string }

export type MenteurState = {
  version: number
  phase: MenteurPhase
  players: MenteurPlayer[]
  /** Index (dans players) du joueur au tour pendant les enchères. */
  turnIdx: number
  currentBid: MenteurBid | null
  lastReveal: MenteurReveal | null
  round: number
  winnerId: string | null
  rematchVotes: string[]
  /** SECRET serveur — jamais dans une vue client. */
  rngState: RngState
  /** Règle Palifico activée pour la partie (choix hôte, figé au lancement). */
  rulePalifico: boolean
  /** Règle Calza activée pour la partie (choix hôte, figé au lancement). */
  ruleCalza: boolean
  /** Horodatage serveur de l'entrée en révélation (plancher de lecture). */
  revealAt: number | null
  /** Manche Palifico en cours (un joueur vivant n'a plus qu'un dé) : les 1 ne
   * sont plus jokers et la face de l'enchère est verrouillée sur la manche. */
  palifico: boolean
  /**
   * PUBLIC — chaîne des enchères de la manche en cours, gardée pendant la
   * révélation, vidée au CONTINUE. Optionnel : un état sérialisé avant son
   * arrivée n'en a pas (parseMenteurState complète).
   */
  bids?: MenteurBid[]
  /** PUBLIC — un fait brut par défi, toute la partie (cf. MenteurDuel). */
  duels?: MenteurDuel[]
  /**
   * PUBLIC — paroles des bots, celles de la manche en cours et de la
   * précédente au plus : le CONTINUE ne garde que la manche qui s'achève.
   * Optionnel comme `bids` (parseMenteurState complète).
   */
  speech?: MenteurSpeech[]
}

export type MenteurAction =
  | { type: 'BID'; playerId: string; qty: number; face: number; say?: MenteurSay }
  | { type: 'DUDO'; playerId: string; now: number; say?: MenteurSay }
  | { type: 'CALZA'; playerId: string; now: number; say?: MenteurSay }
  | { type: 'CONTINUE'; playerId: string; now: number }
  | { type: 'LEAVE'; playerId: string; at: number }
  | { type: 'REJOIN'; playerId: string }
  | { type: 'REPLACE_LEFT'; now: number; graceMs: number }

export class MenteurEngineError extends Error {
  constructor(code: string) {
    super(code)
    this.name = 'MenteurEngineError'
  }
}

export type MenteurInitialPlayer = { id: string; name: string; isBot?: boolean }

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function isMenteurAlive(p: MenteurPlayer): boolean {
  return p.dice.length > 0
}

export function menteurAlivePlayers(state: MenteurState): MenteurPlayer[] {
  return state.players.filter(isMenteurAlive)
}

export function menteurTotalDice(state: MenteurState): number {
  return state.players.reduce((sum, p) => sum + p.dice.length, 0)
}

/** Prochain index VIVANT strictement après `fromIdx` (ordre de table circulaire). */
function nextAliveIdx(state: MenteurState, fromIdx: number): number {
  const n = state.players.length
  for (let step = 1; step <= n; step += 1) {
    const idx = (fromIdx + step) % n
    if (isMenteurAlive(state.players[idx])) return idx
  }
  throw new MenteurEngineError('NO_ALIVE_PLAYER')
}

/**
 * Nombre de dés sur la table qui satisfont une face d'enchère :
 * la face exacte + les 1 jokers (sauf si l'enchère porte sur les 1, ou en
 * manche Palifico où les 1 perdent leur statut de joker).
 */
export function countMatches(players: MenteurPlayer[], face: number, palifico = false): number {
  let count = 0
  for (const p of players) {
    for (const d of p.dice) {
      if (d === face || (!palifico && face !== 1 && d === 1)) count += 1
    }
  }
  return count
}

/**
 * Légalité d'une surenchère (règles Perudo simplifiées V1) :
 * - normal → normal : quantité qui monte, OU même quantité + face supérieure ;
 * - normal → aux 1 : quantité ≥ moitié arrondie sup ;
 * - aux 1 → normal : quantité ≥ double + 1 ;
 * - aux 1 → aux 1 : quantité qui monte.
 * Première enchère : libre. Toujours 1 ≤ qty ≤ dés sur la table, face 1-6.
 * En manche Palifico : la première enchère fixe la face pour toute la manche,
 * les suivantes ne peuvent que monter la quantité (face inchangée).
 */
export function isLegalRaise(
  prev: MenteurBid | null,
  qty: number,
  face: number,
  totalDice: number,
  palifico = false
): boolean {
  if (!Number.isInteger(qty) || !Number.isInteger(face)) return false
  if (face < 1 || face > 6) return false
  if (qty < 1 || qty > totalDice) return false
  if (!prev) return true
  if (palifico) return qty > prev.qty && face === prev.face
  if (prev.face === 1 && face === 1) return qty > prev.qty
  if (prev.face === 1 && face > 1) return qty >= prev.qty * 2 + 1
  if (prev.face > 1 && face === 1) return qty >= Math.ceil(prev.qty / 2)
  return qty > prev.qty || (qty === prev.qty && face > prev.face)
}

function rollDice(rng: SeededRng, count: number): number[] {
  const dice: number[] = []
  for (let i = 0; i < count; i += 1) dice.push(rng.int(1, 6))
  return dice
}

/**
 * Millisecondes écoulées depuis l'entrée en révélation. Un état sérialisé
 * AVANT l'horodatage (revealAt absent) est traité comme déjà lisible : on ne
 * bloque jamais une partie en cours.
 */
export function menteurRevealElapsedMs(state: MenteurState, now: number): number {
  if (state.revealAt == null) return Number.POSITIVE_INFINITY
  return now - state.revealAt
}

/**
 * Un humain non parti est assis à table, vivant ou éliminé (il regarde la
 * révélation). Prend aussi les joueurs de la vue client : MenteurOnline et le
 * filet serveur calculent le délai du bot sur la même règle que le moteur.
 */
export function menteurHumanSeated(players: readonly Pick<MenteurPlayer, 'isBot' | 'leftAt'>[]): boolean {
  return players.some((p) => !p.isBot && !p.leftAt)
}

/** Une manche Palifico débute quand un joueur vivant n'a plus qu'un dé. */
function computePalifico(players: MenteurPlayer[], rulePalifico: boolean): boolean {
  return rulePalifico && players.some((p) => p.dice.length === 1)
}

/**
 * Le défi qui vient d'être lancé, en faits bruts, ajouté à `duels`. Calculé
 * dans la MÊME réduction que la révélation, sur les dés qu'elle lève, avec
 * le compteur du moteur : la marque de bluff ne réécrit aucune règle.
 */
function withDuel(
  state: MenteurState,
  alive: MenteurPlayer[],
  bid: MenteurBid,
  outcome: Pick<MenteurDuel, 'challengerId' | 'mode' | 'held' | 'loserId'>
): MenteurDuel[] {
  const chain = state.bids ?? []
  const last = chain[chain.length - 1]
  // Une manche commencée avant l'arrivée de la chaîne (état sérialisé plus
  // ancien) n'a pas l'enchère défiée : on la rajoute pour que le duel la porte.
  const sameAsLast = last && last.by === bid.by && last.qty === bid.qty && last.face === bid.face
  const full = sameAsLast ? chain : [...chain, bid]
  const bids = full.map((b) => {
    const author = alive.filter((p) => p.id === b.by)
    return { ...b, bluff: author.length > 0 && countMatches(author, b.face, state.palifico) === 0 }
  })
  return [...(state.duels ?? []), { round: state.round, bidderId: bid.by, ...outcome, bids }]
}

/**
 * Le fil après un coup qui porte `say`, ou tel quel sans parole. Validé dans
 * la réduction du coup lui-même : un kind hors de ceux du coup (une réaction
 * de révélation comprise), une cible autre que celle que le coup désigne, ou
 * un plafond atteint refusent le COUP entier — le cerveau du bot ne propose
 * que des paroles valides, la simulation le vérifie.
 *   • sure / unsure visent le joueur qui doit répondre à l'enchère ;
 *   • ally, suspect, again et exact visent l'enchérisseur précédent ;
 *   • grudge, à l'ouverture seulement, vise un autre joueur en lice.
 */
function withSay(
  state: MenteurState,
  actor: MenteurPlayer,
  type: keyof typeof SAY_KINDS_OF,
  say: MenteurSay | undefined,
  expectedTargetId: string | null
): MenteurSpeech[] {
  if (!say) return state.speech ?? []
  if (!SAY_KINDS_OF[type].includes(say.kind)) throw new MenteurEngineError('INVALID_KIND')
  const opening = state.currentBid === null
  if ((say.kind === 'grudge' && !opening) || (say.kind === 'ally' && opening)) {
    throw new MenteurEngineError('INVALID_KIND')
  }
  const target = state.players.find((p) => p.id === say.targetId)
  if (!target || target.id === actor.id || !isMenteurAlive(target)) throw new MenteurEngineError('INVALID_TARGET')
  if (say.kind !== 'grudge' && target.id !== expectedTargetId) throw new MenteurEngineError('INVALID_TARGET')
  const speech = state.speech ?? []
  const mine = speech.filter((sp) => sp.playerId === actor.id && sp.round === state.round)
  if (mine.length >= MENTEUR_SPEECH_CAP) throw new MenteurEngineError('ALREADY_SPOKE')
  return [...speech, { playerId: actor.id, kind: say.kind, targetId: target.id, round: state.round }]
}

export type MenteurRules = { palifico?: boolean; calza?: boolean }

// ─── Création ────────────────────────────────────────────────────────────────

export function createMenteurState(
  players: MenteurInitialPlayer[],
  seed: string | number,
  rules: MenteurRules = {}
): MenteurState {
  if (players.length < MENTEUR_MIN_PLAYERS) throw new MenteurEngineError('NOT_ENOUGH_PLAYERS')
  if (players.length > MENTEUR_MAX_PLAYERS) throw new MenteurEngineError('TOO_MANY_PLAYERS')
  const rng = createRng(seed)
  const withDice: MenteurPlayer[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    isBot: Boolean(p.isBot),
    leftAt: null,
    dice: rollDice(rng, MENTEUR_START_DICE),
    lostCount: 0,
  }))
  const rulePalifico = Boolean(rules.palifico)
  return {
    version: 1,
    phase: 'bidding',
    players: withDice,
    turnIdx: rng.pickIndex(withDice.length),
    currentBid: null,
    lastReveal: null,
    round: 1,
    winnerId: null,
    rematchVotes: [],
    rngState: rng.getState(),
    rulePalifico,
    ruleCalza: Boolean(rules.calza),
    revealAt: null,
    palifico: computePalifico(withDice, rulePalifico),
    bids: [],
    duels: [],
    speech: [],
  }
}

// ─── Réducteur ───────────────────────────────────────────────────────────────

export function reduceMenteur(state: MenteurState, action: MenteurAction): MenteurState {
  switch (action.type) {
    case 'BID': {
      if (state.phase !== 'bidding') throw new MenteurEngineError('NOT_BIDDING')
      const actor = state.players[state.turnIdx]
      if (actor.id !== action.playerId) throw new MenteurEngineError('NOT_YOUR_TURN')
      if (!isLegalRaise(state.currentBid, action.qty, action.face, menteurTotalDice(state), state.palifico)) {
        throw new MenteurEngineError('ILLEGAL_BID')
      }
      const bid: MenteurBid = { qty: action.qty, face: action.face, by: actor.id }
      const turnIdx = nextAliveIdx(state, state.turnIdx)
      // sure / unsure parlent au joueur qui doit répondre ; ally à celui qu'on suit.
      const answers = action.say?.kind === 'ally' ? (state.currentBid?.by ?? null) : state.players[turnIdx].id
      return {
        ...state,
        currentBid: bid,
        bids: [...(state.bids ?? []), bid],
        speech: withSay(state, actor, 'BID', action.say, answers),
        turnIdx,
        version: state.version + 1,
      }
    }

    case 'DUDO': {
      if (state.phase !== 'bidding') throw new MenteurEngineError('NOT_BIDDING')
      const actor = state.players[state.turnIdx]
      if (actor.id !== action.playerId) throw new MenteurEngineError('NOT_YOUR_TURN')
      const bid = state.currentBid
      if (!bid) throw new MenteurEngineError('NO_BID_TO_CHALLENGE')
      const speech = withSay(state, actor, 'DUDO', action.say, bid.by)

      const alive = menteurAlivePlayers(state)
      const matchCount = countMatches(alive, bid.face, state.palifico)
      const bidHeld = matchCount >= bid.qty
      const loserId = bidHeld ? actor.id : bid.by
      const allDice = alive.map((p) => ({ playerId: p.id, dice: [...p.dice] }))

      let eliminatedId: string | null = null
      let sips = 0
      const players = state.players.map((p) => {
        if (p.id !== loserId) return p
        const dice = p.dice.slice(0, -1)
        const lostCount = p.lostCount + 1
        sips = lostCount
        if (dice.length === 0) eliminatedId = p.id
        return { ...p, dice, lostCount }
      })

      return {
        ...state,
        players,
        phase: 'reveal',
        revealAt: action.now,
        lastReveal: {
          bid,
          challengerId: actor.id,
          allDice,
          matchCount,
          bidHeld,
          loserId,
          sips,
          eliminatedId,
          mode: 'dudo',
          gainedId: null,
        },
        duels: withDuel(state, alive, bid, { challengerId: actor.id, mode: 'dudo', held: bidHeld, loserId }),
        speech,
        version: state.version + 1,
      }
    }

    case 'CALZA': {
      if (state.phase !== 'bidding') throw new MenteurEngineError('NOT_BIDDING')
      if (!state.ruleCalza) throw new MenteurEngineError('CALZA_DISABLED')
      const actor = state.players[state.turnIdx]
      if (actor.id !== action.playerId) throw new MenteurEngineError('NOT_YOUR_TURN')
      const bid = state.currentBid
      if (!bid) throw new MenteurEngineError('NO_BID_TO_CHALLENGE')
      const speech = withSay(state, actor, 'CALZA', action.say, bid.by)

      const alive = menteurAlivePlayers(state)
      const matchCount = countMatches(alive, bid.face, state.palifico)
      const exact = matchCount === bid.qty
      const allDice = alive.map((p) => ({ playerId: p.id, dice: [...p.dice] }))

      if (exact) {
        // Pari gagné : le joueur regagne un dé (plafonné au départ), rien à boire.
        const rng = rngFromState(state.rngState)
        let gainedId: string | null = null
        const players = state.players.map((p) => {
          if (p.id !== actor.id || p.dice.length >= MENTEUR_START_DICE) return p
          gainedId = p.id
          return { ...p, dice: [...p.dice, rng.int(1, 6)] }
        })
        return {
          ...state,
          players,
          phase: 'reveal',
          revealAt: action.now,
          lastReveal: {
            bid,
            challengerId: actor.id,
            allDice,
            matchCount,
            bidHeld: true,
            loserId: null,
            sips: 0,
            eliminatedId: null,
            mode: 'calza',
            gainedId,
          },
          duels: withDuel(state, alive, bid, { challengerId: actor.id, mode: 'calza', held: true, loserId: null }),
          speech,
          rngState: rng.getState(),
          version: state.version + 1,
        }
      }

      // Pari raté : le joueur perd un dé, comme un DUDO manqué contre lui-même.
      let eliminatedId: string | null = null
      let sips = 0
      const players = state.players.map((p) => {
        if (p.id !== actor.id) return p
        const dice = p.dice.slice(0, -1)
        const lostCount = p.lostCount + 1
        sips = lostCount
        if (dice.length === 0) eliminatedId = p.id
        return { ...p, dice, lostCount }
      })

      return {
        ...state,
        players,
        phase: 'reveal',
        revealAt: action.now,
        lastReveal: {
          bid,
          challengerId: actor.id,
          allDice,
          matchCount,
          bidHeld: matchCount >= bid.qty,
          loserId: actor.id,
          sips,
          eliminatedId,
          mode: 'calza',
          gainedId: null,
        },
        duels: withDuel(state, alive, bid, {
          challengerId: actor.id,
          mode: 'calza',
          held: matchCount >= bid.qty,
          loserId: actor.id,
        }),
        speech,
        version: state.version + 1,
      }
    }

    case 'CONTINUE': {
      if (state.phase !== 'reveal') throw new MenteurEngineError('NOT_REVEAL')
      const asker = state.players.find((p) => p.id === action.playerId)
      if (!asker) throw new MenteurEngineError('UNKNOWN_PLAYER')
      const mustRead = !asker.isBot || menteurHumanSeated(state.players)
      if (mustRead && menteurRevealElapsedMs(state, action.now) < MENTEUR_REVEAL_MIN_MS) {
        throw new MenteurEngineError('READING_TIME')
      }
      const alive = menteurAlivePlayers(state)
      // Le fil ne garde que la manche qui s'achève : jamais plus de deux manches.
      const speech = (state.speech ?? []).filter((sp) => sp.round === state.round)
      if (alive.length <= 1) {
        return {
          ...state,
          phase: 'finished',
          revealAt: null,
          winnerId: alive[0]?.id ?? null,
          currentBid: null,
          bids: [],
          speech,
          version: state.version + 1,
        }
      }
      // Nouvelle manche : tout le monde relance ses dés (RNG seedé), et le
      // perdant du défi rouvre les enchères (s'il est éliminé, ou en cas de
      // Calza réussi sans perdant : le joueur central du défi ; sinon le suivant).
      const rng = rngFromState(state.rngState)
      const players = state.players.map((p) =>
        isMenteurAlive(p) ? { ...p, dice: rollDice(rng, p.dice.length) } : p
      )
      const leaderId = state.lastReveal?.loserId ?? state.lastReveal?.challengerId
      const leaderIdx = state.players.findIndex((p) => p.id === leaderId)
      const base: MenteurState = { ...state, players }
      const turnIdx =
        leaderIdx >= 0 && isMenteurAlive(players[leaderIdx])
          ? leaderIdx
          : nextAliveIdx(base, Math.max(0, leaderIdx))
      return {
        ...base,
        phase: 'bidding',
        revealAt: null,
        turnIdx,
        currentBid: null,
        bids: [],
        speech,
        lastReveal: null,
        round: state.round + 1,
        rngState: rng.getState(),
        palifico: computePalifico(players, state.rulePalifico),
        version: state.version + 1,
      }
    }

    case 'LEAVE': {
      if (state.phase === 'finished') throw new MenteurEngineError('GAME_FINISHED')
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.isBot) throw new MenteurEngineError('UNKNOWN_PLAYER')
      if (player.leftAt) return state
      const players = state.players.map((p) =>
        p.id === action.playerId ? { ...p, leftAt: action.at } : p
      )
      const next: MenteurState = { ...state, players, version: state.version + 1 }
      // Le partant garde ses dés (il peut revenir, ou finir en bot). Mais
      // l'état du Menteur n'a AUCUNE horloge de phase : s'il tenait les
      // enchères, la table resterait figée jusqu'au remplacement automatique
      // (plusieurs minutes). On rend donc la main tout de suite au suivant
      // encore en lice, en sautant au passage les autres partants.
      // (`isMenteurAlive` garantit au passage qu'un suivant existe : au pire
      // nextAliveIdx revient sur le partant lui-même, jamais NO_ALIVE_PLAYER.)
      if (
        state.phase !== 'bidding' ||
        players[state.turnIdx]?.id !== action.playerId ||
        !isMenteurAlive(player)
      ) {
        return next
      }
      let turnIdx = nextAliveIdx(next, state.turnIdx)
      for (let step = 0; step < players.length && players[turnIdx].leftAt; step += 1) {
        const after = nextAliveIdx(next, turnIdx)
        if (after === turnIdx) break // plus qu'un seul vivant : on lui laisse la main
        turnIdx = after
      }
      return { ...next, turnIdx }
    }

    case 'REJOIN': {
      // Le revenant a PERDU son tour, et c'est volontaire : LEAVE a rendu la
      // main au suivant, la table a continué de jouer (une enchère a pu
      // tomber). Ramener le tour en arrière écraserait ce qui s'est passé
      // entre-temps et permettrait de « rejouer » un tour en partant/revenant.
      // On ne restaure donc QUE sa présence : ses dés, eux, ne l'ont jamais
      // quitté (LEAVE ne touche pas aux gobelets), l'état reste cohérent.
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.isBot || !player.leftAt) throw new MenteurEngineError('CANNOT_REJOIN')
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.playerId ? { ...p, leftAt: null } : p
        ),
        version: state.version + 1,
      }
    }

    case 'REPLACE_LEFT': {
      const expired = state.players.filter(
        (p) => !p.isBot && p.leftAt && action.now - p.leftAt >= action.graceMs
      )
      if (expired.length === 0) throw new MenteurEngineError('NOTHING_TO_REPLACE')
      const ids = new Set(expired.map((p) => p.id))
      return {
        ...state,
        players: state.players.map((p) =>
          ids.has(p.id) ? { ...p, isBot: true, leftAt: null } : p
        ),
        version: state.version + 1,
      }
    }

    default: {
      const exhaustive: never = action
      throw new MenteurEngineError(`UNKNOWN_ACTION_${String((exhaustive as { type?: string }).type)}`)
    }
  }
}

// ─── Acteur courant (tour, AFK, bots) ────────────────────────────────────────

/**
 * Joueur « au tour » : l'enchérisseur pendant les enchères ; pendant la
 * révélation, le PERDANT mène le « continuer » (s'il est éliminé : le joueur
 * vivant suivant) — cela donne une cible aux ticks bot/AFK à chaque phase.
 */
export function currentMenteurActorId(state: MenteurState): string | null {
  if (state.phase === 'bidding') return state.players[state.turnIdx]?.id ?? null
  if (state.phase === 'reveal') {
    const loserIdx = state.players.findIndex((p) => p.id === state.lastReveal?.loserId)
    if (loserIdx >= 0 && isMenteurAlive(state.players[loserIdx])) {
      return state.players[loserIdx].id
    }
    const alive = menteurAlivePlayers(state)
    return alive[0]?.id ?? null
  }
  return null
}

// ─── Vues anti-triche ────────────────────────────────────────────────────────

export type MenteurPlayerView = Omit<MenteurPlayer, 'dice'> & {
  /** Ses propres dés uniquement (vide pour les autres). */
  dice: number[]
  diceCount: number
  /**
   * GORGÉES réellement bues depuis le début de la partie — le SEUL nombre à
   * mettre derrière une chope. `lostCount` compte les dés, et l'addition
   * grimpe (1 + 2 + 3…) : afficher `lostCount` annonçait 3 gorgées à un
   * joueur qui en avait bu 6 (F35).
   */
  sipsTotal: number
}

/** Total bu après `lostCount` dés perdus : 1 + 2 + … + n. */
export function menteurSipsTotal(lostCount: number): number {
  return (lostCount * (lostCount + 1)) / 2
}

export type MenteurClientView = Omit<MenteurState, 'rngState' | 'players'> & {
  players: MenteurPlayerView[]
}

/** Vue PAR JOUEUR : ses dés visibles, ceux des autres réduits à un compte. */
export function toMenteurClientView(state: MenteurState, viewerId: string): MenteurClientView {
  const { rngState: _rng, players, ...rest } = state
  void _rng
  return {
    ...rest,
    players: players.map((p) => ({
      ...p,
      dice: p.id === viewerId ? [...p.dice] : [],
      diceCount: p.dice.length,
      sipsTotal: menteurSipsTotal(p.lostCount),
    })),
  }
}

/** Vue SPECTATEUR NEUTRE (TV) : aucun gobelet ouvert hors révélations. */
export function toMenteurSpectatorView(state: MenteurState): MenteurClientView {
  return toMenteurClientView(state, '')
}
