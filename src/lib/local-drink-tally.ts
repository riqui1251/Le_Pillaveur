import { readLocalAmbianceMode } from '@/lib/ambiance-mode'
import {
  LOCAL_DRINKS_EVENT,
  LOCAL_DRINKS_MAX_CORRECTION,
  LOCAL_DRINKS_MAX_PER_PLAY,
  LOCAL_DRINKS_MAX_PLAYS,
  isMeasuredLocalGameId,
  sendLocalGameBeacon,
  type LocalDrinksReport,
} from '@/lib/local-game-beacon'
import { getSafeStorage } from '@/lib/storage'

// ─── Gorgées des parties LOCALES pour le classement de tout le site ──────────
// « Quel jeu fait le plus boire ? » classe les jeux sur TOUS les joueurs. Les
// parties locales n'existent que sur le téléphone de la table : chaque jeu y
// passe en fin de partie par updatePlayerStats (src/lib/players.ts), qui
// appelle noteLocalGameDrinks. On y cumule, par jeu, les gorgées BUES et les
// participations (une partie jouée par un joueur) avec la MÊME règle que les
// statistiques du téléphone (« Chez vous ») : une participation dès que
// `gamesPlayed` est non nul, les gorgées telles que le jeu les passe.
//
// Le 4e paramètre de updatePlayerStats (LocalTallyOptions) écarte ce que le
// classement ne doit pas voir, sans toucher aux statistiques du téléphone :
// - 'skip' : une partie sans gorgée enregistrée (Purple quitté avant la
//   première carte, 1220 avant le premier lancer, course du PMU en mode
//   libre) — compter sa participation ferait baisser la moyenne du jeu ;
// - 'correction' : des gorgées arrivées APRÈS leur partie (paiement des paris
//   du PMU, saisie de l'entracte du Mode Soirée). À la hausse, elles partent
//   même si la participation est déjà partie (relevé `plays: 0`) ; à la
//   baisse, elles annulent une correction ou une partie encore en attente,
//   jamais au-delà : rien de négatif ne part.
//
// Ce qui part : `{ gameId, event: 'drinks', drinks, plays }`, totaux de la
// table — ni joueur, ni pseudo, ni appareil (même envoi que reportLocalGame).
// Rien n'est compté en ambiance « Sans alcool » : les gorgées y deviennent
// des gages, une partie à zéro gorgée fausserait la moyenne.
//
// Quand : après DEUX MINUTES sans nouvelle statistique, au plus dix minutes
// après la première, et tout de suite quand la page se cache ou se ferme.
// Pas quelques secondes : des gorgées arrivent après la partie et partent
// au mieux avec elle ; et la Roue des gorgées note une partie par tour,
// qu'une courte fenêtre enverrait une à une jusqu'à épuiser le quota réseau
// de la route, commun aux lancements et fins de partie.
//
// Gorgées sans participation hors correction (Petit Buveur, qui les note
// tour par tour avant de compter la partie à la victoire) : elles attendent
// la participation de ce jeu, la route refusant un tel relevé. Une partie
// neuve du jeu (beginLocalGameDrinks) les jette — c'étaient celles d'une
// partie abandonnée —, et elles ne survivent pas à DRINK_TALLY_ORPHAN_MAX_AGE_MS.
// Le cumul vit dans le stockage de l'appareil pour survivre à un onglet tué
// en pleine partie.

/** Ce qu'un jeu passe à updatePlayerStats, réduit à ce qui compte ici. */
export type LocalStatsDelta = { gamesPlayed?: number; totalDrinks?: number }

/** 4e paramètre facultatif de updatePlayerStats : voir l'en-tête du module. */
export type LocalTallyOptions = { tally?: 'skip' | 'correction' }

type Entry = {
  /** Gorgées qui ne partent qu'avec une participation. */
  drinks: number
  plays: number
  /** Gorgées de correction, qui partent même sans participation. */
  loose: number
  /** Création de l'entrée (ms) : borne l'attente des gorgées sans participation. */
  at: number
}

type Pending = Record<string, Entry>

export const DRINK_TALLY_STORAGE_KEY = 'lp-local-drink-tally'
export const DRINK_TALLY_SETTLE_MS = 2 * 60 * 1000
export const DRINK_TALLY_MAX_WAIT_MS = 10 * 60 * 1000
/**
 * Gorgées sans participation plus vieilles qu'une soirée : la partie qui les
 * attendait a été abandonnée sans qu'une autre la remplace.
 */
export const DRINK_TALLY_ORPHAN_MAX_AGE_MS = 12 * 60 * 60 * 1000
/**
 * Au-delà, l'entrée stockée est détraquée ou bricolée (une vraie table en
 * cumule quelques dizaines avant l'envoi) : jetée plutôt que de partir en
 * dizaines de relevés.
 */
const PENDING_MAX_PLAYS = 10 * LOCAL_DRINKS_MAX_PLAYS

type TallyStorage = Pick<Storage, 'getItem' | 'setItem' | 'removeItem'>

