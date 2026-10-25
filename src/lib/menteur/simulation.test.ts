import { beforeAll, describe, expect, it, vi } from 'vitest'
import {
  BOT_PERSONAS,
  DEFAULT_BOT_TRAITS,
  botTraitsFor,
  personaForBotName,
  pickBotPersonas,
  type BotTrait,
} from '@/lib/online/bot-personas'
import { createRng, rngFromState, type RngState } from '@/lib/petit-buveur/rng'
import {
  countMatches,
  createMenteurState,
  isLegalRaise,
  menteurBotSeatId,
  menteurHumanSeated,
  menteurTotalDice,
  toMenteurClientView,
  toMenteurSpectatorView,
  MENTEUR_REVEAL_MIN_MS,
  MENTEUR_SPEECH_CAP,
  type MenteurBid,
  type MenteurClientView,
  type MenteurRules,
  type MenteurSpeech,
  type MenteurState,
} from './engine'
import { applyMenteurBotAction, applyMenteurRoomAction, type MenteurRoomActionInput } from './server-adapter'
import { menteurBotTickDelayMs } from './bot-tick'
import { menteurRevealReactions } from './reveal-reactions'
import {
  menteurBotDecide,
  menteurCountMine,
  menteurDrankFrom,
  menteurFaceOdds,
  menteurReader,
  menteurStyle,
  type MenteurBotDecision,
} from './bot-brain'

/**
 * MESURE du cerveau des bots : parties complètes jouées par le vrai moteur
 * (applyMenteurRoomAction pour les humains scriptés, applyMenteurBotAction
 * pour les bots), sur une horloge virtuelle — le délai de menteurBotTickDelayMs
 * pour un bot, 4 s pour une décision humaine — et un hasard seedé
 * (`menteur-<config>-<graine>`) : chaque partie se rejoue à l'identique.
 *
 * Les bornes sont les cibles validées par le propriétaire le 14/10/2026, pas
 * les mesures ; elles ne valent que pour ces politiques scriptées. Hors
 * bornes, on règle d'abord MENTEUR_READ_CREDIT, puis les seuils de
 * menteurStyle — jamais la règle.
 */

const T0 = 1_000_000
/** Une décision humaine scriptée prend 4 s : le plancher de lecture passe. */
const HUMAN_THINK_MS = MENTEUR_REVEAL_MIN_MS
/** Plafond de coups d'une partie : au-delà, elle ne finirait pas. */
const STEP_CAP = 4_000

type Policy = 'bot' | 'lecteur' | 'nonLecteur' | 'bluffeur' | 'tells' | 'tellsPrudentes'
type Seat = { id: string; name: string; policy: Policy }
/** Le tell joint à l'enchère en cours, tel que la bulle l'a montré à la table. */
type Tell = 'sure' | 'unsure' | null

/** L'honnête-lecteur crédite les enchères des autres comme un prudent. */
const PRUDENT_READ = menteurStyle({ ...DEFAULT_BOT_TRAITS, trait: 'prudent' }).read
const HUMAN_CALL = 0.45
const HUMAN_OPEN = 0.7
/**
 * Le lecteur de tells prend les bots au mot : une enchère dite « sûre », il
 * ne la défie plus qu'en dernier recours ; une « pas sûre », il la défie dès
 * qu'elle tient mal. L'habitué (`tellsPrudentes`) a compris que seules les
 * prudentes disent vrai à coup sûr : il n'écoute qu'elles, le pire cas du
 * garde-fou de +7 points.
 */
const TELL_CALL: Record<'sure' | 'unsure', number> = { sure: 0.2, unsure: 0.7 }

/**
 * Relances d'un humain : sur chaque face, la plus petite quantité légale et
 * jusqu'à 2 au-dessus — bascule à moitié prix vers les 1 comprise, que les
 * bots, eux, ne considèrent pas (menteurRaiseOptions).
 */
