import { createRng, type RngState, type SeededRng } from '@/lib/petit-buveur/rng'
import { checkAdvance, enterPhase, phaseKey, type TimedPhaseState } from '@/lib/online/phase-clock'
import type { BotSpeech } from '@/lib/online/bot-speech'

/**
 * L'IMPOSTEUR (Undercover apéro) — moteur PUR, serveur-autoritaire.
 *
 * Une paire de mots PROCHES est tirée (ex. plage/piscine) : les civils
 * reçoivent l'un, le ou les imposteurs l'autre. PERSONNE ne connaît son camp —
 * chacun ne voit que « son » mot. À chaque manche : un indice chacun (texte
 * court, chronométré), puis vote secret simultané, puis révélation du voté
 * (son mot + son camp). Village gagne quand tous les imposteurs sont sortis ;
 * un imposteur gagne s'il atteint les 3 derniers.
 *
 * Phases chronométrées via src/lib/online/phase-clock.ts : le serveur pose
 * `phaseEndsAt`, les clients affichent le compte à rebours et envoient un
 * `ADVANCE` à l'échéance — validé par l'horloge SERVEUR uniquement.
 */

export const IMPOSTEUR_MIN_PLAYERS = 3
export const IMPOSTEUR_MAX_PLAYERS = 16
/** Compte à rebours d'échauffement au lancement (5… 4… 3… 2… 1…). */
export const IMPOSTEUR_COUNTDOWN_MS = 5_000
/** Temps pour donner SON indice. */
export const IMPOSTEUR_CLUE_MS = 45_000
/** Temps pour voter (les retardataires s'abstiennent). */
export const IMPOSTEUR_VOTE_MS = 60_000
/**
 * Durée d'affichage de la révélation (mot + camp de l'éliminé). L'horloge
 * serveur enchaîne d'elle-même : la table ne dépend plus du seul « premier
 * vivant » pour repartir. Calée sur la durée du vote — c'est l'échéance du
 * pire cas (personne ne clique), pas le rythme normal : en pratique le
 * « manche suivante » tombe bien avant.
 */
export const IMPOSTEUR_REVEAL_MS = IMPOSTEUR_VOTE_MS
/**
 * TEMPS DE LECTURE MINIMAL de la révélation : le premier impatient ne peut
 * plus escamoter le mot et le camp de l'éliminé pour toute la table (F33).
 */
export const IMPOSTEUR_REVEAL_MIN_MS = 4_000
/** Longueur maximale d'un indice. */
export const IMPOSTEUR_CLUE_MAX_LEN = 30
/** Indice automatique d'un joueur muet (timeout ou bot). */
export const IMPOSTEUR_EMPTY_CLUE = '…'
/** Gorgées : civil éliminé à tort. */
export const IMPOSTEUR_SIPS_CIVIL_OUT = 3
/** Gorgées : imposteur démasqué = 2 × survivants. */
export const IMPOSTEUR_SIPS_PER_ALIVE = 2

export type ImposteurTeam = 'civil' | 'imposteur'

export type ImposteurWordPair = { a: string; b: string }

/** Langues des paires de mots (= langues de salle). */
export const IMPOSTEUR_LANGS = ['fr', 'en', 'es', 'it'] as const
export type ImposteurLang = (typeof IMPOSTEUR_LANGS)[number]

export type ImposteurPlayer = {
  id: string
  name: string
  isBot: boolean
  leftAt: number | null
  /** SECRET — son mot (seul le joueur le voit). */
  word: string
  /** SECRET ABSOLU — révélé seulement à l'élimination ou en fin de partie. */
  team: ImposteurTeam
  eliminated: boolean
}

export type ImposteurClue = { playerId: string; text: string; round: number }

/** Résultat PUBLIC d'un vote. */
export type ImposteurReveal = {
  round: number
  /** Décompte public par cible (l'identité des votants reste secrète). */
  tally: Record<string, number>
  eliminatedId: string | null
  tie: boolean
  /** Mot + camp de l'éliminé — publics une fois sorti. */
  word: string | null
  team: ImposteurTeam | null
  sips: number
}