export type DrinkTallyOptions = {
  send: (report: LocalDrinksReport) => void
  /** Vrai en ambiance « Sans alcool » : rien n'est compté. */
  isSoft: () => boolean
  /** null (navigation privée, stockage refusé) : le cumul reste en mémoire. */
  storage: () => TallyStorage | null
}

export type DrinkTally = {
  note: (gameId: string, stats: LocalStatsDelta, options?: LocalTallyOptions) => void
  /**
   * Une partie NEUVE du jeu commence (pas la reprise d'une sauvegarde) : ce
   * qui est complet part tout de suite, les gorgées sans participation sont
   * jetées.
   */
  begin: (gameId: string) => void
  /** Envoie tout de suite ce qui peut partir. */
  flush: () => void
}

const isFiniteNumber = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value)

function sanitize(value: unknown): Pending {
  const pending: Pending = {}
  if (!value || typeof value !== 'object' || Array.isArray(value)) return pending
  for (const [gameId, raw] of Object.entries(value)) {
    if (!isMeasuredLocalGameId(gameId) || !raw || typeof raw !== 'object') continue
    const { drinks, plays, loose, at } = raw as Record<string, unknown>
    if (!isFiniteNumber(drinks)) continue
    if (typeof plays !== 'number' || !Number.isInteger(plays) || plays < 0 || plays > PENDING_MAX_PLAYS) continue
    pending[gameId] = {
      drinks,
      plays,
      loose: isFiniteNumber(loose) && loose > 0 ? loose : 0,
      // Sans date lisible, des gorgées sans participation sont tenues pour périmées.
      at: isFiniteNumber(at) ? at : 0,
    }
  }
  return pending
}

const isEmpty = (entry: Entry) => entry.plays === 0 && entry.drinks === 0 && entry.loose === 0

/** Retire les gorgées sans participation périmées ; vrai si quelque chose a été retiré. */
function prune(pending: Pending, now: number): boolean {
  let pruned = false
  for (const [gameId, entry] of Object.entries(pending)) {
    if (entry.plays === 0 && now - entry.at > DRINK_TALLY_ORPHAN_MAX_AGE_MS) {
      delete pending[gameId]
      pruned = true
    }
  }
  return pruned
}

function applyCorrection(entry: Entry, delta: number): Entry {
  if (delta > 0) return { ...entry, loose: entry.loose + delta }
  const fromLoose = Math.min(entry.loose, -delta)
  // La partie corrigée est encore en attente : la baisse la corrige. Sinon
  // elle est déjà partie, et un relevé négatif n'existe pas.
  const fromRound = entry.plays >= 1 ? Math.min(Math.max(entry.drinks, 0), -delta - fromLoose) : 0
  return { ...entry, loose: entry.loose - fromLoose, drinks: entry.drinks - fromRound }
}

/**
 * Fabrique un cumul avec sa propre mémoire, testable sans `window`. Le
 * stockage est relu à chaque geste : deux onglets ne s'envoient pas deux
 * fois le même cumul.
 */