function humanRaises(view: MenteurClientView): { qty: number; face: number }[] {
  const bid = view.currentBid
  if (!bid) return []
  const total = view.players.reduce((sum, p) => sum + p.diceCount, 0)
  const out: { qty: number; face: number }[] = []
  for (let face = 1; face <= 6; face += 1) {
    const min = view.palifico
      ? bid.qty + 1
      : bid.face === 1
        ? face === 1 ? bid.qty + 1 : bid.qty * 2 + 1
        : face === 1 ? Math.ceil(bid.qty / 2) : face > bid.face ? bid.qty : bid.qty + 1
    for (let qty = min; qty <= min + 2; qty += 1) {
      if (isLegalRaise(bid, qty, face, total, view.palifico)) out.push({ qty, face })
    }
  }
  return out
}

/**
 * Humain honnête : binomiale exacte (menteurOdds, via menteurReader), avec
 * le crédit d'un prudent (`read`) ou sans aucun (le joueur occasionnel).
 * Ouvre sur sa meilleure face, à la plus haute quantité qui tient à 70 % ;
 * crie « Menteur ! » sous 45 %, prend sinon la relance la plus sûre.
 */
function honestMove(view: MenteurClientView, id: string, read: number, tell: Tell = null): MenteurRoomActionInput {
  const reader = menteurReader(view, id, read)
  const total = view.players.reduce((sum, p) => sum + p.diceCount, 0)
  const bid = view.currentBid
  if (!bid) {
    const faces = view.palifico ? [1, 2, 3, 4, 5, 6] : [2, 3, 4, 5, 6]
    const face = faces.reduce((b, f) => (reader.own(f) > reader.own(b) ? f : b))
    let qty = 1
    while (qty < total && reader.odds(qty + 1, face) >= HUMAN_OPEN) qty += 1
    return { type: 'bid', qty, face }
  }
  if (reader.odds(bid.qty, bid.face) < (tell ? TELL_CALL[tell] : HUMAN_CALL)) return { type: 'dudo' }
  const safest = humanRaises(view)
    .map((o) => ({ ...o, p: reader.odds(o.qty, o.face) }))
    .sort((x, y) => y.p - x.p || x.qty - y.qty || x.face - y.face)[0]
  return safest ? { type: 'bid', qty: safest.qty, face: safest.face } : { type: 'dudo' }
}

/**
 * Bluffeur naïf (celui du prototype) : ouvre sur une face au hasard à
 * l'espérance publique + 1, relance à +1 sur la face en cours, et ne crie
 * qu'à 1,5 dé au-dessus de son espérance.
 */
function bluffMove(view: MenteurClientView, id: string, rand: () => number): MenteurRoomActionInput {
  const dice = view.players.find((p) => p.id === id)?.dice ?? []
  const total = view.players.reduce((sum, p) => sum + p.diceCount, 0)
  const face = 2 + Math.min(4, Math.floor(rand() * 5))
  const bid = view.currentBid
  if (!bid) return { type: 'bid', qty: Math.max(1, Math.min(total, Math.round(total / 3) + 1)), face }
  const expected =
    menteurCountMine(dice, bid.face, view.palifico) + (total - dice.length) * menteurFaceOdds(bid.face, view.palifico)
  if (bid.qty > expected + 1.5) return { type: 'dudo' }
  for (const c of [{ qty: bid.qty + 1, face: bid.face }, { qty: bid.qty + 1, face }]) {
    if (isLegalRaise(bid, c.qty, c.face, total, view.palifico)) return { type: 'bid', ...c }
  }
  return { type: 'dudo' }
}

function humanMove(s: MenteurState, seat: Seat, rand: () => number, tell: Tell): MenteurRoomActionInput {
  if (s.phase === 'reveal') return { type: 'continue' }
  const view = toMenteurClientView(s, seat.id)
  if (seat.policy === 'bluffeur') return bluffMove(view, seat.id, rand)
  if (seat.policy === 'tells' || seat.policy === 'tellsPrudentes') return honestMove(view, seat.id, PRUDENT_READ, tell)
  return honestMove(view, seat.id, seat.policy === 'lecteur' ? PRUDENT_READ : 0)
}

// ─── Comptes ─────────────────────────────────────────────────────────────────

const TRAITS: BotTrait[] = ['prudent', 'farceur', 'suiveur', 'agressif']