export type ImposteurPhase = 'countdown' | 'clue' | 'vote' | 'reveal' | 'finished'

/**
 * Prise de parole PUBLIQUE, des bots et des humains (boutons Accuser / Me
 * défendre), structurée pour être localisée côté client (`botSay.<kind>`
 * sous games.imposteur.game). Mêmes sens qu'au Loup-Garou pour les kinds
 * partagés — c'est ce qui permet le score de soupçon commun (speechSuspicion)
 * —, plus `intent` (« je vote X », annoncé avant le vote groupé des bots).
 * `toldYou` / `wrong` sont les remarques d'ouverture sur l'éliminé de la
 * manche d'avant : les seules paroles qui visent un éliminé. Toute parole a
 * une cible : chaque phrase du catalogue la nomme.
 */
export type ImposteurSpeechKind =
  | 'suspect'
  | 'defend'
  | 'ally'
  | 'rally'
  | 'doubt'
  | 'ask'
  | 'intent'
  | 'toldYou'
  | 'wrong'
export type ImposteurSpeech = BotSpeech<ImposteurSpeechKind>

export const IMPOSTEUR_SPEECH_KINDS = [
  'suspect',
  'defend',
  'ally',
  'rally',
  'doubt',
  'ask',
  'intent',
  'toldYou',
  'wrong',
] as const satisfies readonly ImposteurSpeechKind[]
/** Phases où l'on parle : pendant les indices et pendant le vote. */
export const IMPOSTEUR_SPEAK_PHASES = ['clue', 'vote'] as const satisfies readonly ImposteurPhase[]
/**
 * Paroles max par joueur et par manche : pour un bot, une annonce de vote et
 * deux paroles (son bavardage borne celles-ci) ; un humain dispose des trois.
 */
export const IMPOSTEUR_SPEECH_CAP = 3
/** Remarques d'ouverture : les seules paroles tolérées vers un éliminé. */
export const IMPOSTEUR_REMARK_KINDS = ['toldYou', 'wrong'] as const satisfies readonly ImposteurSpeechKind[]
/** Paroles qu'un HUMAIN peut émettre par les boutons (le reste est réservé aux bots). */
export const IMPOSTEUR_HUMAN_SPEAK_KINDS = ['suspect', 'defend'] as const satisfies readonly ImposteurSpeechKind[]
export type ImposteurHumanSpeakKind = (typeof IMPOSTEUR_HUMAN_SPEAK_KINDS)[number]
/** Annonces de vote max par manche : au-delà, le fil ne serait plus qu'une liste de votes. */
export const IMPOSTEUR_INTENTS_MAX = 4
/**
 * Sous ce temps de vote restant, les bots votent sans plus parler : l'échéance
 * ne doit jamais les trouver en train d'annoncer (ils s'abstiendraient).
 */
export const IMPOSTEUR_BOT_VOTE_MARGIN_MS = 15_000

export function isImposteurRemark(kind: ImposteurSpeechKind): boolean {
  return (IMPOSTEUR_REMARK_KINDS as readonly string[]).includes(kind)
}

/**
 * L'indice qu'une bulle cite de sa cible (`{clue}` de suspect / ally / rally) :
 * son dernier indice donné à la manche de la parole ou avant. Accusée avant
 * d'avoir parlé, la cible l'est sur sa manche passée — citer « … » ferait
 * croire à la table qu'elle s'est tue. « … » seulement si elle n'a encore rien dit.
 */
export function imposteurCitedClue(
  clues: readonly ImposteurClue[],
  targetId: string | null,
  round: number
): string {
  for (let i = clues.length - 1; i >= 0; i -= 1) {
    const clue = clues[i]
    if (clue.playerId === targetId && clue.round <= round) return clue.text
  }
  return IMPOSTEUR_EMPTY_CLUE
}

