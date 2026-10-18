import type { BotTraits } from '@/lib/online/bot-personas'
import { isLegalRaise, type MenteurClientView, type MenteurDuel } from './engine'

/**
 * Cerveau des bots du Menteur — PUR, aléa injecté (`rand`), rejouable par
 * graine.
 *
 * CONTRAT ANTI-TRICHE, tenu par le type : chaque fonction reçoit la vue
 * CLIENT du bot (`toMenteurClientView(state, botId)` : ses dés, le compte des
 * autres, la chaîne des enchères de la manche et les duels passés, publics
 * par construction), ses traits de persona et `rand`. Jamais l'état brut : un
 * bot sait exactement ce que sait un humain assis à sa place, et lit ce que
 * l'écran montre (l'échelle des enchères, la marque « sans un seul »).
 *
 * Il calcule la probabilité EXACTE qu'une enchère tienne (menteurOdds) et
 * joue selon son style (menteurStyle), déduit du trait et de l'audace : la
 * prudente n'annonce que ce qu'elle tient, le farceur ouvre sur une face
 * qu'il n'a pas, l'agressif saute des quantités et défie tôt, le suiveur
 * reste sur la face en cours, et le rancunier défie qui l'a fait boire.
 */

/**
 * Poids de la lecture des enchères des autres, SEUL levier de difficulté :
 * plus il monte, plus les bots devinent juste, et plus le joueur qui ne lit
 * pas l'échelle des enchères perd. Le prototype n'avait pas de c_trait : son
 * « crédit » valait 0,8 × c_trait d'ici, soit 0,32 pour un prudent, 0,28 pour
 * un suiveur, 0,16 pour un agressif et 0,12 pour un farceur, en moyenne 0,22
 * sur une table mêlée (le « vers 0,2 » du 14/10). 0,2 pris tel quel ici
 * serait encore multiplié par c_trait (poids de 0,03 à 0,08) : au duel, le
 * lecteur tombe à 34 % et 35 % des manches tombent à la 1re réponse ; les
 * « Menteur ! » des bots ne sont plus justes qu'à 42-49 % (duel, 1 + 3,
 * Calza) ; le bluffeur naïf passe à 7,1 % sur 3 000 parties. Calibré par
 * simulation.test.ts.
 */
export const MENTEUR_READ_CREDIT = 0.8

/** Calza tenté seulement si « pile la quantité » a au moins cette chance. */
export const MENTEUR_CALZA_MIN_ODDS = 0.28

/**
 * Contre qui l'a fait boire, les deux seuils de défi (callAt et le repli)
 * montent de ce poids × rancune. À 0,08, les rancuniers (≥ 0,6) ne
 * défiaient que 5,0 à 6,3 points de plus à 1 + 3 et 5,1 entre 4 bots
 * (3 000 parties), au ras de la cible de 5 : 0,1 lui laisse de la marge.
 */
export const MENTEUR_GRUDGE_CALL = 0.1

/**
 * Sans relance sûre ni bluff : « Menteur ! » sous cette probabilité, sinon la
 * relance forcée. 0,35 et non 0,5 : la binomiale sous-estime une enchère
 * honnête (on annonce ce qu'on tient). À 0,5, ces défis de repli étaient faux
 * deux fois sur trois, et les « Menteur ! » des bots passaient sous 50 % sur
 * cinq tables de mesure sur six (43 % avec Calza, 3 000 parties).
 */
export const MENTEUR_FALLBACK_CALL = 0.35

/** Une relance de bluff reste plausible pour la table. */
const BLUFF_RAISE_MIN = 0.2
/** Les relances considérées montent d'au plus 2 au-dessus de la quantité en cours. */
const RAISE_SPAN = 2
/**
 * Coût de chaque quantité de plus : parmi les relances sûres, le bot monte le
 * moins possible au lieu de sauter sur sa meilleure face, ce qui trahissait
 * sa main au joueur qui lit l'échelle et coulait celui qui ne la lit pas.
 */