type TraitTally = {
  bids: number
  bluffs: number
  /** Relances hors bluff voulu, et parmi elles celles que le bot défierait lui-même. */
  raises: number
  selfCallable: number
  responses: number
  dudos: number
  dudoRight: number
}

type Tally = {
  games: number
  heroWins: number
  rounds: number
  /** Enchères de la manche au moment du défi, toutes manches confondues. */
  bids: number
  /** Manches tranchées dès la 1re réponse (l'ouverture aussitôt défiée). */
  firstCall: number
  calzas: number
  calzaRight: number
  byTrait: Record<BotTrait, TraitTally>
  /** Défis d'un bot de rancune ≥ 0,6, sans puis avec un dé perdu contre l'enchérisseur. */
  grudge: { pairs: number; plain: number; spited: number }
  /** Bulles de la manche, comptées à la révélation, réaction comprise ; kinds écrits dans le fil. */
  bubbles: number
  kinds: Record<string, number>
  /** Réactions de la révélation (dérivées, jamais écrites), leurs kinds, et celles qui visent le héros. */
  reactions: number
  reactionKinds: Record<string, number>
  reactionsAtHero: number
  /** Enchères dites « sûres » par une prudente, et celles que les gobelets levés ont confirmées. */
  prudentSure: { said: number; held: number }
}

function newTally(): Tally {
  const byTrait = {} as Record<BotTrait, TraitTally>
  for (const t of TRAITS) {
    byTrait[t] = { bids: 0, bluffs: 0, raises: 0, selfCallable: 0, responses: 0, dudos: 0, dudoRight: 0 }
  }
  return {
    games: 0,
    heroWins: 0,
    rounds: 0,
    bids: 0,
    firstCall: 0,
    calzas: 0,
    calzaRight: 0,
    byTrait,
    grudge: { pairs: 0, plain: 0, spited: 0 },
    bubbles: 0,
    kinds: {},
    reactions: 0,
    reactionKinds: {},
    reactionsAtHero: 0,
    prudentSure: { said: 0, held: 0 },
  }
}

/** Le bot vient de perdre un dé contre `by` : une rancune, sans toucher à la réputation de `by`. */
function withGrudge(view: MenteurClientView, botId: string, by: string): MenteurClientView {
  return {
    ...view,
    duels: [
      ...(view.duels ?? []),
      {
        round: 0,
        bidderId: botId,
        challengerId: by,
        mode: 'dudo',
        held: false,
        loserId: botId,
        bids: [{ by: botId, qty: 1, face: 2, bluff: true }],
      },
    ],
  }
}

function recordBot(
  t: Tally,
  s: MenteurState,
  botId: string,
  name: string,
  d: MenteurBotDecision,
  after: MenteurState,
  rngState: RngState
) {
  const traits = botTraitsFor(name)
  const tt = t.byTrait[traits.trait]
  if (d.action.type === 'BID') {
    tt.bids += 1
    if (d.why.bluffing) tt.bluffs += 1
    if (s.currentBid && !d.why.bluffing) {
      tt.raises += 1
      if ((d.why.pOwn ?? 0) < menteurStyle(traits).callAt) tt.selfCallable += 1
    }
  }
  const current = s.currentBid
  if (!current) return
  tt.responses += 1
  if (d.action.type === 'DUDO') {
    tt.dudos += 1
    if (!after.lastReveal!.bidHeld) tt.dudoRight += 1
  }
  if (d.action.type === 'CALZA') {
    t.calzas += 1
    if (after.lastReveal!.loserId === null) t.calzaRight += 1
  }
  // Rancune, en contrefactuel apparié : même vue, même tirage, avec ou sans
  // un dé perdu contre l'enchérisseur.
  const view = toMenteurClientView(s, botId)
  if (traits.rancune >= 0.6 && !menteurDrankFrom(view.duels ?? [], botId).has(current.by)) {
    const plain = menteurBotDecide(view, botId, traits, rngFromState(rngState).next)
    const spited = menteurBotDecide(withGrudge(view, botId, current.by), botId, traits, rngFromState(rngState).next)
    t.grudge.pairs += 1
    if (plain.action.type === 'DUDO') t.grudge.plain += 1
    if (spited.action.type === 'DUDO') t.grudge.spited += 1
  }
}