export type ImposteurState = TimedPhaseState & {
  version: number
  phase: ImposteurPhase
  players: ImposteurPlayer[]
  /** Ordre de parole de la manche courante (vivants uniquement). */
  clueOrder: string[]
  clueTurnIdx: number
  /** Indices PUBLICS (toutes manches). */
  clues: ImposteurClue[]
  /** SECRET — votes en cours (voterId → targetId). */
  pendingVotes: Record<string, string>
  lastReveal: ImposteurReveal | null
  /**
   * Révélation de la manche d'AVANT (public : décompte, éliminé, mot, camp —
   * déjà annoncés). `lastReveal` est vidé à l'ouverture de chaque manche :
   * sans cette copie, ni la table ni les bots ne se souviendraient de qui
   * avait été voté. Optionnelle : absente des parties lancées avant le champ.
   */
  previousReveal?: ImposteurReveal | null
  round: number
  winnerTeam: ImposteurTeam | null
  rematchVotes: string[]
  /** Nombre d'imposteurs de la partie (choix hôte ou défaut, figé au lancement). */
  imposteurCount: number
  /**
   * Langue de la paire tirée (public). Optionnelle : les parties lancées avant
   * ce champ sont lues comme françaises (parseImposteurState). Elle indexe le
   * catalogue d'indices des bots côté serveur — la paire elle-même n'est pas
   * stockée, elle se déduit des deux mots distincts de `players`.
   */
  lang?: ImposteurLang
  /**
   * Paroles PUBLIQUES de la manche courante et de celle d'avant (élaguées à
   * l'ouverture de chaque manche : les remarques d'ouverture lisent la
   * précédente). Optionnelle : absente des parties lancées avant le champ.
   */
  speech?: ImposteurSpeech[]
  /** SECRET serveur. */
  rngState: RngState
}

export type ImposteurAction =
  | { type: 'CLUE'; playerId: string; text: string; now: number }
  | { type: 'VOTE'; playerId: string; targetId: string; now: number }
  | { type: 'ADVANCE'; claimedKey: string; now: number }
  | { type: 'CONTINUE'; playerId: string; now: number }
  | { type: 'SPEAK'; playerId: string; kind: ImposteurSpeechKind; targetId: string }
  | { type: 'LEAVE'; playerId: string; at: number }
  | { type: 'REJOIN'; playerId: string }
  | { type: 'REPLACE_LEFT'; now: number; graceMs: number }

export class ImposteurEngineError extends Error {
  constructor(code: string) {
    super(code)
    this.name = 'ImposteurEngineError'
  }
}

export type ImposteurInitialPlayer = { id: string; name: string; isBot?: boolean }

// ─── Helpers ─────────────────────────────────────────────────────────────────

export function imposteurAlive(state: ImposteurState): ImposteurPlayer[] {
  return state.players.filter((p) => !p.eliminated)
}

export function imposteurCountFor(playerCount: number): number {
  return playerCount >= 7 ? 2 : 1
}

/** Plafond UI : au-delà, le camp imposteur devient trop dur à masquer. */
export const IMPOSTEUR_MAX_COUNT = 3

/**
 * Nombre maximum d'imposteurs autorisé pour une table donnée : toujours
 * minoritaires (strictement moins de la moitié), et plafonné à IMPOSTEUR_MAX_COUNT.
 */
export function maxImposteurCount(playerCount: number): number {
  return Math.min(IMPOSTEUR_MAX_COUNT, Math.max(1, Math.floor((playerCount - 1) / 2)))
}

/**
 * Caractères qui ne s'affichent pas (espace de largeur nulle, contrôles bidi,
 * sélecteurs de variante, remplissages hangul…) : « pisc\u200bine » s'affiche
 * « piscine » mais ne contenait plus le mot pour la comparaison.
 */
const INVISIBLE_RE = /[\p{Cf}\p{Default_Ignorable_Code_Point}]/gu

/**
 * Lettres cyrilliques et grecques qui se lisent comme des lettres latines :
 * « pіscine » (і cyrillique) passait pour un autre mot que « piscine ».
 */