export function createDrinkTally({ send, isSoft, storage }: DrinkTallyOptions): DrinkTally {
  let memory: Pending = {}
  let timer: ReturnType<typeof setTimeout> | null = null
  let firstNoteAt: number | null = null

  const read = (): Pending => {
    const store = storage()
    if (!store) return { ...memory }
    try {
      const raw = store.getItem(DRINK_TALLY_STORAGE_KEY)
      return raw ? sanitize(JSON.parse(raw)) : {}
    } catch {
      return {}
    }
  }

  const write = (pending: Pending) => {
    const store = storage()
    if (!store) {
      memory = pending
      return
    }
    try {
      if (Object.keys(pending).length === 0) store.removeItem(DRINK_TALLY_STORAGE_KEY)
      else store.setItem(DRINK_TALLY_STORAGE_KEY, JSON.stringify(pending))
    } catch {
      // Stockage plein : la statistique du téléphone n'a pas pu s'écrire non plus.
    }
  }

  const emit = (report: LocalDrinksReport) => {
    try {
      send(report)
    } catch {
      // Une mesure ne doit jamais casser l'écran qui l'envoie.
    }
  }

  /**
   * Envoie ce qui peut partir d'une entrée. Rend ce qui doit encore attendre
   * (null : plus rien), ou l'entrée elle-même quand rien n'est parti.
   */
  function release(gameId: string, entry: Entry): Entry | null {
    if (entry.plays >= 1) {
      let plays = entry.plays
      let drinks = Math.round(entry.drinks + entry.loose)
      while (plays > 0) {
        const chunkPlays = Math.min(plays, LOCAL_DRINKS_MAX_PLAYS)
        // Un solde négatif ou un excédent au-delà de la borne de la route sont
        // abandonnés avec ce relevé : la route refuserait l'un comme l'autre.
        const chunkDrinks = Math.min(Math.max(drinks, 0), LOCAL_DRINKS_MAX_PER_PLAY * chunkPlays)
        emit({ gameId, event: LOCAL_DRINKS_EVENT, drinks: chunkDrinks, plays: chunkPlays })
        plays -= chunkPlays
        drinks -= chunkDrinks
      }
      return null
    }
    const loose = Math.round(entry.loose)
    if (loose < 1) return entry
    emit({ gameId, event: LOCAL_DRINKS_EVENT, drinks: Math.min(loose, LOCAL_DRINKS_MAX_CORRECTION), plays: 0 })
    const rest = { ...entry, loose: 0 }
    return isEmpty(rest) ? null : rest
  }

  function flush(): void {
    if (timer !== null) clearTimeout(timer)
    timer = null
    firstNoteAt = null
    const pending = read()
    let changed = prune(pending, Date.now())
    for (const [gameId, entry] of Object.entries(pending)) {
      const rest = release(gameId, entry)
      if (rest === entry) continue
      changed = true
      if (rest) pending[gameId] = rest
      else delete pending[gameId]
    }
    if (changed) write(pending)
  }

  function schedule(): void {
    const now = Date.now()
    firstNoteAt ??= now
    const due = Math.min(now + DRINK_TALLY_SETTLE_MS, firstNoteAt + DRINK_TALLY_MAX_WAIT_MS)
    if (timer !== null) clearTimeout(timer)
    timer = setTimeout(flush, Math.max(0, due - now))
  }

  function note(gameId: string, stats: LocalStatsDelta, options: LocalTallyOptions = {}): void {
    if (options.tally === 'skip' || !isMeasuredLocalGameId(gameId) || isSoft()) return
    const correction = options.tally === 'correction'
    // Même règle que updatePlayerStats : `gamesPlayed` absent ou nul n'ajoute
    // pas de partie. Une correction n'en ajoute jamais.
    const plays = !correction && stats.gamesPlayed ? 1 : 0
    const drinks = isFiniteNumber(stats.totalDrinks) ? stats.totalDrinks : 0
    if (plays === 0 && drinks === 0) return
    const now = Date.now()
    const pending = read()
    prune(pending, now)
    const entry = pending[gameId] ?? { drinks: 0, plays: 0, loose: 0, at: now }
    const next = correction
      ? applyCorrection(entry, drinks)
      : { ...entry, drinks: entry.drinks + drinks, plays: entry.plays + plays }
    if (next.drinks === entry.drinks && next.plays === entry.plays && next.loose === entry.loose) return
    if (isEmpty(next)) delete pending[gameId]
    else pending[gameId] = next
    write(pending)
    schedule()
  }

  function begin(gameId: string): void {
    if (!isMeasuredLocalGameId(gameId)) return
    const pending = read()
    const pruned = prune(pending, Date.now())
    const entry = pending[gameId]
    if (entry) {
      release(gameId, entry)
      delete pending[gameId]
    }
    if (entry || pruned) write(pending)
  }

  return { note, begin, flush }
}

/**
 * Les jeux lisent useAmbianceMode (le compte, sinon l'appareil), que
 * AmbianceAttribute reporte sur <html>. Le réglage de l'appareil s'y ajoute :
 * au moindre doute, rien n'est compté.
 */
function isSoftAmbiance(): boolean {
  if (document.documentElement.getAttribute('data-ambiance') === 'soft') return true
  return readLocalAmbianceMode() === 'soft'
}

let pageTally: DrinkTally | null = null

function getPageTally(): DrinkTally {
  if (pageTally) return pageTally
  const tally = createDrinkTally({ send: sendLocalGameBeacon, isSoft: isSoftAmbiance, storage: getSafeStorage })
  // Téléphone verrouillé ou appli changée : souvent la dernière occasion
  // avant que le système ne tue l'onglet.
  window.addEventListener('pagehide', () => tally.flush())
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') tally.flush()
  })
  pageTally = tally
  return tally
}

const inPage = () => typeof window !== 'undefined' && typeof document !== 'undefined'

/**
 * Branché sur updatePlayerStats : la statistique d'un joueur entre dans le
 * cumul anonyme de son jeu, selon `options` (voir l'en-tête du module).
 * Silencieux en toutes circonstances (rendu serveur, jeu en ligne, « Sans
 * alcool », stockage, réseau).
 */
export function noteLocalGameDrinks(gameId: string, stats: LocalStatsDelta, options?: LocalTallyOptions): void {
  if (!inPage()) return
  try {
    getPageTally().note(gameId, stats, options)
  } catch {
    // Fire-and-forget.
  }
}

/**
 * À appeler quand une partie NEUVE d'un jeu qui note ses gorgées avant sa
 * participation démarre (Petit Buveur), jamais à la reprise d'une
 * sauvegarde : les gorgées sans participation laissées par une partie
 * abandonnée ne doivent pas gonfler la suivante.
 */
export function beginLocalGameDrinks(gameId: string): void {
  if (!inPage()) return
  try {
    getPageTally().begin(gameId)
  } catch {
    // Fire-and-forget.
  }
}