/** Une réaction tenue : jamais après un Calza, d'un bot à persona, sous son plafond de la manche. */
function reactionHolds(s: MenteurState, r: MenteurSpeech): boolean {
  if (s.lastReveal?.mode === 'calza') return false
  const author = s.players.find((p) => p.id === r.playerId)
  if (!author?.isBot || !personaForBotName(author.name)) return false
  const mine = (s.speech ?? []).filter((sp) => sp.playerId === r.playerId && sp.round === s.round).length
  return mine < Math.min(MENTEUR_SPEECH_CAP, botTraitsFor(author.name).bavardage)
}

/** La parole qu'un coup vient d'ajouter au fil, ou null. */
function spokenBy(before: MenteurState, after: MenteurState): MenteurSpeech | null {
  const speech = after.speech ?? []
  return speech.length > (before.speech ?? []).length ? speech[speech.length - 1] : null
}

/**
 * Joue une partie complète. Seul refus admis : NOT_BOT_TURN, jamais provoqué
 * ici (chaque acteur joue à son tour) ; tout autre refus est une erreur du
 * cerveau ou du moteur et fait échouer la mesure.
 */
function playGame(
  seats: Seat[],
  key: string,
  rules: MenteurRules = {},
  tally?: Tally
): { final: MenteurState; trace: string[] } {
  let s = createMenteurState(
    seats.map((x) => ({ id: x.id, name: x.name, isBot: x.policy === 'bot' })),
    `des-${key}`,
    rules
  )
  const rng = createRng(`menteur-${key}`)
  // Les paroles tirent sur un flux à part : elles ne déplacent aucun tirage du
  // jeu, la partie est la même qu'avec des bots muets.
  const sayRng = createRng(`menteur-say-${key}`)
  const seatOf = new Map(seats.map((x) => [x.id, x]))
  const trace: string[] = []
  let now = T0
  /** Le tell de l'enchère en cours, tel que la bulle l'a montré. */
  let tell: { bid: MenteurBid; kind: 'sure' | 'unsure'; prudent: boolean } | null = null
  /** Enchères « sûres » des prudentes dans la manche, jugées à la révélation. */
  let prudentSures: MenteurBid[] = []
  for (let steps = 0; s.phase !== 'finished'; steps += 1) {
    if (steps > STEP_CAP) throw new Error(`partie sans fin : ${key}`)
    const actorId = menteurBotSeatId(s)!
    const actor = s.players.find((p) => p.id === actorId)!
    let next: MenteurState
    if (actor.isBot) {
      const delay = menteurBotTickDelayMs(
        { phase: s.phase, actorIsBot: true, actorName: actor.name, humanSeated: menteurHumanSeated(s.players) },
        rng.next
      )
      now += delay ?? 0
      // Le pourquoi du coup ne sort pas de l'adaptateur : on le relit sur une
      // copie du tirage, que le coup réellement joué doit confirmer.
      const before = rng.getState()
      const decision =
        s.phase === 'bidding'
          ? menteurBotDecide(toMenteurClientView(s, actorId), actorId, botTraitsFor(actor.name), rngFromState(before).next)
          : null
      const r = applyMenteurBotAction(s, rng.next, now, sayRng.next)
      if (!r.ok) throw new Error(`refus inattendu : ${r.error} (${key})`)
      next = r.state
      const said = spokenBy(s, next)
      if (said) {
        const mine = (next.speech ?? []).filter((sp) => sp.playerId === actorId && sp.round === next.round)
        expect(mine.length, `plafond de ${actor.name} (${key})`).toBeLessThanOrEqual(
          Math.min(MENTEUR_SPEECH_CAP, botTraitsFor(actor.name).bavardage)
        )
      }
      if (next.phase === 'bidding' && next.currentBid !== s.currentBid) {
        const kind = said?.kind === 'sure' || said?.kind === 'unsure' ? said.kind : null
        tell = kind ? { bid: next.currentBid!, kind, prudent: botTraitsFor(actor.name).trait === 'prudent' } : null
        if (kind === 'sure' && botTraitsFor(actor.name).trait === 'prudent') prudentSures.push(next.currentBid!)
      }
      if (decision?.action.type === 'BID') {
        expect(next.currentBid).toMatchObject({ qty: decision.action.qty, face: decision.action.face })
      } else if (decision) {
        // Les comptes de justesse lisent la décision relue : un défi joué
        // autrement (DUDO ↔ CALZA) fausserait la mesure sans bruit.
        expect(next.lastReveal).toMatchObject({ challengerId: actorId, mode: decision.action.type === 'DUDO' ? 'dudo' : 'calza' })
      }
      if (decision && tally) recordBot(tally, s, actorId, actor.name, decision, next, before)
    } else {
      now += HUMAN_THINK_MS
      // L'habitué sait qui dit vrai : il n'écoute que les prudentes.
      const heard = tell && (seatOf.get(actorId)!.policy !== 'tellsPrudentes' || tell.prudent) ? tell : null
      const shown = heard && s.currentBid === heard.bid ? heard.kind : null
      const r = applyMenteurRoomAction(s, actorId, humanMove(s, seatOf.get(actorId)!, rng.next, shown), now)
      if (!r.ok) throw new Error(`refus inattendu : ${r.error} (${key})`)
      next = r.state
      if (next.phase === 'bidding' && next.currentBid !== s.currentBid) tell = null
    }
    if (s.phase === 'bidding' && next.phase === 'reveal') {
      // La réaction de la révélation, telle que la TV la dérive. Vérifiée sans
      // expect à chaque manche, et la vue d'un joueur comparée hors mesure
      // seulement : la simulation doit rester sous 10 s.
      const reactions = menteurRevealReactions(toMenteurSpectatorView(next))
      if (reactions.length > 1 || (reactions[0] && !reactionHolds(next, reactions[0]))) {
        throw new Error(`réaction hors règle : ${JSON.stringify(reactions)} (${key})`)
      }
      if (!tally) expect(menteurRevealReactions(toMenteurClientView(next, next.players[0].id)), key).toEqual(reactions)
      if (tally) {
        const chain = (next.bids ?? []).length
        tally.rounds += 1
        tally.bids += chain
        if (chain === 1) tally.firstCall += 1
        const bubbles = (next.speech ?? []).filter((sp) => sp.round === next.round)
        tally.bubbles += bubbles.length + reactions.length
        for (const sp of bubbles) tally.kinds[sp.kind] = (tally.kinds[sp.kind] ?? 0) + 1
        tally.reactions += reactions.length
        for (const r of reactions) {
          tally.reactionKinds[r.kind] = (tally.reactionKinds[r.kind] ?? 0) + 1
          if (r.targetId === 'h') tally.reactionsAtHero += 1
        }
        const dice = next.lastReveal!.allDice.map(({ playerId, dice: d }) => ({ ...s.players.find((p) => p.id === playerId)!, dice: d }))
        for (const b of prudentSures) {
          tally.prudentSure.said += 1
          if (countMatches(dice, b.face, s.palifico) >= b.qty) tally.prudentSure.held += 1
        }
      }
      prudentSures = []
      tell = null
    }
    trace.push(
      `${now}:${next.version}:${JSON.stringify(next.lastReveal?.bid ?? next.currentBid)}:${JSON.stringify(spokenBy(s, next))}`
    )
    s = next
  }
  if (tally) {
    tally.games += 1
    if (s.winnerId === 'h') tally.heroWins += 1
  }
  return { final: s, trace }
}