const LATIN_LOOKALIKES: Record<string, string> = {
  а: 'a', в: 'b', г: 'r', е: 'e', і: 'i', ј: 'j', к: 'k', м: 'm', н: 'h', о: 'o', п: 'n', р: 'p',
  с: 'c', т: 't', у: 'y', х: 'x', ь: 'b', ѕ: 's', һ: 'h', ԁ: 'd', ԛ: 'q', ԝ: 'w', ӏ: 'l',
  А: 'a', В: 'b', Е: 'e', І: 'i', Ј: 'j', К: 'k', М: 'm', Н: 'h', О: 'o', Р: 'p', С: 'c', Т: 't',
  У: 'y', Х: 'x', Ѕ: 's', Һ: 'h', Ԁ: 'd', Ԛ: 'q', Ԝ: 'w', Ӏ: 'l',
  α: 'a', β: 'b', ε: 'e', ζ: 'z', η: 'n', ι: 'i', κ: 'k', μ: 'u', ν: 'v', ο: 'o', ρ: 'p', τ: 't',
  υ: 'u', χ: 'x', ω: 'w',
  Α: 'a', Β: 'b', Ε: 'e', Ζ: 'z', Η: 'h', Ι: 'i', Κ: 'k', Μ: 'm', Ν: 'n', Ο: 'o', Ρ: 'p', Τ: 't',
  Υ: 'y', Χ: 'x',
  ı: 'i', ɑ: 'a', ɡ: 'g',
}

/**
 * Normalisation permissive pour la validation — et pour comparer deux indices
 * entre eux (« Été » = « ete ») : formes de compatibilité (NFKD : pleine
 * chasse, lettres mathématiques), accents et invisibles retirés, sosies
 * cyrilliques et grecs ramenés au latin, minuscules.
 */
export function normalizeClue(text: string): string {
  let folded = ''
  for (const ch of text.normalize('NFKD').replace(/\p{M}/gu, '').replace(INVISIBLE_RE, '')) {
    folded += LATIN_LOOKALIKES[ch] ?? ch
  }
  return folded.toLowerCase().trim()
}

/**
 * Le texte d'un indice tel qu'il est gardé et affiché : sans caractère de
 * format (un contrôle bidi retournait l'affichage, « \u202eenicsip » se
 * lisait « piscine »). Le liant U+200D reste, il compose les émojis.
 */
export function cleanImposteurClue(text: string): string {
  return text.replace(/\p{Cf}/gu, (ch) => (ch === '\u200d' ? ch : '')).trim()
}

/**
 * Un indice est valide s'il est non vide, court, et ne trahit pas son propre
 * mot : interdit s'il CONTIENT le mot (« piscines » pour « piscine ») ou s'il
 * en est un fragment parlant (≥ 3 lettres : « pisc ») — les tout petits mots
 * accidentels (« la » pour « plage ») restent permis. « … » toujours accepté.
 */
/**
 * Indice « vide » : rien que des points (« … », « ... », « . . . »). Réservé
 * à l'indice automatique (échéance, bot sans catalogue) ; un humain ne s'en
 * sert pas pour passer son tour sur-le-champ.
 */
export function isEmptyClueText(text: string): boolean {
  return /^[.…]+$/u.test(text.normalize('NFKC').replace(/\s+/gu, '').replace(INVISIBLE_RE, ''))
}

export function isValidClue(text: string, ownWord: string): boolean {
  const trimmed = text.trim()
  if (trimmed === IMPOSTEUR_EMPTY_CLUE) return true
  if (trimmed.length < 1 || trimmed.length > IMPOSTEUR_CLUE_MAX_LEN) return false
  const clue = normalizeClue(trimmed)
  const word = normalizeClue(ownWord)
  if (clue.length === 0 || word.length === 0) return clue.length > 0
  if (clue.includes(word)) return false
  return !(clue.length >= 3 && word.includes(clue))
}

// ─── Création ────────────────────────────────────────────────────────────────