const STEP_COST = 0.5

export type MenteurStyle = {
  /** « Menteur ! » quand l'enchère en cours tient avec une probabilité inférieure. */
  callAt: number
  /** Une relance n'est « sûre » qu'à partir de cette probabilité. */
  raiseMin: number
  /** Ouverture honnête : la plus haute quantité qui tient au moins à ce seuil. */
  openMin: number
  /** Chance de bluffer : ouverture sur une face faible, relance sans un seul dé. */
  bluff: number
  /** Chance de sauter d'une quantité au-dessus de la meilleure relance. */
  jump: number
  /** Bonus de score pour rester sur la face de l'enchère en cours. */
  follow: number
  /** Part du crédit de lecture (c_trait) accordée aux enchères des autres. */
  read: number
}

/**
 * Style de jeu, déduit du trait et de l'audace du persona — aucune table
 * parallèle par persona. Valeurs du prototype de cerveau (plan du
 * 14/10/2026), sauf callAt, abaissé de 0,05 pour chaque trait : aux valeurs
 * du prototype, les relances que le bot défierait lui-même montaient à 11 %
 * au duel et à 10,5 % avec Calza (cible ≤ 10 %), et ses « Menteur ! » n'y
 * étaient justes qu'à 50,3 et 50,4 % (3 000 parties). Le prudent et
 * l'agressif gardent leur écart. Le farceur, qui ment, croit peu les autres ;
 * la prudente les croit volontiers.
 */
export function menteurStyle(traits: BotTraits): MenteurStyle {
  const a = traits.audace
  switch (traits.trait) {
    case 'prudent':
      return { callAt: 0.23, raiseMin: 0.55, openMin: 0.92, bluff: 0.04, jump: 0, follow: 0, read: 0.4 }
    case 'farceur':
      return { callAt: 0.21, raiseMin: 0.38, openMin: 0.85, bluff: 0.45 * a, jump: 0, follow: 0, read: 0.15 }
    case 'agressif':
      return { callAt: 0.33, raiseMin: 0.42, openMin: 0.8, bluff: 0.1 + 0.15 * a, jump: 0.35 * a, follow: 0, read: 0.2 }
    case 'suiveur':
    default:
      return { callAt: 0.25, raiseMin: 0.48, openMin: 0.88, bluff: 0.08, jump: 0, follow: 0.08, read: 0.35 }
  }
}

// ─── Probabilités ────────────────────────────────────────────────────────────

/** Chance qu'un dé inconnu colle à la face : 1/3 avec le joker, 1/6 aux 1 et en Palifico. */
export function menteurFaceOdds(face: number, palifico: boolean): number {
  return palifico || face === 1 ? 1 / 6 : 1 / 3
}

/** Dés d'une main qui collent à la face (jokers 1 inclus, hors enchère aux 1 et hors Palifico). */
export function menteurCountMine(dice: readonly number[], face: number, palifico = false): number {
  let n = 0
  for (const d of dice) if (d === face || (!palifico && face !== 1 && d === 1)) n += 1
  return n
}

const pmfCache = new Map<string, readonly number[]>()

function binomialPmf(n: number, p: number): readonly number[] {
  const key = `${n}:${p}`
  const cached = pmfCache.get(key)
  if (cached) return cached
  const out: number[] = []
  let coef = 1
  for (let k = 0; k <= n; k += 1) {
    if (k > 0) coef = (coef * (n - k + 1)) / k
    out.push(coef * p ** k * (1 - p) ** (n - k))
  }
  pmfCache.set(key, out)
  return out
}

/**
 * Loi du nombre de dés INCONNUS qui collent à une face. Chaque crédit est le
 * dé d'un autre enchérisseur de la face, tenu pour sûr avec sa probabilité
 * (un Bernoulli) et donc retiré du tirage ; chacun des autres colle avec `p`.
 * Convolution exacte par programmation dynamique.
 */
