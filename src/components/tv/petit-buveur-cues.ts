import { outcomeSignature, type EngineView } from '@/components/online/petit-buveur/view-helpers'
import type { PetitBuveurCastState } from '@/lib/cast-types'

/**
 * Chronologie de l'écran TV du Petit Buveur : quand montrer le dé, quand
 * laisser marcher les pions, quand dévoiler la fin. La TV ne doit jamais
 * montrer un résultat avant le téléphone le plus lent (celui qui lance).
 */

/**
 * Dé qui roule puis résultat lu : le téléphone qui lance fait rouler au moins
 * 700 ms puis tient le résultat 750 ms (PetitBuveurOnline, runDiceAction).
 * Partis à la réception de l'état, ces délais gardent la TV derrière le
 * téléphone. Le jeu local, lui, pousse le moment où sa valeur s'affiche
 * (LOCAL_DICE_ROLL_MS / LOCAL_DICE_RESULT_MS de board-display).
 */
export const TV_DICE_ROLL_MS = 700
export const TV_DICE_RESULT_MS = 750

/** Dé local resté « en train de rouler » (téléphone fermé en plein lancer) : la TV lâche l'overlay. */
export const TV_CAST_ROLLING_MAX_MS = 4_000

/** Pion arrivé sur la case 30 avant l'écran de fin (END_REVEAL_DELAY_MS du téléphone). */
export const TV_END_REVEAL_MS = 500

function isDieValue(value: unknown): value is number {
  return typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= 6
}

function isSeq(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

export type TvRollCue = {
  /** Identité du lancer : change à chaque nouveau lancer, jamais à une autre écriture. */
  key: string
  value: number
  actorId: string
}

/**
 * Lancer appliqué par la DERNIÈRE action du moteur, ou null. `version` change
 * aussi pour un choix de cible, un départ, un retour… : seul le journal dit si
 * l'action était un lancer (`case:…`, ou `win` sans effet de case : dé
 * gagnant). La relance de la case Chance (`resolved:chance`, ou `win` si elle
 * gagne) porte `diceLanding` ; le moteur garde ce dernier effet tant qu'une
 * action n'en enregistre pas d'autre (choix de cible d'une case tombée par la
 * relance) : sans le journal, la TV rejouerait le dé.
 */
export function onlineRollCue(
  view: Pick<EngineView, 'log' | 'lastDice' | 'lastOutcome' | 'outcomeHistory'>
): TvRollCue | null {
  if (!isDieValue(view.lastDice)) return null
  const last = view.log?.[view.log.length - 1]
  if (!last || typeof last.message !== 'string') return null
  const outcome = view.lastOutcome ?? null
  const relaunched =
    (last.message === 'resolved:chance' || last.message === 'win') && typeof outcome?.diceLanding === 'number'
  const rolled = last.message.startsWith('case:') || (last.message === 'win' && !outcome) || relaunched
  if (!rolled) return null
  return {
    key: `${last.turn}|${last.playerId}|${last.message}|${outcomeSignature(view)}`,
    value: view.lastDice,
    actorId: relaunched && outcome ? outcome.actorId : last.playerId,
  }
}

/** Tirage interactif (roue, pièce, dé de la honte) à mettre en scène, ou null. */
export function onlineInteractionKey(view: Pick<EngineView, 'lastInteraction' | 'lastOutcome' | 'outcomeHistory'>): string | null {
  if (!view.lastInteraction) return null
  return `${JSON.stringify(view.lastInteraction)}|${outcomeSignature(view)}`
}

export type TvCastCues = {
  /** Change à chaque lancer poussé ; null = rien à montrer. */
  diceKey: string | null
  /** Valeur lue (1..6) ; null tant que le dé roule sur le téléphone. */
  dice: number | null
  diceSeq: number | null
  /** 'rolling' / 'result' : ce que montre le téléphone ; null : ancien téléphone (dé poussé au début, valeur comprise). */
  dicePhase: 'rolling' | 'result' | null
  /** Change à chaque case poussée ; null = aucune case. */
  revealKey: string | null
  caseType: string | null
  revealSeq: number | null
}

/** Partie LOCALE diffusée : dé et case ont chacun leur `seq` (voir PetitBuveurCastState). */
export function castCues(state: Pick<PetitBuveurCastState, 'dice' | 'reveal'>): TvCastCues {
  const raw = state.dice && isSeq(state.dice.seq) ? state.dice : null
  const phase = raw?.phase === 'rolling' || raw?.phase === 'result' ? raw.phase : null
  const dice = raw && (phase === 'rolling' || isDieValue(raw.value)) ? raw : null
  const reveal =
    state.reveal && typeof state.reveal.caseType === 'string' && state.reveal.caseType && isSeq(state.reveal.seq)
      ? state.reveal
      : null
  return {
    diceKey: dice ? `cast:${dice.seq}` : null,
    dice: dice && phase !== 'rolling' ? dice.value : null,
    diceSeq: dice ? dice.seq : null,
    dicePhase: dice ? phase : null,
    revealKey: reveal ? `cast:${reveal.seq}` : null,
    caseType: reveal ? reveal.caseType : null,
    revealSeq: reveal ? reveal.seq : null,
  }
}

/** La case poussée appartient au lancer en cours (et non au tour précédent). */
export function castRevealIsCurrent(cues: Pick<TvCastCues, 'diceSeq' | 'revealSeq'>): boolean {
  if (cues.revealSeq === null) return false
  return cues.diceSeq === null || cues.revealSeq > cues.diceSeq
}