export function createImposteurState(
  players: ImposteurInitialPlayer[],
  pairs: ImposteurWordPair[],
  seed: string | number,
  now: number = Date.now(),
  imposteurCount?: number,
  lang: ImposteurLang = 'fr'
): ImposteurState {
  if (players.length < IMPOSTEUR_MIN_PLAYERS) throw new ImposteurEngineError('NOT_ENOUGH_PLAYERS')
  if (players.length > IMPOSTEUR_MAX_PLAYERS) throw new ImposteurEngineError('TOO_MANY_PLAYERS')
  if (pairs.length === 0) throw new ImposteurEngineError('NO_WORD_PAIRS')

  const count = imposteurCount ?? imposteurCountFor(players.length)
  if (!Number.isInteger(count) || count < 1 || count > maxImposteurCount(players.length)) {
    throw new ImposteurEngineError('INVALID_IMPOSTEUR_COUNT')
  }

  const rng: SeededRng = createRng(seed)
  const pair = pairs[rng.pickIndex(pairs.length)]
  // Quel côté de la paire est « civil » : aléatoire (le mot ne trahit rien).
  const [civilWord, imposteurWord] = rng.chance(0.5) ? [pair.a, pair.b] : [pair.b, pair.a]

  const shuffledIds = rng.shuffle(players.map((p) => p.id))
  const imposteurIds = new Set(shuffledIds.slice(0, count))

  const withRoles: ImposteurPlayer[] = players.map((p) => ({
    id: p.id,
    name: p.name,
    isBot: Boolean(p.isBot),
    leftAt: null,
    word: imposteurIds.has(p.id) ? imposteurWord : civilWord,
    team: imposteurIds.has(p.id) ? 'imposteur' : 'civil',
    eliminated: false,
  }))

  const clueOrder = rng.shuffle(withRoles.map((p) => p.id))

  return {
    version: 1,
    // La partie s'ouvre sur un compte à rebours : chacun découvre son mot
    // calmement avant que le chrono du premier indice ne démarre.
    ...enterPhase(0, 'countdown', IMPOSTEUR_COUNTDOWN_MS, now),
    phase: 'countdown',
    players: withRoles,
    clueOrder,
    clueTurnIdx: 0,
    clues: [],
    pendingVotes: {},
    lastReveal: null,
    previousReveal: null,
    round: 1,
    winnerTeam: null,
    rematchVotes: [],
    imposteurCount: count,
    lang,
    speech: [],
    rngState: rng.getState(),
  }
}

// ─── Transitions internes ────────────────────────────────────────────────────

/** Enregistre l'indice de l'acteur courant puis avance (ou passe au vote). */
function pushClueAndAdvance(state: ImposteurState, text: string, now: number): ImposteurState {
  const actorId = state.clueOrder[state.clueTurnIdx]
  const clues = [...state.clues, { playerId: actorId, text: text.trim(), round: state.round }]
  const nextIdx = state.clueTurnIdx + 1
  if (nextIdx < state.clueOrder.length) {
    return {
      ...state,
      clues,
      clueTurnIdx: nextIdx,
      ...enterPhase(state.phaseSeq, 'clue', IMPOSTEUR_CLUE_MS, now),
      phase: 'clue',
      version: state.version + 1,
    }
  }
  // Tout le monde a parlé → vote secret simultané.
  return {
    ...state,
    clues,
    clueTurnIdx: nextIdx,
    pendingVotes: {},
    ...enterPhase(state.phaseSeq, 'vote', IMPOSTEUR_VOTE_MS, now),
    phase: 'vote',
    version: state.version + 1,
  }
}

/** Dépouille les votes courants → révélation (élimination ou égalité). */
function resolveVotes(state: ImposteurState, now: number): ImposteurState {
  const tally: Record<string, number> = {}
  for (const targetId of Object.values(state.pendingVotes)) {
    tally[targetId] = (tally[targetId] ?? 0) + 1
  }

  let eliminatedId: string | null = null
  let tie = false
  let best = 0
  for (const [targetId, count] of Object.entries(tally)) {
    if (count > best) {
      best = count
      eliminatedId = targetId
      tie = false
    } else if (count === best) {
      tie = true
    }
  }
  if (tie || best === 0) eliminatedId = null

  let word: string | null = null
  let team: ImposteurTeam | null = null
  let sips = 0
  let players = state.players
  if (eliminatedId) {
    const target = state.players.find((p) => p.id === eliminatedId)
    if (target) {
      word = target.word
      team = target.team
      players = state.players.map((p) =>
        p.id === eliminatedId ? { ...p, eliminated: true } : p
      )
      const aliveAfter = players.filter((p) => !p.eliminated).length
      // Un bot n'a pas de verre : lui compter des gorgées affichait à la
      // table une pénalité que personne ne boit.
      sips = target.isBot
        ? 0
        : target.team === 'imposteur'
          ? IMPOSTEUR_SIPS_PER_ALIVE * aliveAfter
          : IMPOSTEUR_SIPS_CIVIL_OUT
    }
  }

  return {
    ...state,
    players,
    pendingVotes: {},
    lastReveal: {
      round: state.round,
      tally,
      eliminatedId,
      tie: tie && best > 0,
      word,
      team,
      sips,
    },
    ...enterPhase(state.phaseSeq, 'reveal', IMPOSTEUR_REVEAL_MS, now),
    phase: 'reveal',
    version: state.version + 1,
  }
}