export function menteurMatchDist(unknown: number, p: number, credits: readonly number[]): number[] {
  let held = [1]
  for (const w of credits.slice(0, Math.max(0, unknown))) {
    const next = new Array<number>(held.length + 1).fill(0)
    held.forEach((v, k) => {
      next[k] += v * (1 - w)
      next[k + 1] += v * w
    })
    held = next
  }
  const out = new Array<number>(Math.max(0, unknown) + 1).fill(0)
  held.forEach((pk, k) => {
    if (pk === 0) return
    binomialPmf(unknown - k, p).forEach((pb, j) => {
      out[k + j] += pk * pb
    })
  })
  return out
}

function tail(dist: readonly number[], need: number): number {
  if (need <= 0) return 1
  let sum = 0
  for (let i = need; i < dist.length; i += 1) sum += dist[i]
  return Math.min(1, sum)
}

/**
 * P(l'enchère tient) = P(mes dés + dés inconnus qui collent ≥ qty), les
 * crédits de lecture compris (menteurMatchDist).
 */
export function menteurOdds(
  mine: number,
  unknown: number,
  p: number,
  credits: readonly number[],
  qty: number
): number {
  return tail(menteurMatchDist(unknown, p, credits), qty - mine)
}

// ─── Mémoire publique de la table (dérivée de `duels`) ──────────────────────

/**
 * Indice de bluff d'un joueur : (bluffs démasqués + 1) / (enchères révélées
 * + 4). Le prior (1/4) absorbe les bluffs involontaires d'un joueur honnête,
 * qui n'a parfois aucun dé de la face qu'il suit (environ 13 % à 5 dés).
 */
export function menteurBluffIndex(duels: readonly MenteurDuel[], playerId: string): number {
  let bids = 0
  let bluffs = 0
  for (const duel of duels) {
    for (const b of duel.bids) {
      if (b.by !== playerId) continue
      bids += 1
      if (b.bluff) bluffs += 1
    }
  }
  return (bluffs + 1) / (bids + 4)
}

/** Ceux qui ont fait perdre un dé à `playerId` lors d'un défi passé. */
export function menteurDrankFrom(duels: readonly MenteurDuel[], playerId: string): Set<string> {
  const out = new Set<string>()
  for (const duel of duels) {
    if (duel.loserId !== playerId) continue
    out.add(duel.loserId === duel.challengerId ? duel.bidderId : duel.challengerId)
  }
  return out
}

/**
 * Crédit de lecture d'un enchérisseur : w = c_trait × MENTEUR_READ_CREDIT ×
 * max(0, 1 − 2 × indice de bluff). Un bluffeur démasqué ne vaut plus rien.
 */
export function menteurReadCredit(read: number, bluffIndex: number): number {
  return read * MENTEUR_READ_CREDIT * Math.max(0, 1 - 2 * bluffIndex)
}

export type MenteurReader = {
  /** Mes dés qui collent à la face. */
  own(face: number): number
  /** P(au moins `qty` dés de la face sur la table), vu de ma place. */
  odds(qty: number, face: number): number
  /** P(exactement `qty`) : le pari du Calza. */
  exact(qty: number, face: number): number
}

/**
 * Lecture de la table depuis la place de `viewerId` : ses dés, le compte des
 * autres, et un crédit (menteurReadCredit, au poids `read`) pour chaque AUTRE
 * joueur qui a enchéri sur la face pendant la manche. `read` = 0 : la
 * binomiale nue, le joueur qui ne lit pas les enchères.
 */