// ─── Tables ──────────────────────────────────────────────────────────────────

const HERO = (policy: Policy): Seat => ({ id: 'h', name: 'Léa', policy })
const botSeats = (names: string[]): Seat[] => names.map((name, i) => ({ id: `bot-${i + 1}`, name, policy: 'bot' }))
/** Personas tirés par graine (jamais Math.random) : les traits se mêlent. */
const mixedBots = (count: number, key: string) =>
  botSeats(pickBotPersonas(count, createRng(`table-${key}`).next).map((p) => p.name))

/**
 * Exécute `fn` sous espion : ni Math.random ni Date.now ne doivent servir.
 * Synchrone, pour que seul notre code tourne pendant l'espionnage (le
 * lanceur de tests, lui, lit l'horloge entre deux tests).
 */
function withoutAmbientChance<T>(fn: () => T): T {
  const random = vi.spyOn(Math, 'random')
  const clock = vi.spyOn(Date, 'now')
  try {
    const out = fn()
    expect(random).not.toHaveBeenCalled()
    expect(clock).not.toHaveBeenCalled()
    return out
  } finally {
    random.mockRestore()
    clock.mockRestore()
  }
}

function run(config: string, games: number, seatsOf: (seed: number) => Seat[], rules: MenteurRules = {}): Tally {
  return withoutAmbientChance(() => {
    const tally = newTally()
    for (let seed = 0; seed < games; seed += 1) playGame(seatsOf(seed), `${config}-${seed}`, rules, tally)
    return tally
  })
}