/**
 * Millisecondes écoulées depuis l'entrée en révélation, déduites de
 * l'échéance de phase (l'horloge SERVEUR reste la seule autorité).
 */
export function imposteurRevealElapsedMs(state: ImposteurState, now: number): number {
  if (state.phaseEndsAt === null) return Number.POSITIVE_INFINITY
  return now - (state.phaseEndsAt - IMPOSTEUR_REVEAL_MS)
}

/** Suite de la révélation : fin de partie, ou nouvelle manche d'indices. */
function afterReveal(state: ImposteurState, now: number): ImposteurState {
  const alive = imposteurAlive(state)
  const imposteursAlive = alive.filter((p) => p.team === 'imposteur')
  if (imposteursAlive.length === 0) {
    return {
      ...state,
      phase: 'finished',
      phaseSeq: state.phaseSeq + 1,
      phaseEndsAt: null,
      winnerTeam: 'civil',
      version: state.version + 1,
    }
  }
  // L'imposteur gagne en atteignant les 3 derniers — sauf table de 3
  // joueurs, où la partie DÉMARRE à 3 : il doit y survivre jusqu'à 2.
  // Généralisation à N imposteurs : gagné aussi dès que les imposteurs
  // ne sont plus minoritaires parmi les vivants (parité).
  const imposteurWinAt = state.players.length <= 3 ? 2 : 3
  const civilsAlive = alive.length - imposteursAlive.length
  if (imposteursAlive.length >= civilsAlive || alive.length <= imposteurWinAt) {
    return {
      ...state,
      phase: 'finished',
      phaseSeq: state.phaseSeq + 1,
      phaseEndsAt: null,
      winnerTeam: 'imposteur',
      version: state.version + 1,
    }
  }
  // Nouvelle manche d'indices (ordre = vivants, ordre de table conservé).
  // Le fil ne garde que la manche qui s'achève : jamais plus de deux manches.
  return {
    ...state,
    clueOrder: alive.map((p) => p.id),
    clueTurnIdx: 0,
    pendingVotes: {},
    previousReveal: state.lastReveal,
    lastReveal: null,
    speech: (state.speech ?? []).filter((sp) => sp.round === state.round),
    round: state.round + 1,
    ...enterPhase(state.phaseSeq, 'clue', IMPOSTEUR_CLUE_MS, now),
    phase: 'clue',
    version: state.version + 1,
  }
}

// ─── Réducteur ───────────────────────────────────────────────────────────────