export function menteurReader(view: MenteurClientView, viewerId: string, read: number): MenteurReader {
  const dice = view.players.find((p) => p.id === viewerId)?.dice ?? []
  const total = view.players.reduce((sum, p) => sum + p.diceCount, 0)
  const unknown = Math.max(0, total - dice.length)
  const duels = view.duels ?? []
  const bids = view.bids ?? []
  const dists = new Map<number, number[]>()
  const distOf = (face: number): number[] => {
    const cached = dists.get(face)
    if (cached) return cached
    const credits: number[] = []
    if (read > 0) {
      const bidders = new Set(bids.filter((b) => b.face === face && b.by !== viewerId).map((b) => b.by))
      for (const by of bidders) {
        const w = menteurReadCredit(read, menteurBluffIndex(duels, by))
        if (w > 0) credits.push(w)
      }
    }
    const dist = menteurMatchDist(unknown, menteurFaceOdds(face, view.palifico), credits)
    dists.set(face, dist)
    return dist
  }
  const own = (face: number) => menteurCountMine(dice, face, view.palifico)
  return {
    own,
    odds: (qty, face) => tail(distOf(face), qty - own(face)),
    exact: (qty, face) => distOf(face)[qty - own(face)] ?? 0,
  }
}

// ─── Relances ────────────────────────────────────────────────────────────────

export type MenteurRaise = { qty: number; face: number; /** Quantités au-dessus de l'enchère en cours. */ step: number }

/**
 * Relances considérées sur l'enchère en cours : chaque face, de la quantité
 * en cours jusqu'à 2 au-dessus — et, pour sortir des 1, jusqu'au double + 2.
 * La bascule à moitié prix vers les 1 n'y est pas : cette échappée faisait des
 * bots des murs (le bluffeur naïf tombait à 3 % de victoires à 1 + 3). La
 * légalité reste jugée par le moteur (isLegalRaise garde Palifico, les 1 et
 * le nombre de dés).
 */
export function menteurRaiseOptions(view: MenteurClientView): MenteurRaise[] {
  const bid = view.currentBid
  if (!bid) return []
  const total = view.players.reduce((sum, p) => sum + p.diceCount, 0)
  const top = Math.min(total, bid.face === 1 ? bid.qty * 2 + RAISE_SPAN : bid.qty + RAISE_SPAN)
  const out: MenteurRaise[] = []
  for (let qty = bid.qty; qty <= top; qty += 1) {
    for (let face = 1; face <= 6; face += 1) {
      if (isLegalRaise(bid, qty, face, total, view.palifico)) out.push({ qty, face, step: qty - bid.qty })
    }
  }
  return out
}

// ─── Décision ────────────────────────────────────────────────────────────────

export type MenteurBotAction = { type: 'BID'; qty: number; face: number } | { type: 'DUDO' } | { type: 'CALZA' }

/**
 * Le pourquoi d'un coup — JAMAIS sérialisé : il reste dans le processus
 * serveur (les paroles du lot suivant le liront, la simulation le mesure).
 */
export type MenteurBotWhy = {
  /** P que SON enchère tienne, vue de sa place (null pour un défi). */
  pOwn: number | null
  /** P que l'enchère en cours tienne (null à l'ouverture). */
  pCur: number | null
  /** Bluff voulu : ouverture sur une face faible ou relance sans un seul dé. */
  bluffing: boolean
  /** Relance forcée : l'enchère en cours tenait trop pour crier, aucune relance n'était sûre. */
  forced: boolean
}

export type MenteurBotDecision = { action: MenteurBotAction; why: MenteurBotWhy }

type Option = MenteurRaise & { p: number; own: number; score: number }

const byScore = (x: Option, y: Option) => y.score - x.score || x.qty - y.qty || x.face - y.face

function bid(qty: number, face: number, why: Partial<MenteurBotWhy> & { pOwn: number }): MenteurBotDecision {
  return {
    action: { type: 'BID', qty, face },
    why: { pCur: null, bluffing: false, forced: false, ...why },
  }
}

/**
 * Coup du bot `botId` sur SA vue. Ouverture : sa meilleure face à la plus
 * haute quantité qui garde P ≥ openMin, ou (bluff) une face faible à
 * l'espérance publique. Réponse, dans l'ordre : « Menteur ! » si P < callAt ;
 * Calza si la règle est active et que « pile » est assez probable ; la
 * relance sûre (P ≥ raiseMin) qui monte le moins ; une relance de bluff ;
 * « Menteur ! » si P < MENTEUR_FALLBACK_CALL ; la relance forcée la plus
 * sûre. Contre qui l'a fait boire, les deux seuils de défi montent.
 */