const rate = (n: number, d: number) => (d === 0 ? 0 : n / d)
const total = (t: Tally, k: keyof TraitTally) => TRAITS.reduce((acc, tr) => acc + t.byTrait[tr][k], 0)
const traitRate = (t: Tally, trait: BotTrait, n: keyof TraitTally, d: keyof TraitTally) =>
  rate(t.byTrait[trait][n], t.byTrait[trait][d])

describe('simulation du Menteur', () => {
  describe('la garde (aucun appel à Math.random ni à Date.now, espionnés)', () => {
    it('C5 : 2 à 6 bots × 40 graines, avec et sans Palifico + Calza : toutes les parties finissent, sans refus', () => {
      withoutAmbientChance(() => {
        for (let count = 2; count <= 6; count += 1) {
          for (let seed = 0; seed < 40; seed += 1) {
            const key = `c5-${count}-${seed}`
            const { final } = playGame(mixedBots(count, key), key, seed % 2 ? { palifico: true, calza: true } : {})
            expect(final.phase).toBe('finished')
            expect(final.winnerId).not.toBeNull()
            expect(menteurTotalDice(final)).toBeGreaterThan(0)
          }
        }
      })
    }, 60_000)

    it('même graine ⇒ même partie, même fil de paroles', () => {
      const seats = [HERO('lecteur'), ...mixedBots(3, 'replay')]
      const [a, b] = withoutAmbientChance(() => [
        playGame(seats, 'replay', { palifico: true, calza: true }),
        playGame(seats, 'replay', { palifico: true, calza: true }),
      ])
      // La trace porte chaque parole jointe à son coup : le fil entier est comparé.
      expect(b.trace).toEqual(a.trace)
      expect(a.trace.filter((line) => !line.endsWith(':null')).length).toBeGreaterThan(5)
      expect(JSON.stringify(b.final)).toBe(JSON.stringify(a.final))
    })
  })

  /**
   * Mesures du 14/10/2026 sur ces graines, en regard des cibles :
   *   C1 duel : honnête-lecteur 41,3 % ; 2,85 enchères par manche, 26,4 %
   *     de manches tranchées à la 1re réponse ;
   *   C2 1 + 3 : honnête-lecteur 26,3 %, non-lecteur 11,0 %, bluffeur naïf
   *     11,3 % ; 4,05 enchères par manche, 10,1 % à la 1re réponse ;
   *   « Menteur ! » des bots justes à 51 à 64 % selon la table, relances
   *   auto-défiables 3,5 à 8,4 %, Calza réussis 39,8 % (C4) ; rancune
   *   +6,6 à +8,3 points de défi (C2, C3).
   * Sur 3 000 parties, le non-lecteur gagne 11,2 %, le bluffeur 9,7 %, et
   * les « Menteur ! » des bots sont justes à 51,5 % en C4 : ce sont les trois
   * bornes les plus serrées. Avec les seuils et le crédit (0,3) du plan, ces
   * « Menteur ! » n'étaient justes qu'à 36 % au duel et 39 % en C4, et le
   * bluffeur naïf ne gagnait que 5,9 % (réglages : bot-brain.ts).
   * Paroles (15/10/2026), sur un flux de hasard à part — les chiffres
   * ci-dessus n'ont pas bougé d'une décimale : 1,53 à 1,60 bulle par manche
   * en C2 (0,84 au duel, 1,41 en C4), avant les réactions de la révélation ;
   * « sûres » des prudentes justes à 92 à 96 % ; le lecteur de tells gagne
   * 25,7 % (0,6 point de moins que l'honnête-lecteur, bruit compris), 28,3 %
   * (+2,0 points) s'il n'écoute que les prudentes.
   * Réactions de la révélation (15/10/2026), dérivées sans tirer sur aucun
   * flux de la partie : 0,66 à 0,69 par révélation en C2, soit 2,21 à 2,28
   * bulles par manche réactions comprises ; 0,48 au duel (1,32 bulle), 0,50
   * en C4 (1,90), où un Calza n'en a jamais ; 0,76 entre 4 bots (3,07).
   */
  describe('les cibles de la mesure', () => {
    let C1: Tally
    let C2: { lecteur: Tally; nonLecteur: Tally; bluffeur: Tally; tells: Tally; tellsPrudentes: Tally }
    let C3: Tally
    let C4: Tally
    beforeAll(() => {
      C1 = run('c1', 300, (seed) => [HERO('lecteur'), ...botSeats([BOT_PERSONAS[seed % BOT_PERSONAS.length].name])])
      C2 = {
        lecteur: run('c2-lecteur', 300, (seed) => [HERO('lecteur'), ...mixedBots(3, `c2-${seed}`)]),
        nonLecteur: run('c2-non-lecteur', 300, (seed) => [HERO('nonLecteur'), ...mixedBots(3, `c2-${seed}`)]),
        bluffeur: run('c2-bluffeur', 300, (seed) => [HERO('bluffeur'), ...mixedBots(3, `c2-${seed}`)]),
        tells: run('c2-tells', 300, (seed) => [HERO('tells'), ...mixedBots(3, `c2-${seed}`)]),
        tellsPrudentes: run('c2-tells', 300, (seed) => [HERO('tellsPrudentes'), ...mixedBots(3, `c2-${seed}`)]),
      }
      C3 = run('c3', 300, (seed) => mixedBots(4, `c3-${seed}`))
      C4 = run('c4', 200, (seed) => [HERO('lecteur'), ...mixedBots(3, `c4-${seed}`)], { palifico: true, calza: true })
      // Environ 3 s seul ; la suite complète, en parallèle, peut le tripler.
    }, 60_000)
    const tables = (): Record<string, Tally> => ({
      C1,
      'C2 lecteur': C2.lecteur,
      'C2 non-lecteur': C2.nonLecteur,
      'C2 bluffeur': C2.bluffeur,
      C3,
      C4,
    })
    const win = (t: Tally) => rate(t.heroWins, t.games)

    it('force : le lecteur tient sa part, le joueur occasionnel et le bluffeur naïf gardent leur chance', () => {
      expect(C1.games).toBe(300)
      expect(win(C1)).toBeGreaterThanOrEqual(0.38)
      expect(win(C1)).toBeLessThanOrEqual(0.58)
      expect(win(C2.lecteur)).toBeGreaterThanOrEqual(0.17)
      expect(win(C2.lecteur)).toBeLessThanOrEqual(0.32)
      expect(win(C2.nonLecteur)).toBeGreaterThanOrEqual(0.1)
      expect(win(C2.bluffeur)).toBeGreaterThanOrEqual(0.08)
      expect(win(C2.bluffeur)).toBeLessThanOrEqual(0.16)
    })

    it('tension : des manches qui durent, rarement tranchées dès la première réponse', () => {
      expect(rate(C1.bids, C1.rounds)).toBeGreaterThanOrEqual(2.6)
      expect(rate(C1.firstCall, C1.rounds)).toBeLessThanOrEqual(0.3)
      expect(rate(C2.lecteur.bids, C2.lecteur.rounds)).toBeGreaterThanOrEqual(3.5)
      expect(rate(C2.lecteur.firstCall, C2.lecteur.rounds)).toBeLessThanOrEqual(0.16)
    })

    it('caractère : le farceur bluffe 3 fois plus que le prudent, l’agressif défie plus que lui', () => {
      for (const [name, t] of Object.entries(tables())) {
        const farceur = traitRate(t, 'farceur', 'bluffs', 'bids')
        expect(farceur, name).toBeGreaterThan(0)
        expect(farceur, name).toBeGreaterThanOrEqual(3 * traitRate(t, 'prudent', 'bluffs', 'bids'))
        expect(traitRate(t, 'agressif', 'dudos', 'responses'), name).toBeGreaterThan(
          traitRate(t, 'prudent', 'dudos', 'responses')
        )
      }
    })

    it('caractère : un rancunier (≥ 0,6) défie au moins 5 points plus souvent qui l’a fait boire', () => {
      // Pas au duel : il n'y a qu'un adversaire, la rancune s'installe dès le
      // premier dé perdu, et les paires sans rancune y sont trop rares.
      for (const [name, t] of Object.entries({ ...C2, C3 })) {
        expect(t.grudge.pairs, name).toBeGreaterThan(500)
        expect(rate(t.grudge.spited - t.grudge.plain, t.grudge.pairs), name).toBeGreaterThanOrEqual(0.05)
      }
    })

    it('justesse : « Menteur ! » des bots justes à 50 % au moins, relances auto-défiables à 10 % au plus', () => {
      for (const [name, t] of Object.entries(tables())) {
        expect(total(t, 'dudos'), name).toBeGreaterThan(100)
        expect(rate(total(t, 'dudoRight'), total(t, 'dudos')), name).toBeGreaterThanOrEqual(0.5)
        expect(total(t, 'raises'), name).toBeGreaterThan(100)
        expect(rate(total(t, 'selfCallable'), total(t, 'raises')), name).toBeLessThanOrEqual(0.1)
      }
    })

    it('justesse : Calza réussi au moins 3 fois sur 10 (C4)', () => {
      expect(C4.calzas).toBeGreaterThan(50)
      expect(rate(C4.calzaRight, C4.calzas)).toBeGreaterThanOrEqual(0.3)
    })

    it('parole : au plus 2,5 bulles par manche à 1 + 3, réactions de la révélation comprises, et les « sûres » des prudentes justes à 85 % au moins', () => {
      for (const [name, t] of Object.entries(C2)) {
        expect(t.rounds, name).toBeGreaterThan(1000)
        expect(rate(t.bubbles, t.rounds), name).toBeLessThanOrEqual(2.5)
      }
      for (const [name, t] of Object.entries(tables())) {
        expect(t.prudentSure.said, name).toBeGreaterThan(200)
        expect(rate(t.prudentSure.held, t.prudentSure.said), name).toBeGreaterThanOrEqual(0.85)
      }
    })

    it('réactions : les 4 kinds de la révélation sortent, aucune après un Calza (garde de playGame) ; au duel, chacune vise le joueur', () => {
      const kinds = new Set<string>()
      for (const t of Object.values(tables())) for (const kind of Object.keys(t.reactionKinds)) kinds.add(kind)
      expect([...kinds].sort()).toEqual(['caught', 'gotcha', 'held', 'wrongCall'])
      // Au duel, le joueur est de chaque défi : la seule réaction possible le vise.
      expect(C1.reactions).toBeGreaterThan(500)
      expect(C1.reactionsAtHero).toBe(C1.reactions)
      // Entre bots seuls, personne ne vise le héros, absent.
      expect(C3.reactions).toBeGreaterThan(500)
      expect(C3.reactionsAtHero).toBe(0)
    })

    it('parole : le lecteur de tells ne gagne pas plus de 7 points de plus que l’honnête-lecteur (C2), même s’il n’écoute que les prudentes', () => {
      expect(C2.tells.games).toBe(300)
      expect(win(C2.tells) - win(C2.lecteur)).toBeLessThanOrEqual(0.07)
      expect(C2.tellsPrudentes.games).toBe(300)
      expect(win(C2.tellsPrudentes) - win(C2.lecteur)).toBeLessThanOrEqual(0.07)
    })

    it('parole : chaque kind porté par un coup passe dans le fil, aucune réaction de révélation n’y est écrite', () => {
      const seen = new Set<string>()
      for (const t of Object.values(tables())) for (const kind of Object.keys(t.kinds)) seen.add(kind)
      expect([...seen].sort()).toEqual(['again', 'ally', 'exact', 'grudge', 'sure', 'suspect', 'unsure'])
    })
  })
})