export function reduceImposteur(state: ImposteurState, action: ImposteurAction): ImposteurState {
  switch (action.type) {
    case 'CLUE': {
      if (state.phase !== 'clue') throw new ImposteurEngineError('NOT_CLUE_PHASE')
      const actorId = state.clueOrder[state.clueTurnIdx]
      if (actorId !== action.playerId) throw new ImposteurEngineError('NOT_YOUR_TURN')
      const actor = state.players.find((p) => p.id === actorId)
      if (!actor || actor.eliminated) throw new ImposteurEngineError('ELIMINATED')
      const text = cleanImposteurClue(action.text)
      if (!isValidClue(text, actor.word)) throw new ImposteurEngineError('INVALID_CLUE')
      return pushClueAndAdvance(state, text, action.now)
    }

    case 'VOTE': {
      if (state.phase !== 'vote') throw new ImposteurEngineError('NOT_VOTE_PHASE')
      const voter = state.players.find((p) => p.id === action.playerId)
      if (!voter || voter.eliminated) throw new ImposteurEngineError('CANNOT_VOTE')
      if (state.pendingVotes[voter.id]) throw new ImposteurEngineError('ALREADY_VOTED')
      const target = state.players.find((p) => p.id === action.targetId)
      if (!target || target.eliminated) throw new ImposteurEngineError('INVALID_TARGET')
      if (target.id === voter.id) throw new ImposteurEngineError('CANNOT_VOTE_SELF')
      const pendingVotes = { ...state.pendingVotes, [voter.id]: target.id }
      const next = { ...state, pendingVotes, version: state.version + 1 }
      // Tous les vivants ont voté → dépouillement immédiat.
      const alive = imposteurAlive(state)
      if (alive.every((p) => pendingVotes[p.id])) return resolveVotes(next, action.now)
      return next
    }

    case 'ADVANCE': {
      const check = checkAdvance(state, action.claimedKey, action.now)
      if (!check.ok) throw new ImposteurEngineError(check.error)
      if (state.phase === 'countdown') {
        return {
          ...state,
          ...enterPhase(state.phaseSeq, 'clue', IMPOSTEUR_CLUE_MS, action.now),
          phase: 'clue',
          version: state.version + 1,
        }
      }
      if (state.phase === 'clue') {
        // Le joueur muet donne l'indice automatique « … ».
        return pushClueAndAdvance(state, IMPOSTEUR_EMPTY_CLUE, action.now)
      }
      if (state.phase === 'vote') {
        // Les retardataires s'abstiennent.
        return resolveVotes(state, action.now)
      }
      // L'échéance enchaîne la révélation, même si personne ne clique.
      if (state.phase === 'reveal') return afterReveal(state, action.now)
      throw new ImposteurEngineError('NOTHING_TO_ADVANCE')
    }

    case 'CONTINUE': {
      if (state.phase !== 'reveal') throw new ImposteurEngineError('NOT_REVEAL')
      const asker = state.players.find((p) => p.id === action.playerId)
      if (!asker) throw new ImposteurEngineError('UNKNOWN_PLAYER')
      // Plancher de lecture : sans lui, le premier tap effaçait le mot et le
      // camp de l'éliminé avant que les autres aient pu les lire (F33). Un
      // BOT en est exempt — il ne lit rien, et son tick de service est déjà
      // cadencé côté client.
      if (!asker.isBot && imposteurRevealElapsedMs(state, action.now) < IMPOSTEUR_REVEAL_MIN_MS) {
        throw new ImposteurEngineError('READING_TIME')
      }
      return afterReveal(state, action.now)
    }

    case 'SPEAK': {
      if (!(IMPOSTEUR_SPEAK_PHASES as readonly string[]).includes(state.phase)) {
        throw new ImposteurEngineError('NOT_SPEECH_PHASE')
      }
      if (!(IMPOSTEUR_SPEECH_KINDS as readonly string[]).includes(action.kind)) {
        throw new ImposteurEngineError('INVALID_KIND')
      }
      const actor = state.players.find((p) => p.id === action.playerId)
      if (!actor) throw new ImposteurEngineError('UNKNOWN_PLAYER')
      if (actor.eliminated) throw new ImposteurEngineError('ELIMINATED')
      const target = state.players.find((p) => p.id === action.targetId)
      if (!target || target.id === actor.id) throw new ImposteurEngineError('INVALID_TARGET')
      // Seule une remarque d'ouverture (« je l'avais dit pour X ») vise un éliminé.
      if (target.eliminated && !isImposteurRemark(action.kind)) throw new ImposteurEngineError('INVALID_TARGET')
      const speech = state.speech ?? []
      const mine = speech.filter((sp) => sp.playerId === actor.id && sp.round === state.round)
      if (mine.length >= IMPOSTEUR_SPEECH_CAP) throw new ImposteurEngineError('ALREADY_SPOKE')
      return {
        ...state,
        speech: [...speech, { playerId: actor.id, kind: action.kind, targetId: target.id, round: state.round }],
        version: state.version + 1,
      }
    }

    case 'LEAVE': {
      if (state.phase === 'finished') throw new ImposteurEngineError('GAME_FINISHED')
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.isBot) throw new ImposteurEngineError('UNKNOWN_PLAYER')
      if (player.leftAt) return state
      return {
        ...state,
        players: state.players.map((p) =>
          p.id === action.playerId ? { ...p, leftAt: action.at } : p
        ),
        version: state.version + 1,
      }
    }

    case 'REJOIN': {
      const player = state.players.find((p) => p.id === action.playerId)
      if (!player || player.isBot || !player.leftAt) {
        throw new ImposteurEngineError('CANNOT_REJOIN')
      }
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
      if (expired.length === 0) throw new ImposteurEngineError('NOTHING_TO_REPLACE')
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
      throw new ImposteurEngineError(
        `UNKNOWN_ACTION_${String((exhaustive as { type?: string }).type)}`
      )
    }
  }
}