export function menteurBotDecide(
  view: MenteurClientView,
  botId: string,
  traits: BotTraits,
  rand: () => number
): MenteurBotDecision {
  const style = menteurStyle(traits)
  const reader = menteurReader(view, botId, style.read)
  const total = view.players.reduce((sum, p) => sum + p.diceCount, 0)
  const current = view.currentBid

  if (!current) {
    const faces = view.palifico ? [1, 2, 3, 4, 5, 6] : [2, 3, 4, 5, 6]
    const counts = faces.map((f) => reader.own(f))
    // Égalité tirée au sort : la face d'ouverture ne suit pas un ordre fixe.
    const among = (target: number) => {
      const tied = faces.filter((_, i) => counts[i] === target)
      return tied[Math.min(tied.length - 1, Math.floor(rand() * tied.length))]
    }
    const bluffing = style.bluff > 0 && rand() < style.bluff
    if (bluffing) {
      // Face faible, quantité « que la table attend » : rien n'y trahit sa main.
      const face = among(Math.min(...counts))
      const qty = Math.max(1, Math.min(total, Math.round(total * menteurFaceOdds(face, view.palifico))))
      return bid(qty, face, { pOwn: reader.odds(qty, face), bluffing: true })
    }
    const face = among(Math.max(...counts))
    let qty = 1
    for (let q = 2; q <= total; q += 1) {
      if (reader.odds(q, face) < style.openMin) break
      qty = q
    }
    return bid(qty, face, { pOwn: reader.odds(qty, face) })
  }

  const pCur = reader.odds(current.qty, current.face)
  const spite = menteurDrankFrom(view.duels ?? [], botId).has(current.by) ? MENTEUR_GRUDGE_CALL * traits.rancune : 0
  const call = (): MenteurBotDecision => ({
    action: { type: 'DUDO' },
    why: { pOwn: null, pCur, bluffing: false, forced: false },
  })
  if (pCur < style.callAt + spite) return call()

  if (view.ruleCalza && reader.exact(current.qty, current.face) >= MENTEUR_CALZA_MIN_ODDS) {
    if (rand() < 0.25 + 0.4 * traits.audace) {
      return { action: { type: 'CALZA' }, why: { pOwn: null, pCur, bluffing: false, forced: false } }
    }
  }

  const options: Option[] = menteurRaiseOptions(view).map((r) => {
    const p = reader.odds(r.qty, r.face)
    const follow = r.face === current.face ? style.follow : 0
    return { ...r, p, own: reader.own(r.face), score: p - STEP_COST * r.step + follow }
  })

  const safe = options.filter((o) => o.p >= style.raiseMin).sort(byScore)
  if (safe.length > 0) {
    const best = safe[0]
    if (style.jump > 0 && rand() < style.jump) {
      // Le saut reste une enchère qu'il ne défierait pas lui-même.
      const jump = options.find((o) => o.face === best.face && o.qty === best.qty + 1 && o.p >= style.callAt)
      if (jump) return bid(jump.qty, jump.face, { pOwn: jump.p, pCur })
    }
    return bid(best.qty, best.face, { pOwn: best.p, pCur })
  }

  if (style.bluff > 0 && rand() < style.bluff) {
    const lie = options
      .filter((o) => o.own === 0 && o.p >= BLUFF_RAISE_MIN)
      .sort((x, y) => x.qty - y.qty || y.p - x.p || x.face - y.face)[0]
    if (lie) return bid(lie.qty, lie.face, { pOwn: lie.p, pCur, bluffing: true })
  }

  if (pCur < MENTEUR_FALLBACK_CALL + spite || options.length === 0) return call()
  const safest = [...options].sort((x, y) => y.p - x.p || x.qty - y.qty || x.face - y.face)[0]
  return bid(safest.qty, safest.face, { pOwn: safest.p, pCur, forced: true })
}