// ─── Acteur courant (bots / AFK) ─────────────────────────────────────────────

/**
 * Joueur « au tour » : celui qui doit donner son indice ; pendant la
 * révélation, le premier vivant mène le « continuer ». Pendant le VOTE
 * (simultané), il n'y a pas d'acteur unique → null (l'échéance `ADVANCE`
 * remplace l'anti-AFK).
 */
export function currentImposteurActorId(state: ImposteurState): string | null {
  if (state.phase === 'clue') return state.clueOrder[state.clueTurnIdx] ?? null
  if (state.phase === 'reveal') return imposteurAlive(state)[0]?.id ?? null
  return null
}

// ─── Vues anti-triche ────────────────────────────────────────────────────────

export type ImposteurPlayerView = Omit<ImposteurPlayer, 'word' | 'team'> & {
  /** Son propre mot uniquement ('' pour les autres) ; tous révélés à la fin. */
  word: string
  /** null tant que le joueur n'est pas éliminé ni la partie finie. */
  team: ImposteurTeam | null
  hasVoted: boolean
}

export type ImposteurClientView = Omit<
  ImposteurState,
  'rngState' | 'players' | 'pendingVotes'
> & {
  players: ImposteurPlayerView[]
  /** Clé de phase pour les ticks ADVANCE. */
  phaseKey: string
  myVote: string | null
  /** Instant (epoch ms) à partir duquel le « continuer » du reveal est accepté. */
  continueAt: number | null
}

/**
 * Vue PAR JOUEUR : son mot seulement, JAMAIS les camps des vivants (même pas
 * le sien — personne ne sait s'il est l'imposteur !). Les éliminés restent
 * spectateurs NEUTRES (ils peuvent parler au vocal — aucun secret ne doit
 * leur être soufflé). Révélation complète en fin de partie.
 */
export function toImposteurClientView(
  state: ImposteurState,
  viewerId: string
): ImposteurClientView {
  const { rngState: _rng, players, pendingVotes, ...rest } = state
  void _rng
  const finished = state.phase === 'finished'
  return {
    ...rest,
    phaseKey: phaseKey(state),
    myVote: pendingVotes[viewerId] ?? null,
    continueAt:
      state.phase === 'reveal' && state.phaseEndsAt !== null
        ? state.phaseEndsAt - IMPOSTEUR_REVEAL_MS + IMPOSTEUR_REVEAL_MIN_MS
        : null,
    players: players.map((p) => ({
      id: p.id,
      name: p.name,
      isBot: p.isBot,
      leftAt: p.leftAt,
      eliminated: p.eliminated,
      // Mot + camp d'un ÉLIMINÉ : publics (annoncés à sa révélation).
      word: finished || p.id === viewerId || p.eliminated ? p.word : '',
      team: finished || p.eliminated ? p.team : null,
      hasVoted: Boolean(pendingVotes[p.id]),
    })),
  }
}

/** Vue SPECTATEUR NEUTRE (TV) : aucun mot avant la fin. */
export function toImposteurSpectatorView(state: ImposteurState): ImposteurClientView {
  return toImposteurClientView(state, '')
}
